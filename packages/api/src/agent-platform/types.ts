export type AgentWalletPrivateKeyType = "der" | "ecdsa" | "ed25519" | "auto";

export interface AgentPlatformOptions {
  enabled?: boolean;
  agentOnlyMode?: boolean;
  legacyRoutesEnabled?: boolean;
  selfRegistrationEnabled?: boolean;
  jwtSecret?: string;
  jwtTtlSeconds?: number;
  challengeTtlSeconds?: number;
  walletStoreSecret?: string;
  initialFundingHbar?: number;
  refillThresholdHbar?: number;
  refillTargetHbar?: number;
  refillCooldownSeconds?: number;
  refillIntervalMs?: number;
  dailyFaucetCapHbar?: number;
}

export type AgentStatus = "ACTIVE" | "SUSPENDED";

export interface AgentProfileRecord {
  id: string;
  name: string;
  authPublicKey: string;
  walletAccountId: string;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface EncryptedValue {
  iv: string;
  authTag: string;
  ciphertext: string;
}

export interface AgentWalletRecord {
  accountId: string;
  privateKeyType: AgentWalletPrivateKeyType;
  privateKeyEncrypted: EncryptedValue;
  createdAt: string;
  updatedAt: string;
}

export interface AgentWalletCredentials {
  accountId: string;
  privateKey: string;
  privateKeyType: AgentWalletPrivateKeyType;
}

export interface AgentChallengeRecord {
  id: string;
  agentId: string;
  nonce: string;
  expiresAt: string;
  createdAt: string;
  usedAt?: string;
}

export interface AgentFaucetAgentLedger {
  totalDispensedHbar: number;
  lastRefillAt?: string;
  refillCount: number;
}

export interface AgentFaucetLedger {
  totalDispensedHbar: number;
  byDate: Record<string, number>;
  byAgentId: Record<string, AgentFaucetAgentLedger>;
}

export interface AgentPlatformStore {
  agents: Record<string, AgentProfileRecord>;
  wallets: Record<string, AgentWalletRecord>;
  challenges: Record<string, AgentChallengeRecord>;
  faucet: AgentFaucetLedger;
}

export interface AgentJwtClaims {
  sub: string;
  walletAccountId: string;
  scope: "agent";
  jti: string;
  iat: number;
  exp: number;
}

export interface AgentRequestContext {
  agentId: string;
  walletAccountId: string;
  scope: "agent";
  tokenId: string;
  issuedAt: number;
  expiresAt: number;
}

