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
 * v16: EEIS logo, flash-then-reveal, action chips, alarmMode-gated flash.
 * v18: Per-prayer splash boolean replaces alarmMode string. Logo enlarged to 114dp.
 *      StatusBar height cleared at top. Shorter chip labels. Donate chip → AlertDialog.
 *      Bottom margin after Stop button increased to 32dp.
 *
 * Flash-then-reveal: white overlay sits on top of content in a FrameLayout.
 *   Content starts INVISIBLE. After 3 white/dark pulses, overlay goes GONE and content VISIBLE.
 */
public class EeisAlarmActivity extends Activity {

    public static final String EXTRA_PRAYER_NAME = "prayerName";
    public static final String EXTRA_BODY        = "body";
    public static final String EXTRA_ALARM_ID    = "alarmId";
    public static final String EXTRA_SPLASH      = "splash";      // v18
    public static final String EXTRA_QUOTE_TEXT  = "quoteText";   // v18
    public static final String EXTRA_QUOTE_REF   = "quoteRef";    // v18
    public static final String EXTRA_VIDEO_URL   = "videoUrl";    // v22

    // EEIS brand colours
    private static final int COLOR_DEEP_BLUE  = 0xFF063968;
    private static final int COLOR_BLUE       = 0xFF0B5EA8;
    private static final int COLOR_MAROON_RED = 0xFFB71C2E;
    private static final int COLOR_GREEN      = 0xFF2E7D32;
    private static final int COLOR_WHITE      = 0xFFFFFFFF;
    private static final int COLOR_GREY_TEXT  = 0xFFBBCCDD;

    // Flash: 3 white pulses (each pulse = overlay visible → invisible)
    private static final int FLASH_PULSES      = 3;
    private static final int FLASH_INTERVAL_MS = 350;

    private Handler  flashHandler;
    private View     flashOverlayView;
    private View     contentScrollView;
    private int      flashCount = 0;
    private boolean  isPaused    = false;
    private boolean  shouldSplash = false;
    private String   quoteText  = "";
    private String   quoteRef   = "";
    private String   videoUrl   = "";
    private Button   pauseBtn;

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

        String prayerName = getIntent().getStringExtra(EXTRA_PRAYER_NAME);
        String body       = getIntent().getStringExtra(EXTRA_BODY);
        shouldSplash      = getIntent().getBooleanExtra(EXTRA_SPLASH, false);
        quoteText         = nvl(getIntent().getStringExtra(EXTRA_QUOTE_TEXT), "");
        quoteRef          = nvl(getIntent().getStringExtra(EXTRA_QUOTE_REF),  "");
        videoUrl          = nvl(getIntent().getStringExtra(EXTRA_VIDEO_URL),   "");
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
        videoUrl          = nvl(intent.getStringExtra(EXTRA_VIDEO_URL),   "");
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

    /**
     * Overlay starts VISIBLE (white). Each tick toggles it.
     * Odd counts → INVISIBLE (dark gap); even counts → VISIBLE (white flash).
     * After FLASH_PULSES×2 ticks: overlay GONE, content VISIBLE.
     */
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
        String beginsTime = "";
        String jamaatTime = "";
        if (body.contains("Begins") && body.contains("Jama")) {
            String[] parts = body.split("·");
            if (parts.length >= 2) {
                beginsTime = parts[0].replace("Begins", "").trim();
                jamaatTime = parts[1].replace("Jama'at", "").replace("Jamaat", "").trim();
            }
        }
        final boolean hasTimes = !beginsTime.isEmpty() && !jamaatTime.isEmpty();

        ScrollView scrollView = new ScrollView(this);
        scrollView.setBackgroundColor(COLOR_DEEP_BLUE);
        scrollView.setFillViewport(true);

