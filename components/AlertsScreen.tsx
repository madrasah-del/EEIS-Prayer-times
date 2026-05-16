import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, Alert,
  TouchableOpacity, Switch, ScrollView, Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import {
  documentDirectory as fsDocumentDirectory,
  makeDirectoryAsync as fsMakeDirectory,
  copyAsync as fsCopy,
} from 'expo-file-system/legacy';
import { StopSoundButton } from './StopSoundButton';
import Slider from '@react-native-community/slider';
import { Colors } from '../constants/theme';
import { maxFontScale } from '../constants/scaling';
import {
  AlertSettings, PrayerAlert, OffsetAlert, JummahAlert, SoundKey,
} from '../hooks/useAlertSettings';
import {
  FAJR_SHURUQ_SOUNDS, STANDARD_SOUNDS, SoundDef,
} from '../data/soundOptions';
import {
  scheduleTestNotification,
  stopCurrentAlarm,
  pauseCurrentAlarm,
  resumeCurrentAlarm,
} from '../hooks/useNotificationScheduler';
import { AlarmState } from '../hooks/useAlarmState';
import {
  MediaItem, loadMediaLibrary, addMediaItem,
} from '../data/mediaLibrary';

const STOP_THRESHOLD_SEC = 5;

// ─── SoundPicker ──────────────────────────────────────────────────────────────

type SoundPickerProps = {
  value: SoundKey;
  options: SoundDef[];
  onChange: (key: SoundKey, customUri?: string, customName?: string) => void;
  onPreview: (file: any) => void;
  onStopPreview: () => void;
  isPlaying: boolean;
  playingDuration: number | null;
  customSoundName?: string;
};

const AUDIO_EXTENSIONS = [
  '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.opus', '.wma',
  '.mp4', '.mov', '.3gp',
];

async function pickCustomSound(): Promise<{ uri: string; name: string } | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];
    const srcUri = asset.uri;
    const fileName = asset.name ?? `custom_sound_${Date.now()}.mp3`;

    const ext = '.' + (fileName.split('.').pop() ?? '').toLowerCase();
    if (!AUDIO_EXTENSIONS.includes(ext)) {
      Alert.alert(
        'Not a supported file',
        `Please select an audio or video file (MP3, WAV, M4A, OGG, AAC, MP4, etc).\n\nSelected: ${fileName}`,
      );
      return null;
    }

    const destDir = (fsDocumentDirectory ?? '') + 'custom_sounds/';
    await fsMakeDirectory(destDir, { intermediates: true });
    const destUri = destDir + fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    await fsCopy({ from: srcUri, to: destUri });
    return { uri: destUri, name: fileName };
  } catch (err: any) {
    Alert.alert('File error', err?.message ?? 'Could not copy file. Try again.');
    return null;
  }
}

