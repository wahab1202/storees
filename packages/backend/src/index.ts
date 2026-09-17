import 'dotenv/config'
// Must sit directly after dotenv and before every other import: it installs the
// outbound-call block, and a module imported earlier could call out first.
import './safeMode.js'
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
import emailSenderRoutes from './routes/emailSenders.js'
import subscriptionCategoryRoutes from './routes/subscriptionCategories.js'
import v1EventRoutes from './routes/v1Events.js'
import v1ImportRoutes from './routes/v1Import.js'
import v1OptInRoutes from './routes/v1OptIn.js'
import v1RecognizeRoutes from './routes/v1Recognize.js'
import v1ApiKeyRoutes from './routes/v1ApiKeys.js'
import v1SchemaRoutes from './routes/v1Schema.js'
import onboardingRoutes from './routes/v1Onboarding.js'
import resendWebhookRoutes from './routes/resendWebhook.js'
import catalogueRoutes from './routes/catalogues.js'
import itemRoutes from './routes/items.js'
import interactionConfigRoutes from './routes/interactionConfig.js'
import eventMappingRoutes from './routes/eventMapping.js'
import predictionGoalRoutes from './routes/predictionGoals.js'
import consentRoutes from './routes/consent.js'
import verticalPackRoutes from './routes/verticalPacks.js'
import wizardRoutes from './routes/wizard.js'
import analyticsRoutes from './routes/analytics.js'
import identityRoutes from './routes/identity.js'
import recommendationsRoutes from './routes/recommendations.js'
import deviceIdRoutes from './routes/deviceId.js'
import predictionRoutes from './routes/predictions.js'
import sendTimeRoutes from './routes/sendTime.js'
import channelWebhookRoutes from './routes/channelWebhooks.js'
import whatsappAdminRoutes from './routes/whatsappAdmin.js'
import dataConnectorRoutes from './routes/dataConnectors.js'
import webhookSubscriptionRoutes from './routes/webhookSubscriptions.js'
import adConversionRoutes from './routes/adConversions.js'
import v1InAppMessageRoutes from './routes/v1InAppMessages.js'
import urlTrackerRoutes from './routes/urlTracker.js'
import hooksRoutes from './routes/hooks.js'
import inboundWebhookRoutes from './routes/inboundWebhooks.js'
import authRoutes from './routes/auth.js'
import agentRoutes from './routes/agents.js'
import adminUserRoutes from './routes/adminUsers.js'
import superAdminRoutes from './routes/superAdmin.js'
import logsRoutes from './routes/logs.js'
import unsubscribeRoutes from './routes/unsubscribe.js'
import optinWidgetRoutes from './routes/optinWidgets.js'
import assetRoutes from './routes/assets.js'
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
import { startPredictionTriggerWorker } from './workers/predictionTriggerWorker.js'
import { startTemplateStatusWorker } from './workers/templateStatusWorker.js'
import { startIdentityMergeWorker } from './workers/identityMergeWorker.js'
import { startCustomerAggregateWorker, runStartupCatchUp } from './workers/customerAggregateWorker.js'
import { startAggregateReconcileWorker } from './workers/aggregateReconcileWorker.js'
import { startDataSyncWorker } from './workers/dataSyncWorker.js'
import { startWebhookDeliveryWorker } from './workers/webhookDeliveryWorker.js'
import { startScoringScheduler } from './workers/scoringScheduler.js'
import { startTrainingWorker } from './workers/trainingWorker.js'
import { startCampaignScheduler } from './workers/campaignScheduler.js'
import { startFlowFixedTimeScheduler } from './workers/flowFixedTimeScheduler.js'
import { registerProvider } from './services/deliveryService.js'
import { resendProvider } from './services/resendProvider.js'
import { pinnacleProvider } from './services/pinnacleProvider.js'
import { registerAllProviders } from './services/providers/index.js'
import { runMigrations } from './db/migrate.js'

const app = express()
const port = process.env.PORT ?? 3001

// Compression for all responses
app.use(compression())

// Raw body for Shopify webhook HMAC verification — must be before JSON parser
app.use('/api/webhooks/shopify', express.raw({ type: 'application/json' }))
// Resend webhooks use svix HMAC signing — verification needs the raw body
app.use('/api/webhooks/resend', express.raw({ type: 'application/json' }))

// Campaign drafts can include attachment uploads as base64 payloads.
app.use('/api/campaigns', express.json({ limit: '30mb' }))
// Email builder image uploads are passed as base64 JSON and then served as public assets.
app.use('/api/assets', express.json({ limit: '8mb' }))
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
const restrictiveCors = cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error(`CORS: origin ${origin} not allowed`))
  },
  credentials: true,
})
// Apply the restrictive (dashboard) CORS to everything EXCEPT the public SDK /
// ingestion paths. Those are called from arbitrary merchant storefronts and set
// their own permissive `origin: '*'` CORS above (/api/v1) or below (/sdk,
// /uploads). Without this skip, the global allowlist re-runs on /api/v1 and
// rejects every storefront origin (e.g. finewine-cosmetics.com).
app.use((req, res, next) => {
  if (req.path.startsWith('/api/v1') || req.path.startsWith('/sdk') || req.path.startsWith('/uploads')) {
    return next()
  }
  restrictiveCors(req, res, next)
})

