/**
 * PrayerInfoModal — Hanafi madhab rak'ah breakdown per prayer.
 * Shown when the user taps a prayer name on the main screen.
 */
import React from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView,
} from 'react-native';
import { Colors } from '../constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type RakaatRow = {
  type:          string;   // e.g. "Sunnah Mu'akkadah"
  count:         string;   // e.g. "2" or "2–4"
  timing?:       string;   // e.g. "before Fard"
  note?:         string;   // italic blue helper text
  isHighlight?:  boolean;  // true for Fard rows (maroon)
  isWajib?:      boolean;  // true for Wajib rows (deep blue)
};

type PrayerInfo = {
  emoji:      string;
  title:      string;
  subtitle?:  string;
  rows:       RakaatRow[];
};

// ─── Raka'at data ─────────────────────────────────────────────────────────────

const PRAYER_DATA: Record<string, PrayerInfo> = {
  FAJR: {
    emoji: '🌄',
    title: 'Fajr',
    rows: [
      {
        type: "Sunnah Mu'akkadah",
        count: '2',
        timing: 'before Fard',
        note: 'Strongly emphasised — the Prophet ﷺ never missed these',
      },
      { type: 'Fard', count: '2', isHighlight: true },
      {
        type: 'Tahiyyatul Masjid',
        count: '2',
        note: "Nafl — greet the mosque with 2 rak'ahs before sitting",
      },
    ],
  },

  SHURUQ: {
    emoji: '🌅',
    title: 'Shuruq · Ishraq',
    subtitle:
      'Shuruq marks the END of the Fajr prayer window — pray Fajr before this time.\n\n' +
      'Ishraq is a nafl prayer performed 15–20 minutes after sunrise for those who remained in dhikr after Fajr.',
    rows: [
      {
        type: 'Ishraq',
        count: '2–4',
        note:
          "Nafl — remain in your place after Fajr in dhikr until 15–20 min after sunrise, then pray 2 or 4 rak'ahs",
      },
      {
        type: 'Tahiyyatul Masjid',
        count: '2',
        note: "Nafl — if praying at the mosque, pray before sitting",
      },
    ],
  },

  DHUHR: {
    emoji: '☀️',
    title: 'Dhuhr',
    rows: [
      { type: "Sunnah Mu'akkadah", count: '4', timing: 'before Fard' },
      { type: 'Fard', count: '4', isHighlight: true },
      { type: "Sunnah Mu'akkadah", count: '2', timing: 'after Fard' },
      { type: 'Nafl', count: '2', timing: 'after Sunnah' },
      {
        type: 'Tahiyyatul Masjid',
        count: '2',
        note: "Nafl — if praying at the mosque",
      },
    ],
  },

  ASR: {
    emoji: '🌤️',
    title: 'Asr',
    rows: [
      {
        type: "Sunnah Ghair Mu'akkadah",
        count: '4',
        timing: 'before Fard',
        note: 'Optional but rewarding',
      },
      { type: 'Fard', count: '4', isHighlight: true },
      {
        type: 'Tahiyyatul Masjid',
        count: '2',
        note: "Nafl — if praying at the mosque",
      },
    ],
  },

  MAGHRIB: {
    emoji: '🌇',
    title: 'Maghrib',
    rows: [
      { type: 'Fard', count: '3', isHighlight: true },
      { type: "Sunnah Mu'akkadah", count: '2', timing: 'after Fard' },
      { type: 'Nafl', count: '2', timing: 'after Sunnah' },
      {
        type: 'Tahiyyatul Masjid',
        count: '2',
        note: "Nafl — if praying at the mosque",
      },
    ],
  },

  ISHA: {
    emoji: '🌙',
    title: 'Isha',
    rows: [
      {
        type: "Sunnah Ghair Mu'akkadah",
        count: '4',
        timing: 'before Fard',
        note: 'Optional but rewarding',
      },
      { type: 'Fard', count: '4', isHighlight: true },
      { type: "Sunnah Mu'akkadah", count: '2', timing: 'after Fard' },
      { type: 'Nafl', count: '2', timing: 'after Sunnah' },
      {
        type: 'Witr',
        count: '3',
        isWajib: true,
        note:
          "Wajib — prayed last, after all Sunnahs. Third rak'ah includes Du'a Qunoot. Must be prayed before Fajr.",
      },
      {
        type: 'Tahiyyatul Masjid',
        count: '2',
        note: "Nafl — if praying at the mosque",
      },
      {
        type: 'Tahajjud',
        count: '2–12',
        note:
          "Nafl — any even number of rak'ahs. Prayed after sleeping, in the last third of the night before Fajr. Highly virtuous.",
      },
    ],
  },

  JUMMAH: {
    emoji: '🕌',
    title: "Jumu'ah · Friday Dhuhr",
    subtitle:
      "Jumu'ah replaces Dhuhr on Fridays. Obligatory (Fard) for adult Muslim men. Women may pray Dhuhr at home.",
    rows: [
      {
        type: "Sunnah Mu'akkadah",
        count: '4',
        timing: 'before the Khutbah (sermon)',
      },
      { type: 'Fard (with Imam)', count: '2', isHighlight: true },
      { type: "Sunnah Mu'akkadah", count: '4', timing: 'after Fard' },
      { type: "Sunnah Mu'akkadah", count: '2', timing: 'after the 4 Sunnah' },
      {
        type: 'Tahiyyatul Masjid',
        count: '2',
        note: "Nafl — if you enter the mosque before the Khutbah begins",
      },
    ],
  },
};

