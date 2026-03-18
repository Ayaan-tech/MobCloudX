// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Segmented Buffer Bar Chart
// Visual segmented blue bars showing buffer health level
// ─────────────────────────────────────────────────────────────

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';

const TOTAL_BARS = 16;
const BAR_GAP = 3;

interface BufferBarChartProps {
  bufferMs: number;
  maxBufferMs?: number;
}

function AnimatedBar({ index, ratio }: { index: number; ratio: Animated.SharedValue<number> }) {
  const barStyle = useAnimatedStyle(() => {
    const fillPoint = index / TOTAL_BARS;
    const filled = ratio.value >= fillPoint;
    return {
      backgroundColor: filled
        ? interpolateColor(
            ratio.value,
            [0, 0.3, 0.6, 1],
            ['#ef4444', '#f59e0b', '#38bdf8', '#22d3ee']
          )
        : 'rgba(255,255,255,0.06)',
      opacity: filled ? 1 : 0.4,
    };
  });

  return <Animated.View style={[styles.bar, barStyle]} />;
}

export function BufferBarChart({ bufferMs, maxBufferMs = 10000 }: BufferBarChartProps) {
  const ratio = useSharedValue(0);

  useEffect(() => {
    ratio.value = withTiming(Math.max(0, Math.min(1, bufferMs / maxBufferMs)), {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });
  }, [bufferMs, maxBufferMs]);

  const bufferSec = (bufferMs / 1000).toFixed(1);

  return (
    <View style={styles.container}>
      <View style={styles.barsRow}>
        {Array.from({ length: TOTAL_BARS }).map((_, i) => (
          <AnimatedBar key={i} index={i} ratio={ratio} />
        ))}
      </View>
      <Text style={styles.valueText}>{bufferSec} sec</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 8,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 24,
    gap: BAR_GAP,
  },
  bar: {
    flex: 1,
    height: '100%',
    borderRadius: 2,
    minWidth: 6,
  },
  valueText: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
