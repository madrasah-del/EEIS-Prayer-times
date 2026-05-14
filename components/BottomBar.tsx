import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal,
  StyleSheet, Pressable, Linking,
} from 'react-native';
import { Colors } from '../constants/theme';
import { sp } from '../constants/scaling';

const DONATE_URL = 'https://givealittle.co/c/3eQ2G3VxeMY85q2rQE411U';

type Props = {
  onCalendarPress: () => void;
  onAlertsPress: () => void;
  onQiblaPress: () => void;
  onBankTransferPress: () => void;
  fontsLoaded: boolean;
};

export function BottomBar({
  onCalendarPress, onAlertsPress, onQiblaPress, onBankTransferPress, fontsLoaded,
}: Props) {
  const [donateOpen, setDonateOpen] = useState(false);

  const bold = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;

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

        {/* Qibla */}
        <TouchableOpacity style={styles.tab} onPress={onQiblaPress} activeOpacity={0.75}>
          <Text style={styles.tabIcon}>🧭</Text>
          <Text style={[styles.tabLabel, { fontFamily: semi }]}>Qibla</Text>
        </TouchableOpacity>

      </View>

      {/* ── Donate choice modal ── */}
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

            <Text style={[styles.title, { fontFamily: bold }]}>Support EEIS</Text>
            <Text style={[styles.body, { fontFamily: reg }]}>
              JazakAllahu Khayran for your generosity. How would you like to donate?
            </Text>

            {/* Online donate */}
            <TouchableOpacity
              style={styles.onlineBtn}
              onPress={() => { setDonateOpen(false); Linking.openURL(DONATE_URL); }}
              activeOpacity={0.85}
            >
              <Text style={[styles.onlineBtnText, { fontFamily: bold }]}>💳  Donate Online</Text>
              <Text style={[styles.onlineBtnSub, { fontFamily: reg }]}>Secure card payment via Give a Little</Text>
            </TouchableOpacity>

            {/* Bank transfer */}
            <TouchableOpacity
              style={styles.bankBtn}
              onPress={() => { setDonateOpen(false); onBankTransferPress(); }}
              activeOpacity={0.85}
            >
              <Text style={[styles.bankBtnText, { fontFamily: bold }]}>🏦  Bank Transfer / Standing Order</Text>
              <Text style={[styles.bankBtnSub, { fontFamily: reg }]}>Sort code, account details & Gift Aid form</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setDonateOpen(false)} activeOpacity={0.8}>
              <Text style={[styles.cancelBtnText, { fontFamily: semi }]}>Cancel</Text>
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
    paddingBottom: 3,
    paddingTop: 3,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingVertical: 3,
  },
  tabIcon:    { fontSize: sp(18) },
  tabLabel:   { fontSize: sp(10), color: Colors.deepBlue,  fontWeight: '600', letterSpacing: 0.1 },
  tabIconRed: { fontSize: sp(18) },
  tabLabelRed:{ fontSize: sp(10), color: Colors.maroonRed, fontWeight: '600', letterSpacing: 0.1 },

  // ── Donate choice modal ───────────────────────────────────────────────────
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
    gap: 10,
  },
  closeBtn: { position: 'absolute', top: 14, right: 16, zIndex: 1 },
  closeBtnText: { fontSize: 16, color: Colors.inkMute, fontWeight: '700' },
  title: {
    fontSize: 18, fontWeight: '700', color: Colors.maroonRed,
    textAlign: 'center', paddingRight: 28,
  },
  body: {
    fontSize: 13, color: Colors.ink, textAlign: 'center', lineHeight: 19,
  },

  // Online button
  onlineBtn: {
    borderRadius: 12, backgroundColor: Colors.maroonRed,
    paddingVertical: 14, paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: Colors.maroonRed, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 6, elevation: 3,
  },
  onlineBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  onlineBtnSub:  { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },

  // Bank button
  bankBtn: {
    borderRadius: 12, backgroundColor: Colors.deepBlue,
    paddingVertical: 14, paddingHorizontal: 16,
    alignItems: 'center',
  },
  bankBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  bankBtnSub:  { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },

  // Cancel
  cancelBtn: {
    height: 40, borderRadius: 11, borderWidth: 1, borderColor: '#E0E0E0',
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { color: Colors.inkMute, fontSize: 14, fontWeight: '600' },
});
