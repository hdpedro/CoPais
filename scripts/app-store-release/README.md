# Kindar - App Store Release Guide

This directory contains everything needed to build and submit Kindar to the Apple App Store.

**Two build approaches are available:**

| Approach | Repo | Tech | Script |
|----------|------|------|--------|
| **Capacitor (hybrid)** | `CoPais` | Next.js + Capacitor | `build-capacitor.sh` |
| **Expo (native)** | `kindar-native` | React Native + Expo | `build-expo-native.sh` |

---

## Quick Start (Capacitor - Recommended)

```bash
# On a Mac with Xcode installed:
cd /path/to/CoPais
chmod +x scripts/app-store-release/build-capacitor.sh
./scripts/app-store-release/build-capacitor.sh
```

Or trigger via GitHub Actions:
```bash
git tag v1.0.0
git push origin v1.0.0
```

## Quick Start (Expo/kindar-native)

```bash
# On any machine with Node.js:
chmod +x scripts/app-store-release/build-expo-native.sh
./scripts/app-store-release/build-expo-native.sh
```

---

## Files in this directory

| File | Purpose |
|------|---------|
| `README.md` | This guide |
| `build-capacitor.sh` | Automated Capacitor build + submit for Mac |
| `build-expo-native.sh` | Automated EAS build + submit for kindar-native |
| `setup-kindar-native.sh` | Setup script for kindar-native repo (clone, install, .env) |
| `validate-pre-build.sh` | Pre-build validation checklist |
| `app-store-metadata.json` | Structured metadata for App Store Connect |
| `app-store-metadata-text.md` | Copy-paste metadata for manual entry |
| `ExportOptions.plist` | Xcode export options for Capacitor builds |

---

## Prerequisites

### For Capacitor builds (on Mac)
- macOS 13+ with Xcode 15+
- Node.js 20+
- Apple Developer Account ($99/year)
- Xcode Command Line Tools: `xcode-select --install`
- CocoaPods: `sudo gem install cocoapods`

### For Expo builds (any platform)
- Node.js 20+
- EAS CLI: `npm install -g eas-cli`
- Expo account linked to Apple Developer Account
- Apple Developer Account ($99/year)

### GitHub Actions (automated, no Mac needed)
- 8 GitHub Secrets configured (see `docs/ios-github-actions-setup.md`)
- Tag a release: `git tag v1.0.0 && git push origin v1.0.0`

---

## App Identity

| Field | Value |
|-------|-------|
| Bundle ID | `com.kindar.app` |
| App Name | Kindar |
| Apple Team ID | ZQ83W8MYUZ |
| Apple ID (email) | henrique.de.pedro@gmail.com |
| Expo Project ID | a0390045-42f5-4a37-8264-659fa09c1e0a |
| Supabase URL | https://jquaysfeeuwvoydsgssi.supabase.co |

---

## Post-Build: App Store Connect Checklist

After the build uploads to App Store Connect:

1. Go to https://appstoreconnect.apple.com
2. Select the Kindar app
3. Fill in metadata from `app-store-metadata-text.md`
4. Upload screenshots (iPhone 6.7" and 5.5")
5. Configure demo account for Apple review
6. Set pricing (Free)
7. Set availability (Brazil initially)
8. Submit for review

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Icon has alpha channel | `convert assets/icon.png -background white -alpha remove -alpha off assets/icon.png` |
| Build fails on credentials | Run `npx eas-cli credentials` and follow wizard |
| Plugin not found | `npx expo install [plugin-name]` |
| TypeScript errors | Fix errors, then rerun `npx tsc --noEmit` |
| "Website wrapper" rejection | See `docs/ios-submission-checklist.md` for 10 mitigations |
| GitHub Actions build fails | Check secrets are configured per `docs/ios-github-actions-setup.md` |