        // StatusBar height — ensure logo clears the system status bar
        int statusBarHeight = 0;
        int resId = getResources().getIdentifier("status_bar_height", "dimen", "android");
        if (resId > 0) statusBarHeight = getResources().getDimensionPixelSize(resId);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_VERTICAL);
        root.setBackgroundColor(COLOR_DEEP_BLUE);
        root.setPadding(dp(24), dp(36) + statusBarHeight, dp(24), dp(36));

        // ── EEIS logo — 114dp (50% larger than v17's 76dp) ───────────────────
        int logoResId = getResources().getIdentifier("ic_launcher", "mipmap", getPackageName());
        if (logoResId != 0) {
            ImageView logo = new ImageView(this);
            logo.setImageResource(logoResId);
            logo.setAdjustViewBounds(true);
            LinearLayout.LayoutParams logoP = new LinearLayout.LayoutParams(dp(114), dp(114));
            logoP.gravity = Gravity.CENTER_HORIZONTAL;
            logoP.bottomMargin = dp(6);
            logo.setLayoutParams(logoP);
            root.addView(logo);
        }

        // ── Organisation label ───────────────────────────────────────────────
        TextView orgLabel = new TextView(this);
        orgLabel.setText("Epsom & Ewell Islamic Society");
        orgLabel.setTextColor(COLOR_GREY_TEXT);
        orgLabel.setTextSize(11);
        orgLabel.setLetterSpacing(0.06f);
        orgLabel.setGravity(Gravity.CENTER);
        addTo(root, orgLabel, 0, dp(20));

        // ── Prayer name ──────────────────────────────────────────────────────
        TextView prayerLabel = new TextView(this);
        prayerLabel.setText(prayerName.toUpperCase());
        prayerLabel.setTextColor(COLOR_WHITE);
        prayerLabel.setTextSize(52);
        prayerLabel.setTypeface(null, Typeface.BOLD);
        prayerLabel.setGravity(Gravity.CENTER);
        prayerLabel.setLetterSpacing(0.08f);
        addTo(root, prayerLabel, 0, dp(2));

        // ── "Prayer Time" sub-label ──────────────────────────────────────────
        TextView subLabel = new TextView(this);
        subLabel.setText("Prayer Time");
        subLabel.setTextColor(COLOR_GREY_TEXT);
        subLabel.setTextSize(14);
        subLabel.setGravity(Gravity.CENTER);
        addTo(root, subLabel, 0, hasTimes ? dp(16) : dp(28));

        // ── Begins + Jama'at time columns ────────────────────────────────────
        if (hasTimes) {
            LinearLayout timesRow = new LinearLayout(this);
            timesRow.setOrientation(LinearLayout.HORIZONTAL);
            timesRow.setGravity(Gravity.CENTER);

            timesRow.addView(buildTimeCol("BEGINS", beginsTime));

            View div = new View(this);
            div.setBackgroundColor(0x44FFFFFF);
            LinearLayout.LayoutParams divP = new LinearLayout.LayoutParams(dp(1), dp(48));
            divP.setMargins(dp(16), 0, dp(16), 0);
            div.setLayoutParams(divP);
            timesRow.addView(div);

            timesRow.addView(buildTimeCol("JAMA'AT", jamaatTime));

            LinearLayout.LayoutParams rowP = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT);
            rowP.gravity = Gravity.CENTER_HORIZONTAL;
            rowP.bottomMargin = dp(24);
            timesRow.setLayoutParams(rowP);
            root.addView(timesRow);
        }

        // ── Separator line ───────────────────────────────────────────────────
        View sep = new View(this);
        sep.setBackgroundColor(0x33FFFFFF);
        LinearLayout.LayoutParams sepP = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(1));
        sepP.bottomMargin = dp(18);
        sep.setLayoutParams(sepP);
        root.addView(sep);

        // ── PAUSE button ─────────────────────────────────────────────────────
        pauseBtn = new Button(this);
        isPaused = EeisAlarmService.sIsPaused;
        updatePauseBtn();
        pauseBtn.setTextColor(COLOR_WHITE);
        pauseBtn.setTextSize(18);
        pauseBtn.setTypeface(null, Typeface.BOLD);
        LinearLayout.LayoutParams pauseP = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(64));
        pauseP.bottomMargin = dp(10);
        pauseBtn.setLayoutParams(pauseP);
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
            updatePauseBtn();
        });
        root.addView(pauseBtn);

        // ── OPEN VIDEO button (shown only when a video URL is present) ────────
        if (!videoUrl.isEmpty()) {
            Button videoBtn = new Button(this);
            videoBtn.setText("▶  Open Video");
            videoBtn.setTextColor(COLOR_WHITE);
            videoBtn.setTextSize(16f);
            videoBtn.setTypeface(videoBtn.getTypeface(), android.graphics.Typeface.BOLD);
            GradientDrawable videoBg = new GradientDrawable();
            videoBg.setColor(COLOR_BLUE);
            videoBg.setCornerRadius(dp(16));
            videoBtn.setBackground(videoBg);
            LinearLayout.LayoutParams videoLP = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT);
            videoLP.topMargin = dp(12);
            videoBtn.setLayoutParams(videoLP);
            videoBtn.setOnClickListener(v -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(videoUrl));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception ignored) {}
            });
            root.addView(videoBtn);
        }

        // ── STOP button ──────────────────────────────────────────────────────
        Button dismissBtn = new Button(this);
        dismissBtn.setText("⏹  Stop & Dismiss");
        dismissBtn.setTextColor(COLOR_WHITE);
        dismissBtn.setTextSize(18);
        dismissBtn.setTypeface(null, Typeface.BOLD);
        dismissBtn.setBackgroundColor(COLOR_MAROON_RED);
        LinearLayout.LayoutParams dismissP = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(64));
        dismissP.bottomMargin = dp(32); // was 20 — increased for breathing room before chips
        dismissBtn.setLayoutParams(dismissP);
        dismissBtn.setOnClickListener(v -> dismiss());
        root.addView(dismissBtn);

        // ── Action chips (Donate · Gift Aid · Qibla) ─────────────────────────
        // Shorter labels to prevent wrapping on small screens
        LinearLayout chipsRow = new LinearLayout(this);
        chipsRow.setOrientation(LinearLayout.HORIZONTAL);
        chipsRow.setGravity(Gravity.CENTER);

        chipsRow.addView(buildDonateChip());

        View sp1 = new View(this);
        sp1.setLayoutParams(new LinearLayout.LayoutParams(dp(8), 1));
        chipsRow.addView(sp1);

        chipsRow.addView(buildChip("🧾  Gift Aid", "eeis://donate"));

        View sp2 = new View(this);
        sp2.setLayoutParams(new LinearLayout.LayoutParams(dp(8), 1));
        chipsRow.addView(sp2);

        chipsRow.addView(buildChip("🧭  Qibla", "eeis://qibla"));

        LinearLayout.LayoutParams chipsP = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        chipsP.gravity = Gravity.CENTER_HORIZONTAL;
        chipsP.bottomMargin = dp(20);
        chipsRow.setLayoutParams(chipsP);
        root.addView(chipsRow);

        // ── Quran Quote card (shown if quoteText is non-empty) ───────────────
        if (!quoteText.isEmpty()) {
            View quoteSep = new View(this);
            quoteSep.setBackgroundColor(0x22FFFFFF);
            LinearLayout.LayoutParams quoteSepP = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, dp(1));
            quoteSepP.topMargin    = dp(4);
            quoteSepP.bottomMargin = dp(14);
            quoteSep.setLayoutParams(quoteSepP);
            root.addView(quoteSep);

            TextView quoteView = new TextView(this);
            quoteView.setText("“" + quoteText + "”");
            quoteView.setTextColor(0xEEFFFFFF);
            quoteView.setTextSize(14);
            quoteView.setTypeface(null, Typeface.ITALIC);
            quoteView.setGravity(Gravity.CENTER);
            quoteView.setLineSpacing(0, 1.3f);
            LinearLayout.LayoutParams quoteP = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT);
            quoteP.bottomMargin = dp(6);
            quoteView.setLayoutParams(quoteP);
            root.addView(quoteView);

            if (!quoteRef.isEmpty()) {
                TextView refView = new TextView(this);
                refView.setText("\u2014 " + quoteRef);
                refView.setTextColor(COLOR_GREY_TEXT);
                refView.setTextSize(11);
                refView.setGravity(Gravity.CENTER);
                refView.setLetterSpacing(0.04f);
                addTo(root, refView, 0, dp(14));
            }
        }

        // ── Footer ───────────────────────────────────────────────────────────
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

    private LinearLayout buildTimeCol(String label, String time) {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER);

        TextView labelView = new TextView(this);
        labelView.setText(label);
        labelView.setTextColor(COLOR_GREY_TEXT);
        labelView.setTextSize(10);
        labelView.setLetterSpacing(0.12f);
        labelView.setGravity(Gravity.CENTER);

        TextView timeView = new TextView(this);
        timeView.setText(time);
        timeView.setTextColor(COLOR_WHITE);
        timeView.setTextSize(34);
        timeView.setTypeface(null, Typeface.BOLD);
        timeView.setGravity(Gravity.CENTER);
        timeView.setLetterSpacing(-0.02f);

        col.addView(labelView);
        col.addView(timeView);
        return col;
    }

    /** Donate chip — taps open a dialog: "Online" or "Gift Aid / Bank Transfer". */
    private TextView buildDonateChip() {
        TextView chip = new TextView(this);
        chip.setText("♥  Give");
        chip.setTextColor(COLOR_WHITE);
        chip.setTextSize(12);
        chip.setTypeface(null, Typeface.BOLD);
        chip.setPadding(dp(12), dp(10), dp(12), dp(10));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0x33FFFFFF);
        bg.setCornerRadius(dp(20));
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
        chip.setPadding(dp(12), dp(10), dp(12), dp(10));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0x33FFFFFF);
        bg.setCornerRadius(dp(20));
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

    private void updatePauseBtn() {
        if (pauseBtn == null) return;
        if (isPaused) {
            pauseBtn.setText("▶  Resume Adhan");
            pauseBtn.setBackgroundColor(COLOR_GREEN);
        } else {
            pauseBtn.setText("⏸  Pause");
            pauseBtn.setBackgroundColor(COLOR_BLUE);
        }
    }

    // ─── Dismiss ──────────────────────────────────────────────────────────────

    private void dismiss() {
        stopScreenFlash();
        Intent stopIntent = new Intent(this, EeisAlarmService.class);
        stopIntent.setAction(EeisAlarmService.ACTION_DISMISS);
        startService(stopIntent);
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

    private int dp(int dp) {
        return Math.round(dp * getResources().getDisplayMetrics().density);
    }

    private static String nvl(String s, String def) {
        return s != null ? s : def;
    }
}
