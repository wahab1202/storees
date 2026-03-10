import 'dotenv/config'
import express from 'express'
import cors from 'cors'
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
import { errorHandler } from './middleware/errorHandler.js'
import { startSyncWorker } from './workers/syncWorker.js'
import { startTriggerWorker } from './workers/triggerWorker.js'
import { startFlowWorker } from './workers/flowWorker.js'
import { startCampaignWorker } from './workers/campaignWorker.js'

const app = express()
const port = process.env.PORT ?? 3001

// Raw body for webhook HMAC verification — must be before JSON parser
app.use('/api/webhooks', express.raw({ type: 'application/json' }))

// JSON parser for all other routes
app.use(express.json())

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
app.use('/api/customers', customerRoutes)

app.use('/api/segments', segmentRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/flows', flowRoutes)
app.use('/api/events', eventRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/products', productRoutes)
app.use('/api/campaigns', campaignRoutes)

// Error handler — must be last
app.use(errorHandler)

// Start workers
startSyncWorker()
startTriggerWorker()
startFlowWorker()
startCampaignWorker()

app.listen(port, () => {
  console.log(`Storees backend running on port ${port}`)
})

export default app
