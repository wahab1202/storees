import type { DeviceContext } from './types'

function parseOS(ua: string): string {
  if (/Windows/.test(ua)) return 'Windows'
  if (/Mac OS X/.test(ua)) return 'macOS'
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS'
  if (/Android/.test(ua)) return 'Android'
  if (/Linux/.test(ua)) return 'Linux'
  if (/CrOS/.test(ua)) return 'ChromeOS'
  return 'Unknown'
}

function parseBrowser(ua: string): { name: string; version: string } {
  // Order matters — check specific browsers before generic ones
  const patterns: Array<[string, RegExp]> = [
    ['Edge', /Edg(?:e|A|iOS)?\/(\d+[\d.]*)/],
    ['Opera', /(?:OPR|Opera)\/(\d+[\d.]*)/],
    ['Chrome', /Chrome\/(\d+[\d.]*)/],
    ['Firefox', /Firefox\/(\d+[\d.]*)/],
    ['Safari', /Version\/(\d+[\d.]*).*Safari/],
  ]

  for (const [name, regex] of patterns) {
    const match = ua.match(regex)
    if (match) return { name, version: match[1] || '' }
  }

  return { name: 'Unknown', version: '' }
}

function getDeviceType(): 'desktop' | 'mobile' | 'tablet' {
  const width = window.screen.width
  if (width <= 768) return 'mobile'
  if (width <= 1024) return 'tablet'
  return 'desktop'
}

let cachedContext: DeviceContext | null = null

export function getDeviceContext(): DeviceContext {
  if (cachedContext) return cachedContext

  const ua = navigator.userAgent
  const browser = parseBrowser(ua)

  cachedContext = {
    os: parseOS(ua),
    browser: browser.name,
    browser_version: browser.version,
    screen_width: window.screen.width,
    screen_height: window.screen.height,
    device_type: getDeviceType(),
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }

  return cachedContext
}
