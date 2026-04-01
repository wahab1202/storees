'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { SegmentTransition } from '@/hooks/useAnalytics'

type Props = {
  transitions: SegmentTransition[]
  totalCustomers: number
  height?: number
  onTransitionClick?: (transition: SegmentTransition) => void
}

type Node = {
  id: string
  name: string
  value: number
  x: number
  y: number
  height: number
  side: 'left' | 'right'
  color: string
}

type Link = {
  source: Node
  target: Node
  value: number
  percentage: number
  sourceY: number
  targetY: number
  thickness: number
  transition: SegmentTransition
}

const LEFT_COLORS = [
  '#6366f1', '#8b5cf6', '#a78bfa', '#3b82f6', '#60a5fa',
  '#0ea5e9', '#06b6d4', '#14b8a6', '#94a3b8',
]

const RIGHT_COLORS = [
  '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#84cc16',
  '#f97316', '#6366f1', '#8b5cf6', '#94a3b8',
]

function getSentimentColor(name: string): string | null {
  const lower = name.toLowerCase()
  if (['risk', 'lost', 'dormant', 'churn', 'sleep', 'lapsed'].some(w => lower.includes(w))) return '#ef4444'
  if (['loyal', 'active', 'champion', 'convert', 'high value'].some(w => lower.includes(w))) return '#10b981'
  return null
}

