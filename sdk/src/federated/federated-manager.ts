import type { MobCloudXConfig, FederatedModel } from '../types';
import { useSDKStore } from '../core/store';
import { apiService } from '../services/api.service';
import { logger } from '../core/logger';

export class FederatedManager {
  private config: MobCloudXConfig;
  private sessionId: string;
  private timer: ReturnType<typeof setInterval> | null = null;
  private currentModel: FederatedModel | null = null;

  constructor(config: MobCloudXConfig, sessionId: string) {
    this.config = config;
    this.sessionId = sessionId;
  }

  start(): void {
    const interval = this.config.federatedIntervalMs ?? 30000;
    this.timer = setInterval(() => {
      this.sync().catch((e) => logger.warn(`FL sync failed: ${e.message}`));
    }, interval);
    this.sync().catch(() => undefined);
    logger.info(`Federated manager started (${interval}ms)`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('Federated manager stopped');
  }

  private async sync(): Promise<void> {
    // Pull global model first (rollout)
    const modelRes = await apiService.getFederatedModel();
    if (modelRes.ok && modelRes.data) {
      this.currentModel = modelRes.data;
    }

    const store = useSDKStore.getState();
    const qoe = store.qoe.currentScore;
    const playback = store.playbackMetrics;
    const network = store.networkInfo;

    const update = {
      buffer_weight: Number(((playback?.bufferHealthMs ?? 0) / 10000).toFixed(4)),
      jitter_weight: Number((((network.signalStrengthDbm ?? -90) + 120) / 120).toFixed(4)),
      qoe_weight: Number((qoe / 100).toFixed(4)),
    };

    const payload = {
      device_id: this.config.deviceId ?? 'sdk-device',
      session_id: this.sessionId,
      model_version: this.currentModel?.model_version ?? 'fl-bootstrap',
      qoe_baseline: qoe,
      update,
      ts: Date.now(),
    };

    const result = await apiService.submitFederatedUpdate(payload);
    if (result.ok) {
      logger.debug('Federated update submitted');
    }
  }
}
