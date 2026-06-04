import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Modal, Pressable, StyleSheet, Linking,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/theme';
import { BUILD_VERSION, RELEASE_DATE } from '../constants/buildInfo';

const DONATE_URL         = 'https://givealittle.co/c/3eQ2G3VxeMY85q2rQE411U';
const ADMIN_UNLOCKED_KEY = '@eeis_admin_unlocked';
const ADMIN_PASSWORD_KEY = '@eeis_admin_password_v1';   // password set by admin on first use
const ADMIN_RESET_CODE_KEY = '@eeis_admin_reset_code';  // 6-digit OTP for reset
const ADMIN_RESET_EXPIRY_KEY = '@eeis_admin_reset_expiry';
const ADMIN_RESET_EMAIL = 'madrasah@eeis.co.uk';        // email for magic-link reset
const ADMIN_RESET_TTL_MS = 30 * 60 * 1000;             // 30-minute OTP expiry

function generate6DigitCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

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

  // Admin password modal state
  const [passcodeVisible, setPasscodeVisible] = useState(false);
  const [passcodeMode,    setPasscodeMode]    = useState<'enter' | 'set' | 'reset'>('enter');
  const [passcodeInput,   setPasscodeInput]   = useState('');
  const [passcodeConfirm, setPasscodeConfirm] = useState('');
  const [passcodeError,   setPasscodeError]   = useState('');
  const [adminPasswordSet, setAdminPasswordSet] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Load unlock + password state on mount
  useEffect(() => {
    AsyncStorage.getItem(ADMIN_UNLOCKED_KEY).then(val => {
      if (val === 'true') setAdminUnlocked(true);
    }).catch(() => {});
    AsyncStorage.getItem(ADMIN_PASSWORD_KEY).then(pwd => {
      setAdminPasswordSet(!!pwd);
    }).catch(() => {});
  }, []);

  function handleMenuTitlePress() {
    if (adminUnlocked) return;
    setPasscodeInput('');
    setPasscodeConfirm('');
    setPasscodeError('');
    setPasscodeMode(adminPasswordSet ? 'enter' : 'set');
    setPasscodeVisible(true);
    setTimeout(() => inputRef.current?.focus(), 200);
  }

  async function handlePasscodeSubmit() {
    if (passcodeMode === 'set') {
      // First-use: set a new password
      if (passcodeInput.length < 4) { setPasscodeError('Password must be at least 4 characters'); return; }
      if (passcodeInput !== passcodeConfirm) { setPasscodeError('Passwords do not match'); return; }
      await AsyncStorage.setItem(ADMIN_PASSWORD_KEY, passcodeInput).catch(() => {});
      await AsyncStorage.setItem(ADMIN_UNLOCKED_KEY, 'true').catch(() => {});
      setAdminPasswordSet(true);
      setAdminUnlocked(true);
      setPasscodeVisible(false);
      onClose();
      onAdminPress();

    } else if (passcodeMode === 'enter') {
      // Check password
      const stored = await AsyncStorage.getItem(ADMIN_PASSWORD_KEY).catch(() => null);
      if (passcodeInput === stored) {
        await AsyncStorage.setItem(ADMIN_UNLOCKED_KEY, 'true').catch(() => {});
        setAdminUnlocked(true);
        setPasscodeVisible(false);
        onClose();
        onAdminPress();
      } else {
        setPasscodeError('Incorrect password');
        setPasscodeInput('');
      }

    } else if (passcodeMode === 'reset') {
      // Validate reset code
      const storedCode   = await AsyncStorage.getItem(ADMIN_RESET_CODE_KEY).catch(() => null);
      const storedExpiry = await AsyncStorage.getItem(ADMIN_RESET_EXPIRY_KEY).catch(() => null);
      if (!storedCode || !storedExpiry) { setPasscodeError('No reset code found. Request a new one.'); return; }
      if (Date.now() > Number(storedExpiry)) { setPasscodeError('Reset code expired. Request a new one.'); return; }
      if (passcodeInput.trim() !== storedCode) { setPasscodeError('Incorrect reset code'); return; }
      // Code valid — let them set a new password
      await AsyncStorage.removeItem(ADMIN_RESET_CODE_KEY).catch(() => {});
      await AsyncStorage.removeItem(ADMIN_RESET_EXPIRY_KEY).catch(() => {});
      setPasscodeMode('set');
      setPasscodeInput('');
      setPasscodeConfirm('');
      setPasscodeError('Code verified! Set your new password below.');
    }
  }

  async function handleForgotPassword() {
    const code = generate6DigitCode();
    const expiry = Date.now() + ADMIN_RESET_TTL_MS;
    await AsyncStorage.setItem(ADMIN_RESET_CODE_KEY, code).catch(() => {});
    await AsyncStorage.setItem(ADMIN_RESET_EXPIRY_KEY, String(expiry)).catch(() => {});
    const subject = encodeURIComponent('EEIS Admin Reset Code');
    const body = encodeURIComponent(
      `Your EEIS Admin reset code is: ${code}\n\nThis code expires in 30 minutes.\n\nDo not share this code with anyone.`
    );
    Linking.openURL(`mailto:${ADMIN_RESET_EMAIL}?subject=${subject}&body=${body}`).catch(() => {});
    setPasscodeMode('reset');
    setPasscodeInput('');
    setPasscodeError(`Reset code sent to ${ADMIN_RESET_EMAIL}. Check that email, then enter the code below.`);
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
              <Text style={[styles.passcodeTitle, { fontFamily: bold }]}>
                {passcodeMode === 'set' ? 'Set Admin Password'
                  : passcodeMode === 'reset' ? 'Enter Reset Code'
                  : 'Admin Access'}
              </Text>
              <Text style={[styles.passcodeSub, { fontFamily: reg }]}>
                {passcodeMode === 'set' ? 'Choose a password (min 4 characters). Keep it safe.'
                  : passcodeMode === 'reset' ? `Enter the 6-digit code emailed to ${ADMIN_RESET_EMAIL}`
                  : 'Enter your admin password to continue'}
              </Text>

              <TextInput
                ref={inputRef}
                style={[styles.passcodeInput, { fontFamily: reg }]}
                value={passcodeInput}
                onChangeText={t => { setPasscodeInput(t); setPasscodeError(''); }}
                keyboardType={passcodeMode === 'reset' ? 'number-pad' : 'default'}
                secureTextEntry={passcodeMode !== 'reset'}
                maxLength={passcodeMode === 'reset' ? 6 : 32}
                placeholder={passcodeMode === 'reset' ? '------' : 'Password'}
                placeholderTextColor={Colors.inkMute}
                autoCapitalize="none"
                returnKeyType={passcodeMode === 'set' ? 'next' : 'done'}
                onSubmitEditing={passcodeMode === 'set' ? undefined : handlePasscodeSubmit}
              />

              {/* Confirm field — only when setting a new password */}
              {passcodeMode === 'set' && (
                <TextInput
                  style={[styles.passcodeInput, { fontFamily: reg, marginTop: 8 }]}
                  value={passcodeConfirm}
                  onChangeText={t => { setPasscodeConfirm(t); setPasscodeError(''); }}
                  secureTextEntry
                  maxLength={32}
                  placeholder="Confirm password"
                  placeholderTextColor={Colors.inkMute}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={handlePasscodeSubmit}
                />
              )}

              {!!passcodeError && (
                <Text style={[styles.passcodeErrorText, { fontFamily: semi }]}>{passcodeError}</Text>
              )}

              {/* Forgot password link — only in 'enter' mode */}
              {passcodeMode === 'enter' && (
                <TouchableOpacity onPress={handleForgotPassword} style={{ marginTop: 10 }}>
                  <Text style={[styles.passcodeForgot, { fontFamily: semi }]}>Forgot password? Email a reset code</Text>
                </TouchableOpacity>
              )}

              <View style={styles.passcodeButtons}>
                <TouchableOpacity
                  style={[styles.passcodeBtn, styles.passcodeBtnCancel]}
                  onPress={() => { setPasscodeVisible(false); setPasscodeInput(''); setPasscodeConfirm(''); setPasscodeError(''); }}
                >
                  <Text style={[styles.passcodeBtnText, { fontFamily: semi, color: Colors.inkMute }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.passcodeBtn, styles.passcodeBtnConfirm]}
                  onPress={handlePasscodeSubmit}
                >
                  <Text style={[styles.passcodeBtnText, { fontFamily: semi, color: '#FFFFFF' }]}>
                    {passcodeMode === 'set' ? 'Save' : passcodeMode === 'reset' ? 'Verify' : 'Unlock'}
                  </Text>
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
