import type { ResearchAgentProfile, PublicationStatus } from '@simulacrum/types'
import { RESEARCH_FOCUS_SHORT_LABELS } from '@simulacrum/types'

const STAGES: { key: PublicationStatus | 'IDLE'; label: string }[] = [
  { key: 'IDLE',          label: 'IDLE' },
  { key: 'COLLECTING',    label: 'COLLECT' },
  { key: 'ANALYZING',     label: 'ANALYZE' },
  { key: 'HYPOTHESIZING', label: 'HYPOTHESIZE' },
  { key: 'DRAFTING',      label: 'DRAFT' },
  { key: 'REVIEWING',     label: 'REVIEW' },
  { key: 'EVALUATING',    label: 'EVALUATE' },
  { key: 'PUBLISHED',     label: 'PUBLISH' },
]

const N = STAGES.length - 1

const FOCUS_HUES: Record<string, number> = {
  agential_game_theory: 30,
  reputation_systems: 45,
  agent_coordination: 170,
  market_microstructure: 210,
  oracle_reliability: 0,
  agent_native_economics: 270,
}

function stagePct(idx: number): string {
  return `${(idx / N) * 100}%`
}

function agentStageIndex(agent: ResearchAgentProfile): number {
  if (!agent.currentStage) return 0
  const idx = STAGES.findIndex((s) => s.key === agent.currentStage)
  return idx >= 0 ? idx : 0
}

function AgentLane({ agent }: { agent: ResearchAgentProfile }) {
  const stageIdx = agentStageIndex(agent)
  const hue = FOCUS_HUES[agent.focusArea] ?? 30
  const isIdle = stageIdx === 0
  const isTerminal = STAGES[stageIdx]?.key === 'PUBLISHED'
  const isActive = !isIdle && !isTerminal
  const hasPublished = agent.publicationCount > 0
  const shortName = RESEARCH_FOCUS_SHORT_LABELS[agent.focusArea] ?? agent.focusArea.slice(0, 6)

  return (
    <div style={{ display: 'flex', alignItems: 'center', height: 28 }}>
      {/* Label */}
      <div style={{ width: 100, flexShrink: 0, paddingRight: 8 }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: isIdle && !hasPublished ? 'var(--text-dim)' : `hsl(${hue}, 45%, 60%)`,
            transition: 'color 0.4s ease',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: 'block',
          }}
        >
          {shortName}
        </span>
      </div>

      {/* Track area — all children use stagePct() for positioning */}
      <div style={{ flex: 1, position: 'relative', height: 28 }}>
        {/* Background rail */}
        <div style={{ position: 'absolute', top: '50%', left: stagePct(0), right: `${100 - (N / N) * 100}%`, height: 1, background: 'var(--border)', transform: 'translateY(-50%)' }} />

        {/* Colored fill from stage 0 to current stage */}
        {stageIdx > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: stagePct(0),
              width: stagePct(stageIdx),
              height: 2,
              background: `linear-gradient(90deg, hsl(${hue}, 30%, 30%), hsl(${hue}, 50%, 50%))`,
              transform: 'translateY(-50%)',
              transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
              borderRadius: 1,
              boxShadow: isActive ? `0 0 8px hsl(${hue}, 50%, 50%, 0.3)` : 'none',
            }}
          />
        )}

        {/* Tick marks at each stage */}
        {STAGES.map((_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: stagePct(i),
              top: '50%',
              width: 1,
              height: 6,
              background: i <= stageIdx && stageIdx > 0 ? `hsl(${hue}, 35%, 40%)` : 'var(--border)',
              transform: 'translate(-50%, -50%)',
              transition: 'background 0.4s ease',
            }}
          />
        ))}

        {/* Dot */}
        <div
          style={{
            position: 'absolute',
            left: stagePct(stageIdx),
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: isIdle
              ? hasPublished ? `hsl(${hue}, 30%, 35%)` : 'var(--text-dim)'
              : isTerminal ? 'var(--accent)' : `hsl(${hue}, 55%, 55%)`,
            border: `2px solid ${isIdle
              ? hasPublished ? `hsl(${hue}, 20%, 25%)` : 'var(--border)'
              : `hsl(${hue}, 40%, 35%)`}`,
            boxShadow: isActive
              ? `0 0 10px hsl(${hue}, 55%, 55%, 0.5)`
              : isTerminal ? '0 0 10px rgba(212,145,122,0.4)' : 'none',
            animation: isActive ? 'accent-pulse 2s ease-in-out infinite' : 'none',
            transition: 'left 0.8s cubic-bezier(0.4, 0, 0.2, 1), background 0.4s, box-shadow 0.4s, border-color 0.4s',
            zIndex: 2,
          }}
        />

        {/* Active stage label above dot */}
        {!isIdle && (
          <span
            style={{
              position: 'absolute',
              left: stagePct(stageIdx),
              top: 0,
              transform: 'translateX(-50%)',
              fontSize: 7,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: `hsl(${hue}, 40%, 55%)`,
              whiteSpace: 'nowrap',
              transition: 'left 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
              zIndex: 3,
            }}
          >
            {STAGES[stageIdx]?.label}
          </span>
        )}
      </div>
    </div>
  )
}

export function PipelineTheater({ agents }: { agents: ResearchAgentProfile[] }) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '14px 24px 10px',
      }}
    >
      {/* Column headers — same coordinate system as tracks */}
      <div style={{ display: 'flex', height: 14 }}>
        <div style={{ width: 100, flexShrink: 0 }} />
        <div style={{ flex: 1, position: 'relative' }}>
          {STAGES.map((stage, i) => (
            <span
              key={stage.key}
              className="label"
              style={{
                position: 'absolute',
                left: stagePct(i),
                transform: 'translateX(-50%)',
                fontSize: 7,
                letterSpacing: '0.12em',
                color: 'var(--text-dim)',
                whiteSpace: 'nowrap',
              }}
            >
              {stage.label}
            </span>
          ))}
        </div>
      </div>

      {/* Lanes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
        {agents.map((agent) => (
          <AgentLane key={agent.id} agent={agent} />
        ))}
      </div>

      {agents.length === 0 && (
        <p className="label" style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-dim)', padding: 12 }}>
          No active research agents
        </p>
      )}
    </div>
  )
}
