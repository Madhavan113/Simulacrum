// ── Market types ──

export type MarketStatus = "OPEN" | "CLOSED" | "RESOLVED" | "DISPUTED";
export type MarketLiquidityModel = "CLOB" | "WEIGHTED_CURVE";

export interface MarketCurveState {
  liquidityParameterHbar: number;
  sharesByOutcome: Record<string, number>;
}

export interface MarketSelfAttestation {
  proposedOutcome: string;
  attestedByAccountId: string;
  reason?: string;
  evidence?: string;
  attestedAt: string;
}

export interface MarketChallenge {
  id: string;
  marketId: string;
  challengerAccountId: string;
  proposedOutcome: string;
  reason: string;
  evidence?: string;
  createdAt: string;
}

export interface MarketOracleVote {
  id: string;
  marketId: string;
  voterAccountId: string;
  outcome: string;
  confidence: number;
  reason?: string;
  reputationScore?: number;
  createdAt: string;
}

export interface Market {
  id: string;
  question: string;
  description?: string;
  creatorAccountId: string;
  escrowAccountId: string;
  topicId: string;
  topicUrl: string;
  closeTime: string;
  createdAt: string;
  status: MarketStatus;
  outcomes: string[];
  liquidityModel?: MarketLiquidityModel;
  initialOddsByOutcome?: Record<string, number>;
  currentOddsByOutcome?: Record<string, number>;
  curveState?: MarketCurveState;
  outcomeTokenIds?: Record<string, string>;
  outcomeTokenUrls?: Record<string, string>;
  syntheticOutcomeIds?: Record<string, string>;
  resolvedOutcome?: string;
  resolvedAt?: string;
  resolvedByAccountId?: string;
  selfAttestation?: MarketSelfAttestation;
  challengeWindowEndsAt?: string;
  challenges?: MarketChallenge[];
  oracleVotes?: MarketOracleVote[];
}

export interface MarketBet {
  id: string;
  marketId: string;
  bettorAccountId: string;
  outcome: string;
  amountHbar: number;
  curveSharesPurchased?: number;
  effectiveOdds?: number;
  placedAt: string;
  escrowTransactionId?: string;
  escrowTransactionUrl?: string;
  topicTransactionId?: string;
  topicSequenceNumber?: number;
}

export interface MarketBetsSnapshot {
  marketId: string;
  betCount: number;
  totalStakedHbar: number;
  stakeByOutcome: Record<string, number>;
  bets: MarketBet[];
}

export type OrderSide = "BID" | "ASK";

export interface MarketOrder {
  id: string;
  marketId: string;
  accountId: string;
  outcome: string;
  side: OrderSide;
  quantity: number;
  price: number;
  createdAt: string;
  status: "OPEN" | "CANCELLED";
  topicTransactionId?: string;
  topicTransactionUrl?: string;
  topicSequenceNumber?: number;
}

export interface OrderBookSnapshot {
  marketId: string;
  orders: MarketOrder[];
  bids: MarketOrder[];
  asks: MarketOrder[];
}

export interface MarketResolution {
  marketId: string;
  resolvedOutcome: string;
  resolvedByAccountId: string;
  resolvedAt: string;
  topicTransactionId?: string;
  topicTransactionUrl?: string;
  topicSequenceNumber?: number;
}

export interface ClaimRecord {
  id: string;
  marketId: string;
  accountId: string;
  payoutHbar: number;
  createdAt: string;
  escrowTransactionId?: string;
  escrowTransactionUrl?: string;
}

// ── Agent types ──

export type AgentMode = "AGGRESSIVE" | "BALANCED" | "CONSERVATIVE";

export interface Agent {
  id: string;
  name: string;
  accountId: string;
  walletAccountId?: string;
  bankrollHbar: number;
  reputationScore: number;
  strategy: string;
  mode?: AgentMode;
  origin?: "simulation" | "platform";
  status?: string;
  createdAt?: string;
}

// ── Reputation types ──

export interface ReputationLeaderboardEntry {
  accountId: string;
  score: number;
  rawScore?: number;
  confidence?: number;
  attestationCount: number;
}

export interface TrustEdge {
  from: string;
  to: string;
  weight: number;
  attestations: number;
}

export interface TrustGraph {
  nodes: string[];
  edges: TrustEdge[];
  adjacency: Record<string, TrustEdge[]>;
}

// ── Autonomy types ──

export interface AutonomyStatus {
  enabled: boolean;
  running: boolean;
  tickMs?: number;
  tickCount?: number;
  agentCount?: number;
  managedAgentCount?: number;
  openMarkets?: number;
  lastTickAt?: string;
  lastError?: string;
  reason?: string;
}

// ── ClawDBot types ──

export interface ClawdbotNetworkStatus {
  enabled: boolean;
  running: boolean;
  tickMs: number;
  tickCount: number;
  botCount: number;
  managedBotCount: number;
  threadLength: number;
  openMarkets: number;
  oracleMinReputationScore: number;
  oracleMinVoters: number;
  oracleQuorumPercent?: number;
  trustedResolverCount: number;
  demoScriptRunning?: boolean;
  lastDemoRunId?: string;
  lastDemoStartedAt?: string;
  lastDemoCompletedAt?: string;
  lastDemoError?: string;
  lastTickAt?: string;
  lastError?: string;
}

export interface ClawdbotProfile {
  id: string;
  name: string;
  accountId: string;
  strategy: string;
  mode: AgentMode;
  bankrollHbar: number;
  reputationScore: number;
  origin: "internal" | "community";
  joinedAt: string;
  hosted?: boolean;
  active?: boolean;
  suspended?: boolean;
}

export interface ClawdbotMessage {
  id: string;
  text: string;
  createdAt: string;
  botId?: string;
  botName?: string;
}

