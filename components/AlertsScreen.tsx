import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, Alert,
  TouchableOpacity, Switch, ScrollView, Platform,
} from 'react-native';
import { StopSoundButton } from './StopSoundButton';
import Slider from '@react-native-community/slider';
import { Colors } from '../constants/theme';
import {
  AlertSettings, PrayerAlert, OffsetAlert, JummahAlert, SoundKey,
} from '../hooks/useAlertSettings';
import {
  FAJR_SHURUQ_SOUNDS, STANDARD_SOUNDS, SoundDef,
} from '../data/soundOptions';
import { scheduleTestNotification } from '../hooks/useNotificationScheduler';

const STOP_THRESHOLD_SEC = 5;

// ─── SoundPicker ──────────────────────────────────────────────────────────────

type SoundPickerProps = {
  value: SoundKey;
  options: SoundDef[];
  onChange: (key: SoundKey) => void;
  onPreview: (file: any) => void;
  onStopPreview: () => void;
  isPlaying: boolean;
  playingDuration: number | null;
};

function SoundPicker({
  value, options, onChange, onPreview, onStopPreview, isPlaying, playingDuration,
}: SoundPickerProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = useCallback((def: SoundDef) => {
    onChange(def.key);
    if (def.file) {
      onPreview(def.file);
    } else {
      onStopPreview();
    }
  }, [onChange, onPreview, onStopPreview]);

  const handleClose = () => {
    onStopPreview();
    setOpen(false);
  };

  const selectedLabel = options.find(o => o.key === value)?.label ?? 'No Sound';
  const showInlineStop = isPlaying && playingDuration !== null && playingDuration > STOP_THRESHOLD_SEC;

  return (
    <>
      <TouchableOpacity style={styles.pickerBtn} onPress={() => setOpen(true)}>
        <Text style={styles.pickerBtnText} numberOfLines={1}>{selectedLabel} ▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={handleClose}>
        <Pressable style={styles.pickerOverlay} onPress={handleClose}>
          <Pressable style={styles.pickerCard} onPress={() => {}}>

            <Text style={styles.pickerTitle}>Select Sound</Text>
            <Text style={styles.pickerHint}>Tap a sound to hear a 4-second preview</Text>

            {options.map(def => {
              const isSelected = def.key === value;
              return (
                <TouchableOpacity
                  key={def.key}
                  style={[styles.pickerOption, isSelected && styles.pickerOptionSelected]}
                  onPress={() => handleSelect(def)}
                >
                  <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextSel]}>
                    {def.label}
                  </Text>
                  {isSelected && <Text style={styles.pickerCheck}>✓</Text>}
                </TouchableOpacity>
              );
            })}

            {/* Inline stop button for long preview sounds */}
            {showInlineStop && (
              <TouchableOpacity style={styles.previewStopBtn} onPress={onStopPreview}>
                <Text style={styles.previewStopText}>⏹  Stop Preview</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.pickerDoneBtn} onPress={handleClose}>
              <Text style={styles.pickerDoneText}>Done</Text>
            </TouchableOpacity>

          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ─── OffsetLabel ─────────────────────────────────────────────────────────────

function OffsetLabel({ minutes, prefix }: { minutes: number; prefix: string }) {
  if (minutes === 0) return <Text style={styles.offsetLabel}>At {prefix} time</Text>;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const t = h > 0 ? `${h}h ${m > 0 ? `${m}m` : ''}`.trim() : `${m} min`;
  return <Text style={styles.offsetLabel}>{t} before {prefix}</Text>;
}

// ─── Checkbox ────────────────────────────────────────────────────────────────

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <TouchableOpacity style={styles.checkboxRow} onPress={() => onChange(!checked)} activeOpacity={0.7}>
      <View style={[styles.checkboxBox, checked && styles.checkboxBoxOn]}>
        {checked && <Text style={styles.checkboxTick}>✓</Text>}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Section separator ───────────────────────────────────────────────────────

function SectionLabel({ title }: { title: string }) {
  return <Text style={styles.sectionLabel}>{title}</Text>;
}

// ─── Standard prayer row ──────────────────────────────────────────────────────

type StandardRowProps = {
  name: string;
  alert: PrayerAlert;
  onToggle: (v: boolean) => void;
  onSound: (k: SoundKey) => void;
  onPreview: (file: any) => void;
  onStopPreview: () => void;
  isPlaying: boolean;
  playingDuration: number | null;
  fontsLoaded: boolean;
};

function StandardRow({
  name, alert, onToggle, onSound, onPreview, onStopPreview, isPlaying, playingDuration, fontsLoaded,
}: StandardRowProps) {
  const bold = fontsLoaded ? 'Poppins_700Bold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular' : undefined;
  return (
    <View style={styles.prayerRow}>
      <Text style={[styles.prayerName, { fontFamily: bold }]}>{name}</Text>
      <View style={styles.controlsRow}>
        <View style={styles.notifyGroup}>
          <Text style={[styles.ctrlLabel, { fontFamily: reg }]}>Notify</Text>
          <Switch
            value={alert.notifyEnabled}
            onValueChange={onToggle}
            trackColor={{ true: Colors.freshGreen, false: '#D0D0D0' }}
            thumbColor={alert.notifyEnabled ? Colors.deepBlue : '#F5F5F5'}
          />
        </View>
        <View style={styles.soundGroup}>
          <Text style={[styles.ctrlLabel, { fontFamily: reg }]}>Sound</Text>
          <SoundPicker
            value={alert.sound}
            options={STANDARD_SOUNDS}
            onChange={onSound}
            onPreview={onPreview}
            onStopPreview={onStopPreview}
            isPlaying={isPlaying}
            playingDuration={playingDuration}
          />
        </View>
      </View>
    </View>
  );
}

// ─── Fajr/Shuruq row (with loop + Fajr&Shuruq sound list) ────────────────────

type FajrShuruqRowProps = {
  name: string;
  alert: OffsetAlert & { loopEnabled?: boolean };
  maxOffset?: number;
  offsetPrefix?: string;
  showOffset: boolean;
  onToggle: (v: boolean) => void;
  onSound: (k: SoundKey) => void;
  onLoop: (v: boolean) => void;
  onOffset?: (v: number) => void;
  onPreview: (file: any) => void;
  onStopPreview: () => void;
  isPlaying: boolean;
  playingDuration: number | null;
  fontsLoaded: boolean;
};

function FajrShuruqRow({
  name, alert, maxOffset, offsetPrefix, showOffset,
  onToggle, onSound, onLoop, onOffset,
  onPreview, onStopPreview, isPlaying, playingDuration, fontsLoaded,
}: FajrShuruqRowProps) {
  const bold = fontsLoaded ? 'Poppins_700Bold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular' : undefined;
  return (
    <View style={[styles.prayerRow, styles.fajrShuruqRow]}>
      <Text style={[styles.prayerName, { fontFamily: bold }]}>{name}</Text>
      <View style={styles.controlsRow}>
        <View style={styles.notifyGroup}>
          <Text style={[styles.ctrlLabel, { fontFamily: reg }]}>Notify</Text>
          <Switch
            value={alert.notifyEnabled}
            onValueChange={onToggle}
            trackColor={{ true: Colors.freshGreen, false: '#D0D0D0' }}
            thumbColor={alert.notifyEnabled ? Colors.deepBlue : '#F5F5F5'}
          />
        </View>
        <View style={styles.soundGroup}>
          <Text style={[styles.ctrlLabel, { fontFamily: reg }]}>Sound</Text>
          <SoundPicker
            value={alert.sound}
            options={FAJR_SHURUQ_SOUNDS}
            onChange={onSound}
            onPreview={onPreview}
            onStopPreview={onStopPreview}
            isPlaying={isPlaying}
            playingDuration={playingDuration}
          />
        </View>
      </View>

      {/* Loop option */}
      <View style={[styles.controlsRow, styles.loopRow]}>
        <Checkbox
          label="Loop until stopped"
          checked={!!alert.loopEnabled}
          onChange={onLoop}
        />
      </View>

      {/* Offset slider */}
      {showOffset && maxOffset != null && offsetPrefix != null && onOffset != null && (
        <View style={styles.sliderSection}>
          <OffsetLabel minutes={(alert as OffsetAlert).offsetMinutes} prefix={offsetPrefix} />
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={maxOffset}
            step={5}
            value={(alert as OffsetAlert).offsetMinutes}
            onValueChange={onOffset}
            minimumTrackTintColor={Colors.deepBlue}
            maximumTrackTintColor="#D0D0D0"
            thumbTintColor={Colors.maroonRed}
          />
        </View>
      )}

    </View>
  );
}

// ─── Jummah row ──────────────────────────────────────────────────────────────

type JummahRowProps = {
  alert: JummahAlert;
  onJamaat1: (v: boolean) => void;
  onJamaat2: (v: boolean) => void;
  onToggle: (v: boolean) => void;
  onSound: (k: SoundKey) => void;
  onOffset: (v: number) => void;
  onPreview: (file: any) => void;
  onStopPreview: () => void;
  isPlaying: boolean;
  playingDuration: number | null;
  fontsLoaded: boolean;
};

function JummahRow({
  alert, onJamaat1, onJamaat2, onToggle, onSound, onOffset,
  onPreview, onStopPreview, isPlaying, playingDuration, fontsLoaded,
}: JummahRowProps) {
  const bold = fontsLoaded ? 'Poppins_700Bold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular' : undefined;
  return (
    <View style={[styles.prayerRow, styles.jummahBorder]}>
      <View style={styles.jummahHeader}>
        <Text style={[styles.prayerName, { fontFamily: bold, marginBottom: 0 }]}>JUMMAH</Text>
        <Text style={[styles.jummahSub, { fontFamily: reg }]}>Fridays only</Text>
      </View>
      <View style={styles.jummahChecks}>
        <Checkbox label="1st Jama'at" checked={alert.jamaat1} onChange={onJamaat1} />
        <Checkbox label="2nd Jama'at" checked={alert.jamaat2} onChange={onJamaat2} />
      </View>
      <View style={styles.controlsRow}>
        <View style={styles.notifyGroup}>
          <Text style={[styles.ctrlLabel, { fontFamily: reg }]}>Notify</Text>
          <Switch
            value={alert.notifyEnabled}
            onValueChange={onToggle}
            trackColor={{ true: Colors.freshGreen, false: '#D0D0D0' }}
            thumbColor={alert.notifyEnabled ? Colors.deepBlue : '#F5F5F5'}
          />
        </View>
        <View style={styles.soundGroup}>
          <Text style={[styles.ctrlLabel, { fontFamily: reg }]}>Sound</Text>
          <SoundPicker
            value={alert.sound}
            options={STANDARD_SOUNDS}
            onChange={onSound}
            onPreview={onPreview}
            onStopPreview={onStopPreview}
            isPlaying={isPlaying}
            playingDuration={playingDuration}
          />
        </View>
      </View>
      <View style={styles.sliderSection}>
        <OffsetLabel minutes={alert.offsetMinutes} prefix="Jama'at" />
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={120}
          step={5}
          value={alert.offsetMinutes}
          onValueChange={onOffset}
          minimumTrackTintColor={Colors.deepBlue}
          maximumTrackTintColor="#D0D0D0"
          thumbTintColor={Colors.maroonRed}
        />
      </View>
    </View>
  );
}

// ─── Main AlertsScreen ────────────────────────────────────────────────────────

type Props = {
  visible: boolean;
  settings: AlertSettings;
  onUpdate: (patch: Partial<AlertSettings>) => void;
  onUpdatePrayer: <K extends keyof AlertSettings>(key: K, patch: Partial<AlertSettings[K]>) => void;
  onClose: () => void;
  onPreview: (file: any) => void;
  onStopPreview: () => void;
  isPlaying: boolean;
  playingDuration: number | null;
  fontsLoaded: boolean;
};

export function AlertsScreen({
  visible, settings, onUpdate, onUpdatePrayer, onClose,
  onPreview, onStopPreview, isPlaying, playingDuration, fontsLoaded,
}: Props) {
  const bold = fontsLoaded ? 'Poppins_700Bold' : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular' : undefined;

  const vol = Math.round(settings.masterVolume * 100);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.screen}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.dragHandle} />
          <View style={styles.headerRow}>
            <Text style={[styles.headerTitle, { fontFamily: bold }]}>Prayer Alerts</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <Text style={[styles.closeBtnText, { fontFamily: bold }]}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Floating stop button — appears over modal content when a sound is active */}
        <StopSoundButton
          visible={isPlaying}
          onStop={onStopPreview}
          fontsLoaded={fontsLoaded}
        />

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {/* Global controls */}
          <View style={styles.globalCard}>
            <SectionLabel title="Global Controls" />

            <Text style={[styles.ctrlLabel, { fontFamily: reg }]}>🔊  Volume: {vol}%</Text>
            <Slider
              style={[styles.slider, { marginBottom: 12 }]}
              minimumValue={0}
              maximumValue={1}
              step={0.05}
              value={settings.masterVolume}
              onValueChange={v => onUpdate({ masterVolume: v })}
              minimumTrackTintColor={Colors.freshGreen}
              maximumTrackTintColor="#D0D0D0"
              thumbTintColor={Colors.deepBlue}
            />

            <View style={styles.muteBtns}>
              <TouchableOpacity
                style={[styles.muteBtn, settings.muteNotifications && styles.muteBtnOn]}
                onPress={() => onUpdate({ muteNotifications: !settings.muteNotifications })}
              >
                <Text style={[styles.muteBtnText, { fontFamily: semi }, settings.muteNotifications && styles.muteBtnTextOn]}>
                  {settings.muteNotifications ? '🔕 Notifications Off' : '🔔 Mute Notifications'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.muteBtn, settings.muteSounds && styles.muteBtnOn]}
                onPress={() => onUpdate({ muteSounds: !settings.muteSounds })}
              >
                <Text style={[styles.muteBtnText, { fontFamily: semi }, settings.muteSounds && styles.muteBtnTextOn]}>
                  {settings.muteSounds ? '🔇 Sounds Off' : '🔊 Mute Sounds'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Fajr */}
          <SectionLabel title="Daily Prayers" />
          <FajrShuruqRow
            name="FAJR"
            alert={{ ...settings.fajr, offsetMinutes: 0 } as any}
            showOffset={false}
            onToggle={v => onUpdatePrayer('fajr', { notifyEnabled: v })}
            onSound={k  => onUpdatePrayer('fajr', { sound: k })}
            onLoop={v   => onUpdatePrayer('fajr', { loopEnabled: v })}
            onPreview={onPreview}
            onStopPreview={onStopPreview}
            isPlaying={isPlaying}
            playingDuration={playingDuration}
            fontsLoaded={fontsLoaded}
          />

          {/* Shuruq */}
          <FajrShuruqRow
            name="SHURUQ"
            alert={settings.shuruq}
            showOffset
            maxOffset={90}
            offsetPrefix="Shuruq"
            onToggle={v => onUpdatePrayer('shuruq', { notifyEnabled: v })}
            onSound={k  => onUpdatePrayer('shuruq', { sound: k })}
            onLoop={v   => onUpdatePrayer('shuruq', { loopEnabled: v })}
            onOffset={v => onUpdatePrayer('shuruq', { offsetMinutes: v })}
            onPreview={onPreview}
            onStopPreview={onStopPreview}
            isPlaying={isPlaying}
            playingDuration={playingDuration}
            fontsLoaded={fontsLoaded}
          />

          {/* Dhuhr */}
          <StandardRow
            name="DHUHR"
            alert={settings.dhuhr}
            onToggle={v => onUpdatePrayer('dhuhr', { notifyEnabled: v })}
            onSound={k  => onUpdatePrayer('dhuhr', { sound: k })}
            onPreview={onPreview}
            onStopPreview={onStopPreview}
            isPlaying={isPlaying}
            playingDuration={playingDuration}
            fontsLoaded={fontsLoaded}
          />

          {/* Asr */}
          <StandardRow
            name="ASR"
            alert={settings.asr}
            onToggle={v => onUpdatePrayer('asr', { notifyEnabled: v })}
            onSound={k  => onUpdatePrayer('asr', { sound: k })}
            onPreview={onPreview}
            onStopPreview={onStopPreview}
            isPlaying={isPlaying}
            playingDuration={playingDuration}
            fontsLoaded={fontsLoaded}
          />

          {/* Maghrib */}
          <StandardRow
            name="MAGHRIB"
            alert={settings.maghrib}
            onToggle={v => onUpdatePrayer('maghrib', { notifyEnabled: v })}
            onSound={k  => onUpdatePrayer('maghrib', { sound: k })}
            onPreview={onPreview}
            onStopPreview={onStopPreview}
            isPlaying={isPlaying}
            playingDuration={playingDuration}
            fontsLoaded={fontsLoaded}
          />

          {/* Isha */}
          <StandardRow
            name="ISHA"
            alert={settings.isha}
            onToggle={v => onUpdatePrayer('isha', { notifyEnabled: v })}
            onSound={k  => onUpdatePrayer('isha', { sound: k })}
            onPreview={onPreview}
            onStopPreview={onStopPreview}
            isPlaying={isPlaying}
            playingDuration={playingDuration}
            fontsLoaded={fontsLoaded}
          />

          {/* Jummah */}
          <SectionLabel title="Friday Prayers" />
          <JummahRow
            alert={settings.jummah}
            onJamaat1={v => onUpdatePrayer('jummah', { jamaat1: v })}
            onJamaat2={v => onUpdatePrayer('jummah', { jamaat2: v })}
            onToggle={v  => onUpdatePrayer('jummah', { notifyEnabled: v })}
            onSound={k   => onUpdatePrayer('jummah', { sound: k })}
            onOffset={v  => onUpdatePrayer('jummah', { offsetMinutes: v })}
            onPreview={onPreview}
            onStopPreview={onStopPreview}
            isPlaying={isPlaying}
            playingDuration={playingDuration}
            fontsLoaded={fontsLoaded}
          />

          {/* Test Alarm */}
          <SectionLabel title="Testing" />
          <TouchableOpacity
            style={styles.testAlarmBtn}
            onPress={async () => {
              await scheduleTestNotification(settings);
              Alert.alert(
                '⏰ Test Alarm Scheduled',
                'Lock your phone and put it on Do Not Disturb.\n\nAn alarm will sound in 60 seconds.\n\nIf you hear it, prayer alarms are working correctly.',
                [{ text: 'OK' }],
              );
            }}
          >
            <Text style={styles.testAlarmText}>🔔  Test Alarm in 60 Seconds</Text>
            <Text style={styles.testAlarmSub}>Uses your Fajr sound — lock phone first</Text>
          </TouchableOpacity>

          <View style={{ height: 48 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Test alarm button
  testAlarmBtn: {
    backgroundColor: Colors.deepBlue,
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    alignItems: 'center',
  },
  testAlarmText: {
    color: '#FFFFFF', fontSize: 15, fontWeight: '700',
  },
  testAlarmSub: {
    color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 4,
  },

  screen: { flex: 1, backgroundColor: Colors.bgScreen },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  dragHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#D0D0D0', alignSelf: 'center', marginBottom: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 20, color: Colors.maroonRed, fontWeight: '700' },
  closeBtn: { padding: 4 },
  closeBtnText: { fontSize: 18, color: Colors.inkMute, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 14 },

  // Global card
  globalCard: {
    backgroundColor: '#FFFFFF', borderRadius: 14,
    padding: 14, marginBottom: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  muteBtns: { flexDirection: 'row', gap: 8 },
  muteBtn: {
    flex: 1, borderRadius: 10, borderWidth: 1.5,
    borderColor: Colors.inkMute, paddingVertical: 9, alignItems: 'center',
  },
  muteBtnOn: { borderColor: Colors.maroonRed, backgroundColor: '#FFF0F3' },
  muteBtnText: { fontSize: 11, color: Colors.inkMute, fontWeight: '600', textAlign: 'center' },
  muteBtnTextOn: { color: Colors.maroonRed },

  // Section label
  sectionLabel: {
    fontSize: 11, color: Colors.inkMute, fontWeight: '600',
    letterSpacing: 1.2, textTransform: 'uppercase',
    marginTop: 12, marginBottom: 6, paddingLeft: 2,
  },

  // Prayer rows
  prayerRow: {
    backgroundColor: '#FFFFFF', borderRadius: 14,
    padding: 14, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  fajrShuruqRow: {
    borderTopWidth: 3,
    borderTopColor: Colors.maroonRed,
  },
  jummahBorder: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.maroonRed,
  },
  prayerName: {
    fontSize: 16, color: Colors.maroonRed, fontWeight: '700',
    letterSpacing: 0.5, marginBottom: 10,
  },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  loopRow: { marginTop: 10 },
  notifyGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  soundGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' },
  ctrlLabel: { fontSize: 12, color: Colors.inkMute },

  // Offset/slider
  sliderSection: { marginTop: 12 },
  offsetLabel: { fontSize: 12, color: Colors.deepBlue, fontWeight: '600', marginBottom: 2 },
  slider: { width: '100%', height: 36 },


  // Jummah specifics
  jummahHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 10 },
  jummahSub: { fontSize: 11, color: Colors.inkMute },
  jummahChecks: { flexDirection: 'row', gap: 16, marginBottom: 12 },

  // Checkbox
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkboxBox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: Colors.inkMute,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
  },
  checkboxBoxOn: { borderColor: Colors.deepBlue, backgroundColor: Colors.deepBlue },
  checkboxTick: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', lineHeight: 16 },
  checkboxLabel: { fontSize: 13, color: Colors.ink, fontWeight: '500' },

  // Sound picker button
  pickerBtn: {
    borderWidth: 1.5, borderColor: Colors.deepBlue,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, maxWidth: 140,
  },
  pickerBtnText: { fontSize: 12, fontWeight: '600', color: Colors.deepBlue },

  // Picker modal
  pickerOverlay: {
    flex: 1, backgroundColor: 'rgba(6,57,104,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  pickerCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    width: '100%', maxWidth: 340,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, shadowRadius: 20, elevation: 12,
    overflow: 'hidden',
  },
  pickerTitle: {
    fontSize: 15, fontWeight: '700', color: Colors.maroonRed,
    textAlign: 'center', paddingTop: 14, paddingBottom: 2,
  },
  pickerHint: {
    fontSize: 11, color: Colors.inkMute, textAlign: 'center',
    paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  pickerOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  pickerOptionSelected: { backgroundColor: '#F0F5FF' },
  pickerOptionText: { fontSize: 15, color: Colors.ink },
  pickerOptionTextSel: { color: Colors.deepBlue, fontWeight: '700' },
  pickerCheck: { color: Colors.deepBlue, fontSize: 16, fontWeight: '700' },
  previewStopBtn: {
    margin: 12, padding: 10, borderRadius: 10,
    backgroundColor: '#E0132C', alignItems: 'center',
  },
  previewStopText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  pickerDoneBtn: {
    margin: 12, marginTop: 4, padding: 12, borderRadius: 10,
    backgroundColor: Colors.deepBlue, alignItems: 'center',
  },
  pickerDoneText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});
