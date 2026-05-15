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

/** Returns a random quote from the list. Falls back to a hardcoded default. */
export function getRandomQuote(quotes: QuotesData): Quote {
  if (quotes.length === 0) {
    return {
      id: 0,
      text: 'Truly where there is hardship there is also ease.',
      reference: 'Al-Inshirah (Relief) 94:5',
    };
  }
  return quotes[Math.floor(Math.random() * quotes.length)];
}
