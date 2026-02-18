'use client'

import { useEffect, useRef, useState, MutableRefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ParticleField } from './ParticleField'
import { GrainOverlay } from './GrainOverlay'

gsap.registerPlugin(ScrollTrigger)

function CameraRig({ progressRef }: { progressRef: MutableRefObject<number> }) {
  useFrame(({ camera, clock }) => {
    const p = Math.min(Math.max(progressRef.current, 0), 1)
    const t = clock.elapsedTime
    // Push in: z from 7 → 4.5
    camera.position.z = 7 - p * 2.5
    // Subtle handheld sway — diminishes as forms crystallize
    const sway = 1 - p * 0.6
    camera.position.x = Math.sin(t * 0.13) * 0.3 * sway
    camera.position.y = Math.cos(t * 0.09) * 0.2 * sway
    camera.lookAt(0, 0, 0)
  })
  return null
}

export default function HeroVoid() {
  const containerRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef(0)
  const [textOpacity, setTextOpacity] = useState(0)

  useEffect(() => {
    if (!containerRef.current) return

    const trigger = ScrollTrigger.create({
      trigger: containerRef.current,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1.2,
      onUpdate: (self) => {
        progressRef.current = self.progress
        // Text fades in during last 15% of scroll
        const textProgress = Math.max(0, (self.progress - 0.85) / 0.15)
        setTextOpacity(textProgress)
      },
    })

    return () => {
      trigger.kill()
    }
  }, [])

  return (
    <div ref={containerRef} style={{ height: '500vh', position: 'relative' }}>
      <div
        style={{
          position: 'sticky',
          top: 0,
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          background: '#000',
        }}
      >
        <Canvas
          camera={{ position: [0, 0, 7], fov: 60, near: 0.1, far: 100 }}
          dpr={typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1}
          gl={{
            antialias: false,
            alpha: false,
            powerPreference: 'high-performance',
          }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <color attach="background" args={['#000000']} />
          <CameraRig progressRef={progressRef} />
          <ParticleField progressRef={progressRef} />
        </Canvas>

        {/* Title overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 10,
            opacity: textOpacity,
            transition: 'opacity 0.1s linear',
          }}
        >
          <h1
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'clamp(2.4rem, 5vw, 5rem)',
              fontWeight: 300,
              letterSpacing: '0.08em',
              color: '#fff',
              textTransform: 'uppercase',
            }}
          >
            AgentBets
          </h1>
        </div>

        <GrainOverlay />
      </div>
    </div>
  )
}
