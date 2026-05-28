import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Remote config types ──────────────────────────────────────────────────────

export type BillboardSlide = {
  id:        string;
  title:     string;
  body?:     string;
  imageUrl?: string; // remote image (hosted on GitHub/Hostinger)
  bgColor?:  string; // fallback bg if no image
  ctaLabel?: string;
  ctaUrl?:   string; // eeis:// deep link or https://
  displayDurationSec?: number; // per-slide auto-advance (overrides campaign-level default)
};

export type BillboardCampaign = {
  id:                string;
  active:            boolean;
  startDate:         string; // YYYY-MM-DD inclusive
  endDate:           string; // YYYY-MM-DD inclusive
  prayers:           string[]; // ["fajr","maghrib","isha"] — which prayers trigger this
  daysOfWeek?:       number[]; // 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat — omit for every day
  maxTimesPerDay?:   number;   // max times campaign can show in one calendar day (default unlimited)
  maxTimesPerWeek?:  number;   // max times campaign can show in one ISO week (default unlimited)
  displayDurationSec?: number;
  slides:            BillboardSlide[];
};

export type ScrollingMessage = {
  id:          string;
  active:      boolean;
  text:        string;        // The message text shown on the countdown strip
  prayers:     string[];      // ["fajr","maghrib","isha"] — which prayers trigger this
  daysOfWeek?: number[];      // 0=Sun…6=Sat — omit for every day
  startDate:   string;        // YYYY-MM-DD inclusive
  endDate:     string;        // YYYY-MM-DD inclusive
};

export type BillboardConfig = {
  version:           number;
  campaigns:         BillboardCampaign[];
  scrollingMessages?: ScrollingMessage[];
};

// ─── Slideshow item type (used by BillboardSlideshow component) ───────────────

export type Billboard = {
  id:        string;
  title:     string;
  subtitle?: string;
  body?:     string;
  bgColor:   string;
  accentColor?: string;
  emoji?:    string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaUrl?:   string;
  displayDurationSec?: number;
};

// ─── Remote config URL ────────────────────────────────────────────────────────
// Update this after creating your GitHub repo or Hostinger page.
// Recommended: create a public GitHub repo (e.g. eeis-billboards) and host config.json there.
// Example: https://raw.githubusercontent.com/YOUR_ORG/eeis-billboards/main/config.json
export const BILLBOARD_CONFIG_URL =
  'https://raw.githubusercontent.com/madrasah-del/EEIS-Prayer-times/main/billboard-config.json';

const CACHE_KEY      = '@eeis_billboard_config_v1';
const CACHE_DATE_KEY = '@eeis_billboard_cache_date';

// ─── Play-count tracking ──────────────────────────────────────────────────────
// Stored as JSON: { [campaignId]: { [YYYY-MM-DD]: number, [YYYY-Www]: number } }
// Persisted in AsyncStorage so counts survive app restarts.

const PLAY_COUNT_KEY = '@eeis_billboard_play_counts_v1';

type PlayCounts = Record<string, Record<string, number>>;

let playCounts: PlayCounts = {};
let playCountsLoaded = false;

async function loadPlayCounts(): Promise<void> {
  if (playCountsLoaded) return;
  try {
    const raw = await AsyncStorage.getItem(PLAY_COUNT_KEY);
    if (raw) playCounts = JSON.parse(raw) as PlayCounts;
  } catch {}
  playCountsLoaded = true;
}

