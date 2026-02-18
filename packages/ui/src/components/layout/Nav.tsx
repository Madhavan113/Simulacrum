import { NavLink } from 'react-router-dom'
import { useWebSocket } from '../../hooks/useWebSocket'
import { DitherPanel } from '../dither/DitherPanel'

const links = [
  { to: '/',        label: 'Dashboard' },
  { to: '/markets', label: 'Markets'   },
  { to: '/agents',  label: 'Agents'    },
]

export function Nav() {
  const { status } = useWebSocket()

  return (
    <nav
      className="fixed left-0 top-0 h-screen flex flex-col border-r border-hair"
      style={{ width: 220, background: 'var(--bg-surface)' }}
    >
      {/* Wordmark */}
      <div className="flex items-center justify-between px-5 py-6">
        <span
          className="label"
          style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--text-primary)' }}
        >
          AGENTBETS
        </span>
        {/* WS status dot */}
        <span
          title={status}
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: status === 'connected' ? 'var(--accent)' : 'var(--text-dim)',
            flexShrink: 0,
          }}
        />
      </div>

      {/* Dither strip */}
      <DitherPanel pattern="bayer4" intensity={0.18} height={4} className="w-full" />

      {/* Nav links */}
      <div className="flex flex-col gap-1 px-3 mt-4 flex-1">
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
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

      {/* Bottom dither strip */}
      <DitherPanel pattern="hatch" intensity={0.12} height={3} className="w-full" />
    </nav>
  )
}
