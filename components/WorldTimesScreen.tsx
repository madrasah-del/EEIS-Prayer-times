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
  StyleSheet, ActivityIndicator, StatusBar, RefreshControl, Alert,
  TextInput, Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import NetInfo from '@react-native-community/netinfo';
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

// ─── Currency names map ───────────────────────────────────────────────────────
const CURRENCY_NAMES: Record<string, string> = {
  // Fiat — major global
  USD:'US Dollar',EUR:'Euro',GBP:'British Pound',JPY:'Japanese Yen',
  CAD:'Canadian Dollar',AUD:'Australian Dollar',CHF:'Swiss Franc',CNY:'Chinese Yuan',
  NZD:'New Zealand Dollar',HKD:'Hong Kong Dollar',SGD:'Singapore Dollar',
  NOK:'Norwegian Krone',SEK:'Swedish Krona',DKK:'Danish Krone',
  PLN:'Polish Zloty',CZK:'Czech Koruna',HUF:'Hungarian Forint',RON:'Romanian Leu',
  // Muslim-world fiat
  SAR:'Saudi Riyal',AED:'UAE Dirham',BHD:'Bahraini Dinar',KWD:'Kuwaiti Dinar',
  OMR:'Omani Rial',QAR:'Qatari Riyal',EGP:'Egyptian Pound',IDR:'Indonesian Rupiah',
  INR:'Indian Rupee',IQD:'Iraqi Dinar',JOD:'Jordanian Dinar',MAD:'Moroccan Dirham',
  MYR:'Malaysian Ringgit',PKR:'Pakistani Rupee',BDT:'Bangladeshi Taka',
  TRY:'Turkish Lira',DZD:'Algerian Dinar',TND:'Tunisian Dinar',LYD:'Libyan Dinar',
  SDG:'Sudanese Pound',YER:'Yemeni Rial',
  // Other fiat
  BRL:'Brazilian Real',MXN:'Mexican Peso',ZAR:'South African Rand',
  RUB:'Russian Ruble',UAH:'Ukrainian Hryvnia',KZT:'Kazakhstani Tenge',
  TWD:'Taiwan Dollar',THB:'Thai Baht',PHP:'Philippine Peso',
  LKR:'Sri Lankan Rupee',MUR:'Mauritian Rupee',KES:'Kenyan Shilling',
  NGN:'Nigerian Naira',UGX:'Ugandan Shilling',GHS:'Ghanaian Cedi',
  TZS:'Tanzanian Shilling',ILS:'Israeli Shekel',
  XAF:'Central African CFA Franc',XOF:'West African CFA Franc',
  // Crypto — Major
  BTC:'Bitcoin',ETH:'Ethereum',BNB:'Binance Coin',XRP:'Ripple (XRP)',LTC:'Litecoin',
  // Crypto — DeFi & Other
  MATIC:'Polygon (MATIC)','1INCH':'1inch Network',
};
function currencyName(code: string): string {
  return CURRENCY_NAMES[code.toUpperCase()] ?? code;
}

// Ordered lists for currency picker sections
const CURRENCY_TOP = ['USD', 'EUR'];
const CURRENCY_MUSLIM = ['SAR','AED','BHD','KWD','OMR','QAR','EGP','IDR','INR','IQD','JOD','MAD','MUR','MYR','PKR','BDT','TRY','DZD','TND','LYD','SDG','YER'];
const CURRENCY_MAJOR_FIAT = ['JPY','GBP','CAD','AUD','CHF','CNY','NZD','HKD','SGD','NOK','SEK','DKK','PLN','CZK','HUF','RON'];
const KNOWN_CRYPTO = new Set(['BTC','ETH','BNB','XRP','LTC','BCH','DOGE','ADA','SOL','MATIC','1INCH','UNI','LINK','DOT','XLM','USDT','USDC','DAI','BUSD']);

// Returns picker entries with section headers
type PickerEntry = { type: 'currency'; code: string } | { type: 'header'; label: string };

function buildPickerEntries(codes: string[]): PickerEntry[] {
  const upper = codes.map(c => c.toUpperCase());
  const has = (c: string) => upper.includes(c);

  const entries: PickerEntry[] = [];
  const used = new Set<string>();

  const addSection = (label: string, list: string[]) => {
    const items = list.filter(c => has(c) && !used.has(c));
    if (!items.length) return;
    entries.push({ type: 'header', label });
    items.forEach(c => { entries.push({ type: 'currency', code: c }); used.add(c); });
  };

  addSection('🌍 Major Currencies', CURRENCY_TOP);
  addSection('☪️ Muslim World', CURRENCY_MUSLIM);
  addSection('💱 Major Fiat Currencies', CURRENCY_MAJOR_FIAT);

  // Remaining fiat (not crypto, not already used), alphabetical
  const remainingFiat = upper.filter(c => !used.has(c) && !KNOWN_CRYPTO.has(c)).sort();
  if (remainingFiat.length) {
    entries.push({ type: 'header', label: '🏦 Other Currencies' });
    remainingFiat.forEach(c => { entries.push({ type: 'currency', code: c }); used.add(c); });
  }

  // Crypto section
  const cryptoCodes = upper.filter(c => !used.has(c) && KNOWN_CRYPTO.has(c)).sort();
  if (cryptoCodes.length) {
    entries.push({ type: 'header', label: '₿ Cryptocurrency' });
    cryptoCodes.forEach(c => { entries.push({ type: 'currency', code: c }); used.add(c); });
  }

  // Any remaining (unknown)
  const rest = upper.filter(c => !used.has(c)).sort();
  if (rest.length) {
    entries.push({ type: 'header', label: '📋 Other' });
    rest.forEach(c => { entries.push({ type: 'currency', code: c }); used.add(c); });
  }

  return entries;
}

