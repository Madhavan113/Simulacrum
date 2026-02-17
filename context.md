# 🤖 AgentBets: Parallel Agent Development Context

> **Copy this entire document into any Claude/AI agent's context to enable coordinated development.**

---

## 📋 PROJECT OVERVIEW

**Project**: AgentBets - Autonomous Agent Prediction Markets on Hedera
**Bounty**: $10,000 ETH Denver "Killer App for Agentic Society" (OpenClaw)
**Deadline**: 5 days
**Repo Structure**: Monorepo with feature modules

### One-Liner
An agent-native prediction market where AI agents create, trade, and resolve markets about each other's behavior - with insurance, reputation, and coordination games built on 100% native Hedera services.

### Why We Win
- Agent-first (not human-operated)
- Network effects (more agents = more value)
- Full Hedera native (HTS + HCS + HBAR + Scheduled Tx)
- UCP commerce integration
- Kitchen-sink features nobody else will have

---

## 🏗️ ARCHITECTURE

```
agentbets/
├── packages/
│   ├── core/                    # Hedera SDK wrapper + primitives
│   │   ├── src/
│   │   │   ├── client.ts        # Hedera client initialization
│   │   │   ├── hts.ts           # Token Service operations
│   │   │   ├── hcs.ts           # Consensus Service operations
│   │   │   ├── transfers.ts     # HBAR transfer operations
│   │   │   ├── accounts.ts      # Account management
│   │   │   ├── scheduled.ts     # Scheduled transactions
│   │   │   └── index.ts         # Public exports
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── markets/                 # Prediction market logic
│   │   ├── src/
│   │   │   ├── create.ts        # Market creation
│   │   │   ├── bet.ts           # Place bets
│   │   │   ├── resolve.ts       # Market resolution
│   │   │   ├── claim.ts         # Claim winnings
│   │   │   ├── orderbook.ts     # HCS-based order book
│   │   │   ├── types.ts         # Market types/interfaces
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── reputation/              # Reputation system
│   │   ├── src/
│   │   │   ├── score.ts         # Calculate reputation scores
│   │   │   ├── attestation.ts   # HCS attestations
│   │   │   ├── graph.ts         # Trust graph operations
│   │   │   ├── tokens.ts        # REP token operations
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── insurance/               # Insurance/bonds system
│   │   ├── src/
│   │   │   ├── underwrite.ts    # Agents underwriting others
│   │   │   ├── pools.ts         # Insurance pool management
│   │   │   ├── claims.ts        # Process insurance claims
│   │   │   ├── premiums.ts      # Premium calculations
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── coordination/            # Coordination games
│   │   ├── src/
│   │   │   ├── assurance.ts     # Assurance contracts
│   │   │   ├── commitment.ts    # Collective commitments
│   │   │   ├── schelling.ts     # Schelling point discovery
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── agents/                  # Agent SDK + simulation
│   │   ├── src/
│   │   │   ├── agent.ts         # Base agent class
│   │   │   ├── strategies/      # Trading/betting strategies
│   │   │   │   ├── random.ts
│   │   │   │   ├── reputation-based.ts
│   │   │   │   └── contrarian.ts
│   │   │   ├── simulation.ts    # Multi-agent simulation
│   │   │   ├── openclaw.ts      # OpenClaw integration
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── api/                     # REST API for agents
│   │   ├── src/
│   │   │   ├── server.ts        # Express server
│   │   │   ├── routes/
│   │   │   │   ├── markets.ts
│   │   │   │   ├── bets.ts
│   │   │   │   ├── reputation.ts
│   │   │   │   ├── insurance.ts
│   │   │   │   └── agents.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts
│   │   │   │   └── validation.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── ui/                      # Observer UI (React)
│       ├── src/
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── AgentCard.tsx
│       │   │   ├── MarketCard.tsx
│       │   │   ├── ActivityFeed.tsx
│       │   │   ├── ReputationGraph.tsx
│       │   │   ├── Leaderboard.tsx
│       │   │   └── HashScanLink.tsx
│       │   ├── hooks/
│       │   │   ├── useMarkets.ts
│       │   │   ├── useAgents.ts
│       │   │   └── useHederaEvents.ts
│       │   ├── pages/
│       │   │   ├── Dashboard.tsx
│       │   │   ├── Markets.tsx
│       │   │   ├── Agents.tsx
│       │   │   └── Market.tsx
│       │   └── styles/
│       ├── package.json
│       └── vite.config.ts
│
├── scripts/
│   ├── demo.ts                  # Full demo script
│   ├── setup-testnet.ts         # Initialize testnet resources
│   └── simulate.ts              # Run multi-agent simulation
│
├── tests/
│   ├── core/
│   ├── markets/
│   ├── reputation/
│   ├── insurance/
│   └── e2e/
│
├── .env.example
├── package.json                 # Workspace root
├── turbo.json                   # Turborepo config
├── tsconfig.base.json
└── README.md
```

