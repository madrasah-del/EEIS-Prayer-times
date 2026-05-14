/**
 * withPrayerAlarmService.js — Expo Config Plugin
 *
 * Adds the native Android alarm service to the Expo managed workflow.
 * On every `eas build` / `expo prebuild` this plugin:
 *
 *   1. Copies 5 Java files into the Android project source tree
 *   2. Adds required permissions to AndroidManifest.xml
 *   3. Registers EeisAlarmReceiver, EeisAlarmService, EeisAlarmActivity in the manifest
 *   4. Registers EeisAlarmPackage in MainApplication.java (or .kt)
 *
 * Result: NativeModules.EeisAlarm is available in JS on Android, backed by
 * AlarmManager.setExactAndAllowWhileIdle → EeisAlarmReceiver → EeisAlarmService
 * (MediaPlayer with USAGE_ALARM, bypasses DND) + EeisAlarmActivity (lock screen UI).
 */

const { withAndroidManifest, withMainApplication, withDangerousMod, withAppBuildGradle } = require('@expo/config-plugins');
const path = require('path');
const fs   = require('fs');

// ─── Step 1: Copy Java source files ───────────────────────────────────────────

function withCopyJavaFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const srcDir  = path.join(__dirname, 'android');
      const destDir = path.join(
        config.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'java', 'com', 'eeis', 'prayertimes'
      );

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const javaFiles = [
        'EeisAlarmReceiver.java',
        'EeisAlarmService.java',
        'EeisAlarmActivity.java',
        'EeisAlarmModule.java',
        'EeisAlarmPackage.java',
      ];

      for (const file of javaFiles) {
        const src  = path.join(srcDir, file);
        const dest = path.join(destDir, file);
        if (!fs.existsSync(src)) {
          throw new Error(`[withPrayerAlarmService] Missing source file: ${src}`);
        }
        fs.copyFileSync(src, dest);
        console.log(`[withPrayerAlarmService] Copied ${file} → android/.../${file}`);
      }

      return config;
    },
  ]);
}

// ─── Step 2: Permissions + Manifest components ────────────────────────────────

function withAlarmManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app      = manifest.manifest.application[0];

    // ── Permissions ──────────────────────────────────────────────────────────
    if (!manifest.manifest['uses-permission']) {
      manifest.manifest['uses-permission'] = [];
    }
    const perms = manifest.manifest['uses-permission'];

    const requiredPermissions = [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      'android.permission.USE_FULL_SCREEN_INTENT',
      'android.permission.DISABLE_KEYGUARD',
      // ACCESS_NOTIFICATION_POLICY already in app.json but added here for safety
      'android.permission.ACCESS_NOTIFICATION_POLICY',
    ];

    for (const perm of requiredPermissions) {
      const already = perms.some(p => p.$['android:name'] === perm);
      if (!already) {
        perms.push({ $: { 'android:name': perm } });
        console.log(`[withPrayerAlarmService] Added permission: ${perm}`);
      }
    }

    // ── BroadcastReceiver ─────────────────────────────────────────────────────
    if (!app.receiver) app.receiver = [];
    const receiverExists = app.receiver.some(
      r => r.$['android:name'] === '.EeisAlarmReceiver'
        || r.$['android:name'] === 'com.eeis.prayertimes.EeisAlarmReceiver'
    );
    if (!receiverExists) {
      app.receiver.push({
        $: {
          'android:name': '.EeisAlarmReceiver',
          'android:exported': 'false',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'com.eeis.prayertimes.PRAYER_ALARM' } },
            ],
          },
        ],
      });
      console.log('[withPrayerAlarmService] Registered EeisAlarmReceiver');
    }

    // ── ForegroundService ─────────────────────────────────────────────────────
    if (!app.service) app.service = [];
    const serviceExists = app.service.some(
      s => s.$['android:name'] === '.EeisAlarmService'
        || s.$['android:name'] === 'com.eeis.prayertimes.EeisAlarmService'
    );
    if (!serviceExists) {
      app.service.push({
        $: {
          'android:name': '.EeisAlarmService',
          'android:exported': 'false',
          // foregroundServiceType="mediaPlayback" lets us call startForeground()
          // with FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK — required on Android 14+
          // and correct for audio playback on all versions that support the flag.
          'android:foregroundServiceType': 'mediaPlayback',
        },
      });
      console.log('[withPrayerAlarmService] Registered EeisAlarmService');
    }

    // ── Lock Screen Activity ──────────────────────────────────────────────────
    if (!app.activity) app.activity = [];
    const activityExists = app.activity.some(
      a => a.$['android:name'] === '.EeisAlarmActivity'
        || a.$['android:name'] === 'com.eeis.prayertimes.EeisAlarmActivity'
    );
    if (!activityExists) {
      app.activity.push({
        $: {
          'android:name': '.EeisAlarmActivity',
          'android:exported': 'false',
          // showOnLockScreen is the manifest-level lock screen hint (API < 27 devices)
          'android:showOnLockScreen': 'true',
          // Empty taskAffinity + excludeFromRecents keeps the alarm screen out of
          // the app switcher — it's a transient overlay, not a full app screen.
          'android:taskAffinity': '',
          'android:excludeFromRecents': 'true',
          // No action bar — we build UI programmatically
          'android:theme': '@style/Theme.AppCompat.NoActionBar',
        },
      });
      console.log('[withPrayerAlarmService] Registered EeisAlarmActivity');
    }

    return config;
  });
}

