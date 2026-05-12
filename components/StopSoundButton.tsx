import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, Text, StyleSheet, Animated } from 'react-native';

type Props = {
  visible: boolean;
  onStop: () => void;
  fontsLoaded: boolean;
};

export function StopSoundButton({ visible, onStop, fontsLoaded }: Props) {
  const bold      = fontsLoaded ? 'Poppins_700Bold' : undefined;
  const opacity   = useRef(new Animated.Value(0)).current;
  const scale     = useRef(new Animated.Value(0.7)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseRef  = useRef<Animated.CompositeAnimation | null>(null);

  // Enter / exit animation
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(opacity, { toValue: 1, speed: 20, bounciness: 6, useNativeDriver: true }),
        Animated.spring(scale,   { toValue: 1, speed: 18, bounciness: 8, useNativeDriver: true }),
      ]).start(() => {
        // Start pulsing once fully visible
        pulseRef.current = Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, { toValue: 1.14, duration: 550, useNativeDriver: true }),
            Animated.timing(pulseAnim, { toValue: 1.0,  duration: 550, useNativeDriver: true }),
          ]),
        );
        pulseRef.current.start();
      });
    } else {
      pulseRef.current?.stop();
      pulseAnim.setValue(1);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.spring(scale,   { toValue: 0.7, speed: 20, bounciness: 0, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.wrap, { opacity, transform: [{ scale: Animated.multiply(scale, pulseAnim) }] }]}>
      <TouchableOpacity style={styles.btn} onPress={onStop} activeOpacity={0.8}>
        <Text style={styles.icon}>⏹</Text>
        <Text style={[styles.label, { fontFamily: bold }]}>Stop</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    // Centred on screen — sits mid-screen so it's unmissable
    alignSelf: 'center',
    top: '40%',
    zIndex: 999,
    shadowColor: '#E0132C',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    elevation: 20,
  },
  btn: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#E0132C',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  icon: {
    fontSize: 28,
    color: '#FFFFFF',
  },
  label: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
