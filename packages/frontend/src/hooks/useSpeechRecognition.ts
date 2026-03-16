'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

type SpeechRecognitionHook = {
  isListening: boolean
  transcript: string
  interimTranscript: string
  isSupported: boolean
  error: string | null
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
  const [error, setError] = useState<string | null>(null)
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

  const start = useCallback(async () => {
    if (!isSupported) return

    setError(null)

    // Request microphone permission explicitly before starting recognition
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Release the stream immediately — we only needed to trigger the permission prompt
      stream.getTracks().forEach(t => t.stop())
    } catch {
      setError('Microphone access denied. Please allow microphone permission and try again.')
      return
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionCtor) return
    const recognition = new SpeechRecognitionCtor()

    recognition.lang = language
    recognition.interimResults = true
    recognition.continuous = false // non-continuous is more reliable across Chromium forks
    recognition.maxAlternatives = 1

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = ''
      let interimText = ''
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
        setTranscript(finalText.trim())
        setInterimTranscript('')
        recognition.stop()
      }
    }

    recognition.onerror = (event: Event) => {
      const errCode = (event as unknown as { error: string }).error
      recognitionRef.current = null
      setIsListening(false)
      setInterimTranscript('')

      if (errCode === 'no-speech') return // expected — user didn't say anything
      if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
        setError('Microphone access denied. Check browser permissions.')
      } else if (errCode === 'network') {
        setError('Speech recognition requires an internet connection.')
      } else if (errCode === 'aborted') {
        // User or system cancelled — not an error
      } else {
        setError(`Speech recognition error: ${errCode}`)
      }
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

    try {
      recognition.start()
    } catch (e) {
      setError(`Failed to start: ${e instanceof Error ? e.message : 'unknown error'}`)
      setIsListening(false)
      recognitionRef.current = null
    }
  }, [isSupported, language])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [])

  return { isListening, transcript, interimTranscript, isSupported, error, start, stop, language, setLanguage }
}
