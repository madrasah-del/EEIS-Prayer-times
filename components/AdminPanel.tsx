/**
 * EEIS Admin Panel — secret administrator interface.
 *
 * Entry: tap the "Menu" title text in HamburgerMenu → enter passcode 348871.
 *
 * Features:
 *  - Manage billboard campaigns (create, edit, toggle active, delete)
 *  - Upload poster images directly to GitHub (no manual repo access needed)
 *  - Set prayers, days of week, date range, display duration per campaign
 *  - Preview a campaign exactly as it appears on the alarm screen
 *  - All changes synced to GitHub billboard-config.json in real time
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity, TextInput,
  Switch, Alert, ActivityIndicator, StyleSheet, SafeAreaView, Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

/** Read any URI (file:// or content://) as a base64 string using pure JS web APIs.
 *  Avoids expo-file-system entirely — no native module, no FilePermissionService crash. */
function readUriAsBase64(uri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.responseType = 'blob';
    xhr.onload = () => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // Strip the "data:image/...;base64," prefix
        const comma = dataUrl.indexOf(',');
        resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
      };
      reader.onerror = () => reject(new Error('FileReader failed'));
      reader.readAsDataURL(xhr.response as Blob);
    };
    xhr.onerror = () => reject(new Error('XHR failed'));
    xhr.open('GET', uri, true);
    xhr.send();
  });
}
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/theme';
import { BillboardConfig, BillboardCampaign, BillboardSlide, Billboard } from '../data/billboards';
import {
  fetchConfigFromGitHub,
  saveConfigToGitHub,
  uploadImageToGitHub,
  testGitHubToken,
} from '../data/githubApi';
import { BillboardSlideshow } from './BillboardSlideshow';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOKEN_KEY  = '@eeis_admin_gh_token';
const PRAYERS    = ['fajr', 'shuruq', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
const DAYS       = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const PRAYER_LABELS: Record<string, string> = {
  fajr: 'Fajr', shuruq: 'Shuruq', dhuhr: 'Dhuhr',
  asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha',
};

const EMPTY_CAMPAIGN = (): Omit<BillboardCampaign, 'id'> => ({
  active: true,
  startDate: new Date().toISOString().split('T')[0],
  endDate: '2026-12-31',
  prayers: ['dhuhr'],
  daysOfWeek: [4],
  displayDurationSec: 12,
  slides: [],
});

const EMPTY_SLIDE = (): BillboardSlide => ({
  id: Date.now().toString(),
  title: '',
  body: '',
  imageUrl: '',
  bgColor: '#063968',
});

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  visible:     boolean;
  onClose:     () => void;
  fontsLoaded: boolean;
};

// ─── Tab type ─────────────────────────────────────────────────────────────────

