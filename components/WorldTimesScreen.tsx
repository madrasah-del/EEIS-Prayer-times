/**
 * WorldTimesScreen — full-screen modal showing local time, temperature,
 * and GBP exchange rate for cities relevant to the EEIS community.
 *
 * Layout:
 *  - Saudi Arabia section always first (Mecca + Medina)
 *  - Remaining cities grouped by UTC offset (most ahead of UK first)
 *  - Each card shows "LOCAL TIME · +X hrs" label above the time digits
 *
 * Data strategy (all fetched only when this screen opens):
 *  - Time: computed live from device UTC clock + hardcoded offsets (0 API calls)
 *  - Weather: Open-Meteo batched call (free, no key) — 30-min cache
 *  - Currency: frankfurter.dev (free, no key) — 4-hour cache
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, StatusBar, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CITIES,
  City,
  getLocalTime,
  fetchWeather,
  fetchCurrencyRates,
  formatRate,
  formatRateDate,
  WeatherData,
  CurrencyData,
} from '../data/worldTimes';
import { Colors } from '../constants/theme';

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  visible:     boolean;
  onClose:     () => void;
  fontsLoaded: boolean;
};

// ─── Timezone group helpers ───────────────────────────────────────────────────

/** Format UTC offset as "+5", "+5.5", "+6" etc. */
function fmtOffset(h: number): string {
  if (h === Math.floor(h)) return `+${h}`;
  const whole = Math.floor(h);
  const frac  = h - whole;
  return `+${whole}${frac === 0.5 ? '½' : frac.toFixed(1).slice(1)}`;
}

/** UK time offset string: "X hours ahead" or "X½ hours ahead" */
function aheadLabel(h: number): string {
  if (h === Math.floor(h)) return `${h} hr${h === 1 ? '' : 's'} ahead of UK`;
  const whole = Math.floor(h);
  return `${whole}½ hrs ahead of UK`;
}

// ─── City card ────────────────────────────────────────────────────────────────

type CardProps = {
  city:       City;
  temp:       number | null | undefined;
  rate:       number | undefined;
  loading:    boolean;
  fontsLoaded: boolean;
  isSaudi:    boolean;
};

