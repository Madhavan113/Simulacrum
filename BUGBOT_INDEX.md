# Bugbot Index — Simulacrum Project

**Role:** Bookkeeper and PR verification agent.  
**Scope:** ~24k lines across `ethdenver/packages/*`.  
**Goal:** Index the project against the documented spec and verify incoming changes are PR-approved.

---

## 1. Project Spec Sources (canonical)

| Document | Purpose |
|----------|---------|
| `ethdenver/context.md` | Architecture, ticket acceptance criteria, data models, dev rules, backend log |
| `ethdenver/linear.md` | Ticket list (CORE-001 → DEMO-003), PR checklist, branch/commit format, parallel strategy |
| `ethdenver/README.md` | User-facing overview, quick start, infra commands |
| `AUDIT_REPORT.md` (repo root) | Codebase audit; use for quality context, not spec |

**When verifying a change:** Always check that it aligns with the relevant ticket in `context.md` and that the PR satisfies `linear.md` § "PR Checklist".

---

## 2. Package → Key Files (index)

| Package | Key source files (entrypoints / domain) |
|---------|----------------------------------------|
| **core** | `client.ts`, `hts.ts`, `hcs.ts`, `transfers.ts`, `accounts.ts`, `persistence.ts`, `validation.ts`, `index.ts` |
| **markets** | `create.ts`, `bet.ts`, `resolve.ts`, `claim.ts`, `orderbook.ts`, `store.ts`, `types.ts`, `index.ts` |
| **reputation** | `tokens.ts`, `attestation.ts`, `score.ts`, `graph.ts`, `store.ts`, `types.ts`, `index.ts` |
| **insurance** | `underwrite.ts`, `claims.ts`, `premiums.ts`, `pools.ts`, `store.ts`, `types.ts`, `index.ts` |
| **coordination** | `assurance.ts`, `commitment.ts`, `schelling.ts`, `store.ts`, `types.ts`, `index.ts` |
| **agents** | `agent.ts`, `platform-client.ts`, `simulation.ts`, `openclaw.ts`, `strategies/*.ts`, `index.ts` |
| **api** | `server.ts`, `events.ts`, `index.ts`; `routes/*.ts`; `middleware/*.ts`; `agent-platform/*`, `autonomy/engine.ts`, `clawdbots/*`, `markets/lifecycle.ts`, `cli/*` |
| **ui** | `App.tsx`, `main.tsx`; `pages/*.tsx`; `components/**/*.tsx`; `hooks/*.ts`; `api/*.ts`; `utils/odds.ts`, `lib/dither.ts` |
| **types** | `index.ts` (shared types only) |

Tests are colocated: `*.test.ts` / `*.test.tsx` next to source. No root `tests/` folder.

---

## 3. Ticket ID → Package & primary files

Use this to decide which part of the spec applies to a given change.

| Ticket | Package | Primary files |
|--------|---------|----------------|
| CORE-001 | core | `client.ts` |
| CORE-002 | core | `hts.ts` |
| CORE-003 | core | `hcs.ts` |
| CORE-004 | core | `transfers.ts` |
| CORE-005 | core | `accounts.ts` |
| MARKET-001 | markets | `create.ts` |
| MARKET-002 | markets | `bet.ts` |
| MARKET-003 | markets | `resolve.ts` |
| MARKET-004 | markets | `claim.ts` |
| MARKET-005 | markets | `orderbook.ts` |
| REP-001 | reputation | `tokens.ts` |
| REP-002 | reputation | `attestation.ts` |
| REP-003 | reputation | `score.ts` |
| REP-004 | reputation | `graph.ts` |
| INS-001 | insurance | `underwrite.ts` |
| INS-002 | insurance | `claims.ts` |
| INS-003 | insurance | `premiums.ts` |
| COORD-001 | coordination | `assurance.ts` |
| COORD-002 | coordination | `commitment.ts` |
| AGENT-001 | agents | `agent.ts` |
| AGENT-002 | agents | `strategies/*.ts` |
| AGENT-003 | agents | `simulation.ts` |
| AGENT-004 | agents | `openclaw.ts` |
| API-001 | api | `server.ts`, `routes/*` |
| API-002 | api | `routes/markets.ts`, `routes/market-helpers.ts` |
| API-003 | api | `routes/agents.ts`, `routes/agent-v1.ts` |
| API-004 | api | `routes/reputation.ts` |
| API-005 | api | `events.ts`, WebSocket in `server.ts` |
| UI-001 | ui | Vite/React/Tailwind setup, `vite.config.ts`, `tailwind.config.ts` |
| UI-002 | ui | `pages/Dashboard.tsx` |
| UI-003 | ui | `components/MarketCard.tsx`, `pages/MarketDetail.tsx` (drawer) |
| UI-004 | ui | `components/AgentCard.tsx`, `pages/Agents.tsx` |
| UI-005 | ui | `components/ActivityFeed.tsx` |
| UI-006 | ui | `components/TrustGraph.tsx` |
| UI-007 | ui | `components/HashScanLink.tsx` |
| DEMO-001 | scripts / api | `api/src/cli/demo-runner.ts`, `infra:demo` |
| DEMO-002 | — | Video (human) |
| DEMO-003 | — | README, docs |

