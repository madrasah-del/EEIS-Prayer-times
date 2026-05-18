import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Modal, Pressable, StyleSheet, Linking,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/theme';

const DONATE_URL      = 'https://givealittle.co/c/3eQ2G3VxeMY85q2rQE411U';
const ADMIN_CODE      = '348871';
const ADMIN_UNLOCKED_KEY = '@eeis_admin_unlocked';

type Props = {
  visible: boolean;
  onClose: () => void;
  onShare: () => void;
  onDonatePress: () => void;
  onAlertsPress: () => void;
  onHelpPress: () => void;
  onAdminPress: () => void;
  onNewsPress: () => void;
  fontsLoaded: boolean;
};

type MenuItem = {
  icon: string;
  label: string;
  sub?: string;
  onPress: () => void;
  danger?: boolean;
};

export function HamburgerMenu({ visible, onClose, onShare, onDonatePress, onAlertsPress, onHelpPress, onAdminPress, onNewsPress, fontsLoaded }: Props) {
  const bold = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;

  // Persistent admin unlock — once entered, stays as a menu item forever
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [passcodeVisible, setPasscodeVisible] = useState(false);
  const [passcodeInput,   setPasscodeInput]   = useState('');
  const [passcodeError,   setPasscodeError]   = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Load unlock state on mount
  useEffect(() => {
    AsyncStorage.getItem(ADMIN_UNLOCKED_KEY).then(val => {
      if (val === 'true') setAdminUnlocked(true);
    }).catch(() => {});
  }, []);

  function handleMenuTitlePress() {
    if (adminUnlocked) return; // already unlocked — title tap does nothing
    setPasscodeInput('');
    setPasscodeError(false);
    setPasscodeVisible(true);
    setTimeout(() => inputRef.current?.focus(), 200);
  }

  function handlePasscodeSubmit() {
    if (passcodeInput === ADMIN_CODE) {
      setPasscodeVisible(false);
      setPasscodeInput('');
      setPasscodeError(false);
      // Persist unlock so admin item appears from now on
      AsyncStorage.setItem(ADMIN_UNLOCKED_KEY, 'true').catch(() => {});
      setAdminUnlocked(true);
      onClose();
      onAdminPress();
    } else {
      setPasscodeError(true);
      setPasscodeInput('');
    }
  }

  const baseItems: MenuItem[] = [
    {
      icon: '💳',
      label: 'Donate Online',
      sub: 'Secure card payment via Give a Little',
      onPress: () => { onClose(); Linking.openURL(DONATE_URL); },
    },
    {
      icon: '🏦',
      label: 'Bank Transfer & Gift Aid',
      sub: 'Sort code, Gift Aid form & Standing Order',
      onPress: () => { onClose(); onDonatePress(); },
    },
    {
      icon: '🔔',
      label: 'Prayer Alerts & Sounds',
      sub: 'Set adhan, offset times & volumes',
      onPress: () => { onClose(); onAlertsPress(); },
    },
    {
      icon: '❓',
      label: 'Help & Guide',
      sub: 'How to use alerts, permissions & donate',
      onPress: () => { onClose(); onHelpPress(); },
    },
    {
      icon: '📰',
      label: 'News',
      sub: 'Islamic lectures, announcements & articles',
      onPress: () => { onClose(); onNewsPress(); },
    },
    {
      icon: '📤',
      label: 'Share App',
      sub: 'Send the Play Store link to friends & family',
      onPress: () => { onClose(); onShare(); },
    },
  ];

  // Admin item only appears after first successful passcode entry
  const items: MenuItem[] = adminUnlocked
    ? [
        ...baseItems,
        {
          icon: '🔒',
          label: 'Admin Panel',
          sub: 'Manage billboards & announcements',
          onPress: () => { onClose(); onAdminPress(); },
        },
      ]
    : baseItems;

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable style={styles.drawer} onPress={() => {}}>

            {/* Header — tap "Menu" to enter passcode (only when not yet unlocked) */}
            <View style={styles.drawerHeader}>
              <TouchableOpacity onPress={handleMenuTitlePress} activeOpacity={adminUnlocked ? 1 : 0.7}>
                <Text style={[styles.drawerTitle, { fontFamily: bold }]}>Menu</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                <Text style={[styles.closeText, { fontFamily: bold }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            {items.map((item, i) => (
              <TouchableOpacity
                key={i}
                style={styles.menuItem}
                onPress={item.onPress}
                activeOpacity={item.sub?.includes('Coming') ? 1 : 0.7}
              >
                <Text style={styles.menuIcon}>{item.icon}</Text>
                <View style={styles.menuTextCol}>
                  <Text style={[
                    styles.menuLabel,
                    { fontFamily: semi },
                    item.sub?.includes('Coming') && styles.menuLabelMuted,
                  ]}>
                    {item.label}
                  </Text>
                  {item.sub && (
                    <Text style={[styles.menuSub, { fontFamily: reg }]}>{item.sub}</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}

          </Pressable>
        </Pressable>
      </Modal>

      {/* Admin passcode modal — only shown until first successful entry */}
      <Modal
        visible={passcodeVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPasscodeVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.passcodeOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.passcodeOverlay} onPress={() => setPasscodeVisible(false)}>
            <Pressable style={styles.passcodeBox} onPress={() => {}}>
              <Text style={[styles.passcodeTitle, { fontFamily: bold }]}>Admin Access</Text>
              <Text style={[styles.passcodeSub, { fontFamily: reg }]}>Enter passcode to continue</Text>
              <TextInput
                ref={inputRef}
                style={[styles.passcodeInput, { fontFamily: reg }]}
                value={passcodeInput}
                onChangeText={t => { setPasscodeInput(t); setPasscodeError(false); }}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={8}
                placeholder="------"
                placeholderTextColor={Colors.inkMute}
                onSubmitEditing={handlePasscodeSubmit}
                returnKeyType="done"
              />
              {passcodeError && (
                <Text style={[styles.passcodeErrorText, { fontFamily: semi }]}>Incorrect passcode</Text>
              )}
              <View style={styles.passcodeButtons}>
                <TouchableOpacity
                  style={[styles.passcodeBtn, styles.passcodeBtnCancel]}
                  onPress={() => { setPasscodeVisible(false); setPasscodeInput(''); setPasscodeError(false); }}
                >
                  <Text style={[styles.passcodeBtnText, { fontFamily: semi, color: Colors.inkMute }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.passcodeBtn, styles.passcodeBtnConfirm]}
                  onPress={handlePasscodeSubmit}
                >
                  <Text style={[styles.passcodeBtnText, { fontFamily: semi, color: '#FFFFFF' }]}>Unlock</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    flexDirection: 'row',
  },
  drawer: {
    width: '72%',
    maxWidth: 300,
    backgroundColor: '#FFFFFF',
    paddingTop: 52,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 16,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  drawerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.maroonRed,
  },
  closeText: {
    fontSize: 17,
    color: Colors.inkMute,
  },
  divider: {
    height: 1,
    backgroundColor: '#E8E8E8',
    marginBottom: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  menuIcon: {
    fontSize: 22,
    width: 28,
    textAlign: 'center',
  },
  menuTextCol: { flex: 1 },
  menuLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.ink,
  },
  menuLabelMuted: { color: Colors.inkMute },
  menuSub: {
    fontSize: 12,
    color: Colors.inkMute,
    marginTop: 2,
  },

  // ── Admin passcode modal ────────────────────────────────────────────────────
  passcodeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  passcodeBox: {
    width: 300,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 12,
  },
  passcodeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.maroonRed,
    marginBottom: 4,
  },
  passcodeSub: {
    fontSize: 13,
    color: Colors.inkMute,
    marginBottom: 20,
  },
  passcodeInput: {
    width: '100%',
    height: 48,
    borderWidth: 1.5,
    borderColor: Colors.deepBlue,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 22,
    letterSpacing: 6,
    textAlign: 'center',
    color: Colors.ink,
    marginBottom: 8,
  },
  passcodeErrorText: {
    fontSize: 12,
    color: Colors.maroonRed,
    marginBottom: 4,
  },
  passcodeButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    width: '100%',
  },
  passcodeBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passcodeBtnCancel:  { backgroundColor: '#F0F0F0' },
  passcodeBtnConfirm: { backgroundColor: Colors.deepBlue },
  passcodeBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
