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
  StyleSheet, Linking, StatusBar, useWindowDimensions,
  NativeSyntheticEvent, NativeScrollEvent, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Billboard } from '../data/billboards';

type Props = {
  visible:   boolean;
  slides:    Billboard[];
  onClose:   () => void;
  autoPlay?: boolean;
};

// ─── Single slide ─────────────────────────────────────────────────────────────

function SlideView({
  item, W, H, onClose, onImgOrientation,
}: {
  item: Billboard;
  W: number;
  H: number;
  onClose: () => void;
  onImgOrientation?: (landscape: boolean) => void;
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
            source={{ uri: item.imageUrl }}
            style={{ flex: 1 }}
            resizeMode="contain"
            onLoad={(e) => {
              setImgLoading(false);
              const { width: iW, height: iH } = e.nativeEvent.source;
              onImgOrientation?.(iW > iH);
            }}
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

// ─── Hint text helper ─────────────────────────────────────────────────────────

function swipeHint(index: number, total: number, autoPlay: boolean): string {
  if (total <= 1) return 'Tap ✕ to close';
  if (autoPlay)   return `${index + 1} / ${total}`;
  if (index === 0)           return `Swipe left for next  (1/${total})`;
  if (index === total - 1)   return `(${total}/${total})  ← Back  ·  Swipe left to close`;
  return `(${index + 1}/${total})  ← Back  ·  Next →`;
}

// ─── Slideshow ────────────────────────────────────────────────────────────────

export function BillboardSlideshow({ visible, slides, onClose, autoPlay = false }: Props) {
  const { width: W, height: H } = useWindowDimensions();
  const isDeviceLandscape = W > H;

  const flatRef  = useRef<FlatList>(null);
  const [index,          setIndex]          = useState(0);
  const [imgIsLandscape, setImgIsLandscape] = useState(false); // tracks current slide's image
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goTo = useCallback((i: number) => {
    const next = Math.max(0, Math.min(slides.length - 1, i));
    flatRef.current?.scrollToIndex({ index: next, animated: true });
    setIndex(next);
  }, [slides.length]);

  // Auto-advance using per-slide displayDurationSec
  const scheduleNext = useCallback((currentIndex: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!autoPlay || slides.length <= 1) return;
    const ms = (slides[currentIndex]?.displayDurationSec ?? 10) * 1000;
    timerRef.current = setTimeout(() => {
      const next = currentIndex + 1;
      if (next >= slides.length) { onClose(); }
      else {
        flatRef.current?.scrollToIndex({ index: next, animated: true });
        setIndex(next);
      }
    }, ms);
  }, [autoPlay, slides, onClose]);

  useEffect(() => {
    if (!visible) { if (timerRef.current) clearTimeout(timerRef.current); return; }
    setIndex(0);
    setImgIsLandscape(false);
    flatRef.current?.scrollToIndex({ index: 0, animated: false });
    scheduleNext(0);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [visible, scheduleNext]);

  useEffect(() => { if (visible) scheduleNext(index); }, [index, visible, scheduleNext]);

  const onViewableChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setIndex(viewableItems[0].index ?? 0);
      setImgIsLandscape(false); // reset until image loads
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

  // Show rotation hint only when: image is landscape AND device is portrait
  const showRotationHint = imgIsLandscape && !isDeviceLandscape && !!slides[index]?.imageUrl;

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>

        {/* Close button */}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={16}>
          <Text style={styles.closeBtnText}>✕</Text>
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
              onImgOrientation={setImgIsLandscape}
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

        {/* Rotation hint — appears above dots for landscape images on portrait device */}
        {showRotationHint && (
          <View style={styles.rotationHint}>
            <Text style={styles.rotationHintText}>🔄 Rotate for a wider view</Text>
          </View>
        )}

        {/* Dot indicators */}
        {slides.length > 1 && (
          <View style={[styles.dots, showRotationHint && styles.dotsWithHint]}>
            {slides.map((_, i) => (
              <TouchableOpacity key={i} onPress={() => goTo(i)} hitSlop={8}
                style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>
        )}

        {/* Contextual swipe hint */}
        <Text style={[styles.swipeHint, showRotationHint && styles.swipeHintWithHint]}>
          {swipeHint(index, slides.length, autoPlay)}
        </Text>

      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  closeBtn: {
    position: 'absolute', top: 52, right: 20, zIndex: 10,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  slide: { alignItems: 'center', justifyContent: 'flex-end' },

  imgLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },

  slideEmoji: { fontSize: 72, marginBottom: 32 },

  textOverlay: {
    width: '100%',
    paddingHorizontal: 24, paddingTop: 18, paddingBottom: 96,
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

  // Rotation hint pill
  rotationHint: {
    position: 'absolute', bottom: 92, left: 0, right: 0,
    alignItems: 'center',
  },
  rotationHintText: {
    color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 5, overflow: 'hidden',
  },

  dots: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    position: 'absolute', bottom: 62, left: 0, right: 0, gap: 8,
  },
  dotsWithHint: { bottom: 68 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotActive: { backgroundColor: '#FFF', width: 22, borderRadius: 4 },

  swipeHint: {
    position: 'absolute', bottom: 36, left: 0, right: 0,
    textAlign: 'center', color: 'rgba(255,255,255,0.5)',
    fontSize: 11, fontWeight: '500', letterSpacing: 0.3,
  },
  swipeHintWithHint: { bottom: 38 },
});
