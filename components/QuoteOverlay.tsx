/**
 * QuoteOverlay — a floating, closable box that shows the CURRENT Quran/Hadith quote in full,
 * statically, at a large readable font near the top of the screen (so the prayer times stay
 * visible behind it).
 *
 * Why it exists: iOS notifications truncate the quote and the scrolling green bar may move on
 * before it can be read. Tapping the green bar — or opening the app from a prayer notification —
 * shows the full quote here so it can be read at leisure. If the adhan is playing, a pulsating
 * Stop button is shown so the user can silence it from the same screen.
 */
import React, { useEffect, useRef } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, Animated, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/theme';
import { sp } from '../constants/scaling';
import type { Quote } from '../data/quotes';

type Props = {
  visible:   boolean;
  quote:     Quote | null;
  isPlaying?: boolean;
  onStop?:   () => void;
  onClose:   () => void;
};

export function QuoteOverlay({ visible, quote, isPlaying, onStop, onClose }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible && isPlaying) {
      const loop = Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 550, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 550, useNativeDriver: true }),
      ]));
      loop.start();
      return () => loop.stop();
    }
    pulse.setValue(1);
  }, [visible, isPlaying, pulse]);

  if (!visible || !quote) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {/* Tap the dimmed background to close. */}
      <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={onClose}>
        <SafeAreaView style={styles.safe} edges={['top']}>
          {/* Card — stop the tap from bubbling to the scrim so taps inside don't close it. */}
          <TouchableOpacity activeOpacity={1} style={styles.card} onPress={() => {}}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 12, left: 12, right: 12, bottom: 12 }}>
              <Text style={styles.closeX}>✕</Text>
            </TouchableOpacity>

            <Text style={styles.kicker}>QURAN · HADITH</Text>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollInner} showsVerticalScrollIndicator={false}>
              {!!quote.arabic && <Text style={styles.arabic}>{quote.arabic}</Text>}
              <Text style={styles.body}>{`“${quote.text}”`}</Text>
              {!!quote.reference && <Text style={styles.reference}>— {quote.reference}</Text>}
            </ScrollView>

            {isPlaying && onStop && (
              <Animated.View style={{ transform: [{ scale: pulse }], marginTop: 18 }}>
                <TouchableOpacity style={styles.stopBtn} onPress={onStop} activeOpacity={0.85}>
                  <Text style={styles.stopText}>⏹  Stop</Text>
                </TouchableOpacity>
              </Animated.View>
            )}

            <TouchableOpacity style={styles.dismissBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.dismissText}>Close</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </SafeAreaView>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  safe:  { flex: 1, alignItems: 'center' },
  card: {
    marginTop: sp(70),
    width: '92%',
    maxHeight: '70%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingTop: sp(34),
    paddingBottom: sp(20),
    paddingHorizontal: sp(20),
    alignItems: 'center',
    borderTopWidth: 6,
    borderTopColor: Colors.freshGreen,
    elevation: 8,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  closeBtn: { position: 'absolute', top: 10, right: 12, padding: 4, zIndex: 2 },
  closeX:   { color: Colors.inkMute, fontSize: sp(22), fontWeight: '800' },
  kicker:   { color: Colors.freshGreen, fontSize: sp(12), fontWeight: '800', letterSpacing: 1.5, marginBottom: 10 },
  scroll:   { alignSelf: 'stretch' },
  scrollInner: { alignItems: 'center', paddingVertical: 4 },
  arabic:   { color: Colors.ink, fontSize: sp(26), lineHeight: sp(40), textAlign: 'center', marginBottom: 14, fontWeight: '600' },
  body:     { color: Colors.ink, fontSize: sp(22), lineHeight: sp(31), textAlign: 'center', fontWeight: '700' },
  reference:{ color: Colors.maroonRed, fontSize: sp(16), fontWeight: '700', textAlign: 'center', marginTop: 14 },
  stopBtn:  {
    backgroundColor: Colors.maroonRed, paddingHorizontal: sp(34), paddingVertical: sp(12), borderRadius: 30,
  },
  stopText: { color: '#FFFFFF', fontSize: sp(18), fontWeight: '800', letterSpacing: 0.5 },
  dismissBtn: { marginTop: 16, paddingHorizontal: sp(28), paddingVertical: sp(10), borderRadius: 24, backgroundColor: '#EFEFEF' },
  dismissText: { color: Colors.ink, fontSize: sp(15), fontWeight: '700' },
});
