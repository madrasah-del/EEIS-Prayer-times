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

  const stop = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {}
      soundRef.current = null;
    }
    setPlayerState({ isPlaying: false, isLooping: false, durationSec: null, showStopButton: false });
  }, []);

  const play = useCallback(async (
    file: any,
    volume: number,
    loop: boolean = false,
  ) => {
    if (!file) return;

    try {
      await stop();
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const { sound, status } = await Audio.Sound.createAsync(
        file,
        { shouldPlay: true, volume: Math.min(Math.max(volume, 0), 1), isLooping: loop },
      );
      soundRef.current = sound;

      const durationSec = status.isLoaded && status.durationMillis
        ? status.durationMillis / 1000
        : null;

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

  return { play, preview, stop, playerState };
}
