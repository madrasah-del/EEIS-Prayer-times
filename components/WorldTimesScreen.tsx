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
  StyleSheet, ActivityIndicator, StatusBar, RefreshControl, TextInput,
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

// ─── Heat icon (colored circle, replaces emoji) ───────────────────────────────

function HeatIcon({ temp, size = 28 }: { temp: number | null; size?: number }) {
  let color = '#9E9E9E';
  let symbol = '●';
  if (temp !== null) {
    if (temp <= 5)  { color = '#1565C0'; symbol = '❅'; }      // ❅ snowflake
    else if (temp <= 14) { color = '#0097A7'; symbol = '○'; } // ○ cool
    else if (temp <= 22) { color = '#388E3C'; symbol = '☉'; } // ☉ mild
    else if (temp <= 30) { color = '#F57C00'; symbol = '☉'; } // ☉ warm
    else if (temp <= 39) { color = '#E64A19'; symbol = '☉'; } // ☉ hot
    else                 { color = '#C62828'; symbol = '!';        } // >40°C
  }
  const r = size / 2;
  return (
    <View style={{
      width: size, height: size, borderRadius: r,
      backgroundColor: color,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: Math.round(size * 0.52), color: '#FFF', fontWeight: '700', lineHeight: size }}>
        {symbol}
      </Text>
    </View>
  );
}

// ─── Calculator icon (proper calc visual, not abacus emoji) ──────────────────

