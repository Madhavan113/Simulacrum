# AgentBets - Linear Ticket Templates

Use these templates when creating tickets in Linear for parallel agent development.

---

## 🎫 Feature Ticket Template

```markdown
## Overview
[One paragraph describing what this feature does]

## Package
`packages/[package-name]`

## Files to Create/Modify
- `src/[filename].ts` - [description]
- `src/[filename].ts` - [description]

## Dependencies
- [ ] TICKET-XXX (must be merged first)
- [ ] TICKET-YYY (must be merged first)

## Acceptance Criteria
- [ ] [Specific, testable requirement]
- [ ] [Specific, testable requirement]
- [ ] [Specific, testable requirement]
- [ ] Unit tests pass
- [ ] HashScan URLs generated for all transactions

## Technical Notes
[Any specific implementation details, gotchas, or references]

## HashScan Verification
After implementation, add links here:
- Token: 
- Topic: 
- Transaction: 
```

---

## 📋 All Tickets (Copy to Linear)

### 🔴 Priority 1: Core Infrastructure (Day 1)

| ID | Title | Package | Depends On | Est |
|----|-------|---------|------------|-----|
| CORE-001 | Hedera Client Initialization | core | - | 1h |
| CORE-002 | HTS Token Operations | core | CORE-001 | 2h |
| CORE-003 | HCS Topic Operations | core | CORE-001 | 2h |
| CORE-004 | HBAR Transfer Operations | core | CORE-001 | 1h |
| CORE-005 | Account Management | core | CORE-001 | 1.5h |

### 🟠 Priority 2: Markets (Day 1-2)

| ID | Title | Package | Depends On | Est |
|----|-------|---------|------------|-----|
| MARKET-001 | Create Market | markets | CORE-002, CORE-003 | 3h |
| MARKET-002 | Place Bet | markets | MARKET-001, CORE-004 | 2h |
| MARKET-003 | Resolve Market | markets | MARKET-001, CORE-003 | 2h |
| MARKET-004 | Claim Winnings | markets | MARKET-003, CORE-002, CORE-004 | 2h |
| MARKET-005 | Order Book (HCS-based) | markets | CORE-003 | 3h |

### 🟡 Priority 3: Reputation (Day 2)

| ID | Title | Package | Depends On | Est |
|----|-------|---------|------------|-----|
| REP-001 | REP Token Creation | reputation | CORE-002 | 1h |
| REP-002 | Attestations (HCS) | reputation | CORE-003 | 2h |
| REP-003 | Score Calculation | reputation | REP-001, REP-002 | 2h |
| REP-004 | Trust Graph | reputation | REP-002 | 2h |

### 🟢 Priority 4: Insurance (Day 2-3)

| ID | Title | Package | Depends On | Est |
|----|-------|---------|------------|-----|
| INS-001 | Underwrite Commitment | insurance | MARKET-001, CORE-004 | 2h |
| INS-002 | Process Claims | insurance | INS-001, MARKET-003 | 2h |
| INS-003 | Premium Calculations | insurance | INS-001 | 1h |

### 🔵 Priority 5: Coordination (Day 3)

| ID | Title | Package | Depends On | Est |
|----|-------|---------|------------|-----|
| COORD-001 | Assurance Contracts | coordination | CORE-003, CORE-004 | 3h |
| COORD-002 | Collective Commitments | coordination | COORD-001 | 2h |

### 🟣 Priority 6: Agents (Day 3)

| ID | Title | Package | Depends On | Est |
|----|-------|---------|------------|-----|
| AGENT-001 | Base Agent Class | agents | All core + markets | 2h |
| AGENT-002 | Trading Strategies | agents | AGENT-001 | 2h |
| AGENT-003 | Multi-Agent Simulation | agents | AGENT-001, AGENT-002 | 3h |
| AGENT-004 | OpenClaw Integration | agents | AGENT-001 | 2h |

### ⚫ Priority 7: API (Day 3-4)

| ID | Title | Package | Depends On | Est |
|----|-------|---------|------------|-----|
| API-001 | Express Server Setup | api | - | 1h |
| API-002 | Markets Routes | api | MARKET-* | 2h |
| API-003 | Agents Routes | api | AGENT-001 | 1h |
| API-004 | Reputation Routes | api | REP-* | 1h |
| API-005 | WebSocket Events | api | API-001 | 2h |

### ⬜ Priority 8: UI (Day 4-5)

| ID | Title | Package | Depends On | Est |
|----|-------|---------|------------|-----|
| UI-001 | Project Setup (Vite/React/Tailwind) | ui | - | 1h |
| UI-002 | Dashboard Page | ui | API-* | 3h |
| UI-003 | Market Components | ui | UI-001 | 2h |
| UI-004 | Agent Components | ui | UI-001 | 2h |
| UI-005 | Activity Feed (Real-time) | ui | API-005 | 2h |
| UI-006 | Reputation Graph Viz | ui | UI-001, REP-004 | 3h |
| UI-007 | HashScan Link Components | ui | UI-001 | 1h |

### 🎬 Priority 9: Demo (Day 5)

| ID | Title | Package | Depends On | Est |
|----|-------|---------|------------|-----|
| DEMO-001 | Two Agents Betting Script | scripts | AGENT-003 | 2h |
| DEMO-002 | Demo Video Recording | - | DEMO-001, UI-* | 3h |
| DEMO-003 | README Polish | - | All | 2h |

---

## 🔀 Parallel Execution Strategy

```
DAY 1:
├── Agent A: CORE-001 → CORE-002 → CORE-003
├── Agent B: (wait for CORE-001) → CORE-004 → CORE-005
└── Agent C: UI-001 (no deps, can start immediately)

DAY 2:
├── Agent A: MARKET-001 → MARKET-002
├── Agent B: REP-001 → REP-002 → REP-003
├── Agent C: MARKET-003 → MARKET-004
└── Agent D: UI-003 → UI-007

DAY 3:
├── Agent A: INS-001 → INS-002
├── Agent B: COORD-001 → COORD-002
├── Agent C: AGENT-001 → AGENT-002
└── Agent D: API-001 → API-002 → API-003

DAY 4:
├── Agent A: AGENT-003 (simulation)
├── Agent B: API-004 → API-005
├── Agent C: UI-002 → UI-004
└── Agent D: UI-005 → UI-006

DAY 5:
├── Agent A: DEMO-001 (script)
├── Agent B: DEMO-003 (README)
├── Agent C: UI polish + bug fixes
└── Human: DEMO-002 (video recording)
```

---

## 🏷️ Labels for Linear

Create these labels:
- `core` - Core Hedera infrastructure
- `markets` - Prediction market logic
- `reputation` - Reputation system
- `insurance` - Insurance/bonds
- `coordination` - Coordination games
- `agents` - Agent SDK
- `api` - REST API
- `ui` - Frontend
- `demo` - Demo/presentation
- `priority-1` through `priority-9`
- `blocked` - Waiting on dependency
- `in-progress` - Being worked on
- `ready-for-review` - PR submitted
- `testnet-verified` - Tested on Hedera testnet

---

## 📝 PR Checklist

Before submitting PR:
- [ ] Code compiles (`pnpm build`)
- [ ] Tests pass (`pnpm test`)
- [ ] No lint errors (`pnpm lint`)
- [ ] HashScan links work (if applicable)
- [ ] Updated AGENT_CONTEXT.md if adding new exports
- [ ] Branch named correctly: `feature/TICKET-ID-description`
- [ ] Commit messages follow format: `[TICKET-ID] type: description`