// Server-set first-party device id (Phase 2 · 2c). origin:true reflects the
// caller's origin (not '*') so the SDK can send credentials and the cookie can
// be set — durable when reached first-party via a merchant CNAME.
app.use('/id', cors({ origin: true, credentials: true }), deviceIdRoutes)

// Serve SDK static files at /sdk/ (e.g., /sdk/storees.min.js) — CORS enabled for all origins
const __dirname = path.dirname(fileURLToPath(import.meta.url))
app.use('/sdk', cors({ origin: '*' }), express.static(
  path.resolve(__dirname, '../../sdk/dist'),
  { maxAge: '1h', setHeaders: (res) => { res.setHeader('Access-Control-Allow-Origin', '*') } },
))
app.use('/uploads/email-assets', cors({ origin: '*' }), express.static(
  process.env.ASSET_UPLOAD_ROOT ?? path.resolve(process.cwd(), '.storees/uploads/email-assets'),
  { maxAge: '30d', immutable: true, setHeaders: (res) => { res.setHeader('Access-Control-Allow-Origin', '*') } },
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
app.use('/api/v1', v1ImportRoutes)
app.use('/api/v1', v1OptInRoutes)
app.use('/api/v1', v1RecognizeRoutes)

// Inbound-webhook receiver — public; the URL token is the auth
app.use('/api/hooks', hooksRoutes)

// Click redirect — public. /c is the short form baked into WhatsApp button URLs;
// /api/t is the legacy alias. Both resolve via the durable short-link service.
app.use('/c', urlTrackerRoutes)
app.use('/api/t', urlTrackerRoutes)

// Unsubscribe — public, mounted short for List-Unsubscribe header brevity
app.use('/u', unsubscribeRoutes)

// Admin panel routes — protected by requireAuth middleware.
// NOTE: integrations is mounted WITHOUT a blanket requireAuth — the Shopify
// OAuth install + callback are browser/Shopify redirects that can't carry an
// Authorization header. The router applies requireAuth per-route to the
// authenticated endpoints (status/sync) instead.
app.use('/api/integrations', integrationRoutes)
app.use('/api/customers', requireAuth, customerRoutes)
app.use('/api/segments', requireAuth, segmentRoutes)
app.use('/api/dashboard', requireAuth, dashboardRoutes)
app.use('/api/flows', requireAuth, flowRoutes)
app.use('/api/events', requireAuth, eventRoutes)
app.use('/api/inbound-webhooks', requireAuth, inboundWebhookRoutes)
app.use('/api/ai', requireAuth, aiRoutes)
app.use('/api/products', requireAuth, productRoutes)
app.use('/api/campaigns', requireAuth, campaignRoutes)
app.use('/api/templates', requireAuth, templateRoutes)
app.use('/api/email-senders', requireAuth, emailSenderRoutes)
app.use('/api/subscription-categories', requireAuth, subscriptionCategoryRoutes)
app.use('/api/whatsapp', requireAuth, whatsappAdminRoutes)
app.use('/api/data-sources', requireAuth, dataConnectorRoutes)
app.use('/api/outbound-webhooks', requireAuth, webhookSubscriptionRoutes)
app.use('/api/ad-conversions', requireAuth, adConversionRoutes)
app.use('/api/v1', v1InAppMessageRoutes)
app.use('/api/api-keys', requireAuth, v1ApiKeyRoutes)
app.use('/api/schema', requireAuth, v1SchemaRoutes)
app.use('/api/onboarding', requireAuth, onboardingRoutes)
app.use('/api/catalogues', requireAuth, catalogueRoutes)
app.use('/api/items', requireAuth, itemRoutes)
app.use('/api/interaction-config', requireAuth, interactionConfigRoutes)
app.use('/api/event-mapping', requireAuth, eventMappingRoutes)
app.use('/api/prediction-goals', requireAuth, predictionGoalRoutes)
app.use('/api/consent', requireAuth, consentRoutes)
app.use('/api/packs', requireAuth, verticalPackRoutes)
app.use('/api/wizard', requireAuth, wizardRoutes)
app.use('/api/analytics', requireAuth, analyticsRoutes)
app.use('/api/identity', requireAuth, identityRoutes)
app.use('/api/recommendations', requireAuth, recommendationsRoutes)
app.use('/api/predictions', requireAuth, predictionRoutes)
app.use('/api/send-time', requireAuth, sendTimeRoutes)
app.use('/api/agents', requireAuth, agentRoutes)
app.use('/api/admin-users', requireAuth, adminUserRoutes)
app.use('/api/super-admin', requireAuth, superAdminRoutes)
app.use('/api/logs', requireAuth, logsRoutes)
app.use('/api/optin-widgets', requireAuth, optinWidgetRoutes)
app.use('/api/assets', requireAuth, assetRoutes)

// Error handler — must be last
app.use(errorHandler)

// Register delivery providers
registerProvider('resend', resendProvider)
if (process.env.PINNACLE_API_URL) {
  registerProvider('pinnacle', pinnacleProvider)
}

// Register all channel providers (SMS, WhatsApp, Push)
registerAllProviders()

async function bootstrap() {
  // Apply any unapplied SQL migrations before the API starts serving traffic
  // or workers attach to queues. A failed migration aborts boot — better to
  // refuse to start than serve against a half-applied schema.
  try {
    await runMigrations()
  } catch (err) {
    console.error('[bootstrap] Migration step failed; refusing to start.', err)
    process.exit(1)
  }

  // Bootstrap cross-tenant super admins from STOREES_PLATFORM_ADMINS so existing
  // platform operators keep access after the 0085 membership change. Idempotent,
  // and a no-op when the variable is unset — it only writes to our own database,
  // so it runs on both sides of the SAFE gate below.
  const { seedSuperAdmins } = await import('./middleware/membership.js')
  await seedSuperAdmins()

  // LOCAL_SAFE_MODE: run only the workers that read and write our own database.
  // Everything that can reach a real customer or an external service — message
  // delivery, campaign and flow senders, store sync, outbound webhooks,
  // template-status polling, and the automatic training/scoring schedulers —
  // stays off. The flag is unset in production, so this branch changes nothing
  // about a real deployment.
  const SAFE = process.env.LOCAL_SAFE_MODE === 'true'

  // Local read-model workers — safe, they only touch our own database
  startMetricsWorker()
  startIdentityMergeWorker()
  startCustomerAggregateWorker()


  // Training belongs here, not behind the gate.
  //
  // It sat with the senders and external pollers, so a local Re-train queued a job that
  // nothing ever picked up: no error, no spinner, no change — the click simply vanished.
  // But training reaches nothing outside this machine. It reads our own database and
  // calls the ML service on localhost. The SCHEDULER that fires it on a timer stays
  // gated, so nothing trains locally unless a person asks for it.
  startTrainingWorker()

  // Scoring belongs with it, for the same reason and by the same test.
  //
  // Training ends by queueing a scoring job — that is how a new model reaches the
  // customers. With this worker gated, the job was queued and nothing ever ran it, so a
  // model trained today served scores computed by an older one: the Dormancy screen
  // showed every customer scored `24/08/2026` beside a model trained on the 28th, with
  // nothing to say the two were unrelated.
  //
  // Like training, it reads our own database and calls the ML service on localhost. It
  // sends nothing outward. The SCHEDULER that rescores everything on a timer stays gated
  // below, so scoring still only happens as a consequence of somebody training.
  startScoringWorker()

  if (!SAFE) {
    startSyncWorker()
    startTriggerWorker()
    startFlowWorker()
    startCampaignWorker()
    startDeliveryWorker()
    startInteractionWorker()
    startScoringScheduler()
    // The scheduler's counterpart for goals it cannot serve. A window shorter than the
    // scheduler's own period opens and closes between two of its wake-ups, so those
    // goals are scored when their event arrives instead. Gated alongside the scheduler
    // deliberately: it is the same act — rescoring on a signal rather than on a
    // request — and SAFE mode's rule is that scoring only follows from somebody
    // training.
    startPredictionTriggerWorker()
    const { startPredictionTrainingScheduler } = await import('./workers/predictionTrainingScheduler.js')
    startPredictionTrainingScheduler()
    const { startLiveEvalScheduler } = await import('./workers/predictionLiveEvalScheduler.js')
    startLiveEvalScheduler()
    startCampaignScheduler()
    startFlowFixedTimeScheduler()
    startTemplateStatusWorker()
    startDataSyncWorker()
    startWebhookDeliveryWorker()
    // Nightly rebuild of customer aggregates from the orders table — his
    // self-healing backstop for the "card shows 6, Orders tab shows 40" bug.
    // Database-only, but it is a TIMER, and this gate's stated rule is that the
    // automatic schedulers stay off locally. Move it above the gate if a local
    // run should self-heal too.
    startAggregateReconcileWorker()
  } else {
    console.log('[bootstrap] LOCAL_SAFE_MODE: senders, sync and external pollers are OFF — local only.')
  }


  // One-shot catch-up: process any events ingested before the aggregate worker
  // was running. Idempotent (events.processed_at guard). Backgrounded so boot
  // isn't blocked on large historical scans.
  runStartupCatchUp().catch(err => {
    console.error('[customer-aggregate] startup catch-up failed:', err)
  })

  app.listen(port, () => {
    console.log(`Storees backend running on port ${port}`)
  })
}

bootstrap()

export default app
