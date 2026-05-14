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
};

export type BillboardCampaign = {
  id:                string;
  active:            boolean;
  startDate:         string; // YYYY-MM-DD inclusive
  endDate:           string; // YYYY-MM-DD inclusive
  prayers:           string[]; // ["fajr","maghrib","isha"] — which prayers trigger this
  displayDurationSec?: number;
  slides:            BillboardSlide[];
};

export type BillboardConfig = {
  version:   number;
  campaigns: BillboardCampaign[];
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
};

// ─── Remote config URL ────────────────────────────────────────────────────────
// Update this after creating your GitHub repo or Hostinger page.
// Recommended: create a public GitHub repo (e.g. eeis-billboards) and host config.json there.
// Example: https://raw.githubusercontent.com/YOUR_ORG/eeis-billboards/main/config.json
export const BILLBOARD_CONFIG_URL =
  'https://raw.githubusercontent.com/madrasah-del/EEIS-Prayer-times/main/billboard-config.json';

const CACHE_KEY      = '@eeis_billboard_config_v1';
const CACHE_DATE_KEY = '@eeis_billboard_cache_date';

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
 * Returns [] if no campaign matches (billboard should not appear).
 */
export function getActiveSlidesForPrayer(
  prayer: string,
  config: BillboardConfig,
): Billboard[] {
  const today = new Date().toISOString().split('T')[0];

  for (const campaign of config.campaigns) {
    if (!campaign.active) continue;
    if (today < campaign.startDate || today > campaign.endDate) continue;
    if (!campaign.prayers.includes(prayer)) continue;

    return campaign.slides.map(slide => ({
      id:      slide.id,
      title:   slide.title,
      body:    slide.body ?? '',
      bgColor: slide.bgColor ?? '#063968',
      imageUrl: slide.imageUrl,
      ctaLabel: slide.ctaLabel,
      ctaUrl:   slide.ctaUrl,
    }));
  }

  return [];
}
