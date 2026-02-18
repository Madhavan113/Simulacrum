# Birth of Meaning – Particle Animation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the globe morph in ParticleField with an organic multi-zone animation where particles crystallize from chaos into fuzzy human silhouettes, DNA helices, and chain links as the user scrolls, with the camera slowly pushing in.

**Architecture:** 8 particle zones each own ~5,625 particles and a target shape (human, DNA, or chain). A "meaning wave" (driven by scroll progress) sweeps through zones, causing particles to crystallize. All interpolation is in the GPU vertex shader via a `uWaveFront` uniform. Camera animates inside a `CameraRig` component using `useFrame`.

**Tech Stack:** Next.js 14, React Three Fiber, Three.js, GSAP ScrollTrigger, custom GLSL shaders

---

### Task 1: Create shape generator library

**Files:**
- Create: `packages/ui/lib/shapes.ts`

**Step 1: Create the file with all three generators**

```typescript
// packages/ui/lib/shapes.ts

export function humanSilhouette(
  count: number,
  cx: number, cy: number, cz: number,
  scale: number
): Float32Array {
  const pos = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const r = Math.random()
    let x = 0, y = 0, z = 0
    const noise = () => (Math.random() - 0.5) * 0.06 * scale

    if (r < 0.12) {
      // Head: sphere at top
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const hr = 0.16 * scale
      x = hr * Math.sin(phi) * Math.cos(theta)
      y = 0.68 * scale + hr * Math.cos(phi)
      z = hr * 0.6 * Math.sin(phi) * Math.sin(theta)
    } else if (r < 0.45) {
      // Torso: wider at shoulders, narrower at waist
      const t = Math.random()
      const width = (0.28 - t * 0.08) * scale
      x = (Math.random() - 0.5) * 2 * width
      y = (0.3 - t * 0.5) * scale
      z = (Math.random() - 0.5) * 0.12 * scale
    } else if (r < 0.65) {
      // Arms
      const side = Math.random() < 0.5 ? 1 : -1
      const t = Math.random()
      if (t < 0.5) {
        x = side * (0.3 + t * 0.15) * scale
        y = (0.25 - t * 0.3) * scale
      } else {
        const ft = (t - 0.5) * 2
        x = side * (0.45 - ft * 0.1) * scale
        y = (-0.05 - ft * 0.25) * scale
      }
      z = (Math.random() - 0.5) * 0.08 * scale
    } else if (r < 0.72) {
      // Hips
      x = (Math.random() - 0.5) * 0.36 * scale
      y = (-0.22 + (Math.random() - 0.5) * 0.06) * scale
      z = (Math.random() - 0.5) * 0.12 * scale
    } else {
      // Legs
      const side = Math.random() < 0.5 ? 1 : -1
      const t = Math.random()
      if (t < 0.5) {
        x = side * (0.1 + t * 0.02) * scale
        y = (-0.22 - t * 0.4) * scale
      } else {
        const lt = (t - 0.5) * 2
        x = side * (0.12 - lt * 0.02) * scale
        y = (-0.42 - lt * 0.35) * scale
      }
      z = (Math.random() - 0.5) * 0.08 * scale
    }

    pos[i * 3]     = cx + x + noise()
    pos[i * 3 + 1] = cy + y + noise()
    pos[i * 3 + 2] = cz + z + noise() * 0.5
  }
  return pos
}

export function dnaHelix(
  count: number,
  cx: number, cy: number, cz: number,
  scale: number
): Float32Array {
  const pos = new Float32Array(count * 3)
  const R = 0.28 * scale
  const height = 1.9 * scale
  const turns = 3.5

  for (let i = 0; i < count; i++) {
    const t = Math.random()
    const angle = t * turns * Math.PI * 2
    const y = t * height - height / 2
    const rnd = Math.random()
    const n = (v: number) => v + (Math.random() - 0.5) * 0.04 * scale

    if (rnd < 0.44) {
      // Strand A
      pos[i * 3]     = n(cx + R * Math.cos(angle))
      pos[i * 3 + 1] = n(cy + y)
      pos[i * 3 + 2] = n(cz + R * Math.sin(angle))
    } else if (rnd < 0.88) {
      // Strand B (offset π)
      pos[i * 3]     = n(cx + R * Math.cos(angle + Math.PI))
      pos[i * 3 + 1] = n(cy + y)
      pos[i * 3 + 2] = n(cz + R * Math.sin(angle + Math.PI))
    } else {
      // Crossbars
      const step = Math.round(t * turns * 2)
      const crossAngle = step * Math.PI
      const crossT = Math.random()
      pos[i * 3]     = cx + R * (2 * crossT - 1) * Math.cos(crossAngle)
      pos[i * 3 + 1] = cy + (step / (turns * 2)) * height - height / 2
      pos[i * 3 + 2] = cz + R * (2 * crossT - 1) * Math.sin(crossAngle)
    }
  }
  return pos
}

export function chainLinks(
  count: number,
  cx: number, cy: number, cz: number,
  scale: number
): Float32Array {
  const pos = new Float32Array(count * 3)
  const numLinks = 6
  const R = 0.22 * scale   // ring radius
  const r = 0.055 * scale  // tube radius
  const spacing = R * 1.55

  for (let i = 0; i < count; i++) {
    const linkIdx = Math.floor(Math.random() * numLinks)
    const horizontal = linkIdx % 2 === 0
    const u = Math.random() * Math.PI * 2
    const v = Math.random() * Math.PI * 2
    const tx = (R + r * Math.cos(v)) * Math.cos(u)
    const ty = r * Math.sin(v)
    const tz = (R + r * Math.cos(v)) * Math.sin(u)
    const offset = (linkIdx - (numLinks - 1) / 2) * spacing

    if (horizontal) {
      pos[i * 3]     = cx + offset * 0.7 + tx
      pos[i * 3 + 1] = cy + offset * 0.7 + ty
      pos[i * 3 + 2] = cz + tz
    } else {
      // Rotate 90° for vertical links
      pos[i * 3]     = cx + offset * 0.7 + ty
      pos[i * 3 + 1] = cy + offset * 0.7 + tx
      pos[i * 3 + 2] = cz + tz
    }
  }
  return pos
}
```

