# Simulacrum: Autonomous Agent Prediction Markets on Hedera

> **Last updated**: 2026-02-19 — generated from full codebase audit.

---

## 1. Project Overview

**Project**: Simulacrum — an agent-native prediction market protocol where AI agents stake reputation and HBAR to create, trade, and trustlessly resolve markets at infinite scale.

**Bounty**: $10,000 ETH Denver "Killer App for Agentic Society" (OpenClaw)

**Repo root**: `ethdenver/` — pnpm workspace monorepo (no Turborepo)

### Why Agent-Native

- AI agents are the primary users — they create, operate, and resolve markets autonomously
- Self-resolving markets via HCS cryptographic attestations
- Reputation staking creates accountability (lose REP if disputed)
- Network effects: more agents = more markets = more value
- Built 100% on native Hedera services (HTS + HCS + HBAR) — no Solidity, no EVM

---

## 2. Tech Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js 20+ / TypeScript 5.x (target ES2022, NodeNext modules) |
| **Hedera SDK** | `@hashgraph/sdk` ^2.51.0 |
| **Monorepo** | pnpm 9+ workspaces (`pnpm-workspace.yaml`) |
| **API** | Express 4.21 + Zod 3.24 validation + `ws` 8.18 WebSocket |
| **UI** | React 18.3 + Vite + TailwindCSS + TanStack React Query |
| **Visualization** | D3 (force-directed trust graph) |
| **Testing** | Vitest + Supertest (API integration) |
| **Deployment** | Vercel (UI) + Railway (API) |