---

## 🔧 TECH STACK

| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js 20+ / TypeScript 5.x |
| **Hedera SDK** | `@hashgraph/sdk` ^2.51.0 |
| **Monorepo** | Turborepo + pnpm workspaces |
| **API** | Express.js + Zod validation |
| **UI** | React 18 + Vite + TailwindCSS |
| **Testing** | Vitest |
| **Linting** | ESLint + Prettier |

---

## 🌐 HEDERA SERVICES REFERENCE

### HTS (Hedera Token Service)
```typescript
import {
  TokenCreateTransaction,
  TokenMintTransaction,
  TokenBurnTransaction,
  TokenAssociateTransaction,
  TransferTransaction,
  TokenType,
  TokenSupplyType,
} from "@hashgraph/sdk";

// Fungible token (YES/NO/REP tokens)
const tokenCreate = new TokenCreateTransaction()
  .setTokenName("YES-BTC100K")
  .setTokenSymbol("YES")
  .setTokenType(TokenType.FungibleCommon)
  .setDecimals(2)
  .setInitialSupply(0)
  .setSupplyType(TokenSupplyType.Infinite)
  .setTreasuryAccountId(treasuryId)
  .setSupplyKey(supplyKey)
  .setAdminKey(adminKey);

// NFT (Agent identity badges)
const nftCreate = new TokenCreateTransaction()
  .setTokenName("AgentBets Identity")
  .setTokenSymbol("AGENTID")
  .setTokenType(TokenType.NonFungibleUnique)
  .setSupplyType(TokenSupplyType.Finite)
  .setMaxSupply(10000)
  .setTreasuryAccountId(treasuryId)
  .setSupplyKey(supplyKey);
```

### HCS (Hedera Consensus Service)
```typescript
import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from "@hashgraph/sdk";

// Create topic (for orderbook, audit trail, etc.)
const topicCreate = new TopicCreateTransaction()
  .setTopicMemo("AgentBets Market: BTC>100k")
  .setSubmitKey(submitKey)
  .setAdminKey(adminKey);

// Submit message
const messageSubmit = new TopicMessageSubmitTransaction()
  .setTopicId(topicId)
  .setMessage(JSON.stringify({
    type: "BET",
    agent: "0.0.12345",
    outcome: "YES",
    amount: 100,
    timestamp: Date.now()
  }));

// Subscribe to topic (via Mirror Node)
// GET https://testnet.mirrornode.hedera.com/api/v1/topics/{topicId}/messages
```

### HBAR Transfers
```typescript
import { TransferTransaction, Hbar } from "@hashgraph/sdk";

const transfer = new TransferTransaction()
  .addHbarTransfer(fromAccount, Hbar.from(-10))
  .addHbarTransfer(toAccount, Hbar.from(10));
```

