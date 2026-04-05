'use client'

import { useState, useCallback } from 'react'
import {
  Type, AlignLeft, Image, MousePointerClick, Minus, MoveVertical,
  Columns2, ShoppingBag, Share2, CreditCard, GripVertical, Trash2,
  Copy, ChevronUp, ChevronDown, Eye, Code, Undo2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { compileToHtml } from '@/lib/emailCompiler'
import type { EmailBlock, EmailTemplate, BlockType } from '@/lib/emailTypes'
import { BLOCK_DEFAULTS, BLOCK_LABELS, DEFAULT_TEMPLATE, generateBlockId } from '@/lib/emailTypes'
import { BlockPropertyEditor } from './BlockPropertyEditor'

const BLOCK_ICONS: Record<BlockType, typeof Type> = {
  header: Type, text: AlignLeft, image: Image, button: MousePointerClick,
  divider: Minus, spacer: MoveVertical, columns: Columns2,
  product: ShoppingBag, social: Share2, footer: CreditCard,
}

type EmailBuilderProps = {
  value: EmailTemplate
  onChange: (template: EmailTemplate) => void
}

export function EmailBuilder({ value, onChange }: EmailBuilderProps) {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'builder' | 'preview' | 'code'>('builder')
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const template = value ?? DEFAULT_TEMPLATE
  const selectedBlock = template.blocks.find(b => b.id === selectedBlockId)

  const updateBlocks = useCallback((blocks: EmailBlock[]) => {
    onChange({ ...template, blocks })
  }, [template, onChange])

  const addBlock = useCallback((type: BlockType, index?: number) => {
    const id = generateBlockId()
    const props = BLOCK_DEFAULTS[type]()
    const block = { id, type, props } as EmailBlock
    const blocks = [...template.blocks]
    blocks.splice(index ?? blocks.length, 0, block)
    updateBlocks(blocks)
    setSelectedBlockId(id)
  }, [template, updateBlocks])

  const removeBlock = useCallback((id: string) => {
    updateBlocks(template.blocks.filter(b => b.id !== id))
    if (selectedBlockId === id) setSelectedBlockId(null)
  }, [template, updateBlocks, selectedBlockId])

  const duplicateBlock = useCallback((id: string) => {
    const idx = template.blocks.findIndex(b => b.id === id)
    if (idx < 0) return
    const original = template.blocks[idx]
    const copy = { ...original, id: generateBlockId(), props: { ...original.props } } as EmailBlock
    const blocks = [...template.blocks]
    blocks.splice(idx + 1, 0, copy)
    updateBlocks(blocks)
    setSelectedBlockId(copy.id)
  }, [template, updateBlocks])

  const moveBlock = useCallback((id: string, direction: -1 | 1) => {
    const idx = template.blocks.findIndex(b => b.id === id)
    const newIdx = idx + direction
    if (newIdx < 0 || newIdx >= template.blocks.length) return
    const blocks = [...template.blocks]
    ;[blocks[idx], blocks[newIdx]] = [blocks[newIdx], blocks[idx]]
    updateBlocks(blocks)
  }, [template, updateBlocks])

  const updateBlock = useCallback((id: string, props: Record<string, unknown>) => {
    updateBlocks(template.blocks.map(b => b.id === id ? { ...b, props: { ...b.props, ...props } } as EmailBlock : b))
  }, [template, updateBlocks])

  // Drag & Drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, type: BlockType) => {
    e.dataTransfer.setData('block-type', type)
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragOverIndex(index)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('block-type') as BlockType
    if (type && BLOCK_DEFAULTS[type]) {
      addBlock(type, index)
    }
    setDragOverIndex(null)
  }, [addBlock])

  const compiledHtml = compileToHtml(template)

  return (
    <div className="flex h-[calc(100vh-200px)] min-h-[600px] border border-border rounded-xl overflow-hidden bg-surface">
      {/* Left: Block Palette */}
      {viewMode === 'builder' && (
        <div className="w-56 border-r border-border bg-white p-3 overflow-y-auto flex-shrink-0">
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Blocks</div>
          <div className="space-y-1.5">
            {(Object.keys(BLOCK_LABELS) as BlockType[]).map(type => {
              const info = BLOCK_LABELS[type]
              const Icon = BLOCK_ICONS[type]
              return (
                <div
                  key={type}
                  draggable
                  onDragStart={e => handleDragStart(e, type)}
                  onClick={() => addBlock(type)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border bg-white hover:border-accent hover:bg-accent/5 cursor-grab active:cursor-grabbing transition-all group"
                >
                  <div className="p-1.5 rounded bg-surface group-hover:bg-accent/10 transition-colors">
                    <Icon className="h-3.5 w-3.5 text-text-muted group-hover:text-accent" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-text-primary">{info.label}</div>
                    <div className="text-[10px] text-text-muted leading-tight">{info.description}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Center: Canvas / Preview / Code */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-white">
          <div className="flex items-center gap-1 bg-surface rounded-lg p-0.5">
            {(['builder', 'preview', 'code'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5',
                  viewMode === mode ? 'bg-white text-text-primary shadow-sm' : 'text-text-muted hover:text-text-primary',
                )}
              >
                {mode === 'builder' && <Columns2 className="h-3 w-3" />}
                {mode === 'preview' && <Eye className="h-3 w-3" />}
                {mode === 'code' && <Code className="h-3 w-3" />}
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          <div className="text-xs text-text-muted">
            {template.blocks.length} block{template.blocks.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Canvas */}
        {viewMode === 'builder' && (
          <div
            className="flex-1 overflow-y-auto p-6"
            style={{ backgroundColor: template.globalStyles.bgColor }}
          >
            <div
              className="mx-auto rounded-xl overflow-hidden shadow-sm"
              style={{ maxWidth: template.globalStyles.maxWidth, backgroundColor: template.globalStyles.contentBgColor }}
            >
              {template.blocks.length === 0 && (
                <div
                  className="py-20 text-center border-2 border-dashed border-border/50 rounded-xl m-4"
                  onDragOver={e => handleDragOver(e, 0)}
                  onDragLeave={() => setDragOverIndex(null)}
                  onDrop={e => handleDrop(e, 0)}
                >
                  <Type className="h-8 w-8 text-text-muted/30 mx-auto mb-3" />
                  <p className="text-sm font-medium text-text-muted">Drag blocks here to start building</p>
                  <p className="text-xs text-text-muted/60 mt-1">Or click a block from the left panel</p>
                </div>
              )}

              {template.blocks.map((block, idx) => {
                const Icon = BLOCK_ICONS[block.type]
                const isSelected = selectedBlockId === block.id
                const isDragOver = dragOverIndex === idx

                return (
                  <div key={block.id}>
                    {/* Drop zone before block */}
                    <div
                      className={cn('h-1 transition-all', isDragOver ? 'h-8 bg-accent/10 border-2 border-dashed border-accent/30 rounded mx-4' : '')}
                      onDragOver={e => handleDragOver(e, idx)}
                      onDragLeave={() => setDragOverIndex(null)}
                      onDrop={e => handleDrop(e, idx)}
                    />

                    {/* Block */}
                    <div
                      onClick={() => setSelectedBlockId(block.id)}
                      className={cn(
                        'group relative mx-2 rounded-lg transition-all cursor-pointer',
                        isSelected ? 'ring-2 ring-accent ring-offset-1' : 'hover:ring-1 hover:ring-border',
                      )}
                    >
                      {/* Block toolbar */}
                      <div className={cn(
                        'absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-white border border-border rounded-md shadow-sm px-1 py-0.5 z-10 transition-opacity',
                        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                      )}>
                        <span className="text-[10px] text-text-muted font-medium px-1.5">{BLOCK_LABELS[block.type].label}</span>
                        <button onClick={e => { e.stopPropagation(); moveBlock(block.id, -1) }} className="p-0.5 text-text-muted hover:text-text-primary" title="Move up">
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); moveBlock(block.id, 1) }} className="p-0.5 text-text-muted hover:text-text-primary" title="Move down">
                          <ChevronDown className="h-3 w-3" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); duplicateBlock(block.id) }} className="p-0.5 text-text-muted hover:text-text-primary" title="Duplicate">
                          <Copy className="h-3 w-3" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); removeBlock(block.id) }} className="p-0.5 text-red-400 hover:text-red-600" title="Delete">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Block preview */}
                      <BlockPreview block={block} />
                    </div>
                  </div>
                )
              })}

              {/* Final drop zone */}
              {template.blocks.length > 0 && (
                <div
                  className={cn('h-4 transition-all mx-4 mb-2', dragOverIndex === template.blocks.length ? 'h-8 bg-accent/10 border-2 border-dashed border-accent/30 rounded' : '')}
                  onDragOver={e => handleDragOver(e, template.blocks.length)}
                  onDragLeave={() => setDragOverIndex(null)}
                  onDrop={e => handleDrop(e, template.blocks.length)}
                />
              )}
            </div>
          </div>
        )}

        {/* Preview */}
        {viewMode === 'preview' && (
          <div className="flex-1 bg-gray-100 p-4 overflow-auto">
            <iframe
              srcDoc={compiledHtml}
              className="w-full h-full border-0 rounded-lg shadow-sm bg-white mx-auto"
              style={{ maxWidth: 700 }}
              title="Email preview"
            />
          </div>
        )}

        {/* Code */}
        {viewMode === 'code' && (
          <div className="flex-1 overflow-auto">
            <pre className="p-4 text-xs font-mono text-text-primary whitespace-pre-wrap leading-relaxed">
              {compiledHtml}
            </pre>
          </div>
        )}
      </div>

      {/* Right: Property Editor */}
      {viewMode === 'builder' && selectedBlock && (
        <div className="w-72 border-l border-border bg-white overflow-y-auto flex-shrink-0">
          <BlockPropertyEditor
            block={selectedBlock}
            onChange={(props) => updateBlock(selectedBlock.id, props)}
            globalStyles={template.globalStyles}
            onGlobalStylesChange={(gs) => onChange({ ...template, globalStyles: { ...template.globalStyles, ...gs } })}
          />
        </div>
      )}
    </div>
  )
}

