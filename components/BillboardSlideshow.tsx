/**
 * BillboardSlideshow — full-screen overlay showing EEIS campaign slides.
 *
 * Image display: resizeMode="contain" — full poster always visible, never cropped.
 * Navigation hints update per-slide: direction arrows + slide count.
 * Rotation hint appears when current image is landscape but device is portrait.
 * autoPlay=false (default): manual swipe, overswipe past last closes.
 * autoPlay=true: auto-advances per slide's displayDurationSec, closes after last.
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, Image, Modal, TouchableOpacity, FlatList,
  StyleSheet, Linking, StatusBar, useWindowDimensions, Animated,
  NativeSyntheticEvent, NativeScrollEvent, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Billboard } from '../data/billboards';

type Props = {
  visible:    boolean;
  slides:     Billboard[];
  onClose:    () => void;
  autoPlay?:  boolean;
  authToken?: string; // GitHub PAT — required to load images from private repo
};

// ─── Single slide ─────────────────────────────────────────────────────────────

function SlideView({
  item, W, H, onClose, authToken,
}: {
  item: Billboard;
  W: number;
  H: number;
  onClose: () => void;
  authToken?: string;
}) {
  const [imgLoading, setImgLoading] = useState(true);
  const [imgError,   setImgError]   = useState(false);

  const handleCta = () => {
    if (item.ctaUrl) { Linking.openURL(item.ctaUrl).catch(() => {}); onClose(); }
  };

  const hasText = !!(item.title || item.body);

  return (
    <View style={[styles.slide, { width: W, height: H, backgroundColor: item.bgColor }]}>

      {/* Full-screen image — contain so entire poster always visible */}
      {item.imageUrl && !imgError ? (
        <View style={StyleSheet.absoluteFill}>
          <Image
            source={authToken
              ? { uri: item.imageUrl, headers: { Authorization: `token ${authToken}` } }
              : { uri: item.imageUrl }}
            style={{ flex: 1 }}
            resizeMode="contain"
            onLoad={() => setImgLoading(false)}
            onLoadStart={() => setImgLoading(true)}
            onError={() => { setImgError(true); setImgLoading(false); }}
          />
          {imgLoading && (
            <View style={styles.imgLoadingOverlay}>
              <ActivityIndicator color="rgba(255,255,255,0.6)" size="large" />
            </View>
          )}
        </View>
      ) : item.emoji ? (
        <Text style={styles.slideEmoji}>{item.emoji}</Text>
      ) : null}

      {/* Text overlay pinned to bottom */}
      {hasText && (
        <View style={styles.textOverlay}>
          {!!item.title    && <Text style={styles.slideTitle}>{item.title}</Text>}
          {!!item.subtitle && <Text style={styles.slideSubtitle}>{item.subtitle}</Text>}
          {!!item.body     && <Text style={styles.slideBody}>{item.body}</Text>}
          {!!item.ctaLabel && (
            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: item.accentColor ?? '#FFFFFF22' }]}
              onPress={handleCta}
              activeOpacity={0.8}
            >
              <Text style={styles.ctaBtnText}>{item.ctaLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Slideshow ────────────────────────────────────────────────────────────────

export function BillboardSlideshow({ visible, slides, onClose, autoPlay = false, authToken }: Props) {
  const { width: W, height: H } = useWindowDimensions();

  const flatRef  = useRef<FlatList>(null);
  const [index,      setIndex]      = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arrowAnim = useRef(new Animated.Value(0.5)).current; // gentle pulse for nav arrows

  const goTo = useCallback((i: number) => {
    const next = Math.max(0, Math.min(slides.length - 1, i));
    flatRef.current?.scrollToIndex({ index: next, animated: true });
    setIndex(next);
  }, [slides.length]);

  // Auto-advance using per-slide displayDurationSec.
  // After the LAST slide, return to and rest on the FIRST slide (do NOT close),
  // so the user can manually review the slides or close when ready.
  const cycledRef = useRef(false);
  const scheduleNext = useCallback((currentIndex: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!autoPlay || slides.length <= 1) return;
    if (cycledRef.current) return;  // one full cycle done — rest on slide 1
    const ms = (slides[currentIndex]?.displayDurationSec ?? 10) * 1000;
    timerRef.current = setTimeout(() => {
      const next = currentIndex + 1;
      if (next >= slides.length) {
        // Completed one full cycle — glide back to slide 1 and stop auto-advancing.
        // The nav arrows are always available for manual review.
        cycledRef.current = true;
        flatRef.current?.scrollToIndex({ index: 0, animated: true });
        setIndex(0);
      } else {
        flatRef.current?.scrollToIndex({ index: next, animated: true });
        setIndex(next);
      }
    }, ms);
  }, [autoPlay, slides]);

  useEffect(() => {
    if (!visible) { if (timerRef.current) clearTimeout(timerRef.current); return; }
    setIndex(0);
    cycledRef.current = false;   // reset cycle guard each time the slideshow opens
    flatRef.current?.scrollToIndex({ index: 0, animated: false });
    scheduleNext(0);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [visible, scheduleNext]);

  useEffect(() => { if (visible) scheduleNext(index); }, [index, visible, scheduleNext]);

  // Fixed orientation, locked ONCE per campaign (v60). The admin keeps a campaign all one
  // orientation, so the first slide defines it. We must NOT re-lock per slide — doing that
  // (v59) flipped portrait↔landscape on every transition (the cleanup re-locked portrait
  // between slides), which combined with key={W} remounts to produce a never-ending flip
  // loop. Lock once on open; only re-lock to portrait when the slideshow closes/unmounts.
  const campaignOrientation = slides[0]?.orientation ?? 'portrait';
  useEffect(() => {
    if (!visible) return;
    const want = campaignOrientation === 'landscape'
      ? ScreenOrientation.OrientationLock.LANDSCAPE
      : ScreenOrientation.OrientationLock.PORTRAIT_UP;
    ScreenOrientation.lockAsync(want).catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [visible, campaignOrientation]);

  // Gentle pulse for the always-on nav arrows (draws the eye without distracting).
  useEffect(() => {
    if (!visible || slides.length <= 1) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(arrowAnim, { toValue: 1,   duration: 750, useNativeDriver: true }),
      Animated.timing(arrowAnim, { toValue: 0.5, duration: 750, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [visible, slides.length, arrowAnim]);

  const onViewableChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setIndex(viewableItems[0].index ?? 0);
    }
  }).current;

  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;

  // Close on overscroll past last slide (manual mode)
  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!autoPlay && index === slides.length - 1) {
      if (e.nativeEvent.contentOffset.x > W * (slides.length - 1) + 40) onClose();
    }
  }, [autoPlay, index, slides.length, W, onClose]);

  if (!visible || slides.length === 0) return null;

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>

        {/* Close button — TOP-LEFT so it clears the system buttons (which sit on the
            right in landscape). The whole pill, including the "Close" word, is tappable
            with a generous hit area. Closing returns to the main prayer-times screen. */}
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          hitSlop={{ top: 20, left: 20, right: 24, bottom: 20 }}
          activeOpacity={0.7}
        >
          <Text style={styles.closeBtnX}>✕</Text>
          <Text style={styles.closeBtnLabel}>Close</Text>
        </TouchableOpacity>

        {/* Slide counter — sits just under the Close button (top-left). */}
        {slides.length > 1 && (
          <View style={styles.counterPill} pointerEvents="none">
            <Text style={styles.counterText}>{index + 1} of {slides.length}</Text>
          </View>
        )}

        {/* key={W} forces re-mount on rotation to fix pagination offsets */}
        <FlatList
          key={W}
          ref={flatRef}
          data={slides}
          keyExtractor={b => b.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <SlideView
              item={item} W={W} H={H} onClose={onClose}
              authToken={authToken}
            />
          )}
          onViewableItemsChanged={onViewableChanged}
          viewabilityConfig={viewConfig}
          getItemLayout={(_, i) => ({ length: W, offset: W * i, index: i })}
          initialNumToRender={2}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
        />

        {/* Always-available yellow navigation arrows — a manual swipe override. They sit
            on a dark rounded background so they read on any poster, vertically centred on
            each edge, with a gentle pulse. Tap to step (wraps). */}
        {slides.length > 1 && (
          <>
            <Animated.View style={[styles.navArrow, styles.navArrowLeft, { opacity: arrowAnim }]}>
              <TouchableOpacity onPress={() => goTo((index - 1 + slides.length) % slides.length)} hitSlop={16} activeOpacity={0.6} style={styles.navArrowHit}>
                <Text style={styles.navArrowText}>‹</Text>
              </TouchableOpacity>
            </Animated.View>
            <Animated.View style={[styles.navArrow, styles.navArrowRight, { opacity: arrowAnim }]}>
              <TouchableOpacity onPress={() => goTo((index + 1) % slides.length)} hitSlop={16} activeOpacity={0.6} style={styles.navArrowHit}>
                <Text style={styles.navArrowText}>›</Text>
              </TouchableOpacity>
            </Animated.View>
          </>
        )}

      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  closeBtn: {
    position: 'absolute', top: 16, left: 14, zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
  },
  closeBtnX:     { color: '#FFF', fontSize: 16, fontWeight: '800' },
  closeBtnLabel: { color: '#FFF', fontSize: 14, fontWeight: '700', letterSpacing: 0.4 },

  // Slide counter — directly under the Close button.
  counterPill: {
    position: 'absolute', top: 58, left: 14, zIndex: 20,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  counterText: { color: '#FFF', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },

  slide: { alignItems: 'center', justifyContent: 'flex-end' },

  imgLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },

  slideEmoji: { fontSize: 72, marginBottom: 32 },

  textOverlay: {
    width: '100%',
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 28,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems: 'center',
  },
  slideTitle: {
    color: '#FFF', fontSize: 22, fontWeight: '800',
    textAlign: 'center', letterSpacing: 0.2, marginBottom: 6,
  },
  slideSubtitle: {
    color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600',
    textAlign: 'center', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 10,
  },
  slideBody: {
    color: 'rgba(255,255,255,0.92)', fontSize: 16, fontWeight: '400',
    textAlign: 'center', lineHeight: 24,
  },
  ctaBtn: {
    marginTop: 20, paddingHorizontal: 28, paddingVertical: 12,
    borderRadius: 30, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
  },
  ctaBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },

  // Yellow navigation arrows — vertically centred on each side edge, on a dark disc.
  navArrow: {
    position: 'absolute', top: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', zIndex: 15,
  },
  navArrowLeft:  { left: 8 },
  navArrowRight: { right: 8 },
  navArrowHit: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1, borderColor: 'rgba(255,213,79,0.5)',
  },
  navArrowText: {
    color: '#FFD54F', fontSize: 40, fontWeight: '700', lineHeight: 44, marginTop: -4,
  },
});
