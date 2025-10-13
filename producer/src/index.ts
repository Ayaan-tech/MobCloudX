import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { init } from './config/start.services.js'
import postRoutes from './services/telemetry-service.js'
import kafkaConfig from './config/kafka.config.js'
const app = new Hono()
init()
app.route('/', postRoutes)
app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.get('/health', async(c) => c.json({ ok: true}))
serve({
  fetch: app.fetch,
  port: 3001
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
