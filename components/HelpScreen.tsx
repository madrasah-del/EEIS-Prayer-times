/**
 * HelpScreen — full user guide in English, Urdu and Bengali.
 *
 * v26: full translations added; close button moved into scroll to avoid
 *      being hidden behind system navigation bar on edge-to-edge Android;
 *      "Splash" renamed to "Screen Flash" throughout.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,

} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '../constants/theme';

// ─── Language types ────────────────────────────────────────────────────────────

type Language = 'en' | 'ur' | 'bn' | 'ar';

const LANG_LABELS: Record<Language, string> = {
  en: 'English',
  ur: 'اردو',
  bn: 'বাংলা',
  ar: 'عربي',
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
      'NEW badge — If the Jama\'at time changed since yesterday, a red "NEW" indicator appears on that time.\n\n' +
      'Clock change reminder — The day before the UK clocks change (spring/autumn), a scrolling banner automatically appears reminding you that clocks go forward or back.',
  },
  // ── Shuruq ─────────────────────────────────────────────────────────────────
  {
    title: '🌅 Shuruq (Sunrise)',
    content:
      'Shuruq is the time of sunrise — it marks the end of the Fajr prayer window.\n\n' +
      'Deadline to pray Fajr — You must complete your Fajr prayer before Shuruq begins. Once the sun has risen, the Fajr time has passed.\n\n' +
      'Setting a Shuruq alert — Open the Alerts tab and enable the Shuruq row. You can set an offset (e.g. 30 minutes before) to remind you to pray Fajr while there is still time.',
  },
  // ── Tasbih Counter ─────────────────────────────────────────────────────────
  {
    title: '📿 Tasbih Counter',
    content:
      'A 📿 tasbih button sits on the right side of the Shuruq row — always within thumb reach. Tap it to add 1 to your count.\n\n' +
      'Your running total appears as a small pill on the right of the date bar. Tap that pill ("Tap to reset") to set the count back to 0.\n\n' +
      'The button is fixed in place (it is no longer draggable). You can hide or show it from Prayer Alerts & Sounds — the Tasbih toggle (on by default).',
  },
  // ── Prayer Rak'ahs ─────────────────────────────────────────────────────────
  {
    title: "🕌 Prayer Rak'ah Guide",
    content:
      "Tap any prayer name (FAJR, DHUHR, ASR, etc.) on the main screen to open the Hanafi rak'ah breakdown for that prayer.\n\n" +
      'The guide shows every type of prayer in order — Tahiyyatul Masjid (mosque greeting, always first), Sunnah, Fard (red), then Sunnah/Nafl after.\n\n' +
      'Row colours: Red = Fard (obligatory) · Blue = Wajib · Light green = Nafl/voluntary · Bold = Sunnah Mu\'akkadah.\n\n' +
      "A filtered Key Terms glossary at the bottom explains only the terms present in that prayer's card.",
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

const UR: Section[] = [
  {
    title: '🕌 نماز کے اوقات کی اسکرین',
    content:
      'اسکرین پر ایپسوم اینڈ ایویل کے آج کے نماز کے اوقات دکھائے جاتے ہیں۔\n\n' +
      'NEXT بیج — اگلی نماز نیلے رنگ میں اور سبز "NEXT" بیج کے ساتھ نمایاں ہوتی ہے۔\n\n' +
      'کاؤنٹ ڈاؤن — ہیڈر کے نیچے سبز پٹی اگلی نماز تک کا وقت دکھاتی ہے۔\n\n' +
      'بائیں/دائیں سوائپ — دوسرے دنوں کے نماز کے اوقات دیکھیں۔ جب کوئی اور تاریخ دیکھ رہے ہوں تو "آج پر واپس" بٹن ظاہر ہوتا ہے۔\n\n' +
      'جمعہ — ظہر کی صف بدل کر پہلی اور دوسری جمعہ کے اوقات دکھاتی ہے۔\n\n' +
      'NEW بیج — اگر کل سے جماعت کا وقت بدلا ہو تو سرخ "NEW" نشان ظاہر ہوتا ہے۔\n\n' +
      'گھڑی تبدیلی یاددہانی — برطانیہ میں گھڑی تبدیل ہونے سے ایک دن پہلے ایک یاددہانی بینر خودبخود ظاہر ہوتا ہے۔',
  },
  {
    title: '🌅 شروق (طلوع آفتاب)',
    content:
      'شروق طلوع آفتاب کا وقت ہے — یہ فجر کے نماز کے وقت کا اختتام ہے۔\n\n' +
      'فجر پڑھنے کی آخری حد — آپ کو شروق سے پہلے فجر مکمل کرنی ہوگی۔ سورج طلوع ہونے کے بعد فجر کا وقت ختم ہو جاتا ہے۔\n\n' +
      'شروق الرٹ لگانا — الرٹس ٹیب کھول کر شروق کی سطر فعال کریں۔ آپ وقفہ مقرر کر سکتے ہیں (مثلاً 30 منٹ پہلے) تاکہ وقت رہتے ہوئے فجر کی یاددہانی ملے۔',
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
    title: '📿 تسبیح کاؤنٹر',
    content:
      'شروق کی سطر کے دائیں جانب ایک 📿 تسبیح بٹن ہمیشہ موجود رہتا ہے۔ گنتی میں 1 اضافہ کرنے کے لیے اسے ٹیپ کریں۔\n\n' +
      'آپ کی کل گنتی تاریخ بار کے دائیں جانب ایک چھوٹے پِل میں نظر آتی ہے۔ گنتی صفر کرنے کے لیے اس پِل ("Tap to reset") کو ٹیپ کریں۔\n\n' +
      'بٹن اپنی جگہ مقرر ہے (اب اسے گھسیٹا نہیں جا سکتا)۔ آپ اسے "نماز الرٹس" میں تسبیح ٹوگل سے چھپا یا دکھا سکتے ہیں (پہلے سے آن ہے)۔',
  },
  {
    title: '🕌 نماز کے رکعات',
    content:
      'مرکزی اسکرین پر کوئی بھی نماز کا نام (فجر، ظہر، عصر وغیرہ) ٹیپ کریں تاکہ اس نماز کی حنفی رکعات کی تفصیل دیکھ سکیں۔\n\n' +
      'گائیڈ میں تمام انواع کی نماز ترتیب سے دکھائی جاتی ہیں — تحیۃ المسجد، سنت، فرض (سرخ)، پھر سنت/نفل۔\n\n' +
      'رنگ: سرخ = فرض · نیلا = واجب · ہلکا سبز = نفل · موٹا = سنت مؤکدہ۔\n\n' +
      'نیچے ایک فلٹرڈ اصطلاحات کی فہرست ہے جو صرف اس نماز سے متعلق اصطلاحات بیان کرتی ہے۔',
  },
  {
    title: '🧪 الارم ٹیسٹ کریں',
    content:
      'الرٹس ٹیب کے نیچے "ٹیسٹ الارم" سیکشن تک سکرول کریں۔\n\n' +
      'آپ نے جو نمازیں فعال کی ہیں ان کی فہرست ملے گی۔ کسی بھی نماز کے پاس ▶ ٹیسٹ ٹیپ کریں تاکہ 15 سیکنڈ میں الارم بجے — بالکل وہی آواز، فلیش، اور قرآنی آیت جو اصل نماز کے وقت بجے گی۔\n\n' +
      'ایک وقت میں صرف ایک ٹیسٹ چل سکتا ہے۔ فون لاک کریں اور Do Not Disturb لگائیں تاکہ تصدیق ہو سکے کہ الارم گزر جاتا ہے۔',
  },
  {
    title: '🧭 قبلہ کمپاس',
    content:
      'مینو → قبلہ کی سمت کے ذریعے قبلہ اسکرین کھولیں۔\n\n' +
      'کمپاس کی سوئی آپ کے موجودہ مقام سے مکہ مکرمہ کی طرف اشارہ کرتی ہے۔ بہترین درستگی کے لیے فون کو ہموار سطح پر سیدھا رکھیں۔\n\n' +
      'کمپاس کے نیچے سمت (ڈگریز میں) دکھائی جاتی ہے۔ اس سمت میں منہ کرنے کا مطلب ہے کہ آپ مکہ کی طرف ہیں۔\n\n' +
      'اشارہ: اگر سوئی غلط لگے تو فون کو 8 کی شکل میں گھمائیں تاکہ کمپاس کیلیبریٹ ہو۔',
  },
  {
    title: '🌍 عالمی اوقات',
    content:
      '🌍 ورلڈ ٹیب دبائیں یا ہیڈر میں گھڑی ٹیپ کریں تاکہ عالمی اوقات کی اسکرین کھلے۔\n\n' +
      'اس میں مسلم کمیونٹی کے اہم شہروں کا مقامی وقت، درجہ حرارت، موسم، موجودہ نماز اور GBP ایکسچینج ریٹ دکھایا جاتا ہے: مکہ، مدینہ، دبئی، استنبول، اسلام آباد، ڈھاکہ، نئی دہلی، پورٹ لوئس، کابل، قاہرہ، کاسابلانکا، لاگوس وغیرہ۔\n\n' +
      'درجہ حرارت کے آئیکن: ❄️ سرد (≤5°C) · 🌤️ ٹھنڈا · ☀️ گرم · 🌞 بہت گرم · 🔥 انتہائی گرم · 🔥🔥 شدید گرم (>38°C)۔\n\n' +
      'شہر برطانیہ کے وقت کے فرق کے لحاظ سے ترتیب میں ہیں۔ سعودی عرب (مکہ و مدینہ) ہمیشہ پہلے ہے۔ موسمی ڈیٹا Open-Meteo سے اور ایکسچینج ریٹ FloatRates.com سے ہے۔',
  },
  {
    title: '🌦️ 7 روزہ موسمی پیش گوئی',
    content:
      'ورلڈ ٹائمز اسکرین سے کسی بھی شہر کا درجہ حرارت سطر ٹیپ کریں تاکہ 7 روزہ پیش گوئی کھلے۔\n\n' +
      'پیش گوئی میں روزانہ زیادہ سے زیادہ/کم سے کم درجہ حرارت، موسمی آئیکن، بارش (ملی میٹر) اور ہوا کی زیادہ سے زیادہ رفتار (km/h) دکھائی جاتی ہے۔\n\n' +
      'ماخذ: Open-Meteo (مفت، کوئی API کی ضرورت نہیں)۔ ڈیٹا ہر شہر کے لیے 1 گھنٹے کے لیے محفوظ ہے۔\n\n' +
      'بند کرنے کے لیے ✕ ٹیپ کریں۔',
  },
  {
    title: '💱 GBP ایکسچینج ریٹ چارٹس',
    content:
      'ورلڈ ٹائمز اسکرین سے کسی بھی شہر کا ایکسچینج ریٹ سطر ٹیپ کریں تاکہ xe.com پر 12 ماہ کا GBP چارٹ کھلے۔\n\n' +
      'چارٹ ایپ کے اندر براؤزر میں کھلتا ہے اور پچھلے سال کے ریٹ کی تبدیلی دکھاتا ہے۔\n\n' +
      'اگر مقام کے بارے میں پاپ اپ آئے تو نیچے سکرول کریں یا Cancel دبائیں۔ چارٹ پس منظر میں نظر آئے گا۔\n\n' +
      'ریٹ کارڈ پر دکھایا گیا ریٹ FloatRates.com سے ہے اور ریٹ کی تاریخ بریکٹ میں دی جاتی ہے۔',
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
    content:
      'মূল স্ক্রিনে এপসম ও ইউয়েলের আজকের নামাজের সময়সূচি দেখানো হয়।\n\n' +
      'NEXT ব্যাজ — পরবর্তী নামাজ নীল রঙে এবং সবুজ "NEXT" ব্যাজ সহ হাইলাইট থাকে।\n\n' +
      'কাউন্টডাউন — হেডারের নিচে সবুজ বার পরবর্তী নামাজ পর্যন্ত সময় গণনা করে।\n\n' +
      'বাম/ডান সোয়াইপ — অন্য দিনের নামাজের সময়সূচি দেখুন। ভিন্ন তারিখে থাকলে "আজকে ফিরুন" বোতাম দেখা যায়।\n\n' +
      'জুমার দিন — যোহরের সারি বদলে ১ম ও ২য় জুমার সময় দেখায়।\n\n' +
      'NEW ব্যাজ — গতকালের চেয়ে জামাআতের সময় পরিবর্তন হলে লাল "NEW" চিহ্ন দেখা যায়।\n\n' +
      'ঘড়ি পরিবর্তনের অনুস্মারক — যুক্তরাজ্যে ঘড়ির সময় পরিবর্তনের আগের দিন একটি স্ক্রলিং ব্যানার স্বয়ংক্রিয়ভাবে দেখা যায়।',
  },
  {
    title: '🌅 শুরুক (সূর্যোদয়)',
    content:
      'শুরুক হল সূর্যোদয়ের সময় — এটি ফজরের নামাজের শেষ সময়।\n\n' +
      'ফজর পড়ার শেষ সীমা — শুরুকের আগেই ফজর সম্পন্ন করতে হবে। সূর্য উদয়ের পরে ফজরের সময় শেষ হয়ে যায়।\n\n' +
      'শুরুক অ্যালার্ট সেট করা — অ্যালার্ট ট্যাবে গিয়ে শুরুক সারি চালু করুন। একটি অফসেট (যেমন ৩০ মিনিট আগে) সেট করতে পারেন যাতে সময় থাকতে ফজরের কথা মনে পড়ে।',
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
    title: '📿 তাসবীহ কাউন্টার',
    content:
      'শুরুকের সারির ডান পাশে একটি 📿 তাসবীহ বোতাম সব সময় থাকে। গণনা ১ বাড়াতে এটিতে ট্যাপ করুন।\n\n' +
      'আপনার মোট গণনা তারিখ বারের ডান পাশে একটি ছোট পিল-এ দেখা যায়। গণনা শূন্য করতে সেই পিল ("Tap to reset") ট্যাপ করুন।\n\n' +
      'বোতামটি স্থির (আর টেনে সরানো যায় না)। আপনি এটি "নামাজ অ্যালার্ট"-এর তাসবীহ টগল থেকে লুকাতে বা দেখাতে পারেন (ডিফল্টভাবে চালু)।',
  },
  {
    title: '🕌 নামাজের রাকাত গাইড',
    content:
      'মূল স্ক্রিনে যেকোনো নামাজের নাম (ফজর, যোহর, আসর ইত্যাদি) ট্যাপ করলে সেই নামাজের হানাফি রাকাআত বিভাজন দেখা যাবে।\n\n' +
      'গাইডে সকল ধরনের নামাজ ক্রমানুসারে দেখানো হয় — তাহিয়্যাতুল মসজিদ, সুন্নত, ফরজ (লাল), তারপর সুন্নত/নফল।\n\n' +
      'রঙের অর্থ: লাল = ফরজ · নীল = ওয়াজিব · হালকা সবুজ = নফল · বোল্ড = সুন্নত মুআক্কাদা।\n\n' +
      'নিচে একটি ফিল্টার করা শব্দকোষ আছে যা শুধু সেই নামাজের সাথে সম্পর্কিত পরিভাষা ব্যাখ্যা করে।',
  },
  {
    title: '🧪 অ্যালার্ম পরীক্ষা করুন',
    content:
      'অ্যালার্ট ট্যাবের নিচে "টেস্ট অ্যালার্ম" বিভাগে স্ক্রল করুন।\n\n' +
      'আপনি যে নামাজগুলো চালু করেছেন সেগুলোর তালিকা দেখা যাবে। যেকোনো নামাজের পাশে ▶ টেস্ট ট্যাপ করলে ১৫ সেকেন্ডের মধ্যে সেই অ্যালার্ম বাজবে — একই শব্দ, ফ্ল্যাশ এবং কোরআনের আয়াত যা আসল নামাজের সময় বাজবে।\n\n' +
      'একসাথে শুধু একটি টেস্ট চলতে পারে। ফোন লক করুন এবং Do Not Disturb চালু করুন যাতে অ্যালার্ম ঠিকমতো কাজ করছে কিনা যাচাই করতে পারেন।',
  },
  {
    title: '🧭 কিবলা কম্পাস',
    content:
      'মেনু → কিবলার দিক থেকে কিবলা স্ক্রিন খুলুন।\n\n' +
      'কম্পাসের কাঁটা আপনার বর্তমান অবস্থান থেকে মক্কার দিক নির্দেশ করে। সেরা নির্ভুলতার জন্য ফোনটি সমতল রেখে ধরুন।\n\n' +
      'কম্পাসের নিচে দিকটি (ডিগ্রিতে) দেখানো হয়। সেই দিকে মুখ করার অর্থ হলো আপনি মক্কার দিকে মুখ করছেন।\n\n' +
      'টিপস: কম্পাস ক্যালিব্রেট করতে ফোনটি ৮ আকৃতিতে নাড়ান।',
  },
  {
    title: '🌍 বিশ্ব সময়',
    content:
      '🌍 ওয়ার্ল্ড ট্যাব ট্যাপ করুন বা হেডারে ঘড়িতে ট্যাপ করুন বিশ্ব সময় স্ক্রিন খুলতে।\n\n' +
      'মুসলিম সম্প্রদায়ের জন্য গুরুত্বপূর্ণ শহরগুলোর স্থানীয় সময়, তাপমাত্রা, আবহাওয়া, বর্তমান নামাজ এবং GBP বিনিময় হার দেখানো হয়: মক্কা, মদিনা, দুবাই, ইস্তাম্বুল, ইসলামাবাদ, ঢাকা, নতুন দিল্লি, পোর্ট লুইস, কাবুল, কায়রো, কাসাব্লাংকা, লাগোস ইত্যাদি।\n\n' +
      'তাপমাত্রার আইকন: ❄️ শীতল (≤5°C) · 🌤️ ঠান্ডা · ☀️ উষ্ণ · 🌞 গরম · 🔥 খুব গরম · 🔥🔥 অত্যন্ত গরম (>38°C)।\n\n' +
      'শহরগুলো যুক্তরাজ্যের সময়ের পার্থক্য অনুযায়ী সাজানো। সৌদি আরব (মক্কা ও মদিনা) সবসময় প্রথমে। আবহাওয়া Open-Meteo এবং বিনিময় হার FloatRates.com থেকে।',
  },
  {
    title: '🌦️ ৭-দিনের আবহাওয়া পূর্বাভাস',
    content:
      'বিশ্ব সময় স্ক্রিন থেকে যেকোনো শহরের তাপমাত্রা সারিতে ট্যাপ করুন ৭ দিনের পূর্বাভাস দেখতে।\n\n' +
      'পূর্বাভাসে দৈনিক সর্বোচ্চ/সর্বনিম্ন তাপমাত্রা, আবহাওয়ার আইকন, বৃষ্টিপাত (মিমি) এবং সর্বোচ্চ বায়ুর গতি (km/h) দেখানো হয়।\n\n' +
      'উৎস: Open-Meteo (বিনামূল্যে, কোনো API কী প্রয়োজন নেই)। ডেটা প্রতি শহরের জন্য ১ ঘণ্টা ক্যাশ করা থাকে।\n\n' +
      'বন্ধ করতে ✕ ট্যাপ করুন।',
  },
  {
    title: '💱 GBP বিনিময় হার চার্ট',
    content:
      'বিশ্ব সময় স্ক্রিন থেকে যেকোনো শহরের বিনিময় হার সারিতে ট্যাপ করুন xe.com-এ ১২ মাসের GBP চার্ট দেখতে।\n\n' +
      'চার্টটি অ্যাপের ভেতরে ব্রাউজারে খোলে এবং গত বছরের বিনিময় হারের পরিবর্তন দেখায়।\n\n' +
      'কোনো লোকেশন পপআপ এলে নিচে স্ক্রল করুন বা Cancel চাপুন। চার্টটি পেছনে দেখা যাবে।\n\n' +
      'কার্ডে দেখানো হার FloatRates.com থেকে এবং হারের তারিখ বন্ধনীতে দেওয়া থাকে, যেমন "20 May 2025"।',
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

// ─── Arabic content (RTL) ─────────────────────────────────────────────────────

const AR: Section[] = [
  {
    title: '🕌 شاشة أوقات الصلاة',
    content:
      'تعرض الشاشة الرئيسية أوقات صلاة اليوم في إيبسوم وإيويل.\n\n' +
      'شارة NEXT — تُبرز الصلاة القادمة باللون الأزرق مع شارة "NEXT" خضراء في الأعلى.\n\n' +
      'العداد التنازلي — الشريط الأخضر أسفل الرأسية يحسب الوقت المتبقي للصلاة القادمة في الوقت الفعلي.\n\n' +
      'التمرير يسارًا/يمينًا — تصفّح أوقات الصلاة لأيام أخرى. يظهر زر "العودة إلى اليوم" عند عرض تاريخ مختلف.\n\n' +
      'الجمعة — يتغير صف الظهر ليعرض أوقات الجمعة الأولى والثانية.\n\n' +
      'شارة NEW — إذا تغير وقت الجماعة منذ الأمس، تظهر علامة حمراء "NEW" على ذلك الوقت.\n\n' +
      'تذكير تغيير التوقيت — قبل يوم من تغيير توقيت المملكة المتحدة (ربيع/خريف)، يظهر شريط تمرير تلقائي يذكّرك بذلك.',
  },
  {
    title: '🌅 الشروق (شروق الشمس)',
    content:
      'الشروق هو وقت شروق الشمس — ويُعدّ نهاية وقت صلاة الفجر.\n\n' +
      'آخر وقت لصلاة الفجر — يجب إتمام صلاة الفجر قبل الشروق. فبعد شروق الشمس ينتهي وقت الفجر.\n\n' +
      'ضبط تنبيه الشروق — افتح تبويب التنبيهات وفعّل صف الشروق. يمكنك ضبط فارق زمني (مثل 30 دقيقة قبل الشروق) كتذكير لصلاة الفجر في الوقت المناسب.',
  },
  {
    title: '📿 عداد التسبيح',
    content:
      'يوجد زر 📿 ثابت على يمين صف الشروق — دائم الظهور.\n\n' +
      'اضغط الزر لإضافة تسبيحة واحدة، والعدد يظهر بداخله بخط أبيض عريض.\n\n' +
      'يمكنك تفعيل العداد أو إيقافه من تبويب التنبيهات.',
  },
  {
    title: "🕌 دليل ركعات الصلاة",
    content:
      'اضغط على اسم أي صلاة (فجر، ظهر، عصر، إلخ) في الشاشة الرئيسية لعرض تفاصيل الركعات وفق المذهب الحنفي.\n\n' +
      'يُبيّن الدليل كل نوع من أنواع الصلاة بالترتيب — تحية المسجد، السنة، الفرض (باللون الأحمر)، ثم السنة/النافلة بعد الفرض.\n\n' +
      'الألوان: أحمر = فرض · أزرق = واجب · أخضر فاتح = نافلة · غامق = سنة مؤكدة.\n\n' +
      'توجد في الأسفل قائمة مصطلحات مُصفَّاة تشرح المصطلحات المستخدمة في تلك الصلاة فقط.',
  },
  {
    title: '🔔 كيفية ضبط تنبيه الصلاة',
    content: [
      { step: '١', text: 'اضغط على تبويب التنبيهات في الشريط السفلي، أو افتح القائمة ← تنبيهات الصلاة والأصوات.' },
      { step: '٢', text: 'اختر الصلاة المطلوبة (مثلاً: الظهر).' },
      { step: '٣', text: 'اضغط على المفتاح لتشغيله (يصبح أخضر).' },
      { step: '٤', text: 'اختر الصوت — اضغط على "بلا صوت" لفتح منتقي الأصوات. اختر خيارًا واضغط تم.' },
      { step: '٥', text: 'اختر وقت الأذان أو وقت الجماعة — اضغط على الزر للتبديل بينهما.' },
      { step: '٦', text: 'إذا اخترت الجماعة، استخدم شريط التمرير لتحديد عدد الدقائق قبل الجماعة (مثلاً 15 دقيقة قبل).' },
      { step: '٧', text: 'تم! سيضبط التنبيه تلقائياً. يمكنك اختباره من قسم اختبار المنبّه أسفل قائمة الصلوات.' },
    ],
  },
  {
    title: '⚙️ شرح خيارات المنبه',
    content:
      '💥 وميض الشاشة — عند إطلاق المنبّه، تومض الشاشة باللون الأبيض ثلاث مرات ثم تعرض شاشة الصلاة. مناسب لثقيلي النوم.\n\n' +
      '⚡ المصباح — يومض مصباح الكاميرا الخلفية. مفيد في الغرف المظلمة.\n\n' +
      '📳 الاهتزاز — يهتز الهاتف عند إطلاق المنبّه. مفيد في وضع الصامت.\n\n' +
      '🔁 التكرار — يستمر الصوت في العزف حتى تضغط على إيقاف. يُنصح به لصلاة الفجر لضمان الاستيقاظ.\n\n' +
      '📖 الاقتباسات — تعرض آية قرآنية على شاشة المنبّه (عند تفعيل وميض الشاشة) أو في قائمة الإشعارات.',
  },
  {
    title: '🕐 وقت البداية مقابل وقت الجماعة',
    content:
      'وقت البداية — يُطلق المنبّه عند بداية وقت الصلاة (مثلاً عند أذان الظهر الساعة 1:05). مناسب للصلاة في المنزل.\n\n' +
      'وقت الجماعة — يُطلق المنبّه قبل صلاة الجماعة في المسجد. استخدم شريط التمرير لضبط عدد الدقائق قبل الجماعة. مثال: الجماعة الساعة 1:30، الفارق 15 دقيقة → يُطلق المنبّه الساعة 1:15 لإتاحة وقت للتحضير.',
  },
  {
    title: '🧪 اختبار المنبه',
    content:
      'مرّر لأسفل في تبويب التنبيهات للوصول إلى قسم "اختبار المنبّه".\n\n' +
      'ستجد قائمة بجميع الصلوات التي فعّلتها. اضغط ▶ اختبار بجانب أي صلاة لإطلاق ذلك المنبّه فورًا (خلال 15 ثانية) بنفس الإعدادات الحقيقية — الصوت والتكرار والوميض والمصباح والاهتزاز والاقتباس.\n\n' +
      'لا يمكن تشغيل إلا اختبار واحد في المرة الواحدة. أقفل هاتفك وفعّل وضع "عدم الإزعاج" للتحقق من أن المنبّه يخترق الإعدادات.',
  },
  {
    title: '🧭 بوصلة القبلة',
    content:
      'افتح شاشة القبلة عبر القائمة ← اتجاه القبلة.\n\n' +
      'تُشير إبرة البوصلة نحو مكة المكرمة من موقعك الحالي. أمسك هاتفك بشكل أفقي ومستوٍ للحصول على أفضل دقة.\n\n' +
      'يظهر الاتجاه (بالدرجات) أسفل البوصلة. التوجه نحو ذلك الرقم يعني أنك تواجه مكة المكرمة.\n\n' +
      'نصيحة: إذا بدت الإبرة غير دقيقة، حرّك هاتفك بشكل رقم 8 لمعايرة البوصلة.',
  },
  {
    title: '🌍 التوقيت العالمي',
    content:
      'اضغط تبويب 🌍 العالم في الأسفل، أو اضغط على الساعة في الرأسية، لفتح شاشة التوقيت العالمي.\n\n' +
      'تعرض الوقت المحلي ودرجة الحرارة والطقس والصلاة الحالية وسعر صرف الجنيه الإسترليني للمدن المهمة للمجتمع المسلم: مكة المكرمة، المدينة المنورة، دبي، إسطنبول، إسلام أباد، دكا، نيودلهي، بورت لويس، كابول، القاهرة، الدار البيضاء، لاغوس وغيرها.\n\n' +
      'أيقونات درجة الحرارة: ❄️ بارد جداً (≤5°C) · 🌤️ بارد · ☀️ دافئ · 🌞 حار · 🔥 حار جداً · 🔥🔥 حار بشكل مفرط (>38°C).\n\n' +
      'المدن مرتبة حسب الفارق الزمني مع المملكة المتحدة. المملكة العربية السعودية (مكة والمدينة) دائماً في المقدمة. بيانات الطقس من Open-Meteo وأسعار الصرف من FloatRates.com.',
  },
  {
    title: '🌦️ توقعات الطقس لـ 7 أيام',
    content:
      'من شاشة التوقيت العالمي، اضغط على صف درجة الحرارة لأي مدينة (الصف الذي يظهر 🔥 أو ☀️ ودرجة الحرارة) لفتح توقعات الطقس لمدة 7 أيام.\n\n' +
      'تعرض التوقعات أقصى/أدنى درجات الحرارة اليومية وأيقونة حالة الطقس وكمية الأمطار (ملم) وأقصى سرعة للرياح (كم/ساعة) للأيام السبعة القادمة.\n\n' +
      'المصدر: Open-Meteo (مجاني، لا يحتاج مفتاح API). تُخزَّن البيانات مؤقتاً لمدة ساعة لكل مدينة وتُحدَّث تلقائياً عند انتهاء الذاكرة المؤقتة.\n\n' +
      'اضغط ✕ لإغلاق التوقعات والعودة إلى شاشة التوقيت العالمي.',
  },
  {
    title: '💱 مخططات سعر صرف الجنيه',
    content:
      'من شاشة التوقيت العالمي، اضغط على صف سعر الصرف لأي مدينة (الصف الذي يظهر 💷 والسعر، مثل "1 GBP = 4.78 SAR") لفتح مخطط GBP التفاعلي لمدة 12 شهرًا على موقع xe.com.\n\n' +
      'يفتح المخطط في نافذة متصفح داخل التطبيق، ويُظهر تطور سعر الصرف خلال العام الماضي.\n\n' +
      'إذا ظهرت نافذة منبثقة — مرّر لأسفل أو اضغط إلغاء/إغلاق لتجاهلها. المخطط مرئي خلفها.\n\n' +
      'السعر المعروض على البطاقة مصدره FloatRates.com (مجاني، يُحدَّث كل ساعة) ويظهر تاريخ السعر بين قوسين.',
  },
  {
    title: '📱 أذونات Android',
    content:
      'يحتاج التطبيق إلى 4 أذونات ليعمل بشكل موثوق. سيتم إرشادك خلال هذه الأذونات عند التثبيت لأول مرة.\n\n' +
      '1. الإشعارات — ضرورية لعرض أي تنبيهات. اضغط "سماح" عند ظهور طلب النظام.\n\n' +
      '2. الإنذارات الدقيقة — تتيح للتطبيق الإطلاق في وقت الصلاة بدقة تامة. الإعدادات ← التطبيقات ← EEIS Prayer Times ← الإنذارات والتذكيرات ← تفعيل.\n\n' +
      '3. البطارية (غير مقيد) — يمنع الهاتف من إلغاء الإنذارات في الخلفية. على Samsung:\n   الإعدادات ← البطارية ← إدارة طاقة التطبيق ← تعيين EEIS على غير مقيد.\n\n' +
      '4. التنبيهات بملء الشاشة (Android 14+) — تعرض شاشة المنبّه فوق شاشة القفل.\n   الإعدادات ← الوصول الخاص للتطبيقات ← العرض فوق شاشة القفل ← تفعيل EEIS.',
  },
  {
    title: '🏦 التبرع والتحويل البنكي',
    content:
      'تفاصيل التحويل البنكي:\n' +
      '   اسم الحساب: Epsom & Ewell Islamic Society\n' +
      '   رمز الفرز: 30-93-74\n' +
      '   رقم الحساب: 01879186\n' +
      '   المرجع: اسمك أو "تبرع"\n\n' +
      'Gift Aid — إذا كنت دافع ضرائب في المملكة المتحدة، يمكن لـ EEIS استرداد 25 بنسًا مقابل كل جنيه إسترليني تتبرع به دون أي تكلفة عليك. أكمل نموذج إقرار Gift Aid المتاح في التطبيق عبر القائمة ← التحويل البنكي وGift Aid.\n\n' +
      'الأمر الدائم — أعدّ تبرعًا شهريًا منتظمًا باستخدام تفاصيل الحساب أعلاه عبر تطبيق أو موقع بنكك.',
  },
];

const CONTENT: Record<Language, Section[]> = { en: EN, ur: UR, bn: BN, ar: AR };

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

  const isRTL       = lang === 'ur' || lang === 'ar';
  const sections    = CONTENT[lang];
  // Non-Latin scripts need ~30% larger text for legibility
  const scriptScale = lang !== 'en' ? 1.3 : 1.0;

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
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>

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
          {(['en', 'ur', 'bn', 'ar'] as Language[]).map(l => (
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

        {/* Vertical contents list — icon + section title, tappable to jump */}
        <ScrollView
          style={styles.contentsScroll}
          contentContainerStyle={styles.contentsContent}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {sections.map((section, i) => {
            const emoji = section.title.split(' ')[0];
            const title = section.title.slice(emoji.length + 1);
            return (
              <TouchableOpacity
                key={i}
                style={styles.contentsItem}
                onPress={() => {
                  const y = sectionOffsets.current[i];
                  if (y !== undefined) scrollRef.current?.scrollTo({ y: y + 8, animated: true });
                }}
              >
                <Text style={styles.contentsIcon}>{emoji}</Text>
                <Text
                  style={[styles.contentsLabel, { fontFamily: semi }]}
                  numberOfLines={1}
                >
                  {title}
                </Text>
              </TouchableOpacity>
            );
          })}
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
                { fontFamily: bold, textAlign: isRTL ? 'right' : 'left',
                  fontSize: Math.round(16 * scriptScale) },
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
                        isRTL && styles.stepTextRTL,
                        { fontFamily: reg,
                          fontSize: Math.round(15 * scriptScale),
                          lineHeight: Math.round(23 * scriptScale) },
                      ]}>
                        {item.text}
                      </Text>
                    </View>
                  ))
                : <Text style={[
                    styles.bodyText,
                    isRTL && styles.bodyTextRTL,
                    { fontFamily: reg,
                      fontSize: Math.round(15 * scriptScale),
                      lineHeight: Math.round(24 * scriptScale) },
                  ]}>
                    {section.content}
                  </Text>
              }
            </View>
          ))}

          <View style={{ height: 24 }} />
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
  // Vertical contents list
  contentsScroll: {
    maxHeight: 170,
    backgroundColor: '#E8F0FE',
    borderBottomWidth: 1,
    borderBottomColor: '#C8D8F0',
  },
  contentsContent: {
    paddingVertical: 4,
  },
  contentsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  contentsIcon: {
    fontSize: 20,
    width: 30,
    textAlign: 'center',
  },
  contentsLabel: {
    fontSize: 13,
    color: Colors.deepBlue,
    fontWeight: '600',
    flex: 1,
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
});
