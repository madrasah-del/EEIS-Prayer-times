/**
 * GitHub REST API helpers for the EEIS Admin Panel.
 *
 * Uses the v3 API with a Personal Access Token (PAT).
 * Token must have "Contents: write" permission on the EEIS-Prayer-times repo.
 *
 * NOTE: btoa / atob are available in React Native Hermes runtime.
 */
import { BillboardConfig } from './billboards';

const GITHUB_API  = 'https://api.github.com';
const REPO_OWNER  = 'madrasah-del';
const REPO_NAME   = 'EEIS-Prayer-times';
const CONFIG_PATH = 'billboard-config.json';

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
    'Update billboard-config.json via EEIS Admin',
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
