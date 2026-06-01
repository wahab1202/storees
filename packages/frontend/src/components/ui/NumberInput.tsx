'use client'

import { useState, useEffect, type InputHTMLAttributes } from 'react'

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  /** Current numeric value. `undefined`/`null` renders the input empty. */
  value: number | undefined | null
  /** Receives the parsed number, or `undefined` when the user empties the input.
   *  If your state is `number` (not nullable), do `n => set(n ?? 0)` at the call
   *  site — the empty UI state still works because this component keeps its own
   *  string mirror; the underlying state can stay 0 without snapping the field
   *  back to "0". */
  onChange: (next: number | undefined) => void
}

/**
 * Number input that can actually be cleared.
 *
 * The native React pattern `value={n}` + `onChange={e => set(Number(e.target.value))}`
 * has a well-known papercut: when the user backspaces to empty, `Number('')`
 * is 0, the parent re-renders with `value={0}`, and the input snaps back to
 * "0" — they can never get the field empty to type a fresh number, so they
 * end up with "01", "02" etc.
 *
 * This component keeps a local string mirror so the empty state is real, and
 * sync-down from the parent never clobbers a user-typed empty input.
 */
export function NumberInput({ value, onChange, ...rest }: NumberInputProps) {
  const [raw, setRaw] = useState(value == null ? '' : String(value))

  useEffect(() => {
    // Don't clobber an empty input — parent state often re-defaults
    // undefined to 0 immediately, and we don't want that 0 to snap right
    // back into the field while the user is mid-edit.
    if (raw === '') return
    const parsed = Number(raw)
    if (Number.isFinite(parsed) && parsed === value) return
    setRaw(value == null ? '' : String(value))
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input
      {...rest}
      type="number"
      value={raw}
      onChange={e => {
        const next = e.target.value
        setRaw(next)
        if (next === '' || next === '-') {
          onChange(undefined)
          return
        }
        const n = Number(next)
        if (Number.isFinite(n)) onChange(n)
      }}
    />
  )
}