// ── Block Preview (simplified rendering for the canvas) ──

function BlockPreview({ block }: { block: EmailBlock }) {
  switch (block.type) {
    case 'header': {
      const Tag = `h${block.props.level}` as 'h1' | 'h2' | 'h3'
      const sizes = { 1: 'text-2xl', 2: 'text-xl', 3: 'text-lg' }
      return <div className="px-8 py-4"><Tag className={cn(sizes[block.props.level], 'font-bold')} style={{ color: block.props.color, textAlign: block.props.align as 'left' }}>{block.props.text}</Tag></div>
    }
    case 'text':
      return <div className="px-8 py-2" style={{ color: block.props.color, textAlign: block.props.align as 'left', fontSize: block.props.fontSize }} dangerouslySetInnerHTML={{ __html: block.props.html }} />
    case 'image':
      return <div className="px-8 py-2" style={{ textAlign: block.props.align as 'left' }}>
        {block.props.src ? <img src={block.props.src} alt={block.props.alt} className="max-w-full rounded" style={{ width: block.props.width }} /> : <div className="h-32 bg-surface rounded-lg flex items-center justify-center border border-dashed border-border"><Image className="h-6 w-6 text-text-muted/30" /><span className="text-xs text-text-muted ml-2">Add image URL</span></div>}
      </div>
    case 'button':
      return <div className="px-8 py-4" style={{ textAlign: block.props.align as 'left' }}>
        <span className={cn('inline-block px-6 py-3 text-sm font-semibold', block.props.fullWidth && 'block text-center')} style={{ background: block.props.bgColor, color: block.props.textColor, borderRadius: block.props.borderRadius }}>{block.props.text}</span>
      </div>
    case 'divider':
      return <div style={{ padding: `${block.props.padding}px 40px` }}><hr style={{ border: 'none', borderTop: `${block.props.thickness}px solid ${block.props.color}` }} /></div>
    case 'spacer':
      return <div style={{ height: block.props.height }} className="relative"><span className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/30" /><span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] text-text-muted bg-white px-1">{block.props.height}px</span></div>
    case 'product':
      return <div className="px-8 py-2"><div className="border border-border rounded-lg overflow-hidden">
        {block.props.imageUrl && <img src={block.props.imageUrl} alt="" className="w-full h-32 object-cover" />}
        <div className="p-3"><div className="font-semibold text-sm">{block.props.productName}</div><div className="text-accent font-bold mt-1">{block.props.price}</div></div>
      </div></div>
    case 'social':
      return <div className="px-8 py-3" style={{ textAlign: block.props.align as 'left' }}>
        <div className="flex gap-2" style={{ justifyContent: block.props.align === 'center' ? 'center' : block.props.align === 'right' ? 'flex-end' : 'flex-start' }}>
          {block.props.links.map((l, i) => <span key={i} className="w-8 h-8 rounded-full bg-text-muted/20 flex items-center justify-center text-[10px] font-bold text-text-muted">{l.platform.slice(0, 2).toUpperCase()}</span>)}
        </div>
      </div>
    case 'footer':
      return <div className="px-8 py-4 border-t border-border text-center"><p className="text-xs text-text-muted">{block.props.text}</p><p className="text-[11px] text-accent mt-1 underline">{block.props.unsubscribeText}</p></div>
    case 'columns':
      return <div className="px-8 py-2"><div className="flex gap-2">{block.props.columns.map((col, i) => <div key={i} className="flex-1 min-h-[40px] bg-surface rounded border border-dashed border-border/50 flex items-center justify-center text-[10px] text-text-muted">Column {i + 1}{col.length > 0 ? ` (${col.length} blocks)` : ''}</div>)}</div></div>
    default:
      return <div className="px-8 py-4 text-sm text-text-muted">Unknown block type</div>
  }
}
