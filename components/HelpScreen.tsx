/**
 * HelpScreen — full user guide in English, Urdu and Bengali.
 *
 * v26: full translations added; close button moved into scroll to avoid
 *      being hidden behind system navigation bar on edge-to-edge Android;
 *      "Splash" renamed to "Screen Flash" throughout.
 */
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Colors } from '../constants/theme';

// ─── Language types ────────────────────────────────────────────────────────────

type Language = 'en' | 'ur' | 'bn';

const LANG_LABELS: Record<Language, string> = {
  en: 'English',
  ur: 'اردو',
  bn: 'বাংলা',
};

// ─── Content types ────────────────────────────────────────────────────────────

type Step  = { step: string; text: string };
type Section = { title: string; content: string | Step[] };

// ─── English content ──────────────────────────────────────────────────────────

const EN: Section[] = [
  // ── Prayer Times Screen ────────────────────────────────────────────────────
  {
    title: '🕌 Prayer Times Screen',
    content:
      'The main screen shows today\'s prayer times for Epsom & Ewell.\n\n' +
      'NEXT pill — The next upcoming prayer is highlighted in blue with a green "NEXT" badge at the top.\n\n' +
      'Countdown — The green bar below the header counts down to the next prayer in real time.\n\n' +
      'Swipe left/right — Browse prayer times for other days. A "Back to Today" pill appears when you\'re viewing a different date.\n\n' +
      'Friday (Jumu\'ah) — The Dhuhr row changes to show both 1st and 2nd Jumu\'ah times.\n\n' +
      'NEW badge — If the Jama\'at time changed since yesterday, a red "NEW" indicator appears on that time.',
  },
  // ── Shuruq ─────────────────────────────────────────────────────────────────
  {
    title: '🌅 Shuruq (Sunrise)',
    content:
      'Shuruq is the time of sunrise — it marks the end of the Fajr prayer window.\n\n' +
      'Deadline to pray Fajr — You must complete your Fajr prayer before Shuruq begins. Once the sun has risen, the Fajr time has passed.\n\n' +
      'Setting a Shuruq alert — Open the Alerts tab and enable the Shuruq row. You can set an offset (e.g. 30 minutes before) to remind you to pray Fajr while there is still time.',
  },
  // ── Prayer Alerts ──────────────────────────────────────────────────────────
  {
    title: '🔔 How to Set a Prayer Alert',
    content: [
      { step: '1', text: 'Tap Alerts in the bottom bar, or open Menu → Prayer Alerts & Sounds.' },
      { step: '2', text: 'Find the prayer you want (e.g. Dhuhr).' },
      { step: '3', text: 'Tap the switch on the left to turn it ON (green).' },
      { step: '4', text: 'Choose a sound — tap "No sound" to open the sound picker. Pick an option and tap Done.' },
      { step: '5', text: 'Choose Begin or Jama\'at time — tap the pill button to switch between them.' },
      { step: '6', text: 'If you chose Jama\'at, use the slider to set how many minutes before Jama\'at you\'d like the alert (e.g. 15 min before).' },
      { step: '7', text: 'That\'s it! The alarm is scheduled automatically. You can test it using the Test Alarm section below the prayers list.' },
    ],
  },
  // ── Alarm Options ──────────────────────────────────────────────────────────
  {
    title: '⚙️ Alarm Options Explained',
    content:
      '💥 Screen Flash — When the alarm fires, the screen flashes white 3 times then reveals the prayer screen. Best for heavy sleepers.\n\n' +
      '⚡ Flash — Strobes the camera torch LED. Useful in dark rooms.\n\n' +
      '📳 Vibrate — Vibrates the phone when the alarm fires. Good when on silent.\n\n' +
      '🔁 Loop — Keeps the sound playing until you tap Stop. Recommended for Fajr so you cannot sleep through it.\n\n' +
      '📖 Quotes — Shows a Quran verse on the alarm screen (when Screen Flash is also on) or in the notification dropdown.',
  },
  // ── Begin vs Jama'at ───────────────────────────────────────────────────────
  {
    title: '🕐 Begin Time vs Jama\'at Time',
    content:
      'Begin Time — The alarm fires at the start of the prayer window (e.g. when Dhuhr begins at 13:05). Good if you pray at home.\n\n' +
      'Jama\'at Time — The alarm fires before the congregation prayer at the mosque. Use the offset slider to set how early. ' +
      'For example: Jama\'at at 13:30, offset 15 min → alarm fires at 13:15 to give you time to get ready.',
  },
  // ── Testing alarms ─────────────────────────────────────────────────────────
  {
    title: '🧪 Testing Your Alarms',
    content:
      'Scroll to the bottom of the Alerts tab to find the "Test Alarm" section.\n\n' +
      'You will see a list of all the prayers you have enabled. Tap ▶ Test next to any prayer to fire that alarm immediately (within 15 seconds) using its exact settings — the same sound, loop, screen flash, torch, vibrate and quotes that will fire at the real prayer time.\n\n' +
      'Only one test can run at a time. Lock your phone and put it in Do Not Disturb to verify the alarm breaks through.',
  },
  // ── Qibla ──────────────────────────────────────────────────────────────────
  {
    title: '🧭 Qibla Compass',
    content:
      'Open the Qibla screen via Menu → Qibla Direction.\n\n' +
      'The compass needle points toward Mecca from your current location. Hold your phone flat and level for best accuracy.\n\n' +
      'The bearing (in degrees) is shown below the compass. Facing that direction means you are facing Mecca.\n\n' +
      'Tip: Calibrate your compass by moving the phone in a figure-8 pattern if the needle seems off.',
  },
  // ── World Times ─────────────────────────────────────────────────────────────
  {
    title: '🌍 World Times',
    content:
      'Tap the 🌍 World tab at the bottom, or tap the clock in the header, to open the World Times screen.\n\n' +
      'It shows the current local time, temperature, weather condition, current prayer and GBP exchange rate for cities important to the Muslim community: Mecca, Medina, Dubai, Istanbul, Islamabad, Dhaka, New Delhi, Port Louis, Kabul, Cairo, Casablanca, Lagos and more.\n\n' +
      'Temperature icons: ❄️ cold (≤5°C) · 🌤️ cool · ☀️ warm · 🌞 hot · 🔥 very hot · 🔥🔥 blisteringly hot (>38°C).\n\n' +
      'Weather icons: ⛅ partly cloudy · 🌦️ drizzle/light showers · 🌧️ rain · ⛈️ thunderstorm.\n\n' +
      'Cities are ordered from closest to furthest UK time offset. Saudi Arabia (Mecca and Medina) is always shown first. Weather is from Open-Meteo and cached for 30 minutes. Exchange rates are from FloatRates.com, cached for 4 hours. Pull down to refresh.\n\n' +
      'On first open, there may be a brief delay of a few seconds while live data loads. After the first fetch, data is cached for faster re-opening.',
  },
  // ── 7-Day Weather Forecast ──────────────────────────────────────────────────
  {
    title: '🌦️ 7-Day Weather Forecast',
    content:
      'From the World Times screen, tap the temperature row for any city (the row showing 🔥 or ☀️ and the temperature in °C) to open the 7-day weather forecast for that city.\n\n' +
      'The forecast shows daily max/min temperatures, weather condition icon, heat scale icon, precipitation (mm) and max wind speed (km/h) for the next 7 days.\n\n' +
      'Source: Open-Meteo (free, no API key). Data is cached for 1 hour per city and updated automatically on next open after the cache expires.\n\n' +
      'Tap ✕ to close the forecast and return to the World Times screen.',
  },
  // ── Currency Charts ─────────────────────────────────────────────────────────
  {
    title: '💱 GBP Exchange Rate Charts',
    content:
      'From the World Times screen, tap the exchange rate row for any city (the row showing 💷 and the rate, e.g. "1 GBP = 4.78 SAR") to open a 12-month interactive GBP chart for that currency on xe.com.\n\n' +
      'The chart opens in a browser window inside the app. It shows how the exchange rate has moved over the past year.\n\n' +
      'If a location popup appears asking to go to the GB site — scroll down past it or tap Cancel/Close to dismiss it. The chart is visible behind it.\n\n' +
      'You can change the time period on the xe.com chart (1 week, 1 month, 3 months, 1 year, etc.) using the buttons on the page.\n\n' +
      'The rate shown on the World Times card itself comes from FloatRates.com (free, updated hourly) and shows the date of the rate in brackets, e.g. "20 May 2025".',
  },
  // ── News & Events ───────────────────────────────────────────────────────────
  {
    title: '📰 News & Events',
    content:
      'Open the News screen via the hamburger Menu → News.\n\n' +
      'Three categories:\n' +
      '   📖 Islamic Lectures — PDF and document files uploaded by the EEIS admin team.\n' +
      '   📢 Announcements — Short text messages from EEIS (no file needed).\n' +
      '   🗓 Events — Upcoming events with date, time, location and details.\n\n' +
      'Tap any article or announcement to read it. PDF files open in your browser for full-screen reading.\n\n' +
      'Events banner — If there are upcoming events, a scrolling banner is shown at the top of the screen.\n\n' +
      'Language toggle — Tap EN / বাংলা / اردو / عربي at the top to switch language (where translations have been provided).',
  },
  // ── Android Permissions ─────────────────────────────────────────────────────
  {
    title: '📱 Android Permissions',
    content:
      'The app needs 4 permissions to work reliably. You are guided through these when you first install the app.\n\n' +
      '1. Notifications — Required to show any alerts. Tap "Allow" when the system asks.\n\n' +
      '2. Exact Alarms — Lets the app fire at the precise prayer time. Go to:\n   Settings → Apps → EEIS Prayer Times → Alarms & Reminders → Enable.\n\n' +
      '3. Battery (Unrestricted) — Prevents the phone from cancelling alarms in the background. On Samsung:\n   Settings → Battery → App power management → set EEIS to Unrestricted.\n\n' +
      '4. Full-Screen Alerts (Android 14+) — Shows the alarm screen over your lock screen.\n   Settings → Special app access → Display over lock screen → Enable for EEIS.',
  },
  // ── Donate ──────────────────────────────────────────────────────────────────
  {
    title: '🏦 Donate — Bank Transfer, Gift Aid & Standing Order',
    content:
      'Bank Transfer details:\n' +
      '   Account name:  Epsom & Ewell Islamic Society\n' +
      '   Sort code:     30-93-74\n' +
      '   Account no:    01879186\n' +
      '   Reference:     Your name or "Donation"\n\n' +
      'Gift Aid — If you are a UK taxpayer, EEIS can reclaim 25p for every £1 you donate at no extra cost to you. ' +
      'Complete the Gift Aid declaration form available in the app via Menu → Bank Transfer & Gift Aid.\n\n' +
      'Standing Order — Set up a regular monthly donation using the bank details above via your bank\'s app or website.',
  },
];

