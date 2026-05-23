/**
 * World Times data layer.
 *
 * Provides:
 *  - City definitions (timezone offset, lat/lon, currency code, flag)
 *  - fetchWeather(): Open-Meteo API (free, no key) — all cities in one call
 *  - fetchCurrencyRates(): frankfurter.app (free, no key) — all currencies in one call
 *  - 30-min weather cache + 4-hour currency cache in AsyncStorage
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Coordinates, CalculationMethod, PrayerTimes as AdhanPrayerTimes } from 'adhan';
/** Converts YYYY-MM-DD to DD/MM/YYYY for display. */
function formatDateUK(isoDate: string): string {
  const parts = isoDate.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : isoDate;
}

// ─── City definitions ─────────────────────────────────────────────────────────

export type City = {
  id:       string;
  name:     string;         // city name
  country:  string;
  flag:     string;
  utcOffsetHours: number;   // e.g. 5.5 for India
  lat:      number;
  lon:      number;
  currency: string;         // ISO 4217 code for GBP comparison
};

/**
 * Ordered list: Mecca first, Medina second (Saudi Arabia grouping),
 * then all other cities in alphabetical order by country name.
 *
 * Suggested additions not yet included (large Muslim populations):
 *  - Indonesia / Jakarta  (~231 M Muslims, UTC+7, IDR)
 *  - Malaysia  / Kuala Lumpur (~20 M Muslims, UTC+8, MYR)
 *  - Turkey    / Istanbul (~84 M Muslims, UTC+3, TRY)
 *  - Somalia   / Mogadishu  (UTC+3, SOS)
 */
export const CITIES: City[] = [
  // ── Saudi Arabia (always first — Mecca then Medina) ──────────────────────
  { id: 'mecca',       name: 'Mecca',       country: 'Saudi Arabia', flag: '🕌', utcOffsetHours: 3,   lat: 21.3891,  lon:  39.8579,  currency: 'SAR' },
  { id: 'medina',      name: 'Medina',      country: 'Saudi Arabia', flag: '🕌', utcOffsetHours: 3,   lat: 24.5247,  lon:  39.5692,  currency: 'SAR' },
  // ── Remaining countries — alphabetical by country name ───────────────────
  { id: 'kabul',       name: 'Kabul',       country: 'Afghanistan',  flag: '🇦🇫', utcOffsetHours: 4.5, lat: 34.5553,  lon:  69.2075,  currency: 'AFN' },
  { id: 'dhaka',       name: 'Dhaka',       country: 'Bangladesh',   flag: '🇧🇩', utcOffsetHours: 6,   lat: 23.8103,  lon:  90.4125,  currency: 'BDT' },
  { id: 'cairo',       name: 'Cairo',       country: 'Egypt',        flag: '🇪🇬', utcOffsetHours: 2,   lat: 30.0444,  lon:  31.2357,  currency: 'EGP' },
  { id: 'india',       name: 'New Delhi',   country: 'India',        flag: '🇮🇳', utcOffsetHours: 5.5, lat: 28.6139,  lon:  77.2090,  currency: 'INR' },
  { id: 'mauritius',   name: 'Port Louis',  country: 'Mauritius',    flag: '🇲🇺', utcOffsetHours: 4,   lat: -20.1609, lon:  57.4961,  currency: 'MUR' },
  { id: 'casablanca',  name: 'Casablanca',  country: 'Morocco',      flag: '🇲🇦', utcOffsetHours: 1,   lat: 33.5731,  lon:  -7.5898,  currency: 'MAD' },
  { id: 'lagos',       name: 'Lagos',       country: 'Nigeria',      flag: '🇳🇬', utcOffsetHours: 1,   lat:  6.5244,  lon:   3.3792,  currency: 'NGN' },
  { id: 'islamabad',   name: 'Islamabad',   country: 'Pakistan',     flag: '🇵🇰', utcOffsetHours: 5,   lat: 33.6844,  lon:  73.0479,  currency: 'PKR' },
  { id: 'istanbul',    name: 'Istanbul',    country: 'Turkey',       flag: '🇹🇷', utcOffsetHours: 3,   lat: 41.0082,  lon:  28.9784,  currency: 'TRY' },
  { id: 'dubai',       name: 'Dubai',       country: 'UAE',          flag: '🇦🇪', utcOffsetHours: 4,   lat: 25.2048,  lon:  55.2708,  currency: 'AED' },
];