function CalcIcon({ size = 22 }: { size?: number }) {
  const h = Math.round(size * 1.35);
  const displayH = Math.round(size * 0.28);
  return (
    <View style={{
      width: size, height: h,
      backgroundColor: '#3A3A3A',
      borderRadius: 4,
      padding: 2,
      gap: 2,
    }}>
      {/* Display screen */}
      <View style={{ height: displayH, backgroundColor: '#8BC34A', borderRadius: 2, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 2 }}>
        <Text style={{ fontSize: Math.round(displayH * 0.7), color: '#1B5E20', fontWeight: '700', lineHeight: displayH }}>0</Text>
      </View>
      {/* Button grid: 2 rows x 3 cols */}
      <View style={{ flex: 1, gap: 2 }}>
        {[0, 1].map(row => (
          <View key={row} style={{ flex: 1, flexDirection: 'row', gap: 2 }}>
            {[0, 1, 2].map(col => (
              <View key={col} style={{ flex: 1, backgroundColor: '#888', borderRadius: 1 }} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Currency converter modal ─────────────────────────────────────────────────

type ConvModalProps = {
  city:      City;
  rate:      number | undefined;
  rateDate:  string | undefined;
  fontsLoaded: boolean;
  onClose:   () => void;
};

function CurrencyConverterModal({ city, rate, rateDate, fontsLoaded, onClose }: ConvModalProps) {
  const bold = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;

  const [gbpInput,   setGbpInput]   = useState('');
  const [localInput, setLocalInput] = useState('');
  const [calcList,   setCalcList]   = useState<Array<{ label: string; gbp: number }>>([]);
  const [calcTotal,  setCalcTotal]  = useState(0);

  const localVal = rate != null && gbpInput !== ''   ? parseFloat(gbpInput)   * rate        : null;
  const gbpVal   = rate != null && localInput !== '' ? parseFloat(localInput) / rate        : null;

  const displayGbp   = gbpInput   !== '' ? gbpInput   : (gbpVal   != null ? gbpVal.toFixed(2)   : '');
  const displayLocal = localInput !== '' ? localInput : (localVal != null ? localVal.toFixed(2) : '');

  const handleGbpChange = (text: string) => { setGbpInput(text);   setLocalInput(''); };
  const handleLocChange = (text: string) => { setLocalInput(text); setGbpInput('');   };

  const addToCalc = (sign: 1 | -1) => {
    const raw  = gbpInput !== '' ? parseFloat(gbpInput) : (gbpVal ?? 0);
    if (!raw || isNaN(raw)) return;
    const amt  = raw * sign;
    const lbl  = `${sign > 0 ? '+' : '−'}  £${raw.toFixed(2)}`;
    setCalcList(prev => [...prev, { label: lbl, gbp: amt }]);
    setCalcTotal(t => t + amt);
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={cv.root} edges={['top', 'bottom']}>
        <View style={cv.header}>
          <Text style={[cv.headerTitle, { fontFamily: bold }]}>
            {city.flag}  GBP ↔ {city.currency}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={[cv.headerClose, { fontFamily: bold }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {rate != null ? (
          <ScrollView contentContainerStyle={cv.content} keyboardShouldPersistTaps="handled">
            <Text style={[cv.rateNote, { fontFamily: reg }]}>
              1 GBP = {formatRate(rate, city.currency)}{rateDate ? `  ·  ${rateDate}` : ''}
            </Text>

            {/* Two-field converter */}
            <View style={cv.converterBlock}>
              <View style={cv.inputRow}>
                <Text style={[cv.inputLabel, { fontFamily: semi }]}>£ GBP</Text>
                <TextInput
                  style={[cv.input, { fontFamily: bold }]}
                  keyboardType="decimal-pad"
                  value={displayGbp}
                  onChangeText={handleGbpChange}
                  placeholder="0.00"
                  placeholderTextColor="#AAA"
                />
              </View>
              <View style={cv.swapRow}>
                <Text style={cv.swapIcon}>⇅</Text>
              </View>
              <View style={cv.inputRow}>
                <Text style={[cv.inputLabel, { fontFamily: semi }]}>{city.currency}</Text>
                <TextInput
                  style={[cv.input, { fontFamily: bold }]}
                  keyboardType="decimal-pad"
                  value={displayLocal}
                  onChangeText={handleLocChange}
                  placeholder="0.00"
                  placeholderTextColor="#AAA"
                />
              </View>
            </View>

            {/* Running list calculator */}
            <View style={cv.calcSection}>
              <Text style={[cv.calcTitle, { fontFamily: bold }]}>Running total</Text>
              <View style={cv.calcBtns}>
                <TouchableOpacity style={[cv.calcBtn, { backgroundColor: Colors.freshGreen }]} onPress={() => addToCalc(1)}>
                  <Text style={[cv.calcBtnText, { fontFamily: bold }]}>+ Add</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[cv.calcBtn, { backgroundColor: Colors.maroonRed }]} onPress={() => addToCalc(-1)}>
                  <Text style={[cv.calcBtnText, { fontFamily: bold }]}>− Subtract</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[cv.calcBtn, { backgroundColor: Colors.inkMute }]} onPress={() => { setCalcList([]); setCalcTotal(0); }}>
                  <Text style={[cv.calcBtnText, { fontFamily: bold }]}>Clear</Text>
                </TouchableOpacity>
              </View>
              {calcList.map((item, i) => (
                <View key={i} style={cv.calcItem}>
                  <Text style={[cv.calcItemLabel, { fontFamily: reg }]}>{item.label}</Text>
                  <Text style={[cv.calcItemLocal, { fontFamily: semi }]}>
                    {rate != null ? (Math.abs(item.gbp) * rate).toFixed(2) : '–'} {city.currency}
                  </Text>
                </View>
              ))}
              {calcList.length > 0 && (
                <View style={cv.calcTotalRow}>
                  <Text style={[cv.calcTotalLabel, { fontFamily: bold }]}>Total</Text>
                  <Text style={[cv.calcTotalGbp, { fontFamily: bold }]}>£{calcTotal.toFixed(2)}</Text>
                  {rate != null && (
                    <Text style={[cv.calcTotalLocal, { fontFamily: bold }]}>
                      {(calcTotal * rate).toFixed(2)} {city.currency}
                    </Text>
                  )}
                </View>
              )}
              {calcList.length === 0 && (
                <Text style={[cv.calcHint, { fontFamily: reg }]}>
                  Enter an amount above, then tap + Add or − Subtract to build a total.
                </Text>
              )}
            </View>
          </ScrollView>
        ) : (
          <View style={cv.center}>
            <Text style={[cv.emptyText, { fontFamily: reg }]}>Rate not available</Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const cv = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#F5F5F5' },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                   backgroundColor: Colors.blueDeep, paddingHorizontal: 20, paddingVertical: 14 },
  headerTitle:   { fontSize: 16, fontWeight: '700', color: '#FFF', flex: 1 },
  headerClose:   { fontSize: 18, color: '#FFF', padding: 4 },
  content:       { padding: 16, gap: 16 },
  rateNote:      { fontSize: 13, color: Colors.inkMute, textAlign: 'center' },
  converterBlock:{ backgroundColor: '#FFF', borderRadius: 12, padding: 16, gap: 8,
                   elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                   shadowOpacity: 0.07, shadowRadius: 4 },
  inputRow:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  inputLabel:    { fontSize: 18, fontWeight: '600', color: Colors.maroonRed, width: 60 },
  input:         { flex: 1, fontSize: 32, color: Colors.ink, borderBottomWidth: 2,
                   borderBottomColor: Colors.deepBlue, paddingVertical: 4, textAlign: 'right' },
  swapRow:       { alignItems: 'center', paddingVertical: 4 },
  swapIcon:      { fontSize: 24, color: Colors.inkMute },
  calcSection:   { backgroundColor: '#FFF', borderRadius: 12, padding: 16, gap: 10,
                   elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                   shadowOpacity: 0.07, shadowRadius: 4 },
  calcTitle:     { fontSize: 15, fontWeight: '700', color: Colors.ink },
  calcBtns:      { flexDirection: 'row', gap: 8 },
  calcBtn:       { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  calcBtnText:   { fontSize: 13, fontWeight: '700', color: '#FFF' },
  calcItem:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                   paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  calcItemLabel: { fontSize: 14, color: Colors.ink },
  calcItemLocal: { fontSize: 14, color: Colors.maroonRed },
  calcTotalRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 },
  calcTotalLabel:{ fontSize: 16, fontWeight: '700', color: Colors.ink, flex: 1 },
  calcTotalGbp:  { fontSize: 18, color: Colors.freshGreen, fontWeight: '700' },
  calcTotalLocal:{ fontSize: 18, color: Colors.maroonRed, fontWeight: '700' },
  calcHint:      { fontSize: 12, color: Colors.inkMute, textAlign: 'center', fontStyle: 'italic' },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText:     { fontSize: 14, color: Colors.inkMute },
});

// ─── City card ────────────────────────────────────────────────────────────────

type CardProps = {
  city:         City;
  weather:      WeatherEntry | null | undefined;
  /** Optional second city's weather (for combined Mecca+Madina card) */
  weather2?:    WeatherEntry | null | undefined;
  /** Optional second city name (for combined card label) */
  city2Name?:   string;
  rate:         number | undefined;
  rateDate:     string | undefined;
  prayerTimes:  CityPrayerTimes | null | undefined;
  loading:      boolean;
  fontsLoaded:  boolean;
  isSaudi:      boolean;
  isPinned:     boolean;
  canPin:       boolean;  // false when 3 pins already taken and this city isn't pinned
  /** Override display name (e.g. "Mecca & Madina") */
  displayName?: string;
  onTempPress:  () => void;
  onRatePress:  () => void;
  onCalcPress:  () => void;
  onPinToggle:  () => void;
};

function CityCard({
  city, weather, weather2, city2Name, rate, rateDate, prayerTimes,
  loading, fontsLoaded, isSaudi, isPinned, canPin,
  displayName, onTempPress, onRatePress, onCalcPress, onPinToggle,
}: CardProps) {
  const bold = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;

  const timeStr    = getLocalTime(city.utcOffsetHours);
  const relOffset  = getRelativeOffset(city.utcOffsetHours);
  const temp       = weather?.temp ?? null;
  const temp2      = weather2?.temp ?? null;
  const code       = weather?.code ?? null;
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

  // Relative offset label, e.g. "+2 hrs" (BST-aware) — shown in RED
  const relLabel = relOffset === 0
    ? 'same as UK'
    : `${relOffset > 0 ? '+' : ''}${relOffset === Math.floor(relOffset) ? relOffset : `${Math.floor(relOffset)}½`} hrs`;

  // Display city name (country BOLD at top, city grey below — hierarchy swapped from v39)
  const showName    = displayName ?? city.name;
  const showCountry = city.country;

  return (
    <View style={[styles.cityCard, isSaudi && styles.cityCardSaudi, isPinned && styles.cityCardPinned]}>
      {/* Row 1: flag + COUNTRY (bold top) + city (grey below) + time + pin */}
      <View style={styles.cityRow}>
        <View style={styles.cityLeft}>
          <Text style={styles.cityFlag}>{city.flag}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cityCountryTop, { fontFamily: bold }]}>{showCountry}</Text>
            <Text style={[styles.cityNameSub, { fontFamily: reg }]}>{showName}</Text>
          </View>
        </View>
        <View style={styles.cityTimeCol}>
          <Text style={[styles.cityTime, { fontFamily: bold }]}>{timeStr}</Text>
          <Text style={[styles.cityTimeLabelOffset, { fontFamily: reg }]}>{relLabel}</Text>
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

      {/* Bottom section: prayer+currency LEFT, temperature RIGHT */}
      <View style={styles.cardBottom}>

        {/* LEFT: prayer section + currency */}
        <View style={{ flex: 1 }}>
          {/* Prayer section — single line: ☀️ Dhuhr → Asr 15:33 [in 8m] */}
          {prayerTimes && nextPrayer && (
            <View style={[styles.prayerSection, isSaudi && styles.prayerSectionSaudi]}>
              <View style={styles.prayerSingleRow}>
                {currentPeriod && (
                  <Text style={[styles.prayerCurrentInline, { fontFamily: reg }]}>
                    {currentPeriod.emoji} {currentPeriod.name} {'→'}
                  </Text>
                )}
                <Text style={[styles.prayerNextName, { fontFamily: bold }]}>{nextPrayer.name}</Text>
                <Text style={[styles.prayerNextTime, { fontFamily: semi }]}>{nextPrayer.time}</Text>
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

          {/* Currency row — directly below prayer section */}
          <View style={styles.currencyRow}>
            <Text style={styles.currencyIcon}>💷</Text>
            <TouchableOpacity style={styles.currencyRatePill} onPress={onRatePress} activeOpacity={0.7}>
              <Text style={[styles.currencyRate, { fontFamily: semi }]}>
                {loading && rate === undefined
                  ? '…'
                  : rate != null ? formatRate(rate, city.currency) : '–'}
              </Text>
            </TouchableOpacity>
            {rateDate && (
              <Text style={[styles.currencyDate, { fontFamily: reg }]}>{rateDate}</Text>
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={onCalcPress} hitSlop={8} style={{ marginRight: 8 }}>
              <CalcIcon size={22} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onRatePress} hitSlop={8}>
              <Text style={{ fontSize: 20 }}>📊</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* RIGHT: temperature column */}
        <TouchableOpacity
          style={[styles.tempColumn, city2Name != null && styles.tempColumnDual]}
          onPress={onTempPress}
          activeOpacity={0.75}
        >
          {loading && weather === undefined ? (
            <Text style={{ fontSize: 22, textAlign: 'center' }}>🌡️</Text>
          ) : city2Name != null ? (
            /* Dual city (Mecca + Madina) — clearly labelled */
            <>
              <View style={styles.dualTempRow}>
                <HeatIcon temp={temp} size={16} />
                <Text style={[styles.dualTempCity, { fontFamily: reg }]}>Mecca</Text>
                <Text style={[styles.dualTempValue, { fontFamily: bold }]}>
                  {temp != null ? `${Math.round(temp)}°` : '–'}
                </Text>
              </View>
              <View style={styles.dualTempRow}>
                <HeatIcon temp={temp2 ?? null} size={16} />
                <Text style={[styles.dualTempCity, { fontFamily: reg }]}>Madina</Text>
                <Text style={[styles.dualTempValue, { fontFamily: bold }]}>
                  {temp2 != null ? `${Math.round(temp2)}°` : '–'}
                </Text>
              </View>
            </>
          ) : (
            /* Single city */
            <>
              <HeatIcon temp={temp} size={32} />
              <Text style={[styles.tempValue, { fontFamily: bold }]}>
                {temp != null ? `${Math.round(temp)}°` : '–'}
              </Text>
            </>
          )}
          <Text style={styles.tempCondIcon}>{condEmoji || '🌡️'}</Text>
          <Text style={[styles.tapHint, { fontFamily: reg, textAlign: 'center' }]}>7-day ›</Text>
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

  // Currency converter modal state
  const [converterCity, setConverterCity] = useState<City | null>(null);

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
    onCalcPress:  () => setConverterCity(city),
    onPinToggle:  () => handlePinToggle(city.id),
  });

  // Mecca & Madina appear as a single combined card
  const meccaCity  = CITIES.find(c => c.id === 'mecca')!;
  const medinaCity = CITIES.find(c => c.id === 'medina')!;

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

          {/* Header — UK time prominent LEFT, title/controls RIGHT */}
          <View style={styles.header}>
            {/* UK local time — large, leftmost */}
            <View style={styles.ukTimeBlock}>
              <Text style={[styles.ukTimeValue, { fontFamily: bold }]}>{getUKTime()}</Text>
              <Text style={[styles.ukTimeLabel, { fontFamily: reg }]}>
                {'UK · ' + (getUKOffsetHours() === 1 ? 'BST' : 'GMT')}
              </Text>
            </View>
            {/* Title */}
            <View style={{ flex: 1, paddingLeft: 12 }}>
              <Text style={[styles.headerTitle, { fontFamily: bold }]}>🌍 World Times</Text>
              <Text style={[styles.headerSub, { fontFamily: reg }]}>
                Time · Prayer · Weather · GBP rates
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
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

            {/* ── Mecca & Madina — combined card, always first (no group header) ── */}
            <View style={styles.groupBlock}>
              <CityCard
                {...cardProps(meccaCity)}
                isSaudi
                displayName="Mecca & Madina"
                weather2={weather?.['medina']}
                city2Name="Madina"
              />
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
            {/* Pinned cities are removed here — they already appear in the Pinned section above */}
            {tzGroups.map(([offset, cities]) => {
              const visibleCities = cities.filter(city => !pinnedIds.includes(city.id));
              if (visibleCities.length === 0) return null;
              return (
                <View key={offset}>
                  <View style={styles.groupHeader}>
                    <Text style={[styles.groupHeaderSub, { fontFamily: reg }]}>
                      {aheadLabel(getRelativeOffset(offset))}
                    </Text>
                  </View>
                  <View style={styles.groupBlock}>
                    {visibleCities.map(city => (
                      <CityCard key={city.id} {...cardProps(city)} isSaudi={false} />
                    ))}
                  </View>
                </View>
              );
            })}

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

      {/* Currency converter sheet */}
      {converterCity && (
        <CurrencyConverterModal
          city={converterCity}
          rate={currency?.rates[converterCity.currency]}
          rateDate={currency?.dateStr}
          fontsLoaded={fontsLoaded}
          onClose={() => setConverterCity(null)}
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

  ukTimeBlock: { alignItems: 'flex-start' },
  ukTimeValue: { fontSize: 26, fontWeight: '700', color: '#FFF', fontVariant: ['tabular-nums'] },
  ukTimeLabel: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 1 },

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
  cityLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  cityFlag: { fontSize: 26 },

  // v41: Country bold at TOP, city name grey below (hierarchy swapped)
  cityCountryTop: { fontSize: 15, fontWeight: '700', color: Colors.ink },
  cityNameSub:    { fontSize: 12, color: Colors.inkMute, marginTop: 1 },

  cityTimeCol:         { alignItems: 'flex-end' },
  cityTimeLabelOffset: { fontSize: 18, color: '#CC1111', fontWeight: '700', marginTop: 2 },
  cityTime: {
    fontSize: 26, fontWeight: '700', color: Colors.deepBlue,
    fontVariant: ['tabular-nums'],
  },

  // v41: prayer+currency LEFT, temp RIGHT
  cardBottom: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },

  // ── Prayer section ──────────────────────────────────────────────────────────
  prayerSection: {
    backgroundColor: '#F9F1F3',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
    marginBottom: 6,
  },
  prayerSectionSaudi: {
    backgroundColor: '#F0F8F0',
    borderLeftWidth: 2,
    borderLeftColor: Colors.freshGreen,
  },
  prayerSingleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  prayerCurrentInline: {
    fontSize: 13,
    color: Colors.inkMute,
    fontWeight: '400',
  },
  prayerNextName: {
    fontSize: 24,   // +50% from 16
    fontWeight: '700',
    color: Colors.maroonRed,
  },
  prayerNextTime: {
    fontSize: 21,   // +50% from 14
    fontWeight: '600',
    color: Colors.ink,
    fontVariant: ['tabular-nums'],
  },
  prayerCountdownBadge: {
    backgroundColor: Colors.maroonRed,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  prayerCountdownBadgeSaudi: {
    backgroundColor: Colors.freshGreen,
  },
  prayerCountdownText: {
    fontSize: 17,   // +50% from 11
    fontWeight: '700',
    color: '#FFF',
  },

  // Currency row
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 6,
    backgroundColor: '#F5F7FA',
    borderRadius: 8,
    marginTop: 2,
  },
  currencyIcon: { fontSize: 16 },
  currencyRatePill: {
    backgroundColor: '#FDE8EC',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  currencyRate: { fontSize: 18, color: Colors.maroonRed, fontWeight: '600' },
  currencyDate: { fontSize: 11, color: Colors.inkMute },

  // Temperature RIGHT column
  tempColumn: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 4,
    backgroundColor: '#F5F7FA',
    borderRadius: 8,
  },
  tempColumnDual: {
    width: 106,
  },
  tempValue:    { fontSize: 20, fontWeight: '700', color: Colors.ink, textAlign: 'center' },
  tempCondIcon: { fontSize: 20, textAlign: 'center' },
  dualTempRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, width: '100%' },
  dualTempCity: { fontSize: 11, color: Colors.inkMute, flex: 1 },
  dualTempValue:{ fontSize: 14, fontWeight: '700', color: Colors.ink },

  tapHint: { fontSize: 10, color: Colors.deepBlue },

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