### Scheduled Transactions
```typescript
import { ScheduleCreateTransaction } from "@hashgraph/sdk";

// Schedule a future transaction (e.g., market resolution)
const scheduled = new ScheduleCreateTransaction()
  .setScheduledTransaction(innerTransaction)
  .setPayerAccountId(payerId)
  .setAdminKey(adminKey)
  .setScheduleMemo("Market resolution: BTC>100k @ 2026-03-01");
```

---

## 📊 DATA MODELS

### Market
```typescript
interface Market {
  id: string;                    // Topic ID (0.0.xxxxx)
  question: string;
  description: string;
  outcomes: string[];            // ["YES", "NO"] or ["A", "B", "C"]
  outcomeTokens: Record<string, string>; // { "YES": "0.0.xxxxx", "NO": "0.0.xxxxx" }
  
  creator: string;               // Agent account ID
  creatorBond: number;           // HBAR staked by creator
  creatorRepStake: number;       // REP tokens staked
  
  resolver: string;              // Account ID authorized to resolve
  resolutionTime: number;        // Unix timestamp
  resolvedOutcome?: string;      // Set after resolution
  resolutionProof?: string;      // HCS message ID with proof
  
  status: "OPEN" | "CLOSED" | "RESOLVED" | "DISPUTED";
  
  totalVolume: number;           // Total HBAR wagered
  createdAt: number;
  
  // HashScan links
  topicUrl: string;
  tokenUrls: Record<string, string>;
}
```

### Agent
```typescript
interface Agent {
  id: string;                    // Hedera account ID (0.0.xxxxx)
  name: string;
  type: "CLAUDE" | "GPT" | "CUSTOM" | "HUMAN";
  
  // Reputation
  repTokenBalance: number;       // Current REP tokens
  repScore: number;              // 0-100 calculated score
  completionRate: number;        // % of commitments fulfilled
  marketsMade: number;
  marketsResolved: number;
  totalVolume: number;
  
  // Trust graph
  trustedBy: string[];           // Agents who endorsed this agent
  trusts: string[];              // Agents this agent endorses
  
  // Identity NFT
  identityNft?: string;          // NFT token ID
  
  createdAt: number;
}
```

### Bet
```typescript
interface Bet {
  id: string;                    // Transaction ID
  marketId: string;
  agent: string;
  outcome: string;
  amount: number;                // HBAR
  tokensReceived: number;        // Outcome tokens received
  timestamp: number;
  transactionUrl: string;        // HashScan link
}
```

### InsurancePolicy
```typescript
interface InsurancePolicy {
  id: string;
  marketId: string;
  underwriter: string;           // Agent providing coverage
  covered: string;               // Agent being covered
  coverageAmount: number;        // HBAR
  premium: number;               // HBAR paid for coverage
  status: "ACTIVE" | "CLAIMED" | "EXPIRED";
  createdAt: number;
}
```

### Attestation
```typescript
interface Attestation {
  id: string;                    // HCS message sequence number
  topicId: string;
  type: "ENDORSEMENT" | "RESOLUTION_PROOF" | "TASK_COMPLETION" | "DISPUTE";
  from: string;
  to?: string;
  data: Record<string, unknown>;
  timestamp: number;
  messageUrl: string;            // HashScan link
}
```

---

## 🎯 FEATURE TICKETS

Each feature should be developed as a standalone unit. Use these ticket definitions:

### CORE-001: Hedera Client Initialization
**Package**: `packages/core`
**Files**: `src/client.ts`
**Description**: Initialize Hedera client with testnet credentials, export singleton
**Acceptance**:
- [ ] Reads from environment variables
- [ ] Supports testnet/mainnet/previewnet
- [ ] Exports typed client instance
- [ ] Handles connection errors gracefully

### CORE-002: HTS Token Operations
**Package**: `packages/core`
**Files**: `src/hts.ts`
**Description**: Wrapper functions for all HTS operations
**Acceptance**:
- [ ] `createFungibleToken(name, symbol, supply, decimals)`
- [ ] `createNFT(name, symbol, maxSupply)`
- [ ] `mintTokens(tokenId, amount)`
- [ ] `transferTokens(tokenId, from, to, amount)`
- [ ] `associateToken(accountId, tokenId)`
- [ ] All return transaction IDs + HashScan URLs

