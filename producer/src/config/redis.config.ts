import { createClient } from 'redis'

type RedisClientInstance = ReturnType<typeof createClient>

class RedisConfig {
    private client: RedisClientInstance | null = null
    private readonly url: string
    private ready = false

    constructor() {
        this.url = process.env.REDIS_URL || 'redis://redis:6379/0'
    }

    async connect(): Promise<void> {
        if (this.client?.isOpen) {
            this.ready = true
            return
        }

        const client = createClient({ url: this.url })
        client.on('error', (error) => {
            this.ready = false
            console.error('Redis client error:', error)
        })

        await client.connect()
        await client.ping()
        this.client = client
        this.ready = true
        console.log(`Redis connected successfully (${this.url})`)
    }

    async getJson<T>(key: string): Promise<T | null> {
        if (!this.client || !this.ready) return null
        const value = await this.client.get(key)
        if (!value) return null
        return JSON.parse(value) as T
    }

    async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
        if (!this.client || !this.ready) return

        const serialized = JSON.stringify(value)
        if (ttlSeconds && ttlSeconds > 0) {
            await this.client.set(key, serialized, { EX: ttlSeconds })
            return
        }

        await this.client.set(key, serialized)
    }

    isReady(): boolean {
        return this.ready
    }

    async disconnect(): Promise<void> {
        if (!this.client?.isOpen) return
        await this.client.quit()
        this.ready = false
        console.log('Redis disconnected')
    }
}

export default new RedisConfig()
