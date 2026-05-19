/**
 * NewsScreen — full-screen modal showing categorised articles and events.
 *
 * Layout:
 *  - Header row: "📰 News" title + compact category tabs + ✕ close
 *  - Language toggle row (EN / বাংলা / اردو / عربي)
 *  - Events category: soonest-event banner at top, then full list
 *  - Article categories: FlatList of articles; tap opens in Chrome Custom Tabs
 *
 * Translation: MyMemory API — titles and descriptions only (not PDF content).
 * Fetched on-demand when a non-English language is selected.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, Modal, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, StatusBar, ScrollView, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import {
  fetchNewsIndex,
  NewsItem,
  NewsEvent,
  NewsIndex,
  EMPTY_NEWS_INDEX,
  formatDateUK,
  todayISO,
} from '../data/newsApi';
import { Colors } from '../constants/theme';

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  visible:     boolean;
  onClose:     () => void;
  fontsLoaded: boolean;
};

// ─── Language definitions ─────────────────────────────────────────────────────

type LangCode = 'en' | 'bn' | 'ur' | 'ar';

const LANGUAGES: { code: LangCode; label: string; myMemoryCode: string }[] = [
  { code: 'en', label: 'EN',  myMemoryCode: 'en' },
  { code: 'bn', label: 'বাংলা', myMemoryCode: 'bn' },
  { code: 'ur', label: 'اردو', myMemoryCode: 'ur' },
  { code: 'ar', label: 'عربي', myMemoryCode: 'ar' },
];

// ─── Translation cache ────────────────────────────────────────────────────────

// translationCache[lang][text] → translated text
const translationCache: Record<string, Record<string, string>> = {};

async function translate(text: string, lang: LangCode): Promise<string> {
  if (lang === 'en' || !text.trim()) return text;
  if (!translationCache[lang]) translationCache[lang] = {};
  if (translationCache[lang][text]) return translationCache[lang][text];
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${lang}`;
    const res = await fetch(url);
    if (!res.ok) return text;
    const json = await res.json();
    const result: string = json?.responseData?.translatedText ?? text;
    translationCache[lang][text] = result;
    return result;
  } catch {
    return text;
  }
}

async function translateItems(
  items: NewsItem[],
  lang: LangCode,
): Promise<NewsItem[]> {
  if (lang === 'en') return items;
  return Promise.all(
    items.map(async item => ({
      ...item,
      title:       await translate(item.title, lang),
      description: item.description ? await translate(item.description, lang) : item.description,
    })),
  );
}

async function translateEvents(
  events: NewsEvent[],
  lang: LangCode,
): Promise<NewsEvent[]> {
  if (lang === 'en') return events;
  return Promise.all(
    events.map(async ev => ({
      ...ev,
      title:   await translate(ev.title, lang),
      details: ev.details ? await translate(ev.details, lang) : ev.details,
      location: ev.location ? await translate(ev.location, lang) : ev.location,
    })),
  );
}

// ─── Open article helper ──────────────────────────────────────────────────────

/** Returns true if this item opens in the browser (has a real file URL). */
function hasFileUrl(item: NewsItem): boolean {
  return !!item.fileUrl && item.fileUrl.startsWith('http');
}

function openArticle(item: NewsItem): void {
  if (!hasFileUrl(item)) return;
  let url = item.fileUrl;
  const lower = url.toLowerCase();
  if (lower.endsWith('.doc') || lower.endsWith('.docx')) {
    url =
      'https://view.officeapps.live.com/op/embed.aspx?src=' +
      encodeURIComponent(url);
  }
  WebBrowser.openBrowserAsync(url, {
    showTitle: true,
    enableBarCollapsing: true,
  }).catch(() => {});
}

// ─── Article type icon ────────────────────────────────────────────────────────

function articleIcon(type: NewsItem['type']): string {
  if (type === 'pdf') return '📄';
  if (type === 'doc') return '📝';
  return '📃';
}

