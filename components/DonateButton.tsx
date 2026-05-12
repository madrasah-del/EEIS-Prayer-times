import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal,
  StyleSheet, Pressable, Linking,
} from 'react-native';
import { Colors } from '../constants/theme';

const DONATE_URL = 'https://givealittle.co/c/3eQ2G3VxeMY85q2rQE411U';

type Props = {
  fontsLoaded: boolean;
};

export function DonateButton({ fontsLoaded }: Props) {
  const [open, setOpen] = useState(false);

  const bold = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;

  const handleConfirm = () => {
    setOpen(false);
    Linking.openURL(DONATE_URL);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.donateBtn}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
      >
        <Text style={[styles.donateBtnText, { fontFamily: bold }]}>♥  DONATE</Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        {/* Tap outside to dismiss */}
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          {/* Card centred on screen */}
          <Pressable style={styles.card} onPress={() => {}}>

            {/* X close button — top right */}
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setOpen(false)}
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

            {/* One blank line gap between title and body */}
            <Text style={[styles.body, { fontFamily: reg }]}>
              {'\n'}You will be forwarded to our{' '}
              <Text style={{ fontFamily: semi, color: Colors.maroonRed }}>Give a Little</Text>
              {' '}collection website to process your donation. Thank You.
            </Text>

            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={handleConfirm}
              activeOpacity={0.85}
            >
              <Text style={[styles.confirmBtnText, { fontFamily: bold }]}>Yes, Take Me There</Text>
            </TouchableOpacity>

            {/* Blue cancel button */}
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setOpen(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.cancelBtnText, { fontFamily: semi }]}>
                Cancel — Go Back to App
              </Text>
            </TouchableOpacity>

          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  donateBtn: {
    backgroundColor: Colors.maroonRed,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.maroonDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 5,
  },
  donateBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
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
    paddingRight: 28, // avoid overlap with X button
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
    shadowColor: Colors.maroonDark,
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
