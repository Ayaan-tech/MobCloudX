// ─────────────────────────────────────────────────────────────
// MobCloudX Demo — Home Screen
// ─────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useQoE, useNetwork, useBattery, useSDKMode, useSessionId } from '../src';

export default function HomeScreen() {
  const router = useRouter();
  const qoe = useQoE();
  const network = useNetwork();
  const battery = useBattery();
  const { mode, toggleMode } = useSDKMode();
  const sessionId = useSessionId();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>MobCloudX SDK</Text>
        <Text style={styles.subtitle}>AI-Driven QoE Monitoring</Text>
        <Text style={styles.sessionText}>Session: {sessionId?.slice(0, 8) ?? 'N/A'}</Text>
      </View>

      {/* Status cards */}
      <View style={styles.cardsRow}>
        <View style={[styles.card, { borderColor: qoe.color }]}>
          <Text style={styles.cardLabel}>QoE Score</Text>
          <Text style={[styles.cardValue, { color: qoe.color }]}>
            {Math.round(qoe.currentScore)}
          </Text>
          <Text style={styles.cardSub}>{qoe.category} · {qoe.trend}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Network</Text>
          <Text style={styles.cardValue}>
            {network.type === 'cellular'
              ? network.cellularGeneration?.toUpperCase() ?? 'Cell'
              : network.type.toUpperCase()}
          </Text>
          <Text style={styles.cardSub}>
            {network.isConnected ? 'Connected' : 'Disconnected'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Battery</Text>
          <Text style={styles.cardValue}>
            {Math.round(battery.level * 100)}%
          </Text>
          <Text style={styles.cardSub}>
            {battery.isCharging ? 'Charging' : 'On battery'}
          </Text>
        </View>
      </View>

      {/* Mode toggle */}
      <Pressable style={styles.toggleButton} onPress={toggleMode}>
        <Text style={styles.toggleText}>
          Mode: {mode.toUpperCase()} — Tap to switch
        </Text>
      </Pressable>

      {/* Play video button */}
      <Pressable
        style={styles.playButton}
        onPress={() => router.push('/player')}
      >
        <Text style={styles.playButtonText}>▶  Open Video Player</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
    padding: 20,
  },
  header: {
    marginTop: 20,
    marginBottom: 30,
  },
  title: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 4,
  },
  sessionText: {
    color: '#475569',
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 8,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  card: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  cardLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cardValue: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  cardSub: {
    color: '#475569',
    fontSize: 10,
    marginTop: 2,
  },
  toggleButton: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  toggleText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  playButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  playButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
