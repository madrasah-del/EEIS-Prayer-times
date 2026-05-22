/**
 * News section data layer — Firebase Firestore backend (v43+).
 *
 * Fetches news categories, items, and headlines from Firebase Firestore.
 * Files (PDFs, images, audio) are stored in Firebase Storage.
 *
 * Caches daily in AsyncStorage so the app works offline after first load.
 * Always attempts a fresh network fetch first so content appears immediately
 * after admin uploads.
 *
 * Collections:
 *   news_categories/{catId}   — { title, icon, order }
 *   news_items/{itemId}       — { categoryId, title, fileUrl, type, date,
 *                                 description?, announcementText?, storagePath? }
 *   news_headlines/{headId}   — HeadlineItem fields
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fsListDocs, fsSetDoc, fsDeleteDoc } from './firebaseApi';

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
  fileUrl:           string;  // Firebase Storage download URL; empty for typed announcements
  type:              'pdf' | 'doc' | 'txt' | 'image' | 'audio';
  date:              string;  // YYYY-MM-DD
  description?:      string;
  announcementText?: string;  // full body text for typed (no-file) announcements
  storagePath?:      string;  // Firebase Storage path (for deletion)
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

// ─── Scrolling Headline types ─────────────────────────────────────────────────

export type HeadlineLinkType = 'none' | 'announcement' | 'event' | 'article';

export type HeadlineItem = {
  id:          string;
  text:        string;          // text shown on the ticker
  active:      boolean;
  linkType:    HeadlineLinkType;
  linkCatId?:  string;
  linkItemId?: string;
  prayers?:    string[];        // [] = all prayers; or ['fajr','dhuhr',...]
  daysOfWeek?: number[];        // [] = all days; 0=Sun, 1=Mon, ..., 6=Sat
  startDate?:  string;          // YYYY-MM-DD
  endDate?:    string;          // YYYY-MM-DD
};

export type ActiveHeadline = {
  id:      string;
  text:    string;
  linkType: HeadlineLinkType;
  linkCatId?: string;
  linkItemId?: string;
};

/**
 * Filter the full headlines list to those active right now.
 */
export function getActiveHeadlines(
  headlines: HeadlineItem[] | undefined,
  prayers: string[],
  todayISO: string,
): ActiveHeadline[] {
  if (!headlines?.length) return [];
  const today = new Date(todayISO + 'T12:00:00Z');
  const dayOfWeek = today.getUTCDay();
  return headlines
    .filter(h => {
      if (!h.active) return false;
      if (h.startDate && todayISO < h.startDate) return false;
      if (h.endDate   && todayISO > h.endDate)   return false;
      if (h.daysOfWeek?.length && !h.daysOfWeek.includes(dayOfWeek)) return false;
      if (h.prayers?.length && !prayers.some(p => h.prayers!.includes(p))) return false;
      return true;
    })
    .map(h => ({
      id:        h.id,
      text:      h.text,
      linkType:  h.linkType,
      linkCatId: h.linkCatId,
      linkItemId: h.linkItemId,
    }));
}

