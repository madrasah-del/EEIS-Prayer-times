import AsyncStorage from '@react-native-async-storage/async-storage';

export type MediaItem = {
  id:      string;
  type:    'file';
  uri:     string;
  name:    string;
  addedAt: number;
};

const MAX_ITEMS   = 20;
const STORAGE_KEY = '@eeis_media_v1';

export async function loadMediaLibrary(): Promise<MediaItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    // Filter out any legacy URL items from previous versions
    const all = JSON.parse(raw) as any[];
    return all.filter(i => i.type !== 'url') as MediaItem[];
  } catch {
    return [];
  }
}

async function saveLibrary(items: MediaItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export async function addMediaItem(
  uri: string,
  name: string,
  type: 'file',
): Promise<MediaItem | null> {
  const existing = await loadMediaLibrary();
  if (existing.length >= MAX_ITEMS) return null;
  // Don't add duplicates by URI
  if (existing.some(i => i.uri === uri)) {
    return existing.find(i => i.uri === uri) ?? null;
  }
  const item: MediaItem = { id: Date.now().toString(), type, uri, name, addedAt: Date.now() };
  await saveLibrary([item, ...existing]);
  return item;
}

export async function deleteMediaItem(id: string): Promise<void> {
  const existing = await loadMediaLibrary();
  await saveLibrary(existing.filter(i => i.id !== id));
}
