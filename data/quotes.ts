import AsyncStorage from '@react-native-async-storage/async-storage';

export type Quote = {
  id:        number;
  text:      string;
  reference: string;
};

export type QuotesData = Quote[];

export const QUOTES_URL =
  'https://raw.githubusercontent.com/madrasah-del/EEIS-Prayer-times/main/quotes.json';

const CACHE_KEY      = '@eeis_quotes_v1';
const CACHE_DATE_KEY = '@eeis_quotes_cache_date';

/** Fetches all quotes from GitHub, cached once per calendar day. Returns [] on failure. */
export async function fetchQuotes(): Promise<QuotesData> {
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

/** Returns a random quote from the list. Falls back to one of several hardcoded quotes. */
export function getRandomQuote(quotes: QuotesData): Quote {
  if (quotes.length === 0) {
    return FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];
  }
  return quotes[Math.floor(Math.random() * quotes.length)];
}