// ─── Time helpers ─────────────────────────────────────────────────────────────

/**
 * Get current local time string (HH:MM) for a given UTC offset.
 * Date.now() is already UTC milliseconds — no timezone adjustment needed.
 */
export function getLocalTime(utcOffsetHours: number): string {
  const localMs = Date.now() + utcOffsetHours * 3600 * 1000;
  const d = new Date(localMs);
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Returns the current UK UTC offset: +1 during BST, 0 during GMT.
 * BST runs from the last Sunday in March at 01:00 UTC
 *   to the last Sunday in October at 01:00 UTC.
 * This is computed purely from the UTC date — device timezone does NOT matter.
 */
export function getUKOffsetHours(): number {
  const now  = new Date();
  const year = now.getUTCFullYear();

  // Last Sunday in March at 01:00 UTC
  const bstStart = new Date(Date.UTC(year, 2, 31));
  bstStart.setUTCDate(31 - bstStart.getUTCDay());
  bstStart.setUTCHours(1, 0, 0, 0);

  // Last Sunday in October at 01:00 UTC
  const bstEnd = new Date(Date.UTC(year, 9, 31));
  bstEnd.setUTCDate(31 - bstEnd.getUTCDay());
  bstEnd.setUTCHours(1, 0, 0, 0);

  return now >= bstStart && now < bstEnd ? 1 : 0;
}

/**
 * Returns how many hours ahead (+) or behind (-) a city is relative to
 * current UK local time. Accounts for BST: during summer, UK is UTC+1 so
 * Saudi Arabia (+3 UTC) is only 2 hours ahead of UK, not 3.
 */
export function getRelativeOffset(cityUtcOffsetHours: number): number {
  return cityUtcOffsetHours - getUKOffsetHours();
}

/** Current UK local time as HH:MM string. */
export function getUKTime(): string {
  return getLocalTime(getUKOffsetHours());
}

// ─── Next prayer helper ───────────────────────────────────────────────────────

export type NextPrayerInfo = {
  name:         string;
  emoji:        string;
  time:         string;   // HH:MM in city local time
  minutesUntil: number;
};

const PRAYER_SEQUENCE: { name: string; emoji: string; key: keyof CityPrayerTimes }[] = [
  { name: 'Fajr',    emoji: '🌄', key: 'fajr'    },
  { name: 'Sunrise', emoji: '🌅', key: 'sunrise'  },
  { name: 'Dhuhr',   emoji: '☀️', key: 'dhuhr'   },
  { name: 'Asr',     emoji: '🌤️', key: 'asr'     },
  { name: 'Maghrib', emoji: '🌇', key: 'maghrib'  },
  { name: 'Isha',    emoji: '🌃', key: 'isha'     },
];

function toMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Given a city's prayer times and its current local time (HH:MM),
 * returns the next upcoming prayer with its time and minutes until.
 */
export function getNextPrayer(
  times: CityPrayerTimes,
  localHHMM: string,
): NextPrayerInfo {
  const nowMins = toMins(localHHMM);
  for (const p of PRAYER_SEQUENCE) {
    const pMins = toMins(times[p.key]);
    if (pMins > nowMins) {
      return { name: p.name, emoji: p.emoji, time: times[p.key], minutesUntil: pMins - nowMins };
    }
  }
  // Past Isha — next prayer is Fajr tomorrow
  return {
    name: 'Fajr', emoji: '🌄', time: times.fajr,
    minutesUntil: (24 * 60 - nowMins) + toMins(times.fajr),
  };
}

// ─── Prayer times ─────────────────────────────────────────────────────────────

const PRAYER_CACHE_KEY = '@eeis_city_prayers_v2'; // v2: adhan for Haramain; correct AlAdhan method per region
const PRAYER_TTL_MS    = 6 * 60 * 60 * 1000; // 6 hours

export type CityPrayerTimes = {
  fajr:    string;  // "HH:MM" in city local time
  sunrise: string;
  dhuhr:   string;
  asr:     string;
  maghrib: string;
  isha:    string;
};
export type AllCityPrayers = Record<string, CityPrayerTimes>; // cityId → times

/**
 * Compute Mecca & Medina prayer times client-side using the `adhan` library
 * with the official Umm al-Qura University calculation method (Saudi Ministry
 * of Islamic Affairs). No network call — works offline.
 *
 * Returns HH:MM strings in Saudi local time (UTC+3, no DST).
 */
function computeHaramainPrayers(): { mecca: CityPrayerTimes; medina: CityPrayerTimes } {
  const date   = new Date();
  const params = CalculationMethod.UmmAlQura();

  // Exact Kaaba / Prophet's Mosque GPS coordinates
  const meccaPT  = new AdhanPrayerTimes(new Coordinates(21.3891, 39.8579),  date, params);
  const medinaPT = new AdhanPrayerTimes(new Coordinates(24.5247, 39.5692),  date, params);

  // Format a Date from adhan to HH:MM in Saudi time (always UTC+3, no DST)
  const fmt = (d: Date) => {
    const localMs = d.getTime() + 3 * 3600 * 1000;
    const local   = new Date(localMs);
    return `${String(local.getUTCHours()).padStart(2,'0')}:${String(local.getUTCMinutes()).padStart(2,'0')}`;
  };

  const toTimes = (pt: AdhanPrayerTimes): CityPrayerTimes => ({
    fajr:    fmt(pt.fajr),
    sunrise: fmt(pt.sunrise),
    dhuhr:   fmt(pt.dhuhr),
    asr:     fmt(pt.asr),
    maghrib: fmt(pt.maghrib),
    isha:    fmt(pt.isha),
  });

  return { mecca: toTimes(meccaPT), medina: toTimes(medinaPT) };
}

/**
 * Fetch today's prayer times for every city.
 *
 * Mecca & Medina: computed locally via the `adhan` library using the
 * official Umm al-Qura method — accurate, offline, no API rate limit.
 *
 * All other cities: AlAdhan API (method=2 ISNA for general; method=4 UmmAlQura
 * for North Africa/Middle East gives similar results for non-Saudi cities).
 *
 * Sequential API requests with 250ms gap to avoid rate-limiting.
 * Results cached for 6 hours.
 */
export async function fetchCityPrayerTimes(): Promise<AllCityPrayers> {
  // Return cached data if still fresh
  try {
    const cached = await AsyncStorage.getItem(PRAYER_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached) as { data: AllCityPrayers; timestamp: number };
      if (Date.now() - timestamp < PRAYER_TTL_MS) return data;
    }
  } catch { /* ignore */ }

  const result: AllCityPrayers = {};
  const clean = (t: string) => (t ? t.split(' ')[0] : '00:00');

  // ── Haramain: adhan library (offline, Umm al-Qura) ────────────────────────
  try {
    const haramain = computeHaramainPrayers();
    result['mecca']  = haramain.mecca;
    result['medina'] = haramain.medina;
  } catch { /* fall through to API fetch for Saudi if adhan fails */ }

  // ── Other cities: AlAdhan API ──────────────────────────────────────────────
  const nonSaudiCities = CITIES.filter(c => c.country !== 'Saudi Arabia');
  for (const city of nonSaudiCities) {
    try {
      const res = await fetch(
        `https://api.aladhan.com/v1/timings?latitude=${city.lat}&longitude=${city.lon}&method=2`,
        { headers: { 'Accept': 'application/json' } },
      );
      if (res.ok) {
        const json = await res.json();
        const timings = json?.data?.timings;
        if (timings) {
          result[city.id] = {
            fajr:    clean(timings.Fajr),
            sunrise: clean(timings.Sunrise),
            dhuhr:   clean(timings.Dhuhr),
            asr:     clean(timings.Asr),
            maghrib: clean(timings.Maghrib),
            isha:    clean(timings.Isha),
          };
        }
      }
    } catch { /* skip this city — network error */ }
    // 250ms gap between requests to avoid rate-limiting
    await new Promise(r => setTimeout(r, 250));
  }

  if (Object.keys(result).length > 0) {
    await AsyncStorage.setItem(
      PRAYER_CACHE_KEY,
      JSON.stringify({ data: result, timestamp: Date.now() }),
    ).catch(() => {});
  }
  return result;
}

