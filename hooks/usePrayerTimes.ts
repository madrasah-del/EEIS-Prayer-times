import { useState, useEffect } from 'react';
import prayerData from '../data/prayer-times.json';
import { getRemoteDays } from '../data/prayerTimesRemote';
import { jummahForBst } from '../data/jummahConfig';

export type PrayerDay = {
  fajr: [string, string];
  shuruq: string;
  dhuhr: [string, string];
  asr: [string, string];
  maghrib: string;
  isha: [string, string];
};

export type HijriDate = {
  day: number;
  month: string;
  year: number;
};

export type NextPrayer = {
  id: 'fajr' | 'jummah1' | 'jummah2' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
  name: string;
  jamaat: string;
  begins: string;            // adhan/begin time (falls back to jamaat when only one time exists)
  minutesUntil: number;      // minutes until jamaat (used for NEXT pill + iqamah countdown)
  minutesUntilBegins: number; // minutes until begins/adhan time (used for adhan countdown mode)
  progress: number;          // 0–100, driven by jamaat times
};

const HIJRI_MONTHS = [
  'Muharram', 'Safar', "Rabi' al-Awwal", "Rabi' al-Thani",
  'Jumada al-Ula', 'Jumada al-Akhirah', 'Rajab', "Sha'ban",
  'Ramadan', 'Shawwal', "Dhu al-Qi'dah", 'Dhu al-Hijjah',
];

export function isBST(date: Date): boolean {
  const year = date.getFullYear();
  const march31 = new Date(year, 2, 31);
  const bstStart = new Date(year, 2, 31 - march31.getDay());
  bstStart.setHours(1, 0, 0, 0);
  const october31 = new Date(year, 9, 31);
  const bstEnd = new Date(year, 9, 31 - october31.getDay());
  bstEnd.setHours(1, 0, 0, 0);
  return date >= bstStart && date < bstEnd;
}

