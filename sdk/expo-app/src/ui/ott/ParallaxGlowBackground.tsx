import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

const GRID_ROWS = Array.from({ length: 18 }, (_, index) => index);
const GRID_COLUMNS = Array.from({ length: 12 }, (_, index) => index);

export function ParallaxGlowBackground({ scrollY }: { scrollY?: SharedValue<number> }): JSX.Element {
  const topGlowStyle = useAnimatedStyle(() => {
    const y = scrollY?.value ?? 0;
    return {
      transform: [{ translateY: interpolate(y, [0, 600], [0, -28], 'clamp') }],
    };
  });

  const bottomGlowStyle = useAnimatedStyle(() => {
    const y = scrollY?.value ?? 0;
    return {
      transform: [{ translateY: interpolate(y, [0, 600], [0, 20], 'clamp') }],
    };
  });

  return (
    <View pointerEvents="none" style={styles.layer}>
      <Animated.View style={[styles.topGlow, topGlowStyle]} />
      <Animated.View style={[styles.bottomGlow, bottomGlowStyle]} />
      <View style={styles.gridWrap}>
        {GRID_ROWS.map((row) => (
          <View key={`row-${row}`} style={[styles.gridRow, { top: row * 72 }]} />
        ))}
        {GRID_COLUMNS.map((column) => (
          <View key={`column-${column}`} style={[styles.gridColumn, { left: column * 72 }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
  },
  topGlow: {
    position: 'absolute',
    top: -150,
    right: -120,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: 'rgba(34, 211, 238, 0.18)',
  },
  bottomGlow: {
    position: 'absolute',
    left: -140,
    bottom: -150,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: 'rgba(20, 184, 166, 0.12)',
  },
  gridWrap: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.16,
  },
  gridRow: {
    position: 'absolute',
    left: -120,
    right: -120,
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.26)',
  },
  gridColumn: {
    position: 'absolute',
    top: -120,
    bottom: -120,
    width: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.24)',
  },
});