**Step 2: Verify dev server still starts**

```bash
cd /Users/madhavanp/Downloads/hederamarkets/ethdenver/packages/ui && pnpm dev
```

Expected: no errors, existing globe animation still shows.

**Step 3: Commit**

```bash
git add packages/ui/lib/shapes.ts
git commit -m "feat: add particle shape generators (human silhouette, DNA helix, chain links)"
```

---

### Task 2: Rewrite ParticleField with multi-zone emergence system

**Files:**
- Modify: `packages/ui/components/ParticleField.tsx`

**Step 1: Replace the full file**

```tsx
'use client'

import { useRef, useMemo, MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { humanSilhouette, dnaHelix, chainLinks } from '../lib/shapes'

const PARTICLE_COUNT = 45000
const PARTICLES_PER_ZONE = Math.floor(PARTICLE_COUNT / 8)

const ZONES = [
  { type: 'human' as const, pos: [-2.2,  1.0,  0.0] as const, phase: 0.10, scale: 0.90 },
  { type: 'dna'   as const, pos: [ 0.0,  0.8, -0.3] as const, phase: 0.25, scale: 0.85 },
  { type: 'human' as const, pos: [ 2.2,  1.0,  0.0] as const, phase: 0.20, scale: 0.90 },
  { type: 'chain' as const, pos: [-1.8, -0.3,  0.2] as const, phase: 0.40, scale: 0.80 },
  { type: 'dna'   as const, pos: [ 1.8, -0.3,  0.2] as const, phase: 0.35, scale: 0.85 },
  { type: 'human' as const, pos: [-2.2, -1.6,  0.0] as const, phase: 0.55, scale: 0.85 },
  { type: 'chain' as const, pos: [ 0.0, -1.6, -0.3] as const, phase: 0.65, scale: 0.80 },
  { type: 'human' as const, pos: [ 2.2, -1.6,  0.0] as const, phase: 0.50, scale: 0.85 },
]

const vertexShader = /* glsl */`
  uniform float uWaveFront;
  uniform float uTime;

  attribute vec3 aRandom;
  attribute vec3 aTarget;
  attribute float aOffset;
  attribute float aZonePhase;
  attribute float aSize;

  varying float vAlpha;

  void main() {
    // Gaussian wave peak as wave front passes this zone, then settles at 75%
    float wave    = exp(-pow((uWaveFront - aZonePhase) * 10.0, 2.0));
    float settled = smoothstep(aZonePhase - 0.05, aZonePhase + 0.2, uWaveFront) * 0.75;
    float p = clamp(wave + settled, 0.0, 1.0);

    // Per-particle stagger within zone
    float stagger = aOffset * 0.3;
    p = clamp((p - stagger) / (1.0 - stagger), 0.0, 1.0);
    p = p * p * (3.0 - 2.0 * p);

    // Brownian drift (chaos state, fades as p increases)
    float chaos = 1.0 - p;
    vec3 drift = vec3(
      sin(uTime * 0.47 + aRandom.x * 9.3),
      cos(uTime * 0.31 + aRandom.y * 7.7),
      sin(uTime * 0.53 + aRandom.z * 11.1)
    ) * 0.25 * chaos;

    // Living fuzz on formed shapes (makes them breathe)
    vec3 fuzz = vec3(
      sin(uTime * 1.3 + aRandom.x * 4.1),
      cos(uTime * 0.9 + aRandom.y * 3.7),
      sin(uTime * 1.1 + aRandom.z * 5.3)
    ) * 0.07 * p;

    vec3 pos = mix(aRandom + drift, aTarget + fuzz, p);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

    float baseSize = aSize * (1.0 + 0.3 * p);
    gl_PointSize = baseSize * (220.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;

    float depthFade = smoothstep(-15.0, -2.0, mvPosition.z);
    vAlpha = (0.2 + 0.8 * p) * depthFade * (0.5 + 0.5 * aSize);
  }
`

const fragmentShader = /* glsl */`
  varying float vAlpha;

  void main() {
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);
    if (dist > 0.5) discard;

    float core = 1.0 - smoothstep(0.0, 0.15, dist);
    float glow = 1.0 - smoothstep(0.15, 0.5, dist);
    float alpha = (core * 0.7 + glow * 0.3) * vAlpha;

    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
  }
