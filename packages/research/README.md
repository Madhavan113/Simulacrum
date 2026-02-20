# @simulacrum/research

Autonomous deep-research agents that observe the Simulacrum prediction market environment and produce rigorous research publications with self-evaluation suites.

## Architecture

```
EventBus (all market events)
        │
        ▼
┌─ DataCollector ──────────────────────────────┐
│  Subscribes to events + hydrates from stores │
│  Produces: ResearchObservation[]             │
└──────────────┬───────────────────────────────┘
               │
               ▼
┌─ DeepResearchAgent (×3, one per focus area) ─┐
│  Filters observations by focus area          │
│  Manages pipeline lifecycle                  │
└──────────────┬───────────────────────────────┘
               │
               ▼
┌─ Publication Pipeline ───────────────────────┐
│  COLLECTING → ANALYZING → HYPOTHESIZING →    │
│  DRAFTING → REVIEWING → EVALUATING →         │
│  PUBLISHED / RETRACTED                       │
│                                              │
│  Each stage = 1 xAI API call (Grok 4.1)     │
└──────────────┬───────────────────────────────┘
               │
               ▼
┌─ Evaluation Suite ───────────────────────────┐
│  60% deterministic (code-verified):          │
│    Reproducibility, Evidence Backing,        │
│    Statistical Significance                  │
│  40% LLM-scored:                             │
│    Novelty, Coherence                        │
│  0% deferred: Predictive Validity            │
└──────────────────────────────────────────────┘
```

## Package Structure

```
src/
├── types.ts               # Internal pipeline types + re-exports from @simulacrum/types
├── xai-engine.ts          # Grok 4.1 fast reasoning API client
├── collector.ts           # Event bus subscription + store hydration
├── observation-window.ts  # Rolling time-window management
├── store.ts               # Persistent state (research.json)
├── research-agent.ts      # DeepResearchAgent class
├── publication-engine.ts  # Multi-step pipeline state machine
├── deterministic-eval.ts  # Code-based verification (3 dimensions)
├── evaluation.ts          # Hybrid scoring merge
├── prompts/
│   ├── analysis.ts        # Observation → pattern extraction
│   ├── hypothesis.ts      # Pattern → testable hypotheses
│   ├── synthesis.ts       # Hypotheses + data → publication draft
│   ├── review.ts          # Self-critique (structured rubric)
│   ├── eval-generation.ts # Generate evaluation criteria
│   └── eval-scoring.ts    # Score novelty + coherence
└── index.ts               # Public exports
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RESEARCH_ENABLED` | `false` | Enable the research engine |
| `RESEARCH_AGENT_COUNT` | `3` | Number of research agents |
| `RESEARCH_TICK_MS` | `60000` | Tick interval (ms) |
| `RESEARCH_PUBLICATION_INTERVAL_TICKS` | `10` | Ticks between publication attempts |
| `RESEARCH_MIN_OBSERVATIONS` | `30` | Min observations before starting analysis |
| `RESEARCH_EVAL_THRESHOLD` | `60` | Min eval score (0-100) to publish |
| `RESEARCH_XAI_API_KEY` | — | xAI API key (required for publications) |
| `RESEARCH_XAI_MODEL` | `grok-4-1-fast-reasoning` | xAI model identifier |
| `RESEARCH_XAI_BASE_URL` | `https://api.x.ai/v1` | xAI API endpoint |
| `RESEARCH_XAI_MAX_RETRIES` | `3` | Max retries on 429/5xx |
| `RESEARCH_XAI_TIMEOUT_MS` | `120000` | Per-call timeout (ms) |

## API Routes

All mounted at `/research`:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/status` | Engine status + active agents |
| `GET` | `/publications` | List publications (filter: `?status=`, `?focusArea=`, `?agentId=`) |
| `GET` | `/publications/:id` | Full publication with evaluation |
| `GET` | `/observations` | Recent observations (`?limit=`, `?offset=`) |
| `GET` | `/agents` | Research agent profiles |
| `POST` | `/start` | Start engine (409 if disabled) |
| `POST` | `/stop` | Stop engine |
| `POST` | `/run-now` | Trigger immediate tick |

## WebSocket Events

| Event | Payload |
|-------|---------|
| `research.started` | `{ agentCount, tickMs }` |
| `research.stopped` | `{ reason }` |
| `research.tick` | `{ tickCount, observationCount, activePipelines }` |
| `research.observation.batch` | `{ count, categories }` |
| `research.pipeline.advanced` | `{ publicationId, agentId, stage, focusArea }` |
| `research.publication.published` | `{ publication }` |
| `research.publication.retracted` | `{ publicationId, reason, score }` |
| `research.evaluation.complete` | `{ publicationId, overallScore, verdict }` |

## Focus Areas

Each research agent specializes in one area:

1. **Agential Game Theory** — payoff asymmetry, Nash distance, strategy mixing
2. **Reputation Systems** — trust clustering, rep-behavior correlation
3. **Market Microstructure** — spread, depth, price impact, information incorporation
4. **Agent Coordination** — timing correlation, implicit signaling, herding
5. **Oracle Reliability** — accuracy rate, dispute rate, resolution latency
6. **Agent-Native Economics** — Gini coefficient, ROI distribution, fee economics

## Troubleshooting

### Engine starts but no publications appear

**Check 1: Enough observations?** The engine needs `RESEARCH_MIN_OBSERVATIONS` (default 30) observations relevant to each agent's focus area before it starts a pipeline. Check `/research/status` — if `totalObservations` is low, wait for more market activity.

**Check 2: xAI API key valid?** Check server logs for `[xai-engine] No API key` warnings. The engine runs without a key but won't produce publications.

**Check 3: Tick count vs publication interval.** Publications only start on tick counts divisible by `RESEARCH_PUBLICATION_INTERVAL_TICKS` (default 10). With 60s ticks, that's every 10 minutes.

### Publications are always RETRACTED

The evaluation threshold (`RESEARCH_EVAL_THRESHOLD`, default 60) might be too high for thin data. Lower it to 40-50 during early runs with few markets.

### xAI calls timing out

Default timeout is 120s. The synthesis call (longest prompt) can take 30-60s on Grok 4.1. If you see timeout errors, increase `RESEARCH_XAI_TIMEOUT_MS`.

### State looks corrupted after a crash

Delete `.simulacrum-state/research.json` and restart. The engine rebuilds agent profiles and hydrates observations from the market/reputation stores. You lose publications but not source data.

### Pipeline stuck in one stage

The engine rolls back all in-progress pipelines to COLLECTING on restart. If a pipeline appears stuck, restart the server — it will clear stale pipelines and start fresh. No xAI calls are wasted because intermediate results aren't persisted.

### "Research engine is disabled" on POST /start

Set `RESEARCH_ENABLED=true` in your `.env` file and restart the server. The engine checks this flag at construction time, not at start time.
