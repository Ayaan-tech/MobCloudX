// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Telemetry Manager
// Orchestrates all collectors and periodic push to backend
// ─────────────────────────────────────────────────────────────

import type {
  MobCloudXConfig,
  TelemetryPayload,
  PlaybackMetrics,
  AudioMetrics,
  NetworkInfo,
  BatteryInfo,
  DeviceInfo,
} from '../types';
import { apiService } from '../services/api.service';
import { networkCollector } from './network-collector';
import { batteryCollector } from './battery-collector';
import { collectDeviceInfo } from './device-collector';
import { frameCaptureService } from './frame-capture';
import { useSDKStore } from '../core/store';
import { logger } from '../core/logger';
import { offlineQueue } from './offline-queue';

export class TelemetryManager {
  private config: MobCloudXConfig;
  private sessionId: string;
  private deviceInfo: DeviceInfo | null = null;
  private pushInterval: ReturnType<typeof setInterval> | null = null;
  private lastFrameBase64: string | null = null;
  private _pushCount = 0;
  private _errorCount = 0;
  private _drainInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: MobCloudXConfig, sessionId: string) {
    this.config = config;
    this.sessionId = sessionId;
  }

  async start(): Promise<void> {
    // 1. Collect static device info
    this.deviceInfo = collectDeviceInfo();

    // 2. Start network listener
    networkCollector.start();
    networkCollector.addListener((info: NetworkInfo) => {
      useSDKStore.getState().updateNetworkInfo(info);
    });

    // 3. Start battery listener
    await batteryCollector.start();
    batteryCollector.addListener((info: BatteryInfo) => {
      useSDKStore.getState().updateBatteryInfo(info);
    });

    // 4. Initialize API
    apiService.configure(this.config.apiBaseUrl);

    // 4b. Hydrate offline queue + start drain cycle (every 30s)
    await offlineQueue.hydrate();
    this._drainInterval = setInterval(() => {
      const network = useSDKStore.getState().networkInfo;
      if (network.isConnected) {
        offlineQueue.drain((payload) => apiService.sendTelemetry(payload));
      }
    }, 30_000);

    // Attempt immediate drain if online
    const net = useSDKStore.getState().networkInfo;
    if (net.isConnected && offlineQueue.size > 0) {
      offlineQueue.drain((payload) => apiService.sendTelemetry(payload));
    }

    // 5. Start periodic telemetry push
    const interval = this.config.telemetryIntervalMs ?? 3000;
    this.pushInterval = setInterval(() => {
      this.pushTelemetry();
    }, interval);

    // 6. Start frame capture (if enabled)
    const frameCaptureInterval = this.config.frameCaptureIntervalMs ?? 3000;
    frameCaptureService.start(frameCaptureInterval, (base64) => {
      this.lastFrameBase64 = base64;
    });

    logger.info('TelemetryManager started');
  }

  stop(): void {
    if (this.pushInterval) {
      clearInterval(this.pushInterval);
      this.pushInterval = null;
    }
    if (this._drainInterval) {
      clearInterval(this._drainInterval);
      this._drainInterval = null;
    }
    networkCollector.stop();
    batteryCollector.stop();
    frameCaptureService.stop();
    logger.info(`TelemetryManager stopped (${this._pushCount} pushes, ${this._errorCount} errors, ${offlineQueue.size} queued)`);
  }

  /**
   * Called by the player wrapper whenever playback metrics update.
   */
  updatePlaybackMetrics(metrics: PlaybackMetrics): void {
    useSDKStore.getState().updatePlaybackMetrics(metrics);
  }

  updateAudioMetrics(metrics: AudioMetrics): void {
    useSDKStore.getState().updateAudioMetrics(metrics);
  }

  /**
   * Assemble and push telemetry payload to backend.
   */
  private async pushTelemetry(): Promise<void> {
    const store = useSDKStore.getState();
    const network = store.networkInfo;
    const battery = store.batteryInfo;
    const audio = store.audioMetrics;
    const playback = store.playbackMetrics;

    const payload: TelemetryPayload = {
      eventType: 'sdk_telemetry',
      sessionId: this.sessionId,
      ts: Date.now(),
      metrics: {
        // Device
        device_model: this.deviceInfo?.model,
        os_version: this.deviceInfo?.osVersion,
        screen_resolution: this.deviceInfo
          ? `${this.deviceInfo.screenWidth}x${this.deviceInfo.screenHeight}`
          : undefined,
        total_memory_mb: this.deviceInfo?.totalMemoryMb,

        // Network
        network_type: network.type,
        cellular_generation: network.cellularGeneration,
        is_connected: network.isConnected,
        signal_strength_dbm: network.signalStrengthDbm,

        // Battery
        battery_level: battery.level,
        battery_charging: battery.isCharging,

        // Playback (may be null if player not active)
        bitrate: playback?.currentBitrate,
        buffer_health_ms: playback?.bufferHealthMs,
        dropped_frames: playback?.droppedFrames,
        current_fps: playback?.currentFps,
        resolution: playback?.resolution,
        codec: playback?.codec,
        is_buffering: playback?.isBuffering,
        playback_position: playback?.playbackPosition,
        duration: playback?.duration,
        startup_latency_ms: playback?.startupLatencyMs,

        // Audio quality signals
        audio_jitter_ms: audio.jitterMs,
        audio_packet_loss_pct: audio.packetLossPct,
        audio_latency_ms: audio.latencyMs,
        av_sync_offset_ms: audio.avSyncOffsetMs,

        // Frame thumbnail
        frame_thumbnail_base64: this.lastFrameBase64 ?? undefined,
      },
      meta: {
        sdk_version: '1.0.0',
        mode: store.mode,
        session_duration_ms: Date.now(),
      },
    };

    const result = await apiService.sendTelemetry(payload);

    if (result.ok) {
      this._pushCount++;
    } else {
      this._errorCount++;
      // If send fails, enqueue for offline retry
      await offlineQueue.enqueue(payload);
      logger.debug(`Telemetry queued offline (queue: ${offlineQueue.size})`);
    }

    // Clear frame after sending
    this.lastFrameBase64 = null;
  }

  get pushCount(): number {
    return this._pushCount;
  }

  get errorCount(): number {
    return this._errorCount;
  }
}
