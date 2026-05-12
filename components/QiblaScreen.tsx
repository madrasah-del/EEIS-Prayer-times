/**
 * QiblaScreen — native compass pointing to Mecca.
 *
 * Direction source: calculated locally from device GPS coordinates using
 * the spherical bearing formula to the Kaaba (21.4225°N, 39.8262°E).
 * No external API, no ads, works fully offline once location is obtained.
 *
 * Compass heading: expo-sensors Magnetometer + manual low-pass filtering.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, Modal, StyleSheet, TouchableOpacity,
  Animated, Easing, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Magnetometer } from 'expo-sensors';
import { Colors } from '../constants/theme';

// ─── Kaaba coordinates ────────────────────────────────────────────────────────
const KAABA_LAT = 21.4225;
const KAABA_LNG = 39.8262;

function toRad(deg: number) { return deg * Math.PI / 180; }
function toDeg(rad: number) { return rad * 180 / Math.PI; }

/** Bearing from (lat, lng) to Kaaba, degrees clockwise from North */
function qiblaBearing(lat: number, lng: number): number {
  const φ1 = toRad(lat);
  const φ2 = toRad(KAABA_LAT);
  const Δλ = toRad(KAABA_LNG - lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Device magnetic heading from raw magnetometer x/y values (portrait mode) */
function magnetoHeading(x: number, y: number): number {
  return (toDeg(Math.atan2(-x, y)) + 360) % 360;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  fontsLoaded: boolean;
};

type Status = 'idle' | 'locating' | 'ready' | 'error';

export function QiblaScreen({ visible, onClose, fontsLoaded }: Props) {
  const bold = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;

  const [status, setStatus]       = useState<Status>('idle');
  const [errorMsg, setErrorMsg]   = useState('');
  const [qiblaDir, setQiblaDir]   = useState<number | null>(null);    // degrees from North
  const [heading, setHeading]     = useState(0);                      // device magnetic heading

  // Animated needle rotation
  const needleAnim = useRef(new Animated.Value(0)).current;
  const prevAngle  = useRef(0);

  // Low-pass filter state for smooth magnetometer
  const lpX = useRef(0);
  const lpY = useRef(0);
  const ALPHA = 0.15; // smoothing factor (lower = smoother but slower)

  // ── Location + Qibla bearing ────────────────────────────────────────────
  const fetchLocation = useCallback(async () => {
    setStatus('locating');
    setErrorMsg('');
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') {
        setErrorMsg('Location permission is required to calculate Qibla direction.');
        setStatus('error');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const dir = qiblaBearing(loc.coords.latitude, loc.coords.longitude);
      setQiblaDir(dir);
      setStatus('ready');
    } catch {
      setErrorMsg('Could not get your location. Please try again.');
      setStatus('error');
    }
  }, []);

  // Start location on open
  useEffect(() => {
    if (visible) {
      setStatus('idle');
      setQiblaDir(null);
      fetchLocation();
    }
  }, [visible]);

  // ── Magnetometer subscription ───────────────────────────────────────────
  useEffect(() => {
    if (!visible || status !== 'ready') return;

    Magnetometer.setUpdateInterval(100);
    const sub = Magnetometer.addListener(({ x, y }) => {
      // Low-pass filter to smooth jitter
      lpX.current = lpX.current + ALPHA * (x - lpX.current);
      lpY.current = lpY.current + ALPHA * (y - lpY.current);
      setHeading(magnetoHeading(lpX.current, lpY.current));
    });

    return () => sub.remove();
  }, [visible, status]);

  // ── Animate needle ──────────────────────────────────────────────────────
  useEffect(() => {
    if (qiblaDir === null) return;

    // Needle points to Qibla relative to current device heading
    let targetAngle = qiblaDir - heading;

    // Shortest-path rotation to avoid 359→1 spinning the long way
    let delta = ((targetAngle - prevAngle.current + 540) % 360) - 180;
    const newAngle = prevAngle.current + delta;
    prevAngle.current = newAngle;

    Animated.timing(needleAnim, {
      toValue: newAngle,
      duration: 200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [heading, qiblaDir]);

  const needleRotate = needleAnim.interpolate({
    inputRange: [-360, 360],
    outputRange: ['-360deg', '360deg'],
  });

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.dragHandle} />
          <View style={styles.headerRow}>
            <Text style={[styles.title, { fontFamily: bold }]}>🧭 Qibla Direction</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <Text style={[styles.closeBtn, { fontFamily: bold }]}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.subtitle, { fontFamily: reg }]}>
            Direction to the Kaaba, Mecca
          </Text>
        </View>

        <View style={styles.body}>

          {/* Locating */}
          {(status === 'idle' || status === 'locating') && (
            <View style={styles.centreBox}>
              <Text style={styles.bigIcon}>📍</Text>
              <Text style={[styles.stateText, { fontFamily: semi }]}>Finding your location…</Text>
              <Text style={[styles.stateSub, { fontFamily: reg }]}>
                Allow location access when prompted
              </Text>
            </View>
          )}

          {/* Error */}
          {status === 'error' && (
            <View style={styles.centreBox}>
              <Text style={styles.bigIcon}>⚠️</Text>
              <Text style={[styles.stateText, { fontFamily: semi }]}>{errorMsg}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={fetchLocation} activeOpacity={0.8}>
                <Text style={[styles.retryBtnText, { fontFamily: bold }]}>Try Again</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Compass */}
          {status === 'ready' && qiblaDir !== null && (
            <View style={styles.compassWrap}>

              {/* Compass rose ring */}
              <View style={styles.compassRing}>

                {/* Cardinal labels */}
                <Text style={[styles.cardinal, styles.cardinalN, { fontFamily: bold }]}>N</Text>
                <Text style={[styles.cardinal, styles.cardinalS, { fontFamily: bold }]}>S</Text>
                <Text style={[styles.cardinal, styles.cardinalE, { fontFamily: bold }]}>E</Text>
                <Text style={[styles.cardinal, styles.cardinalW, { fontFamily: bold }]}>W</Text>

                {/* Kaaba needle */}
                <Animated.View style={[styles.needleWrap, { transform: [{ rotate: needleRotate }] }]}>
                  {/* Arrowhead (top = direction to Qibla) */}
                  <View style={styles.needleTop} />
                  {/* Tail */}
                  <View style={styles.needleTail} />
                </Animated.View>

                {/* Centre dot */}
                <View style={styles.centreDot} />
              </View>

              {/* Kaaba icon above compass */}
              <Text style={styles.kaabaIcon}>🕋</Text>

              {/* Degree readout */}
              <Text style={[styles.degreeText, { fontFamily: bold }]}>
                {Math.round(qiblaDir)}°
              </Text>
              <Text style={[styles.degreeSub, { fontFamily: reg }]}>
                from North · point your phone's top toward the arrow
              </Text>

              <View style={styles.infoCard}>
                <Text style={[styles.infoRow, { fontFamily: semi }]}>
                  🕌  Kaaba · Mecca, Saudi Arabia
                </Text>
                <Text style={[styles.infoRow, { fontFamily: reg }]}>
                  21.4225°N  39.8262°E
                </Text>
              </View>

            </View>
          )}

        </View>

        {/* Footer note */}
        <Text style={[styles.footer, { fontFamily: reg }]}>
          Compass accuracy depends on your device's magnetometer.{'\n'}
          Keep away from metal objects for best results.
        </Text>

      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const COMPASS_SIZE = 240;
const NEEDLE_H     = 90;
const NEEDLE_W     = 10;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bgScreen,
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    elevation: 3,
  },
  dragHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#D0D0D0', alignSelf: 'center', marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  title: {
    fontSize: 20, fontWeight: '700', color: Colors.maroonRed,
  },
  closeBtn: {
    fontSize: 18, color: Colors.inkMute,
  },
  subtitle: {
    fontSize: 13, color: Colors.inkMute, marginTop: 4,
  },

  body: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24,
  },

  // State screens
  centreBox: {
    alignItems: 'center', gap: 12,
  },
  bigIcon: { fontSize: 52 },
  stateText: {
    fontSize: 16, fontWeight: '600', color: Colors.ink, textAlign: 'center',
  },
  stateSub: {
    fontSize: 13, color: Colors.inkMute, textAlign: 'center',
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: Colors.deepBlue,
    borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12,
  },
  retryBtnText: {
    color: '#FFFFFF', fontSize: 14, fontWeight: '700',
  },

  // Compass
  compassWrap: {
    alignItems: 'center', gap: 10,
  },
  kaabaIcon: {
    fontSize: 36, marginBottom: -4,
  },
  compassRing: {
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    borderRadius: COMPASS_SIZE / 2,
    borderWidth: 3,
    borderColor: Colors.deepBlue,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
    position: 'relative',
  },

  // Cardinals
  cardinal: {
    position: 'absolute',
    fontSize: 13,
    fontWeight: '700',
    color: Colors.deepBlue,
  },
  cardinalN: { top: 8, alignSelf: 'center' },
  cardinalS: { bottom: 8, alignSelf: 'center' },
  cardinalE: { right: 12, top: COMPASS_SIZE / 2 - 9 },
  cardinalW: { left: 12,  top: COMPASS_SIZE / 2 - 9 },

  // Needle
  needleWrap: {
    position: 'absolute',
    width: NEEDLE_W,
    height: NEEDLE_H * 2,
    alignItems: 'center',
  },
  needleTop: {
    width: 0,
    height: 0,
    borderLeftWidth: NEEDLE_W / 2,
    borderRightWidth: NEEDLE_W / 2,
    borderBottomWidth: NEEDLE_H,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: Colors.maroonRed,
  },
  needleTail: {
    width: 0,
    height: 0,
    borderLeftWidth: NEEDLE_W / 2,
    borderRightWidth: NEEDLE_W / 2,
    borderTopWidth: NEEDLE_H,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#B0B0B0',
  },
  centreDot: {
    position: 'absolute',
    width: 14, height: 14,
    borderRadius: 7,
    backgroundColor: Colors.deepBlue,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  // Info
  degreeText: {
    fontSize: 38, fontWeight: '700', color: Colors.maroonRed, marginTop: 4,
  },
  degreeSub: {
    fontSize: 12, color: Colors.inkMute, textAlign: 'center', maxWidth: 260,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    alignItems: 'center',
    gap: 4,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  infoRow: {
    fontSize: 13, color: Colors.ink, textAlign: 'center',
  },

  footer: {
    fontSize: 11, color: Colors.inkMute,
    textAlign: 'center', padding: 16, lineHeight: 17,
  },
});
