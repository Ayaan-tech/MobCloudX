// ─────────────────────────────────────────────────────────────
// MobCloudX Demo — Home Screen
// Media import + QoE status cards + mode toggle
// ─────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useQoE, useNetwork, useBattery, useSDKMode, useSessionId } from '../src';

export default function HomeScreen() {
  const router = useRouter();
  const qoe = useQoE();
  const network = useNetwork();
  const battery = useBattery();
  const { mode, toggleMode } = useSDKMode();
  const sessionId = useSessionId();

  const handlePlaySample = () => {
    router.push('/player');
  };

  const handleImportMedia = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'video/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.length > 0) {
        const uri = result.assets[0].uri;
        router.push({ pathname: '/player', params: { videoUri: uri } });
      }
    } catch (err: any) {
      Alert.alert('Import Error', err.message ?? 'Could not import video');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>MobCloudX</Text>
        <Text style={styles.subtitle}>AI-Driven QoE Monitoring</Text>
        <Text style={styles.sessionText}>
          Session: {sessionId?.slice(0, 8) ?? 'N/A'}
        </Text>
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

      {/* Action buttons */}
      <View style={styles.actionsContainer}>
        <Pressable style={styles.importButton} onPress={handleImportMedia}>
          <Text style={styles.importIcon}>📁</Text>
          <Text style={styles.importText}>Import from Storage</Text>
          <Text style={styles.importHint}>Pick a video from your device</Text>
        </Pressable>

        <Pressable style={styles.playButton} onPress={handlePlaySample}>
          <Text style={styles.playButtonText}>▶  Play Sample Stream</Text>
        </Pressable>

        <Pressable
          style={[styles.playButton, { backgroundColor: '#059669' }]}
          onPress={() => router.push('/comparison')}
        >
          <Text style={styles.playButtonText}>⚡  Before / After Quality</Text>
        </Pressable>
      </View>
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
    marginBottom: 24,
  },
  toggleText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  actionsContainer: {
    gap: 14,
  },
  importButton: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#1e293b',
    borderStyle: 'dashed',
    gap: 6,
  },
  importIcon: {
    fontSize: 28,
  },
  importText: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '700',
  },
  importHint: {
    color: '#64748b',
    fontSize: 12,
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