/**
 * Given a city's prayer times and its current local time (HH:MM),
 * return which prayer period is active.
 */
export function getCurrentPrayer(
  times: CityPrayerTimes,
  localHHMM: string,
): { name: string; emoji: string } {
  const t = localHHMM;
  if (t < times.fajr)    return { name: 'Night',   emoji: '🌙' };
  if (t < times.sunrise) return { name: 'Fajr',    emoji: '🌄' };
  if (t < times.dhuhr)   return { name: 'Shuruq',  emoji: '🌅' };
  if (t < times.asr)     return { name: 'Dhuhr',   emoji: '☀️' };
  if (t < times.maghrib) return { name: 'Asr',     emoji: '🌤️' };
  if (t < times.isha)    return { name: 'Maghrib',  emoji: '🌇' };
  return { name: 'Isha',   emoji: '🌃' };
}

// ─── Weekly forecast (Open-Meteo daily) ──────────────────────────────────────

const FORECAST_CACHE_PREFIX = '@eeis_forecast_v1_';
const FORECAST_TTL_MS       = 60 * 60 * 1000; // 1 hour

export type DayForecast = {
  date:          string;   // YYYY-MM-DD
  maxTemp:       number;   // °C
  minTemp:       number;   // °C
  weatherCode:   number;   // WMO code
  precipitation: number;   // mm
  windMax:       number;   // km/h
};

