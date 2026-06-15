/**
 * Share a (potentially large) text payload as a FILE (v75 → v78).
 *
 * Android's Share.share({ message }) chokes on large strings — the ~178 KB quotes CSV froze
 * the app. We therefore share via a file (expo-sharing) and NEVER fall back to a text share —
 * a failure throws a clear error the caller shows as a status message, so the UI can't hang.
 *
 * v78: write the file with the LEGACY expo-file-system API (`writeAsStringAsync` +
 * `cacheDirectory`). The modern `File`/`Paths` API uses `expo.modules.kotlin.sharedobjects.
 * SharedObject`, which threw `NoSuchMethodError` on this build (expo-modules-core skew). The
 * legacy module doesn't use SharedObject, so it is unaffected. NOTE the legacy *read*
 * (`readAsStringAsync`) is the one that crashes on SDK 54 — *writing* to the app's own cache
 * dir is fine and needs no FilePermissionService.
 */
import * as FileSystem from 'expo-file-system/legacy';
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
  const dir = FileSystem.cacheDirectory;
  if (!dir) {
    throw new Error('No cache directory available on this device.');
  }
  const uri = dir + filename;
  await FileSystem.writeAsStringAsync(uri, contents, { encoding: 'utf8' });
  await Sharing.shareAsync(uri, { mimeType, dialogTitle });
}

/** Convenience for CSV files. */
export function shareCsv(filename: string, csv: string, dialogTitle: string): Promise<void> {
  return shareTextAsFile(filename, csv, 'text/csv', dialogTitle);
}
