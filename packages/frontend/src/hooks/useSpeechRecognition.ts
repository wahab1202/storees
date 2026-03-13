'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

type SpeechRecognitionHook = {
  isListening: boolean
  transcript: string
  interimTranscript: string
  isSupported: boolean
  start: () => void
  stop: () => void
  language: string
  setLanguage: (lang: string) => void
}

export const SPEECH_LANGUAGES = [
  { code: 'en-US', label: 'EN', name: 'English' },
  { code: 'ta-IN', label: 'TA', name: 'Tamil' },
  { code: 'hi-IN', label: 'HI', name: 'Hindi' },
  { code: 'fr-FR', label: 'FR', name: 'French' },
  { code: 'es-ES', label: 'ES', name: 'Spanish' },
  { code: 'zh-CN', label: 'ZH', name: 'Mandarin' },
]

export function useSpeechRecognition(): SpeechRecognitionHook {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [language, setLanguage] = useState('en-US')
  const [isSupported, setIsSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  // Detect browser support on client only (avoids SSR hydration mismatch)
  useEffect(() => {
    setIsSupported(
      'SpeechRecognition' in window || 'webkitSpeechRecognition' in window,
    )
  }, [])

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
    setInterimTranscript('')
  }, [])

  const start = useCallback(() => {
    if (!isSupported) return

    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionCtor) return
    const recognition = new SpeechRecognitionCtor()

    recognition.lang = language
    recognition.interimResults = true  // show partial results while speaking
    recognition.continuous = true      // keep mic open — don't auto-close on silence
    recognition.maxAlternatives = 1

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = ''
      let interimText = ''
      // resultIndex may not be in all TS lib versions — cast to access it
      const startIndex = (event as unknown as { resultIndex: number }).resultIndex ?? 0

      for (let i = startIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalText += text
        } else {
          interimText += text
        }
      }

      if (interimText) {
        setInterimTranscript(interimText)
      }

      if (finalText) {
        // Got a complete utterance — set transcript and stop listening
        setTranscript(finalText.trim())
        setInterimTranscript('')
        recognition.stop()
      }
    }

    recognition.onerror = (event: Event) => {
      const error = (event as unknown as { error: string }).error
      // 'no-speech' is common and expected — don't treat as fatal
      if (error !== 'no-speech') {
        console.warn('[Speech] Recognition error:', error)
      }
      setIsListening(false)
      setInterimTranscript('')
      recognitionRef.current = null
    }

    recognition.onend = () => {
      setIsListening(false)
      setInterimTranscript('')
      recognitionRef.current = null
    }

    recognitionRef.current = recognition
    setTranscript('')
    setInterimTranscript('')
    setIsListening(true)
    recognition.start()
  }, [isSupported, language])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [])

  return { isListening, transcript, interimTranscript, isSupported, start, stop, language, setLanguage }
}
