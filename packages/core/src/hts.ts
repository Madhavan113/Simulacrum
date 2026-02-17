import {
  AccountId,
  Client,
  TokenAssociateTransaction,
  TokenCreateTransaction,
  TokenId,
  TokenMintTransaction,
  TokenSupplyType,
  TokenType,
  TransferTransaction
} from "@hashgraph/sdk";

import { getHederaClient, type HederaNetwork } from "./client.js";

const HASHSCAN_BASE_URL = "https://hashscan.io";
const DEFAULT_NETWORK: HederaNetwork = "testnet";

export interface TokenOperationResult {
  tokenId: string;
  tokenUrl: string;
  transactionId: string;
  transactionUrl: string;
}

export interface HtsOperationOptions {
  client?: Client;
}

export interface CreateTokenOptions extends HtsOperationOptions {
  treasuryAccountId?: string;
  memo?: string;
}

export class HederaTokenError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "HederaTokenError";
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

function buildTokenUrl(network: HederaNetwork, tokenId: string): string {
  return `${HASHSCAN_BASE_URL}/${network}/token/${encodeURIComponent(tokenId)}`;
}

function toResult(client: Client, transactionId: string, tokenId: string): TokenOperationResult {
  const network = resolveNetwork(client);

  return {
    tokenId,
    tokenUrl: buildTokenUrl(network, tokenId),
    transactionId,
    transactionUrl: buildTransactionUrl(network, transactionId)
  };
}

function asHederaTokenError(message: string, error: unknown): HederaTokenError {
  if (error instanceof HederaTokenError) {
    return error;
  }

  return new HederaTokenError(message, error);
}

function validateNonEmptyString(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new HederaTokenError(`${fieldName} must be a non-empty string.`);
  }
}

function validateNonNegativeInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new HederaTokenError(`${fieldName} must be a non-negative integer.`);
  }
}

function validatePositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new HederaTokenError(`${fieldName} must be a positive integer.`);
  }
}

function resolveTreasuryAccountId(client: Client, treasuryAccountId?: string): AccountId {
  if (treasuryAccountId) {
    return AccountId.fromString(treasuryAccountId);
  }

  if (client.operatorAccountId) {
    return client.operatorAccountId;
  }

  throw new HederaTokenError(
    "A treasury account ID is required. Set options.treasuryAccountId or configure an operator on the Hedera client."
  );
}

export async function createFungibleToken(
  name: string,
  symbol: string,
  initialSupply: number,
  decimals: number,
  options: CreateTokenOptions = {}
): Promise<TokenOperationResult> {
  validateNonEmptyString(name, "name");
  validateNonEmptyString(symbol, "symbol");
  validateNonNegativeInteger(initialSupply, "initialSupply");
  validateNonNegativeInteger(decimals, "decimals");

  const client = resolveClient(options.client);

  try {
    const treasuryAccountId = resolveTreasuryAccountId(client, options.treasuryAccountId);

    const transaction = new TokenCreateTransaction()
      .setTokenName(name)
      .setTokenSymbol(symbol)
      .setTokenType(TokenType.FungibleCommon)
      .setSupplyType(TokenSupplyType.Infinite)
      .setDecimals(decimals)
      .setInitialSupply(initialSupply)
      .setTreasuryAccountId(treasuryAccountId);

    if (options.memo) {
      transaction.setTokenMemo(options.memo);
    }

    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);
    const tokenId = receipt.tokenId?.toString();

    if (!tokenId) {
      throw new HederaTokenError("Token creation completed without a token ID in the receipt.");
    }

    return toResult(client, response.transactionId.toString(), tokenId);
  } catch (error) {
    throw asHederaTokenError("Failed to create fungible token.", error);
  }
}

export async function createNFT(
  name: string,
  symbol: string,
  maxSupply: number,
  options: CreateTokenOptions = {}
): Promise<TokenOperationResult> {
  validateNonEmptyString(name, "name");
  validateNonEmptyString(symbol, "symbol");
  validatePositiveInteger(maxSupply, "maxSupply");

  const client = resolveClient(options.client);

  try {
    const treasuryAccountId = resolveTreasuryAccountId(client, options.treasuryAccountId);

    const transaction = new TokenCreateTransaction()
      .setTokenName(name)
      .setTokenSymbol(symbol)
      .setTokenType(TokenType.NonFungibleUnique)
      .setSupplyType(TokenSupplyType.Finite)
      .setInitialSupply(0)
      .setMaxSupply(maxSupply)
      .setTreasuryAccountId(treasuryAccountId);

    if (options.memo) {
      transaction.setTokenMemo(options.memo);
    }

    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);
    const tokenId = receipt.tokenId?.toString();

    if (!tokenId) {
      throw new HederaTokenError("NFT creation completed without a token ID in the receipt.");
    }

    return toResult(client, response.transactionId.toString(), tokenId);
  } catch (error) {
    throw asHederaTokenError("Failed to create NFT.", error);
  }
}

export async function mintTokens(
  tokenId: string,
  amount: number,
  options: HtsOperationOptions = {}
): Promise<TokenOperationResult> {
  validateNonEmptyString(tokenId, "tokenId");
  validatePositiveInteger(amount, "amount");

  const client = resolveClient(options.client);

  try {
    const response = await new TokenMintTransaction()
      .setTokenId(TokenId.fromString(tokenId))
      .setAmount(amount)
      .execute(client);

    await response.getReceipt(client);

    return toResult(client, response.transactionId.toString(), tokenId);
  } catch (error) {
    throw asHederaTokenError("Failed to mint tokens.", error);
  }
}

export async function transferTokens(
  tokenId: string,
  fromAccountId: string,
  toAccountId: string,
  amount: number,
  options: HtsOperationOptions = {}
): Promise<TokenOperationResult> {
  validateNonEmptyString(tokenId, "tokenId");
  validateNonEmptyString(fromAccountId, "fromAccountId");
  validateNonEmptyString(toAccountId, "toAccountId");
  validatePositiveInteger(amount, "amount");

  const client = resolveClient(options.client);

  try {
    const response = await new TransferTransaction()
      .addTokenTransfer(TokenId.fromString(tokenId), AccountId.fromString(fromAccountId), -amount)
      .addTokenTransfer(TokenId.fromString(tokenId), AccountId.fromString(toAccountId), amount)
      .execute(client);

    await response.getReceipt(client);

    return toResult(client, response.transactionId.toString(), tokenId);
  } catch (error) {
    throw asHederaTokenError("Failed to transfer tokens.", error);
  }
}

export async function associateToken(
  accountId: string,
  tokenId: string,
  options: HtsOperationOptions = {}
): Promise<TokenOperationResult> {
  validateNonEmptyString(accountId, "accountId");
  validateNonEmptyString(tokenId, "tokenId");

  const client = resolveClient(options.client);

  try {
    const response = await new TokenAssociateTransaction()
      .setAccountId(AccountId.fromString(accountId))
      .setTokenIds([TokenId.fromString(tokenId)])
      .execute(client);

    await response.getReceipt(client);

    return toResult(client, response.transactionId.toString(), tokenId);
  } catch (error) {
    throw asHederaTokenError("Failed to associate token.", error);
  }
}
