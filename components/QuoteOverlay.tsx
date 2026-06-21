/**
 * QuoteOverlay — full-screen "alarm card" for iOS, styled to match the Android lock-screen alarm
 * (EeisAlarmActivity): EEIS logo + prayer name, BEGINS / JAMA'AT times, the Quran/Hadith quote,
 * Pause/Stop controls while the adhan plays, and footer shortcuts (Give / Gift Aid / Qibla /
 * World). iOS can't show the Android lock-screen takeover, so this is the in-app equivalent shown
 * when an alarm arrives while the app is open or when the app is opened from a prayer notification.
 *
 * Shows the quote section only when the prayer has Quotes enabled (`withQuote`); otherwise just the
 * prayer name + times. Every button is operative.
 */
import React from 'react';
import {
  View, Text, Image, Modal, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/theme';
import { sp } from '../constants/scaling';
import type { Quote } from '../data/quotes';

const AMBER = '#FFC107';

type QuoteContext = { name?: string; begins?: string; jamaat?: string };

type Props = {
  visible:    boolean;
  quote:      Quote | null;
  context?:   QuoteContext | null;
  withQuote?: boolean;
  isPlaying?: boolean;
  isPaused?:  boolean;
  onPause?:   () => void;   // toggles pause / resume
  onStop?:    () => void;
  onClose:    () => void;
  onGive?:    () => void;
  onGiftAid?: () => void;
  onQibla?:   () => void;
  onWorld?:   () => void;
};

export function QuoteOverlay({
  visible, quote, context, withQuote = true, isPlaying, isPaused,
  onPause, onStop, onClose, onGive, onGiftAid, onQibla, onWorld,
}: Props) {
  if (!visible) return null;

  const showQuoteSection = withQuote && !!quote;
  const name = (context?.name ?? '').replace(/[^\x00-\x7F]/g, '').trim().toUpperCase() || 'PRAYER';

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>

          {/* Close (X) — always available to dismiss the card */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 14, left: 14, right: 14, bottom: 14 }}>
            <Text style={styles.closeX}>✕</Text>
          </TouchableOpacity>

          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Header: logo + prayer name */}
            <View style={styles.headerRow}>
              <View style={styles.logoTile}>
                <Image source={require('../assets/logo.png')} style={styles.logo} resizeMode="contain" />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.prayerName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{name}</Text>
                <Text style={styles.prayerSub}>Prayer Time</Text>
              </View>
            </View>

            {/* BEGINS / JAMA'AT */}
            {(!!context?.begins || !!context?.jamaat) && (
              <View style={styles.timesRow}>
                <View style={styles.timeCol}>
                  <Text style={styles.timeLabelAmber}>BEGINS</Text>
                  <Text style={styles.timeAmber}>{context?.begins || '—'}</Text>
                </View>
                <View style={styles.timeDivider} />
                <View style={styles.timeCol}>
                  <Text style={styles.timeLabelWhite}>JAMA'AT</Text>
                  <Text style={styles.timeWhite}>{context?.jamaat || '—'}</Text>
                </View>
              </View>
            )}

            <View style={styles.hr} />

            {/* Quote */}
            {showQuoteSection && quote && (
              <View style={styles.quoteWrap}>
                {!!quote.arabic && <Text style={styles.arabic}>{quote.arabic}</Text>}
                <Text style={styles.quoteText}>{`“${quote.text}”`}</Text>
                {!!quote.reference && <Text style={styles.reference}>— {quote.reference}</Text>}
              </View>
            )}
          </ScrollView>

          {/* Pause / Stop while the adhan is playing */}
          {isPlaying && (
            <View style={styles.controls}>
              <TouchableOpacity style={[styles.ctrlBtn, styles.pauseBtn]} onPress={onPause} activeOpacity={0.8}>
                <Text style={styles.ctrlIcon}>{isPaused ? '▶' : '❚❚'}</Text>
                <Text style={styles.ctrlLabel}>{isPaused ? 'RESUME' : 'PAUSE'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.ctrlBtn, styles.stopBtn]} onPress={onStop} activeOpacity={0.8}>
                <Text style={styles.ctrlIcon}>■</Text>
                <Text style={styles.ctrlLabel}>STOP</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Large, always-available Close button (clear for poor eyesight). Pause/Stop above are
              for the adhan audio; this closes the card whether or not anything is playing. */}
          <TouchableOpacity style={styles.bigClose} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.bigCloseText}>✕  Close</Text>
          </TouchableOpacity>

          {/* Footer shortcuts */}
          <View style={styles.footer}>
            <FooterPill emoji="❤️" label="Give"     onPress={onGive} />
            <FooterPill emoji="🧾" label="Gift Aid" onPress={onGiftAid} />
            <FooterPill emoji="🧭" label="Qibla"    onPress={onQibla} />
            <FooterPill emoji="🌍" label="World"    onPress={onWorld} />
          </View>

        </SafeAreaView>
      </View>
    </Modal>
  );
}