---

## 4. PR-approved definition (from linear.md)

A change is **PR-approved** only if all of the following hold:

### 4.1 Mechanical

- [ ] **Build:** `pnpm build` succeeds from repo root (`ethdenver/`).
- [ ] **Tests:** `pnpm test` passes.
- [ ] **Lint:** `pnpm lint` passes (no errors).

### 4.2 Spec and conventions

- [ ] **Ticket scope:** Changes touch only files that belong to the claimed ticket(s) (see §3). Cross-package edits must be justified (e.g. new export in dependency).
- [ ] **Acceptance criteria:** For the ticket(s) in scope, the acceptance criteria in `context.md` are met (or explicitly deferred with a note).
- [ ] **HashScan:** If the ticket involves on-chain operations, HashScan links (token/topic/transaction) are documented where applicable (e.g. in PR description or ticket).
- [ ] **Exports:** If new public API is added, `context.md` (and any AGENT_CONTEXT / export doc) is updated so agents know what’s available.

### 4.3 Branch and commits (when using Linear workflow)

- [ ] **Branch:** `feature/<TICKET-ID>-<short-description>` (e.g. `feature/MARKET-002-place-bet`).
- [ ] **Commits:** `[<TICKET-ID>] <type>: <description>` with types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.

---

## 5. How to verify a change (bugbot workflow)

1. **Identify scope**
   - From branch name or PR title, infer ticket ID(s) (e.g. CORE-002, MARKET-001).
   - From §3, determine package(s) and primary files.

2. **Mechanical check**
   - Run from `ethdenver/`: `pnpm build`, `pnpm test`, `pnpm lint`.
   - If any fails → **not PR-approved** until fixed.

3. **Spec alignment**
   - Open `context.md` for the ticket(s); confirm each acceptance criterion is satisfied by the changed code (or explicitly deferred).
   - Confirm no unrelated files are modified unless justified (e.g. `core/index.ts` for new exports).

4. **Conventions**
   - If new exports: confirm `context.md` (or export doc) updated.
   - If Hedera operations: confirm HashScan links documented where applicable.

5. **Verdict**
   - All of §4 satisfied → **PR-approved**.
   - Otherwise → list what’s missing and mark **not PR-approved**.

---

## 6. Quick reference: infra commands

From repo root or `ethdenver/`:

- `pnpm build` — build all packages  
- `pnpm test` — run all tests  
- `pnpm lint` — lint  
- `pnpm infra:reset` — reset in-memory state  
- `pnpm infra:seed` — seed demo agents + market  
- `pnpm infra:smoke:live` — live E2E smoke  
- `pnpm infra:smoke:autonomous` — autonomy smoke  
- `pnpm infra:autonomous` — autonomous runner  
- `pnpm infra:clawdbots` — ClawDBot network runner  

Use these when verifying that a change doesn’t break infra or demo flows.

---

## 7. Updating this index

- When new packages or top-level modules are added, update §2 and §3.
- When new tickets are added to `linear.md` / `context.md`, add a row to §3 and extend §4 if conventions change.
- Keep §1 (spec sources) and §4 (PR checklist) in sync with `linear.md` and `context.md`.

Last updated: 2026-02-18 (initial index from context.md + linear.md + repo layout).
