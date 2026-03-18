// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — QoE Overlay (User Mode)
// Floating overlay with gauge + network indicator + toast
// ─────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { QoEGauge } from './qoe-gauge';
import { NetworkIndicator } from './network-indicator';
import { AdaptationToast } from './adaptation-toast';

export function QoEOverlay() {
  const [collapsed, setCollapsed] = useState(false);
  const scale = useSharedValue(1);

  const toggleCollapse = () => {
    setCollapsed((prev) => !prev);
    scale.value = withSpring(collapsed ? 1 : 0.5, {
      damping: 12,
      stiffness: 200,
    });
  };

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.overlayContainer} pointerEvents="box-none">
      {/* Floating gauge — top right */}
      <Pressable onPress={toggleCollapse}>
        <Animated.View style={[styles.gaugeContainer, containerStyle]}>
          <QoEGauge />
          {!collapsed && (
            <View style={styles.networkContainer}>
              <NetworkIndicator />
            </View>
          )}
        </Animated.View>
      </Pressable>

      {/* Adaptation toast — bottom center */}
      {!collapsed && (
        <View style={styles.toastContainer}>
          <AdaptationToast />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 12,
  },
  gaugeContainer: {
    alignSelf: 'flex-end',
    alignItems: 'center',
    gap: 4,
  },
  networkContainer: {
    marginTop: 2,
  },
  toastContainer: {
    alignSelf: 'center',
    marginBottom: 8,
  },
});
