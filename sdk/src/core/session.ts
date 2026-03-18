// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Session Manager
// ─────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';

class SessionManager {
  private _sessionId: string = '';
  private _startedAt: number = 0;

  start(): string {
    this._sessionId = uuidv4();
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
