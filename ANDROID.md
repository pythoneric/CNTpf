# Android APK (Capacitor)

The Android app is `cnt.html` packaged with Capacitor. There is no separate codebase. Native-only behavior in `cnt.html` is guarded by `IS_NATIVE`, so the web/PWA build is unchanged.

## Requirements
- Node + `npm install`
- Android SDK (Android Studio). Gradle needs `JAVA_HOME` set to a JDK 21, e.g. Android Studio's bundled `jbr`.

## Build
```sh
npm run android:sync     # cnt.html → www/ (local Chart.js + fonts) → android/
npm run android:open     # optional: open in Android Studio
cd android && gradlew.bat assembleDebug     # android/app/build/outputs/apk/debug/app-debug.apk
```

## Signed release APK (sideload)
1. Create a keystore once and keep it **outside git**, backed up. Losing it means you can no longer ship updates over an installed app.
   ```sh
   keytool -genkeypair -v -keystore biteric-release.jks -alias biteric -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Create `android/keystore.properties` (git-ignored):
   ```properties
   storeFile=../biteric-release.jks
   storePassword=...
   keyAlias=biteric
   keyPassword=...
   ```
3. `npm run android:apk` → `android/app/build/outputs/apk/release/app-release.apk`

`versionName` / `versionCode` come from `package.json` `version`. Bump it for every release.

## What differs from the web build
| Feature | APK behavior |
|---|---|
| Backup export | Saved to `Documents/BitEric/` (survives uninstall), then the share sheet opens |
| Exportar PDF | Native print dialog → Save as PDF (`PrintPlugin.java`) |
| Back button | Closes menu/modal → returns to Resumen → minimizes the app |
| Autosave | Also flushed on app pause |
| Service worker / install banner | Disabled |
| Chart.js + fonts | Bundled locally; the app works fully offline |

Tests for the native paths: `tests/android-native.spec.js` (uses a stubbed `window.Capacitor`).
