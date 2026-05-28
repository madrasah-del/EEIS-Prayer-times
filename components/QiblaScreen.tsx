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
  Animated, Easing, Dimensions, ScrollView, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Magnetometer } from 'expo-sensors';
import { Colors } from '../constants/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
// Scale compass to fit smaller screens (S20 = 360dp wide)
const COMPASS_SIZE = Math.min(Math.round(SCREEN_W * 0.68), 280);

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

  // Animated needle and ring rotation
  const needleAnim = useRef(new Animated.Value(0)).current;
  const ringAnim   = useRef(new Animated.Value(0)).current;
  const prevAngle  = useRef(0);
  const prevRing   = useRef(0);

  // Low-pass filter state for smooth magnetometer
  const lpX = useRef(0);
  const lpY = useRef(0);
  const ALPHA = 0.15; // smoothing factor (lower = smoother but slower)

  const [permDenied, setPermDenied] = useState(false);

  // ── Location + Qibla bearing ────────────────────────────────────────────
  const fetchLocation = useCallback(async () => {
    setStatus('locating');
    setErrorMsg('');
    setPermDenied(false);
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') {
        setErrorMsg('Location permission is required to calculate Qibla direction.');
        setPermDenied(true);
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

  // ── Magnetometer subscription — starts as soon as screen opens, independent of location ──
  useEffect(() => {
    if (!visible) return;

    Magnetometer.setUpdateInterval(100);
    const sub = Magnetometer.addListener(({ x, y }) => {
      // Low-pass filter to smooth jitter
      lpX.current = lpX.current + ALPHA * (x - lpX.current);
      lpY.current = lpY.current + ALPHA * (y - lpY.current);
      setHeading(magnetoHeading(lpX.current, lpY.current));
    });

    return () => sub.remove();
  }, [visible]);

  // ── Animate needle + ring ───────────────────────────────────────────────
  useEffect(() => {
    if (qiblaDir === null) return;

    // Needle: qiblaDir - heading (points to Mecca relative to current orientation)
    let targetAngle = qiblaDir - heading;
    let delta = ((targetAngle - prevAngle.current + 540) % 360) - 180;
    const newAngle = prevAngle.current + delta;
    prevAngle.current = newAngle;

    // Ring: -heading (so N on ring tracks magnetic North)
    let ringTarget = -heading;
    let ringDelta = ((ringTarget - prevRing.current + 540) % 360) - 180;
    const newRing = prevRing.current + ringDelta;
    prevRing.current = newRing;

    Animated.parallel([
      Animated.timing(needleAnim, {
        toValue: newAngle,
        duration: 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(ringAnim, {
        toValue: newRing,
        duration: 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [heading, qiblaDir]);

  const needleRotate = needleAnim.interpolate({
    inputRange: [-720, 720],
    outputRange: ['-720deg', '720deg'],
  });

  const ringRotate = ringAnim.interpolate({
    inputRange: [-720, 720],
    outputRange: ['-720deg', '720deg'],
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

        <ScrollView
          style={styles.scrollBody}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >

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
              {permDenied && (
                <TouchableOpacity
                  style={styles.settingsBtn}
                  onPress={() => Linking.openSettings()}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.settingsBtnText, { fontFamily: semi }]}>Open App Settings</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Compass */}
          {status === 'ready' && qiblaDir !== null && (
            <View style={styles.compassWrap}>

              {/* Fixed Kaaba icon at 12 o'clock — align this with your body when facing Mecca */}
              <View style={styles.fixedKaabaRow}>
                <Text style={styles.fixedKaabaEmoji}>🕋</Text>
                <Text style={[styles.fixedKaabaLabel, { fontFamily: semi }]}>Mecca</Text>
              </View>

              {/* Compass container — ring + needle layered */}
              <View style={[styles.compassOuter, { width: COMPASS_SIZE + 16, height: COMPASS_SIZE + 16 }]}>
                {/* Rotating ring — N/S/E/W rotate with device so N always points to magnetic north */}
                <Animated.View style={[styles.compassRing, {
                  width: COMPASS_SIZE, height: COMPASS_SIZE, borderRadius: COMPASS_SIZE / 2,
                  transform: [{ rotate: ringRotate }],
                }]}>
                  <Text style={[styles.cardinal, styles.cardinalN, { fontFamily: bold }]}>N</Text>
                  <Text style={[styles.cardinal, styles.cardinalS, { fontFamily: bold }]}>S</Text>
                  <Text style={[styles.cardinal, styles.cardinalE, { fontFamily: bold }]}>E</Text>
                  <Text style={[styles.cardinal, styles.cardinalW, { fontFamily: bold }]}>W</Text>
                </Animated.View>

                {/* Needle — rotates by qiblaDir-heading, tip points to Mecca */}
                <Animated.View style={[styles.needleWrap, {
                  height: COMPASS_SIZE - 20,
                  transform: [{ rotate: needleRotate }],
                }]}>
                  {/* Small 🕋 at the needle tip (towards Mecca) */}
                  <Text style={styles.kaabaAtTip}>🕋</Text>
                  {/* Arrow shaft (top half = toward Mecca) */}
                  <View style={styles.needleTop} />
                  {/* Tail */}
                  <View style={styles.needleTail} />
                </Animated.View>

                {/* Centre dot */}
                <View style={styles.centreDot} />
              </View>

              {/* Degree readout */}
              <Text style={[styles.degreeText, { fontFamily: bold }]}>
                {Math.round(qiblaDir)}°
              </Text>
              <Text style={[styles.degreeSub, { fontFamily: reg }]}>
                from North
              </Text>

            </View>
          )}

          {/* Instructions — always visible, scrollable below compass */}
          <View style={styles.footerCard}>
            <Text style={[styles.footerTitle, { fontFamily: semi }]}>📋 How to use</Text>
            <Text style={[styles.footerText, { fontFamily: reg }]}>
              1. Lay your phone <Text style={{ fontWeight: '700' }}>flat and face-up</Text> on a level surface — not tilted or held upright.{'\n'}
              2. <Text style={{ fontWeight: '700' }}>Stand still.</Text> The compass ring spins automatically to track North.{'\n'}
              3. Slowly rotate your body until the 🕋 <Text style={{ fontWeight: '700' }}>needle tip</Text> aligns with the 🕋 <Text style={{ fontWeight: '700' }}>Mecca marker</Text> at the top of the screen.{'\n'}
              4. <Text style={{ fontWeight: '700' }}>You are now facing Mecca.</Text> Pray in that direction.{'\n\n'}
              ⚠️ <Text style={{ fontWeight: '700' }}>Tip:</Text> Move away from metal surfaces (radiators, cars) for the most accurate reading.
            </Text>
          </View>

        </ScrollView>

      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// COMPASS_SIZE is now computed at top of file using Dimensions
const NEEDLE_H     = Math.round(COMPASS_SIZE * 0.35);
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

  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    padding: 24,
    paddingBottom: 32,
  },

  // State screens
  centreBox: {
    alignItems: 'center', gap: 12, width: '100%', paddingVertical: 40,
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
  settingsBtn: {
    marginTop: 8,
    backgroundColor: 'transparent',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.deepBlue,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  settingsBtnText: {
    color: Colors.deepBlue, fontSize: 13, fontWeight: '600',
  },

  // Compass
  compassWrap: {
    alignItems: 'center', gap: 8, width: '100%', marginBottom: 16,
  },

  // Fixed Kaaba at top — alignment target
  fixedKaabaRow: {
    alignItems: 'center', gap: 2, marginBottom: 4,
  },
  fixedKaabaEmoji: {
    fontSize: 40, textAlign: 'center',
  },
  fixedKaabaLabel: {
    fontSize: 14, color: Colors.maroonRed, fontWeight: '600',
  },

  // Outer container for ring + needle (z-stack)
  compassOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  kaabaAtTip: {
    position: 'absolute',
    top: -26,
    fontSize: 20,
    textAlign: 'center',
    alignSelf: 'center',
  },
  compassRing: {
    position: 'absolute',
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
  },

  // Cardinals
  cardinal: {
    position: 'absolute',
    fontSize: Math.round(COMPASS_SIZE * 0.055),
    fontWeight: '700',
    color: Colors.deepBlue,
  },
  cardinalN: { top: 8, alignSelf: 'center' },
  cardinalS: { bottom: 8, alignSelf: 'center' },
  cardinalE: { right: 10, top: COMPASS_SIZE / 2 - 9 },
  cardinalW: { left: 10,  top: COMPASS_SIZE / 2 - 9 },

  // Needle (positioned in the center of compassOuter)
  needleWrap: {
    position: 'absolute',
    width: NEEDLE_W,
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
    fontSize: Math.round(SCREEN_W * 0.09), fontWeight: '700', color: Colors.maroonRed, marginTop: 4,
  },
  degreeSub: {
    fontSize: Math.round(SCREEN_W * 0.032), color: Colors.inkMute, textAlign: 'center',
  },

  // Footer
  footerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12, padding: 14, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  footerTitle: {
    fontSize: Math.round(SCREEN_W * 0.038), fontWeight: '600', color: Colors.deepBlue, marginBottom: 8,
  },
  footerText: {
    fontSize: Math.round(SCREEN_W * 0.033), color: Colors.ink, lineHeight: Math.round(SCREEN_W * 0.052),
  },
});
