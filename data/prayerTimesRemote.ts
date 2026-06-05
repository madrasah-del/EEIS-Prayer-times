/**
 * Remote, admin-updatable prayer timetable (v66).
 *
 * The bundled `data/prayer-times.json` is ALWAYS the safe baseline. On top of it, an admin
 * can upload a new timetable (CSV → validated → Ed25519-signed → GitHub). Phones fetch that
 * signed file and override the matching dates. If the remote file is missing, unsigned,
 * tampered, or the network is down, we silently fall back to the bundled timetable — so the
 * app can never show wrong or blank prayer times.
 *
 * Channel-aware: the TEST app reads/writes prayer-times-test.json, the live app
 * prayer-times.json (see data/channel.ts).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signString, verifyString } from './billboardSign';
import { PRAYER_TIMES_FILE } from './channel';

export type PrayerDay = {
  fajr: [string, string];
  shuruq: string;
  dhuhr: [string, string];
  asr: [string, string];
  maghrib: string;
  isha: [string, string];
};
export type DaysMap = Record<string, PrayerDay>;
export type RemoteTimetable = { version: number; days: DaysMap; signature?: string };

const REPO = 'madrasah-del/EEIS-Prayer-times';
const RAW_URL = `https://raw.githubusercontent.com/${REPO}/main/${PRAYER_TIMES_FILE}`;
const CACHE_KEY = '@eeis_prayer_times_remote_v1'; // per-app sandbox (separate for test/live)

// Override map consulted by usePrayerTimes.resolvePrayerDay (null = use bundled only).
let remoteDays: DaysMap | null = null;
export function getRemoteDays(): DaysMap | null { return remoteDays; }

/** Canonical signed payload = the days map serialised. Identical on sign + verify. */
function signablePayload(days: DaysMap): string { return JSON.stringify(days); }

function acceptIfValid(file: RemoteTimetable | null): boolean {
  if (!file || !file.days || !file.signature) return false;
  if (!verifyString(signablePayload(file.days), file.signature)) return false;
  remoteDays = file.days;
  return true;
}

/** Load the last cached remote timetable (instant, offline-safe). */
async function loadCachedRemote(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) acceptIfValid(JSON.parse(raw) as RemoteTimetable);
  } catch { /* ignore — fall back to bundled */ }
}

