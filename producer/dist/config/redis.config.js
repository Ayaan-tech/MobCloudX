import { createClient } from 'redis';
class RedisConfig {
    client = null;
    url;
    ready = false;
    constructor() {
        this.url = process.env.REDIS_URL || 'redis://redis:6379/0';
    }
    async connect() {
        if (this.client?.isOpen) {
            this.ready = true;
            return;
        }
        const client = createClient({ url: this.url });
        client.on('error', (error) => {
            this.ready = false;
            console.error('Redis client error:', error);
        });
        await client.connect();
        await client.ping();
        this.client = client;
        this.ready = true;
        console.log(`Redis connected successfully (${this.url})`);
    }
    async getJson(key) {
        if (!this.client || !this.ready)
            return null;
        const value = await this.client.get(key);
        if (!value)
            return null;
        return JSON.parse(value);
    }
    async setJson(key, value, ttlSeconds) {
        if (!this.client || !this.ready)
            return;
        const serialized = JSON.stringify(value);
        if (ttlSeconds && ttlSeconds > 0) {
            await this.client.set(key, serialized, { EX: ttlSeconds });
            return;
        }
        await this.client.set(key, serialized);
    }
    isReady() {
        return this.ready;
    }
    async disconnect() {
        if (!this.client?.isOpen)
            return;
        await this.client.quit();
        this.ready = false;
        console.log('Redis disconnected');
    }
}
export default new RedisConfig();
