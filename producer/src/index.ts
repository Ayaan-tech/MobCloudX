import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { init } from './config/start.services.js'
import postRoutes from './services/telemetry-service.js'
import kafkaConfig from './config/kafka.config.js'
import { collectDefaultMetrics, Counter, Histogram, register } from 'prom-client'

const app = new Hono()

collectDefaultMetrics({
  register,
  prefix: 'producer_'
})

const httpRequestsTotal = new Counter({
  name: 'http_server_requests_total',
  help: 'Total HTTP requests handled by the service',
  labelNames: ['method', 'route', 'status_code', 'job'] as const,
  registers: [register]
})

const httpRequestDurationSeconds = new Histogram({
  name: 'http_server_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code', 'job'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register]
})

app.use('*', async (c, next) => {
  const start = performance.now()
  await next()
  const durationSec = (performance.now() - start) / 1000
  const labels = {
    method: c.req.method,
    route: c.req.path,
    status_code: String(c.res.status),
    job: 'producer'
  }
  httpRequestsTotal.inc(labels)
  httpRequestDurationSeconds.observe(labels, durationSec)
})

app.route('/', postRoutes)
app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.get('/metrics', async (c) => {
  c.header('Content-Type', register.contentType)
  return c.body(await register.metrics())
})

app.get('/health', async(c) => c.json({ ok: true}))

// Initialize Kafka before starting the server
init().then(() => {
  serve({
    fetch: app.fetch,
    port: 3001
  }, (info) => {
    console.log(`Server is running on http://localhost:${info.port}`)
  })
}).catch(err => {
  console.error('Failed to initialize services:', err)
  process.exit(1)
})
