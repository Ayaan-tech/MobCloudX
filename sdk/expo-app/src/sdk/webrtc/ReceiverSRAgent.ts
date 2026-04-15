import { Asset } from 'expo-asset';
import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import { FSMState } from './FSM';
import type { WebRTCMetrics } from './types';

type DeviceTier = 'low' | 'mid' | 'high';

type VisionCameraModule = {
  VisionCameraProxy?: {
    initFrameProcessorPlugin?: (name: string, options?: Record<string, unknown>) => unknown;
  };
};

type DeviceInfoModule = {
  getTotalMemory: () => Promise<number>;
};

type FrameLike = {
  width?: number;
  height?: number;
  toArrayBuffer?: () => ArrayBuffer;
};

type BrisquePluginResult = {
  brisque_score?: number;
  computation_ms?: number;
  available?: boolean;
};

const MODEL_ASSET = require('../../../assets/edsr_webrtc_int8.onnx');
const PROCESS_EVERY_N_FRAMES = 3;
const BRISQUE_EVERY_N_FRAMES = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class ReceiverSRAgent {
  private onnxSession: InferenceSession | null = null;
  private isActive = false;
  private frameProcessorPlugin: ((frame: FrameLike) => BrisquePluginResult) | null = null;
  private deviceTier: DeviceTier = 'low';
  private frameCounter = 0;
  public framesProcessedCount = 0;
  private latestBrisqueScore: number | null = null;
  private readonly PROCESS_EVERY_N_FRAMES = PROCESS_EVERY_N_FRAMES;
  private srOverBudgetCount = 0;

  async initialize(): Promise<void> {
    this.deviceTier = await this.detectDeviceTier();

    try {
      const modelAsset = Asset.fromModule(MODEL_ASSET);
      if (!modelAsset.localUri) {
        await modelAsset.downloadAsync();
      }
      const modelPath = modelAsset.localUri ?? modelAsset.uri;
      this.onnxSession = await InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
      });
    } catch (error) {
      console.warn('[MobCloudX] Receiver SR model unavailable, SR disabled:', error);
      this.onnxSession = null;
      this.isActive = false;
    }

    this.registerFrameProcessor();
  }

  shouldActivate(metrics: WebRTCMetrics, fsmState: FSMState): boolean {
    return (
      this.deviceTier !== 'low' &&
      fsmState === FSMState.BANDWIDTH_CONSTRAINED &&
      metrics.frameHeight < 720 &&
      metrics.qualityLimitationReason !== 'cpu' &&
      metrics.availableOutgoingBitrate > 200_000
    );
  }

  activate(): void {
    if (!this.onnxSession || this.deviceTier === 'low') {
      return;
    }
    this.isActive = true;
  }

  deactivate(): void {
    this.isActive = false;
    this.srOverBudgetCount = 0;
  }

  async destroy(): Promise<void> {
    this.deactivate();
    this.onnxSession = null;
    this.frameProcessorPlugin = null;
    this.framesProcessedCount = 0;
  }

  async processFrame(frame: FrameLike): Promise<void> {
    if (!this.isActive || !this.onnxSession) {
      return;
    }

    this.frameCounter += 1;
    if (this.frameCounter % this.PROCESS_EVERY_N_FRAMES !== 0) {
      return;
    }

    const width = frame.width ?? 0;
    const height = frame.height ?? 0;
    if (!width || !height || !frame.toArrayBuffer) {
      return;
    }

    try {
      const startedAt = Date.now();
      const rgb = new Float32Array(width * height * 3);
      const inputTensor = new Tensor('float32', rgb, [1, 3, height, width]);
      await this.onnxSession.run({ input: inputTensor }).catch(async () => {
        await this.onnxSession?.run({ x: inputTensor });
      });
      this.framesProcessedCount += 1;
      const durationMs = Date.now() - startedAt;
      if (durationMs > 25) {
        console.warn(`[MobCloudX] Receiver SR inference exceeded budget: ${durationMs}ms`);
        this.srOverBudgetCount += 1;
        if (this.srOverBudgetCount >= 3) {
          this.deactivate();
        }
      } else {
        this.srOverBudgetCount = 0;
      }
    } catch (error) {
      console.warn('[MobCloudX] Receiver SR frame processing failed, disabling SR:', error);
      this.deactivate();
    }

    if (this.frameCounter % BRISQUE_EVERY_N_FRAMES === 0) {
      this.latestBrisqueScore = this.computeBRISQUE(frame);
    }
  }

  computeBRISQUE(frame: FrameLike): number {
    if (!this.frameProcessorPlugin) {
      return this.latestBrisqueScore ?? 0;
    }

    try {
      const result = this.frameProcessorPlugin(frame);
      const score = result?.brisque_score;
      if (typeof score === 'number' && Number.isFinite(score)) {
        return clamp(score / 100, 0, 1);
      }
    } catch (error) {
      console.warn('[MobCloudX] BRISQUE plugin failed:', error);
    }

    return this.latestBrisqueScore ?? 0;
  }

  getLatestBRISQUEScore(): number | null {
    return this.latestBrisqueScore;
  }

  isCurrentlyActive(): boolean {
    return this.isActive;
  }

  enrichMetrics(metrics: WebRTCMetrics, fsmState: FSMState): WebRTCMetrics {
    if (this.shouldActivate(metrics, fsmState)) {
      this.activate();
    } else {
      this.deactivate();
    }

    return {
      ...metrics,
      perceptualQualityScore: this.latestBrisqueScore,
      receiverSrActive: this.isActive,
    };
  }

  private async detectDeviceTier(): Promise<DeviceTier> {
    try {
      const module = require('react-native-device-info') as DeviceInfoModule;
      const totalRAM = await module.getTotalMemory();
      if (totalRAM < 3 * 1024 ** 3) return 'low';
      if (totalRAM < 6 * 1024 ** 3) return 'mid';
      return 'high';
    } catch (error) {
      console.warn('[MobCloudX] Device tier detection unavailable, defaulting to low tier:', error);
      return 'low';
    }
  }

  private registerFrameProcessor(): void {
    try {
      const module = require('react-native-vision-camera') as VisionCameraModule;
      const plugin = module.VisionCameraProxy?.initFrameProcessorPlugin?.('computeBRISQUE', {
        sampleEvery: BRISQUE_EVERY_N_FRAMES,
      });
      this.frameProcessorPlugin = typeof plugin === 'function'
        ? (plugin as (frame: FrameLike) => BrisquePluginResult)
        : null;
    } catch (error) {
      console.warn('[MobCloudX] VisionCamera frame processor unavailable, BRISQUE disabled:', error);
      this.frameProcessorPlugin = null;
    }
  }
}
