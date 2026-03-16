'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Sparkles, Send, Mic, MicOff, Loader2, Check, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAiSegment, useAiStatus } from '@/hooks/useAiSegment'
import { useSpeechRecognition, SPEECH_LANGUAGES } from '@/hooks/useSpeechRecognition'
import type { FilterConfig } from '@storees/shared'

type ChatMessage = {
  role: 'user' | 'assistant'
  text: string
  filters?: FilterConfig
  summary?: string
  error?: boolean
}

type AiChatPanelProps = {
  onApplyFilters: (filters: FilterConfig) => void
}

export function AiChatPanel({ onApplyFilters }: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [appliedIndex, setAppliedIndex] = useState<number | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const aiSegment = useAiSegment()
  const aiStatus = useAiStatus()
  const speech = useSpeechRecognition()

  const aiEnabled = aiStatus.data?.data?.enabled ?? false
  const aiLoading = aiStatus.isLoading

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Fill input with speech transcript
  useEffect(() => {
    if (speech.transcript) {
      setInput(speech.transcript)
      // Auto-submit voice input
      handleSubmit(speech.transcript)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.transcript])

  const handleSubmit = useCallback(async (text?: string) => {
    const value = (text ?? input).trim()
    if (!value || aiSegment.isPending) return

    const userMessage: ChatMessage = { role: 'user', text: value }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setAppliedIndex(null)

    // Build history for conversational context
    const history = updatedMessages
      .filter(m => !m.error)
      .map(m => ({
        role: m.role,
        text: m.role === 'assistant' && m.filters
          ? JSON.stringify(m.filters)
          : m.text,
      }))

    try {
      const result = await aiSegment.mutateAsync({
        input: value,
        history: history.slice(0, -1), // exclude current message (sent as input)
      })

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: result.data.summary,
          filters: result.data.filters,
          summary: result.data.summary,
        },
      ])
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Something went wrong'
      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: errorMsg, error: true },
      ])
    }
  }, [input, messages, aiSegment])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleApply = (filters: FilterConfig, index: number) => {
    onApplyFilters(filters)
    setAppliedIndex(index)
  }

  const toggleMic = () => {
    if (speech.isListening) {
      speech.stop()
    } else {
      speech.start()
    }
  }

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden flex flex-col h-full min-h-[500px]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-surface border-b border-border">
        <Sparkles className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-text-primary">Segment AI</h2>
        <span className="ml-auto text-[10px] font-medium text-text-muted uppercase tracking-wide px-2 py-0.5 bg-accent/10 text-accent rounded-full">
          Beta
        </span>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Sparkles className={cn('h-8 w-8 mx-auto mb-3', aiEnabled ? 'text-text-muted/30' : 'text-text-muted/20')} />
            {aiLoading ? (
              <div className="flex items-center justify-center gap-2 text-sm text-text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Checking AI availability...
              </div>
            ) : !aiEnabled ? (
              <>
                <p className="text-sm font-medium text-text-primary mb-1">AI not configured</p>
                <p className="text-xs text-text-muted max-w-[240px] mx-auto leading-relaxed">
                  Set the <code className="text-[11px] bg-surface px-1 py-0.5 rounded">GROQ_API_KEY</code> environment variable on the backend to enable AI-powered segment creation.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-text-primary mb-1">
                  Describe your segment
                </p>
                <p className="text-xs text-text-muted max-w-[240px] mx-auto leading-relaxed">
                  Type or speak in any language. For example:
                </p>
                <div className="mt-3 space-y-1.5">
                  {EXAMPLE_PROMPTS.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setInput(prompt)
                        inputRef.current?.focus()
                      }}
                      className="block w-full text-left px-3 py-2 text-xs text-text-secondary bg-surface rounded-lg hover:bg-border/50 transition-colors"
                    >
                      &ldquo;{prompt}&rdquo;
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              'flex',
              msg.role === 'user' ? 'justify-end' : 'justify-start',
            )}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm',
                msg.role === 'user'
                  ? 'bg-accent text-white rounded-br-sm'
                  : msg.error
                    ? 'bg-red-50 text-red-700 border border-red-200 rounded-bl-sm'
                    : 'bg-surface text-text-primary border border-border rounded-bl-sm',
              )}
            >
              {/* Error indicator */}
              {msg.error && (
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">Error</span>
                </div>
              )}

              <p className="leading-relaxed">{msg.text}</p>

              {/* Filter preview + Apply button */}
              {msg.filters && !msg.error && (
                <div className="mt-2.5 pt-2.5 border-t border-border/50">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-2">
                    Generated Filters
                  </p>
                  <div className="space-y-1">
                    {msg.filters.rules.map((rule, ri) => {
                      const r = rule as { field: string; operator: string; value: unknown }
                      return (
                        <div key={ri} className="flex items-center gap-1.5 text-xs">
                          <span className="text-accent font-medium">
                            {ri > 0 ? msg.filters!.logic : ''}
                          </span>
                          <span className="font-medium text-text-primary">{r.field}</span>
                          <span className="text-text-muted">{r.operator}</span>
                          <span className="font-semibold text-text-primary">
                            {Array.isArray(r.value) ? r.value.join('–') : String(r.value)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <button
                    onClick={() => handleApply(msg.filters!, i)}
                    disabled={appliedIndex === i}
                    className={cn(
                      'mt-2.5 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                      appliedIndex === i
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-accent text-white hover:bg-accent-hover',
                    )}
                  >
                    {appliedIndex === i ? (
                      <>
                        <Check className="h-3 w-3" />
                        Applied
                      </>
                    ) : (
                      'Apply to Builder'
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {aiSegment.isPending && (
          <div className="flex justify-start">
            <div className="bg-surface border border-border rounded-xl rounded-bl-sm px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generating filters...
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Language selector */}
      {speech.isSupported && (
        <div className="flex items-center gap-1 px-4 py-1.5 border-t border-border bg-surface/50">
          <span className="text-[10px] text-text-muted mr-1">Voice:</span>
          {SPEECH_LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => speech.setLanguage(lang.code)}
              title={lang.name}
              className={cn(
                'px-2 py-0.5 text-[10px] font-semibold rounded-full transition-colors',
                speech.language === lang.code
                  ? 'bg-accent text-white'
                  : 'text-text-muted hover:bg-surface hover:text-text-primary',
              )}
            >
              {lang.label}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2">
          {/* Mic button */}
          {speech.isSupported && (
            <button
              onClick={toggleMic}
              className={cn(
                'p-2 rounded-lg transition-colors flex-shrink-0',
                speech.isListening
                  ? 'bg-red-50 text-red-600 animate-pulse'
                  : 'text-text-muted hover:bg-surface hover:text-text-primary',
              )}
              title={speech.isListening ? 'Stop recording' : 'Start voice input'}
            >
              {speech.isListening ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>
          )}

          {/* Text input */}
          <input
            ref={inputRef}
            value={speech.isListening && speech.interimTranscript ? speech.interimTranscript : input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={speech.isListening ? 'Listening...' : 'Describe your segment...'}
            disabled={!aiEnabled || aiSegment.isPending || speech.isListening}
            className="flex-1 h-9 px-3 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-border-focus placeholder:text-text-muted disabled:bg-surface disabled:cursor-not-allowed"
          />

          {/* Send button */}
          <button
            onClick={() => handleSubmit()}
            disabled={!aiEnabled || !input.trim() || aiSegment.isPending}
            className="p-2 rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

const EXAMPLE_PROMPTS = [
  'Customers with verified KYC and active SIPs',
  'High-value customers with portfolio over 5 lakh',
  'Dormant users who haven\'t transacted in 90 days',
]
