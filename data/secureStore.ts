/**
 * Secure key/value storage (v74) for the admin passphrase.
 *
 * The shared admin passphrase used to live in plain AsyncStorage. It now lives in
 * expo-secure-store (Android Keystore / iOS Keychain). This wrapper:
 *   - reads from SecureStore first,
 *   - one-time MIGRATES any old AsyncStorage value into SecureStore (then deletes it),
 *   - falls back to AsyncStorage if SecureStore is ever unavailable (e.g. web), so
 *     signing can never break.
 *
 * Note: SecureStore keys allow only [A-Za-z0-9._-] (no '@'), so the secure key differs
 * from the legacy AsyncStorage key.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/** Admin passphrase keys. */
export const PASS_SECURE_KEY = 'eeis_admin_pass';   // SecureStore (Keystore/Keychain)
export const PASS_LEGACY_KEY = '@eeis_admin_pass';  // old AsyncStorage location (migrated away)

export async function secureGet(secureKey: string, legacyKey?: string): Promise<string | null> {
  try {
    const v = await SecureStore.getItemAsync(secureKey);
    if (v != null) return v;
  } catch { /* SecureStore unavailable — fall through to legacy/fallback */ }

  if (legacyKey) {
    try {
      const old = await AsyncStorage.getItem(legacyKey);
      if (old != null) {
        // Migrate into SecureStore, then remove the plaintext copy.
        try {
          await SecureStore.setItemAsync(secureKey, old);
          await AsyncStorage.removeItem(legacyKey);
        } catch { /* keep legacy if migration fails */ }
        return old;
      }
    } catch { /* ignore */ }
  }
  return null;
}

export async function secureSet(secureKey: string, value: string, legacyKey?: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(secureKey, value);
    if (legacyKey) { try { await AsyncStorage.removeItem(legacyKey); } catch { /* ignore */ } }
    return;
  } catch {
    // Fallback so the admin can still sign even if SecureStore is unavailable.
    try { await AsyncStorage.setItem(legacyKey ?? secureKey, value); } catch { /* ignore */ }
  }
}

export async function secureDelete(secureKey: string, legacyKey?: string): Promise<void> {
  try { await SecureStore.deleteItemAsync(secureKey); } catch { /* ignore */ }
  if (legacyKey) { try { await AsyncStorage.removeItem(legacyKey); } catch { /* ignore */ } }
}