function CityCard({ city, temp, rate, loading, fontsLoaded, isSaudi }: CardProps) {
  const bold = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;

  const timeStr = getLocalTime(city.utcOffsetHours);

  return (
    <View style={[styles.cityCard, isSaudi && styles.cityCardSaudi]}>
      <View style={styles.cityRow}>
        {/* Flag + name */}
        <View style={styles.cityLeft}>
          <Text style={styles.cityFlag}>{city.flag}</Text>
          <View>
            <Text style={[styles.cityName, { fontFamily: bold }]}>{city.name}</Text>
            {!isSaudi && (
              <Text style={[styles.cityCountry, { fontFamily: reg }]}>{city.country}</Text>
            )}
          </View>
        </View>

        {/* Time column */}
        <View style={styles.cityTimeCol}>
          <Text style={[styles.cityTimeLabel, { fontFamily: reg }]}>
            LOCAL TIME · {fmtOffset(city.utcOffsetHours)} hrs
          </Text>
          <Text style={[styles.cityTime, { fontFamily: bold }]}>{timeStr}</Text>
        </View>
      </View>

      {/* Temperature + currency */}
      <View style={styles.cityDetails}>
        <View style={styles.cityDetailItem}>
          <Text style={styles.cityDetailIcon}>🌡</Text>
          <Text style={[styles.cityDetailText, { fontFamily: semi }]}>
            {loading && temp === undefined
              ? '…'
              : temp != null
                ? `${Math.round(temp)}°C`
                : '–'}
          </Text>
        </View>
        <View style={styles.cityDetailItem}>
          <Text style={styles.cityDetailIcon}>💷</Text>
          <Text style={[styles.cityDetailText, { fontFamily: semi }]}>
            {loading && rate === undefined
              ? '…'
              : rate != null
                ? formatRate(rate, city.currency)
                : '–'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WorldTimesScreen({ visible, onClose, fontsLoaded }: Props) {
  const bold = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;

  const [weather,  setWeather]  = useState<WeatherData | null>(null);
  const [currency, setCurrency] = useState<CurrencyData | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [, setTick]             = useState(0);
  const tickRef                 = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live clock — update every 30 seconds
  useEffect(() => {
    if (!visible) {
      if (tickRef.current) clearInterval(tickRef.current);
      return;
    }
    setTick(n => n + 1);
    tickRef.current = setInterval(() => setTick(n => n + 1), 30_000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [visible]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [w, c] = await Promise.all([fetchWeather(), fetchCurrencyRates()]);
    setWeather(w);
    setCurrency(c);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (visible) loadData();
  }, [visible, loadData]);

  // Split Saudi (always first) from the rest, grouped by UTC offset descending
  const saudiCities = CITIES.filter(c => c.country === 'Saudi Arabia');
  const otherCities = CITIES.filter(c => c.country !== 'Saudi Arabia');

  // Build timezone groups: Map<utcOffset, City[]>, sorted descending
  const tzMap = new Map<number, City[]>();
  otherCities.forEach(city => {
    if (!tzMap.has(city.utcOffsetHours)) tzMap.set(city.utcOffsetHours, []);
    tzMap.get(city.utcOffsetHours)!.push(city);
  });
  const tzGroups = [...tzMap.entries()].sort((a, b) => b[0] - a[0]);

  const cardProps = (city: City) => ({
    city,
    temp:    weather?.[city.id],
    rate:    currency?.rates[city.currency],
    loading,
    fontsLoaded,
  });

  return (
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
          <View>
            <Text style={[styles.headerTitle, { fontFamily: bold }]}>🌍 World Times</Text>
            <Text style={[styles.headerSub, { fontFamily: reg }]}>
              Time, temperature &amp; GBP exchange rates
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
          >
            <Text style={[styles.headerClose, { fontFamily: bold }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Currency date + refresh */}
        {currency && (
          <View style={styles.rateBar}>
            <Text style={[styles.rateBarText, { fontFamily: reg }]}>
              Exchange rates as of {formatRateDate(currency.date)}
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
              UTC +3 · 3 hrs ahead of UK
            </Text>
          </View>
          <View style={styles.groupBlock}>
            {saudiCities.map(city => (
              <CityCard key={city.id} {...cardProps(city)} isSaudi />
            ))}
          </View>

          {/* ── Other cities grouped by UTC offset descending ── */}
          {tzGroups.map(([offset, cities]) => (
            <View key={offset}>
              <View style={styles.groupHeader}>
                <Text style={[styles.groupHeaderText, { fontFamily: bold }]}>
                  UTC {fmtOffset(offset)}
                </Text>
                <Text style={[styles.groupHeaderSub, { fontFamily: reg }]}>
                  {aheadLabel(offset)}
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
            Weather: Open-Meteo · Currency: Frankfurter.dev{'\n'}
            Weather cached 30 min · Rates cached 4 hrs
          </Text>

        </ScrollView>
      </SafeAreaView>
    </Modal>
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

  rateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E8F0FE',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  rateBarText: { fontSize: 11, color: Colors.deepBlue },
  refreshBtn:  { fontSize: 12, color: Colors.deepBlue, fontWeight: '600' },

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
  },
  cityCardSaudi: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.freshGreen,
  },

  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cityLeft:    { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  cityFlag:    { fontSize: 26 },
  cityName:    { fontSize: 15, fontWeight: '700', color: Colors.ink },
  cityCountry: { fontSize: 11, color: Colors.inkMute, marginTop: 1 },

  cityTimeCol:   { alignItems: 'flex-end' },
  cityTimeLabel: { fontSize: 9, color: Colors.inkMute, letterSpacing: 0.3, marginBottom: 1 },
  cityTime:      {
    fontSize: 26, fontWeight: '700', color: Colors.deepBlue,
    fontVariant: ['tabular-nums'],
  },

  cityDetails:    { flexDirection: 'row', gap: 16 },
  cityDetailItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cityDetailIcon: { fontSize: 13 },
  cityDetailText: { fontSize: 12, color: Colors.ink, fontWeight: '600' },

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
