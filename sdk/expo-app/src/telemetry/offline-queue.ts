// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Offline Telemetry Queue
// Persists telemetry payloads to AsyncStorage when offline,
// then drains them once connectivity is restored.
// ─────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../core/logger';
import type { TelemetryPayload } from '../types';

const QUEUE_KEY = '@mobcloudx_telemetry_queue';
const MAX_QUEUE_SIZE = 200; // Cap to prevent unbounded storage growth

export class OfflineTelemetryQueue {
  private memoryQueue: TelemetryPayload[] = [];
  private isDraining = false;

  /**
   * Load persisted queue from AsyncStorage into memory.
   * Call once during SDK init.
   */
  async hydrate(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      if (raw) {
        const parsed: TelemetryPayload[] = JSON.parse(raw);
        this.memoryQueue = Array.isArray(parsed) ? parsed.slice(-MAX_QUEUE_SIZE) : [];
        logger.info(`Offline queue hydrated: ${this.memoryQueue.length} items`);
      }
    } catch (err: any) {
      logger.error('Failed to hydrate offline queue:', err.message);
      this.memoryQueue = [];
    }
  }

  /**
   * Enqueue a payload for later transmission.
   */
  async enqueue(payload: TelemetryPayload): Promise<void> {
    // Trim if we hit the cap
    if (this.memoryQueue.length >= MAX_QUEUE_SIZE) {
      this.memoryQueue.shift(); // drop oldest
    }

    this.memoryQueue.push(payload);

    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(this.memoryQueue));
    } catch (err: any) {
      logger.warn('Failed to persist offline queue:', err.message);
    }
  }

  /**
   * Drain the queue by sending each item via the provided sender.
   * Implements retry semantics: items that fail to send stay in the queue.
   */
  async drain(
    sender: (payload: TelemetryPayload) => Promise<{ ok: boolean }>
  ): Promise<number> {
    if (this.isDraining || this.memoryQueue.length === 0) return 0;
    this.isDraining = true;

    let sentCount = 0;
    const failures: TelemetryPayload[] = [];

    logger.info(`Draining offline queue: ${this.memoryQueue.length} items`);

    for (const payload of this.memoryQueue) {
      try {
        const result = await sender(payload);
        if (result.ok) {
          sentCount++;
        } else {
          failures.push(payload);
        }
      } catch {
        failures.push(payload);
      }
    }

    // Replace queue with only the failures
    this.memoryQueue = failures;

    try {
      if (failures.length > 0) {
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(failures));
      } else {
        await AsyncStorage.removeItem(QUEUE_KEY);
      }
    } catch (err: any) {
      logger.warn('Failed to update offline queue after drain:', err.message);
    }

    this.isDraining = false;
    logger.info(`Offline queue drained: ${sentCount} sent, ${failures.length} remaining`);
    return sentCount;
  }

  /**
   * Number of items currently queued.
   */
  get size(): number {
    return this.memoryQueue.length;
  }

  /**
   * Clear entire queue.
   */
  async clear(): Promise<void> {
    this.memoryQueue = [];
    try {
      await AsyncStorage.removeItem(QUEUE_KEY);
    } catch (err: any) {
      logger.warn('Failed to clear offline queue:', err.message);
    }
  }
}

export const offlineQueue = new OfflineTelemetryQueue();
