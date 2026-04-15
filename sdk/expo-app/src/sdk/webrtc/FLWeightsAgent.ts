import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { useSDKStore } from '../../core/store';
import { getInferenceApiBaseUrl } from '../../core/api-config';
import { useWebRTCStore } from '../../store/webrtcStore';
import { extractQoEFeatureVector } from './WebRTCQoEModel';
import type {
  FLSessionSummaryPayload,
  QoEResult,
  QoEWeights,
  WebRTCMetrics,
} from './types';

const WEBRTC_FL_TASK = 'WEBRTC_FL_SYNC';
const DP_CLIP_NORM = 1.0;
const DP_NOISE_STD = 0.1;
const MAX_INTERVALS = 200;

interface FLWeightsResponse {
  weights: [number, number, number, number, number];
  round_number: number;
  model_type: 'webrtc_qoe';
}

interface FLUpdateResponse {
  accepted: boolean;
  current_global_weights: [number, number, number, number, number];
}

let activeFLWeightsAgent: FLWeightsAgent | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function weightsToArray(weights: QoEWeights): [number, number, number, number, number] {
  return [weights.alpha, weights.beta, weights.gamma, weights.delta, weights.epsilon];
}

function arrayToWeights(weights: readonly number[]): QoEWeights {
  return {
    alpha: weights[0] ?? 0.35,
    beta: weights[1] ?? 0.35,
    gamma: weights[2] ?? 0.15,
    delta: weights[3] ?? 0.1,
    epsilon: weights[4] ?? 0.05,
  };
}

function vectorNorm(values: readonly number[]): number {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

function normalizeMagnitude(values: readonly number[]): number[] {
  const absValues = values.map((value) => Math.abs(value) + 1e-3);
  const total = absValues.reduce((sum, value) => sum + value, 0);
  return absValues.map((value) => value / Math.max(total, 1e-6));
}

export class FLWeightsAgent {
  private currentWeights: QoEWeights = {
    alpha: 0.35,
    beta: 0.35,
    gamma: 0.15,
    delta: 0.1,
    epsilon: 0.05,
  };
  private localSessionData: WebRTCMetrics[] = [];
  private syncIntervalMs = 6 * 60 * 60 * 1000;
  private readonly rng = Math.random;

  async initialize(): Promise<void> {
    activeFLWeightsAgent = this;
    await this.periodicSync();
    await this.registerBackgroundTask();
  }

  recordInterval(metrics: WebRTCMetrics, _qoeResult: QoEResult): void {
    this.localSessionData.push(metrics);
    if (this.localSessionData.length > MAX_INTERVALS) {
      this.localSessionData = this.localSessionData.slice(-MAX_INTERVALS);
    }
  }

  async submitUpdate(sessionSummary: FLSessionSummaryPayload): Promise<void> {
    const apiBaseUrl = getInferenceApiBaseUrl(useSDKStore.getState().config);
    if (!apiBaseUrl) {
      return;
    }

    const gradientUpdate = this.computeGradientUpdate(sessionSummary);
    const response = await fetch(`${apiBaseUrl}/fl/webrtc/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionSummary.session_id,
        participant_id: `local-${Date.now()}`,
        gradient_update: gradientUpdate,
      }),
    });

    if (!response.ok) {
      throw new Error(`FL update request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as FLUpdateResponse;
    this.applyGlobalWeights(payload.current_global_weights);
  }

  async periodicSync(): Promise<void> {
    const apiBaseUrl = getInferenceApiBaseUrl(useSDKStore.getState().config);
    if (!apiBaseUrl) {
      return;
    }

    const response = await fetch(`${apiBaseUrl}/fl/webrtc/weights`);
    if (!response.ok) {
      throw new Error(`FL weights request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as FLWeightsResponse;
    this.applyGlobalWeights(payload.weights);
  }

  getCurrentWeights(): QoEWeights {
    return { ...this.currentWeights };
  }

  private applyGlobalWeights(weights: readonly number[]): void {
    this.currentWeights = arrayToWeights(weights);
    useWebRTCStore.getState().actions.applyFLWeights(this.currentWeights);
  }

  private computeGradientUpdate(sessionSummary: FLSessionSummaryPayload): number[] {
    const currentWeightVector = weightsToArray(this.currentWeights);
    const meanFeatures = this.localSessionData.length > 0
      ? normalizeMagnitude(
          this.localSessionData
            .map((metrics) => extractQoEFeatureVector(metrics))
            .reduce(
              (acc, values) => acc.map((sum, index) => sum + values[index]) as [number, number, number, number, number],
              [0, 0, 0, 0, 0]
            )
            .map((value) => value / this.localSessionData.length)
        )
      : [0.2, 0.2, 0.2, 0.2, 0.2];

    let signal = 0;
    if (
      sessionSummary.feedback.implicit_satisfaction === 'positive' &&
      sessionSummary.duration_seconds > 600
    ) {
      signal = 1;
    } else if (
      sessionSummary.feedback.implicit_satisfaction === 'negative' ||
      sessionSummary.duration_seconds < 180
    ) {
      signal = -1;
    } else {
      signal = sessionSummary.avg_qoe >= 75 ? 0.25 : sessionSummary.avg_qoe <= 55 ? -0.25 : 0;
    }

    const proposed = currentWeightVector.map((weight, index) => signal * Math.max(weight, 0.01) * meanFeatures[index]);
    const norm = vectorNorm(proposed);
    const clipped = norm > DP_CLIP_NORM
      ? proposed.map((value) => value * (DP_CLIP_NORM / (norm + 1e-8)))
      : proposed;

    const noisy = clipped.map((value) => value + this.gaussianNoise(0, DP_NOISE_STD));
    this.localSessionData = [];
    return noisy.map((value) => Number(clamp(value, -2, 2).toFixed(6)));
  }

  private async registerBackgroundTask(): Promise<void> {
    // Background task disabled for demo - causes registration errors
    // The periodic sync still works via manual calls
    console.log('[MobCloudX] Background task registration skipped (demo mode)');
    return;
    
    /* Original code - commented out for demo
    const status = await BackgroundFetch.getStatusAsync();
    if (status === BackgroundFetch.BackgroundFetchStatus.Restricted || status === BackgroundFetch.BackgroundFetchStatus.Denied) {
      return;
    }

    const registered = await TaskManager.isTaskRegisteredAsync(WEBRTC_FL_TASK);
    if (!registered) {
      await BackgroundFetch.registerTaskAsync(WEBRTC_FL_TASK, {
        minimumInterval: Math.floor(this.syncIntervalMs / 1000),
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
    */
  }

  private gaussianNoise(mean: number, stdDev: number): number {
    const u = 1 - this.rng();
    const v = this.rng();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + z * stdDev;
  }
}
