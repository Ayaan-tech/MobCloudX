// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — QA Debug Panel (QA Engineer Mode)
// Full metrics panel with toggles, decision log, model info
// ─────────────────────────────────────────────────────────────

import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Switch, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useSDKStore } from '../core/store';
import { QoEManager } from '../qoe/qoe-manager';
import { MobCloudXSDK } from '../core/sdk';

// ── MetricRow ────────────────────────────────────────────────

function MetricRow({ label, value, unit, warn }: {
  label: string;
  value: string | number;
  unit?: string;
  warn?: boolean;
}) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, warn && styles.metricWarn]}>
        {value}
        {unit ? <Text style={styles.metricUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

// ── Section ──────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

// ── Main Component ───────────────────────────────────────────

export function QADebugPanel() {
  const [expanded, setExpanded] = useState(true);
  const panelHeight = useSharedValue(1);

  // Store selectors
  const qoe = useSDKStore((s) => s.qoe);
  const network = useSDKStore((s) => s.networkInfo);
  const battery = useSDKStore((s) => s.batteryInfo);
  const playback = useSDKStore((s) => s.playbackMetrics);
  const adaptation = useSDKStore((s) => s.adaptation);
  const sessionId = useSDKStore((s) => s.sessionId);
  const config = useSDKStore((s) => s.config);

  // Toggle states (for SDK feature toggles)
  const [telemetryEnabled, setTelemetryEnabled] = useState(true);
  const [aiScoringEnabled, setAiScoringEnabled] = useState(true);
  const [adaptationEnabled, setAdaptationEnabled] = useState(true);

  // Wire toggles to actual SDK managers
  const handleTelemetryToggle = useCallback((value: boolean) => {
    setTelemetryEnabled(value);
    const sdk = MobCloudXSDK.getInstance();
    if (value) {
      sdk.startTelemetry();
    } else {
      sdk.stopTelemetry();
    }
  }, []);

  const handleAdaptationToggle = useCallback((value: boolean) => {
    setAdaptationEnabled(value);
    const sdk = MobCloudXSDK.getInstance();
    if (value) {
      sdk.startAdaptation();
    } else {
      sdk.stopAdaptation();
    }
  }, []);

  const handleAiScoringToggle = useCallback((value: boolean) => {
    setAiScoringEnabled(value);
    // AI scoring is driven by the local QoE estimator interval in hooks.
    // Disabling it clears the QoE score to 0 (no local estimation).
    if (!value) {
      useSDKStore.getState().updateQoE({
        sessionId: sessionId,
        qoe: 0,
        ts: Date.now(),
        category: 'fair',
        details: { calculation_method: 'disabled' },
      });
    }
  }, [sessionId]);

  const toggleExpand = useCallback(() => {
    const newExpanded = !expanded;
    setExpanded(newExpanded);
    panelHeight.value = withTiming(newExpanded ? 1 : 0, {
      duration: 250,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [expanded]);

  const contentStyle = useAnimatedStyle(() => ({
    maxHeight: panelHeight.value * 600,
    opacity: panelHeight.value,
    overflow: 'hidden' as const,
  }));

  const qoeColor = QoEManager.getCategoryColor(qoe.category);
  const latestDecision = adaptation.latestDecision;

  return (
    <View style={styles.container}>
      {/* Header bar — always visible */}
      <Pressable onPress={toggleExpand} style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.qoeDot, { backgroundColor: qoeColor }]} />
          <Text style={styles.headerTitle}>MobCloudX Debug</Text>
        </View>
        <Text style={styles.headerScore}>{Math.round(qoe.currentScore)}</Text>
        <Text style={styles.expandIcon}>{expanded ? '▼' : '▲'}</Text>
      </Pressable>

      {/* Expandable content */}
      <Animated.View style={contentStyle}>
        <ScrollView
          style={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {/* ── Session ────────────────────────────────── */}
          <Section title="Session">
            <MetricRow label="Session ID" value={sessionId.slice(0, 8) + '...'} />
            <MetricRow label="Mode" value={config.mode ?? 'qa'} />
          </Section>

          {/* ── QoE ────────────────────────────────────── */}
          <Section title="QoE">
            <MetricRow label="Score" value={qoe.currentScore.toFixed(1)} warn={qoe.currentScore < 50} />
            <MetricRow label="Category" value={qoe.category} />
            <MetricRow label="Trend" value={qoe.trend} />
            <MetricRow label="History" value={`${qoe.history.length} samples`} />
            <MetricRow label="Method" value={qoe.history[qoe.history.length - 1]?.details?.calculation_method ?? 'N/A'} />
          </Section>

          {/* ── Playback ───────────────────────────────── */}
          <Section title="Playback">
            <MetricRow label="FPS" value={playback?.currentFps ?? 0} warn={(playback?.currentFps ?? 30) < 24} />
            <MetricRow label="Bitrate" value={playback?.currentBitrate ?? 0} unit="kbps" />
            <MetricRow label="Buffer" value={playback?.bufferHealthMs ?? 0} unit="ms" warn={(playback?.bufferHealthMs ?? 0) < 2000} />
            <MetricRow label="Dropped Frames" value={playback?.droppedFrames ?? 0} warn={(playback?.droppedFrames ?? 0) > 10} />
            <MetricRow label="Resolution" value={playback?.resolution ?? 'N/A'} />
            <MetricRow label="Codec" value={playback?.codec ?? 'N/A'} />
            <MetricRow label="Buffering" value={playback?.isBuffering ? 'YES' : 'No'} warn={playback?.isBuffering} />
            <MetricRow label="Startup Latency" value={playback?.startupLatencyMs ?? 'N/A'} unit="ms" />
          </Section>

          {/* ── Network ────────────────────────────────── */}
          <Section title="Network">
            <MetricRow label="Type" value={network.type} />
            <MetricRow label="Connected" value={network.isConnected ? 'Yes' : 'No'} warn={!network.isConnected} />
            <MetricRow label="Generation" value={network.cellularGeneration ?? 'N/A'} />
            <MetricRow label="Signal" value={network.signalStrengthDbm ?? 'N/A'} unit="dBm" />
          </Section>

          {/* ── Battery ────────────────────────────────── */}
          <Section title="Battery">
            <MetricRow label="Level" value={`${Math.round(battery.level * 100)}%`} warn={battery.level < 0.2} />
            <MetricRow label="Charging" value={battery.isCharging ? 'Yes' : 'No'} />
          </Section>

          {/* ── Adaptation ─────────────────────────────── */}
          <Section title="Adaptation Agent">
            <MetricRow label="Latest Decision" value={latestDecision?.decision ?? 'None'} />
            <MetricRow label="Confidence" value={latestDecision ? `${Math.round(latestDecision.confidence * 100)}%` : 'N/A'} />
            <MetricRow label="Congestion" value={latestDecision?.congestion_probability != null ? `${Math.round(latestDecision.congestion_probability * 100)}%` : 'N/A'} />
            <MetricRow label="Action" value={latestDecision?.recommended_action ?? 'N/A'} />
            <MetricRow label="Urgency" value={latestDecision?.urgency ?? 'N/A'} />
            <MetricRow label="Prefetch" value={latestDecision?.prefetch_seconds ?? 'N/A'} unit="s" />
            <MetricRow label="Reason" value={latestDecision?.reason ?? 'N/A'} />
            <MetricRow label="Target Res" value={latestDecision?.target_resolution ? `${latestDecision.target_resolution}p` : 'N/A'} />
            <MetricRow label="Model Ver" value={latestDecision?.model_version ?? 'N/A'} />
            <MetricRow label="Inference Lat." value={latestDecision?.inference_latency_ms ?? 'N/A'} unit="ms" />
            <MetricRow label="History" value={`${adaptation.history.length} decisions`} />
          </Section>

          {/* ── Decision Log ───────────────────────────── */}
          {adaptation.history.length > 0 && (
            <Section title="Decision Log (Recent)">
              {adaptation.history.slice(-5).reverse().map((d, i) => (
                <View key={i} style={styles.logEntry}>
                  <Text style={styles.logTime}>
                    {new Date(d.ts).toLocaleTimeString()}
                  </Text>
                  <Text style={styles.logDecision}>
                    {(d.recommended_action ?? d.decision)} → {d.target_resolution ? `${d.target_resolution}p` : 'auto'} ({Math.round(d.confidence * 100)}%)
                  </Text>
                  <Text style={styles.logReason}>{d.reason}</Text>
                </View>
              ))}
            </Section>
          )}

          {/* ── Feature Toggles ────────────────────────── */}
          <Section title="Feature Toggles">
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Telemetry</Text>
              <Switch
                value={telemetryEnabled}
                onValueChange={handleTelemetryToggle}
                trackColor={{ false: '#334155', true: '#22c55e' }}
                thumbColor="#fff"
              />
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>AI Scoring</Text>
              <Switch
                value={aiScoringEnabled}
                onValueChange={handleAiScoringToggle}
                trackColor={{ false: '#334155', true: '#22c55e' }}
                thumbColor="#fff"
              />
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Adaptation</Text>
              <Switch
                value={adaptationEnabled}
                onValueChange={handleAdaptationToggle}
                trackColor={{ false: '#334155', true: '#22c55e' }}
                thumbColor="#fff"
              />
            </View>
          </Section>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(2, 6, 23, 0.92)',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  qoeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerTitle: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  headerScore: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
    marginRight: 8,
    fontVariant: ['tabular-nums'],
  },
  expandIcon: {
    color: '#64748b',
    fontSize: 10,
  },
  scrollContent: {
    maxHeight: 400,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  section: {
    marginTop: 10,
  },
  sectionTitle: {
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  metricLabel: {
    color: '#94a3b8',
    fontSize: 11,
  },
  metricValue: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  metricUnit: {
    color: '#64748b',
    fontSize: 9,
  },
  metricWarn: {
    color: '#ef4444',
  },
  logEntry: {
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  logTime: {
    color: '#64748b',
    fontSize: 9,
  },
  logDecision: {
    color: '#e2e8f0',
    fontSize: 10,
    fontWeight: '600',
  },
  logReason: {
    color: '#94a3b8',
    fontSize: 9,
    fontStyle: 'italic',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  toggleLabel: {
    color: '#cbd5e1',
    fontSize: 11,
  },
});
