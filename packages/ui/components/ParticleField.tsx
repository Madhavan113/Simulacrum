'use client'

import { useRef, useMemo, useEffect, MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { humanSilhouette, dnaHelix, chainLinks } from '../lib/shapes'

const PARTICLE_COUNT = 45000
const PARTICLES_PER_ZONE = Math.floor(PARTICLE_COUNT / 8)

const ZONES = [
  { type: 'human' as const, pos: [-2.2,  1.0,  0.0] as [number,number,number], phase: 0.10, scale: 0.90 },
  { type: 'dna'   as const, pos: [ 0.0,  0.8, -0.3] as [number,number,number], phase: 0.25, scale: 0.85 },
  { type: 'human' as const, pos: [ 2.2,  1.0,  0.0] as [number,number,number], phase: 0.20, scale: 0.90 },
  { type: 'chain' as const, pos: [-1.8, -0.3,  0.2] as [number,number,number], phase: 0.40, scale: 0.80 },
  { type: 'dna'   as const, pos: [ 1.8, -0.3,  0.2] as [number,number,number], phase: 0.35, scale: 0.85 },
  { type: 'human' as const, pos: [-2.2, -1.6,  0.0] as [number,number,number], phase: 0.55, scale: 0.85 },
  { type: 'chain' as const, pos: [ 0.0, -1.6, -0.3] as [number,number,number], phase: 0.65, scale: 0.80 },
  { type: 'human' as const, pos: [ 2.2, -1.6,  0.0] as [number,number,number], phase: 0.50, scale: 0.85 },
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
    // Gaussian wave peak as wave front passes, then settles at 75%
    float wave    = exp(-pow((uWaveFront - aZonePhase) * 10.0, 2.0));
    float settled = smoothstep(aZonePhase - 0.05, aZonePhase + 0.2, uWaveFront) * 0.75;
    float p = clamp(wave + settled, 0.0, 1.0);

    // Per-particle stagger within zone
    float stagger = aOffset * 0.3;
    p = clamp((p - stagger) / (1.0 - stagger), 0.0, 1.0);
    p = p * p * (3.0 - 2.0 * p);

    // Brownian drift in chaos state
    float chaos = 1.0 - p;
    vec3 drift = vec3(
      sin(uTime * 0.47 + aRandom.x * 9.3),
      cos(uTime * 0.31 + aRandom.y * 7.7),
      sin(uTime * 0.53 + aRandom.z * 11.1)
    ) * 0.25 * chaos;

    // Living fuzz on formed shapes
    vec3 fuzz = vec3(
      sin(uTime * 1.3 + aRandom.x * 4.1),
      cos(uTime * 0.9 + aRandom.y * 3.7),
      sin(uTime * 1.1 + aRandom.z * 5.3)
    ) * 0.07 * p;

    vec3 pos = mix(aRandom + drift, aTarget + fuzz, p);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

    float baseSize = aSize * (1.0 + 0.3 * p);
    gl_PointSize = baseSize * (150.0 / max(-mvPosition.z, 0.1));
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

  useEffect(() => {
    return () => { geometry.dispose() }
  }, [geometry])

  useFrame((state) => {
    if (!materialRef.current) return
    materialRef.current.uniforms.uTime.value      = state.clock.elapsedTime
    materialRef.current.uniforms.uWaveFront.value = progressRef.current
  })

  return (
    <points geometry={geometry} frustumCulled={false}>
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
