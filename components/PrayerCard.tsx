import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing } from '../constants/theme';

// Shared time size (begins = jamaat) and 20% smaller than before (32→26)
const TIME_SIZE = 26;

type Props = {
  name: string;
  beginsTime?: string;
  jamaatTime?: string;
  singleTime?: string;
  singleLabel?: string;
  isNext: boolean;
  isFriday?: boolean;
  jummahTime1?: string;
  jummahTime2?: string;
  fontsLoaded: boolean;
};

export function PrayerCard({
  name, beginsTime, jamaatTime,
  singleTime, singleLabel,
  isNext, isFriday, jummahTime1, jummahTime2,
  fontsLoaded,
}: Props) {
  const bold = fontsLoaded ? 'Poppins_700Bold' : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular' : undefined;

  const isFridayDhuhr = isFriday && name === 'DHUHR';
  const displayName   = isFridayDhuhr ? 'JUMMAH' : name;

  return (
    <View style={[styles.card, isNext && styles.cardNext]}>

      {/* Prayer name */}
      <Text
        style={[styles.prayerName, isNext && styles.prayerNameNext, { fontFamily: semi }]}
        adjustsFontSizeToFit
        numberOfLines={1}
      >
        {displayName}
      </Text>

      {/* Shuruq — single time */}
      {singleTime !== undefined && (
        <>
          <Text style={[styles.label, isNext && styles.labelNext, { fontFamily: reg }]}>
            {singleLabel ?? 'Sunrise'}
          </Text>
          <Text style={[styles.timeText, isNext && styles.timeNext, { fontFamily: bold }]}>
            {singleTime}
          </Text>
        </>
      )}

      {/* Friday Jummah — vertical: 1st then 2nd */}
      {isFridayDhuhr && jummahTime1 !== undefined ? (
        <View style={styles.jummahBlock}>
          <View style={styles.jummahEntry}>
            <Text style={[styles.label, isNext && styles.labelNext, { fontFamily: reg }]}>1st</Text>
            <Text style={[styles.timeText, isNext && styles.timeNext, { fontFamily: bold }]}>
              {jummahTime1}
            </Text>
          </View>
          <View style={[styles.jummahDivider, isNext && styles.jummahDividerNext]} />
          <View style={styles.jummahEntry}>
            <Text style={[styles.label, isNext && styles.labelNext, { fontFamily: reg }]}>2nd</Text>
            <Text style={[styles.timeText, isNext && styles.timeNext, { fontFamily: bold }]}>
              {jummahTime2}
            </Text>
          </View>
        </View>
      ) : (
        /* Normal prayer — Begins + Jama'at, same font size */
        <>
          {beginsTime !== undefined && (
            <>
              <Text style={[styles.label, isNext && styles.labelNext, { fontFamily: reg }]}>
                Begins
              </Text>
              <Text style={[styles.timeText, styles.beginsColour, isNext && styles.beginsNext, { fontFamily: bold }]}>
                {beginsTime}
              </Text>
            </>
          )}
          {jamaatTime !== undefined && (
            <>
              <Text style={[styles.label, isNext && styles.labelNext, { fontFamily: reg, marginTop: 8 }]}>
                Jama'at
              </Text>
              <Text style={[styles.timeText, isNext && styles.timeNext, { fontFamily: bold }]}>
                {jamaatTime}
              </Text>
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing.xs,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    marginHorizontal: 3,
    minHeight: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  cardNext: {
    backgroundColor: Colors.bgNextPrayer,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  prayerName: {
    color: Colors.maroonRed,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: 4,
  },
  prayerNameNext: {
    color: Colors.freshGreen,
  },
  label: {
    color: Colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 1,
    textAlign: 'center',
  },
  labelNext: {
    color: 'rgba(255,255,255,0.6)',
  },
  // Begins and Jama'at share the same size
  timeText: {
    color: Colors.jamaatColor,
    fontSize: TIME_SIZE,
    fontWeight: '700',
    lineHeight: TIME_SIZE + 4,
    textAlign: 'center',
  },
  beginsColour: {
    color: Colors.beginsColor,
  },
  beginsNext: {
    color: Colors.nextCardGreen,
  },
  timeNext: {
    color: Colors.textWhite,
  },
  // Jummah vertical layout
  jummahBlock: {
    width: '100%',
    alignItems: 'stretch',
    gap: 4,
  },
  jummahEntry: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  jummahDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.sm,
  },
  jummahDividerNext: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
});
