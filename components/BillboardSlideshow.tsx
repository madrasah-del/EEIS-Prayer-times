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

  const hasBottom = !!(item.subtitle || item.body || item.ctaLabel);

  return (
    <View style={[styles.slide, { width: W, height: H, backgroundColor: item.bgColor }]}>

      {/* Full-screen image — contain so the WHOLE poster is always visible, never cropped
          or skewed. The slide is sized to the visible viewport so the image is centred in
          the blue space with no clipping. */}
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

      {/* Title — pinned at the TOP of the screen, centred, on a dark scrim so it reads on
          any poster and never covers the middle of the picture. */}
      {!!item.title && (
        <View style={styles.titleWrap} pointerEvents="none">
          <Text style={styles.slideTitle} numberOfLines={2}>{item.title}</Text>
        </View>
      )}

      {/* Body — pinned at the BOTTOM, kept to 1–2 short lines so it doesn't encroach on
          the poster. */}
      {hasBottom && (
        <View style={styles.bottomWrap}>
          {!!item.subtitle && <Text style={styles.slideSubtitle} numberOfLines={1}>{item.subtitle}</Text>}
          {!!item.body     && <Text style={styles.slideBody} numberOfLines={2}>{item.body}</Text>}
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

  // The slideshow renders inside a safe-area-padded container, so the actual viewport is
  // smaller than the window. We size each slide to the MEASURED container so the contained
  // poster centres in the visible blue space and is never clipped at the bottom. Seed with
  // the window size; refine on layout. Reset when orientation changes (W/H swap).
  const [box, setBox] = useState({ w: W, h: H });
  useEffect(() => { setBox({ w: W, h: H }); }, [W, H]);

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
      if (e.nativeEvent.contentOffset.x > box.w * (slides.length - 1) + 40) onClose();
    }
  }, [autoPlay, index, slides.length, box.w, onClose]);

  if (!visible || slides.length === 0) return null;

  const arrowTop = Math.round(box.h * 0.20); // arrows sit high (off the picture / system tray)

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {/* Hide the system status bar so its clock/battery never overlaps the poster. */}
      <StatusBar hidden />
      <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>

        {/* Close button — TOP-LEFT, yellow so it stands out, with a thick yellow outline.
            The whole pill (incl. the word "Close") is tappable. Closing returns to the
            main prayer-times screen. */}
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          hitSlop={{ top: 20, left: 20, right: 24, bottom: 20 }}
          activeOpacity={0.7}
        >
          <Text style={styles.closeBtnX}>✕</Text>
          <Text style={styles.closeBtnLabel}>Close</Text>
        </TouchableOpacity>

        {/* Slide counter — TOP-RIGHT corner so it never clashes with the Close button. */}
        {slides.length > 1 && (
          <View style={styles.counterPill} pointerEvents="none">
            <Text style={styles.counterText}>{index + 1} of {slides.length}</Text>
          </View>
        )}

        {/* Measure the real viewport so slides fit exactly (centred, no clipping). */}
        <View style={{ flex: 1 }} onLayout={e => {
          const { width, height } = e.nativeEvent.layout;
          setBox(b => (b.w === width && b.h === height ? b : { w: width, h: height }));
        }}>
          {/* key forces re-mount on size change (rotation) to fix pagination offsets */}
          <FlatList
            key={box.w}
            ref={flatRef}
            data={slides}
            keyExtractor={b => b.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <SlideView
                item={item} W={box.w} H={box.h} onClose={onClose}
                authToken={authToken}
              />
            )}
            onViewableItemsChanged={onViewableChanged}
            viewabilityConfig={viewConfig}
            getItemLayout={(_, i) => ({ length: box.w, offset: box.w * i, index: i })}
            initialNumToRender={2}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            style={{ flex: 1 }}
          />
        </View>

        {/* Always-available yellow navigation arrows — a manual swipe override. Placed HIGH
            (top ~20%) so they sit above the poster and clear of the mid-right system tray,
            on a dark disc so they read on any background. Gentle pulse; tap to step (wraps). */}
        {slides.length > 1 && (
          <>
            <Animated.View style={[styles.navArrow, styles.navArrowLeft, { top: arrowTop, opacity: arrowAnim }]}>
              <TouchableOpacity onPress={() => goTo((index - 1 + slides.length) % slides.length)} hitSlop={16} activeOpacity={0.6} style={styles.navArrowHit}>
                <Text style={styles.navArrowText}>‹</Text>
              </TouchableOpacity>
            </Animated.View>
            <Animated.View style={[styles.navArrow, styles.navArrowRight, { top: arrowTop, opacity: arrowAnim }]}>
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
    position: 'absolute', top: 22, left: 16, zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 2.5, borderColor: '#FFD54F',   // thick yellow outline so it stands out
  },
  closeBtnX:     { color: '#FFD54F', fontSize: 16, fontWeight: '800' },
  closeBtnLabel: { color: '#FFD54F', fontSize: 14, fontWeight: '700', letterSpacing: 0.4 },

  // Slide counter — TOP-RIGHT corner, away from the Close button.
  counterPill: {
    position: 'absolute', top: 22, right: 16, zIndex: 20,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  counterText: { color: '#FFF', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },

  slide: { alignItems: 'center', justifyContent: 'center' },

  imgLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },

  slideEmoji: { fontSize: 72 },

  // Title — pinned at the top of the screen, centred, on a dark scrim.
  titleWrap: {
    position: 'absolute', top: 72, left: 12, right: 12,
    alignItems: 'center', zIndex: 6,
  },
  slideTitle: {
    color: '#FFF', fontSize: 20, fontWeight: '800', textAlign: 'center', letterSpacing: 0.2,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 12, overflow: 'hidden',
  },
  // Body — pinned at the bottom, kept short (1–2 lines).
  bottomWrap: {
    position: 'absolute', bottom: 22, left: 12, right: 12,
    alignItems: 'center', zIndex: 6,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  slideSubtitle: {
    color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600',
    textAlign: 'center', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4,
  },
  slideBody: {
    color: '#FFF', fontSize: 15, fontWeight: '400', textAlign: 'center', lineHeight: 21,
  },
  ctaBtn: {
    marginTop: 12, paddingHorizontal: 24, paddingVertical: 10,
    borderRadius: 26, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
  },
  ctaBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },

  // Yellow navigation arrows — placed high (top set inline), on a dark disc.
  navArrow: {
    position: 'absolute', alignItems: 'center', justifyContent: 'center', zIndex: 15,
  },
  navArrowLeft:  { left: 10 },
  navArrowRight: { right: 10 },
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