export type ClawdbotGoalStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED";

export interface ClawdbotGoal {
  id: string;
  botId: string;
  title: string;
  detail: string;
  status: ClawdbotGoalStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}

// ── Insurance types ──

export type PolicyStatus = "ACTIVE" | "CLAIMED" | "EXPIRED" | "CANCELLED";

export interface InsurancePolicy {
  id: string;
  marketId: string;
  underwriterAccountId: string;
  beneficiaryAccountId: string;
  escrowAccountId: string;
  coverageAmountHbar: number;
  premiumAmountHbar: number;
  premiumRateBps: number;
  expirationTime: string;
  createdAt: string;
  status: PolicyStatus;
  collateralTransactionId?: string;
  collateralTransactionUrl?: string;
  payoutTransactionId?: string;
  payoutTransactionUrl?: string;
}

export interface InsurancePool {
  id: string;
  managerAccountId: string;
  escrowAccountId: string;
  liquidityHbar: number;
  reservedHbar: number;
  createdAt: string;
  updatedAt: string;
}

// ── Research types ──

export type ResearchFocusArea =
  | "agential_game_theory"
  | "reputation_systems"
  | "agent_coordination"
  | "market_microstructure"
  | "oracle_reliability"
  | "agent_native_economics";

export const RESEARCH_FOCUS_LABELS: Record<ResearchFocusArea, string> = {
  agential_game_theory: "Agential Game Theory",
  reputation_systems: "Reputation Systems",
  agent_coordination: "Agent Coordination",
  market_microstructure: "Market Microstructure",
  oracle_reliability: "Oracle Reliability",
  agent_native_economics: "Agent-Native Economics",
};

export const RESEARCH_FOCUS_SHORT_LABELS: Record<ResearchFocusArea, string> = {
  agential_game_theory: "Game Theory",
  reputation_systems: "Reputation",
  agent_coordination: "Coordination",
  market_microstructure: "Microstructure",
  oracle_reliability: "Oracles",
  agent_native_economics: "Economics",
};

export type PublicationStatus =
  | "COLLECTING"
  | "ANALYZING"
  | "HYPOTHESIZING"
  | "DRAFTING"
  | "REVIEWING"
  | "EVALUATING"
  | "PUBLISHED"
  | "RETRACTED";

export type ObservationCategory =
  | "market_creation"
  | "price_movement"
  | "agent_strategy"
  | "dispute_resolution"
  | "reputation_change"
  | "coordination_signal"
  | "liquidity_event"
  | "anomaly";

export interface ResearchObservation {
  id: string;
  timestamp: string;
  category: ObservationCategory;
  sourceEvent: string;
  marketId?: string;
  agentIds: string[];
  metrics: Record<string, number>;
  context: Record<string, unknown>;
}

export interface WindowSummary {
  observationCount: number;
  marketCount: number;
  betCount: number;
  totalVolumeHbar: number;
  activeAgentCount: number;
  disputeCount: number;
  avgOddsShift: number;
  priceEfficiency: number;
  uniqueStrategiesObserved: number;
}

export interface ObservationWindow {
  id: string;
  startTime: string;
  endTime: string;
  observations: ResearchObservation[];
  summary: WindowSummary;
}

export interface ResearchAgentProfile {
  id: string;
  name: string;
  focusArea: ResearchFocusArea;
  model: string;
  observationCount: number;
  publicationCount: number;
  averageEvalScore: number;
  currentStage?: PublicationStatus;
  createdAt: string;
}

export interface OnChainReference {
  type: "transaction" | "topic" | "account" | "market";
  entityId: string;
  hashScanUrl: string;
  description: string;
}

export interface PublicationFinding {
  claim: string;
  evidence: string;
  supportingData: Record<string, unknown>;
  onChainRefs: OnChainReference[];
  confidence: number;
}

export interface ResearchPublication {
  id: string;
  agentId: string;
  focusArea: ResearchFocusArea;
  status: PublicationStatus;

  title: string;
  abstract: string;
  methodology: string;
  findings: PublicationFinding[];
  conclusion: string;
  limitations: string;
  futureWork: string;

  dataWindow: {
    startTime: string;
    endTime: string;
    observationCount: number;
    marketIds: string[];
  };

  evaluation?: PublicationEvaluation;
  previousPublicationIds: string[];

  createdAt: string;
  publishedAt?: string;
  retractedAt?: string;
  retractedReason?: string;
}

export interface EvalTest {
  name: string;
  description: string;
  passed: boolean;
  score: number;
  details: string;
}

export interface EvalDimension {
  score: number;
  rationale: string;
  tests: EvalTest[];
}

export interface PublicationEvaluation {
  id: string;
  publicationId: string;

  dimensions: {
    reproducibility: EvalDimension;
    statisticalSignificance: EvalDimension;
    novelty: EvalDimension;
    coherence: EvalDimension;
    evidenceBacking: EvalDimension;
    predictiveValidity: EvalDimension;
  };

  overallScore: number;
  verdict: "PASS" | "FAIL" | "MARGINAL";
  critiques: string[];
  strengths: string[];

  evaluatedAt: string;
  evaluatorModel: string;
}

export interface ResearchEngineStatus {
  enabled: boolean;
  running: boolean;
  tickMs: number;
  tickCount: number;
  agentCount: number;
  totalObservations: number;
  totalPublications: number;
  publishedCount: number;
  retractedCount: number;
  averageEvalScore: number;
  activeAgents: ResearchAgentProfile[];
  lastTickAt?: string;
  lastError?: string;
}

// ── WebSocket types ──

export interface WsEvent<T = unknown> {
  type: string;
  payload: T;
  timestamp: string;
}
