// src/fl/mongoReader.ts
// Reads FL training data via the inference server bridge.
// The bridge proxies reads to Atlas streaming_logs via pymongo.
// (Replaces deprecated Atlas Data API)

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BRIDGE_URL } from './config';

// ── Confirmed Atlas field names — DO NOT RENAME ───────────────
export interface QoELog {
  bitrate: number; // ✅ confirmed
  buffer_health: number; // ✅ confirmed (NOT buffer_ratio)
  latency: number; // ✅ confirmed
  rebuffering?: number; // optional
  session_id?: string; // ✅ identifier (NOT device_id)
}
// ─────────────────────────────────────────────────────────────

/**
 * QoE label formula — must match Python compute_qoe() in
 * inference/mongo_reader.py exactly.
 *
 * Validation:
 *   computeQoE(3.52, 0.71, 58, 0) ≈ 0.763
 *   computeQoE(0.3, 0.0, 350, 1) ≈ 0.0
 *   computeQoE(18, 1.0, 5, 0) ≈ 1.0
 */
export const computeQoE = (
  br: number,
  buf: number,
  lat: number,
  reb = 0
): number =>
  Math.min(
    1,
    Math.max(
      0,
      0.4 * Math.min(br / 6.0, 1) +
        0.3 * (1 - Math.min(buf, 1)) +
        0.2 * (1 - Math.min(lat / 200.0, 1)) +
        0.1 * (1 - Math.min(reb, 1))
    )
  );

export async function getSessionId(): Promise<string> {
  let id = await AsyncStorage.getItem('mobcloudx_session_id');
  if (!id) {
    id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await AsyncStorage.setItem('mobcloudx_session_id', id);
  }
  return id;
}

export async function fetchLocalQoEData(
  sessionId: string,
  limit = 500
): Promise<{ features: number[][]; labels: number[] }> {
  // Fetch training data via bridge proxy (replaces Atlas Data API)
  const res = await axios.get(`${BRIDGE_URL}/training-data`, {
    params: { session_id: sessionId, limit },
    timeout: 15000,
  });

  const docs: QoELog[] = res.data.documents ?? [];
  if (docs.length < 5)
    throw new Error(`Only ${docs.length} records for ${sessionId}`);

  const features: number[][] = [];
  const labels: number[] = [];

  docs.forEach((doc, i) => {
    const bitrate = doc.bitrate ?? 0;
    const bufferHealth = doc.buffer_health ?? 0; // buffer_health not buffer_ratio
    const latency = doc.latency ?? 0;
    const rebuffering = doc.rebuffering ?? 0;
    const prevBitrate = features.length > 0 ? features[i - 1][0] : bitrate;
    const bitrateSwitch = Math.abs(bitrate - prevBitrate);

    features.push([bitrate, bufferHealth, latency, rebuffering, bitrateSwitch]);

    // QoE label — must match Python compute_qoe()
    const qoe = computeQoE(bitrate, bufferHealth, latency, rebuffering);
    labels.push(qoe);
  });

  return { features, labels };
}

