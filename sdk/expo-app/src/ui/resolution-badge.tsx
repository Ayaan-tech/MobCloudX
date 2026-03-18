// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Resolution Badge
// Floating badge showing current resolution on the video player
// ─────────────────────────────────────────────────────────────

import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';

interface ResolutionBadgeProps {
  resolution: string;
}

export function ResolutionBadge({ resolution }: ResolutionBadgeProps) {
  const scale = useSharedValue(1);

  useEffect(() => {
    // Pulse animation on resolution change
    scale.value = withSequence(
      withTiming(1.15, { duration: 150, easing: Easing.out(Easing.cubic) }),
      withSpring(1, { damping: 12, stiffness: 200 })
    );
  }, [resolution]);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.badge, badgeStyle]}>
      <Animated.Text style={styles.badgeText}>{resolution}</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  badgeText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
