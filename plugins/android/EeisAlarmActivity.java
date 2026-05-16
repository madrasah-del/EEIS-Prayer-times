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
    private Button   pauseBtn;

    // Screen scale: 0.75–1.0 based on screen height, so content fits on small phones
    private float sc = 1.0f;

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

        String prayerName = getIntent().getStringExtra(EXTRA_PRAYER_NAME);
        String body       = getIntent().getStringExtra(EXTRA_BODY);
        shouldSplash      = getIntent().getBooleanExtra(EXTRA_SPLASH, false);
        quoteText         = nvl(getIntent().getStringExtra(EXTRA_QUOTE_TEXT), "");
        quoteRef          = nvl(getIntent().getStringExtra(EXTRA_QUOTE_REF),  "");
        beginsTime        = nvl(getIntent().getStringExtra(EXTRA_BEGINS_TIME), "");
        jamaatTime        = nvl(getIntent().getStringExtra(EXTRA_JAMAAT_TIME), "");
        useJamaat         = getIntent().getBooleanExtra(EXTRA_USE_JAMAAT, false);
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
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(COLOR_DEEP_BLUE);

        ScrollView scroll = buildContentScroll(prayerName, body);
        scroll.setVisibility(View.INVISIBLE);
        frame.addView(scroll, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        View overlay = new View(this);
        overlay.setBackgroundColor(COLOR_WHITE);
        frame.addView(overlay, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        contentScrollView = scroll;
        flashOverlayView  = overlay;

        setContentView(frame);

        if (shouldSplash) {
            startScreenFlash();
        } else {
            overlay.setVisibility(View.GONE);
            scroll.setVisibility(View.VISIBLE);
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

    private ScrollView buildContentScroll(final String prayerName, final String body) {
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
        root.setGravity(Gravity.CENTER_VERTICAL);
        root.setBackgroundColor(COLOR_DEEP_BLUE);
        root.setPadding(scdp(20), scdp(20) + statusBarHeight, scdp(20), scdp(24));

        // ── Header: prayer name CENTRED + logo TOP-RIGHT corner ──────────────
        FrameLayout headerFrame = new FrameLayout(this);
        LinearLayout.LayoutParams headerFrameP = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        headerFrameP.bottomMargin = scdp(hasTimes ? 10 : 18);
        headerFrame.setLayoutParams(headerFrameP);

        // Prayer name + "Prayer Time" sub-label — centred
        LinearLayout nameCol = new LinearLayout(this);
        nameCol.setOrientation(LinearLayout.VERTICAL);
        nameCol.setGravity(Gravity.CENTER_HORIZONTAL);
        FrameLayout.LayoutParams nameColP = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT);
        nameColP.gravity = Gravity.CENTER;
        nameCol.setLayoutParams(nameColP);

        TextView prayerLabel = new TextView(this);
        prayerLabel.setText(prayerName.toUpperCase());
        prayerLabel.setTextColor(COLOR_WHITE);
        prayerLabel.setTextSize(scf(32));
        prayerLabel.setTypeface(null, Typeface.BOLD);
        prayerLabel.setLetterSpacing(0.06f);
        prayerLabel.setGravity(Gravity.CENTER);
        nameCol.addView(prayerLabel);

        TextView subLabel = new TextView(this);
        subLabel.setText("Prayer Time");
        subLabel.setTextColor(COLOR_GREY_TEXT);
        subLabel.setTextSize(scf(12));
        subLabel.setGravity(Gravity.CENTER);
        nameCol.addView(subLabel);

        headerFrame.addView(nameCol);

        // Logo — top-right corner
        int logoResId = getResources().getIdentifier("ic_launcher", "mipmap", getPackageName());
        if (logoResId != 0) {
            ImageView logo = new ImageView(this);
            logo.setImageResource(logoResId);
            logo.setAdjustViewBounds(true);
            FrameLayout.LayoutParams logoP = new FrameLayout.LayoutParams(scdp(52), scdp(52));
            logoP.gravity = Gravity.END | Gravity.TOP;
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

        // ── PAUSE + STOP buttons — circular, side-by-side ─────────────────────
        isPaused = EeisAlarmService.sIsPaused;
        final String prayerNameFinal = prayerName; // capture for lambda
        int btnSize = scdp(72);

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

        Button dismissBtn = buildCircleBtn("⏹\nStop", COLOR_MAROON_RED, btnSize);
        dismissBtn.setOnClickListener(v -> dismiss());

        LinearLayout btnRow = new LinearLayout(this);
        btnRow.setOrientation(LinearLayout.HORIZONTAL);
        btnRow.setGravity(Gravity.CENTER);

        btnRow.addView(pauseBtn);

        View btnGap = new View(this);
        btnGap.setLayoutParams(new LinearLayout.LayoutParams(scdp(36), 1));
        btnRow.addView(btnGap);

        btnRow.addView(dismissBtn);

        LinearLayout.LayoutParams btnRowP = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        btnRowP.gravity = Gravity.CENTER_HORIZONTAL;
        btnRowP.bottomMargin = scdp(28);
        btnRow.setLayoutParams(btnRowP);
        root.addView(btnRow);

        // ── Action chips (Give · Gift Aid · Qibla) ───────────────────────────
        LinearLayout chipsRow = new LinearLayout(this);
        chipsRow.setOrientation(LinearLayout.HORIZONTAL);
        chipsRow.setGravity(Gravity.CENTER);

        chipsRow.addView(buildDonateChip());

        View sp1 = new View(this);
        sp1.setLayoutParams(new LinearLayout.LayoutParams(scdp(8), 1));
        chipsRow.addView(sp1);

        chipsRow.addView(buildChip("🧾  Gift Aid", "eeis://donate"));

        View sp2 = new View(this);
        sp2.setLayoutParams(new LinearLayout.LayoutParams(scdp(8), 1));
        chipsRow.addView(sp2);

        chipsRow.addView(buildChip("🧭  Qibla", "eeis://qibla"));

        LinearLayout.LayoutParams chipsP = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        chipsP.gravity = Gravity.CENTER_HORIZONTAL;
        chipsP.bottomMargin = scdp(18);
        chipsRow.setLayoutParams(chipsP);
        root.addView(chipsRow);

        // ── Footer ────────────────────────────────────────────────────────────
        TextView footer = new TextView(this);
        footer.setText("EEIS · Established 2001");
        footer.setTextColor(0x55FFFFFF);
        footer.setTextSize(10);
        footer.setLetterSpacing(0.08f);
        footer.setGravity(Gravity.CENTER);
        addTo(root, footer, 0, 0);

        scrollView.addView(root);
        return scrollView;
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
        chip.setTextSize(12);
        chip.setTypeface(null, Typeface.BOLD);
        chip.setPadding(scdp(12), scdp(10), scdp(12), scdp(10));
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
        chip.setTextSize(12);
        chip.setTypeface(null, Typeface.BOLD);
        chip.setPadding(scdp(12), scdp(10), scdp(12), scdp(10));
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
