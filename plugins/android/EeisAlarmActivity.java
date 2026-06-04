package com.eeis.prayertimes;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * Lock screen alarm Activity — shown over the lock screen when a prayer alarm fires.
 *
 * v24: Redesigned for screen-size independence.
 *   - Logo: 60dp, LEFT-aligned in a horizontal header row alongside prayer name.
 *   - "Epsom & Ewell Islamic Society" org label removed (text is inside logo image).
 *   - Prayer times: both BEGINS and JAMA'AT always shown; highlighted column is amber.
 *   - Buttons: two circular side-by-side buttons (PAUSE + STOP) to save vertical space.
 *   - All sizes scale via a factor derived from screen height so content fits on S20.
 *
 * v25: Layout adjustments per user mockup.
 *   - Logo: 52dp, TOP-RIGHT corner (FrameLayout overlay). Prayer name: centred.
 *   - BEGINS/JAMA'AT label font enlarged (10sp -> 13sp).
 *   - Quran quote: tighter spacing above to sit closer to the times row.
 *   - Surah reference: 17sp (was 12sp) — 3sp smaller than quote text (20sp).
 *   - Pause/Stop button gap widened (20dp -> 36dp).
 *   - Chips row + footer pushed lower (increased margins).
 *
 * Flash-then-reveal: white overlay sits on top of content in a FrameLayout.
 *   Content starts INVISIBLE. After 3 white/dark pulses, overlay goes GONE and content VISIBLE.
 */
public class EeisAlarmActivity extends Activity {

    public static final String EXTRA_PRAYER_NAME = "prayerName";
    public static final String EXTRA_BODY        = "body";
    public static final String EXTRA_ALARM_ID    = "alarmId";
    public static final String EXTRA_SPLASH      = "splash";
    public static final String EXTRA_QUOTE_TEXT  = "quoteText";
    public static final String EXTRA_QUOTE_REF   = "quoteRef";
    public static final String EXTRA_BEGINS_TIME = "beginsTime"; // v24
    public static final String EXTRA_JAMAAT_TIME = "jamaatTime"; // v24
    public static final String EXTRA_USE_JAMAAT  = "useJamaat";  // v24
    public static final String EXTRA_HAS_AUDIO   = "hasAudio";   // v56 — hide Pause if false

    // EEIS brand colours
    private static final int COLOR_DEEP_BLUE  = 0xFF063968;
    private static final int COLOR_BLUE       = 0xFF0B5EA8;
    private static final int COLOR_MAROON_RED = 0xFFB71C2E;
    private static final int COLOR_GREEN      = 0xFF2E7D32;
    private static final int COLOR_WHITE      = 0xFFFFFFFF;
    private static final int COLOR_GREY_TEXT  = 0xFFBBCCDD;
    private static final int COLOR_AMBER      = 0xFFFFD54F;  // v24 highlight colour

    // Flash: 3 white pulses (each pulse = overlay visible -> invisible)
    private static final int FLASH_PULSES      = 3;
    private static final int FLASH_INTERVAL_MS = 350;

    private Handler  flashHandler;
    private View     flashOverlayView;
    private View     contentScrollView;
    private int      flashCount   = 0;
    private boolean  isPaused     = false;
    private boolean  shouldSplash = false;
    private String   quoteText    = "";
    private String   quoteRef     = "";
    private String   beginsTime   = "";
    private String   jamaatTime   = "";
    private boolean  useJamaat    = false;
    private boolean  hasAudio     = true;   // v56 — when false, hide the Pause button
    private Button   pauseBtn;

    // Screen scale: 0.75-1.0 based on screen height, so content fits on small phones
    private float sc = 1.0f;
    // Width scale: 0.72-1.0 based on screen width, so the 4 bottom pills shrink
    // cleanly and never overlap on narrow phones (e.g. Samsung S20 ~360dp wide).
    private float wsc = 1.0f;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        lp.screenBrightness = 1.0f;
        getWindow().setAttributes(lp);

