import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Colors } from '../constants/theme';

// ─── Language types ────────────────────────────────────────────────────────────

type Language = 'en' | 'ur' | 'bn';

const LANG_LABELS: Record<Language, string> = {
  en: 'English',
  ur: 'اردو',
  bn: 'বাংলা',
};

// ─── Content ──────────────────────────────────────────────────────────────────

type Section = {
  title: string;
  content: string | { step: string; text: string }[];
};

const ENGLISH_SECTIONS: Section[] = [
  {
    title: '🔔 How to Set a Prayer Alert',
    content: [
      { step: '1', text: 'Tap Alerts in the bottom bar, or open Menu → Prayer Alerts & Sounds.' },
      { step: '2', text: 'Find the prayer you want (e.g. Dhuhr).' },
      { step: '3', text: 'Tap the switch on the left to turn it ON (green).' },
      { step: '4', text: 'Choose a sound — tap "No sound" to open the sound picker. Pick an option and tap Done.' },
      { step: '5', text: 'Choose Begin or Jama\'at time — tap the pill button to switch between them.' },
      { step: '6', text: 'If you chose Jama\'at, use the slider to set how many minutes before Jama\'at you\'d like the alert (e.g. 15 min before).' },
      { step: '7', text: 'That\'s it! The alarm is scheduled automatically. You can test it with the Test Alarm button.' },
    ],
  },
  {
    title: '⚙️ Alarm Options Explained',
    content:
      '💥 Splash — When the alarm fires, the screen flashes white 3 times then reveals the prayer screen. Best for heavy sleepers.\n\n' +
      '⚡ Flash — Strobes the camera torch LED. Useful in dark rooms.\n\n' +
      '📳 Vibrate — Vibrates the phone when the alarm fires. Good when on silent.\n\n' +
      '🔁 Loop — Keeps the sound playing until you tap Stop. Recommended for Fajr so you cannot sleep through it.\n\n' +
      '📖 Quotes — Shows a Quran verse on the alarm screen (when Splash is also on) or in the notification dropdown.',
  },
  {
    title: '🕐 Begin Time vs Jama\'at Time',
    content:
      'Begin Time — The alarm fires at the start of the prayer window (e.g. when Dhuhr begins at 13:05). Good if you pray at home.\n\n' +
      'Jama\'at Time — The alarm fires before the congregation prayer at the mosque. Use the offset slider to set how early. ' +
      'For example: Jama\'at at 13:30, offset 15 min → alarm fires at 13:15 to give you time to get ready.',
  },
  {
    title: '📱 Android Permissions',
    content:
      'The app needs 4 permissions to work reliably. You are guided through these when you first install the app.\n\n' +
      '1. Notifications — Required to show any alerts. Tap "Allow" when the system asks.\n\n' +
      '2. Exact Alarms — Lets the app fire at the precise prayer time. Go to:\n   Settings → Apps → EEIS Prayer Times → Alarms & Reminders → Enable.\n\n' +
      '3. Battery (Unrestricted) — Prevents the phone from cancelling alarms in the background. On Samsung:\n   Settings → Battery → App power management → set EEIS to Unrestricted.\n\n' +
      '4. Full-Screen Alerts (Android 14+) — Shows the alarm screen over your lock screen.\n   Settings → Special app access → Display over lock screen → Enable for EEIS.',
  },
  {
    title: '🏦 Donate — Bank Transfer, Gift Aid & Standing Order',
    content:
      'Bank Transfer details:\n' +
      '   Account name:  Epsom & Ewell Islamic Society\n' +
      '   Sort code:     30-93-74\n' +
      '   Account no:    01879186\n' +
      '   Reference:     Your name or "Donation"\n\n' +
      'Gift Aid — If you are a UK taxpayer, EEIS can reclaim 25p for every £1 you donate at no extra cost to you. ' +
      'Complete the Gift Aid declaration form available in the app via Menu → Bank Transfer & Gift Aid.\n\n' +
      'Standing Order — Set up a regular monthly donation using the bank details above via your bank\'s app or website.',
  },
];

const PLACEHOLDER_SECTIONS: Record<'ur' | 'bn', Section[]> = {
  ur: [
    {
      title: 'اردو رہنمائی',
      content:
        'یہ سیکشن جلد آئے گا۔ اردو ترجمے کے لیے رابطہ کریں:\ninfo@eeis.co.uk',
    },
  ],
  bn: [
    {
      title: 'বাংলা গাইড',
      content:
        'এই বিভাগটি শীঘ্রই আসছে। বাংলা অনুবাদের জন্য যোগাযোগ করুন:\ninfo@eeis.co.uk',
    },
  ],
};

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  visible:    boolean;
  onClose:    () => void;
  fontsLoaded: boolean;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function HelpScreen({ visible, onClose, fontsLoaded }: Props) {
  const [lang, setLang] = useState<Language>('en');

  const bold = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;

  const sections: Section[] =
    lang === 'en'
      ? ENGLISH_SECTIONS
      : PLACEHOLDER_SECTIONS[lang];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { fontFamily: bold }]}>Help & Guide</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            style={styles.closeBtn}
          >
            <Text style={[styles.closeBtnText, { fontFamily: bold }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Language selector */}
        <View style={styles.langRow}>
          {(['en', 'ur', 'bn'] as Language[]).map(l => (
            <TouchableOpacity
              key={l}
              style={[styles.langPill, lang === l && styles.langPillActive]}
              onPress={() => setLang(l)}
            >
              <Text style={[
                styles.langPillText,
                { fontFamily: lang === l ? semi : reg },
                lang === l && styles.langPillTextActive,
              ]}>
                {LANG_LABELS[l]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {sections.map((section, i) => (
            <View key={i} style={styles.section}>
              <Text style={[styles.sectionTitle, { fontFamily: bold }]}>
                {section.title}
              </Text>
              {Array.isArray(section.content)
                ? section.content.map((item, j) => (
                    <View key={j} style={styles.stepRow}>
                      <View style={styles.stepBadge}>
                        <Text style={[styles.stepBadgeText, { fontFamily: bold }]}>
                          {item.step}
                        </Text>
                      </View>
                      <Text style={[styles.stepText, { fontFamily: reg }]}>
                        {item.text}
                      </Text>
                    </View>
                  ))
                : <Text style={[styles.bodyText, { fontFamily: reg }]}>
                    {section.content}
                  </Text>
              }
            </View>
          ))}

          {/* Bottom spacer so floating button doesn't cover content */}
          <View style={{ height: 72 }} />
        </ScrollView>

        {/* Floating close button */}
        <TouchableOpacity style={styles.floatingClose} onPress={onClose}>
          <Text style={[styles.floatingCloseText, { fontFamily: bold }]}>Close</Text>
        </TouchableOpacity>

      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.blueDeep ?? '#063968',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  langRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F0F4F8',
    borderBottomWidth: 1,
    borderBottomColor: '#DDE3EA',
  },
  langPill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#C0CCD8',
    backgroundColor: '#FFFFFF',
  },
  langPillActive: {
    backgroundColor: Colors.deepBlue,
    borderColor: Colors.deepBlue,
  },
  langPillText: {
    fontSize: 13,
    color: Colors.inkMute,
  },
  langPillTextActive: {
    color: '#FFFFFF',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.maroonRed,
    marginBottom: 10,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.deepBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: Colors.ink,
    lineHeight: 20,
  },
  bodyText: {
    fontSize: 14,
    color: Colors.ink,
    lineHeight: 22,
  },
  floatingClose: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    backgroundColor: Colors.deepBlue,
    paddingHorizontal: 40,
    paddingVertical: 12,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  floatingCloseText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
