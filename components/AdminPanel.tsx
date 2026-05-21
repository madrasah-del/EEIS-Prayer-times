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
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity, TextInput,
  Switch, Alert, ActivityIndicator, StyleSheet, SafeAreaView, Platform,
  KeyboardAvoidingView,
  Image, FlatList, Dimensions, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';

const { width: SCREEN_W } = Dimensions.get('window');
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

// ─── Mini Calendar Picker ─────────────────────────────────────────────────────
// Lightweight calendar modal — no external library needed.

const MONTH_NAMES_CAL = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_NAMES_CAL   = ['M','T','W','T','F','S','S'];

function isoToDisplay(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  return `${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}`;
}

type MiniCalProps = {
  visible:  boolean;
  value:    string;        // YYYY-MM-DD or ''
  onSelect: (iso: string) => void;
  onClose:  () => void;
};

function MiniCalendarPicker({ visible, value, onSelect, onClose }: MiniCalProps) {
  const initial = value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(value + 'T12:00:00Z')
    : new Date();
  const [year,  setYear]  = React.useState(initial.getFullYear());
  const [month, setMonth] = React.useState(initial.getMonth());

  React.useEffect(() => {
    if (!visible) return;
    const d = value && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(value + 'T12:00:00Z') : new Date();
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }, [visible, value]);

  const firstDow = new Date(year, month, 1).getDay();  // 0=Sun
  const daysInM  = new Date(year, month + 1, 0).getDate();
  const blanks   = (firstDow + 6) % 7; // Mon-start offset
  const cells: (number|null)[] = [
    ...Array(blanks).fill(null),
    ...Array.from({ length: daysInM }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={calStyles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={calStyles.box}>
          {/* Month nav */}
          <View style={calStyles.nav}>
            <TouchableOpacity onPress={prevMonth} hitSlop={10}>
              <Text style={calStyles.navArrow}>{'‹'}</Text>
            </TouchableOpacity>
            <Text style={calStyles.navTitle}>{MONTH_NAMES_CAL[month]} {year}</Text>
            <TouchableOpacity onPress={nextMonth} hitSlop={10}>
              <Text style={calStyles.navArrow}>{'›'}</Text>
            </TouchableOpacity>
          </View>
          {/* Day headers */}
          <View style={calStyles.week}>
            {DAY_NAMES_CAL.map((d, i) => (
              <Text key={i} style={calStyles.dayHeader}>{d}</Text>
            ))}
          </View>
          {/* Day cells */}
          {Array.from({ length: cells.length / 7 }).map((_, row) => (
            <View key={row} style={calStyles.week}>
              {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                if (!day) return <View key={col} style={calStyles.dayCell} />;
                const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                const isSelected = iso === value;
                const today = new Date().toISOString().slice(0,10);
                const isToday = iso === today;
                return (
                  <TouchableOpacity
                    key={col}
                    style={[calStyles.dayCell, isSelected && calStyles.daySel, isToday && !isSelected && calStyles.dayToday]}
                    onPress={() => { onSelect(iso); onClose(); }}
                  >
                    <Text style={[calStyles.dayText, isSelected && calStyles.daySelText]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const calStyles = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  box:      { backgroundColor: '#FFF', borderRadius: 14, padding: 16, width: 300, elevation: 8,
               shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8 },
  nav:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  navArrow: { fontSize: 24, color: Colors.deepBlue, paddingHorizontal: 8 },
  navTitle: { fontSize: 16, fontWeight: '700', color: Colors.ink },
  week:     { flexDirection: 'row' },
  dayHeader:{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: Colors.inkMute, paddingBottom: 4 },
  dayCell:  { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', margin: 1, borderRadius: 20 },
  daySel:   { backgroundColor: Colors.deepBlue },
  dayToday: { borderWidth: 1, borderColor: Colors.deepBlue },
  dayText:  { fontSize: 14, color: Colors.ink },
  daySelText: { color: '#FFF', fontWeight: '700' },
});

// DateField: tappable button that opens the calendar picker.
// isoValue = YYYY-MM-DD (or '' for unset). onChange always returns YYYY-MM-DD.
type DateFieldProps = {
  isoValue:   string;
  onChange:   (iso: string) => void;
  placeholder?: string;
  style?:     object;
};

function DateField({ isoValue, onChange, placeholder = 'Tap to select date', style }: DateFieldProps) {
  const [open, setOpen] = React.useState(false);
  const display = isoToDisplay(isoValue) || placeholder;
  return (
    <>
      <TouchableOpacity
        style={[dfStyles.field, style]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <Text style={dfStyles.icon}>📅</Text>
        <Text style={[dfStyles.text, !isoValue && dfStyles.placeholder]}>{display}</Text>
      </TouchableOpacity>
      <MiniCalendarPicker
        visible={open}
        value={isoValue}
        onSelect={(iso) => { onChange(iso); setOpen(false); }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const dfStyles = StyleSheet.create({
  field:       { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1,
                  borderColor: '#C0CCD8', borderRadius: 8, paddingHorizontal: 12,
                  paddingVertical: 10, backgroundColor: '#FAFAFA' },
  icon:        { fontSize: 16 },
  text:        { fontSize: 14, color: '#1A1A1A', flex: 1 },
  placeholder: { color: '#aaa' },
});
import { BillboardConfig, BillboardCampaign, BillboardSlide, Billboard } from '../data/billboards';
import {
  fetchConfigFromGitHub,
  saveConfigToGitHub,
  uploadImageToGitHub,
  testGitHubToken,
  fetchJsonFromPath,
  saveJsonToPath,
  uploadFileToPath,
} from '../data/githubApi';
import {
  NewsIndex,
  NewsCategory,
  NewsItem,
  NewsEvent,
  HeadlineItem,
  HeadlineLinkType,
  NEWS_INDEX_PATH,
  EMPTY_NEWS_INDEX,
  invalidateNewsCache,
  todayISO,
  formatDateUK,
} from '../data/newsApi';
// BillboardSlideshow NOT imported here — we use an inline overlay to avoid nested Modal bug on Android

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

const EMPTY_HEADLINE = (): HeadlineItem => ({
  id:          Date.now().toString(),
  text:        '',
  active:      true,
  linkType:    'none',
  linkCatId:   undefined,
  linkItemId:  undefined,
  prayers:     [],
  daysOfWeek:  [],
  startDate:   undefined,
  endDate:     undefined,
});

// ─── Thumbnail image with loading/error state ─────────────────────────────────

function ThumbImage({ uri }: { uri: string }) {
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);
  return (
    <View style={thumbStyles.wrap}>
      {!error ? (
        <Image
          source={{ uri }}
          style={thumbStyles.img}
          resizeMode="contain"
          onLoadStart={() => { setLoading(true); setError(false); }}
          onLoadEnd={() => setLoading(false)}
          onError={() => { setError(true); setLoading(false); }}
        />
      ) : (
        <Text style={thumbStyles.errTxt}>Image unavailable</Text>
      )}
      {loading && !error && (
        <View style={thumbStyles.loadingOverlay}>
          <ActivityIndicator color="rgba(255,255,255,0.6)" size="small" />
        </View>
      )}
    </View>
  );
}

const thumbStyles = StyleSheet.create({
  wrap: { width: '100%', height: 130, backgroundColor: 'transparent', overflow: 'hidden' },
  img:  { flex: 1 },
  errTxt: { color: 'rgba(255,255,255,0.5)', fontSize: 12, textAlign: 'center', marginTop: 48 },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  visible:     boolean;
  onClose:     () => void;
  fontsLoaded: boolean;
};

// ─── Tab type ─────────────────────────────────────────────────────────────────

type Tab = 'campaigns' | 'edit' | 'settings' | 'news' | 'headlines';

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

  // Preview (inline overlay — NOT a nested Modal, which blanks on Android)
  const [previewVisible,  setPreviewVisible]  = useState(false);
  const [previewSlides,   setPreviewSlides]   = useState<Billboard[]>([]);
  const [previewIndex,    setPreviewIndex]    = useState(0);
  const previewFlatRef = useRef<FlatList>(null);

  // Local image URIs — keyed by slide index, cleared when form resets
  const [localImageUris, setLocalImageUris] = useState<Record<number, string>>({});

  // ── News tab state ───────────────────────────────────────────────────────────
  const [newsIndex,      setNewsIndex]      = useState<NewsIndex | null>(null);
  const [newsIndexSha,   setNewsIndexSha]   = useState('');
  const [newsCatIdx,     setNewsCatIdx]     = useState(0);
  const [newsUploadTitle, setNewsUploadTitle] = useState('');
  const [newsUploadDesc,  setNewsUploadDesc]  = useState('');
  const [newsUploadUri,   setNewsUploadUri]   = useState('');
  const [newsUploadName,  setNewsUploadName]  = useState('');

  // ── Event form state ─────────────────────────────────────────────────────────
  const [eventTitle,    setEventTitle]    = useState('');
  const [eventDate,     setEventDate]     = useState('');
  const [eventTime,     setEventTime]     = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [eventDetails,  setEventDetails]  = useState('');
  const [eventOpenTo,   setEventOpenTo]   = useState('');

  // ── Typed announcement form state ────────────────────────────────────────────
  const [annTitle, setAnnTitle] = useState('');
  const [annText,  setAnnText]  = useState('');

  // ── Scrolling headline form state ────────────────────────────────────────────
  const [hlEditId,    setHlEditId]    = useState<string | null>(null);
  const [hlDraft,     setHlDraft]     = useState<HeadlineItem>(EMPTY_HEADLINE());
  const [hlShowForm,  setHlShowForm]  = useState(false);

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
    setLocalImageUris({});
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
    // Pre-populate local image URIs with existing GitHub URLs so thumbnails display immediately when editing
    const uris: Record<number, string> = {};
    c.slides.forEach((s, i) => { if (s.imageUrl) uris[i] = s.imageUrl; });
    setLocalImageUris(uris);
    setTab('edit');
  };

  // ── Preview campaign from Campaigns list ─────────────────────────────────────

  const previewCampaign = (c: BillboardCampaign) => {
    if (c.slides.length === 0) { Alert.alert('No slides', 'This campaign has no slides.'); return; }
    // Add cache-bust param so React Native doesn't use a stale image cache.
    // Note: new images uploaded to GitHub may take 1-2 min to propagate on CDN.
    const cb = Date.now();
    const slides: Billboard[] = c.slides.map(s => {
      const rawUrl = s.imageUrl ?? '';
      const url = rawUrl ? rawUrl + (rawUrl.includes('?') ? '&' : '?') + `cb=${cb}` : '';
      return {
        id:      s.id,
        title:   s.title ?? '',
        body:    s.body ?? '',
        bgColor: s.bgColor ?? '#063968',
        imageUrl: url,
        displayDurationSec: s.displayDurationSec ?? c.displayDurationSec ?? 10,
      };
    });
    setPreviewSlides(slides);
    setPreviewIndex(0);
    setPreviewVisible(true);
    setTimeout(() => previewFlatRef.current?.scrollToIndex({ index: 0, animated: false }), 50);
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

      // Store local URI immediately for thumbnail display
      setLocalImageUris(prev => ({ ...prev, [slideIndex]: asset.uri }));

      const base64 = await readUriAsBase64(asset.uri);

      const filename = `${Date.now()}-${asset.name.replace(/[^a-z0-9.\-_]/gi, '_')}`;
      const url      = await uploadImageToGitHub(filename, base64, token);

      // Update the slide's imageUrl with the GitHub URL
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
    if (editCampaign.slides.length === 0) {
      Alert.alert('No slides', 'Add at least one slide to preview.');
      return;
    }
    const slides: Billboard[] = editCampaign.slides.map((s, i) => ({
      id:       s.id,
      title:    s.title,
      body:     s.body ?? '',
      bgColor:  s.bgColor ?? '#063968',
      // Use local URI for preview (visible immediately, before GitHub propagates)
      imageUrl: localImageUris[i] ?? s.imageUrl,
      displayDurationSec: s.displayDurationSec ?? editCampaign.displayDurationSec ?? 10,
    }));
    setPreviewSlides(slides);
    setPreviewIndex(0);
    setPreviewVisible(true);
    setTimeout(() => previewFlatRef.current?.scrollToIndex({ index: 0, animated: false }), 50);
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

  // ── News: fetch index ────────────────────────────────────────────────────────

  const handleFetchNews = async () => {
    if (!token) { Alert.alert('No Token', 'Add a GitHub token in Settings first.'); return; }
    setLoading(true);
    setStatusMsg('Fetching news index…');
    try {
      const { data, sha } = await fetchJsonFromPath<NewsIndex>(NEWS_INDEX_PATH, token);
      setNewsIndex(data);
      setNewsIndexSha(sha);
      setStatusMsg(`Loaded ${data.categories.length} categories.`);
    } catch (e: any) {
      // If file doesn't exist on GitHub yet, use the empty template
      setNewsIndex(EMPTY_NEWS_INDEX);
      setNewsIndexSha('');
      setStatusMsg('News index not found — showing empty template. Upload an article to create it.');
    }
    setLoading(false);
  };

  // ── News: delete article ─────────────────────────────────────────────────────

  const handleDeleteNewsItem = (catIdx: number, itemId: string) => {
    if (!newsIndex) return;
    Alert.alert('Delete Article', 'Remove this article from the index?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!token) return;
          const updated: NewsIndex = {
            ...newsIndex,
            categories: newsIndex.categories.map((c, i) =>
              i === catIdx ? { ...c, items: c.items.filter(x => x.id !== itemId) } : c,
            ),
          };
          setLoading(true);
          setStatusMsg('Saving…');
          try {
            let sha = newsIndexSha;
            if (!sha) {
              const existing = await fetchJsonFromPath<NewsIndex>(NEWS_INDEX_PATH, token).catch(() => null);
              sha = existing?.sha ?? '';
            }
            const newSha = await saveJsonToPath(
              NEWS_INDEX_PATH, updated, sha, 'Remove article via EEIS Admin', token,
            );
            setNewsIndex(updated);
            setNewsIndexSha(newSha);
            await invalidateNewsCache();
            setStatusMsg('Article removed.');
          } catch (e: any) {
            Alert.alert('Save failed', e.message);
            setStatusMsg('');
          }
          setLoading(false);
        },
      },
    ]);
  };

  // ── News: pick file ──────────────────────────────────────────────────────────

  const handlePickNewsFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setNewsUploadUri(asset.uri);
      setNewsUploadName(asset.name);
      if (!newsUploadTitle) setNewsUploadTitle(asset.name.replace(/\.[^.]+$/, ''));
    } catch (e: any) {
      Alert.alert('File pick failed', e.message);
    }
  };

  // ── News: upload article ─────────────────────────────────────────────────────

  const handleUploadNewsArticle = async () => {
    if (!token) { Alert.alert('No Token', 'Add a GitHub token in Settings first.'); return; }
    if (!newsUploadTitle.trim()) { Alert.alert('Title required'); return; }
    if (!newsUploadUri) { Alert.alert('Pick a file first'); return; }
    if (!newsIndex) { Alert.alert('Fetch news index first'); return; }

    setLoading(true);
    setStatusMsg('Reading file…');
    try {
      const base64 = await readUriAsBase64(newsUploadUri);
      const cat = newsIndex.categories[newsCatIdx];
      if (!cat) { Alert.alert('Invalid category'); setLoading(false); return; }

      const sanitisedName = newsUploadName.replace(/[^a-z0-9.\-_]/gi, '_');
      const repoPath = `news/${cat.id}/${Date.now()}-${sanitisedName}`;

      setStatusMsg('Uploading to GitHub…');
      const fileUrl = await uploadFileToPath(repoPath, base64, `Upload ${sanitisedName} via EEIS Admin`, token);

      // Detect type from extension
      const lower = sanitisedName.toLowerCase();
      const type: NewsItem['type'] =
        lower.endsWith('.pdf') ? 'pdf' :
        (lower.endsWith('.doc') || lower.endsWith('.docx')) ? 'doc' : 'txt';

      const newItem: NewsItem = {
        id:          Date.now().toString(),
        title:       newsUploadTitle.trim(),
        fileUrl,
        type,
        date:        todayISO(),
        description: newsUploadDesc.trim() || undefined,
      };

      const updated: NewsIndex = {
        ...newsIndex,
        categories: newsIndex.categories.map((c, i) =>
          i === newsCatIdx ? { ...c, items: [newItem, ...c.items] } : c,
        ),
      };

      setStatusMsg('Saving index…');
      let sha = newsIndexSha;
      if (!sha) {
        const existing = await fetchJsonFromPath<NewsIndex>(NEWS_INDEX_PATH, token).catch(() => null);
        sha = existing?.sha ?? '';
      }
      const newSha = await saveJsonToPath(
        NEWS_INDEX_PATH, updated, sha, 'Add article via EEIS Admin', token,
      );

      setNewsIndex(updated);
      setNewsIndexSha(newSha);
      await invalidateNewsCache();
      setNewsUploadTitle('');
      setNewsUploadDesc('');
      setNewsUploadUri('');
      setNewsUploadName('');
      setStatusMsg(`Article uploaded: ${newItem.title}`);
    } catch (e: any) {
      setStatusMsg('');
      Alert.alert('Upload failed', e.message);
    }
    setLoading(false);
  };

  // ── Add event ────────────────────────────────────────────────────────────────

  const handleAddEvent = async () => {
    if (!token) { Alert.alert('No Token', 'Add a GitHub token in Settings first.'); return; }
    if (!eventTitle.trim()) { Alert.alert('Title required'); return; }
    if (!eventDate.trim())  { Alert.alert('Date required'); return; }
    if (!eventTime.trim())  { Alert.alert('Time required (HH:MM)'); return; }
    if (!newsIndex) { Alert.alert('Fetch news index first'); return; }

    const newEvent: NewsEvent = {
      id:       Date.now().toString(),
      title:    eventTitle.trim(),
      date:     eventDate,
      time:     eventTime.trim(),
      location: eventLocation.trim(),
      details:  eventDetails.trim(),
      openTo:   eventOpenTo.trim() || undefined,
    };

    // Find Events category
    const eventsIdx = newsIndex.categories.findIndex(c => c.id === 'events');
    if (eventsIdx < 0) { Alert.alert('No Events category found'); return; }

    const updated: NewsIndex = {
      ...newsIndex,
      categories: newsIndex.categories.map((c, i) => {
        if (i !== eventsIdx) return c;
        const existingEvents = c.events ?? [];
        // Keep events sorted by date
        const allEvents = [...existingEvents, newEvent].sort((a, b) => a.date.localeCompare(b.date));
        return { ...c, events: allEvents };
      }),
    };

    setLoading(true);
    setStatusMsg('Saving event…');
    try {
      let sha = newsIndexSha;
      if (!sha) {
        const existing = await fetchJsonFromPath<NewsIndex>(NEWS_INDEX_PATH, token).catch(() => null);
        sha = existing?.sha ?? '';
      }
      const newSha = await saveJsonToPath(
        NEWS_INDEX_PATH, updated, sha, 'Add event via EEIS Admin', token,
      );
      setNewsIndex(updated);
      setNewsIndexSha(newSha);
      await invalidateNewsCache();
      setEventTitle(''); setEventDate(''); setEventTime('');
      setEventLocation(''); setEventDetails(''); setEventOpenTo('');
      setStatusMsg(`Event added: ${newEvent.title}`);
    } catch (e: any) {
      Alert.alert('Save failed', e.message);
      setStatusMsg('');
    }
    setLoading(false);
  };

  // ── Delete event ─────────────────────────────────────────────────────────────

  const handleDeleteEvent = (eventId: string) => {
    if (!newsIndex || !token) return;
    Alert.alert('Delete Event', 'Remove this event?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const eventsIdx = newsIndex.categories.findIndex(c => c.id === 'events');
          if (eventsIdx < 0) return;
          const updated: NewsIndex = {
            ...newsIndex,
            categories: newsIndex.categories.map((c, i) =>
              i !== eventsIdx ? c : { ...c, events: (c.events ?? []).filter(e => e.id !== eventId) },
            ),
          };
          setLoading(true);
          try {
            let sha = newsIndexSha;
            if (!sha) {
              const existing = await fetchJsonFromPath<NewsIndex>(NEWS_INDEX_PATH, token).catch(() => null);
              sha = existing?.sha ?? '';
            }
            const newSha = await saveJsonToPath(NEWS_INDEX_PATH, updated, sha, 'Delete event via EEIS Admin', token);
            setNewsIndex(updated);
            setNewsIndexSha(newSha);
            await invalidateNewsCache();
            setStatusMsg('Event removed.');
          } catch (e: any) {
            Alert.alert('Save failed', e.message);
          }
          setLoading(false);
        },
      },
    ]);
  };

  // ── Post typed announcement ───────────────────────────────────────────────────

  const handlePostAnnouncement = async () => {
    if (!token) { Alert.alert('No Token', 'Add a GitHub token in Settings first.'); return; }
    if (!annTitle.trim()) { Alert.alert('Title required'); return; }
    if (!annText.trim())  { Alert.alert('Announcement text required'); return; }
    if (!newsIndex) { Alert.alert('Fetch news index first'); return; }

    const annIdx = newsIndex.categories.findIndex(c => c.id === 'announcements');
    if (annIdx < 0) { Alert.alert('No Announcements category found'); return; }

    const newItem: import('../data/newsApi').NewsItem = {
      id:               Date.now().toString(),
      title:            annTitle.trim(),
      fileUrl:          '',   // empty — typed announcement, no file
      type:             'txt',
      date:             todayISO(),
      announcementText: annText.trim(),
    };

    const updated: NewsIndex = {
      ...newsIndex,
      categories: newsIndex.categories.map((c, i) =>
        i !== annIdx ? c : { ...c, items: [newItem, ...c.items] },
      ),
    };

    setLoading(true);
    setStatusMsg('Saving announcement…');
    try {
      let sha = newsIndexSha;
      if (!sha) {
        const existing = await fetchJsonFromPath<NewsIndex>(NEWS_INDEX_PATH, token).catch(() => null);
        sha = existing?.sha ?? '';
      }
      const newSha = await saveJsonToPath(
        NEWS_INDEX_PATH, updated, sha, 'Post announcement via EEIS Admin', token,
      );
      setNewsIndex(updated);
      setNewsIndexSha(newSha);
      await invalidateNewsCache();
      setAnnTitle('');
      setAnnText('');
      setStatusMsg(`Announcement posted: ${newItem.title}`);
    } catch (e: any) {
      Alert.alert('Save failed', e.message);
      setStatusMsg('');
    }
    setLoading(false);
  };

  // ── Headline helpers ─────────────────────────────────────────────────────────

  /** Persist an updated headlines array to GitHub and update local state.
   *  Returns true on success, false on failure (so callers can decide whether to close the form). */
  const saveHeadlines = async (updated: HeadlineItem[]): Promise<boolean> => {
    if (!token) { Alert.alert('No Token', 'Add a GitHub token in Settings first.'); return false; }
    setLoading(true);
    setStatusMsg('Saving headlines…');
    try {
      let sha = newsIndexSha;
      if (!sha) {
        const existing = await fetchJsonFromPath<NewsIndex>(NEWS_INDEX_PATH, token).catch(() => null);
        sha = existing?.sha ?? '';
      }
      // newsIndex is guaranteed non-null at call sites (callers check first)
      const updatedIndex: NewsIndex = { ...newsIndex!, headlines: updated };
      const newSha = await saveJsonToPath(NEWS_INDEX_PATH, updatedIndex, sha, 'Update headlines via EEIS Admin', token);
      setNewsIndex(updatedIndex);
      setNewsIndexSha(newSha);
      await invalidateNewsCache();
      setStatusMsg('Headlines saved.');
      setLoading(false);
      return true;
    } catch (e: any) {
      Alert.alert('Save failed', e.message);
      setStatusMsg('');
      setLoading(false);
      return false;
    }
  };

  const handleSaveHeadline = async () => {
    if (!hlDraft.text.trim()) { Alert.alert('Headline text required'); return; }
    // Guard: index must be loaded so we don't accidentally wipe existing headlines
    if (!newsIndex) { Alert.alert('Load Index First', 'Tap "Fetch Index" before adding headlines.'); return; }
    const current = newsIndex.headlines ?? [];
    let updated: HeadlineItem[];
    if (hlEditId) {
      updated = current.map(h => h.id === hlEditId ? { ...hlDraft, id: hlEditId } : h);
    } else {
      updated = [{ ...hlDraft, id: Date.now().toString() }, ...current];
    }
    const ok = await saveHeadlines(updated);
    if (ok) {
      setHlShowForm(false);
      setHlEditId(null);
      setHlDraft(EMPTY_HEADLINE());
    }
    // If save failed, keep the form open so the admin can retry
  };

  const handleDeleteHeadline = (id: string) => {
    if (!newsIndex) return;
    Alert.alert('Delete Headline', 'Remove this scrolling headline?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const updated = (newsIndex.headlines ?? []).filter(h => h.id !== id);
          await saveHeadlines(updated);
        },
      },
    ]);
  };

  const toggleHeadlineActive = async (h: HeadlineItem) => {
    if (!newsIndex) return;
    const updated = (newsIndex.headlines ?? []).map(x =>
      x.id === h.id ? { ...x, active: !x.active } : x,
    );
    await saveHeadlines(updated);
  };

  const openNewHeadline = () => {
    setHlEditId(null);
    setHlDraft(EMPTY_HEADLINE());
    setHlShowForm(true);
  };

  const openEditHeadline = (h: HeadlineItem) => {
    setHlEditId(h.id);
    setHlDraft({ ...h });
    setHlShowForm(true);
  };

  // ─── Render ────────────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
          {([
            ['campaigns', 'Campaigns'],
            ['edit',      'Add / Edit'],
            ['settings',  'Settings'],
            ['news',      'News'],
            ['headlines', 'Headlines'],
          ] as [Tab, string][]).map(([t, label]) => (
            <TouchableOpacity key={t} style={[styles.tabItem, tab === t && styles.tabItemActive]} onPress={() => setTab(t)}>
              <Text style={[styles.tabLabel, { fontFamily: semi }, tab === t && styles.tabLabelActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

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
                  <TouchableOpacity style={[styles.btnOutline, { flex: 1 }]} onPress={() => openEdit(c)}>
                    <Text style={[styles.btnOutlineText, { fontFamily: semi }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnBlue, { flex: 1 }]} onPress={() => previewCampaign(c)}>
                    <Text style={[styles.btnText, { fontFamily: semi }]}>👁 Preview</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btnDanger} onPress={() => deleteCampaign(c.id)}>
                    <Text style={[styles.btnText, { fontFamily: semi }]}>✕</Text>
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

            <Text style={[styles.label, { fontFamily: semi }]}>Start Date</Text>
            <DateField
              isoValue={editCampaign.startDate ?? ''}
              onChange={v => setEditCampaign(p => ({ ...p, startDate: v }))}
              placeholder="Tap to select start date"
            />

            <Text style={[styles.label, { fontFamily: semi, marginTop: 8 }]}>End Date</Text>
            <DateField
              isoValue={editCampaign.endDate ?? ''}
              onChange={v => setEditCampaign(p => ({ ...p, endDate: v }))}
              placeholder="Tap to select end date"
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
            {editCampaign.slides.map((slide, i) => {
              const thumbUri = localImageUris[i] ?? slide.imageUrl;
              return (
                <View key={slide.id} style={styles.slideCard}>
                  <View style={styles.rowBetween}>
                    <Text style={[styles.slideNum, { fontFamily: bold }]}>Slide {i + 1}</Text>
                    <TouchableOpacity onPress={() => removeSlide(i)}>
                      <Text style={[styles.removeText, { fontFamily: semi }]}>✕ Remove</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Image thumbnail + upload button */}
                  {thumbUri ? (
                    <View style={[styles.thumbContainer, { backgroundColor: slide.bgColor ?? '#063968' }]}>
                      <ThumbImage uri={thumbUri} />
                      <View style={styles.thumbTextRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.thumbTitle} numberOfLines={1}>{slide.title || '(no title)'}</Text>
                          {!!slide.body && <Text style={styles.thumbBody} numberOfLines={1}>{slide.body}</Text>}
                        </View>
                        <TouchableOpacity style={styles.thumbReplaceBtn} onPress={() => pickAndUploadImage(i)}>
                          <Text style={[styles.btnText, { fontFamily: semi, fontSize: 11 }]}>🖼 Replace</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.btnBlue, { marginBottom: 8 }]}
                      onPress={() => pickAndUploadImage(i)}
                    >
                      <Text style={[styles.btnText, { fontFamily: semi }]}>📷 Pick & Upload Image</Text>
                    </TouchableOpacity>
                  )}

                  {!!slide.imageUrl && (
                    <Text style={[styles.urlText, { fontFamily: reg }]} numberOfLines={1}>
                      ✓ GitHub: {slide.imageUrl.split('/').pop()}
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
                  <Text style={[styles.label, { fontFamily: semi }]}>
                    Duration (seconds) — blank = use campaign default
                  </Text>
                  <TextInput
                    style={[styles.input, { fontFamily: reg }]}
                    value={slide.displayDurationSec != null ? String(slide.displayDurationSec) : ''}
                    onChangeText={v => {
                      const n = parseInt(v, 10);
                      updateSlide(i, { displayDurationSec: v === '' ? undefined : (isNaN(n) ? undefined : n) });
                    }}
                    keyboardType="number-pad"
                    placeholder={`${editCampaign.displayDurationSec ?? 10}s (default)`}
                    placeholderTextColor="#aaa"
                  />
                </View>
              );
            })}

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

        {/* ── NEWS tab ─────────────────────────────────────────────────────────── */}
        {tab === 'news' && (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

            {/* Fetch / refresh */}
            <View style={styles.rowBetween}>
              <TouchableOpacity style={[styles.btnBlue, { flex: 1, marginRight: 8 }]} onPress={handleFetchNews}>
                <Text style={[styles.btnText, { fontFamily: semi }]}>
                  {newsIndex ? '↻ Refresh Index' : '⬇ Fetch News Index'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnOutline, { flex: 1 }]}
                onPress={async () => {
                  setStatusMsg('Checking live URL…');
                  try {
                    const res = await fetch(
                      `https://raw.githubusercontent.com/madrasah-del/EEIS-Prayer-times/main/news/news-index.json?cb=${Date.now()}`,
                      { headers: { 'Cache-Control': 'no-cache' } },
                    );
                    if (res.ok) {
                      const json = await res.json() as { version?: number; categories?: unknown[] };
                      setStatusMsg(`Live: v${json.version ?? '?'} · ${json.categories?.length ?? 0} categories found on GitHub.`);
                    } else {
                      setStatusMsg(`Live check: HTTP ${res.status} — file may not exist yet on GitHub.`);
                    }
                  } catch (e: any) {
                    setStatusMsg(`Live check failed: ${e.message}`);
                  }
                }}
              >
                <Text style={[styles.btnOutlineText, { fontFamily: semi }]}>🔍 Verify Live</Text>
              </TouchableOpacity>
            </View>

            {!newsIndex && (
              <Text style={[styles.hint, { fontFamily: reg, marginTop: 8 }]}>
                Tap "Fetch News Index" to load the current article list from GitHub.{'\n'}
                Use "Verify Live" after saving. Note: GitHub CDN can take 1–2 minutes to propagate — if you see HTTP 404 immediately after upload, wait a minute and tap Verify Live again.
              </Text>
            )}

            {newsIndex && (
              <>
                {/* Category selector */}
                <Text style={[styles.label, { fontFamily: semi, marginTop: 12 }]}>Category</Text>
                <View style={styles.chipRow}>
                  {newsIndex.categories.map((cat, i) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[styles.chip, newsCatIdx === i && styles.chipActive]}
                      onPress={() => setNewsCatIdx(i)}
                    >
                      <Text style={[styles.chipText, { fontFamily: semi }, newsCatIdx === i && styles.chipTextActive]}>
                        {cat.icon} {cat.title}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Article list */}
                <Text style={[styles.label, { fontFamily: semi }]}>
                  Articles in {newsIndex.categories[newsCatIdx]?.title ?? ''}
                </Text>
                {newsIndex.categories[newsCatIdx]?.items.length === 0 ? (
                  <Text style={[styles.hint, { fontFamily: reg }]}>No articles yet. Upload one below.</Text>
                ) : (
                  newsIndex.categories[newsCatIdx]?.items.map(item => (
                    <View key={item.id} style={styles.card}>
                      <View style={styles.rowBetween}>
                        <Text style={[styles.cardTitle, { fontFamily: bold, flex: 1 }]} numberOfLines={2}>
                          {item.title}
                        </Text>
                        <TouchableOpacity
                          style={[styles.btnDanger, { marginLeft: 8 }]}
                          onPress={() => handleDeleteNewsItem(newsCatIdx, item.id)}
                        >
                          <Text style={[styles.btnText, { fontFamily: semi }]}>✕</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={[styles.cardMeta, { fontFamily: reg }]}>{formatDateUK(item.date)} · {item.type.toUpperCase()}</Text>
                      {!!item.description && (
                        <Text style={[styles.hint, { fontFamily: reg, marginBottom: 0 }]} numberOfLines={2}>
                          {item.description}
                        </Text>
                      )}
                    </View>
                  ))
                )}

                {/* Upload new article */}
                <View style={[styles.card, { marginTop: 4 }]}>
                  <Text style={[styles.cardTitle, { fontFamily: bold }]}>Upload New Article</Text>

                  <Text style={[styles.label, { fontFamily: semi }]}>Title</Text>
                  <TextInput
                    style={[styles.input, { fontFamily: reg }]}
                    value={newsUploadTitle}
                    onChangeText={setNewsUploadTitle}
                    placeholder="Article title"
                    placeholderTextColor="#aaa"
                  />

                  <Text style={[styles.label, { fontFamily: semi }]}>Description (optional)</Text>
                  <TextInput
                    style={[styles.input, { fontFamily: reg }]}
                    value={newsUploadDesc}
                    onChangeText={setNewsUploadDesc}
                    placeholder="Short description"
                    placeholderTextColor="#aaa"
                  />

                  {/* File picker */}
                  <TouchableOpacity
                    style={[styles.btnOutline, { marginBottom: 8 }]}
                    onPress={handlePickNewsFile}
                  >
                    <Text style={[styles.btnOutlineText, { fontFamily: semi }]}>
                      {newsUploadUri ? `📎 ${newsUploadName}` : '📎 Pick File (PDF, DOC, TXT…)'}
                    </Text>
                  </TouchableOpacity>

                  {!!newsUploadUri && (
                    <Text style={[styles.urlText, { fontFamily: reg }]}>
                      Selected: {newsUploadName}
                    </Text>
                  )}

                  <TouchableOpacity
                    style={[styles.btnGreen, { marginTop: 8 }]}
                    onPress={handleUploadNewsArticle}
                  >
                    <Text style={[styles.btnText, { fontFamily: semi }]}>
                      ⬆ Upload to GitHub
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Typed announcement — only shown when Announcements category selected */}
                {newsIndex.categories[newsCatIdx]?.id === 'announcements' && (
                  <View style={[styles.card, { marginTop: 4, borderLeftWidth: 3, borderLeftColor: '#FFA000' }]}>
                    <Text style={[styles.cardTitle, { fontFamily: bold }]}>📢 Type Announcement</Text>
                    <Text style={[styles.hint, { fontFamily: reg }]}>
                      Post a text announcement directly — no file needed. Appears as a highlighted card in the app.
                    </Text>

                    <Text style={[styles.label, { fontFamily: semi }]}>Title</Text>
                    <TextInput
                      style={[styles.input, { fontFamily: reg }]}
                      value={annTitle}
                      onChangeText={setAnnTitle}
                      placeholder="e.g. Mosque closure on Friday"
                      placeholderTextColor="#aaa"
                    />

                    <Text style={[styles.label, { fontFamily: semi }]}>Announcement Text</Text>
                    <TextInput
                      style={[styles.input, styles.inputMulti, { fontFamily: reg, minHeight: 100 }]}
                      value={annText}
                      onChangeText={setAnnText}
                      placeholder="Full announcement text..."
                      placeholderTextColor="#aaa"
                      multiline
                      textAlignVertical="top"
                    />

                    <TouchableOpacity
                      style={[styles.btnGreen, { marginTop: 4 }]}
                      onPress={handlePostAnnouncement}
                    >
                      <Text style={[styles.btnText, { fontFamily: semi }]}>📢 Post Announcement</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Events management — only shown when Events category is selected */}
                {newsIndex.categories[newsCatIdx]?.id === 'events' && (
                  <View style={[styles.card, { marginTop: 4 }]}>
                    <Text style={[styles.cardTitle, { fontFamily: bold }]}>📅 Upcoming Events</Text>

                    {/* Existing events */}
                    {(newsIndex.categories[newsCatIdx]?.events ?? []).length === 0 ? (
                      <Text style={[styles.hint, { fontFamily: reg }]}>No events added yet.</Text>
                    ) : (
                      (newsIndex.categories[newsCatIdx]?.events ?? []).map(ev => (
                        <View key={ev.id} style={[styles.slideCard, { marginBottom: 8 }]}>
                          <View style={styles.rowBetween}>
                            <Text style={[styles.slideNum, { fontFamily: bold, flex: 1 }]} numberOfLines={2}>{ev.title}</Text>
                            <TouchableOpacity onPress={() => handleDeleteEvent(ev.id)}>
                              <Text style={[styles.removeText, { fontFamily: semi }]}>✕ Remove</Text>
                            </TouchableOpacity>
                          </View>
                          <Text style={[styles.cardMeta, { fontFamily: reg }]}>
                            {formatDateUK(ev.date)} at {ev.time} · {ev.location}
                          </Text>
                          {!!ev.openTo && <Text style={[styles.hint, { fontFamily: reg, marginBottom: 0 }]}>{ev.openTo}</Text>}
                        </View>
                      ))
                    )}

                    {/* Add new event form */}
                    <Text style={[styles.label, { fontFamily: semi, marginTop: 12 }]}>Add New Event</Text>

                    <Text style={[styles.label, { fontFamily: semi }]}>Event Title</Text>
                    <TextInput
                      style={[styles.input, { fontFamily: reg }]}
                      value={eventTitle}
                      onChangeText={setEventTitle}
                      placeholder="e.g. Eid Celebration 2026"
                      placeholderTextColor="#aaa"
                    />

                    <Text style={[styles.label, { fontFamily: semi }]}>Date</Text>
                    <DateField
                      isoValue={eventDate}
                      onChange={setEventDate}
                      placeholder="Tap to select event date"
                    />

                    <Text style={[styles.label, { fontFamily: semi }]}>Time (HH:MM)</Text>
                    <TextInput
                      style={[styles.input, { fontFamily: reg }]}
                      value={eventTime}
                      onChangeText={setEventTime}
                      placeholder="e.g. 19:30"
                      placeholderTextColor="#aaa"
                      keyboardType="numbers-and-punctuation"
                    />

                    <Text style={[styles.label, { fontFamily: semi }]}>Location</Text>
                    <TextInput
                      style={[styles.input, { fontFamily: reg }]}
                      value={eventLocation}
                      onChangeText={setEventLocation}
                      placeholder="e.g. EEIS Prayer Hall, Epsom"
                      placeholderTextColor="#aaa"
                    />

                    <Text style={[styles.label, { fontFamily: semi }]}>Details</Text>
                    <TextInput
                      style={[styles.input, styles.inputMulti, { fontFamily: reg }]}
                      value={eventDetails}
                      onChangeText={setEventDetails}
                      placeholder="Full event description"
                      placeholderTextColor="#aaa"
                      multiline
                    />

                    <Text style={[styles.label, { fontFamily: semi }]}>Open To (optional)</Text>
                    <TextInput
                      style={[styles.input, { fontFamily: reg }]}
                      value={eventOpenTo}
                      onChangeText={setEventOpenTo}
                      placeholder="e.g. All welcome, Brothers only"
                      placeholderTextColor="#aaa"
                    />

                    <TouchableOpacity style={[styles.btnGreen, { marginTop: 8 }]} onPress={handleAddEvent}>
                      <Text style={[styles.btnText, { fontFamily: semi }]}>📅 Add Event</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        )}

        {/* ── HEADLINES tab ────────────────────────────────────────────────────── */}
        {tab === 'headlines' && (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

            <Text style={[styles.hint, { fontFamily: reg }]}>
              Scrolling headlines appear in the green countdown bar, alternating with the prayer countdown. Each headline can be filtered by prayer, day, or date range.
            </Text>

            {/* Fetch / Add row */}
            <View style={styles.rowBetween}>
              <TouchableOpacity style={styles.btnBlue} onPress={handleFetchNews}>
                <Text style={[styles.btnText, { fontFamily: semi }]}>
                  {newsIndex ? '↻ Refresh Index' : '⬇ Fetch Index'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnGreen} onPress={openNewHeadline}>
                <Text style={[styles.btnText, { fontFamily: semi }]}>+ New Headline</Text>
              </TouchableOpacity>
            </View>

            {!newsIndex && (
              <Text style={[styles.hint, { fontFamily: reg }]}>
                Tap "Fetch Index" to load the current news index (headlines are stored inside it).
              </Text>
            )}

            {/* Headline list */}
            {(newsIndex?.headlines ?? []).map(h => (
              <View key={h.id} style={[styles.card, !h.active && { opacity: 0.55 }]}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.cardTitle, { fontFamily: bold, flex: 1, marginRight: 8 }]} numberOfLines={2}>
                    {h.text}
                  </Text>
                  <Switch
                    value={h.active}
                    onValueChange={() => toggleHeadlineActive(h)}
                    trackColor={{ true: Colors.freshGreen, false: '#ccc' }}
                  />
                </View>
                {h.linkType !== 'none' && (
                  <Text style={[styles.cardMeta, { fontFamily: reg }]}>
                    Link: {h.linkType}{h.linkCatId ? ` → ${h.linkCatId}` : ''}
                  </Text>
                )}
                {(h.prayers?.length ?? 0) > 0 && (
                  <Text style={[styles.cardMeta, { fontFamily: reg }]}>
                    Prayers: {h.prayers!.map(p => PRAYER_LABELS[p] ?? p).join(', ')}
                  </Text>
                )}
                {(h.daysOfWeek?.length ?? 0) > 0 && (
                  <Text style={[styles.cardMeta, { fontFamily: reg }]}>
                    Days: {h.daysOfWeek!.map(d => DAYS[d]).join(', ')}
                  </Text>
                )}
                {(h.startDate || h.endDate) && (
                  <Text style={[styles.cardMeta, { fontFamily: reg }]}>
                    {h.startDate ?? 'start'} → {h.endDate ?? 'end'}
                  </Text>
                )}
                <View style={styles.cardActions}>
                  <TouchableOpacity style={[styles.btnOutline, { flex: 1 }]} onPress={() => openEditHeadline(h)}>
                    <Text style={[styles.btnOutlineText, { fontFamily: semi }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btnDanger} onPress={() => handleDeleteHeadline(h.id)}>
                    <Text style={[styles.btnText, { fontFamily: semi }]}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {newsIndex && (newsIndex.headlines ?? []).length === 0 && (
              <Text style={[styles.hint, { fontFamily: reg, textAlign: 'center', marginTop: 16 }]}>
                No headlines yet. Tap "+ New Headline" to add one.
              </Text>
            )}

            {/* Add / Edit form */}
            {hlShowForm && (
              <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: Colors.freshGreen, marginTop: 8 }]}>
                <Text style={[styles.cardTitle, { fontFamily: bold }]}>
                  {hlEditId ? 'Edit Headline' : 'New Headline'}
                </Text>

                <Text style={[styles.label, { fontFamily: semi }]}>Ticker Text *</Text>
                <TextInput
                  style={[styles.input, { fontFamily: reg }]}
                  value={hlDraft.text}
                  onChangeText={v => setHlDraft(p => ({ ...p, text: v }))}
                  placeholder="e.g. Jummah this Friday at 1:15pm"
                  placeholderTextColor="#aaa"
                />

                <View style={styles.rowBetween}>
                  <Text style={[styles.label, { fontFamily: semi }]}>Active</Text>
                  <Switch
                    value={hlDraft.active}
                    onValueChange={v => setHlDraft(p => ({ ...p, active: v }))}
                    trackColor={{ true: Colors.freshGreen, false: '#ccc' }}
                  />
                </View>

                <Text style={[styles.label, { fontFamily: semi }]}>Link Type (tap to open on tap)</Text>
                <View style={styles.chipRow}>
                  {(['none', 'announcement', 'event', 'article'] as HeadlineLinkType[]).map(lt => (
                    <TouchableOpacity
                      key={lt}
                      style={[styles.chip, hlDraft.linkType === lt && styles.chipActive]}
                      onPress={() => setHlDraft(p => ({ ...p, linkType: lt, linkCatId: undefined, linkItemId: undefined }))}
                    >
                      <Text style={[styles.chipText, { fontFamily: semi }, hlDraft.linkType === lt && styles.chipTextActive]}>
                        {lt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {hlDraft.linkType !== 'none' && (
                  <>
                    <Text style={[styles.label, { fontFamily: semi }]}>Category ID</Text>
                    <TextInput
                      style={[styles.input, { fontFamily: reg }]}
                      value={hlDraft.linkCatId ?? ''}
                      onChangeText={v => setHlDraft(p => ({ ...p, linkCatId: v || undefined }))}
                      placeholder="e.g. announcements, events, islamic-lectures"
                      placeholderTextColor="#aaa"
                    />
                  </>
                )}

                <Text style={[styles.label, { fontFamily: semi }]}>Show for Prayers (empty = all)</Text>
                <View style={styles.chipRow}>
                  {PRAYERS.map(p => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.chip, (hlDraft.prayers ?? []).includes(p) && styles.chipActive]}
                      onPress={() => setHlDraft(prev => {
                        const arr = prev.prayers ?? [];
                        return { ...prev, prayers: arr.includes(p) ? arr.filter(x => x !== p) : [...arr, p] };
                      })}
                    >
                      <Text style={[styles.chipText, { fontFamily: semi }, (hlDraft.prayers ?? []).includes(p) && styles.chipTextActive]}>
                        {PRAYER_LABELS[p]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.label, { fontFamily: semi }]}>Show on Days (empty = all)</Text>
                <View style={styles.chipRow}>
                  {DAYS.map((d, i) => (
                    <TouchableOpacity
                      key={d}
                      style={[styles.chip, (hlDraft.daysOfWeek ?? []).includes(i) && styles.chipActive]}
                      onPress={() => setHlDraft(prev => {
                        const arr = prev.daysOfWeek ?? [];
                        return { ...prev, daysOfWeek: arr.includes(i) ? arr.filter(x => x !== i) : [...arr, i] };
                      })}
                    >
                      <Text style={[styles.chipText, { fontFamily: semi }, (hlDraft.daysOfWeek ?? []).includes(i) && styles.chipTextActive]}>
                        {d}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.label, { fontFamily: semi }]}>Start Date (optional)</Text>
                <DateField
                  isoValue={hlDraft.startDate ?? ''}
                  onChange={v => setHlDraft(p => ({ ...p, startDate: v || undefined }))}
                  placeholder="Tap to select start date"
                />

                <Text style={[styles.label, { fontFamily: semi, marginTop: 8 }]}>End Date (optional)</Text>
                <DateField
                  isoValue={hlDraft.endDate ?? ''}
                  onChange={v => setHlDraft(p => ({ ...p, endDate: v || undefined }))}
                  placeholder="Tap to select end date"
                />

                <View style={[styles.cardActions, { marginTop: 12 }]}>
                  <TouchableOpacity style={[styles.btnOutline, { flex: 1 }]} onPress={() => { setHlShowForm(false); setHlEditId(null); }}>
                    <Text style={[styles.btnOutlineText, { fontFamily: semi }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnGreen, { flex: 2 }]} onPress={handleSaveHeadline}>
                    <Text style={[styles.btnText, { fontFamily: semi }]}>
                      {hlEditId ? '💾 Save Changes' : '+ Add Headline'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

          </ScrollView>
        )}

        {/* ── Inline preview overlay (NOT a nested Modal — Android blanks nested modals) ── */}
        {previewVisible && previewSlides.length > 0 && (
          <View style={StyleSheet.absoluteFill}>
            <View style={styles.previewRoot}>

              {/* Close button */}
              <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewVisible(false)}>
                <Text style={styles.previewCloseTxt}>✕ Close Preview</Text>
              </TouchableOpacity>

              {/* Slide FlatList — must have flex:1 so it fills the overlay height */}
              <FlatList
                ref={previewFlatRef}
                style={{ flex: 1 }}
                data={previewSlides}
                keyExtractor={s => s.id}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onViewableItemsChanged={({ viewableItems }) => {
                  if (viewableItems.length > 0) setPreviewIndex(viewableItems[0].index ?? 0);
                }}
                viewabilityConfig={{ viewAreaCoveragePercentThreshold: 60 }}
                getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
                onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                  if (previewIndex === previewSlides.length - 1) {
                    if (e.nativeEvent.contentOffset.x > SCREEN_W * (previewSlides.length - 1) + 40) {
                      setPreviewVisible(false);
                    }
                  }
                }}
                scrollEventThrottle={16}
                renderItem={({ item }) => (
                  <View style={[styles.previewSlide, { backgroundColor: item.bgColor }]}>
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="contain" />
                    ) : null}
                    <View style={styles.previewTextOverlay}>
                      {!!item.title && <Text style={styles.previewTitle}>{item.title}</Text>}
                      {!!item.body  && <Text style={styles.previewBody}>{item.body}</Text>}
                    </View>
                    <Text style={styles.previewDuration}>
                      {(item.displayDurationSec ?? 10)}s per slide
                    </Text>
                  </View>
                )}
              />

              {/* Dots */}
              {previewSlides.length > 1 && (
                <View style={styles.previewDots}>
                  {previewSlides.map((_, i) => (
                    <View key={i} style={[styles.previewDot, i === previewIndex && styles.previewDotActive]} />
                  ))}
                </View>
              )}

              <Text style={styles.previewHint}>
                {previewIndex === previewSlides.length - 1
                  ? 'Swipe left to close'
                  : `Slide ${previewIndex + 1} of ${previewSlides.length}  ·  Swipe to advance`}
              </Text>

            </View>
          </View>
        )}

      </SafeAreaView>
      </KeyboardAvoidingView>
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
  tabBar:      { backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#DDE3EA', maxHeight: 44 },
  tabBarContent: { flexDirection: 'row', alignItems: 'stretch' },
  tabItem:     { alignItems: 'center', paddingVertical: 11, paddingHorizontal: 14 },
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

  // ── Slide thumbnail in editor ──────────────────────────────────────────────
  thumbContainer: {
    width: '100%', borderRadius: 10, overflow: 'hidden',
    marginBottom: 8,
  },
  thumbTextRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10, paddingVertical: 8, gap: 8,
  },
  thumbTitle: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  thumbBody:  { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },
  thumbReplaceBtn: {
    backgroundColor: Colors.deepBlue, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 5, flexShrink: 0,
  },

  // ── Inline preview overlay ─────────────────────────────────────────────────
  previewRoot: {
    flex: 1, backgroundColor: '#063968',
  },
  previewClose: {
    position: 'absolute', top: 14, right: 14, zIndex: 20,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  previewCloseTxt: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  previewSlide: {
    width: SCREEN_W, flex: 1,
    justifyContent: 'flex-end', // text overlay at bottom
  },
  previewTextOverlay: {
    width: '100%',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 72,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
  },
  previewTitle: {
    color: '#FFF', fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 6,
  },
  previewBody: {
    color: 'rgba(255,255,255,0.9)', fontSize: 14, textAlign: 'center', lineHeight: 22,
  },
  previewDuration: {
    position: 'absolute', top: 56, left: 16,
    color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  previewDots: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    position: 'absolute', bottom: 58, left: 0, right: 0, gap: 8,
  },
  previewDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' },
  previewDotActive: { backgroundColor: '#FFF', width: 20, borderRadius: 4 },
  previewHint: {
    position: 'absolute', bottom: 32, left: 0, right: 0,
    textAlign: 'center', color: 'rgba(255,255,255,0.4)',
    fontSize: 11, fontWeight: '500',
  },
});
