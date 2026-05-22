import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';
import { sp } from '../constants/scaling';

const GREG_MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

type Props = {
  viewDate: Date;
  hijri: { day: number; month: string; year: number } | null;
  onPress: () => void;
  fontsLoaded: boolean;
  /** Tasbih count — shown on the right side of the bar when > 0 */
  tasbihCount?: number;
  /** Called when user taps the tasbih count pill to reset */
  onTasbihReset?: () => void;
};

export function DateTimeBar({
  viewDate, hijri, onPress, fontsLoaded,
  tasbihCount = 0, onTasbihReset,
}: Props) {
  const bold = fontsLoaded ? 'Poppins_700Bold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular' : undefined;

  const dayName   = DAYS[viewDate.getDay()];
  const gregDay   = viewDate.getDate();
  const gregMonth = GREG_MONTHS[viewDate.getMonth()];
  const gregYear  = viewDate.getFullYear();

  return (
    <TouchableOpacity style={styles.bar} onPress={onPress} activeOpacity={0.85}>
      {/* Date text — centred, with optional tasbih count on right */}
      <View style={styles.row}>
        {/* Left spacer to balance the tasbih pill on the right */}
        <View style={styles.side} />

        {/* Centred date text */}
        <View style={styles.dateBlock}>
          <Text style={[styles.gregText, { fontFamily: bold }]} numberOfLines={1}>
            {dayName}, {gregDay} {gregMonth} {gregYear}
          </Text>
          {hijri && (
            <Text style={[styles.hijriText, { fontFamily: bold }]} numberOfLines={1}>
              {hijri.day} {hijri.month} {hijri.year}
            </Text>
          )}
        </View>

        {/* Tasbih count pill on the right */}
        <View style={styles.side}>
          {tasbihCount > 0 && onTasbihReset && (
            <TouchableOpacity
              style={styles.tasbihPill}
              onPress={onTasbihReset}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.tasbihCount, { fontFamily: bold }]}>{tasbihCount}</Text>
              <Text style={[styles.tasbihReset, { fontFamily: reg }]}>Tap to reset</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: Colors.blueDeep,
    paddingHorizontal: 12,
    paddingVertical: sp(7),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  side: {
    width: 72,   // fixed width so centre block is truly centred
    alignItems: 'flex-end',
  },
  dateBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  gregText: {
    color: '#FFFFFF',
    fontSize: sp(20),
    fontWeight: '700',
    lineHeight: sp(25),
    textAlign: 'center',
  },
  hijriText: {
    color: Colors.freshGreen,
    fontSize: sp(20),
    fontWeight: '700',
    lineHeight: sp(25),
    textAlign: 'center',
  },
  tasbihPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 52,
  },
  tasbihCount: {
    color: '#FFF',
    fontSize: sp(18),
    fontWeight: '700',
    lineHeight: sp(22),
  },
  tasbihReset: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: sp(9),
    lineHeight: sp(12),
    textAlign: 'center',
  },
});