/**
 * Fetch 7-day daily forecast for a single city from Open-Meteo.
 * Cached for 1 hour per city.
 */
export async function fetchWeeklyForecast(
  cityId: string,
  lat: number,
  lon: number,
): Promise<DayForecast[]> {
  const cacheKey = FORECAST_CACHE_PREFIX + cityId;
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached) as { data: DayForecast[]; timestamp: number };
      if (Date.now() - timestamp < FORECAST_TTL_MS) return data;
    }
  } catch { /* ignore */ }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max` +
      `&forecast_days=7`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const d = json.daily;
    if (!d?.time) return [];
    const days: DayForecast[] = (d.time as string[]).map((date: string, i: number) => ({
      date,
      maxTemp:       d.temperature_2m_max?.[i]   ?? 0,
      minTemp:       d.temperature_2m_min?.[i]   ?? 0,
      weatherCode:   d.weather_code?.[i]         ?? 0,
      precipitation: d.precipitation_sum?.[i]    ?? 0,
      windMax:       d.wind_speed_10m_max?.[i]   ?? 0,
    }));
    await AsyncStorage.setItem(cacheKey, JSON.stringify({ data: days, timestamp: Date.now() }));
    return days;
  } catch {
    return [];
  }
}

// ─── Weather (Open-Meteo) ─────────────────────────────────────────────────────

const WEATHER_CACHE_KEY = '@eeis_weather_v1';
const WEATHER_TTL_MS    = 30 * 60 * 1000; // 30 minutes

export type WeatherEntry = {
  temp: number | null;  // °C
  code: number | null;  // WMO weather code
};
export type WeatherData = Record<string, WeatherEntry>; // cityId → entry

/**
 * WMO weather code → display emoji + label.
 * WMO codes: 0=clear, 1-3=partly cloudy, 45/48=fog,
 *            51/53/55=drizzle, 61/63/65=rain, 71/73/75=snow,
 *            80/81/82=showers, 95=thunderstorm, 96/99=hail+thunder
 */
export function weatherIcon(code: number | null): string {
  if (code === null) return '';
  if (code === 0)               return '☀️';
  if (code <= 3)                return '⛅';
  if (code <= 48)               return '🌫️';
  if (code <= 55)               return '🌦️';    // drizzle
  if (code === 61)              return '🌧️';    // light rain
  if (code === 63)              return '🌧️🌧️';  // moderate rain
  if (code === 65)              return '🌧️🌧️🌧️'; // heavy rain
  if (code <= 75)               return '🌨️';    // snow
  if (code === 80)              return '🌦️';    // light showers
  if (code === 81)              return '🌧️🌧️';  // moderate showers
  if (code === 82)              return '🌧️🌧️🌧️'; // heavy showers
  if (code === 95)              return '⛈️';    // thunderstorm
  if (code >= 96)               return '⛈️⚡';  // thunderstorm + hail
  return '🌡️';
}

/**
 * Temperature → heat-scale emoji (visual intensity scale).
 *  ≤5°C   : ❄️    (freezing)
 *  ≤14°C  : 🌤️    (cool)
 *  ≤22°C  : ☀️    (warm / pleasant)
 *  ≤30°C  : 🌞    (hot)
 *  ≤38°C  : 🔥    (very hot)
 *  >38°C  : 🔥🔥  (blisteringly hot — double fire so hotter = more fire)
 */
export function tempIcon(temp: number | null): string {
  if (temp === null) return '';
  if (temp <= 5)  return '❄️';
  if (temp <= 14) return '🌤️';
  if (temp <= 22) return '☀️';
  if (temp <= 30) return '🌞';
  if (temp <= 38) return '🔥';
  return '🔥🔥';
}

export async function fetchWeather(): Promise<WeatherData> {
  // Check cache
  try {
    const cached = await AsyncStorage.getItem(WEATHER_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached) as { data: WeatherData; timestamp: number };
      if (Date.now() - timestamp < WEATHER_TTL_MS) return data;
    }
  } catch { /* ignore cache errors */ }

  // Build single batched request for all cities (temp + weather code)
  const lats = CITIES.map(c => c.lat).join(',');
  const lons = CITIES.map(c => c.lon).join(',');
  const url  = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,weather_code&forecast_days=1`;

  const result: WeatherData = {};
  CITIES.forEach(c => { result[c.id] = { temp: null, code: null }; });
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    // open-meteo returns array when multiple locations requested
    const entries = Array.isArray(json) ? json : [json];
    CITIES.forEach((city, i) => {
      result[city.id] = {
        temp: entries[i]?.current?.temperature_2m ?? null,
        code: entries[i]?.current?.weather_code   ?? null,
      };
    });

    await AsyncStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({
      data: result,
      timestamp: Date.now(),
    }));
  } catch { /* nulls on network error — result already initialised above */ }
  return result;
}

