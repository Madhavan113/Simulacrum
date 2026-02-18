const LAYER_STYLE: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
}

export function AnimatedBackground() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        background: '#040406',
      }}
    >
      <div
        style={{
          ...LAYER_STYLE,
          backgroundImage: 'url(/bg/landing.gif)',
          backgroundPosition: 'center',
          backgroundSize: 'cover',
          filter: 'contrast(1.05) saturate(0.82)',
        }}
      />

      <div
        style={{
          ...LAYER_STYLE,
          background: 'linear-gradient(180deg, rgba(7,7,10,0.52) 0%, rgba(7,7,10,0.7) 55%, rgba(4,4,5,0.9) 100%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          ...LAYER_STYLE,
          background: 'radial-gradient(ellipse 62% 48% at 50% 42%, rgba(255,255,255,0.08) 0%, transparent 72%)',
          mixBlendMode: 'screen',
          pointerEvents: 'none',
        }}
      />

      <div className="bg-grain" />
    </div>
  )
}
