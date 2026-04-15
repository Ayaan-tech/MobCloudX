import { CongestionPredictor } from './CongestionPredictor';
import { EMPTY_WEBRTC_METRICS, type WebRTCMetrics } from './types';
import { ReceiverSRAgent } from './ReceiverSRAgent';

export type ProfiledComponent =
  | 'BASELINE'
  | 'LSTM_INFERENCE'
  | 'BRISQUE_SCORING'
  | 'SR_INFERENCE'
  | 'ALL_COMBINED';

export interface PerformanceReport {
  component: ProfiledComponent;
  avg_cpu_percent: number;
  peak_memory_mb: number;
  estimated_battery_drain_percent_per_hour: number;
  inference_latency_p50_ms: number;
  inference_latency_p95_ms: number;
}

interface PerformanceMemoryLike {
  usedJSHeapSize?: number;
}

interface BatteryModuleLike {
  getBatteryLevelAsync?: () => Promise<number>;
}

interface PerformanceProfilerOptions {
  durationMs?: number;
  sampleMetrics?: () => WebRTCMetrics;
  predictorFactory?: () => CongestionPredictor;
  srAgentFactory?: () => ReceiverSRAgent;
  brisqueSampler?: () => Promise<number | null> | number | null;
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getApproximateJsCpuLoad(loopIterations: number, durationMs: number): number {
  const baselineIterationsPerSecond = 200000;
  const iterationsPerSecond = loopIterations / Math.max(durationMs / 1000, 1);
  const idleRatio = Math.min(iterationsPerSecond / baselineIterationsPerSecond, 1);
  return Math.max(0, Math.min(100, (1 - idleRatio) * 100));
}

function getMemoryMb(): number {
  const performanceRef = globalThis.performance as Performance & { memory?: PerformanceMemoryLike };
  const heap = performanceRef?.memory?.usedJSHeapSize;
  return typeof heap === 'number' && Number.isFinite(heap) ? heap / (1024 * 1024) : 0;
}

function buildSyntheticMetrics(): WebRTCMetrics {
  return {
    ...EMPTY_WEBRTC_METRICS,
    frameWidth: 640,
    frameHeight: 360,
    framesPerSecond: 24,
    videoBitrateKbps: 550,
    packetLossRate: 0.035,
    packetsLost: 14,
    jitter: 0.045,
    freezeCount: 1,
    freezeRatePerMin: 2.2,
    qualityLimitationReason: 'bandwidth',
    currentRoundTripTime: 0.19,
    availableOutgoingBitrate: 540000,
  };
}

export class PerformanceProfiler {
  private readonly durationMs: number;
  private readonly sampleMetrics: () => WebRTCMetrics;
  private readonly predictorFactory: () => CongestionPredictor;
  private readonly srAgentFactory: () => ReceiverSRAgent;
  private readonly brisqueSampler: () => Promise<number | null> | number | null;

  constructor(options: PerformanceProfilerOptions = {}) {
    this.durationMs = options.durationMs ?? 30_000;
    this.sampleMetrics = options.sampleMetrics ?? buildSyntheticMetrics;
    this.predictorFactory = options.predictorFactory ?? (() => new CongestionPredictor());
    this.srAgentFactory = options.srAgentFactory ?? (() => new ReceiverSRAgent());
    this.brisqueSampler = options.brisqueSampler ?? (() => null);
  }

  async measureComponentCost(): Promise<PerformanceReport[]> {
    const reports: PerformanceReport[] = [];

    for (const component of ['BASELINE', 'LSTM_INFERENCE', 'BRISQUE_SCORING', 'SR_INFERENCE', 'ALL_COMBINED'] as const) {
      reports.push(await this.measureSingleComponent(component));
    }

    return reports;
  }

  private async measureSingleComponent(component: ProfiledComponent): Promise<PerformanceReport> {
    const predictor = component === 'LSTM_INFERENCE' || component === 'ALL_COMBINED'
      ? this.predictorFactory()
      : null;
    const srAgent = component === 'SR_INFERENCE' || component === 'ALL_COMBINED'
      ? this.srAgentFactory()
      : null;

    if (predictor) {
      try {
        await predictor.initialize();
      } catch (error) {
        console.warn('[MobCloudX] Predictor profiler initialisation failed:', error);
      }
    }

    if (srAgent) {
      try {
        await srAgent.initialize();
        srAgent.activate();
      } catch (error) {
        console.warn('[MobCloudX] Receiver SR profiler initialisation failed:', error);
      }
    }

    const batteryModule = this.loadBatteryModule();
    const batteryBefore = await batteryModule?.getBatteryLevelAsync?.().catch(() => null);
    const memoryBefore = getMemoryMb();
    let peakMemoryMb = memoryBefore;
    let loopIterations = 0;
    const latencySamples: number[] = [];
    const startedAt = Date.now();

    while (Date.now() - startedAt < this.durationMs) {
      const iterationStartedAt = Date.now();
      const metrics = this.sampleMetrics();

      if (predictor) {
        predictor.addInterval(metrics);
        const predictionStartedAt = Date.now();
        await predictor.predict();
        latencySamples.push(Date.now() - predictionStartedAt);
      }

      if (component === 'BRISQUE_SCORING' || component === 'ALL_COMBINED') {
        const brisqueStartedAt = Date.now();
        await this.brisqueSampler();
        latencySamples.push(Date.now() - brisqueStartedAt);
      }

      if (srAgent) {
        const srStartedAt = Date.now();
        await srAgent.processFrame({
          width: metrics.frameWidth || 640,
          height: metrics.frameHeight || 360,
          toArrayBuffer: () =>
            new Uint8Array((metrics.frameWidth || 640) * (metrics.frameHeight || 360) * 3).buffer,
        });
        latencySamples.push(Date.now() - srStartedAt);
      }

      peakMemoryMb = Math.max(peakMemoryMb, getMemoryMb());
      loopIterations += 1;

      const elapsedForIteration = Date.now() - iterationStartedAt;
      await sleep(Math.max(0, 100 - elapsedForIteration));
    }

    const batteryAfter = await batteryModule?.getBatteryLevelAsync?.().catch(() => null);

    await predictor?.destroy();
    await srAgent?.destroy();

    const durationMs = Date.now() - startedAt;
    const avgCpu = getApproximateJsCpuLoad(loopIterations, durationMs);
    const batteryDrainPerHour =
      typeof batteryBefore === 'number' && typeof batteryAfter === 'number'
        ? Math.max(0, (batteryBefore - batteryAfter) * 100 * (3_600_000 / Math.max(durationMs, 1)))
        : 0;

    return {
      component,
      avg_cpu_percent: Number(avgCpu.toFixed(2)),
      peak_memory_mb: Number(Math.max(peakMemoryMb - memoryBefore, 0).toFixed(2)),
      estimated_battery_drain_percent_per_hour: Number(batteryDrainPerHour.toFixed(2)),
      inference_latency_p50_ms: Number(percentile(latencySamples, 0.5).toFixed(2)),
      inference_latency_p95_ms: Number(percentile(latencySamples, 0.95).toFixed(2)),
    };
  }

  private loadBatteryModule(): BatteryModuleLike | null {
    try {
      return require('expo-battery') as BatteryModuleLike;
    } catch {
      return null;
    }
  }
}
