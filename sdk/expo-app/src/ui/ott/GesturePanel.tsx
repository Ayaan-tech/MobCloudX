import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { BRAND_FONTS, OTT_COLORS } from '../../theme/brand';

export function GesturePanel({
  title,
  subtitle,
  defaultExpanded = true,
  style,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultExpanded?: boolean;
  style?: ViewStyle;
  children: React.ReactNode;
}): JSX.Element {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const panY = useRef(new Animated.Value(0)).current;

  const settle = (nextExpanded?: boolean) => {
    if (typeof nextExpanded === 'boolean') {
      setExpanded(nextExpanded);
    }

    Animated.spring(panY, {
      toValue: 0,
      speed: 22,
      bounciness: 4,
      useNativeDriver: true,
    }).start();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 7,
        onPanResponderMove: (_, gesture) => {
          const clamped = Math.max(-48, Math.min(48, gesture.dy));
          panY.setValue(clamped);
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 28) {
            settle(false);
            return;
          }

          if (gesture.dy < -28) {
            settle(true);
            return;
          }

          settle();
        },
        onPanResponderTerminate: () => settle(),
      }),
    [panY]
  );

  return (
    <Animated.View
      style={[
        styles.panel,
        style,
        {
          transform: [{ translateY: panY }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <Pressable style={styles.header} onPress={() => setExpanded((current) => !current)}>
        <View>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <Text style={styles.toggle}>{expanded ? 'Collapse' : 'Expand'}</Text>
      </Pressable>
      <View style={styles.grip} />
      {expanded ? <View style={styles.body}>{children}</View> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: OTT_COLORS.borderBright,
    backgroundColor: 'rgba(8, 22, 46, 0.9)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    color: OTT_COLORS.textPrimary,
    fontSize: 16,
    fontFamily: BRAND_FONTS.displayBold,
  },
  subtitle: {
    marginTop: 3,
    color: OTT_COLORS.textMuted,
    fontSize: 12,
    fontFamily: BRAND_FONTS.bodyRegular,
  },
  toggle: {
    color: OTT_COLORS.accent,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontFamily: BRAND_FONTS.bodyBold,
  },
  grip: {
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 10,
    width: 48,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.46)',
  },
  body: {
    gap: 10,
  },
});