// ─── Urdu content (RTL) ───────────────────────────────────────────────────────

const TRANSLATION_SOON_UR = 'ترجمہ جلد آ رہا ہے — info@eeis.co.uk پر رابطہ کریں';
const TRANSLATION_SOON_BN = 'অনুবাদ শীঘ্রই আসছে — info@eeis.co.uk-এ যোগাযোগ করুন';

const UR: Section[] = [
  {
    title: '🕌 نماز کے اوقات کی اسکرین',
    content: TRANSLATION_SOON_UR,
  },
  {
    title: '🌅 شروق (طلوع آفتاب)',
    content: TRANSLATION_SOON_UR,
  },
  {
    title: '🔔 نماز الرٹ کیسے لگائیں',
    content: [
      { step: '۱', text: 'نچلی بار میں 🔔 الرٹس دبائیں، یا مینو → نماز الرٹس کھولیں۔' },
      { step: '۲', text: 'اپنی پسند کی نماز تلاش کریں (مثلاً ظہر)۔' },
      { step: '۳', text: 'بائیں طرف کا سوئچ دبا کر آن کریں (سبز ہو جائے گا)۔' },
      { step: '۴', text: 'آواز منتخب کریں — "کوئی آواز نہیں" دبائیں اور پسندیدہ آواز چنیں۔' },
      { step: '۵', text: 'شروع وقت یا جماعت وقت منتخب کریں۔' },
      { step: '۶', text: 'جماعت منتخب ہو تو سلائیڈر سے وقفہ مقرر کریں (مثلاً 15 منٹ پہلے)۔' },
      { step: '۷', text: 'بس! الارم خودبخود مقرر ہو جائے گا۔ ٹیسٹ الارم بٹن سے آزما سکتے ہیں۔' },
    ],
  },
  {
    title: '⚙️ الارم کے اختیارات',
    content:
      '💥 اسکرین فلیش — الارم بجنے پر اسکرین تین بار سفید روشنی سے چمکتی ہے، پھر نماز کی معلومات ظاہر ہوتی ہیں۔ بھاری نیند والوں کے لیے بہترین ہے۔\n\n' +
      '⚡ فلیش لائٹ — پچھلے کیمرے کی ٹارچ جھلملاتی ہے۔ اندھیرے کمرے میں مفید ہے۔\n\n' +
      '📳 وائبریٹ — الارم بجتے وقت فون لرزتا ہے۔ خاموش موڈ میں کارآمد ہے۔\n\n' +
      '🔁 لوپ — آواز تب تک چلتی رہتی ہے جب تک آپ بند نہ کریں۔ فجر کے لیے تجویز کردہ ہے۔\n\n' +
      '📖 اقتباسات — الارم اسکرین پر قرآنی آیت ظاہر ہوتی ہے۔',
  },
  {
    title: '🕐 شروع وقت بمقابلہ جماعت وقت',
    content:
      'شروع وقت — الارم نماز کے شروع ہونے کے وقت بجتا ہے۔ گھر میں نماز پڑھنے کے لیے موزوں ہے۔\n\n' +
      'جماعت وقت — الارم مسجد میں جماعت سے پہلے بجتا ہے۔ سلائیڈر سے وقفہ مقرر کریں۔ مثال: جماعت 1:30 بجے، وقفہ 15 منٹ = الارم 1:15 پر بجے گا۔',
  },
  {
    title: '🧪 الارم ٹیسٹ کریں',
    content: TRANSLATION_SOON_UR,
  },
  {
    title: '🧭 قبلہ کمپاس',
    content: TRANSLATION_SOON_UR,
  },
  {
    title: '🌍 عالمی اوقات',
    content: TRANSLATION_SOON_UR,
  },
  {
    title: '🌦️ 7 روزہ موسمی پیش گوئی',
    content: TRANSLATION_SOON_UR,
  },
  {
    title: '💱 GBP ایکسچینج ریٹ چارٹس',
    content: TRANSLATION_SOON_UR,
  },
  {
    title: '📰 خبریں اور تقریبات',
    content: TRANSLATION_SOON_UR,
  },
  {
    title: '📱 اینڈرائیڈ اجازتیں',
    content:
      'ایپ کو درست طریقے سے کام کرنے کے لیے 4 اجازتیں ضروری ہیں:\n\n' +
      '1. اطلاعات — کوئی بھی الرٹ دیکھنے کے لیے ضروری ہے۔\n\n' +
      '2. درست الارم — نماز کے بالکل صحیح وقت پر بجنے کے لیے۔\n\n' +
      '3. بیٹری (غیر محدود) — فون کو پس منظر میں الارم بند کرنے سے روکتا ہے۔\n\n' +
      '4. فل اسکرین الرٹ (اینڈرائیڈ 14+) — لاک اسکرین پر الارم دکھانے کے لیے۔',
  },
  {
    title: '🏦 عطیہ — بینک ٹرانسفر، گفٹ ایڈ اور اسٹینڈنگ آرڈر',
    content:
      'بینک ٹرانسفر کی تفصیل:\n' +
      '   اکاؤنٹ نام: Epsom & Ewell Islamic Society\n' +
      '   سورٹ کوڈ: 30-93-74\n' +
      '   اکاؤنٹ نمبر: 01879186\n' +
      '   حوالہ: آپ کا نام یا "عطیہ"\n\n' +
      'گفٹ ایڈ — اگر آپ برطانوی ٹیکس دہندہ ہیں تو EEIS آپ کے ہر £1 عطیے پر حکومت سے 25p واپس لے سکتا ہے۔\n\n' +
      'اسٹینڈنگ آرڈر — اپنے بینک ایپ سے ماہانہ عطیہ مقرر کریں۔',
  },
];