type Tab = 'campaigns' | 'edit' | 'settings';

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminPanel({ visible, onClose, fontsLoaded }: Props) {
  const bold = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;

  // ── State ────────────────────────────────────────────────────────────────────
  const [tab,       setTab]       = useState<Tab>('campaigns');
  const [token,     setToken]     = useState('');
  const [tokenSaved, setTokenSaved] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [config,    setConfig]    = useState<BillboardConfig | null>(null);
  const [configSha, setConfigSha] = useState('');
  const [loading,   setLoading]   = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Edit form state
  const [editId,      setEditId]      = useState<string | null>(null); // null = new
  const [editName,    setEditName]    = useState('');
  const [editCampaign, setEditCampaign] = useState<Omit<BillboardCampaign, 'id'>>(EMPTY_CAMPAIGN());

  // Preview
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewSlides,  setPreviewSlides]  = useState<Billboard[]>([]);

  // ── Token management ─────────────────────────────────────────────────────────

  const loadToken = useCallback(async () => {
    const t = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
    if (t) { setToken(t); setTokenSaved(true); }
  }, []);

  React.useEffect(() => {
    if (visible) loadToken();
  }, [visible, loadToken]);

  const handleSaveToken = async () => {
    if (!tokenInput.trim()) return;
    setLoading(true);
    const ok = await testGitHubToken(tokenInput.trim());
    setLoading(false);
    if (ok) {
      await AsyncStorage.setItem(TOKEN_KEY, tokenInput.trim());
      setToken(tokenInput.trim());
      setTokenSaved(true);
      setTokenInput('');
      setStatusMsg('GitHub token saved and verified.');
    } else {
      Alert.alert('Token Error', 'Could not connect to GitHub with this token. Check it has repo read/write access.');
    }
  };

  // ── Config fetch ─────────────────────────────────────────────────────────────

  const handleFetch = async () => {
    if (!token) { Alert.alert('No Token', 'Add a GitHub token in Settings first.'); return; }
    setLoading(true);
    setStatusMsg('Fetching from GitHub...');
    try {
      const { config: cfg, sha } = await fetchConfigFromGitHub(token);
      setConfig(cfg);
      setConfigSha(sha);
      setStatusMsg(`Loaded ${cfg.campaigns.length} campaigns.`);
    } catch (e: any) {
      setStatusMsg('');
      Alert.alert('Fetch failed', e.message);
    }
    setLoading(false);
  };

  // ── Save config to GitHub ─────────────────────────────────────────────────────

  const handleSave = async (updatedConfig: BillboardConfig) => {
    if (!token) { Alert.alert('No Token', 'Add a GitHub token in Settings first.'); return; }
    setLoading(true);
    setStatusMsg('Saving to GitHub...');
    try {
      const newSha = await saveConfigToGitHub(updatedConfig, configSha, token);
      setConfig(updatedConfig);
      setConfigSha(newSha);
      setStatusMsg('Saved to GitHub.');
    } catch (e: any) {
      setStatusMsg('');
      Alert.alert('Save failed', e.message);
    }
    setLoading(false);
  };

  // ── Campaign toggle ───────────────────────────────────────────────────────────

  const toggleCampaign = (id: string) => {
    if (!config) return;
    const updated = {
      ...config,
      campaigns: config.campaigns.map(c =>
        c.id === id ? { ...c, active: !c.active } : c,
      ),
    };
    handleSave(updated);
  };

  // ── Campaign delete ───────────────────────────────────────────────────────────

  const deleteCampaign = (id: string) => {
    Alert.alert('Delete Campaign', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (!config) return;
          handleSave({ ...config, campaigns: config.campaigns.filter(c => c.id !== id) });
        },
      },
    ]);
  };

  // ── Open edit form ────────────────────────────────────────────────────────────

  const openNew = () => {
    setEditId(null);
    setEditName('New Campaign');
    setEditCampaign(EMPTY_CAMPAIGN());
    setTab('edit');
  };

  const openEdit = (c: BillboardCampaign) => {
    setEditId(c.id);
    setEditName(c.id);
    setEditCampaign({
      active: c.active,
      startDate: c.startDate,
      endDate: c.endDate,
      prayers: [...c.prayers],
      daysOfWeek: [...(c.daysOfWeek ?? [])],
      displayDurationSec: c.displayDurationSec ?? 12,
      slides: c.slides.map(s => ({ ...s })),
    });
    setTab('edit');
  };

  // ── Save campaign from form ───────────────────────────────────────────────────

  const saveCampaign = () => {
    if (!editName.trim()) { Alert.alert('Name required'); return; }
    if (editCampaign.prayers.length === 0) { Alert.alert('Select at least one prayer'); return; }
    if (!config) { Alert.alert('Fetch config from GitHub first'); return; }

    const id = editId ?? editName.trim().toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
    const newCampaign: BillboardCampaign = { id, ...editCampaign };

    const campaigns = editId
      ? config.campaigns.map(c => c.id === editId ? newCampaign : c)
      : [...config.campaigns, newCampaign];

    handleSave({ ...config, campaigns });
    setTab('campaigns');
  };

  // ── Image upload ──────────────────────────────────────────────────────────────

  const pickAndUploadImage = async (slideIndex: number) => {
    if (!token) { Alert.alert('No Token', 'Add a GitHub token in Settings first.'); return; }
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*' });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      setLoading(true);
      setStatusMsg('Uploading image...');

      const base64 = await readUriAsBase64(asset.uri);

      const ext      = asset.name.split('.').pop() ?? 'jpg';
      const filename = `${Date.now()}-${asset.name.replace(/[^a-z0-9.\-_]/gi, '_')}`;
      const url      = await uploadImageToGitHub(filename, base64, token);

      // Update the slide's imageUrl
      const slides = editCampaign.slides.map((s, i) =>
        i === slideIndex ? { ...s, imageUrl: url } : s,
      );
      setEditCampaign(prev => ({ ...prev, slides }));
      setStatusMsg(`Uploaded: ${filename}`);
    } catch (e: any) {
      setStatusMsg('');
      Alert.alert('Upload failed', e.message);
    }
    setLoading(false);
  };

  // ── Preview ───────────────────────────────────────────────────────────────────

  const handlePreview = () => {
    const slides: Billboard[] = editCampaign.slides.map(s => ({
      id:      s.id,
      title:   s.title,
      body:    s.body ?? '',
      bgColor: s.bgColor ?? '#063968',
      imageUrl: s.imageUrl,
      displayDurationSec: editCampaign.displayDurationSec,
    }));
    if (slides.length === 0) { Alert.alert('No slides', 'Add at least one slide to preview.'); return; }
    setPreviewSlides(slides);
    setPreviewVisible(true);
  };

  // ── Slider helpers ────────────────────────────────────────────────────────────

  const togglePrayer = (p: string) => {
    setEditCampaign(prev => ({
      ...prev,
      prayers: prev.prayers.includes(p)
        ? prev.prayers.filter(x => x !== p)
        : [...prev.prayers, p],
    }));
  };

  const toggleDay = (d: number) => {
    setEditCampaign(prev => ({
      ...prev,
      daysOfWeek: (prev.daysOfWeek ?? []).includes(d)
        ? (prev.daysOfWeek ?? []).filter(x => x !== d)
        : [...(prev.daysOfWeek ?? []), d],
    }));
  };

  const addSlide = () => {
    setEditCampaign(prev => ({ ...prev, slides: [...prev.slides, EMPTY_SLIDE()] }));
  };

  const removeSlide = (i: number) => {
    setEditCampaign(prev => ({ ...prev, slides: prev.slides.filter((_, idx) => idx !== i) }));
  };

  const updateSlide = (i: number, patch: Partial<BillboardSlide>) => {
    setEditCampaign(prev => ({
      ...prev,
      slides: prev.slides.map((s, idx) => idx === i ? { ...s, ...patch } : s),
    }));
  };

  // ─── Render ────────────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { fontFamily: bold }]}>🔒 EEIS Admin</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
            <Text style={[styles.headerClose, { fontFamily: bold }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Status bar */}
        {(loading || statusMsg) ? (
          <View style={styles.statusBar}>
            {loading && <ActivityIndicator size="small" color={Colors.deepBlue} style={{ marginRight: 8 }} />}
            <Text style={[styles.statusText, { fontFamily: reg }]}>{statusMsg || 'Working…'}</Text>
          </View>
        ) : null}

        {/* Tab bar */}
        <View style={styles.tabBar}>
          {([['campaigns', 'Campaigns'], ['edit', 'Add / Edit'], ['settings', 'Settings']] as [Tab, string][]).map(([t, label]) => (
            <TouchableOpacity key={t} style={[styles.tabItem, tab === t && styles.tabItemActive]} onPress={() => setTab(t)}>
              <Text style={[styles.tabLabel, { fontFamily: semi }, tab === t && styles.tabLabelActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── CAMPAIGNS tab ────────────────────────────────────────────────────── */}
        {tab === 'campaigns' && (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <View style={styles.rowBetween}>
              <TouchableOpacity style={styles.btnBlue} onPress={handleFetch}>
                <Text style={[styles.btnText, { fontFamily: semi }]}>
                  {config ? '↻ Refresh' : '⬇ Fetch from GitHub'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnGreen} onPress={openNew}>
                <Text style={[styles.btnText, { fontFamily: semi }]}>+ New Campaign</Text>
              </TouchableOpacity>
            </View>

            {!config && (
              <Text style={[styles.hint, { fontFamily: reg }]}>
                Tap "Fetch from GitHub" to load the current billboard config.
              </Text>
            )}

            {config?.campaigns.map(c => (
              <View key={c.id} style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.cardTitle, { fontFamily: bold }]} numberOfLines={1}>{c.id}</Text>
                  <Switch
                    value={c.active}
                    onValueChange={() => toggleCampaign(c.id)}
                    trackColor={{ true: Colors.freshGreen, false: '#ccc' }}
                  />
                </View>
                <Text style={[styles.cardMeta, { fontFamily: reg }]}>
                  {c.prayers.map(p => PRAYER_LABELS[p] ?? p).join(', ')} ·{' '}
                  {(c.daysOfWeek ?? []).map(d => DAYS[d]).join(', ')}
                </Text>
                <Text style={[styles.cardMeta, { fontFamily: reg }]}>
                  {c.startDate} → {c.endDate} · {c.displayDurationSec ?? 12}s · {c.slides.length} slide(s)
                </Text>
                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.btnOutline} onPress={() => openEdit(c)}>
                    <Text style={[styles.btnOutlineText, { fontFamily: semi }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btnDanger} onPress={() => deleteCampaign(c.id)}>
                    <Text style={[styles.btnText, { fontFamily: semi }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        {/* ── ADD / EDIT tab ───────────────────────────────────────────────────── */}
        {tab === 'edit' && (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

            <Text style={[styles.label, { fontFamily: semi }]}>Campaign ID / Name</Text>
            <TextInput
              style={[styles.input, { fontFamily: reg }]}
              value={editName}
              onChangeText={setEditName}
              placeholder="e.g. thursday-jummah-2026"
              placeholderTextColor="#aaa"
              editable={!editId} // can't rename existing
            />

            <View style={styles.rowBetween}>
              <Text style={[styles.label, { fontFamily: semi }]}>Active</Text>
              <Switch
                value={editCampaign.active}
                onValueChange={v => setEditCampaign(p => ({ ...p, active: v }))}
                trackColor={{ true: Colors.freshGreen, false: '#ccc' }}
              />
            </View>

            <Text style={[styles.label, { fontFamily: semi }]}>Start Date (YYYY-MM-DD)</Text>
            <TextInput
              style={[styles.input, { fontFamily: reg }]}
              value={editCampaign.startDate}
              onChangeText={v => setEditCampaign(p => ({ ...p, startDate: v }))}
              placeholder="2026-05-15"
              placeholderTextColor="#aaa"
              keyboardType="numbers-and-punctuation"
            />

            <Text style={[styles.label, { fontFamily: semi }]}>End Date (YYYY-MM-DD)</Text>
            <TextInput
              style={[styles.input, { fontFamily: reg }]}
              value={editCampaign.endDate}
              onChangeText={v => setEditCampaign(p => ({ ...p, endDate: v }))}
              placeholder="2026-12-31"
              placeholderTextColor="#aaa"
              keyboardType="numbers-and-punctuation"
            />

            <Text style={[styles.label, { fontFamily: semi }]}>Display Duration (seconds)</Text>
            <TextInput
              style={[styles.input, { fontFamily: reg }]}
              value={String(editCampaign.displayDurationSec)}
              onChangeText={v => setEditCampaign(p => ({ ...p, displayDurationSec: parseInt(v) || 12 }))}
              keyboardType="number-pad"
            />

            <Text style={[styles.label, { fontFamily: semi }]}>Show on Prayers</Text>
            <View style={styles.chipRow}>
              {PRAYERS.map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.chip, editCampaign.prayers.includes(p) && styles.chipActive]}
                  onPress={() => togglePrayer(p)}
                >
                  <Text style={[styles.chipText, { fontFamily: semi }, editCampaign.prayers.includes(p) && styles.chipTextActive]}>
                    {PRAYER_LABELS[p]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { fontFamily: semi }]}>Show on Days</Text>
            <View style={styles.chipRow}>
              {DAYS.map((d, i) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.chip, (editCampaign.daysOfWeek ?? []).includes(i) && styles.chipActive]}
                  onPress={() => toggleDay(i)}
                >
                  <Text style={[styles.chipText, { fontFamily: semi }, (editCampaign.daysOfWeek ?? []).includes(i) && styles.chipTextActive]}>
                    {d}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Slides */}
            <Text style={[styles.label, { fontFamily: semi }]}>Slides</Text>
            {editCampaign.slides.map((slide, i) => (
              <View key={slide.id} style={styles.slideCard}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.slideNum, { fontFamily: bold }]}>Slide {i + 1}</Text>
                  <TouchableOpacity onPress={() => removeSlide(i)}>
                    <Text style={[styles.removeText, { fontFamily: semi }]}>✕ Remove</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.btnBlue, { marginBottom: 8 }]}
                  onPress={() => pickAndUploadImage(i)}
                >
                  <Text style={[styles.btnText, { fontFamily: semi }]}>
                    {slide.imageUrl ? '🖼 Replace Image' : '📷 Pick & Upload Image'}
                  </Text>
                </TouchableOpacity>

                {!!slide.imageUrl && (
                  <Text style={[styles.urlText, { fontFamily: reg }]} numberOfLines={1}>
                    ✓ {slide.imageUrl.split('/').pop()}
                  </Text>
                )}

                <TextInput
                  style={[styles.input, { fontFamily: reg }]}
                  value={slide.title}
                  onChangeText={v => updateSlide(i, { title: v })}
                  placeholder="Slide title"
                  placeholderTextColor="#aaa"
                />
                <TextInput
                  style={[styles.input, styles.inputMulti, { fontFamily: reg }]}
                  value={slide.body}
                  onChangeText={v => updateSlide(i, { body: v })}
                  placeholder="Slide body text (optional)"
                  placeholderTextColor="#aaa"
                  multiline
                />
                <TextInput
                  style={[styles.input, { fontFamily: reg }]}
                  value={slide.bgColor}
                  onChangeText={v => updateSlide(i, { bgColor: v })}
                  placeholder="Background colour e.g. #063968"
                  placeholderTextColor="#aaa"
                />
              </View>
            ))}

            <TouchableOpacity style={styles.btnOutline} onPress={addSlide}>
              <Text style={[styles.btnOutlineText, { fontFamily: semi }]}>+ Add Slide</Text>
            </TouchableOpacity>

            {/* Preview + Save */}
            <View style={[styles.rowBetween, { marginTop: 16 }]}>
              <TouchableOpacity style={[styles.btnBlue, { flex: 1, marginRight: 8 }]} onPress={handlePreview}>
                <Text style={[styles.btnText, { fontFamily: semi }]}>👁 Preview</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnGreen, { flex: 1 }]} onPress={saveCampaign}>
                <Text style={[styles.btnText, { fontFamily: semi }]}>💾 Save to GitHub</Text>
              </TouchableOpacity>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        )}

        {/* ── SETTINGS tab ─────────────────────────────────────────────────────── */}
        {tab === 'settings' && (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { fontFamily: bold }]}>GitHub Personal Access Token</Text>
              <Text style={[styles.hint, { fontFamily: reg }]}>
                Required for uploading images and saving billboard config. Create one at:{'\n'}
                GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens{'\n\n'}
                Set permissions: Contents → Read and write (for the EEIS-Prayer-times repo).
              </Text>
              {tokenSaved && (
                <Text style={[styles.hint, { fontFamily: reg, color: Colors.freshGreen }]}>
                  ✓ Token saved. Replace below to update.
                </Text>
              )}
              <TextInput
                style={[styles.input, { fontFamily: reg }]}
                value={tokenInput}
                onChangeText={setTokenInput}
                placeholder={tokenSaved ? '••••••••••••••••••• (tap to replace)' : 'Paste GitHub token here'}
                placeholderTextColor="#aaa"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity style={styles.btnBlue} onPress={handleSaveToken}>
                <Text style={[styles.btnText, { fontFamily: semi }]}>
                  {loading ? 'Verifying…' : 'Save & Verify Token'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.card, { marginTop: 8 }]}>
              <Text style={[styles.cardTitle, { fontFamily: bold }]}>Quick Test</Text>
              <Text style={[styles.hint, { fontFamily: reg }]}>
                Fetch the live config from GitHub to verify your token works.
              </Text>
              <TouchableOpacity style={styles.btnBlue} onPress={handleFetch}>
                <Text style={[styles.btnText, { fontFamily: semi }]}>⬇ Test — Fetch Config</Text>
              </TouchableOpacity>
              {config && (
                <Text style={[styles.hint, { fontFamily: reg, color: Colors.freshGreen, marginTop: 8 }]}>
                  ✓ Connected — {config.campaigns.length} campaigns found.
                </Text>
              )}
            </View>
          </ScrollView>
        )}

        {/* Billboard preview modal */}
        <BillboardSlideshow
          visible={previewVisible}
          slides={previewSlides}
          onClose={() => setPreviewVisible(false)}
        />

      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea:    { flex: 1, backgroundColor: '#F5F5F5' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#063968', paddingHorizontal: 20, paddingVertical: 14 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#FFF' },
  headerClose: { fontSize: 18, color: '#FFF', padding: 4 },
  statusBar:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F0FE', paddingHorizontal: 16, paddingVertical: 8 },
  statusText:  { fontSize: 12, color: Colors.deepBlue, flex: 1 },
  tabBar:      { flexDirection: 'row', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#DDE3EA' },
  tabItem:     { flex: 1, alignItems: 'center', paddingVertical: 11 },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: Colors.deepBlue },
  tabLabel:    { fontSize: 13, color: Colors.inkMute },
  tabLabelActive: { color: Colors.deepBlue, fontWeight: '600' },
  scroll:      { flex: 1 },
  scrollContent: { padding: 16 },
  card:        { backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
  cardTitle:   { fontSize: 14, fontWeight: '700', color: Colors.ink, marginBottom: 4 },
  cardMeta:    { fontSize: 12, color: Colors.inkMute, marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  rowBetween:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  label:       { fontSize: 13, fontWeight: '600', color: Colors.ink, marginBottom: 6, marginTop: 4 },
  input:       { borderWidth: 1, borderColor: '#DDE3EA', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: Colors.ink, backgroundColor: '#FFF', marginBottom: 8 },
  inputMulti:  { minHeight: 60, textAlignVertical: 'top' },
  chipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip:        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#C0CCD8', backgroundColor: '#FFF' },
  chipActive:  { backgroundColor: Colors.deepBlue, borderColor: Colors.deepBlue },
  chipText:    { fontSize: 12, color: Colors.inkMute },
  chipTextActive: { color: '#FFF' },
  slideCard:   { backgroundColor: '#F8F9FF', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#DDE3EA' },
  slideNum:    { fontSize: 13, fontWeight: '700', color: Colors.deepBlue },
  removeText:  { fontSize: 12, color: Colors.maroonRed },
  urlText:     { fontSize: 11, color: Colors.freshGreen, marginBottom: 8 },
  hint:        { fontSize: 12, color: Colors.inkMute, lineHeight: 18, marginBottom: 8 },
  btnBlue:     { backgroundColor: Colors.deepBlue, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center' },
  btnGreen:    { backgroundColor: '#2E7D32', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center' },
  btnDanger:   { backgroundColor: Colors.maroonRed, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center' },
  btnOutline:  { borderWidth: 1, borderColor: Colors.deepBlue, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center' },
  btnText:     { fontSize: 13, fontWeight: '600', color: '#FFF' },
  btnOutlineText: { fontSize: 13, fontWeight: '600', color: Colors.deepBlue },
});
