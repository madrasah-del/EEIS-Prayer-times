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
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import {
  fetchConfigFromGitHub,
  saveConfigToGitHub,
  uploadImageToGitHub,
  testGitHubToken,
  BILLBOARD_TOKEN,
} from '../data/githubApi';
import { BillboardConfig, BillboardCampaign, BillboardSlide, ScrollingMessage } from '../data/billboards';
import { signConfig } from '../data/billboardSign';
import { Colors } from '../constants/theme';

const TOKEN_KEY = '@eeis_admin_gh_token';

const PRAYERS = ['fajr', 'shuruq', 'dhuhr', 'asr', 'maghrib', 'isha', 'jummah1', 'jummah2'];
const PRAYER_LABELS: Record<string, string> = {
  fajr: 'Fajr', shuruq: 'Shuruq', dhuhr: 'Dhuhr', asr: 'Asr',
  maghrib: 'Maghrib', isha: 'Isha', jummah1: 'Jummah 1', jummah2: 'Jummah 2',
};
const DAYS    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Message styling palettes ('' = default / none)
const MSG_COLORS: { value: string }[] = [
  { value: '' }, { value: '#8B1A2E' }, { value: '#0B5EA8' }, { value: '#2E7D32' },
  { value: '#E65100' }, { value: '#6A1B9A' }, { value: '#000000' }, { value: '#C62828' },
];
const MSG_HIGHLIGHTS: { value: string }[] = [
  { value: '' }, { value: '#FFF59D' }, { value: '#FFCDD2' }, { value: '#C8E6C9' },
  { value: '#BBDEFB' }, { value: '#FFE0B2' },
];

// ─── Date helpers ─────────────────────────────────────────────────────────────
/** Format YYYY-MM-DD → DD/MM/YYYY for display */
function fmtDateUK(iso: string): string {
  if (!iso || iso.length < 10) return '';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
/** Convert JS Date → YYYY-MM-DD */
function dateToISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
/** Convert YYYY-MM-DD string → JS Date (noon UTC to avoid timezone flip) */
function isoToDate(iso: string): Date {
  return iso ? new Date(`${iso}T12:00:00Z`) : new Date();
}

// ─── XHR+FileReader base64 reader (no expo-file-system needed) ────────────────

function readUriAsBase64(uri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr        = new XMLHttpRequest();
    xhr.responseType = 'blob';
    xhr.onload = () => {
      // Validate that we actually got content (not an empty blob)
      const blob = xhr.response as Blob;
      if (!blob || blob.size === 0) {
        reject(new Error('Image file appears empty or inaccessible. Try picking the image again.'));
        return;
      }
      const reader  = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const comma   = dataUrl.indexOf(',');
        const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
        if (!b64 || b64.length < 100) {
          reject(new Error('Image data is too small — the file may be corrupt or inaccessible.'));
          return;
        }
        resolve(b64);
      };
      reader.onerror = () => reject(new Error('FileReader failed'));
      reader.readAsDataURL(blob);
    };
    xhr.onerror = () => reject(new Error('XHR failed reading file — check storage permissions'));
    xhr.open('GET', uri, true);
    xhr.send();
  });
}

// ─── Empty campaign factory ───────────────────────────────────────────────────

