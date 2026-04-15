// ─────────────────────────────────────────────────────────────
// MobCloudX Demo — Root Layout
// Routes: splash (index) → home → player
// ─────────────────────────────────────────────────────────────

import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import {
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import { destroyMobCloudX, initMobCloudX, SDKProvider } from '../src';

// ── Define WebRTC FL background task BEFORE any other code ────
const WEBRTC_FL_TASK = 'WEBRTC_FL_SYNC';

// This must be defined at app startup, before any component mounts
TaskManager.defineTask(WEBRTC_FL_TASK, async () => {
  console.log('[MobCloudX] WebRTC FL background task triggered');
  // The actual logic is handled by FLWeightsAgent when it's active
  return BackgroundFetch.BackgroundFetchResult.NoData;
});

// ── Backend URL config ────────────────────────────────────────
// Priority: explicit env vars → shared LAN host fallback.
// For cellular / outside LAN, set both URLs in sdk/expo-app/.env:
//   EXPO_PUBLIC_PRODUCER_URL=https://xxxx.ngrok.io
//   EXPO_PUBLIC_INFERENCE_URL=https://yyyy.ngrok.io
const LAN_HOST = process.env.EXPO_PUBLIC_LAN_HOST ?? '192.168.1.3';
const DEFAULT_HOST =
  Platform.OS === 'android'
    ? '10.0.2.2'
    : Platform.OS === 'ios'
      ? '127.0.0.1'
      : LAN_HOST;
const PRODUCER_URL =
  process.env.EXPO_PUBLIC_PRODUCER_URL ?? `http://${DEFAULT_HOST}:3001`;
const INFERENCE_URL =
  process.env.EXPO_PUBLIC_INFERENCE_URL ?? `http://${DEFAULT_HOST}:8000`;

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  useEffect(() => {
    (async () => {
      try {
        await initMobCloudX({
          apiBaseUrl: PRODUCER_URL,
          producerApiBaseUrl: PRODUCER_URL,
          inferenceApiBaseUrl: INFERENCE_URL,
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

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SDKProvider>
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
        <Stack.Screen name="call" options={{ title: 'Video Call', headerShown: false }} />
        <Stack.Screen name="replay" options={{ title: 'Session Replay', headerShown: false }} />
      </Stack>
    </SDKProvider>
  );
}
