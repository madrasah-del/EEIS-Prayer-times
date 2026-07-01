import { useRef, useCallback, useState } from 'react';
import { Audio } from 'expo-av';

const STOP_BUTTON_THRESHOLD_SEC = 5;

export type AudioPlayerState = {
  isPlaying: boolean;
  isLooping: boolean;
  durationSec: number | null;
  showStopButton: boolean; // true when playing and (loop OR duration > 5s)
};

export function useAudioPlayer() {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playerState, setPlayerState] = useState<AudioPlayerState>({
    isPlaying: false,
    isLooping: false,
    durationSec: null,
    showStopButton: false,
  });
  // Paused state (for the alarm card's Pause/Resume button). Kept separate so the existing
  // playerState resets don't all need editing.
  const [isPaused, setIsPaused] = useState(false);

  const stop = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {}
      soundRef.current = null;
    }
    setIsPaused(false);
    setPlayerState({ isPlaying: false, isLooping: false, durationSec: null, showStopButton: false });
  }, []);

  // Pause / resume the currently-playing sound (used by the alarm card).
  const pause = useCallback(async () => {
    if (soundRef.current) { try { await soundRef.current.pauseAsync(); setIsPaused(true); } catch {} }
  }, []);
  const resume = useCallback(async () => {
    if (soundRef.current) { try { await soundRef.current.playAsync(); setIsPaused(false); } catch {} }
  }, []);

  const play = useCallback(async (
    file: any,
    volume: number,
    loop: boolean = false,
    // Elapsed ms since the alarm's true fire time. iOS has no API to pause/resume the
    // OS-played lock-screen notification sound, so this in-app playback is a NEW instance —
    // but seeking it to the elapsed offset makes it feel continuous rather than restarting.
    // If the (non-looping) sound would already have finished, we skip playing it at all.
    startAtMs: number = 0,
  ) => {
    if (!file) return;

    try {
      await stop();
      setIsPaused(false);
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const { sound, status } = await Audio.Sound.createAsync(
        file,
        { shouldPlay: false, volume: Math.min(Math.max(volume, 0), 1), isLooping: loop },
      );

      const durationMs = status.isLoaded && status.durationMillis ? status.durationMillis : null;

      if (startAtMs > 0 && durationMs) {
        if (loop) {
          await sound.setPositionAsync(startAtMs % durationMs);
        } else if (startAtMs >= durationMs) {
          // Already finished naturally — don't replay it from the start.
          await sound.unloadAsync();
          setPlayerState({ isPlaying: false, isLooping: false, durationSec: null, showStopButton: false });
          return;
        } else {
          await sound.setPositionAsync(startAtMs);
        }
      }

      soundRef.current = sound;
      await sound.playAsync();

      const durationSec = durationMs ? durationMs / 1000 : null;
      const showStop = loop || (durationSec !== null && durationSec > STOP_BUTTON_THRESHOLD_SEC);

      setPlayerState({
        isPlaying: true,
        isLooping: loop,
        durationSec,
        showStopButton: showStop,
      });

      sound.setOnPlaybackStatusUpdate(s => {
        if (!s.isLoaded) return;
        if (s.didJustFinish && !loop) {
          soundRef.current = null;
          setPlayerState({ isPlaying: false, isLooping: false, durationSec: null, showStopButton: false });
        }
      });
    } catch (e) {
      console.warn('[AudioPlayer] play error:', e);
      setPlayerState({ isPlaying: false, isLooping: false, durationSec: null, showStopButton: false });
    }
  }, [stop]);

  // Preview: plays for up to 4 seconds, then auto-stops (unless sound is shorter)
  const preview = useCallback(async (file: any, volume: number) => {
    if (!file) return;

    try {
      await stop();
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });

      const { sound, status } = await Audio.Sound.createAsync(
        file,
        { shouldPlay: true, volume: Math.min(Math.max(volume, 0), 1) },
      );
      soundRef.current = sound;

      const durationSec = status.isLoaded && status.durationMillis
        ? status.durationMillis / 1000
        : null;

      const isLong = durationSec !== null && durationSec > STOP_BUTTON_THRESHOLD_SEC;
      setPlayerState({
        isPlaying: true,
        isLooping: false,
        durationSec,
        showStopButton: isLong,
      });

      sound.setOnPlaybackStatusUpdate(s => {
        if (!s.isLoaded) return;
        if (s.didJustFinish) {
          soundRef.current = null;
          setPlayerState({ isPlaying: false, isLooping: false, durationSec: null, showStopButton: false });
        }
      });

      // Auto-stop after 4 seconds if sound is longer
      if (durationSec === null || durationSec > 4) {
        setTimeout(async () => {
          // Only stop if this same sound is still playing (not replaced by another)
          if (soundRef.current === sound) {
            await stop();
          }
        }, 4000);
      }
    } catch (e) {
      console.warn('[AudioPlayer] preview error:', e);
      setPlayerState({ isPlaying: false, isLooping: false, durationSec: null, showStopButton: false });
    }
  }, [stop]);

  return { play, preview, stop, pause, resume, isPaused, playerState };
}
