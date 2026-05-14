import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';
import { sp } from '../constants/scaling';

type Props = {
  prayerName: string;
  remaining: string;
  fontsLoaded: boolean;
};

export function CountdownStrip({ prayerName, remaining, fontsLoaded }: Props) {
  const bold = fontsLoaded ? 'Poppins_700Bold' : undefined;

  return (
    <View style={styles.strip}>
      <ClockIcon />
      <Text
        style={[styles.text, { fontFamily: bold }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {'COUNTDOWN TO '}
        <Text style={styles.highlight}>{prayerName.toUpperCase()}</Text>
        {' · ' + remaining}
      </Text>
    </View>
  );
}

function ClockIcon() {
  return (
    <View style={styles.clockCircle}>
      <View style={[styles.hand, styles.hourHand]} />
      <View style={[styles.hand, styles.minuteHand]} />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    backgroundColor: Colors.freshGreen,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: sp(14),
    gap: 9,
    borderBottomWidth: 2,
    borderBottomColor: Colors.greenDark,
  },
  text: {
    flex: 1,
    color: Colors.maroonRed,
    fontSize: sp(17),
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  highlight: {
    fontSize: sp(19),
    fontWeight: '800',
  },
  clockCircle: {
    width: sp(16),
    height: sp(16),
    borderRadius: sp(8),
    borderWidth: 2,
    borderColor: Colors.maroonRed,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  hand: {
    position: 'absolute',
    backgroundColor: Colors.maroonRed,
    borderRadius: 1,
  },
  hourHand: {
    width: 1.5,
    height: 3.5,
    bottom: 6,
    left: 6.25,
    transform: [{ rotate: '45deg' }],
  },
  minuteHand: {
    width: 1.5,
    height: 4.5,
    bottom: 6,
    left: 6.25,
  },
});
