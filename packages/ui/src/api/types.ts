// Mirror of packages/markets/src/types.ts
export type MarketStatus = 'OPEN' | 'CLOSED' | 'RESOLVED' | 'DISPUTED'

export interface MarketSelfAttestation {
  proposedOutcome: string
  attestedByAccountId: string
  reason?: string
  evidence?: string
  attestedAt: string
}

export interface MarketChallenge {
  id: string
  marketId: string
  challengerAccountId: string
  proposedOutcome: string
  reason: string
  evidence?: string
  createdAt: string
}

export interface MarketOracleVote {
  id: string
  marketId: string
  voterAccountId: string
  outcome: string
  confidence: number
  reason?: string
  reputationScore?: number
  createdAt: string
}

export interface Market {
  id: string
  question: string
  description?: string
  creatorAccountId: string
  escrowAccountId: string
  topicId: string
  topicUrl: string
  closeTime: string
  createdAt: string
  status: MarketStatus
  outcomes: string[]
  initialOddsByOutcome?: Record<string, number>
  outcomeTokenIds: Record<string, string>
  outcomeTokenUrls: Record<string, string>
  resolvedOutcome?: string
  resolvedAt?: string
  resolvedByAccountId?: string
  selfAttestation?: MarketSelfAttestation
  challengeWindowEndsAt?: string
  challenges?: MarketChallenge[]
  oracleVotes?: MarketOracleVote[]
}

export interface MarketBet {
  id: string
  marketId: string
  bettorAccountId: string
  outcome: string
  amountHbar: number
  placedAt: string
  escrowTransactionId?: string
  escrowTransactionUrl?: string
  topicTransactionId?: string
  topicSequenceNumber?: number
}

export interface MarketBetsSnapshot {
  marketId: string
  betCount: number
  totalStakedHbar: number
  stakeByOutcome: Record<string, number>
  bets: MarketBet[]
}

export interface MarketOrder {
  id: string
  marketId: string
  accountId: string
  outcome: string
  side: 'BID' | 'ASK'
  quantity: number
  price: number
  createdAt: string
  status: 'OPEN' | 'CANCELLED'
  topicTransactionId?: string
  topicTransactionUrl?: string
}

export interface OrderBookSnapshot {
  marketId: string
  orders: MarketOrder[]
  bids: MarketOrder[]
  asks: MarketOrder[]
}

// Mirror of packages/agents/src/agent.ts (as returned by API)
export type AgentMode = 'AGGRESSIVE' | 'BALANCED' | 'CONSERVATIVE'

export interface Agent {
  id: string
  name: string
  accountId: string
  bankrollHbar: number
  reputationScore: number
  strategy: string
  mode?: AgentMode
}

// Mirror of packages/reputation/src/types.ts
export interface ReputationLeaderboardEntry {
  accountId: string
  score: number
  rawScore?: number
  confidence?: number
  attestationCount: number
}

export interface TrustEdge {
  from: string
  to: string
  weight: number
  attestations: number
}

export interface TrustGraph {
  nodes: string[]
  edges: TrustEdge[]
  adjacency: Record<string, TrustEdge[]>
}

// Autonomy engine status
export interface AutonomyStatus {
  enabled: boolean
  running: boolean
  tickMs?: number
  tickCount?: number
  agentCount?: number
  managedAgentCount?: number
  openMarkets?: number
  lastTickAt?: string
  lastError?: string
  reason?: string
}

// ClawDBot network
export interface ClawdbotNetworkStatus {
  enabled: boolean
  running: boolean
  tickMs: number
  tickCount: number
  botCount: number
  managedBotCount: number
  threadLength: number
  openMarkets: number
  oracleMinReputationScore: number
  oracleMinVoters: number
  trustedResolverCount: number
  demoScriptRunning?: boolean
  lastDemoRunId?: string
  lastDemoStartedAt?: string
  lastDemoCompletedAt?: string
  lastDemoError?: string
  lastTickAt?: string
  lastError?: string
}

export interface ClawdbotProfile {
  id: string
  name: string
  accountId: string
  strategy: string
  mode: AgentMode
  bankrollHbar: number
  reputationScore: number
  origin: 'internal' | 'community'
  joinedAt: string
  hosted?: boolean
  active?: boolean
  suspended?: boolean
}

export interface ClawdbotMessage {
  id: string
  text: string
  createdAt: string
  botId?: string
  botName?: string
}

export type ClawdbotGoalStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'

export interface ClawdbotGoal {
  id: string
  botId: string
  title: string
  detail: string
  status: ClawdbotGoalStatus
  createdAt: string
  updatedAt: string
  completedAt?: string
  error?: string
}

// Insurance
export type PolicyStatus = 'ACTIVE' | 'CLAIMED' | 'EXPIRED' | 'CANCELLED'

export interface InsurancePolicy {
  id: string
  marketId: string
  underwriterAccountId: string
  beneficiaryAccountId: string
  escrowAccountId: string
  coverageAmountHbar: number
  premiumAmountHbar: number
  premiumRateBps: number
  expirationTime: string
  createdAt: string
  status: PolicyStatus
  collateralTransactionId?: string
  collateralTransactionUrl?: string
  payoutTransactionId?: string
  payoutTransactionUrl?: string
}

export interface InsurancePool {
  id: string
  managerAccountId: string
  escrowAccountId: string
  liquidityHbar: number
  reservedHbar: number
  createdAt: string
  updatedAt: string
}

// Market resolution / claim response shapes
export interface MarketResolution {
  marketId: string
  resolvedOutcome: string
  resolvedAt: string
  resolvedByAccountId: string
}

export interface ClaimRecord {
  marketId: string
  claimantAccountId: string
  payoutAmountHbar: number
  transactionId?: string
}

// WebSocket event shape
export interface WsEvent<T = unknown> {
  type: string
  payload: T
  timestamp: string
}
