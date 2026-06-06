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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Billboard } from '../data/billboards';

type Props = {
  visible:    boolean;
  slides:     Billboard[];
  onClose:    () => void;
  autoPlay?:  boolean;
  authToken?: string; // GitHub PAT — required to load images from private repo
};

// Back-compat maps for the old small/medium/large sizes; new slides use exact numbers.
const TITLE_FS = { small: 18, medium: 24, large: 32 } as const;
const BODY_FS  = { small: 13, medium: 16, large: 20 } as const;

/** Resolve a font size: a number is used as-is; an old string maps to a px value. */
function fontPx(v: number | 'small' | 'medium' | 'large' | undefined,
                map: { small: number; medium: number; large: number }, def: number): number {
  if (typeof v === 'number' && v > 0) return v;
  if (typeof v === 'string' && map[v] != null) return map[v];
  return def;
}

// ─── Single slide ─────────────────────────────────────────────────────────────

function SlideView({
  item, W, H, authToken,
}: {
  item: Billboard;
  W: number;
  H: number;
  authToken?: string;
}) {
  const [imgLoading, setImgLoading] = useState(true);
  const [imgError,   setImgError]   = useState(false);

  return (
    <View style={[styles.slide, { width: W, height: H, backgroundColor: item.bgColor }]}>
      {/* Full-screen image — contain so the WHOLE poster is always visible, never cropped
          or skewed. The slide is sized to the visible viewport so the image is centred in
          the blue space with no clipping. Text/controls are drawn as parent overlays. */}
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
    </View>
  );
}

// ─── Slideshow ────────────────────────────────────────────────────────────────

