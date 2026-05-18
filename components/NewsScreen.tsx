/**
 * NewsScreen — full-screen modal showing categorised articles.
 *
 * Categories are tabs at the top (Islamic Lectures | Announcements | Events).
 * Tapping an article opens it in Chrome Custom Tabs via expo-web-browser.
 * PDF files open directly; .doc/.docx are routed through Office Online viewer.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Modal, TouchableOpacity, FlatList, ScrollView,
  StyleSheet, ActivityIndicator, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import {
  fetchNewsIndex,
  NewsItem,
  NewsIndex,
  EMPTY_NEWS_INDEX,
} from '../data/newsApi';
import { Colors } from '../constants/theme';

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  visible:     boolean;
  onClose:     () => void;
  fontsLoaded: boolean;
};

// ─── Open article helper ──────────────────────────────────────────────────────

function openArticle(item: NewsItem): void {
  let url = item.fileUrl;
  const lower = url.toLowerCase();
  if (lower.endsWith('.doc') || lower.endsWith('.docx')) {
    // Route Word docs through Office Online viewer
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

// ─── Component ────────────────────────────────────────────────────────────────

export function NewsScreen({ visible, onClose, fontsLoaded }: Props) {
  const bold = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;

  const [newsIndex, setNewsIndex] = useState<NewsIndex | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [activeCat, setActiveCat] = useState(0);

  const loadNews = useCallback(async () => {
    setLoading(true);
    const index = await fetchNewsIndex();
    setNewsIndex(index);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (visible) {
      setActiveCat(0);
      loadNews();
    }
  }, [visible, loadNews]);

  const categories = newsIndex?.categories ?? EMPTY_NEWS_INDEX.categories;
  const currentCat = categories[activeCat] ?? categories[0];
  const items      = currentCat?.items ?? [];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" backgroundColor={Colors.blueDeep} />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { fontFamily: bold }]}>📰 News</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
          >
            <Text style={[styles.headerClose, { fontFamily: bold }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Category tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.catScroll}
          contentContainerStyle={styles.catContent}
        >
          {categories.map((cat, i) => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.catTab, i === activeCat && styles.catTabActive]}
              onPress={() => setActiveCat(i)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.catTabText,
                  { fontFamily: semi },
                  i === activeCat && styles.catTabTextActive,
                ]}
              >
                {cat.icon} {cat.title}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.divider} />

        {/* Content area */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.deepBlue} />
            <Text style={[styles.loadingText, { fontFamily: reg }]}>
              Loading news…
            </Text>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>{currentCat?.icon ?? '📰'}</Text>
            <Text style={[styles.emptyTitle, { fontFamily: semi }]}>
              No articles yet
            </Text>
            <Text style={[styles.emptyHint, { fontFamily: reg }]}>
              Articles will appear here once uploaded by the admin.
            </Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.articleRow}
                onPress={() => openArticle(item)}
                activeOpacity={0.7}
              >
                <View style={styles.articleIcon}>
                  <Text style={styles.articleIconText}>
                    {articleIcon(item.type)}
                  </Text>
                </View>
                <View style={styles.articleTextCol}>
                  <Text
                    style={[styles.articleTitle, { fontFamily: semi }]}
                    numberOfLines={2}
                  >
                    {item.title}
                  </Text>
                  {!!item.description && (
                    <Text
                      style={[styles.articleDesc, { fontFamily: reg }]}
                      numberOfLines={2}
                    >
                      {item.description}
                    </Text>
                  )}
                  <Text style={[styles.articleDate, { fontFamily: reg }]}>
                    {item.date}
                  </Text>
                </View>
                <Text style={styles.articleChevron}>›</Text>
              </TouchableOpacity>
            )}
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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.blueDeep,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFF' },
  headerClose: { fontSize: 18, color: '#FFF', padding: 4 },

  catScroll:   { backgroundColor: '#FFF', flexGrow: 0 },
  catContent:  { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  catTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  catTabActive:     { backgroundColor: '#E8F0FE', borderColor: Colors.deepBlue },
  catTabText:       { fontSize: 13, color: Colors.inkMute },
  catTabTextActive: { color: Colors.deepBlue },

  divider: { height: 1, backgroundColor: '#E0E0E0' },

  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { marginTop: 12, fontSize: 14, color: Colors.inkMute },
  emptyIcon:   { fontSize: 48, marginBottom: 12 },
  emptyTitle:  { fontSize: 16, fontWeight: '600', color: Colors.ink, marginBottom: 8 },
  emptyHint:   { fontSize: 13, color: Colors.inkMute, textAlign: 'center', lineHeight: 20 },

  listContent: { paddingVertical: 8 },
  articleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  articleIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F0F4FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  articleIconText: { fontSize: 22 },
  articleTextCol:  { flex: 1 },
  articleTitle:    { fontSize: 14, fontWeight: '600', color: Colors.ink, lineHeight: 20 },
  articleDesc:     { fontSize: 12, color: Colors.inkMute, marginTop: 2, lineHeight: 17 },
  articleDate:     { fontSize: 11, color: Colors.inkMute, marginTop: 4 },
  articleChevron:  { fontSize: 22, color: Colors.inkMute, marginLeft: 4 },
  separator:       { height: 1, backgroundColor: '#EEEEEE', marginHorizontal: 16 },
});
