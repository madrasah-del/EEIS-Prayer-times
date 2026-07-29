/**
 * SetupWizard — first-launch modal (fresh install / reinstall only) that walks non-technical
 * users through choosing a sound + features for each prayer, one screen per prayer, with a
 * plain-English explanation of every option and a preview button so a sound can be tried before
 * it's chosen. Mirrors PermissionsWizard's visual structure. Any prayer left untouched keeps the
 * app's built-in defaults (Notify + Quran quote on, Sound off) — nothing here is required.
 */
import React, { useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, Switch, ScrollView, StyleSheet, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/theme';
import { FAJR_SHURUQ_SOUNDS, STANDARD_SOUNDS, SoundDef } from '../data/soundOptions';
import { AlertSettings } from '../hooks/useAlertSettings';

// ─── Step definitions ─────────────────────────────────────────────────────────

type StepDef = {
  key: keyof AlertSettings;
  name: string;
  sounds: SoundDef[];
};

const STEPS: StepDef[] = [
  { key: 'fajr',    name: 'FAJR',                        sounds: FAJR_SHURUQ_SOUNDS },
  { key: 'shuruq',  name: '🌅 SHURUQ — Sunrise',          sounds: FAJR_SHURUQ_SOUNDS },
  { key: 'dhuhr',   name: '☀️ DHUHR',                     sounds: STANDARD_SOUNDS },
  { key: 'asr',     name: '🌤️ ASR',                       sounds: STANDARD_SOUNDS },
  { key: 'maghrib', name: '🌇 MAGHRIB',                   sounds: STANDARD_SOUNDS },
  { key: 'isha',    name: 'ISHA',                         sounds: STANDARD_SOUNDS },
  { key: 'jummah',  name: 'JUMMAH — Friday',              sounds: STANDARD_SOUNDS },
];

// ─── Small reusable rows ──────────────────────────────────────────────────────

function ToggleRow({ label, blurb, value, onChange }: {
  label: string; blurb: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleBlurb}>{blurb}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: Colors.freshGreen, false: '#D0D0D0' }}
        thumbColor={value ? Colors.deepBlue : '#F5F5F5'}
      />
    </View>
  );
}

