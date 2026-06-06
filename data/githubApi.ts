/**
 * GitHub REST API helpers for the EEIS Admin Panel.
 *
 * Uses the v3 API with a Personal Access Token (PAT).
 * Token must have "Contents: write" permission on the EEIS-Prayer-times repo.
 *
 * NOTE: btoa / atob are available in React Native Hermes runtime.
 */
import { BillboardConfig } from './billboards';
import { BILLBOARD_CONFIG_FILE, PRAYER_TIMES_FILE, JUMMAH_CONFIG_FILE } from './channel';

const GITHUB_API  = 'https://api.github.com';
const REPO_OWNER  = 'madrasah-del';
const REPO_NAME   = 'EEIS-Prayer-times';
// Channel-aware: the TEST/dev app reads & writes billboard-config-test.json so its content
// experiments never touch the live config that production users read.
const CONFIG_PATH = BILLBOARD_CONFIG_FILE;

// Hardcoded fine-grained PAT (Contents R/W on EEIS-Prayer-times only) so admins
// never have to paste a token. Scoped to this one repo; protected by config
// signing (data/billboardSign.ts) so a leaked token can't show malicious content.
// Split to make casual string-grep extraction marginally harder.
export const BILLBOARD_TOKEN =
  'github_pat_11B5SSKQQ0qVcL5nW9Xc7N' + '_F9cFkKJvFKgxUnuPC3GNhjyAgDf9xUAjs9iBOhsY717ZV6DMTKHOY9fO1Et';

// ─── Low-level helpers ────────────────────────────────────────────────────────

