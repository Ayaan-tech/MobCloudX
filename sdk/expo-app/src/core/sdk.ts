// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Core Initializer
// ─────────────────────────────────────────────────────────────

import type { MobCloudXConfig } from '../types';
import { useSDKStore } from './store';
import { sessionManager } from './session';
import { logger } from './logger';
import { TelemetryManager } from '../telemetry/telemetry-manager';
import { AdaptationManager } from '../adaptation/adaptation-manager';
import { getInferenceApiBaseUrl, getProducerApiBaseUrl } from './api-config';

export class MobCloudXSDK {
  private static instance: MobCloudXSDK | null = null;
  private telemetryManager: TelemetryManager | null = null;
  private adaptationManager: AdaptationManager | null = null;
  private _isRunning = false;

  private constructor() {}

  static getInstance(): MobCloudXSDK {
    if (!MobCloudXSDK.instance) {
      MobCloudXSDK.instance = new MobCloudXSDK();
    }
    return MobCloudXSDK.instance;
  }

  /**
   * Initialize the SDK. Call once at app startup.
   */
  async initialize(config: MobCloudXConfig): Promise<void> {
    if (this._isRunning) {
      logger.warn('SDK already initialized. Call destroy() first.');
      return;
    }

    // Enable logging if debug
    if (config.debug) {
      logger.enable();
    }

    logger.info('Initializing MobCloudX SDK...');
    logger.info(`Producer API: ${getProducerApiBaseUrl(config)}`);
    logger.info(`Inference API: ${getInferenceApiBaseUrl(config)}`);
    logger.info(`Mode: ${config.mode ?? 'user'}`);

    // Initialize store
    const store = useSDKStore.getState();
    store.initialize(config);

    // Start session
    const sessionId = sessionManager.start();
    logger.info(`Session ID: ${sessionId}`);

    // Initialize telemetry
    if (config.enableTelemetry !== false) {
      this.telemetryManager = new TelemetryManager(config, sessionId);
      await this.telemetryManager.start();
      logger.info('Telemetry manager started');
    }

    // Initialize adaptation polling
    if (config.enableAdaptation !== false) {
      this.adaptationManager = new AdaptationManager(config, sessionId);
      this.adaptationManager.start();
      logger.info('Adaptation manager started');
    }

    this._isRunning = true;
    logger.info('✅ MobCloudX SDK initialized');
  }

  /**
   * Tear down the SDK. Call when session ends.
   */
  async destroy(): Promise<void> {
    logger.info('Destroying MobCloudX SDK...');

    this.telemetryManager?.stop();
    this.adaptationManager?.stop();

    sessionManager.end();
    useSDKStore.getState().reset();

    this.telemetryManager = null;
    this.adaptationManager = null;
    this._isRunning = false;

    logger.info('SDK destroyed');
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  get sessionId(): string {
    return sessionManager.sessionId;
  }

  getTelemetryManager(): TelemetryManager | null {
    return this.telemetryManager;
  }

  getAdaptationManager(): AdaptationManager | null {
    return this.adaptationManager;
  }

  // ── Feature Toggle Methods (called by QA Debug Panel) ────

  async startTelemetry(): Promise<void> {
    if (this.telemetryManager) {
      logger.warn('Telemetry already running');
      return;
    }
    const store = useSDKStore.getState();
    this.telemetryManager = new TelemetryManager(store.config, store.sessionId);
    await this.telemetryManager.start();
    logger.info('Telemetry restarted via toggle');
  }

  stopTelemetry(): void {
    if (!this.telemetryManager) return;
    this.telemetryManager.stop();
    this.telemetryManager = null;
    logger.info('Telemetry stopped via toggle');
  }

  startAdaptation(): void {
    if (this.adaptationManager) {
      logger.warn('Adaptation already running');
      return;
    }
    const store = useSDKStore.getState();
    this.adaptationManager = new AdaptationManager(store.config, store.sessionId);
    this.adaptationManager.start();
    logger.info('Adaptation restarted via toggle');
  }

  stopAdaptation(): void {
    if (!this.adaptationManager) return;
    this.adaptationManager.stop();
    this.adaptationManager = null;
    logger.info('Adaptation stopped via toggle');
  }
}

/** Convenience function */
export function initMobCloudX(config: MobCloudXConfig): Promise<void> {
  return MobCloudXSDK.getInstance().initialize(config);
}

export function destroyMobCloudX(): Promise<void> {
  return MobCloudXSDK.getInstance().destroy();
}
