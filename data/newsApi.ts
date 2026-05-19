/**
 * News section data layer.
 *
 * Fetches the news index JSON from GitHub (public raw URL) and caches it
 * daily in AsyncStorage so the app works offline after the first load.
 *
 * Index file: news/news-index.json in the EEIS-Prayer-times repo.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Format an ISO date string (YYYY-MM-DD) to UK display format (DD/MM/YYYY).
 * Internal storage stays as YYYY-MM-DD for sorting/comparisons.
 */
export function formatDateUK(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/** Return today's date as YYYY-MM-DD (for internal storage). */
export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type NewsItem = {
  id:                string;
  title:             string;
  fileUrl:           string;  // raw GitHub URL to the file; empty string for typed announcements
  type:              'pdf' | 'doc' | 'txt';
  date:              string;  // YYYY-MM-DD
  description?:      string;
  announcementText?: string;  // full body text for typed (no-file) announcements
};

export type NewsEvent = {
  id:          string;
  title:       string;
  date:        string;  // YYYY-MM-DD (display as DD/MM/YYYY)
  time:        string;  // HH:MM (24h)
  location:    string;
  details:     string;
  openTo?:     string;  // e.g. "All welcome", "Brothers only"
};

export type NewsCategory = {
  id:     string;
  title:  string;
  icon:   string;
  items:  NewsItem[];
  events?: NewsEvent[];  // only used by the Events category
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
 * Fetch the news index from GitHub.
 *
 * Strategy: always try a fresh network fetch first so that articles uploaded
 * by the admin are visible to all users immediately. The local AsyncStorage
 * cache is only used as a fallback when the device is offline.
 *
 * This means every time a user opens the News screen they get the latest
 * content — no 24-hour delay.
 */
export async function fetchNewsIndex(): Promise<NewsIndex | null> {
  // Load cached version as offline fallback
  let cachedData: NewsIndex | null = null;
  try {
    const stored = await AsyncStorage.getItem(NEWS_CACHE_KEY);
    if (stored) {
      const { data } = JSON.parse(stored) as { data: NewsIndex; timestamp: number };
      cachedData = data;
    }
  } catch { /* ignore */ }

  // Always attempt a fresh fetch from GitHub (public repo — no auth required).
  // Cache-Control header bypasses any local HTTP cache; the ?cb= param helps
  // bypass GitHub's CDN layer so newly-saved content appears immediately.
  try {
    const res = await fetch(`${RAW_NEWS_URL}?cb=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
    });
    if (res.ok) {
      const data = (await res.json()) as NewsIndex;
      // Update the cache with fresh data
      AsyncStorage.setItem(
        NEWS_CACHE_KEY,
        JSON.stringify({ data, timestamp: Date.now() }),
      ).catch(() => {});
      return data;
    }
  } catch { /* network error — fall through to cache */ }

  // Return cached data if network failed (offline mode)
  return cachedData;
}

/** Invalidate the cache so the next fetchNewsIndex() re-fetches from GitHub. */
export async function invalidateNewsCache(): Promise<void> {
  await AsyncStorage.removeItem(NEWS_CACHE_KEY).catch(() => {});
}
