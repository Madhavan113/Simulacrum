import type { ClawdbotMessage } from '../api/types'

export function ThreadMessage({ msg }: { msg: ClawdbotMessage }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2">
        {msg.botName && (
          <span className="label text-xs" style={{ color: 'var(--accent)' }}>{msg.botName}</span>
        )}
        <span className="font-mono text-xs" style={{ color: 'var(--text-dim)' }}>
          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{msg.text}</span>
    </div>
  )
}
