// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Adaptation Manager
// Polls backend for decisions + applies them to the player
// ─────────────────────────────────────────────────────────────

import type {
  MobCloudXConfig,
  AdaptationDecision,
  AdaptationFeedback,
} from '../types';
import { apiService } from '../services/api.service';
import { useSDKStore } from '../core/store';
import { logger } from '../core/logger';

export type AdaptationApplier = (decision: AdaptationDecision) => void;

export class AdaptationManager {
  private config: MobCloudXConfig;
  private sessionId: string;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private applier: AdaptationApplier | null = null;
  private _pollCount = 0;
  private _lastDecisionTs = 0;

  constructor(config: MobCloudXConfig, sessionId: string) {
    this.config = config;
    this.sessionId = sessionId;
  }

  /**
   * Register the function that applies decisions to the player.
   * Called by MobCloudXPlayer on mount.
   */
  registerApplier(applier: AdaptationApplier): void {
    this.applier = applier;
    logger.debug('Adaptation applier registered');
  }

  start(): void {
    const interval = this.config.adaptationPollIntervalMs ?? 5000;
    this.pollInterval = setInterval(() => {
      this.poll();
    }, interval);
    logger.info(`Adaptation polling started (${interval}ms)`);
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.applier = null;
    logger.info(`Adaptation polling stopped (${this._pollCount} polls)`);
  }

  private async poll(): Promise<void> {
    this._pollCount++;
    const result = await apiService.getAdaptationDecision(this.sessionId);

    if (!result.ok || !result.data) return;

    const decision = result.data;

    // Deduplicate — skip if same timestamp
    if (decision.ts && decision.ts === this._lastDecisionTs) return;
    this._lastDecisionTs = decision.ts ?? 0;

    logger.info(`Adaptation decision: ${decision.decision} (confidence: ${decision.confidence})`);

    // Push to store
    useSDKStore.getState().updateAdaptation(decision);

    // Apply to player
    if (this.applier) {
      try {
        this.applier(decision);
        logger.info(`Applied adaptation: ${decision.decision}`);
      } catch (err: any) {
        logger.error('Failed to apply adaptation:', err.message);
      }
    }
  }

  /**
   * Send feedback about how adaptation affected QoE.
   */
  async sendFeedback(
    decision: AdaptationDecision,
    applied: boolean,
    qoeBefore: number,
    qoeAfter: number
  ): Promise<void> {
    const feedback: AdaptationFeedback = {
      sessionId: this.sessionId,
      decision: decision.decision,
      applied,
      qoe_before: qoeBefore,
      qoe_after: qoeAfter,
      ts: Date.now(),
    };

    await apiService.sendAdaptationFeedback(feedback);
    logger.debug('Adaptation feedback sent');
  }

  get pollCount(): number {
    return this._pollCount;
  }
}