        super.onCreate(savedInstanceState);

        // Compute scale factor from screen height
        DisplayMetrics dm = getResources().getDisplayMetrics();
        int screenHDp = (int)(dm.heightPixels / dm.density);
        sc = Math.max(0.75f, Math.min(1.0f, screenHDp / 880f));
        int screenWDp = (int)(dm.widthPixels / dm.density);
        wsc = Math.max(0.72f, Math.min(1.0f, screenWDp / 411f));

        String prayerName = getIntent().getStringExtra(EXTRA_PRAYER_NAME);
        String body       = getIntent().getStringExtra(EXTRA_BODY);
        shouldSplash      = getIntent().getBooleanExtra(EXTRA_SPLASH, false);
        quoteText         = nvl(getIntent().getStringExtra(EXTRA_QUOTE_TEXT), "");
        quoteRef          = nvl(getIntent().getStringExtra(EXTRA_QUOTE_REF),  "");
        beginsTime        = nvl(getIntent().getStringExtra(EXTRA_BEGINS_TIME), "");
        jamaatTime        = nvl(getIntent().getStringExtra(EXTRA_JAMAAT_TIME), "");
        useJamaat         = getIntent().getBooleanExtra(EXTRA_USE_JAMAAT, false);
        hasAudio          = getIntent().getBooleanExtra(EXTRA_HAS_AUDIO, true);
        if (prayerName == null) prayerName = "Prayer";
        if (body == null)       body = "";

