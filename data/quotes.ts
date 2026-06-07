import AsyncStorage from '@react-native-async-storage/async-storage';
import { signString, verifyString } from './billboardSign';
import { QUOTES_FILE } from './channel';

export type Quote = {
  id:        number;
  text:      string;        // English translation (required)
  reference: string;
  arabic?:   string;        // Arabic text (shown above English on the alarm screen)
  type?:     'quran' | 'hadith';
};

export type QuotesData = Quote[];
/** Signed remote wrapper: { version, quotes, signature(over JSON.stringify(quotes)) }. */
export type RemoteQuotes = { version: number; quotes: QuotesData; signature?: string };

export const QUOTES_URL =
  `https://raw.githubusercontent.com/madrasah-del/EEIS-Prayer-times/main/${QUOTES_FILE}`;

const CACHE_KEY        = '@eeis_quotes_v2';   // v2: signed wrapper era
const CACHE_DATE_KEY   = '@eeis_quotes_cache_date_v2';
const QUOTE_INDEX_KEY  = '@eeis_quote_index_v1';

/** Verify a remote wrapper and return its quotes, or null if unsigned/invalid. */
function extractVerified(parsed: any): QuotesData | null {
  if (parsed && Array.isArray(parsed.quotes) && typeof parsed.signature === 'string') {
    if (verifyString(JSON.stringify(parsed.quotes), parsed.signature)) return parsed.quotes as QuotesData;
  }
  return null;
}

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

    // Only trust a correctly SIGNED quotes file; otherwise fall back (cache → built-ins).
    const verified = extractVerified(JSON.parse(await res.text()));
    if (!verified) throw new Error('unsigned/invalid quotes');
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(verified));
    await AsyncStorage.setItem(CACHE_DATE_KEY, today);
    return verified;

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

// ─── CSV import/export (RFC-4180: quote text contains commas, so fields are quoted) ──────

export const QUOTES_CSV_HEADER = 'Type,Arabic,English,Reference';

function csvField(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV of the current quotes for the admin to download and edit. */
export function buildQuotesCsv(quotes: QuotesData): string {
  const rows = quotes.map(q =>
    [q.type ?? 'quran', q.arabic ?? '', q.text ?? '', q.reference ?? ''].map(csvField).join(','));
  return [QUOTES_CSV_HEADER, ...rows].join('\n');
}

/** Proper RFC-4180 parser: handles quoted fields with embedded commas, quotes and newlines. */
function parseCsv(text: string): string[][] {
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQ = false, i = 0;
  while (i < s.length) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

export type QuotesParseResult = { quotes: QuotesData | null; errors: string[]; count: number };

/** Parse + validate a quotes CSV. Any error rejects the whole file. */
export function parseQuotesCsv(text: string): QuotesParseResult {
  const rows = parseCsv(text);
  if (rows.length === 0) return { quotes: null, errors: ['The file is empty.'], count: 0 };
  let start = 0;
  if (/type/i.test(rows[0][0] ?? '') && /english/i.test(rows[0].join(','))) start = 1; // header
  const out: QuotesData = [];
  const errors: string[] = [];
  for (let r = start; r < rows.length; r++) {
    const cols = rows[r];
    if (cols.every(c => (c ?? '').trim() === '')) continue; // blank line
    const typeRaw   = (cols[0] ?? '').trim().toLowerCase();
    const arabic    = (cols[1] ?? '').trim();
    const english   = (cols[2] ?? '').trim();
    const reference = (cols[3] ?? '').trim();
    if (!english) { errors.push(`Row ${r + 1}: English text is required.`); continue; }
    if (typeRaw && typeRaw !== 'quran' && typeRaw !== 'hadith') {
      errors.push(`Row ${r + 1}: Type must be "quran", "hadith" or blank (got "${cols[0]}").`); continue;
    }
    out.push({
      id: out.length, text: english, reference,
      arabic: arabic || undefined,
      type: typeRaw === 'hadith' ? 'hadith' : 'quran',
    });
  }
  if (errors.length) return { quotes: null, errors, count: out.length };
  if (out.length === 0) return { quotes: null, errors: ['No quote rows found.'], count: 0 };
  return { quotes: out, errors: [], count: out.length };
}

/** Sign a quotes set ready to upload. */
export async function buildSignedQuotes(quotes: QuotesData, passphrase: string): Promise<RemoteQuotes> {
  const signature = await signString(JSON.stringify(quotes), passphrase);
  return { version: 1, quotes, signature };
}

/** Apply an uploaded quotes set locally so it takes effect immediately (admin's device). */
export async function applyQuotesLocally(file: RemoteQuotes): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(file.quotes)).catch(() => {});
  await AsyncStorage.setItem(CACHE_DATE_KEY, today).catch(() => {});
}
