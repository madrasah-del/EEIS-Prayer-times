/**
 * QuoteManager (v73) — in-app search / add / edit / delete of the Quran + Hadith quotes,
 * with a live flash-screen preview and a "feature for everyone" broadcast.
 *
 * Rendered as an absoluteFill overlay (NOT a nested Modal) because the admin screen is
 * itself a Modal and Android blanks rich nested-Modal content (see CLAUDE.md learning).
 *
 * - Edits are made to a local working copy; "Publish all changes" signs the whole set with
 *   the admin passphrase and uploads it (channel-aware). The CSV tool still exists for bulk.
 * - "Feature for everyone" writes a separate signed featured-quote file; every user's alarms
 *   then show that quote until it is cleared.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator,
  StyleSheet, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  fetchQuotes, buildSignedQuotes, applyQuotesLocally,
  buildSignedFeatured, applyFeaturedLocally, fetchFeaturedQuote, Quote,
} from '../data/quotes';
import { uploadQuotesFile, uploadFeaturedQuoteFile } from '../data/githubApi';
import { IS_TEST } from '../data/channel';
import { Colors } from '../constants/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  adminPass: string;
  token: string;
  reg?: string;
  semi?: string;
};

type Draft = { type: 'quran' | 'hadith'; arabic: string; text: string; reference: string };
const EMPTY_DRAFT: Draft = { type: 'quran', arabic: '', text: '', reference: '' };

export function QuoteManager({ visible, onClose, adminPass, token, reg, semi }: Props) {
  const [loading, setLoading]   = useState(false);
  const [quotes,  setQuotes]    = useState<Quote[]>([]);
  const [search,  setSearch]    = useState('');
  const [dirty,   setDirty]     = useState(false);
  const [status,  setStatus]    = useState('');
  const [busy,    setBusy]      = useState(false);

  // Editor state — editIndex === -2 means "closed", -1 means "adding new"
  const [editIndex, setEditIndex] = useState(-2);
  const [draft,     setDraft]     = useState<Draft>(EMPTY_DRAFT);

  // Preview + featured
  const [previewDraft, setPreviewDraft] = useState<Draft | null>(null);
  const [featured,     setFeatured]     = useState<Quote | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setStatus('');
    try {
      const [q, f] = await Promise.all([
        fetchQuotes().catch(() => [] as Quote[]),
        fetchFeaturedQuote().catch(() => null),
      ]);
      setQuotes(q);
      setFeatured(f);
      setDirty(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (visible) reload(); }, [visible, reload]);

  if (!visible) return null;

  const term = search.trim().toLowerCase();
  const filtered = term
    ? quotes
        .map((q, i) => ({ q, i }))
        .filter(({ q }) =>
          (q.text || '').toLowerCase().includes(term) ||
          (q.reference || '').toLowerCase().includes(term) ||
          (q.arabic || '').includes(search.trim()))
    : quotes.map((q, i) => ({ q, i }));

  const openEditor = (index: number) => {
    if (index === -1) { setDraft(EMPTY_DRAFT); }
    else {
      const q = quotes[index];
      setDraft({
        type: q.type === 'hadith' ? 'hadith' : 'quran',
        arabic: q.arabic ?? '', text: q.text ?? '', reference: q.reference ?? '',
      });
    }
    setEditIndex(index);
  };

  const saveDraftToList = () => {
    if (!draft.text.trim()) { setStatus('English text is required.'); return; }
    const next = [...quotes];
    const entry: Quote = {
      id: 0, text: draft.text.trim(), reference: draft.reference.trim(),
      arabic: draft.arabic.trim() || undefined,
      type: draft.type,
    };
    if (editIndex === -1) next.push(entry);
    else next[editIndex] = entry;
    // Re-id sequentially so the file stays tidy
    next.forEach((q, i) => { q.id = i; });
    setQuotes(next);
    setDirty(true);
    setEditIndex(-2);
    setStatus(editIndex === -1 ? 'Quote added (not yet published).' : 'Quote updated (not yet published).');
  };

  const deleteCurrent = () => {
    if (editIndex < 0) { setEditIndex(-2); return; }
    const next = quotes.filter((_, i) => i !== editIndex);
    next.forEach((q, i) => { q.id = i; });
    setQuotes(next);
    setDirty(true);
    setEditIndex(-2);
    setStatus('Quote deleted (not yet published).');
  };

  const publishAll = async () => {
    if (!adminPass) { setStatus('Unlock admin first — the passphrase is needed to sign.'); return; }
    if (!token)     { setStatus('Add your GitHub token on the Campaigns tab first.'); return; }
    if (quotes.length === 0) { setStatus('There are no quotes to publish.'); return; }
    try {
      setBusy(true);
      setStatus(`Signing & uploading ${quotes.length} quotes…`);
      const signed = await buildSignedQuotes(quotes, adminPass);
      await uploadQuotesFile(signed, token);
      await applyQuotesLocally(signed);
      setDirty(false);
      setStatus(`✓ Published ${quotes.length} quotes. ${IS_TEST ? 'TEST app uses them now.' : 'Live apps update within ~24 h.'}`);
    } catch (e: any) {
      setStatus(`Publish failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const featureDraft = async (d: Draft) => {
    if (!d.text.trim()) { setStatus('English text is required to feature a quote.'); return; }
    if (!adminPass) { setStatus('Unlock admin first — the passphrase is needed to sign.'); return; }
    if (!token)     { setStatus('Add your GitHub token on the Campaigns tab first.'); return; }
    const q: Quote = {
      id: 0, text: d.text.trim(), reference: d.reference.trim(),
      arabic: d.arabic.trim() || undefined, type: d.type,
    };
    try {
      setBusy(true);
      setStatus('Featuring this quote for everyone…');
      const signed = await buildSignedFeatured(q, adminPass);
      await uploadFeaturedQuoteFile(signed, token);
      await applyFeaturedLocally(q);
      setFeatured(q);
      setStatus(`📌 Featured for everyone. ${IS_TEST ? 'TEST app uses it now.' : 'It shows on all users’ next alarms.'} Clear it to return to the normal rotation.`);
    } catch (e: any) {
      setStatus(`Feature failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const clearFeatured = async () => {
    if (!adminPass) { setStatus('Unlock admin first — the passphrase is needed to sign.'); return; }
    if (!token)     { setStatus('Add your GitHub token on the Campaigns tab first.'); return; }
    try {
      setBusy(true);
      setStatus('Clearing featured quote…');
      const signed = await buildSignedFeatured(null, adminPass);
      await uploadFeaturedQuoteFile(signed, token);
      await applyFeaturedLocally(null);
      setFeatured(null);
      setStatus('✓ Featured quote cleared — back to the normal rotation.');
    } catch (e: any) {
      setStatus(`Clear failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  // ── Editor panel ────────────────────────────────────────────────────────────
  if (editIndex !== -2) {
    return (
      <View style={styles.overlay}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setEditIndex(-2)} hitSlop={12}>
              <Text style={[styles.headerBtn, { fontFamily: semi }]}>‹ Back</Text>
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { fontFamily: semi }]}>
              {editIndex === -1 ? 'Add quote' : 'Edit quote'}
            </Text>
            <View style={{ width: 54 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
            <Text style={[styles.label, { fontFamily: semi }]}>Type</Text>
            <View style={{ flexDirection: 'row', marginBottom: 14 }}>
              {(['quran', 'hadith'] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeChip, draft.type === t && styles.typeChipOn]}
                  onPress={() => setDraft(d => ({ ...d, type: t }))}
                >
                  <Text style={[
                    styles.typeChipText,
                    { fontFamily: semi },
                    draft.type === t && { color: '#FFF' },
                  ]}>
                    {t === 'quran' ? 'Quran' : 'Hadith'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { fontFamily: semi }]}>Arabic (optional — shows above the English)</Text>
            <TextInput
              style={[styles.input, styles.arabicInput, { fontFamily: reg }]}
              value={draft.arabic}
              onChangeText={v => setDraft(d => ({ ...d, arabic: v }))}
              placeholder="﻿فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا"
              placeholderTextColor="#AAA"
              multiline
              textAlign="right"
            />

            <Text style={[styles.label, { fontFamily: semi }]}>English (required)</Text>
            <TextInput
              style={[styles.input, { fontFamily: reg, minHeight: 70 }]}
              value={draft.text}
              onChangeText={v => setDraft(d => ({ ...d, text: v }))}
              placeholder="So, surely with every hardship comes ease."
              placeholderTextColor="#AAA"
              multiline
            />

            <Text style={[styles.label, { fontFamily: semi }]}>Reference</Text>
            <TextInput
              style={[styles.input, { fontFamily: reg }]}
              value={draft.reference}
              onChangeText={v => setDraft(d => ({ ...d, reference: v }))}
              placeholder="Qur'an — Ash-Sharh 94:5"
              placeholderTextColor="#AAA"
            />

            <TouchableOpacity style={[styles.btn, styles.btnGhost, { marginTop: 18 }]} onPress={() => setPreviewDraft(draft)}>
              <Text style={[styles.btnText, styles.btnGhostText, { fontFamily: semi }]}>👁  Preview on flash screen</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btn, { marginTop: 10 }]} onPress={saveDraftToList} disabled={busy}>
              <Text style={[styles.btnText, { fontFamily: semi }]}>✓  Save to list</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btn, styles.btnAmber, { marginTop: 10 }]} onPress={() => featureDraft(draft)} disabled={busy}>
              {busy ? <ActivityIndicator color="#FFF" /> :
                <Text style={[styles.btnText, { fontFamily: semi }]}>📌  Feature this quote for everyone</Text>}
            </TouchableOpacity>

            {editIndex >= 0 && (
              <TouchableOpacity style={[styles.btn, styles.btnRed, { marginTop: 10 }]} onPress={deleteCurrent} disabled={busy}>
                <Text style={[styles.btnText, { fontFamily: semi }]}>🗑  Delete this quote</Text>
              </TouchableOpacity>
            )}

            {!!status && <Text style={[styles.status, { fontFamily: reg }]}>{status}</Text>}
          </ScrollView>
        </SafeAreaView>

        {previewDraft && (
          <FlashPreview draft={previewDraft} reg={reg} semi={semi} onClose={() => setPreviewDraft(null)} />
        )}
      </View>
    );
  }

  // ── List panel ──────────────────────────────────────────────────────────────
  return (
    <View style={styles.overlay}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={[styles.headerBtn, { fontFamily: semi }]}>✕ Close</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { fontFamily: semi }]}>
            Manage Quotes{IS_TEST ? ' (TEST)' : ''}
          </Text>
          <TouchableOpacity onPress={reload} hitSlop={12}>
            <Text style={[styles.headerBtn, { fontFamily: semi }]}>↻</Text>
          </TouchableOpacity>
        </View>

        {/* Featured banner */}
        <View style={styles.featuredBar}>
          {featured ? (
            <>
              <Text style={[styles.featuredText, { fontFamily: reg }]} numberOfLines={2}>
                📌 Featured now: “{featured.text}” {featured.reference ? `— ${featured.reference}` : ''}
              </Text>
              <TouchableOpacity onPress={clearFeatured} disabled={busy}>
                <Text style={[styles.featuredClear, { fontFamily: semi }]}>Clear</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={[styles.featuredText, { fontFamily: reg }]}>
              No featured quote — alarms use the normal rotation.
            </Text>
          )}
        </View>

        <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
          <TextInput
            style={[styles.input, { fontFamily: reg }]}
            value={search}
            onChangeText={setSearch}
            placeholder="🔎 Search English, Arabic or reference…"
            placeholderTextColor="#AAA"
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <Text style={[styles.count, { fontFamily: reg }]}>
              {filtered.length} of {quotes.length} quotes
            </Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={[styles.btnSmall]} onPress={() => openEditor(-1)}>
              <Text style={[styles.btnSmallText, { fontFamily: semi }]}>＋ Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 30 }} color={Colors.deepBlue} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.i)}
            initialNumToRender={15}
            style={{ flex: 1, marginTop: 6 }}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 120 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.row} onPress={() => openEditor(item.i)}>
                <View style={[styles.rowBadge, item.q.type === 'hadith' ? styles.badgeHadith : styles.badgeQuran]}>
                  <Text style={[styles.rowBadgeText, { fontFamily: semi }]}>
                    {item.q.type === 'hadith' ? 'H' : 'Q'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  {!!item.q.arabic && (
                    <Text style={[styles.rowArabic, { fontFamily: reg }]} numberOfLines={1}>{item.q.arabic}</Text>
                  )}
                  <Text style={[styles.rowText, { fontFamily: reg }]} numberOfLines={2}>{item.q.text}</Text>
                  {!!item.q.reference && (
                    <Text style={[styles.rowRef, { fontFamily: semi }]} numberOfLines={1}>{item.q.reference}</Text>
                  )}
                </View>
                <Text style={[styles.rowChevron, { fontFamily: reg }]}>›</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={[styles.status, { fontFamily: reg, textAlign: 'center', marginTop: 24 }]}>
                {term ? 'No quotes match your search.' : 'No quotes loaded — check your connection, then ↻.'}
              </Text>
            }
          />
        )}

        {/* Footer: publish */}
        <View style={styles.footer}>
          {!!status && <Text style={[styles.status, { fontFamily: reg, marginBottom: 8 }]}>{status}</Text>}
          <TouchableOpacity
            style={[styles.btn, dirty ? styles.btnGreen : styles.btnDisabled]}
            onPress={publishAll}
            disabled={busy || !dirty}
          >
            {busy ? <ActivityIndicator color="#FFF" /> :
              <Text style={[styles.btnText, { fontFamily: semi }]}>
                {dirty ? '💾  Publish all changes' : 'No unpublished changes'}
              </Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ── Flash-screen preview (mimics EeisAlarmActivity layout) ─────────────────────
function FlashPreview({ draft, reg, semi, onClose }: { draft: Draft; reg?: string; semi?: string; onClose: () => void }) {
  const arabic = draft.arabic.trim();
  return (
    <View style={styles.previewOverlay}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={styles.previewCard}>
          <Text style={[styles.previewPrayer, { fontFamily: semi }]}>FAJR</Text>
          <View style={styles.previewSep} />
          {!!arabic && (
            <Text style={[styles.previewArabic, { fontFamily: reg }]}>{arabic}</Text>
          )}
          <Text style={[styles.previewEnglish, { fontFamily: reg }]}>
            “{draft.text.trim() || '(English text)'}”
          </Text>
          {!!draft.reference.trim() && (
            <Text style={[styles.previewRef, { fontFamily: semi }]}>{draft.reference.trim()}</Text>
          )}
          <Text style={[styles.previewNote, { fontFamily: reg }]}>
            Preview of the alarm / flash screen. Actual screen also shows the logo and prayer times.
          </Text>
        </View>
        <TouchableOpacity style={[styles.btn, styles.btnGhost, { margin: 18 }]} onPress={onClose}>
          <Text style={[styles.btnText, styles.btnGhostText, { fontFamily: semi }]}>Close preview</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#F5F5F5', zIndex: 50 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: Colors.deepBlue,
  },
  headerBtn:   { color: '#FFF', fontSize: 16 },
  headerTitle: { color: '#FFF', fontSize: 17 },
  label: { fontSize: 13, color: '#333', marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: '#CCC', borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 10, fontSize: 15, color: '#111', backgroundColor: '#FFF',
  },
  arabicInput: { minHeight: 56, fontSize: 20, lineHeight: 32 },
  typeChip: {
    paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
    borderColor: Colors.deepBlue, marginRight: 10,
  },
  typeChipOn:   { backgroundColor: Colors.deepBlue },
  typeChipText: { color: Colors.deepBlue, fontSize: 14 },
  count: { color: '#666', fontSize: 13 },
  btn: {
    backgroundColor: Colors.deepBlue, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  btnText:  { color: '#FFF', fontSize: 15 },
  btnGreen: { backgroundColor: Colors.freshGreen },
  btnAmber: { backgroundColor: '#C9821E' },
  btnRed:   { backgroundColor: Colors.maroonRed },
  btnDisabled: { backgroundColor: '#B7BFC8' },
  btnGhost: { backgroundColor: '#FFF', borderWidth: 1, borderColor: Colors.deepBlue },
  btnGhostText: { color: Colors.deepBlue },
  btnSmall: { backgroundColor: Colors.deepBlue, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18 },
  btnSmallText: { color: '#FFF', fontSize: 14 },
  status: { color: '#444', fontSize: 13, lineHeight: 19 },
  featuredBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF7E6',
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0E2C0',
  },
  featuredText:  { flex: 1, color: '#6B5418', fontSize: 13, lineHeight: 18 },
  featuredClear: { color: Colors.maroonRed, fontSize: 14, marginLeft: 10 },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF',
    borderRadius: 12, padding: 12, marginTop: 8, borderWidth: 1, borderColor: '#ECECEC',
  },
  rowBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  badgeQuran:  { backgroundColor: Colors.deepBlue },
  badgeHadith: { backgroundColor: '#1E8E6B' },
  rowBadgeText: { color: '#FFF', fontSize: 13 },
  rowArabic: { color: '#222', fontSize: 16, textAlign: 'right', marginBottom: 2 },
  rowText:   { color: '#222', fontSize: 14, lineHeight: 19 },
  rowRef:    { color: Colors.maroonRed, fontSize: 12, marginTop: 3 },
  rowChevron: { color: '#BBB', fontSize: 22, marginLeft: 8 },
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14,
    backgroundColor: '#F5F5F5', borderTopWidth: 1, borderTopColor: '#E2E2E2',
  },
  // Flash preview
  previewOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.blueDeep, zIndex: 60 },
  previewCard: { flex: 1, justifyContent: 'center', paddingHorizontal: 26 },
  previewPrayer: { color: '#FFD24D', fontSize: 22, textAlign: 'center', letterSpacing: 2 },
  previewSep: { height: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginVertical: 18 },
  previewArabic:  { color: '#FFFFFF', fontSize: 26, lineHeight: 42, textAlign: 'center', marginBottom: 14, writingDirection: 'rtl' },
  previewEnglish: { color: '#FFFFFF', fontSize: 19, lineHeight: 28, textAlign: 'center', fontStyle: 'italic' },
  previewRef:     { color: '#CFE3FF', fontSize: 15, textAlign: 'center', marginTop: 12 },
  previewNote:    { color: 'rgba(255,255,255,0.6)', fontSize: 12, textAlign: 'center', marginTop: 30 },
});
