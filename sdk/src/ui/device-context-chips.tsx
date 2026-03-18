// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Device Context Chips (Enhanced v2)
// Horizontal pill/chip indicators for device, network, battery
// Matches the reference screenshot's "Device Context" section
// ─────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

interface ChipProps {
  icon: string;
  label: string;
  warn?: boolean;
}

function Chip({ icon, label, warn }: ChipProps) {
  return (
    <View style={[styles.chip, warn && styles.chipWarn]}>
      <Text style={styles.chipIcon}>{icon}</Text>
      <Text style={[styles.chipLabel, warn && styles.chipLabelWarn]}>{label}</Text>
    </View>
  );
}

interface DeviceContextChipsProps {
  networkType: string;
  cellularGen?: string | null;
  batteryPercent: number;
  isCharging: boolean;
  fps?: number;
  signalDbm?: number | null;
}

function getDeviceTier(fps: number, batteryPercent: number): string {
  if (fps >= 55 && batteryPercent > 50) return 'High-End Device';
  if (fps >= 25 && batteryPercent > 20) return 'Mid-Range Device';
  return 'Low-End Device';
}

function getNetworkLabel(type: string, gen?: string | null): string {
  if (type === 'wifi') return 'WiFi';
  if (type === 'ethernet') return 'Ethernet';
  if (type === 'cellular' && gen) return `${gen.toUpperCase()} Network`;
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function getBatteryIcon(percent: number, isCharging: boolean): string {
  if (isCharging) return '🔌';
  if (percent > 75) return '🔋';
  if (percent > 40) return '🔋';
  if (percent > 15) return '🪫';
  return '🪫';
}

export function DeviceContextChips({
  networkType,
  cellularGen,
  batteryPercent,
  isCharging,
  fps = 30,
  signalDbm,
}: DeviceContextChipsProps) {
  const deviceTier = getDeviceTier(fps, batteryPercent);
  const networkLabel = getNetworkLabel(networkType, cellularGen);
  const batteryIcon = getBatteryIcon(batteryPercent, isCharging);
  const batteryLabel = isCharging
    ? `Battery: ${batteryPercent}% ⚡`
    : `Battery: ${batteryPercent}%`;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      <Chip icon="📱" label={deviceTier} />
      <Chip icon="📶" label={networkLabel} warn={networkType === 'none'} />
      <Chip
        icon={batteryIcon}
        label={batteryLabel}
        warn={batteryPercent < 20 && !isCharging}
      />
      {signalDbm != null && (
        <Chip icon="📡" label={`${signalDbm} dBm`} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
    flexWrap: 'nowrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.06)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 7,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.12)',
  },
  chipWarn: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  chipIcon: {
    fontSize: 14,
  },
  chipLabel: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  chipLabelWarn: {
    color: '#fca5a5',
  },
});
