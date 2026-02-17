import {
  AccountBalanceQuery,
  AccountId,
  Client,
  Hbar,
  HbarUnit,
  TransferTransaction
} from "@hashgraph/sdk";

import { getHederaClient, type HederaNetwork } from "./client.js";

const HASHSCAN_BASE_URL = "https://hashscan.io";
const DEFAULT_NETWORK: HederaNetwork = "testnet";
const TINYBARS_PER_HBAR = 100_000_000n;

export interface HbarTransfer {
  accountId: string;
  amount: number;
}

export interface TransferOperationResult {
  transactionId: string;
  transactionUrl: string;
}

export interface BalanceResult {
  accountId: string;
  hbar: number;
  tinybar: string;
}

export interface TransferOperationOptions {
  client?: Client;
}

export class HederaTransferError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "HederaTransferError";
  }
}

function resolveClient(client?: Client): Client {
  return client ?? getHederaClient();
}

function resolveNetwork(client: Client): HederaNetwork {
  const network = client.ledgerId?.toString().toLowerCase();

  if (network === "mainnet" || network === "previewnet" || network === "testnet") {
    return network;
  }

  return DEFAULT_NETWORK;
}

function buildTransactionUrl(network: HederaNetwork, transactionId: string): string {
  return `${HASHSCAN_BASE_URL}/${network}/transaction/${encodeURIComponent(transactionId)}`;
}

function asHederaTransferError(message: string, error: unknown): HederaTransferError {
  if (error instanceof HederaTransferError) {
    return error;
  }

  return new HederaTransferError(message, error);
}

function validateNonEmptyString(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new HederaTransferError(`${fieldName} must be a non-empty string.`);
  }
}

function validatePositiveNumber(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new HederaTransferError(`${fieldName} must be a positive number.`);
  }
}

function validateFiniteNumber(value: number, fieldName: string): void {
  if (!Number.isFinite(value)) {
    throw new HederaTransferError(`${fieldName} must be a finite number.`);
  }
}

function toTinybars(amount: number): bigint {
  return BigInt(Math.round(amount * Number(TINYBARS_PER_HBAR)));
}

function validateMultiTransfer(transfers: readonly HbarTransfer[]): void {
  if (transfers.length < 2) {
    throw new HederaTransferError("transfers must include at least two entries.");
  }

  let net = 0n;

  for (const transfer of transfers) {
    validateNonEmptyString(transfer.accountId, "transfer.accountId");
    validateFiniteNumber(transfer.amount, "transfer.amount");

    if (transfer.amount === 0) {
      throw new HederaTransferError("transfer.amount cannot be 0.");
    }

    net += toTinybars(transfer.amount);
  }

  if (net !== 0n) {
    throw new HederaTransferError("transfers must net to 0 HBAR.");
  }
}

export async function transferHbar(
  fromAccountId: string,
  toAccountId: string,
  amount: number,
  options: TransferOperationOptions = {}
): Promise<TransferOperationResult> {
  validateNonEmptyString(fromAccountId, "fromAccountId");
  validateNonEmptyString(toAccountId, "toAccountId");
  validatePositiveNumber(amount, "amount");

  return multiTransfer(
    [
      { accountId: fromAccountId, amount: -amount },
      { accountId: toAccountId, amount }
    ],
    options
  );
}

export async function multiTransfer(
  transfers: readonly HbarTransfer[],
  options: TransferOperationOptions = {}
): Promise<TransferOperationResult> {
  validateMultiTransfer(transfers);

  const client = resolveClient(options.client);

  try {
    let transaction = new TransferTransaction();

    for (const transfer of transfers) {
      transaction = transaction.addHbarTransfer(
        AccountId.fromString(transfer.accountId),
        Hbar.from(transfer.amount, HbarUnit.Hbar)
      );
    }

    const response = await transaction.execute(client);
    await response.getReceipt(client);

    const transactionId = response.transactionId.toString();

    return {
      transactionId,
      transactionUrl: buildTransactionUrl(resolveNetwork(client), transactionId)
    };
  } catch (error) {
    throw asHederaTransferError("Failed to execute multi-transfer.", error);
  }
}

export async function getBalance(
  accountId: string,
  options: TransferOperationOptions = {}
): Promise<BalanceResult> {
  validateNonEmptyString(accountId, "accountId");

  const client = resolveClient(options.client);

  try {
    const balance = await new AccountBalanceQuery()
      .setAccountId(AccountId.fromString(accountId))
      .execute(client);
    const tinybars = balance.hbars.toTinybars().toString();
    const hbar = Number(tinybars) / Number(TINYBARS_PER_HBAR);

    return {
      accountId,
      hbar,
      tinybar: tinybars
    };
  } catch (error) {
    throw asHederaTransferError("Failed to query account balance.", error);
  }
}
