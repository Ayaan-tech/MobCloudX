// ─────────────────────────────────────────────────────────────
// MobCloudX Demo — Player Screen (Redesigned v2)
// Portrait: Top half video + bottom half metrics dashboard
// Landscape: Left half video + right half metrics dashboard
// Matches the reference UI with speedometer, sparkline, bar chart, chips
// ─────────────────────────────────────────────────────────────

import React, { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  useWindowDimensions,
  StatusBar,
  Platform,
  Modal,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import {
  MobCloudXPlayer,
  type MobCloudXPlayerRef,
  useQoE,
  usePlayback,
  useNetwork,
  useBattery,
  useAdaptation,
  useSDKMode,
  useLocalQoE,
  useQoEAlert,
  useSessionId,
  useSDKStore,
} from '../src';

// Visual components
import { QoESpeedometer } from '../src/ui/qoe-speedometer';
import { VMAFSpeedometer } from '../src/ui/vmaf-speedometer';
import { BufferBarChart } from '../src/ui/buffer-bar-chart';
import { ThroughputSparkline } from '../src/ui/throughput-sparkline';
import { DeviceContextChips } from '../src/ui/device-context-chips';
import { ResolutionBadge } from '../src/ui/resolution-badge';
import { computeDemoThrottleEffect } from '../src/telemetry/demo-throttle';

// ── S3 Production bucket URLs for transcoded resolutions ────
const S3_BUCKET = 'https://s3.us-east-1.amazonaws.com/prod-video.mobcloudx.xyz';
const HLS_MASTER_SOURCE = {
  uri: `${S3_BUCKET}/video5-hls/master.m3u8`,
  type: 'hls' as const,
};
const HLS_VARIANT_SOURCES: Record<string, { uri: string; type: 'hls' }> = {
  '240p': { uri: `${S3_BUCKET}/video5-hls/240p.m3u8`, type: 'hls' },
  '360p': { uri: `${S3_BUCKET}/video5-hls/360p.m3u8`, type: 'hls' },
  '480p': { uri: `${S3_BUCKET}/video5-hls/480p.m3u8`, type: 'hls' },
  '720p': { uri: `${S3_BUCKET}/video5-hls/720p.m3u8`, type: 'hls' },
  '1080p': { uri: `${S3_BUCKET}/video5-hls/1080p.m3u8`, type: 'hls' },
};
const RESOLUTION_SOURCES: Record<string, { uri: string }> = {
  '240p':  { uri: `${S3_BUCKET}/video5-240p.mp4` },
  '360p':  { uri: `${S3_BUCKET}/video5-360p.mp4` },
  '480p':  { uri: `${S3_BUCKET}/video5-480p.mp4` },
  '720p':  { uri: `${S3_BUCKET}/video5-720p.mp4` },
  '1080p': { uri: `${S3_BUCKET}/video5-1080p.mp4` },
};
const AUTO_START_RESOLUTION = '1080p';
const DEFAULT_RESOLUTION = '720p';
const DEFAULT_VIDEO = RESOLUTION_SOURCES[DEFAULT_RESOLUTION];
const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE === 'true';
const INFERENCE_URL =
  process.env.EXPO_PUBLIC_INFERENCE_URL?.replace(/\/$/, '') ?? 'http://10.0.2.2:8000';
const THROTTLE_PROFILES = {
  normal: {
    label: 'Normal',
    networkLabel: 'Stable network',
    qoe: 88,
    throughput: 42,
    bufferMs: 14000,
    congestion: 0.12,
    message: null,
    jitterMs: 8,
    packetLossPct: 0.1,
    droppedFrames: 0,
    startupLatencyMs: 650,
    outageCycleMs: 0,
    outageDurationMs: 0,
  },
  throttled: {
    label: 'Throttled',
    networkLabel: 'Network under load',
    qoe: 72,
    throughput: 18,
    bufferMs: 7600,
    congestion: 0.44,
    message: 'Network pressure is rising. We are preparing a graceful bitrate downgrade before playback is affected.',
    jitterMs: 42,
    packetLossPct: 1.8,
    droppedFrames: 4,
    startupLatencyMs: 1400,
    outageCycleMs: 0,
    outageDurationMs: 0,
  },
  blindspot: {
    label: 'Blind Spot',
    networkLabel: 'Incoming blind spot',
    qoe: 46,
    throughput: 2.2,
    bufferMs: 3000,
    congestion: 0.83,
    message: 'Incoming blind spot detected. We are pre-buffering lower-quality segments to keep playback uninterrupted at the same timestamp.',
    jitterMs: 96,
    packetLossPct: 6.5,
    droppedFrames: 12,
    startupLatencyMs: 3200,
    outageCycleMs: 14000,
    outageDurationMs: 4200,
  },
  recovery: {
    label: 'Recovery',
    networkLabel: 'Recovering network',
    qoe: 77,
    throughput: 24,
    bufferMs: 9200,
    congestion: 0.28,
    message: 'Network conditions are recovering. We are restoring visual quality gradually while preserving playback continuity.',
    jitterMs: 18,
    packetLossPct: 0.8,
    droppedFrames: 2,
    startupLatencyMs: 900,
    outageCycleMs: 0,
    outageDurationMs: 0,
  },
} as const;
type ThrottleProfileKey = keyof typeof THROTTLE_PROFILES;
const RESOLUTION_STEPS = ['240p', '360p', '480p', '720p', '1080p'] as const;

function getResolutionStepIndex(resolution: string) {
  return RESOLUTION_STEPS.indexOf(resolution as typeof RESOLUTION_STEPS[number]);
}

function getStepwiseResolution(current: string, target: string) {
  const currentIndex = getResolutionStepIndex(current);
  const targetIndex = getResolutionStepIndex(target);
  if (currentIndex === -1 || targetIndex === -1 || currentIndex === targetIndex) {
    return target;
  }
  return currentIndex < targetIndex ? RESOLUTION_STEPS[currentIndex + 1] : RESOLUTION_STEPS[currentIndex - 1];
}

function getVisualTargetResolution(throughputMbps: number, bufferMs: number) {
  if (bufferMs <= 2500 || throughputMbps <= 2.5) return '240p';
  if (bufferMs <= 4500 || throughputMbps <= 4.5) return '360p';
  if (bufferMs <= 7000 || throughputMbps <= 8) return '480p';
  if (bufferMs <= 11000 || throughputMbps <= 18) return '720p';
  return '1080p';
}

function getDemoStageResolution(profile: ThrottleProfileKey, elapsedMs: number) {
  if (profile === 'normal') return '1080p';
  if (profile === 'throttled') return '720p';
  if (profile === 'blindspot') {
    if (elapsedMs < 5000) return '720p';
    if (elapsedMs < 10000) return '480p';
    if (elapsedMs < 15000) return '360p';
    return '240p';
  }
  if (profile === 'recovery') {
    if (elapsedMs < 5000) return '360p';
    if (elapsedMs < 10000) return '480p';
    if (elapsedMs < 15000) return '720p';
    return '1080p';
  }
  return '1080p';
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function getAnchorReason(
  latestProof: ReturnType<typeof useSDKStore.getState>['zkProof']['latestProof'],
  isPlaying: boolean
) {
  if (!latestProof) {
    return isPlaying
      ? 'Proof signals are still being collected for this live session.'
      : 'No proof has been generated for this session yet.';
  }

  const anchorStatus = latestProof.anchor?.status;
  if (anchorStatus === 'submitted') {
    return 'The proof hash has been submitted to the configured Polygon network.';
  }
  if (anchorStatus === 'rpc_unreachable') {
    return 'The proof exists, but the configured Polygon RPC endpoint could not be reached.';
  }
  if (anchorStatus === 'invalid_private_key') {
    return latestProof.anchor?.reason ?? 'The configured Polygon wallet private key is invalid.';
  }
  if (anchorStatus === 'anchor_failed') {
    return latestProof.anchor?.reason ?? 'Anchoring failed after proof generation.';
  }
  if (anchorStatus === 'missing_env') {
    return 'Anchoring is unavailable because the RPC or wallet environment is missing.';
  }
  if (!latestProof.anchor) {
    return 'Anchoring is unavailable because the RPC or wallet environment is missing.';
  }
  return `Anchor is not finalized yet: ${anchorStatus}.`;
}

export default function PlayerScreen() {
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{ videoUri?: string }>();
  const playerRef = useRef<MobCloudXPlayerRef>(null);
  const router = useRouter();
  const qoe = useQoE();
  const playback = usePlayback();
  const network = useNetwork();
  const battery = useBattery();
  const adaptation = useAdaptation();
  const sessionId = useSessionId();
  const { mode, toggleMode } = useSDKMode();
  const playerState = useSDKStore((state) => state.player);
  const demoThrottle = useSDKStore((state) => state.demoThrottle);
  const zkProof = useSDKStore((state) => state.zkProof);
  const updateZKProof = useSDKStore((state) => state.updateZKProof);
  const updateDemoThrottle = useSDKStore((state) => state.updateDemoThrottle);
  const isLandscape = width > height;
  const pendingSeekTimeRef = useRef<number | null>(null);
  const stableResolutionRef = useRef<{ label: string; count: number }>({ label: AUTO_START_RESOLUTION, count: 0 });
  const targetDecisionRef = useRef<{ target: string | null; count: number }>({ target: null, count: 0 });
  const sessionStartedAtRef = useRef(Date.now());
  const qoeStartRef = useRef<number | null>(null);
  const qoeMinimumRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState(AUTO_START_RESOLUTION);
  const [liveResolution, setLiveResolution] = useState(AUTO_START_RESOLUTION);
  const [resolutionMode, setResolutionMode] = useState<'auto' | 'manual'>('auto');
  const [autoPlaybackMode, setAutoPlaybackMode] = useState<'hls-master' | 'hls-variant' | 'mp4-fallback'>('hls-master');
  const [backendTargetResolution, setBackendTargetResolution] = useState<string | null>(null);
  const [vmafData, setVmafData] = useState<{score: number, model: string} | null>(null);
  const vmafScore = vmafData?.score ?? null;
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metricsProbeRef = useRef({
    bufferMs: 0,
    throughputMbps: 0,
    displayedVmaf: 0,
    displayedCongestion: 1,
    isInternetReachable: true,
    liveResolution: AUTO_START_RESOLUTION,
  });
  const [recoveryProbeScore, setRecoveryProbeScore] = useState(0);
  const [recoveryProbeTarget, setRecoveryProbeTarget] = useState<string | null>(null);

  // Seek bar progress
  const seekProgress = useSharedValue(0);

  useLocalQoE(5000);
  useQoEAlert(40, (score, category) => {
    console.warn(`[MobCloudX] QoE Alert: ${score} (${category})`);
  });

  // Video source — from S3 resolution picker or imported
  const isImportedVideo = Boolean(params.videoUri);
  const usingHlsAuto = !isImportedVideo && resolutionMode === 'auto' && autoPlaybackMode !== 'mp4-fallback';
  const videoSource = params.videoUri
    ? { uri: params.videoUri }
    : resolutionMode === 'auto' && autoPlaybackMode !== 'mp4-fallback'
        ? HLS_MASTER_SOURCE
        : RESOLUTION_SOURCES[selectedResolution] ?? DEFAULT_VIDEO;
  const displayedResolution = resolutionMode === 'auto' ? liveResolution : selectedResolution;

  // Resolution change handler — updates video source + QoE baseline
  const handleResolutionChange = useCallback((res: string) => {
    setSelectedResolution(res);
    setLiveResolution(res);
    setResolutionMode('manual');
    if (!isImportedVideo) {
      setAutoPlaybackMode('hls-master');
      playerRef.current?.setPreferredResolution(res);
      playerRef.current?.play();
      setIsPlaying(true);
      return;
    }

    pendingSeekTimeRef.current = playerRef.current?.getCurrentTime() ?? null;
    setAutoPlaybackMode(HLS_VARIANT_SOURCES[res] ? 'hls-variant' : 'mp4-fallback');
    if (playerRef.current) {
      playerRef.current.play();
      setIsPlaying(true);
    }
  }, [isImportedVideo]);

  const enableAutoResolution = useCallback(() => {
    setResolutionMode('auto');
    setAutoPlaybackMode('hls-master');
    setSelectedResolution(AUTO_START_RESOLUTION);
    setLiveResolution(AUTO_START_RESOLUTION);
    setBackendTargetResolution(null);
    targetDecisionRef.current = { target: null, count: 0 };
    playerRef.current?.setAdaptiveAutoMode();
    setToastMessage('Adaptive streaming resumed via HLS master');
  }, []);

  const showTransientToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 3000);
  }, []);

  useEffect(() => () => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
  }, []);

  // Poll VMAF score from API
  useEffect(() => {
    let active = true;
    const fetchVMAF = async () => {
      try {
        // Use 10.0.2.2 for Android emulator to hit local Next.js server
        const res = await fetch(`http://10.0.2.2:3000/api/vmaf/latest?resolution=${displayedResolution}`);
        const data = await res.json();
        if (active && data.success && data.score !== null) {
          setVmafData({ score: data.score, model: data.model });
          return;
        }
      } catch (err) {
        // Silently fallback if API is unreachable
      }
      if (active) {
        const mockVmaf: Record<string, number> = { '240p': 24, '360p': 38, '480p': 68, '720p': 82, '1080p': 92 };
        setVmafData({ score: mockVmaf[displayedResolution] ?? 50, model: 'vmaf_heuristic' });
      }
    };
    fetchVMAF();
    return () => { active = false; };
  }, [displayedResolution]);

  // Wire backend adaptation decisions → operator-visible target tracking
  useEffect(() => {
    const decision = adaptation.latestDecision;
    if (!decision) return;

    const resMap: Record<number, string> = { 240: '240p', 360: '360p', 480: '480p', 720: '720p', 1080: '1080p' };
    const targetRes = decision.target_resolution ? resMap[decision.target_resolution] : null;
    setBackendTargetResolution(targetRes);

    if (targetRes && targetRes !== backendTargetResolution && resolutionMode === 'auto') {
      showTransientToast(
        `${usingHlsAuto ? 'HLS ABR target' : 'Fallback target'} → ${targetRes} (${decision.model_version ?? 'model'})`
      );
    }
  }, [adaptation.latestDecision?.ts, backendTargetResolution, resolutionMode, showTransientToast, usingHlsAuto]);

  useEffect(() => {
    if (resolutionMode !== 'auto') return;
    if (!playerState.currentResolution || playerState.currentResolution === 'auto') return;
    const stable = stableResolutionRef.current;
    if (stable.label === playerState.currentResolution) {
      stableResolutionRef.current = { label: stable.label, count: stable.count + 1 };
    } else {
      stableResolutionRef.current = { label: playerState.currentResolution, count: 1 };
    }
    if (stableResolutionRef.current.count >= 2) {
      setLiveResolution(playerState.currentResolution);
    }
  }, [playerState.currentResolution, resolutionMode]);

  // Show auto-dismissing toast when resolution changes (manual)
  useEffect(() => {
    if (resolutionMode !== 'manual') return;
    showTransientToast(`Switching to ${selectedResolution}`);
  }, [resolutionMode, selectedResolution, showTransientToast]);

  // Mock Metric States for fallback
  const [mockQoeScore, setMockQoeScore] = useState(85);
  const [mockBufferMs, setMockBufferMs] = useState(10000);
  const [mockThroughputMbps, setMockThroughputMbps] = useState(4.2);

  // Demo setup: network simulator and modal
  const [throttleProfile, setThrottleProfile] = useState<ThrottleProfileKey>('normal');
  const [isResModalVisible, setIsResModalVisible] = useState(false);
  const [throttleChangedAt, setThrottleChangedAt] = useState(Date.now());
  const [throttleStageNow, setThrottleStageNow] = useState(Date.now());
  const demoForcedResolutionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!DEMO_MODE) return;
    const interval = setInterval(() => {
      setThrottleStageNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const currentDemoProfile = useMemo(() => {
    const base = THROTTLE_PROFILES[throttleProfile];
    if (throttleProfile === 'recovery') {
      const elapsedMs = throttleStageNow - throttleChangedAt;
      if (elapsedMs < 6000) {
        return {
          ...base,
          throughput: 8,
          bufferMs: 5600,
          congestion: 0.52,
          droppedFrames: 5,
        };
      }
      if (elapsedMs < 12000) {
        return {
          ...base,
          throughput: 16,
          bufferMs: 8600,
          congestion: 0.34,
          droppedFrames: 3,
        };
      }
      return {
        ...base,
        throughput: 28,
        bufferMs: 12500,
        congestion: 0.16,
        droppedFrames: 1,
      };
    }

    if (throttleProfile !== 'blindspot') {
      return base;
    }

    const elapsedMs = throttleStageNow - throttleChangedAt;
    if (elapsedMs < 5000) {
      return {
        ...base,
        throughput: 15,
        bufferMs: 10200,
        congestion: 0.42,
        droppedFrames: 2,
        jitterMs: 22,
        packetLossPct: 1.1,
      };
    }
    if (elapsedMs < 10000) {
      return {
        ...base,
        throughput: 7.2,
        bufferMs: 6200,
        congestion: 0.64,
        droppedFrames: 4,
        jitterMs: 44,
        packetLossPct: 2.8,
      };
    }
    if (elapsedMs < 15000) {
      return {
        ...base,
        throughput: 4.1,
        bufferMs: 4100,
        congestion: 0.78,
        droppedFrames: 7,
        jitterMs: 62,
        packetLossPct: 4.2,
      };
    }
    if (elapsedMs < 21000) {
      return {
        ...base,
        throughput: 2.4,
        bufferMs: 2100,
        congestion: 0.9,
        droppedFrames: 11,
        jitterMs: 94,
        packetLossPct: 6.4,
      };
    }
    return {
      ...base,
      throughput: 1.4,
      bufferMs: 900,
      congestion: 0.97,
      droppedFrames: 16,
      jitterMs: 120,
      packetLossPct: 8.5,
    };
  }, [throttleChangedAt, throttleProfile, throttleStageNow]);

  // Fluctuating Mock Metrics Effect based on Simulated Network
  useEffect(() => {
    const interval = setInterval(() => {
        const profile = currentDemoProfile;
        const baseQoe = profile.qoe;
        const baseThr = profile.throughput;
        const baseBuf = profile.bufferMs;
        setMockQoeScore(baseQoe + (Math.random() * 8 - 4));
        setMockBufferMs(Math.max(0, baseBuf + (Math.random() * 3000 - 1500)));
        setMockThroughputMbps(Math.max(0.5, baseThr + (Math.random() * (baseThr * 0.4) - (baseThr * 0.2))));
    }, 1000);
    return () => clearInterval(interval);
  }, [currentDemoProfile]);

  const effectiveDemo = useMemo(
    () => computeDemoThrottleEffect(demoThrottle, network, playback ?? null),
    [demoThrottle, network, playback]
  );

  // Derived metrics with realistic mock fallbacks if real data is missing
  const hasValidRealMetrics = isPlaying && (playback?.currentBitrate ?? 0) > 0;
  const telemetryPlayback =
    DEMO_MODE && demoThrottle?.enabled
      ? effectiveDemo.playback
      : hasValidRealMetrics
        ? playback!
        : null;
  const telemetryNetwork =
    DEMO_MODE && demoThrottle?.enabled
      ? effectiveDemo.network
      : network;
  const bufferMs = telemetryPlayback?.bufferHealthMs ?? mockBufferMs;
  const bitrateKbps = telemetryPlayback?.currentBitrate ?? mockThroughputMbps * 1000;
  const throughputMbps = bitrateKbps / 1000;
  const resolution = displayedResolution;
  const frameRate = telemetryPlayback?.currentFps ? Math.round(telemetryPlayback.currentFps) : (resolution === '1080p' ? 60 : 30);
  const batteryPct = Math.round((battery.level ?? 0) * 100);
  const targetBitrate = telemetryPlayback && adaptation.latestDecision?.target_bitrate 
    ? adaptation.latestDecision.target_bitrate 
    : bitrateKbps;
  const activeProfile = currentDemoProfile;
  const displayedCongestion = adaptation.latestDecision?.congestion_probability ?? activeProfile.congestion;
  const displayedAction = adaptation.latestDecision?.recommended_action ?? 'normal';
  const displayedUrgency = adaptation.latestDecision?.urgency ?? (displayedCongestion >= 0.75 ? 'critical' : displayedCongestion >= 0.4 ? 'warning' : 'normal');
  const visualTargetResolution = useMemo(
    () => getVisualTargetResolution(throughputMbps, bufferMs),
    [bufferMs, throughputMbps]
  );
  const demoStageResolution = useMemo(
    () => getDemoStageResolution(throttleProfile, Math.max(0, throttleStageNow - throttleChangedAt)),
    [throttleChangedAt, throttleProfile, throttleStageNow]
  );
  const effectiveDemoResolution = recoveryProbeTarget ?? demoStageResolution;
  const visualQualityBase =
    resolution === '1080p' ? 100 :
    resolution === '720p' ? 82 :
    resolution === '480p' ? 62 :
    resolution === '360p' ? 42 :
    24;
  const displayedVmaf = DEMO_MODE
    ? Math.max(0, Math.min(100, visualQualityBase - displayedCongestion * 8))
    : (vmafData?.score ?? visualQualityBase);
  const demoQoeScore = Math.max(
    0,
    Math.min(100, visualQualityBase - displayedCongestion * 12 - (telemetryPlayback?.isBuffering ? 4 : 0))
  );
  const qoeScore = DEMO_MODE ? demoQoeScore : qoe.currentScore > 0 ? qoe.currentScore : mockQoeScore;
  useEffect(() => {
    metricsProbeRef.current = {
      bufferMs,
      throughputMbps,
      displayedVmaf,
      displayedCongestion,
      isInternetReachable: telemetryNetwork?.isInternetReachable !== false,
      liveResolution,
    };
  }, [bufferMs, displayedCongestion, displayedVmaf, liveResolution, telemetryNetwork?.isInternetReachable, throughputMbps]);

  useEffect(() => {
    if (!DEMO_MODE || resolutionMode !== 'auto') return;
    if (throttleProfile !== 'blindspot') {
      setRecoveryProbeTarget(null);
      setRecoveryProbeScore(0);
      return;
    }

    const runRecoveryProbe = () => {
      const snapshot = metricsProbeRef.current;
      const score = Math.round(
        clamp01(snapshot.bufferMs / 12000) * 30 +
        clamp01(snapshot.throughputMbps / 18) * 25 +
        clamp01(snapshot.displayedVmaf / 100) * 20 +
        clamp01(1 - snapshot.displayedCongestion) * 20 +
        (snapshot.isInternetReachable ? 5 : 0)
      );

      setRecoveryProbeScore(score);

      const canProbeUpgrade =
        ['480p', '360p', '240p'].includes(snapshot.liveResolution) &&
        score >= 72 &&
        snapshot.bufferMs >= 7000 &&
        snapshot.throughputMbps >= 8.5 &&
        snapshot.displayedVmaf >= 60 &&
        snapshot.displayedCongestion <= 0.42 &&
        snapshot.isInternetReachable;

      setRecoveryProbeTarget(canProbeUpgrade ? '720p' : null);
    };

    runRecoveryProbe();
    const interval = setInterval(runRecoveryProbe, 4000);
    return () => clearInterval(interval);
  }, [DEMO_MODE, resolutionMode, throttleProfile]);
  const noticeMessage = useMemo(() => {
    if (!DEMO_MODE) return null;
    if (throttleProfile === 'blindspot' && (bufferMs <= 4500 || throughputMbps <= 4.5)) {
      return 'Incoming blind spot detected';
    }
    if ((throttleProfile === 'throttled' || throttleProfile === 'blindspot') && (bufferMs <= 9000 || throughputMbps <= 18)) {
      return 'Preparing lower-quality buffer';
    }
    if (displayedUrgency === 'normal' && throttleProfile === 'recovery') {
      return 'Recovery in progress';
    }
    return null;
  }, [bufferMs, displayedUrgency, throttleProfile, throughputMbps]);
  useEffect(() => {
    if (!noticeMessage) return;
    setNoticeDismissed(false);
    const timer = setTimeout(() => setNoticeDismissed(true), 3000);
    return () => clearTimeout(timer);
  }, [noticeMessage]);
  useEffect(() => {
    if (!DEMO_MODE || resolutionMode !== 'auto') return;
    if (throttleProfile === 'normal') {
      demoForcedResolutionRef.current = null;
      return;
    }

    if (effectiveDemoResolution === liveResolution && demoForcedResolutionRef.current === effectiveDemoResolution) {
      return;
    }

    demoForcedResolutionRef.current = effectiveDemoResolution;
    setSelectedResolution(effectiveDemoResolution);
    setLiveResolution(effectiveDemoResolution);
    setAutoPlaybackMode('hls-master');
    playerRef.current?.setPreferredResolution(effectiveDemoResolution);
    showTransientToast(
      recoveryProbeTarget === '720p'
        ? `Recovery probe passed → 720p`
        : `Visual shift → ${effectiveDemoResolution}`
    );
  }, [DEMO_MODE, effectiveDemoResolution, liveResolution, recoveryProbeTarget, resolutionMode, showTransientToast, throttleProfile]);

  useEffect(() => {
    if (!DEMO_MODE || resolutionMode !== 'auto') return;
    if (throttleProfile !== 'normal') return;
    if (throttleProfile === 'normal' && visualTargetResolution === '1080p') {
      targetDecisionRef.current = { target: visualTargetResolution, count: 0 };
      return;
    }

    if (visualTargetResolution === liveResolution) {
      targetDecisionRef.current = { target: visualTargetResolution, count: 0 };
      return;
    }

    const previous = targetDecisionRef.current;
    const count = previous.target === visualTargetResolution ? previous.count + 1 : 1;
    targetDecisionRef.current = { target: visualTargetResolution, count };
    if (count < 2) return;

    const nextResolution = getStepwiseResolution(liveResolution, visualTargetResolution);
    if (nextResolution === liveResolution) return;

    setAutoPlaybackMode('hls-master');
    setSelectedResolution(nextResolution);
    setLiveResolution(nextResolution);
    playerRef.current?.setPreferredResolution(nextResolution);
    showTransientToast(`Visual shift → ${nextResolution}`);
  }, [DEMO_MODE, liveResolution, resolutionMode, showTransientToast, throttleProfile, visualTargetResolution]);
  useEffect(() => {
    if (qoeStartRef.current == null && qoeScore > 0) {
      qoeStartRef.current = qoeScore;
    }
    qoeMinimumRef.current =
      qoeMinimumRef.current == null ? qoeScore : Math.min(qoeMinimumRef.current, qoeScore);
  }, [qoeScore]);
  const qoeCategory =
    qoeScore >= 85 ? 'excellent' :
    qoeScore >= 65 ? 'good' :
    qoeScore >= 40 ? 'fair' :
    'poor';
  const stallCount = qoe.history[qoe.history.length - 1]?.details?.buffering_events ?? 0;
  const decisionTimeline = useMemo(
    () =>
      adaptation.history
        .slice(-5)
        .reverse()
        .map((item) => ({
          ts: item.ts,
          action: item.recommended_action ?? item.decision,
          congestion: item.congestion_probability ?? 0,
          target: item.target_resolution ? `${item.target_resolution}p` : 'hold',
          urgency: item.urgency ?? 'normal',
        })),
    [adaptation.history]
  );

  useEffect(() => {
    if (!DEMO_MODE) {
      updateDemoThrottle(null);
      return;
    }

    updateDemoThrottle({
      enabled: true,
      profile: throttleProfile,
      label: activeProfile.label,
      startedAtMs: throttleChangedAt,
      throughputMbps: activeProfile.throughput,
      bufferMs: activeProfile.bufferMs,
      congestionProbability: activeProfile.congestion,
      networkType: throttleProfile === 'normal' ? 'wifi' : 'cellular',
      cellularGeneration:
        throttleProfile === 'blindspot' ? '3g' :
        throttleProfile === 'throttled' ? '4g' :
        throttleProfile === 'recovery' ? '4g' :
        undefined,
      isConnected: true,
      signalStrengthDbm:
        throttleProfile === 'blindspot' ? -116 :
        throttleProfile === 'throttled' ? -102 :
        throttleProfile === 'recovery' ? -92 :
        -58,
      jitterMs: activeProfile.jitterMs,
      packetLossPct: activeProfile.packetLossPct,
      droppedFrames: activeProfile.droppedFrames,
      startupLatencyMs: activeProfile.startupLatencyMs,
      outageCycleMs: activeProfile.outageCycleMs,
      outageDurationMs: activeProfile.outageDurationMs,
    });

    return () => {
      updateDemoThrottle(null);
    };
  }, [activeProfile, throttleProfile, updateDemoThrottle]);

  useEffect(() => {
    if (!sessionId || !DEMO_MODE) return;

    let active = true;
    const pollProof = async () => {
      try {
        const response = await fetch(`${INFERENCE_URL}/zk/session/${sessionId}`);
        if (!response.ok) return;
        const data = await response.json();
        if (active && data?.proof) {
          updateZKProof(data.proof, data.proof?.anchor?.status === 'submitted' ? 'anchored' : 'pending');
        }
      } catch {
        // best effort only
      }
    };

    pollProof();
    const interval = setInterval(pollProof, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [sessionId, updateZKProof]);

  useEffect(() => {
    if (!DEMO_MODE || !sessionId || !isPlaying) return;

    let active = true;
    const publishProofSnapshot = async () => {
      try {
        const payload = {
          session_id: sessionId,
          qoe_start: qoeStartRef.current ?? qoeScore,
          qoe_minimum: qoeMinimumRef.current ?? qoeScore,
          qoe_recovery: qoeScore,
          stall_count: stallCount,
          session_duration: Math.max(10, Math.round((Date.now() - sessionStartedAtRef.current) / 1000)),
          metadata: {
            source: 'ott-demo',
            playback_path: usingHlsAuto ? 'hls_master' : 'mp4_fallback',
            current_resolution: resolution,
            backend_target: backendTargetResolution,
            urgency: displayedUrgency,
          },
        };

        const response = await fetch(`${INFERENCE_URL}/zk/generate-proof`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok || !active) return;
        const data = await response.json();
        if (data?.proof) {
          updateZKProof(
            data.proof,
            data.proof?.anchor?.status === 'submitted'
              ? 'anchored'
              : data.proof?.proof_mode === 'groth16'
                ? 'generating'
                : 'pending'
          );
        }
      } catch {
        // best effort only
      }
    };

    publishProofSnapshot();
    const interval = setInterval(publishProofSnapshot, 20000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [
    DEMO_MODE,
    INFERENCE_URL,
    backendTargetResolution,
    displayedUrgency,
    isPlaying,
    qoeScore,
    resolution,
    sessionId,
    stallCount,
    updateZKProof,
    usingHlsAuto,
  ]);

  // Seek bar update
  const currentPos = playback?.playbackPosition ?? 0;
  const totalDuration = playback?.duration ?? 1;
  const seekRatio = totalDuration > 0 ? currentPos / totalDuration : 0;
  
  useEffect(() => {
    seekProgress.value = withTiming(seekRatio, { duration: 500, easing: Easing.linear });
  }, [seekRatio, seekProgress]);

  const seekFillStyle = useAnimatedStyle(() => ({
    width: `${Math.round(seekProgress.value * 100)}%`,
  }));

  const handleSeekBack = useCallback(() => {
    const cur = playerRef.current?.getCurrentTime() ?? 0;
    playerRef.current?.seek(Math.max(0, cur - 10));
  }, []);

  const handleSeekForward = useCallback(() => {
    const cur = playerRef.current?.getCurrentTime() ?? 0;
    playerRef.current?.seek(cur + 10);
  }, []);

  const handlePlay = useCallback(() => {
    playerRef.current?.play();
    setIsPlaying(true);
  }, []);

  const handlePause = useCallback(() => {
    playerRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const handlePlayerReady = useCallback(() => {
    if (pendingSeekTimeRef.current != null) {
      playerRef.current?.seek(pendingSeekTimeRef.current);
      pendingSeekTimeRef.current = null;
    }
    setIsPlaying(true);
  }, []);

  const handlePlayerError = useCallback((error: unknown) => {
    console.error('Player error:', error);
    if (resolutionMode === 'auto' && autoPlaybackMode === 'hls-master') {
      pendingSeekTimeRef.current = playerRef.current?.getCurrentTime() ?? null;
      setSelectedResolution(liveResolution);
      setAutoPlaybackMode(HLS_VARIANT_SOURCES[liveResolution] ? 'hls-variant' : 'mp4-fallback');
      showTransientToast(
        HLS_VARIANT_SOURCES[liveResolution]
          ? `Master unavailable. Holding ${liveResolution} via HLS variant`
          : `HLS unavailable. Falling back to ${liveResolution} MP4`
      );
    }
  }, [autoPlaybackMode, liveResolution, resolutionMode, showTransientToast]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Gauge size adapts to available space
  const gaugeSize = isLandscape ? 120 : Math.min(width * 0.35, 150);
  const latestDecisionPayload = adaptation.latestDecision
    ? {
        decision: adaptation.latestDecision.decision,
        target_resolution: adaptation.latestDecision.target_resolution ?? null,
        target_bitrate: adaptation.latestDecision.target_bitrate ?? null,
        congestion_probability: adaptation.latestDecision.congestion_probability ?? null,
        recommended_action: adaptation.latestDecision.recommended_action ?? null,
        prefetch_seconds: adaptation.latestDecision.prefetch_seconds ?? null,
        urgency: adaptation.latestDecision.urgency ?? null,
        confidence: adaptation.latestDecision.confidence,
        reason: adaptation.latestDecision.reason,
        model_version: adaptation.latestDecision.model_version ?? null,
        inference_latency_ms: adaptation.latestDecision.inference_latency_ms ?? null,
        ts: adaptation.latestDecision.ts,
      }
    : null;
  const decisionAgeLabel = latestDecisionPayload
    ? `${Math.max(0, Math.round((Date.now() - latestDecisionPayload.ts) / 1000))}s ago`
    : 'live';
  const zkLiveStatusLabel = zkProof.latestProof
    ? (zkProof.status === 'anchored' ? 'Anchored' : zkProof.status === 'generating' ? 'Generating proof' : 'Proof pending')
    : isPlaying
      ? 'Monitoring session'
      : 'Ready';
  const zkProofModeLabel = zkProof.latestProof?.proof_mode ?? 'pending';
  const zkAnchorStateLabel =
    zkProof.latestProof?.anchor?.status ??
    (zkProof.latestProof ? 'missing_env' : 'not_generated');
  const zkAnchorNetworkLabel = zkProof.latestProof?.anchor?.network ?? 'not anchored';
  const zkTxHashLabel = zkProof.latestProof?.anchor?.tx_hash
    ? `${zkProof.latestProof.anchor.tx_hash.slice(0, 10)}...${zkProof.latestProof.anchor.tx_hash.slice(-6)}`
    : 'pending';
  const zkAnchorReason = getAnchorReason(zkProof.latestProof, isPlaying);
  const adaptationTableRows = latestDecisionPayload
    ? [
        {
          parameter: 'Applied action',
          value: displayedAction,
          why: 'Current operator action being executed on the live stream.',
        },
        {
          parameter: 'Current live rendition',
          value: resolution,
          why: 'The rendition the viewer is actually seeing right now on screen.',
        },
        {
          parameter: 'Backend target',
          value: latestDecisionPayload.target_resolution ? `${latestDecisionPayload.target_resolution}p` : resolution,
          why: 'The next rung requested by the adaptation engine if conditions remain stable.',
        },
        {
          parameter: 'Playback path',
          value: usingHlsAuto ? 'HLS master' : 'MP4 fallback',
          why: 'Shows whether the player is using adaptive HLS or emergency MP4 fallback.',
        },
        {
          parameter: 'Target bitrate',
          value: latestDecisionPayload.target_bitrate ? `${Math.round(latestDecisionPayload.target_bitrate)} kbps` : 'Hold',
          why: 'Lower targets reduce stall risk; higher targets restore visual quality.',
        },
        {
          parameter: 'Congestion probability',
          value:
            latestDecisionPayload.congestion_probability != null
              ? latestDecisionPayload.congestion_probability.toFixed(2)
              : displayedCongestion.toFixed(2),
          why: 'Predictive estimate of how close the session is to entering a stall zone.',
        },
        {
          parameter: 'Urgency',
          value: latestDecisionPayload.urgency ?? displayedUrgency,
          why: 'Tells the player whether to stay normal, prepare, or aggressively protect continuity.',
        },
        {
          parameter: 'Prefetch window',
          value: latestDecisionPayload.prefetch_seconds ? `${latestDecisionPayload.prefetch_seconds}s` : 'Default',
          why: 'How much low-quality buffer the engine wants ready before conditions worsen.',
        },
        {
          parameter: 'Recovery score',
          value: `${recoveryProbeScore}%`,
          why: '4-second probe from buffer, throughput, VMAF, congestion, and reachability to test a safe step back up to 720p.',
        },
        {
          parameter: 'Decision confidence',
          value: `${(latestDecisionPayload.confidence * 100).toFixed(0)}%`,
          why: 'Confidence level of the current model output.',
        },
      ]
    : [];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0f1a" />

      {/* ── MAIN SPLIT LAYOUT ─────────────────────────────── */}
      <View
        style={[
          styles.splitContainer,
          isLandscape ? styles.splitRow : styles.splitColumn,
        ]}
      >
        {/* ═══════════════════════════════════════════════════
            VIDEO HALF — takes exactly 50% of the screen
           ═══════════════════════════════════════════════════ */}
        <View style={styles.videoHalf}>
          <View style={styles.videoInner}>
            {/* Header bar */}
            <View style={styles.videoHeader}>
              <Pressable
                style={styles.backBtn}
                onPress={() => router.canGoBack() && router.back()}
              >
                <Text style={styles.backIcon}>‹</Text>
              </Pressable>
              <Text style={styles.headerTitle}>Now Playing</Text>
            </View>

            {/* Player area fills remaining space */}
            <View style={styles.playerContainer}>
              <MobCloudXPlayer
                ref={playerRef}
                source={videoSource}
                autoPlay
                showOverlay={false}
                style={styles.player}
                resizeMode="cover"
                onReady={handlePlayerReady}
                onError={handlePlayerError}
              />

              {/* Adaptation toast overlay */}
              {toastMessage && (
                <View style={styles.adaptationToast}>
                  <Text style={styles.adaptationToastText}>
                    {toastMessage}
                  </Text>
                </View>
              )}

              {noticeMessage && !noticeDismissed && (
                <View style={styles.noticeChip}>
                  <View style={styles.noticeChipCopy}>
                    <Text style={styles.noticeChipBadge}>Predictive adaptation</Text>
                    <Text style={styles.noticeChipText}>{noticeMessage}</Text>
                  </View>
                  <Pressable style={styles.noticeChipClose} onPress={() => setNoticeDismissed(true)}>
                    <Text style={styles.noticeChipCloseText}>x</Text>
                  </Pressable>
                </View>
              )}

              {/* Resolution badge */}
              <ResolutionBadge resolution={resolution} />
            </View>

            {/* Seek bar */}
            <View style={styles.seekContainer}>
              <View style={styles.seekTrack}>
                <Animated.View style={[styles.seekFill, seekFillStyle]} />
                <View style={styles.seekThumb} />
              </View>
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{formatTime(currentPos)}</Text>
                <Text style={styles.timeText}>{formatTime(totalDuration)}</Text>
              </View>
            </View>

            {/* Playback controls */}
            <View style={styles.controlsRow}>
              <Pressable style={styles.controlBtn} onPress={handleSeekBack}>
                <Text style={styles.controlIcon}>⏪</Text>
              </Pressable>
              <Pressable style={styles.controlBtn} onPress={handlePause}>
                <Text style={styles.controlIcon}>⏸</Text>
              </Pressable>
              <Pressable
                style={[styles.controlBtn, styles.playBtn]}
                onPress={handlePlay}
              >
                <Text style={[styles.controlIcon, styles.playIcon]}>▶</Text>
              </Pressable>
              <Pressable style={styles.controlBtn} onPress={handleSeekForward}>
                <Text style={styles.controlIcon}>⏩</Text>
              </Pressable>
            </View>

            {/* Demo Controls: Network Throttler & Resolution Dropdown */}
            <View style={styles.demoControlsRow}>
               {DEMO_MODE ? (
                 <View style={styles.throttleRail}>
                   <Text style={styles.throttleLabel}>Network Throttler</Text>
                   <View style={styles.throttleTabs}>
                     {(Object.keys(THROTTLE_PROFILES) as ThrottleProfileKey[]).map((key) => (
                       <Pressable
                         key={key}
                         style={[styles.throttleTab, throttleProfile === key && styles.throttleTabActive]}
                         onPress={() => {
                           setThrottleProfile(key);
                           setThrottleChangedAt(Date.now());
                         }}>
                         <Text style={[styles.throttleTabText, throttleProfile === key && styles.throttleTabTextActive]}>
                           {THROTTLE_PROFILES[key].label}
                         </Text>
                       </Pressable>
                     ))}
                   </View>
                 </View>
               ) : <View />}

               <Pressable style={styles.resDropdownBtn} onPress={() => setIsResModalVisible(true)}>
                  <Text style={styles.resDropdownText}>
                    {resolutionMode === 'auto' ? `Auto · ${resolution}` : selectedResolution}
                  </Text>
                  <Text style={styles.resDropdownIcon}>▼</Text>
               </Pressable>
            </View>

            {/* Quality + VMAF label */}
            <View style={styles.qualityRow}>
              <View style={styles.qualityBadge}>
                <Text style={styles.qualityText}>{resolution}</Text>
              </View>
              {vmafScore !== null && (
                <View style={[styles.qualityBadge, { marginLeft: 6, backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.3)' }]}>
                  <Text style={[styles.qualityText, { color: '#22c55e' }]}>VMAF {Math.round(displayedVmaf)}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ═══════════════════════════════════════════════════
            METRICS HALF — takes exactly 50% of the screen
           ═══════════════════════════════════════════════════ */}
        <View style={styles.metricsHalf}>
          <ScrollView
            style={styles.dashboardScroll}
            contentContainerStyle={styles.dashboardContent}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Row 1: Buffer Level + Network Throughput ── */}
            <View style={styles.metricsRow}>
              <View style={[styles.metricCard, styles.metricCardHalf]}>
                <Text style={styles.cardLabel}>Buffer Level</Text>
                <View style={styles.cardBody}>
                  <BufferBarChart bufferMs={bufferMs} />
                </View>
              </View>
              <View style={[styles.metricCard, styles.metricCardHalf]}>
                <Text style={styles.cardLabel}>Network Throughput</Text>
                <View style={styles.cardBody}>
                  <ThroughputSparkline currentMbps={throughputMbps} />
                </View>
              </View>
            </View>

            {/* ── Row 2: QoE Score + Adaptation Status ── */}
            <View style={styles.metricsRow}>
              <View style={[styles.metricCard, styles.metricCardHalf]}>
                <Text style={styles.cardLabel}>QoE Score</Text>
                <View style={styles.gaugeCenter}>
                  <QoESpeedometer
                    score={qoeScore}
                    category={qoeCategory}
                    size={gaugeSize}
                  />
                  <Text style={styles.qoeDescription}>
                    QoE blends bitrate, resolution, buffering, startup delay, switch stability, and frame smoothness.
                  </Text>
                </View>
              </View>
              <View style={[styles.metricCard, styles.metricCardHalf]}>
                <Text style={styles.cardLabel}>VMAF Perceptual Quality</Text>
                <View style={styles.gaugeCenter}>
                  <VMAFSpeedometer
                    score={displayedVmaf}
                    model={vmafData?.model}
                    size={gaugeSize}
                  />
                  <Text style={[styles.qoeDescription, { marginTop: 0, lineHeight: 12 }]}>
                    VMAF (0-100) visual quality benchmark. Model: {vmafData?.model || 'Fallback'}.
                  </Text>
                </View>
              </View>
            </View>

            {DEMO_MODE && (
              <View style={styles.metricsRow}>
                <View style={[styles.metricCard, styles.metricCardHalf]}>
                  <Text style={styles.cardLabel}>Congestion</Text>
                  <View style={styles.progressRow}>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${Math.round(displayedCongestion * 100)}%` }]} />
                    </View>
                    <Text style={styles.progressValue}>{displayedCongestion.toFixed(2)}</Text>
                  </View>
                  <Text style={styles.cardCaption}>
                    Live decision confidence before a visible stall.
                  </Text>
                </View>
                <View style={[styles.metricCard, styles.metricCardHalf]}>
                  <Text style={styles.cardLabel}>Live HUD</Text>
                  <View style={styles.hudGrid}>
                    <View style={styles.hudItem}>
                      <Text style={styles.hudKey}>Source</Text>
                      <Text style={styles.hudValue}>{usingHlsAuto ? 'HLS master' : 'MP4 fallback'}</Text>
                    </View>
                    <View style={styles.hudItem}>
                      <Text style={styles.hudKey}>Action</Text>
                      <Text style={styles.hudValue}>{displayedAction}</Text>
                    </View>
                    <View style={styles.hudItem}>
                      <Text style={styles.hudKey}>Urgency</Text>
                      <Text style={styles.hudValue}>{displayedUrgency}</Text>
                    </View>
                    <View style={styles.hudItem}>
                      <Text style={styles.hudKey}>Buffer</Text>
                      <Text style={styles.hudValue}>{(bufferMs / 1000).toFixed(1)}s</Text>
                    </View>
                    <View style={styles.hudItem}>
                      <Text style={styles.hudKey}>Stalls</Text>
                      <Text style={styles.hudValue}>{stallCount}</Text>
                    </View>
                    <View style={styles.hudItem}>
                      <Text style={styles.hudKey}>Network</Text>
                      <Text style={styles.hudValue}>
                        {telemetryNetwork.type === 'cellular'
                          ? (telemetryNetwork.cellularGeneration ?? 'cellular').toUpperCase()
                          : telemetryNetwork.type.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* ── Row 3: Adaptation Status ── */}
            <View style={styles.metricsRow}>
              <View style={[styles.metricCard, { width: '100%' }]}>
                <Text style={styles.cardLabel}>Adaptation Status</Text>
                <View style={styles.statusList}>
                  <View style={styles.statusItem}>
                    <Text style={styles.statusArrow}>›</Text>
                    <Text style={styles.statusText}>
                      Resolution:{' '}
                      <Text style={styles.statusValue}>{resolution}</Text>
                    </Text>
                  </View>
                  <View style={styles.statusItem}>
                    <Text style={styles.statusArrow}>›</Text>
                    <Text style={styles.statusText}>
                      Bitrate:{' '}
                      <Text style={styles.statusValue}>
                        {Math.round(targetBitrate)} kbps
                      </Text>
                    </Text>
                  </View>
                  <View style={styles.statusItem}>
                    <Text style={styles.statusArrow}>›</Text>
                    <Text style={styles.statusText}>
                      Policy:{' '}
                      <Text style={styles.statusValue}>
                        {resolutionMode === 'auto' ? 'Adaptive Streaming' : 'Manual Lock'}
                      </Text>
                    </Text>
                  </View>
                  <View style={styles.statusItem}>
                    <Text style={styles.statusArrow}>›</Text>
                    <Text style={styles.statusText}>
                      Backend target:{' '}
                      <Text style={styles.statusValue}>{backendTargetResolution ?? 'hold'}</Text>
                    </Text>
                  </View>
                  <View style={styles.statusItem}>
                    <Text style={styles.statusArrow}>›</Text>
                    <Text style={styles.statusText}>
                      Action:{' '}
                      <Text style={styles.statusValue}>{displayedAction}</Text>
                    </Text>
                  </View>
                  <View style={styles.statusItem}>
                    <Text style={styles.statusArrow}>›</Text>
                    <Text style={styles.statusText}>
                      Congestion:{' '}
                      <Text style={styles.statusValue}>{displayedCongestion.toFixed(2)}</Text>
                    </Text>
                  </View>
                  <View style={styles.statusItem}>
                    <Text style={styles.statusArrow}>›</Text>
                    <Text style={styles.statusText}>
                      FPS:{' '}
                      <Text style={styles.statusValue}>{frameRate}</Text>
                    </Text>
                  </View>
                  <View style={styles.statusItem}>
                    <Text style={styles.statusArrow}>›</Text>
                    <Text style={styles.statusText}>
                      Mode:{' '}
                      <Text style={styles.statusValue}>
                        {mode.toUpperCase()}
                      </Text>
                    </Text>
                  </View>
                </View>
                <Pressable style={styles.modeToggle} onPress={toggleMode}>
                  <Text style={styles.modeToggleText}>Toggle Mode</Text>
                </Pressable>
              </View>
            </View>

            {DEMO_MODE && (
              <View style={styles.metricsRow}>
                <View style={[styles.metricCard, { width: '100%' }]}>
                  <Text style={styles.cardLabel}>Decision Timeline</Text>
                  <View style={styles.timelineList}>
                    {decisionTimeline.length > 0 ? (
                      decisionTimeline.map((entry) => (
                        <View key={`${entry.ts}-${entry.action}`} style={styles.timelineItem}>
                          <View style={styles.timelineDot} />
                          <View style={styles.timelineBody}>
                            <View style={styles.timelineHeader}>
                              <Text style={styles.timelineAction}>{entry.action}</Text>
                              <Text style={styles.timelineTarget}>{entry.target}</Text>
                            </View>
                            <Text style={styles.timelineMeta}>
                              congestion {entry.congestion.toFixed(2)} · {entry.urgency}
                            </Text>
                          </View>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.cardCaption}>Waiting for backend decisions…</Text>
                    )}
                  </View>
                </View>
              </View>
            )}

            {DEMO_MODE && (
              <View style={styles.metricsRow}>
                <View style={[styles.metricCard, { width: '100%' }]}>
                  <View style={styles.tableHeader}>
                    <Text style={styles.cardLabel}>Live Adaptation Table</Text>
                    <View style={styles.tablePill}>
                      <Text style={styles.tablePillText}>
                        {latestDecisionPayload ? `Updated ${decisionAgeLabel}` : 'Awaiting decision'}
                      </Text>
                    </View>
                  </View>
                  {latestDecisionPayload ? (
                    <>
                      <View style={styles.tableMetaRow}>
                        <View style={styles.tableMetaCard}>
                          <Text style={styles.tableMetaKey}>Model</Text>
                          <Text style={styles.tableMetaValue}>{latestDecisionPayload.model_version ?? 'unknown'}</Text>
                        </View>
                        <View style={styles.tableMetaCard}>
                          <Text style={styles.tableMetaKey}>Inference latency</Text>
                          <Text style={styles.tableMetaValue}>
                            {latestDecisionPayload.inference_latency_ms != null
                              ? `${Math.round(latestDecisionPayload.inference_latency_ms)} ms`
                              : 'n/a'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.tableContainer}>
                        <View style={[styles.tableRow, styles.tableRowHead]}>
                          <Text style={[styles.tableCell, styles.tableHeadCell, styles.tableCellParam]}>Parameter</Text>
                          <Text style={[styles.tableCell, styles.tableHeadCell, styles.tableCellValue]}>Current value</Text>
                          <Text style={[styles.tableCell, styles.tableHeadCell, styles.tableCellWhy]}>Why it matters</Text>
                        </View>
                        {adaptationTableRows.map((row) => (
                          <View key={row.parameter} style={styles.tableRow}>
                            <Text style={[styles.tableCell, styles.tableParamText, styles.tableCellParam]}>{row.parameter}</Text>
                            <Text style={[styles.tableCell, styles.tableValueText, styles.tableCellValue]}>{row.value}</Text>
                            <Text style={[styles.tableCell, styles.tableWhyText, styles.tableCellWhy]}>{row.why}</Text>
                          </View>
                        ))}
                      </View>
                      <View style={styles.payloadReasonCard}>
                        <Text style={styles.payloadKey}>Decision rationale</Text>
                        <Text style={styles.payloadValue}>{latestDecisionPayload.reason}</Text>
                      </View>
                      <View style={styles.payloadCodeBlock}>
                        <Text style={styles.payloadCodeLine}>decision={latestDecisionPayload.decision}</Text>
                        <Text style={styles.payloadCodeLine}>recommended_action={latestDecisionPayload.recommended_action ?? 'n/a'}</Text>
                        <Text style={styles.payloadCodeLine}>target_resolution={latestDecisionPayload.target_resolution ?? 'hold'}</Text>
                        <Text style={styles.payloadCodeLine}>target_bitrate={latestDecisionPayload.target_bitrate ?? 'n/a'}</Text>
                        <Text style={styles.payloadCodeLine}>congestion_probability={latestDecisionPayload.congestion_probability ?? 'n/a'}</Text>
                        <Text style={styles.payloadCodeLine}>prefetch_seconds={latestDecisionPayload.prefetch_seconds ?? 'n/a'}</Text>
                        <Text style={styles.payloadCodeLine}>urgency={latestDecisionPayload.urgency ?? 'n/a'}</Text>
                        <Text style={styles.payloadCodeLine}>confidence={latestDecisionPayload.confidence.toFixed(2)}</Text>
                      </View>
                    </>
                  ) : (
                    <Text style={styles.cardCaption}>Waiting for the first inference decision payload…</Text>
                  )}
                </View>
              </View>
            )}

            {DEMO_MODE && (
              <View style={styles.metricsRow}>
                <View style={[styles.metricCard, { width: '100%' }]}>
                  <Text style={styles.cardLabel}>ZK Proof Status</Text>
                  <View style={styles.zkHeader}>
                    <View
                      style={[
                        styles.zkChip,
                        zkProof.latestProof && zkProof.status === 'anchored'
                          ? styles.zkChipAnchored
                          : zkProof.latestProof || isPlaying
                            ? styles.zkChipPending
                            : styles.zkChipIdle,
                      ]}>
                      <Text style={styles.zkChipText}>{zkLiveStatusLabel.toUpperCase()}</Text>
                    </View>
                    <Text style={styles.zkSession}>{sessionId.slice(0, 8)}...</Text>
                  </View>
                  <Text style={styles.cardCaption}>
                    {zkProof.latestProof
                      ? 'QoE degradation, playback continuity, and recovery are bundled into the latest session proof.'
                      : 'Monitoring QoE, continuity, and recovery signals for the current session proof.'}
                  </Text>
                  <View style={styles.hudGrid}>
                    <View style={styles.hudItem}>
                      <Text style={styles.hudKey}>Status</Text>
                      <Text style={styles.hudValue}>{zkLiveStatusLabel}</Text>
                    </View>
                    <View style={styles.hudItem}>
                      <Text style={styles.hudKey}>Start</Text>
                      <Text style={styles.hudValue}>{zkProof.latestProof?.payload.qoe_start ?? 'Collecting'}</Text>
                    </View>
                    <View style={styles.hudItem}>
                      <Text style={styles.hudKey}>Minimum</Text>
                      <Text style={styles.hudValue}>{zkProof.latestProof?.payload.qoe_minimum ?? 'Collecting'}</Text>
                    </View>
                    <View style={styles.hudItem}>
                      <Text style={styles.hudKey}>Recovery</Text>
                      <Text style={styles.hudValue}>{zkProof.latestProof?.payload.qoe_recovery ?? 'Awaiting'}</Text>
                    </View>
                    <View style={styles.hudItem}>
                      <Text style={styles.hudKey}>Hash</Text>
                      <Text style={styles.hudValue}>
                        {zkProof.latestProof?.proof_hash ? `${zkProof.latestProof.proof_hash.slice(0, 10)}...` : 'Pending'}
                      </Text>
                    </View>
                    <View style={styles.hudItem}>
                      <Text style={styles.hudKey}>Proof mode</Text>
                      <Text style={styles.hudValue}>{zkProofModeLabel}</Text>
                    </View>
                    <View style={styles.hudItem}>
                      <Text style={styles.hudKey}>Anchor state</Text>
                      <Text style={styles.hudValue}>{zkAnchorStateLabel}</Text>
                    </View>
                    <View style={styles.hudItem}>
                      <Text style={styles.hudKey}>Anchor network</Text>
                      <Text style={styles.hudValue}>{zkAnchorNetworkLabel}</Text>
                    </View>
                    <View style={styles.hudItem}>
                      <Text style={styles.hudKey}>Tx hash</Text>
                      <Text style={styles.hudValue}>{zkTxHashLabel}</Text>
                    </View>
                  </View>
                  <View style={styles.payloadReasonCard}>
                    <Text style={styles.payloadKey}>Anchor reason</Text>
                    <Text style={styles.payloadValue}>{zkAnchorReason}</Text>
                  </View>
                  {zkProof.latestProof?.anchor?.explorer_url ? (
                    <Pressable
                      style={styles.zkAction}
                      onPress={() => Linking.openURL(zkProof.latestProof!.anchor!.explorer_url!)}
                    >
                      <Text style={styles.zkActionText}>Open Explorer</Text>
                    </Pressable>
                  ) : null}
                  {zkProof.latestProof && (
                    <Pressable
                      style={styles.zkAction}
                      onPress={() => router.push(`/zk-proof?sessionId=${sessionId}` as never)}>
                      <Text style={styles.zkActionText}>Open Proof</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            )}

            {/* ── Row 3: Device Context ── */}
            <View style={styles.deviceContextCard}>
              <Text style={styles.cardLabel}>Device Context</Text>
              <View style={styles.divider} />
              <DeviceContextChips
                networkType={telemetryNetwork.type}
                cellularGen={telemetryNetwork.cellularGeneration}
                batteryPercent={batteryPct}
                isCharging={battery.isCharging}
                fps={frameRate}
                signalDbm={telemetryNetwork.signalStrengthDbm}
              />
            </View>
          </ScrollView>
        </View>
      </View>

      {/* Resolution Selection Modal */}
      <Modal visible={isResModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setIsResModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Resolution</Text>
            <Pressable
              style={styles.modalItem}
              onPress={() => {
                enableAutoResolution();
                setIsResModalVisible(false);
              }}>
              <Text style={[styles.modalItemText, resolutionMode === 'auto' && styles.modalItemTextActive]}>
                Auto Adapt
              </Text>
              {resolutionMode === 'auto' && <Text style={styles.modalCheck}>✓</Text>}
            </Pressable>
            {(['240p', '360p', '480p', '720p', '1080p'] as const).map(res => (
              <Pressable 
                key={res} 
                style={styles.modalItem} 
                onPress={() => { 
                  handleResolutionChange(res); 
                  setIsResModalVisible(false); 
                }}>
                <Text style={[styles.modalItemText, resolutionMode === 'manual' && selectedResolution === res && styles.modalItemTextActive]}>{res}</Text>
                {resolutionMode === 'manual' && selectedResolution === res && <Text style={styles.modalCheck}>✓</Text>}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Root ──
  root: {
    flex: 1,
    backgroundColor: '#0a0f1a',
  },

  // ── Split layout ──
  splitContainer: {
    flex: 1,
  },
  splitRow: {
    flexDirection: 'row',
  },
  splitColumn: {
    flexDirection: 'column',
  },

  // ── Video half (50%) ──
  videoHalf: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  videoInner: {
    flex: 1,
    justifyContent: 'space-between',
  },

  // Video header
  videoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'android' ? 4 : 8,
    paddingBottom: 4,
    gap: 8,
  },
  backBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    color: '#94a3b8',
    fontSize: 22,
    fontWeight: '600',
    marginTop: -2,
  },
  headerTitle: {
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Player
  playerContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000',
    marginHorizontal: 0,
  },
  player: {
    width: '100%',
    height: '100%',
  },

  // Adaptation toast
  adaptationToast: {
    position: 'absolute',
    bottom: '40%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  adaptationToastText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    overflow: 'hidden',
    letterSpacing: 0.3,
  },
  noticeChip: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(7, 18, 33, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.22)',
    borderRadius: 999,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 8,
    gap: 10,
  },
  noticeChipCopy: {
    flex: 1,
    gap: 2,
  },
  noticeChipBadge: {
    color: '#7dd3fc',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  noticeChipText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
  },
  noticeChipClose: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  noticeChipCloseText: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  predictionBanner: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 14,
    backgroundColor: 'rgba(7, 18, 33, 0.86)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  predictionBadge: {
    color: '#7dd3fc',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  predictionTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
  predictionText: {
    color: '#cbd5e1',
    fontSize: 11,
    lineHeight: 16,
  },

  // Seek bar
  seekContainer: {
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  seekTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 2,
    overflow: 'visible',
    position: 'relative',
  },
  seekFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
    borderRadius: 2,
  },
  seekThumb: {
    position: 'absolute',
    right: -5,
    top: -4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#38bdf8',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 4,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 3,
  },
  timeText: {
    color: '#64748b',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },

  // Controls
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 14,
  },
  controlBtn: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    width: 36,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  playBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: 'rgba(56, 189, 248, 0.3)',
    width: 42,
    height: 34,
    borderRadius: 10,
  },
  controlIcon: {
    fontSize: 13,
  },
  playIcon: {
    fontSize: 15,
  },

  // Quality label
  qualityRow: {
    alignItems: 'center',
    paddingBottom: 4,
  },
  qualityBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  qualityText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // ── Metrics half (50%) ──
  metricsHalf: {
    flex: 1,
    backgroundColor: '#111827',
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  dashboardScroll: {
    flex: 1,
  },
  dashboardContent: {
    padding: 8,
    gap: 8,
  },

  // Metric cards
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metricCard: {
    backgroundColor: '#1a2332',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#253347',
    padding: 12,
    // Subtle glow
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  metricCardHalf: {
    flex: 1,
  },
  cardLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'capitalize',
    marginBottom: 8,
  },
  cardBody: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },

  // Gauge
  gaugeCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  qoeDescription: {
    fontSize: 9,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 14,
    paddingHorizontal: 8,
    lineHeight: 13,
  },
  // Adaptation status
  statusList: {
    gap: 5,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusArrow: {
    color: '#38bdf8',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  statusText: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 18,
  },
  statusValue: {
    color: '#f1f5f9',
    fontWeight: '700',
  },
  modeToggle: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  modeToggleText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Device context
  deviceContextCard: {
    backgroundColor: '#1a2332',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#253347',
    padding: 12,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 8,
    marginTop: -2,
  },

  // Demo Controls
  demoControlsRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  throttleRail: {
    gap: 6,
  },
  throttleLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  throttleTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 2,
    gap: 4,
  },
  throttleTab: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  throttleTabActive: {
    backgroundColor: 'rgba(56,189,248,0.15)',
  },
  throttleTabText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
  },
  throttleTabTextActive: {
    color: '#38bdf8',
  },
  progressRow: {
    gap: 10,
  },
  progressTrack: {
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
    borderRadius: 999,
  },
  progressValue: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '700',
  },
  cardCaption: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  hudGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  hudItem: {
    width: '47%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 2,
  },
  hudKey: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  hudValue: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  payloadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  payloadItem: {
    width: '47%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 3,
  },
  payloadItemWide: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 3,
  },
  payloadKey: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  payloadValue: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  payloadCodeBlock: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.16)',
    backgroundColor: 'rgba(2, 6, 23, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 4,
  },
  payloadCodeLine: {
    color: '#7dd3fc',
    fontSize: 11,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    lineHeight: 16,
  },
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  tablePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.18)',
  },
  tablePillText: {
    color: '#7dd3fc',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  tableMetaRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  tableMetaCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 3,
  },
  tableMetaKey: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableMetaValue: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  tableContainer: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  tableRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  tableRowHead: {
    borderTopWidth: 0,
    backgroundColor: 'rgba(56,189,248,0.08)',
  },
  tableCell: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  tableHeadCell: {
    color: '#cfeeff',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableCellParam: {
    width: '28%',
  },
  tableCellValue: {
    width: '24%',
  },
  tableCellWhy: {
    width: '48%',
  },
  tableParamText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
  },
  tableValueText: {
    color: '#7dd3fc',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  tableWhyText: {
    color: '#cbd5e1',
    fontSize: 11,
    lineHeight: 16,
  },
  payloadReasonCard: {
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 4,
  },
  timelineList: {
    gap: 10,
    marginTop: 4,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 6,
    backgroundColor: '#38bdf8',
  },
  timelineBody: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  timelineAction: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  timelineTarget: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  timelineMeta: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 4,
  },
  zkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  zkChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  zkChipIdle: {
    backgroundColor: 'rgba(148,163,184,0.08)',
    borderColor: 'rgba(148,163,184,0.2)',
  },
  zkChipPending: {
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderColor: 'rgba(251,191,36,0.28)',
  },
  zkChipAnchored: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: 'rgba(34,197,94,0.28)',
  },
  zkChipText: {
    color: '#f8fafc',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  zkSession: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  zkAction: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.24)',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  zkActionText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  resDropdownBtn: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 6,
  },
  resDropdownText: {
    color: '#f1f5f9',
    fontSize: 12,
    fontWeight: '700',
  },
  resDropdownIcon: {
    color: '#94a3b8',
    fontSize: 10,
  },

  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1a2332',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#253347',
    width: 220,
    padding: 8,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  modalItemText: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '500',
  },
  modalItemTextActive: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  modalCheck: {
    color: '#38bdf8',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
