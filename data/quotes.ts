import AsyncStorage from '@react-native-async-storage/async-storage';

export type Quote = {
  id:        number;
  text:      string;
  reference: string;
};

export type QuotesData = Quote[];

export const QUOTES_URL =
  'https://raw.githubusercontent.com/madrasah-del/EEIS-Prayer-times/main/quotes.json';

const CACHE_KEY        = '@eeis_quotes_v1';
const CACHE_DATE_KEY   = '@eeis_quotes_cache_date';
const QUOTE_INDEX_KEY  = '@eeis_quote_index_v1';

// ─── Sequential index (persisted across restarts) ─────────────────────────────

let quoteIndexMemory = 0;
let quoteIndexLoaded = false;

async function loadQuoteIndex(): Promise<void> {
  if (quoteIndexLoaded) return;
  try {
    const stored = await AsyncStorage.getItem(QUOTE_INDEX_KEY);
    if (stored !== null) quoteIndexMemory = parseInt(stored, 10) || 0;
  } catch {}
  quoteIndexLoaded = true;
}

/** Fetches all quotes from GitHub, cached once per calendar day. Returns [] on failure. */
export async function fetchQuotes(): Promise<QuotesData> {
  // Ensure sequential index is loaded before quotes are used
  await loadQuoteIndex();

  try {
    const today      = new Date().toISOString().split('T')[0];
    const cachedDate = await AsyncStorage.getItem(CACHE_DATE_KEY);

    if (cachedDate === today) {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) return JSON.parse(raw) as QuotesData;
    }

    const res = await fetch(QUOTES_URL, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as QuotesData;
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
    await AsyncStorage.setItem(CACHE_DATE_KEY, today);
    return data;

  } catch {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) return JSON.parse(raw) as QuotesData;
    } catch {}
    return [];
  }
}

// ─── Fallback pool — 10 quotes used only when no cached quotes exist ──────────

const FALLBACK_QUOTES: Quote[] = [
  { id: 0, text: 'Truly where there is hardship there is also ease.', reference: 'Al-Inshirah 94:5' },
  { id: 0, text: 'And He found you lost and guided you.', reference: 'Ad-Duha 93:7' },
  { id: 0, text: 'So remember Me; I will remember you.', reference: 'Al-Baqarah 2:152' },
  { id: 0, text: 'Indeed, Allah is with the patient.', reference: 'Al-Baqarah 2:153' },
  { id: 0, text: 'Allah does not burden a soul beyond that it can bear.', reference: 'Al-Baqarah 2:286' },
  { id: 0, text: 'And when My servants ask you concerning Me — indeed I am near.', reference: 'Al-Baqarah 2:186' },
  { id: 0, text: 'He who created death and life to test which of you is best in deed.', reference: 'Al-Mulk 67:2' },
  { id: 0, text: 'So verily, with hardship comes ease.', reference: 'Al-Inshirah 94:6' },
  { id: 0, text: 'Your Lord has not taken leave of you, nor has He detested you.', reference: 'Ad-Duha 93:3' },
  { id: 0, text: 'And to your Lord direct your longing.', reference: 'Al-Inshirah 94:8' },
];

/**
 * Returns the next quote in sequence, cycling through all 1310 quotes.
 * Saves current index to AsyncStorage so position persists across restarts.
 * Falls back to the 10 hardcoded quotes only when no cached quotes exist.
 */
export function getNextQuote(quotes: QuotesData): Quote {
  const pool = quotes.length > 0 ? quotes : FALLBACK_QUOTES;
  const idx = quoteIndexMemory % pool.length;
  quoteIndexMemory++;
  // Fire-and-forget save — does not block the caller
  AsyncStorage.setItem(QUOTE_INDEX_KEY, String(quoteIndexMemory)).catch(() => {});
  return pool[idx];
}