### CORE-003: HCS Topic Operations
**Package**: `packages/core`
**Files**: `src/hcs.ts`
**Description**: Wrapper functions for HCS operations
**Acceptance**:
- [ ] `createTopic(memo, submitKey?)`
- [ ] `submitMessage(topicId, message)`
- [ ] `getMessages(topicId, options)` via Mirror Node
- [ ] `subscribeToTopic(topicId, callback)` via polling/websocket
- [ ] All return transaction IDs + HashScan URLs

### CORE-004: HBAR Transfers
**Package**: `packages/core`
**Files**: `src/transfers.ts`
**Description**: HBAR transfer utilities
**Acceptance**:
- [ ] `transferHbar(from, to, amount)`
- [ ] `multiTransfer(transfers[])` for batch payouts
- [ ] `getBalance(accountId)`
- [ ] Returns transaction IDs + HashScan URLs

### CORE-005: Account Management
**Package**: `packages/core`
**Files**: `src/accounts.ts`
**Description**: Create and manage Hedera accounts for agents
**Acceptance**:
- [ ] `createAccount(initialBalance)` returns ID + keys
- [ ] `getAccountInfo(accountId)`
- [ ] Secure key storage/retrieval pattern

---

### MARKET-001: Create Market
**Package**: `packages/markets`
**Files**: `src/create.ts`
**Dependencies**: CORE-001, CORE-002, CORE-003
**Description**: Create a new prediction market
**Acceptance**:
- [ ] Creates HCS topic for market
- [ ] Mints YES/NO tokens via HTS
- [ ] Records market metadata in initial HCS message
- [ ] Takes creator bond (HBAR escrow)
- [ ] Returns Market object with all IDs

### MARKET-002: Place Bet
**Package**: `packages/markets`
**Files**: `src/bet.ts`
**Dependencies**: CORE-002, CORE-003, CORE-004
**Description**: Place a bet on a market outcome
**Acceptance**:
- [ ] Transfers HBAR to escrow
- [ ] Mints outcome tokens to bettor
- [ ] Records bet on HCS topic
- [ ] Returns Bet object

### MARKET-003: Resolve Market
**Package**: `packages/markets`
**Files**: `src/resolve.ts`
**Dependencies**: CORE-002, CORE-003
**Description**: Resolve a market with outcome
**Acceptance**:
- [ ] Validates resolver authorization
- [ ] Records resolution proof on HCS
- [ ] Marks market as resolved
- [ ] Triggers 24hr dispute window (optional)

### MARKET-004: Claim Winnings
**Package**: `packages/markets`
**Files**: `src/claim.ts`
**Dependencies**: CORE-002, CORE-004
**Description**: Claim winnings after resolution
**Acceptance**:
- [ ] Burns winning outcome tokens
- [ ] Calculates payout amount
- [ ] Transfers HBAR to winner
- [ ] Records claim on HCS

### MARKET-005: Order Book
**Package**: `packages/markets`
**Files**: `src/orderbook.ts`
**Dependencies**: CORE-003
**Description**: HCS-based order book for limit orders
**Acceptance**:
- [ ] Submit limit orders to HCS
- [ ] Match orders off-chain
- [ ] Execute matched orders on-chain
- [ ] Real-time order book state

---

### REP-001: Reputation Token
**Package**: `packages/reputation`
**Files**: `src/tokens.ts`
**Dependencies**: CORE-002
**Description**: REP token for reputation staking
**Acceptance**:
- [ ] Create REP token on initialization
- [ ] Mint REP rewards
- [ ] Burn REP penalties
- [ ] Transfer REP between agents

