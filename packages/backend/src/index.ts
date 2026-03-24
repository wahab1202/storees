import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import compression from 'compression'
import integrationRoutes from './routes/integrations.js'
import webhookRoutes from './routes/webhooks.js'
import customerRoutes from './routes/customers.js'
import segmentRoutes from './routes/segments.js'
import dashboardRoutes from './routes/dashboard.js'
import flowRoutes from './routes/flows.js'
import eventRoutes from './routes/events.js'
import aiRoutes from './routes/ai.js'
import productRoutes from './routes/products.js'
import campaignRoutes from './routes/campaigns.js'
import templateRoutes from './routes/templates.js'
import v1EventRoutes from './routes/v1Events.js'
import v1ApiKeyRoutes from './routes/v1ApiKeys.js'
import v1SchemaRoutes from './routes/v1Schema.js'
import onboardingRoutes from './routes/v1Onboarding.js'
import resendWebhookRoutes from './routes/resendWebhook.js'
import catalogueRoutes from './routes/catalogues.js'
import itemRoutes from './routes/items.js'
import interactionConfigRoutes from './routes/interactionConfig.js'
import { errorHandler } from './middleware/errorHandler.js'
import { startSyncWorker } from './workers/syncWorker.js'
import { startTriggerWorker } from './workers/triggerWorker.js'
import { startFlowWorker } from './workers/flowWorker.js'
import { startCampaignWorker } from './workers/campaignWorker.js'
import { startMetricsWorker } from './workers/metricsWorker.js'
import { startDeliveryWorker } from './workers/deliveryWorker.js'
import { startInteractionWorker } from './workers/interactionWorker.js'
import { registerProvider } from './services/deliveryService.js'
import { resendProvider } from './services/resendProvider.js'
import { pinnacleProvider } from './services/pinnacleProvider.js'

const app = express()
const port = process.env.PORT ?? 3001

// Compression for all responses
app.use(compression())

// Raw body for Shopify webhook HMAC verification — must be before JSON parser
app.use('/api/webhooks/shopify', express.raw({ type: 'application/json' }))

// JSON parser — 1MB limit for SDK batch events (default 100KB too small)
app.use(express.json({ limit: '1mb' }))

// CORS: SDK routes allow any origin (controlled by API key), admin routes restricted
app.use('/api/v1', cors({ origin: '*', methods: ['POST', 'GET', 'OPTIONS'] }))
app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  credentials: true,
}))

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// Routes
app.use('/api/integrations', integrationRoutes)
app.use('/api/webhooks', webhookRoutes)
app.use('/api/webhooks/resend', resendWebhookRoutes)
app.use('/api/customers', customerRoutes)

app.use('/api/segments', segmentRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/flows', flowRoutes)
app.use('/api/events', eventRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/products', productRoutes)
app.use('/api/campaigns', campaignRoutes)
app.use('/api/templates', templateRoutes)

// v1 API — generic event ingestion (API key auth)
app.use('/api/v1', v1EventRoutes)

// Admin panel routes (projectId auth)
app.use('/api/api-keys', v1ApiKeyRoutes)
app.use('/api/schema', v1SchemaRoutes)
app.use('/api/onboarding', onboardingRoutes)

// Phase 2: Item Catalogue + Interaction Engine
app.use('/api/catalogues', catalogueRoutes)
app.use('/api/items', itemRoutes)
app.use('/api/interaction-config', interactionConfigRoutes)

// Error handler — must be last
app.use(errorHandler)

// Register delivery providers
registerProvider('resend', resendProvider)
if (process.env.PINNACLE_API_URL) {
  registerProvider('pinnacle', pinnacleProvider)
}

// Start workers
startSyncWorker()
startTriggerWorker()
startFlowWorker()
startCampaignWorker()
startMetricsWorker()
startDeliveryWorker()
startInteractionWorker()

app.listen(port, () => {
  console.log(`Storees backend running on port ${port}`)
})

export default app