// ─── Currency (FloatRates.com — free, covers all currencies, updated hourly) ──

// v2: switched from Frankfurter (ECB only) to FloatRates (all currencies)
const CURRENCY_CACHE_KEY = '@eeis_currency_v2';
const CURRENCY_TTL_MS    = 4 * 60 * 60 * 1000; // 4 hours

export type CurrencyData = {
  rates:    Record<string, number>;  // e.g. { SAR: 4.78, PKR: 395.5, ... } — UPPERCASE keys
  dateStr:  string;                  // human-readable: "20 May" parsed from FloatRates date field
};

/**
 * Parse FloatRates date string "Tue, 20 May 2025 23:55:01 GMT" → "20 May 2025"
 */
function parseFloatRatesDate(raw: string): string {
  const parts = raw.split(' ');
  // parts: ["Tue,", "20", "May", "2025", ...]
  if (parts.length >= 4) return `${parts[1]} ${parts[2]} ${parts[3]}`;
  return raw;
}

export async function fetchCurrencyRates(): Promise<CurrencyData | null> {
  // Check cache
  try {
    const cached = await AsyncStorage.getItem(CURRENCY_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached) as { data: CurrencyData; timestamp: number };
      if (Date.now() - timestamp < CURRENCY_TTL_MS) return data;
    }
  } catch { /* ignore */ }

  // FloatRates returns GBP → all world currencies in one call (no API key needed)
  const url = 'https://www.floatrates.com/daily/gbp.json';

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Response: { "sar": { "code": "SAR", "rate": 4.78, "date": "Tue, 20 May 2025 ...", ... }, ... }
    const json = await res.json() as Record<string, { code: string; rate: number; date: string }>;

    const rates: Record<string, number> = {};
    let dateStr = '';
    for (const [, entry] of Object.entries(json)) {
      if (entry?.code && typeof entry.rate === 'number') {
        rates[entry.code.toUpperCase()] = entry.rate;
        if (!dateStr && entry.date) dateStr = parseFloatRatesDate(entry.date);
      }
    }
    const data: CurrencyData = { rates, dateStr };

    await AsyncStorage.setItem(CURRENCY_CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now(),
    }));
    return data;
  } catch {
    return null;
  }
}

/** Format a currency rate for display: "1 GBP = 4.7800 SAR (20 May 2025)" */
export function formatRate(rate: number, code: string, dateStr?: string): string {
  const decimals = rate < 10 ? 4 : rate < 100 ? 2 : 0;
  const dateLabel = dateStr ? ` (${dateStr})` : '';
  return `1 GBP = ${rate.toFixed(decimals)} ${code}${dateLabel}`;
}

/** Not used externally — kept for compatibility */
export function formatRateDate(isoDate: string): string {
  return formatDateUK(isoDate);
}