export type NewsIndex = {
  version:    number;
  categories: NewsCategory[];
  headlines?: HeadlineItem[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

export const NEWS_INDEX_PATH = 'news/news-index.json';  // kept for legacy compat
export const NEWS_FOLDER     = 'news';

const NEWS_CACHE_KEY = '@eeis_news_index_v2';  // v2 = Firebase backend

// ─── Default empty index (2 categories) ─────────────────────────────────────

export const EMPTY_NEWS_INDEX: NewsIndex = {
  version: 2,
  categories: [
    { id: 'news-newsletters',   title: 'News & Newsletters',  icon: '📢', items: [] },
    { id: 'islamic-literature', title: 'Islamic Literature',  icon: '📖', items: [] },
  ],
};

// ─── Firestore → NewsIndex assembly ──────────────────────────────────────────

async function buildNewsIndexFromFirestore(): Promise<NewsIndex | null> {
  try {
    // Fetch categories + items + headlines in parallel
    const [catDocs, itemDocs, headDocs] = await Promise.all([
      fsListDocs('news_categories'),
      fsListDocs('news_items'),
      fsListDocs('news_headlines'),
    ]);

    // Build categories (sorted by order field)
    const categories: NewsCategory[] = catDocs
      .sort((a, b) => (Number(a.data.order ?? 0) - Number(b.data.order ?? 0)))
      .map(doc => ({
        id:    doc.id,
        title: String(doc.data.title ?? ''),
        icon:  String(doc.data.icon  ?? '📰'),
        items: [],
      }));

    // If no categories in Firestore yet, return default categories
    if (categories.length === 0) {
      return { ...EMPTY_NEWS_INDEX, headlines: [] };
    }

    // Place items into their categories
    for (const doc of itemDocs) {
      const catId = String(doc.data.categoryId ?? '');
      const cat   = categories.find(c => c.id === catId);
      if (!cat) continue;
      const item: NewsItem = {
        id:                doc.id,
        title:             String(doc.data.title    ?? ''),
        fileUrl:           String(doc.data.fileUrl  ?? ''),
        type:              (doc.data.type as NewsItem['type']) ?? 'pdf',
        date:              String(doc.data.date     ?? ''),
        description:       doc.data.description     ? String(doc.data.description) : undefined,
        announcementText:  doc.data.announcementText ? String(doc.data.announcementText) : undefined,
        storagePath:       doc.data.storagePath      ? String(doc.data.storagePath) : undefined,
      };
      cat.items.push(item);
    }

    // Sort items within each category by date descending (newest first)
    for (const cat of categories) {
      cat.items.sort((a, b) => b.date.localeCompare(a.date));
    }

    // Build headlines
    const headlines: HeadlineItem[] = headDocs.map(doc => ({
      id:          doc.id,
      text:        String(doc.data.text ?? ''),
      active:      Boolean(doc.data.active ?? true),
      linkType:    (doc.data.linkType as HeadlineLinkType) ?? 'none',
      linkCatId:   doc.data.linkCatId  ? String(doc.data.linkCatId)  : undefined,
      linkItemId:  doc.data.linkItemId ? String(doc.data.linkItemId) : undefined,
      prayers:     Array.isArray(doc.data.prayers)    ? doc.data.prayers    : [],
      daysOfWeek:  Array.isArray(doc.data.daysOfWeek) ? doc.data.daysOfWeek : [],
      startDate:   doc.data.startDate ? String(doc.data.startDate) : undefined,
      endDate:     doc.data.endDate   ? String(doc.data.endDate)   : undefined,
    }));

    return { version: 2, categories, headlines };
  } catch {
    return null;
  }
}

// ─── Public fetch (network-first, cache fallback) ─────────────────────────────

/**
 * Fetch the news index from Firebase Firestore.
 *
 * Always tries a fresh network fetch first so newly-uploaded content
 * appears immediately. Falls back to AsyncStorage cache when offline.
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

  // Attempt fresh fetch from Firestore
  try {
    const data = await buildNewsIndexFromFirestore();
    if (data) {
      // Update cache
      AsyncStorage.setItem(
        NEWS_CACHE_KEY,
        JSON.stringify({ data, timestamp: Date.now() }),
      ).catch(() => {});
      return data;
    }
  } catch { /* network error — fall through to cache */ }

  // Return cached data if network failed
  return cachedData ?? EMPTY_NEWS_INDEX;
}

/** Invalidate the cache so next fetchNewsIndex() re-fetches from Firestore. */
export async function invalidateNewsCache(): Promise<void> {
  await AsyncStorage.removeItem(NEWS_CACHE_KEY).catch(() => {});
}

// ─── Admin write helpers ──────────────────────────────────────────────────────

/** Save or update a news item in Firestore. */
export async function saveNewsItem(item: NewsItem & { categoryId: string }): Promise<boolean> {
  const { id, ...fields } = item;
  return fsSetDoc('news_items', id, fields);
}

/** Delete a news item from Firestore. */
export async function deleteNewsItem(itemId: string): Promise<boolean> {
  return fsDeleteDoc('news_items', itemId);
}

/** Save or update a category in Firestore. */
export async function saveNewsCategory(cat: NewsCategory & { order: number }): Promise<boolean> {
  const { id, items, ...fields } = cat;
  return fsSetDoc('news_categories', id, fields);
}

/** Save or update a headline in Firestore. */
export async function saveHeadline(headline: HeadlineItem): Promise<boolean> {
  const { id, ...fields } = headline;
  return fsSetDoc('news_headlines', id, fields);
}

/** Delete a headline from Firestore. */
export async function deleteHeadline(headlineId: string): Promise<boolean> {
  return fsDeleteDoc('news_headlines', headlineId);
}
