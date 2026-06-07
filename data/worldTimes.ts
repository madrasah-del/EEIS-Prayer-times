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
  { id: 'algiers',     name: 'Algiers',     country: 'Algeria',      flag: '🇩🇿', utcOffsetHours: 1,   lat: 36.7538,  lon:   3.0588,  currency: 'DZD' },
  { id: 'dhaka',       name: 'Dhaka',       country: 'Bangladesh',   flag: '🇧🇩', utcOffsetHours: 6,   lat: 23.8103,  lon:  90.4125,  currency: 'BDT' },
  { id: 'cairo',       name: 'Cairo',       country: 'Egypt',        flag: '🇪🇬', utcOffsetHours: 2,   lat: 30.0444,  lon:  31.2357,  currency: 'EGP' },
  { id: 'india',       name: 'New Delhi',   country: 'India',        flag: '🇮🇳', utcOffsetHours: 5.5, lat: 28.6139,  lon:  77.2090,  currency: 'INR' },
  { id: 'mauritius',   name: 'Port Louis',  country: 'Mauritius',    flag: '🇲🇺', utcOffsetHours: 4,   lat: -20.1609, lon:  57.4961,  currency: 'MUR' },
  { id: 'casablanca',  name: 'Casablanca',  country: 'Morocco',      flag: '🇲🇦', utcOffsetHours: 1,   lat: 33.5731,  lon:  -7.5898,  currency: 'MAD' },
  { id: 'lagos',       name: 'Lagos',       country: 'Nigeria',      flag: '🇳🇬', utcOffsetHours: 1,   lat:  6.5244,  lon:   3.3792,  currency: 'NGN' },
  { id: 'islamabad',   name: 'Islamabad',   country: 'Pakistan',     flag: '🇵🇰', utcOffsetHours: 5,   lat: 33.6844,  lon:  73.0479,  currency: 'PKR' },
  { id: 'mogadishu',   name: 'Mogadishu',   country: 'Somalia',      flag: '🇸🇴', utcOffsetHours: 3,   lat:  2.0469,  lon:  45.3182,  currency: 'SOS' },
  { id: 'tunis',       name: 'Tunis',       country: 'Tunisia',      flag: '🇹🇳', utcOffsetHours: 1,   lat: 36.8065,  lon:  10.1815,  currency: 'TND' },
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
// Pass a list of city IDs to fetch ONLY those (plus the offline Haramain). Omit to
// fetch everything. World Times passes [Saudi + pinned] so unpinned cities are never
// downloaded — keeps the screen fast and data usage minimal.
export async function fetchCityPrayerTimes(cityIds?: string[]): Promise<AllCityPrayers> {
  const result: AllCityPrayers = {};
  const clean = (t: string) => (t ? t.split(' ')[0] : '00:00');

  // ── Haramain: adhan library (offline, Umm al-Qura) ────────────────────────
  try {
    const haramain = computeHaramainPrayers();
    result['mecca']  = haramain.mecca;
    result['medina'] = haramain.medina;
  } catch { /* fall through to API fetch for Saudi if adhan fails */ }

  // ── Other cities: AlAdhan API (only the requested ones) ────────────────────
  let nonSaudiCities = CITIES.filter(c => c.country !== 'Saudi Arabia');
  if (cityIds) nonSaudiCities = nonSaudiCities.filter(c => cityIds.includes(c.id));
  if (nonSaudiCities.length === 0) return result;  // Saudi-only fast path

  // Reuse fresh cached entries; only fetch cities we don't already have cached.
  let cachedFresh: AllCityPrayers = {};
  try {
    const cached = await AsyncStorage.getItem(PRAYER_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached) as { data: AllCityPrayers; timestamp: number };
      if (Date.now() - timestamp < PRAYER_TTL_MS) cachedFresh = data || {};
    }
  } catch { /* ignore */ }
  const toFetch = nonSaudiCities.filter(c => !cachedFresh[c.id]);
  // Carry over still-fresh cached entries for the requested cities
  nonSaudiCities.forEach(c => { if (cachedFresh[c.id]) result[c.id] = cachedFresh[c.id]; });
  if (toFetch.length === 0) return result;
  nonSaudiCities = toFetch;
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

  // Merge newly-fetched into the cached map and persist
  if (Object.keys(result).length > 0) {
    const merged = { ...cachedFresh, ...result };
    await AsyncStorage.setItem(
      PRAYER_CACHE_KEY,
      JSON.stringify({ data: merged, timestamp: Date.now() }),
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

// ─── Weather model + reliability guard (v72) ─────────────────────────────────

/**
 * ECMWF IFS (0.25°) — the gold-standard global model, fully open since Oct 2025 and
 * served free through Open-Meteo with no API key. We pin this explicitly instead of
 * Open-Meteo's default `best_match`, which auto-selected a model (GFS-type) that
 * spuriously fired thunderstorm codes over the hot Gulf — Dubai showed ⛈️ with 0 mm
 * of rain, alarming users when Apple/AccuWeather showed clear ~40 °C. ECMWF returns
 * realistic, stable output for the same location.
 */
const WEATHER_MODEL = 'ecmwf_ifs025';

/**
 * Sanity-check a WMO weather code against the actual predicted precipitation.
 *
 * No model is perfect, so as a universal safety net: if a code implies rain / drizzle /
 * showers / snow / thunder but the precipitation is effectively zero, we never show an
 * alarming wet/stormy graphic — we downgrade it to "partly cloudy". This prevents
 * mis-informing people anywhere in the world (not just Dubai). Dry codes (clear, cloudy,
 * fog) and genuinely wet codes (precip ≥ 0.1 mm) are passed through unchanged.
 */
const DRY_THRESHOLD_MM = 0.1;
export function reconcileWeatherCode(code: number, precipMm: number): number {
  const impliesPrecip =
    (code >= 51 && code <= 67) ||   // drizzle / rain (incl. freezing)
    (code >= 71 && code <= 77) ||   // snow
    (code >= 80 && code <= 86) ||   // rain / snow showers
    (code >= 95 && code <= 99);     // thunderstorm (+ hail)
  if (impliesPrecip && (precipMm ?? 0) < DRY_THRESHOLD_MM) {
    return 2; // partly cloudy — honest "unsettled but dry" sky, no scary icon
  }
  return code;
}

// ─── Weekly forecast (Open-Meteo daily) ──────────────────────────────────────

const FORECAST_CACHE_PREFIX = '@eeis_forecast_v2_'; // v2: ECMWF + precip guard (invalidate old cache)
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
    // v72: use the ECMWF IFS model (gold-standard global model, free via Open-Meteo)
    // instead of the default `best_match`, which spuriously flagged thunderstorms over
    // the hot Gulf (e.g. Dubai showed ⛈️ with 0 mm rain). See reconcileWeatherCode below.
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max` +
      `&forecast_days=7&models=${WEATHER_MODEL}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const d = json.daily;
    if (!d?.time) return [];
    const days: DayForecast[] = (d.time as string[]).map((date: string, i: number) => {
      const precip = d.precipitation_sum?.[i] ?? 0;
      return {
        date,
        maxTemp:       d.temperature_2m_max?.[i]   ?? 0,
        minTemp:       d.temperature_2m_min?.[i]   ?? 0,
        weatherCode:   reconcileWeatherCode(d.weather_code?.[i] ?? 0, precip),
        precipitation: precip,
        windMax:       d.wind_speed_10m_max?.[i]   ?? 0,
      };
    });
    await AsyncStorage.setItem(cacheKey, JSON.stringify({ data: days, timestamp: Date.now() }));
    return days;
  } catch {
    return [];
  }
}

