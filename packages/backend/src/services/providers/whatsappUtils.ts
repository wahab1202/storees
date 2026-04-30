/** Count positional template params: {{1}}, {{2}}... → returns the highest index seen. */
export function countParameters(body: string): number {
  const matches = body.match(/\{\{(\d+)\}\}/g)
  if (!matches) return 0
  return matches.reduce((max, m) => {
    const n = parseInt(m.slice(2, -2), 10)
    return Number.isFinite(n) ? Math.max(max, n) : max
  }, 0)
}
