const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

/**
 * Manifest + iOS meta — home-screen shortcut shows the app name
 *
 * When a user installs the PWA on Android (Chrome reads `manifest.json`) or
 * iOS (Safari reads `apple-mobile-web-app-title` / `<title>`), the shortcut
 * label must read "BitEric Finance" — not the URL path or some generic
 * fallback. This spec locks every place the name lives.
 */

const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8')
);
const HTML = fs.readFileSync(path.join(__dirname, '..', 'cnt.html'), 'utf8');

test.describe('PWA app name — Android (manifest.json)', () => {
  test('manifest.name is "BitEric Finance"', () => {
    expect(MANIFEST.name).toBe('BitEric Finance');
  });

  test('manifest.short_name is "BitEric Finance"', () => {
    // Some Android launchers/widgets use short_name; both must match the brand.
    expect(MANIFEST.short_name).toBe('BitEric Finance');
  });

  test('manifest has start_url, scope, icons (sanity)', () => {
    expect(MANIFEST.start_url).toBe('./cnt.html');
    expect(MANIFEST.scope).toBe('./');
    expect(Array.isArray(MANIFEST.icons)).toBe(true);
    expect(MANIFEST.icons.length).toBeGreaterThanOrEqual(2);
  });
});

test.describe('PWA app name — iOS (apple meta tags + <title>)', () => {
  test('<title> is "BitEric Finance"', () => {
    const m = /<title>([^<]+)<\/title>/i.exec(HTML);
    expect(m && m[1].trim()).toBe('BitEric Finance');
  });

  test('apple-mobile-web-app-title is "BitEric Finance"', () => {
    // iOS Safari uses this for the Add-to-Home-Screen label.
    const m = /<meta\s+name=["']apple-mobile-web-app-title["']\s+content=["']([^"']+)["']/i.exec(HTML);
    expect(m && m[1]).toBe('BitEric Finance');
  });

  test('apple-touch-icon link is wired', () => {
    expect(/<link\s+rel=["']apple-touch-icon["']/i.test(HTML)).toBe(true);
  });
});

test.describe('Service worker bumps cache when manifest changes', () => {
  test('sw.js CACHE_NAME is at least v6 (manifest + apple meta updated)', () => {
    const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    const m = /CACHE_NAME\s*=\s*['"]cnt-core-v(\d+)['"]/.exec(sw);
    expect(m).toBeTruthy();
    const version = parseInt(m[1], 10);
    expect(version).toBeGreaterThanOrEqual(6);
  });
});
