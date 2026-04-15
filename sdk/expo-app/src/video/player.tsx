// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Player Wrapper Component
// Wraps react-native-video with telemetry + adaptation + overlay
// ─────────────────────────────────────────────────────────────

import React, {
  useRef,
  useCallback,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { View, StyleSheet, type ViewStyle, Platform } from 'react-native';
import Video, {
  SelectedVideoTrackType,
  type BufferConfig,
  type OnBandwidthUpdateData,
  type OnBufferData,
  type OnLoadData,
  type OnPlaybackStateChangedData,
  type OnProgressData,
  type ReactVideoSource,
  type SelectedVideoTrack,
  type VideoRef,
} from 'react-native-video';
import { useSDKStore } from '../core/store';
import { frameCaptureService } from '../telemetry/frame-capture';
import { MobCloudXSDK } from '../core/sdk';
import { QoEOverlay } from '../ui/qoe-overlay';
import { QADebugPanel } from '../ui/qa-debug-panel';
import type { AdaptationDecision, PlaybackMetrics, PlayerConfig } from '../types';
import { logger } from '../core/logger';
import { apiService } from '../services/api.service';

export interface MobCloudXPlayerProps {
  source: PlayerConfig['source'];
  autoPlay?: boolean;
  muted?: boolean;
  repeat?: boolean;
  resizeMode?: 'contain' | 'cover' | 'stretch';
  showOverlay?: boolean;
  style?: ViewStyle;
  onReady?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnd?: () => void;
  onError?: (error: unknown) => void;
  onBuffering?: (isBuffering: boolean) => void;
}

export interface MobCloudXPlayerRef {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  getCurrentTime: () => number;
  activateSurvivalMode: (congestionProbability: number) => void;
  restoreNormalMode: () => void;
  setPreferredResolution: (resolution: string) => void;
  setAdaptiveAutoMode: () => void;
}

const NORMAL_BUFFER_CONFIG: BufferConfig = {
  minBufferMs: 15000,
  maxBufferMs: 60000,
  bufferForPlaybackMs: 2500,
  bufferForPlaybackAfterRebufferMs: 5000,
  backBufferDurationMs: 30000,
  cacheSizeMB: 50,
};

const SURVIVAL_BUFFER_CONFIG: BufferConfig = {
  minBufferMs: 5000,
  maxBufferMs: 90000,
  bufferForPlaybackMs: 1000,
  bufferForPlaybackAfterRebufferMs: 2000,
  backBufferDurationMs: 10000,
  cacheSizeMB: 100,
};

const RESOLUTION_MAP: Record<number, { width: number; height: number; label: string }> = {
  240: { width: 426, height: 240, label: '240p' },
  360: { width: 640, height: 360, label: '360p' },
  480: { width: 854, height: 480, label: '480p' },
  720: { width: 1280, height: 720, label: '720p' },
  1080: { width: 1920, height: 1080, label: '1080p' },
};
const RESOLUTION_ORDER = [240, 360, 480, 720, 1080] as const;

function getResolutionLabel(width?: number, height?: number) {
  if (!height && !width) return 'auto';
  const targetHeight = height ?? 0;
  const known = Object.entries(RESOLUTION_MAP).find(([, value]) => value.height === targetHeight);
  if (known) {
    return known[1].label;
  }
  if (width && height) {
    return `${Math.round(width)}x${Math.round(height)}`;
  }
  return `${Math.round(targetHeight)}p`;
}

function createTrackSelectionForProbability(congestionProbability: number): SelectedVideoTrack {
  if (congestionProbability > 0.9) return { type: SelectedVideoTrackType.RESOLUTION, value: 240 };
  if (congestionProbability > 0.75) return { type: SelectedVideoTrackType.RESOLUTION, value: 360 };
  if (congestionProbability > 0.6) return { type: SelectedVideoTrackType.RESOLUTION, value: 480 };
  if (congestionProbability > 0.35) return { type: SelectedVideoTrackType.RESOLUTION, value: 720 };
  return { type: SelectedVideoTrackType.RESOLUTION, value: 1080 };
}

function getResolutionHeight(label?: string): number | null {
  if (!label) return null;
  const match = label.match(/(\d{3,4})p$/);
  if (match) return Number(match[1]);
  return null;
}

function getClosestResolutionStep(currentLabel: string, requestedHeight: number): number {
  const currentHeight = getResolutionHeight(currentLabel) ?? 1080;
  const currentIndex = RESOLUTION_ORDER.findIndex((value) => value === currentHeight);
  const targetIndex = RESOLUTION_ORDER.findIndex((value) => value === requestedHeight);

  if (targetIndex === -1) {
    return currentHeight;
  }
  if (currentIndex === -1) {
    return RESOLUTION_ORDER[Math.min(targetIndex, RESOLUTION_ORDER.length - 1)];
  }
  if (currentIndex === targetIndex) {
    return RESOLUTION_ORDER[currentIndex];
  }
  return currentIndex < targetIndex ? RESOLUTION_ORDER[currentIndex + 1] : RESOLUTION_ORDER[currentIndex - 1];
}

function createStepwiseTrackSelection(
  currentLabel: string,
  congestionProbability: number,
  requestedHeight?: number
): SelectedVideoTrack {
  const fallbackSelection = createTrackSelectionForProbability(congestionProbability);
  if (fallbackSelection.type !== SelectedVideoTrackType.RESOLUTION) {
    return fallbackSelection;
  }

  const fallbackHeight = typeof fallbackSelection.value === 'number' ? fallbackSelection.value : 1080;
  const targetHeight = requestedHeight ?? fallbackHeight;
  const nextHeight = getClosestResolutionStep(currentLabel, targetHeight);
  return { type: SelectedVideoTrackType.RESOLUTION, value: nextHeight };
}

function createTrackSelectionForResolutionLabel(
  currentLabel: string,
  resolutionLabel?: string
): SelectedVideoTrack {
  const requestedHeight = getResolutionHeight(resolutionLabel ?? '');
  if (!requestedHeight) {
    return { type: SelectedVideoTrackType.AUTO };
  }

  const nextHeight = getClosestResolutionStep(currentLabel, requestedHeight);
  return { type: SelectedVideoTrackType.RESOLUTION, value: nextHeight };
}

function toSourceType(source: PlayerConfig['source']): string | undefined {
  if (source.type === 'hls' || source.uri.endsWith('.m3u8')) {
    return 'm3u8';
  }
  if (source.type === 'dash' || source.uri.endsWith('.mpd')) {
    return 'mpd';
  }
  if (source.type === 'mp4' || source.uri.endsWith('.mp4')) {
    return 'mp4';
  }
  return source.type;
}

function toVideoSource(source: PlayerConfig['source']): ReactVideoSource {
  return {
    uri: source.uri,
    type: toSourceType(source),
    headers: source.headers,
  };
}

export const MobCloudXPlayer = forwardRef<MobCloudXPlayerRef, MobCloudXPlayerProps>(
  function MobCloudXPlayer(props, ref) {
    const {
      source,
      autoPlay = true,
      muted = false,
      repeat = false,
      resizeMode = 'contain',
      showOverlay = true,
      style,
      onReady,
      onPlay,
      onPause,
      onEnd,
      onError,
      onBuffering,
    } = props;

    const mode = useSDKStore((s) => s.mode);
    const sessionId = useSDKStore((s) => s.sessionId);
    const viewRef = useRef<View>(null);
    const videoRef = useRef<VideoRef>(null);
    const metricsInterval = useRef<ReturnType<typeof setInterval> | null>(null);
    const startupStartRef = useRef<number | null>(null);
    const startupLatencyRef = useRef<number | undefined>(undefined);
    const isPlayingRef = useRef(false);
    const isBufferingRef = useRef(false);
    const currentTimeRef = useRef(0);
    const durationRef = useRef(0);
    const playableDurationRef = useRef(0);
    const currentBitrateRef = useRef(0);
    const currentResolutionRef = useRef<string>('auto');
    const stallStartRef = useRef<number | null>(null);
    const totalStallMsRef = useRef(0);
    const stallCountRef = useRef(0);
    const [paused, setPaused] = useState(!autoPlay);
    const [bufferConfig, setBufferConfig] = useState<BufferConfig>(NORMAL_BUFFER_CONFIG);
    const [selectedVideoTrack, setSelectedVideoTrack] = useState<SelectedVideoTrack>({
      type: SelectedVideoTrackType.AUTO,
    });

    const isHlsSource = source.type === 'hls' || source.uri.endsWith('.m3u8');

    useEffect(() => {
      if (viewRef.current) {
        frameCaptureService.setPlayerRef(viewRef as any);
      }
    }, []);

    useEffect(() => {
      const sdk = MobCloudXSDK.getInstance();
      const adaptationManager = sdk.getAdaptationManager();

      if (adaptationManager) {
        adaptationManager.registerApplier((decision: AdaptationDecision) => {
          applyAdaptation(decision);
        });
      }
    }, []);

    useEffect(() => {
      startupStartRef.current = Date.now();
      startupLatencyRef.current = undefined;
      currentTimeRef.current = 0;
      playableDurationRef.current = 0;
      durationRef.current = 0;
      currentBitrateRef.current = 0;
      currentResolutionRef.current = isHlsSource ? '1080p' : currentResolutionRef.current;
      totalStallMsRef.current = 0;
      stallCountRef.current = 0;
      stallStartRef.current = null;
      isBufferingRef.current = false;
      isPlayingRef.current = false;
      setPaused(!autoPlay);

      if (!isHlsSource) {
        setBufferConfig(NORMAL_BUFFER_CONFIG);
        setSelectedVideoTrack({ type: SelectedVideoTrackType.AUTO });
      }
    }, [autoPlay, isHlsSource, source.uri]);

    const pushPlaybackMetrics = useCallback(() => {
      const metrics: PlaybackMetrics = {
        currentBitrate: currentBitrateRef.current,
        bufferHealthMs: Math.max(0, playableDurationRef.current - currentTimeRef.current) * 1000,
        droppedFrames: 0,
        currentFps: 30,
        resolution: currentResolutionRef.current,
        playbackPosition: currentTimeRef.current,
        duration: durationRef.current,
        isBuffering: isBufferingRef.current,
        startupLatencyMs: startupLatencyRef.current,
      };

      const sdk = MobCloudXSDK.getInstance();
      const telemetryManager = sdk.getTelemetryManager();
      telemetryManager?.updatePlaybackMetrics(metrics);

      useSDKStore.getState().updatePlayerState({
        isPlaying: isPlayingRef.current,
        isBuffering: isBufferingRef.current,
        currentTime: currentTimeRef.current,
        duration: durationRef.current,
        currentBitrate: currentBitrateRef.current,
        currentResolution: currentResolutionRef.current,
      });
    }, []);

    useEffect(() => {
      metricsInterval.current = setInterval(() => {
        pushPlaybackMetrics();
      }, 1000);

      return () => {
        if (metricsInterval.current) {
          clearInterval(metricsInterval.current);
        }
      };
    }, [pushPlaybackMetrics]);

    const emitBandwidthTelemetry = useCallback((event: OnBandwidthUpdateData) => {
      void apiService.sendTelemetry({
        eventType: 'player_bandwidth_update',
        sessionId,
        ts: Date.now(),
        metrics: {
          bitrate: event.bitrate,
          resolution: getResolutionLabel(event.width, event.height),
          playback_position: currentTimeRef.current,
          duration: durationRef.current,
          buffer_health_ms: Math.max(0, playableDurationRef.current - currentTimeRef.current) * 1000,
        },
      });
    }, [sessionId]);

    const handleBandwidthUpdate = useCallback((event: OnBandwidthUpdateData) => {
      currentBitrateRef.current = event.bitrate ?? 0;
      currentResolutionRef.current = getResolutionLabel(event.width, event.height);
      pushPlaybackMetrics();
      emitBandwidthTelemetry(event);
      logger.debug(
        `Bandwidth update: ${event.bitrate}bps (${currentResolutionRef.current})`
      );
    }, [emitBandwidthTelemetry, pushPlaybackMetrics]);

    const handleLoad = useCallback((event: OnLoadData) => {
      durationRef.current = event.duration ?? 0;
      currentTimeRef.current = event.currentTime ?? 0;

      if (startupStartRef.current) {
        startupLatencyRef.current = Date.now() - startupStartRef.current;
      }

      const selectedTrack = event.videoTracks?.find((track) => track.selected);
      if (selectedTrack) {
        currentBitrateRef.current = selectedTrack.bitrate ?? currentBitrateRef.current;
        currentResolutionRef.current = getResolutionLabel(selectedTrack.width, selectedTrack.height);
      } else if (event.naturalSize?.height) {
        currentResolutionRef.current = getResolutionLabel(event.naturalSize.width, event.naturalSize.height);
      }

      pushPlaybackMetrics();
      onReady?.();
    }, [onReady, pushPlaybackMetrics]);

    const handleProgress = useCallback((event: OnProgressData) => {
      currentTimeRef.current = event.currentTime ?? 0;
      playableDurationRef.current = event.playableDuration ?? 0;
      durationRef.current = event.seekableDuration || durationRef.current;
      pushPlaybackMetrics();
    }, [pushPlaybackMetrics]);

    const handleBuffer = useCallback((event: OnBufferData) => {
      isBufferingRef.current = event.isBuffering;
      onBuffering?.(event.isBuffering);

      if (event.isBuffering) {
        if (stallStartRef.current == null) {
          stallStartRef.current = Date.now();
          stallCountRef.current += 1;
        }
      } else if (stallStartRef.current != null) {
        totalStallMsRef.current += Date.now() - stallStartRef.current;
        stallStartRef.current = null;
      }

      pushPlaybackMetrics();
    }, [onBuffering, pushPlaybackMetrics]);

    const handlePlaybackStateChanged = useCallback((event: OnPlaybackStateChangedData) => {
      const wasPlaying = isPlayingRef.current;
      isPlayingRef.current = event.isPlaying;

      if (event.isPlaying && !wasPlaying) {
        onPlay?.();
      }
      if (!event.isPlaying && wasPlaying) {
        onPause?.();
      }

      pushPlaybackMetrics();
    }, [onPause, onPlay, pushPlaybackMetrics]);

    const handleError = useCallback((error: unknown) => {
      logger.error(`Video player error: ${JSON.stringify(error)}`);
      onError?.(error);
    }, [onError]);

    const activateSurvivalMode = useCallback((congestionProbability: number) => {
      if (!isHlsSource) {
        return;
      }

      setBufferConfig(SURVIVAL_BUFFER_CONFIG);
      setSelectedVideoTrack(createStepwiseTrackSelection(currentResolutionRef.current, congestionProbability));
      logger.info(`Survival mode activated (${congestionProbability.toFixed(2)})`);
    }, [isHlsSource]);

    const restoreNormalMode = useCallback(() => {
      setBufferConfig(NORMAL_BUFFER_CONFIG);
      setSelectedVideoTrack({ type: SelectedVideoTrackType.AUTO });
      logger.info('Normal ABR mode restored');
    }, []);

    const setPreferredResolution = useCallback((resolution: string) => {
      if (!isHlsSource) {
        return;
      }

      setSelectedVideoTrack(
        createTrackSelectionForResolutionLabel(currentResolutionRef.current, resolution)
      );
      logger.info(`Preferred HLS resolution set to ${resolution}`);
    }, [isHlsSource]);

    const setAdaptiveAutoMode = useCallback(() => {
      restoreNormalMode();
    }, [restoreNormalMode]);

    const applyAdaptation = useCallback((decision: AdaptationDecision) => {
      logger.info(`Applying adaptation: ${decision.decision}`);

      if (isHlsSource && decision.target_resolution) {
        const nextTrack = createStepwiseTrackSelection(
          currentResolutionRef.current,
          decision.congestion_probability ?? 0,
          decision.target_resolution
        );
        setSelectedVideoTrack(nextTrack);
        const mapped =
          nextTrack.type === SelectedVideoTrackType.RESOLUTION && typeof nextTrack.value === 'number'
            ? RESOLUTION_MAP[nextTrack.value]
            : undefined;
        currentResolutionRef.current = mapped?.label ?? `${decision.target_resolution}p`;
      }

      switch (decision.recommended_action) {
        case 'switch_to_cached':
        case 'prefetch_low_quality':
          activateSurvivalMode(decision.congestion_probability ?? 0.8);
          break;
        case 'upgrade':
        case 'normal':
          restoreNormalMode();
          break;
        default:
          switch (decision.decision) {
            case 'increase_buffer':
              activateSurvivalMode(0.8);
              break;
            case 'maintain':
            case 'increase_resolution':
              restoreNormalMode();
              break;
            default:
              break;
          }
      }
    }, [activateSurvivalMode, isHlsSource, restoreNormalMode]);

    useImperativeHandle(ref, () => ({
      play: () => {
        setPaused(false);
        videoRef.current?.resume();
      },
      pause: () => {
        setPaused(true);
        videoRef.current?.pause();
      },
      seek: (time: number) => {
        currentTimeRef.current = time;
        videoRef.current?.seek(time);
      },
      getCurrentTime: () => currentTimeRef.current,
      activateSurvivalMode,
      restoreNormalMode,
      setPreferredResolution,
      setAdaptiveAutoMode,
    }), [activateSurvivalMode, restoreNormalMode, setAdaptiveAutoMode, setPreferredResolution]);

    return (
      <View ref={viewRef} style={[styles.container, style]}>
        <Video
          ref={videoRef}
          source={toVideoSource(source)}
          style={styles.video}
          paused={paused}
          muted={muted}
          repeat={repeat}
          controls={mode === 'user'}
          resizeMode={resizeMode}
          progressUpdateInterval={500}
          reportBandwidth={Platform.OS === 'android'}
          bufferConfig={bufferConfig}
          selectedVideoTrack={isHlsSource ? selectedVideoTrack : undefined}
          onLoad={handleLoad}
          onProgress={handleProgress}
          onBuffer={handleBuffer}
          onBandwidthUpdate={handleBandwidthUpdate}
          onPlaybackStateChanged={handlePlaybackStateChanged}
          onEnd={onEnd}
          onError={handleError}
        />

        {showOverlay && mode === 'user' && <QoEOverlay />}
        {showOverlay && mode === 'qa' && <QADebugPanel />}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    position: 'relative',
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
  },
});
