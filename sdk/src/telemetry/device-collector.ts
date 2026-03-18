// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Device Info Collector
// ─────────────────────────────────────────────────────────────

import * as Device from 'expo-device';
import { Dimensions, Platform } from 'react-native';
import type { DeviceInfo } from '../types';

/**
 * Collects static device metadata (called once at init).
 */
export function collectDeviceInfo(): DeviceInfo {
  const { width, height } = Dimensions.get('screen');

  return {
    model: Device.modelName ?? 'Unknown',
    brand: Device.brand ?? 'Unknown',
    osVersion: `${Platform.OS} ${Device.osVersion ?? ''}`.trim(),
    screenWidth: width,
    screenHeight: height,
    totalMemoryMb: Device.totalMemory
      ? Math.round(Device.totalMemory / (1024 * 1024))
      : 0,
    deviceType: (Device.deviceType === Device.DeviceType.TABLET) ? 'tablet' : 'phone',
  };
}
