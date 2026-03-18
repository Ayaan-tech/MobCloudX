// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Frame Capture Service
// Uses react-native-view-shot to capture player view thumbnails
// ─────────────────────────────────────────────────────────────

import { type RefObject } from 'react';
import { captureRef } from 'react-native-view-shot';
import { logger } from '../core/logger';

class FrameCaptureService {
  private playerRef: RefObject<any> | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private _lastFrame: string | null = null;
  private _captureCount = 0;

  /**
   * Register the player view ref for capture.
   * Must be called after player mounts.
   */
  setPlayerRef(ref: RefObject<any>): void {
    this.playerRef = ref;
    logger.debug('Frame capture: player ref registered');
  }

  /**
   * Start periodic frame capture.
   * @param intervalMs — capture interval (default 3000ms)
   * @param onCapture — callback with base64 JPEG string
   */
  start(intervalMs: number, onCapture: (base64: string) => void): void {
    if (!this.playerRef) {
      logger.warn('Frame capture: no player ref set');
      return;
    }

    this.stop();
    this.intervalId = setInterval(async () => {
      await this.capture(onCapture);
    }, intervalMs);

    logger.debug(`Frame capture started (${intervalMs}ms interval)`);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Single capture.
   */
  async capture(onCapture?: (base64: string) => void): Promise<string | null> {
    if (!this.playerRef?.current) return null;

    try {
      const uri = await captureRef(this.playerRef, {
        format: 'jpg',
        quality: 0.3, // low quality = small payload
        result: 'base64',
        width: 160,   // tiny thumbnail
        height: 90,
      });

      this._lastFrame = uri;
      this._captureCount++;
      onCapture?.(uri);
      return uri;
    } catch (error: any) {
      logger.debug('Frame capture failed:', error.message);
      return null;
    }
  }

  get lastFrame(): string | null {
    return this._lastFrame;
  }

  get captureCount(): number {
    return this._captureCount;
  }
}

export const frameCaptureService = new FrameCaptureService();
