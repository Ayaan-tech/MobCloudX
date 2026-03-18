// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Device Context Chips
// Horizontal pill/chip indicators for device, network, battery
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
        icon="🔋"
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
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chipWarn: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  chipIcon: {
    fontSize: 13,
  },
  chipLabel: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
  },
  chipLabelWarn: {
    color: '#fca5a5',
  },
});