// ─── Scrolling event banner — auto-cycles through upcoming events ──────────────

const BANNER_INTERVAL_MS = 4000; // advance every 4 seconds

function ScrollingEventBanner({ events, fontsLoaded }: { events: NewsEvent[]; fontsLoaded: boolean }) {
  const bold  = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi  = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg   = fontsLoaded ? 'Poppins_400Regular'  : undefined;

  const [idx, setIdx] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const advance = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
      setIdx(i => (i + 1) % events.length);
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    });
  }, [opacity, events.length]);

  useEffect(() => {
    if (events.length <= 1) return; // no need to cycle a single event
    timerRef.current = setInterval(advance, BANNER_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [advance, events.length]);

  // Reset index when events list changes
  useEffect(() => { setIdx(0); }, [events]);

  const event = events[idx];
  if (!event) return null;

  const isFirst = idx === 0; // first upcoming = "NEXT EVENT", others = "COMING UP"

  return (
    <Animated.View style={[styles.eventBanner, { opacity }]}>
      <View style={styles.eventBannerTopRow}>
        <View style={styles.eventBannerBadge}>
          <Text style={[styles.eventBannerBadgeText, { fontFamily: bold }]}>
            {isFirst ? 'NEXT EVENT' : `EVENT ${idx + 1}/${events.length}`}
          </Text>
        </View>
        {events.length > 1 && (
          <View style={styles.eventBannerDots}>
            {events.map((_, i) => (
              <View key={i} style={[styles.eventBannerDot, i === idx && styles.eventBannerDotActive]} />
            ))}
          </View>
        )}
      </View>
      <Text style={[styles.eventBannerTitle, { fontFamily: bold }]} numberOfLines={2}>
        {event.title}
      </Text>
      <View style={styles.eventBannerMeta}>
        <Text style={[styles.eventBannerMetaText, { fontFamily: semi }]}>
          📅 {formatDateUK(event.date)}
          {event.time ? `  ·  🕐 ${event.time}` : ''}
        </Text>
        {!!event.location && (
          <Text style={[styles.eventBannerMetaText, { fontFamily: reg }]} numberOfLines={1}>
            📍 {event.location}
          </Text>
        )}
        {!!event.openTo && (
          <Text style={[styles.eventBannerOpen, { fontFamily: reg }]}>
            👥 Open to: {event.openTo}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

// ─── Event list item ──────────────────────────────────────────────────────────

function EventItem({ event, isNext, fontsLoaded }: { event: NewsEvent; isNext: boolean; fontsLoaded: boolean }) {
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;
  return (
    <View style={[styles.eventRow, isNext && styles.eventRowNext]}>
      <View style={styles.eventDateBox}>
        <Text style={[styles.eventDay,   { fontFamily: semi }]}>
          {formatDateUK(event.date).split('/')[0]}
        </Text>
        <Text style={[styles.eventMonth, { fontFamily: reg }]}>
          {new Date(event.date + 'T00:00:00').toLocaleString('en-GB', { month: 'short' })}
        </Text>
      </View>
      <View style={styles.eventDetails}>
        <Text style={[styles.eventTitle, { fontFamily: semi }]} numberOfLines={2}>
          {event.title}
        </Text>
        {!!event.time && (
          <Text style={[styles.eventMeta, { fontFamily: reg }]}>🕐 {event.time}</Text>
        )}
        {!!event.location && (
          <Text style={[styles.eventMeta, { fontFamily: reg }]} numberOfLines={1}>
            📍 {event.location}
          </Text>
        )}
        {!!event.details && (
          <Text style={[styles.eventMetaSmall, { fontFamily: reg }]} numberOfLines={2}>
            {event.details}
          </Text>
        )}
        {!!event.openTo && (
          <Text style={[styles.eventMetaSmall, { fontFamily: reg }]}>
            👥 {event.openTo}
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NewsScreen({ visible, onClose, fontsLoaded }: Props) {
  const bold = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;

  const [newsIndex,    setNewsIndex]    = useState<NewsIndex | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [activeCat,    setActiveCat]    = useState(0);
  const [lang,         setLang]         = useState<LangCode>('en');
  const [translating,  setTranslating]  = useState(false);
  const [transItems,   setTransItems]   = useState<NewsItem[]>([]);
  const [transEvents,  setTransEvents]  = useState<NewsEvent[]>([]);
  const lastLangRef = useRef<LangCode>('en');
  const lastCatRef  = useRef(0);

  const loadNews = useCallback(async () => {
    setLoading(true);
    const index = await fetchNewsIndex();
    setNewsIndex(index);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (visible) {
      setActiveCat(0);
      setLang('en');
      loadNews();
    }
  }, [visible, loadNews]);

  const categories = newsIndex?.categories ?? EMPTY_NEWS_INDEX.categories;
  const currentCat = categories[activeCat] ?? categories[0];
  const rawItems   = currentCat?.items ?? [];
  const rawEvents  = (currentCat as any)?.events as NewsEvent[] | undefined ?? [];

  // Today's ISO date for comparing upcoming events
  const today = todayISO();
  const upcomingEvents = [...rawEvents]
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const nextEvent      = upcomingEvents[0];
  const pastEvents     = [...rawEvents]
    .filter(e => e.date < today)
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first
  const allEventsSorted = [...upcomingEvents, ...pastEvents];

  // Translate when language, category or raw content changes
  useEffect(() => {
    if (lastLangRef.current === lang && lastCatRef.current === activeCat && lang === 'en') {
      setTransItems(rawItems);
      setTransEvents(allEventsSorted);
      return;
    }
    lastLangRef.current = lang;
    lastCatRef.current  = activeCat;

    if (lang === 'en') {
      setTransItems(rawItems);
      setTransEvents(allEventsSorted);
      return;
    }

    setTranslating(true);
    Promise.all([
      translateItems(rawItems, lang),
      translateEvents(allEventsSorted, lang),
    ]).then(([ti, te]) => {
      setTransItems(ti);
      setTransEvents(te);
      setTranslating(false);
    }).catch(() => {
      setTransItems(rawItems);
      setTransEvents(allEventsSorted);
      setTranslating(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, activeCat, newsIndex]);

  const displayItems  = lang === 'en' ? rawItems  : transItems;
  const displayEvents = lang === 'en' ? allEventsSorted : transEvents;

  // Upcoming events in translated form — used for scrolling banner
  const displayUpcoming: NewsEvent[] = upcomingEvents.map(
    ev => displayEvents.find(e => e.id === ev.id) ?? ev,
  );

  const isEventsCat = currentCat?.id === 'events';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" backgroundColor={Colors.blueDeep} />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>

        {/* Header row: title + category tabs + close */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { fontFamily: bold }]}>📰 News</Text>

          {/* Compact category tabs */}
          <View style={styles.headerTabs}>
            {categories.map((cat, i) => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.headerTab, i === activeCat && styles.headerTabActive]}
                onPress={() => setActiveCat(i)}
                activeOpacity={0.7}
              >
                <Text style={[styles.headerTabText, { fontFamily: semi }, i === activeCat && styles.headerTabTextActive]}>
                  {cat.icon}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
          >
            <Text style={[styles.headerClose, { fontFamily: bold }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Active category name sub-header */}
        <View style={styles.subHeader}>
          <Text style={[styles.subHeaderText, { fontFamily: semi }]}>
            {currentCat?.icon} {currentCat?.title}
          </Text>

          {/* Language toggle */}
          <View style={styles.langRow}>
            {LANGUAGES.map(l => (
              <TouchableOpacity
                key={l.code}
                style={[styles.langBtn, l.code === lang && styles.langBtnActive]}
                onPress={() => setLang(l.code)}
                activeOpacity={0.7}
              >
                <Text style={[styles.langBtnText, { fontFamily: semi }, l.code === lang && styles.langBtnTextActive]}>
                  {l.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Content area */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.deepBlue} />
            <Text style={[styles.loadingText, { fontFamily: reg }]}>Loading news…</Text>
          </View>
        ) : translating ? (
          <View style={styles.center}>
            <ActivityIndicator size="small" color={Colors.deepBlue} />
            <Text style={[styles.loadingText, { fontFamily: reg }]}>Translating…</Text>
          </View>
        ) : isEventsCat ? (
          /* ── Events view ── */
          <ScrollView contentContainerStyle={styles.listContent}>
            {displayUpcoming.length > 0 && (
              <ScrollingEventBanner events={displayUpcoming} fontsLoaded={fontsLoaded} />
            )}
            {displayEvents.length === 0 ? (
              <View style={styles.emptyInline}>
                <Text style={styles.emptyIcon}>🗓</Text>
                <Text style={[styles.emptyTitle, { fontFamily: semi }]}>No events yet</Text>
                <Text style={[styles.emptyHint, { fontFamily: reg }]}>
                  Events will appear here once added by the admin.
                </Text>
              </View>
            ) : (
              displayEvents.map((ev, idx) => (
                <EventItem
                  key={ev.id}
                  event={ev}
                  isNext={ev.id === nextEvent?.id}
                  fontsLoaded={fontsLoaded}
                />
              ))
            )}
          </ScrollView>
        ) : displayItems.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>{currentCat?.icon ?? '📰'}</Text>
            <Text style={[styles.emptyTitle, { fontFamily: semi }]}>No articles yet</Text>
            <Text style={[styles.emptyHint, { fontFamily: reg }]}>
              Articles will appear here once uploaded by the admin.
            </Text>
          </View>
        ) : (
          <FlatList
            data={displayItems}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const isAnnouncement = !hasFileUrl(item);
              if (isAnnouncement) {
                // Typed announcement — show inline text card, no browser
                return (
                  <View style={styles.announcementCard}>
                    <View style={styles.announcementHeader}>
                      <Text style={styles.articleIconText}>📢</Text>
                      <View style={styles.articleTextCol}>
                        <Text style={[styles.articleTitle, { fontFamily: semi }]}>
                          {item.title}
                        </Text>
                        <Text style={[styles.articleDate, { fontFamily: reg }]}>
                          {formatDateUK(item.date)}
                        </Text>
                      </View>
                    </View>
                    {!!(item.announcementText || item.description) && (
                      <Text style={[styles.announcementBody, { fontFamily: reg }]}>
                        {item.announcementText || item.description}
                      </Text>
                    )}
                  </View>
                );
              }
              return (
                <TouchableOpacity
                  style={styles.articleRow}
                  onPress={() => openArticle(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.articleIcon}>
                    <Text style={styles.articleIconText}>{articleIcon(item.type)}</Text>
                  </View>
                  <View style={styles.articleTextCol}>
                    <Text style={[styles.articleTitle, { fontFamily: semi }]} numberOfLines={2}>
                      {item.title}
                    </Text>
                    {!!item.description && (
                      <Text style={[styles.articleDesc, { fontFamily: reg }]} numberOfLines={2}>
                        {item.description}
                      </Text>
                    )}
                    <Text style={[styles.articleDate, { fontFamily: reg }]}>
                      {formatDateUK(item.date)}
                    </Text>
                  </View>
                  <Text style={styles.articleChevron}>›</Text>
                </TouchableOpacity>
              );
            }}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}

      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F5F5' },

  // ── Header ─────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.blueDeep,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#FFF', flexShrink: 0 },
  headerTabs:  { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  headerTab: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerTabActive: { backgroundColor: 'rgba(255,255,255,0.9)' },
  headerTabText:   { fontSize: 18, color: 'rgba(255,255,255,0.9)' },
  headerTabTextActive: { color: Colors.blueDeep },
  headerClose:     { fontSize: 18, color: '#FFF', padding: 4, flexShrink: 0 },

  // ── Sub-header ──────────────────────────────────────────────────────────────
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  subHeaderText: { fontSize: 14, color: Colors.ink, fontWeight: '600' },
  langRow:       { flexDirection: 'row', gap: 5 },
  langBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
    backgroundColor: '#D8D8D8',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  langBtnActive:     { backgroundColor: '#C8DCF8', borderColor: Colors.deepBlue },
  langBtnText:       { fontSize: 13, color: '#333', fontWeight: '600' },
  langBtnTextActive: { color: Colors.deepBlue, fontWeight: '700' },

  divider: { height: 1, backgroundColor: '#E0E0E0' },

  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { marginTop: 12, fontSize: 14, color: Colors.inkMute },
  emptyIcon:   { fontSize: 48, marginBottom: 12 },
  emptyTitle:  { fontSize: 16, fontWeight: '600', color: Colors.ink, marginBottom: 8 },
  emptyHint:   { fontSize: 13, color: Colors.inkMute, textAlign: 'center', lineHeight: 20 },
  emptyInline: { alignItems: 'center', padding: 32 },

  listContent: { paddingVertical: 8 },

  // ── Article rows ────────────────────────────────────────────────────────────
  articleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  articleIcon: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: '#F0F4FF',
    alignItems: 'center', justifyContent: 'center',
  },
  articleIconText: { fontSize: 22 },
  articleTextCol:  { flex: 1 },
  articleTitle:    { fontSize: 14, fontWeight: '600', color: Colors.ink, lineHeight: 20 },
  articleDesc:     { fontSize: 12, color: Colors.inkMute, marginTop: 2, lineHeight: 17 },
  articleDate:     { fontSize: 11, color: Colors.inkMute, marginTop: 4 },
  articleChevron:  { fontSize: 22, color: Colors.inkMute, marginLeft: 4 },
  separator:       { height: 1, backgroundColor: '#EEEEEE', marginHorizontal: 16 },

  // ── Typed announcement card ─────────────────────────────────────────────────
  announcementCard: {
    backgroundColor: '#FFFDE7',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#FFA000',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  announcementHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  announcementBody:   { fontSize: 13, color: Colors.ink, lineHeight: 20 },

  // ── Event banner (next upcoming event) ─────────────────────────────────────
  eventBanner: {
    margin: 12,
    borderRadius: 14,
    backgroundColor: Colors.deepBlue,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  eventBannerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  eventBannerDots: { flexDirection: 'row', gap: 5 },
  eventBannerDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  eventBannerDotActive: { backgroundColor: '#FFF' },
  eventBannerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.freshGreen,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  eventBannerBadgeText: { fontSize: 10, color: '#FFF', fontWeight: '700', letterSpacing: 0.8 },
  eventBannerTitle:     { fontSize: 16, fontWeight: '700', color: '#FFF', lineHeight: 22, marginBottom: 8 },
  eventBannerMeta:      { gap: 3 },
  eventBannerMetaText:  { fontSize: 12, color: 'rgba(255,255,255,0.85)' },
  eventBannerOpen:      { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },

  // ── Event list rows ─────────────────────────────────────────────────────────
  eventRow: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  eventRowNext: {
    backgroundColor: '#F0F7FF',
    borderLeftWidth: 3,
    borderLeftColor: Colors.deepBlue,
  },
  eventDateBox: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F4FF',
    borderRadius: 10,
    paddingVertical: 6,
  },
  eventDay:     { fontSize: 18, fontWeight: '700', color: Colors.deepBlue },
  eventMonth:   { fontSize: 11, color: Colors.inkMute },
  eventDetails: { flex: 1 },
  eventTitle:   { fontSize: 14, fontWeight: '600', color: Colors.ink, lineHeight: 20, marginBottom: 4 },
  eventMeta:    { fontSize: 12, color: Colors.inkMute, marginTop: 2 },
  eventMetaSmall: { fontSize: 11, color: Colors.inkMute, marginTop: 2, lineHeight: 16 },
});
