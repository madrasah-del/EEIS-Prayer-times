/**
 * WhiteFlash — flashes the screen white 3× when `trigger` changes.
 *
 * On iOS the camera/torch flash is unavailable, so when a prayer alert with "Flash" enabled
 * arrives while the app is OPEN, we flash the screen white instead (the only screen-flash iOS
 * permits — it can't take over the screen from the background/lock screen).
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

export function WhiteFlash({ trigger }: { trigger: number }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!trigger) return;
    const pulse = () =>
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 130, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 130, useNativeDriver: true }),
      ]);
    Animated.sequence([pulse(), Animated.delay(90), pulse(), Animated.delay(90), pulse()]).start();
  }, [trigger, opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, { backgroundColor: '#FFFFFF', opacity, zIndex: 9999 }]}
    />
  );
}
