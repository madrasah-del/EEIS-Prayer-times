import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';

// Rows use flex:1 so they share available space equally (height set in App)

type Props = {
  name: string;
  beginsTime?: string;
  jamaatTime?: string;
  singleLabel?: string;
  isNext: boolean;
  isFriday?: boolean;
  jummahTime1?: string;
  jummahTime2?: string;
  jamaatChanged?: boolean;
  fontsLoaded: boolean;
};

export function PrayerRow({
  name, beginsTime, jamaatTime,
  singleLabel, isNext,
  isFriday, jummahTime1, jummahTime2,
  jamaatChanged,
  fontsLoaded,
}: Props) {
  const bold      = fontsLoaded ? 'Poppins_700Bold'      : undefined;
  const extraBold = fontsLoaded ? 'Poppins_800ExtraBold' : undefined;
  const reg       = fontsLoaded ? 'Poppins_400Regular'   : undefined;

  const isFridayDhuhr = isFriday && name === 'DHUHR';
  const displayName   = isFridayDhuhr ? 'JUMMAH' : name;

  const bg             = isNext ? Colors.deepBlue : '#FFFFFF';
  const nameColor      = isNext ? Colors.freshGreen : Colors.maroonRed;
  const labelColor     = isNext ? 'rgba(255,255,255,0.8)' : Colors.inkMute;
  const beginsNumColor = isNext ? Colors.freshGreen : Colors.deepBlue;
  const jamaatNumColor = isNext ? '#FFFFFF' : Colors.deepBlue;

  const nameEl = (
    <Text
      style={[styles.name, { color: nameColor, fontFamily: bold }]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.95}
    >
      {displayName}
    </Text>
  );

  // Jummah row
  if (isFridayDhuhr && jummahTime1) {
    return (
      <View style={[styles.row, { backgroundColor: bg, flex: 1 }]}>
        {isNext && <NextPill fontsLoaded={fontsLoaded} />}
        <View style={styles.nameCol}>{nameEl}</View>
        <View style={styles.timeCol}>
          <Text style={[styles.colLabel, { color: labelColor, fontFamily: bold }]}>1ST</Text>
          <Text style={[styles.timeNum, { color: jamaatNumColor, fontFamily: extraBold }]}>{jummahTime1}</Text>
        </View>
        <View style={styles.timeCol}>
          <Text style={[styles.colLabel, { color: labelColor, fontFamily: bold }]}>2ND</Text>
          <Text style={[styles.timeNum, { color: jamaatNumColor, fontFamily: extraBold }]}>{jummahTime2}</Text>
        </View>
      </View>
    );
  }

  // Shuruq — single time
  if (!jamaatTime && beginsTime) {
    return (
      <View style={[styles.row, { backgroundColor: bg, flex: 1 }]}>
        <View style={styles.nameCol}>{nameEl}</View>
        <View style={[styles.timeCol, { flex: 2 }]}>
          <Text style={[styles.colLabel, { color: labelColor, fontFamily: bold }]}>SUNRISE</Text>
          <Text style={[styles.timeNum, { color: jamaatNumColor, fontFamily: extraBold }]}>{beginsTime}</Text>
        </View>
      </View>
    );
  }

  // Maghrib — jamaat only
  if (!beginsTime && jamaatTime) {
    return (
      <View style={[styles.row, { backgroundColor: bg, flex: 1 }]}>
        {isNext && <NextPill fontsLoaded={fontsLoaded} />}
        <View style={styles.nameCol}>{nameEl}</View>
        <View style={[styles.timeCol, { flex: 2 }]}>
          <Text style={[styles.colLabel, { color: labelColor, fontFamily: bold }]}>JAMA'AT</Text>
          <Text style={[styles.timeNum, { color: jamaatNumColor, fontFamily: extraBold }]}>{jamaatTime}</Text>
        </View>
      </View>
    );
  }

  // Standard — Begins + Jama'at
  return (
    <View style={[styles.row, { backgroundColor: bg, flex: 1 }]}>
      {isNext && <NextPill fontsLoaded={fontsLoaded} />}
      <View style={styles.nameCol}>{nameEl}</View>
      <View style={styles.timeCol}>
        <Text style={[styles.colLabel, { color: labelColor, fontFamily: bold }]}>BEGINS</Text>
        <Text style={[styles.timeNum, { color: beginsNumColor, fontFamily: extraBold }]}>{beginsTime}</Text>
      </View>
      <View style={styles.timeCol}>
        <Text style={[styles.colLabel, { color: labelColor, fontFamily: bold }]}>JAMA'AT</Text>
        <View style={[styles.timeNumWrap, jamaatChanged && styles.timeNumWrapChanged]}>
          {jamaatChanged && (
            <View style={styles.newTag}>
              <Text style={[styles.newTagText, { fontFamily: bold }]}>NEW</Text>
            </View>
          )}
          <Text style={[styles.timeNum, { color: jamaatNumColor, fontFamily: extraBold }]}>{jamaatTime}</Text>
        </View>
      </View>
    </View>
  );
}

function NextPill({ fontsLoaded }: { fontsLoaded: boolean }) {
  const bold = fontsLoaded ? 'Poppins_700Bold' : undefined;
  return (
    <View style={styles.nextPill}>
      <Text style={[styles.nextPillText, { fontFamily: bold }]}>NEXT</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 3,
    elevation: 2,
    position: 'relative',
    overflow: 'visible',
  },
  nextPill: {
    position: 'absolute',
    top: -7,
    left: 10,
    backgroundColor: Colors.freshGreen,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    zIndex: 1,
  },
  nextPillText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  nameCol: {
    width: 110,
    flexShrink: 0,
    justifyContent: 'center',
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.1,
    lineHeight: 19,
  },
  timeCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    lineHeight: 12,
  },
  timeNum: {
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 25,
  },
  timeNumWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    position: 'relative',
  },
  timeNumWrapChanged: {
    borderWidth: 2,
    borderColor: Colors.maroonRed,
  },
  newTag: {
    position: 'absolute',
    // Sit in the top-right corner of the border box, clear of the JAMA'AT label
    bottom: -8,
    right: -8,
    backgroundColor: Colors.maroonRed,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    zIndex: 2,
  },
  newTagText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
});
