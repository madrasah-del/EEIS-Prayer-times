/**
 * BillboardSlideshow — full-screen overlay showing EEIS campaign slides.
 *
 * Triggered by: prayer time notification tap (deep link eeis://billboard?prayer=fajr).
 * NOT shown on idle timer — only when EEIS has an active campaign for that prayer.
 *
 * Navigation:
 *  - Swipe left/right between slides
 *  - autoPlay=false (default): manual only — no auto-advance, swipe past last slide closes
 *  - autoPlay=true: auto-advances per slide's displayDurationSec (default 10s); user can
 *    still swipe manually at any time
 *  - Dot indicators show position
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, Image, Modal, TouchableOpacity, FlatList,
  StyleSheet, Dimensions, Linking, StatusBar, NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Billboard } from '../data/billboards';

const { width: W } = Dimensions.get('window');
const DEFAULT_DURATION_MS = 10_000;

type Props = {
  visible:   boolean;
  slides:    Billboard[];
  onClose:   () => void;
  autoPlay?: boolean; // false = manual swipe only (default); true = auto-advance
};

function Slide({ item, onClose }: { item: Billboard; onClose: () => void }) {
  const handleCta = () => {
    if (item.ctaUrl) {
      Linking.openURL(item.ctaUrl).catch(() => {});
      onClose();
    }
  };

  return (
    <View style={[styles.slide, { backgroundColor: item.bgColor }]}>
      {item.imageUrl ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.slideImage}
          resizeMode="cover"
        />
      ) : item.emoji ? (
        <Text style={styles.slideEmoji}>{item.emoji}</Text>
      ) : null}

      {!!item.title && (
        <Text style={styles.slideTitle}>{item.title}</Text>
      )}

      {!!item.subtitle && (
        <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
      )}

      {(item.body || item.accentColor) ? (
        <View style={[styles.divider, { backgroundColor: item.accentColor ?? '#FFFFFF' }]} />
      ) : null}

      {!!item.body && (
        <Text style={styles.slideBody}>{item.body}</Text>
      )}

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
  );
}

export function BillboardSlideshow({ visible, slides, onClose, autoPlay = false }: Props) {
  const flatRef  = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goTo = useCallback((i: number) => {
    const next = Math.max(0, Math.min(slides.length - 1, i));
    flatRef.current?.scrollToIndex({ index: next, animated: true });
    setIndex(next);
  }, [slides.length]);

  // Auto-advance: each slide uses its own displayDurationSec
  const scheduleNext = useCallback((currentIndex: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!autoPlay || slides.length <= 1) return;
    const slide = slides[currentIndex];
    const ms = ((slide?.displayDurationSec ?? 10) * 1000) || DEFAULT_DURATION_MS;
    timerRef.current = setTimeout(() => {
      const next = currentIndex + 1;
      if (next >= slides.length) {
        onClose(); // auto-close after last slide
      } else {
        flatRef.current?.scrollToIndex({ index: next, animated: true });
        setIndex(next);
      }
    }, ms);
  }, [autoPlay, slides, onClose]);

  useEffect(() => {
    if (!visible) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    setIndex(0);
    flatRef.current?.scrollToIndex({ index: 0, animated: false });
    scheduleNext(0);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [visible, scheduleNext]);

  useEffect(() => {
    if (visible) scheduleNext(index);
  }, [index, visible, scheduleNext]);

  const onViewableChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) setIndex(viewableItems[0].index ?? 0);
  }).current;

  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;

  // Detect overscroll past last slide → close (manual mode)
  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!autoPlay && index === slides.length - 1) {
      const offset = e.nativeEvent.contentOffset.x;
      if (offset > W * (slides.length - 1) + 40) {
        onClose();
      }
    }
  }, [autoPlay, index, slides.length, onClose]);

  if (!visible || slides.length === 0) return null;

  const isLast = index === slides.length - 1;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>

        {/* Close button */}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={16}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>

        {/* Slides */}
        <FlatList
          ref={flatRef}
          data={slides}
          keyExtractor={b => b.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => <Slide item={item} onClose={onClose} />}
          onViewableItemsChanged={onViewableChanged}
          viewabilityConfig={viewConfig}
          getItemLayout={(_, i) => ({ length: W, offset: W * i, index: i })}
          initialNumToRender={2}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        />

        {/* Dot indicators (only if >1 slide) */}
        {slides.length > 1 && (
          <View style={styles.dots}>
            {slides.map((_, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => goTo(i)}
                hitSlop={8}
                style={[styles.dot, i === index && styles.dotActive]}
              />
            ))}
          </View>
        )}

        {/* Hint text */}
        <Text style={styles.swipeHint}>
          {slides.length > 1
            ? (isLast && !autoPlay
                ? 'Swipe left to close  ·  Tap ✕ to close'
                : 'Swipe to browse  ·  Tap ✕ to close')
            : 'Tap ✕ to close'}
        </Text>

      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#063968',
  },
  closeBtn: {
    position: 'absolute',
    top: 52,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  slide: {
    width: W,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
    paddingBottom: 100,
  },
  slideImage: {
    width: W,
    height: '75%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  slideEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  slideTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.3,
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  slideSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  divider: {
    width: 48,
    height: 3,
    borderRadius: 2,
    marginBottom: 20,
    opacity: 0.6,
  },
  slideBody: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 26,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  ctaBtn: {
    marginTop: 28,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  ctaBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: 70,
    left: 0,
    right: 0,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: {
    backgroundColor: '#FFFFFF',
    width: 20,
    borderRadius: 4,
  },
  swipeHint: {
    position: 'absolute',
    bottom: 44,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
});
