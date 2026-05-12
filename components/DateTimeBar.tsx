import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';

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
};

export function DateTimeBar({ viewDate, hijri, onPress, fontsLoaded }: Props) {
  const bold = fontsLoaded ? 'Poppins_700Bold' : undefined;

  const dayName   = DAYS[viewDate.getDay()];
  const gregDay   = viewDate.getDate();
  const gregMonth = GREG_MONTHS[viewDate.getMonth()];
  const gregYear  = viewDate.getFullYear();

  return (
    // Tappable — opens calendar picker
    <TouchableOpacity style={styles.bar} onPress={onPress} activeOpacity={0.85}>
      <Text style={[styles.gregText, { fontFamily: bold }]} numberOfLines={1}>
        {dayName}, {gregDay} {gregMonth} {gregYear}
      </Text>
      {hijri && (
        <Text style={[styles.hijriText, { fontFamily: bold }]} numberOfLines={1}>
          {hijri.day} {hijri.month} {hijri.year}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: Colors.blueDeep,
    flexDirection: 'column',
    paddingHorizontal: 18,
    // -10% from original 10px → 9px, two-line so a little extra for the second row
    paddingVertical: 7,
    gap: 2,
  },
  gregText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 25,
  },
  hijriText: {
    color: Colors.freshGreen,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 25,
  },
});