`

function generateTargets(): Float32Array {
  const targets = new Float32Array(PARTICLE_COUNT * 3)
  ZONES.forEach((zone, zoneIdx) => {
    const start = zoneIdx * PARTICLES_PER_ZONE
    const count = zoneIdx === ZONES.length - 1
      ? PARTICLE_COUNT - start
      : PARTICLES_PER_ZONE
    const [cx, cy, cz] = zone.pos
    let zonePts: Float32Array
    if (zone.type === 'human') {
      zonePts = humanSilhouette(count, cx, cy, cz, zone.scale)
    } else if (zone.type === 'dna') {
      zonePts = dnaHelix(count, cx, cy, cz, zone.scale)
    } else {
      zonePts = chainLinks(count, cx, cy, cz, zone.scale)
    }
    targets.set(zonePts, start * 3)
  })
  return targets
}

interface ParticleFieldProps {
  progressRef: MutableRefObject<number>
}

export function ParticleField({ progressRef }: ParticleFieldProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)

  const { geometry, uniforms } = useMemo(() => {
    const geo = new THREE.BufferGeometry()

    // Chaos positions: scattered in a volume
    const randomPos = new Float32Array(PARTICLE_COUNT * 3)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const r = 3 + Math.random() * 5
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      randomPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
      randomPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      randomPos[i * 3 + 2] = r * Math.cos(phi)
    }

    const targetPos = generateTargets()

    // Zone phase per particle
    const zonePhases = new Float32Array(PARTICLE_COUNT)
    ZONES.forEach((zone, zoneIdx) => {
      const start = zoneIdx * PARTICLES_PER_ZONE
      const end = zoneIdx === ZONES.length - 1 ? PARTICLE_COUNT : start + PARTICLES_PER_ZONE
      for (let i = start; i < end; i++) zonePhases[i] = zone.phase
    })

    // Stagger offset within each zone (based on chaos distance from origin)
    const offsets = new Float32Array(PARTICLE_COUNT)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const x = randomPos[i * 3], y = randomPos[i * 3 + 1], z = randomPos[i * 3 + 2]
      offsets[i] = Math.min(Math.sqrt(x * x + y * y + z * z) / 8, 1)
    }

    const sizes = new Float32Array(PARTICLE_COUNT)
    for (let i = 0; i < PARTICLE_COUNT; i++) sizes[i] = 0.4 + Math.random() * 1.2

    const dummy = new Float32Array(PARTICLE_COUNT * 3)
    geo.setAttribute('position',   new THREE.BufferAttribute(dummy,      3))
    geo.setAttribute('aRandom',    new THREE.BufferAttribute(randomPos,  3))
    geo.setAttribute('aTarget',    new THREE.BufferAttribute(targetPos,  3))
    geo.setAttribute('aZonePhase', new THREE.BufferAttribute(zonePhases, 1))
    geo.setAttribute('aOffset',    new THREE.BufferAttribute(offsets,    1))
    geo.setAttribute('aSize',      new THREE.BufferAttribute(sizes,      1))

    const u = {
      uWaveFront: { value: 0 },
      uTime:      { value: 0 },
    }

    return { geometry: geo, uniforms: u }
  }, [])

  useFrame((state) => {
    if (!materialRef.current) return
    materialRef.current.uniforms.uTime.value      = state.clock.elapsedTime
    materialRef.current.uniforms.uWaveFront.value = progressRef.current
  })

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}
```

