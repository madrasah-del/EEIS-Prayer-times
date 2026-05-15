/**
 * PermissionsWizard — first-launch modal guiding the user through
 * the Android permissions needed for reliable prayer alarms.
 *
 * Steps (all Android):
 *   1. Notifications          — POST_NOTIFICATIONS (required on Android 13+)
 *   2. Exact Alarms           — SCHEDULE_EXACT_ALARM (Android 12 only)
 *   3. Battery Optimisation   — REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
 *   4. Full Screen Intent     — USE_FULL_SCREEN_INTENT (Android 14+)
 *
 * Steps are hidden automatically if the platform or Android version
 * makes them irrelevant (e.g. step 4 never shows on Android < 14).
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as IntentLauncher from 'expo-intent-launcher';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/theme';

const STORAGE_KEY = '@eeis_perms_wizard_done_v2';

// ─── Step definitions ─────────────────────────────────────────────────────────

type Step = {
  id: string;
  icon: string;
  title: string;
  body: string;
  btnLabel: string;
  onGrant: () => Promise<void>;
  shouldShow: () => boolean;
};

const STEPS: Step[] = [
  {
    id: 'notifications',
    icon: '🔔',
    title: 'Allow Notifications',
    body: 'Prayer time alerts and adhan reminders need notification permission to appear on your screen.',
    btnLabel: 'Allow Notifications',
    shouldShow: () => Platform.OS === 'android',
    onGrant: async () => {
      await Notifications.requestPermissionsAsync();
    },
  },
  {
    id: 'exact-alarms',
    icon: '⏰',
    title: 'Precise Prayer Alarms',
    body: 'Android 12 requires special permission to set alarms that fire at exactly the right prayer time. Without this, alarms may be minutes late.',
    btnLabel: 'Allow Exact Alarms',
    shouldShow: () => {
      if (Platform.OS !== 'android') return false;
      const version = Platform.Version as number;
      return version === 31 || version === 32;
    },
    onGrant: async () => {
      try {
        await IntentLauncher.startActivityAsync(
          'android.settings.REQUEST_SCHEDULE_EXACT_ALARM',
          {},
        );
      } catch {
        // Settings page not available on this device — silently skip
      }
    },
  },
  {
    id: 'battery',
    icon: '🔋',
    title: 'Unrestricted Battery Usage',
    body: 'Android and Samsung may kill background apps to save battery. This prevents alarms from sounding. Tap Allow to exempt EEIS from battery restrictions.',
    btnLabel: 'Allow Background Activity',
    shouldShow: () => Platform.OS === 'android',
    onGrant: async () => {
      try {
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
          { data: 'package:com.eeis.prayertimes' },
        );
      } catch {
        // Fallback silently
      }
    },
  },
  {
    id: 'full-screen',
    icon: '📱',
    title: 'Full Screen Alarm',
    body: 'Android 14+ requires permission to show the alarm screen over your lock screen. Without this, the prayer name and times will not appear when the phone is locked.',
    btnLabel: 'Grant Full Screen Permission',
    shouldShow: () => {
      if (Platform.OS !== 'android') return false;
      const version = Platform.Version as number;
      return version >= 34;
    },
    onGrant: async () => {
      try {
        await IntentLauncher.startActivityAsync(
          'android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT',
          { data: 'package:com.eeis.prayertimes' },
        );
      } catch {
        // Silently skip
      }
    },
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  visible: boolean;
  onDone: () => void;
};

export function PermissionsWizard({ visible, onDone }: Props) {
  const activeSteps = STEPS.filter(s => s.shouldShow());
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (visible) setStepIndex(0);
  }, [visible]);

  if (!visible || activeSteps.length === 0) return null;

  const step = activeSteps[stepIndex];
  const isLast = stepIndex === activeSteps.length - 1;
  const progress = stepIndex + 1;
  const total = activeSteps.length;

  const handleGrant = async () => {
    await step.onGrant();
    advance();
  };

  const advance = () => {
    if (isLast) {
      onDone();
    } else {
      setStepIndex(i => i + 1);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Set Up Prayer Alarms</Text>
            <Text style={styles.headerProgress}>{progress} of {total}</Text>
          </View>

          {/* Progress bar */}
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${(progress / total) * 100}%` as any }]} />
          </View>

          {/* Step card */}
          <View style={styles.card}>
            <Text style={styles.stepIcon}>{step.icon}</Text>
            <Text style={styles.stepTitle}>{step.title}</Text>
            <Text style={styles.stepBody}>{step.body}</Text>

            <TouchableOpacity style={styles.grantBtn} onPress={handleGrant} activeOpacity={0.85}>
              <Text style={styles.grantBtnText}>{step.btnLabel}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.skipBtn} onPress={advance} activeOpacity={0.7}>
              <Text style={styles.skipBtnText}>{isLast ? 'Finish' : 'Skip for now'}</Text>
            </TouchableOpacity>
          </View>

          {/* Dots */}
          <View style={styles.dots}>
            {activeSteps.map((_, i) => (
              <View key={i} style={[styles.dot, i === stepIndex && styles.dotActive]} />
            ))}
          </View>

          <Text style={styles.footNote}>
            You can change these settings later in Android Settings → Apps → EEIS Prayer Times.
          </Text>

        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ─── AsyncStorage helpers (called from App.tsx) ───────────────────────────────

export async function shouldShowPermissionsWizard(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  // Show if wizard not completed yet (new installs or v18 update — key bumped to v2)
  const done = await AsyncStorage.getItem(STORAGE_KEY);
  if (!done) return true;
  // Also show if notifications were revoked after wizard was completed
  const { status } = await Notifications.getPermissionsAsync();
  return status !== 'granted';
}

export async function markPermissionsWizardDone(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, 'true');
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.bgScreen,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.ink,
  },
  headerProgress: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.inkMute,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    marginBottom: 24,
  },
  progressBarFill: {
    height: 4,
    backgroundColor: Colors.deepBlue,
    borderRadius: 2,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  stepIcon: {
    fontSize: 52,
    marginBottom: 12,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.ink,
    textAlign: 'center',
    marginBottom: 12,
  },
  stepBody: {
    fontSize: 14,
    fontWeight: '400',
    color: Colors.inkMute,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  grantBtn: {
    backgroundColor: Colors.deepBlue,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  grantBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  skipBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
  },
  skipBtnText: {
    color: Colors.inkMute,
    fontSize: 14,
    fontWeight: '500',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 20,
    paddingBottom: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D0D0D0',
  },
  dotActive: {
    backgroundColor: Colors.deepBlue,
    width: 20,
  },
  footNote: {
    fontSize: 11,
    color: Colors.inkMute,
    textAlign: 'center',
    paddingVertical: 12,
    lineHeight: 16,
  },
});
