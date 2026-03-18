// src/telemetry/MetricSimulator.ts
// Dual-mode metric engine for MobCloudX FL.
//
// SIMULATED mode: Brownian drift on bitrate, buffer_health, latency, rebuffering
// REAL mode: Accept pushRealMetrics() from actual video player
//
// Writes to Atlas every 5 ticks via Data API HTTP POST.
// Emits LiveMetrics every 1s to MuxDashboard.

import axios from 'axios';
import { BRIDGE_URL } from '../fl/config';
import { computeQoE, getSessionId } from '../fl/mongoReader';

export type MetricMode = 'simulated' | 'real';

export interface LiveMetrics {
  bitrate: number;
  buffer_health: number; // buffer_health NOT buffer_ratio
  latency: number;
  rebuffering: number;
  qoe_score: number;
  resolution: '2160p' | '1080p' | '720p' | '480p' | '360p' | '240p';
  fps: 60 | 30 | 24;
  abr_action: 'increase' | 'maintain' | 'decrease';
  battery: number; // filled by BatteryReader
  samples_collected: number;
  fl_round: number;
  mode: MetricMode;
}

type MetricListener = (m: LiveMetrics) => void;

// ── Resolution from bitrate ─────────────────────────────────
function resolutionFromBitrate(
  br: number
): '2160p' | '1080p' | '720p' | '480p' | '360p' | '240p' {
  if (br > 15) return '2160p';
  if (br > 5) return '1080p';
  if (br > 3) return '720p';
  if (br > 1.5) return '480p';
  if (br > 0.7) return '360p';
  return '240p';
}

// ── FPS from QoE ────────────────────────────────────────────
function fpsFromQoE(qoe: number): 60 | 30 | 24 {
  if (qoe > 0.7) return 60;
  if (qoe > 0.4) return 30;
  return 24;
}

// ── ABR action from QoE ─────────────────────────────────────
function abrAction(qoe: number): 'increase' | 'maintain' | 'decrease' {
  if (qoe > 0.7) return 'increase';
  if (qoe >= 0.4) return 'maintain';
  return 'decrease';
}

// ── Clamp helper ────────────────────────────────────────────
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export class MetricSimulator {
  private mode: MetricMode = 'simulated';
  private timer: ReturnType<typeof setInterval> | null = null;
  private tick = 0;
  private listeners: MetricListener[] = [];
  private sessionId: string = '';
  private samplesCollected = 0;
  private flRound = 0;
  private battery = 100;

  // Simulated state
  private bitrate = 3.0;
  private bufferHealth = 0.5;
  private latency = 60;
  private rebuffering = 0;
  private networkTrend: 'improving' | 'degrading' = 'improving';
  private trendFlipTick = 20;

  async start(): Promise<void> {
    this.sessionId = await getSessionId();
    this.timer = setInterval(() => this._tick(), 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  setMode(mode: MetricMode): void {
    this.mode = mode;
  }

  setFlRound(round: number): void {
    this.flRound = round;
  }

  setBattery(level: number): void {
    this.battery = level;
  }

  /**
   * Push real metrics from an actual video player.
   * Only used in 'real' mode.
   */
  pushRealMetrics(m: {
    bitrate: number;
    buffer_health: number;
    latency: number;
    rebuffering?: number;
  }): void {
    // Add small Gaussian noise for smooth live updates
    this.bitrate = clamp(m.bitrate + (Math.random() - 0.5) * 0.1, 0.3, 18);
    this.bufferHealth = clamp(
      m.buffer_health + (Math.random() - 0.5) * 0.02,
      0,
      1
    );
    this.latency = clamp(m.latency + (Math.random() - 0.5) * 5, 5, 350);
    this.rebuffering = clamp(m.rebuffering ?? 0, 0, 1);
  }

  addListener(cb: MetricListener): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  get currentMetrics(): LiveMetrics {
    const qoe = computeQoE(
      this.bitrate,
      this.bufferHealth,
      this.latency,
      this.rebuffering
    );
    return {
      bitrate: this.bitrate,
      buffer_health: this.bufferHealth,
      latency: this.latency,
      rebuffering: this.rebuffering,
      qoe_score: qoe,
      resolution: resolutionFromBitrate(this.bitrate),
      fps: fpsFromQoE(qoe),
      abr_action: abrAction(qoe),
      battery: this.battery,
      samples_collected: this.samplesCollected,
      fl_round: this.flRound,
      mode: this.mode,
    };
  }

  // ── Private ───────────────────────────────────────────────

  private _tick(): void {
    this.tick++;

    if (this.mode === 'simulated') {
      this._brownianStep();
    }

    const metrics = this.currentMetrics;
    this.listeners.forEach((cb) => cb(metrics));

    // Write to Atlas every 5 ticks (5 seconds)
    if (this.tick % 5 === 0) {
      this.samplesCollected++;
      this._writeToAtlas(metrics).catch(() => {});
    }
  }

  private _brownianStep(): void {
    // Network trend flips every 15–30s
    if (this.tick >= this.trendFlipTick) {
      this.networkTrend =
        this.networkTrend === 'improving' ? 'degrading' : 'improving';
      this.trendFlipTick = this.tick + 15 + Math.floor(Math.random() * 15);
    }

    const drift = this.networkTrend === 'improving' ? 0.1 : -0.1;

    this.bitrate = clamp(
      this.bitrate + drift * 0.5 + (Math.random() - 0.5) * 0.4,
      0.3,
      18
    );
    this.bufferHealth = clamp(
      this.bufferHealth +
        (this.networkTrend === 'improving' ? -0.01 : 0.02) +
        (Math.random() - 0.5) * 0.05,
      0,
      1
    );
    this.latency = clamp(
      this.latency + drift * -5 + (Math.random() - 0.5) * 15,
      5,
      350
    );
    this.rebuffering = clamp(
      this.rebuffering +
        (this.networkTrend === 'improving' ? -0.01 : 0.02) +
        (Math.random() - 0.5) * 0.02,
      0,
      1
    );
  }

  private async _writeToAtlas(metrics: LiveMetrics): Promise<void> {
    try {
      // Write telemetry via bridge proxy (replaces deprecated Atlas Data API)
      await axios.post(
        `${BRIDGE_URL}/telemetry`,
        {
          session_id: this.sessionId, // ← session_id NOT device_id
          bitrate: metrics.bitrate,
          buffer_health: metrics.buffer_health, // ← buffer_health NOT buffer_ratio
          latency: metrics.latency,
          rebuffering: metrics.rebuffering,
          qoe_score: metrics.qoe_score,
          mode: metrics.mode,
        },
        { timeout: 10000 }
      );
    } catch {
      // Silently fail — metrics are best-effort
    }
  }
}
