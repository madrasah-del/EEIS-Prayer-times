import React from 'react';
import {
  View, Text, TouchableOpacity, Modal, Pressable, StyleSheet, Linking,
} from 'react-native';
import { Colors } from '../constants/theme';

const DONATE_URL = 'https://givealittle.co/c/3eQ2G3VxeMY85q2rQE411U';

type Props = {
  visible: boolean;
  onClose: () => void;
  onShare: () => void;
  onDonatePress: () => void;
  onAlertsPress: () => void;
  onHelpPress: () => void;
  fontsLoaded: boolean;
};

type MenuItem = {
  icon: string;
  label: string;
  sub?: string;
  onPress: () => void;
  danger?: boolean;
};

export function HamburgerMenu({ visible, onClose, onShare, onDonatePress, onAlertsPress, onHelpPress, fontsLoaded }: Props) {
  const bold = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;

  const items: MenuItem[] = [
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
      icon: '📤',
      label: 'Share App',
      sub: 'Send the Play Store link to friends & family',
      onPress: () => { onClose(); onShare(); },
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        {/* Drawer panel — left aligned */}
        <Pressable style={styles.drawer} onPress={() => {}}>

          {/* Header */}
          <View style={styles.drawerHeader}>
            <Text style={[styles.drawerTitle, { fontFamily: bold }]}>Menu</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <Text style={[styles.closeText, { fontFamily: bold }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Menu items */}
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
  menuTextCol: {
    flex: 1,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.ink,
  },
  menuLabelMuted: {
    color: Colors.inkMute,
  },
  menuSub: {
    fontSize: 12,
    color: Colors.inkMute,
    marginTop: 2,
  },
});
