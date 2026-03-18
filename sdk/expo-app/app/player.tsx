// ─────────────────────────────────────────────────────────────
// MobCloudX Demo — Player Screen (Redesigned v2)
// Portrait: Top half video + bottom half metrics dashboard
// Landscape: Left half video + right half metrics dashboard
// Matches the reference UI with speedometer, sparkline, bar chart, chips
// ─────────────────────────────────────────────────────────────

import React, { useRef, useCallback, useState, useEffect } from 'react';
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
} from '../src';

// Visual components
import { QoESpeedometer } from '../src/ui/qoe-speedometer';
import { VMAFSpeedometer } from '../src/ui/vmaf-speedometer';
import { BufferBarChart } from '../src/ui/buffer-bar-chart';
import { ThroughputSparkline } from '../src/ui/throughput-sparkline';
import { DeviceContextChips } from '../src/ui/device-context-chips';
import { ResolutionBadge } from '../src/ui/resolution-badge';

// ── S3 Production bucket URLs for transcoded resolutions ────
const S3_BUCKET = 'https://s3.us-east-1.amazonaws.com/prod-video.mobcloudx.xyz';
const RESOLUTION_SOURCES: Record<string, { uri: string }> = {
  '360p':  { uri: 'https://s3.us-east-1.amazonaws.com/video-transcoding-mob.mobcloudx.xyz/videos/input.mp4' },
  '480p':  { uri: `${S3_BUCKET}/video5-480p.mp4` },
  '720p':  { uri: `${S3_BUCKET}/video5-720p.mp4` },
  '1080p': { uri: `${S3_BUCKET}/video5-1080p.mp4` },
};
const DEFAULT_RESOLUTION = '720p';
const DEFAULT_VIDEO = RESOLUTION_SOURCES[DEFAULT_RESOLUTION];

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
  const { mode, toggleMode } = useSDKMode();
  const isLandscape = width > height;
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState(DEFAULT_RESOLUTION);
  const [vmafData, setVmafData] = useState<{score: number, model: string} | null>(null);
  const vmafScore = vmafData?.score ?? null;
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Seek bar progress
  const seekProgress = useSharedValue(0);

  useLocalQoE(5000);
  useQoEAlert(40, (score, category) => {
    console.warn(`[MobCloudX] QoE Alert: ${score} (${category})`);
  });

  // Video source — from S3 resolution picker or imported
  const videoSource = params.videoUri
    ? { uri: params.videoUri }
    : RESOLUTION_SOURCES[selectedResolution] ?? DEFAULT_VIDEO;

  // Resolution change handler — updates video source + QoE baseline
  const handleResolutionChange = useCallback((res: string) => {
    setSelectedResolution(res);
    // Player will re-mount with new source automatically via prop
    if (playerRef.current) {
      playerRef.current.play();
      setIsPlaying(true);
    }
  }, []);

  // Poll VMAF score from API
  useEffect(() => {
    let active = true;
    const fetchVMAF = async () => {
      try {
        // Use 10.0.2.2 for Android emulator to hit local Next.js server
        const res = await fetch(`http://10.0.2.2:3000/api/vmaf/latest?resolution=${selectedResolution}`);
        const data = await res.json();
        if (active && data.success && data.score !== null) {
          setVmafData({ score: data.score, model: data.model });
          return;
        }
      } catch (err) {
        // Silently fallback if API is unreachable
      }
      if (active) {
        const mockVmaf: Record<string, number> = { '360p': 38, '480p': 68, '720p': 82, '1080p': 92 };
        setVmafData({ score: mockVmaf[selectedResolution] ?? 50, model: 'estimated_heuristic' });
      }
    };
    fetchVMAF();
    return () => { active = false; };
  }, [selectedResolution]);

  // Wire backend adaptation decisions → resolution change
  useEffect(() => {
    const decision = adaptation.latestDecision;
    if (!decision) return;

    const resMap: Record<number, string> = { 360: '360p', 480: '480p', 720: '720p', 1080: '1080p' };
    const targetRes = decision.target_resolution ? resMap[decision.target_resolution] : null;

    if (targetRes && targetRes !== selectedResolution) {
      handleResolutionChange(targetRes);
      setToastMessage(`ABR → ${targetRes} (${decision.model_version ?? 'model'})`);
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [adaptation.latestDecision?.ts, handleResolutionChange, selectedResolution]);  // watch timestamp for new decisions

  // Show auto-dismissing toast when resolution changes (manual)
  useEffect(() => {
    setToastMessage(`Switching to ${selectedResolution}`);
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [selectedResolution]);

  // Mock Metric States for fallback
  const [mockQoeScore, setMockQoeScore] = useState(85);
  const [mockBufferMs, setMockBufferMs] = useState(10000);
  const [mockThroughputMbps, setMockThroughputMbps] = useState(4.2);

  // Demo setup: network simulator and modal
  const [simNetwork, setSimNetwork] = useState('WiFi-6'); 
  const [isResModalVisible, setIsResModalVisible] = useState(false);

  // Fluctuating Mock Metrics Effect based on Simulated Network
  useEffect(() => {
    const interval = setInterval(() => {
        let baseQoe = 9.0; let baseThr = 85.0; let baseBuf = 12000;
        if (simNetwork === '3G') {
            baseQoe = 2.5; baseThr = 1.5; baseBuf = 1000;
        } else if (simNetwork === '4G-degraded') {
            baseQoe = 4.5; baseThr = 8.0; baseBuf = 3000;
        } else if (simNetwork === '4G-stable') {
            baseQoe = 7.2; baseThr = 25.0; baseBuf = 7000;
        }
        setMockQoeScore(baseQoe + (Math.random() * 0.8 - 0.4));
        setMockBufferMs(Math.max(0, baseBuf + (Math.random() * 3000 - 1500)));
        setMockThroughputMbps(Math.max(0.5, baseThr + (Math.random() * (baseThr * 0.4) - (baseThr * 0.2))));
    }, 1000);
    return () => clearInterval(interval);
  }, [simNetwork]);

  // Auto-adapt resolution based on simulated network (Demo function)
  useEffect(() => {
      let active = true;
      if (simNetwork === '3G' || simNetwork === '4G-degraded') {
        // Introduce artificial lag to simulate buffering/stuttering
        setIsPlaying(false);
        playerRef.current?.pause();
        
        // Mock buffer drop specifically during lag
        setMockBufferMs(prev => Math.max(0, prev - 8000));
        
        // Longer lag for 3G
        const lagTime = simNetwork === '3G' ? 5000 : 3500;
        
        setTimeout(() => {
          if (active) {
             handleResolutionChange(simNetwork === '3G' ? '360p' : '480p');
          }
        }, lagTime);
      }
      else if (simNetwork === '4G-stable') handleResolutionChange('720p');
      else if (simNetwork === 'WiFi-6') handleResolutionChange('1080p');
      
      return () => { active = false; };
  }, [simNetwork, handleResolutionChange]);

  // Derived metrics with realistic mock fallbacks if real data is missing
  const hasValidRealMetrics = isPlaying && (playback?.currentBitrate ?? 0) > 0;
  
  const bufferMs = hasValidRealMetrics ? playback!.bufferHealthMs : mockBufferMs;
  const bitrateKbps = hasValidRealMetrics ? playback!.currentBitrate : mockThroughputMbps * 1000;
  const throughputMbps = bitrateKbps / 1000;
  const resolution = selectedResolution;
  const frameRate = hasValidRealMetrics ? Math.round(playback!.currentFps) : (resolution === '1080p' ? 60 : 30);
  const batteryPct = Math.round((battery.level ?? 0) * 100);
  const targetBitrate = hasValidRealMetrics && adaptation.latestDecision?.target_bitrate 
    ? adaptation.latestDecision.target_bitrate 
    : bitrateKbps;
  const qoeScore = hasValidRealMetrics ? qoe.currentScore : mockQoeScore;

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

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Gauge size adapts to available space
  const gaugeSize = isLandscape ? 120 : Math.min(width * 0.35, 150);

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
                onReady={() => setIsPlaying(true)}
                onError={(e) => console.error('Player error:', e)}
              />

              {/* Adaptation toast overlay */}
              {toastMessage && (
                <View style={styles.adaptationToast}>
                  <Text style={styles.adaptationToastText}>
                    {toastMessage}
                  </Text>
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

            {/* Demo Controls: Network Throttle & Resolution Dropdown */}
            <View style={styles.demoControlsRow}>
               <View style={styles.throttleContainer}>
                 <Text style={styles.throttleLabel}>Network:</Text>
                 <View style={styles.throttleTabs}>
                   {['3G', '4G-deg', '4G-stb', 'WiFi-6'].map((label, i) => {
                     const net = ['3G', '4G-degraded', '4G-stable', 'WiFi-6'][i];
                     return (
                     <Pressable 
                       key={net} 
                       style={[styles.throttleTab, simNetwork === net && styles.throttleTabActive]} 
                       onPress={() => setSimNetwork(net)}>
                       <Text style={[styles.throttleTabText, simNetwork === net && styles.throttleTabTextActive]}>{label}</Text>
                     </Pressable>
                   );})}
                 </View>
               </View>

               <Pressable style={styles.resDropdownBtn} onPress={() => setIsResModalVisible(true)}>
                  <Text style={styles.resDropdownText}>{selectedResolution}</Text>
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
                  <Text style={[styles.qualityText, { color: '#22c55e' }]}>VMAF {vmafScore}</Text>
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
                    category={qoeScore >= 8.5 ? 'excellent' : qoeScore >= 6.5 ? 'good' : qoeScore >= 4.0 ? 'fair' : 'poor'}
                    size={gaugeSize}
                  />
                  <Text style={styles.qoeDescription}>
                    QoE (0-10) factor of Latency, FPS, Buffer & Network. >8.5 is Good.
                  </Text>
                </View>
              </View>
              <View style={[styles.metricCard, styles.metricCardHalf]}>
                <Text style={styles.cardLabel}>VMAF Perceptual Quality</Text>
                <View style={styles.gaugeCenter}>
                  <VMAFSpeedometer
                    score={vmafData?.score ?? 0}
                    model={vmafData?.model}
                    size={gaugeSize}
                  />
                  <Text style={[styles.qoeDescription, { marginTop: 0, lineHeight: 12 }]}>
                    VMAF (0-100) visual quality benchmark. Model: {vmafData?.model || 'Fallback'}.
                  </Text>
                </View>
              </View>
            </View>

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
                      <Text style={styles.statusValue}>Adaptive Streaming</Text>
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

            {/* ── Row 3: Device Context ── */}
            <View style={styles.deviceContextCard}>
              <Text style={styles.cardLabel}>Device Context</Text>
              <View style={styles.divider} />
              <DeviceContextChips
                networkType={network.type}
                cellularGen={network.cellularGeneration}
                batteryPercent={batteryPct}
                isCharging={battery.isCharging}
                fps={frameRate}
                signalDbm={network.signalStrengthDbm}
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
            {(['480p', '720p', '1080p'] as const).map(res => (
              <Pressable 
                key={res} 
                style={styles.modalItem} 
                onPress={() => { 
                  handleResolutionChange(res); 
                  setIsResModalVisible(false); 
                }}>
                <Text style={[styles.modalItemText, selectedResolution === res && styles.modalItemTextActive]}>{res}</Text>
                {selectedResolution === res && <Text style={styles.modalCheck}>✓</Text>}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  throttleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  throttleLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  throttleTabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 2,
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
  resDropdownBtn: {
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