function isoWeek(date: Date): string {
  // Returns YYYY-Www string
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${week.toString().padStart(2, '0')}`;
}

/** Record that a campaign was shown. Call after the slideshow opens. */
export async function recordBillboardPlay(campaignId: string): Promise<void> {
  await loadPlayCounts();
  const today  = new Date().toISOString().split('T')[0];
  const week   = isoWeek(new Date());
  if (!playCounts[campaignId]) playCounts[campaignId] = {};
  playCounts[campaignId][today] = (playCounts[campaignId][today] ?? 0) + 1;
  playCounts[campaignId][week]  = (playCounts[campaignId][week]  ?? 0) + 1;
  AsyncStorage.setItem(PLAY_COUNT_KEY, JSON.stringify(playCounts)).catch(() => {});
}

function getPlayCount(campaignId: string, key: string): number {
  return playCounts[campaignId]?.[key] ?? 0;
}

// ─── Fetch + cache ────────────────────────────────────────────────────────────

/** Fetches config from remote URL, cached once per calendar day. Returns null on failure. */
export async function fetchBillboardConfig(): Promise<BillboardConfig | null> {
  try {
    const today      = new Date().toISOString().split('T')[0];
    const cachedDate = await AsyncStorage.getItem(CACHE_DATE_KEY);

    if (cachedDate === today) {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) return JSON.parse(raw) as BillboardConfig;
    }

    const res = await fetch(BILLBOARD_CONFIG_URL, {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as BillboardConfig;
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
    await AsyncStorage.setItem(CACHE_DATE_KEY, today);
    return data;

  } catch {
    // Network error — try returning stale cache
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) return JSON.parse(raw) as BillboardConfig;
    } catch {}
    return null;
  }
}

// ─── Campaign matching ────────────────────────────────────────────────────────

/**
 * Returns slides for the first active campaign matching today's date and the given prayer.
 * Also respects maxTimesPerDay and maxTimesPerWeek frequency limits.
 * Returns [] if no campaign matches or all limits are exhausted.
 */
export async function getActiveSlidesForPrayer(
  prayer: string,
  config: BillboardConfig,
): Promise<{ slides: Billboard[]; campaignId: string } | null> {
  await loadPlayCounts();

  const now      = new Date();
  const today    = now.toISOString().split('T')[0];
  const week     = isoWeek(now);
  const todayDow = now.getDay(); // 0=Sun … 6=Sat

  for (const campaign of config.campaigns) {
    if (!campaign.active) continue;
    if (today < campaign.startDate || today > campaign.endDate) continue;
    if (!campaign.prayers.includes(prayer)) continue;
    // daysOfWeek filter — if specified, today must be one of the listed days
    if (campaign.daysOfWeek && !campaign.daysOfWeek.includes(todayDow)) continue;

    // Frequency limits
    if (campaign.maxTimesPerDay != null) {
      if (getPlayCount(campaign.id, today) >= campaign.maxTimesPerDay) continue;
    }
    if (campaign.maxTimesPerWeek != null) {
      if (getPlayCount(campaign.id, week) >= campaign.maxTimesPerWeek) continue;
    }

    const slides = campaign.slides.map(slide => ({
      id:      slide.id,
      title:   slide.title,
      body:    slide.body ?? '',
      bgColor: slide.bgColor ?? '#063968',
      imageUrl: slide.imageUrl,
      ctaLabel: slide.ctaLabel,
      ctaUrl:   slide.ctaUrl,
      // Slide-level duration overrides campaign default (fallback 10s)
      displayDurationSec: slide.displayDurationSec ?? campaign.displayDurationSec ?? 10,
    }));
    return { slides, campaignId: campaign.id };
  }

  return null;
}

/**
 * Returns all active scrolling messages for the given prayer today.
 * Respects active flag, date range, and daysOfWeek.
 */
export function getActiveScrollingMessages(
  prayer: string,
  config: BillboardConfig,
): ScrollingMessage[] {
  const msgs = config.scrollingMessages;
  if (!msgs || msgs.length === 0) return [];

  const now    = new Date();
  const today  = now.toISOString().split('T')[0];
  const todayDow = now.getDay();

  return msgs.filter(m => {
    if (!m.active) return false;
    if (today < m.startDate || today > m.endDate) return false;
    if (!m.prayers.includes(prayer)) return false;
    if (m.daysOfWeek && !m.daysOfWeek.includes(todayDow)) return false;
    return true;
  });
}