**Step 2: Verify dev server compiles**

```bash
cd /Users/madhavanp/Downloads/hederamarkets/ethdenver/packages/ui && pnpm dev
```

Expected: no TypeScript errors, particle cloud visible at localhost:3000 in chaos state.

**Step 3: Commit**

```bash
git add packages/ui/components/ParticleField.tsx
git commit -m "feat: multi-zone particle emergence with meaning wave shader"
```

---

### Task 3: Add CameraRig and update HeroVoid

**Files:**
- Modify: `packages/ui/components/HeroVoid.tsx`

**Step 1: Replace the full file**

```tsx
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
    const p = progressRef.current
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
        const textProgress = Math.max(0, (self.progress - 0.85) / 0.15)
        setTextOpacity(textProgress)
      },
    })

    return () => { trigger.kill() }
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
          dpr={Math.min(window.devicePixelRatio, 2)}
          gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <color attach="background" args={['#000000']} />
          <CameraRig progressRef={progressRef} />
          <ParticleField progressRef={progressRef} />
        </Canvas>

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
            Simulacrum
          </h1>
        </div>

        <GrainOverlay />
      </div>
    </div>
  )
}
```

**Step 2: Visual verification**

Open localhost:3000 and scroll from top to bottom slowly. Confirm:
- [ ] Camera pushes in as you scroll (scene feels like it grows)
- [ ] Sway at start, calmer at end
- [ ] Particle zones crystallize — top zones first, bottom zones later
- [ ] Human silhouettes recognizable (head, torso, arms, legs)
- [ ] DNA helices show two strands with crossbars
- [ ] Chain links show interlocked ring pattern
- [ ] Grain overlay still visible
- [ ] "Simulacrum" text fades in at the very end

**Step 3: Commit**

```bash
git add packages/ui/components/HeroVoid.tsx
git commit -m "feat: add camera push-in and sway rig for cinematic emergence animation"
```

---

### Task 4: Tuning (if needed after visual check)

**If human silhouettes are hard to read:** In `ParticleField.tsx`, increase `scale` for human zones from `0.90` → `1.1`.

**If DNA is too thin:** Increase `R` in `dnaHelix` from `0.28` → `0.35`.

**If chain links are unclear:** Increase `R` in `chainLinks` from `0.22` → `0.28` and reduce `numLinks` from `6` → `4`.

**If performance drops below 60fps:** Reduce `PARTICLE_COUNT` from `45000` → `30000`.

**Commit tuning changes:**

```bash
git add packages/ui/components/ParticleField.tsx packages/ui/lib/shapes.ts
git commit -m "chore: tune zone scales for visual clarity"
```