function SoundPicker({
  value, options, onChange, onPreview, onStopPreview, isPlaying, playingDuration, customSoundName,
}: SoundPickerProps) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);

  useEffect(() => {
    if (open) loadMediaLibrary().then(setMediaItems);
  }, [open]);

  const handleSelect = useCallback((def: SoundDef) => {
    onChange(def.key);
    if (def.file) {
      onPreview(def.file);
    } else {
      onStopPreview();
    }
  }, [onChange, onPreview, onStopPreview]);

  const handlePickFromPhone = useCallback(async () => {
    setPicking(true);
    const result = await pickCustomSound();
    setPicking(false);
    if (!result) return;
    await addMediaItem(result.uri, result.name, 'file');
    onChange('custom', result.uri, result.name);
    onStopPreview();
    Alert.alert('Custom sound saved', `"${result.name}" will play for this prayer.`);
  }, [onChange, onStopPreview]);

  const handleClose = () => {
    onStopPreview();
    setOpen(false);
  };

  const displayLabel = value === 'custom' && customSoundName
    ? `🎵 ${customSoundName}`
    : (options.find(o => o.key === value)?.label ?? 'No Sound');
  const showInlineStop = isPlaying && playingDuration !== null && playingDuration > STOP_THRESHOLD_SEC;

  return (
    <>
      <TouchableOpacity style={styles.pickerBtn} onPress={() => setOpen(true)}>
        <Text style={styles.pickerBtnText} numberOfLines={1}>{displayLabel} ▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={handleClose}>
        <Pressable style={styles.pickerOverlay} onPress={handleClose}>
          <Pressable style={styles.pickerCard} onPress={() => {}}>

            <Text style={styles.pickerTitle}>Select Sound</Text>
            <Text style={styles.pickerHint}>Tap a sound to hear a 4-second preview</Text>

            {/* Scrollable list — keeps Done button always visible */}
            <ScrollView style={styles.pickerScroll} bounces={false} showsVerticalScrollIndicator={false}>

              {/* ── My Media library items (uploaded files only) ── */}
              {mediaItems.length > 0 && (
                <>
                  <Text style={styles.pickerSectionLabel}>MY MEDIA</Text>
                  {mediaItems.map(item => {
                    const isSelected = value === 'custom' && customSoundName === item.name;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.pickerOption, isSelected && styles.pickerOptionSelected]}
                        onPress={() => {
                          onChange('custom', item.uri, item.name);
                          onStopPreview();
                        }}
                      >
                        <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextSel]} numberOfLines={1}>
                          🎵 {item.name}
                        </Text>
                        {isSelected && <Text style={styles.pickerCheck}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })}
                  <Text style={styles.pickerSectionLabel}>BUILT-IN SOUNDS</Text>
                </>
              )}

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

              {value === 'custom' && customSoundName ? (
                <View style={styles.customSoundActive}>
                  <Text style={styles.customSoundActiveText}>🎵 {customSoundName}</Text>
                </View>
              ) : null}

            </ScrollView>

            {/* ── From phone — always visible below the scroll list ── */}
            <TouchableOpacity
              style={[styles.fromPhoneBtn, picking && { opacity: 0.5 }]}
              onPress={handlePickFromPhone}
              disabled={picking}
              activeOpacity={0.8}
            >
              <Text style={styles.fromPhoneBtnText}>
                {picking ? '⏳  Picking file...' : '🎵  Add from My Phone...'}
              </Text>
            </TouchableOpacity>

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

// ─── EffectChip ──────────────────────────────────────────────────────────────

