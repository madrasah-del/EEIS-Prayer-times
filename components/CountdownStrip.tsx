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
const HEADLINE_DURATION_MS  = 5_000;   // short headline shown for 5 s
const HEADLINE_LONG_MS      = 9_000;   // long (scrolling) headline shown for 9 s
const FADE_MS               = 400;     // cross-fade duration
const LONG_TEXT_CHARS       = 38;      // messages longer than this scroll as a marquee

// ─── Marquee (scrolling) text ──────────────────────────────────────────────────
// Renders text centred if it fits; if it's wider than the strip it scrolls
// smoothly right-to-left in a loop. Large font, single line.
function MarqueeText({
  text, fontFamily, color,
}: { text: string; fontFamily?: string; color: string }) {
  const [containerW, setContainerW] = useState(0);
  const [textW, setTextW]           = useState(0);
  const tx = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const overflow = textW - containerW;
    if (overflow > 4 && containerW > 0) {
      // Scroll: pause, glide left to reveal the end, pause, glide back
      const dur = Math.max(2500, overflow * 28);
      tx.setValue(0);
      const loop = Animated.loop(Animated.sequence([
        Animated.delay(1000),
        Animated.timing(tx, { toValue: -overflow, duration: dur, useNativeDriver: true }),
        Animated.delay(1000),
        Animated.timing(tx, { toValue: 0, duration: Math.round(dur * 0.55), useNativeDriver: true }),
      ]));
      loop.start();
      return () => loop.stop();
    } else {
      tx.setValue(0);
    }
  }, [textW, containerW, text, tx]);

  const scrolls = textW - containerW > 4 && containerW > 0;

  return (
    <View
      style={styles.marqueeViewport}
      onLayout={e => setContainerW(e.nativeEvent.layout.width)}
    >
      <Animated.Text
        style={[
          styles.headlineText,
          { fontFamily, color },
          scrolls
            ? { transform: [{ translateX: tx }], width: textW, textAlign: 'left' }
            : { width: '100%', textAlign: 'center' },
        ]}
        numberOfLines={1}
      >
        {text}
      </Animated.Text>
      {/* Hidden measurer: gives the natural single-line width of the full string */}
      <Text
        style={[styles.headlineText, styles.marqueeMeasure, { fontFamily }]}
        numberOfLines={1}
        onLayout={e => setTextW(e.nativeEvent.layout.width)}
      >
        {text}
      </Text>
    </View>
  );
}

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
      // After headline phase, go to next headline or back to countdown.
      // Long messages get more time on screen so the marquee can scroll fully.
      const idx = current as number;
      const dwell = (activeHeadlines[idx]?.text.length ?? 0) > LONG_TEXT_CHARS
        ? HEADLINE_LONG_MS : HEADLINE_DURATION_MS;
      const nextIdx = idx + 1;
      if (nextIdx < activeHeadlines.length) {
        timerRef.current = setTimeout(() => {
          crossFadeTo(nextIdx);
          scheduleNext(nextIdx, activeHeadlines);
        }, dwell);
      } else {
        // Last headline → back to countdown
        timerRef.current = setTimeout(() => {
          crossFadeTo('countdown');
          scheduleNext('countdown', activeHeadlines);
        }, dwell);
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
              <Animated.Text style={[styles.modeLabel, { fontFamily: bold, opacity }]}>
                {modeLabel.toUpperCase()}
              </Animated.Text>
            )}
          </View>
          {/* invisible spacer matching the clock icon width so the text block
              (and the centred mode label under it) is balanced on the strip */}
          <View style={styles.clockSpacer} />
        </>
      ) : (
        <Animated.View style={[styles.headlineRow, { opacity }]}>
          <MarqueeText
            text={headline?.text ?? ''}
            fontFamily={semi}
            color={Colors.maroonRed}
          />
          {headline?.linkType !== 'none' && (
            <Text style={[styles.headlineTap, { fontFamily: bold }]}>›</Text>
          )}
        </Animated.View>
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
    alignItems: 'center',     // centre the countdown line + the mode label under it
  },
  clockSpacer: {
    width: sp(16),            // mirrors the clock icon so the column is truly centred
    flexShrink: 0,
  },
  text: {
    color: Colors.maroonRed,
    fontSize: sp(17),
    fontWeight: '700',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  modeLabel: {
    fontSize: sp(14),
    color: Colors.maroonRed,
    letterSpacing: 1.0,
    fontWeight: '800',
    textAlign: 'center',
    alignSelf: 'center',      // sits centred directly beneath the prayer name
  },
  highlight: {
    fontSize: sp(19),
    fontWeight: '800',
  },
  headlineRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  marqueeViewport: {
    flex: 1,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  marqueeMeasure: {
    position: 'absolute',
    opacity: 0,
    left: 0,
    top: 0,
  },
  headlineText: {
    color: Colors.maroonRed,
    fontSize: sp(17),
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  headlineTap: {
    color: Colors.maroonRed,
    fontSize: sp(20),
    fontWeight: '700',
    flexShrink: 0,
    marginLeft: 4,
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
