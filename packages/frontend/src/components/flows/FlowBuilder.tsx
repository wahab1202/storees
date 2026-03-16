'use client'

import { useCallback, useRef, useMemo, useState, type DragEvent } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type NodeMouseHandler,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { nodeTypes } from './FlowNodes'
import { NodePalette } from './NodePalette'
import { NodeConfigPanel } from './NodeConfigPanel'
import type { FlowNode, ExitConfig } from '@storees/shared'

type FlowBuilderProps = {
  flowNodes: FlowNode[]
  exitConfig?: ExitConfig | null
  onSave: (nodes: FlowNode[], exitConfig: ExitConfig | null) => void
  saving?: boolean
  domainType?: string
}

// Convert FlowNode[] to React Flow nodes + edges
function flowNodesToReactFlow(flowNodes: FlowNode[]) {
  const nodes: Node[] = []
  const edges: Edge[] = []
  const ySpacing = 120

  flowNodes.forEach((fn, i) => {
    const data: Record<string, unknown> = {}

    if (fn.type === 'trigger' && fn.config) {
      data.event = fn.config.event
    } else if (fn.type === 'delay') {
      data.value = fn.config.value
      data.unit = fn.config.unit
    } else if (fn.type === 'condition') {
      data.check = fn.config.check
      data.event = fn.config.event
      data.field = fn.config.field
    } else if (fn.type === 'action') {
      data.actionType = fn.config.actionType
      data.templateId = fn.config.templateId
    } else if (fn.type === 'end') {
      data.label = fn.label
    }

    nodes.push({
      id: fn.id,
      type: fn.type,
      position: { x: 250, y: i * ySpacing },
      data,
    })

    // Create edges
    if (fn.type === 'condition') {
      if (fn.config.branches.yes) {
        edges.push({
          id: `${fn.id}-yes`,
          source: fn.id,
          target: fn.config.branches.yes,
          sourceHandle: 'yes',
          label: 'Yes',
          style: { stroke: '#22c55e' },
        })
      }
      if (fn.config.branches.no) {
        edges.push({
          id: `${fn.id}-no`,
          source: fn.id,
          target: fn.config.branches.no,
          sourceHandle: 'no',
          label: 'No',
          style: { stroke: '#ef4444' },
        })
      }
    } else if (i < flowNodes.length - 1) {
      edges.push({
        id: `${fn.id}-next`,
        source: fn.id,
        target: flowNodes[i + 1].id,
      })
    }
  })

  return { nodes, edges }
}

// Convert React Flow nodes back to FlowNode[]
function reactFlowToFlowNodes(nodes: Node[], edges: Edge[]): FlowNode[] {
  const sorted = [...nodes].sort((a, b) => a.position.y - b.position.y)

  return sorted.map((node): FlowNode => {
    const d = node.data as Record<string, unknown>

    switch (node.type) {
      case 'trigger':
        return {
          id: node.id,
          type: 'trigger',
          config: d.event ? { event: d.event as string, filters: { logic: 'AND' as const, rules: [] } } : undefined,
        }
      case 'delay':
        return {
          id: node.id,
          type: 'delay',
          config: {
            value: (d.value as number) ?? 30,
            unit: (d.unit as 'minutes' | 'hours' | 'days') ?? 'minutes',
          },
        }
      case 'condition': {
        const yesEdge = edges.find(e => e.source === node.id && e.sourceHandle === 'yes')
        const noEdge = edges.find(e => e.source === node.id && e.sourceHandle === 'no')
        return {
          id: node.id,
          type: 'condition',
          config: {
            check: (d.check as 'event_occurred' | 'attribute_check') ?? 'event_occurred',
            event: d.event as string | undefined,
            field: d.field as string | undefined,
            since: 'trip_start',
            branches: {
              yes: yesEdge?.target ?? '',
              no: noEdge?.target ?? '',
            },
          },
        }
      }
      case 'action':
        return {
          id: node.id,
          type: 'action',
          config: {
            actionType: (d.actionType as 'send_email' | 'send_sms' | 'send_push' | 'send_whatsapp') ?? 'send_email',
            templateId: (d.templateId as string) ?? '',
          },
        }
      case 'end':
      default:
        return {
          id: node.id,
          type: 'end',
          label: (d.label as string) ?? 'End',
        }
    }
  })
}

let nodeIdCounter = 0

function FlowCanvas({ flowNodes, exitConfig: initialExitConfig, onSave, saving, domainType }: FlowBuilderProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  const initial = useMemo(() => flowNodesToReactFlow(flowNodes), [flowNodes])
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [exitEvent, setExitEvent] = useState(initialExitConfig?.event ?? '')

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  )

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    setSelectedNode(node)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  const onNodeDataUpdate = useCallback((id: string, data: Record<string, unknown>) => {
    setNodes(nds =>
      nds.map(n => n.id === id ? { ...n, data } : n)
    )
    setSelectedNode(prev => prev?.id === id ? { ...prev, data } : prev)
  }, [setNodes])

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      const raw = e.dataTransfer.getData('application/reactflow')
      if (!raw) return

      // Parse "action:send_sms" format
      const [type, subtype] = raw.split(':')

      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const id = `${type}_${++nodeIdCounter}`

      const defaults: Record<string, Record<string, unknown>> = {
        delay: { value: 30, unit: 'minutes' },
        condition: { check: 'event_occurred', event: '' },
        action: { actionType: subtype ?? 'send_email', templateId: '' },
        end: { label: 'End' },
      }

      const newNode: Node = {
        id,
        type,
        position,
        data: defaults[type] ?? {},
      }

      setNodes((nds) => [...nds, newNode])
    },
    [screenToFlowPosition, setNodes],
  )

  const handleSave = () => {
    const converted = reactFlowToFlowNodes(nodes, edges)
    const exitCfg: ExitConfig | null = exitEvent
      ? { event: exitEvent, scope: 'any' }
      : null
    onSave(converted, exitCfg)
  }

  return (
    <div className="flex h-[calc(100vh-120px)]">
      <NodePalette
        exitEvent={exitEvent}
        onExitEventChange={setExitEvent}
      />
      <div className="flex-1 relative" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          deleteKeyCode={['Backspace', 'Delete']}
          className="bg-surface"
        >
          <Background gap={16} size={1} />
          <Controls />
          <MiniMap
            nodeStrokeWidth={3}
            className="!bg-surface-elevated !border-border"
          />
        </ReactFlow>
        <button
          onClick={handleSave}
          disabled={saving}
          className="absolute top-4 right-4 px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 shadow-md z-10"
        >
          {saving ? 'Saving...' : 'Save Flow'}
        </button>
      </div>
      <NodeConfigPanel
        node={selectedNode}
        onUpdate={onNodeDataUpdate}
        onClose={() => setSelectedNode(null)}
        domainType={domainType}
      />
    </div>
  )
}

export function FlowBuilder(props: FlowBuilderProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvas {...props} />
    </ReactFlowProvider>
  )
}
