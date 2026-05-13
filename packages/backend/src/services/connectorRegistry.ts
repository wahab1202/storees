import type { ConnectorTemplate } from './connectors/genericHttpConnector.js'
import { VIRPANAI_TEMPLATE } from './connectors/templates/virpanai.js'
import { CUSTOM_TEMPLATE } from './connectors/templates/custom.js'

// Registry of all built-in templates. Adding a new template = adding a TS
// file under templates/ that exports a ConnectorTemplate, then registering
// it here. The frontend's "Add Connector" dialog reads listTemplates() to
// populate its picker.

const TEMPLATES: Record<string, ConnectorTemplate> = {
  [VIRPANAI_TEMPLATE.id]: VIRPANAI_TEMPLATE,
  [CUSTOM_TEMPLATE.id]: CUSTOM_TEMPLATE,
}

export function listTemplates(): Array<{ id: string; label: string; description: string }> {
  return Object.values(TEMPLATES).map((t) => ({
    id: t.id,
    label: t.label,
    description: t.description,
  }))
}

export function getTemplate(id: string): ConnectorTemplate | undefined {
  return TEMPLATES[id]
}

// Used when a user picks a template in the UI — we deep-clone so the per-row
// `config` stored in DB can be edited without affecting the built-in.
export function cloneTemplate(id: string): ConnectorTemplate | undefined {
  const t = TEMPLATES[id]
  if (!t) return undefined
  return JSON.parse(JSON.stringify(t)) as ConnectorTemplate
}
