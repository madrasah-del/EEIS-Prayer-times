import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Modal, Pressable, StyleSheet, Linking,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { secureSet, PASS_SECURE_KEY, PASS_LEGACY_KEY } from '../data/secureStore';
import { Colors } from '../constants/theme';
import { BUILD_VERSION, RELEASE_DATE } from '../constants/buildInfo';

const DONATE_URL         = 'https://givealittle.co/c/3eQ2G3VxeMY85q2rQE411U';
// v2: bumped so every admin re-enters the shared passphrase once on v56 — this
// captures the passphrase (@eeis_admin_pass) needed to SIGN billboard saves.
const ADMIN_UNLOCKED_KEY = '@eeis_admin_unlocked_v2';
const ADMIN_PASS_KEY     = '@eeis_admin_pass';   // shared passphrase, stored on unlock (for signing)

// SHA-256 of the shared admin passphrase. The passphrase itself is NOT in the app —
// only this one-way hash. Entering the correct passphrase (verified by hashing) unlocks
// admin and is stored locally so the admin panel can sign billboard configs.
const ADMIN_PASS_SHA256  = 'd34a3b35fcb95401c65ecf7efa1a17ff56f738a97f1ac88f8778ff618e9851f2';
const ADMIN_HINT         = 'Hint: one of our standard passwords';

type Props = {
  visible: boolean;
  onClose: () => void;
  onShare: () => void;
  onDonatePress: () => void;
  onAlertsPress: () => void;
  onHelpPress: () => void;
  onAdminPress: () => void;
  fontsLoaded: boolean;
};

type MenuItem = {
  icon: string;
  label: string;
  sub?: string;
  onPress: () => void;
  danger?: boolean;
};