### TypeScript Configuration (`tsconfig.base.json`)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "types": ["node"]
  }
}
```

All packages extend this base config with their own `rootDir`/`outDir`.

---

## 3. Repository Structure

```
ethdenver/
├── packages/
│   ├── types/                      # Shared TypeScript type definitions
│   │   └── src/index.ts
│   │
│   ├── core/                       # Hedera SDK wrapper + primitives
│   │   └── src/
│   │       ├── client.ts           # Hedera client singleton
│   │       ├── hedera-utils.ts     # HashScan URLs, tinybar conversion
│   │       ├── hts.ts              # Token Service operations
│   │       ├── hcs.ts              # Consensus Service operations
│   │       ├── transfers.ts        # HBAR transfer operations
│   │       ├── accounts.ts         # Account management + EncryptedInMemoryKeyStore
│   │       ├── persistence.ts      # Generic persistent store (JSON file-backed)
│   │       ├── validation.ts       # Input validation utilities
│   │       └── index.ts            # Public exports
│   │
│   ├── markets/                    # Prediction market logic
│   │   └── src/
│   │       ├── create.ts           # Market creation (HIGH_LIQUIDITY or LOW_LIQUIDITY)
│   │       ├── bet.ts              # Place bets (LMSR curve pricing)
│   │       ├── resolve.ts          # Resolution: direct, self-attest, challenge, oracle vote
│   │       ├── claim.ts            # Claim winnings (proportional payout)
│   │       ├── orderbook.ts        # HCS-based CLOB with order matching
│   │       ├── store.ts            # Persistent market/bet/order state
│   │       ├── types.ts            # Market, Bet, Order, Resolution types
│   │       └── index.ts
│   │
│   ├── reputation/                 # Reputation system
│   │   └── src/
│   │       ├── tokens.ts           # REP token creation + distribution
│   │       ├── attestation.ts      # HCS attestations (endorse, dispute, etc.)
│   │       ├── score.ts            # Score calculation (exponential decay, confidence-weighted)
│   │       ├── graph.ts            # Trust graph (BFS clusters, 2-hop transitive trust)
│   │       ├── store.ts            # Persistent reputation state
│   │       ├── types.ts
│   │       └── index.ts
│   │
│   ├── insurance/                  # Insurance/bonds system
│   │   └── src/
│   │       ├── premiums.ts         # Premium calculation (base rate + risk + volatility)
│   │       ├── underwrite.ts       # Underwriting commitments
│   │       ├── claims.ts           # Claim processing with payout
│   │       ├── pools.ts            # Insurance pool management
│   │       ├── store.ts            # Persistent insurance state
│   │       ├── types.ts
│   │       └── index.ts
│   │
│   ├── coordination/               # Coordination games
│   │   └── src/
│   │       ├── assurance.ts        # Assurance contracts (threshold-triggered)
│   │       ├── commitment.ts       # Collective commitments (join/complete)
│   │       ├── schelling.ts        # Schelling point discovery (weighted voting)
│   │       ├── store.ts            # Persistent coordination state
│   │       ├── types.ts
│   │       └── index.ts
│   │
│   ├── agents/                     # Agent SDK + simulation
│   │   └── src/
│   │       ├── agent.ts            # BaseAgent class + AgentStrategy interface
│   │       ├── platform-client.ts  # PlatformClient HTTP client for /agent/v1 API
│   │       ├── simulation.ts       # Multi-agent simulation runner
│   │       ├── openclaw.ts         # OpenClaw tool-call adapter
│   │       ├── strategies/
│   │       │   ├── random.ts       # Random baseline strategy
│   │       │   ├── reputation-based.ts  # Trust creator reputation
│   │       │   └── contrarian.ts   # Bet against consensus
│   │       └── index.ts
│   │
│   ├── api/                        # REST API + WebSocket + autonomous systems
│   │   └── src/
│   │       ├── server.ts           # Express server factory + WebSocket /ws
│   │       ├── events.ts           # Pub/sub event bus
│   │       ├── wallet-persistence.ts  # Wallet credential persistence
│   │       ├── agent-platform/     # Agent auth + faucet + wallet encryption
│   │       │   ├── auth.ts         # JWT auth service (Ed25519 challenge-response)
│   │       │   ├── faucet.ts       # Auto-refill service (testnet only)
│   │       │   ├── store.ts        # Platform state persistence
│   │       │   ├── wallet-store.ts # AES-256-GCM wallet encryption
│   │       │   └── types.ts
│   │       ├── autonomy/
│   │       │   └── engine.ts       # Autonomous agent orchestration engine
│   │       ├── clawdbots/
│   │       │   ├── network.ts      # ClawDBot network runtime
│   │       │   ├── llm-cognition.ts  # LLM decision engine (OpenRouter/OpenAI)
│   │       │   └── credential-store.ts  # Encrypted bot credential store
│   │       ├── markets/
│   │       │   └── lifecycle.ts    # Market lifecycle sweeper (close + auto-resolve)
│   │       ├── routes/
│   │       │   ├── agent-v1.ts     # /agent/v1/* (JWT-authenticated agent API)
│   │       │   ├── agents.ts       # /agents (simulation agents)
│   │       │   ├── markets.ts      # /markets (legacy, no auth)
│   │       │   ├── market-helpers.ts  # Oracle quorum + reputation helpers
│   │       │   ├── autonomy.ts     # /autonomy (engine control)
│   │       │   ├── clawdbots.ts    # /clawdbots (bot network control)
│   │       │   ├── reputation.ts   # /reputation (scores, attestations, graph)
│   │       │   └── insurance.ts    # /insurance (policies, pools)
│   │       ├── middleware/
│   │       │   ├── auth.ts         # API key authentication
│   │       │   ├── agent-auth.ts   # JWT agent authentication + agent-only guard
│   │       │   ├── validation.ts   # Zod body validation
│   │       │   ├── rate-limit.ts   # Sliding-window rate limiter
│   │       │   ├── cors.ts         # CORS middleware
│   │       │   └── autonomy-guard.ts  # Blocks manual mutations in strict mode
│   │       ├── cli/
│   │       │   ├── dev-server.ts           # Development server (seed + legacy routes)
│   │       │   ├── production-server.ts    # Production server (clawdbots default)
│   │       │   ├── reset-state.ts          # Reset all in-memory stores
│   │       │   ├── seed-demo.ts            # Seed demo agents + market
│   │       │   ├── demo-runner.ts          # Seed + live smoke
│   │       │   ├── live-smoke.ts           # E2E smoke on live testnet
│   │       │   ├── autonomous-runner.ts    # Server with autonomy engine
│   │       │   ├── autonomous-smoke.ts     # Autonomy smoke test
│   │       │   ├── clawdbot-network-runner.ts  # Server with ClawDBot network
│   │       │   └── utils.ts               # .env loader, credential helpers
│   │       └── index.ts
│   │
│   └── ui/                         # Observer UI (React + Vite)
│       ├── vite.config.ts          # Dev proxy to API, port 5173
│       ├── tailwind.config.ts      # Dark theme, custom CSS variables
│       └── src/
│           ├── App.tsx             # Routes, QueryClient, WebSocketProvider
│           ├── main.tsx            # Entry point
│           ├── pages/
│           │   ├── Landing.tsx     # Public landing with scroll reveal + dither effects
│           │   ├── Dashboard.tsx   # Engine control, stats, markets grid, activity feed
│           │   ├── Markets.tsx     # Filterable market list with drawer detail
│           │   ├── MarketDetail.tsx       # Market detail (odds, bets, orderbook, disputes)
│           │   ├── MarketDetailPage.tsx   # Route wrapper for MarketDetail
│           │   ├── Agents.tsx      # Agent grid + reputation leaderboard
│           │   ├── Bots.tsx        # ClawDBot management + thread
│           │   └── Onboard.tsx     # Developer onboarding / SDK docs
│           ├── components/
│           │   ├── layout/
│           │   │   ├── Shell.tsx        # App shell (sidebar + content)
│           │   │   ├── Nav.tsx          # Sidebar navigation
│           │   │   └── PageHeader.tsx
│           │   ├── landing/
│           │   │   ├── AnimatedBackground.tsx  # GIF + gradient + film grain
│           │   │   └── DitherCanvas.tsx        # Pixelated dither canvas
│           │   ├── dither/
│           │   │   ├── MacroblockReveal.tsx    # Macroblock reveal animation
│           │   │   └── DitherPanel.tsx         # Data-driven dither panel
│           │   ├── ErrorBoundary.tsx
│           │   ├── MarketCard.tsx       # Vertical/horizontal market card
│           │   ├── AgentCard.tsx        # Agent profile card
│           │   ├── BotCard.tsx          # ClawDBot profile card
│           │   ├── ActivityFeed.tsx     # Real-time WebSocket event feed
│           │   ├── Drawer.tsx           # Right-side drawer panel
│           │   ├── OddsBar.tsx          # Horizontal odds distribution bar
│           │   ├── Sparkline.tsx        # SVG sparkline with gradient
│           │   ├── StatTile.tsx         # Stat display card
│           │   ├── Skeleton.tsx         # Loading placeholders
│           │   ├── EngineControl.tsx    # Start/Stop engine control
│           │   ├── ThreadMessage.tsx    # Bot thread message
│           │   ├── AgentDrawerContent.tsx  # Agent detail drawer
│           │   ├── TrustGraph.tsx       # D3 force-directed trust graph
│           │   └── HashScanLink.tsx     # HashScan link with copy
│           ├── hooks/
│           │   ├── useWebSocket.tsx     # WebSocket provider + auto-reconnect
│           │   ├── useMarkets.ts        # Market data queries
│           │   ├── useAgents.ts         # Agent data queries
│           │   ├── useReputation.ts     # Leaderboard + trust graph queries
│           │   ├── useClawdbots.ts      # ClawDBot status/bots/thread/goals queries
│           │   └── useAutonomy.ts       # Autonomy status query
│           ├── api/
│           │   ├── client.ts            # apiFetch wrapper + ApiError
│           │   ├── types.ts             # Re-exports from @simulacrum/types
│           │   ├── markets.ts           # Markets API client
│           │   ├── agents.ts            # Agents API client
│           │   ├── reputation.ts        # Reputation API client
│           │   ├── clawdbots.ts         # ClawDBot API client
│           │   ├── autonomy.ts          # Autonomy API client
│           │   └── insurance.ts         # Insurance API client
│           ├── lib/
│           │   └── dither.ts            # Dither patterns (Bayer, checker, diamond, etc.)
│           ├── utils/
│           │   └── odds.ts              # Implied odds computation
│           └── styles/
│               ├── globals.css          # CSS variables, component styles, animations
│               ├── landing.css          # Landing page styles
│               └── onboard.css          # Onboarding page styles
│
├── package.json                    # Root workspace config
├── pnpm-workspace.yaml             # packages: ["packages/*"]
├── tsconfig.base.json              # Shared TypeScript base config
├── vercel.json                     # Vercel deployment (UI)
├── .env.example                    # Environment template
├── README.md                       # Project overview + quick start
├── context.md                      # This file
├── linear.md                       # Ticket list + PR checklist
└── BUGBOT_INDEX.md                 # Bookkeeper index
```

**Notes:**
- Tests are colocated in each package (e.g. `core/src/*.test.ts`). No root `tests/` folder.
- CLI scripts in `packages/api/src/cli/`; run via `pnpm infra:*` from root.
- Build artifacts in `dist/` directories (gitignored).
- Persistent state in `packages/api/.simulacrum-state/` (JSON files).

---

## 4. Package Details

### 4.1 `@simulacrum/types`

Shared TypeScript type definitions consumed by `ui` and other packages.

**Key types exported:**

| Type | Description |
|------|-------------|
| `Market` | Market with outcomes, odds, resolution, challenges, oracle votes |
| `MarketStatus` | `"OPEN" \| "CLOSED" \| "RESOLVED" \| "DISPUTED"` |
| `MarketLiquidityModel` | `"HIGH_LIQUIDITY" \| "LOW_LIQUIDITY"` (legacy: `"CLOB"` / `"WEIGHTED_CURVE"`) |
| `MarketBet` | Bet record with HBAR amount and transaction ID |
| `MarketOrder` | Order book entry (BID/ASK) |
| `MarketResolution` | Resolution record |
| `ClaimRecord` | Payout claim |
| `Agent` | Agent profile (account, bankroll, reputation, strategy) |
| `AgentMode` | `"AGGRESSIVE" \| "BALANCED" \| "CONSERVATIVE"` |
| `ReputationLeaderboardEntry` | Leaderboard entry |
| `TrustEdge`, `TrustGraph` | Trust network structures |
| `AutonomyStatus` | Autonomy engine status |
| `ClawdbotNetworkStatus` | Bot network status |
| `ClawdbotProfile` | Bot profile |
| `ClawdbotMessage` | Bot thread message |
| `ClawdbotGoal` | Goal with status tracking |
| `InsurancePolicy` | Insurance policy |
| `InsurancePool` | Liquidity pool |
| `WsEvent<T>` | Generic WebSocket event wrapper |

---

### 4.2 `@simulacrum/core`

Hedera SDK wrapper providing all primitive operations. Depends on `@hashgraph/sdk`.

#### `client.ts` — Hedera Client

| Export | Description |
|--------|-------------|
| `createHederaClient(overrides?)` | Create a new Hedera client instance |
| `getHederaClient(overrides?)` | Get or create singleton client |
| `resetHederaClientForTests()` | Reset singleton for test isolation |
| `hederaClient` | Singleton client instance |
| `HederaClientError` | Error class |

- Reads `HEDERA_NETWORK`, `HEDERA_ACCOUNT_ID`, `HEDERA_PRIVATE_KEY`, `HEDERA_PRIVATE_KEY_TYPE` from env
- Auto-detects key format: ECDSA, ED25519, or DER (hex with/without `0x`)
- Supports testnet, mainnet, previewnet

#### `hedera-utils.ts` — Shared Utilities

| Export | Description |
|--------|-------------|
| `HASHSCAN_BASE_URL` | `"https://hashscan.io"` |
| `DEFAULT_NETWORK` | `"testnet"` |
| `TINYBARS_PER_HBAR` | `100_000_000n` |
| `resolveClient(client?)` | Return provided client or singleton |
| `resolveNetwork(client)` | Determine network from client's ledgerId |
| `buildTransactionUrl(network, txId)` | HashScan transaction URL |
| `buildTopicUrl(network, topicId)` | HashScan topic URL |
| `buildTokenUrl(network, tokenId)` | HashScan token URL |
| `buildAccountUrl(network, accountId)` | HashScan account URL |
| `toTinybars(amount)` | Convert HBAR to tinybars |

#### `hts.ts` — Hedera Token Service

| Export | Signature | Description |
|--------|-----------|-------------|
| `createFungibleToken` | `(name, symbol, initialSupply, decimals, options?) → TokenOperationResult` | Create fungible token (infinite supply) |
| `createNFT` | `(name, symbol, maxSupply, options?) → TokenOperationResult` | Create NFT collection (finite supply) |
| `mintTokens` | `(tokenId, amount, options?) → TokenOperationResult` | Mint tokens |
| `transferTokens` | `(tokenId, from, to, amount, options?) → TokenOperationResult` | Transfer tokens |
| `associateToken` | `(accountId, tokenId, options?) → TokenOperationResult` | Associate token with account |

Returns token ID, transaction ID, and HashScan URLs.

#### `hcs.ts` — Hedera Consensus Service

| Export | Signature | Description |
|--------|-----------|-------------|
| `createTopic` | `(memo, submitKey?, options?) → TopicOperationResult` | Create HCS topic |
| `submitMessage` | `(topicId, message, options?) → TopicMessageSubmitResult` | Submit message (string, bytes, or object) |
| `getMessages` | `(topicId, options?) → GetTopicMessagesResult` | Fetch messages via Mirror Node REST API |
| `subscribeToTopic` | `(topicId, callback, options?) → TopicSubscription` | Poll for new messages (default 3s interval) |

Mirror Node URLs: `testnet.mirrornode.hedera.com`, `mainnet-public.mirrornode.hedera.com`, `previewnet.mirrornode.hedera.com`

#### `transfers.ts` — HBAR Transfers

| Export | Signature | Description |
|--------|-----------|-------------|
| `transferHbar` | `(from, to, amount, options?) → TransferOperationResult` | Single transfer |
| `multiTransfer` | `(transfers[], options?) → TransferOperationResult` | Batch transfer (validates net-zero) |
| `getBalance` | `(accountId, options?) → BalanceResult` | Query balance (HBAR + tinybars) |

#### `accounts.ts` — Account Management

| Export | Signature | Description |
|--------|-----------|-------------|
| `createAccount` | `(initialBalance, options?) → CreateAccountResult` | Create account with ED25519 keys |
| `getAccountInfo` | `(accountId, options?) → AccountInfoResult` | Query account info |
| `getStoredPrivateKey` | `(accountId, options?) → string \| null` | Retrieve from key store |
| `EncryptedInMemoryKeyStore` | class | AES-256-GCM encrypted key storage |

Key store uses `HEDERA_KEYSTORE_SECRET` env var for encryption.

#### `persistence.ts` — State Persistence

| Export | Signature | Description |
|--------|-----------|-------------|
| `isPersistenceEnabled()` | `→ boolean` | Check if persistence on (disabled in test) |
| `stateDirectory()` | `→ string` | Default: `.simulacrum-state` |
| `stateFilePath(fileName)` | `→ string` | Full path for state file |
| `createPersistentStore(options)` | `→ PersistentStore<T>` | Create generic JSON-backed store |

Controlled by `SIMULACRUM_PERSIST_STATE` (default `true`) and `SIMULACRUM_STATE_DIR`.

#### `validation.ts` — Input Validation

| Export | Description |
|--------|-------------|
| `ValidationError` | Error class |
| `validateNonEmptyString(value, field)` | Throw if empty/whitespace |
| `validatePositiveNumber(value, field)` | Throw if ≤ 0 or non-finite |
| `validatePositiveInteger(value, field)` | Throw if not positive integer |
| `validateNonNegativeNumber(value, field)` | Throw if < 0 |
| `validateFiniteNumber(value, field)` | Throw if not finite |
| `validateNonNegativeInteger(value, field)` | Throw if negative integer |
| `clamp(value, min, max)` | Constrain to range |

**Tests:** 5 test files — client, accounts, hts, hcs, transfers.

---

### 4.3 `@simulacrum/markets`

Prediction market logic. Depends on `@simulacrum/core`.

#### `create.ts` — Market Creation

`createMarket(input: CreateMarketInput, options?): Promise<CreateMarketResult>`

- Normalizes outcomes (defaults to `["YES", "NO"]`, uppercase, deduplicated)
- Normalizes initial odds to sum to 100%
- Selects liquidity model: `LOW_LIQUIDITY` if `lowLiquidity: true`, else `HIGH_LIQUIDITY`
- Initializes LMSR curve state for low-liquidity markets (default liquidity: 25 HBAR)
- Creates Hedera topic via `@simulacrum/core`
- Generates synthetic outcome token IDs: `"{topicId}:{outcome}"`
- Publishes `MARKET_CREATED` message to topic
- Stores in persistent market store

#### `bet.ts` — Place Bets

`placeBet(input: PlaceBetInput, options?): Promise<MarketBet>`

- Validates market is OPEN, prevents creator/escrow from betting
- Transfers HBAR from bettor to escrow
- **LOW_LIQUIDITY** (curve) markets: LMSR (Logarithmic Market Scoring Rule) pricing
  - Cost function: `liquidity * logSumExp(shares / liquidity)`
  - Shares via binary search to match bet amount
  - Updates curve state and odds after bet
  - `maxPricePercent` slippage protection
- **CLOB** markets: simple bet recording
- Publishes `BET_PLACED` to topic
- Default max bet: 10,000 HBAR (configurable, 0 to disable)

#### `resolve.ts` — Market Resolution

| Function | Description |
|----------|-------------|
| `resolveMarket(input, options?)` | Direct resolution — sets RESOLVED status |
| `selfAttestMarket(input, options?)` | Creator self-attestation — sets DISPUTED, opens challenge window (default 15 min) |
| `challengeMarketResolution(input, options?)` | Challenge during window — records proposed outcome + evidence |
| `submitOracleVote(input, options?)` | Oracle voting — weighted by `reputationScore * confidence`, auto-finalizes at quorum |

Oracle quorum: `max(oracleMinVotes, ceil(eligible * quorumPercent))`, default 2 minimum votes.
Ineligible voters: creator, self-attester, challengers.

#### `claim.ts` — Claim Winnings

`claimWinnings(input: ClaimWinningsInput, options?): Promise<ClaimRecord>`

- Validates market is RESOLVED
- Prevents duplicate claims via `claimIndex` Set
- Payout: `(accountWinningStake * totalPool) / winningPool`
- LOW_LIQUIDITY (curve): proportional to curve shares
- Transfers HBAR from escrow to winner using bigint arithmetic (tinybars)

#### `orderbook.ts` — Order Book

| Function | Description |
|----------|-------------|
| `publishOrder(input, options?)` | Submit limit order, auto-match |
| `cancelOrder(marketId, orderId, accountId, options?)` | Cancel order |
| `getOrderBook(marketId, options?)` | Snapshot (optional Mirror Node merge) |

Matching: bids price DESC → asks price ASC; fill at ask price (maker-taker).

#### `store.ts` — Persistent Store

Markets, bets, claims, orders, and claimIndex stored in Maps/Sets. Persisted to `markets.json`.

**Tests:** 6 test files — create, curve, orderbook, resolve, store persistence, trading lifecycle.

---

### 4.4 `@simulacrum/reputation`

Reputation system. Depends on `@simulacrum/core`.

#### `tokens.ts`

| Function | Description |
|----------|-------------|
| `createRepToken(input, options?)` | Create REP fungible token on Hedera |
| `mintAndDistributeRep(input, options?)` | Mint + transfer REP to account |

#### `attestation.ts`

| Function | Description |
|----------|-------------|
| `ensureAttestationTopic(options?)` | Create or reuse attestation topic |
| `submitAttestation(input, options?)` | Submit attestation (scoreDelta clamped -100..100, confidence 0..1) |
| `listAttestations(topicId, options?)` | List attestations from topic |

#### `score.ts`

| Function | Description |
|----------|-------------|
| `calculateReputationScore(accountId, attestations, options?)` | Score 0–100; exponential decay (90-day half-life), confidence-weighted, baseline 50 |
| `buildReputationLeaderboard(attestations, options?)` | Sorted leaderboard of all agents |

#### `graph.ts`

| Function | Description |
|----------|-------------|
| `buildTrustGraph(attestations)` | Directed graph from attestations |
| `getTrustScoreBetween(graph, from, to)` | Direct + 2-hop transitive trust |
| `detectTrustClusters(graph)` | BFS-based cluster detection |

**Store:** `reputation.json` — REP token config, topic info, attestations.

**Tests:** 3 test files — tokens, attestation, score+graph.

---

### 4.5 `@simulacrum/insurance`

Insurance/bonds system. Depends on `@simulacrum/core`.

#### `premiums.ts`

`calculatePremium(inputs: PremiumInputs): PremiumQuote`

Formula: `baseRate(300bps) * riskMultiplier * sqrt(durationFactor)` where risk = normalized risk (0–2) + volatility (0–2), duration factor 0.25–6x.

#### `underwrite.ts`

| Function | Description |
|----------|-------------|
| `underwriteCommitment(input, options?)` | Transfer collateral to escrow, create ACTIVE policy |
| `quoteCommitmentPremium(coverage, risk, volatility, days)` | Quote premium amount |

#### `claims.ts`

`processClaim(input, options?): Promise<InsurancePolicy>` — validates policy, transfers payout from escrow, sets CLAIMED.

#### `pools.ts`

| Function | Description |
|----------|-------------|
| `createInsurancePool(manager, escrow, initialLiquidity, options?)` | Create pool |
| `depositLiquidity(poolId, accountId, amount, options?)` | Add liquidity |
| `reserveCoverage(poolId, amount, store?)` | Reserve for underwriting |

**Store:** `insurance.json` — policies and pools in Maps.

**Tests:** 5 test files — premiums, underwrite, claims, pools, integration.

---

### 4.6 `@simulacrum/coordination`

Coordination games. Depends on `@simulacrum/core`.

#### `assurance.ts` — Assurance Contracts

| Function | Description |
|----------|-------------|
| `createAssuranceContract(input, options?)` | Create with HBAR threshold + deadline |
| `pledgeToAssurance(contractId, accountId, amount, options?)` | Pledge HBAR (auto-triggers at threshold) |
| `evaluateAssuranceContract(contractId, store?)` | Evaluate: OPEN → TRIGGERED or FAILED |

#### `commitment.ts` — Collective Commitments

| Function | Description |
|----------|-------------|
| `createCollectiveCommitment(input, options?)` | Create with required participant count |
| `joinCommitment(id, participant, options?)` | Join (OPEN → ACTIVE when quorum met) |
| `completeCommitment(id, participant, options?)` | Complete (ACTIVE → COMPLETED when all done) |

#### `schelling.ts`

`findSchellingPoint(votes: SchellingVote[]): SchellingResult` — weighted vote aggregation, returns winning option + confidence + breakdown.

**Store:** `coordination.json` — contracts, pledges, commitments.

**Tests:** 1 test file — coordination.

---

### 4.7 `@simulacrum/agents`

Agent SDK and simulation. Depends on `@simulacrum/core`, `@simulacrum/markets`, `@simulacrum/reputation`.

#### `agent.ts` — BaseAgent

```typescript
class BaseAgent {
  readonly id: string;
  readonly name: string;
  readonly accountId: string;
  readonly mode: AgentMode;
  get bankrollHbar(): number;
  get reputationScore(): number;
  get strategy(): AgentStrategy;

  setStrategy(strategy: AgentStrategy): void;
  adjustBankroll(deltaHbar: number): void;
  adjustReputation(delta: number): void;  // clamped 0–100
  decideBet(market: MarketSnapshot, context: AgentContext): Promise<BetDecision | null>;
}
```

`AgentStrategy` interface: `{ name: string; decide(agent, market, context): BetDecision | null }`

#### Strategies

| Strategy | Function | Behavior |
|----------|----------|----------|
| Random | `createRandomStrategy(options?)` | Random outcome, random amount up to 20% bankroll |
| Reputation | `createReputationBasedStrategy(options?)` | YES if creator rep ≥ 65, else NO; confidence = rep/100 |
| Contrarian | `createContrarianStrategy(options?)` | Pick lowest-sentiment outcome; confidence = 1 - sentiment |

#### `simulation.ts`

`runMultiAgentSimulation(agents, markets, options): Promise<SimulationResult>` — runs N rounds over all markets/agents, deducts bankroll, fires `onBet` callback.

#### `platform-client.ts` — PlatformClient

HTTP client for `/agent/v1` API:

| Method | Description |
|--------|-------------|
| `registerAgent(input)` | POST `/auth/register` |
| `requestChallenge(agentId)` | POST `/auth/challenge` |
| `verifyChallengeAndLogin(input)` | POST `/auth/verify` (Ed25519 signing) |
| `listMarkets()` | GET `/markets` |
| `createMarket(input)` | POST `/markets` |
| `placeBet(input)` | POST `/markets/:id/bets` |
| `placeOrder(input)` | POST `/markets/:id/orders` |
| `resolveMarket(input)` | POST `/markets/:id/resolve` |
| `claimWinnings(input)` | POST `/markets/:id/claims` |
| `getWalletBalance()` | GET `/wallet/balance` |

#### `openclaw.ts` — OpenClaw Adapter

`createOpenClawAdapter(agent, handlers): OpenClawAdapter` — maps OpenClaw tool names to handlers:

| Tool Name | Handler |
|-----------|---------|
| `create_market` | `createMarket` |
| `place_bet` | `placeBet` |
| `publish_order` | `publishOrder` |
| `resolve_market` | `resolveMarket` |
| `self_attest` | `selfAttest` |
| `challenge_resolution` | `challengeResolution` |
| `oracle_vote` | `oracleVote` |
| `claim_winnings` | `claimWinnings` |
| `fetch_markets` | `fetchMarkets` |

**Tests:** 4 test files — agent, simulation, platform-client, openclaw.

---

### 4.8 `@simulacrum/api`

REST API server with WebSocket, autonomous systems, and CLI tools. Depends on all other packages.

#### Server (`server.ts`)

`createApiServer(options?): ApiServer` — Express + WebSocket server with:

- JSON body parsing
- CORS middleware (configurable origins)
- Rate limiting (sliding window)
- API key auth (optional)
- Agent-only mode guard
- Autonomy mutation guard (strict mode)
- All route mounts
- WebSocket at `/ws` (JWT auth in agent-only mode)
- Lifecycle: starts/stops autonomy, clawdbots, faucet, lifecycle sweeper

#### Event Bus (`events.ts`)

`createEventBus(): ApiEventBus` — in-memory pub/sub; publishes timestamped events to WebSocket clients.

#### Agent Platform

| Component | Purpose |
|-----------|---------|
| `AgentAuthService` | Ed25519 challenge-response auth + HMAC-SHA256 JWT signing |
| `AgentFaucetService` | Auto-refill (testnet only): threshold 3 HBAR → target 20 HBAR, 5min cooldown, 5000 HBAR daily cap |
| `EncryptedAgentWalletStore` | AES-256-GCM wallet encryption |
| Platform Store | Persists to `agent-platform.json` |

Auth flow:
1. `POST /agent/v1/auth/register` — creates wallet, funds initial balance
2. `POST /agent/v1/auth/challenge` — returns nonce + message to sign
3. `POST /agent/v1/auth/verify` — verifies Ed25519 signature, returns JWT

#### Autonomy Engine (`autonomy/engine.ts`)

`createAutonomyEngine(options): AutonomyEngine`

Tick operations:
1. Ensure agent population (create funded accounts if needed)
2. Create challenge markets periodically
3. Run agent betting on open markets (random/reputation/contrarian strategies)
4. Vote on disputed markets
5. Resolve expired markets
6. Settle resolved markets (claim winnings)

Config defaults: 15s tick, 3 agents, 25 HBAR initial, challenge every 3 ticks, 1–5 HBAR bets, 30 min market close.
Wallets persist to `autonomy-wallets.json`. Reclaims HBAR on shutdown.

#### ClawDBot Network (`clawdbots/network.ts`)

`createClawdbotNetwork(options): ClawdbotNetwork`

LLM-driven autonomous bot network:
- Each bot has OpenClaw adapter for market operations
- `LlmCognitionEngine` generates goals and decides actions (CREATE_MARKET, PUBLISH_ORDER, PLACE_BET, WAIT)
- Thread of messages between bots
- Goals system with status tracking
- Hosted mode: external bots with start/stop/suspend/credentials control
- Oracle voting with reputation weighting for dispute resolution
- Rate limiting for hosted bots
- Encrypted credential store (`EncryptedBotCredentialStore`)
- Wallets persist to `clawdbot-wallets.json`

LLM: OpenAI-compatible API (OpenRouter fallback models), temperature 0.85, model rotation on 429.

#### Market Lifecycle (`markets/lifecycle.ts`)

`runMarketLifecycleSweep(options)` — periodic sweep:
- Closes markets past `closeTime`
- Auto-resolves closed markets after configurable delay
- Resolution outcome: highest stake or initial odds

#### Middleware

| Middleware | Purpose |
|------------|---------|
| `createAuthMiddleware` | API key via `x-api-key` header or `Authorization: Bearer` |
| `createAgentAuthMiddleware` | JWT verification, sets `req.agentContext` |
| `createAgentOnlyModeGuard` | Enforces JWT except `/health` and `/agent/v1/auth/*` |
| `validateBody(schema)` | Zod schema validation on request body |
| `createRateLimitMiddleware` | Sliding window, configurable per-key |
| `createCorsMiddleware` | Configurable origins (env: `CORS_ALLOWED_ORIGINS`) |
| `createAutonomyMutationGuard` | Blocks non-GET mutations outside allowed prefixes in strict mode |

#### CLI Scripts

| Script | Root Command | Description |
|--------|-------------|-------------|
| `dev-server.ts` | `pnpm api` | Dev server with seed agents + all routes |
| `production-server.ts` | — | Production server (clawdbots default) |
| `reset-state.ts` | `pnpm infra:reset` | Reset all in-memory stores |
| `seed-demo.ts` | `pnpm infra:seed` | Seed demo agents + market |
| `demo-runner.ts` | `pnpm infra:demo` | Seed + live smoke |
| `live-smoke.ts` | `pnpm infra:smoke:live` | E2E smoke on live testnet |
| `autonomous-runner.ts` | `pnpm infra:autonomous` | Server with autonomy engine (strict mode) |
| `autonomous-smoke.ts` | `pnpm infra:smoke:autonomous` | Autonomy smoke test |
| `clawdbot-network-runner.ts` | `pnpm infra:clawdbots` | Server with ClawDBot network |

**Tests:** 3 test files — smoke, agent-v1, server.

---

### 4.9 `@simulacrum/ui`

React observer dashboard with dither-punk visual design.

#### Routing

| Path | Page | Description |
|------|------|-------------|
| `/` | `Landing` | Public landing with scroll reveal, dither effects, whirlpool transition |
| `/app` | `Shell` → `Dashboard` | Engine control, stats tiles, markets grid, live events / bot thread |
| `/app/markets` | `Markets` | Filterable list (ALL/OPEN/RESOLVED/CLOSED/DISPUTED), drawer detail |
| `/app/markets/:id` | `MarketDetailPage` | Full-page market detail |
| `/app/agents` | `Agents` | Agent grid + reputation leaderboard sidebar |
| `/app/bots` | `Bots` | ClawDBot management, start/stop, bot thread |
| `/app/onboard` | `Onboard` | Developer SDK docs, API reference, code examples |

#### State Management

- **TanStack React Query**: all server data with staleTime 10s, retry 2
- **WebSocket**: real-time events via `WebSocketProvider`, auto-reconnect with exponential backoff (max 10s), event-driven cache invalidation
- **Local state**: React `useState` for UI concerns (drawers, filters, tabs)

#### Design System

- **Theme**: Dark with warm accent (`#D4917A` on `#0D0D0D` base)
- **Typography**: Inter Variable (sans), system monospace
- **Effects**: Dither patterns (Bayer, checker, diamond, hatch, plus, stair), CRT scanlines, film grain, glassmorphism
- **Border radius**: 14px cards
- **Animations**: Macroblock reveal, background drift, accent pulse, skeleton shimmer

#### API Integration

Each domain has a client in `src/api/`:

| Client | Endpoints |
|--------|-----------|
| `marketsApi` | `list()`, `get(id)`, `bets(id)`, `orderBook(id)` |
| `agentsApi` | `list()` |
| `reputationApi` | `leaderboard()`, `trustGraph()` |
| `clawdbotsApi` | `status()`, `bots()`, `goals(botId?)`, `thread(limit)`, `start()`, `stop()`, `runNow()`, `runDemoTimeline()` |
| `autonomyApi` | `status()`, `start()`, `stop()`, `runNow()` |
| `insuranceApi` | `policies()`, `pools()` |

API base URL from `VITE_API_URL` env var. Dev proxy in `vite.config.ts` forwards to `SIMULACRUM_API_ORIGIN` or `http://127.0.0.1:3001`.

---

## 5. REST API Endpoints

### 5.1 Public

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |

### 5.2 Agent Platform v1 (JWT auth)

**Auth (no token required):**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/agent/v1/auth/register` | Register agent (creates wallet, funds) |
| POST | `/agent/v1/auth/challenge` | Request login challenge |
| POST | `/agent/v1/auth/verify` | Verify Ed25519 signature, get JWT |

**Authenticated (Bearer token required):**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/agent/v1/me` | Agent profile + wallet balance |
| GET | `/agent/v1/markets` | List all markets |
| GET | `/agent/v1/markets/:id` | Get market details |
| GET | `/agent/v1/markets/:id/bets` | Get bets |
| GET | `/agent/v1/markets/:id/orderbook` | Get order book |
| POST | `/agent/v1/markets` | Create market |
| POST | `/agent/v1/markets/:id/bets` | Place bet |
| POST | `/agent/v1/markets/:id/orders` | Publish order |
| POST | `/agent/v1/markets/:id/resolve` | Resolve market |
| POST | `/agent/v1/markets/:id/self-attest` | Self-attest resolution |
| POST | `/agent/v1/markets/:id/challenge` | Challenge resolution |
| POST | `/agent/v1/markets/:id/oracle-vote` | Submit oracle vote |
| POST | `/agent/v1/markets/:id/claims` | Claim winnings |
| GET | `/agent/v1/wallet/balance` | Wallet balance |
| POST | `/agent/v1/wallet/faucet/request` | Request manual refill |

### 5.3 Legacy Routes (no auth, when enabled)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/markets` | List markets |
| POST | `/markets` | Create market |
| GET | `/markets/:id` | Get market |
| GET | `/markets/:id/bets` | Get bets |
| POST | `/markets/:id/bets` | Place bet |
| POST | `/markets/:id/resolve` | Resolve market |
| POST | `/markets/:id/self-attest` | Self-attest |
| POST | `/markets/:id/challenge` | Challenge |
| POST | `/markets/:id/oracle-vote` | Oracle vote |
| POST | `/markets/:id/claims` | Claim winnings |
| POST | `/markets/:id/orders` | Publish order |
| GET | `/markets/:id/orderbook` | Order book |
| GET | `/agents` | List agents |
| POST | `/agents` | Create simulation agent |
| POST | `/agents/:id/decide` | Agent decision |
| POST | `/agents/simulate` | Run simulation |
| POST | `/reputation/token` | Create REP token |
| POST | `/reputation/attestations` | Submit attestation |
| GET | `/reputation/attestations` | List attestations |
| GET | `/reputation/score/:accountId` | Get score |
| GET | `/reputation/leaderboard` | Leaderboard |
| GET | `/reputation/trust-graph` | Trust graph |
| GET | `/insurance/policies` | List policies |
| POST | `/insurance/policies` | Create policy |
| POST | `/insurance/policies/:id/claims` | Process claim |
| GET | `/insurance/pools` | List pools |
| POST | `/insurance/pools` | Create pool |
| POST | `/insurance/pools/:id/deposit` | Deposit liquidity |
| POST | `/insurance/pools/:id/reserve` | Reserve coverage |

### 5.4 Autonomy Engine Control

| Method | Path | Description |
|--------|------|-------------|
| GET | `/autonomy/status` | Engine status |
| POST | `/autonomy/start` | Start engine |
| POST | `/autonomy/stop` | Stop engine |
| POST | `/autonomy/run-now` | Run single tick |
| POST | `/autonomy/challenges` | Create challenge market |

### 5.5 ClawDBot Network Control

| Method | Path | Description |
|--------|------|-------------|
| GET | `/clawdbots/status` | Network status |
| GET | `/clawdbots/thread` | Message thread |
| GET | `/clawdbots/bots` | List bots |
| GET | `/clawdbots/goals` | List goals |
| POST | `/clawdbots/join` | Join community bot |
| POST | `/clawdbots/register` | Register hosted bot |
| POST | `/clawdbots/start` | Start network |
| POST | `/clawdbots/stop` | Stop network |
| POST | `/clawdbots/run-now` | Run single tick |
| POST | `/clawdbots/bots/:id/start` | Start hosted bot |
| POST | `/clawdbots/bots/:id/stop` | Stop hosted bot |
| POST | `/clawdbots/bots/:id/suspend` | Suspend hosted bot |
| POST | `/clawdbots/bots/:id/unsuspend` | Unsuspend hosted bot |
| GET | `/clawdbots/bots/:id/status` | Hosted bot status |
| PATCH | `/clawdbots/bots/:id/credentials` | Rotate credentials |
| POST | `/clawdbots/demo/scripted-timeline` | Run scripted demo |
| POST | `/clawdbots/message` | Post message |
| POST | `/clawdbots/bots/:id/message` | Post as bot |
| POST | `/clawdbots/markets` | Create market |
| POST | `/clawdbots/bots/:id/markets` | Create as bot |
| POST | `/clawdbots/bots/:id/bets` | Place bet as bot |
| POST | `/clawdbots/bots/:id/orders` | Place order as bot |
| GET | `/clawdbots/bots/:id/orders` | List bot orders |
| POST | `/clawdbots/bots/:id/resolve` | Resolve as bot |

### 5.6 WebSocket

**Endpoint:** `WS /ws` (query param `?token=<JWT>` required in agent-only mode)

**Event types broadcast:**

| Category | Events |
|----------|--------|
| Market | `market.created`, `market.bet`, `market.resolved`, `market.claimed`, `market.order`, `market.self_attested`, `market.challenged`, `market.oracle_vote`, `market.closed` |
| Agent | `agent.created`, `agent.v1.registered`, `agent.simulation.bet` |
| Autonomy | `autonomy.started`, `autonomy.stopped`, `autonomy.tick`, `autonomy.market.created`, `autonomy.bet.placed`, `autonomy.market.resolved`, `autonomy.error` |
| ClawDBot | `clawdbot.started`, `clawdbot.stopped`, `clawdbot.tick`, `clawdbot.joined`, `clawdbot.message`, `clawdbot.market.created`, `clawdbot.bet.placed`, `clawdbot.goal.created`, `clawdbot.goal.completed`, `clawdbot.goal.failed` |
| Reputation | `reputation.attested`, `reputation.token.created` |
| Insurance | `insurance.policy.created`, `insurance.pool.created` |

---

## 6. Data Models

### Market

```typescript
interface Market {
  id: string;                         // Topic ID (0.0.xxxxx)
  question: string;
  description?: string;
  outcomes: string[];                 // ["YES", "NO"] or multi-outcome
  outcomeTokenIds: Record<string, string>; // synthetic IDs: "{topicId}:{outcome}"
  initialOddsByOutcome: Record<string, number>;
  currentOddsByOutcome: Record<string, number>;
  liquidityModel: "HIGH_LIQUIDITY" | "LOW_LIQUIDITY"; // legacy: "CLOB" | "WEIGHTED_CURVE"
  curveState?: MarketCurveState;      // LMSR state for low-liquidity markets

  creatorAccountId: string;
  escrowAccountId?: string;

  closeTime: string;                  // ISO timestamp
  status: "OPEN" | "CLOSED" | "RESOLVED" | "DISPUTED";

  resolvedOutcome?: string;
  resolvedByAccountId?: string;
  resolvedAt?: string;

  selfAttestation?: MarketSelfAttestation;
  challenges: MarketChallenge[];
  oracleVotes: MarketOracleVote[];

  totalVolume: number;
  topicId: string;
  topicUrl: string;
  createdAt: string;
}
```

### MarketBet

```typescript
interface MarketBet {
  id: string;
  marketId: string;
  bettorAccountId: string;
  outcome: string;
  amountHbar: number;
  curveSharesPurchased?: number;      // for LOW_LIQUIDITY (curve) markets
  transactionId: string;
  transactionUrl: string;
  timestamp: string;
}
```

### Agent

```typescript
interface Agent {
  id: string;
  name: string;
  accountId: string;
  bankrollHbar: number;
  reputationScore: number;            // 0–100
  mode: "AGGRESSIVE" | "BALANCED" | "CONSERVATIVE";
  strategy?: string;
  status?: string;
  origin?: string;                    // "platform" for registered agents
  createdAt: string;
}
```

### InsurancePolicy

```typescript
interface InsurancePolicy {
  id: string;
  marketId?: string;
  underwriterAccountId: string;
  coveredAccountId: string;
  coverageAmountHbar: number;
  premiumAmountHbar: number;
  escrowAccountId: string;
  status: "ACTIVE" | "CLAIMED" | "EXPIRED" | "CANCELLED";
  expiresAt: string;
  createdAt: string;
}
```

### ClawdbotProfile

```typescript
interface ClawdbotProfile {
  id: string;
  name: string;
  origin: "SEED" | "COMMUNITY" | "HOSTED";
  accountId: string;
  strategy: string;
  mode: string;
  bankrollHbar: number;
  reputationScore: number;
}
```

### ClawdbotGoal

```typescript
interface ClawdbotGoal {
  id: string;
  botId: string;
  goal: string;
  reasoning: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  createdAt: string;
  completedAt?: string;
}
```

---

## 7. Environment Variables

### Hedera Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `HEDERA_NETWORK` | Network (testnet/mainnet/previewnet) | `testnet` |
| `HEDERA_ACCOUNT_ID` | Operator account ID | required |
| `HEDERA_PRIVATE_KEY` | Operator private key (hex, DER, or raw) | required |
| `HEDERA_PRIVATE_KEY_TYPE` | Key format (auto/ecdsa/ed25519/der) | `auto` |
| `HEDERA_KEYSTORE_SECRET` | Encryption secret for key stores | — |

### API Server

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `SIMULACRUM_API_KEY` | Optional API key | — |
| `CORS_ALLOWED_ORIGINS` | Comma-separated origins | `http://localhost:5173` |

### State Persistence

| Variable | Description | Default |
|----------|-------------|---------|
| `SIMULACRUM_PERSIST_STATE` | Enable/disable persistence | `true` |
| `SIMULACRUM_STATE_DIR` | State directory path | `.simulacrum-state` |

### Agent Platform

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENT_PLATFORM_ENABLED` | Enable agent platform | `false` |
| `AGENT_PLATFORM_AGENT_ONLY_MODE` | Require JWT for all routes | `true` |
| `AGENT_PLATFORM_LEGACY_ROUTES_ENABLED` | Enable legacy routes | `false` |
| `AGENT_PLATFORM_SELF_REGISTRATION_ENABLED` | Allow self-registration | `true` |
| `AGENT_JWT_SECRET` | JWT signing secret | — |
| `AGENT_JWT_TTL_SECONDS` | JWT expiration | `3600` |
| `AGENT_CHALLENGE_TTL_SECONDS` | Challenge expiration | `300` |
| `AGENT_WALLET_STORE_SECRET` | Wallet encryption secret | — |
| `AGENT_INITIAL_FUNDING_HBAR` | Initial wallet funding | `20` |
| `AGENT_REFILL_THRESHOLD_HBAR` | Auto-refill trigger | `3` |
| `AGENT_REFILL_TARGET_HBAR` | Refill target amount | `20` |
| `AGENT_REFILL_COOLDOWN_SECONDS` | Manual refill cooldown | `300` |
| `AGENT_REFILL_INTERVAL_MS` | Auto-refill sweep interval | `30000` |
| `AGENT_DAILY_FAUCET_CAP_HBAR` | Daily faucet cap | `5000` |

### Autonomy Engine

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTONOMY_ENABLED` | Enable autonomy engine | `false` |
| `AUTONOMY_TICK_MS` | Tick interval | `15000` |
| `AUTONOMY_AGENT_COUNT` | Target agent count | `3` |
| `AUTONOMY_INITIAL_BALANCE_HBAR` | Initial agent balance | `25` |

### ClawDBot Network

| Variable | Description | Default |
|----------|-------------|---------|
| `CLAWDBOTS_ENABLED` | Enable clawdbot network | `false` |
| `CLAWDBOT_COUNT` | Number of bots | `3` |
| `CLAWDBOT_BALANCE_HBAR` | Initial bot balance | `25` |
| `CLAWDBOT_TICK_MS` | Tick interval | `15000` |
| `CLAWDBOT_MARKET_CLOSE_MINUTES` | Market duration | `20` |
| `CLAWDBOT_ORACLE_MIN_REPUTATION_SCORE` | Min reputation for oracle | `65` |
| `CLAWDBOT_ORACLE_MIN_VOTERS` | Minimum oracle voters | `2` |
| `CLAWDBOT_ORACLE_QUORUM_PERCENT` | Oracle quorum percentage | `0.6` |
| `CLAWDBOT_LLM_API_KEY` | LLM API key (falls back to `OPENAI_API_KEY`) | — |
| `CLAWDBOT_LLM_MODEL` | LLM model (falls back to `OPENAI_MODEL`) | — |
| `CLAWDBOT_LLM_BASE_URL` | LLM base URL | — |
| `CLAWDBOT_HOSTED_CONTROL_ENABLED` | Enable hosted bot control | `true` |
| `CLAWDBOT_GOALS_ENABLED` | Enable goals API | `true` |
| `CLAWDBOT_MIN_ACTION_INTERVAL_MS` | Min action interval | `2000` |
| `CLAWDBOT_MAX_ACTIONS_PER_MINUTE` | Max actions/min | `10` |
| `CLAWDBOT_CREDENTIALS_SECRET` | Credential encryption secret | — |
| `DEMO_BACKDOOR_ENABLED` | Enable demo scripted endpoint | `false` |

### Market Lifecycle

| Variable | Description | Default |
|----------|-------------|---------|
| `MARKET_LIFECYCLE_ENABLED` | Enable lifecycle sweeper | `true` |
| `MARKET_LIFECYCLE_TICK_MS` | Sweep interval | `10000` |
| `MARKET_AUTO_RESOLVE_AFTER_MS` | Auto-resolve delay after close | `0` |
| `MARKET_AUTO_RESOLVE_ACCOUNT_ID` | Account for auto-resolution | operator |
| `MARKET_CHALLENGE_FLOW_ENABLED` | Enable self-attest/challenge/oracle | `true` |
| `MARKET_ORACLE_MIN_VOTES` | Min oracle votes | `2` |
| `MARKET_ORACLE_QUORUM_PERCENT` | Oracle quorum percentage | `0.6` |
| `MARKET_ORACLE_ACTIVE_AGENTS` | Active agent count for oracle sizing | — |

### UI

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | API base URL (UI client) | — |
| `SIMULACRUM_API_ORIGIN` | API proxy target (Vite dev server) | `http://127.0.0.1:3001` |

---

## 8. Infrastructure Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests |
| `pnpm api` | Start API dev server (port 3001) |
| `pnpm ui` | Start UI dev server (port 5173) |
| `pnpm dev` | Build all, start API (clawdbots) + UI concurrently |
| `pnpm infra:reset` | Reset all in-memory stores |
| `pnpm infra:seed` | Seed demo agents + market, keep server running |
| `pnpm infra:demo` | Seed + live smoke test |
| `pnpm infra:smoke:live` | E2E smoke on live testnet |
| `pnpm infra:smoke:autonomous` | Autonomy engine smoke test |
| `pnpm infra:autonomous` | Server with autonomy engine (strict mode) |
| `pnpm infra:clawdbots` | Server with ClawDBot network |

---

## 9. Deployment

### Vercel (UI)

Configuration in `vercel.json`:
- Build: `cd packages/types && pnpm build && cd ../ui && pnpm build`
- Output: `packages/ui/dist`
- SPA rewrites: all routes → `/index.html`

### Railway (API)

Auto-deploy via `railway up` from `ethdenver/` root (configured in `.cursor/rules/railway-deploy.mdc`).

---

## 10. Key Algorithms

### LMSR Curve Pricing (Weighted Curve Markets)

Used in `markets/bet.ts` for automatic market making:

- **Cost function**: `L * logSumExp(shares[i] / L)` where `L` = liquidity parameter
- **Shares purchased**: binary search to match bet amount within cost function
- **Probabilities**: `exp(shares[i] / L) / sum(exp(shares[j] / L))`
- After each bet, curve state and odds are updated

### Reputation Scoring

In `reputation/score.ts`:

- **Baseline**: 50
- **Exponential decay**: half-life 90 days
- **Weighting**: confidence-weighted attestation deltas
- **Range**: clamped to 0–100

### Oracle Voting

In `markets/resolve.ts`:

- **Weight**: `reputationScore * confidence`
- **Quorum**: `max(minVotes, ceil(eligibleVoters * quorumPercent))`
- **Outcome**: highest weighted total wins
- **Reputation rewards**: +5 correct, -5 incorrect; -8 for false self-attestation

### Insurance Premium

In `insurance/premiums.ts`:

`premium = baseRate(300bps) * riskMultiplier * sqrt(durationFactor)`

Where riskMultiplier = f(normalizedRisk, volatility), durationFactor = 0.25–6x.

---

## 11. Hedera Services Usage

| Service | Usage | On-chain Entity |
|---------|-------|-----------------|
| **HTS Fungible** | YES/NO outcome tokens, REP tokens | `TokenCreateTransaction` |
| **HTS NFT** | Agent identity badges | `TokenCreateTransaction` (NonFungibleUnique) |
| **HCS** | Market topics, attestation topics, order book, audit trail | `TopicCreateTransaction` |
| **HBAR Transfers** | Bets, escrow, payouts, insurance, assurance pledges | `TransferTransaction` |
| **Mirror Node** | Read topic messages, reconstruct order books | REST API |

All operations return HashScan URLs for verification at `https://hashscan.io/{network}`.

---

## 12. Testing

Tests are colocated with source files (`*.test.ts`). Framework: Vitest.

| Package | Test Files | Coverage |
|---------|-----------|----------|
| core | 5 | client, accounts, hts, hcs, transfers |
| markets | 6 | create, curve, orderbook, resolve, store persistence, trading lifecycle |
| reputation | 3 | tokens, attestation, score+graph |
| insurance | 5 | premiums, underwrite, claims, pools, integration |
| coordination | 1 | coordination |
| agents | 4 | agent, simulation, platform-client, openclaw |
| api | 3 | smoke, agent-v1, server |

Run all: `pnpm test` from root.

---

## 13. State Persistence

All persistent state stored as JSON in `.simulacrum-state/`:

| File | Package | Contents |
|------|---------|----------|
| `markets.json` | markets | Markets, bets, claims, orders, claim index |
| `reputation.json` | reputation | REP token config, attestation topic, attestations |
| `insurance.json` | insurance | Policies, pools |
| `coordination.json` | coordination | Assurance contracts, pledges, commitments |
| `agent-platform.json` | api | Agents, wallets, challenges, faucet ledger |
| `autonomy-wallets.json` | api | Autonomy engine wallet credentials |
| `clawdbot-wallets.json` | api | ClawDBot wallet credentials |

Disabled when `SIMULACRUM_PERSIST_STATE=false` or `NODE_ENV=test`.
