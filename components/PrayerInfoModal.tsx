/**
 * PrayerInfoModal — Hanafi madhab rak'ah breakdown per prayer.
 * Shown when the user taps a prayer name on the main screen.
 *
 * v41 changes:
 *  - Tahiyyatul Masjid moved to TOP of every card (performed first on entering mosque)
 *  - Fard rows: red background + red text
 *  - Sunnah Mu'akkadah rows: bold type text
 *  - Nafl / voluntary rows: light-green background
 *  - Wajib rows: blue background
 *  - Note / timing text enlarged (13sp)
 *  - Key Terms section: filtered to only terms present in that prayer card; titles bold+larger
 *  - Ishraq shown only on Shuruq card; Tahajjud+Witr only on Isha card
 *  - Header: extra top padding on Android so title clears the system status bar
 */
import React from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Platform, StatusBar,
} from 'react-native';
import { Colors } from '../constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type RakaatRow = {
  type:                  string;   // e.g. "Sunnah Mu'akkadah"
  count:                 string;   // e.g. "2" or "2–4"
  timing?:               string;   // e.g. "before Fard"
  note?:                 string;   // italic helper text
  isHighlight?:          boolean;  // Fard rows — red
  isWajib?:              boolean;  // Wajib rows — blue
  isSunnahMuakkadah?:    boolean;  // SM rows — bold type
  isNafl?:               boolean;  // Nafl/voluntary rows — light green
};

type PrayerInfo = {
  emoji:      string;
  title:      string;
  subtitle?:  string;
  rows:       RakaatRow[];
  terms:      string[];   // which TERM_DEFINITIONS keys to show in the glossary
};

// ─── Key terms glossary (full set; filtered per prayer) ───────────────────────

const TERM_DEFINITIONS: Record<string, string> = {
  "Fard":
    "Obligatory prayer. Intentionally skipping a Fard is a major sin. " +
    "Each prayer has a fixed number of Fard rak'ahs that must be performed.",
  "Wajib":
    "Near-obligatory. Intentionally missing it requires sincere repentance. " +
    "Witr (in the Hanafi school) is the primary Wajib prayer.",
  "Sunnah Mu'akkadah":
    "Strongly emphasised Sunnah. The Prophet ص regularly performed these. " +
    "Regularly skipping them is considered disliked (makruh).",
  "Sunnah Ghair Mu'akkadah":
    "Recommended but not strongly emphasised. There is reward for praying them " +
    "but no censure for occasionally omitting them.",
  "Nafl":
    "Voluntary extra prayer. Earns reward but there is no sin for not praying them.",
  "Tahiyyatul Masjid":
    "The 'greeting of the mosque': 2 Nafl rak'ahs prayed upon entering the mosque " +
    "before sitting down. Recommended whenever you enter.",
  "Ishraq":
    "2–4 Nafl rak'ahs prayed approximately 15–20 minutes after sunrise, for those " +
    "who remained seated in dhikr after the Fajr prayer. Highly virtuous.",
  "Tahajjud":
    "Voluntary night prayer, best performed in the last third of the night after " +
    "sleeping. Any even number of rak'ahs. Highly virtuous.",
  "Witr":
    "3 rak'ahs (Hanafi position: Wajib). Prayed last — after all Isha Sunnahs. " +
    "The third rak'ah includes Du'a Qunoot. Must be completed before Fajr begins.",
};

// ─── Raka'at data (Tahiyyatul Masjid always listed FIRST) ────────────────────

