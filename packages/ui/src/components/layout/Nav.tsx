import { NavLink } from 'react-router-dom'
import { useWebSocket } from '../../hooks/useWebSocket'

const links = [
  { to: '/app',         label: 'Dashboard' },
  { to: '/app/markets', label: 'Markets'   },
  { to: '/app/agents',  label: 'Agents'    },
  { to: '/app/bots',    label: 'Community Bots'      },
]

export function Nav() {
  const { status } = useWebSocket()

  return (
    <nav
      aria-label="Main navigation"
      className="fixed left-0 top-0 h-screen flex flex-col border-r border-hair"
      style={{ width: 220, background: 'rgba(20,20,20,0.85)', backdropFilter: 'blur(12px)', zIndex: 10 }}
    >
      {/* Wordmark */}
      <div className="flex items-center justify-between px-5 py-6">
        <span
          className="label"
          style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--text-primary)' }}
        >
          SIMULACRUM
        </span>
        {/* WS status dot */}
        <span
          role="status"
          aria-label={`WebSocket ${status}`}
          title={status}
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: status === 'connected' ? 'var(--accent)' : 'var(--text-dim)',
            flexShrink: 0,
          }}
        />
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border)' }} />

      {/* Nav links */}
      <div className="flex flex-col gap-1 px-3 mt-4 flex-1">
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/app'}
            className={({ isActive }) =>
              `flex items-center px-3 py-2 rounded-[8px] text-sm transition-colors ${
                isActive
                  ? 'bg-raised text-primary border-l-2'
                  : 'text-muted hover:text-primary hover:bg-raised'
              }`
            }
            style={({ isActive }) => isActive ? { borderColor: 'var(--accent)' } : {}}
          >
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