function CheckRow({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <TouchableOpacity style={styles.checkRow} onPress={() => onChange(!checked)} activeOpacity={0.7}>
      <View style={[styles.checkBox, checked && styles.checkBoxOn]}>
        {checked && <Text style={styles.checkTick}>✓</Text>}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  visible: boolean;
  settings: AlertSettings;
  onUpdatePrayer: <K extends keyof AlertSettings>(key: K, patch: Partial<AlertSettings[K]>) => void;
  onPreview: (file: any) => void;
  onStopPreview: () => void;
  isPlaying: boolean;
  onDone: () => void;
};

export function SetupWizard({
  visible, settings, onUpdatePrayer, onPreview, onStopPreview, isPlaying, onDone,
}: Props) {
  const isAndroid = Platform.OS === 'android';
  // index 0..STEPS.length-1 = a prayer step; STEPS.length = the final confirmation screen
  const [stepIndex, setStepIndex] = useState(0);
  const total = STEPS.length + 1;
  const isFinalScreen = stepIndex === STEPS.length;

  React.useEffect(() => {
    if (visible) setStepIndex(0);
  }, [visible]);

  if (!visible) return null;

  const step = !isFinalScreen ? STEPS[stepIndex] : null;
  const alert = step ? (settings[step.key] as any) : null;

  const advance = () => {
    onStopPreview();
    if (isFinalScreen) { onDone(); return; }
    setStepIndex(i => i + 1);
  };
  const back = () => {
    onStopPreview();
    setStepIndex(i => Math.max(0, i - 1));
  };
  const handleSelectSound = (def: SoundDef) => {
    if (!step) return;
    onUpdatePrayer(step.key, { sound: def.key } as any);
    if (def.file) onPreview(def.file); else onStopPreview();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Set Up Prayer Alerts</Text>
            <Text style={styles.headerProgress}>{stepIndex + 1} of {total}</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${((stepIndex + 1) / total) * 100}%` as any }]} />
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {!isFinalScreen && step && alert ? (
              <View style={styles.card}>
                <Text style={styles.stepTitle}>{step.name}</Text>
                <Text style={styles.stepIntro}>
                  Choose a sound and the features you'd like for this prayer. Everything here can
                  be changed later in Prayer Alerts.
                </Text>

                {/* Sound picker — tap a sound to try it and select it */}
                <Text style={styles.sectionLabel}>Sound</Text>
                <Text style={styles.sectionBlurb}>Tap a sound to hear it — tapping also selects it.</Text>
                <View style={styles.soundList}>
                  {step.sounds.map(def => {
                    const selected = def.key === alert.sound;
                    return (
                      <TouchableOpacity
                        key={def.key}
                        style={[styles.soundRow, selected && styles.soundRowSelected]}
                        onPress={() => handleSelectSound(def)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.soundRowText, selected && styles.soundRowTextSel]} numberOfLines={1}>
                          {def.file ? '▶ ' : ''}{def.label}
                        </Text>
                        {selected && <Text style={styles.soundCheck}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {isPlaying && (
                  <TouchableOpacity style={styles.stopPreviewBtn} onPress={onStopPreview}>
                    <Text style={styles.stopPreviewText}>⏹ Stop Preview</Text>
                  </TouchableOpacity>
                )}

                {/* Feature toggles */}
                <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Features</Text>
                <ToggleRow
                  label="🔔 Notify"
                  blurb="Shows a reminder and the full prayer details when it's time."
                  value={!!alert.notifyEnabled}
                  onChange={v => onUpdatePrayer(step.key, { notifyEnabled: v } as any)}
                />
                <ToggleRow
                  label="📖 Quran quote"
                  blurb="Shows a short Quran verse or hadith along with the reminder."
                  value={!!alert.quotesEnabled}
                  onChange={v => onUpdatePrayer(step.key, { quotesEnabled: v } as any)}
                />
                <ToggleRow
                  label="🔁 Loop"
                  blurb="Repeats the sound until you open the app or stop it, instead of playing once."
                  value={!!alert.loopEnabled}
                  onChange={v => onUpdatePrayer(step.key, { loopEnabled: v } as any)}
                />
                {isAndroid && (
                  <>
                    <ToggleRow
                      label="📱 Screen Flash"
                      blurb="Your phone's lock screen briefly strobes white, then shows the prayer alarm screen."
                      value={!!alert.splashEnabled}
                      onChange={v => onUpdatePrayer(step.key, { splashEnabled: v } as any)}
                    />
                    <ToggleRow
                      label="📸 Camera Flash"
                      blurb="Pulses the rear torch/LED a few times when the alarm fires."
                      value={!!alert.flashEnabled}
                      onChange={v => onUpdatePrayer(step.key, { flashEnabled: v } as any)}
                    />
                    <ToggleRow
                      label="📳 Vibrate"
                      blurb="Vibrates the phone when the alarm fires."
                      value={!!alert.vibrateEnabled}
                      onChange={v => onUpdatePrayer(step.key, { vibrateEnabled: v } as any)}
                    />
                  </>
                )}

                {step.key === 'jummah' && (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Which Jama'at?</Text>
                    <CheckRow
                      label="1st Jama'at"
                      checked={!!alert.jamaat1}
                      onChange={v => onUpdatePrayer('jummah', { jamaat1: v } as any)}
                    />
                    <CheckRow
                      label="2nd Jama'at"
                      checked={!!alert.jamaat2}
                      onChange={v => onUpdatePrayer('jummah', { jamaat2: v } as any)}
                    />
                  </>
                )}
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.stepIcon}>✅</Text>
                <Text style={styles.stepTitle}>All Set!</Text>
                <Text style={styles.stepIntro}>
                  Your prayer alerts are ready. You can change any sound or feature at any time in
                  Prayer Alerts from the menu.
                </Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.footerRow}>
            {stepIndex > 0 && (
              <TouchableOpacity style={styles.backBtn} onPress={back} activeOpacity={0.7}>
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.nextBtn} onPress={advance} activeOpacity={0.85}>
              <Text style={styles.nextBtnText}>{isFinalScreen ? 'Finish' : 'Next'}</Text>
            </TouchableOpacity>
          </View>

          {stepIndex === 0 && (
            <TouchableOpacity style={styles.skipBtn} onPress={onDone} activeOpacity={0.7}>
              <Text style={styles.skipBtnText}>Skip — use the recommended defaults for every prayer</Text>
            </TouchableOpacity>
          )}

          <View style={styles.dots}>
            {Array.from({ length: total }).map((_, i) => (
              <View key={i} style={[styles.dot, i === stepIndex && styles.dotActive]} />
            ))}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  container: {
    backgroundColor: Colors.bgScreen,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 8,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 20, paddingBottom: 12,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.ink },
  headerProgress: { fontSize: 13, fontWeight: '600', color: Colors.inkMute },
  progressBarBg: { height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, marginBottom: 16 },
  progressBarFill: { height: 4, backgroundColor: Colors.deepBlue, borderRadius: 2 },
  scroll: { flexGrow: 0 },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, alignItems: 'stretch',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08,
    shadowRadius: 8, elevation: 3, marginBottom: 8,
  },
  stepIcon: { fontSize: 44, textAlign: 'center', marginBottom: 8 },
  stepTitle: { fontSize: 20, fontWeight: '800', color: Colors.ink, textAlign: 'center', marginBottom: 8 },
  stepIntro: { fontSize: 13, color: Colors.inkMute, textAlign: 'center', lineHeight: 19, marginBottom: 16 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: Colors.ink, marginBottom: 2 },
  sectionBlurb: { fontSize: 12, color: Colors.inkMute, marginBottom: 8 },
  soundList: { gap: 6 },
  soundRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#F5F5F5',
  },
  soundRowSelected: { backgroundColor: '#E3EEFB' },
  soundRowText: { fontSize: 14, color: Colors.ink, flex: 1 },
  soundRowTextSel: { fontWeight: '700', color: Colors.deepBlue },
  soundCheck: { fontSize: 16, fontWeight: '800', color: Colors.deepBlue, marginLeft: 8 },
  stopPreviewBtn: { alignSelf: 'center', marginTop: 10, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#FDE7E7' },
  stopPreviewText: { color: '#C0392B', fontWeight: '700', fontSize: 12 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEE',
  },
  toggleLabel: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  toggleBlurb: { fontSize: 11.5, color: Colors.inkMute, marginTop: 2, lineHeight: 15 },
  checkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#C0C0C0', alignItems: 'center', justifyContent: 'center' },
  checkBoxOn: { backgroundColor: Colors.deepBlue, borderColor: Colors.deepBlue },
  checkTick: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  checkLabel: { fontSize: 14, color: Colors.ink, fontWeight: '600' },
  footerRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  backBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#E0E0E0' },
  backBtnText: { color: Colors.ink, fontSize: 15, fontWeight: '700' },
  nextBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: Colors.deepBlue },
  nextBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  skipBtn: { paddingVertical: 10, alignItems: 'center' },
  skipBtnText: { color: Colors.inkMute, fontSize: 12.5, fontWeight: '500', textDecorationLine: 'underline' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 4, paddingBottom: 8, flexWrap: 'wrap' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D0D0D0' },
  dotActive: { backgroundColor: Colors.deepBlue, width: 20 },
});
