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
import { formatDateUK } from './newsApi';

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

// ─── Time helper ──────────────────────────────────────────────────────────────

/**
 * Get current local time string (HH:MM) for a given UTC offset.
 * Uses the device's UTC time — no API call needed.
 */
export function getLocalTime(utcOffsetHours: number): string {
  const nowUtcMs = Date.now() + new Date().getTimezoneOffset() * 60 * 1000;
  const localMs  = nowUtcMs + utcOffsetHours * 60 * 60 * 1000;
  const d = new Date(localMs);
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// ─── Weather (Open-Meteo) ─────────────────────────────────────────────────────

const WEATHER_CACHE_KEY = '@eeis_weather_v1';
const WEATHER_TTL_MS    = 30 * 60 * 1000; // 30 minutes

export type WeatherData = Record<string, number | null>; // cityId → °C

export async function fetchWeather(): Promise<WeatherData> {
  // Check cache
  try {
    const cached = await AsyncStorage.getItem(WEATHER_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached) as { data: WeatherData; timestamp: number };
      if (Date.now() - timestamp < WEATHER_TTL_MS) return data;
    }
  } catch { /* ignore cache errors */ }

  // Build single batched request for all cities
  const lats = CITIES.map(c => c.lat).join(',');
  const lons = CITIES.map(c => c.lon).join(',');
  const url  = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m&forecast_days=1`;

  const result: WeatherData = {};
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    // open-meteo returns array when multiple locations requested
    const entries = Array.isArray(json) ? json : [json];
    CITIES.forEach((city, i) => {
      result[city.id] = entries[i]?.current?.temperature_2m ?? null;
    });

    await AsyncStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({
      data: result,
      timestamp: Date.now(),
    }));
  } catch {
    // Return nulls on network error
    CITIES.forEach(c => { result[c.id] = null; });
  }
  return result;
}

// ─── Currency (frankfurter.app) ───────────────────────────────────────────────

const CURRENCY_CACHE_KEY = '@eeis_currency_v1';
const CURRENCY_TTL_MS    = 4 * 60 * 60 * 1000; // 4 hours

export type CurrencyData = {
  rates: Record<string, number>;  // e.g. { SAR: 4.78, PKR: 395.5, ... }
  date:  string;                  // YYYY-MM-DD from API
};

export async function fetchCurrencyRates(): Promise<CurrencyData | null> {
  // Check cache
  try {
    const cached = await AsyncStorage.getItem(CURRENCY_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached) as { data: CurrencyData; timestamp: number };
      if (Date.now() - timestamp < CURRENCY_TTL_MS) return data;
    }
  } catch { /* ignore */ }

  // Build unique currency codes from cities
  const codes = [...new Set(CITIES.map(c => c.currency))].join(',');
  const url   = `https://api.frankfurter.dev/v1/latest?from=GBP&to=${codes}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as { rates: Record<string, number>; date: string };
    const data: CurrencyData = { rates: json.rates, date: json.date };

    await AsyncStorage.setItem(CURRENCY_CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now(),
    }));
    return data;
  } catch {
    return null;
  }
}

/** Format a currency rate for display: "1 GBP = 395.50 PKR" */
export function formatRate(rate: number, code: string): string {
  // Use 2 decimal places for most, no decimals for large rates (PKR, BDT, etc.)
  const decimals = rate < 10 ? 4 : rate < 100 ? 2 : 0;
  return `1 GBP = ${rate.toFixed(decimals)} ${code}`;
}

/** Format Open-Meteo date (YYYY-MM-DD) for display */
export function formatRateDate(isoDate: string): string {
  return formatDateUK(isoDate);
}
