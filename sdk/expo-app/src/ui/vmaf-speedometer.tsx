// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — VMAF Speedometer Gauge
// Half-circle arc gauge with animated needle (red → orange → green)
// Matches the screenshot's dashboard panel design
// ─────────────────────────────────────────────────────────────

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  interpolateColor,
  Easing,
  useDerivedValue,
} from 'react-native-reanimated';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

// ── Geometry ──────────────────────────────────────────────────

const SIZE = 160;
const STROKE = 12;
const CX = SIZE / 2;
const CY = SIZE / 2 + 10; // shift down to center the half-arc
const RADIUS = (SIZE - STROKE * 2) / 2;
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

interface VMAFSpeedometerProps {
  score: number; // 0–100
  model?: string;
  size?: number;
}

export function VMAFSpeedometer({ score, model = 'vmaf_v0.6.1', size = SIZE }: VMAFSpeedometerProps) {
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
          <LinearGradient id="vmafGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%" stopColor="#ef4444" />
            <Stop offset="30%" stopColor="#f97316" />
            <Stop offset="55%" stopColor="#eab308" />
            <Stop offset="75%" stopColor="#84cc16" />
            <Stop offset="100%" stopColor="#22c55e" />
          </LinearGradient>
        </Defs>

        {/* Track */}
        <Path d={bgArc} stroke="#1e293b" strokeWidth={STROKE} fill="none" strokeLinecap="round" />

        {/* Color Fill */}
        <Path
          d={bgArc}
          stroke="url(#vmafGrad)"
          strokeWidth={STROKE - 2}
          fill="none"
          strokeLinecap="round"
        />
      </Svg>

      {/* Needle */}
      <View style={[styles.needleTrack, { width: size, top: size * 0.5 - 20 }]}>
        <Animated.View style={[styles.needleAnchor, needleStyle]}>
          <View style={styles.needlePointer} />
          <View style={styles.needleCenter} />
        </Animated.View>
      </View>

      {/* Inner numeric display */}
      <View style={styles.scoreDisplay}>
        <Animated.Text style={[styles.scoreText, scoreTextStyle]}>
          {Number(score).toFixed(0)}
        </Animated.Text>
        <Text style={styles.scoreLabel}>VMAF</Text>
        {model && (
          <Text style={styles.vmafModelText} numberOfLines={1}>{model}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    position: 'relative',
  },
  needleTrack: {
    position: 'absolute',
    alignItems: 'center',
  },
  needleAnchor: {
    width: 20,
    height: 80, // pivot point at bottom
    justifyContent: 'flex-end',
    alignItems: 'center',
    transformOrigin: 'bottom center', // Web support / simulated via style
  },
  needlePointer: {
    width: 4,
    height: 35,
    backgroundColor: '#fff',
    borderRadius: 2,
    marginBottom: -5,
  },
  needleCenter: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: '#0f172a',
  },
  scoreDisplay: {
    position: 'absolute',
    bottom: -15, // Move slightly down outside the SVG
    alignItems: 'center',
  },
  scoreText: {
    fontSize: 28,
    fontFamily: 'SpaceMono-Bold',
    fontWeight: '800',
    marginTop: 0,
    color: '#fff',
  },
  scoreLabel: {
    fontSize: 10,
    color: '#8b9bb4',
    textTransform: 'uppercase',
    fontWeight: '600',
    marginTop: -4,
  },
  vmafModelText: {
    fontSize: 8,
    color: '#64748b',
    marginTop: 2,
  }
});
