// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — QoE Speedometer Gauge
// Half-circle arc gauge with animated needle (red → orange → green)
// Matches the screenshot's dashboard panel design
// ─────────────────────────────────────────────────────────────

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  interpolate,
  interpolateColor,
  Easing,
  useDerivedValue,
} from 'react-native-reanimated';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// ── Geometry ──────────────────────────────────────────────────

const SIZE = 160;
const STROKE = 12;
const CX = SIZE / 2;
const CY = SIZE / 2 + 10; // shift down to center the half-arc
const RADIUS = (SIZE - STROKE * 2) / 2;
const START_ANGLE = 180; // left
const END_ANGLE = 0; // right
const SWEEP = 180; // half circle

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle + 180);
  const end = polarToCartesian(cx, cy, r, startAngle + 180);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

// ── Component ────────────────────────────────────────────────

interface QoESpeedometerProps {
  score: number; // 0–100
  category: string;
  size?: number;
}

export function QoESpeedometer({ score, category, size = SIZE }: QoESpeedometerProps) {
  const progress = useSharedValue(score / 100);

  useEffect(() => {
    progress.value = withTiming(score / 100, {
      duration: 1000,
      easing: Easing.out(Easing.cubic),
    });
  }, [score]);

  // Background arc (full half-circle track)
  const bgArc = arcPath(CX, CY, RADIUS, 0, SWEEP);

  // Animated needle rotation
  const needleStyle = useAnimatedStyle(() => {
    const rotation = interpolate(progress.value, [0, 1], [-90, 90]);
    return {
      transform: [{ rotate: `${rotation}deg` }],
    };
  });

  // Animated score color
  const scoreColor = useDerivedValue(() =>
    interpolateColor(
      progress.value,
      [0, 0.35, 0.6, 0.8, 1],
      ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e']
    )
  );

  const scoreTextStyle = useAnimatedStyle(() => ({
    color: scoreColor.value,
  }));

  return (
    <View style={[styles.container, { width: size, height: size * 0.65 }]}>
      <Svg width={size} height={size * 0.65} viewBox={`0 0 ${SIZE} ${SIZE * 0.65}`}>
        <Defs>
          <LinearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%" stopColor="#ef4444" />
            <Stop offset="30%" stopColor="#f97316" />
            <Stop offset="55%" stopColor="#eab308" />
            <Stop offset="75%" stopColor="#84cc16" />
            <Stop offset="100%" stopColor="#22c55e" />
          </LinearGradient>
        </Defs>

        {/* Background track */}
        <Path
          d={bgArc}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
        />

        {/* Colored arc */}
        <Path
          d={bgArc}
          stroke="url(#gaugeGrad)"
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
        />

        {/* Tick marks */}
        {[0, 25, 50, 75, 100].map((tick) => {
          const angle = (tick / 100) * SWEEP;
          const outer = polarToCartesian(CX, CY, RADIUS + 8, angle + 180);
          const inner = polarToCartesian(CX, CY, RADIUS - 2, angle + 180);
          return (
            <Path
              key={tick}
              d={`M ${outer.x} ${outer.y} L ${inner.x} ${inner.y}`}
              stroke="rgba(255,255,255,0.3)"
              strokeWidth={1.5}
            />
          );
        })}

        {/* Center dot */}
        <Circle cx={CX} cy={CY} r={4} fill="#f8fafc" />
      </Svg>

      {/* Needle overlay */}
      <Animated.View style={[styles.needleContainer, needleStyle]}>
        <View style={styles.needle} />
      </Animated.View>

      {/* Score text */}
      <View style={styles.scoreContainer}>
        <Animated.Text style={[styles.scoreText, scoreTextStyle]}>
          {Math.round(score)}
        </Animated.Text>
      </View>

      {/* Category label */}
      <Text style={styles.categoryLabel}>{category.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  needleContainer: {
    position: 'absolute',
    bottom: 8,
    left: SIZE / 2 - 2,
    width: 4,
    height: RADIUS - 8,
    transformOrigin: 'bottom',
  },
  needle: {
    width: 3,
    height: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: 2,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },
  scoreContainer: {
    position: 'absolute',
    bottom: 0,
    alignItems: 'center',
  },
  scoreText: {
    fontSize: 36,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  categoryLabel: {
    position: 'absolute',
    bottom: -6,
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
});
