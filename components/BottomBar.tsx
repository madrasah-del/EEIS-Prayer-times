import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, Alert,
  StyleSheet, Pressable, Linking,
} from 'react-native';
import { Colors } from '../constants/theme';

const DONATE_URL = 'https://givealittle.co/c/3eQ2G3VxeMY85q2rQE411U';

type Props = {
  onCalendarPress: () => void;
  onAlertsPress: () => void;
  fontsLoaded: boolean;
};

export function BottomBar({ onCalendarPress, onAlertsPress, fontsLoaded }: Props) {
  const [donateOpen, setDonateOpen] = useState(false);

  const bold = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;

  const handleDonateConfirm = () => {
    setDonateOpen(false);
    Linking.openURL(DONATE_URL);
  };

  const handleSettings = () => {
    Alert.alert('Work in Progress', 'Settings are coming in a future update.');
  };

  return (
    <>
      {/* ── Tab bar ── */}
      <View style={styles.bar}>

        {/* Calendar */}
        <TouchableOpacity style={styles.tab} onPress={onCalendarPress} activeOpacity={0.75}>
          <Text style={styles.tabIcon}>🗓</Text>
          <Text style={[styles.tabLabel, { fontFamily: semi }]}>Calendar</Text>
        </TouchableOpacity>

        {/* Alerts */}
        <TouchableOpacity style={styles.tab} onPress={onAlertsPress} activeOpacity={0.75}>
          <Text style={styles.tabIcon}>🔔</Text>
          <Text style={[styles.tabLabel, { fontFamily: semi }]}>Alerts</Text>
        </TouchableOpacity>

        {/* Donate */}
        <TouchableOpacity style={styles.tab} onPress={() => setDonateOpen(true)} activeOpacity={0.75}>
          <Text style={styles.tabIconRed}>❤️</Text>
          <Text style={[styles.tabLabelRed, { fontFamily: semi }]}>Donate</Text>
        </TouchableOpacity>

        {/* Settings */}
        <TouchableOpacity style={styles.tab} onPress={handleSettings} activeOpacity={0.75}>
          <Text style={styles.tabIcon}>⚙️</Text>
          <Text style={[styles.tabLabel, { fontFamily: semi }]}>Settings</Text>
        </TouchableOpacity>

      </View>

      {/* ── Donate confirmation modal ── */}
      <Modal visible={donateOpen} transparent animationType="fade" onRequestClose={() => setDonateOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setDonateOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setDonateOpen(false)}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <Text style={[styles.closeBtnText, { fontFamily: bold }]}>✕</Text>
            </TouchableOpacity>

            <Text
              style={[styles.title, { fontFamily: bold }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              Would you like to donate?
            </Text>

            <Text style={[styles.body, { fontFamily: reg }]}>
              {'\n'}You will be forwarded to our{' '}
              <Text style={{ fontFamily: semi, color: Colors.maroonRed }}>Give a Little</Text>
              {' '}collection website to process your donation. Thank You.
            </Text>

            <TouchableOpacity style={styles.confirmBtn} onPress={handleDonateConfirm} activeOpacity={0.85}>
              <Text style={[styles.confirmBtnText, { fontFamily: bold }]}>Yes, Take Me There</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setDonateOpen(false)} activeOpacity={0.8}>
              <Text style={[styles.cancelBtnText, { fontFamily: semi }]}>Cancel — Go Back to App</Text>
            </TouchableOpacity>

          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // ── Tab bar ───────────────────────────────────────────────────────────────
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
    paddingBottom: 6,
    paddingTop: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  tabIcon: {
    fontSize: 22,
  },
  tabLabel: {
    fontSize: 11,
    color: Colors.deepBlue,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  // Donate tab — red accent
  tabIconRed: {
    fontSize: 22,
  },
  tabLabelRed: {
    fontSize: 11,
    color: Colors.maroonRed,
    fontWeight: '600',
    letterSpacing: 0.1,
  },

  // ── Donate modal ──────────────────────────────────────────────────────────
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(11,30,60,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    width: '100%',
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 20,
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 16,
    zIndex: 1,
  },
  closeBtnText: {
    fontSize: 16,
    color: Colors.inkMute,
    fontWeight: '700',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.maroonRed,
    textAlign: 'center',
    paddingRight: 28,
  },
  body: {
    fontSize: 14,
    color: Colors.ink,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
  },
  confirmBtn: {
    height: 52,
    borderRadius: 11,
    backgroundColor: Colors.maroonRed,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: Colors.maroonRed,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  cancelBtn: {
    height: 46,
    borderRadius: 11,
    backgroundColor: Colors.deepBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