function FooterPill({ emoji, label, onPress }: { emoji: string; label: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.pill} onPress={onPress} activeOpacity={0.7} disabled={!onPress}>
      <Text style={styles.pillEmoji}>{emoji}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.blueDeep },
  safe: { flex: 1 },
  closeBtn: { position: 'absolute', top: sp(8), right: sp(14), zIndex: 5, padding: 6 },
  closeX:   { color: 'rgba(255,255,255,0.85)', fontSize: sp(26), fontWeight: '800' },

  scroll: { paddingHorizontal: sp(20), paddingTop: sp(20), paddingBottom: sp(10), flexGrow: 1 },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: sp(14) },
  logoTile: {
    width: sp(64), height: sp(64), borderRadius: sp(16), backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  logo: { width: '88%', height: '88%' },
  headerText: { flex: 1 },
  prayerName: { color: '#FFFFFF', fontSize: sp(34), fontWeight: '800', letterSpacing: 0.5 },
  prayerSub:  { color: 'rgba(255,255,255,0.75)', fontSize: sp(15), fontWeight: '600', marginTop: 2 },

  timesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: sp(22) },
  timeCol: { flex: 1, alignItems: 'center' },
  timeDivider: { width: 1, height: sp(54), backgroundColor: 'rgba(255,255,255,0.25)' },
  timeLabelAmber: { color: AMBER, fontSize: sp(14), fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  timeLabelWhite: { color: 'rgba(255,255,255,0.85)', fontSize: sp(14), fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  timeAmber: { color: AMBER, fontSize: sp(40), fontWeight: '800' },
  timeWhite: { color: '#FFFFFF', fontSize: sp(40), fontWeight: '800' },

  hr: { height: 1, backgroundColor: 'rgba(255,255,255,0.18)', marginVertical: sp(20) },

  quoteWrap: { alignItems: 'center', paddingHorizontal: sp(4) },
  arabic:    { color: '#FFFFFF', fontSize: sp(26), lineHeight: sp(42), textAlign: 'center', marginBottom: sp(14), fontWeight: '600' },
  quoteText: { color: '#FFFFFF', fontSize: sp(23), lineHeight: sp(34), textAlign: 'center', fontStyle: 'italic', fontWeight: '600' },
  reference: { color: 'rgba(255,255,255,0.8)', fontSize: sp(19), fontWeight: '700', textAlign: 'center', marginTop: sp(16) },

  controls: { flexDirection: 'row', justifyContent: 'center', gap: sp(48), marginBottom: sp(14) },
  ctrlBtn: { width: sp(96), height: sp(96), borderRadius: sp(48), alignItems: 'center', justifyContent: 'center', elevation: 4 },
  pauseBtn: { backgroundColor: Colors.deepBlue },
  stopBtn:  { backgroundColor: Colors.maroonRed },
  ctrlIcon: { color: AMBER, fontSize: sp(22), fontWeight: '900', marginBottom: 4 },
  ctrlLabel:{ color: '#FFFFFF', fontSize: sp(14), fontWeight: '800', letterSpacing: 0.5 },

  bigClose: {
    alignSelf: 'center', marginBottom: sp(14),
    paddingHorizontal: sp(46), paddingVertical: sp(15), borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.55)',
  },
  bigCloseText: { color: '#FFFFFF', fontSize: sp(20), fontWeight: '800', letterSpacing: 0.5 },

  footer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: sp(12), paddingBottom: sp(6), paddingTop: sp(4) },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 22,
    paddingHorizontal: sp(14), paddingVertical: sp(10),
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  pillEmoji: { fontSize: sp(16) },
  pillLabel: { color: '#FFFFFF', fontSize: sp(14), fontWeight: '700' },
});
