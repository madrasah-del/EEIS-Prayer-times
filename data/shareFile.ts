/**
 * Share a (potentially large) text payload as a FILE (v75 / hardened v76).
 *
 * Android's Share.share({ message }) chokes on large strings — the ~178 KB quotes CSV made
 * the share sheet spin forever and FROZE the app. We therefore ONLY ever share via a file
 * (expo-sharing) and NEVER fall back to a text share — a failure throws a clear error that
 * the caller turns into a status message, so the UI can never hang.
 *
 * Uses the modern expo-file-system File API (synchronous .write), which does NOT hit the
 * legacy readAsStringAsync crash.
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function shareTextAsFile(
  filename: string,
  contents: string,
  mimeType: string,
  dialogTitle: string,
): Promise<void> {
  const available = await Sharing.isAvailableAsync().catch(() => false);
  if (!available) {
    throw new Error('Sharing is not available on this device.');
  }
  const file = new File(Paths.cache, filename);
  try { file.create({ overwrite: true }); } catch { /* may already exist — overwrite below */ }
  file.write(contents);          // synchronous, fast even for a few hundred KB
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle });
}

/** Convenience for CSV files. */
export function shareCsv(filename: string, csv: string, dialogTitle: string): Promise<void> {
  return shareTextAsFile(filename, csv, 'text/csv', dialogTitle);
}