export function BillboardSlideshow({ visible, slides, onClose, autoPlay = false, authToken }: Props) {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // The slideshow renders inside a safe-area-padded container, so the actual viewport is
  // smaller than the window. We size each slide to the MEASURED container so the contained
  // poster centres in the visible blue space and is never clipped at the bottom. Seed with
  // the window size; refine on layout. Reset when orientation changes (W/H swap).
  const [box, setBox] = useState({ w: W, h: H });
  useEffect(() => { setBox({ w: W, h: H }); }, [W, H]);

  const flatRef  = useRef<FlatList>(null);
  const [index,      setIndex]      = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-hiding controls (close / counter / arrows): visible briefly, then fade so the
  // poster is unobstructed. Touching the screen reveals them for ~3s; changing slide hides
  // them. Opacity is animated; pointerEvents follows `controlsShown` so taps while hidden
  // fall through to the reveal handler instead of activating a button.
  const controlsAnim = useRef(new Animated.Value(1)).current;
  const [controlsShown, setControlsShown] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideControls = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    Animated.timing(controlsAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    setControlsShown(false);
  }, [controlsAnim]);

  const revealControls = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setControlsShown(true);
    Animated.timing(controlsAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    hideTimer.current = setTimeout(() => {
      Animated.timing(controlsAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
      setControlsShown(false);
    }, 3000);
  }, [controlsAnim]);

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
    prevIndexRef.current = 0;
    cycledRef.current = false;   // reset cycle guard each time the slideshow opens
    flatRef.current?.scrollToIndex({ index: 0, animated: false });
    scheduleNext(0);
    revealControls();            // show controls briefly on open, then auto-hide
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [visible, scheduleNext, revealControls]);

  useEffect(() => { if (visible) scheduleNext(index); }, [index, visible, scheduleNext]);

  // Hide controls whenever the slide actually changes (swipe or auto-advance) — gives an
  // uninterrupted view of each new poster. Skips the initial render (index 0 on open).
  const prevIndexRef = useRef(0);
  useEffect(() => {
    if (!visible) return;
    if (prevIndexRef.current !== index) {
      prevIndexRef.current = index;
      hideControls();
    }
  }, [index, visible, hideControls]);

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

  const current = slides[index] ?? slides[0];
  const openLink = (url?: string) => { if (url) Linking.openURL(url).catch(() => {}); };

  // Inset all controls by the real safe-area so they never sit under the status bar or the
  // navigation buttons (which move to the right/bottom in landscape).
  const padTop    = insets.top + 12;
  const padBottom = insets.bottom + 12;
  const padLeft   = insets.left + 10;
  const padRight  = insets.right + 10;
  // Arrows are vertically centred on the poster and pulled IN from the edges.
  const arrowTop  = Math.round(box.h / 2) - 24;

  // Text positioning. Title sits ~2px from the top, perfectly centred, by default. In
  // PORTRAIT the admin can place the title and body anywhere vertically (titleY / bodyY,
  // 0-100% of the screen). Font sizes are exact numbers (or the old S/M/L for back-compat).
  const isPortrait = (current.orientation ?? 'portrait') !== 'landscape';
  const availH     = Math.max(box.h - insets.top - insets.bottom, 1);
  const titleTop   = (isPortrait && typeof current.titleY === 'number')
    ? insets.top + availH * (current.titleY / 100)
    : insets.top + 2;
  const bodyTopPos = (isPortrait && typeof current.bodyY === 'number')
    ? insets.top + availH * (current.bodyY / 100)
    : undefined;
  const titleFontSize = fontPx(current.titleSize, TITLE_FS, 32);
  const bodyFontSize  = fontPx(current.bodySize, BODY_FS, 16);

  const titleEl = !!current.title && (
    <View style={[styles.titleWrap, { top: titleTop, left: padLeft, right: padRight }]} pointerEvents="box-none">
      <Text
        onPress={current.linkUrl ? () => openLink(current.linkUrl) : undefined}
        numberOfLines={3}
        style={[styles.slideTitle, {
          color: current.titleColor || '#FFFFFF',
          fontSize: titleFontSize,
          lineHeight: Math.round(titleFontSize * 1.2),
          textDecorationLine: current.linkUrl ? 'underline' : 'none',
        }]}
      >
        {current.title}
      </Text>
    </View>
  );

  const bottomEl = (!!current.subtitle || !!current.body || !!current.ctaLabel) && (
    <View
      style={[styles.bottomWrap,
        bodyTopPos !== undefined
          ? { top: bodyTopPos, left: padLeft + 8, right: padRight + 8 }
          : { bottom: padBottom, left: padLeft + 8, right: padRight + 8 }]}
      pointerEvents="box-none"
    >
      {!!current.subtitle && <Text numberOfLines={1} style={styles.slideSubtitle}>{current.subtitle}</Text>}
      {!!current.body && (
        <Text
          onPress={current.linkUrl ? () => openLink(current.linkUrl) : undefined}
          numberOfLines={8}
          style={[styles.slideBody, {
            color: current.bodyColor || '#FFFFFF',
            fontSize: bodyFontSize,
            lineHeight: Math.round(bodyFontSize * 1.35),
            textDecorationLine: current.linkUrl ? 'underline' : 'none',
          }]}
        >
          {current.body}
        </Text>
      )}
      {!!current.ctaLabel && (
        <TouchableOpacity
          style={[styles.ctaBtn, { backgroundColor: current.accentColor ?? '#FFFFFF22' }]}
          onPress={() => { openLink(current.ctaUrl); onClose(); }}
          activeOpacity={0.8}
        >
          <Text style={styles.ctaBtnText}>{current.ctaLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {/* Hide the system status bar so its clock/battery never overlaps the poster. */}
      <StatusBar hidden />
      {/* onTouchStart fires on ANY touch (incl. the start of a swipe) without claiming the
          gesture, so it reveals the controls while the FlatList still scrolls normally. */}
      <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']} onTouchStart={revealControls}>

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
              <SlideView item={item} W={box.w} H={box.h} authToken={authToken} />
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

        {/* Title (top) + body (bottom) — drawn over the poster with NO box, in the colour
            and size the admin chose so they contrast. Tappable when a link is set. */}
        {titleEl}
        {bottomEl}

        {/* Close — top-left yellow pill. Part of the auto-hiding controls: fades out after a
            few seconds; tap the screen to bring it (and the arrows/counter) back. */}
        <Animated.View
          style={[styles.closeBtn, { top: padTop, left: padLeft, opacity: controlsAnim }]}
          pointerEvents={controlsShown ? 'auto' : 'none'}
        >
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 20, left: 20, right: 24, bottom: 20 }}
            activeOpacity={0.7}
            style={styles.closeBtnInner}
          >
            <Text style={styles.closeBtnX}>✕</Text>
            <Text style={styles.closeBtnLabel}>Close</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Slide counter — under the Close button (left). Fades with the controls. */}
        {slides.length > 1 && (
          <Animated.View style={[styles.counterPill, { top: padTop + 44, left: padLeft, opacity: controlsAnim }]} pointerEvents="none">
            <Text style={styles.counterText}>{index + 1} of {slides.length}</Text>
          </Animated.View>
        )}

        {/* Yellow navigation arrows — appear with the controls on touch, hide on swipe. */}
        {slides.length > 1 && (
          <>
            <Animated.View style={[styles.navArrow, { top: arrowTop, left: padLeft, opacity: controlsAnim }]} pointerEvents={controlsShown ? 'auto' : 'none'}>
              <TouchableOpacity onPress={() => goTo((index - 1 + slides.length) % slides.length)} hitSlop={16} activeOpacity={0.6} style={styles.navArrowHit}>
                <Text style={styles.navArrowText}>‹</Text>
              </TouchableOpacity>
            </Animated.View>
            <Animated.View style={[styles.navArrow, { top: arrowTop, right: padRight, opacity: controlsAnim }]} pointerEvents={controlsShown ? 'auto' : 'none'}>
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

  // Close — clean solid yellow pill with dark text (neat, high-contrast, no border artifact).
  closeBtn: {
    position: 'absolute', zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#FFD54F',
    elevation: 4,
  },
  closeBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  closeBtnX:     { color: '#1A1A1A', fontSize: 15, fontWeight: '800' },
  closeBtnLabel: { color: '#1A1A1A', fontSize: 14, fontWeight: '800', letterSpacing: 0.4 },

  // Slide counter — small pill, sits just under the Close button on the left.
  counterPill: {
    position: 'absolute', zIndex: 20,
    paddingHorizontal: 11, paddingVertical: 5, borderRadius: 13,
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

  // Title — top of screen, centred, NO background box (colour chosen by admin). A soft
  // text shadow keeps it legible over busy posters.
  titleWrap: { position: 'absolute', alignItems: 'center', zIndex: 6 },
  slideTitle: {
    fontWeight: '800', textAlign: 'center', letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.85)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5,
  },
  // Body — bottom of screen, centred, NO background box.
  bottomWrap: { position: 'absolute', alignItems: 'center', zIndex: 6 },
  slideSubtitle: {
    color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700',
    textAlign: 'center', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.85)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5,
  },
  slideBody: {
    fontWeight: '600', textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.85)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5,
  },
  ctaBtn: {
    marginTop: 12, paddingHorizontal: 24, paddingVertical: 10,
    borderRadius: 26, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)',
  },
  ctaBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },

  // Yellow navigation arrows — vertically centred (top set inline), on a dark disc.
  navArrow: {
    position: 'absolute', alignItems: 'center', justifyContent: 'center', zIndex: 15,
  },
  navArrowHit: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1, borderColor: 'rgba(255,213,79,0.5)',
  },
  navArrowText: {
    color: '#FFD54F', fontSize: 38, fontWeight: '700', lineHeight: 42, marginTop: -4,
  },
});
