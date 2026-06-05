// Dynamic Expo config.
//
// Builds two variants from one codebase:
//   • LIVE (default)      → package com.eeis.prayertimes,      reads billboard-config.json
//   • TEST (APP_VARIANT=dev) → package com.eeis.prayertimes.dev, reads billboard-config-test.json
//
// The TEST variant has a different package id, so Android installs it SIDE-BY-SIDE with the
// live Play Store app (it never overwrites or affects it). It is wired to the TEST content
// channel, so any campaigns/messages/media you experiment with in the test app are written to
// a separate file and are invisible to live users. Build the test APK with the
// "Build TEST (Dev) APK" GitHub Action (it sets APP_VARIANT=dev).
//
// This reads the static app.json (passed in as `config`) and only OVERRIDES what differs for
// the dev variant, so app.json stays the single source of truth for everything else.

module.exports = ({ config }) => {
  const isDev = process.env.APP_VARIANT === 'dev';

  config.extra = { ...(config.extra || {}), channel: isDev ? 'test' : 'live' };

  if (isDev) {
    config.name = 'EEIS Test';
    config.android = { ...(config.android || {}), package: 'com.eeis.prayertimes.dev' };
    config.ios = { ...(config.ios || {}), bundleIdentifier: 'com.eeis.prayertimes.dev' };
  }

  return config;
};