/** Fetch a fresh remote timetable from GitHub; cache it if valid. */
async function fetchRemote(): Promise<void> {
  try {
    const res = await fetch(`${RAW_URL}?t=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) return;
    const file = JSON.parse(await res.text()) as RemoteTimetable;
    if (acceptIfValid(file)) {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(file)).catch(() => {});
    }
  } catch { /* ignore — keep cached/bundled */ }
}

/** Call once on app launch: cached first (instant), then refresh from network. */
export async function initRemotePrayerTimes(): Promise<void> {
  await loadCachedRemote();
  await fetchRemote();
}

// ─── CSV template + parsing ────────────────────────────────────────────────────

export const CSV_HEADER =
  'Date,Fajr Begins,Fajr Jamaat,Shuruq,Dhuhr Begins,Dhuhr Jamaat,Asr Begins,Asr Jamaat,Maghrib,Isha Begins,Isha Jamaat';

function isoToUK(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
function ukToIso(uk: string): string | null {
  const m = uk.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
function validTime(t: string): boolean {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return false;
  const h = +m[1], mm = +m[2];
  return h >= 0 && h <= 23 && mm >= 0 && mm <= 59;
}
function pad(t: string): string {
  const [h, m] = t.trim().split(':');
  return `${h.padStart(2, '0')}:${m}`;
}
function mins(t: string): number { const [h, m] = t.split(':'); return +h * 60 + +m; }

/** Build a CSV (header + one row per date) from a days map, for the admin to download/edit. */
export function buildTemplateCsv(days: DaysMap): string {
  const rows = Object.keys(days).sort().map(iso => {
    const d = days[iso];
    return [
      isoToUK(iso), d.fajr[0], d.fajr[1], d.shuruq, d.dhuhr[0], d.dhuhr[1],
      d.asr[0], d.asr[1], d.maghrib, d.isha[0], d.isha[1],
    ].join(',');
  });
  return [CSV_HEADER, ...rows].join('\n');
}

export type CsvParseResult = { days: DaysMap | null; errors: string[]; rowCount: number };

/**
 * Parse + STRICTLY validate a CSV timetable. Any error rejects the whole file (days = null)
 * so a bad upload can never reach users. Checks: 11 columns, DD/MM/YYYY date, valid 24h
 * times, begins ≤ jamaat, and chronological order across the day.
 */
export function parseTimetableCsv(text: string): CsvParseResult {
  const errors: string[] = [];
  const days: DaysMap = {};
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim() !== '');
  if (lines.length === 0) return { days: null, errors: ['The file is empty.'], rowCount: 0 };

  let start = 0;
  if (/date/i.test(lines[0]) && /fajr/i.test(lines[0])) start = 1; // skip header row

  let rowCount = 0;
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    const rowNo = i + 1;
    if (cols.length < 11) { errors.push(`Row ${rowNo}: needs 11 columns, found ${cols.length}.`); continue; }
    const [dateUK, fb, fj, sh, db, dj, ab, aj, mg, ib, ij] = cols;
    const iso = ukToIso(dateUK);
    if (!iso) { errors.push(`Row ${rowNo}: date "${dateUK}" must be DD/MM/YYYY.`); continue; }
    const times = { fb, fj, sh, db, dj, ab, aj, mg, ib, ij };
    let badTime = false;
    for (const [k, v] of Object.entries(times)) {
      if (!validTime(v)) { errors.push(`Row ${rowNo} (${dateUK}): "${v}" is not a valid 24-hour time (HH:MM).`); badTime = true; }
    }
    if (badTime) continue;
    const P = (t: string) => pad(t);
    // begins <= jamaat per prayer
    if (mins(P(fb)) > mins(P(fj))) errors.push(`Row ${rowNo} (${dateUK}): Fajr begins after its jamaat.`);
    if (mins(P(db)) > mins(P(dj))) errors.push(`Row ${rowNo} (${dateUK}): Dhuhr begins after its jamaat.`);
    if (mins(P(ab)) > mins(P(aj))) errors.push(`Row ${rowNo} (${dateUK}): Asr begins after its jamaat.`);
    // chronological order of begins times across the day
    const order = [P(fb), P(sh), P(db), P(ab), P(mg), P(ib)].map(mins);
    const names = ['Fajr', 'Shuruq', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
    for (let j = 0; j < order.length - 1; j++) {
      if (order[j] >= order[j + 1]) errors.push(`Row ${rowNo} (${dateUK}): ${names[j]} is not before ${names[j + 1]}.`);
    }
    days[iso] = {
      fajr: [P(fb), P(fj)], shuruq: P(sh), dhuhr: [P(db), P(dj)],
      asr: [P(ab), P(aj)], maghrib: P(mg), isha: [P(ib), P(ij)],
    };
    rowCount++;
  }

  if (errors.length > 0) return { days: null, errors, rowCount };
  if (rowCount === 0) return { days: null, errors: ['No data rows found.'], rowCount: 0 };
  return { days, errors: [], rowCount };
}

/** Build the signed timetable wrapper ready to upload. */
export async function buildSignedTimetable(days: DaysMap, passphrase: string): Promise<RemoteTimetable> {
  const signature = await signString(signablePayload(days), passphrase);
  return { version: 1, days, signature };
}

/** After a successful upload, apply the new timetable locally so it takes effect at once. */
export async function applyTimetableLocally(file: RemoteTimetable): Promise<void> {
  if (acceptIfValid(file)) {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(file)).catch(() => {});
  }
}