### REP-002: Attestations
**Package**: `packages/reputation`
**Files**: `src/attestation.ts`
**Dependencies**: CORE-003
**Description**: On-chain attestations via HCS
**Acceptance**:
- [ ] `endorseAgent(from, to, reason)`
- [ ] `attestTaskCompletion(agent, taskId, proof)`
- [ ] `disputeResolution(disputer, marketId, reason)`
- [ ] All recorded on reputation topic

### REP-003: Score Calculation
**Package**: `packages/reputation`
**Files**: `src/score.ts`
**Dependencies**: REP-001, REP-002
**Description**: Calculate reputation scores
**Acceptance**:
- [ ] Aggregate attestations into score
- [ ] Weight by endorser reputation (PageRank-style)
- [ ] Decay over time
- [ ] Return 0-100 score

### REP-004: Trust Graph
**Package**: `packages/reputation`
**Files**: `src/graph.ts`
**Dependencies**: REP-002
**Description**: Build and query trust graph
**Acceptance**:
- [ ] Build graph from attestations
- [ ] Query trust path between agents
- [ ] Calculate transitive trust
- [ ] Visualizable structure

---

### INS-001: Underwrite Commitment
**Package**: `packages/insurance`
**Files**: `src/underwrite.ts`
**Dependencies**: CORE-002, CORE-004, MARKET-001
**Description**: Agent underwrites another's commitment
**Acceptance**:
- [ ] Underwriter stakes HBAR as coverage
- [ ] Premium paid by covered agent
- [ ] Links to specific market
- [ ] Returns InsurancePolicy

### INS-002: Process Claim
**Package**: `packages/insurance`
**Files**: `src/claims.ts`
**Dependencies**: INS-001, MARKET-003
**Description**: Process insurance claim on failure
**Acceptance**:
- [ ] Validates failure condition
- [ ] Transfers coverage to affected parties
- [ ] Slashes underwriter stake
- [ ] Records on HCS

---

### COORD-001: Assurance Contracts
**Package**: `packages/coordination`
**Files**: `src/assurance.ts`
**Dependencies**: CORE-003, CORE-004
**Description**: "Kickstarter for agents" - only executes if threshold met
**Acceptance**:
- [ ] Create assurance contract with threshold
- [ ] Agents pledge HBAR
- [ ] If threshold met: execute
- [ ] If not met by deadline: refund all
- [ ] Uses Scheduled Transactions

---

### AGENT-001: Base Agent Class
**Package**: `packages/agents`
**Files**: `src/agent.ts`
**Dependencies**: All core packages
**Description**: Base class for autonomous agents
**Acceptance**:
- [ ] Wraps Hedera account
- [ ] Methods for all platform operations
- [ ] Event handling for market updates
- [ ] Strategy interface

### AGENT-002: Trading Strategies
**Package**: `packages/agents`
**Files**: `src/strategies/*.ts`
**Dependencies**: AGENT-001
**Description**: Pluggable betting strategies
**Acceptance**:
- [ ] Random strategy (baseline)
- [ ] Reputation-based (trust high-rep agents)
- [ ] Contrarian (bet against consensus)
- [ ] Strategy interface for custom

### AGENT-003: Multi-Agent Simulation
**Package**: `packages/agents`
**Files**: `src/simulation.ts`
**Dependencies**: AGENT-001, AGENT-002
**Description**: Run N agents autonomously
**Acceptance**:
- [ ] Spawn N agents with accounts
- [ ] Random market creation
- [ ] Autonomous betting
- [ ] Resolution and payouts
- [ ] Metrics collection

### AGENT-004: OpenClaw Integration
**Package**: `packages/agents`
**Files**: `src/openclaw.ts`
**Dependencies**: AGENT-001
**Description**: OpenClaw SDK wrapper
**Acceptance**:
- [ ] OpenClaw agent can use AgentBets
- [ ] Tool definitions for OpenClaw
- [ ] Event hooks

---

