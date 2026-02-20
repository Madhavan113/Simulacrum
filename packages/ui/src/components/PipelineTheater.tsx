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

const FOCUS_HUES: Record<string, number> = {
  agential_game_theory: 30,
  reputation_systems: 45,
  agent_coordination: 170,
  market_microstructure: 210,
  oracle_reliability: 0,
  agent_native_economics: 270,
}

function agentStageIndex(agent: ResearchAgentProfile): number {
  if (!agent.currentStage) return 0
  const idx = STAGES.findIndex((s) => s.key === agent.currentStage)
  return idx >= 0 ? idx : 0
}

function agentHue(agent: ResearchAgentProfile): number {
  return FOCUS_HUES[agent.focusArea] ?? 30
}

function agentShortName(agent: ResearchAgentProfile): string {
  return RESEARCH_FOCUS_SHORT_LABELS[agent.focusArea] ?? agent.focusArea.slice(0, 5)
}

function AgentDot({
  agent,
  yOffset,
}: {
  agent: ResearchAgentProfile
  yOffset: number
}) {
  const stageIdx = agentStageIndex(agent)
  const hue = agentHue(agent)
  const isIdle = stageIdx === 0
  const isTerminal = STAGES[stageIdx]?.key === 'PUBLISHED'
  const isActive = !isIdle && !isTerminal
  const hasPublished = agent.publicationCount > 0 && isIdle
  const pct = (stageIdx / (STAGES.length - 1)) * 100

  return (
    <div
      style={{
        position: 'absolute',
        left: `${pct}%`,
        top: yOffset,
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        transition: 'left 0.8s cubic-bezier(0.4, 0, 0.2, 1), top 0.3s ease',
        zIndex: 2,
      }}
    >
      {/* Dot */}
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: isIdle
            ? hasPublished ? `hsl(${hue}, 35%, 40%)` : 'var(--text-dim)'
            : isTerminal
              ? 'var(--accent)'
              : `hsl(${hue}, 55%, 55%)`,
          boxShadow: isActive
            ? `0 0 12px hsl(${hue}, 55%, 55%, 0.5)`
            : isTerminal
              ? '0 0 12px rgba(212,145,122,0.4)'
              : 'none',
          animation: isActive ? 'accent-pulse 2s ease-in-out infinite' : 'none',
          border: `2px solid ${isIdle ? (hasPublished ? `hsl(${hue}, 25%, 30%)` : 'var(--border)') : `hsl(${hue}, 40%, 35%)`}`,
          transition: 'background 0.4s ease, box-shadow 0.4s ease, border-color 0.4s ease',
          flexShrink: 0,
        }}
      />
      {/* Label */}
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: isIdle
            ? hasPublished ? `hsl(${hue}, 35%, 55%)` : 'var(--text-dim)'
            : `hsl(${hue}, 45%, 65%)`,
          whiteSpace: 'nowrap',
          transition: 'color 0.4s ease',
        }}
      >
        {agentShortName(agent)}
        {hasPublished && !isActive && (
          <span style={{ color: 'var(--text-dim)', marginLeft: 4, fontWeight: 400 }}>
            {agent.publicationCount}p
          </span>
        )}
      </span>
    </div>
  )
}

export function PipelineTheater({ agents }: { agents: ResearchAgentProfile[] }) {
  const stageGroups = new Map<number, ResearchAgentProfile[]>()
  for (const agent of agents) {
    const idx = agentStageIndex(agent)
    const group = stageGroups.get(idx) ?? []
    group.push(agent)
    stageGroups.set(idx, group)
  }

  const agentYOffsets = new Map<string, number>()
  for (const [, group] of stageGroups) {
    group.forEach((agent, i) => {
      agentYOffsets.set(agent.id, 4 + i * 22)
    })
  }

  const maxActiveIdx = agents.length > 0
    ? Math.max(...agents.map(agentStageIndex))
    : 0

  const totalRows = Math.max(1, ...Array.from(stageGroups.values()).map((g) => g.length))
  const trackHeight = Math.max(36, totalRows * 22 + 12)

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '16px 32px 12px',
        overflow: 'hidden',
      }}
    >
      {/* Stage labels */}
      <div style={{ display: 'flex' }}>
        {STAGES.map((stage) => (
          <div key={stage.key} style={{ flex: 1, textAlign: 'center' }}>
            <span
              className="label"
              style={{ fontSize: 8, letterSpacing: '0.14em', color: 'var(--text-dim)' }}
            >
              {stage.label}
            </span>
          </div>
        ))}
      </div>

      {/* Track */}
      <div style={{ position: 'relative', height: trackHeight, marginTop: 6 }}>
        {/* Rail */}
        <div
          style={{
            position: 'absolute',
            top: 9,
            left: '6.25%',
            right: '6.25%',
            height: 1,
            background: 'var(--border)',
          }}
        />

        {/* Progress glow */}
        {maxActiveIdx > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 9,
              left: '6.25%',
              width: `${(maxActiveIdx / (STAGES.length - 1)) * 87.5}%`,
              height: 1,
              background: 'linear-gradient(90deg, var(--accent-dim), var(--accent))',
              transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: '0 0 6px rgba(212,145,122,0.3)',
            }}
          />
        )}

        {/* Stage tick marks */}
        {STAGES.map((_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${(i / (STAGES.length - 1)) * 100}%`,
              top: 5,
              width: 1,
              height: 9,
              background: i <= maxActiveIdx && maxActiveIdx > 0 ? 'var(--accent-dim)' : 'var(--border)',
              transform: 'translateX(-50%)',
              transition: 'background 0.4s ease',
              zIndex: 1,
            }}
          />
        ))}

        {/* Agent dots */}
        {agents.map((agent) => (
          <AgentDot
            key={agent.id}
            agent={agent}
            yOffset={agentYOffsets.get(agent.id) ?? 4}
          />
        ))}
      </div>

      {agents.length === 0 && (
        <p className="label" style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-dim)' }}>
          No active research agents
        </p>
      )}
    </div>
  )
}
