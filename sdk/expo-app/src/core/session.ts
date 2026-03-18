// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Session Manager
// ─────────────────────────────────────────────────────────────

// NOTE: The `uuid` package crashes on React Native Hermes because
// crypto.getRandomValues() is not available. Use a RN-safe fallback.
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
import { logger } from './logger';

class SessionManager {
  private _sessionId: string = '';
  private _startedAt: number = 0;

  start(): string {
    this._sessionId = generateUUID();
    this._startedAt = Date.now();
    logger.info(`Session started: ${this._sessionId}`);
    return this._sessionId;
  }

  get sessionId(): string {
    return this._sessionId;
  }

  get startedAt(): number {
    return this._startedAt;
  }

  get durationMs(): number {
    if (!this._startedAt) return 0;
    return Date.now() - this._startedAt;
  }

  end(): void {
    logger.info(`Session ended: ${this._sessionId} (${this.durationMs}ms)`);
    this._sessionId = '';
    this._startedAt = 0;
  }
}

export const sessionManager = new SessionManager();
