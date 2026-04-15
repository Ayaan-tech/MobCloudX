// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Adaptation Toast (Redesigned)
// Shows a centered overlay on the video: "Switching to 480p"
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useSDKStore } from '../core/store';

export function AdaptationToast() {
  const latestDecision = useSDKStore((s) => s.adaptation.latestDecision);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.8);
  const prevTs = useRef(0);
  const [displayText, setDisplayText] = useState('');

  useEffect(() => {
    if (!latestDecision || latestDecision.ts === prevTs.current) return;
    prevTs.current = latestDecision.ts;

    // Build the display text
    const text = formatDecisionText(latestDecision);
    setDisplayText(text);

    // Animate: fade in + scale up → hold 3s → fade out
    scale.value = 0.8;
    opacity.value = withSequence(
      withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }),
      withDelay(3000, withTiming(0, { duration: 500 }))
    );
    scale.value = withSequence(
      withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }),
      withDelay(3000, withTiming(0.9, { duration: 500 }))
    );
  }, [latestDecision]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!latestDecision) return null;

  return (
    <Animated.View style={[styles.container, animStyle]}>
      <Text style={styles.text}>{displayText}</Text>
    </Animated.View>
  );
}

function formatDecisionText(decision: any): string {
  if (decision.recommended_action === 'switch_to_cached') {
    return `Blind-spot mode → ${decision.target_resolution ?? 240}p`;
  }
  if (decision.recommended_action === 'prefetch_low_quality') {
    return `Prefetching low quality (${decision.prefetch_seconds ?? 20}s)`;
  }
  if (decision.recommended_action === 'upgrade') {
    return `Upgrading quality to ${decision.target_resolution ?? 'auto'}p`;
  }
  if (decision.target_resolution) {
    return `Switching to ${decision.target_resolution}p`;
  }
  switch (decision.decision) {
    case 'reduce_bitrate':
      return decision.target_bitrate
        ? `Reducing bitrate to ${decision.target_bitrate} kbps`
        : 'Reducing bitrate';
    case 'increase_buffer':
      return 'Increasing buffer';
    case 'switch_codec':
      return `Switching codec to ${decision.target_codec ?? 'optimized'}`;
    case 'maintain':
      return 'Maintaining quality';
    default:
      return decision.decision
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c: string) => c.toUpperCase());
  }
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    top: '40%',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  text: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
