/**
 * WorldTimesScreen — full-screen modal showing local time, current prayer,
 * temperature/weather and GBP exchange rate for cities relevant to the EEIS community.
 *
 * Tap temperature row → opens WeeklyForecastModal (7-day Open-Meteo forecast)
 * Tap exchange rate   → opens xe.com 12-month GBP chart in-app browser
 * Tap city flag/name  → nothing (future: city detail)
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, StatusBar, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import {
  CITIES,
  City,
  getLocalTime,
  getUKTime,
  getUKOffsetHours,
  getRelativeOffset,
  getNextPrayer,
  getCurrentPrayer,
  fetchWeather,
  fetchCurrencyRates,
  fetchCityPrayerTimes,
  fetchWeeklyForecast,
  formatRate,
  formatRateDate,
  WeatherData,
  WeatherEntry,
  AllCityPrayers,
  CityPrayerTimes,
  NextPrayerInfo,
  CurrencyData,
  DayForecast,
  tempIcon,
  weatherIcon,
} from '../data/worldTimes';
import { Colors } from '../constants/theme';

// ─── Pinned cities ────────────────────────────────────────────────────────────

const PINNED_CITIES_KEY = '@eeis_pinned_cities_v1';
const MAX_PINS = 3;

async function fetchPinnedCities(): Promise<string[]> {
  try {
    const stored = await AsyncStorage.getItem(PINNED_CITIES_KEY);
    return stored ? JSON.parse(stored) as string[] : [];
  } catch { return []; }
}

async function savePinnedCities(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(PINNED_CITIES_KEY, JSON.stringify(ids)).catch(() => {});
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  visible:     boolean;
  onClose:     () => void;
  fontsLoaded: boolean;
};

// ─── Timezone group helpers ───────────────────────────────────────────────────

/** Format an absolute UTC offset e.g. +3, +5½ */
function fmtUtcOffset(h: number): string {
  const sign  = h >= 0 ? '+' : '';
  if (h === Math.floor(h)) return `${sign}${h}`;
  const whole = Math.floor(h);
  const frac  = Math.abs(h - whole);
  return `${sign}${whole}${frac === 0.5 ? '½' : frac.toFixed(1).slice(1)}`;
}

/** Format relative offset vs current UK time, e.g. "+2 hrs ahead" / "same as UK" */
function aheadLabel(relOffset: number): string {
  if (relOffset === 0) return 'same time as UK';
  const abs   = Math.abs(relOffset);
  const dir   = relOffset > 0 ? 'ahead of' : 'behind';
  const whole = Math.floor(abs);
  const half  = abs !== whole ? '½ ' : '';
  return `${whole}${half} hr${abs === 1 ? '' : 's'} ${dir} UK`;
}

// ─── Weekly forecast modal ────────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type ForecastModalProps = {
  city:        City;
  forecast:    DayForecast[];
  loading:     boolean;
  fontsLoaded: boolean;
  onClose:     () => void;
};

