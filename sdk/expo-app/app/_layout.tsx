// ─────────────────────────────────────────────────────────────
// MobCloudX Demo — Root Layout
// Routes: splash (index) → home → player
// ─────────────────────────────────────────────────────────────

import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { initMobCloudX, destroyMobCloudX } from '../src';

// ── Producer URL config ───────────────────────────────────────
// Priority: EXPO_PUBLIC_PRODUCER_URL env var → LAN IP fallback
// For cellular / outside LAN, set EXPO_PUBLIC_PRODUCER_URL to
// your ngrok/cloud URL in sdk/expo-app/.env:
//   EXPO_PUBLIC_PRODUCER_URL=https://xxxx.ngrok.io
const PRODUCER_URL =
  process.env.EXPO_PUBLIC_PRODUCER_URL ?? 'http://192.168.1.3:3001';

export default function RootLayout() {
  useEffect(() => {
    (async () => {
      try {
        await initMobCloudX({
          apiBaseUrl: PRODUCER_URL,
          telemetryIntervalMs: 3000,
          adaptationPollIntervalMs: 5000,
          frameCaptureIntervalMs: 3000,
          enableTelemetry: true,
          enableAIScoring: true,
          enableAdaptation: true,
          mode: 'user',
          enableHaptics: true,
          debug: __DEV__,
        });
      } catch (err) {
        console.error('[MobCloudX] SDK init failed:', err);
      }
    })();

    return () => {
      destroyMobCloudX().catch(() => {});
    };
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#020617' },
          headerTintColor: '#f8fafc',
          contentStyle: { backgroundColor: '#020617' },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="home" options={{ title: 'MobCloudX', headerBackVisible: false }} />
        <Stack.Screen name="player" options={{ title: 'Now Playing', headerShown: false }} />
      </Stack>
    </>
  );
}
