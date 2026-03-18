import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { initDB } from './config/db.config.js';
import { startConsumerServices } from './services/consumer.service.js';
import { collectDefaultMetrics, Counter, Histogram, register } from 'prom-client';
const app = new Hono();
collectDefaultMetrics({
    register,
    prefix: 'consumer_'
});
const httpRequestsTotal = new Counter({
    name: 'http_server_requests_total',
    help: 'Total HTTP requests handled by the service',
    labelNames: ['method', 'route', 'status_code', 'job'],
    registers: [register]
});
const httpRequestDurationSeconds = new Histogram({
    name: 'http_server_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code', 'job'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [register]
});
app.use('*', async (c, next) => {
    const start = performance.now();
    await next();
    const durationSec = (performance.now() - start) / 1000;
    const labels = {
        method: c.req.method,
        route: c.req.path,
        status_code: String(c.res.status),
        job: 'consumer'
    };
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSec);
});
initDB();
app.get('/', (c) => {
    return c.text('Hello Hono!');
});
app.get('/health', (c) => c.json({ ok: true }));
app.get('/metrics', async (c) => {
    c.header('Content-Type', register.contentType);
    return c.body(await register.metrics());
});
startConsumerServices().catch(err => {
    console.error('Fatal unhandled error during consumer startup', err);
    process.exit(1);
});
serve({
    fetch: app.fetch,
    port: 3002
}, (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
});
