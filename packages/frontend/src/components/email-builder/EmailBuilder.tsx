'use client'

import { useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import {
  Type, AlignLeft, Image, MousePointerClick, Minus, MoveVertical,
  Columns2, Columns3, Columns4, ShoppingBag, Share2, CreditCard, Trash2,
  Copy, ChevronUp, ChevronDown, Eye, Code, Monitor, Smartphone, Moon, Sun,
  Maximize2, Minimize2, RotateCcw, RotateCw, ClipboardCheck,
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
  aiContext?: {
    subject?: string
    previewText?: string
    fullHtml?: string
    campaignGoal?: string
  }
}

type ColumnRatio = Extract<EmailBlock, { type: 'columns' }>['props']['ratio']

export function EmailBuilder({ value, onChange, aiContext }: EmailBuilderProps) {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'builder' | 'preview' | 'code'>('builder')
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'mobile'>('desktop')
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light')
  const [panelTab, setPanelTab] = useState<'content' | 'rows' | 'settings'>('content')
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [selectedColumnChildId, setSelectedColumnChildId] = useState<string | null>(null)
  const [pastTemplates, setPastTemplates] = useState<EmailTemplate[]>([])
  const [futureTemplates, setFutureTemplates] = useState<EmailTemplate[]>([])
  const [htmlCopied, setHtmlCopied] = useState(false)

  const template = value ?? DEFAULT_TEMPLATE
  const selectedBlock = template.blocks.find(b => b.id === selectedBlockId)
  const compiledHtml = compileToHtml(template)
  const resolvedAiContext = {
    subject: aiContext?.subject ?? template.subject,
    previewText: aiContext?.previewText ?? template.previewText,
    fullHtml: aiContext?.fullHtml ?? compiledHtml,
    campaignGoal: aiContext?.campaignGoal,
  }

  const commitTemplate = useCallback((nextTemplate: EmailTemplate) => {
    setPastTemplates(prev => [...prev.slice(-24), template])
    setFutureTemplates([])
    onChange(nextTemplate)
  }, [template, onChange])

  const updateBlocks = useCallback((blocks: EmailBlock[]) => {
    commitTemplate({ ...template, blocks })
  }, [template, commitTemplate])

  const undo = useCallback(() => {
    const previous = pastTemplates[pastTemplates.length - 1]
    if (!previous) return
    setPastTemplates(prev => prev.slice(0, -1))
    setFutureTemplates(prev => [template, ...prev].slice(0, 25))
    onChange(previous)
    if (selectedBlockId && !previous.blocks.some(block => block.id === selectedBlockId)) {
      setSelectedBlockId(null)
      setSelectedColumnChildId(null)
    }
  }, [pastTemplates, template, onChange, selectedBlockId])

  const redo = useCallback(() => {
    const next = futureTemplates[0]
    if (!next) return
    setFutureTemplates(prev => prev.slice(1))
    setPastTemplates(prev => [...prev.slice(-24), template])
    onChange(next)
  }, [futureTemplates, template, onChange])

  const copyHtml = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(compiledHtml)
      setHtmlCopied(true)
      window.setTimeout(() => setHtmlCopied(false), 1800)
    } catch {
      setHtmlCopied(false)
    }
  }, [compiledHtml])

  const addBlock = useCallback((type: BlockType, index?: number) => {
    const id = generateBlockId()
    const props = BLOCK_DEFAULTS[type]()
    const block = { id, type, props } as EmailBlock
    const blocks = [...template.blocks]
    blocks.splice(index ?? blocks.length, 0, block)
    updateBlocks(blocks)
    setSelectedBlockId(id)
    setSelectedColumnChildId(null)
  }, [template, updateBlocks])

  const addColumnLayout = useCallback((ratio: ColumnRatio, seedContent = true) => {
    const count = ratio.split(':').length
    const columns = Array.from({ length: count }, (_, idx) => seedContent ? ([
      {
        id: generateBlockId(),
        type: 'image',
        props: { src: '', alt: `Column ${idx + 1} image`, width: '100%', align: 'center' },
      },
      {
        id: generateBlockId(),
        type: 'text',
        props: { html: "<p>I'm a new Text block ready for your content.</p>", align: 'left', color: '#374151', fontSize: 15 },
      },
      {
        id: generateBlockId(),
        type: 'button',
        props: { text: 'Button', url: 'https://', bgColor: '#5DADE2', textColor: '#ffffff', align: 'center', borderRadius: 4, fullWidth: false, fullWidthOnMobile: false, paddingX: 32, paddingY: 14 },
      },
    ] as EmailBlock[]) : [])
    const block = {
      id: generateBlockId(),
      type: 'columns',
      props: {
        ratio,
        columns,
        padding: 8,
        gap: 16,
        rowBgColor: 'transparent',
        contentBgColor: 'transparent',
        borderColor: 'transparent',
        borderWidth: 0,
        borderRadius: 0,
        stackOnMobile: true,
      },
    } as EmailBlock
    updateBlocks([...template.blocks, block])
    setSelectedBlockId(block.id)
    setSelectedColumnChildId(null)
  }, [template.blocks, updateBlocks])

  const removeBlock = useCallback((id: string) => {
    updateBlocks(template.blocks.filter(b => b.id !== id))
    if (selectedBlockId === id) {
      setSelectedBlockId(null)
      setSelectedColumnChildId(null)
    }
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
    setSelectedColumnChildId(null)
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

  const addBlockToColumn = useCallback((columnBlockId: string, columnIndex: number, type: BlockType) => {
    if (type === 'columns') return
    const child = { id: generateBlockId(), type, props: BLOCK_DEFAULTS[type]() } as EmailBlock
    const blocks = template.blocks.map(block => {
      if (block.id !== columnBlockId || block.type !== 'columns') return block
      const columns = block.props.columns.map((column, idx) => idx === columnIndex ? [...column, child] : column)
      return { ...block, props: { ...block.props, columns } } as EmailBlock
    })
    updateBlocks(blocks)
    setSelectedBlockId(columnBlockId)
    setSelectedColumnChildId(child.id)
    setPanelTab('settings')
  }, [template.blocks, updateBlocks])

  const removeColumnChild = useCallback((columnBlockId: string, childId: string) => {
    const blocks = template.blocks.map(block => {
      if (block.id !== columnBlockId || block.type !== 'columns') return block
      const columns = block.props.columns.map(column => column.filter(child => child.id !== childId))
      return { ...block, props: { ...block.props, columns } } as EmailBlock
    })
    updateBlocks(blocks)
    setSelectedBlockId(columnBlockId)
    setSelectedColumnChildId(null)
    setPanelTab('settings')
  }, [template.blocks, updateBlocks])

  const duplicateColumnChild = useCallback((columnBlockId: string, childId: string) => {
    let copyId: string | null = null
    const blocks = template.blocks.map(block => {
      if (block.id !== columnBlockId || block.type !== 'columns') return block
      const columns = block.props.columns.map(column => {
        const childIndex = column.findIndex(child => child.id === childId)
        if (childIndex < 0) return column
        const original = column[childIndex]
        const copy = { ...original, id: generateBlockId(), props: { ...original.props } } as EmailBlock
        copyId = copy.id
        const next = [...column]
        next.splice(childIndex + 1, 0, copy)
        return next
      })
      return { ...block, props: { ...block.props, columns } } as EmailBlock
    })
    updateBlocks(blocks)
    setSelectedBlockId(columnBlockId)
    setSelectedColumnChildId(copyId)
    setPanelTab('settings')
  }, [template.blocks, updateBlocks])

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

  return (
    <div className={cn(
      'flex min-h-[680px] overflow-hidden border border-border bg-surface',
      isFullscreen
        ? 'fixed inset-4 z-50 h-[calc(100vh-32px)] rounded-xl shadow-2xl'
        : 'h-[calc(100vh-200px)] rounded-xl',
    )}>
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
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-white p-0.5">
              <button type="button" onClick={undo} disabled={pastTemplates.length === 0} className="rounded-md p-1.5 text-text-muted transition-colors hover:text-text-primary disabled:opacity-40" title="Undo">
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={redo} disabled={futureTemplates.length === 0} className="rounded-md p-1.5 text-text-muted transition-colors hover:text-text-primary disabled:opacity-40" title="Redo">
                <RotateCw className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={copyHtml}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 text-xs font-medium text-text-secondary hover:text-text-primary"
            >
              {htmlCopied ? <ClipboardCheck className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {htmlCopied ? 'Copied' : 'Copy HTML'}
            </button>
            <button
              type="button"
              onClick={() => setIsFullscreen(v => !v)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 text-xs font-medium text-text-secondary hover:text-text-primary"
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              {isFullscreen ? 'Exit full screen' : 'Full screen'}
            </button>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-white p-0.5">
              <button type="button" onClick={() => setDeviceMode('desktop')} className={cn('rounded-md p-1.5 transition-colors', deviceMode === 'desktop' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary')} title="Desktop preview">
                <Monitor className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => setDeviceMode('mobile')} className={cn('rounded-md p-1.5 transition-colors', deviceMode === 'mobile' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary')} title="Mobile preview">
                <Smartphone className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-white p-0.5">
              <button type="button" onClick={() => setThemeMode('light')} className={cn('rounded-md p-1.5 transition-colors', themeMode === 'light' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary')} title="Light preview">
                <Sun className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => setThemeMode('dark')} className={cn('rounded-md p-1.5 transition-colors', themeMode === 'dark' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary')} title="Dark preview">
                <Moon className="h-3.5 w-3.5" />
              </button>
            </div>
            {template.blocks.length} block{template.blocks.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Canvas */}
        {viewMode === 'builder' && (
          <div
            className="flex-1 overflow-y-auto p-6"
            style={{ backgroundColor: themeMode === 'dark' ? '#111827' : template.globalStyles.bgColor }}
          >
            <div
              className={cn('mx-auto overflow-hidden bg-white shadow-sm transition-all', deviceMode === 'mobile' && 'max-w-[375px]')}
              style={{
                maxWidth: deviceMode === 'mobile' ? 375 : template.globalStyles.maxWidth,
                backgroundColor: themeMode === 'dark' ? '#0f172a' : template.globalStyles.contentBgColor,
              }}
            >
              {template.blocks.length === 0 && (
                <div
                  className="py-20 text-center border-2 border-dashed border-border/50 rounded-xl m-4"
                  onDragOver={e => handleDragOver(e, 0)}
                  onDragLeave={() => setDragOverIndex(null)}
                  onDrop={e => handleDrop(e, 0)}
                >
                  <Type className="h-8 w-8 text-text-muted/30 mx-auto mb-3" />
                  <p className="text-sm font-medium text-text-muted">Add content or rows from the panel</p>
                  <p className="text-xs text-text-muted/60 mt-1">Start from a block or a 2/3/4-column row</p>
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
                      onClick={() => {
                        setSelectedBlockId(block.id)
                        setSelectedColumnChildId(null)
                        setPanelTab('settings')
                      }}
                      className={cn(
                        'group relative mx-2 rounded-lg transition-all cursor-pointer',
                        isSelected ? 'ring-2 ring-accent ring-offset-1' : 'hover:ring-1 hover:ring-border',
                      )}
                    >
                      {/* Block toolbar */}
                      <div className={cn(
                        'absolute right-3 top-3 flex items-center gap-0.5 bg-teal-500 text-white rounded-md shadow-sm px-1 py-0.5 z-10 transition-opacity',
                        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                      )}>
                        <span className="text-[10px] font-medium px-1.5">{BLOCK_LABELS[block.type].label}</span>
                        <button onClick={e => { e.stopPropagation(); moveBlock(block.id, -1) }} className="p-0.5 hover:bg-white/15 rounded" title="Move up">
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); moveBlock(block.id, 1) }} className="p-0.5 hover:bg-white/15 rounded" title="Move down">
                          <ChevronDown className="h-3 w-3" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); duplicateBlock(block.id) }} className="p-0.5 hover:bg-white/15 rounded" title="Duplicate">
                          <Copy className="h-3 w-3" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); removeBlock(block.id) }} className="p-0.5 hover:bg-white/15 rounded" title="Delete">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Block preview */}
                      <BlockPreview
                        block={block}
                        dark={themeMode === 'dark'}
                        selectedColumnChildId={isSelected ? selectedColumnChildId : null}
                        onSelectColumnChild={(childId) => {
                          setSelectedBlockId(block.id)
                          setSelectedColumnChildId(childId)
                          setPanelTab('settings')
                        }}
                        onDropColumnChild={(columnIndex, type) => addBlockToColumn(block.id, columnIndex, type)}
                        onRemoveColumnChild={(childId) => removeColumnChild(block.id, childId)}
                        onDuplicateColumnChild={(childId) => duplicateColumnChild(block.id, childId)}
                      />
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

      {/* Right: Builder Panel */}
      {viewMode === 'builder' && (
        <div className="w-[340px] border-l border-border bg-white overflow-y-auto flex-shrink-0">
          <div className="grid grid-cols-3 border-b border-border bg-surface">
            {([
              { key: 'content' as const, label: 'Content' },
              { key: 'rows' as const, label: 'Rows' },
              { key: 'settings' as const, label: 'Settings' },
            ]).map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setPanelTab(tab.key)}
                className={cn(
                  'h-14 border-r border-border text-xs font-semibold uppercase last:border-r-0',
                  panelTab === tab.key ? 'bg-white text-text-primary' : 'bg-surface text-text-muted hover:text-text-secondary',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {panelTab === 'content' && (
            <div className="grid grid-cols-2 gap-3 p-4">
              {(Object.keys(BLOCK_LABELS) as BlockType[]).filter(type => type !== 'columns').map(type => {
                const info = BLOCK_LABELS[type]
                const Icon = BLOCK_ICONS[type]
                return (
                  <button
                    key={type}
                    type="button"
                    draggable
                    onDragStart={e => handleDragStart(e, type)}
                    onClick={() => addBlock(type)}
                    className="flex h-28 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-white p-3 text-center transition-colors hover:border-accent hover:bg-accent/5"
                  >
                    <Icon className="h-8 w-8 text-text-secondary" />
                    <span className="text-[11px] font-semibold uppercase text-text-secondary">{info.label}</span>
                  </button>
                )
              })}
            </div>
          )}

          {panelTab === 'rows' && (
            <div className="space-y-3 p-4">
              {[
                { ratio: '1:1' as const, label: '2 Columns', detail: 'Equal split', icon: Columns2, seedContent: true },
                { ratio: '1:2' as const, label: 'Sidebar + Body', detail: '33% / 67%', icon: Columns2, seedContent: true },
                { ratio: '2:1' as const, label: 'Body + Sidebar', detail: '67% / 33%', icon: Columns2, seedContent: true },
                { ratio: '1:1:1' as const, label: '3 Columns', detail: 'Equal split', icon: Columns3, seedContent: true },
                { ratio: '1:2:1' as const, label: 'Feature Center', detail: '25% / 50% / 25%', icon: Columns3, seedContent: true },
                { ratio: '1:1:1:1' as const, label: '4 Columns', detail: 'Product grid', icon: Columns4, seedContent: true },
                { ratio: '1:1' as const, label: 'Empty 2 Columns', detail: 'Drop content manually', icon: Columns2, seedContent: false },
                { ratio: '1:1:1' as const, label: 'Empty 3 Columns', detail: 'Drop content manually', icon: Columns3, seedContent: false },
              ].map(row => (
                <button
                  key={`${row.label}-${row.ratio}`}
                  type="button"
                  onClick={() => addColumnLayout(row.ratio, row.seedContent)}
                  className="w-full rounded-lg border border-border bg-white p-3 text-left transition-colors hover:border-accent hover:bg-accent/5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <row.icon className="h-4 w-4 text-text-secondary" />
                      <span className="text-sm font-medium text-text-primary">{row.label}</span>
                    </div>
                    <span className="text-[10px] font-medium text-text-muted">{row.detail}</span>
                  </div>
                  <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: row.ratio.split(':').map(part => `${part}fr`).join(' ') }}>
                    {row.ratio.split(':').map((_, idx) => (
                      <span key={idx} className="h-16 rounded border border-border bg-surface" />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}

          {panelTab === 'settings' && (
            <BlockPropertyEditor
              block={selectedBlock ?? null}
              onChange={(props) => selectedBlock && updateBlock(selectedBlock.id, props)}
              globalStyles={template.globalStyles}
              onGlobalStylesChange={(gs) => commitTemplate({ ...template, globalStyles: { ...template.globalStyles, ...gs } })}
              selectedColumnChildId={selectedColumnChildId}
              aiContext={resolvedAiContext}
            />
          )}

          {panelTab !== 'settings' && selectedBlock && (
            <div className="border-t border-border">
              <BlockPropertyEditor
                block={selectedBlock}
                onChange={(props) => updateBlock(selectedBlock.id, props)}
                globalStyles={template.globalStyles}
                onGlobalStylesChange={(gs) => commitTemplate({ ...template, globalStyles: { ...template.globalStyles, ...gs } })}
                selectedColumnChildId={selectedColumnChildId}
                aiContext={resolvedAiContext}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Block Preview (simplified rendering for the canvas) ──

function BlockPreview({
  block,
  dark = false,
  selectedColumnChildId,
  onSelectColumnChild,
  onDropColumnChild,
  onRemoveColumnChild,
  onDuplicateColumnChild,
}: {
  block: EmailBlock
  dark?: boolean
  selectedColumnChildId?: string | null
  onSelectColumnChild?: (childId: string) => void
  onDropColumnChild?: (columnIndex: number, type: BlockType) => void
  onRemoveColumnChild?: (childId: string) => void
  onDuplicateColumnChild?: (childId: string) => void
}) {
  switch (block.type) {
    case 'header': {
      const Tag = `h${block.props.level}` as 'h1' | 'h2' | 'h3'
      const sizes = { 1: 'text-2xl', 2: 'text-xl', 3: 'text-lg' }
      return <div className="px-8 py-4"><Tag className={cn(sizes[block.props.level], 'font-bold')} style={{ color: block.props.color, textAlign: block.props.align as 'left' }}>{block.props.text}</Tag></div>
    }
    case 'text':
      return <div className="px-8 py-2" style={{ color: dark ? '#cbd5e1' : block.props.color, textAlign: block.props.align as 'left', fontSize: block.props.fontSize }} dangerouslySetInnerHTML={{ __html: block.props.html }} />
    case 'image':
      return <div className="px-8 py-2" style={{ textAlign: block.props.align as 'left' }}>
        {block.props.src ? <img src={block.props.src} alt={block.props.alt} className="max-w-full rounded" style={{ width: block.props.width }} /> : <div className={cn('h-32 rounded-lg flex flex-col items-center justify-center border border-dashed px-4 text-center', dark ? 'bg-slate-800 border-slate-600' : 'bg-surface border-border')}><Image className="h-6 w-6 text-text-muted/30" /><span className="mt-2 text-xs font-medium text-text-muted">Select this block and add an Image URL</span></div>}
      </div>
    case 'button':
      return <div className="px-8 py-4" style={{ textAlign: block.props.align as 'left' }}>
        <span className={cn('inline-block text-sm font-semibold', block.props.fullWidth && 'block text-center')} style={{ background: block.props.bgColor, color: block.props.textColor, borderRadius: block.props.borderRadius, padding: `${block.props.paddingY ?? 14}px ${block.props.paddingX ?? 32}px` }}>{block.props.text}</span>
      </div>
    case 'divider':
      return <div style={{ padding: `${block.props.padding}px 40px` }}><hr style={{ border: 'none', borderTop: `${block.props.thickness}px solid ${block.props.color}` }} /></div>
    case 'spacer':
      return <div style={{ height: block.props.height }} className="relative"><span className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/30" /><span className={cn('absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-1 text-[9px] text-text-muted', dark ? 'bg-slate-900' : 'bg-white')}>{block.props.height}px</span></div>
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
      const ratioColumns = block.props.ratio.split(':').map(part => `${part}fr`).join(' ')
      return <div
        className="px-8"
        style={{
          paddingTop: block.props.padding ?? 12,
          paddingBottom: block.props.padding ?? 12,
          background: block.props.rowBgColor && block.props.rowBgColor !== 'transparent' ? block.props.rowBgColor : undefined,
        }}
      ><div
        className="grid"
        style={{
          gap: block.props.gap ?? 12,
          gridTemplateColumns: ratioColumns,
          background: block.props.contentBgColor && block.props.contentBgColor !== 'transparent' ? block.props.contentBgColor : undefined,
          border: (block.props.borderWidth ?? 0) > 0 ? `${block.props.borderWidth}px solid ${block.props.borderColor ?? '#e5e7eb'}` : undefined,
          borderRadius: block.props.borderRadius ?? 0,
        }}
      >
        {block.props.columns.map((col, i) => (
            <div
              key={i}
              className={cn('min-h-[88px] rounded-lg border p-3 transition-colors', dark ? 'border-slate-700 bg-slate-800/70' : 'border-border bg-surface/60 hover:border-accent/50')}
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
                e.dataTransfer.dropEffect = 'copy'
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const type = e.dataTransfer.getData('block-type') as BlockType
                if (type && type !== 'columns' && BLOCK_DEFAULTS[type]) {
                  onDropColumnChild?.(i, type)
                }
              }}
            >
              <div className="text-[10px] font-semibold uppercase text-text-muted mb-2">Column {i + 1}</div>
              <div className="space-y-2">
                {col.map(child => (
                  <ColumnChildPreview
                    key={child.id}
                    block={child}
                    dark={dark}
                    selected={selectedColumnChildId === child.id}
                    onSelect={() => onSelectColumnChild?.(child.id)}
                    onRemove={() => onRemoveColumnChild?.(child.id)}
                    onDuplicate={() => onDuplicateColumnChild?.(child.id)}
                  />
                ))}
                {col.length === 0 && (
                  <div className="rounded-md border border-dashed border-border bg-white/70 px-3 py-6 text-center text-[11px] text-text-muted">
                    Drop content here
                  </div>
                )}
              </div>
            </div>
        ))}
      </div></div>
    default:
      return <div className="px-8 py-4 text-sm text-text-muted">Unknown block type</div>
  }
}

function ColumnChildPreview({
  block,
  dark,
  selected,
  onSelect,
  onRemove,
  onDuplicate,
}: {
  block: EmailBlock
  dark: boolean
  selected?: boolean
  onSelect?: () => void
  onRemove?: () => void
  onDuplicate?: () => void
}) {
  const wrap = (content: ReactNode) => (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onSelect?.()
        }}
        className={cn(
          'block w-full rounded-md text-left transition-all',
          selected ? 'ring-2 ring-accent ring-offset-1' : 'hover:ring-1 hover:ring-accent/40',
        )}
      >
        {content}
      </button>
      {selected && (
        <div className="absolute right-1 top-1 z-20 flex overflow-hidden rounded-md bg-teal-500 text-white shadow-sm">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDuplicate?.()
            }}
            className="p-1.5 hover:bg-white/15"
            title="Duplicate"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRemove?.()
            }}
            className="p-1.5 hover:bg-white/15"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )

  switch (block.type) {
    case 'header':
      return wrap(<div className="text-sm font-semibold" style={{ color: dark ? '#f8fafc' : block.props.color, textAlign: block.props.align }}>{block.props.text}</div>)
    case 'text':
      return wrap(<div className={cn('line-clamp-4 text-xs leading-relaxed', dark ? 'text-slate-300' : 'text-text-secondary')} style={{ textAlign: block.props.align, fontSize: Math.min(block.props.fontSize, 14) }} dangerouslySetInnerHTML={{ __html: block.props.html }} />)
    case 'image':
      return wrap(block.props.src
        ? <img src={block.props.src} alt={block.props.alt} className="mx-auto max-h-28 rounded object-cover" style={{ width: block.props.width }} />
        : <div className={cn('flex h-24 flex-col items-center justify-center rounded border border-dashed px-2 text-center', dark ? 'border-slate-600 bg-slate-900' : 'border-border bg-white')}><Image className="h-5 w-5 text-text-muted/40" /><span className="mt-1 text-[10px] text-text-muted">Image URL</span></div>)
    case 'button':
      return wrap(<div style={{ textAlign: block.props.align }}><span className={cn('inline-block text-xs font-semibold', block.props.fullWidth && 'block text-center')} style={{ background: block.props.bgColor, color: block.props.textColor, borderRadius: block.props.borderRadius, padding: `${block.props.paddingY ?? 14}px ${block.props.paddingX ?? 32}px` }}>{block.props.text}</span></div>)
    case 'divider':
      return wrap(<hr style={{ border: 'none', borderTop: `${block.props.thickness}px solid ${block.props.color}` }} />)
    case 'spacer':
      return wrap(<div style={{ height: Math.min(block.props.height, 32) }} />)
    default:
      return wrap(<div className="text-xs text-text-muted">{BLOCK_LABELS[block.type].label}</div>)
  }
}
