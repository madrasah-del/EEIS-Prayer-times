/**
 * Firebase REST API helpers — Firestore + Storage.
 *
 * Uses the Firebase REST API directly (no native SDK), so no native modules
 * or config plugin needed. Works in any Expo managed/bare workflow.
 *
 * IMPORTANT: Firebase Security Rules must be set to allow public read/write:
 *   Firestore:  allow read, write: if true;
 *   Storage:    allow read, write: if true;
 * Set in Firebase Console → Firestore → Rules / Storage → Rules.
 *
 * Collections used:
 *   news_categories/{catId}   — { title, icon, order }
 *   news_items/{itemId}       — { categoryId, title, fileUrl, type, date, description?, announcementText? }
 *   news_headlines/{headId}   — HeadlineItem fields
 */

// ─── Config ───────────────────────────────────────────────────────────────────

const PROJECT_ID     = 'eeis-prayer-times';
const API_KEY        = 'AIzaSyBBhOysV1-FKBcjsFtU4MAfd4fFUcbXKrg';
const STORAGE_BUCKET = 'eeis-prayer-times.firebasestorage.app';

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const STORAGE_BASE   = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o`;

// ─── Firestore value conversion ───────────────────────────────────────────────

function fromFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return null;
  if ('stringValue'  in val) return val.stringValue as string;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue'  in val) return Number(val.doubleValue);
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('nullValue'    in val) return null;
  if ('arrayValue'   in val) {
    const values: any[] = val.arrayValue?.values ?? [];
    return values.map(fromFirestoreValue);
  }
  if ('mapValue' in val) {
    return fromFirestoreFields(val.mapValue?.fields ?? {});
  }
  return null;
}

function fromFirestoreFields(fields: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(fields)) {
    result[key] = fromFirestoreValue(val);
  }
  return result;
}

function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string')  return { stringValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function toFirestoreFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) fields[key] = toFirestoreValue(val);
  }
  return fields;
}

// ─── Extract doc ID from Firestore name path ──────────────────────────────────

function docIdFromName(name: string): string {
  return name.split('/').pop() ?? name;
}

// ─── Firestore CRUD ───────────────────────────────────────────────────────────

/** List all documents in a collection. Returns array of {id, data}. */
export async function fsListDocs(
  collection: string,
): Promise<Array<{ id: string; data: Record<string, any> }>> {
  try {
    const url = `${FIRESTORE_BASE}/${collection}?key=${API_KEY}&pageSize=1000`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    const docs: any[] = json.documents ?? [];
    return docs.map(doc => ({
      id:   docIdFromName(doc.name as string),
      data: fromFirestoreFields(doc.fields ?? {}),
    }));
  } catch {
    return [];
  }
}

/** Get a single document. Returns null if not found. */
export async function fsGetDoc(
  collection: string,
  docId: string,
): Promise<Record<string, any> | null> {
  try {
    const url = `${FIRESTORE_BASE}/${collection}/${docId}?key=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const doc = await res.json();
    return fromFirestoreFields(doc.fields ?? {});
  } catch {
    return null;
  }
}

/** Create or overwrite a document (PATCH = upsert). Returns true on success. */
export async function fsSetDoc(
  collection: string,
  docId: string,
  data: Record<string, any>,
): Promise<boolean> {
  try {
    const url = `${FIRESTORE_BASE}/${collection}/${docId}?key=${API_KEY}`;
    const body = JSON.stringify({ fields: toFirestoreFields(data) });
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Delete a document. Returns true on success. */
export async function fsDeleteDoc(
  collection: string,
  docId: string,
): Promise<boolean> {
  try {
    const url = `${FIRESTORE_BASE}/${collection}/${docId}?key=${API_KEY}`;
    const res = await fetch(url, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Firebase Storage ─────────────────────────────────────────────────────────

/**
 * Upload a file to Firebase Storage via XHR (handles content:// URIs from
 * DocumentPicker without any native modules — same pattern as GitHub upload).
 *
 * @param uri          content:// or file:// URI from DocumentPicker
 * @param storagePath  destination path in Storage, e.g. "news/lectures/file.pdf"
 * @param mimeType     MIME type, e.g. "application/pdf"
 * @returns            Public download URL (no auth required with public rules)
 */
export function uploadUriToStorage(
  uri: string,
  storagePath: string,
  mimeType: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Step 1: Read the URI as a blob
    const readXhr = new XMLHttpRequest();
    readXhr.responseType = 'blob';
    readXhr.onload = () => {
      const blob: Blob = readXhr.response as Blob;

      // Step 2: Upload the blob to Firebase Storage
      const encodedPath = encodeURIComponent(storagePath);
      const uploadUrl = `${STORAGE_BASE}?name=${encodedPath}&key=${API_KEY}`;

      const uploadXhr = new XMLHttpRequest();
      uploadXhr.open('POST', uploadUrl, true);
      uploadXhr.setRequestHeader('Content-Type', mimeType);

      if (onProgress) {
        uploadXhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
      }

      uploadXhr.onload = () => {
        if (uploadXhr.status >= 200 && uploadXhr.status < 300) {
          // Return public download URL
          const downloadUrl = `${STORAGE_BASE}/${encodedPath}?alt=media`;
          resolve(downloadUrl);
        } else {
          reject(new Error(`Storage upload failed: HTTP ${uploadXhr.status} — ${uploadXhr.responseText}`));
        }
      };
      uploadXhr.onerror = () => reject(new Error('Storage upload network error'));
      uploadXhr.send(blob);
    };
    readXhr.onerror = () => reject(new Error('Failed to read file URI'));
    readXhr.open('GET', uri, true);
    readXhr.send();
  });
}

/**
 * Build the public download URL for a file already in Storage.
 * Only works when Firebase Storage rules allow public read.
 */
export function getStorageUrl(storagePath: string): string {
  return `${STORAGE_BASE}/${encodeURIComponent(storagePath)}?alt=media`;
}

/**
 * Delete a file from Firebase Storage.
 * Returns true on success.
 */
export async function deleteStorageFile(storagePath: string): Promise<boolean> {
  try {
    const url = `${STORAGE_BASE}/${encodeURIComponent(storagePath)}?key=${API_KEY}`;
    const res = await fetch(url, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}