export function HamburgerMenu({ visible, onClose, onShare, onDonatePress, onAlertsPress, onHelpPress, onAdminPress, fontsLoaded }: Props) {
  const bold = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;

  // Persistent admin unlock
  const [adminUnlocked,  setAdminUnlocked]  = useState(false);
  const [donateExpanded, setDonateExpanded] = useState(false);

  // Admin passphrase modal state
  const [passcodeVisible, setPasscodeVisible] = useState(false);
  const [passcodeInput,   setPasscodeInput]   = useState('');
  const [passcodeError,   setPasscodeError]   = useState('');
  const [wrongCount,      setWrongCount]      = useState(0);
  const inputRef = useRef<TextInput>(null);

  // Load unlock state on mount
  useEffect(() => {
    AsyncStorage.getItem(ADMIN_UNLOCKED_KEY).then(val => {
      if (val === 'true') setAdminUnlocked(true);
    }).catch(() => {});
  }, []);

  function handleMenuTitlePress() {
    if (adminUnlocked) return;
    setPasscodeInput('');
    setPasscodeError('');
    setWrongCount(0);
    setPasscodeVisible(true);
    setTimeout(() => inputRef.current?.focus(), 200);
  }

  async function handlePasscodeSubmit() {
    const entered = passcodeInput.trim();
    if (!entered) return;
    // Verify by hashing — the passphrase itself is never stored in the app
    const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, entered);
    if (hash === ADMIN_PASS_SHA256) {
      // Correct — unlock + store the passphrase in SecureStore (Keystore/Keychain) so the
      // admin panel can sign configs. v74: was plain AsyncStorage; now hardware-backed.
      await AsyncStorage.setItem(ADMIN_UNLOCKED_KEY, 'true').catch(() => {});
      await secureSet(PASS_SECURE_KEY, entered, PASS_LEGACY_KEY);
      setAdminUnlocked(true);
      setPasscodeVisible(false);
      setPasscodeInput('');
      onClose();
      onAdminPress();
    } else {
      const n = wrongCount + 1;
      setWrongCount(n);
      setPasscodeInput('');
      setPasscodeError(n >= 3 ? ADMIN_HINT : 'Incorrect passphrase');
    }
  }

  // Base menu items in requested order — donate is handled separately (expandable)
  const baseItems: MenuItem[] = [
    {
      icon: '🔔',
      label: 'Prayer Alerts & Sounds',
      sub: 'Set adhan, offset times & volumes',
      onPress: () => { onClose(); onAlertsPress(); },
    },
    {
      icon: '📤',
      label: 'Share the App',
      sub: 'Send the Play Store link to friends & family',
      onPress: () => { onClose(); onShare(); },
    },
    {
      icon: '❓',
      label: 'Help & Guide',
      sub: 'How to use alerts, permissions & donate',
      onPress: () => { onClose(); onHelpPress(); },
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

            {/* Prayer Alerts — first item */}
            {items.slice(0, 1).map((item, i) => (
              <TouchableOpacity key={i} style={styles.menuItem} onPress={item.onPress} activeOpacity={0.7}>
                <Text style={styles.menuIcon}>{item.icon}</Text>
                <View style={styles.menuTextCol}>
                  <Text style={[styles.menuLabel, { fontFamily: semi }]}>{item.label}</Text>
                  {item.sub && <Text style={[styles.menuSub, { fontFamily: reg }]}>{item.sub}</Text>}
                </View>
              </TouchableOpacity>
            ))}

            {/* Donate to EEIS — expandable */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setDonateExpanded(e => !e)}
              activeOpacity={0.7}
            >
              <Text style={styles.menuIcon}>🤲</Text>
              <View style={styles.menuTextCol}>
                <Text style={[styles.menuLabel, { fontFamily: semi }]}>Donate to EEIS</Text>
                <Text style={[styles.menuSub, { fontFamily: reg }]}>
                  Support your local masjid
                </Text>
              </View>
              <Text style={[styles.menuChevron, { fontFamily: bold }]}>
                {donateExpanded ? '▾' : '›'}
              </Text>
            </TouchableOpacity>

            {donateExpanded && (
              <View style={styles.donateSubMenu}>
                <TouchableOpacity
                  style={styles.donateSubItem}
                  onPress={() => { onClose(); onDonatePress(); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.menuIcon}>🏦</Text>
                  <View style={styles.menuTextCol}>
                    <Text style={[styles.menuLabel, { fontFamily: semi, fontSize: 13 }]}>Bank Transfer & Gift Aid</Text>
                    <Text style={[styles.menuSub, { fontFamily: reg }]}>Sort code, Gift Aid form & Standing Order</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.donateSubItem}
                  onPress={() => { onClose(); Linking.openURL(DONATE_URL); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.menuIcon}>💳</Text>
                  <View style={styles.menuTextCol}>
                    <Text style={[styles.menuLabel, { fontFamily: semi, fontSize: 13 }]}>Donate Online</Text>
                    <Text style={[styles.menuSub, { fontFamily: reg }]}>Secure card payment via Give a Little</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* Remaining items (Share, Help, Admin) */}
            {items.slice(1).map((item, i) => (
              <TouchableOpacity key={i + 1} style={styles.menuItem} onPress={item.onPress} activeOpacity={0.7}>
                <Text style={styles.menuIcon}>{item.icon}</Text>
                <View style={styles.menuTextCol}>
                  <Text style={[styles.menuLabel, { fontFamily: semi }]}>{item.label}</Text>
                  {item.sub && <Text style={[styles.menuSub, { fontFamily: reg }]}>{item.sub}</Text>}
                </View>
              </TouchableOpacity>
            ))}

            {/* Version footer */}
            <View style={styles.versionFooter}>
              <Text style={[styles.versionText, { fontFamily: reg }]}>{BUILD_VERSION} · {RELEASE_DATE}</Text>
            </View>

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
              <Text style={[styles.passcodeSub, { fontFamily: reg }]}>
                Enter the shared admin passphrase to continue
              </Text>

              <TextInput
                ref={inputRef}
                style={[styles.passcodeInput, { fontFamily: reg }]}
                value={passcodeInput}
                onChangeText={t => { setPasscodeInput(t); setPasscodeError(''); }}
                secureTextEntry
                maxLength={64}
                placeholder="Passphrase"
                placeholderTextColor={Colors.inkMute}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handlePasscodeSubmit}
              />

              {!!passcodeError && (
                <Text style={[styles.passcodeErrorText, { fontFamily: semi }]}>{passcodeError}</Text>
              )}

              <View style={styles.passcodeButtons}>
                <TouchableOpacity
                  style={[styles.passcodeBtn, styles.passcodeBtnCancel]}
                  onPress={() => { setPasscodeVisible(false); setPasscodeInput(''); setPasscodeError(''); }}
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
  menuChevron: {
    fontSize: 18,
    color: Colors.inkMute,
    marginLeft: 4,
  },
  donateSubMenu: {
    backgroundColor: '#F8F8F8',
    borderLeftWidth: 3,
    borderLeftColor: Colors.deepBlue,
    marginLeft: 20,
    marginBottom: 4,
  },
  donateSubItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  versionFooter: {
    marginTop: 'auto',
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 4,
    alignItems: 'center',
  },
  versionText: {
    fontSize: 11,
    color: Colors.inkMute,
    letterSpacing: 0.3,
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
    paddingHorizontal: 14,
    fontSize: 16,            // sized for an alphanumeric passphrase (visible on small screens)
    letterSpacing: 1,
    textAlign: 'left',
    color: Colors.ink,
    marginBottom: 8,
  },
  passcodeErrorText: {
    fontSize: 12,
    color: Colors.maroonRed,
    marginBottom: 4,
    textAlign: 'center',
  },
  passcodeForgot: {
    fontSize: 12,
    color: Colors.deepBlue,
    textAlign: 'center',
    textDecorationLine: 'underline',
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