### API-001: Express Server Setup
**Package**: `packages/api`
**Files**: `src/server.ts`, `src/routes/*.ts`
**Dependencies**: All feature packages
**Description**: REST API for agents
**Acceptance**:
- [ ] GET /markets
- [ ] POST /markets
- [ ] POST /markets/:id/bet
- [ ] POST /markets/:id/resolve
- [ ] GET /agents
- [ ] GET /agents/:id
- [ ] GET /reputation/:id
- [ ] WebSocket for real-time updates

---

### UI-001: Dashboard Page
**Package**: `packages/ui`
**Files**: `src/pages/Dashboard.tsx`
**Dependencies**: API-001
**Description**: Main observer dashboard
**Acceptance**:
- [ ] Active markets summary
- [ ] Agent leaderboard
- [ ] Real-time activity feed
- [ ] Total volume stats

### UI-002: Market Components
**Package**: `packages/ui`
**Files**: `src/components/MarketCard.tsx`, `src/pages/Market.tsx`
**Dependencies**: API-001
**Description**: Market display components
**Acceptance**:
- [ ] Market card with odds
- [ ] Bet history
- [ ] Resolution status
- [ ] HashScan links

### UI-003: Agent Components
**Package**: `packages/ui`
**Files**: `src/components/AgentCard.tsx`, `src/pages/Agents.tsx`
**Dependencies**: API-001
**Description**: Agent display components
**Acceptance**:
- [ ] Agent profile card
- [ ] Reputation score
- [ ] Activity history
- [ ] Trust connections

### UI-004: Activity Feed
**Package**: `packages/ui`
**Files**: `src/components/ActivityFeed.tsx`
**Dependencies**: API-001
**Description**: Real-time event stream
**Acceptance**:
- [ ] WebSocket connection
- [ ] Event cards (bet, resolve, claim)
- [ ] Auto-scroll
- [ ] Click to expand

### UI-005: Reputation Graph Visualization
**Package**: `packages/ui`
**Files**: `src/components/ReputationGraph.tsx`
**Dependencies**: API-001, REP-004
**Description**: Interactive trust graph
**Acceptance**:
- [ ] D3 or similar visualization
- [ ] Nodes = agents
- [ ] Edges = trust relationships
- [ ] Click to inspect

---

## 🔀 PARALLEL DEVELOPMENT RULES

### Branch Naming
```
feature/<TICKET-ID>-<short-description>
```
Examples:
- `feature/CORE-001-hedera-client`
- `feature/MARKET-002-place-bet`
- `feature/UI-003-agent-components`

### Commit Messages
```
[<TICKET-ID>] <type>: <description>

<body>
```
Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

Example:
```
[CORE-002] feat: implement HTS token operations

- Add createFungibleToken function
- Add mintTokens function
- Add transferTokens function
- Include HashScan URL generation
```

### PR Template
```markdown
## Ticket
<TICKET-ID>: <Title>

## Changes
- 

## Testing
- [ ] Unit tests pass
- [ ] Manual testing on testnet

## HashScan Links (if applicable)
- Token: 
- Topic: 
- Transaction: 
```

### Dependency Rules
1. Check ticket dependencies before starting
2. If dependency not merged, either:
   - Wait for it
   - Mock the interface and note it
3. Never modify files outside your package without coordination

### Interface Contracts
All packages export from `index.ts`. If you need something from another package:
1. Check if it's exported
2. If not, request it via Linear ticket
3. Don't reach into internal files

### Testing Requirements
- Unit tests for all public functions
- Use mocked Hedera client for unit tests
- Integration tests use real testnet (tagged `@integration`)

---

## 🔐 ENVIRONMENT SETUP

```bash
# .env.example
HEDERA_NETWORK=testnet
HEDERA_ACCOUNT_ID=0.0.xxxxx
HEDERA_PRIVATE_KEY=302e...

# Optional: Pre-created resources (speeds up testing)
HEDERA_REP_TOKEN_ID=0.0.xxxxx
HEDERA_REPUTATION_TOPIC_ID=0.0.xxxxx
HEDERA_MARKET_TOPIC_ID=0.0.xxxxx

# API
PORT=3000
```