function EffectChip({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <TouchableOpacity
      style={[styles.effectChip, checked && styles.effectChipOn]}
      onPress={() => onChange(!checked)}
      activeOpacity={0.7}
    >
      <Text style={[styles.effectChipText, checked && styles.effectChipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── EffectsTick — per-prayer effects row ─────────────────────────────────────

type EffectsTickProps = {
  prayer: { splashEnabled: boolean; flashEnabled: boolean; vibrateEnabled: boolean; loopEnabled: boolean; quotesEnabled: boolean };
  onUpdate: (patch: object) => void;
};

function EffectsTick({ prayer, onUpdate }: EffectsTickProps) {
  return (
    <View style={styles.effectsRow}>
      <EffectChip label="📱⚡ Screen"  checked={prayer.splashEnabled}  onChange={v => onUpdate({ splashEnabled: v })} />
      <EffectChip label="📸 Flash"    checked={prayer.flashEnabled}   onChange={v => onUpdate({ flashEnabled: v })} />
      <EffectChip label="📳 Vibrate"  checked={prayer.vibrateEnabled} onChange={v => onUpdate({ vibrateEnabled: v })} />
      <EffectChip label="🔁 Loop"     checked={prayer.loopEnabled}    onChange={v => onUpdate({ loopEnabled: v })} />
      <EffectChip label="📖 Quotes"   checked={prayer.quotesEnabled}  onChange={v => onUpdate({ quotesEnabled: v })} />
    </View>
  );
}

// ─── Section separator ───────────────────────────────────────────────────────

function SectionLabel({ title }: { title: string }) {
  return <Text style={styles.sectionLabel}>{title}</Text>;
}

// ─── Standard prayer row ──────────────────────────────────────────────────────

type SoundHandler = (k: SoundKey, customUri?: string, customName?: string) => void;

type StandardRowProps = {
  name: string;
  alert: PrayerAlert;
  onToggle: (v: boolean) => void;
  onSound: SoundHandler;
  onUpdate: (patch: Partial<PrayerAlert>) => void;
  onOffset?: (v: number) => void;
  offsetPrefix?: string;
  maxOffset?: number;
  onPreview: (file: any) => void;
  onStopPreview: () => void;
  isPlaying: boolean;
  playingDuration: number | null;
  fontsLoaded: boolean;
  useJamaat?: boolean;
  onUseJamaatChange?: (v: boolean) => void;
};

function StandardRow({
  name, alert, onToggle, onSound, onUpdate, onOffset, offsetPrefix, maxOffset,
  onPreview, onStopPreview, isPlaying, playingDuration, fontsLoaded,
  useJamaat, onUseJamaatChange,
}: StandardRowProps) {
  const bold = fontsLoaded ? 'Poppins_700Bold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular' : undefined;
  return (
    <View style={styles.prayerRow}>
      <View style={styles.prayerNameRow}>
        <View style={styles.prayerNameLeft}>
          <Text style={[styles.prayerName, { fontFamily: bold }]}>{name}</Text>
          {onUseJamaatChange != null && (
            <View style={styles.jamaatPills}>
              <TouchableOpacity
                style={[styles.jamaatPill, !useJamaat && styles.jamaatPillActive]}
                onPress={() => onUseJamaatChange(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.jamaatPillText, !useJamaat && styles.jamaatPillTextActive]}>Begin Time</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.jamaatPill, useJamaat && styles.jamaatPillActive]}
                onPress={() => onUseJamaatChange(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.jamaatPillText, useJamaat && styles.jamaatPillTextActive]}>Jama't Time</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        {onUseJamaatChange != null && (
          <Text style={styles.selectHint}>← select</Text>
        )}
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
            customSoundName={alert.customSoundName}
          />
        </View>
      </View>
      <EffectsTick prayer={alert} onUpdate={onUpdate} />

      {useJamaat && onOffset != null && offsetPrefix != null && (maxOffset ?? 0) > 0 && (
        <View style={styles.sliderSection}>
          <OffsetLabel minutes={alert.offsetMinutes ?? 0} prefix={offsetPrefix} />
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={maxOffset ?? 60}
            step={5}
            value={alert.offsetMinutes ?? 0}
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

// ─── Fajr/Shuruq row ─────────────────────────────────────────────────────────

type FajrShuruqRowProps = {
  name: string;
  alert: OffsetAlert;
  maxOffset?: number;
  offsetPrefix?: string;
  showOffset: boolean;
  onToggle: (v: boolean) => void;
  onSound: SoundHandler;
  onUpdate: (patch: Partial<OffsetAlert>) => void;
  onOffset?: (v: number) => void;
  onPreview: (file: any) => void;
  onStopPreview: () => void;
  isPlaying: boolean;
  playingDuration: number | null;
  fontsLoaded: boolean;
  useJamaat?: boolean;
  onUseJamaatChange?: (v: boolean) => void;
};

function FajrShuruqRow({
  name, alert, maxOffset, offsetPrefix, showOffset,
  onToggle, onSound, onUpdate, onOffset,
  onPreview, onStopPreview, isPlaying, playingDuration, fontsLoaded,
  useJamaat, onUseJamaatChange,
}: FajrShuruqRowProps) {
  const bold = fontsLoaded ? 'Poppins_700Bold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular' : undefined;
  return (
    <View style={[styles.prayerRow, styles.fajrShuruqRow]}>
      <View style={styles.prayerNameRow}>
        <View style={styles.prayerNameLeft}>
          <Text style={[styles.prayerName, { fontFamily: bold }]}>{name}</Text>
          {onUseJamaatChange != null && (
            <View style={styles.jamaatPills}>
              <TouchableOpacity
                style={[styles.jamaatPill, !useJamaat && styles.jamaatPillActive]}
                onPress={() => onUseJamaatChange(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.jamaatPillText, !useJamaat && styles.jamaatPillTextActive]}>Begin Time</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.jamaatPill, useJamaat && styles.jamaatPillActive]}
                onPress={() => onUseJamaatChange(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.jamaatPillText, useJamaat && styles.jamaatPillTextActive]}>Jama't Time</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        {onUseJamaatChange != null && (
          <Text style={styles.selectHint}>← select</Text>
        )}
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
            options={FAJR_SHURUQ_SOUNDS}
            onChange={onSound}
            onPreview={onPreview}
            onStopPreview={onStopPreview}
            isPlaying={isPlaying}
            playingDuration={playingDuration}
            customSoundName={alert.customSoundName}
          />
        </View>
      </View>

      <EffectsTick prayer={alert} onUpdate={onUpdate} />

      {showOffset && maxOffset != null && offsetPrefix != null && onOffset != null && (
        <View style={styles.sliderSection}>
          <OffsetLabel minutes={alert.offsetMinutes} prefix={offsetPrefix} />
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={maxOffset}
            step={5}
            value={alert.offsetMinutes}
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
  onSound: SoundHandler;
  onUpdate: (patch: Partial<JummahAlert>) => void;
  onOffset: (v: number) => void;
  onPreview: (file: any) => void;
  onStopPreview: () => void;
  isPlaying: boolean;
  playingDuration: number | null;
  fontsLoaded: boolean;
};

function JummahRow({
  alert, onJamaat1, onJamaat2, onToggle, onSound, onUpdate, onOffset,
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
            customSoundName={alert.customSoundName}
          />
        </View>
      </View>
      <EffectsTick prayer={alert} onUpdate={onUpdate} />
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
  alarmState?: AlarmState;
};

export function AlertsScreen({
  visible, settings, onUpdate, onUpdatePrayer, onClose,
  onPreview, onStopPreview, isPlaying, playingDuration, fontsLoaded,
  alarmState,
}: Props) {
  const bold = fontsLoaded ? 'Poppins_700Bold' : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular' : undefined;

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

        {/* Native alarm banner */}
        {alarmState && (alarmState.isPlaying || alarmState.isPaused) && (
          <View style={styles.alarmBanner}>
            <View style={styles.alarmBannerInfo}>
              <Text style={styles.alarmBannerIcon}>🕌</Text>
              <View>
                <Text style={styles.alarmBannerTitle}>
                  {alarmState.prayerName} Prayer Time
                </Text>
                <Text style={styles.alarmBannerSub}>
                  {alarmState.isPaused ? 'Paused — tap ▶ to resume' : 'Adhan is playing'}
                </Text>
              </View>
            </View>
            <View style={styles.alarmBannerBtns}>
              <TouchableOpacity
                style={styles.alarmBannerBtn}
                onPress={() => alarmState.isPaused ? resumeCurrentAlarm() : pauseCurrentAlarm()}
                activeOpacity={0.7}
              >
                <Text style={styles.alarmBannerBtnText}>
                  {alarmState.isPaused ? '▶  Resume' : '⏸  Pause'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.alarmBannerBtn, styles.alarmBannerStop]}
                onPress={() => stopCurrentAlarm()}
                activeOpacity={0.7}
              >
                <Text style={styles.alarmBannerBtnText}>⏹  Stop</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Floating stop button for sound preview */}
        <StopSoundButton
          visible={isPlaying}
          onStop={onStopPreview}
          fontsLoaded={fontsLoaded}
        />

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {/* Global controls */}
          <View style={styles.globalCard}>
            <SectionLabel title="Global Controls" />

            <Text style={[styles.ctrlLabel, { fontFamily: reg }]}>
              🔤  Prayer Text Size
            </Text>

            <View style={styles.fontPreviewCard}>
              <Text style={[styles.fontPreviewName, { fontFamily: bold, fontSize: Math.round(13 * (settings.fontScale ?? 1)) }]}>
                FAJR
              </Text>
              <View style={styles.fontPreviewCol}>
                <Text style={[styles.fontPreviewLabel, { fontFamily: bold, fontSize: Math.round(8 * (settings.fontScale ?? 1)) }]}>BEGINS</Text>
                <Text style={[styles.fontPreviewTime, { fontFamily: bold, fontSize: Math.round(19 * (settings.fontScale ?? 1)) }]}>04:00</Text>
              </View>
              <View style={styles.fontPreviewCol}>
                <Text style={[styles.fontPreviewLabel, { fontFamily: bold, fontSize: Math.round(8 * (settings.fontScale ?? 1)) }]}>JAMA'AT</Text>
                <View style={styles.fontPreviewChangedWrap}>
                  <Text style={[styles.fontPreviewTime, { fontFamily: bold, fontSize: Math.round(19 * (settings.fontScale ?? 1)) }]}>04:45</Text>
                </View>
              </View>
            </View>

            <View style={styles.fontScaleLabels}>
              {(['Medium', 'Large'] as const).map((label, i) => {
                const stops = [1.0, maxFontScale];
                return (
                  <TouchableOpacity
                    key={label}
                    onPress={() => onUpdate({ fontScale: stops[i] })}
                    style={styles.fontScaleLabelBtn}
                  >
                    <Text style={[
                      styles.fontScaleLabelText,
                      { fontFamily: semi },
                      Math.abs((settings.fontScale ?? 1) - stops[i]) < 0.05 && styles.fontScaleLabelActive,
                    ]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Slider
              style={[styles.slider, { marginBottom: 12 }]}
              minimumValue={1.0}
              maximumValue={maxFontScale}
              step={0.025}
              value={Math.max(1.0, Math.min(maxFontScale, settings.fontScale ?? 1.0))}
              onValueChange={v => onUpdate({ fontScale: v })}
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
            alert={settings.fajr as unknown as OffsetAlert}
            showOffset={(settings.fajr as any).useJamaat ?? false}
            useJamaat={(settings.fajr as any).useJamaat ?? false}
            onUseJamaatChange={v => onUpdatePrayer('fajr', { useJamaat: v } as any)}
            onOffset={v => onUpdatePrayer('fajr', { offsetMinutes: v } as any)}
            maxOffset={90}
            offsetPrefix="Jama't"
            onToggle={v => onUpdatePrayer('fajr', { notifyEnabled: v })}
            onSound={(k, uri, name) => onUpdatePrayer('fajr', { sound: k, customSoundUri: uri, customSoundName: name })}
            onUpdate={patch => onUpdatePrayer('fajr', patch)}
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
            onSound={(k, uri, name) => onUpdatePrayer('shuruq', { sound: k, customSoundUri: uri, customSoundName: name })}
            onUpdate={patch => onUpdatePrayer('shuruq', patch)}
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
            useJamaat={(settings.dhuhr as any).useJamaat ?? false}
            onUseJamaatChange={v => onUpdatePrayer('dhuhr', { useJamaat: v } as any)}
            onToggle={v => onUpdatePrayer('dhuhr', { notifyEnabled: v })}
            onSound={(k, uri, name) => onUpdatePrayer('dhuhr', { sound: k, customSoundUri: uri, customSoundName: name })}
            onUpdate={patch => onUpdatePrayer('dhuhr', patch)}
            onOffset={v => onUpdatePrayer('dhuhr', { offsetMinutes: v })}
            offsetPrefix="Jama'at"
            maxOffset={90}
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
            useJamaat={(settings.asr as any).useJamaat ?? false}
            onUseJamaatChange={v => onUpdatePrayer('asr', { useJamaat: v } as any)}
            onToggle={v => onUpdatePrayer('asr', { notifyEnabled: v })}
            onSound={(k, uri, name) => onUpdatePrayer('asr', { sound: k, customSoundUri: uri, customSoundName: name })}
            onUpdate={patch => onUpdatePrayer('asr', patch)}
            onOffset={v => onUpdatePrayer('asr', { offsetMinutes: v })}
            offsetPrefix="Jama'at"
            maxOffset={90}
            onPreview={onPreview}
            onStopPreview={onStopPreview}
            isPlaying={isPlaying}
            playingDuration={playingDuration}
            fontsLoaded={fontsLoaded}
          />

          {/* Maghrib — single jamaat time, slider always shown (default 0 min) */}
          <StandardRow
            name="MAGHRIB"
            alert={settings.maghrib}
            useJamaat={true}
            onToggle={v => onUpdatePrayer('maghrib', { notifyEnabled: v })}
            onSound={(k, uri, name) => onUpdatePrayer('maghrib', { sound: k, customSoundUri: uri, customSoundName: name })}
            onUpdate={patch => onUpdatePrayer('maghrib', patch)}
            onOffset={v => onUpdatePrayer('maghrib', { offsetMinutes: v })}
            offsetPrefix="Maghrib"
            maxOffset={60}
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
            useJamaat={(settings.isha as any).useJamaat ?? false}
            onUseJamaatChange={v => onUpdatePrayer('isha', { useJamaat: v } as any)}
            onToggle={v => onUpdatePrayer('isha', { notifyEnabled: v })}
            onSound={(k, uri, name) => onUpdatePrayer('isha', { sound: k, customSoundUri: uri, customSoundName: name })}
            onUpdate={patch => onUpdatePrayer('isha', patch)}
            onOffset={v => onUpdatePrayer('isha', { offsetMinutes: v })}
            offsetPrefix="Jama'at"
            maxOffset={90}
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
            onSound={(k, uri, name) => onUpdatePrayer('jummah', { sound: k, customSoundUri: uri, customSoundName: name })}
            onUpdate={patch => onUpdatePrayer('jummah', patch)}
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
                'Lock your phone and put it on Do Not Disturb.\n\nAn alarm will sound in 15 seconds.\n\nIf you hear it, prayer alarms are working correctly.',
                [{ text: 'OK' }],
              );
            }}
          >
            <Text style={styles.testAlarmText}>🔔  Test Alarm in 15 Seconds</Text>
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

  sectionLabel: {
    fontSize: 11, color: Colors.inkMute, fontWeight: '600',
    letterSpacing: 1.2, textTransform: 'uppercase',
    marginTop: 12, marginBottom: 6, paddingLeft: 2,
  },

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
    letterSpacing: 0.5,
  },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  notifyGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  soundGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' },
  ctrlLabel: { fontSize: 12, color: Colors.inkMute },

  // Effects tick row
  effectsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    marginTop: 10,
  },
  effectChip: {
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1.5, borderColor: '#D0D0D0', backgroundColor: '#F5F5F5',
  },
  effectChipOn: {
    borderColor: Colors.deepBlue, backgroundColor: '#EEF5FF',
  },
  effectChipText: {
    fontSize: 11, fontWeight: '600', color: Colors.inkMute,
  },
  effectChipTextOn: {
    color: Colors.deepBlue,
  },

  sliderSection: { marginTop: 12 },
  offsetLabel: { fontSize: 12, color: Colors.deepBlue, fontWeight: '600', marginBottom: 2 },
  slider: { width: '100%', height: 36 },

  fontPreviewCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F5F5F5', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    marginTop: 8, marginBottom: 6, gap: 4,
    borderWidth: 1, borderColor: '#E0E0E0',
  },
  fontPreviewName: {
    width: 70, color: Colors.maroonRed, fontWeight: '700', letterSpacing: 0.1,
  },
  fontPreviewCol: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  fontPreviewLabel: {
    color: Colors.inkMute, fontWeight: '700', letterSpacing: 0.8, lineHeight: 12,
  },
  fontPreviewTime: {
    color: Colors.deepBlue, fontWeight: '800', letterSpacing: -0.3,
  },
  fontPreviewChangedWrap: {
    borderWidth: 2, borderColor: Colors.maroonRed,
    borderRadius: 6, paddingVertical: 2,
    alignItems: 'center',
  },
  fontScaleLabels: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2,
  },
  fontScaleLabelBtn: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  fontScaleLabelText: { fontSize: 11, color: Colors.inkMute },
  fontScaleLabelActive: { color: Colors.deepBlue, fontWeight: '700' },

  jummahHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 10 },
  jummahSub: { fontSize: 11, color: Colors.inkMute },
  jummahChecks: { flexDirection: 'row', gap: 16, marginBottom: 12 },

  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkboxBox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: Colors.inkMute,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
  },
  checkboxBoxOn: { borderColor: Colors.deepBlue, backgroundColor: Colors.deepBlue },
  checkboxTick: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', lineHeight: 16 },
  checkboxLabel: { fontSize: 13, color: Colors.ink, fontWeight: '500' },

  pickerBtn: {
    borderWidth: 1.5, borderColor: Colors.deepBlue,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, maxWidth: 140,
  },
  pickerBtnText: { fontSize: 12, fontWeight: '600', color: Colors.deepBlue },

  pickerOverlay: {
    flex: 1, backgroundColor: 'rgba(6,57,104,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  pickerCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    width: '100%', maxWidth: 340,
    maxHeight: '80%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, shadowRadius: 20, elevation: 12,
    overflow: 'hidden',
  },
  pickerScroll: {
    maxHeight: 280,
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
  pickerSectionLabel: {
    fontSize: 10, fontWeight: '700', color: Colors.inkMute,
    letterSpacing: 1.0, textTransform: 'uppercase',
    marginHorizontal: 12, marginTop: 10, marginBottom: 2,
  },
  fromPhoneBtn: {
    marginHorizontal: 12, marginTop: 8, padding: 12, borderRadius: 10,
    backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#D0D0D0',
    borderStyle: 'dashed', alignItems: 'center',
  },
  fromPhoneBtnText: { color: Colors.deepBlue, fontWeight: '600', fontSize: 14 },
  customSoundActive: {
    marginHorizontal: 12, marginTop: 8, padding: 10, borderRadius: 8,
    backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: Colors.freshGreen,
  },
  customSoundActiveText: { color: '#1B5E20', fontWeight: '600', fontSize: 13, textAlign: 'center' },

  alarmBanner: {
    backgroundColor: Colors.blueDeep,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 12,
    borderBottomWidth: 3,
    borderBottomColor: Colors.maroonRed,
  },
  alarmBannerInfo: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  alarmBannerIcon: { fontSize: 32 },
  alarmBannerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  alarmBannerSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },
  alarmBannerBtns: { flexDirection: 'row', gap: 10 },
  alarmBannerBtn: {
    flex: 1, height: 52, borderRadius: 12,
    backgroundColor: Colors.deepBlue,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  alarmBannerStop: { backgroundColor: Colors.maroonRed, borderWidth: 0 },
  alarmBannerBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  prayerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  prayerNameLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  selectHint: {
    fontSize: 10,
    color: Colors.inkMute,
    fontStyle: 'italic',
    marginLeft: 4,
  },
  jamaatPills: {
    flexDirection: 'row',
    gap: 4,
  },
  jamaatPill: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1.5,
    borderColor: '#D0D0D0',
    backgroundColor: '#F5F5F5',
  },
  jamaatPillActive: {
    borderColor: Colors.deepBlue,
    backgroundColor: Colors.deepBlue,
  },
  jamaatPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.inkMute,
  },
  jamaatPillTextActive: {
    color: '#FFFFFF',
  },
});
