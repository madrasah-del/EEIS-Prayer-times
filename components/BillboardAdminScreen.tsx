/**
 * BillboardAdminScreen — in-app admin for managing billboard campaigns.
 *
 * Allows authenticated admins (via GitHub PAT) to:
 * - Fetch current billboard-config.json from GitHub
 * - Upload poster images from phone via DocumentPicker
 * - Create / edit / delete campaigns
 * - Toggle campaigns active/inactive
 * - Save updated config back to GitHub
 *
 * Token is stored in AsyncStorage @eeis_admin_gh_token (never hardcoded).
 * Image upload uses XHR+FileReader (no expo-file-system native module needed).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, ScrollView,
  StyleSheet, ActivityIndicator, Platform, KeyboardAvoidingView,
  Image, Switch, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import {
  fetchConfigFromGitHub,
  saveConfigToGitHub,
  uploadImageToGitHub,
  testGitHubToken,
} from '../data/githubApi';
import { BillboardConfig, BillboardCampaign, BillboardSlide } from '../data/billboards';
import { Colors } from '../constants/theme';

const TOKEN_KEY = '@eeis_admin_gh_token';

const PRAYERS = ['fajr', 'shuruq', 'dhuhr', 'asr', 'maghrib', 'isha'];
const DAYS    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── XHR+FileReader base64 reader (no expo-file-system needed) ────────────────

function readUriAsBase64(uri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr        = new XMLHttpRequest();
    xhr.responseType = 'blob';
    xhr.onload = () => {
      const reader  = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const comma   = dataUrl.indexOf(',');
        resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
      };
      reader.onerror = () => reject(new Error('FileReader failed'));
      reader.readAsDataURL(xhr.response as Blob);
    };
    xhr.onerror = () => reject(new Error('XHR failed reading file'));
    xhr.open('GET', uri, true);
    xhr.send();
  });
}

// ─── Empty campaign factory ───────────────────────────────────────────────────

function emptySlide(): BillboardSlide {
  return {
    id:    Date.now().toString(),
    title: '',
    body:  '',
    imageUrl: '',
    bgColor:  '#063968',
    displayDurationSec: 10,
  };
}

function emptyCampaign(): BillboardCampaign {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id:     Date.now().toString(),
    active: true,
    startDate: today,
    endDate:   today,
    prayers:   ['fajr', 'maghrib', 'isha'],
    slides:    [emptySlide()],
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  visible:    boolean;
  onClose:    () => void;
  fontsLoaded: boolean;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function BillboardAdminScreen({ visible, onClose, fontsLoaded }: Props) {
  const bold = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;

  // ── Auth state ──────────────────────────────────────────────────────────────
  const [token,      setToken]      = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [tokenValid, setTokenValid] = useState(false);

  // ── Config state ────────────────────────────────────────────────────────────
  const [config,     setConfig]     = useState<BillboardConfig | null>(null);
  const [configSha,  setConfigSha]  = useState('');
  const [loading,    setLoading]    = useState(false);
  const [status,     setStatus]     = useState('');

  // ── Edit state ──────────────────────────────────────────────────────────────
  const [editing,    setEditing]    = useState<BillboardCampaign | null>(null);
  // Image pick for current slide being edited (index 0)
  const [pickedUri,  setPickedUri]  = useState('');
  const [uploading,  setUploading]  = useState(false);

  // Load saved token on mount
  useEffect(() => {
    if (!visible) return;
    AsyncStorage.getItem(TOKEN_KEY).then(t => {
      if (t) { setToken(t); setTokenValid(true); }
    }).catch(() => {});
  }, [visible]);

  // Auto-fetch config when token becomes valid
  useEffect(() => {
    if (tokenValid && token && !config) {
      handleFetchConfig();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenValid, token]);

  const handleFetchConfig = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setStatus('Fetching config…');
    try {
      const { config: cfg, sha } = await fetchConfigFromGitHub(token);
      setConfig(cfg);
      setConfigSha(sha);
      setStatus(`Loaded — ${cfg.campaigns.length} campaign(s)`);
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const handleSaveToken = useCallback(async () => {
    if (!tokenInput.trim()) return;
    setLoading(true);
    setStatus('Verifying token…');
    const ok = await testGitHubToken(tokenInput.trim());
    if (ok) {
      const t = tokenInput.trim();
      setToken(t);
      await AsyncStorage.setItem(TOKEN_KEY, t).catch(() => {});
      setTokenValid(true);
      setStatus('Token saved');
    } else {
      setStatus('Invalid token — check it has repo contents:write permission');
    }
    setLoading(false);
  }, [tokenInput]);

  // ── Campaign CRUD ────────────────────────────────────────────────────────────

  const handleToggleActive = useCallback((id: string) => {
    if (!config) return;
    const updated: BillboardConfig = {
      ...config,
      campaigns: config.campaigns.map(c =>
        c.id === id ? { ...c, active: !c.active } : c,
      ),
    };
    setConfig(updated);
    // Save immediately
    saveConfigToGitHub(updated, configSha, token)
      .then(newSha => { setConfigSha(newSha); setStatus('Saved'); })
      .catch(e  => setStatus(`Save failed: ${e.message}`));
  }, [config, configSha, token]);

  const handleDeleteCampaign = useCallback((id: string) => {
    Alert.alert('Delete Campaign', 'Remove this campaign permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          if (!config) return;
          const updated: BillboardConfig = {
            ...config,
            campaigns: config.campaigns.filter(c => c.id !== id),
          };
          setConfig(updated);
          try {
            const newSha = await saveConfigToGitHub(updated, configSha, token);
            setConfigSha(newSha);
            setStatus('Campaign deleted');
          } catch (e: any) {
            setStatus(`Delete failed: ${e.message}`);
          }
        },
      },
    ]);
  }, [config, configSha, token]);

  const handleEditCampaign = useCallback((c: BillboardCampaign) => {
    setEditing({ ...c, slides: c.slides.map(s => ({ ...s })) });
    setPickedUri('');
    setStatus('');
  }, []);

  const handleNewCampaign = useCallback(() => {
    setEditing(emptyCampaign());
    setPickedUri('');
    setStatus('');
  }, []);

  // ── Image picker for slide 0 ─────────────────────────────────────────────────

  const handlePickImage = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*' });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      setPickedUri(asset.uri);
      // Update slide 0 title to filename for reference
      if (editing) {
        const slides = [...editing.slides];
        if (slides[0]) {
          slides[0] = { ...slides[0] };
        }
        setEditing({ ...editing, slides });
      }
    } catch (e: any) {
      setStatus(`Image pick failed: ${e.message}`);
    }
  }, [editing]);

  // ── Save campaign (upload image if new, then update config) ─────────────────

  const handleSaveCampaign = useCallback(async () => {
    if (!editing || !config) return;
    if (editing.slides[0]?.title === '' && !pickedUri && !editing.slides[0]?.imageUrl) {
      setStatus('Add a title or pick a poster image');
      return;
    }
    setUploading(true);
    setStatus('Saving…');
    try {
      let imageUrl = editing.slides[0]?.imageUrl ?? '';

      // Upload new image if picked
      if (pickedUri) {
        setStatus('Reading image…');
        const base64 = await readUriAsBase64(pickedUri);
        const ext      = pickedUri.split('.').pop()?.toLowerCase() ?? 'jpg';
        const filename = `poster_${editing.id}.${ext}`;
        setStatus('Uploading poster to GitHub…');
        imageUrl = await uploadImageToGitHub(filename, base64, token);
        setStatus('Image uploaded ✓');
      }

      // Build updated slide
      const slide: BillboardSlide = {
        ...editing.slides[0]!,
        imageUrl: imageUrl || undefined,
        bgColor:  editing.slides[0]?.bgColor ?? '#063968',
      };

      const updatedCampaign: BillboardCampaign = { ...editing, slides: [slide] };

      // Insert or replace in config
      const exists = config.campaigns.some(c => c.id === editing.id);
      const campaigns = exists
        ? config.campaigns.map(c => c.id === editing.id ? updatedCampaign : c)
        : [...config.campaigns, updatedCampaign];

      const updated: BillboardConfig = { ...config, campaigns };

      setStatus('Saving config to GitHub…');
      const newSha = await saveConfigToGitHub(updated, configSha, token);
      setConfig(updated);
      setConfigSha(newSha);
      setEditing(null);
      setPickedUri('');
      setStatus('Campaign saved ✓');
    } catch (e: any) {
      setStatus(`Failed: ${e.message}`);
    } finally {
      setUploading(false);
    }
  }, [editing, config, configSha, token, pickedUri]);

  // ── Edit form field helpers ──────────────────────────────────────────────────

  const setEditField = (key: keyof BillboardCampaign, value: any) => {
    if (!editing) return;
    setEditing({ ...editing, [key]: value });
  };

  const setSlide0Field = (key: keyof BillboardSlide, value: any) => {
    if (!editing || !editing.slides[0]) return;
    const slides = editing.slides.slice();
    slides[0] = { ...slides[0], [key]: value };
    setEditing({ ...editing, slides });
  };

  const togglePrayer = (p: string) => {
    if (!editing) return;
    const current = editing.prayers;
    const next    = current.includes(p) ? current.filter(x => x !== p) : [...current, p];
    setEditing({ ...editing, prayers: next });
  };

  const toggleDay = (d: number) => {
    if (!editing) return;
    const current = editing.daysOfWeek ?? [];
    const next    = current.includes(d) ? current.filter(x => x !== d) : [...current, d];
    setEditing({ ...editing, daysOfWeek: next.length > 0 ? next : undefined });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { fontFamily: bold }]}>Billboard Admin</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Text style={[styles.headerClose, { fontFamily: bold }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* ── Auth — token entry ─────────────────────────────────────────── */}
          {!tokenValid && (
            <View style={styles.tokenSection}>
              <Text style={[styles.sectionTitle, { fontFamily: semi }]}>GitHub Token</Text>
              <Text style={[styles.hint, { fontFamily: reg }]}>
                Enter a GitHub PAT with repo contents:write permission.
                It will be saved on this device.
              </Text>
              <TextInput
                style={[styles.tokenInput, { fontFamily: reg }]}
                value={tokenInput}
                onChangeText={setTokenInput}
                placeholder="github_pat_…"
                placeholderTextColor={Colors.inkMute}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
              <TouchableOpacity
                style={styles.btn}
                onPress={handleSaveToken}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#FFF" />
                  : <Text style={[styles.btnText, { fontFamily: semi }]}>Verify & Save Token</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* ── Main content ───────────────────────────────────────────────── */}
          {tokenValid && !editing && (
            <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 40 }}>

              {/* Status + Fetch */}
              <View style={styles.row}>
                <TouchableOpacity style={[styles.btn, styles.btnSmall]} onPress={handleFetchConfig} disabled={loading}>
                  {loading
                    ? <ActivityIndicator color="#FFF" size="small" />
                    : <Text style={[styles.btnText, { fontFamily: semi, fontSize: 13 }]}>↻ Refresh</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btnSmall, styles.btnGreen]} onPress={handleNewCampaign} disabled={loading}>
                  <Text style={[styles.btnText, { fontFamily: semi, fontSize: 13 }]}>+ New Campaign</Text>
                </TouchableOpacity>
              </View>

              {!!status && <Text style={[styles.statusText, { fontFamily: reg }]}>{status}</Text>}

              {/* Campaign list */}
              {config?.campaigns.map(campaign => (
                <View key={campaign.id} style={styles.campaignCard}>
                  <View style={styles.campaignHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.campaignTitle, { fontFamily: semi }]} numberOfLines={1}>
                        {campaign.slides[0]?.title || campaign.id}
                      </Text>
                      <Text style={[styles.campaignMeta, { fontFamily: reg }]}>
                        {campaign.startDate} → {campaign.endDate}
                      </Text>
                      <Text style={[styles.campaignMeta, { fontFamily: reg }]}>
                        Prayers: {campaign.prayers.join(', ')}
                      </Text>
                    </View>
                    <Switch
                      value={campaign.active}
                      onValueChange={() => handleToggleActive(campaign.id)}
                      trackColor={{ true: Colors.freshGreen }}
                    />
                  </View>

                  {/* Image thumbnail */}
                  {campaign.slides[0]?.imageUrl && (
                    <Image
                      source={{ uri: campaign.slides[0].imageUrl }}
                      style={styles.campaignThumb}
                      resizeMode="cover"
                    />
                  )}

                  <View style={styles.campaignActions}>
                    <TouchableOpacity
                      style={[styles.btnSmall, styles.btn, { flex: 1 }]}
                      onPress={() => handleEditCampaign(campaign)}
                    >
                      <Text style={[styles.btnText, { fontFamily: semi, fontSize: 12 }]}>✏️ Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btnSmall, styles.btn, styles.btnRed, { flex: 1 }]}
                      onPress={() => handleDeleteCampaign(campaign.id)}
                    >
                      <Text style={[styles.btnText, { fontFamily: semi, fontSize: 12 }]}>🗑 Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {config?.campaigns.length === 0 && (
                <Text style={[styles.hint, { fontFamily: reg, textAlign: 'center', marginTop: 24 }]}>
                  No campaigns yet. Tap "+ New Campaign" to add one.
                </Text>
              )}

            </ScrollView>
          )}

          {/* ── Edit form ─────────────────────────────────────────────────── */}
          {tokenValid && editing && (
            <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 40 }}>
              <Text style={[styles.sectionTitle, { fontFamily: bold, marginBottom: 12 }]}>
                {config?.campaigns.some(c => c.id === editing.id) ? 'Edit Campaign' : 'New Campaign'}
              </Text>

              {!!status && <Text style={[styles.statusText, { fontFamily: reg }]}>{status}</Text>}

              {/* Image picker */}
              <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Poster Image</Text>
              <TouchableOpacity style={styles.imagePicker} onPress={handlePickImage}>
                {pickedUri ? (
                  <Image source={{ uri: pickedUri }} style={styles.imagePreview} resizeMode="contain" />
                ) : editing.slides[0]?.imageUrl ? (
                  <Image source={{ uri: editing.slides[0].imageUrl }} style={styles.imagePreview} resizeMode="contain" />
                ) : (
                  <Text style={[styles.imagePickerText, { fontFamily: reg }]}>
                    📷 Tap to pick poster from phone
                  </Text>
                )}
              </TouchableOpacity>
              {(pickedUri || editing.slides[0]?.imageUrl) && (
                <TouchableOpacity onPress={handlePickImage} style={{ alignSelf: 'center', marginTop: 4 }}>
                  <Text style={[styles.linkText, { fontFamily: semi }]}>Change image</Text>
                </TouchableOpacity>
              )}

              {/* Slide title */}
              <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Title (optional — shown when no image)</Text>
              <TextInput
                style={[styles.input, { fontFamily: reg }]}
                value={editing.slides[0]?.title ?? ''}
                onChangeText={v => setSlide0Field('title', v)}
                placeholder="e.g. Eid Mubarak!"
                placeholderTextColor={Colors.inkMute}
              />

              {/* Slide body */}
              <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Body text (optional)</Text>
              <TextInput
                style={[styles.input, styles.inputMulti, { fontFamily: reg }]}
                value={editing.slides[0]?.body ?? ''}
                onChangeText={v => setSlide0Field('body', v)}
                placeholder="Short message shown on slide"
                placeholderTextColor={Colors.inkMute}
                multiline
                numberOfLines={3}
              />

              {/* Date range */}
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Start date</Text>
                  <TextInput
                    style={[styles.input, { fontFamily: reg }]}
                    value={editing.startDate}
                    onChangeText={v => setEditField('startDate', v)}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Colors.inkMute}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <View style={{ width: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { fontFamily: semi }]}>End date</Text>
                  <TextInput
                    style={[styles.input, { fontFamily: reg }]}
                    value={editing.endDate}
                    onChangeText={v => setEditField('endDate', v)}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Colors.inkMute}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>

              {/* Active toggle */}
              <View style={[styles.row, { alignItems: 'center', marginBottom: 16 }]}>
                <Text style={[styles.fieldLabel, { fontFamily: semi, marginBottom: 0, flex: 1 }]}>Active</Text>
                <Switch
                  value={editing.active}
                  onValueChange={v => setEditField('active', v)}
                  trackColor={{ true: Colors.freshGreen }}
                />
              </View>

              {/* Duration */}
              <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Display duration (seconds)</Text>
              <TextInput
                style={[styles.input, { fontFamily: reg }]}
                value={String(editing.slides[0]?.displayDurationSec ?? editing.displayDurationSec ?? 10)}
                onChangeText={v => setSlide0Field('displayDurationSec', parseInt(v) || 10)}
                keyboardType="number-pad"
                placeholder="10"
                placeholderTextColor={Colors.inkMute}
              />

              {/* Prayers */}
              <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Show after prayers</Text>
              <View style={styles.chipRow}>
                {PRAYERS.map(p => {
                  const on = editing.prayers.includes(p);
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[styles.chip, on && styles.chipOn]}
                      onPress={() => togglePrayer(p)}
                    >
                      <Text style={[styles.chipText, { fontFamily: semi }, on && styles.chipTextOn]}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Days of week */}
              <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Days of week (leave all off = every day)</Text>
              <View style={styles.chipRow}>
                {DAYS.map((d, i) => {
                  const on = (editing.daysOfWeek ?? []).includes(i);
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[styles.chip, on && styles.chipOn]}
                      onPress={() => toggleDay(i)}
                    >
                      <Text style={[styles.chipText, { fontFamily: semi }, on && styles.chipTextOn]}>{d}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Action buttons */}
              <View style={[styles.row, { marginTop: 20 }]}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnGhost, { flex: 1 }]}
                  onPress={() => { setEditing(null); setPickedUri(''); setStatus(''); }}
                  disabled={uploading}
                >
                  <Text style={[styles.btnTextDark, { fontFamily: semi }]}>Cancel</Text>
                </TouchableOpacity>
                <View style={{ width: 12 }} />
                <TouchableOpacity
                  style={[styles.btn, styles.btnGreen, { flex: 2 }]}
                  onPress={handleSaveCampaign}
                  disabled={uploading}
                >
                  {uploading
                    ? <ActivityIndicator color="#FFF" />
                    : <Text style={[styles.btnText, { fontFamily: semi }]}>💾 Save Campaign</Text>}
                </TouchableOpacity>
              </View>

            </ScrollView>
          )}

        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F7F7' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.blueDeep,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  headerClose: { fontSize: 18, color: 'rgba(255,255,255,0.8)' },

  scroll: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },

  tokenSection: { padding: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: Colors.blueDeep, marginBottom: 6 },

  hint: {
    fontSize: 13, color: Colors.inkMute, marginBottom: 14, lineHeight: 19,
  },
  statusText: {
    fontSize: 13, color: Colors.deepBlue, marginBottom: 12,
    backgroundColor: '#E8F0FE', borderRadius: 8, padding: 10,
  },

  tokenInput: {
    borderWidth: 1.5, borderColor: Colors.deepBlue, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: Colors.ink,
    marginBottom: 14, letterSpacing: 1,
  },

  row: { flexDirection: 'row', gap: 10, marginBottom: 12 },

  btn: {
    backgroundColor: Colors.deepBlue, borderRadius: 10,
    paddingHorizontal: 18, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  btnSmall: { paddingHorizontal: 12, paddingVertical: 8 },
  btnGreen: { backgroundColor: Colors.freshGreen },
  btnRed:   { backgroundColor: Colors.maroonRed },
  btnGhost: {
    backgroundColor: '#EDEDED', borderRadius: 10,
    paddingHorizontal: 18, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  btnText:     { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  btnTextDark: { color: Colors.ink, fontSize: 14, fontWeight: '600' },
  linkText:    { color: Colors.deepBlue, fontSize: 13, fontWeight: '600' },

  campaignCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  campaignHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8,
  },
  campaignTitle: { fontSize: 14, fontWeight: '600', color: Colors.ink },
  campaignMeta:  { fontSize: 11, color: Colors.inkMute, marginTop: 2 },
  campaignThumb: { width: '100%', height: 120, borderRadius: 8, marginBottom: 10 },
  campaignActions: { flexDirection: 'row', gap: 10 },

  fieldLabel: {
    fontSize: 13, fontWeight: '600', color: Colors.inkMute,
    marginBottom: 6, marginTop: 12,
  },
  input: {
    borderWidth: 1.5, borderColor: '#D0D0D0', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.ink,
    backgroundColor: '#FFFFFF',
  },
  inputMulti: { height: 80, textAlignVertical: 'top' },

  imagePicker: {
    borderWidth: 2, borderColor: Colors.deepBlue, borderStyle: 'dashed',
    borderRadius: 12, height: 180, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F0F4FF', overflow: 'hidden',
  },
  imagePickerText: { color: Colors.deepBlue, fontSize: 15 },
  imagePreview: { width: '100%', height: '100%' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    borderWidth: 1.5, borderColor: '#CCC', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: '#FFFFFF',
  },
  chipOn: { borderColor: Colors.deepBlue, backgroundColor: Colors.deepBlue },
  chipText: { fontSize: 12, color: Colors.ink },
  chipTextOn: { color: '#FFFFFF' },
});
