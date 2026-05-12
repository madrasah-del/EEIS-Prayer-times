import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../constants/theme';

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
            <Text style={[styles.orgSub, { fontFamily: extraBold }]} numberOfLines={1}>
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
    paddingVertical: 9,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  // Hamburger button (left)
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconBtnText: {
    fontSize: 22,
    color: Colors.deepBlue,
    lineHeight: 24,
  },

  // Logo badge (centre, grows to fill space)
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
    width: 40,
    height: 40,
    flexShrink: 0,
  },
  wordmark: {
    flexShrink: 1,
    minWidth: 0,
  },
  orgName: {
    color: Colors.maroonRed,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.1,
    lineHeight: 22,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  dash: {
    width: 8,
    height: 1.5,
    backgroundColor: Colors.maroonRed,
    flexShrink: 0,
  },
  orgSub: {
    color: Colors.maroonRed,
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 1.5,
    flexShrink: 1,
  },

  clock: {
    color: Colors.freshGreen,
    fontSize: 27,
    fontWeight: '700',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
});