// ─── Bengali content ──────────────────────────────────────────────────────────

const BN: Section[] = [
  {
    title: '🕌 নামাজের সময়সূচি স্ক্রিন',
    content: TRANSLATION_SOON_BN,
  },
  {
    title: '🌅 শুরুক (সূর্যোদয়)',
    content: TRANSLATION_SOON_BN,
  },
  {
    title: '🔔 নামাজের অ্যালার্ট কীভাবে সেট করবেন',
    content: [
      { step: '১', text: 'নিচের বারে 🔔 অ্যালার্ট ট্যাপ করুন, বা মেনু → প্রার্থনা সতর্কতা খুলুন।' },
      { step: '২', text: 'পছন্দের নামাজ খুঁজুন (যেমন যোহর)।' },
      { step: '৩', text: 'বাম পাশের সুইচ চালু করুন (সবুজ হয়ে যাবে)।' },
      { step: '৪', text: 'শব্দ বেছে নিন — "কোনো শব্দ নেই" ট্যাপ করুন এবং পছন্দের শব্দ বেছে নিন।' },
      { step: '৫', text: 'শুরুর সময় বা জামাআত সময় বেছে নিন।' },
      { step: '৬', text: 'জামাআত বেছে নিলে স্লাইডার দিয়ে ব্যবধান ঠিক করুন (যেমন ১৫ মিনিট আগে)।' },
      { step: '৭', text: 'সম্পন্ন! আলার্ম স্বয়ংক্রিয়ভাবে সেট হয়ে গেছে। টেস্ট অ্যালার্ম বোতাম দিয়ে পরীক্ষা করুন।' },
    ],
  },
  {
    title: '⚙️ অ্যালার্ম বিকল্পগুলির ব্যাখ্যা',
    content:
      '💥 স্ক্রিন ফ্ল্যাশ — আলার্ম বাজলে স্ক্রিন তিনবার সাদা আলো দেখায়, তারপর নামাজের তথ্য দেখায়। ভারী ঘুমের জন্য সেরা।\n\n' +
      '⚡ টর্চ — পেছনের ক্যামেরার আলো জ্বলে। অন্ধকার ঘরে উপযোগী।\n\n' +
      '📳 ভাইব্রেট — আলার্ম বাজলে ফোন কাঁপে। নীরব মোডে কার্যকর।\n\n' +
      '🔁 লুপ — আপনি বন্ধ না করা পর্যন্ত শব্দ চলতে থাকে। ফজরের জন্য প্রস্তাবিত।\n\n' +
      '📖 উদ্ধৃতি — আলার্ম স্ক্রিনে কোরআনের আয়াত দেখায়।',
  },
  {
    title: '🕐 শুরুর সময় বনাম জামাআত সময়',
    content:
      'শুরুর সময় — নামাজ শুরুর সময়ে আলার্ম বাজে। বাড়িতে নামাজ পড়লে এটি ব্যবহার করুন।\n\n' +
      'জামাআত সময় — মসজিদে জামাআতের আগে আলার্ম বাজে। স্লাইডার দিয়ে ব্যবধান ঠিক করুন। উদাহরণ: জামাআত ১:৩০, ব্যবধান ১৫ মিনিট → আলার্ম ১:১৫-তে বাজবে।',
  },
  {
    title: '🧪 অ্যালার্ম পরীক্ষা করুন',
    content: TRANSLATION_SOON_BN,
  },
  {
    title: '🧭 কিবলা কম্পাস',
    content: TRANSLATION_SOON_BN,
  },
  {
    title: '🌍 বিশ্ব সময়',
    content: TRANSLATION_SOON_BN,
  },
  {
    title: '🌦️ ৭-দিনের আবহাওয়া পূর্বাভাস',
    content: TRANSLATION_SOON_BN,
  },
  {
    title: '💱 GBP বিনিময় হার চার্ট',
    content: TRANSLATION_SOON_BN,
  },
  {
    title: '📰 সংবাদ ও অনুষ্ঠান',
    content: TRANSLATION_SOON_BN,
  },
  {
    title: '📱 Android অনুমতি',
    content:
      'অ্যাপটি সঠিকভাবে কাজ করতে ৪টি অনুমতি প্রয়োজন:\n\n' +
      '১. নোটিফিকেশন — যেকোনো সতর্কতা দেখাতে প্রয়োজন।\n\n' +
      '২. সঠিক আলার্ম — নামাজের সঠিক সময়ে বাজাতে।\n\n' +
      '৩. ব্যাটারি (অসীমিত) — ফোনকে আলার্ম বন্ধ করা থেকে রোধ করতে।\n\n' +
      '৪. ফুল-স্ক্রিন সতর্কতা (Android 14+) — লক স্ক্রিনে আলার্ম দেখাতে।',
  },
  {
    title: '🏦 দান — ব্যাংক ট্রান্সফার, গিফট এইড ও স্ট্যান্ডিং অর্ডার',
    content:
      'ব্যাংক ট্রান্সফার তথ্য:\n' +
      '   অ্যাকাউন্ট নাম: Epsom & Ewell Islamic Society\n' +
      '   সর্ট কোড: 30-93-74\n' +
      '   অ্যাকাউন্ট নম্বর: 01879186\n' +
      '   রেফারেন্স: আপনার নাম বা "দান"\n\n' +
      'গিফট এইড — আপনি যদি UK করদাতা হন, EEIS প্রতি £১ দানে সরকার থেকে ২৫p ফেরত নিতে পারে।\n\n' +
      'স্ট্যান্ডিং অর্ডার — ব্যাংক অ্যাপ থেকে মাসিক নিয়মিত দান সেট আপ করুন।',
  },
];

