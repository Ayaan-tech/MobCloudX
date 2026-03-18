// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Animated QoE Gauge (User Mode)
// Premium floating circular arc gauge with smooth color transitions
// Uses SVG arc progress for professional ring rendering
// ─────────────────────────────────────────────────────────────

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withSpring,
  interpolateColor,
  interpolate,
  Easing,
  useDerivedValue,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useSDKStore } from '../core/store';
import type { QoECategory } from '../types';

// ── Constants ────────────────────────────────────────────────

const GAUGE_SIZE = 80;
const STROKE_WIDTH = 4;
const RADIUS = (GAUGE_SIZE - STROKE_WIDTH * 2) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// ── Color palette ────────────────────────────────────────────

const COLORS: Record<QoECategory, string> = {
  excellent: '#22c55e',
  good: '#84cc16',
  fair: '#eab308',
  poor: '#ef4444',
};

const GLOW_COLORS: Record<QoECategory, string> = {
  excellent: 'rgba(34, 197, 94, 0.3)',
  good: 'rgba(132, 204, 22, 0.25)',
  fair: 'rgba(234, 179, 8, 0.25)',
  poor: 'rgba(239, 68, 68, 0.35)',
};

const CATEGORY_INDEX: Record<QoECategory, number> = {
  poor: 0,
  fair: 1,
  good: 2,
  excellent: 3,
};

// ── Animated SVG Circle ──────────────────────────────────────

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ── Component ────────────────────────────────────────────────

export function QoEGauge() {
  const currentScore = useSDKStore((s) => s.qoe.currentScore);
  const category = useSDKStore((s) => s.qoe.category);
  const trend = useSDKStore((s) => s.qoe.trend);
  const enableHaptics = useSDKStore((s) => s.config.enableHaptics);

  // Animated values
  const scoreAnim = useSharedValue(currentScore);
  const progressAnim = useSharedValue(currentScore / 100);
  const categoryIndex = useSharedValue(CATEGORY_INDEX[category]);
  const pulseScale = useSharedValue(1);
  const prevCategory = useSharedValue(category);

  // Update animations when score changes
  useEffect(() => {
    scoreAnim.value = withTiming(currentScore, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    });

    progressAnim.value = withTiming(currentScore / 100, {
      duration: 1000,
      easing: Easing.out(Easing.cubic),
    });

    categoryIndex.value = withTiming(CATEGORY_INDEX[category], {
      duration: 600,
    });

    // Pulse animation on change
    pulseScale.value = withSpring(1.06, { damping: 10, stiffness: 200 }, () => {
      pulseScale.value = withSpring(1, { damping: 14, stiffness: 200 });
    });

    // Haptic feedback on QoE drop
    if (enableHaptics && prevCategory.value !== category) {
      if (category === 'poor') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else if (category === 'fair' && prevCategory.value === 'good') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      prevCategory.value = category;
    }
  }, [currentScore, category]);

  // ── Animated styles ────────────────────────────────────

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const ringColor = useDerivedValue(() =>
    interpolateColor(
      categoryIndex.value,
      [0, 1, 2, 3],
      [COLORS.poor, COLORS.fair, COLORS.good, COLORS.excellent]
    )
  );

  const glowStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      categoryIndex.value,
      [0, 1, 2, 3],
      [GLOW_COLORS.poor, GLOW_COLORS.fair, GLOW_COLORS.good, GLOW_COLORS.excellent]
    ),
  }));

  const scoreTextStyle = useAnimatedStyle(() => ({
    color: ringColor.value,
  }));

  // ── Animated arc progress ──────────────────────────────

  const animatedStrokeDashoffset = useDerivedValue(() => {
    return interpolate(
      progressAnim.value,
      [0, 1],
      [CIRCUMFERENCE, 0]
    );
  });

  const animatedCircleProps = useAnimatedProps(() => ({
    strokeDashoffset: animatedStrokeDashoffset.value,
    stroke: ringColor.value,
  }));

  // ── Trend arrow ────────────────────────────────────────

  const trendIcon = trend === 'improving' ? '↑' : trend === 'degrading' ? '↓' : '→';
  const trendColor =
    trend === 'improving' ? '#22c55e' : trend === 'degrading' ? '#ef4444' : '#94a3b8';

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      {/* Glow backdrop */}
      <Animated.View style={[styles.glow, glowStyle]} />

      {/* SVG Arc Ring */}
      <View style={styles.svgContainer}>
        <Svg width={GAUGE_SIZE} height={GAUGE_SIZE}>
          {/* Background track */}
          <Circle
            cx={GAUGE_SIZE / 2}
            cy={GAUGE_SIZE / 2}
            r={RADIUS}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={STROKE_WIDTH}
            fill="transparent"
          />
          {/* Animated progress arc */}
          <AnimatedCircle
            cx={GAUGE_SIZE / 2}
            cy={GAUGE_SIZE / 2}
            r={RADIUS}
            strokeWidth={STROKE_WIDTH}
            fill="transparent"
            strokeDasharray={CIRCUMFERENCE}
            strokeLinecap="round"
            rotation="-90"
            origin={`${GAUGE_SIZE / 2}, ${GAUGE_SIZE / 2}`}
            animatedProps={animatedCircleProps}
          />
        </Svg>
      </View>

      {/* Center content */}
      <View style={styles.centerContent}>
        <Animated.Text style={[styles.scoreText, scoreTextStyle]}>
          {Math.round(currentScore)}
        </Animated.Text>
        <Text style={styles.labelText}>QoE</Text>
        <Text style={[styles.trendText, { color: trendColor }]}>{trendIcon}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: GAUGE_SIZE,
    height: GAUGE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: GAUGE_SIZE / 2,
  },
  svgContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  labelText: {
    fontSize: 8,
    fontWeight: '600',
    color: '#94a3b8',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: -2,
  },
  trendText: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
});
