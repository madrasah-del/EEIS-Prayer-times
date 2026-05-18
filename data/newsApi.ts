/**
 * News section data layer.
 *
 * Fetches the news index JSON from GitHub (public raw URL) and caches it
 * daily in AsyncStorage so the app works offline after the first load.
 *
 * Index file: news/news-index.json in the EEIS-Prayer-times repo.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NewsItem = {
  id:           string;
  title:        string;
  fileUrl:      string;  // raw GitHub URL to the file
  type:         'pdf' | 'doc' | 'txt';
  date:         string;  // YYYY-MM-DD
  description?: string;
};

export type NewsCategory = {
  id:    string;
  title: string;
  icon:  string;
  items: NewsItem[];
};

export type NewsIndex = {
  version:    number;
  categories: NewsCategory[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

export const NEWS_INDEX_PATH = 'news/news-index.json';
export const NEWS_FOLDER     = 'news';

const NEWS_CACHE_KEY = '@eeis_news_index_v1';
const RAW_NEWS_URL   =
  'https://raw.githubusercontent.com/madrasah-del/EEIS-Prayer-times/main/news/news-index.json';
const CACHE_TTL_MS   = 24 * 60 * 60 * 1000; // 24 hours

// ─── Default empty index (3 categories confirmed by admin) ────────────────────

export const EMPTY_NEWS_INDEX: NewsIndex = {
  version: 1,
  categories: [
    { id: 'islamic-lectures', title: 'Islamic Lectures', icon: '📖', items: [] },
    { id: 'announcements',    title: 'Announcements',    icon: '📢', items: [] },
    { id: 'events',           title: 'Events',           icon: '🗓', items: [] },
  ],
};

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Fetch the news index from GitHub with daily AsyncStorage caching.
 * Returns null on network error when no cache is available.
 */
export async function fetchNewsIndex(): Promise<NewsIndex | null> {
  try {
    // Check cache first
    const cached = await AsyncStorage.getItem(NEWS_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached) as {
        data: NewsIndex;
        timestamp: number;
      };
      const ageMs = Date.now() - timestamp;
      if (ageMs < CACHE_TTL_MS) return data;
    }

    // Fetch fresh from GitHub (public repo — no auth required)
    const res = await fetch(RAW_NEWS_URL);
    if (!res.ok) return null;
    const data = (await res.json()) as NewsIndex;

    // Cache it
    await AsyncStorage.setItem(
      NEWS_CACHE_KEY,
      JSON.stringify({ data, timestamp: Date.now() }),
    );
    return data;
  } catch {
    return null;
  }
}

/** Invalidate the cache so the next fetchNewsIndex() re-fetches from GitHub. */
export async function invalidateNewsCache(): Promise<void> {
  await AsyncStorage.removeItem(NEWS_CACHE_KEY).catch(() => {});
}
