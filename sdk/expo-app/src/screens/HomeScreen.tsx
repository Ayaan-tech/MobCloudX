import React from 'react';
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useBattery, useNetwork, useQoE, useSessionId } from '../hooks';
import { SDKMode, useSDKMode } from '../sdk/core/SDKContext';

const GRID_ROWS = Array.from({ length: 14 }, (_, index) => index);
const GRID_COLUMNS = Array.from({ length: 10 }, (_, index) => index);

const DISPLAY_FONT = Platform.select({
  ios: 'Avenir-Heavy',
  android: 'sans-serif-black',
  default: 'System',
});

const BODY_FONT = Platform.select({
  ios: 'Avenir Next',
  android: 'sans-serif',
  default: 'System',
});

function formatNetworkLabel(type: string): string {
  if (!type || type.toLowerCase() === 'unknown') {
    return 'Unknown';
  }

  return type.replaceAll('_', ' ').toUpperCase();
}

export default function HomeScreen(): JSX.Element {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const qoe = useQoE();
  const network = useNetwork();
  const battery = useBattery();
  const sessionId = useSessionId();
  const { mode, setMode, toggleMode } = useSDKMode();

  const isCompact = width < 390;
  const shellWidth = Math.min(width - 24, 1080);
  const metricCardBasis = width >= 960 ? '32%' : width >= 560 ? '48.6%' : '100%';

  const networkLabel = formatNetworkLabel(String(network.type ?? ''));
  const batteryLevel = Math.round(battery.level * 100);
  const qoeScore = Math.round(qoe.currentScore);

  let streamHealth = 'Critical';
  if (qoeScore >= 75) {
    streamHealth = 'Excellent';
  } else if (qoeScore >= 55) {
    streamHealth = 'Stable';
  } else if (qoeScore >= 40) {
    streamHealth = 'At Risk';
  }

  const replaySessionId = process.env.EXPO_PUBLIC_DEFAULT_REPLAY_SESSION_ID ?? sessionId ?? '';
  const defaultCallId = process.env.EXPO_PUBLIC_DEFAULT_CALL_ID ?? 'mobcloudx-demo-call';

  const navigateToOtt = () => {
    setMode(SDKMode.OTT);
    router.push('/player');
  };

  const navigateToCall = () => {
    setMode(SDKMode.WEBRTC);
    router.push({
      pathname: '/call' as never,
      params: { callId: defaultCallId },
    } as never);
  };

  const navigateToReplay = () => {
    if (!replaySessionId) {
      return;
    }

    router.push({
      pathname: '/replay' as never,
      params: { sessionId: replaySessionId },
    } as never);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View pointerEvents="none" style={styles.backgroundLayer}>
        <View style={styles.baseGlowTop} />
        <View style={styles.baseGlowBottom} />
        <View style={styles.textureWrap}>
          {GRID_ROWS.map((row) => (
            <View key={`row-${row}`} style={[styles.textureHorizontal, { top: row * 72 }]} />
          ))}
          {GRID_COLUMNS.map((column) => (
            <View key={`column-${column}`} style={[styles.textureVertical, { left: column * 72 }]} />
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces
      >
        <View style={[styles.shell, { width: shellWidth }]}>
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <Text style={styles.kicker}>MobCloudX Control Surface</Text>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveLabel}>Live Telemetry</Text>
              </View>
            </View>

            <Text style={[styles.title, isCompact ? styles.titleCompact : null]}>
              OTT + QoE orchestration with a premium streaming cockpit.
            </Text>
            <Text style={styles.subtitle}>
              Launch either the analytics-rich OTT path or the WebRTC room from one adaptive,
              production-style operations console inspired by modern streaming platforms.
            </Text>

            <View style={styles.sessionStrip}>
              <View style={styles.sessionChip}>
                <Text style={styles.sessionLabel}>Session</Text>
                <Text style={styles.sessionValue}>{sessionId?.slice(0, 8) ?? 'N/A'}</Text>
              </View>
              <View style={styles.sessionChip}>
                <Text style={styles.sessionLabel}>Room</Text>
                <Text style={styles.sessionValue}>{defaultCallId}</Text>
              </View>
              <View style={styles.sessionChip}>
                <Text style={styles.sessionLabel}>Stream Health</Text>
                <Text style={[styles.sessionValue, { color: qoe.color }]}>{streamHealth}</Text>
              </View>
            </View>
          </View>

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Realtime Metrics</Text>
            <Text style={styles.sectionMeta}>Adaptive scoring in motion</Text>
          </View>

          <View style={styles.metricsGrid}>
            <View style={[styles.metricCard, { flexBasis: metricCardBasis, borderColor: qoe.color }]}>
              <Text style={styles.metricLabel}>QoE Index</Text>
              <Text style={[styles.metricValue, { color: qoe.color }]}>{qoeScore}</Text>
              <Text style={styles.metricMeta}>{qoe.category}</Text>
              <View style={styles.metricTrack}>
                <View
                  style={[
                    styles.metricFill,
                    {
                      width: `${Math.max(8, Math.min(100, qoeScore))}%`,
                      backgroundColor: qoe.color,
                    },
                  ]}
                />
              </View>
            </View>

            <View style={[styles.metricCard, { flexBasis: metricCardBasis }]}>
              <Text style={styles.metricLabel}>Network Route</Text>
              <Text style={styles.metricValueMuted}>{networkLabel}</Text>
              <Text style={styles.metricMeta}>
                {network.isConnected ? 'Connected uplink' : 'Signal offline'}
              </Text>
              <View style={styles.pulseRow}>
                <View style={[styles.pulse, network.isConnected ? styles.pulseOnline : styles.pulseOffline]} />
                <Text style={styles.pulseLabel}>
                  {network.isConnected ? 'Data path active' : 'Awaiting network'}
                </Text>
              </View>
            </View>

            <View style={[styles.metricCard, { flexBasis: metricCardBasis }]}>
              <Text style={styles.metricLabel}>Battery Envelope</Text>
              <Text style={styles.metricValueMuted}>{batteryLevel}%</Text>
              <Text style={styles.metricMeta}>
                {battery.isCharging ? 'Charging source connected' : 'Running on device battery'}
              </Text>
              <View style={styles.metricTrack}>
                <View
                  style={[
                    styles.metricFill,
                    {
                      width: `${Math.max(6, Math.min(100, batteryLevel))}%`,
                      backgroundColor: batteryLevel > 45 ? '#22d3ee' : '#f59e0b',
                    },
                  ]}
                />
              </View>
            </View>
          </View>

          <Pressable style={styles.modePanel} onPress={toggleMode}>
            <View>
              <Text style={styles.modeLabel}>Foundation Mode</Text>
              <Text style={styles.modeValue}>
                {mode === SDKMode.OTT
                  ? 'OTT Streaming Priority'
                  : 'WebRTC Conversation Priority'}
              </Text>
            </View>
            <Text style={styles.modeAction}>Switch</Text>
          </Pressable>

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Launch Experiences</Text>
            <Text style={styles.sectionMeta}>Choose your stream pipeline</Text>
          </View>

          <View style={styles.experienceStack}>
            <Pressable style={[styles.experienceCard, styles.ottCard]} onPress={navigateToOtt}>
              <Text style={styles.experienceEyebrow}>OTT Pipeline</Text>
              <Text style={styles.experienceTitle}>Premium OTT Streaming</Text>
              <Text style={styles.experienceDescription}>
                Open the cinematic player flow with telemetry overlays, adaptation logs,
                and continuous quality monitoring for long-form sessions.
              </Text>
              <Text style={styles.experienceAction}>Launch OTT demo</Text>
            </Pressable>

            <Pressable style={[styles.experienceCard, styles.webrtcCard]} onPress={navigateToCall}>
              <Text style={styles.experienceEyebrow}>Realtime Room</Text>
              <Text style={styles.experienceTitle}>WebRTC Video Call</Text>
              <Text style={styles.experienceDescription}>
                Join the shared room with participant telemetry, QoE HUD badges, and adaptive
                controls for congestion-sensitive communication.
              </Text>
              <Text style={styles.experienceAction}>Join room {defaultCallId}</Text>
            </Pressable>

            {replaySessionId ? (
              <Pressable style={[styles.experienceCard, styles.replayCard]} onPress={navigateToReplay}>
                <Text style={styles.experienceEyebrow}>Session Intelligence</Text>
                <Text style={styles.experienceTitle}>Replay + Diagnostics</Text>
                <Text style={styles.experienceDescription}>
                  Scrub captured telemetry with FSM transitions, SR traces, and QoE trend
                  markers to inspect adaptation behavior frame by frame.
                </Text>
                <Text style={styles.experienceAction}>Open replay workspace</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.bottomSpacer} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#04070f',
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  baseGlowTop: {
    position: 'absolute',
    top: -160,
    right: -120,
    width: 420,
    height: 420,
    borderRadius: 220,
    backgroundColor: 'rgba(56, 189, 248, 0.16)',
  },
  baseGlowBottom: {
    position: 'absolute',
    bottom: -140,
    left: -100,
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  textureWrap: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.22,
  },
  textureHorizontal: {
    position: 'absolute',
    left: -70,
    right: -70,
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.26)',
  },
  textureVertical: {
    position: 'absolute',
    top: -70,
    bottom: -70,
    width: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 28,
  },
  shell: {
    gap: 16,
  },
  heroCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    backgroundColor: 'rgba(7, 12, 26, 0.86)',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 22,
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.24,
    shadowRadius: 24,
    elevation: 8,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  kicker: {
    color: '#22d3ee',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 11,
    fontFamily: BODY_FONT,
    fontWeight: '700',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.5)',
    backgroundColor: 'rgba(8, 47, 73, 0.6)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 7,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2dd4bf',
  },
  liveLabel: {
    color: '#67e8f9',
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: BODY_FONT,
    fontWeight: '700',
  },
  title: {
    marginTop: 14,
    color: '#f8fafc',
    fontSize: 34,
    lineHeight: 40,
    fontFamily: DISPLAY_FONT,
    fontWeight: '900',
  },
  titleCompact: {
    fontSize: 29,
    lineHeight: 35,
  },
  subtitle: {
    marginTop: 10,
    color: '#9fb2d0',
    fontSize: 14,
    lineHeight: 21,
    fontFamily: BODY_FONT,
  },
  sessionStrip: {
    marginTop: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  sessionChip: {
    flexGrow: 1,
    minWidth: 160,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(100, 116, 139, 0.45)',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sessionLabel: {
    color: '#7b8fb1',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 12,
    fontFamily: BODY_FONT,
    fontWeight: '600',
  },
  sessionValue: {
    color: '#f1f5f9',
    marginTop: 3,
    fontSize: 15,
    fontFamily: BODY_FONT,
    fontWeight: '800',
  },
  sectionHeaderRow: {
    marginTop: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 12,
  },
  sectionTitle: {
    color: '#e2e8f0',
    fontSize: 18,
    letterSpacing: 0.4,
    fontFamily: DISPLAY_FONT,
    fontWeight: '800',
  },
  sectionMeta: {
    color: '#64748b',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: BODY_FONT,
    fontWeight: '700',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    flexGrow: 1,
    minWidth: 150,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: 'rgba(8, 15, 30, 0.84)',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  metricLabel: {
    color: '#7c8dab',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: BODY_FONT,
    fontWeight: '700',
  },
  metricValue: {
    marginTop: 6,
    color: '#f8fafc',
    fontSize: 32,
    fontFamily: DISPLAY_FONT,
    fontWeight: '900',
  },
  metricValueMuted: {
    marginTop: 6,
    color: '#f8fafc',
    fontSize: 28,
    fontFamily: DISPLAY_FONT,
    fontWeight: '900',
  },
  metricMeta: {
    marginTop: 2,
    color: '#9fb2d0',
    fontSize: 13,
    lineHeight: 18,
    fontFamily: BODY_FONT,
    fontWeight: '600',
  },
  metricTrack: {
    marginTop: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(71, 85, 105, 0.4)',
    height: 7,
    overflow: 'hidden',
  },
  metricFill: {
    height: '100%',
    borderRadius: 999,
  },
  pulseRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  pulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pulseOnline: {
    backgroundColor: '#34d399',
  },
  pulseOffline: {
    backgroundColor: '#f59e0b',
  },
  pulseLabel: {
    color: '#9fb2d0',
    fontSize: 12,
    fontFamily: BODY_FONT,
    fontWeight: '600',
  },
  modePanel: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(8, 22, 46, 0.9)',
    borderColor: 'rgba(14, 165, 233, 0.62)',
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  modeLabel: {
    color: '#9fb2d0',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    fontSize: 11,
    fontFamily: BODY_FONT,
    fontWeight: '700',
  },
  modeValue: {
    marginTop: 5,
    color: '#f8fafc',
    fontSize: 16,
    lineHeight: 20,
    fontFamily: BODY_FONT,
    fontWeight: '800',
    maxWidth: 520,
  },
  modeAction: {
    color: '#67e8f9',
    fontSize: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: BODY_FONT,
    fontWeight: '800',
  },
  experienceStack: {
    gap: 12,
  },
  experienceCard: {
    minHeight: 198,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 18,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  experienceEyebrow: {
    color: '#a5b4fc',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 11,
    fontFamily: BODY_FONT,
    fontWeight: '700',
  },
  experienceTitle: {
    marginTop: 8,
    color: '#f8fafc',
    fontSize: 27,
    lineHeight: 32,
    fontFamily: DISPLAY_FONT,
    fontWeight: '900',
  },
  experienceDescription: {
    marginTop: 10,
    color: '#d5e0f4',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 640,
    fontFamily: BODY_FONT,
    fontWeight: '600',
  },
  experienceAction: {
    marginTop: 16,
    color: '#67e8f9',
    fontSize: 15,
    fontFamily: BODY_FONT,
    fontWeight: '800',
  },
  ottCard: {
    backgroundColor: 'rgba(12, 18, 36, 0.9)',
    borderColor: 'rgba(148, 163, 184, 0.45)',
    borderWidth: 1,
  },
  webrtcCard: {
    backgroundColor: 'rgba(6, 44, 66, 0.9)',
    borderColor: 'rgba(34, 211, 238, 0.65)',
    borderWidth: 1,
  },
  replayCard: {
    backgroundColor: 'rgba(21, 18, 56, 0.9)',
    borderColor: 'rgba(129, 140, 248, 0.65)',
    borderWidth: 1,
  },
  bottomSpacer: {
    height: 8,
  },
});
