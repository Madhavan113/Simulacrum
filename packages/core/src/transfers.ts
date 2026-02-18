import {
  AccountBalanceQuery,
  AccountId,
  Client,
  Hbar,
  HbarUnit,
  TransferTransaction
} from "@hashgraph/sdk";

import { type HederaNetwork } from "./client.js";
import {
  TINYBARS_PER_HBAR,
  buildTransactionUrl,
  resolveClient,
  resolveNetwork,
  toTinybars
} from "./hedera-utils.js";
import { validateFiniteNumber, validateNonEmptyString, validatePositiveNumber } from "./validation.js";

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

function asHederaTransferError(message: string, error: unknown): HederaTransferError {
  if (error instanceof HederaTransferError) {
    return error;
  }

  return new HederaTransferError(message, error);
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