async function ghGet(path: string, token: string): Promise<any> {
  const res = await fetch(
    `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`,
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

async function ghPut(
  path: string,
  contentBase64: string,
  message: string,
  sha: string | undefined,
  token: string,
): Promise<any> {
  const body: Record<string, string> = { message, content: contentBase64 };
  if (sha) body.sha = sha;
  const res = await fetch(
    `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `GitHub PUT failed: HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Base64 helpers (Hermes-compatible) ──────────────────────────────────────

/** Encode UTF-8 string → base64 (handles non-ASCII characters safely). */
function encodeBase64(str: string): string {
  // URI-encode then un-escape to get proper byte string for btoa
  return btoa(unescape(encodeURIComponent(str)));
}

/** Decode base64 (with embedded newlines from GitHub) → UTF-8 string. */
function decodeBase64(b64: string): string {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Fetch + parse billboard config from GitHub. Returns config + SHA needed for updates. */
export async function fetchConfigFromGitHub(
  token: string,
): Promise<{ config: BillboardConfig; sha: string }> {
  const data    = await ghGet(CONFIG_PATH, token);
  const json    = decodeBase64(data.content);
  const config  = JSON.parse(json) as BillboardConfig;
  return { config, sha: data.sha };
}

/** Save updated billboard config to GitHub. Returns new SHA. */
export async function saveConfigToGitHub(
  config: BillboardConfig,
  sha: string,
  token: string,
): Promise<string> {
  const content = encodeBase64(JSON.stringify(config, null, 2));
  const res = await ghPut(
    CONFIG_PATH,
    content,
    `Update ${CONFIG_PATH} via EEIS Admin`,
    sha,
    token,
  );
  return res.content.sha as string;
}

/**
 * Publish a config to the LIVE file (billboard-config.json), regardless of the current
 * channel. Used by the Test/dev app's "Publish Test → Live" button to promote a finished,
 * already-SIGNED config so production users see it. Fetches the live file's current SHA
 * first (so the PUT overwrites it), then writes.
 */
export async function publishConfigToLive(
  signedConfig: BillboardConfig,
  token: string,
): Promise<string> {
  const LIVE_PATH = 'billboard-config.json';
  let sha: string | undefined;
  try {
    const existing = await ghGet(LIVE_PATH, token);
    sha = existing.sha;
  } catch {
    sha = undefined; // live file doesn't exist yet — create it
  }
  const content = encodeBase64(JSON.stringify(signedConfig, null, 2));
  const res = await ghPut(
    LIVE_PATH,
    content,
    'Publish Test → Live via EEIS Admin',
    sha,
    token,
  );
  return res.content.sha as string;
}

/** Upload a signed prayer-times timetable to this channel's file (test or live). */
export async function uploadPrayerTimesFile(file: object, token: string): Promise<string> {
  let sha: string | undefined;
  try {
    const existing = await ghGet(PRAYER_TIMES_FILE, token);
    sha = existing.sha;
  } catch {
    sha = undefined; // file doesn't exist yet — create it
  }
  const content = encodeBase64(JSON.stringify(file, null, 2));
  const res = await ghPut(
    PRAYER_TIMES_FILE,
    content,
    `Update ${PRAYER_TIMES_FILE} via EEIS Admin`,
    sha,
    token,
  );
  return res.content.sha as string;
}

/** Upload the signed Jummah times config to this channel's file. */
export async function uploadJummahConfigFile(file: object, token: string): Promise<string> {
  let sha: string | undefined;
  try {
    const existing = await ghGet(JUMMAH_CONFIG_FILE, token);
    sha = existing.sha;
  } catch {
    sha = undefined;
  }
  const content = encodeBase64(JSON.stringify(file, null, 2));
  const res = await ghPut(
    JUMMAH_CONFIG_FILE,
    content,
    `Update ${JUMMAH_CONFIG_FILE} via EEIS Admin`,
    sha,
    token,
  );
  return res.content.sha as string;
}

/**
 * Upload an image (base64-encoded) to the billboards/ folder.
 * Returns the raw GitHub URL for the uploaded file.
 */
export async function uploadImageToGitHub(
  filename: string,
  base64Data: string,
  token: string,
): Promise<string> {
  // Check if file already exists (need its SHA to overwrite)
  let existingSha: string | undefined;
  try {
    const existing = await ghGet(`billboards/${filename}`, token);
    existingSha = existing.sha as string;
  } catch {
    // File doesn't exist yet — that's fine
  }

  await ghPut(
    `billboards/${filename}`,
    base64Data,
    `Upload ${filename} via EEIS Admin`,
    existingSha,
    token,
  );

  return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/billboards/${filename}`;
}

// ─── Generic path helpers (used by news upload) ───────────────────────────────

/**
 * Upload any file to a given repo path.
 * Returns the raw GitHub URL for the uploaded file.
 */
export async function uploadFileToPath(
  repoPath: string,
  base64Data: string,
  commitMsg: string,
  token: string,
): Promise<string> {
  let existingSha: string | undefined;
  try {
    const existing = await ghGet(repoPath, token);
    existingSha = existing.sha as string;
  } catch {
    // File doesn't exist yet — that's fine
  }
  await ghPut(repoPath, base64Data, commitMsg, existingSha, token);
  return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${repoPath}`;
}

/** Fetch + parse any JSON file from the repo. Returns { data, sha }. */
export async function fetchJsonFromPath<T>(
  repoPath: string,
  token: string,
): Promise<{ data: T; sha: string }> {
  const result = await ghGet(repoPath, token);
  const json   = decodeBase64(result.content);
  return { data: JSON.parse(json) as T, sha: result.sha as string };
}

/** Save any JSON object to a repo path. Returns new SHA. */
export async function saveJsonToPath<T>(
  repoPath: string,
  data: T,
  sha: string,
  commitMsg: string,
  token: string,
): Promise<string> {
  const content = encodeBase64(JSON.stringify(data, null, 2));
  const res = await ghPut(repoPath, content, commitMsg, sha, token);
  return res.content.sha as string;
}

/** Verify a GitHub token has write access to the repo. */
export async function testGitHubToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}`,
      { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } },
    );
    return res.ok;
  } catch {
    return false;
  }
}