const DEFINITIONS =
  "Fard — Obligatory. Intentionally missing is a major sin.\n" +
  "Wajib — Near-obligatory. Intentionally missing requires sincere repentance.\n" +
  "Sunnah Mu'akkadah (SM) — Strongly emphasised. Regularly skipping is disliked.\n" +
  "Sunnah Ghair Mu'akkadah (SGM) — Recommended but not strongly emphasised.\n" +
  "Nafl — Voluntary. Extra reward; no sin for omitting.\n" +
  "Tahiyyatul Masjid — 'Greeting of the mosque': 2 Nafl prayed before sitting.\n" +
  "Ishraq — 2–4 Nafl after staying in dhikr from Fajr until 15–20 min post-sunrise.\n" +
  "Tahajjud — Night voluntary prayer; best in the last third of the night.\n" +
  "Witr — 3 rak'ahs (Hanafi position: Wajib), prayed after Isha Sunnah.";

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  visible:     boolean;
  prayerName:  string;   // 'FAJR' | 'SHURUQ' | 'DHUHR' | 'ASR' | 'MAGHRIB' | 'ISHA' | 'JUMMAH'
  onClose:     () => void;
  fontsLoaded: boolean;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function PrayerInfoModal({ visible, prayerName, onClose, fontsLoaded }: Props) {
  const bold = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;
  const med  = fontsLoaded ? 'Poppins_500Medium'   : undefined;

  const key  = prayerName.toUpperCase();
  const info = PRAYER_DATA[key];

  if (!info) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerEmoji}>{info.emoji}</Text>
          <View style={styles.headerText}>
            <Text style={[styles.headerTitle, { fontFamily: bold }]}>{info.title}</Text>
            <Text style={[styles.headerSub, { fontFamily: reg }]}>
              Hanafi Madhab · Rak'ahs
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
          >
            <Text style={[styles.closeBtn, { fontFamily: bold }]}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Subtitle / context */}
          {info.subtitle && (
            <View style={styles.subtitleBox}>
              <Text style={[styles.subtitleText, { fontFamily: med }]}>
                {info.subtitle}
              </Text>
            </View>
          )}

          {/* Rak'ah table */}
          <View style={styles.card}>
            {/* Table header */}
            <View style={styles.tableHead}>
              <Text style={[styles.tableHeadCell, { fontFamily: bold, flex: 3 }]}>
                Type
              </Text>
              <Text style={[styles.tableHeadCell, { fontFamily: bold, width: 44, textAlign: 'center' }]}>
                Rak.
              </Text>
            </View>

            {info.rows.map((row, i) => (
              <View
                key={i}
                style={[
                  styles.tableRow,
                  row.isHighlight && styles.tableRowFard,
                  row.isWajib    && styles.tableRowWajib,
                  i < info.rows.length - 1 && styles.tableRowBorder,
                ]}
              >
                {/* Left: type + timing + note */}
                <View style={{ flex: 3 }}>
                  <Text style={[
                    styles.rowType,
                    { fontFamily: row.isHighlight || row.isWajib ? bold : semi },
                    row.isHighlight && { color: Colors.maroonRed },
                    row.isWajib    && { color: '#1A5F7A' },
                  ]}>
                    {row.type}
                  </Text>
                  {row.timing && (
                    <Text style={[styles.rowTiming, { fontFamily: reg }]}>
                      {row.timing}
                    </Text>
                  )}
                  {row.note && (
                    <Text style={[styles.rowNote, { fontFamily: reg }]}>
                      {row.note}
                    </Text>
                  )}
                </View>

                {/* Right: count */}
                <View style={styles.countCell}>
                  <Text style={[
                    styles.countNum,
                    { fontFamily: bold },
                    row.isHighlight && { color: Colors.maroonRed },
                    row.isWajib    && { color: '#1A5F7A' },
                  ]}>
                    {row.count}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Key terms */}
          <View style={styles.defsCard}>
            <Text style={[styles.defsTitle, { fontFamily: bold }]}>📖 Key Terms</Text>
            <Text style={[styles.defsText, { fontFamily: reg }]}>{DEFINITIONS}</Text>
          </View>

          {/* Close at bottom */}
          <TouchableOpacity style={styles.closeBottom} onPress={onClose}>
            <Text style={[styles.closeBottomText, { fontFamily: bold }]}>Close</Text>
          </TouchableOpacity>

          <View style={{ height: 8 }} />
        </ScrollView>

      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.blueDeep,
    gap: 12,
  },
  headerEmoji: {
    fontSize: 28,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
  },
  closeBtn: {
    fontSize: 18,
    color: '#FFFFFF',
    padding: 6,
  },

  scroll: { flex: 1 },
  scrollContent: {
    padding: 16,
    gap: 12,
  },

  subtitleBox: {
    backgroundColor: '#FFF8E7',
    borderRadius: 10,
    padding: 13,
    borderLeftWidth: 4,
    borderLeftColor: '#F0A500',
  },
  subtitleText: {
    fontSize: 13,
    color: '#7A4A00',
    lineHeight: 20,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  tableHead: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: Colors.blueDeep,
  },
  tableHeadCell: {
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  tableRowFard: {
    backgroundColor: '#FFF5F5',
  },
  tableRowWajib: {
    backgroundColor: '#F0F8FF',
  },
  tableRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  rowType: {
    fontSize: 14,
    color: Colors.ink,
    lineHeight: 19,
  },
  rowTiming: {
    fontSize: 11,
    color: Colors.inkMute,
    marginTop: 1,
  },
  rowNote: {
    fontSize: 11,
    color: Colors.deepBlue,
    marginTop: 3,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  countCell: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
  },
  countNum: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.deepBlue,
  },

  defsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  defsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.maroonRed,
    marginBottom: 8,
  },
  defsText: {
    fontSize: 12,
    color: Colors.ink,
    lineHeight: 20,
  },

  closeBottom: {
    alignSelf: 'center',
    backgroundColor: Colors.deepBlue,
    paddingHorizontal: 40,
    paddingVertical: 13,
    borderRadius: 28,
    marginTop: 4,
    marginBottom: 8,
  },
  closeBottomText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
