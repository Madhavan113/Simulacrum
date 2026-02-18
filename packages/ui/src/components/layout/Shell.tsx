import { Outlet } from 'react-router-dom'
import { Nav } from './Nav'

export function Shell() {
  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg-base)', position: 'relative' }}>
      {/* Subtle background texture for the app shell */}
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        opacity: 0.04,
        backgroundImage: 'url(/bg/mosaic.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'contrast(1.5) brightness(0.5)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        background: 'radial-gradient(ellipse 80% 60% at 50% 30%, transparent, var(--bg-base) 70%)',
        pointerEvents: 'none',
      }} />
      <Nav />
      <main className="flex-1" style={{ marginLeft: 220, position: 'relative', zIndex: 1 }}>
        <Outlet />
      </main>
    </div>
  )
}
