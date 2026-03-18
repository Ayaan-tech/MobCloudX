// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Network Stability Indicator
// Minimal animated bar showing connection quality
// ─────────────────────────────────────────────────────────────

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import { useSDKStore } from '../core/store';

export function NetworkIndicator() {
  const network = useSDKStore((s) => s.networkInfo);

  // 0 = disconnected, 1 = weak, 2 = moderate, 3 = strong
  const strength = useSharedValue(0);

  useEffect(() => {
    let level = 0;
    if (!network.isConnected) {
      level = 0;
    } else if (network.type === 'wifi') {
      level = 3;
    } else if (network.type === 'cellular') {
      switch (network.cellularGeneration) {
        case '5g':  level = 3; break;
        case '4g':  level = 2; break;
        case '3g':  level = 1; break;
        default:    level = 1; break;
      }
    } else if (network.type === 'ethernet') {
      level = 3;
    } else {
      level = 1;
    }

    strength.value = withTiming(level, { duration: 500 });
  }, [network]);

  const bar1 = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(strength.value, [0, 1, 2, 3], ['#64748b', '#ef4444', '#eab308', '#22c55e']),
    opacity: strength.value >= 1 ? 1 : 0.3,
  }));
  const bar2 = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(strength.value, [0, 1, 2, 3], ['#64748b', '#64748b', '#eab308', '#22c55e']),
    opacity: strength.value >= 2 ? 1 : 0.3,
  }));
  const bar3 = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(strength.value, [0, 1, 2, 3], ['#64748b', '#64748b', '#64748b', '#22c55e']),
    opacity: strength.value >= 3 ? 1 : 0.3,
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.bar, styles.bar1, bar1]} />
      <Animated.View style={[styles.bar, styles.bar2, bar2]} />
      <Animated.View style={[styles.bar, styles.bar3, bar3]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 16,
    paddingHorizontal: 4,
  },
  bar: {
    width: 4,
    borderRadius: 1,
  },
  bar1: { height: 6 },
  bar2: { height: 10 },
  bar3: { height: 16 },
});