### Getting Testnet Credentials
1. Go to https://portal.hedera.com
2. Create account
3. Copy Account ID and DER-encoded private key
4. Fund with testnet HBAR (auto-funded on creation)

---

## 📎 USEFUL LINKS

- **Hedera Docs**: https://docs.hedera.com
- **Hedera SDK JS**: https://github.com/hashgraph/hedera-sdk-js
- **HashScan (Testnet)**: https://hashscan.io/testnet
- **Mirror Node API**: https://testnet.mirrornode.hedera.com/api/v1/
- **OpenClaw Docs**: https://docs.openclaw.ai
- **UCP Tutorial**: https://github.com/hedera-dev/tutorial-ucp-hedera
- **Hedera Agent Skills**: https://github.com/hedera-dev/hedera-skills

---

## 🎬 DEMO SCRIPT OUTLINE

The final demo (3 min) should show:

1. **[0:00-0:30] Setup**: Show UI, explain concept
2. **[0:30-1:00] Agent A creates market**: "I will solve X in 60 seconds"
3. **[1:00-1:30] Agent B discovers & bets**: Evaluates reputation, bets against
4. **[1:30-2:00] Task executes**: Show agent working, timer
5. **[2:00-2:20] Resolution**: Proof submitted to HCS, HashScan shown
6. **[2:20-2:40] Payouts**: HBAR flows, reputation updates
7. **[2:40-3:00] Scale**: Multiple agents, network effect visualization

---

## ❓ QUESTIONS / BLOCKERS

If you encounter issues:
1. Check this doc first
2. Check existing Linear tickets
3. Create a new ticket with `blocked:` prefix
4. Tag in Discord/Slack

---

## 🚀 LET'S BUILD!

Pick a ticket, branch off main, ship it.

**Remember**: We're building the most feature-rich agent prediction market anyone has ever seen. Every feature is a competitive advantage.

---

## 🧭 BACKEND INFRA WORKING LOG

### 2026-02-17 (Current Session)
- Scope locked to backend infrastructure only.
- Completed baseline audit of monorepo status.
- Confirmed `CORE-001` is implemented in `packages/core/src/client.ts` with passing tests.
- Completed `CORE-002` (HTS Token Operations):
  - Added `packages/core/src/hts.ts`
  - Added `packages/core/src/hts.test.ts`
  - Updated `packages/core/src/index.ts` exports
  - Validation: `pnpm test` (14/14 passing), `pnpm build` passing
- Completed `CORE-003` (HCS Topic Operations):
  - Added `packages/core/src/hcs.ts`
  - Added `packages/core/src/hcs.test.ts`
  - Supports `createTopic`, `submitMessage`, `getMessages` (Mirror Node), `subscribeToTopic` (polling)
  - Returns transaction IDs + HashScan URLs for topic operations
- Completed `CORE-004` (HBAR Transfers):
  - Added `packages/core/src/transfers.ts`
  - Added `packages/core/src/transfers.test.ts`
  - Supports `transferHbar`, `multiTransfer`, `getBalance`
  - Includes transfer net-zero validation and HashScan transaction URLs
- Completed `CORE-005` (Account Management):
  - Added `packages/core/src/accounts.ts`
  - Added `packages/core/src/accounts.test.ts`
  - Supports `createAccount`, `getAccountInfo`
  - Added secure key storage/retrieval pattern via `EncryptedInMemoryKeyStore` (AES-256-GCM)
  - Added `getStoredPrivateKey` helper
- Export surface updated in `packages/core/src/index.ts` for `CORE-002` through `CORE-005`.
- Validation after full sprint increment:
  - `pnpm test`: 26/26 tests passing
  - `pnpm build`: passing
- Next queued backend infra sprint items:
  - `MARKET-001` Create Market (depends on CORE-002, CORE-003)
  - `MARKET-002` Place Bet (depends on CORE-004)
