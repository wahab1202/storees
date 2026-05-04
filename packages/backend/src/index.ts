import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
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
import predictionGoalRoutes from './routes/predictionGoals.js'
import consentRoutes from './routes/consent.js'
import verticalPackRoutes from './routes/verticalPacks.js'
import wizardRoutes from './routes/wizard.js'
import analyticsRoutes from './routes/analytics.js'
import predictionRoutes from './routes/predictions.js'
import sendTimeRoutes from './routes/sendTime.js'
import channelWebhookRoutes from './routes/channelWebhooks.js'
import whatsappAdminRoutes from './routes/whatsappAdmin.js'
import urlTrackerRoutes from './routes/urlTracker.js'
import authRoutes from './routes/auth.js'
import agentRoutes from './routes/agents.js'
import adminUserRoutes from './routes/adminUsers.js'
import unsubscribeRoutes from './routes/unsubscribe.js'
import { errorHandler } from './middleware/errorHandler.js'
import { requireAuth } from './middleware/requireAuth.js'
import { startSyncWorker } from './workers/syncWorker.js'
import { startTriggerWorker } from './workers/triggerWorker.js'
import { startFlowWorker } from './workers/flowWorker.js'
import { startCampaignWorker } from './workers/campaignWorker.js'
import { startMetricsWorker } from './workers/metricsWorker.js'
import { startDeliveryWorker } from './workers/deliveryWorker.js'
import { startInteractionWorker } from './workers/interactionWorker.js'
import { startScoringWorker } from './workers/scoringWorker.js'
import { startScoringScheduler } from './workers/scoringScheduler.js'
import { startTrainingWorker } from './workers/trainingWorker.js'
import { startCampaignScheduler } from './workers/campaignScheduler.js'
import { registerProvider } from './services/deliveryService.js'
import { resendProvider } from './services/resendProvider.js'
import { pinnacleProvider } from './services/pinnacleProvider.js'
import { registerAllProviders } from './services/providers/index.js'

const app = express()
const port = process.env.PORT ?? 3001

// Compression for all responses
app.use(compression())

// Raw body for Shopify webhook HMAC verification — must be before JSON parser
app.use('/api/webhooks/shopify', express.raw({ type: 'application/json' }))

// JSON parser — 1MB limit for SDK batch events (default 100KB too small)
app.use(express.json({ limit: '1mb' }))
// Twilio + some Gupshup webhooks send form-encoded payloads
app.use(express.urlencoded({ extended: true, limit: '1mb' }))

// CORS: SDK routes allow any origin (controlled by API key), admin routes restricted
app.use('/api/v1', cors({ origin: '*', methods: ['POST', 'GET', 'OPTIONS'] }))
const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:3000,http://localhost:3002')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error(`CORS: origin ${origin} not allowed`))
  },
  credentials: true,
}))

// Serve SDK static files at /sdk/ (e.g., /sdk/storees.min.js) — CORS enabled for all origins
const __dirname = path.dirname(fileURLToPath(import.meta.url))
app.use('/sdk', cors({ origin: '*' }), express.static(
  path.resolve(__dirname, '../../sdk/dist'),
  { maxAge: '1h', setHeaders: (res) => { res.setHeader('Access-Control-Allow-Origin', '*') } },
))

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// Auth routes — no admin auth required (login, register, etc.)
app.use('/api/auth', authRoutes)

// Webhook routes — no admin auth (authenticated by HMAC / provider signature)
app.use('/api/webhooks', webhookRoutes)
app.use('/api/webhooks/resend', resendWebhookRoutes)
app.use('/api/webhooks/channel', channelWebhookRoutes)

// v1 API — generic event ingestion (API key auth, not admin auth)
app.use('/api/v1', v1EventRoutes)

// URL tracker — public (redirect links)
app.use('/api/t', urlTrackerRoutes)

// Unsubscribe — public, mounted short for List-Unsubscribe header brevity
app.use('/u', unsubscribeRoutes)

// Admin panel routes — protected by requireAuth middleware
app.use('/api/integrations', requireAuth, integrationRoutes)
app.use('/api/customers', requireAuth, customerRoutes)
app.use('/api/segments', requireAuth, segmentRoutes)
app.use('/api/dashboard', requireAuth, dashboardRoutes)
app.use('/api/flows', requireAuth, flowRoutes)
app.use('/api/events', requireAuth, eventRoutes)
app.use('/api/ai', requireAuth, aiRoutes)
app.use('/api/products', requireAuth, productRoutes)
app.use('/api/campaigns', requireAuth, campaignRoutes)
app.use('/api/templates', requireAuth, templateRoutes)
app.use('/api/whatsapp', requireAuth, whatsappAdminRoutes)
app.use('/api/api-keys', requireAuth, v1ApiKeyRoutes)
app.use('/api/schema', requireAuth, v1SchemaRoutes)
app.use('/api/onboarding', requireAuth, onboardingRoutes)
app.use('/api/catalogues', requireAuth, catalogueRoutes)
app.use('/api/items', requireAuth, itemRoutes)
app.use('/api/interaction-config', requireAuth, interactionConfigRoutes)
app.use('/api/prediction-goals', requireAuth, predictionGoalRoutes)
app.use('/api/consent', requireAuth, consentRoutes)
app.use('/api/packs', requireAuth, verticalPackRoutes)
app.use('/api/wizard', requireAuth, wizardRoutes)
app.use('/api/analytics', requireAuth, analyticsRoutes)
app.use('/api/predictions', requireAuth, predictionRoutes)
app.use('/api/send-time', requireAuth, sendTimeRoutes)
app.use('/api/agents', requireAuth, agentRoutes)
app.use('/api/admin-users', requireAuth, adminUserRoutes)

// Error handler — must be last
app.use(errorHandler)

// Register delivery providers
registerProvider('resend', resendProvider)
if (process.env.PINNACLE_API_URL) {
  registerProvider('pinnacle', pinnacleProvider)
}

// Register all channel providers (SMS, WhatsApp, Push)
registerAllProviders()

// Start workers
startSyncWorker()
startTriggerWorker()
startFlowWorker()
startCampaignWorker()
startMetricsWorker()
startDeliveryWorker()
startInteractionWorker()
startScoringWorker()
startScoringScheduler()
startTrainingWorker()
startCampaignScheduler()

app.listen(port, () => {
  console.log(`Storees backend running on port ${port}`)
})

export default app
