import type { AudioMetrics } from '../types';
import { useSDKStore } from '../core/store';

export class AudioAgent {
  update(metrics: AudioMetrics): void {
    useSDKStore.getState().updateAudioMetrics(metrics);
  }

  reset(): void {
    useSDKStore.getState().updateAudioMetrics({
      jitterMs: 0,
      packetLossPct: 0,
      latencyMs: 0,
      avSyncOffsetMs: 0,
    });
  }
}

export const audioAgent = new AudioAgent();
