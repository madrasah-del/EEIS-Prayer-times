/**
 * Billboard config signing & verification.
 *
 * The admin signs the billboard config with an Ed25519 key DERIVED from the
 * shared admin passphrase (never stored in the app). The user app verifies the
 * signature with a hardcoded PUBLIC key. A leaked GitHub token therefore CANNOT
 * make malicious content display — only a real admin (who knows the passphrase)
 * can produce a valid signature.
 *
 * Per-poster image integrity: each slide carries `imageHash` (SHA-256 of the
 * image's base64 bytes, set at upload). It lives inside `campaigns`, so it is
 * covered by the same signature. The slideshow re-hashes the fetched image and
 * refuses to show it on mismatch — blocking same-filename image overwrites.
 */
import nacl from 'tweetnacl';
import * as Crypto from 'expo-crypto';
import type { BillboardConfig } from './billboards';

// Ed25519 PUBLIC key for the shared admin passphrase (base64). Safe to embed.
// Private key is derived from the passphrase at sign time and never stored.
export const BILLBOARD_PUBLIC_KEY = 'CcIaIIrJC6PtBqbvb+9ZusK8XEVkWlgEbXKbXnHViBg=';

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function b64ToBytes(b64: string): Uint8Array {
  const bin = (global as any).atob ? (global as any).atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return (global as any).btoa ? (global as any).btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
}
function strToBytes(s: string): Uint8Array {
  // UTF-8 encode
  const utf8 = unescape(encodeURIComponent(s));
  const out = new Uint8Array(utf8.length);
  for (let i = 0; i < utf8.length; i++) out[i] = utf8.charCodeAt(i);
  return out;
}

/** The exact payload that gets signed/verified — identical construction both sides. */
function signablePayload(cfg: BillboardConfig): string {
  return JSON.stringify({
    campaigns:         cfg.campaigns ?? [],
    scrollingMessages: cfg.scrollingMessages ?? [],
  });
}

/** SHA-256 (hex) of an arbitrary string (used for image base64 + seed). */
export async function sha256Hex(input: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}

/** Derive the Ed25519 keypair from the passphrase (seed = SHA-256(passphrase)). */
async function keyPairFromPassphrase(passphrase: string) {
  const seedHex = await sha256Hex(passphrase);
  return nacl.sign.keyPair.fromSeed(hexToBytes(seedHex));
}

/** Sign the config; returns the base64 signature to store as config.signature. */
export async function signConfig(cfg: BillboardConfig, passphrase: string): Promise<string> {
  const kp  = await keyPairFromPassphrase(passphrase);
  const sig = nacl.sign.detached(strToBytes(signablePayload(cfg)), kp.secretKey);
  return bytesToB64(sig);
}

/** Verify config.signature against the hardcoded public key. */
export function verifyConfig(cfg: BillboardConfig & { signature?: string }): boolean {
  if (!cfg || !cfg.signature) return false;
  try {
    return nacl.sign.detached.verify(
      strToBytes(signablePayload(cfg)),
      b64ToBytes(cfg.signature),
      b64ToBytes(BILLBOARD_PUBLIC_KEY),
    );
  } catch {
    return false;
  }
}
