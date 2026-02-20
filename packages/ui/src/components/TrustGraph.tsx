import * as d3 from 'd3'
import { useEffect, useRef } from 'react'
import type { TrustGraph } from '../api/types'

interface TrustGraphProps {
  graph: TrustGraph
  width?: number
  height?: number
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  weight: number
  attestations: number
}

export function TrustGraphViz({ graph, width = 320, height = 280 }: TrustGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || graph.nodes.length === 0) return

    const styles = getComputedStyle(svg)
    const colorAccent = styles.getPropertyValue('--accent').trim() || '#D4917A'
    const colorBgRaised = styles.getPropertyValue('--bg-raised').trim() || '#1A1A1A'
    const colorTextMuted = styles.getPropertyValue('--text-muted').trim() || '#6B6460'

    const el = d3.select(svg)
    el.selectAll('*').remove()

    const nodes: SimNode[] = graph.nodes.map((id: string) => ({ id }))
    const links: SimLink[] = graph.edges.map((e: { from: string; to: string; weight: number; attestations: number }) => ({
      source: e.from,
      target: e.to,
      weight: e.weight,
      attestations: e.attestations,
    }))

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink<SimNode, SimLink>(links).id(d => d.id).distance(60))
      .force('charge', d3.forceManyBody().strength(-80))
      .force('center', d3.forceCenter(width / 2, height / 2))

    const link = el.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', colorAccent)
      .attr('stroke-opacity', d => Math.min(0.8, 0.2 + Math.abs(d.weight) * 0.6))
      .attr('stroke-width', d => Math.max(0.5, Math.min(2, d.attestations * 0.4)))

    const node = el.append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', 5)
      .attr('fill', colorBgRaised)
      .attr('stroke', colorAccent)
      .attr('stroke-width', 1)

    const label = el.append('g')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .text(d => d.id.slice(0, 8))
      .attr('font-size', 8)
      .attr('font-family', 'monospace')
      .attr('fill', colorTextMuted)
      .attr('text-anchor', 'middle')
      .attr('dy', -8)

    sim.on('tick', () => {
      link
        .attr('x1', d => (d.source as SimNode).x ?? 0)
        .attr('y1', d => (d.source as SimNode).y ?? 0)
        .attr('x2', d => (d.target as SimNode).x ?? 0)
        .attr('y2', d => (d.target as SimNode).y ?? 0)

      node
        .attr('cx', d => d.x ?? 0)
        .attr('cy', d => d.y ?? 0)

      label
        .attr('x', d => d.x ?? 0)
        .attr('y', d => d.y ?? 0)
    })

    return () => { sim.stop() }
  }, [graph, width, height])

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      style={{ background: 'var(--bg-raised)', borderRadius: 8 }}
    />
  )
}
