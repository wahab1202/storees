import { describe, it, expect } from 'vitest'
import { readChatbotConfig, wantsHumanHandoff, selectRelevantFaqs, type ChatbotConfig } from './whatsappChatbotService.js'

describe('readChatbotConfig', () => {
  it('defaults to disabled with safe empty config', () => {
    const cfg = readChatbotConfig({})
    expect(cfg.enabled).toBe(false)
    expect(cfg.faqs).toEqual([])
    expect(cfg.handoffKeywords).toEqual([])
    expect(cfg.maxTurns).toBe(8)
    expect(cfg.answerUnknown).toBe(false)
  })

  it('reads answerUnknown only when explicitly true', () => {
    expect(readChatbotConfig({ channels: { whatsapp: { chatbot: { answerUnknown: true } } } }).answerUnknown).toBe(true)
    expect(readChatbotConfig({ channels: { whatsapp: { chatbot: { answerUnknown: 'yes' } } } }).answerUnknown).toBe(false)
  })

  it('reads an enabled chatbot config from settings.channels.whatsapp.chatbot', () => {
    const cfg = readChatbotConfig({
      channels: { whatsapp: { chatbot: {
        enabled: true,
        greeting: 'Hi!',
        handoffKeywords: ['refund', 'complaint'],
        faqs: [{ q: 'Hours?', a: '9-5' }],
        maxTurns: 5,
      } } },
    })
    expect(cfg.enabled).toBe(true)
    expect(cfg.greeting).toBe('Hi!')
    expect(cfg.handoffKeywords).toEqual(['refund', 'complaint'])
    expect(cfg.faqs).toEqual([{ q: 'Hours?', a: '9-5' }])
    expect(cfg.maxTurns).toBe(5)
  })

  it('drops malformed faqs and non-string keywords', () => {
    const cfg = readChatbotConfig({
      channels: { whatsapp: { chatbot: {
        enabled: true,
        handoffKeywords: ['ok', 42, null],
        faqs: [{ q: 'A', a: 'B' }, { q: 'no answer' }, 'nope'],
      } } },
    })
    expect(cfg.handoffKeywords).toEqual(['ok'])
    expect(cfg.faqs).toEqual([{ q: 'A', a: 'B' }])
  })

  it('ignores a non-positive maxTurns', () => {
    expect(readChatbotConfig({ channels: { whatsapp: { chatbot: { maxTurns: 0 } } } }).maxTurns).toBe(8)
    expect(readChatbotConfig({ channels: { whatsapp: { chatbot: { maxTurns: -3 } } } }).maxTurns).toBe(8)
  })

  it('tolerates undefined / junk settings', () => {
    expect(readChatbotConfig(undefined).enabled).toBe(false)
    expect(readChatbotConfig('nope').enabled).toBe(false)
  })
})

describe('wantsHumanHandoff', () => {
  const base: ChatbotConfig = { enabled: true, handoffKeywords: [], faqs: [], maxTurns: 8, answerUnknown: false }

  it('matches built-in human-request patterns (case-insensitive)', () => {
    expect(wantsHumanHandoff('can I speak to a HUMAN', base)).toBe(true)
    expect(wantsHumanHandoff('connect me to an agent please', base)).toBe(true)
    expect(wantsHumanHandoff('I want to talk to a person', base)).toBe(true)
  })

  it('matches configured handoff keywords', () => {
    const cfg = { ...base, handoffKeywords: ['refund'] }
    expect(wantsHumanHandoff('I need a REFUND on my order', cfg)).toBe(true)
  })

  it('returns false for ordinary questions', () => {
    expect(wantsHumanHandoff('where is my order?', base)).toBe(false)
    expect(wantsHumanHandoff('do you have this in blue?', base)).toBe(false)
  })
})

describe('selectRelevantFaqs', () => {
  const faqs = [
    { q: 'What are your shipping times?', a: 'Orders ship in 2-3 days.' },
    { q: 'Do you offer returns?', a: 'Returns within 30 days.' },
    { q: 'Where are you located?', a: 'Mumbai, India.' },
    { q: 'What payment methods?', a: 'UPI, cards, COD.' },
    { q: 'Do you ship internationally?', a: 'Yes, shipping worldwide.' },
    { q: 'How do I track my package?', a: 'Use the tracking link in your email.' },
    { q: 'Is gift wrapping available?', a: 'Yes, at checkout.' },
    { q: 'What is your warranty?', a: '1 year warranty.' },
    { q: 'Can I change my order?', a: 'Within 1 hour of ordering.' },
  ]

  it('returns all FAQs when the set is at/below the cap', () => {
    const few = faqs.slice(0, 5)
    expect(selectRelevantFaqs(few, 'anything', 8)).toEqual(few)
  })

  it('keeps the most relevant FAQs by word overlap when over the cap', () => {
    const picked = selectRelevantFaqs(faqs, 'how long is shipping and do you ship worldwide', 3)
    expect(picked.length).toBe(3)
    const qs = picked.map(f => f.q)
    expect(qs).toContain('What are your shipping times?')
    expect(qs).toContain('Do you ship internationally?')
  })

  it('falls back to the first N when the query has no useful words', () => {
    const picked = selectRelevantFaqs(faqs, 'i a to', 4)
    expect(picked.length).toBe(4)
  })
})