// ─── Step 3: Register EeisAlarmPackage in MainApplication ────────────────────

function withAlarmPackage(config) {
  return withMainApplication(config, (config) => {
    const { contents, language } = config.modResults;

    // Guard — don't add twice
    if (contents.includes('EeisAlarmPackage')) {
      return config;
    }

    let updated = contents;

    if (language === 'kt') {
      // ── Kotlin MainApplication ──────────────────────────────────────────
      // Add import after the last existing import block
      updated = updated.replace(
        /(import expo\.modules\.ReactNativeHostWrapper)/,
        `$1\nimport com.eeis.prayertimes.EeisAlarmPackage`
      );
      // Add package inside the apply { } block of getPackages()
      updated = updated.replace(
        /(PackageList\(this\)\.packages\.apply\s*\{)/,
        `$1\n          add(EeisAlarmPackage())`
      );
    } else {
      // ── Java MainApplication ────────────────────────────────────────────
      updated = updated.replace(
        /(import com\.facebook\.react\.ReactApplication;)/,
        `$1\nimport com.eeis.prayertimes.EeisAlarmPackage;`
      );
      updated = updated.replace(
        /(List<ReactPackage> packages = new PackageList\(this\)\.getPackages\(\);)/,
        `$1\n          packages.add(new EeisAlarmPackage());`
      );
    }

    if (updated === contents) {
      console.warn(
        '[withPrayerAlarmService] WARNING: Could not inject EeisAlarmPackage into MainApplication.' +
        ' The regex patterns did not match. Add it manually:\n' +
        '  Kotlin: add(EeisAlarmPackage()) inside getPackages apply {}\n' +
        '  Java:   packages.add(new EeisAlarmPackage()); inside getPackages()'
      );
    } else {
      console.log(`[withPrayerAlarmService] Registered EeisAlarmPackage in MainApplication.${language}`);
    }

    config.modResults.contents = updated;
    return config;
  });
}

// ─── Step 4: Add androidx.media:media Gradle dependency ──────────────────────
// MediaSessionCompat and NotificationCompat.MediaStyle live in this library.
// It is not included in the default Expo SDK so we inject it into app/build.gradle.

function withMediaGradleDep(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.contents.includes('androidx.media:media')) {
      return config; // already present
    }
    // Insert after the opening 'dependencies {' line
    config.modResults.contents = config.modResults.contents.replace(
      /(\bdependencies\s*\{)/,
      '$1\n    implementation "androidx.media:media:1.7.0"'
    );
    console.log('[withPrayerAlarmService] Added androidx.media:media:1.7.0 dependency');
    return config;
  });
}

// ─── Compose all steps ────────────────────────────────────────────────────────

module.exports = function withPrayerAlarmService(config) {
  config = withCopyJavaFiles(config);
  config = withAlarmManifest(config);
  config = withAlarmPackage(config);
  config = withMediaGradleDep(config);
  return config;
};
