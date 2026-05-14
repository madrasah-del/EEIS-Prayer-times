/**
 * useAlarmState — tracks the live playback state of EeisAlarmService.
 *
 * On Android: syncs initial state from the native module, then subscribes to
 * DeviceEventEmitter 'EeisAlarmStateChange' events emitted by EeisAlarmService
 * whenever play/pause/stop happens (from the service, from a notification button,
 * or from the lock screen dismiss button).
 *
 * On iOS: always returns the initial (idle) state — native alarm module is
 * Android-only. iOS uses expo-notifications which doesn't need this hook.
 *
 * Usage:
 *   const alarm = useAlarmState();
 *   // alarm.isPlaying — sound is actively playing
 *   // alarm.isPaused  — sound is paused (service still running, notification still showing)
 *   // alarm.prayerName — e.g. "Fajr"
 */

import { useEffect, useState } from 'react';
import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';

export interface AlarmState {
  isPlaying:  boolean;
  isPaused:   boolean;
  prayerName: string;
}

const IDLE: AlarmState = { isPlaying: false, isPaused: false, prayerName: '' };

const EeisAlarm = NativeModules.EeisAlarm as
  | { getAlarmState(): Promise<AlarmState> }
  | undefined;

export function useAlarmState(): AlarmState {
  const [state, setState] = useState<AlarmState>(IDLE);

  useEffect(() => {
    if (Platform.OS !== 'android' || !EeisAlarm) return;

    // Sync initial state — e.g. alarm already playing when the component mounts
    EeisAlarm.getAlarmState()
      .then(s => { if (s) setState(s); })
      .catch(() => {});

    // Subscribe to live state changes from the service
    const sub = DeviceEventEmitter.addListener(
      'EeisAlarmStateChange',
      (event: { state: 'playing' | 'paused' | 'stopped'; prayerName: string }) => {
        setState({
          isPlaying:  event.state === 'playing',
          isPaused:   event.state === 'paused',
          prayerName: event.prayerName ?? '',
        });
      },
    );

    return () => sub.remove();
  }, []);

  return state;
}
