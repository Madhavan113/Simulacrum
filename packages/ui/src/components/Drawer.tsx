import { useEffect, type ReactNode } from 'react'

interface DrawerProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  width?: number
}

export function Drawer({ open, onClose, children, width = 480 }: DrawerProps) {
  // Close on Escape — only when drawer is open
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Detail panel"
        className="fixed right-0 top-0 h-screen z-50 flex flex-col border-l"
        style={{
          width,
          background: 'var(--bg-surface)',
          borderColor: 'var(--border)',
          transform: 'translateX(0)',
          transition: 'transform 0.25s linear',
        }}
      >
        {/* Content */}
        <div className="flex flex-col h-full overflow-y-auto">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 label"
            style={{ fontSize: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}
            aria-label="Close drawer"
          >
            ESC
          </button>
          {children}
        </div>
      </div>
    </>
  )
}
