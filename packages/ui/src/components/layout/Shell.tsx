import { Outlet } from 'react-router-dom'
import { Nav } from './Nav'

export function Shell() {
  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg-base)' }}>
      <Nav />
      <main className="flex-1" style={{ marginLeft: 220 }}>
        <Outlet />
      </main>
    </div>
  )
}
