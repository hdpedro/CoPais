# iOS Native Plugins

These files must be copied to `ios/App/App/` after generating the Xcode project.

## Setup

```bash
# 1. Generate iOS project (requires Mac with Xcode)
npx cap add ios

# 2. Copy plugins to the Xcode project
cp ios-plugins/StoreKitPlugin.swift ios/App/App/
cp ios-plugins/StoreKitPlugin.m ios/App/App/

# 3. Sync and open
npx cap sync ios
npx cap open ios
```

## Files

- **StoreKitPlugin.swift** — StoreKit 2 plugin for Apple In-App Purchases (getProducts, purchase, restorePurchases)
- **StoreKitPlugin.m** — Obj-C bridge to register the plugin with Capacitor

## Xcode Configuration

After opening in Xcode, ensure:
1. In-App Purchase capability is enabled (Signing & Capabilities)
2. Push Notifications capability is enabled
3. Minimum deployment target is iOS 15.0
4. Bundle Identifier is `com.kindar.app`
