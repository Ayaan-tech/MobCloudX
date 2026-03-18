// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Player Wrapper Component
// Wraps expo-video with telemetry + adaptation + overlay
// ─────────────────────────────────────────────────────────────

import React, { useRef, useCallback, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSDKStore } from '../core/store';
import { frameCaptureService } from '../telemetry/frame-capture';
import { MobCloudXSDK } from '../core/sdk';
import { QoEOverlay } from '../ui/qoe-overlay';
import { QADebugPanel } from '../ui/qa-debug-panel';
import type { AdaptationDecision, PlaybackMetrics, PlayerConfig } from '../types';
import { logger } from '../core/logger';

// ── Props ────────────────────────────────────────────────────

export interface MobCloudXPlayerProps {
  /** Video source config */
  source: PlayerConfig['source'];
  /** Auto play on mount */
  autoPlay?: boolean;
  /** Muted */
  muted?: boolean;
  /** Loop */
  repeat?: boolean;
  /** Resize mode */
  resizeMode?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  /** Show QoE overlay */
  showOverlay?: boolean;
  /** Container style */
  style?: ViewStyle;
  /** Playback event callbacks */
  onReady?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnd?: () => void;
  onError?: (error: any) => void;
  onBuffering?: (isBuffering: boolean) => void;
}

export interface MobCloudXPlayerRef {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  getCurrentTime: () => number;
  replace: (source: { uri: string }) => void;
}

// ── Resolution mapping for adaptation ───────────────────────

const RESOLUTION_MAP: Record<number, { width: number; height: number }> = {
  360:  { width: 640, height: 360 },
  480:  { width: 854, height: 480 },
  720:  { width: 1280, height: 720 },
  1080: { width: 1920, height: 1080 },
};

// ── Component ────────────────────────────────────────────────

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

    const viewRef = useRef<View>(null);
    const mode = useSDKStore((s) => s.mode);
    const config = useSDKStore((s) => s.config);
    const [currentResolution, setCurrentResolution] = useState('auto');
    const metricsInterval = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Expo Video Player ──────────────────────────────────

    const player = useVideoPlayer(source.uri, (p) => {
      p.loop = repeat;
      p.muted = muted;
      if (autoPlay) {
        p.play();
      }
    });

    // Handle source prop changes (trigger dynamic resolution swap)
    useEffect(() => {
      if (player) {
        player.replace({ uri: source.uri });
        if (autoPlay) {
          player.play();
        }
      }
    }, [source.uri, player, autoPlay]);

    // ── Register frame capture ref ─────────────────────────

    useEffect(() => {
      if (viewRef.current) {
        frameCaptureService.setPlayerRef(viewRef as any);
      }
    }, []);

    // ── Register adaptation applier ────────────────────────

    useEffect(() => {
      const sdk = MobCloudXSDK.getInstance();
      const adaptationManager = sdk.getAdaptationManager();

      if (adaptationManager) {
        adaptationManager.registerApplier((decision: AdaptationDecision) => {
          applyAdaptation(decision);
        });
      }

      return () => {
        // cleanup
      };
    }, []);

    // ── Playback metrics polling ───────────────────────────

    useEffect(() => {
      metricsInterval.current = setInterval(() => {
        collectPlaybackMetrics();
      }, 1000); // 1s metrics polling

      return () => {
        if (metricsInterval.current) {
          clearInterval(metricsInterval.current);
        }
      };
    }, [player]);

    const collectPlaybackMetrics = useCallback(() => {
      if (!player) return;

      // Estimate bitrate from resolution (Mbps)
      const resBitrateMap: Record<string, number> = {
        '360p': 0.5,   // 500 kbps
        '480p': 1.5,   // 1.5 Mbps
        '720p': 3.5,   // 3.5 Mbps
        '1080p': 6.0,  // 6 Mbps
      };
      const estimatedBitrate = resBitrateMap[currentResolution] ?? 2.0;

      // Estimate buffer health from playback state
      // If playing smoothly → assume 8-12s buffer
      // If buffering → 0-2s buffer
      const isBuffering = player.status === 'loading';
      const estimatedBufferMs = isBuffering 
        ? Math.random() * 2000  // 0-2s when buffering
        : 8000 + Math.random() * 4000;  // 8-12s when playing

      const metrics: PlaybackMetrics = {
        currentBitrate: estimatedBitrate,
        bufferHealthMs: estimatedBufferMs,
        droppedFrames: 0,
        currentFps: 30, // default — expo-video doesn't expose raw FPS
        resolution: currentResolution,
        playbackPosition: player.currentTime ?? 0,
        duration: player.duration ?? 0,
        isBuffering: isBuffering,
      };

      const sdk = MobCloudXSDK.getInstance();
      const telemetryManager = sdk.getTelemetryManager();
      telemetryManager?.updatePlaybackMetrics(metrics);

      useSDKStore.getState().updatePlayerState({
        isPlaying: player.playing,
        isBuffering: player.status === 'loading',
        currentTime: player.currentTime ?? 0,
        duration: player.duration ?? 0,
        currentResolution,
      });
    }, [player, currentResolution]);

    // ── Apply adaptation decision to player ────────────────

    const applyAdaptation = useCallback(
      (decision: AdaptationDecision) => {
        logger.info(`Applying adaptation: ${decision.decision}`);

        switch (decision.decision) {
          case 'reduce_bitrate':
          case 'switch_resolution':
            if (decision.target_resolution) {
              const res = RESOLUTION_MAP[decision.target_resolution];
              if (res) {
                setCurrentResolution(`${res.width}x${res.height}`);
                // For HLS: the player auto-adapts. For custom ABR:
                // player would need a new source URI with the target resolution.
                logger.info(`Resolution target set: ${decision.target_resolution}p`);
              }
            }
            break;

          case 'increase_buffer':
            // expo-video doesn't expose buffer tuning — log intent
            logger.info('Buffer increase requested (not directly tunable in expo-video)');
            break;

          case 'switch_codec':
            logger.info(`Codec switch requested: ${decision.target_codec}`);
            break;

          default:
            logger.warn(`Unknown adaptation decision: ${decision.decision}`);
        }
      },
      [player]
    );

    // ── Imperative handle ──────────────────────────────────

    useImperativeHandle(ref, () => ({
      play: () => player?.play(),
      pause: () => player?.pause(),
      seek: (time: number) => {
        if (player) player.currentTime = time;
      },
      getCurrentTime: () => player?.currentTime ?? 0,
      replace: (newSource: { uri: string }) => {
        if (player) {
          player.replace(newSource);
        }
      },
    }));

    // ── Render ─────────────────────────────────────────────

    return (
      <View ref={viewRef} style={[styles.container, style]}>
        <VideoView
          player={player}
          style={styles.video}
          contentFit={resizeMode}
          nativeControls={mode === 'user'}
        />

        {/* QoE Overlay — user mode: floating gauge, QA mode: debug panel */}
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
