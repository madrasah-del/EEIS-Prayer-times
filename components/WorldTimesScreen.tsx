/**
 * WorldTimesScreen — full-screen modal showing local time, temperature,
 * and GBP exchange rate for cities relevant to the EEIS community.
 *
 * Data strategy (all fetched only when this screen opens):
 *  - Time: computed live from device UTC clock + hardcoded offsets (0 API calls)
 *  - Weather: Open-Meteo batched call (free, no key) — 30-min cache
 *  - Currency: frankfurter.app (free, no key) — 4-hour cache
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, StatusBar, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CITIES,
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

// ─── Component ────────────────────────────────────────────────────────────────

export function WorldTimesScreen({ visible, onClose, fontsLoaded }: Props) {
  const bold = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;

  const [weather,      setWeather]      = useState<WeatherData | null>(null);
  const [currency,     setCurrency]     = useState<CurrencyData | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [, setTick]                     = useState(0);   // drives live time updates
  const tickRef                         = useRef<ReturnType<typeof setInterval> | null>(null);

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
              Time, temperature &amp; GBP rates
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

          {CITIES.map((city, idx) => {
            const temp     = weather?.[city.id];
            const rate     = currency?.rates[city.currency];
            const timeStr  = getLocalTime(city.utcOffsetHours);
            const isSaudi  = city.country === 'Saudi Arabia';
            const isFirst  = idx === 0;

            return (
              <View
                key={city.id}
                style={[
                  styles.cityCard,
                  isFirst && styles.cityCardFirst,
                  isSaudi && !isFirst && styles.cityCardSaudi,
                ]}
              >
                {/* Country section header for Saudi Arabia */}
                {isFirst && (
                  <View style={styles.countryBadge}>
                    <Text style={[styles.countryBadgeText, { fontFamily: bold }]}>
                      🇸🇦 Saudi Arabia
                    </Text>
                  </View>
                )}

                <View style={styles.cityRow}>
                  {/* Flag + name */}
                  <View style={styles.cityLeft}>
                    <Text style={styles.cityFlag}>{city.flag}</Text>
                    <View>
                      <Text style={[styles.cityName, { fontFamily: bold }]}>
                        {city.name}
                      </Text>
                      {!isSaudi && (
                        <Text style={[styles.cityCountry, { fontFamily: reg }]}>
                          {city.country}
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Time */}
                  <Text style={[styles.cityTime, { fontFamily: bold }]}>{timeStr}</Text>
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
          })}

          {loading && !weather && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={Colors.deepBlue} />
              <Text style={[styles.loadingText, { fontFamily: reg }]}>
                Fetching live data…
              </Text>
            </View>
          )}

          <Text style={[styles.footer, { fontFamily: reg }]}>
            Weather: Open-Meteo · Currency: Frankfurter.app{'\n'}
            Data cached 30 min (weather) / 4 hrs (rates)
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
  rateBarText:  { fontSize: 11, color: Colors.deepBlue },
  refreshBtn:   { fontSize: 12, color: Colors.deepBlue, fontWeight: '600' },

  scroll:        { flex: 1 },
  scrollContent: { padding: 12, gap: 10 },

  cityCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
  },
  cityCardFirst: {
    borderTopWidth: 3,
    borderTopColor: '#4CAF50',  // green top border for Saudi Arabia
  },
  cityCardSaudi: {
    borderTopWidth: 0,
    marginTop: -2,   // visually group Medina under Mecca
    borderRadius: 14,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },

  countryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8F5E9',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  countryBadgeText: { fontSize: 11, color: '#2E7D32', fontWeight: '700' },

  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cityLeft:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cityFlag:    { fontSize: 28 },
  cityName:    { fontSize: 16, fontWeight: '700', color: Colors.ink },
  cityCountry: { fontSize: 11, color: Colors.inkMute, marginTop: 1 },
  cityTime:    { fontSize: 26, fontWeight: '700', color: Colors.deepBlue, fontVariant: ['tabular-nums'] },

  cityDetails:    { flexDirection: 'row', gap: 16 },
  cityDetailItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cityDetailIcon: { fontSize: 14 },
  cityDetailText: { fontSize: 13, color: Colors.ink, fontWeight: '600' },

  loadingRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 16 },
  loadingText: { fontSize: 13, color: Colors.inkMute },

  footer: {
    fontSize: 10,
    color: Colors.inkMute,
    textAlign: 'center',
    lineHeight: 16,
    paddingVertical: 8,
  },
});
