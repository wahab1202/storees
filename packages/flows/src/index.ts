// Runtime flow execution lives in packages/backend/src/services/flowExecutor.ts
// and packages/backend/src/workers/triggerWorker.ts. This package only ships
// the curated flow-template catalogue that's used to seed projects.
export { FLOW_TEMPLATE_DEFINITIONS } from './templates.js'
