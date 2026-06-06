/**
 * Admin-editable Jummah jamaat times (v69).
 *
 * Jummah 1 & 2 use two fixed pairs — one for British Summer Time, one for GMT. They are NOT
 * part of the daily timetable. Historically they were hardcoded; this module makes them
 * admin-editable (remote, Ed25519-signed) while keeping the original values as the built-in
 * default. If no remote config is uploaded (or it's invalid/offline), the defaults are used,
 * so the app always has correct Jummah times.
 *
 * Channel-aware: TEST app reads/writes jummah-config-test.json, live → jummah-config.json.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signString, verifyString } from './billboardSign';
import { JUMMAH_CONFIG_FILE } from './channel';

export type JummahTimes = {
  summerJ1: string; summerJ2: string;
  winterJ1: string; winterJ2: string;
};

/** Built-in defaults = the values the app has always used. */
export const DEFAULT_JUMMAH: JummahTimes = {
  summerJ1: '13:15', summerJ2: '13:50',
  winterJ1: '12:40', winterJ2: '13:15',
};

export type RemoteJummah = JummahTimes & { version?: number; signature?: string };

const RAW_URL = `https://raw.githubusercontent.com/madrasah-del/EEIS-Prayer-times/main/${JUMMAH_CONFIG_FILE}`;
const CACHE_KEY = '@eeis_jummah_config_v1'; // per-app sandbox

let remote: JummahTimes | null = null;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function valid(j: JummahTimes): boolean {
  return [j.summerJ1, j.summerJ2, j.winterJ1, j.winterJ2].every(t => TIME_RE.test(t || ''));
}
/** Canonical signed payload — identical on sign + verify. */
function payload(j: JummahTimes): string {
  return JSON.stringify({ summerJ1: j.summerJ1, summerJ2: j.summerJ2, winterJ1: j.winterJ1, winterJ2: j.winterJ2 });
}
function accept(f: RemoteJummah | null): boolean {
  if (!f || !f.signature) return false;
  const j: JummahTimes = { summerJ1: f.summerJ1, summerJ2: f.summerJ2, winterJ1: f.winterJ1, winterJ2: f.winterJ2 };
  if (!valid(j)) return false;
  if (!verifyString(payload(j), f.signature)) return false;
  remote = j;
  return true;
}

/** Current Jummah times (admin-set remote, or the built-in defaults). */
export function getJummahTimes(): JummahTimes { return remote ?? DEFAULT_JUMMAH; }

/** The two Jummah jamaat times for the given BST state. */
export function jummahForBst(bst: boolean): { j1: string; j2: string } {
  const j = getJummahTimes();
  return bst ? { j1: j.summerJ1, j2: j.summerJ2 } : { j1: j.winterJ1, j2: j.winterJ2 };
}

async function loadCached(): Promise<void> {
  try { const r = await AsyncStorage.getItem(CACHE_KEY); if (r) accept(JSON.parse(r) as RemoteJummah); } catch {}
}
async function fetchRemote(): Promise<void> {
  try {
    const res = await fetch(`${RAW_URL}?t=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) return;
    const f = JSON.parse(await res.text()) as RemoteJummah;
    if (accept(f)) await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(f)).catch(() => {});
  } catch {}
}
/** Call on app launch: cached first, then refresh. */
export async function initJummahConfig(): Promise<void> { await loadCached(); await fetchRemote(); }

/** Validate + build the signed wrapper ready to upload. Throws on bad times. */
export async function buildSignedJummah(j: JummahTimes, passphrase: string): Promise<RemoteJummah> {
  if (!valid(j)) throw new Error('All four times must be valid 24-hour HH:MM (e.g. 13:15).');
  const signature = await signString(payload(j), passphrase);
  return { version: 1, ...j, signature };
}
export async function applyJummahLocally(f: RemoteJummah): Promise<void> {
  if (accept(f)) await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(f)).catch(() => {});
}