const PRAYER_DATA: Record<string, PrayerInfo> = {
  FAJR: {
    emoji: '🌄',
    title: 'Fajr',
    rows: [
      {
        type: 'Tahiyyatul Masjid',
        count: '2',
        isNafl: true,
        note: "Nafl — greet the mosque with 2 rak'ahs before sitting",
      },
      {
        type: "Sunnah Mu'akkadah",
        count: '2',
        timing: 'before Fard',
        isSunnahMuakkadah: true,
        note: "Strongly emphasised — the Prophet ص never missed these",
      },
      { type: 'Fard', count: '2', isHighlight: true },
    ],
    terms: ['Fard', "Sunnah Mu'akkadah", 'Nafl', 'Tahiyyatul Masjid'],
  },

  SHURUQ: {
    emoji: '🌅',
    title: 'Shuruq · Ishraq',
    subtitle:
      'Shuruq marks the END of the Fajr prayer window — pray Fajr before this time.\n\n' +
      'Ishraq is a nafl prayer performed 15–20 minutes after sunrise for those who remained in dhikr after Fajr.',
    rows: [
      {
        type: 'Tahiyyatul Masjid',
        count: '2',
        isNafl: true,
        note: "Nafl — if praying at the mosque, pray before sitting",
      },
      {
        type: 'Ishraq',
        count: '2–4',
        isNafl: true,
        note:
          "Nafl — remain in your place after Fajr in dhikr until 15–20 min after sunrise, " +
          "then pray 2 or 4 rak'ahs",
      },
    ],
    terms: ['Nafl', 'Tahiyyatul Masjid', 'Ishraq'],
  },

  DHUHR: {
    emoji: '☀️',
    title: 'Dhuhr',
    rows: [
      {
        type: 'Tahiyyatul Masjid',
        count: '2',
        isNafl: true,
        note: "Nafl — if praying at the mosque",
      },
      {
        type: "Sunnah Mu'akkadah",
        count: '4',
        timing: 'before Fard',
        isSunnahMuakkadah: true,
      },
      { type: 'Fard', count: '4', isHighlight: true },
      {
        type: "Sunnah Mu'akkadah",
        count: '2',
        timing: 'after Fard',
        isSunnahMuakkadah: true,
      },
      { type: 'Nafl', count: '2', timing: 'after Sunnah', isNafl: true },
    ],
    terms: ['Fard', "Sunnah Mu'akkadah", 'Nafl', 'Tahiyyatul Masjid'],
  },

  ASR: {
    emoji: '🌤️',
    title: 'Asr',
    rows: [
      {
        type: 'Tahiyyatul Masjid',
        count: '2',
        isNafl: true,
        note: "Nafl — if praying at the mosque",
      },
      {
        type: "Sunnah Ghair Mu'akkadah",
        count: '4',
        timing: 'before Fard',
        note: 'Optional but rewarding',
      },
      { type: 'Fard', count: '4', isHighlight: true },
    ],
    terms: ['Fard', "Sunnah Ghair Mu'akkadah", 'Nafl', 'Tahiyyatul Masjid'],
  },

  MAGHRIB: {
    emoji: '🌇',
    title: 'Maghrib',
    rows: [
      {
        type: 'Tahiyyatul Masjid',
        count: '2',
        isNafl: true,
        note: "Nafl — if praying at the mosque",
      },
      { type: 'Fard', count: '3', isHighlight: true },
      {
        type: "Sunnah Mu'akkadah",
        count: '2',
        timing: 'after Fard',
        isSunnahMuakkadah: true,
      },
      { type: 'Nafl', count: '2', timing: 'after Sunnah', isNafl: true },
    ],
    terms: ['Fard', "Sunnah Mu'akkadah", 'Nafl', 'Tahiyyatul Masjid'],
  },

  ISHA: {
    emoji: '🌙',
    title: 'Isha',
    rows: [
      {
        type: 'Tahiyyatul Masjid',
        count: '2',
        isNafl: true,
        note: "Nafl — if praying at the mosque",
      },
      {
        type: "Sunnah Ghair Mu'akkadah",
        count: '4',
        timing: 'before Fard',
        note: 'Optional but rewarding',
      },
      { type: 'Fard', count: '4', isHighlight: true },
      {
        type: "Sunnah Mu'akkadah",
        count: '2',
        timing: 'after Fard',
        isSunnahMuakkadah: true,
      },
      { type: 'Nafl', count: '2', timing: 'after Sunnah', isNafl: true },
      {
        type: 'Witr',
        count: '3',
        isWajib: true,
        note:
          "Wajib — prayed last, after all Sunnahs. Third rak'ah includes Du'a Qunoot. " +
          "Must be prayed before Fajr begins.",
      },
      {
        type: 'Tahajjud',
        count: '2–12',
        isNafl: true,
        note:
          "Nafl — any even number of rak'ahs. Prayed after sleeping, in the last third of " +
          "the night before Fajr. Highly virtuous.",
      },
    ],
    terms: [
      'Fard', "Sunnah Mu'akkadah", "Sunnah Ghair Mu'akkadah",
      'Nafl', 'Wajib', 'Witr', 'Tahajjud', 'Tahiyyatul Masjid',
    ],
  },

  JUMMAH: {
    emoji: '🕌',
    title: "Jumu'ah · Friday Dhuhr",
    subtitle:
      "Jumu'ah replaces Dhuhr on Fridays. Obligatory (Fard) for adult Muslim men. " +
      "Women may pray Dhuhr at home.",
    rows: [
      {
        type: 'Tahiyyatul Masjid',
        count: '2',
        isNafl: true,
        note: "Nafl — if you enter the mosque before the Khutbah begins",
      },
      {
        type: "Sunnah Mu'akkadah",
        count: '4',
        timing: 'before the Khutbah (sermon)',
        isSunnahMuakkadah: true,
      },
      { type: 'Fard (with Imam)', count: '2', isHighlight: true },
      {
        type: "Sunnah Mu'akkadah",
        count: '4',
        timing: 'after Fard',
        isSunnahMuakkadah: true,
      },
      {
        type: "Sunnah Mu'akkadah",
        count: '2',
        timing: "after the 4 Sunnah",
        isSunnahMuakkadah: true,
      },
    ],
    terms: ['Fard', "Sunnah Mu'akkadah", 'Nafl', 'Tahiyyatul Masjid'],
  },
};

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

  // Extra top padding on Android so header clears the system status bar
  const headerTopPad = Platform.OS === 'android'
    ? (StatusBar.currentHeight ?? 24) + 4
    : 14;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe}>

        {/* Header */}
        <View style={[styles.header, { paddingTop: headerTopPad }]}>
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
                  row.isNafl     && styles.tableRowNafl,
                  i < info.rows.length - 1 && styles.tableRowBorder,
                ]}
              >
                {/* Left: type + timing + note */}
                <View style={{ flex: 3 }}>
                  <Text style={[
                    styles.rowType,
                    row.isSunnahMuakkadah && { fontFamily: bold },
                    row.isHighlight && { color: Colors.maroonRed, fontFamily: bold },
                    row.isWajib    && { color: '#1A5F7A', fontFamily: bold },
                    row.isNafl     && { color: '#2E7D32' },
                    !row.isHighlight && !row.isWajib && !row.isNafl && !row.isSunnahMuakkadah
                      && { fontFamily: semi },
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
                    row.isNafl     && { color: '#2E7D32' },
                  ]}>
                    {row.count}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Key Terms — filtered to only terms appearing in this prayer */}
          <View style={styles.defsCard}>
            <Text style={[styles.defsTitle, { fontFamily: bold }]}>📖 Key Terms</Text>
            {info.terms.map(term => (
              <View key={term} style={styles.defRow}>
                <Text style={[styles.defTerm, { fontFamily: bold }]}>{term}</Text>
                <Text style={[styles.defDesc, { fontFamily: reg }]}>
                  {TERM_DEFINITIONS[term] ?? ''}
                </Text>
              </View>
            ))}
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
    paddingBottom: 14,
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
    backgroundColor: '#FFF0F0',
  },
  tableRowWajib: {
    backgroundColor: '#EEF4FF',
  },
  tableRowNafl: {
    backgroundColor: '#F1F8F1',
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
    fontSize: 13,
    color: Colors.inkMute,
    marginTop: 2,
  },
  rowNote: {
    fontSize: 13,
    color: Colors.deepBlue,
    marginTop: 3,
    lineHeight: 18,
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

  // Key Terms — filtered glossary
  defsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
    gap: 10,
  },
  defsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.maroonRed,
    marginBottom: 2,
  },
  defRow: {
    gap: 2,
  },
  defTerm: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.ink,
  },
  defDesc: {
    fontSize: 13,
    color: Colors.inkMute,
    lineHeight: 19,
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