// ─── Pinned cities ────────────────────────────────────────────────────────────

const PINNED_CITIES_KEY = '@eeis_pinned_cities_v1';
const MAX_PINS = 5;

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

// ─── Currency converter modal — built-in keypad (no system keyboard) ─────────

/** Format a number with comma separators and up to 2 decimal places */
function formatWithCommas(raw: string): string {
  if (!raw) return '';
  const parts = raw.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

type ConvModalProps = {
  city:        City;
  rate:        number | undefined;
  rateDate:    string | undefined;
  allRates:    Record<string, number> | undefined;  // all available currency rates
  fontsLoaded: boolean;
  onClose:     () => void;
};

function CurrencyConverterModal({ city, rate: defaultRate, rateDate, allRates, fontsLoaded, onClose }: ConvModalProps) {
  const bold = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;

  // Currency override — defaults to city's currency
  const [selectedCurrency, setSelectedCurrency] = useState(city.currency);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  // Rate for the selected currency
  const rate = allRates?.[selectedCurrency] ?? (selectedCurrency === city.currency ? defaultRate : undefined);

  // 'gbp' = user is entering GBP; 'local' = user is entering local currency
  const [mode,      setMode]      = useState<'gbp' | 'local'>('gbp');
  const [rawInput,  setRawInput]  = useState('');  // digits only, e.g. "12345" or "123.45"
  const [operator,  setOperator]  = useState<'+' | '-' | '×' | '÷' | '%' | null>(null);
  const [calcList,  setCalcList]  = useState<Array<{ op: string; gbp: number; local: number }>>([]);
  const [calcTotal, setCalcTotal] = useState(0);
  const [shareNote, setShareNote] = useState('');

  // Categorized currency picker entries (with section headers)
  const pickerEntries = React.useMemo((): PickerEntry[] => {
    const codes = allRates ? Object.keys(allRates) : [city.currency];
    return buildPickerEntries(codes);
  }, [allRates, city.currency]);

  const OP_STYLES: Record<'+' | '-' | '×' | '÷' | '%', { bg: string; border: string; text: string; activeBg: string; activeBorder: string }> = {
    '+': { bg: '#E8F5E9', border: '#4CAF50', text: '#2E7D32', activeBg: '#C8E6C9', activeBorder: '#2E7D32' },
    '-': { bg: '#FFF3E0', border: '#FF9800', text: '#E65100', activeBg: '#FFE0B2', activeBorder: '#E65100' },
    '×': { bg: '#F3E5F5', border: '#9C27B0', text: '#6A1B9A', activeBg: '#E1BEE7', activeBorder: '#6A1B9A' },
    '÷': { bg: '#E8EAF6', border: '#3F51B5', text: '#1A237E', activeBg: '#C5CAE9', activeBorder: '#1A237E' },
    '%': { bg: '#E0F2F1', border: '#009688', text: '#00695C', activeBg: '#B2DFDB', activeBorder: '#00695C' },
  };

  // Parse raw input as a decimal number
  const inputNum = rawInput === '' ? null : parseFloat(rawInput);

  // Derived conversion values
  const gbpNum   = mode === 'gbp'   ? inputNum : (inputNum != null && rate ? inputNum / rate  : null);
  const localNum = mode === 'local' ? inputNum : (inputNum != null && rate ? inputNum * rate  : null);

  const displayGbp   = gbpNum   != null ? formatWithCommas(gbpNum.toFixed(2))   : '–';
  const displayLocal = localNum != null ? formatWithCommas(localNum.toFixed(2)) : '–';

  // Built-in keypad press handler
  const handleKey = (key: string) => {
    if (key === '⌫') {
      setRawInput(prev => prev.slice(0, -1));
      return;
    }
    if (key === '.') {
      if (rawInput.includes('.')) return;  // only one decimal point
      setRawInput(prev => prev === '' ? '0.' : prev + '.');
      return;
    }
    // Digit: limit total length to 10 chars
    if (rawInput.length >= 10) return;
    setRawInput(prev => prev + key);
  };

  const clearFields = () => setRawInput('');

  const handleOperator = (op: '+' | '-' | '×' | '÷' | '%') => {
    // First operator press: immediately log starting figure to history
    if (calcList.length === 0 && inputNum != null && inputNum !== 0) {
      const startGbp   = mode === 'gbp'   ? inputNum : (rate ? inputNum / rate : inputNum);
      const startLocal = mode === 'local' ? inputNum : (rate ? inputNum * rate : inputNum);
      setCalcTotal(startGbp);
      setCalcList([{ op: `£${formatWithCommas(startGbp.toFixed(2))}`, gbp: startGbp, local: startLocal }]);
    }
    setOperator(op);
    setRawInput('');  // clear input ready for next number
  };

  const handleEquals = () => {
    if (operator == null || rawInput === '') return;
    const n = parseFloat(rawInput);
    if (isNaN(n) || n === 0) return;
    let deltaGbp = 0;
    let opLabel = '';
    if (operator === '+') {
      deltaGbp = gbpNum ?? n;
      opLabel = `+ £${(deltaGbp).toFixed(2)}`;
    } else if (operator === '-') {
      deltaGbp = -(gbpNum ?? n);
      opLabel = `− £${(Math.abs(deltaGbp)).toFixed(2)}`;
    } else if (operator === '×') {
      // Multiply current total by n
      const multiplied = calcTotal * n - calcTotal;
      deltaGbp = multiplied;
      opLabel = `× ${n}`;
    } else if (operator === '÷') {
      // Divide current total by n
      const divided = calcTotal / n - calcTotal;
      deltaGbp = divided;
      opLabel = `÷ ${n}`;
    } else if (operator === '%') {
      // Add n% of current total
      deltaGbp = calcTotal * (n / 100);
      opLabel = `+ ${n}%`;
    }
    const deltaLocal = deltaGbp * (rate ?? 1);
    setCalcList(prev => [...prev, { op: opLabel, gbp: deltaGbp, local: deltaLocal }]);
    setCalcTotal(t => t + deltaGbp);
    setRawInput('');
    setOperator(null);
  };

  const handleClear = () => {
    setRawInput('');
    setCalcList([]);
    setCalcTotal(0);
    setOperator(null);
    setShareNote('');
  };

  const handleWhatsAppShare = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const rateInfo = rate != null
      ? `1 GBP = ${formatRate(rate, selectedCurrency)}${rateDate ? ` (rates: ${rateDate})` : ''}`
      : '';
    let text = `💱 Currency Summary — ${dateStr} at ${timeStr}\nGBP ↔ ${selectedCurrency}`;
    if (rateInfo) text += `\n${rateInfo}`;
    if (shareNote.trim()) text += `\n📝 ${shareNote.trim()}`;
    text += '\n\n' + calcList.map(item =>
      `${item.op}  |  £${formatWithCommas(Math.abs(item.gbp).toFixed(2))}  /  ${formatWithCommas(Math.abs(item.local).toFixed(2))} ${selectedCurrency}`
    ).join('\n');
    text += `\n\n✅ TOTAL: £${formatWithCommas(calcTotal.toFixed(2))}  /  ${formatWithCommas((calcTotal * (rate ?? 1)).toFixed(2))} ${selectedCurrency}`;
    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(text)}`).catch(() =>
      Alert.alert('WhatsApp not installed', 'Please install WhatsApp to share.')
    );
  };

  const KEYPAD_ROWS = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    ['.', '0', '⌫'],
  ];

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={cv.root} edges={['top', 'bottom']}>
        {/* Header: flag + currency pair + rate in title bar */}
        <View style={cv.header}>
          <View style={{ flex: 1 }}>
            <Text style={[cv.headerTitle, { fontFamily: bold }]}>
              {city.flag}  GBP ↔ {selectedCurrency}
            </Text>
            {rate != null && (
              <Text style={[cv.headerRate, { fontFamily: reg }]}>
                {'1 GBP = '}{formatRate(rate, selectedCurrency)}{rateDate ? `  ·  ${rateDate}` : ''}
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={[cv.headerClose, { fontFamily: bold }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Currency picker overlay */}
        {showCurrencyPicker && (
          <View style={cv.currencyPickerOverlay}>
            <View style={cv.currencyPickerBox}>
              <View style={cv.currencyPickerHeader}>
                <Text style={[cv.currencyPickerTitle, { fontFamily: bold }]}>Select Currency</Text>
                <TouchableOpacity onPress={() => setShowCurrencyPicker(false)} hitSlop={12}>
                  <Text style={[cv.headerClose, { fontFamily: bold }]}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={cv.currencyPickerList} keyboardShouldPersistTaps="handled">
                {pickerEntries.map((entry, idx) => {
                  if (entry.type === 'header') {
                    return (
                      <View key={`hdr-${idx}`} style={cv.currencyPickerSection}>
                        <Text style={[cv.currencyPickerSectionText, { fontFamily: semi }]}>{entry.label}</Text>
                      </View>
                    );
                  }
                  const code = entry.code;
                  return (
                    <TouchableOpacity
                      key={code}
                      style={[cv.currencyPickerItem, selectedCurrency === code && cv.currencyPickerItemActive]}
                      onPress={() => {
                        setSelectedCurrency(code);
                        setShowCurrencyPicker(false);
                        handleClear();
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[cv.currencyPickerItemName, { fontFamily: semi },
                        selectedCurrency === code && { color: Colors.deepBlue }]} numberOfLines={1}>
                        {currencyName(code)}
                      </Text>
                      <Text style={[cv.currencyPickerItemCode, { fontFamily: reg ?? undefined },
                        selectedCurrency === code && { color: Colors.deepBlue }]}>
                        {code}{allRates?.[code] != null ? `  ·  ${formatRate(allRates[code], code)}` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        )}

        {rate != null ? (
          <ScrollView contentContainerStyle={cv.content} keyboardShouldPersistTaps="handled">

            {/* Display: GBP on left, local on right, tap label to switch active mode */}
            <View style={cv.displayRow}>
              <TouchableOpacity
                style={[cv.displayBox, mode === 'gbp' && cv.displayBoxActive]}
                onPress={() => { setMode('gbp'); clearFields(); }}
                activeOpacity={0.7}
              >
                <Text style={[cv.displayLabel, { fontFamily: semi }]}>£ GBP</Text>
                <Text style={[cv.displayValue, { fontFamily: bold },
                  mode === 'gbp' && cv.displayValueActive]} numberOfLines={1}>
                  {mode === 'gbp' ? (rawInput ? formatWithCommas(rawInput) : (operator === '%' ? '%' : '0')) : displayGbp}
                </Text>
              </TouchableOpacity>

              <Text style={cv.swapArrow}>⇄</Text>

              <TouchableOpacity
                style={[cv.displayBox, mode === 'local' && cv.displayBoxActive]}
                onPress={() => { setMode('local'); clearFields(); }}
                activeOpacity={0.7}
              >
                <Text style={[cv.currencyPickerLabel, { fontFamily: semi }]}>Currency Selector</Text>
                <TouchableOpacity
                  style={cv.currencyDropdownBtn}
                  onPress={() => setShowCurrencyPicker(true)}
                  activeOpacity={0.7}
                >
                  <Text style={[cv.currencyDropdownText, { fontFamily: semi }]} numberOfLines={1}>
                    {currencyName(selectedCurrency)} ({selectedCurrency})
                  </Text>
                  <Text style={cv.currencyDropdownArrow}>▼</Text>
                </TouchableOpacity>
                <Text style={[cv.displayValue, { fontFamily: bold },
                  mode === 'local' && cv.displayValueActive]} numberOfLines={1}>
                  {mode === 'local' ? (rawInput ? formatWithCommas(rawInput) : (operator === '%' ? '%' : '0')) : displayLocal}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Built-in keypad */}
            <View style={cv.keypad}>
              {KEYPAD_ROWS.map((row, ri) => (
                <View key={ri} style={cv.keypadRow}>
                  {row.map(key => (
                    <TouchableOpacity
                      key={key}
                      style={[cv.key, key === '⌫' && cv.keyBackspace]}
                      onPress={() => handleKey(key)}
                      activeOpacity={0.6}
                    >
                      <Text style={[cv.keyText, { fontFamily: bold }, key === '⌫' && cv.keyBackspaceText]}>
                        {key}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>

            {/* Operator buttons — 2 rows: row 1 = + − , row 2 = × ÷  then = C */}
            {([
              ['+', '-'] as const,
              ['×', '÷'] as const,
            ]).map((row, ri) => (
              <View key={ri} style={cv.operatorRow}>
                {row.map(op => {
                  const s = OP_STYLES[op];
                  const isActive = operator === op;
                  return (
                    <TouchableOpacity
                      key={op}
                      style={[cv.opBtn, { backgroundColor: isActive ? s.activeBg : s.bg, borderColor: isActive ? s.activeBorder : s.border }]}
                      onPress={() => handleOperator(op)}
                      activeOpacity={0.7}
                    >
                      <Text style={[cv.opBtnText, { fontFamily: bold, color: s.text }]}>
                        {op}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {/* % and action buttons on second row */}
                {ri === 1 && (
                  <>
                    {(['%'] as const).map(op => {
                      const s = OP_STYLES[op];
                      const isActive = operator === op;
                      return (
                        <TouchableOpacity
                          key={op}
                          style={[cv.opBtn, { backgroundColor: isActive ? s.activeBg : s.bg, borderColor: isActive ? s.activeBorder : s.border }]}
                          onPress={() => handleOperator(op)}
                          activeOpacity={0.7}
                        >
                          <Text style={[cv.opBtnText, { fontFamily: bold, color: s.text }]}>
                            {op}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity style={[cv.opBtn, cv.equalsBtn, { backgroundColor: operator && rawInput !== '' ? Colors.freshGreen : '#CCC' }]} onPress={handleEquals} disabled={!operator || rawInput === ''}>
                      <Text style={[cv.opBtnText, { fontFamily: bold, color: '#FFF' }]}>=</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[cv.opBtn, cv.clearBtn, { backgroundColor: Colors.maroonRed }]} onPress={handleClear}>
                      <Text style={[cv.opBtnText, { fontFamily: bold, color: '#FFF' }]}>C</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ))}

            {/* Running log — two-column table */}
            {calcList.length > 0 ? (
              <View style={cv.calcSection}>
                {/* Column headers */}
                <View style={cv.calcHeaderRow}>
                  <Text style={[cv.calcHeaderOp, { fontFamily: bold }]}>Operation</Text>
                  <View style={cv.calcDivider} />
                  <Text style={[cv.calcHeaderGbp, { fontFamily: bold }]}>£ GBP</Text>
                  <View style={cv.calcDivider} />
                  <Text style={[cv.calcHeaderLocal, { fontFamily: bold }]}>{selectedCurrency}</Text>
                </View>
                <View style={cv.calcHorizLine} />
                {calcList.map((item, i) => (
                  <View key={i} style={cv.calcItem}>
                    <Text style={[cv.calcItemOp, { fontFamily: reg }]}>{item.op}</Text>
                    <View style={cv.calcDivider} />
                    <Text style={[cv.calcItemGbp, { fontFamily: semi }, item.gbp < 0 && { color: Colors.maroonRed }]}>
                      {item.gbp >= 0 ? '+' : '−'} £{formatWithCommas(Math.abs(item.gbp).toFixed(2))}
                    </Text>
                    <View style={cv.calcDivider} />
                    <Text style={[cv.calcItemLocal, { fontFamily: semi }, item.gbp < 0 && { color: Colors.maroonRed }]}>
                      {item.gbp >= 0 ? '+' : '−'} {formatWithCommas(Math.abs(item.local).toFixed(2))} {selectedCurrency}
                    </Text>
                  </View>
                ))}
                <View style={cv.calcHorizLine} />
                <View style={cv.calcTotalRow}>
                  <Text style={[cv.calcTotalLabel, { fontFamily: bold }]}>TOTAL</Text>
                  <View style={cv.calcDivider} />
                  <Text style={[cv.calcTotalGbp, { fontFamily: bold }]}>
                    £{formatWithCommas(calcTotal.toFixed(2))}
                  </Text>
                  <View style={cv.calcDivider} />
                  <Text style={[cv.calcTotalLocal, { fontFamily: bold }]}>
                    {formatWithCommas((calcTotal * (rate ?? 1)).toFixed(2))} {selectedCurrency}
                  </Text>
                </View>
                <View style={cv.calcHorizLine} />
                <TextInput
                  style={[cv.shareNoteInput, { fontFamily: reg }]}
                  placeholder="Add a note (optional)…"
                  placeholderTextColor={Colors.inkMute}
                  value={shareNote}
                  onChangeText={setShareNote}
                  multiline
                  maxLength={200}
                />
                <TouchableOpacity style={cv.whatsappBtn} onPress={handleWhatsAppShare} activeOpacity={0.75}>
                  <Text style={[cv.whatsappBtnText, { fontFamily: bold }]}>📤  Share via WhatsApp</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={[cv.calcHint, { fontFamily: reg }]}>
                Press +  −  ×  ÷  % to select an operation, enter a number, then press = to add to total.
              </Text>
            )}
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
  root:   { flex: 1, backgroundColor: '#F5F5F5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: Colors.blueDeep, paddingHorizontal: 20, paddingVertical: 14 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#FFF' },
  headerRate:  { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  headerClose: { fontSize: 18, color: '#FFF', padding: 4 },

  content: { padding: 14, gap: 12 },

  // Display boxes
  displayRow:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  displayBox:       { flex: 1, backgroundColor: '#FFF', borderRadius: 12, padding: 12,
                       borderWidth: 2, borderColor: 'transparent',
                       elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                       shadowOpacity: 0.06, shadowRadius: 3 },
  displayBoxActive: { borderColor: Colors.deepBlue },
  displayLabel:     { fontSize: 12, fontWeight: '600', color: Colors.inkMute, marginBottom: 4 },
  displayValue:     { fontSize: 22, fontWeight: '700', color: Colors.ink },
  displayValueActive: { color: Colors.deepBlue },
  swapArrow:        { fontSize: 22, color: Colors.inkMute },

  // Built-in keypad
  keypad:    { backgroundColor: '#FFF', borderRadius: 12, padding: 8, gap: 6,
               elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
               shadowOpacity: 0.06, shadowRadius: 3 },
  keypadRow: { flexDirection: 'row', gap: 6 },
  key:       { flex: 1, aspectRatio: 1.6, backgroundColor: '#F0F4F8', borderRadius: 10,
               alignItems: 'center', justifyContent: 'center' },
  keyBackspace: { backgroundColor: '#FFE5E5' },
  keyText:      { fontSize: 22, fontWeight: '700', color: Colors.ink },
  keyBackspaceText: { color: Colors.maroonRed },

  // Operator buttons — 2-row grid
  operatorRow:    { flexDirection: 'row', gap: 6 },
  opBtn:          { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center',
                    backgroundColor: '#F0F4F8', borderWidth: 1.5, borderColor: 'transparent' },
  opBtnActive:    { borderColor: Colors.deepBlue, backgroundColor: '#EBF0FF' },
  opBtnText:      { fontSize: 20, fontWeight: '700', color: Colors.ink },
  equalsBtn:      { flex: 1 },
  clearBtn:       { flex: 1 },

  // Currency dropdown (on local display box)
  currencyPickerLabel:  { fontSize: 11, fontWeight: '600', color: Colors.inkMute, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 3 },
  currencyDropdownBtn:  { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 6 },
  currencyDropdownText: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.deepBlue },
  currencyDropdownArrow:{ fontSize: 20, color: Colors.deepBlue, lineHeight: 22 },
  currencyPickerOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100,
    justifyContent: 'center', alignItems: 'center',
  } as any,
  currencyPickerBox: {
    backgroundColor: '#FFF', borderRadius: 16,
    width: '85%', maxHeight: '70%',
    overflow: 'hidden',
  } as any,
  currencyPickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.blueDeep, paddingHorizontal: 16, paddingVertical: 12,
  },
  currencyPickerTitle:    { fontSize: 16, fontWeight: '700', color: '#FFF' },
  currencyPickerList:     { maxHeight: 340 },
  currencyPickerItem:     { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  currencyPickerItemActive: { backgroundColor: '#EBF0FF' },
  currencyPickerItemName: { fontSize: 13, color: Colors.ink, fontWeight: '600' },
  currencyPickerItemCode: { fontSize: 11, color: Colors.inkMute, marginTop: 1 },
  currencyPickerSep:      { height: 1, backgroundColor: Colors.deepBlue, opacity: 0.25, marginHorizontal: 16, marginVertical: 4 },
  currencyPickerSection:     { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, backgroundColor: '#F0F4FF' },
  currencyPickerSectionText: { fontSize: 12, fontWeight: '700', color: Colors.deepBlue, letterSpacing: 0.5, textTransform: 'uppercase' },

  // Running log — two-column table
  calcSection:     { backgroundColor: '#FFF', borderRadius: 12, padding: 12, gap: 0,
                     elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                     shadowOpacity: 0.06, shadowRadius: 3 },
  calcHeaderRow:   { flexDirection: 'row', alignItems: 'center', paddingBottom: 6 },
  calcHeaderOp:    { flex: 2, fontSize: 11, fontWeight: '700', color: Colors.inkMute, textTransform: 'uppercase' },
  calcHeaderGbp:   { flex: 1.5, fontSize: 11, fontWeight: '700', color: Colors.freshGreen, textAlign: 'right', textTransform: 'uppercase' },
  calcHeaderLocal: { flex: 1.5, fontSize: 11, fontWeight: '700', color: Colors.maroonRed, textAlign: 'right', textTransform: 'uppercase' },
  calcHorizLine:   { height: 1, backgroundColor: '#E0E0E0', marginVertical: 4 },
  calcDivider:     { width: 1, height: '100%', backgroundColor: '#E0E0E0', marginHorizontal: 6 } as any,
  calcItem:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  calcItemOp:      { flex: 2, fontSize: 12, color: Colors.ink },
  calcItemGbp:     { flex: 1.5, fontSize: 12, color: Colors.freshGreen, textAlign: 'right' },
  calcItemLocal:   { flex: 1.5, fontSize: 12, color: Colors.maroonRed, textAlign: 'right' },
  calcTotalRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  calcTotalLabel:  { flex: 2, fontSize: 13, fontWeight: '700', color: Colors.ink },
  calcTotalGbp:    { flex: 1.5, fontSize: 13, color: Colors.freshGreen, fontWeight: '700', textAlign: 'right' },
  calcTotalLocal:  { flex: 1.5, fontSize: 13, color: Colors.maroonRed, fontWeight: '700', textAlign: 'right' },
  calcHint:        { fontSize: 12, color: Colors.inkMute, textAlign: 'center',
                     fontStyle: 'italic', lineHeight: 18 },
  shareNoteInput: {
    borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 8,
    padding: 8, fontSize: 12, color: Colors.ink,
    marginTop: 8, minHeight: 40,
  },
  whatsappBtn: {
    backgroundColor: '#25D366', borderRadius: 10,
    paddingVertical: 11, alignItems: 'center', marginTop: 8,
  },
  whatsappBtnText: { fontSize: 14, color: '#FFF', fontWeight: '700' },
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

  // Temperature label (emoji + text) — replaces coloured HeatIcon circle
  function tempEmoji(t: number | null): { emoji: string; label: string } {
    if (t == null)  return { emoji: '🌡️', label: '' };
    if (t <= 0)     return { emoji: '❄️',  label: 'Freezing' };
    if (t <= 5)     return { emoji: '🥶',  label: 'Very Cold' };
    if (t <= 14)    return { emoji: '🌤️', label: 'Cool' };
    if (t <= 22)    return { emoji: '🌤️', label: 'Mild' };
    if (t <= 30)    return { emoji: '☀️',  label: 'Warm' };
    if (t <= 37)    return { emoji: '🌞',  label: 'Hot' };
    if (t <= 45)    return { emoji: '🔥',  label: 'Very Hot' };
    return           { emoji: '🌋',  label: 'Extreme' };
  }

  // Saudi Arabia: temperature displayed inline below city name (not in right column)
  const saudiTempInline = isSaudi && city2Name != null;

  return (
    <View style={[styles.cityCard, isSaudi && styles.cityCardSaudi, isPinned && styles.cityCardPinned]}>
      {/* Row 1: flag + COUNTRY (bold top) + city (grey below) + time + pin */}
      <View style={styles.cityRow}>
        <View style={styles.cityLeft}>
          <Text style={styles.cityFlag}>{city.flag}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cityCountryTop, { fontFamily: bold }]} numberOfLines={1} ellipsizeMode="tail">{showCountry}</Text>
            <Text style={[styles.cityNameSub, { fontFamily: reg }]} numberOfLines={1} ellipsizeMode="tail">{showName}</Text>
            {/* Saudi Arabia: temps inline below city name */}
            {saudiTempInline && (
              <TouchableOpacity onPress={onTempPress} activeOpacity={0.75} style={styles.saudiTempInline}>
                <View style={styles.dualTempRow}>
                  <Text style={{ fontSize: 13 }}>{tempEmoji(temp).emoji}</Text>
                  <Text style={[styles.dualTempCity, { fontFamily: reg }]}>Mecca</Text>
                  <Text style={[styles.dualTempValue, { fontFamily: bold }]}>
                    {temp != null ? `${Math.round(temp)}°` : '–'}
                  </Text>
                </View>
                <View style={styles.dualTempRow}>
                  <Text style={{ fontSize: 13 }}>{tempEmoji(temp2 ?? null).emoji}</Text>
                  <Text style={[styles.dualTempCity, { fontFamily: reg }]}>Madina</Text>
                  <Text style={[styles.dualTempValue, { fontFamily: bold }]}>
                    {temp2 != null ? `${Math.round(temp2)}°` : '–'}
                  </Text>
                </View>
                <Text style={[styles.tapHint, { fontFamily: reg }]}>7-day › </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={styles.cityTimeCol}>
          <Text style={[styles.cityTime, { fontFamily: bold }]}>{timeStr}</Text>
          <Text style={[styles.cityTimeLabelOffset, { fontFamily: reg }]}>{relLabel}</Text>
        </View>
        {/* Flexible spacer — separates time from pin button */}
        <View style={styles.cityRowSpacer} />
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

      {/* Bottom section: prayer+currency LEFT, temperature RIGHT (non-Saudi only) */}
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

          {/* Currency row — rate pill + date on separate line below */}
          <View style={styles.currencyRow}>
            <Text style={styles.currencyIcon}>💷</Text>
            <View style={{ flex: 1 }}>
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
            </View>
          </View>

          {/* Chart + Calculator icons — own row below exchange rate */}
          <View style={styles.currencyIconRow}>
            <TouchableOpacity onPress={onCalcPress} hitSlop={10} style={styles.currencyIconBtn}>
              <CalcIcon size={26} />
              <Text style={[styles.currencyIconLabel, { fontFamily: reg }]}>Convert</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onRatePress} hitSlop={10} style={styles.currencyIconBtn}>
              <Text style={{ fontSize: 26 }}>📊</Text>
              <Text style={[styles.currencyIconLabel, { fontFamily: reg }]}>Chart</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* RIGHT: temperature column — only for non-Saudi cities */}
        {!saudiTempInline && (
          <TouchableOpacity
            style={styles.tempColumn}
            onPress={onTempPress}
            activeOpacity={0.75}
          >
            {loading && weather === undefined ? (
              <Text style={{ fontSize: 22, textAlign: 'center' }}>🌡️</Text>
            ) : (
              /* Single city — emoji icon + temperature + label */
              <>
                <Text style={{ fontSize: 28, textAlign: 'center' }}>{tempEmoji(temp).emoji}</Text>
                <Text style={[styles.tempValue, { fontFamily: bold }]}>
                  {temp != null ? `${Math.round(temp)}°` : '–'}
                </Text>
                {temp != null && (
                  <Text style={[styles.tempLabel, { fontFamily: reg }]}>
                    {tempEmoji(temp).label}
                  </Text>
                )}
              </>
            )}
            <Text style={styles.tempCondIcon}>{condEmoji || '🌡️'}</Text>
            <Text style={[styles.tapHint, { fontFamily: reg, textAlign: 'center' }]}>7-day ›</Text>
          </TouchableOpacity>
        )}

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

  // Load cached data immediately then refresh in background based on connectivity
  const loadData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    // Always fetch (functions have their own cache logic — weather 30min, currency 4h)
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
    if (!visible) return;
    // Always load on open; NetInfo used to decide if we also background-refresh stale data
    loadData();
    fetchPinnedCities().then(setPinnedIds);
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

  // Pin / unpin a city (max 5)
  const handlePinToggle = useCallback((cityId: string) => {
    setPinnedIds(prev => {
      let next: string[];
      if (prev.includes(cityId)) {
        next = prev.filter(id => id !== cityId);
      } else {
        if (prev.length >= MAX_PINS) {
          // Show toast-style alert instead of silently ignoring
          Alert.alert('Max pins reached', 'Unpin a country to pin this one (max 5)');
          return prev;
        }
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
                🌡️ 7-day forecast · 📊 12-month chart · 🧮 currency · ⭐ pin city
              </Text>
              <TouchableOpacity onPress={() => loadData(true)} hitSlop={8}>
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

            {/* ── Pre-pin hint (only shown before user has pinned anything) ── */}
            {pinnedIds.length === 0 && (
              <View style={styles.prePinHint}>
                <Text style={[styles.prePinHintText, { fontFamily: reg }]}>
                  Tap the <Text style={styles.prePinStar}>☆</Text> on any city card below to pin it here at the top
                </Text>
              </View>
            )}

            {/* ── Pinned cities (user-selected, up to 5) ── */}
            {pinnedIds.length > 0 && (() => {
              const pinned = pinnedIds
                .map(id => CITIES.find(c => c.id === id))
                .filter((c): c is City => !!c && c.country !== 'Saudi Arabia');
              if (pinned.length === 0) return null;
              return (
                <View key="pinned">
                  <View style={styles.groupSeparator}>
                    <View style={styles.groupSepLine} />
                    <Text style={[styles.groupSepLabel, { fontFamily: semi }]}>⭐ Pinned Cities</Text>
                    <View style={styles.groupSepLine} />
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
                  <View style={styles.groupSeparator}>
                    <View style={styles.groupSepLine} />
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
          allRates={currency?.rates}
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
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  headerClose: { fontSize: 18, color: '#FFF', padding: 4 },

  ukTimeBlock: { alignItems: 'flex-start' },
  ukTimeValue: { fontSize: 20, fontWeight: '700', color: '#FFF', fontVariant: ['tabular-nums'] },
  ukTimeLabel: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 1 },

  rateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E8F0FE',
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  rateBarText: { fontSize: 12, color: Colors.deepBlue, flex: 1, lineHeight: 17 },
  refreshBtn:  { fontSize: 12, color: Colors.deepBlue, fontWeight: '600', paddingLeft: 8 },

  scroll:        { flex: 1 },
  scrollContent: { padding: 12, gap: 4 },

  // ── Timezone group ──────────────────────────────────────────────────────────
  groupSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingTop: 10,
    paddingBottom: 6,
  },
  groupSepLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#DEDEDE',
  },
  groupSepLabel: {
    fontSize: 12,
    color: Colors.inkMute,
    fontWeight: '600',
    letterSpacing: 0.4,
  },

  groupBlock: { gap: 6 },

  prePinHint: {
    backgroundColor: '#FFF8E7',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFB300',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 6,
    marginBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  prePinHintText: { fontSize: 13, color: Colors.ink, flex: 1, lineHeight: 18 },
  prePinStar:     { fontSize: 20 },

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
    fontSize: 28,
  },
  pinIconDisabled: {
    opacity: 0.3,
  },

  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cityLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1, flex: 0 },
  cityRowSpacer: { flex: 1 },  // flexible gap between city name and pin button
  cityFlag: { fontSize: 26 },

  cityCountryTop: { fontSize: 16, fontWeight: '700', color: Colors.ink },
  cityNameSub:    { fontSize: 12, color: Colors.inkMute, marginTop: 1 },
  saudiTempInline:{ marginTop: 6, gap: 2 },

  cityTimeCol:         { alignItems: 'flex-end', marginLeft: 14 },
  cityTimeLabelOffset: { fontSize: 16, color: '#CC1111', fontWeight: '700', marginTop: 2 },
  cityTime: {
    fontSize: 19, fontWeight: '700', color: Colors.deepBlue,
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
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 4,
  },
  prayerCurrentInline: {
    fontSize: 13,
    color: Colors.inkMute,
    fontWeight: '400',
  },
  prayerNextName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.maroonRed,
  },
  prayerNextTime: {
    fontSize: 15,
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
    fontSize: 12,
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
  currencyRate: { fontSize: 15, color: Colors.maroonRed, fontWeight: '700' },
  currencyDate: { fontSize: 11, color: Colors.inkMute, marginTop: 2 },

  // Chart + Calc icon row (below currency rate row)
  currencyIconRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  currencyIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F0F4F8',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  currencyIconLabel: { fontSize: 13, color: Colors.deepBlue, fontWeight: '600' },

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
  tempValue:    { fontSize: 20, fontWeight: '700', color: Colors.ink, textAlign: 'center' },
  tempLabel:    { fontSize: 11, color: Colors.inkMute, textAlign: 'center' },
  tempCondIcon: { fontSize: 20, textAlign: 'center' },
  dualTempRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dualTempCity: { fontSize: 13, color: Colors.inkMute },
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
