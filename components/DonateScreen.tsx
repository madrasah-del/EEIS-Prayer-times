/**
 * DonateScreen — accessed from the hamburger menu or Donate tab.
 *
 * Three sections:
 *  1. Bank Transfer — EEIS bank details, reference = Firstname Surname
 *  2. Gift Aid Declaration — fillable form → emails eeis@hotmail.co.uk
 *  3. Standing Order — fillable form + bank details → emails eeis@hotmail.co.uk
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Modal, StyleSheet, Linking, Alert, Dimensions, PixelRatio,
  KeyboardAvoidingView, Platform, findNodeHandle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/theme';

// ── Responsive scaling ────────────────────────────────────────────────────────
// Use physical pixel width to scale relative to a 1080px reference (S20).
// S20 (1080px wide) → ds = 1.0   S25 Ultra (1440px wide) → ds = 1.33
const { width: W } = Dimensions.get('window');
const physicalW = W * PixelRatio.get();
const ds = Math.min(1.5, Math.max(1.0, physicalW / 1080));

function dp(size: number): number {
  return Math.round(size * ds);
}

// ── Constants ─────────────────────────────────────────────────────────────────
const EEIS_EMAIL   = 'eeis@hotmail.co.uk';
const BANK_NAME    = 'Barclays Bank plc';
const SORT_CODE    = '20-29-90';
const ACCOUNT_NO   = '00701882';
const ACCOUNT_NAME = 'Epsom & Ewell Islamic Society';

type Props = {
  visible: boolean;
  onClose: () => void;
  fontsLoaded: boolean;
};

type Section = 'bank' | 'online' | 'giftaid' | 'standing';

// ── Form state defaults ───────────────────────────────────────────────────────

const GIFT_AID_EMPTY = {
  title: '', fullName: '', addressLine1: '', town: '', county: '', postcode: '', phone: '',
  past4Years: false, futureDonations: true, signature: '',
};

const SO_EMPTY = {
  title: '', fullName: '', addressLine1: '', town: '', county: '', postcode: '',
  sortCode: '', bankName: '', accountNo: '', amount: '', startDate: '',
  past4Years: false, futureDonations: true, signature: '',
};

// ── Sort code → bank name lookup (first 2 digits) ─────────────────────────────
const SORT_CODE_BANKS: Record<string, string> = {
  '20': 'Barclays', '22': 'Barclays', '23': 'Barclays',
  '10': 'NatWest',  '50': 'NatWest',  '60': 'NatWest',  '07': 'NatWest',
  '30': 'Lloyds Bank', '31': 'Lloyds Bank', '77': 'Lloyds Bank',
  '32': 'Halifax',
  '40': 'HSBC',     '41': 'HSBC',
  '09': 'Bank of Scotland', '80': 'Bank of Scotland',
  '83': 'TSB',  '64': 'TSB',  '76': 'TSB',
  '12': 'Santander', '53': 'Santander', '89': 'Santander',
  '08': 'Co-operative Bank',
  '72': 'Clydesdale Bank', '82': 'Clydesdale Bank',
  '56': 'Yorkshire Bank',
  '86': 'Starling Bank',
  '04': 'Monzo',
  '16': 'Nationwide',
  '55': 'Metro Bank',
  '87': 'Tesco Bank',
  '11': 'NatWest',  '15': 'NatWest',
};

function bankFromSortCode(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 2) return '';
  return SORT_CODE_BANKS[digits.slice(0, 2)] ?? '';
}

function formatSortCode(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 6);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

const TITLES = ['Mr', 'Mrs', 'Miss', 'Ms', 'Dr'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(): string {
  return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

function sendEmail(subject: string, body: string) {
  const url = `mailto:${EEIS_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  Linking.openURL(url).catch(() => {
    Alert.alert('Could not open email app', 'Please email ' + EEIS_EMAIL + ' directly.');
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTab({ label, icon, active, onPress }: {
  label: string; icon: string; active: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.tab, active && styles.tabActive]} onPress={onPress} activeOpacity={0.75}>
      <Text style={styles.tabIcon}>{icon}</Text>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Field({ label, value, onChange, placeholder, keyboardType, multiline, autoComplete, textContentType, onFocus, readOnly, fieldRef }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; keyboardType?: any; multiline?: boolean;
  autoComplete?: any; textContentType?: any; onFocus?: () => void; readOnly?: boolean;
  fieldRef?: (el: TextInput | null) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        ref={fieldRef}
        style={[styles.fieldInput, multiline && styles.fieldInputMulti, readOnly && { backgroundColor: '#F5F5F5', color: Colors.inkMute }]}
        value={value}
        onChangeText={readOnly ? undefined : onChange}
        editable={!readOnly}
        placeholder={placeholder ?? ''}
        placeholderTextColor={Colors.inkMute}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        autoCapitalize="words"
        autoComplete={autoComplete}
        textContentType={textContentType}
        onFocus={onFocus}
      />
    </View>
  );
}

function CheckRow({ label, value, onChange }: {
  label: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <TouchableOpacity style={styles.checkRow} onPress={() => onChange(!value)} activeOpacity={0.7}>
      <View style={[styles.checkbox, value && styles.checkboxOn]}>
        {value && <Text style={styles.checkMark}>✓</Text>}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function BankRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.bankRow}>
      <Text style={styles.bankRowLabel}>{label}</Text>
      <Text style={[styles.bankRowValue, mono && styles.bankRowMono]}>{value}</Text>
    </View>
  );
}

// ── Calendar date picker ───────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_NAMES   = ['M','T','W','T','F','S','S'];

function isoToDisplayDate(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  return `${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}`;
}

function MiniCalendarPicker({ visible, value, onSelect, onClose }: {
  visible: boolean; value: string; onSelect: (iso: string) => void; onClose: () => void;
}) {
  const initial = value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(value + 'T12:00:00Z') : new Date();
  const [year,  setYear]  = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth());

  useEffect(() => {
    if (!visible) return;
    const d = value && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(value + 'T12:00:00Z') : new Date();
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }, [visible, value]);

  const firstDow = new Date(year, month, 1).getDay();
  const daysInM  = new Date(year, month + 1, 0).getDate();
  const blanks   = (firstDow + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(blanks).fill(null),
    ...Array.from({ length: daysInM }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={calSt.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={calSt.box}>
          <View style={calSt.nav}>
            <TouchableOpacity onPress={prevMonth} hitSlop={10}><Text style={calSt.navArrow}>{'‹'}</Text></TouchableOpacity>
            <Text style={calSt.navTitle}>{MONTH_NAMES[month]} {year}</Text>
            <TouchableOpacity onPress={nextMonth} hitSlop={10}><Text style={calSt.navArrow}>{'›'}</Text></TouchableOpacity>
          </View>
          <View style={calSt.week}>
            {DAY_NAMES.map((d, i) => <Text key={i} style={calSt.dayHeader}>{d}</Text>)}
          </View>
          {Array.from({ length: cells.length / 7 }).map((_, row) => (
            <View key={row} style={calSt.week}>
              {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                if (!day) return <View key={col} style={calSt.dayCell} />;
                const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                const isSelected = iso === value;
                const todayIso = new Date().toISOString().slice(0, 10);
                const isToday  = iso === todayIso;
                return (
                  <TouchableOpacity
                    key={col}
                    style={[calSt.dayCell, isSelected && calSt.daySel, isToday && !isSelected && calSt.dayToday]}
                    onPress={() => { onSelect(iso); onClose(); }}
                  >
                    <Text style={[calSt.dayText, isSelected && calSt.daySelText]}>{day}</Text>
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

const calSt = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  box:        { backgroundColor: '#FFF', borderRadius: 14, padding: 16, width: 300, elevation: 8,
                shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8 },
  nav:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  navArrow:   { fontSize: 24, color: Colors.deepBlue, paddingHorizontal: 8 },
  navTitle:   { fontSize: 16, fontWeight: '700', color: Colors.ink },
  week:       { flexDirection: 'row' },
  dayHeader:  { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: Colors.inkMute, paddingBottom: 4 },
  dayCell:    { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', margin: 1, borderRadius: 20 },
  daySel:     { backgroundColor: Colors.deepBlue },
  dayToday:   { borderWidth: 1, borderColor: Colors.deepBlue },
  dayText:    { fontSize: 14, color: Colors.ink },
  daySelText: { color: '#FFF', fontWeight: '700' },
});

function DatePickerField({ label, isoValue, onChange, placeholder = 'Tap to choose date' }: {
  label: string; isoValue: string; onChange: (iso: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const display = isoToDisplayDate(isoValue) || placeholder;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity style={dpSt.btn} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={dpSt.icon}>📅</Text>
        <Text style={[dpSt.text, !isoValue && dpSt.placeholder]}>{display}</Text>
      </TouchableOpacity>
      <MiniCalendarPicker
        visible={open}
        value={isoValue}
        onSelect={(iso) => { onChange(iso); setOpen(false); }}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

const dpSt = StyleSheet.create({
  btn:         { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1,
                  borderColor: '#C0CCD8', borderRadius: 8, paddingHorizontal: 12,
                  paddingVertical: 10, backgroundColor: '#FAFAFA' },
  icon:        { fontSize: 16 },
  text:        { fontSize: 14, color: Colors.ink, flex: 1 },
  placeholder: { color: Colors.inkMute },
});

// ── Donate Online section ──────────────────────────────────────────────────────

const DONATE_ONLINE_URL = 'https://givealittle.co/c/3eQ2G3VxeMY85q2rQE411U';

function DonateOnlineSection() {
  return (
    <ScrollView contentContainerStyle={styles.sectionContentShort} showsVerticalScrollIndicator={false}>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>💻 Donate online</Text>
        <Text style={styles.infoText}>
          You can donate securely online by debit or credit card.{'\n\n'}
          <Text style={{ fontWeight: '700' }}>Tip:</Text> when you donate through Give a Little, please also complete its Gift Aid declaration. That lets EEIS automatically identify all the card donations you make — online and in the mosque — throughout the year, and reclaim Gift Aid on them.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.donateOnlineBtn}
        onPress={() => Linking.openURL(DONATE_ONLINE_URL).catch(() => {})}
        activeOpacity={0.8}
      >
        <Text style={styles.donateOnlineBtnText}>💚  Donate via Give a Little</Text>
      </TouchableOpacity>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>ℹ️ Commission note</Text>
        <Text style={styles.infoText}>
          Donating on the web via Give a Little carries a <Text style={{ fontWeight: '700' }}>commission of approximately 2.5%</Text> per transaction.{'\n\n'}Donations made in the mosque using your card at our SumUp terminals or self-serve tablet stations are charged at approximately <Text style={{ fontWeight: '700' }}>1%</Text>.{'\n\n'}To donate with <Text style={{ fontWeight: '700' }}>zero fees</Text>, use Bank Transfer — all of your money goes directly to EEIS.{'\n\n'}<Text style={{ fontWeight: '700' }}>Bank-transfer donors:</Text> please complete a Gift Aid declaration (Gift Aid tab) so we can boost your donation by 25% — free, if you're a UK taxpayer.
        </Text>
      </View>

    </ScrollView>
  );
}

// ── Bank Transfer section ──────────────────────────────────────────────────────

function BankTransferSection() {
  return (
    <ScrollView contentContainerStyle={styles.sectionContentShort} showsVerticalScrollIndicator={false}>

      <View style={styles.bankCard}>
        <BankRow label="Account Name" value={ACCOUNT_NAME} />
        <BankRow label="Bank"         value={BANK_NAME} />
        <BankRow label="Sort Code"    value={SORT_CODE}    mono />
        <BankRow label="Account No."  value={ACCOUNT_NO}   mono />
        <BankRow label="Reference"    value="Your Firstname Surname" mono />
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>💡 How to donate</Text>
        <Text style={styles.infoText}>
          Open your banking app or online banking and select "Pay someone new" or "Bank Transfer". Enter the details above and use your <Text style={{ fontWeight: '700' }}>Firstname Surname</Text> as the reference so we can match your donation to our Gift Aid records.{'\n\n'}All donations are allocated to General Expenses. Consider completing a Gift Aid Declaration (tap the Gift Aid tab) — at no extra cost to you, EEIS can reclaim an extra 25p for every £1 you donate.
        </Text>
      </View>

    </ScrollView>
  );
}

// ── Gift Aid section ───────────────────────────────────────────────────────────

function GiftAidSection() {
  const [form, setForm] = useState({ ...GIFT_AID_EMPTY });
  const set = (k: keyof typeof GIFT_AID_EMPTY) => (v: any) => setForm(prev => ({ ...prev, [k]: v }));
  const [signatureEdited, setSignatureEdited] = useState(false);

  // Auto-populate signature from fullName (unless manually edited)
  useEffect(() => {
    if (!signatureEdited) {
      setForm(prev => ({ ...prev, signature: prev.fullName }));
    }
  }, [form.fullName, signatureEdited]);

  // Reliable scroll: measure input position relative to scroll content, scroll it near the top
  const scrollRef = useRef<ScrollView>(null);
  const inputRefs = useRef<Record<string, TextInput | null>>({});

  const scrollToInput = (key: string) => {
    const input = inputRefs.current[key];
    const scrollNode = scrollRef.current;
    if (!input || !scrollNode) return;
    setTimeout(() => {
      const nodeHandle = findNodeHandle(scrollNode);
      if (nodeHandle == null) return;
      (input as any).measureLayout(
        nodeHandle,
        (_x: number, y: number) => {
          scrollNode.scrollTo({ y: Math.max(0, y - 72), animated: true });
        },
        () => {},
      );
    }, 120);
  };

  const submit = () => {
    if (!form.fullName.trim() || !form.addressLine1.trim() || !form.signature.trim()) {
      Alert.alert('Missing fields', 'Please fill in Full Name, Address, and your Signature.');
      return;
    }
    const displayName = `${form.title ? form.title + ' ' : ''}${form.fullName}`.trim();
    if (!form.past4Years && !form.futureDonations) {
      Alert.alert('Select Gift Aid scope', 'Please tick at least one Gift Aid option.');
      return;
    }
    const scope = [
      form.past4Years      ? '☑ ALL DONATIONS MADE IN THE PAST 4 YEARS' : '☐ All donations in past 4 years',
      form.futureDonations ? '☑ ALL FUTURE DONATIONS UNTIL I NOTIFY YOU OTHERWISE' : '☐ All future donations',
    ].join('\n');
    const addressFull = [form.addressLine1, form.town, form.county].filter(Boolean).join(', ');
    const body = `GIFT AID DECLARATION
Epsom & Ewell Islamic Society
Received via EEIS Prayer Times App
Date: ${formatDate()}

--- PERSONAL DETAILS ---
Full Name:          ${displayName}
House/Street:       ${form.addressLine1}
Town:               ${form.town}
County:             ${form.county}
Postcode:           ${form.postcode}
Contact Telephone:  ${form.phone}

--- GIFT AID DECLARATION ---
I want to Gift Aid my donation(s) to Epsom & Ewell Islamic Society.
I am a UK taxpayer and understand that if I pay less Income Tax
and/or Capital Gains Tax than the amount of Gift Aid claimed on all
my donations in that tax year it is my responsibility to pay any difference.

${scope}

--- SIGNATURE ---
Donor's Signature (typed — accepted per HMRC guidance):
${form.signature}

Date: ${formatDate()}

---
Please notify EEIS if you want to cancel this declaration, change
your name/address, or no longer pay sufficient tax.`;
    sendEmail(`Gift Aid Declaration — ${displayName}`, body);
    Alert.alert(
      'Thank you! 🤲',
      "Jazakallah Khayran (May Allah reward you with goodness).\n\nYour Gift Aid declaration has been prepared. Please press Send in your email app to complete it.",
      [{ text: 'OK' }]
    );
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.sectionContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >

      {/* Gift Aid benefit banner */}
      <View style={styles.giftAidBanner}>
        <Text style={styles.giftAidBannerBig}>+25p for every £1 you donate</Text>
        <Text style={styles.giftAidBannerSub}>
          That's a 25% boost on every pound — completely free for UK taxpayers. HMRC pays the extra directly to EEIS, at no cost to you.{'\n\n'}
          If you usually give by <Text style={{ fontWeight: '700' }}>card in the mosque</Text>, the easiest way to Gift Aid is to complete a declaration when you donate online:
        </Text>
        <TouchableOpacity onPress={() => Linking.openURL(DONATE_ONLINE_URL).catch(() => {})} activeOpacity={0.7}>
          <Text style={styles.giftAidBannerLink}>🔗  Donate &amp; Gift Aid online ›</Text>
        </TouchableOpacity>
      </View>

      {/* Which method explainer */}
      <View style={styles.infoBox}>
        <Text style={styles.whichText}>
          <Text style={{ fontWeight: '700' }}>Which should I use?</Text>{'\n\n'}
          • <Text style={{ fontWeight: '700' }}>Card donor</Text> — use the online link above. Give a Little's Gift Aid tool then identifies every card donation you make (online and in the mosque) automatically.{'\n\n'}
          • <Text style={{ fontWeight: '700' }}>Bank transfer donor</Text> — fill in the form below so this declaration lets us match your bank-transfer donations to your Gift Aid declaration.
        </Text>
      </View>

      <Text style={styles.sectionIntro}>
        Fill in your details below and tap Submit. Your email app will open with the form already filled in — just press Send.
      </Text>

      <View style={styles.formCard}>
        <Text style={styles.formSectionTitle}>Personal Details</Text>

        {/* Title pills */}
        <Text style={styles.fieldLabel}>Title</Text>
        <View style={styles.titleRow}>
          {TITLES.map(t => (
            <TouchableOpacity key={t} style={[styles.titlePill, form.title === t && styles.titlePillActive]} onPress={() => set('title')(t)}>
              <Text style={[styles.titlePillText, form.title === t && styles.titlePillTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Field label="Full Name *" value={form.fullName}
          onChange={v => { set('fullName')(v); if (!signatureEdited) set('signature')(v); }}
          placeholder="First name, middle names, surname"
          autoComplete="name" textContentType="name"
          fieldRef={el => { inputRefs.current['fullName'] = el; }}
          onFocus={() => scrollToInput('fullName')} />

        <Field label="House no. & Street name *" value={form.addressLine1}
          onChange={set('addressLine1')} placeholder="e.g. 12 High Street"
          autoComplete="street-address" textContentType="streetAddressLine1"
          fieldRef={el => { inputRefs.current['addressLine1'] = el; }}
          onFocus={() => scrollToInput('addressLine1')} />
        <Field label="Town / City *" value={form.town}
          onChange={set('town')} placeholder="e.g. Epsom"
          autoComplete="address-line2" textContentType="addressCity"
          fieldRef={el => { inputRefs.current['town'] = el; }}
          onFocus={() => scrollToInput('town')} />
        <Field label="County" value={form.county}
          onChange={set('county')} placeholder="e.g. Surrey"
          autoComplete="address-region" textContentType="addressState"
          fieldRef={el => { inputRefs.current['county'] = el; }}
          onFocus={() => scrollToInput('county')} />
        <Field label="Postcode" value={form.postcode}
          onChange={set('postcode')} placeholder="e.g. KT17 1AB"
          autoComplete="postal-code" textContentType="postalCode"
          fieldRef={el => { inputRefs.current['postcode'] = el; }}
          onFocus={() => scrollToInput('postcode')} />
        <Field label="Contact Telephone" value={form.phone}
          onChange={set('phone')} placeholder="Mobile number (optional)" keyboardType="phone-pad"
          autoComplete="tel" textContentType="telephoneNumber"
          fieldRef={el => { inputRefs.current['phone'] = el; }}
          onFocus={() => scrollToInput('phone')} />
      </View>

      <View style={styles.declarationBox}>
        <Text style={styles.declarationTitle}>❤️  Gift Aid Declaration</Text>
        <Text style={styles.declarationText}>
          I want to Gift Aid my donation(s) to Epsom & Ewell Islamic Society. I am a UK taxpayer and understand that if I pay less Income Tax and/or Capital Gains Tax than the amount of Gift Aid claimed on all my donations in that tax year it is my responsibility to pay any difference.
        </Text>
        <CheckRow label="All donations made in the past 4 years" value={form.past4Years} onChange={set('past4Years')} />
        <CheckRow label="All future donations until I notify you otherwise" value={form.futureDonations} onChange={set('futureDonations')} />
        <Text style={styles.declarationHint}>
          Notify EEIS if you want to cancel this declaration, change your name/address, or no longer pay sufficient tax.
        </Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.formSectionTitle}>Signature</Text>
        <Text style={styles.signatureNote}>
          HMRC accepts typed signatures. Your full name is auto-filled from above — edit if needed.
        </Text>
        <Field label="Typed signature *" value={form.signature}
          onChange={v => { setSignatureEdited(true); set('signature')(v); }}
          placeholder="Your full name"
          autoComplete="name" textContentType="name"
          fieldRef={el => { inputRefs.current['signature'] = el; }}
          onFocus={() => scrollToInput('signature')} />
      </View>

      <TouchableOpacity style={styles.submitBtn} onPress={submit} activeOpacity={0.8}>
        <Text style={styles.submitBtnText}>✉️  Submit Gift Aid via Email</Text>
      </TouchableOpacity>

    </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Standing Order section ─────────────────────────────────────────────────────

function StandingOrderSection() {
  const [form, setForm] = useState({ ...SO_EMPTY });
  const set = (k: keyof typeof SO_EMPTY) => (v: any) => setForm(prev => ({ ...prev, [k]: v }));
  const [signatureEdited, setSignatureEdited] = useState(false);

  // Auto-populate signature from fullName
  useEffect(() => {
    if (!signatureEdited) {
      setForm(prev => ({ ...prev, signature: prev.fullName }));
    }
  }, [form.fullName, signatureEdited]);

  const scrollRef = useRef<ScrollView>(null);
  const inputRefs = useRef<Record<string, TextInput | null>>({});

  const scrollToInput = (key: string) => {
    const input = inputRefs.current[key];
    const scrollNode = scrollRef.current;
    if (!input || !scrollNode) return;
    setTimeout(() => {
      const nodeHandle = findNodeHandle(scrollNode);
      if (nodeHandle == null) return;
      (input as any).measureLayout(
        nodeHandle,
        (_x: number, y: number) => {
          scrollNode.scrollTo({ y: Math.max(0, y - 72), animated: true });
        },
        () => {},
      );
    }, 120);
  };

  const handleSortCode = (raw: string) => {
    const fmt = formatSortCode(raw);
    set('sortCode')(fmt);
    const bank = bankFromSortCode(raw);
    if (bank) set('bankName')(bank);
  };

  const submit = () => {
    if (!form.fullName.trim() || !form.bankName.trim() || !form.accountNo.trim()
        || !form.sortCode.trim() || !form.amount.trim() || !form.signature.trim()) {
      Alert.alert('Missing fields', 'Please fill in all required fields and your typed signature.');
      return;
    }
    const soDisplayName = `${form.title ? form.title + ' ' : ''}${form.fullName}`.trim();
    const scope = [
      form.past4Years      ? '☑ ALL DONATIONS MADE IN THE PAST 4 YEARS' : '☐ All donations in past 4 years',
      form.futureDonations ? '☑ ALL FUTURE DONATIONS UNTIL I NOTIFY YOU OTHERWISE' : '☐ All future donations',
    ].join('\n');
    const body = `STANDING ORDER MANDATE
Epsom & Ewell Islamic Society
Received via EEIS Prayer Times App
Date: ${formatDate()}

--- YOUR BANK DETAILS ---
Full Name:       ${soDisplayName}
House/Street:    ${form.addressLine1}
Town:            ${form.town}
County:          ${form.county}
Postcode:        ${form.postcode}
Bank Name:       ${form.bankName}
Account Number:  ${form.accountNo}
Sort Code:       ${form.sortCode}

--- PAYEE (EEIS) DETAILS ---
Account Name:    ${ACCOUNT_NAME}
Bank:            ${BANK_NAME}
Sort Code:       ${SORT_CODE}
Account Number:  ${ACCOUNT_NO}
Reference:       Your Firstname Surname (for Gift Aid matching)

--- PAYMENT DETAILS ---
Monthly Amount:  £${form.amount}
Starting Date:   ${isoToDisplayDate(form.startDate) || form.startDate}

--- GIFT AID DECLARATION ---
${scope}

--- SIGNATURE ---
Donor's Signature (typed):
${form.signature}

Date: ${formatDate()}

---
IMPORTANT: After submitting this form, please set up this standing order
in your own banking app using the EEIS details above. UK banks do not
accept mandates submitted by charities on your behalf.`;
    sendEmail(`Standing Order Mandate — ${soDisplayName}`, body);
    Alert.alert(
      'Thank you! 🤲',
      'Jazakallah Khayran (May Allah reward you with goodness).\n\nYour standing order mandate has been prepared. Press Send in your email app, then set it up in your banking app using the EEIS bank details.',
      [{ text: 'OK' }]
    );
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.sectionContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>ℹ️  How Standing Orders Work</Text>
        <Text style={styles.infoText}>
          1. Fill in this form — it gives EEIS a record and covers your Gift Aid declaration.{'\n'}
          2. Tap Submit — this emails the completed form to EEIS.{'\n'}
          3. <Text style={{ fontWeight: '700' }}>Set it up in your own banking app</Text> using the EEIS bank details shown below.{'\n\n'}
          UK banks require you to set up standing orders yourself — a charity cannot do this on your behalf.
        </Text>
      </View>

      <View style={styles.bankCard}>
        <Text style={styles.formSectionTitle}>EEIS Bank Details (enter in your banking app)</Text>
        <BankRow label="Account Name" value={ACCOUNT_NAME} />
        <BankRow label="Sort Code"    value={SORT_CODE}    mono />
        <BankRow label="Account No."  value={ACCOUNT_NO}   mono />
        <BankRow label="Reference"    value="Your Firstname Surname" mono />
      </View>

      <View style={styles.formCard}>
        <Text style={styles.formSectionTitle}>Your Details</Text>

        {/* Title pills */}
        <Text style={styles.fieldLabel}>Title</Text>
        <View style={styles.titleRow}>
          {TITLES.map(t => (
            <TouchableOpacity key={t} style={[styles.titlePill, form.title === t && styles.titlePillActive]} onPress={() => set('title')(t)}>
              <Text style={[styles.titlePillText, form.title === t && styles.titlePillTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Field label="Full Name *" value={form.fullName}
          onChange={v => { set('fullName')(v); if (!signatureEdited) set('signature')(v); }}
          placeholder="First name, middle names, surname"
          autoComplete="name" textContentType="name"
          fieldRef={el => { inputRefs.current['fullName'] = el; }}
          onFocus={() => scrollToInput('fullName')} />

        <Field label="House no. & Street name *" value={form.addressLine1}
          onChange={set('addressLine1')} placeholder="e.g. 12 High Street"
          autoComplete="street-address" textContentType="streetAddressLine1"
          fieldRef={el => { inputRefs.current['addressLine1'] = el; }}
          onFocus={() => scrollToInput('addressLine1')} />
        <Field label="Town / City" value={form.town}
          onChange={set('town')} placeholder="e.g. Epsom"
          autoComplete="address-line2" textContentType="addressCity"
          fieldRef={el => { inputRefs.current['town'] = el; }}
          onFocus={() => scrollToInput('town')} />
        <Field label="County" value={form.county}
          onChange={set('county')} placeholder="e.g. Surrey"
          autoComplete="address-region" textContentType="addressState"
          fieldRef={el => { inputRefs.current['county'] = el; }}
          onFocus={() => scrollToInput('county')} />
        <Field label="Postcode" value={form.postcode}
          onChange={set('postcode')} placeholder="e.g. KT17 1AB"
          autoComplete="postal-code" textContentType="postalCode"
          fieldRef={el => { inputRefs.current['postcode'] = el; }}
          onFocus={() => scrollToInput('postcode')} />
      </View>

      <View style={styles.formCard}>
        <Text style={styles.formSectionTitle}>Your Bank Details</Text>
        <Text style={[styles.signatureNote, { marginBottom: 6 }]}>
          Enter your sort code first — bank name fills automatically.
        </Text>
        <Field label="Sort Code *" value={form.sortCode} onChange={handleSortCode}
          placeholder="XX-XX-XX" keyboardType="number-pad"
          autoComplete="off" textContentType="none"
          fieldRef={el => { inputRefs.current['sortCode'] = el; }}
          onFocus={() => scrollToInput('sortCode')} />
        <Field label="Account Number *" value={form.accountNo} onChange={set('accountNo')} keyboardType="number-pad"
          autoComplete="off" textContentType="none"
          fieldRef={el => { inputRefs.current['accountNo'] = el; }}
          onFocus={() => scrollToInput('accountNo')} />
        <Field label="Bank Name *" value={form.bankName} onChange={set('bankName')} placeholder="Auto-filled from sort code"
          autoComplete="off" textContentType="organizationName"
          fieldRef={el => { inputRefs.current['bankName'] = el; }}
          onFocus={() => scrollToInput('bankName')} />
      </View>

      <View style={styles.formCard}>
        <Text style={styles.formSectionTitle}>Payment</Text>
        <Field label="Monthly Amount (£) *" value={form.amount} onChange={set('amount')} placeholder="e.g. 10" keyboardType="decimal-pad"
          autoComplete="off" textContentType="none"
          fieldRef={el => { inputRefs.current['amount'] = el; }}
          onFocus={() => scrollToInput('amount')} />
        <DatePickerField label="Starting Date *" isoValue={form.startDate} onChange={set('startDate')} />
      </View>

      <View style={styles.declarationBox}>
        <Text style={styles.declarationTitle}>❤️  Gift Aid Declaration (optional)</Text>
        <CheckRow label="All donations made in the past 4 years" value={form.past4Years} onChange={set('past4Years')} />
        <CheckRow label="All future donations until I notify you otherwise" value={form.futureDonations} onChange={set('futureDonations')} />
      </View>

      <View style={styles.formCard}>
        <Text style={styles.formSectionTitle}>Signature</Text>
        <Text style={styles.signatureNote}>
          Auto-filled from your full name above — edit if needed.
        </Text>
        <Field label="Typed signature *" value={form.signature}
          onChange={v => { setSignatureEdited(true); set('signature')(v); }}
          placeholder="Your full name"
          autoComplete="name" textContentType="name"
          fieldRef={el => { inputRefs.current['signature'] = el; }}
          onFocus={() => scrollToInput('signature')} />
      </View>

      <TouchableOpacity style={styles.submitBtn} onPress={submit} activeOpacity={0.8}>
        <Text style={styles.submitBtnText}>✉️  Submit to EEIS via Email</Text>
      </TouchableOpacity>

    </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Main DonateScreen ──────────────────────────────────────────────────────────

export function DonateScreen({ visible, onClose, fontsLoaded }: Props) {
  const [section, setSection] = useState<Section>('bank');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.dragHandle} />
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Support EEIS</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section tabs */}
        <View style={styles.tabs}>
          <SectionTab label="Bank Transfer"  icon="🏦" active={section === 'bank'}     onPress={() => setSection('bank')} />
          <SectionTab label="Gift Aid"       icon="❤️"  active={section === 'giftaid'} onPress={() => setSection('giftaid')} />
          <SectionTab label="Standing Order" icon="🔁" active={section === 'standing'} onPress={() => setSection('standing')} />
          <SectionTab label="Donate Online"  icon="💚" active={section === 'online'}   onPress={() => setSection('online')} />
        </View>

        {/* Content */}
        {section === 'bank'     && <BankTransferSection />}
        {section === 'online'   && <DonateOnlineSection />}
        {section === 'giftaid'  && <GiftAidSection />}
        {section === 'standing' && <StandingOrderSection />}

      </SafeAreaView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bgScreen },

  // Header
  header: {
    backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingBottom: dp(14),
    borderBottomWidth: 1, borderBottomColor: '#E0E0E0',
  },
  dragHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#D0D0D0', alignSelf: 'center', marginTop: 10, marginBottom: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: dp(24), fontWeight: '700', color: Colors.maroonRed },
  closeBtn:    { fontSize: dp(20), color: Colors.inkMute, fontWeight: '700' },

  // Tabs
  tabs: {
    flexDirection: 'row', backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#E0E0E0',
  },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: dp(12), gap: dp(4),
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive:      { borderBottomColor: Colors.maroonRed },
  tabIcon:        { fontSize: dp(26) },
  tabLabel:       { fontSize: dp(13), fontWeight: '600', color: Colors.inkMute, textAlign: 'center' },
  tabLabelActive: { color: Colors.maroonRed },

  // Section content
  sectionContent: { padding: dp(16), gap: dp(14), paddingBottom: dp(360) },
  // No-input sections (Bank Transfer, Donate Online) — no big keyboard buffer
  sectionContentShort: { padding: dp(16), gap: dp(14), paddingBottom: dp(24) },
  sectionIntro:   { fontSize: dp(16), color: Colors.ink, lineHeight: dp(23) },

  // Gift Aid benefit banner
  giftAidBanner: {
    backgroundColor: Colors.freshGreen, borderRadius: dp(12),
    padding: dp(16), alignItems: 'center', gap: dp(6),
  },
  giftAidBannerBig: {
    fontSize: dp(22), fontWeight: '800', color: '#FFFFFF', textAlign: 'center', letterSpacing: 0.2,
  },
  giftAidBannerSub: {
    fontSize: dp(15), color: 'rgba(255,255,255,0.92)', textAlign: 'center', lineHeight: dp(21),
  },
  giftAidBannerLink: {
    fontSize: dp(16), fontWeight: '800', color: '#FFE14D', textAlign: 'center',
    marginTop: dp(10), textDecorationLine: 'underline',
  },
  whichText: { fontSize: dp(15), color: Colors.ink, lineHeight: dp(22) },

  // Bank card
  bankCard: {
    backgroundColor: '#FFFFFF', borderRadius: dp(14), padding: dp(16),
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, gap: 2,
  },
  bankRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: dp(10), borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  bankRowLabel: { fontSize: dp(15), color: Colors.inkMute, fontWeight: '600' },
  bankRowValue: { fontSize: dp(16), color: Colors.ink, fontWeight: '700', flex: 1, textAlign: 'right' },
  bankRowMono:  {
    fontVariant: ['tabular-nums'], fontSize: dp(18), color: Colors.maroonRed, letterSpacing: 0.5,
  },

  // Info box
  infoBox: {
    backgroundColor: '#EEF4FF', borderRadius: dp(12), padding: dp(16),
    borderLeftWidth: 3, borderLeftColor: Colors.deepBlue,
  },
  infoTitle: { fontSize: dp(16), fontWeight: '700', color: Colors.deepBlue, marginBottom: dp(8) },
  infoText:  { fontSize: dp(15), color: Colors.ink, lineHeight: dp(22) },

  // Form card
  formCard: {
    backgroundColor: '#FFFFFF', borderRadius: dp(14), padding: dp(16),
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  formSectionTitle: { fontSize: dp(16), fontWeight: '700', color: Colors.deepBlue, marginBottom: dp(12) },

  // Field
  field:          { marginBottom: dp(12) },
  fieldLabel:     {
    fontSize: dp(13), fontWeight: '600', color: Colors.inkMute,
    marginBottom: dp(5), textTransform: 'uppercase', letterSpacing: 0.5,
  },
  fieldInput: {
    borderWidth: 1, borderColor: '#D8D8D8', borderRadius: dp(10),
    paddingHorizontal: dp(14), paddingVertical: dp(11),
    fontSize: dp(16), color: Colors.ink, backgroundColor: '#FAFAFA',
  },
  fieldInputMulti: { height: dp(80), textAlignVertical: 'top' },

  // Declaration box
  declarationBox: {
    backgroundColor: '#FFF9EC', borderRadius: dp(12), padding: dp(16),
    borderLeftWidth: 3, borderLeftColor: Colors.maroonRed,
  },
  declarationTitle: { fontSize: dp(17), fontWeight: '700', color: Colors.maroonRed, marginBottom: dp(10) },
  declarationText:  { fontSize: dp(15), color: Colors.ink, lineHeight: dp(22), marginBottom: dp(12) },
  declarationHint:  { fontSize: dp(14), color: Colors.inkMute, marginTop: dp(10), lineHeight: dp(20) },

  // Checkbox row
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: dp(12), paddingVertical: dp(8) },
  checkbox: {
    width: dp(26), height: dp(26), borderRadius: dp(6), borderWidth: 2,
    borderColor: Colors.maroonRed, alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: Colors.maroonRed },
  checkMark:  { color: '#FFFFFF', fontSize: dp(15), fontWeight: '700' },
  checkLabel: { fontSize: dp(16), color: Colors.ink, flex: 1, lineHeight: dp(22) },

  // Signature
  signatureNote: { fontSize: dp(15), color: Colors.inkMute, marginBottom: dp(10), lineHeight: dp(21) },

  // Submit
  donateOnlineBtn: {
    height: dp(58), borderRadius: dp(14), backgroundColor: Colors.deepBlue,
    alignItems: 'center', justifyContent: 'center', marginBottom: dp(14),
  },
  donateOnlineBtnText: { color: '#FFFFFF', fontSize: dp(18), fontWeight: '700' },
  submitBtn: {
    height: dp(58), borderRadius: dp(14), backgroundColor: Colors.maroonRed,
    alignItems: 'center', justifyContent: 'center', marginTop: dp(4),
  },
  submitBtnText: { color: '#FFFFFF', fontSize: dp(18), fontWeight: '700' },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: dp(6), marginBottom: dp(10) },
  titlePill: { paddingHorizontal: dp(14), paddingVertical: dp(7), borderRadius: dp(20), borderWidth: 1.5, borderColor: Colors.inkMute, backgroundColor: '#FFF' },
  titlePillActive: { borderColor: Colors.deepBlue, backgroundColor: Colors.deepBlue },
  titlePillText: { fontSize: dp(13), fontWeight: '600', color: Colors.inkMute },
  titlePillTextActive: { color: '#FFF' },
});
