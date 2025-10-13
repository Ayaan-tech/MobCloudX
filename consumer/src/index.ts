import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { initDB } from './config/db.config.js'
import { startConsumerServices } from './services/consumer.service.js'

const app = new Hono()
initDB()
app.get('/', (c) => {
  return c.text('Hello Hono!')
})

startConsumerServices().catch(err => {
  console.error('Fatal unhandled error during consumer startup', err);
  process.exit(1);
})

serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
