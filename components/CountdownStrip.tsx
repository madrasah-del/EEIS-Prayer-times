import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { Colors } from '../constants/theme';
import { sp } from '../constants/scaling';

// Re-exported so App.tsx can use it without importing from the deleted newsApi
export type ActiveHeadline = {
  id:        string;
  text:      string;
  linkType:  'none' | 'announcement' | 'event' | 'article';
  linkCatId?: string;
};

// ─── Phase timing ─────────────────────────────────────────────────────────────
const COUNTDOWN_DURATION_MS = 8_000;   // show countdown for 8 s
const HEADLINE_DURATION_MS  = 5_000;   // show each headline for 5 s
const FADE_MS               = 400;     // cross-fade duration

// ─── Props ────────────────────────────────────────────────────────────────────
type Props = {
  prayerName:     string;
  remaining:      string;
  fontsLoaded:    boolean;
  headlines?:     ActiveHeadline[];
  onHeadlineTap?: (h: ActiveHeadline) => void;
  countdownMode?: 'adhan' | 'iqamah';
};

// ─── Component ────────────────────────────────────────────────────────────────
export function CountdownStrip({
  prayerName,
  remaining,
  fontsLoaded,
  headlines = [],
  onHeadlineTap,
  countdownMode,
}: Props) {
  const bold = fontsLoaded ? 'Poppins_700Bold' : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;

  // phase: 'countdown' | number (index into headlines)
  const [phase, setPhase]   = useState<'countdown' | number>('countdown');
  const phaseRef            = useRef<'countdown' | number>('countdown');
  const opacity             = useRef(new Animated.Value(1)).current;
  const timerRef            = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cross-fade helper: fade out → update state → fade in
  const crossFadeTo = useCallback((next: 'countdown' | number) => {
    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_MS,
      useNativeDriver: true,
    }).start(() => {
      phaseRef.current = next;
      setPhase(next);
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_MS,
        useNativeDriver: true,
      }).start();
    });
  }, [opacity]);

  // Schedule the next phase transition
  const scheduleNext = useCallback((current: 'countdown' | number, activeHeadlines: ActiveHeadline[]) => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (current === 'countdown') {
      // After countdown phase, go to first headline (if any), else stay permanently on countdown
      if (activeHeadlines.length === 0) {
        return; // nothing to cycle — no timer needed
      }
      timerRef.current = setTimeout(() => {
        crossFadeTo(0);
        scheduleNext(0, activeHeadlines);
      }, COUNTDOWN_DURATION_MS);
    } else {
      // After headline phase, go to next headline or back to countdown
      const idx = current as number;
      const nextIdx = idx + 1;
      if (nextIdx < activeHeadlines.length) {
        timerRef.current = setTimeout(() => {
          crossFadeTo(nextIdx);
          scheduleNext(nextIdx, activeHeadlines);
        }, HEADLINE_DURATION_MS);
      } else {
        // Last headline → back to countdown
        timerRef.current = setTimeout(() => {
          crossFadeTo('countdown');
          scheduleNext('countdown', activeHeadlines);
        }, HEADLINE_DURATION_MS);
      }
    }
  }, [crossFadeTo]);

  // Restart cycle whenever headlines change
  useEffect(() => {
    // Reset to countdown immediately (no fade on mount)
    phaseRef.current = 'countdown';
    setPhase('countdown');
    opacity.setValue(1);
    scheduleNext('countdown', headlines);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headlines.map(h => h.id).join(',')]);

  // ─── Render content ─────────────────────────────────────────────────────────
  const isCountdown = phase === 'countdown';
  const headlineIdx = typeof phase === 'number' ? phase : -1;
  const headline    = headlineIdx >= 0 ? headlines[headlineIdx] : null;

  const handlePress = () => {
    if (headline && onHeadlineTap) {
      onHeadlineTap(headline);
    }
  };

  const modeLabel = countdownMode === 'adhan' ? 'Adhan' : countdownMode === 'iqamah' ? 'Iqamah' : null;

  const inner = (
    <View style={styles.strip}>
      {isCountdown ? (
        <>
          <ClockIcon />
          <View style={styles.countdownCol}>
            <Animated.Text
              style={[styles.text, { fontFamily: bold, opacity }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {'COUNTDOWN TO '}
              <Text style={styles.highlight}>{prayerName.toUpperCase()}</Text>
              {' · ' + remaining}
            </Animated.Text>
            {modeLabel && (
              <Animated.Text style={[styles.modeLabel, { fontFamily: semi, opacity }]}>
                {modeLabel.toUpperCase()}
              </Animated.Text>
            )}
          </View>
        </>
      ) : (
        <>
          <Animated.Text style={[styles.headlineIcon, { opacity }]}>📢</Animated.Text>
          <Animated.Text
            style={[styles.headlineText, { fontFamily: semi, opacity }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
          >
            {headline?.text ?? ''}
          </Animated.Text>
          {headline?.linkType !== 'none' && (
            <Animated.Text style={[styles.headlineTap, { fontFamily: bold, opacity }]}>›</Animated.Text>
          )}
        </>
      )}
    </View>
  );

  // Wrap in TouchableOpacity only when showing a tappable headline
  if (!isCountdown && headline && headline.linkType !== 'none' && onHeadlineTap) {
    return (
      <TouchableOpacity activeOpacity={0.75} onPress={handlePress}>
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

// ─── Clock icon ───────────────────────────────────────────────────────────────
function ClockIcon() {
  return (
    <View style={styles.clockCircle}>
      <View style={[styles.hand, styles.hourHand]} />
      <View style={[styles.hand, styles.minuteHand]} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  strip: {
    backgroundColor: Colors.freshGreen,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: sp(14),
    gap: 9,
    borderBottomWidth: 2,
    borderBottomColor: Colors.greenDark,
  },
  countdownCol: {
    flex: 1,
    gap: 1,
  },
  text: {
    color: Colors.maroonRed,
    fontSize: sp(17),
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  modeLabel: {
    fontSize: sp(10),
    color: Colors.maroonRed,
    opacity: 0.7,
    letterSpacing: 0.6,
  },
  highlight: {
    fontSize: sp(19),
    fontWeight: '800',
  },
  headlineIcon: {
    fontSize: sp(15),
    flexShrink: 0,
  },
  headlineText: {
    flex: 1,
    color: Colors.maroonRed,
    fontSize: sp(16),
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  headlineTap: {
    color: Colors.maroonRed,
    fontSize: sp(20),
    fontWeight: '700',
    flexShrink: 0,
  },
  clockCircle: {
    width: sp(16),
    height: sp(16),
    borderRadius: sp(8),
    borderWidth: 2,
    borderColor: Colors.maroonRed,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  hand: {
    position: 'absolute',
    backgroundColor: Colors.maroonRed,
    borderRadius: 1,
  },
  hourHand: {
    width: 1.5,
    height: 3.5,
    bottom: 6,
    left: 6.25,
    transform: [{ rotate: '45deg' }],
  },
  minuteHand: {
    width: 1.5,
    height: 4.5,
    bottom: 6,
    left: 6.25,
  },
});
