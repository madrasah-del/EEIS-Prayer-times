import AsyncStorage from '@react-native-async-storage/async-storage';
import { signString, verifyString } from './billboardSign';
import { QUOTES_FILE, FEATURED_QUOTE_FILE } from './channel';

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

/** Verify a remote wrapper and return its quotes, or null if unsigned/invalid. */
function extractVerified(parsed: any): QuotesData | null {
  if (parsed && Array.isArray(parsed.quotes) && typeof parsed.signature === 'string') {
    if (verifyString(JSON.stringify(parsed.quotes), parsed.signature)) return parsed.quotes as QuotesData;
  }
  return null;
}

/** Fetches all quotes from GitHub, cached once per calendar day. Returns [] on failure. */
export async function fetchQuotes(): Promise<QuotesData> {
  try {
    const today      = new Date().toISOString().split('T')[0];
    const cachedDate = await AsyncStorage.getItem(CACHE_DATE_KEY);

    if (cachedDate === today) {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) return JSON.parse(raw) as QuotesData;
    }

    // Guard the network fetch with a timeout — without it a stalled connection would spin
    // the admin "Download quotes" button forever (and freeze the screen).
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    let res: Response;
    try {
      res = await fetch(QUOTES_URL, { headers: { 'Cache-Control': 'no-cache' }, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
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

export const FALLBACK_QUOTES: Quote[] = [
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

// ─── Deterministic, globally-synced quote cycle ───────────────────────────────
//
// Every device on both platforms computes the SAME quote for the SAME (date, prayer) with no
// stored state at all — a pure function of the calendar date and which of the 6 fixed daily
// slots the prayer occupies (Fajr, Shuruq, Dhuhr-or-Jummah, Asr, Maghrib, Isha). Jummah 1 and
// Jummah 2 share Dhuhr's slot (Jummah REPLACES Dhuhr on Fridays, it isn't an extra occasion), so
// the cadence is a constant 6 slots/day every day, no day-of-week branching needed. This replaces
// the old per-device AsyncStorage counter, which drifted between devices and got burned through
// by reschedules/tests/catch-ups unrelated to real prayer firings.
const CANONICAL_POSITION: Record<string, number> = {
  fajr: 0, shuruq: 1, dhuhr: 2, jummah1: 2, jummah2: 2, asr: 3, maghrib: 4, isha: 5,
};
const SLOTS_PER_DAY = 6;
// Fixed reference date — day 0 of the cycle. Never change this once shipped, or every device
// recomputes a different mapping than devices still on the old epoch.
const CYCLE_EPOCH_MS = Date.UTC(2026, 7, 1); // 1 Aug 2026 (month is 0-indexed)
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysSinceEpoch(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const ms = Date.UTC(y, (m || 1) - 1, d || 1) - CYCLE_EPOCH_MS;
  return Math.floor(ms / MS_PER_DAY);
}

/** Pure function: the same (dateKey, prayerKey) always maps to the same quote, on every device,
 *  on every platform — no matter how many times it's called, rescheduled, or tested. */
export function quoteForOccurrence(dateKey: string, prayerKey: string, quotes: QuotesData): Quote {
  const pool = quotes.length > 0 ? quotes : FALLBACK_QUOTES;
  const pos = CANONICAL_POSITION[prayerKey] ?? 0;
  const slot = daysSinceEpoch(dateKey) * SLOTS_PER_DAY + pos;
  const idx = ((slot % pool.length) + pool.length) % pool.length; // safe for dates before epoch
  return pool[idx];
}

/** How many days remain before the cycle wraps back to the start of the current quote set —
 *  for the admin "top up the bank before it repeats" indicator. */
export function daysUntilCycleRepeats(quotes: QuotesData): number {
  const pool = quotes.length > 0 ? quotes : FALLBACK_QUOTES;
  const todayKey = new Date().toISOString().split('T')[0];
  const slotsUsedInCycle = ((daysSinceEpoch(todayKey) * SLOTS_PER_DAY) % pool.length + pool.length) % pool.length;
  const slotsRemaining = pool.length - slotsUsedInCycle;
  return Math.floor(slotsRemaining / SLOTS_PER_DAY);
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

// ─── Featured ("pinned") quote — signed broadcast to ALL users ─────────────────
//
// When the admin features a quote, every user's alarms show THAT quote (instead of the
// sequential pick) from the next scheduling pass onward, until the admin clears it. The
// file is signed exactly like quotes/prayer-times, so a leaked GitHub token still cannot
// push an arbitrary featured quote without the passphrase.

export type FeaturedQuote = { active: boolean; quote: Quote; signature?: string };

export const FEATURED_QUOTE_URL =
  `https://raw.githubusercontent.com/madrasah-del/EEIS-Prayer-times/main/${FEATURED_QUOTE_FILE}`;

const FEATURED_CACHE_KEY  = '@eeis_featured_quote_v1';
const FEATURED_CACHE_TS   = '@eeis_featured_quote_ts_v1';
const FEATURED_TTL_MS     = 10 * 60 * 1000; // 10 min — featured changes propagate quickly

const EMPTY_QUOTE: Quote = { id: 0, text: '', reference: '' };

/** The exact string that is signed/verified for a featured-quote file. */
function featuredPayload(active: boolean, quote: Quote): string {
  return JSON.stringify({ active, quote });
}

/**
 * Fetch the active featured quote for this channel, or null if none/invalid.
 * Verifies the signature against the baked public key. Cached for 10 minutes.
 */
export async function fetchFeaturedQuote(): Promise<Quote | null> {
  try {
    const tsRaw = await AsyncStorage.getItem(FEATURED_CACHE_TS);
    if (tsRaw && Date.now() - parseInt(tsRaw, 10) < FEATURED_TTL_MS) {
      const cached = await AsyncStorage.getItem(FEATURED_CACHE_KEY);
      if (cached !== null) return cached === '' ? null : (JSON.parse(cached) as Quote);
    }
  } catch { /* ignore cache errors */ }

  let result: Quote | null = null;
  try {
    const res = await fetch(FEATURED_QUOTE_URL, { headers: { 'Cache-Control': 'no-cache' } });
    if (res.ok) {
      const parsed = JSON.parse(await res.text());
      if (parsed && typeof parsed.signature === 'string') {
        const active = !!parsed.active;
        const quote  = parsed.quote as Quote;
        if (verifyString(featuredPayload(active, quote), parsed.signature)
            && active && quote && quote.text) {
          result = quote;
        }
      }
    }
    // res 404 (no file) → result stays null (no featured quote)
  } catch {
    // On network error, prefer the last cached value if any
    try {
      const cached = await AsyncStorage.getItem(FEATURED_CACHE_KEY);
      if (cached !== null) return cached === '' ? null : (JSON.parse(cached) as Quote);
    } catch {}
    return null;
  }

  try {
    await AsyncStorage.setItem(FEATURED_CACHE_KEY, result ? JSON.stringify(result) : '');
    await AsyncStorage.setItem(FEATURED_CACHE_TS, String(Date.now()));
  } catch {}
  return result;
}

/** Build a signed featured-quote file. Pass null to CLEAR the featured quote. */
export async function buildSignedFeatured(
  quote: Quote | null,
  passphrase: string,
): Promise<FeaturedQuote> {
  const active = !!quote;
  const q = quote ?? EMPTY_QUOTE;
  const signature = await signString(featuredPayload(active, q), passphrase);
  return { active, quote: q, signature };
}

/** Apply a featured-quote decision locally so the admin's own device reflects it at once. */
export async function applyFeaturedLocally(quote: Quote | null): Promise<void> {
  try {
    await AsyncStorage.setItem(FEATURED_CACHE_KEY, quote ? JSON.stringify(quote) : '');
    await AsyncStorage.setItem(FEATURED_CACHE_TS, String(Date.now()));
  } catch {}
}
