import { Asset } from 'expo-asset';
import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import {
  DEFAULT_NORMALISATION_PARAMS,
  type CongestionPrediction,
  type NormalisationFeatureParams,
  type NormalisationParams,
  type WebRTCMetrics,
} from './types';
import { toMilliseconds } from './WebRTCQoEModel';

type ReleasableSession = InferenceSession & {
  release?: () => Promise<void> | void;
};

const MODEL_ASSET = require('../../../assets/webrtc_congestion_lstm_int8.onnx');
const NORMALISATION_ASSET = require('../../../assets/normalization_params.json') as Partial<NormalisationParams>;
const FEATURE_COUNT = 6;
const SEQUENCE_LENGTH = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getSafeStd(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function mergeFeatureParams(
  fallback: NormalisationFeatureParams,
  incoming?: Partial<NormalisationFeatureParams>
): NormalisationFeatureParams {
  return {
    mean: typeof incoming?.mean === 'number' ? incoming.mean : fallback.mean,
    std: getSafeStd(typeof incoming?.std === 'number' ? incoming.std : fallback.std),
    min: typeof incoming?.min === 'number' ? incoming.min : fallback.min,
    max: typeof incoming?.max === 'number' ? incoming.max : fallback.max,
  };
}

function mergeNormalisationParams(input?: Partial<NormalisationParams>): NormalisationParams {
  return {
    rtt_ms: mergeFeatureParams(DEFAULT_NORMALISATION_PARAMS.rtt_ms, input?.rtt_ms),
    jitter_ms: mergeFeatureParams(DEFAULT_NORMALISATION_PARAMS.jitter_ms, input?.jitter_ms),
    plr: mergeFeatureParams(DEFAULT_NORMALISATION_PARAMS.plr, input?.plr),
    available_bitrate_kbps: mergeFeatureParams(
      DEFAULT_NORMALISATION_PARAMS.available_bitrate_kbps,
      input?.available_bitrate_kbps
    ),
    fps: mergeFeatureParams(DEFAULT_NORMALISATION_PARAMS.fps, input?.fps),
    freeze_occurred: mergeFeatureParams(DEFAULT_NORMALISATION_PARAMS.freeze_occurred, input?.freeze_occurred),
  };
}

function normalise(value: number, params: NormalisationFeatureParams): number {
  const boundedValue = clamp(
    value,
    typeof params.min === 'number' ? params.min : -Number.MAX_SAFE_INTEGER,
    typeof params.max === 'number' ? params.max : Number.MAX_SAFE_INTEGER
  );
  return clamp((boundedValue - params.mean) / getSafeStd(params.std), -3, 3);
}

function getWarningLevel(probability: number): CongestionPrediction['warningLevel'] {
  if (probability > 0.75) {
    return 'critical';
  }
  if (probability >= 0.5) {
    return 'warning';
  }
  return 'none';
}

function getConfidenceLevel(bufferLength: number): CongestionPrediction['confidenceLevel'] {
  if (bufferLength >= SEQUENCE_LENGTH) {
    return 'high';
  }
  if (bufferLength >= 7) {
    return 'medium';
  }
  return 'low';
}

export class CongestionPredictor {
  private session: InferenceSession | null = null;
  private normParams: NormalisationParams = DEFAULT_NORMALISATION_PARAMS;
  private sequenceBuffer: Float32Array[] = [];
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private lastMetrics: WebRTCMetrics | null = null;

  async initialize(): Promise<void> {
    this.normParams = mergeNormalisationParams(NORMALISATION_ASSET);

    const modelAsset = Asset.fromModule(MODEL_ASSET);
    if (!modelAsset.localUri) {
      await modelAsset.downloadAsync();
    }

    const modelPath = modelAsset.localUri ?? modelAsset.uri;
    this.session = await InferenceSession.create(modelPath, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
    });
  }

  addInterval(metrics: WebRTCMetrics): void {
    this.lastMetrics = metrics;
    this.sequenceBuffer.push(this.vectorize(metrics));
    if (this.sequenceBuffer.length > SEQUENCE_LENGTH) {
      this.sequenceBuffer.shift();
    }
  }

  async predict(): Promise<CongestionPrediction | null> {
    if (this.sequenceBuffer.length < SEQUENCE_LENGTH) {
      return null;
    }

    if (!this.session || !this.lastMetrics) {
      return this.buildFallbackPrediction(this.lastMetrics, getConfidenceLevel(this.sequenceBuffer.length));
    }

    try {
      const flatValues = new Float32Array(SEQUENCE_LENGTH * FEATURE_COUNT);
      this.sequenceBuffer.forEach((intervalValues, index) => {
        flatValues.set(intervalValues, index * FEATURE_COUNT);
      });

      const inputTensor = new Tensor('float32', flatValues, [1, SEQUENCE_LENGTH, FEATURE_COUNT]);
      const results = await this.session.run({ telemetry_sequence: inputTensor });

      const congestionProbability = clamp(
        Number(results['congestion_probability']?.data[0] ?? 0),
        0,
        1
      );
      const predictedBitrateKbps = clamp(
        Number(results['predicted_bitrate']?.data[0] ?? 0),
        0,
        10000
      );

      return {
        congestionProbability,
        predictedBitrateKbps,
        confidenceLevel: 'high',
        warningLevel: getWarningLevel(congestionProbability),
        timestamp: Date.now(),
      };
    } catch (error) {
      console.warn('[MobCloudX] ONNX congestion prediction failed:', error);
      return this.buildFallbackPrediction(this.lastMetrics, getConfidenceLevel(this.sequenceBuffer.length));
    }
  }

  startAutoPredict(
    getMetrics: () => WebRTCMetrics,
    onPrediction: (prediction: CongestionPrediction) => void,
    intervalMs = 500
  ): void {
    this.stop();
    this.intervalHandle = setInterval(() => {
      const metrics = getMetrics();
      this.addInterval(metrics);

      void this.predict().then((prediction) => {
        if (prediction) {
          onPrediction(prediction);
          return;
        }

        onPrediction(this.buildFallbackPrediction(metrics, getConfidenceLevel(this.sequenceBuffer.length)));
      });
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async destroy(): Promise<void> {
    this.stop();
    const session = this.session as ReleasableSession | null;
    if (session?.release) {
      await session.release();
    }
    this.session = null;
    this.sequenceBuffer = [];
    this.lastMetrics = null;
  }

  private vectorize(metrics: WebRTCMetrics): Float32Array {
    const availableBitrateKbps = metrics.availableOutgoingBitrate / 1000;
    const freezeOccurred = metrics.freezeCount > 0 || metrics.totalFreezesDuration > 0 ? 1 : 0;
    return new Float32Array([
      normalise(toMilliseconds(metrics.currentRoundTripTime), this.normParams.rtt_ms),
      normalise(toMilliseconds(metrics.jitter), this.normParams.jitter_ms),
      normalise(metrics.packetLossRate, this.normParams.plr),
      normalise(availableBitrateKbps, this.normParams.available_bitrate_kbps),
      normalise(metrics.framesPerSecond, this.normParams.fps),
      normalise(freezeOccurred, this.normParams.freeze_occurred),
    ]);
  }

  private buildFallbackPrediction(
    metrics: WebRTCMetrics | null,
    confidenceLevel: CongestionPrediction['confidenceLevel']
  ): CongestionPrediction {
    const packetLossRate = metrics?.packetLossRate ?? 0;
    const rttMs = toMilliseconds(metrics?.currentRoundTripTime ?? 0);
    const availableBitrateKbps = (metrics?.availableOutgoingBitrate ?? 0) / 1000;

    const congestionProbability = packetLossRate > 0.05 ? 0.8 : rttMs > 200 ? 0.6 : 0.1;

    return {
      congestionProbability,
      predictedBitrateKbps: clamp(availableBitrateKbps, 0, 10000),
      confidenceLevel,
      warningLevel: getWarningLevel(congestionProbability),
      timestamp: Date.now(),
    };
  }
}
