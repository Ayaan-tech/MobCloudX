// src/ui/MuxDashboard.tsx
// Mux-style live QoE overlay for MobCloudX FL.
//
// Shows: QoE score, ABR decision, video metrics, device info,
//        mode toggle, FL status w/ auto-FL countdown, event log.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  Pressable,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { QoEModel } from '../fl/qoeModel';
import { runFLRound } from '../fl/flRunner';
import type { FLStatus, FLStage } from '../fl/flRunner';
import { checkBridge } from '../fl/weightSync';
import {
  MetricSimulator,
  type LiveMetrics,
  type MetricMode,
} from '../telemetry/MetricSimulator';
import { getBatteryLevel } from '../telemetry/BatteryReader';

const AUTO_FL_INTERVAL_SECONDS = 60;
const { width: SCREEN_W } = Dimensions.get('window');

// ── Color helpers ───────────────────────────────────────────
const qoeColor = (score: number) =>
  score > 0.7 ? '#22c55e' : score >= 0.4 ? '#eab308' : '#ef4444';
const abrColor = (action: string) =>
  action === 'increase'
    ? '#22c55e'
    : action === 'maintain'
      ? '#14b8a6'
      : '#ef4444';
const abrLabel = (action: string) =>
  action === 'increase'
    ? '↑ INCREASE QUALITY'
    : action === 'maintain'
      ? '→ MAINTAIN QUALITY'
      : '↓ REDUCE QUALITY';