function emptySlide(): BillboardSlide {
  return {
    id:    Date.now().toString() + Math.floor(Math.random() * 1000),
    title: '',
    body:  '',
    imageUrl: '',
    bgColor:  '#063968',
    displayDurationSec: 10,
    orientation: 'portrait',                // default; admin picks per poster
    prayers: ['fajr', 'maghrib', 'isha'],  // sensible default; admin adjusts per poster
    daysOfWeek: [],                         // every day
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

  // ── Tab state ───────────────────────────────────────────────────────────────
  const [adminTab, setAdminTab] = useState<'campaigns' | 'messages' | 'help'>('campaigns');

  // ── Scrolling messages state ─────────────────────────────────────────────────
  const [msgText,      setMsgText]      = useState('');
  const [msgPrayers,   setMsgPrayers]   = useState<string[]>(['fajr']);
  const [msgDays,      setMsgDays]      = useState<number[]>([]);
  const [msgStartDate, setMsgStartDate] = useState(dateToISO(new Date()));  // default today
  const [msgEndDate,   setMsgEndDate]   = useState('');
  const [msgSaving,    setMsgSaving]    = useState(false);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null); // null = new message
  // Rich-text styling for the message
  const [msgSpeed,     setMsgSpeed]     = useState<'slow' | 'medium' | 'fast'>('fast');
  const [msgColor,     setMsgColor]     = useState<string>('');   // '' = default maroon
  const [msgBold,      setMsgBold]      = useState(false);
  const [msgItalic,    setMsgItalic]    = useState(false);
  const [msgUnderline, setMsgUnderline] = useState(false);
  const [msgHighlight, setMsgHighlight] = useState<string>('');   // '' = none
  const [msgFlash,     setMsgFlash]     = useState(false);
  const [msgFontScale, setMsgFontScale] = useState(1);

  // ── Date picker state ────────────────────────────────────────────────────────
  // Which date field is open: 'campStart'|'campEnd'|'msgStart'|'msgEnd'|null
  const [datePickerTarget, setDatePickerTarget] = useState<string | null>(null);

  // ── Admin password reset modal ────────────────────────────────────────────────
  const [pwdModalVisible, setPwdModalVisible] = useState(false);
  const [pwdInput,   setPwdInput]   = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdError,   setPwdError]   = useState('');

  const handleSetPassword = useCallback(async () => {
    if (pwdInput.length < 4) { setPwdError('Password must be at least 4 characters'); return; }
    if (pwdInput !== pwdConfirm) { setPwdError('Passwords do not match'); return; }
    await AsyncStorage.setItem('@eeis_admin_password_v1', pwdInput).catch(() => {});
    setPwdModalVisible(false);
    setPwdInput(''); setPwdConfirm(''); setPwdError('');
    Alert.alert('Password updated', 'Your admin password has been set on this device.');
  }, [pwdInput, pwdConfirm]);

  // ── Auth state ──────────────────────────────────────────────────────────────
  // Token is now hardcoded (BILLBOARD_TOKEN) — admins never enter it.
  const [token,      setToken]      = useState(BILLBOARD_TOKEN);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenValid, setTokenValid] = useState(true);

  // ── Config state ────────────────────────────────────────────────────────────
  const [config,     setConfig]     = useState<BillboardConfig | null>(null);
  const [configSha,  setConfigSha]  = useState('');
  const [loading,    setLoading]    = useState(false);
  const [status,     setStatus]     = useState('');

  // Admin passphrase (stored on unlock) — used to SIGN the config so users' apps
  // trust it. Without it we cannot sign; warn the admin to re-enter via the menu.
  const [adminPass, setAdminPass] = useState('');
  useEffect(() => {
    if (visible) AsyncStorage.getItem('@eeis_admin_pass').then(p => setAdminPass(p ?? '')).catch(() => {});
  }, [visible]);

  // Sign the config with the admin passphrase, then save to GitHub. All saves go
  // through here so every write is signed (unsigned configs are ignored by users' apps).
  const saveSignedConfig = useCallback(async (cfg: BillboardConfig): Promise<string> => {
    let toSave: BillboardConfig = cfg;
    if (adminPass) {
      const { signature, ...rest } = cfg as any;  // sign without an existing signature
      const sig = await signConfig(rest as BillboardConfig, adminPass);
      toSave = { ...(rest as BillboardConfig), signature: sig };
    }
    const newSha = await saveConfigToGitHub(toSave, configSha, token);
    // Wipe cache so the app re-fetches the freshly-signed config immediately
    await AsyncStorage.removeItem('@eeis_billboard_config_v1').catch(() => {});
    await AsyncStorage.removeItem('@eeis_billboard_cache_ts').catch(() => {});
    return newSha;
  }, [adminPass, configSha, token]);

  // ── Edit state ──────────────────────────────────────────────────────────────
  const [editing,    setEditing]    = useState<BillboardCampaign | null>(null);
  const [editSlideIdx, setEditSlideIdx] = useState(0);          // which slide is being edited
  // Newly-picked local image URIs, keyed by slide id (uploaded on save)
  const [pickedUris, setPickedUris] = useState<Record<string, string>>({});
  const [uploading,  setUploading]  = useState(false);
  // Local thumbnail cache: campaignId → local content:// URI (shown immediately after upload)
  const [localThumbs, setLocalThumbs] = useState<Record<string, string>>({});

  // Auto-fetch config on open (token is always present now)
  useEffect(() => {
    if (visible && !config) {
      handleFetchConfig();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

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

  // ── Date picker handler ──────────────────────────────────────────────────────
  const handleDatePicked = useCallback((_: any, date?: Date) => {
    const target = datePickerTarget;
    setDatePickerTarget(null);
    if (!date) return;
    const iso = dateToISO(date);
    if (target === 'campStart')      setEditing(prev => prev ? { ...prev, startDate: iso } : prev);
    else if (target === 'campEnd')   setEditing(prev => prev ? { ...prev, endDate: iso } : prev);
    else if (target === 'msgStart')  setMsgStartDate(iso);
    else if (target === 'msgEnd')    setMsgEndDate(iso);
  }, [datePickerTarget]);

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
    // Save immediately (signed)
    saveSignedConfig(updated)
      .then(newSha => { setConfigSha(newSha); setStatus('Saved'); })
      .catch(e  => setStatus(`Save failed: ${e.message}`));
  }, [config, saveSignedConfig]);

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
          // Drop the deleted campaign's local thumbnail immediately
          setLocalThumbs(prev => { const n = { ...prev }; delete n[id]; return n; });
          try {
            const newSha = await saveSignedConfig(updated);
            setConfigSha(newSha);
            // Wipe the cached config so the app + preview re-fetch fresh and
            // never render a deleted campaign from stale local storage.
            await AsyncStorage.removeItem('@eeis_billboard_config_v1').catch(() => {});
            await AsyncStorage.removeItem('@eeis_billboard_cache_ts').catch(() => {});
            setStatus('Campaign deleted');
          } catch (e: any) {
            setStatus(`Delete failed: ${e.message}`);
          }
        },
      },
    ]);
  }, [config, configSha, token]);

  const handleEditCampaign = useCallback((c: BillboardCampaign) => {
    // Seed each slide's targeting from the campaign-level values when missing, so the
    // editor shows the effective prayers/days for older single-slide campaigns.
    const slides = c.slides.map(s => ({
      ...s,
      prayers:    (s.prayers && s.prayers.length) ? s.prayers : (c.prayers ?? []),
      daysOfWeek: s.daysOfWeek ?? c.daysOfWeek ?? [],
    }));
    setEditing({ ...c, slides });
    setEditSlideIdx(0);
    setPickedUris({});
    setStatus('');
  }, []);

  const handleNewCampaign = useCallback(() => {
    setEditing(emptyCampaign());
    setEditSlideIdx(0);
    setPickedUris({});
    setStatus('');
  }, []);

  // ── Slide management ──────────────────────────────────────────────────────────

  const addSlide = useCallback(() => {
    if (!editing) return;
    const s = emptySlide();
    const slides = [...editing.slides, s];
    setEditing({ ...editing, slides });
    setEditSlideIdx(slides.length - 1);
  }, [editing]);

  const removeSlide = useCallback((idx: number) => {
    if (!editing || editing.slides.length <= 1) return;
    const removed = editing.slides[idx];
    const slides = editing.slides.filter((_, i) => i !== idx);
    setEditing({ ...editing, slides });
    setEditSlideIdx(Math.max(0, idx - 1));
    if (removed) setPickedUris(prev => { const n = { ...prev }; delete n[removed.id]; return n; });
  }, [editing]);

  const setSlideField = (idx: number, key: keyof BillboardSlide, value: any) => {
    if (!editing || !editing.slides[idx]) return;
    const slides = editing.slides.slice();
    slides[idx] = { ...slides[idx], [key]: value };
    setEditing({ ...editing, slides });
  };

  // ── Image picker for a given slide ───────────────────────────────────────────

  const handlePickImage = useCallback(async (idx: number) => {
    if (!editing) return;
    const slide = editing.slides[idx];
    if (!slide) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*' });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      setPickedUris(prev => ({ ...prev, [slide.id]: asset.uri }));
    } catch (e: any) {
      setStatus(`Image pick failed: ${e.message}`);
    }
  }, [editing]);

  // ── Save campaign: upload any newly-picked slide images, then save config ─────

  const handleSaveCampaign = useCallback(async () => {
    if (!editing || !config) return;
    const hasContent = editing.slides.some(s => s.title || s.body || s.imageUrl || pickedUris[s.id]);
    if (!hasContent) { setStatus('Add a title or pick a poster image'); return; }
    setUploading(true);
    setStatus('Saving…');
    try {
      const newSlides: BillboardSlide[] = [];
      for (let i = 0; i < editing.slides.length; i++) {
        const slide = editing.slides[i];
        let imageUrl = slide.imageUrl ?? '';
        const picked = pickedUris[slide.id];
        if (picked) {
          setStatus(`Uploading poster ${i + 1}…`);
          const base64   = await readUriAsBase64(picked);
          const ext      = picked.split('.').pop()?.toLowerCase() ?? 'jpg';
          const filename = `poster_${editing.id}_${slide.id}.${ext}`;
          imageUrl = await uploadImageToGitHub(filename, base64, token);
        }
        newSlides.push({ ...slide, imageUrl: imageUrl || undefined, bgColor: slide.bgColor ?? '#063968' });
      }

      const updatedCampaign: BillboardCampaign = { ...editing, slides: newSlides };
      const exists = config.campaigns.some(c => c.id === editing.id);
      const campaigns = exists
        ? config.campaigns.map(c => c.id === editing.id ? updatedCampaign : c)
        : [...config.campaigns, updatedCampaign];
      const updated: BillboardConfig = { ...config, campaigns };

      setStatus('Signing & saving to GitHub…');
      const newSha = await saveSignedConfig(updated);
      setConfig(updated);
      setConfigSha(newSha);
      // Local thumbnail for the FIRST slide that was just picked (instant display)
      const firstPicked = newSlides.map(s => pickedUris[s.id]).find(Boolean);
      if (firstPicked) setLocalThumbs(prev => ({ ...prev, [updatedCampaign.id]: firstPicked }));
      await AsyncStorage.removeItem('@eeis_billboard_config_v1').catch(() => {});
      await AsyncStorage.removeItem('@eeis_billboard_cache_ts').catch(() => {});
      setEditing(null);
      setPickedUris({});
      setStatus('Campaign saved ✓');
    } catch (e: any) {
      setStatus(`Failed: ${e.message}`);
    } finally {
      setUploading(false);
    }
  }, [editing, config, token, pickedUris, saveSignedConfig]);

  // ── Edit form field helpers ──────────────────────────────────────────────────

  const setEditField = (key: keyof BillboardCampaign, value: any) => {
    if (!editing) return;
    setEditing({ ...editing, [key]: value });
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <TouchableOpacity onPress={() => { setPwdInput(''); setPwdConfirm(''); setPwdError(''); setPwdModalVisible(true); }} hitSlop={12}>
                <Text style={[styles.headerReset, { fontFamily: semi }]}>🔑 Password</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} hitSlop={12}>
                <Text style={[styles.headerClose, { fontFamily: bold }]}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Tab bar ────────────────────────────────────────────────────── */}
          <View style={styles.adminTabBar}>
            <TouchableOpacity
              style={[styles.adminTab, adminTab === 'campaigns' && styles.adminTabActive]}
              onPress={() => setAdminTab('campaigns')}
            >
              <Text style={[styles.adminTabText, { fontFamily: semi }, adminTab === 'campaigns' && styles.adminTabTextActive]}>
                📋 Campaigns
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.adminTab, adminTab === 'messages' && styles.adminTabActive]}
              onPress={() => setAdminTab('messages')}
            >
              <Text style={[styles.adminTabText, { fontFamily: semi }, adminTab === 'messages' && styles.adminTabTextActive]}>
                📣 Messages
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.adminTab, adminTab === 'help' && styles.adminTabActive]}
              onPress={() => setAdminTab('help')}
            >
              <Text style={[styles.adminTabText, { fontFamily: semi }, adminTab === 'help' && styles.adminTabTextActive]}>
                ❓ Help
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Help tab ───────────────────────────────────────────────────── */}
          {adminTab === 'help' && (
            <ScrollView style={styles.scroll} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
              {[
                {
                  title: '🔑 Setting up your GitHub Token',
                  body: `1. Go to github.com → Settings → Developer settings → Personal access tokens → Tokens (classic)\n2. Click "Generate new token (classic)"\n3. Give it a name like "EEIS Billboard"\n4. Under Scopes, tick "repo" (full control of private repositories)\n5. Click "Generate token" and COPY it immediately (it won't show again)\n6. Paste it in the GitHub Token field on the Campaigns tab and tap "Verify & Save Token"`,
                },
                {
                  title: '📱 Uploading a poster from your phone',
                  body: `1. Go to the Campaigns tab and tap "+ New Campaign" or edit an existing one\n2. In the slide editor, tap "📷 Pick Image from Phone"\n3. Choose your poster image (JPG/PNG)\n4. Tap "Save Campaign" — the image is uploaded to GitHub automatically\n\nRecommended size: 1080×1920 px (portrait), under 500 KB`,
                },
                {
                  title: '🐙 Uploading a poster from GitHub',
                  body: `If your image is already on GitHub, enter the raw URL directly in the "Image URL" field:\nhttps://raw.githubusercontent.com/madrasah-del/EEIS-Prayer-times/main/posters/example.jpg\n\nYou can host images in any public folder in the repo.`,
                },
                {
                  title: '📅 Scheduling fields explained',
                  body: `• Active — toggle OFF to disable a campaign without deleting it\n• Start Date / End Date — YYYY-MM-DD format, inclusive (e.g. 2026-06-01 to 2026-06-30)\n• Prayers — which prayers trigger this campaign (fajr, dhuhr, asr, maghrib, isha)\n• Days of Week — 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat (leave empty for every day)\n• Max Times Per Day — billboard will stop showing after this many times in one day\n• Max Times Per Week — billboard will stop showing after this many times in one ISO week\n• Display Duration — seconds each slide shows before auto-advancing (default: 10s)\n\nExample: Ramadan campaign that shows at Fajr and Isha every day for 30 days, at most once per day:\n  prayers: ["fajr", "isha"], maxTimesPerDay: 1`,
                },
                {
                  title: '🧪 How to test a campaign',
                  body: `1. Set startDate and endDate to today's date\n2. Set active: true\n3. Save the campaign\n4. Test methods:\n   • Tap a prayer notification → billboard fires on tap\n   • Alarm screen "Stop" button → billboard fires via deep link\n   • Open the app within 30 minutes of a prayer time that has an active campaign → billboard fires automatically on app open\n5. You should see the slideshow appear immediately`,
                },
                {
                  title: '👁️ What users see',
                  body: `The billboard appears as a full-screen slideshow (modal overlay) that auto-advances between slides.\n\n• Swipe left to advance, swipe right to go back\n• Tap ✕ to close at any time\n• Dot indicators show position (e.g. 1/3)\n• Navigation hint at the bottom shows direction\n\nThe billboard fires in 3 situations:\n1. Prayer alarm fires and user stops it via the alarm screen\n2. User taps the prayer notification directly\n3. User opens the app within 30 minutes of a prayer time`,
                },
                {
                  title: '⚠️ Frequency limits',
                  body: `To avoid showing the billboard too often, use these fields:\n• maxTimesPerDay — e.g. 1 = show at most once per day\n• maxTimesPerWeek — e.g. 3 = show at most 3 times this week\n\nLeave blank (or 0) for unlimited.\n\nExample for a weekly Jummah reminder:\n  prayers: ["dhuhr"], days: [5], maxTimesPerDay: 1`,
                },
              ].map(item => (
                <View key={item.title} style={styles.helpCard}>
                  <Text style={[styles.helpCardTitle, { fontFamily: bold }]}>{item.title}</Text>
                  <Text style={[styles.helpCardBody, { fontFamily: reg }]}>{item.body}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          {/* ── Messages tab ───────────────────────────────────────────────── */}
          {adminTab === 'messages' && (
            <ScrollView style={styles.scroll} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
              <Text style={[styles.sectionTitle, { fontFamily: semi }]}>📣 Scrolling Messages</Text>
              <Text style={[styles.hint, { fontFamily: reg }]}>
                Messages appear on the countdown strip, cycling alongside headlines. Configure one message at a time.
              </Text>

              {/* Existing messages list */}
              {(config?.scrollingMessages ?? []).length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={[styles.hint, { fontFamily: semi, color: Colors.ink, marginBottom: 6 }]}>
                    Saved messages ({config!.scrollingMessages!.length}):
                  </Text>
                  {config!.scrollingMessages!.map((m, idx) => (
                    <View key={m.id} style={[styles.campaignCard, { marginBottom: 8, borderLeftWidth: editingMsgId === m.id ? 3 : 0, borderLeftColor: Colors.deepBlue }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={[{ fontSize: 13, fontWeight: '600', color: m.active ? Colors.ink : Colors.inkMute, flex: 1 }, { fontFamily: semi }]} numberOfLines={2}>
                          {m.active ? '🟢' : '⚫'} {m.text}
                        </Text>
                        <TouchableOpacity
                          onPress={() => {
                            // Load message into form for editing
                            setEditingMsgId(m.id);
                            setMsgText(m.text);
                            setMsgPrayers(m.prayers);
                            setMsgDays(m.daysOfWeek ?? []);
                            setMsgStartDate(m.startDate);
                            setMsgEndDate(m.endDate);
                            setMsgSpeed(m.scrollSpeed ?? 'fast');
                            setMsgColor(m.color ?? '');
                            setMsgBold(!!m.bold);
                            setMsgItalic(!!m.italic);
                            setMsgUnderline(!!m.underline);
                            setMsgHighlight(m.highlight ?? '');
                            setMsgFlash(!!m.flash);
                            setMsgFontScale(m.fontScale ?? 1);
                          }}
                          style={{ padding: 6 }}
                        >
                          <Text style={{ fontSize: 15 }}>✏️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={async () => {
                            if (!config || !token) return;
                            const updated: BillboardConfig = {
                              ...config,
                              scrollingMessages: config.scrollingMessages!.filter((_, i) => i !== idx),
                            };
                            setMsgSaving(true);
                            try {
                              const newSha = await saveSignedConfig(updated);
                              setConfig(updated);
                              if (newSha) setConfigSha(newSha);
                              await AsyncStorage.removeItem('@eeis_billboard_config_v1').catch(() => {});
                              await AsyncStorage.removeItem('@eeis_billboard_cache_ts').catch(() => {});
                              if (editingMsgId === m.id) {
                                setEditingMsgId(null);
                                setMsgText(''); setMsgPrayers(['fajr']); setMsgDays([]); setMsgStartDate(dateToISO(new Date())); setMsgEndDate('');
                              }
                            } catch { /* ignore */ }
                            setMsgSaving(false);
                          }}
                          style={{ marginLeft: 4, padding: 6 }}
                        >
                          <Text style={{ fontSize: 15 }}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={[{ fontSize: 11, color: Colors.inkMute, marginTop: 4 }, { fontFamily: reg }]}>
                        Prayers: {m.prayers.join(', ')} · {fmtDateUK(m.startDate)} → {fmtDateUK(m.endDate)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Add / Edit message form */}
              <View style={styles.campaignCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={[styles.sectionTitle, { fontFamily: semi }]}>
                    {editingMsgId ? '✏️ Edit Message' : '+ New Message'}
                  </Text>
                  {editingMsgId && (
                    <TouchableOpacity onPress={() => {
                      setEditingMsgId(null);
                      setMsgText(''); setMsgPrayers(['fajr']); setMsgDays([]); setMsgStartDate(dateToISO(new Date())); setMsgEndDate('');
                    }}>
                      <Text style={{ fontSize: 12, color: Colors.inkMute }}>✕ Cancel edit</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Message text *</Text>
                <TextInput
                  style={[styles.input, styles.inputMulti, { fontFamily: reg }]}
                  value={msgText}
                  onChangeText={setMsgText}
                  placeholder="E.g. Jumu'ah Mubarak! Jama'at at 1:30 PM today"
                  placeholderTextColor={Colors.inkMute}
                  multiline
                />

                <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Prayers (tap to toggle)</Text>
                <View style={styles.chipRow}>
                  {(() => {
                    const MSG_PRAYERS = ['fajr','shuruq','dhuhr','asr','maghrib','isha','jummah1','jummah2'];
                    const allOn = MSG_PRAYERS.every(p => msgPrayers.includes(p));
                    return (
                      <TouchableOpacity
                        style={[styles.chip, allOn && styles.chipOn]}
                        onPress={() => setMsgPrayers(allOn ? [] : [...MSG_PRAYERS])}
                      >
                        <Text style={[styles.chipText, { fontFamily: semi }, allOn && styles.chipTextOn]}>ALL</Text>
                      </TouchableOpacity>
                    );
                  })()}
                  {['fajr','shuruq','dhuhr','asr','maghrib','isha','jummah1','jummah2'].map(p => {
                    const active = msgPrayers.includes(p);
                    return (
                      <TouchableOpacity
                        key={p}
                        style={[styles.chip, active && styles.chipOn]}
                        onPress={() => setMsgPrayers(prev => active ? prev.filter(x => x !== p) : [...prev, p])}
                      >
                        <Text style={[styles.chipText, { fontFamily: semi }, active && styles.chipTextOn]}>
                          {PRAYER_LABELS[p] ?? (p.charAt(0).toUpperCase() + p.slice(1))}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Days of week</Text>
                <View style={styles.chipRow}>
                  {(() => {
                    const allDays = [0,1,2,3,4,5,6].every(i => msgDays.includes(i));
                    return (
                      <TouchableOpacity
                        style={[styles.chip, allDays && styles.chipOn]}
                        onPress={() => setMsgDays(allDays ? [] : [0,1,2,3,4,5,6])}
                      >
                        <Text style={[styles.chipText, { fontFamily: semi }, allDays && styles.chipTextOn]}>ALL</Text>
                      </TouchableOpacity>
                    );
                  })()}
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => {
                    const active = msgDays.includes(i);
                    return (
                      <TouchableOpacity
                        key={d}
                        style={[styles.chip, active && styles.chipOn]}
                        onPress={() => setMsgDays(prev => active ? prev.filter(x => x !== i) : [...prev, i])}
                      >
                        <Text style={[styles.chipText, { fontFamily: semi }, active && styles.chipTextOn]}>{d}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Start date</Text>
                    <TouchableOpacity style={styles.datePill} onPress={() => setDatePickerTarget('msgStart')}>
                      <Text style={[styles.datePillText, { fontFamily: semi }]}>
                        {msgStartDate ? fmtDateUK(msgStartDate) : 'Tap to pick'}
                      </Text>
                      <Text style={styles.datePillArrow}>📅</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ width: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { fontFamily: semi }]}>End date</Text>
                    <TouchableOpacity style={styles.datePill} onPress={() => setDatePickerTarget('msgEnd')}>
                      <Text style={[styles.datePillText, { fontFamily: semi }]}>
                        {msgEndDate ? fmtDateUK(msgEndDate) : 'Tap to pick'}
                      </Text>
                      <Text style={styles.datePillArrow}>📅</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* ── Styling ── */}
                <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Scroll speed</Text>
                <View style={styles.chipRow}>
                  {(['slow','medium','fast'] as const).map(s => (
                    <TouchableOpacity key={s} style={[styles.chip, msgSpeed === s && styles.chipOn]} onPress={() => setMsgSpeed(s)}>
                      <Text style={[styles.chipText, { fontFamily: semi }, msgSpeed === s && styles.chipTextOn]}>{s.charAt(0).toUpperCase() + s.slice(1)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Text colour</Text>
                <View style={styles.chipRow}>
                  {MSG_COLORS.map(c => (
                    <TouchableOpacity
                      key={c.value || 'default'}
                      style={[styles.swatch, { backgroundColor: c.value || '#8B1A2E' }, (msgColor === c.value) && styles.swatchOn]}
                      onPress={() => setMsgColor(c.value)}
                    >
                      {(msgColor === c.value) && <Text style={styles.swatchTick}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Highlight</Text>
                <View style={styles.chipRow}>
                  {MSG_HIGHLIGHTS.map(c => (
                    <TouchableOpacity
                      key={c.value || 'none'}
                      style={[styles.swatch, { backgroundColor: c.value || '#FFF', borderColor: c.value ? c.value : '#CCC' }, (msgHighlight === c.value) && styles.swatchOn]}
                      onPress={() => setMsgHighlight(c.value)}
                    >
                      <Text style={[styles.swatchTick, !c.value && { color: '#999' }]}>{(msgHighlight === c.value) ? '✓' : (c.value ? '' : '∅')}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Style</Text>
                <View style={styles.chipRow}>
                  <TouchableOpacity style={[styles.chip, msgBold && styles.chipOn]} onPress={() => setMsgBold(b => !b)}>
                    <Text style={[styles.chipText, { fontFamily: semi, fontWeight: '800' }, msgBold && styles.chipTextOn]}>Bold</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.chip, msgItalic && styles.chipOn]} onPress={() => setMsgItalic(b => !b)}>
                    <Text style={[styles.chipText, { fontFamily: semi, fontStyle: 'italic' }, msgItalic && styles.chipTextOn]}>Italic</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.chip, msgUnderline && styles.chipOn]} onPress={() => setMsgUnderline(b => !b)}>
                    <Text style={[styles.chipText, { fontFamily: semi, textDecorationLine: 'underline' }, msgUnderline && styles.chipTextOn]}>Underline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.chip, msgFlash && styles.chipOn]} onPress={() => setMsgFlash(b => !b)}>
                    <Text style={[styles.chipText, { fontFamily: semi }, msgFlash && styles.chipTextOn]}>✨ Flash</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Text size</Text>
                <View style={styles.chipRow}>
                  {([['S',0.85],['M',1],['L',1.25],['XL',1.5]] as const).map(([lbl, val]) => (
                    <TouchableOpacity key={lbl} style={[styles.chip, msgFontScale === val && styles.chipOn]} onPress={() => setMsgFontScale(val)}>
                      <Text style={[styles.chipText, { fontFamily: semi }, msgFontScale === val && styles.chipTextOn]}>{lbl}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.btn, styles.btnGreen, { marginTop: 16 }, (!msgText.trim() || !msgStartDate || !msgEndDate || msgPrayers.length === 0 || msgSaving || !token) && { opacity: 0.5 }]}
                  disabled={!msgText.trim() || !msgStartDate || !msgEndDate || msgPrayers.length === 0 || msgSaving || !token}
                  onPress={async () => {
                    if (!config || !token) return;
                    const msgData: ScrollingMessage = {
                      id:         editingMsgId ?? Date.now().toString(),
                      active:     true,
                      text:       msgText.trim(),
                      prayers:    msgPrayers,
                      daysOfWeek: msgDays.length > 0 ? msgDays : undefined,
                      startDate:  msgStartDate,
                      endDate:    msgEndDate,
                      scrollSpeed: msgSpeed,
                      fontScale:   msgFontScale !== 1 ? msgFontScale : undefined,
                      color:       msgColor || undefined,
                      bold:        msgBold || undefined,
                      italic:      msgItalic || undefined,
                      underline:   msgUnderline || undefined,
                      highlight:   msgHighlight || undefined,
                      flash:       msgFlash || undefined,
                    };
                    const existing = config.scrollingMessages ?? [];
                    const upserted = editingMsgId
                      ? existing.map(m => m.id === editingMsgId ? msgData : m)
                      : [...existing, msgData];
                    const updated: BillboardConfig = { ...config, scrollingMessages: upserted };
                    setMsgSaving(true);
                    try {
                      const newSha = await saveSignedConfig(updated);
                      setConfig(updated);
                      if (newSha) setConfigSha(newSha);
                      // Wipe cache so the new/edited message shows immediately
                      await AsyncStorage.removeItem('@eeis_billboard_config_v1').catch(() => {});
                      await AsyncStorage.removeItem('@eeis_billboard_cache_ts').catch(() => {});
                    } catch { /* ignore */ }
                    setEditingMsgId(null);
                    setMsgText(''); setMsgPrayers(['fajr']); setMsgDays([]); setMsgStartDate(dateToISO(new Date())); setMsgEndDate('');
                    setMsgSpeed('fast'); setMsgColor(''); setMsgBold(false); setMsgItalic(false); setMsgUnderline(false); setMsgHighlight(''); setMsgFlash(false); setMsgFontScale(1);
                    setMsgSaving(false);
                  }}
                >
                  <Text style={[styles.btnText, { fontFamily: semi }]}>
                    {msgSaving ? '💾 Saving…' : !token ? '🔑 Token required' : '💾 Save Message'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {/* ── Auth — token entry ─────────────────────────────────────────── */}
          {adminTab === 'campaigns' && (<>
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

              {/* Private repo warning */}
              <View style={[styles.helpCard, { backgroundColor: '#FFF8E1', borderLeftWidth: 3, borderLeftColor: '#F59E0B', marginBottom: 12 }]}>
                <Text style={[{ fontSize: 12, color: '#92400E', lineHeight: 18 }, { fontFamily: reg }]}>
                  ⚠️  <Text style={{ fontWeight: '700' }}>Private repo detected.</Text> Billboard images and config are not publicly accessible — campaigns will only show on this device (admin). To show campaigns on ALL user devices, go to GitHub → Settings → Change visibility → Make public.
                </Text>
              </View>

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

                  {/* Mini thumbnail row — one per slide */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {campaign.slides.map((slide, si) => {
                        // Use local URI immediately after upload; fall back to remote
                        const localUri = si === 0 ? localThumbs[campaign.id] : undefined;
                        const thumbUri = localUri ?? slide.imageUrl;
                        return (
                        <View key={slide.id} style={styles.miniThumb}>
                          {thumbUri ? (
                            <Image
                              source={token
                                ? { uri: thumbUri, headers: { Authorization: `token ${token}` } }
                                : { uri: thumbUri }}
                              style={{ width: '100%', height: '100%', borderRadius: 6 }}
                              resizeMode="cover"
                              onError={() => {}}
                            />
                          ) : (
                            <View style={{ flex: 1, backgroundColor: slide.bgColor ?? '#063968', borderRadius: 6, justifyContent: 'center', alignItems: 'center' }}>
                              <Text style={{ color: '#FFF', fontSize: 9, textAlign: 'center', padding: 2 }}>
                                {slide.title ? slide.title.slice(0, 12) : `Slide ${si + 1}`}
                              </Text>
                            </View>
                          )}
                        </View>
                        );
                      })}
                    </View>
                  </ScrollView>

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

              {/* Campaign-level: date range + active */}
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Start date</Text>
                  <TouchableOpacity style={styles.datePill} onPress={() => setDatePickerTarget('campStart')}>
                    <Text style={[styles.datePillText, { fontFamily: semi }]}>
                      {editing.startDate ? fmtDateUK(editing.startDate) : 'Tap to pick'}
                    </Text>
                    <Text style={styles.datePillArrow}>📅</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ width: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { fontFamily: semi }]}>End date</Text>
                  <TouchableOpacity style={styles.datePill} onPress={() => setDatePickerTarget('campEnd')}>
                    <Text style={[styles.datePillText, { fontFamily: semi }]}>
                      {editing.endDate ? fmtDateUK(editing.endDate) : 'Tap to pick'}
                    </Text>
                    <Text style={styles.datePillArrow}>📅</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={[styles.row, { alignItems: 'center', marginBottom: 12 }]}>
                <Text style={[styles.fieldLabel, { fontFamily: semi, marginBottom: 0, flex: 1 }]}>Active</Text>
                <Switch
                  value={editing.active}
                  onValueChange={v => setEditField('active', v)}
                  trackColor={{ true: Colors.freshGreen }}
                />
              </View>

              {/* Slide selector tabs */}
              <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Posters ({editing.slides.length})</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {editing.slides.map((_, i) => (
                    <TouchableOpacity key={i} style={[styles.slideTab, editSlideIdx === i && styles.slideTabOn]} onPress={() => setEditSlideIdx(i)}>
                      <Text style={[styles.slideTabText, editSlideIdx === i && styles.slideTabTextOn]}>Slide {i + 1}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={[styles.slideTab, styles.slideTabAdd]} onPress={addSlide}>
                    <Text style={[styles.slideTabText, { color: Colors.deepBlue }]}>＋ Add</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>

              {/* ── Selected slide editor ── */}
              {(() => {
                const idx = Math.min(editSlideIdx, editing.slides.length - 1);
                const s = editing.slides[idx];
                if (!s) return null;
                const picked = pickedUris[s.id];
                const slidePrayers = s.prayers ?? [];
                const slideDays    = s.daysOfWeek ?? [];
                return (
                  <View style={styles.slideEditor}>
                    {editing.slides.length > 1 && (
                      <TouchableOpacity onPress={() => removeSlide(idx)} style={{ alignSelf: 'flex-end' }}>
                        <Text style={[styles.linkText, { fontFamily: semi, color: Colors.maroonRed }]}>🗑 Remove this poster</Text>
                      </TouchableOpacity>
                    )}

                    {/* Image picker */}
                    <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Poster Image</Text>
                    <TouchableOpacity style={styles.imagePicker} onPress={() => handlePickImage(idx)}>
                      {picked ? (
                        <Image source={{ uri: picked }} style={styles.imagePreview} resizeMode="contain" />
                      ) : s.imageUrl ? (
                        <Image source={{ uri: s.imageUrl }} style={styles.imagePreview} resizeMode="contain" />
                      ) : (
                        <Text style={[styles.imagePickerText, { fontFamily: reg }]}>📷 Tap to pick poster from phone</Text>
                      )}
                    </TouchableOpacity>
                    {(picked || s.imageUrl) && (
                      <TouchableOpacity onPress={() => handlePickImage(idx)} style={{ alignSelf: 'center', marginTop: 4 }}>
                        <Text style={[styles.linkText, { fontFamily: semi }]}>Change image</Text>
                      </TouchableOpacity>
                    )}

                    {/* Title / body / duration */}
                    <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Title (optional — shown when no image)</Text>
                    <TextInput style={[styles.input, { fontFamily: reg }]} value={s.title ?? ''}
                      onChangeText={v => setSlideField(idx, 'title', v)} placeholder="e.g. Eid Mubarak!" placeholderTextColor={Colors.inkMute} />

                    <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Body text (optional)</Text>
                    <TextInput style={[styles.input, styles.inputMulti, { fontFamily: reg }]} value={s.body ?? ''}
                      onChangeText={v => setSlideField(idx, 'body', v)} placeholder="Short message shown on slide" placeholderTextColor={Colors.inkMute} multiline numberOfLines={3} />

                    <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Display duration (seconds)</Text>
                    <TextInput style={[styles.input, { fontFamily: reg }]}
                      value={s.displayDurationSec != null ? String(s.displayDurationSec) : ''}
                      onChangeText={v => { const d = v.replace(/\D/g, ''); setSlideField(idx, 'displayDurationSec', d === '' ? undefined : parseInt(d, 10)); }}
                      keyboardType="number-pad" placeholder="10" placeholderTextColor={Colors.inkMute} selectTextOnFocus />

                    {/* Per-slide orientation */}
                    <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Orientation for this poster</Text>
                    <View style={styles.chipRow}>
                      {([['portrait', '📱 Portrait'], ['landscape', '🖼 Landscape']] as const).map(([o, label]) => {
                        const on = (s.orientation ?? 'portrait') === o;
                        return (
                          <TouchableOpacity key={o} style={[styles.chip, on && styles.chipOn]}
                            onPress={() => setSlideField(idx, 'orientation', o)}>
                            <Text style={[styles.chipText, { fontFamily: semi }, on && styles.chipTextOn]}>{label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={[styles.hint, { fontFamily: reg }]}>
                      Pick how THIS poster is shown. Portrait = upright full screen; Landscape = sideways full screen. Choose the one matching the photo so it isn't squashed or rotated. (Tip: keep a campaign all-portrait or all-landscape so the view doesn't flip between slides.)
                    </Text>

                    {/* Per-slide prayers */}
                    <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Show this poster after prayers</Text>
                    <View style={styles.chipRow}>
                      {(() => {
                        const allOn = PRAYERS.every(p => slidePrayers.includes(p));
                        return (
                          <TouchableOpacity style={[styles.chip, allOn && styles.chipOn]}
                            onPress={() => setSlideField(idx, 'prayers', allOn ? [] : [...PRAYERS])}>
                            <Text style={[styles.chipText, { fontFamily: semi }, allOn && styles.chipTextOn]}>ALL</Text>
                          </TouchableOpacity>
                        );
                      })()}
                      {PRAYERS.map(p => {
                        const on = slidePrayers.includes(p);
                        return (
                          <TouchableOpacity key={p} style={[styles.chip, on && styles.chipOn]}
                            onPress={() => setSlideField(idx, 'prayers', on ? slidePrayers.filter(x => x !== p) : [...slidePrayers, p])}>
                            <Text style={[styles.chipText, { fontFamily: semi }, on && styles.chipTextOn]}>{PRAYER_LABELS[p] ?? p}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Per-slide days */}
                    <Text style={[styles.fieldLabel, { fontFamily: semi }]}>Days of week</Text>
                    <View style={styles.chipRow}>
                      {(() => {
                        const allDays = [0,1,2,3,4,5,6].every(i2 => slideDays.includes(i2));
                        return (
                          <TouchableOpacity style={[styles.chip, allDays && styles.chipOn]}
                            onPress={() => setSlideField(idx, 'daysOfWeek', allDays ? [] : [0,1,2,3,4,5,6])}>
                            <Text style={[styles.chipText, { fontFamily: semi }, allDays && styles.chipTextOn]}>ALL</Text>
                          </TouchableOpacity>
                        );
                      })()}
                      {DAYS.map((d, i2) => {
                        const on = slideDays.includes(i2);
                        return (
                          <TouchableOpacity key={d} style={[styles.chip, on && styles.chipOn]}
                            onPress={() => setSlideField(idx, 'daysOfWeek', on ? slideDays.filter(x => x !== i2) : [...slideDays, i2])}>
                            <Text style={[styles.chipText, { fontFamily: semi }, on && styles.chipTextOn]}>{d}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })()}

              {/* Action buttons */}
              <View style={[styles.row, { marginTop: 20 }]}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnGhost, { flex: 1 }]}
                  onPress={() => { setEditing(null); setPickedUris({}); setStatus(''); }}
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

          </>)}

        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Admin password reset modal */}
      <Modal visible={pwdModalVisible} transparent animationType="fade" onRequestClose={() => setPwdModalVisible(false)}>
        <View style={styles.pwdOverlay}>
          <View style={styles.pwdBox}>
            <Text style={[styles.pwdTitle, { fontFamily: bold }]}>Set Admin Password</Text>
            <Text style={[styles.pwdSub, { fontFamily: reg }]}>
              Choose a password (min 4 characters). You'll use it to open the admin panel. Keep it safe.
            </Text>
            <TextInput
              style={[styles.input, { fontFamily: reg }]}
              value={pwdInput}
              onChangeText={t => { setPwdInput(t); setPwdError(''); }}
              placeholder="New password"
              placeholderTextColor={Colors.inkMute}
              secureTextEntry
              autoCapitalize="none"
            />
            <TextInput
              style={[styles.input, { fontFamily: reg, marginTop: 8 }]}
              value={pwdConfirm}
              onChangeText={t => { setPwdConfirm(t); setPwdError(''); }}
              placeholder="Confirm password"
              placeholderTextColor={Colors.inkMute}
              secureTextEntry
              autoCapitalize="none"
            />
            {!!pwdError && <Text style={[styles.pwdError, { fontFamily: semi }]}>{pwdError}</Text>}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost, { flex: 1 }]} onPress={() => setPwdModalVisible(false)}>
                <Text style={[styles.btnTextDark, { fontFamily: semi }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnGreen, { flex: 1 }]} onPress={handleSetPassword}>
                <Text style={[styles.btnText, { fontFamily: semi }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Native date picker (Android calendar overlay) */}
      {datePickerTarget != null && (
        <DateTimePicker
          value={
            datePickerTarget === 'campStart' ? isoToDate(editing?.startDate ?? '') :
            datePickerTarget === 'campEnd'   ? isoToDate(editing?.endDate   ?? '') :
            datePickerTarget === 'msgStart'  ? isoToDate(msgStartDate) :
            datePickerTarget === 'msgEnd'    ? isoToDate(msgEndDate || msgStartDate) : new Date()
          }
          mode="date"
          display="calendar"
          minimumDate={
            datePickerTarget === 'campStart' ? new Date() :
            datePickerTarget === 'campEnd'   ? isoToDate(editing?.startDate || dateToISO(new Date())) :
            datePickerTarget === 'msgStart'  ? new Date() :
            datePickerTarget === 'msgEnd'    ? isoToDate(msgStartDate || dateToISO(new Date())) :
            undefined
          }
          onChange={handleDatePicked}
        />
      )}
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
  headerReset: { fontSize: 13, color: '#FFFFFF', fontWeight: '600' },
  pwdOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  pwdBox: { width: '100%', maxWidth: 360, backgroundColor: '#FFF', borderRadius: 14, padding: 20 },
  pwdTitle: { fontSize: 17, fontWeight: '700', color: Colors.maroonRed, marginBottom: 6 },
  pwdSub: { fontSize: 13, color: Colors.inkMute, marginBottom: 12, lineHeight: 18 },
  pwdError: { fontSize: 12, color: Colors.maroonRed, marginTop: 8, fontWeight: '600' },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#DDD', alignItems: 'center', justifyContent: 'center' },
  swatchOn: { borderColor: Colors.ink, borderWidth: 3 },
  swatchTick: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  slideTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#C5CFFF', backgroundColor: '#F5F7FF' },
  slideTabOn: { backgroundColor: Colors.deepBlue, borderColor: Colors.deepBlue },
  slideTabAdd: { backgroundColor: '#FFF', borderStyle: 'dashed' },
  slideTabText: { fontSize: 13, fontWeight: '600', color: Colors.ink },
  slideTabTextOn: { color: '#FFF' },
  slideEditor: { borderTopWidth: 1, borderTopColor: '#ECECEC', paddingTop: 10, marginTop: 4 },

  // Admin tabs
  adminTabBar: {
    flexDirection: 'row', backgroundColor: '#FFF',
    borderBottomWidth: 1, borderBottomColor: '#E0E0E0',
  },
  adminTab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  adminTabActive: { borderBottomColor: Colors.deepBlue },
  adminTabText: { fontSize: 13, fontWeight: '600', color: Colors.inkMute },
  adminTabTextActive: { color: Colors.deepBlue },

  // Help cards
  helpCard: {
    backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 12,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 3,
  },
  helpCardTitle: { fontSize: 15, fontWeight: '700', color: Colors.deepBlue, marginBottom: 8 },
  helpCardBody: { fontSize: 13, color: Colors.ink, lineHeight: 20 },

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
  miniThumb: { width: 70, height: 90, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: '#DDD' },
  datePill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F5F7FF', borderRadius: 8, borderWidth: 1, borderColor: '#C5CFFF', paddingHorizontal: 12, paddingVertical: 10, marginBottom: 0 },
  datePillText: { fontSize: 13, color: Colors.ink, flex: 1 },
  datePillArrow: { fontSize: 16, marginLeft: 6 },
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
