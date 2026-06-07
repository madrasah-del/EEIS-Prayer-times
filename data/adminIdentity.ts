/**
 * Admin identity / accountability (v74).
 *
 * Captures WHO is making admin changes (a name or initials — not a secret) so every
 * GitHub save is attributed in its commit message ("… by Aisha"). The git history then
 * becomes a durable, timestamped audit log of who changed the campaign / prayer times /
 * message / quotes. The name is held in plain AsyncStorage (it is not sensitive).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setCommitAuthorName } from './githubApi';

const ADMIN_NAME_KEY = '@eeis_admin_name';

export async function getAdminName(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(ADMIN_NAME_KEY)) ?? '';
  } catch {
    return '';
  }
}

/** Persist the admin name and make githubApi attribute commits to it. */
export async function setAdminName(name: string): Promise<void> {
  const clean = (name ?? '').trim().slice(0, 40);
  try { await AsyncStorage.setItem(ADMIN_NAME_KEY, clean); } catch { /* ignore */ }
  setCommitAuthorName(clean);
}

/** Load the stored name (if any) into githubApi at startup / admin open. */
export async function primeCommitAuthor(): Promise<string> {
  const name = await getAdminName();
  setCommitAuthorName(name);
  return name;
}
