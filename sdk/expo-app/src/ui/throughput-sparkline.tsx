// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Network Throughput Sparkline
// Mini SVG line chart that shows throughput over a rolling window
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

const MAX_POINTS = 20;
const CHART_W = 140;
const CHART_H = 36;

interface ThroughputSparklineProps {
  currentMbps: number;
}

export function ThroughputSparkline({ currentMbps }: ThroughputSparklineProps) {
  const historyRef = useRef<number[]>([]);
  const [pathD, setPathD] = useState('');
  const [areaD, setAreaD] = useState('');

  useEffect(() => {
    const h = historyRef.current;
    h.push(currentMbps);
    if (h.length > MAX_POINTS) h.shift();

    if (h.length < 2) {
      setPathD('');
      setAreaD('');
      return;
    }

    const maxVal = Math.max(...h, 0.1);
    const stepX = CHART_W / (MAX_POINTS - 1);

    const points = h.map((v, i) => ({
      x: i * stepX,
      y: CHART_H - (v / maxVal) * (CHART_H - 4) - 2,
    }));

    // Smooth bezier path
    let line = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      line += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    setPathD(line);

    // Area fill (path + close to bottom)
    const last = points[points.length - 1];
    const area = `${line} L ${last.x} ${CHART_H} L ${points[0].x} ${CHART_H} Z`;
    setAreaD(area);
  }, [currentMbps]);

  return (
    <View style={styles.container}>
      <View style={styles.chartContainer}>
        <Svg width={CHART_W} height={CHART_H}>
          <Defs>
            <LinearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#22d3ee" stopOpacity={0.3} />
              <Stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {areaD ? (
            <Path d={areaD} fill="url(#sparkFill)" />
          ) : null}
          {pathD ? (
            <Path
              d={pathD}
              stroke="#22d3ee"
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
        </Svg>
      </View>
      <Text style={styles.valueText}>
        {currentMbps.toFixed(1)} <Text style={styles.unitText}>Mbps</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-end',
    gap: 4,
  },
  chartContainer: {
    width: CHART_W,
    height: CHART_H,
  },
  valueText: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  unitText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
});
