import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing } from '../constants/theme';
import type { NextPrayer } from '../hooks/usePrayerTimes';

type Props = {
  next: NextPrayer | null;
  fontsLoaded: boolean;
};

export function ProgressBar({ next, fontsLoaded }: Props) {
  const pct = next?.progress ?? 0;
  const bold = fontsLoaded ? 'Poppins_700Bold' : undefined;

  const label = next
    ? next.minutesUntil >= 60
      ? `${Math.floor(next.minutesUntil / 60)}h ${next.minutesUntil % 60}m to ${next.name}`
      : `${next.minutesUntil} min to ${next.name}`
    : '...';

  return (
    <View style={styles.container}>
      <Text style={styles.hourglass}>⏳</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` as any }]} />
      </View>
      <Text style={[styles.countdown, { fontFamily: bold }]}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    gap: Spacing.sm,
    backgroundColor: Colors.bgHeader,
    borderTopWidth: 3,
    borderTopColor: Colors.freshGreen,
  },
  hourglass: {
    fontSize: 16,
  },
  track: {
    flex: 1,
    height: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1.5,
    borderColor: Colors.freshGreen,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: Colors.freshGreen,
    borderRadius: 3,
  },
  countdown: {
    color: Colors.freshGreen,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    flexShrink: 1,
    textAlign: 'right',
  },
});