const CONTENT: Record<Language, Section[]> = { en: EN, ur: UR, bn: BN };

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  visible:     boolean;
  onClose:     () => void;
  fontsLoaded: boolean;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function HelpScreen({ visible, onClose, fontsLoaded }: Props) {
  const [lang, setLang] = useState<Language>('en');

  const bold = fontsLoaded ? 'Poppins_700Bold'     : undefined;
  const semi = fontsLoaded ? 'Poppins_600SemiBold' : undefined;
  const reg  = fontsLoaded ? 'Poppins_400Regular'  : undefined;

  const isRTL    = lang === 'ur';
  const sections = CONTENT[lang];

  // Jump-to menu: track y offsets of each section heading
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<number, number>>({});

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
          <Text style={[styles.headerTitle, { fontFamily: bold }]}>Help & Guide</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 14, right: 14, bottom: 14, left: 14 }}
            style={styles.closeBtn}
          >
            <Text style={[styles.closeBtnText, { fontFamily: bold }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Language selector */}
        <View style={styles.langRow}>
          {(['en', 'ur', 'bn'] as Language[]).map(l => (
            <TouchableOpacity
              key={l}
              style={[styles.langPill, lang === l && styles.langPillActive]}
              onPress={() => setLang(l)}
            >
              <Text style={[
                styles.langPillText,
                l !== 'en' && styles.langPillTextLarge,
                { fontFamily: lang === l ? semi : reg },
                lang === l && styles.langPillTextActive,
              ]}>
                {LANG_LABELS[l]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Jump-to menu — quick-access row of section shortcuts */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.jumpScroll}
          contentContainerStyle={styles.jumpContent}
        >
          {sections.map((section, i) => (
            <TouchableOpacity
              key={i}
              style={styles.jumpPill}
              onPress={() => {
                const y = sectionOffsets.current[i];
                if (y !== undefined) scrollRef.current?.scrollTo({ y, animated: true });
              }}
            >
              <Text style={[styles.jumpPillText, { fontFamily: semi }]}>
                {section.title.split(' ')[0]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Scrollable content — close button lives at the bottom inside the scroll */}
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {sections.map((section, i) => (
            <View
              key={i}
              style={styles.section}
              onLayout={(e) => { sectionOffsets.current[i] = e.nativeEvent.layout.y; }}
            >
              <Text style={[
                styles.sectionTitle,
                { fontFamily: bold, textAlign: isRTL ? 'right' : 'left' },
              ]}>
                {section.title}
              </Text>

              {Array.isArray(section.content)
                ? section.content.map((item, j) => (
                    <View key={j} style={[
                      styles.stepRow,
                      isRTL && styles.stepRowRTL,
                    ]}>
                      <View style={styles.stepBadge}>
                        <Text style={[styles.stepBadgeText, { fontFamily: bold }]}>
                          {item.step}
                        </Text>
                      </View>
                      <Text style={[
                        styles.stepText,
                        { fontFamily: reg },
                        isRTL && styles.stepTextRTL,
                      ]}>
                        {item.text}
                      </Text>
                    </View>
                  ))
                : <Text style={[
                    styles.bodyText,
                    { fontFamily: reg },
                    isRTL && styles.bodyTextRTL,
                  ]}>
                    {section.content}
                  </Text>
              }
            </View>
          ))}

          {/* Close button at bottom of scroll — always visible, never hidden */}
          <TouchableOpacity style={styles.closeBottom} onPress={onClose}>
            <Text style={[styles.closeBottomText, { fontFamily: bold }]}>Close</Text>
          </TouchableOpacity>

          <View style={{ height: 8 }} />
        </ScrollView>

      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#063968',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 18,
    color: '#FFFFFF',
  },
  langRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F0F4F8',
    borderBottomWidth: 1,
    borderBottomColor: '#DDE3EA',
  },
  langPill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#C0CCD8',
    backgroundColor: '#FFFFFF',
  },
  langPillActive: {
    backgroundColor: Colors.deepBlue,
    borderColor: Colors.deepBlue,
  },
  langPillText: {
    fontSize: 13,
    color: Colors.inkMute,
  },
  langPillTextLarge: {
    fontSize: 15,
  },
  langPillTextActive: {
    color: '#FFFFFF',
  },
  // Jump-to menu
  jumpScroll: {
    maxHeight: 44,
    backgroundColor: '#E8F0FE',
    borderBottomWidth: 1,
    borderBottomColor: '#C8D8F0',
  },
  jumpContent: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  jumpPill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#C0CCD8',
  },
  jumpPillText: {
    fontSize: 11,
    color: Colors.deepBlue,
    fontWeight: '600',
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.maroonRed,
    marginBottom: 10,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  stepRowRTL: {
    flexDirection: 'row-reverse',
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.deepBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: Colors.ink,
    lineHeight: 20,
  },
  stepTextRTL: {
    textAlign: 'right',
  },
  bodyText: {
    fontSize: 14,
    color: Colors.ink,
    lineHeight: 22,
  },
  bodyTextRTL: {
    textAlign: 'right',
    lineHeight: 26,
  },
  closeBottom: {
    alignSelf: 'center',
    backgroundColor: Colors.deepBlue,
    paddingHorizontal: 40,
    paddingVertical: 13,
    borderRadius: 28,
    marginTop: 8,
    marginBottom: 16,
  },
  closeBottomText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