export function SankeyDiagram({ transitions, totalCustomers, height = 400, onTransitionClick }: Props) {
  const { nodes, links } = useMemo(() => {
    if (!transitions.length) return { nodes: [], links: [] }

    const paddingX = 160
    const paddingY = 20
    const nodeWidth = 18
    const nodeGap = 8
    const chartWidth = 600
    const usableHeight = height - paddingY * 2

    // Collect unique source/target segments
    const sourceMap = new Map<string, number>()
    const targetMap = new Map<string, number>()

    for (const t of transitions) {
      const fromKey = t.fromSegmentId || '(none)'
      const toKey = t.toSegmentId || '(none)'
      sourceMap.set(fromKey, (sourceMap.get(fromKey) ?? 0) + t.count)
      targetMap.set(toKey, (targetMap.get(toKey) ?? 0) + t.count)
    }

    // Sort by value descending
    const sourceEntries = [...sourceMap.entries()].sort((a, b) => b[1] - a[1])
    const targetEntries = [...targetMap.entries()].sort((a, b) => b[1] - a[1])

    const sourceTotal = sourceEntries.reduce((s, [, v]) => s + v, 0)
    const targetTotal = targetEntries.reduce((s, [, v]) => s + v, 0)

    // Build nodes
    const allNodes: Node[] = []
    const nodeById = new Map<string, Node>()

    let sy = paddingY
    sourceEntries.forEach(([id, value], i) => {
      const name = transitions.find(t => (t.fromSegmentId || '(none)') === id)?.fromSegmentName ?? id
      const h = Math.max((value / sourceTotal) * (usableHeight - sourceEntries.length * nodeGap), 12)
      const node: Node = {
        id: `source_${id}`,
        name,
        value,
        x: paddingX,
        y: sy,
        height: h,
        side: 'left',
        color: getSentimentColor(name) ?? LEFT_COLORS[i % LEFT_COLORS.length],
      }
      allNodes.push(node)
      nodeById.set(`source_${id}`, node)
      sy += h + nodeGap
    })

    let ty = paddingY
    targetEntries.forEach(([id, value], i) => {
      const name = transitions.find(t => (t.toSegmentId || '(none)') === id)?.toSegmentName ?? id
      const h = Math.max((value / targetTotal) * (usableHeight - targetEntries.length * nodeGap), 12)
      const node: Node = {
        id: `target_${id}`,
        name,
        value,
        x: chartWidth - paddingX,
        y: ty,
        height: h,
        side: 'right',
        color: getSentimentColor(name) ?? RIGHT_COLORS[i % RIGHT_COLORS.length],
      }
      allNodes.push(node)
      nodeById.set(`target_${id}`, node)
      ty += h + nodeGap
    })

    // Build links with stacking offsets
    const sourceOffsets = new Map<string, number>()
    const targetOffsets = new Map<string, number>()

    const allLinks: Link[] = transitions
      .sort((a, b) => b.count - a.count)
      .map(t => {
        const fromKey = t.fromSegmentId || '(none)'
        const toKey = t.toSegmentId || '(none)'
        const source = nodeById.get(`source_${fromKey}`)!
        const target = nodeById.get(`target_${toKey}`)!
        if (!source || !target) return null

        const thickness = Math.max((t.count / Math.max(sourceTotal, 1)) * (usableHeight - sourceEntries.length * nodeGap), 2)
        const sOffset = sourceOffsets.get(source.id) ?? 0
        const tOffset = targetOffsets.get(target.id) ?? 0

        const link: Link = {
          source,
          target,
          value: t.count,
          percentage: t.percentage,
          sourceY: source.y + sOffset,
          targetY: target.y + tOffset,
          thickness,
          transition: t,
        }

        sourceOffsets.set(source.id, sOffset + thickness)
        targetOffsets.set(target.id, tOffset + thickness)

        return link
      })
      .filter(Boolean) as Link[]

    return { nodes: allNodes, links: allLinks }
  }, [transitions, totalCustomers, height])

  if (!nodes.length) return null

  const chartWidth = 600

  return (
    <div className="bg-white border border-border rounded-xl p-6">
      <h2 className="text-sm font-semibold text-heading mb-4">Segment Flow</h2>
      <svg
        viewBox={`0 0 ${chartWidth} ${height}`}
        className="w-full"
        style={{ maxHeight: height }}
      >
        {/* Links */}
        {links.map((link, i) => {
          const x0 = link.source.x + 18
          const x1 = link.target.x
          const midX = (x0 + x1) / 2
          const y0 = link.sourceY + link.thickness / 2
          const y1 = link.targetY + link.thickness / 2

          return (
            <g key={i} className="group">
              <path
                d={`M${x0},${y0} C${midX},${y0} ${midX},${y1} ${x1},${y1}`}
                fill="none"
                stroke={link.source.color}
                strokeWidth={Math.max(link.thickness, 1.5)}
                strokeOpacity={0.25}
                className="transition-all duration-200 group-hover:stroke-opacity-50 cursor-pointer"
                onClick={() => onTransitionClick?.(link.transition)}
              />
              {/* Hover tooltip area */}
              <path
                d={`M${x0},${y0} C${midX},${y0} ${midX},${y1} ${x1},${y1}`}
                fill="none"
                stroke="transparent"
                strokeWidth={Math.max(link.thickness + 8, 12)}
                className="cursor-pointer"
                onClick={() => onTransitionClick?.(link.transition)}
              >
                <title>{`${link.transition.fromSegmentName} → ${link.transition.toSegmentName}: ${link.value} (${link.percentage}%)`}</title>
              </path>
            </g>
          )
        })}

        {/* Nodes */}
        {nodes.map(node => (
          <g key={node.id}>
            <rect
              x={node.side === 'left' ? node.x : node.x}
              y={node.y}
              width={18}
              height={node.height}
              rx={3}
              fill={node.color}
              fillOpacity={0.85}
            />
            {/* Label */}
            <text
              x={node.side === 'left' ? node.x - 6 : node.x + 24}
              y={node.y + node.height / 2}
              textAnchor={node.side === 'left' ? 'end' : 'start'}
              dominantBaseline="middle"
              className="text-[11px] fill-current text-text-primary font-medium"
            >
              {node.name}
            </text>
            {/* Count */}
            <text
              x={node.side === 'left' ? node.x - 6 : node.x + 24}
              y={node.y + node.height / 2 + 13}
              textAnchor={node.side === 'left' ? 'end' : 'start'}
              dominantBaseline="middle"
              className="text-[10px] fill-current text-text-muted"
            >
              {node.value.toLocaleString()}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
