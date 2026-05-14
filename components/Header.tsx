import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../constants/theme';
import { sp } from '../constants/scaling';

type Props = {
  clockText: string;
  fontsLoaded: boolean;
  onHamburgerPress: () => void;
};

export function Header({ clockText, fontsLoaded, onHamburgerPress }: Props) {
  const bold      = fontsLoaded ? 'Poppins_700Bold'      : undefined;
  const extraBold = fontsLoaded ? 'Poppins_800ExtraBold' : undefined;

  return (
    <View style={styles.container}>

      {/* ── Hamburger (left) ── */}
      <TouchableOpacity style={styles.iconBtn} onPress={onHamburgerPress} activeOpacity={0.7}>
        <Text style={styles.iconBtnText}>☰</Text>
      </TouchableOpacity>

      {/* ── Logo badge (centre, flexible) ── */}
      <View style={styles.logoBadge}>
        <Image
          source={require('../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.wordmark}>
          <Text
            style={[styles.orgName, { fontFamily: bold }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            EPSOM &amp; EWELL
          </Text>
          <View style={styles.subRow}>
            <View style={styles.dash} />
            <Text
              style={[styles.orgSub, { fontFamily: extraBold }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.4}
            >
              ISLAMIC SOCIETY
            </Text>
            <View style={styles.dash} />
          </View>
        </View>
      </View>

      {/* ── Clock (right) ── */}
      <Text style={[styles.clock, { fontFamily: bold }]}>{clockText}</Text>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 3,
    borderBottomColor: Colors.freshGreen,
    paddingVertical: sp(13),
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  iconBtn: {
    width: sp(36),
    height: sp(36),
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconBtnText: {
    fontSize: sp(22),
    color: Colors.deepBlue,
    lineHeight: sp(24),
  },

  logoBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.deepBlue,
    paddingLeft: 6,
    paddingRight: 10,
    paddingVertical: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  logo: {
    width: sp(46),
    height: sp(46),
    flexShrink: 0,
  },
  wordmark: {
    flex: 1,
    minWidth: 0,
  },
  orgName: {
    color: Colors.maroonRed,
    fontSize: sp(19),
    fontWeight: '700',
    letterSpacing: 0.1,
    lineHeight: sp(23),
    textAlign: 'center',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 2,
  },
  dash: {
    width: 10,
    height: 1.5,
    backgroundColor: Colors.maroonRed,
    flexShrink: 0,
  },
  orgSub: {
    color: Colors.maroonRed,
    fontSize: sp(10),
    fontWeight: '800',
    letterSpacing: 1.0,
    flexShrink: 1,
    textAlign: 'center',
  },

  clock: {
    color: Colors.freshGreen,
    fontSize: sp(30),
    fontWeight: '700',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
});
