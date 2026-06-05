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
  const [showArrows, setShowArrows] = useState(false); // nav arrows appear after one auto-play cycle
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arrowAnim = useRef(new Animated.Value(0.35)).current; // flashing opacity for nav arrows

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
        // Completed one full cycle — glide back to slide 1, stop auto-advancing,
        // and reveal the manual nav arrows so the user can revisit posters.
        cycledRef.current = true;
        setShowArrows(true);
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
    setShowArrows(slides.length > 1 && !autoPlay); // manual mode → arrows immediately
    cycledRef.current = false;   // reset cycle guard each time the slideshow opens
    flatRef.current?.scrollToIndex({ index: 0, animated: false });
    scheduleNext(0);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [visible, scheduleNext, slides.length, autoPlay]);

  useEffect(() => { if (visible) scheduleNext(index); }, [index, visible, scheduleNext]);

  // Per-slide fixed orientation (v59): the admin chooses each poster's orientation when
  // building the campaign. Lock the view to the CURRENT slide's orientation — no device
  // rotation, no chasing. Landscape posters fill the screen in landscape; portrait posters
  // stay portrait. Always re-lock to portrait on close.
  useEffect(() => {
    if (!visible) return;
    const want = slides[index]?.orientation === 'landscape'
      ? ScreenOrientation.OrientationLock.LANDSCAPE
      : ScreenOrientation.OrientationLock.PORTRAIT_UP;
    ScreenOrientation.lockAsync(want).catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [visible, index, slides]);

  // Flashing animation for the nav arrows, only while they're shown.
  useEffect(() => {
    if (!showArrows) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(arrowAnim, { toValue: 1,    duration: 650, useNativeDriver: true }),
      Animated.timing(arrowAnim, { toValue: 0.35, duration: 650, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [showArrows, arrowAnim]);

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

        {/* Left/right navigation arrows — appear after one auto-play cycle so people
            know they can swipe back through the posters. They flash to draw the eye.
            Left arrow sits centred on the left edge, right arrow centred on the right. */}
        {showArrows && slides.length > 1 && (
          <>
            <Animated.View style={[styles.navArrow, styles.navArrowLeft, { opacity: arrowAnim }]} pointerEvents="box-none">
              <TouchableOpacity onPress={() => goTo((index - 1 + slides.length) % slides.length)} hitSlop={16} activeOpacity={0.6}>
                <Text style={styles.navArrowText}>‹</Text>
              </TouchableOpacity>
            </Animated.View>
            <Animated.View style={[styles.navArrow, styles.navArrowRight, { opacity: arrowAnim }]} pointerEvents="box-none">
              <TouchableOpacity onPress={() => goTo((index + 1) % slides.length)} hitSlop={16} activeOpacity={0.6}>
                <Text style={styles.navArrowText}>›</Text>
              </TouchableOpacity>
            </Animated.View>
          </>
        )}

        {/* Dot indicators — dark-green, stacked VERTICALLY on the LEFT edge over the
            empty letterbox space so they never sit on top of the poster. */}
        {slides.length > 1 && (
          <View style={styles.dots}>
            {slides.map((_, i) => (
              <TouchableOpacity key={i} onPress={() => goTo(i)} hitSlop={8}
                style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>
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

  // Navigation arrows — vertically centred on each side edge.
  navArrow: {
    position: 'absolute', top: 0, bottom: 0, width: 56,
    alignItems: 'center', justifyContent: 'center', zIndex: 15,
  },
  navArrowLeft:  { left: 2 },
  navArrowRight: { right: 2 },
  navArrowText: {
    color: '#FFFFFF', fontSize: 52, fontWeight: '300', lineHeight: 56,
    textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },

  // Dot indicators — vertical column on the LEFT edge, dark green.
  dots: {
    flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    position: 'absolute', left: 8, top: 0, bottom: 0, gap: 8, zIndex: 12,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(27,94,32,0.45)',   // muted dark green (inactive)
  },
  dotActive: {
    backgroundColor: '#1B5E20',                // dark green (active)
    height: 22, borderRadius: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)',
  },
});