function WeeklyForecastModal({ city, forecast, loading, fontsLoaded, onClose }: ForecastModalProps) {
  const bold = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={fw.root} edges={['top', 'bottom']}>
        <View style={fw.header}>
          <View>
            <Text style={[fw.headerTitle, { fontFamily: bold }]}>
              {city.flag} {city.name} — 7-Day Forecast
            </Text>
            <Text style={[fw.headerSub, { fontFamily: reg }]}>Open-Meteo · updated hourly</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={[fw.headerClose, { fontFamily: bold }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={fw.center}>
            <ActivityIndicator size="large" color={Colors.deepBlue} />
            <Text style={[fw.loadingText, { fontFamily: reg }]}>Fetching forecast…</Text>
          </View>
        ) : forecast.length === 0 ? (
          <View style={fw.center}>
            <Text style={[fw.emptyText, { fontFamily: reg }]}>No forecast available</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={fw.list}>
            {forecast.map((day, i) => {
              const d = new Date(day.date + 'T12:00:00Z');
              const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAY_NAMES[d.getUTCDay()];
              const dateStr = `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}`;
              const wi = weatherIcon(day.weatherCode);
              const ti = tempIcon(day.maxTemp);
              return (
                <View key={day.date} style={[fw.dayRow, i === 0 && fw.dayRowToday]}>
                  <View style={fw.dayLeft}>
                    <Text style={[fw.dayName, { fontFamily: bold }]}>{dayName}</Text>
                    <Text style={[fw.dayDate, { fontFamily: reg }]}>{dateStr}</Text>
                  </View>
                  <Text style={fw.dayCondIcon}>{wi || '🌡️'}</Text>
                  <Text style={fw.dayHeatIcon}>{ti}</Text>
                  <View style={fw.dayTemps}>
                    <Text style={[fw.tempMax, { fontFamily: bold }]}>{Math.round(day.maxTemp)}°</Text>
                    <Text style={[fw.tempMin, { fontFamily: reg }]}>{Math.round(day.minTemp)}°</Text>
                  </View>
                  <View style={fw.dayMeta}>
                    {day.precipitation > 0 && (
                      <Text style={[fw.metaItem, { fontFamily: reg }]}>
                        💧 {day.precipitation.toFixed(1)} mm
                      </Text>
                    )}
                    <Text style={[fw.metaItem, { fontFamily: reg }]}>
                      💨 {Math.round(day.windMax)} km/h
                    </Text>
                  </View>
                </View>
              );
            })}
            <Text style={[fw.footer, { fontFamily: reg }]}>
              Source: Open-Meteo (free, no API key) · Tap ✕ to close
            </Text>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const fw = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#F0F4F8' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                   backgroundColor: Colors.blueDeep, paddingHorizontal: 20, paddingVertical: 14 },
  headerTitle:  { fontSize: 16, fontWeight: '700', color: '#FFF' },
  headerSub:    { fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  headerClose:  { fontSize: 18, color: '#FFF', padding: 4 },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText:  { fontSize: 13, color: Colors.inkMute },
  emptyText:    { fontSize: 14, color: Colors.inkMute },
  list:         { padding: 12, gap: 8 },
  dayRow:       { backgroundColor: '#FFF', borderRadius: 12, padding: 14,
                   flexDirection: 'row', alignItems: 'center', gap: 10,
                   elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                   shadowOpacity: 0.06, shadowRadius: 3 },
  dayRowToday:  { borderLeftWidth: 3, borderLeftColor: Colors.deepBlue },
  dayLeft:      { width: 68 },
  dayName:      { fontSize: 14, fontWeight: '700', color: Colors.ink },
  dayDate:      { fontSize: 11, color: Colors.inkMute },
  dayCondIcon:  { fontSize: 22, width: 32, textAlign: 'center' },
  dayHeatIcon:  { fontSize: 18, width: 28, textAlign: 'center' },
  dayTemps:     { alignItems: 'flex-end', width: 54 },
  tempMax:      { fontSize: 18, fontWeight: '700', color: Colors.ink },
  tempMin:      { fontSize: 13, color: Colors.inkMute },
  dayMeta:      { flex: 1, alignItems: 'flex-end', gap: 2 },
  metaItem:     { fontSize: 11, color: Colors.inkMute },
  footer:       { fontSize: 10, color: Colors.inkMute, textAlign: 'center',
                   paddingVertical: 12 },
});

// ─── City card ────────────────────────────────────────────────────────────────

type CardProps = {
  city:         City;
  weather:      WeatherEntry | null | undefined;
  rate:         number | undefined;
  rateDate:     string | undefined;
  prayerTimes:  CityPrayerTimes | null | undefined;
  loading:      boolean;
  fontsLoaded:  boolean;
  isSaudi:      boolean;
  isPinned:     boolean;
  canPin:       boolean;  // false when 3 pins already taken and this city isn't pinned
  onTempPress:  () => void;
  onRatePress:  () => void;
  onPinToggle:  () => void;
};

function CityCard({
  city, weather, rate, rateDate, prayerTimes,
  loading, fontsLoaded, isSaudi, isPinned, canPin,
  onTempPress, onRatePress, onPinToggle,
}: CardProps) {
  const bold = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;

  const timeStr    = getLocalTime(city.utcOffsetHours);
  const relOffset  = getRelativeOffset(city.utcOffsetHours);
  const temp       = weather?.temp ?? null;
  const code       = weather?.code ?? null;
  const heatEmoji  = tempIcon(temp);
  const condEmoji  = weatherIcon(code);

  // Current period + next prayer
  const currentPeriod = prayerTimes ? getCurrentPrayer(prayerTimes, timeStr) : null;
  const nextPrayer    = prayerTimes ? getNextPrayer(prayerTimes, timeStr)    : null;

  // Countdown label: e.g. "47m" or "4h 12m"
  const countdownLabel = nextPrayer
    ? nextPrayer.minutesUntil >= 60
      ? `${Math.floor(nextPrayer.minutesUntil / 60)}h ${nextPrayer.minutesUntil % 60}m`
      : `${nextPrayer.minutesUntil}m`
    : null;

  // Relative offset label for the time column, e.g. "+2 hrs" (BST-aware)
  const relLabel = relOffset === 0
    ? 'same as UK'
    : `${relOffset > 0 ? '+' : ''}${relOffset === Math.floor(relOffset) ? relOffset : `${Math.floor(relOffset)}½`} hrs`;

  return (
    <View style={[styles.cityCard, isSaudi && styles.cityCardSaudi, isPinned && styles.cityCardPinned]}>
      {/* Row 1: flag + name + time + pin button */}
      <View style={styles.cityRow}>
        <View style={styles.cityLeft}>
          <Text style={styles.cityFlag}>{city.flag}</Text>
          <View>
            <Text style={[styles.cityName, { fontFamily: bold }]}>{city.name}</Text>
            {!isSaudi && (
              <Text style={[styles.cityCountry, { fontFamily: reg }]}>{city.country}</Text>
            )}
          </View>
        </View>
        <View style={styles.cityTimeCol}>
          <Text style={[styles.cityTimeLabel, { fontFamily: reg }]}>
            {'LOCAL TIME · '}
            <Text style={styles.cityTimeLabelOffset}>{relLabel}</Text>
          </Text>
          <Text style={[styles.cityTime, { fontFamily: bold }]}>{timeStr}</Text>
        </View>
        {/* Pin button — not shown for Saudi Arabia (always top) */}
        {!isSaudi && (
          <TouchableOpacity
            onPress={onPinToggle}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            style={styles.pinBtn}
            disabled={!isPinned && !canPin}
          >
            <Text style={[styles.pinIcon, !isPinned && !canPin && styles.pinIconDisabled]}>
              {isPinned ? '⭐' : '☆'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Row 2: prayer times — current period + next prayer + countdown */}
      {prayerTimes && nextPrayer && (
        <View style={[styles.prayerSection, isSaudi && styles.prayerSectionSaudi]}>
          {/* Current period (secondary label) */}
          {currentPeriod && (
            <Text style={[styles.prayerCurrentLabel, { fontFamily: reg }]}>
              {currentPeriod.emoji} {currentPeriod.name} time
            </Text>
          )}
          {/* Next prayer — main display */}
          <View style={styles.prayerNextRow}>
            <View style={styles.prayerNextLeft}>
              <Text style={[styles.prayerNextName, { fontFamily: bold }]}>
                {nextPrayer.name}
              </Text>
              <Text style={[styles.prayerNextTime, { fontFamily: semi }]}>
                {nextPrayer.time}
              </Text>
            </View>
            {countdownLabel && (
              <View style={[styles.prayerCountdownBadge, isSaudi && styles.prayerCountdownBadgeSaudi]}>
                <Text style={[styles.prayerCountdownText, { fontFamily: bold }]}>
                  {'in ' + countdownLabel}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Row 3: temperature (tappable) + exchange rate (tappable) */}
      <View style={styles.cityDetails}>
        {/* Temp tap → weekly forecast */}
        <TouchableOpacity style={styles.cityDetailItem} onPress={onTempPress} activeOpacity={0.7}>
          <Text style={styles.cityDetailIcon}>
            {loading && weather === undefined ? '🌡️' : heatEmoji || '🌡️'}
          </Text>
          <Text style={[styles.cityDetailText, { fontFamily: semi }]}>
            {loading && weather === undefined
              ? '…'
              : temp != null ? `${Math.round(temp)}°C` : '–'}
          </Text>
          {!loading && condEmoji ? (
            <Text style={[styles.cityDetailIcon, { marginLeft: 4 }]}>{condEmoji}</Text>
          ) : null}
          <Text style={[styles.tapHint, { fontFamily: reg }]}>  7-day ›</Text>
        </TouchableOpacity>

        {/* Rate tap → xe.com chart */}
        <TouchableOpacity style={styles.cityDetailItem} onPress={onRatePress} activeOpacity={0.7}>
          <Text style={styles.cityDetailIcon}>💷</Text>
          <Text style={[styles.cityDetailText, { fontFamily: semi }]}>
            {loading && rate === undefined
              ? '…'
              : rate != null ? formatRate(rate, city.currency, rateDate) : '–'}
          </Text>
          <Text style={[styles.tapHint, { fontFamily: reg }]}>  chart ›</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WorldTimesScreen({ visible, onClose, fontsLoaded }: Props) {
  const bold = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;

  const [weather,      setWeather]      = useState<WeatherData | null>(null);
  const [currency,     setCurrency]     = useState<CurrencyData | null>(null);
  const [prayers,      setPrayers]      = useState<AllCityPrayers | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [pinnedIds,    setPinnedIds]    = useState<string[]>([]);
  const [, setTick]                     = useState(0);
  const tickRef                         = useRef<ReturnType<typeof setInterval> | null>(null);

  // Weekly forecast modal state
  const [forecastCity,    setForecastCity]    = useState<City | null>(null);
  const [forecastData,    setForecastData]    = useState<DayForecast[]>([]);
  const [forecastLoading, setForecastLoading] = useState(false);

  // Live clock — update every 10 seconds for accurate countdown display
  useEffect(() => {
    if (!visible) {
      if (tickRef.current) clearInterval(tickRef.current);
      return;
    }
    setTick(n => n + 1);
    tickRef.current = setInterval(() => setTick(n => n + 1), 10_000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [visible]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [w, c, p] = await Promise.all([
      fetchWeather(),
      fetchCurrencyRates(),
      fetchCityPrayerTimes(),
    ]);
    setWeather(w);
    setCurrency(c);
    setPrayers(p);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (visible) {
      loadData();
      fetchPinnedCities().then(setPinnedIds);
    }
  }, [visible, loadData]);

  // Open weekly forecast for a city
  const openForecast = useCallback(async (city: City) => {
    setForecastCity(city);
    setForecastData([]);
    setForecastLoading(true);
    const data = await fetchWeeklyForecast(city.id, city.lat, city.lon);
    setForecastData(data);
    setForecastLoading(false);
  }, []);

  // Pin / unpin a city (max 3)
  const handlePinToggle = useCallback((cityId: string) => {
    setPinnedIds(prev => {
      let next: string[];
      if (prev.includes(cityId)) {
        next = prev.filter(id => id !== cityId);
      } else {
        if (prev.length >= MAX_PINS) return prev; // already at max
        next = [...prev, cityId];
      }
      savePinnedCities(next);
      return next;
    });
  }, []);

  // Open xe.com currency chart (en-gb locale so no locale redirect popup)
  const openCurrencyChart = useCallback((currency: string) => {
    WebBrowser.openBrowserAsync(
      `https://www.xe.com/en-gb/currencycharts/?from=GBP&to=${currency}&view=1Y`,
      { presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN },
    );
  }, []);

  // Split Saudi (always first) from the rest, grouped by UTC offset descending
  const saudiCities = CITIES.filter(c => c.country === 'Saudi Arabia');
  const otherCities = CITIES.filter(c => c.country !== 'Saudi Arabia');

  const tzMap = new Map<number, City[]>();
  otherCities.forEach(city => {
    if (!tzMap.has(city.utcOffsetHours)) tzMap.set(city.utcOffsetHours, []);
    tzMap.get(city.utcOffsetHours)!.push(city);
  });
  // Ascending UTC offset: closest to UK first (Morocco/Nigeria +1, then Egypt +2, then Istanbul +3, etc.)
  const tzGroups = [...tzMap.entries()].sort((a, b) => a[0] - b[0]);

  const cardProps = (city: City) => ({
    city,
    weather:     weather?.[city.id],
    rate:        currency?.rates[city.currency],
    rateDate:    currency?.dateStr,
    prayerTimes: prayers?.[city.id],
    loading,
    fontsLoaded,
    isPinned:    pinnedIds.includes(city.id),
    canPin:      pinnedIds.length < MAX_PINS || pinnedIds.includes(city.id),
    onTempPress:  () => openForecast(city),
    onRatePress:  () => openCurrencyChart(city.currency),
    onPinToggle:  () => handlePinToggle(city.id),
  });

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={onClose}
      >
        <StatusBar barStyle="light-content" backgroundColor={Colors.blueDeep} />
        <SafeAreaView style={styles.root} edges={['top', 'bottom']}>

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.headerTitle, { fontFamily: bold }]}>🌍 World Times</Text>
              <Text style={[styles.headerSub, { fontFamily: reg }]}>
                Time · Prayer · Weather · GBP rates
              </Text>
            </View>
            {/* England local time — reference point */}
            <View style={styles.ukTimeBlock}>
              <Text style={[styles.ukTimeValue, { fontFamily: bold }]}>{getUKTime()}</Text>
              <Text style={[styles.ukTimeLabel, { fontFamily: reg }]}>
                {'UK · ' + (getUKOffsetHours() === 1 ? 'BST' : 'GMT')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
              style={{ marginLeft: 12 }}
            >
              <Text style={[styles.headerClose, { fontFamily: bold }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Info bar */}
          {currency && (
            <View style={styles.rateBar}>
              <Text style={[styles.rateBarText, { fontFamily: reg }]}>
                Tap 🌡️ for 7-day forecast · Tap 💷 for 12-month GBP chart
              </Text>
              <TouchableOpacity onPress={loadData} hitSlop={8}>
                <Text style={[styles.refreshBtn, { fontFamily: semi }]}>↻ Refresh</Text>
              </TouchableOpacity>
            </View>
          )}

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl refreshing={loading} onRefresh={loadData} tintColor={Colors.deepBlue} />
            }
          >

            {/* ── Saudi Arabia — always first ── */}
            <View style={styles.groupHeader}>
              <View style={styles.groupHeaderBadge}>
                <Text style={[styles.groupHeaderText, { fontFamily: bold }]}>
                  🇸🇦 Saudi Arabia
                </Text>
              </View>
              <Text style={[styles.groupHeaderSub, { fontFamily: reg }]}>
                {`UTC +3 · ${aheadLabel(getRelativeOffset(3))}`}
              </Text>
            </View>
            <View style={styles.groupBlock}>
              {saudiCities.map(city => (
                <CityCard key={city.id} {...cardProps(city)} isSaudi />
              ))}
            </View>

            {/* ── Pinned cities (user-selected, up to 3) ── */}
            {pinnedIds.length > 0 && (() => {
              const pinned = pinnedIds
                .map(id => CITIES.find(c => c.id === id))
                .filter((c): c is City => !!c && c.country !== 'Saudi Arabia');
              if (pinned.length === 0) return null;
              return (
                <View key="pinned">
                  <View style={styles.groupHeader}>
                    <View style={styles.groupHeaderBadge}>
                      <Text style={[styles.groupHeaderText, { fontFamily: bold }]}>
                        ⭐ Pinned
                      </Text>
                    </View>
                    <Text style={[styles.groupHeaderSub, { fontFamily: reg }]}>
                      Your pinned cities (tap ⭐ on any card)
                    </Text>
                  </View>
                  <View style={styles.groupBlock}>
                    {pinned.map(city => (
                      <CityCard key={city.id} {...cardProps(city)} isSaudi={false} />
                    ))}
                  </View>
                </View>
              );
            })()}

            {/* ── Other cities grouped by UTC offset ascending ── */}
            {tzGroups.map(([offset, cities]) => (
              <View key={offset}>
                <View style={styles.groupHeader}>
                  <Text style={[styles.groupHeaderText, { fontFamily: bold }]}>
                    UTC {fmtUtcOffset(offset)}
                  </Text>
                  <Text style={[styles.groupHeaderSub, { fontFamily: reg }]}>
                    {aheadLabel(getRelativeOffset(offset))}
                  </Text>
                </View>
                <View style={styles.groupBlock}>
                  {cities.map(city => (
                    <CityCard key={city.id} {...cardProps(city)} isSaudi={false} />
                  ))}
                </View>
              </View>
            ))}

            {loading && !weather && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={Colors.deepBlue} />
                <Text style={[styles.loadingText, { fontFamily: reg }]}>Fetching live data…</Text>
              </View>
            )}

            <Text style={[styles.footer, { fontFamily: reg }]}>
              Weather: Open-Meteo · Currency: FloatRates.com · Prayer: AlAdhan{'\n'}
              Weather 30 min · Rates 4 hrs · Prayer times 6 hrs · Pull to refresh
            </Text>

          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Weekly forecast sheet */}
      {forecastCity && (
        <WeeklyForecastModal
          city={forecastCity}
          forecast={forecastData}
          loading={forecastLoading}
          fontsLoaded={fontsLoaded}
          onClose={() => setForecastCity(null)}
        />
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F5F5' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.blueDeep,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFF' },
  headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  headerClose: { fontSize: 18, color: '#FFF', padding: 4 },

  ukTimeBlock: { alignItems: 'flex-end', marginRight: 4 },
  ukTimeValue: { fontSize: 22, fontWeight: '700', color: '#FFF', fontVariant: ['tabular-nums'] },
  ukTimeLabel: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 1 },

  rateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E8F0FE',
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  rateBarText: { fontSize: 10, color: Colors.deepBlue, flex: 1 },
  refreshBtn:  { fontSize: 12, color: Colors.deepBlue, fontWeight: '600', paddingLeft: 8 },

  scroll:        { flex: 1 },
  scrollContent: { padding: 12, gap: 4 },

  // ── Timezone group ──────────────────────────────────────────────────────────
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingTop: 14,
    paddingBottom: 6,
  },
  groupHeaderBadge: {
    backgroundColor: '#E8F5E9',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  groupHeaderText: { fontSize: 12, color: '#2E7D32', fontWeight: '700' },
  groupHeaderSub:  { fontSize: 11, color: Colors.inkMute },

  groupBlock: { gap: 6 },

  // ── City card ───────────────────────────────────────────────────────────────
  cityCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    gap: 8,
  },
  cityCardSaudi: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.freshGreen,
  },
  cityCardPinned: {
    borderLeftWidth: 3,
    borderLeftColor: '#FFB300',
  },
  pinBtn: {
    marginLeft: 8,
    padding: 4,
    flexShrink: 0,
  },
  pinIcon: {
    fontSize: 18,
  },
  pinIconDisabled: {
    opacity: 0.3,
  },

  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cityLeft:    { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  cityFlag:    { fontSize: 26 },
  cityName:    { fontSize: 15, fontWeight: '700', color: Colors.ink },
  cityCountry: { fontSize: 13, color: Colors.inkMute, marginTop: 1 }, // +15% from 11

  cityTimeCol:   { alignItems: 'flex-end' },
  cityTimeLabel: { fontSize: 12, color: '#111', letterSpacing: 0.3, marginBottom: 1, fontWeight: '600' }, // dark black, larger
  cityTimeLabelOffset: { fontSize: 12, color: '#CC1111', fontWeight: '700' }, // red for "+X hrs"
  cityTime:      {
    fontSize: 26, fontWeight: '700', color: Colors.deepBlue,
    fontVariant: ['tabular-nums'],
  },

  // ── Prayer section ──────────────────────────────────────────────────────────
  prayerSection: {
    backgroundColor: '#F9F1F3',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  prayerSectionSaudi: {
    backgroundColor: '#F0F8F0',  // light green tint for holy cities
    borderLeftWidth: 2,
    borderLeftColor: Colors.freshGreen,
  },
  prayerCurrentLabel: {
    fontSize: 11,
    color: Colors.inkMute,
    fontWeight: '400',
  },
  prayerNextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  prayerNextLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    flex: 1,
  },
  prayerNextName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.maroonRed,
  },
  prayerNextTime: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.ink,
    fontVariant: ['tabular-nums'],
  },
  prayerCountdownBadge: {
    backgroundColor: Colors.maroonRed,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  prayerCountdownBadgeSaudi: {
    backgroundColor: Colors.freshGreen,
  },
  prayerCountdownText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },

  cityDetails:    { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  cityDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: '#F5F7FA',
    borderRadius: 8,
  },
  cityDetailIcon: { fontSize: 13 },
  cityDetailText: { fontSize: 12, color: Colors.ink, fontWeight: '600' },
  tapHint:        { fontSize: 10, color: Colors.deepBlue },

  loadingRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 16 },
  loadingText: { fontSize: 13, color: Colors.inkMute },

  footer: {
    fontSize: 10,
    color: Colors.inkMute,
    textAlign: 'center',
    lineHeight: 16,
    paddingVertical: 12,
    marginTop: 8,
  },
});
