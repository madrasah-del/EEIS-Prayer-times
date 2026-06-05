/**
 * Build channel (v64) — distinguishes the LIVE app from the TEST/dev app.
 *
 * The dev build (app.config.js with APP_VARIANT=dev) sets extra.channel = 'test' and a
 * different package id, so it installs alongside the live app. Here we read that marker and
 * expose the billboard-config FILENAME so the admin reads/writes a SEPARATE file in test
 * mode — content experiments never touch the live config that production users read.
 *
 * Falls back to 'live' whenever the marker is absent (older builds, web, etc.).
 */
import Constants from 'expo-constants';

const rawChannel =
  (Constants.expoConfig?.extra as { channel?: string } | undefined)?.channel;

export const CHANNEL: 'live' | 'test' = rawChannel === 'test' ? 'test' : 'live';
export const IS_TEST = CHANNEL === 'test';

/** Billboard config file for this channel (live → billboard-config.json). */
export const BILLBOARD_CONFIG_FILE =
  IS_TEST ? 'billboard-config-test.json' : 'billboard-config.json';

/** Remote prayer-times file for this channel (live → prayer-times.json). */
export const PRAYER_TIMES_FILE =
  IS_TEST ? 'prayer-times-test.json' : 'prayer-times.json';
