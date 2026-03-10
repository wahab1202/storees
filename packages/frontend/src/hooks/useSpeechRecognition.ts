'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

type SpeechRecognitionHook = {
  isListening: boolean
  transcript: string
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
  const [language, setLanguage] = useState('en-US')
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
  }, [])

  const start = useCallback(() => {
    if (!isSupported) return

    // Stop any existing recognition
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionCtor) return
    const recognition = new SpeechRecognitionCtor()

    recognition.lang = language
    recognition.interimResults = false
    recognition.continuous = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[0][0].transcript
      setTranscript(result)
      setIsListening(false)
    }

    recognition.onerror = () => {
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
      recognitionRef.current = null
    }

    recognitionRef.current = recognition
    setTranscript('')
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

  return { isListening, transcript, isSupported, start, stop, language, setLanguage }
}
