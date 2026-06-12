/**
 * Share a (potentially large) text payload as a FILE (v75).
 *
 * Android's Share.share({ message }) chokes on large strings — the ~178 KB quotes CSV made
 * the share sheet spin forever and never open. Writing the text to a cache file and sharing
 * the file (via expo-sharing) is robust at any size and gives the user proper "Save to
 * Files / Drive / email" targets.
 *
 * Uses the modern expo-file-system File API (synchronous .write), which does NOT hit the
 * legacy readAsStringAsync crash. Falls back to a plain text share if file/sharing is
 * unavailable (e.g. web).
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';

export async function shareTextAsFile(
  filename: string,
  contents: string,
  mimeType: string,
  dialogTitle: string,
): Promise<void> {
  try {
    const file = new File(Paths.cache, filename);
    try { file.create({ overwrite: true }); } catch { /* may already exist */ }
    file.write(contents);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType, dialogTitle });
      return;
    }
  } catch {
    /* fall through to text share */
  }
  // Last-resort fallback (web, or if the file path failed): plain text share.
  await Share.share({ title: dialogTitle, message: contents });
}

/** Convenience for CSV files. */
export function shareCsv(filename: string, csv: string, dialogTitle: string): Promise<void> {
  return shareTextAsFile(filename, csv, 'text/csv', dialogTitle);
}