// Exact algorithm from the EEIS website (JD offset -1525)
export function getHijriDate(date: Date): HijriDate {
  let day = date.getDate();
  let month = date.getMonth() + 1;
  let year = date.getFullYear();
  if (month < 3) { year -= 1; month += 12; }
  const a = Math.floor(year / 100);
  const b = 2 - a + Math.floor(a / 4);
  const jd = Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + b - 1525;
  const l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const l2 = l - 10631 * n + 354;
  const j = (Math.floor((10985 - l2) / 5316)) * (Math.floor((50 * l2) / 17719))
    + (Math.floor(l2 / 5670)) * (Math.floor((43 * l2) / 15238));
  const l3 = l2 - (Math.floor((30 - j) / 15)) * (Math.floor((17719 * j) / 50))
    - (Math.floor(j / 16)) * (Math.floor((15238 * j) / 43)) + 29;
  const m2 = Math.floor((24 * l3) / 709);
  const d2 = l3 - Math.floor((709 * m2) / 24);
  const y = 30 * n + j - 30;
  return { day: Math.floor(d2), month: HIJRI_MONTHS[m2 - 1], year: Math.floor(y) };
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Convert 24h "HH:MM" to 12h "hh:mm" (no AM/PM suffix, matching the website)
export function to12h(t: string): string {
  if (t === '--:--') return t;
  const [h, m] = t.split(':').map(Number);
  return `${(h % 12 || 12).toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function getDateKey(date: Date): string {
  const y = date.getFullYear();
  const mo = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

// ── Year-rollover safety ──────────────────────────────────────────────────────
// The bundled timetable (data/prayer-times.json) currently holds ONE calendar year
// (2026). Without a fallback, the app would show NO prayer times once the device
// clock rolls into 2027. To keep the app working until an admin ships an updated
// timetable, we fall back to the SAME month-and-day from whatever year(s) the data
// does contain. Prayer times are seasonal, so reusing e.g. 2026-06-12 for 2027-06-12
// stays accurate to within a minute or two — and stays constant year on year.
const _db = prayerData as unknown as Record<string, PrayerDay>;

// MM-DD → entry, taken from the LATEST year present for each day (built once).
const _byMonthDay: Record<string, PrayerDay> = (() => {
  const map: Record<string, PrayerDay> = {};
  const seenYear: Record<string, number> = {};
  for (const key of Object.keys(_db)) {
    const md = key.slice(5);            // "MM-DD"
    const yr = parseInt(key.slice(0, 4), 10);
    if (seenYear[md] == null || yr > seenYear[md]) { map[md] = _db[key]; seenYear[md] = yr; }
  }
  return map;
})();

/** Resolve a day's prayer times for any date.
 *  Priority: admin's remote timetable (signed) → bundled exact date → same-MM-DD rollover.
 *  The remote layer can never break the app: if it's absent/invalid, bundled is used. */
export function resolvePrayerDay(date: Date): PrayerDay | null {
  const key = getDateKey(date);
  const remote = getRemoteDays();
  if (remote && remote[key]) return remote[key] as PrayerDay;
  const exact = _db[key];
  if (exact) return exact;
  const md = getDateKey(date).slice(5);
  if (_byMonthDay[md]) return _byMonthDay[md];
  // Future leap years: 29 Feb won't exist in a non-leap bundled year, so REPEAT the
  // 28 Feb times. This keeps every leap day working forever without a blank screen.
  if (md === '02-29' && _byMonthDay['02-28']) return _byMonthDay['02-28'];
  return null;
}

function calcNextPrayer(
  now: Date,
  today: PrayerDay,
  friday: boolean,
  bst: boolean,
  tomorrow: PrayerDay | null,
): NextPrayer {
  const cur = now.getHours() * 60 + now.getMinutes();

  // Jummah fixed times (BST vs GMT)
  const { j1, j2 } = jummahForBst(bst);

  type PrayerEntry = { id: NextPrayer['id']; name: string; jamaat: string; begins: string };

  const prayers: PrayerEntry[] = friday
    ? [
        { id: 'fajr',    name: 'Fajr',     jamaat: today.fajr[1],    begins: today.fajr[0] },
        { id: 'jummah1', name: 'Jummah 1', jamaat: j1,               begins: j1 },
        { id: 'jummah2', name: 'Jummah 2', jamaat: j2,               begins: j2 },
        { id: 'asr',     name: 'Asr',      jamaat: today.asr[1],     begins: today.asr[0] },
        { id: 'maghrib', name: 'Maghrib',  jamaat: today.maghrib,    begins: today.maghrib },
        { id: 'isha',    name: 'Isha',     jamaat: today.isha[1],    begins: today.isha[0] },
      ]
    : [
        { id: 'fajr',    name: 'Fajr',    jamaat: today.fajr[1],    begins: today.fajr[0] },
        { id: 'dhuhr',   name: 'Dhuhr',   jamaat: today.dhuhr[1],   begins: today.dhuhr[0] },
        { id: 'asr',     name: 'Asr',     jamaat: today.asr[1],     begins: today.asr[0] },
        { id: 'maghrib', name: 'Maghrib', jamaat: today.maghrib,    begins: today.maghrib },
        { id: 'isha',    name: 'Isha',    jamaat: today.isha[1],    begins: today.isha[0] },
      ];

  const nxtIdx = prayers.findIndex(p => timeToMinutes(p.jamaat) > cur);

  // All of today's prayers have passed — next is tomorrow's Fajr
  if (nxtIdx === -1) {
    const tomorrowFajr = tomorrow?.fajr[1] ?? today.fajr[1];
    const nxtM = timeToMinutes(tomorrowFajr) + 1440; // always next-day
    const prv  = prayers[prayers.length - 1]; // Isha
    const prvM = timeToMinutes(prv.jamaat);
    const progress = Math.min(Math.max(((cur - prvM) / (nxtM - prvM)) * 100, 0), 100);
    const tomorrowFajrBegins = tomorrow?.fajr[0] ?? today.fajr[0];
    const beginsM = timeToMinutes(tomorrowFajrBegins) + 1440;
    return { id: 'fajr', name: 'Fajr', jamaat: tomorrowFajr, begins: tomorrowFajrBegins, minutesUntil: nxtM - cur, minutesUntilBegins: beginsM - cur, progress };
  }

  const nxt = prayers[nxtIdx];
  const prv = prayers[(nxtIdx - 1 + prayers.length) % prayers.length];

  const nxtM = timeToMinutes(nxt.jamaat);
  let prvM = timeToMinutes(prv.jamaat);
  if (nxtIdx === 0) prvM -= 1440; // Fajr is first — previous was yesterday's Isha

  const progress = Math.min(Math.max(((cur - prvM) / (nxtM - prvM)) * 100, 0), 100);
  const minutesUntil = nxtM - cur;

  // For adhan mode: minutes until the begins/adhan time.
  // If begins has already passed (e.g. we're between adhan and jamaat), clamp to 0.
  const beginsM = timeToMinutes(nxt.begins);
  const minutesUntilBegins = Math.max(beginsM - cur, 0);

  return { ...nxt, minutesUntil, minutesUntilBegins, begins: nxt.begins, progress };
}

export function getPrayerDataForDate(date: Date): PrayerDay | null {
  return resolvePrayerDay(date);
}

export type WidgetState = {
  today: PrayerDay | null;
  now: Date;
  hijri: HijriDate | null;
  next: NextPrayer | null;
  isBSTActive: boolean;
  isFriday: boolean;
};

export function usePrayerTimes(): WidgetState {
  const [state, setState] = useState<WidgetState>(() => buildState(new Date()));

  useEffect(() => {
    const interval = setInterval(() => setState(buildState(new Date())), 1000);
    return () => clearInterval(interval);
  }, []);

  return state;
}

function buildState(now: Date): WidgetState {
  const today = resolvePrayerDay(now);
  const bst = isBST(now);
  const friday = now.getDay() === 5;

  // Tomorrow's data — needed for after-Isha next-prayer calculation
  const tom = new Date(now);
  tom.setDate(tom.getDate() + 1);
  const tomorrow = resolvePrayerDay(tom);

  // Hijri date flips after Maghrib
  let hijriDate = new Date(now);
  if (today) {
    const maghribM = timeToMinutes(today.maghrib);
    const curM = now.getHours() * 60 + now.getMinutes();
    if (curM >= maghribM) hijriDate.setDate(now.getDate() + 1);
  }

  return {
    today,
    now,
    hijri: getHijriDate(hijriDate),
    next: today ? calcNextPrayer(now, today, friday, bst, tomorrow) : null,
    isBSTActive: bst,
    isFriday: friday,
  };
}