        buildUI(prayerName, body);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        stopScreenFlash();
        String prayerName = intent.getStringExtra(EXTRA_PRAYER_NAME);
        String body       = intent.getStringExtra(EXTRA_BODY);
        shouldSplash      = intent.getBooleanExtra(EXTRA_SPLASH, false);
        quoteText         = nvl(intent.getStringExtra(EXTRA_QUOTE_TEXT), "");
        quoteRef          = nvl(intent.getStringExtra(EXTRA_QUOTE_REF),  "");
        beginsTime        = nvl(intent.getStringExtra(EXTRA_BEGINS_TIME), "");
        jamaatTime        = nvl(intent.getStringExtra(EXTRA_JAMAAT_TIME), "");
        useJamaat         = intent.getBooleanExtra(EXTRA_USE_JAMAAT, false);
        hasAudio          = intent.getBooleanExtra(EXTRA_HAS_AUDIO, true);
        if (prayerName == null) prayerName = "Prayer";
        if (body == null)       body = "";
        isPaused = false;
        buildUI(prayerName, body);
    }

    @Override
    protected void onDestroy() {
        stopScreenFlash();
        super.onDestroy();
    }

    // ─── Root UI builder ──────────────────────────────────────────────────────

    private void buildUI(String prayerName, String body) {
        DisplayMetrics dm2 = getResources().getDisplayMetrics();
        int screenHPx = dm2.heightPixels;

        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(COLOR_DEEP_BLUE);

        // Content wrapper: hidden during splash flash, shown after
        FrameLayout contentWrapper = new FrameLayout(this);
        contentWrapper.setVisibility(View.INVISIBLE);

        // Top section: header + times + quote — scrollable, capped at 50% screen height
        ScrollView topScroll = buildTopContent(prayerName);
        FrameLayout.LayoutParams topP = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, (int)(screenHPx * 0.62f));
        topP.gravity = Gravity.TOP;
        topScroll.setLayoutParams(topP);
        contentWrapper.addView(topScroll);

        // Pause + Stop buttons centred at 52% screen height
        LinearLayout btnRow = buildBtnRow(prayerName);
        int btnH = scdp(72);
        FrameLayout.LayoutParams btnRowP = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, btnH);
        btnRowP.gravity = Gravity.CENTER_HORIZONTAL;
        btnRowP.topMargin = (int)(screenHPx * 0.74f) - btnH / 2;
        btnRow.setLayoutParams(btnRowP);
        contentWrapper.addView(btnRow);

        // Chips + footer anchored at 75% screen height
        LinearLayout chipsSection = buildChipsSection();
        FrameLayout.LayoutParams chipsSectionP = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT);
        chipsSectionP.gravity = Gravity.TOP;
        chipsSectionP.topMargin = (int)(screenHPx * 0.87f);
        chipsSection.setLayoutParams(chipsSectionP);
        contentWrapper.addView(chipsSection);

        frame.addView(contentWrapper, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        // White flash overlay sits on top
        View overlay = new View(this);
        overlay.setBackgroundColor(COLOR_WHITE);
        frame.addView(overlay, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        contentScrollView = contentWrapper;
        flashOverlayView  = overlay;

        setContentView(frame);

        if (shouldSplash) {
            startScreenFlash();
        } else {
            overlay.setVisibility(View.GONE);
            contentWrapper.setVisibility(View.VISIBLE);
        }
    }

    // ─── Screen flash ─────────────────────────────────────────────────────────

    private void startScreenFlash() {
        stopScreenFlash();
        flashCount = 0;
        flashHandler = new Handler(Looper.getMainLooper());
        flashHandler.postDelayed(flashRunnable, 150);
    }

    private void stopScreenFlash() {
        if (flashHandler != null) {
            flashHandler.removeCallbacksAndMessages(null);
            flashHandler = null;
        }
        if (flashOverlayView  != null) flashOverlayView.setVisibility(View.GONE);
        if (contentScrollView != null) contentScrollView.setVisibility(View.VISIBLE);
    }

    private final Runnable flashRunnable = new Runnable() {
        @Override public void run() {
            if (flashOverlayView == null) return;
            flashCount++;
            if (flashCount >= FLASH_PULSES * 2) {
                flashOverlayView.setVisibility(View.GONE);
                if (contentScrollView != null) contentScrollView.setVisibility(View.VISIBLE);
                flashHandler = null;
                return;
            }
            flashOverlayView.setVisibility(
                    flashCount % 2 != 0 ? View.INVISIBLE : View.VISIBLE);
            if (flashHandler != null) flashHandler.postDelayed(this, FLASH_INTERVAL_MS);
        }
    };

    // ─── Content layout ───────────────────────────────────────────────────────

    private ScrollView buildTopContent(final String prayerName) {
        final boolean hasBeginsTime = !beginsTime.isEmpty();
        final boolean hasJamaatTime = !jamaatTime.isEmpty();
        final boolean hasTimes      = hasBeginsTime || hasJamaatTime;

        ScrollView scrollView = new ScrollView(this);
        scrollView.setBackgroundColor(COLOR_DEEP_BLUE);
        scrollView.setFillViewport(true);

        // StatusBar height — ensure content clears the system status bar
        int statusBarHeight = 0;
        int resId = getResources().getIdentifier("status_bar_height", "dimen", "android");
        if (resId > 0) statusBarHeight = getResources().getDimensionPixelSize(resId);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.TOP);
        root.setBackgroundColor(COLOR_DEEP_BLUE);
        root.setPadding(scdp(20), scdp(20) + statusBarHeight, scdp(20), scdp(24));

        // ── Header: prayer name CENTRED + logo TOP-RIGHT corner ──────────────
        FrameLayout headerFrame = new FrameLayout(this);
        LinearLayout.LayoutParams headerFrameP = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        headerFrameP.bottomMargin = scdp(hasTimes ? 4 : 12);
        headerFrame.setLayoutParams(headerFrameP);

        // Determine display name and subtitle for special prayers
        String isShuruqLower = prayerName.toLowerCase();
        boolean isShuruq  = isShuruqLower.equals("shuruq");

        // Unicode escape sequences for emoji (keeps source file ASCII-safe):
        // 🌅 = 🌅 sunrise, 🌇 = 🌇 cityscape at dusk
        String displayLabel   = prayerName.toUpperCase();
        String prayerSubtitle = "Prayer Time";
        String decoEmoji      = null;  // no watermark graphic behind the text anymore
        if (isShuruq) {
            // "SHURUQ" on its own line (clears the logo); "Sunrise" + reminder beneath
            displayLabel   = "SHURUQ";
            prayerSubtitle = "Sunrise - Deadline to pray Fajr";
        }
        // Maghrib uses the plain default style (label "MAGHRIB", subtitle
        // "Prayer Time", no sunset watermark) - matches the other prayers.

        // Decorative large emoji — drawn first so it sits behind text
        if (decoEmoji != null) {
            TextView decoView = new TextView(this);
            decoView.setText(decoEmoji);
            decoView.setTextSize(scf(80));
            decoView.setAlpha(0.18f);
            decoView.setGravity(Gravity.CENTER);
            FrameLayout.LayoutParams decoP = new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT);
            decoP.gravity = Gravity.CENTER;
            decoView.setLayoutParams(decoP);
            headerFrame.addView(decoView);
        }

        // Prayer name + subtitle — centred on top of deco emoji
        LinearLayout nameCol = new LinearLayout(this);
        nameCol.setOrientation(LinearLayout.VERTICAL);
        nameCol.setGravity(Gravity.CENTER_HORIZONTAL);
        FrameLayout.LayoutParams nameColP = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT);
        nameColP.gravity = Gravity.CENTER;
        nameCol.setLayoutParams(nameColP);

        TextView prayerLabel = new TextView(this);
        prayerLabel.setText(displayLabel);
        prayerLabel.setTextColor(COLOR_WHITE);
        prayerLabel.setTextSize(scf(isShuruq ? 24 : 32));
        prayerLabel.setTypeface(null, Typeface.BOLD);
        prayerLabel.setLetterSpacing(0.04f);
        prayerLabel.setGravity(Gravity.CENTER);
        nameCol.addView(prayerLabel);

        TextView subLabel = new TextView(this);
        subLabel.setText(prayerSubtitle);
        subLabel.setTextColor(COLOR_GREY_TEXT);
        subLabel.setTextSize(scf(12));
        subLabel.setGravity(Gravity.CENTER);
        nameCol.addView(subLabel);

        headerFrame.addView(nameCol);

        // Logo — top-LEFT corner, 90dp (+50% from previous 60dp)
        int logoResId = getResources().getIdentifier("ic_launcher", "mipmap", getPackageName());
        if (logoResId != 0) {
            ImageView logo = new ImageView(this);
            logo.setImageResource(logoResId);
            logo.setAdjustViewBounds(true);
            FrameLayout.LayoutParams logoP = new FrameLayout.LayoutParams(scdp(90), scdp(90));
            logoP.gravity = Gravity.START | Gravity.TOP;
            logo.setLayoutParams(logoP);
            headerFrame.addView(logo);
        }

        root.addView(headerFrame);

        // ── Begins + Jama'at time columns ────────────────────────────────────
        if (hasTimes) {
            LinearLayout timesRow = new LinearLayout(this);
            timesRow.setOrientation(LinearLayout.HORIZONTAL);
            timesRow.setGravity(Gravity.CENTER);

            if (hasBeginsTime) {
                timesRow.addView(buildTimeCol("BEGINS", beginsTime, !useJamaat));
            }

            if (hasBeginsTime && hasJamaatTime) {
                View div = new View(this);
                div.setBackgroundColor(0x44FFFFFF);
                LinearLayout.LayoutParams divP = new LinearLayout.LayoutParams(dp(1), scdp(40));
                divP.setMargins(scdp(16), 0, scdp(16), 0);
                div.setLayoutParams(divP);
                timesRow.addView(div);
            }

            if (hasJamaatTime) {
                timesRow.addView(buildTimeCol("JAMA'AT", jamaatTime, useJamaat));
            }

            LinearLayout.LayoutParams rowP = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT);
            rowP.gravity = Gravity.CENTER_HORIZONTAL;
            rowP.bottomMargin = scdp(16);
            timesRow.setLayoutParams(rowP);
            root.addView(timesRow);
        }

        // ── Quran Quote — shown directly under prayer times ──────────────────
        if (!quoteText.isEmpty()) {
            View quoteSep = new View(this);
            quoteSep.setBackgroundColor(0x22FFFFFF);
            LinearLayout.LayoutParams quoteSepP = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, dp(1));
            quoteSepP.topMargin    = dp(2);
            quoteSepP.bottomMargin = scdp(8);
            quoteSep.setLayoutParams(quoteSepP);
            root.addView(quoteSep);

            TextView quoteView = new TextView(this);
            quoteView.setText("“" + quoteText + "”");
            quoteView.setTextColor(0xEEFFFFFF);
            quoteView.setTextSize(scf(20));
            quoteView.setTypeface(null, Typeface.ITALIC);
            quoteView.setGravity(Gravity.CENTER);
            quoteView.setLineSpacing(0, 1.25f);
            LinearLayout.LayoutParams quoteP = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT);
            quoteP.bottomMargin = scdp(4);
            quoteView.setLayoutParams(quoteP);
            root.addView(quoteView);

            if (!quoteRef.isEmpty()) {
                TextView refView = new TextView(this);
                refView.setText("— " + quoteRef);
                refView.setTextColor(COLOR_GREY_TEXT);
                refView.setTextSize(scf(17));
                refView.setGravity(Gravity.CENTER);
                refView.setLetterSpacing(0.04f);
                addTo(root, refView, 0, scdp(14));
            }
        }

        // ── Separator line ────────────────────────────────────────────────────
        View sep = new View(this);
        sep.setBackgroundColor(0x33FFFFFF);
        LinearLayout.LayoutParams sepP = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(1));
        sepP.bottomMargin = scdp(16);
        sep.setLayoutParams(sepP);
        root.addView(sep);

        scrollView.addView(root);
        return scrollView;
    }

    private LinearLayout buildBtnRow(String prayerName) {
        isPaused = EeisAlarmService.sIsPaused;
        int btnSize = scdp(72);

        LinearLayout btnRow = new LinearLayout(this);
        btnRow.setOrientation(LinearLayout.HORIZONTAL);
        btnRow.setGravity(Gravity.CENTER);

        // Pause only makes sense when a sound is actually playing. For silent prayers
        // (notification-only / no audio) there is nothing to pause, so omit it.
        if (hasAudio) {
            pauseBtn = buildCircleBtn("", COLOR_BLUE, btnSize);
            updatePauseBtnLabel();
            pauseBtn.setOnClickListener(v -> {
                if (isPaused) {
                    Intent i = new Intent(this, EeisAlarmService.class);
                    i.setAction(EeisAlarmService.ACTION_RESUME);
                    startService(i);
                    isPaused = false;
                } else {
                    Intent i = new Intent(this, EeisAlarmService.class);
                    i.setAction(EeisAlarmService.ACTION_PAUSE);
                    startService(i);
                    isPaused = true;
                    stopScreenFlash();
                }
                updatePauseBtnColor();
                updatePauseBtnLabel();
            });
            btnRow.addView(pauseBtn);

            View btnGap = new View(this);
            btnGap.setLayoutParams(new LinearLayout.LayoutParams(scdp(72), 1));
            btnRow.addView(btnGap);
        }

        // Stop / Close — always present (dismisses the alarm screen)
        Button dismissBtn = buildCircleBtn(hasAudio ? "⏹\nStop" : "✕\nClose", COLOR_MAROON_RED, btnSize);
        dismissBtn.setOnClickListener(v -> dismiss());
        btnRow.addView(dismissBtn);
        return btnRow;
    }

    private LinearLayout buildChipsSection() {
        LinearLayout section = new LinearLayout(this);
        section.setOrientation(LinearLayout.VERTICAL);

        LinearLayout chipsRow = new LinearLayout(this);
        chipsRow.setOrientation(LinearLayout.HORIZONTAL);
        chipsRow.setGravity(Gravity.CENTER_VERTICAL);

        addWeightSpacer(chipsRow, 1f);
        chipsRow.addView(buildDonateChip());
        addWeightSpacer(chipsRow, 1f);
        chipsRow.addView(buildChip("🧾  Gift Aid", "eeis://donate"));
        addWeightSpacer(chipsRow, 1f);
        chipsRow.addView(buildChip("🧭  Qibla", "eeis://qibla"));
        addWeightSpacer(chipsRow, 1f);
        chipsRow.addView(buildChip("🌍  World", "eeis://world"));
        addWeightSpacer(chipsRow, 1f);

        LinearLayout.LayoutParams chipsP = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        chipsP.bottomMargin = scdp(16);
        chipsRow.setLayoutParams(chipsP);
        section.addView(chipsRow);

        TextView footer = new TextView(this);
        footer.setText("EEIS · Established 2001");
        footer.setTextColor(0x88FFFFFF);
        footer.setTextSize(scf(11.5f));
        footer.setLetterSpacing(0.08f);
        footer.setGravity(Gravity.CENTER);
        addTo(section, footer, 0, 0);

        return section;
    }

    /**
     * Build a time column for the BEGINS / JAMA'AT row.
     * @param highlighted  If true, renders the label and time in amber yellow.
     */
    private LinearLayout buildTimeCol(String label, String time, boolean highlighted) {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER);

        int labelColor = highlighted ? COLOR_AMBER : COLOR_GREY_TEXT;
        int timeColor  = highlighted ? COLOR_AMBER : COLOR_WHITE;

        TextView labelView = new TextView(this);
        labelView.setText(label);
        labelView.setTextColor(labelColor);
        labelView.setTextSize(scf(13));
        labelView.setLetterSpacing(0.10f);
        labelView.setGravity(Gravity.CENTER);

        TextView timeView = new TextView(this);
        timeView.setText(time);
        timeView.setTextColor(timeColor);
        timeView.setTextSize(scf(34));
        timeView.setTypeface(null, Typeface.BOLD);
        timeView.setGravity(Gravity.CENTER);
        timeView.setLetterSpacing(-0.02f);

        col.addView(labelView);
        col.addView(timeView);
        return col;
    }

    /** Build a circular button with a GradientDrawable background. */
    private Button buildCircleBtn(String text, int bgColor, int sizeDp) {
        Button btn = new Button(this);
        btn.setText(text);
        btn.setTextColor(COLOR_WHITE);
        btn.setTextSize(scf(13));
        btn.setTypeface(null, Typeface.BOLD);
        btn.setPadding(0, 0, 0, 0);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(bgColor);
        bg.setCornerRadius(sizeDp / 2f);
        btn.setBackground(bg);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(sizeDp, sizeDp);
        btn.setLayoutParams(p);
        return btn;
    }

    /** Donate chip — taps open a dialog: "Online" or "Bank Transfer". */
    private TextView buildDonateChip() {
        TextView chip = new TextView(this);
        chip.setText("♥  Give");
        chip.setTextColor(COLOR_WHITE);
        chip.setTextSize(13 * wsc);              // shrinks on narrow phones
        chip.setSingleLine(true);
        chip.setMaxLines(1);
        chip.setTypeface(null, Typeface.BOLD);
        chip.setPadding((int)(scdp(13) * wsc), scdp(10), (int)(scdp(13) * wsc), scdp(10));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0x33FFFFFF);
        bg.setCornerRadius(scdp(20));
        chip.setBackground(bg);
        chip.setOnClickListener(v -> {
            new AlertDialog.Builder(this)
                    .setTitle("Support EEIS")
                    .setMessage("Choose how you'd like to donate to Epsom & Ewell Islamic Society:")
                    .setPositiveButton("Donate Online", (d, w) -> {
                        try {
                            Intent i = new Intent(Intent.ACTION_VIEW,
                                    Uri.parse("https://eeis.co.uk/donate"));
                            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(i);
                        } catch (Exception ignored) {}
                    })
                    .setNeutralButton("Bank Transfer", (d, w) -> {
                        try {
                            Intent i = new Intent(Intent.ACTION_VIEW,
                                    Uri.parse("eeis://donate"));
                            i.setPackage(getPackageName());
                            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(i);
                        } catch (Exception ignored) {}
                    })
                    .setNegativeButton("Cancel", null)
                    .show();
        });
        return chip;
    }

    private TextView buildChip(String label, String deepLink) {
        TextView chip = new TextView(this);
        chip.setText(label);
        chip.setTextColor(COLOR_WHITE);
        chip.setTextSize(13 * wsc);              // shrinks on narrow phones
        chip.setSingleLine(true);
        chip.setMaxLines(1);
        chip.setTypeface(null, Typeface.BOLD);
        chip.setPadding((int)(scdp(13) * wsc), scdp(10), (int)(scdp(13) * wsc), scdp(10));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0x33FFFFFF);
        bg.setCornerRadius(scdp(20));
        chip.setBackground(bg);
        chip.setOnClickListener(v -> {
            try {
                Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(deepLink));
                i.setPackage(getPackageName());
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch (Exception ignored) {}
        });
        return chip;
    }

    private void updatePauseBtnLabel() {
        if (pauseBtn == null) return;
        pauseBtn.setText(isPaused ? "▶\nResume" : "⏸\nPause");
    }

    private void updatePauseBtnColor() {
        if (pauseBtn == null) return;
        int color = isPaused ? COLOR_GREEN : COLOR_BLUE;
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(color);
        int sizeDp = scdp(72);
        bg.setCornerRadius(sizeDp / 2f);
        pauseBtn.setBackground(bg);
    }

    // ─── Dismiss ──────────────────────────────────────────────────────────────

    private void dismiss() {
        stopScreenFlash();
        Intent stopIntent = new Intent(this, EeisAlarmService.class);
        stopIntent.setAction(EeisAlarmService.ACTION_DISMISS);
        startService(stopIntent);

        // Fire billboard deep link — the React app checks if a campaign is
        // active for this prayer today and shows the slideshow if so.
        try {
            String prayer = getIntent().getStringExtra(EXTRA_PRAYER_NAME);
            if (prayer == null) prayer = "unknown";
            Intent billboardIntent = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("eeis://billboard?prayer=" + prayer.toLowerCase()));
            billboardIntent.setPackage(getPackageName());
            billboardIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(billboardIntent);
        } catch (Exception ignored) {}

        finish();
    }

    @Override
    public void onBackPressed() { dismiss(); }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /** Add a zero-size weight-based spacer to a horizontal LinearLayout for equal distribution. */
    private void addWeightSpacer(LinearLayout parent, float weight) {
        View sp = new View(this);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, 1, weight);
        sp.setLayoutParams(p);
        parent.addView(sp);
    }

    private void addTo(LinearLayout parent, View child, int topMargin, int bottomMargin) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        p.gravity      = Gravity.CENTER_HORIZONTAL;
        p.topMargin    = topMargin;
        p.bottomMargin = bottomMargin;
        child.setLayoutParams(p);
        parent.addView(child);
    }

    /** dp(n) — raw density-independent pixels, not scaled by sc. */
    private int dp(int dp) {
        return Math.round(dp * getResources().getDisplayMetrics().density);
    }

    /** scdp(n) — dp scaled by screen-height factor sc. */
    private int scdp(int base) {
        return Math.round(base * sc * getResources().getDisplayMetrics().density);
    }

    /** scf(n) — sp float scaled by screen-height factor sc (used for setTextSize). */
    private float scf(float base) {
        return base * sc;
    }

    private static String nvl(String s, String def) {
        return s != null ? s : def;
    }
}
