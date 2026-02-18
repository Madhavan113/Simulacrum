import { EncryptedInMemoryKeyStore, createAccount } from "@simulacrum/core";

import { createApiServer } from "../server.js";
import { resetAllBackendState } from "./reset-state.js";
import {
  isExecutedDirectly,
  loadEnvFromDisk,
  logStep,
  readPrimaryCredentials,
  requestJson,
  setSigner
} from "./utils.js";

interface AccountInfo {
  accountId: string;
  privateKey: string;
}

interface LiveSmokeResult {
  operatorAccountId: string;
  bettorAccountId: string;
  marketId: string;
  betId: string;
  resolutionTx?: string;
  claimId: string;
}

async function createBettorAccount(
  network: string,
  operatorAccountId: string,
  operatorPrivateKey: string,
  operatorPrivateKeyType: "auto" | "ecdsa" | "ed25519" | "der",
  keyStoreSecret: string
): Promise<AccountInfo> {
  setSigner(operatorAccountId, operatorPrivateKey, network, operatorPrivateKeyType);

  const keyStore = new EncryptedInMemoryKeyStore(`${keyStoreSecret}-bettor`);
  const created = await createAccount(25, { keyStore });

  return {
    accountId: created.accountId,
    privateKey: created.privateKey
  };
}

export async function runLiveSmoke(): Promise<LiveSmokeResult> {
  const envPath = loadEnvFromDisk();
  const credentials = readPrimaryCredentials();

  logStep(`Loaded environment from ${envPath}`);
  resetAllBackendState();

  logStep("Creating funded bettor account on Hedera testnet");
  const bettor = await createBettorAccount(
    credentials.network,
    credentials.accountId,
    credentials.privateKey,
    credentials.privateKeyType,
    credentials.keyStoreSecret
  );

  const server = createApiServer();
  const port = await server.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    logStep("Creating market as operator");
    setSigner(
      credentials.accountId,
      credentials.privateKey,
      credentials.network,
      credentials.privateKeyType
    );

    const createdMarket = await requestJson<{ market: { id: string } }>("POST", `${baseUrl}/markets`, {
      question: "Will live smoke pass end-to-end?",
      description: "Live Hedera smoke run",
      creatorAccountId: credentials.accountId,
      escrowAccountId: credentials.accountId,
      closeTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      outcomes: ["YES", "NO"]
    }, 201);

    const marketId = createdMarket.market.id;

    logStep("Placing bet as secondary account");
    setSigner(bettor.accountId, bettor.privateKey, credentials.network, "der");

    const bet = await requestJson<{ bet: { id: string } }>("POST", `${baseUrl}/markets/${marketId}/bets`, {
      bettorAccountId: bettor.accountId,
      outcome: "YES",
      amountHbar: 2
    }, 201);

    logStep("Resolving market as operator");
    setSigner(
      credentials.accountId,
      credentials.privateKey,
      credentials.network,
      credentials.privateKeyType
    );

    const resolution = await requestJson<{ resolution: { topicTransactionId?: string } }>(
      "POST",
      `${baseUrl}/markets/${marketId}/resolve`,
      {
        resolvedOutcome: "YES",
        resolvedByAccountId: credentials.accountId,
        reason: "Live smoke pass"
      },
      200
    );

    logStep("Claiming winnings to bettor account");
    const claim = await requestJson<{ claim: { id: string } }>("POST", `${baseUrl}/markets/${marketId}/claims`, {
      accountId: bettor.accountId,
      payoutAccountId: bettor.accountId
    }, 201);

    return {
      operatorAccountId: credentials.accountId,
      bettorAccountId: bettor.accountId,
      marketId,
      betId: bet.bet.id,
      resolutionTx: resolution.resolution.topicTransactionId,
      claimId: claim.claim.id
    };
  } finally {
    await server.stop();
  }
}

if (isExecutedDirectly(import.meta.url)) {
  runLiveSmoke()
    .then((result) => {
      logStep("Live smoke completed successfully");
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error("[infra] Live smoke failed:", error);
      process.exitCode = 1;
    });
}
