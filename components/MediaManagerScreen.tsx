import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  ScrollView, TextInput, Alert, Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Colors } from '../constants/theme';
import {
  MediaItem, loadMediaLibrary, addMediaItem,
  deleteMediaItem, fetchYouTubeTitle,
} from '../data/mediaLibrary';

const MAX_ITEMS = 20;

const AUDIO_EXTENSIONS = [
  '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.opus',
  '.mp4', '.mov', '.3gp',
];

type Props = {
  visible: boolean;
  onClose: () => void;
  fontsLoaded: boolean;
};

export function MediaManagerScreen({ visible, onClose, fontsLoaded }: Props) {
  const bold = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;

  const [items, setItems]       = useState<MediaItem[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [adding, setAdding]     = useState(false);

  const reload = useCallback(async () => {
    setItems(await loadMediaLibrary());
  }, []);

  useEffect(() => {
    if (visible) reload();
  }, [visible, reload]);

  const handleAddUrl = useCallback(async () => {
    const url = urlInput.trim();
    if (!url) { Alert.alert('No URL', 'Paste a YouTube or video URL first.'); return; }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      Alert.alert('Invalid URL', 'URL must start with http:// or https://'); return;
    }
    setAdding(true);
    let name = url.replace(/^https?:\/\//, '').slice(0, 50);
    // Try fetching YouTube title
    const title = await fetchYouTubeTitle(url);
    if (title) name = title;

    const result = await addMediaItem(url, name, 'url');
    setAdding(false);
    if (!result) {
      Alert.alert('Library full', `You can store up to ${MAX_ITEMS} items. Delete some to add more.`);
      return;
    }
    setUrlInput('');
    reload();
  }, [urlInput, reload]);

  const handleAddFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const fileName = asset.name ?? `media_${Date.now()}.mp3`;
      const ext = '.' + (fileName.split('.').pop() ?? '').toLowerCase();
      if (!AUDIO_EXTENSIONS.includes(ext)) {
        Alert.alert('Unsupported file', `Please pick an audio or video file.\n\nSelected: ${fileName}`);
        return;
      }
      setAdding(true);
      const destDir = FileSystem.Paths.document.uri + 'custom_sounds/';
      await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
      const destUri = destDir + fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      await FileSystem.copyAsync({ from: asset.uri, to: destUri });
      const item = await addMediaItem(destUri, fileName, 'file');
      setAdding(false);
      if (!item) {
        Alert.alert('Library full', `You can store up to ${MAX_ITEMS} items. Delete some to add more.`);
        return;
      }
      reload();
    } catch (err: any) {
      setAdding(false);
      Alert.alert('File error', err?.message ?? 'Could not add file. Try again.');
    }
  }, [reload]);

  const handleDelete = useCallback(async (item: MediaItem) => {
    Alert.alert(
      'Remove item?',
      `"${item.name}" will be removed from your media library. Prayer sounds that use it will revert to None.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await deleteMediaItem(item.id);
            reload();
          },
        },
      ],
    );
  }, [reload]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.screen}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.dragHandle} />
          <View style={styles.headerRow}>
            <Text style={[styles.headerTitle, { fontFamily: bold }]}>My Media & Sounds</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <Text style={[styles.closeBtn, { fontFamily: bold }]}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.headerSub, { fontFamily: reg }]}>
            {items.length} / {MAX_ITEMS} items · used in prayer sound pickers
          </Text>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

          {/* Add URL */}
          <Text style={[styles.sectionLabel, { fontFamily: semi }]}>ADD YOUTUBE / VIDEO URL</Text>
          <View style={styles.urlRow}>
            <TextInput
              style={[styles.urlInput, { fontFamily: reg }]}
              placeholder="https://youtube.com/watch?v=..."
              placeholderTextColor="#999"
              value={urlInput}
              onChangeText={setUrlInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={handleAddUrl}
            />
            <TouchableOpacity
              style={[styles.addBtn, adding && styles.addBtnDisabled]}
              onPress={handleAddUrl}
              disabled={adding}
              activeOpacity={0.8}
            >
              <Text style={[styles.addBtnText, { fontFamily: semi }]}>
                {adding ? '...' : 'Add'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Add from phone */}
          <TouchableOpacity
            style={[styles.fromPhoneBtn, adding && { opacity: 0.5 }]}
            onPress={handleAddFile}
            disabled={adding}
            activeOpacity={0.8}
          >
            <Text style={[styles.fromPhoneBtnText, { fontFamily: semi }]}>
              🎵  Add from My Phone...
            </Text>
          </TouchableOpacity>

          {/* Saved items */}
          {items.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { fontFamily: semi }]}>SAVED ITEMS</Text>
              {items.map(item => (
                <View key={item.id} style={styles.itemRow}>
                  <Text style={styles.itemIcon}>{item.type === 'url' ? '🔗' : '🎵'}</Text>
                  <Text style={[styles.itemName, { fontFamily: reg }]} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleDelete(item)}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    style={styles.deleteBtn}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.deleteBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}

          {items.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🎵</Text>
              <Text style={[styles.emptyTitle, { fontFamily: semi }]}>No saved media yet</Text>
              <Text style={[styles.emptyBody, { fontFamily: reg }]}>
                Add YouTube URLs or audio files above. They'll appear in the sound picker for every prayer.
              </Text>
            </View>
          )}

          <View style={{ height: 48 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bgScreen },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  dragHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#D0D0D0', alignSelf: 'center', marginBottom: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 20, color: Colors.maroonRed, fontWeight: '700' },
  closeBtn: { fontSize: 18, color: Colors.inkMute, fontWeight: '700' },
  headerSub: { fontSize: 12, color: Colors.inkMute, marginTop: 4 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 14 },

  sectionLabel: {
    fontSize: 11, color: Colors.inkMute, fontWeight: '600',
    letterSpacing: 1.2, textTransform: 'uppercase',
    marginTop: 12, marginBottom: 8, paddingLeft: 2,
  },

  urlRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  urlInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#D0D0D0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 13,
    color: Colors.ink,
    backgroundColor: '#FFFFFF',
  },
  addBtn: {
    backgroundColor: Colors.deepBlue,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },

  fromPhoneBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.deepBlue,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  fromPhoneBtnText: { color: Colors.deepBlue, fontSize: 14, fontWeight: '600' },

  itemRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  itemIcon: { fontSize: 20 },
  itemName: { flex: 1, fontSize: 13, color: Colors.ink, lineHeight: 18 },
  deleteBtn: {
    width: 28, height: 28,
    borderRadius: 14,
    backgroundColor: '#FFE5E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: { fontSize: 12, color: Colors.maroonRed, fontWeight: '700' },

  emptyState: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 20,
  },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: Colors.ink, marginBottom: 8 },
  emptyBody: {
    fontSize: 13, color: Colors.inkMute, textAlign: 'center',
    lineHeight: 20, paddingHorizontal: 20,
  },
});
