import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';

const { width: SCREEN_W } = Dimensions.get('window');
const TASBIH_BTN = Math.min(Math.round(SCREEN_W * 0.13), 56); // ~47dp on S20, cap 56
import { Colors } from '../constants/theme';
import { sp } from '../constants/scaling';

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
  fontScale?: number;
  /** Optional: tapping the prayer name shows the Hanafi rak'ah info modal */
  onNamePress?: () => void;
  /** Tasbih counter — only rendered on the Shuruq row */
  tasbihVisible?: boolean;
  tasbihCount?: number;
  onTasbihTap?: () => void;
};

export function PrayerRow({
  name, beginsTime, jamaatTime,
  singleLabel, isNext,
  isFriday, jummahTime1, jummahTime2,
  jamaatChanged,
  fontsLoaded,
  fontScale = 1.0,
  onNamePress,
  tasbihVisible = false,
  tasbihCount = 0,
  onTasbihTap,
}: Props) {
  const bold      = fontsLoaded ? 'Poppins_700Bold'      : undefined;
  const extraBold = fontsLoaded ? 'Poppins_800ExtraBold' : undefined;

  // Scaled sizes — sp() handles screen size, fontScale handles user preference
  const nameFS    = Math.round(sp(13) * fontScale);
  const nameLH    = Math.round(sp(17) * fontScale);
  const labelFS   = Math.round(sp(8)  * fontScale);
  const labelLH   = Math.round(sp(11) * fontScale);
  const timeFS    = Math.round(sp(19) * fontScale);
  const timeLH    = Math.round(sp(23) * fontScale);
  const nameWidth = Math.round(sp(75) * Math.min(fontScale, 1.4)); // cap width growth

  const isFridayDhuhr = isFriday && name === 'DHUHR';

  const bg             = isNext ? Colors.deepBlue : '#FFFFFF';
  const nameColor      = isNext ? Colors.freshGreen : Colors.maroonRed;
  const labelColor     = isNext ? 'rgba(255,255,255,0.8)' : Colors.inkMute;
  const beginsNumColor = isNext ? Colors.freshGreen : Colors.deepBlue;
  const jamaatNumColor = isNext ? '#FFFFFF' : Colors.deepBlue;

  // NOTE: no `adjustsFontSizeToFit` here. On Android it mis-measures the name column width
  // during re-layout (which happens every time the NEXT prayer changes) and collapses the
  // text far below `minimumFontScale` — that produced the random tiny prayer names. The
  // names are short and fit `nameCol` at full size, so fixed sizing is correct and stable.
  const nameEl = (
    <Text
      style={[styles.name, { color: nameColor, fontFamily: bold, fontSize: nameFS, lineHeight: nameLH }]}
      numberOfLines={1}
    >
      {isFridayDhuhr ? 'JUMMAH' : name}
    </Text>
  );

  // Wrap nameEl in a TouchableOpacity when onNamePress is provided
  const nameTappable = onNamePress ? (
    <TouchableOpacity onPress={onNamePress} activeOpacity={0.6}>
      {nameEl}
    </TouchableOpacity>
  ) : nameEl;

  // Jummah row
  if (isFridayDhuhr && jummahTime1) {
    return (
      <View style={[styles.row, { backgroundColor: bg, flex: 1 }]}>
        {isNext && <NextPill fontsLoaded={fontsLoaded} />}
        <View style={[styles.nameCol, { width: nameWidth }]}>{nameTappable}</View>
        <View style={styles.timeCol}>
          <Text style={[styles.colLabel, { color: labelColor, fontFamily: bold, fontSize: labelFS, lineHeight: labelLH }]}>1ST</Text>
          <Text style={[styles.timeNum, { color: jamaatNumColor, fontFamily: extraBold, fontSize: timeFS, lineHeight: timeLH }]}>{jummahTime1}</Text>
        </View>
        <View style={styles.timeCol}>
          <Text style={[styles.colLabel, { color: labelColor, fontFamily: bold, fontSize: labelFS, lineHeight: labelLH }]}>2ND</Text>
          <Text style={[styles.timeNum, { color: jamaatNumColor, fontFamily: extraBold, fontSize: timeFS, lineHeight: timeLH }]}>{jummahTime2}</Text>
        </View>
      </View>
    );
  }

  // Shuruq — single time + optional tasbih button
  if (!jamaatTime && beginsTime) {
    return (
      <View style={[styles.row, { backgroundColor: bg, flex: 1 }]}>
        <View style={[styles.nameCol, { width: nameWidth }]}>
          {nameTappable}
        </View>
        <View style={[styles.timeCol, { flex: 2 }]}>
          <Text style={[styles.colLabel, { color: labelColor, fontFamily: bold, fontSize: labelFS, lineHeight: labelLH }]}>SUNRISE</Text>
          <Text style={[styles.timeNum, { color: jamaatNumColor, fontFamily: extraBold, fontSize: timeFS, lineHeight: timeLH }]}>{beginsTime}</Text>
        </View>
        {tasbihVisible && (
          <TouchableOpacity
            style={styles.tasbihOuter}
            onPress={onTasbihTap}
            activeOpacity={0.75}
          >
            <View style={[styles.tasbihCircle, { width: TASBIH_BTN, height: TASBIH_BTN, borderRadius: TASBIH_BTN / 2 }]}>
              <Text style={[styles.tasbihCountText, { fontSize: tasbihCount >= 100 ? Math.round(TASBIH_BTN * 0.28) : Math.round(TASBIH_BTN * 0.36) }]}>
                {tasbihCount}
              </Text>
            </View>
            <Text style={styles.tasbihEmoji}>📿</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Maghrib — jamaat only
  if (!beginsTime && jamaatTime) {
    return (
      <View style={[styles.row, { backgroundColor: bg, flex: 1 }]}>
        {isNext && <NextPill fontsLoaded={fontsLoaded} />}
        <View style={[styles.nameCol, { width: nameWidth }]}>{nameTappable}</View>
        <View style={[styles.timeCol, { flex: 2 }]}>
          <Text style={[styles.colLabel, { color: labelColor, fontFamily: bold, fontSize: labelFS, lineHeight: labelLH }]}>JAMA'AT</Text>
          <Text style={[styles.timeNum, { color: jamaatNumColor, fontFamily: extraBold, fontSize: timeFS, lineHeight: timeLH }]}>{jamaatTime}</Text>
        </View>
      </View>
    );
  }

  // Standard — Begins + Jama'at
  return (
    <View style={[styles.row, { backgroundColor: bg, flex: 1 }]}>
      {isNext && <NextPill fontsLoaded={fontsLoaded} />}
      <View style={[styles.nameCol, { width: nameWidth }]}>{nameTappable}</View>
      <View style={styles.timeCol}>
        <Text style={[styles.colLabel, { color: labelColor, fontFamily: bold, fontSize: labelFS, lineHeight: labelLH }]}>BEGINS</Text>
        <Text style={[styles.timeNum, { color: beginsNumColor, fontFamily: extraBold, fontSize: timeFS, lineHeight: timeLH }]}>{beginsTime}</Text>
      </View>
      <View style={styles.timeCol}>
        <Text style={[styles.colLabel, { color: labelColor, fontFamily: bold, fontSize: labelFS, lineHeight: labelLH }]}>JAMA'AT</Text>
        <View style={[styles.timeNumWrap, jamaatChanged && styles.timeNumWrapChanged]}>
          {jamaatChanged && (
            <View style={styles.newTag}>
              <Text style={[styles.newTagText, { fontFamily: bold }]}>NEW</Text>
            </View>
          )}
          <Text style={[styles.timeNum, { color: jamaatNumColor, fontFamily: extraBold, fontSize: timeFS, lineHeight: timeLH }]}>{jamaatTime}</Text>
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
    borderRadius: 9,
    paddingHorizontal: 8,
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
    fontSize: sp(9),
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  nameCol: {
    width: sp(75),
    flexShrink: 0,
    justifyContent: 'center',
  },
  name: {
    fontSize: sp(13),
    fontWeight: '700',
    letterSpacing: 0.1,
    lineHeight: sp(17),
  },
  timeCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colLabel: {
    fontSize: sp(8),
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    lineHeight: sp(11),
  },
  timeNum: {
    fontSize: sp(19),
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: sp(23),
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
    fontSize: sp(8),
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  tasbihOuter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingRight: 4,
    paddingLeft: 2,
  },
  tasbihEmoji: {
    fontSize: sp(16),
  },
  tasbihCircle: {
    backgroundColor: '#0B5EA8', // deepBlue
    alignItems: 'center',
    justifyContent: 'center',
  },
  tasbihCountText: {
    color: '#FFFFFF',
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});
