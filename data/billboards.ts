import AsyncStorage from '@react-native-async-storage/async-storage';
import { verifyConfig } from './billboardSign';

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
  // Per-poster targeting (v57). If omitted, the campaign-level prayers/daysOfWeek apply.
  prayers?:     string[];
  daysOfWeek?:  number[];
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
  // ── Rich-text styling (all optional) ──
  scrollSpeed?: 'slow' | 'medium' | 'fast';  // marquee speed (default 'fast')
  fontScale?:   number;       // 0.8–1.6 multiplier on the strip font
  color?:       string;       // text colour (hex)
  bold?:        boolean;
  italic?:      boolean;
  underline?:   boolean;
  highlight?:   string;       // background highlight colour (hex) — omit for none
  flash?:       boolean;      // blink the message to draw attention
};

export type BillboardConfig = {
  version:           number;
  campaigns:         BillboardCampaign[];
  scrollingMessages?: ScrollingMessage[];
  signature?:        string;  // Ed25519 signature (base64) — set by admin, verified on load
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
// NOTE: The EEIS-Prayer-times repo is PRIVATE. Raw GitHub URLs return 404 without auth.
// We fetch via the GitHub Contents API using the stored admin PAT as a fallback.
// For all users to see campaigns, the admin should also make the repo public or
// host billboard-config.json at a publicly accessible URL.
export const BILLBOARD_CONFIG_URL =
  'https://raw.githubusercontent.com/madrasah-del/EEIS-Prayer-times/main/billboard-config.json';

// GitHub Contents API URL (authenticated fallback for private repo)
const GITHUB_API_CONFIG_URL =
  'https://api.github.com/repos/madrasah-del/EEIS-Prayer-times/contents/billboard-config.json';
const GITHUB_API_CONTENTS_BASE =
  'https://api.github.com/repos/madrasah-del/EEIS-Prayer-times/contents/';

// Admin token key (same key used by BillboardAdminScreen)
const ADMIN_TOKEN_KEY = '@eeis_admin_gh_token';

const CACHE_KEY      = '@eeis_billboard_config_v1';
const CACHE_TS_KEY   = '@eeis_billboard_cache_ts';      // unix ms of last fetch
const CACHE_TTL_MS   = 30 * 60 * 1000;                 // 30 minutes

/** Get the stored admin GitHub token (if any). Used as auth fallback for private repo. */
async function getAdminToken(): Promise<string | null> {
  try { return await AsyncStorage.getItem(ADMIN_TOKEN_KEY); } catch { return null; }
}

/**
 * Fetch billboard config JSON. Tries raw URL first (works if repo is public).
 * Falls back to GitHub Contents API with stored admin token (works for private repo on admin device).
 */
async function fetchConfigJson(): Promise<BillboardConfig | null> {
  let raw: BillboardConfig | null = null;
  // Try raw URL (public repo path)
  try {
    const res = await fetch(BILLBOARD_CONFIG_URL, {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (res.ok) raw = (await res.json()) as BillboardConfig;
  } catch {}

  // Fallback: GitHub Contents API with admin token (private-repo case)
  if (!raw) {
    const token = await getAdminToken();
    if (!token) return null;
    try {
      const res = await fetch(GITHUB_API_CONFIG_URL, {
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
      });
      if (!res.ok) return null;
      const data = await res.json();
      const json = decodeURIComponent(escape(atob((data.content as string).replace(/\n/g, ''))));
      raw = JSON.parse(json) as BillboardConfig;
    } catch { return null; }
  }

  if (!raw) return null;
  // SECURITY: only trust a config signed by a real admin. An unsigned or invalidly
  // signed config (e.g. tampered via a leaked token) is treated as EMPTY → nothing shows.
  if (!verifyConfig(raw)) {
    return { version: raw.version ?? 1, campaigns: [], scrollingMessages: [] };
  }
  return raw;
}

/**
 * Convert a raw.githubusercontent.com image URL to a data URI by fetching via GitHub API.
 * Returns the original URL unchanged if the repo is public or no token is stored.
 * This is called from BillboardSlideshow and admin thumbnails so private-repo images work.
 */
export async function resolveImageUri(rawUrl: string): Promise<string> {
  if (!rawUrl) return rawUrl;
  // Only process raw GitHub URLs from our private repo
  if (!rawUrl.includes('raw.githubusercontent.com/madrasah-del/EEIS-Prayer-times')) return rawUrl;

  // Check if the URL is directly accessible (public repo)
  try {
    const test = await fetch(rawUrl, { method: 'HEAD' });
    if (test.ok) return rawUrl; // public — use directly
  } catch {}

  // Private repo: fetch via GitHub Contents API and convert to data URI
  const token = await getAdminToken();
  if (!token) return rawUrl; // no token — return as-is (will show broken image)

  try {
    // Extract path: raw.githubusercontent.com/owner/repo/branch/PATH → PATH
    const match = rawUrl.match(/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(.+)$/);
    if (!match) return rawUrl;
    const path = match[1];
    const apiUrl = GITHUB_API_CONTENTS_BASE + path;
    const res = await fetch(apiUrl, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return rawUrl;
    const data = await res.json();
    const base64 = (data.content as string).replace(/\n/g, '');
    // Detect mime type from filename
    const ext = path.split('.').pop()?.toLowerCase() ?? 'jpg';
    const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
    return `data:${mime};base64,${base64}`;
  } catch { return rawUrl; }
}

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

/** Fetches config (public raw URL or GitHub API fallback), cached for 30 minutes. */
export async function fetchBillboardConfig(): Promise<BillboardConfig | null> {
  let staleConfig: BillboardConfig | null = null;
  try {
    const tsRaw = await AsyncStorage.getItem(CACHE_TS_KEY);
    const raw   = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      staleConfig = JSON.parse(raw) as BillboardConfig;
      const age = Date.now() - Number(tsRaw ?? 0);
      if (age < CACHE_TTL_MS) return staleConfig;
    }
    const data = await fetchConfigJson();
    if (data) {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
      await AsyncStorage.setItem(CACHE_TS_KEY, String(Date.now()));
      return data;
    }
    return staleConfig;
  } catch {
    return staleConfig;
  }
}

/**
 * Force-fetches fresh config ignoring the AsyncStorage TTL cache.
 * Used by admin test button so newly-uploaded campaigns are visible immediately.
 * Also updates the cache so the regular app path sees the fresh data too.
 */
export async function forceFetchBillboardConfig(): Promise<BillboardConfig | null> {
  try {
    const data = await fetchConfigJson();
    if (!data) return null;
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
    await AsyncStorage.setItem(CACHE_TS_KEY, String(Date.now()));
    return data;
  } catch {
    return null;
  }
}

/**
 * Returns slides for admin test preview — force-fetches fresh config and
 * returns the MOST RECENTLY SAVED active campaign (campaigns are appended, so
 * the last active one is the newest) regardless of prayer/date/frequency filters.
 * Used by the billboard test button in AlertsScreen.
 */
export async function getTestSlidesForAdmin(): Promise<{ slides: Billboard[]; campaignId: string } | null> {
  const config = await forceFetchBillboardConfig();
  if (!config) return null;

  // Last active campaign = most recently added/saved
  const activeCampaigns = config.campaigns.filter(c => c.active);
  const campaign = activeCampaigns[activeCampaigns.length - 1];
  if (!campaign) return null;

  const slides = campaign.slides.map(slide => ({
    id:      slide.id,
    title:   slide.title,
    body:    slide.body ?? '',
    bgColor: slide.bgColor ?? '#063968',
    imageUrl: slide.imageUrl,
    ctaLabel: slide.ctaLabel,
    ctaUrl:   slide.ctaUrl,
    displayDurationSec: slide.displayDurationSec ?? campaign.displayDurationSec ?? 10,
  }));
  return { slides, campaignId: campaign.id };
}

// ─── Campaign matching ────────────────────────────────────────────────────────

/**
 * Normalises a prayer key for matching. "Jummah 1" / "jummah 1" → "jummah1".
 * A campaign targeting legacy "jummah" matches both jummah1 and jummah2.
 */
function prayerMatches(campaignPrayers: string[], prayer: string): boolean {
  const key = prayer.toLowerCase().replace(/\s+/g, '');  // "jummah 1" -> "jummah1"
  if (campaignPrayers.includes(key)) return true;
  if (key.startsWith('jummah') && campaignPrayers.includes('jummah')) return true;
  return false;
}

/**
 * Multi-slide (v57): collects EVERY poster (across active, in-date campaigns) whose
 * PER-SLIDE prayers + days match the given prayer/today, into one carousel. Each slide
 * may target its own prayers/days; if a slide omits them, the campaign-level values apply.
 * Returns null if nothing matches.
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

  const collected: Billboard[] = [];
  let firstCampaignId = '';

  for (const campaign of config.campaigns) {
    if (!campaign.active) continue;
    if (today < campaign.startDate || today > campaign.endDate) continue;

    // Frequency limits (campaign-level)
    if (campaign.maxTimesPerDay != null && getPlayCount(campaign.id, today) >= campaign.maxTimesPerDay) continue;
    if (campaign.maxTimesPerWeek != null && getPlayCount(campaign.id, week) >= campaign.maxTimesPerWeek) continue;

    for (const slide of campaign.slides) {
      // Effective targeting: per-slide overrides campaign-level
      const slidePrayers = (slide.prayers && slide.prayers.length) ? slide.prayers : campaign.prayers;
      const slideDays    = slide.daysOfWeek ?? campaign.daysOfWeek;
      if (!slidePrayers || !prayerMatches(slidePrayers, prayer)) continue;
      if (slideDays && slideDays.length && !slideDays.includes(todayDow)) continue;

      collected.push({
        id:      slide.id,
        title:   slide.title,
        body:    slide.body ?? '',
        bgColor: slide.bgColor ?? '#063968',
        imageUrl: slide.imageUrl,
        ctaLabel: slide.ctaLabel,
        ctaUrl:   slide.ctaUrl,
        displayDurationSec: slide.displayDurationSec ?? campaign.displayDurationSec ?? 10,
      });
      if (!firstCampaignId) firstCampaignId = campaign.id;
    }
  }

  if (collected.length === 0) return null;
  return { slides: collected, campaignId: firstCampaignId };
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
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const todayDow = now.getDay();
  return msgs.filter(m => {
    if (!m.active) return false;
    if (today < m.startDate || today > m.endDate) return false;
    if (!prayerMatches(m.prayers, prayer)) return false;
    if (m.daysOfWeek && !m.daysOfWeek.includes(todayDow)) return false;
    return true;
  });
}

/**
 * Returns ALL active scrolling messages for today, regardless of which prayer is next.
 * Used by CountdownStrip so messages show continuously all day (not just at matching prayer).
 */
export function getAllActiveScrollingMessages(config: BillboardConfig): ScrollingMessage[] {
  const msgs = config.scrollingMessages;
  if (!msgs || msgs.length === 0) return [];
  const today = new Date().toISOString().split('T')[0];
  const dow   = new Date().getDay();
  return msgs.filter(m =>
    m.active &&
    today >= m.startDate && today <= m.endDate &&
    (!m.daysOfWeek?.length || m.daysOfWeek.includes(dow)),
  );
}
