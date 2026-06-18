/**
 * WhiteFlash — flashes the screen white 3× when `trigger` changes.
 *
 * Rendered inside a transparent Modal so it appears ABOVE everything (including any open
 * screen such as Alerts), otherwise the flash is hidden behind the current screen.
 *
 * IMPORTANT (iOS): this only works while the app is OPEN. When the iPhone is locked the app's
 * code does not run, so iOS shows only the notification — a screen flash on the lock screen is
 * impossible on iOS (same platform limit as the torch flash and full-screen alarm). On Android
 * the native alarm screen handles the locked-screen flash.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, StyleSheet } from 'react-native';

export function WhiteFlash({ trigger }: { trigger: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!trigger) return;
    setVisible(true);
    const pulse = () =>
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 130, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 130, useNativeDriver: true }),
      ]);
    Animated.sequence([pulse(), Animated.delay(90), pulse(), Animated.delay(90), pulse()]).start(
      () => setVisible(false),
    );
  }, [trigger, opacity]);

  if (!visible) return null;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { backgroundColor: '#FFFFFF', opacity }]}
      />
    </Modal>
  );
}