export function MuxDashboard() {
  // ── State ─────────────────────────────────────────────────
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);
  const [flStatus, setFlStatus] = useState<FLStatus>({
    stage: 'idle',
    round: 0,
    loss: 0,
    epoch: 0,
    message: 'Ready',
  });
  const [autoFL, setAutoFL] = useState(true);
  const [countdown, setCountdown] = useState(AUTO_FL_INTERVAL_SECONDS);
  const [flRoundsCompleted, setFlRoundsCompleted] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [mode, setMode] = useState<MetricMode>('simulated');
  const [sparkline, setSparkline] = useState<number[]>([]);

  const simRef = useRef<MetricSimulator | null>(null);
  const modelRef = useRef<QoEModel>(new QoEModel());
  const flRunRef = useRef(false); // prevent concurrent FL rounds
  const countdownRef = useRef(AUTO_FL_INTERVAL_SECONDS);

  // ── Logging ───────────────────────────────────────────────
  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 30));
  }, []);

  // ── Init simulator ────────────────────────────────────────
  useEffect(() => {
    const sim = new MetricSimulator();
    simRef.current = sim;
    sim.start();

    const unsub = sim.addListener((m) => {
      setMetrics(m);
      setSparkline((prev) => [...prev.slice(-29), m.qoe_score]);
    });

    // Battery polling
    const batteryTimer = setInterval(async () => {
      const level = await getBatteryLevel();
      if (level >= 0) sim.setBattery(level);
    }, 10000);

    addLog('MetricSimulator started (simulated mode)');

    return () => {
      unsub();
      clearInterval(batteryTimer);
      sim.stop();
    };
  }, [addLog]);

  // ── Auto FL countdown ─────────────────────────────────────
  useEffect(() => {
    if (!autoFL) return;

    const timer = setInterval(async () => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);

      if (countdownRef.current <= 0) {
        countdownRef.current = AUTO_FL_INTERVAL_SECONDS;
        setCountdown(AUTO_FL_INTERVAL_SECONDS);

        if (flRunRef.current) {
          addLog('Auto-FL skipped: round in progress');
          return;
        }

        // Check bridge is online
        try {
          await checkBridge();
          triggerFL();
        } catch {
          addLog('Auto-FL skipped: bridge offline');
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [autoFL, addLog]);

  // ── FL trigger ────────────────────────────────────────────
  const triggerFL = useCallback(async () => {
    if (flRunRef.current) {
      addLog('FL round already in progress');
      return;
    }
    flRunRef.current = true;
    addLog(`Starting FL round ${flStatus.round + 1}...`);

    try {
      await runFLRound(modelRef.current, (s) => {
        setFlStatus(s);
        if (s.stage !== 'training') addLog(s.message);
        if (s.stage === 'done') {
          setFlRoundsCompleted((p) => p + 1);
          simRef.current?.setFlRound(s.round);
          countdownRef.current = AUTO_FL_INTERVAL_SECONDS;
          setCountdown(AUTO_FL_INTERVAL_SECONDS);
        }
      });
    } catch (err: any) {
      addLog(`FL error: ${err.message}`);
    } finally {
      flRunRef.current = false;
    }
  }, [flStatus.round, addLog]);

  // ── Mode toggle ───────────────────────────────────────────
  const toggleMode = () => {
    const next: MetricMode = mode === 'simulated' ? 'real' : 'simulated';
    setMode(next);
    simRef.current?.setMode(next);
    addLog(`Mode → ${next}`);
  };

  if (!metrics) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.loadingText}>Initializing MobCloudX FL...</Text>
      </View>
    );
  }

  const qoePercent = Math.round(metrics.qoe_score * 100);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ── Hero: QoE Score ─────────────────────────────── */}
      <View style={[styles.card, styles.heroCard]}>
        <Text style={styles.heroLabel}>QoE Score</Text>
        <Text style={[styles.heroScore, { color: qoeColor(metrics.qoe_score) }]}>
          {qoePercent}
        </Text>
        <Text style={styles.heroSub}>/ 100</Text>

        {/* Sparkline */}
        <View style={styles.sparklineRow}>
          {sparkline.map((v, i) => (
            <View
              key={i}
              style={[
                styles.sparkBar,
                {
                  height: Math.max(2, v * 30),
                  backgroundColor: qoeColor(v),
                  opacity: i === sparkline.length - 1 ? 1 : 0.5,
                },
              ]}
            />
          ))}
        </View>
      </View>

      {/* ── ABR Decision Pill ──────────────────────────── */}
      <View
        style={[
          styles.abrPill,
          { backgroundColor: abrColor(metrics.abr_action) + '22' },
        ]}
      >
        <Text
          style={[styles.abrText, { color: abrColor(metrics.abr_action) }]}
        >
          {abrLabel(metrics.abr_action)}
        </Text>
      </View>

      {/* ── Video Metrics ──────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Video Metrics</Text>
        <MetricRow label="Resolution" value={metrics.resolution} />
        <MetricRow
          label="Bitrate"
          value={`${metrics.bitrate.toFixed(1)} Mbps`}
          bar={Math.min(metrics.bitrate / 18, 1)}
        />
        <MetricRow
          label="Buffer Health"
          value={`${(metrics.buffer_health * 100).toFixed(0)}%`}
          bar={metrics.buffer_health}
          barColor={metrics.buffer_health > 0.5 ? '#ef4444' : '#22c55e'}
        />
        <MetricRow
          label="Latency"
          value={`${metrics.latency.toFixed(0)} ms`}
          valueColor={
            metrics.latency > 200
              ? '#ef4444'
              : metrics.latency > 100
                ? '#eab308'
                : '#22c55e'
          }
        />
        <MetricRow label="FPS" value={String(metrics.fps)} />
      </View>

      {/* ── Device Card ────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Device</Text>
        <MetricRow
          label="Battery"
          value={
            metrics.battery >= 0 ? `${metrics.battery}%` : 'N/A'
          }
        />
        <MetricRow
          label="Session ID"
          value={`...${(metrics as any).session_id?.slice?.(-10) ?? 'N/A'}`}
        />
        <MetricRow
          label="Samples"
          value={String(metrics.samples_collected)}
        />
      </View>

      {/* ── Mode Toggle ────────────────────────────────── */}
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <Text style={styles.cardTitle}>Mode</Text>
          <View style={styles.toggleRight}>
            <Text style={styles.toggleLabel}>
              {mode === 'simulated' ? 'Simulated' : 'Real'}
            </Text>
            <Switch
              value={mode === 'real'}
              onValueChange={toggleMode}
              trackColor={{ false: '#333', true: '#14b8a6' }}
            />
          </View>
        </View>
        {mode === 'real' && (
          <Text style={styles.hintText}>
            Use pushRealMetrics() to feed live player data
          </Text>
        )}
      </View>

      {/* ── Federated Learning Card ────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Federated Learning</Text>
        <MetricRow label="Round" value={String(flStatus.round)} />
        <MetricRow label="Completed" value={String(flRoundsCompleted)} />
        <MetricRow label="Stage" value={flStatus.stage} />
        {flStatus.loss > 0 && (
          <MetricRow
            label="Last Loss"
            value={flStatus.loss.toFixed(4)}
          />
        )}

        <View style={styles.toggleRow}>
          <Text style={styles.metricLabel}>Auto FL</Text>
          <View style={styles.toggleRight}>
            <Text style={styles.countdownText}>
              {autoFL ? `${countdown}s` : 'OFF'}
            </Text>
            <Switch
              value={autoFL}
              onValueChange={setAutoFL}
              trackColor={{ false: '#333', true: '#22c55e' }}
            />
          </View>
        </View>

        {/* Countdown ring */}
        {autoFL && (
          <View style={styles.countdownBar}>
            <View
              style={[
                styles.countdownFill,
                {
                  width: `${(countdown / AUTO_FL_INTERVAL_SECONDS) * 100}%`,
                },
              ]}
            />
          </View>
        )}

        <Pressable
          style={[
            styles.flButton,
            flRunRef.current && styles.flButtonDisabled,
          ]}
          onPress={triggerFL}
          disabled={flRunRef.current}
        >
          <Text style={styles.flButtonText}>
            {flRunRef.current
              ? flStatus.message
              : `Run FL Round ${flStatus.round + 1}`}
          </Text>
        </Pressable>
      </View>

      {/* ── Event Log ──────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Event Log</Text>
        {logs.map((line, i) => (
          <Text
            key={i}
            style={[styles.logLine, i === 0 && styles.logLineNewest]}
            numberOfLines={1}
          >
            {line}
          </Text>
        ))}
        {logs.length === 0 && (
          <Text style={styles.logLine}>No events yet</Text>
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ── Metric Row Component ────────────────────────────────────
function MetricRow({
  label,
  value,
  bar,
  barColor = '#3b82f6',
  valueColor = '#e5e7eb',
}: {
  label: string;
  value: string;
  bar?: number;
  barColor?: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricRight}>
        <Text style={[styles.metricValue, { color: valueColor }]}>
          {value}
        </Text>
        {bar !== undefined && (
          <View style={styles.miniBar}>
            <View
              style={[
                styles.miniBarFill,
                { width: `${Math.min(bar, 1) * 100}%`, backgroundColor: barColor },
              ]}
            />
          </View>
        )}
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#8b949e',
    fontSize: 16,
  },

  // Card
  card: {
    backgroundColor: '#161b22',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#21262d',
  },
  cardTitle: {
    color: '#c9d1d9',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Hero
  heroCard: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  heroLabel: {
    color: '#8b949e',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  heroScore: {
    fontSize: 72,
    fontWeight: '800',
    lineHeight: 80,
  },
  heroSub: {
    color: '#484f58',
    fontSize: 18,
    marginTop: -8,
  },
  sparklineRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    marginTop: 16,
    height: 30,
  },
  sparkBar: {
    width: Math.max(2, (SCREEN_W - 80) / 30),
    borderRadius: 1,
  },

  // ABR Pill
  abrPill: {
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#21262d',
  },
  abrText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  // Metric row
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  metricLabel: {
    color: '#8b949e',
    fontSize: 13,
  },
  metricRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  metricValue: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  miniBar: {
    width: 60,
    height: 4,
    backgroundColor: '#21262d',
    borderRadius: 2,
    overflow: 'hidden',
  },
  miniBarFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  toggleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabel: {
    color: '#8b949e',
    fontSize: 13,
  },
  hintText: {
    color: '#484f58',
    fontSize: 11,
    marginTop: 6,
    fontStyle: 'italic',
  },

  // Countdown
  countdownText: {
    color: '#22c55e',
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  countdownBar: {
    height: 4,
    backgroundColor: '#21262d',
    borderRadius: 2,
    marginVertical: 8,
    overflow: 'hidden',
  },
  countdownFill: {
    height: '100%',
    backgroundColor: '#22c55e',
    borderRadius: 2,
  },

  // FL Button
  flButton: {
    backgroundColor: '#238636',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  flButtonDisabled: {
    backgroundColor: '#21262d',
  },
  flButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },

  // Log
  logLine: {
    color: '#484f58',
    fontSize: 11,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  logLineNewest: {
    color: '#58a6ff',
  },
});