// ─── Weather (Open-Meteo) ─────────────────────────────────────────────────────

const WEATHER_CACHE_KEY = '@eeis_weather_v2'; // v2: ECMWF + precip guard (invalidate old cache)
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

export async function fetchWeather(cityIds?: string[]): Promise<WeatherData> {
  // Check cache (merge so previously-fetched cities are retained)
  let cachedFresh: WeatherData = {};
  try {
    const cached = await AsyncStorage.getItem(WEATHER_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached) as { data: WeatherData; timestamp: number };
      if (Date.now() - timestamp < WEATHER_TTL_MS) cachedFresh = data || {};
    }
  } catch { /* ignore cache errors */ }

  // Only the requested cities (Saudi + pinned); omit to fetch all
  const targets = (cityIds ? CITIES.filter(c => cityIds.includes(c.id)) : CITIES);
  const need    = targets.filter(c => !cachedFresh[c.id]);

  const result: WeatherData = {};
  targets.forEach(c => { if (cachedFresh[c.id]) result[c.id] = cachedFresh[c.id]; });
  if (need.length === 0) return result;

  const lats = need.map(c => c.lat).join(',');
  const lons = need.map(c => c.lon).join(',');
  // v72: ECMWF model + precipitation (for the reliability guard below)
  const url  = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,weather_code,precipitation&forecast_days=1&models=${WEATHER_MODEL}`;
  need.forEach(c => { result[c.id] = { temp: null, code: null }; });
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const entries = Array.isArray(json) ? json : [json];
    need.forEach((city, i) => {
      const cur  = entries[i]?.current;
      const code = cur?.weather_code ?? null;
      result[city.id] = {
        temp: cur?.temperature_2m ?? null,
        code: code === null ? null : reconcileWeatherCode(code, cur?.precipitation ?? 0),
      };
    });
    await AsyncStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({
      data: { ...cachedFresh, ...result },
      timestamp: Date.now(),
    }));
  } catch { /* nulls on network error */ }
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
 * Parse FloatRates date string "Tue, 20 May 2025 23:55:01 GMT" → "20 May 2025 · 23:55"
 */
function parseFloatRatesDate(raw: string): string {
  const parts = raw.split(' ');
  // parts: ["Tue,", "20", "May", "2025", "23:55:01", "GMT"]
  if (parts.length >= 4) {
    const time = parts[4] && /^\d{2}:\d{2}/.test(parts[4]) ? ` · ${parts[4].slice(0, 5)}` : '';
    return `${parts[1]} ${parts[2]} ${parts[3]}${time}`;
  }
  return raw;
}

/** Fetch from a single URL with an 8s timeout; returns null on any failure */
async function fetchWithTimeout(url: string): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

/**
 * Parse rates from each source's response format.
 * Returns CurrencyData or null if the response doesn't match.
 */
async function parseFloatRates(res: Response): Promise<CurrencyData | null> {
  try {
    // { "sar": { "code": "SAR", "rate": 4.78, "date": "Tue, 20 May 2025 ...", ... }, ... }
    const json = await res.json() as Record<string, { code: string; rate: number; date: string }>;
    const rates: Record<string, number> = {};
    let dateStr = '';
    for (const [, entry] of Object.entries(json)) {
      if (entry?.code && typeof entry.rate === 'number') {
        rates[entry.code.toUpperCase()] = entry.rate;
        if (!dateStr && entry.date) dateStr = parseFloatRatesDate(entry.date);
      }
    }
    if (Object.keys(rates).length === 0) return null;
    return { rates, dateStr };
  } catch { return null; }
}

async function parseFawazRates(res: Response): Promise<CurrencyData | null> {
  try {
    // { "gbp": { "sar": 4.78, "pkr": 395.5, ... } }
    const json = await res.json() as Record<string, Record<string, number>>;
    const inner = json?.gbp ?? {};
    if (!inner || typeof inner !== 'object') return null;
    const rates: Record<string, number> = {};
    for (const [code, rate] of Object.entries(inner)) {
      if (typeof rate === 'number') rates[code.toUpperCase()] = rate;
    }
    if (Object.keys(rates).length === 0) return null;
    return { rates, dateStr: '' };
  } catch { return null; }
}

async function parseOpenERRates(res: Response): Promise<CurrencyData | null> {
  try {
    // { "base": "GBP", "rates": { "SAR": 4.78, ... }, "time_last_update_utc": "..." }
    const json = await res.json() as { base?: string; rates?: Record<string, number>; time_last_update_utc?: string };
    const ratesRaw = json?.rates;
    if (!ratesRaw || typeof ratesRaw !== 'object') return null;
    const rates: Record<string, number> = {};
    for (const [code, rate] of Object.entries(ratesRaw)) {
      if (typeof rate === 'number') rates[code.toUpperCase()] = rate;
    }
    if (Object.keys(rates).length === 0) return null;
    // Extract date from "time_last_update_utc": "Tue, 20 May 2025 00:00:01 +0000"
    const dateStr = json.time_last_update_utc ? parseFloatRatesDate(json.time_last_update_utc) : '';
    return { rates, dateStr };
  } catch { return null; }
}

export async function fetchCurrencyRates(): Promise<CurrencyData | null> {
  let staleData: CurrencyData | null = null;

  // Check cache — return fresh data immediately; keep stale as fallback
  try {
    const cached = await AsyncStorage.getItem(CURRENCY_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached) as { data: CurrencyData; timestamp: number };
      if (Date.now() - timestamp < CURRENCY_TTL_MS) return data;
      staleData = data; // keep stale data to return on network failure
    }
  } catch { /* ignore */ }

  // ── Source 1: FloatRates (primary) ────────────────────────────────────────
  const floatRes = await fetchWithTimeout('https://www.floatrates.com/daily/gbp.json');
  if (floatRes) {
    const data = await parseFloatRates(floatRes);
    if (data && Object.keys(data.rates).length > 0) {
      await AsyncStorage.setItem(CURRENCY_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() })).catch(() => {});
      return data;
    }
  }

  // ── Source 2: fawazahmed0 currency-api (jsDelivr CDN) ────────────────────
  const fawazRes = await fetchWithTimeout(
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/gbp.json',
  );
  if (fawazRes) {
    const data = await parseFawazRates(fawazRes);
    if (data && Object.keys(data.rates).length > 0) {
      await AsyncStorage.setItem(CURRENCY_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() })).catch(() => {});
      return data;
    }
  }

  // ── Source 3: open.er-api.com (free tier, no key needed) ─────────────────
  const erRes = await fetchWithTimeout('https://open.er-api.com/v6/latest/GBP');
  if (erRes) {
    const data = await parseOpenERRates(erRes);
    if (data && Object.keys(data.rates).length > 0) {
      await AsyncStorage.setItem(CURRENCY_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() })).catch(() => {});
      return data;
    }
  }

  // All sources failed — return last-known rates (stale but better than nothing)
  return staleData;
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
