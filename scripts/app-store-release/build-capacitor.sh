#!/bin/bash
# ============================================================================
# Kindar iOS Build & Submit — Capacitor Approach
# Run this on a Mac with Xcode installed
# ============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[KINDAR]${NC} $1"; }
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

# ── Configuration ──────────────────────────────────────────────────────────
APP_ID="com.kindar.app"
APP_NAME="Kindar"
TEAM_ID="ZQ83W8MYUZ"
SCHEME="App"
WORKSPACE="ios/App/App.xcworkspace"
VERSION="${1:-1.0.0}"
BUILD_NUMBER="${2:-$(date +%Y%m%d%H%M)}"
ARCHIVE_PATH="$HOME/Library/Developer/Xcode/Archives/Kindar-${VERSION}.xcarchive"
EXPORT_PATH="$HOME/Desktop/Kindar-Export"

log "Kindar iOS Build v${VERSION} (${BUILD_NUMBER})"
log "============================================="

# ── Step 1: Verify prerequisites ───────────────────────────────────────────
log "Step 1/8: Checking prerequisites..."

command -v xcodebuild >/dev/null 2>&1 || fail "Xcode not installed. Run: xcode-select --install"
command -v node >/dev/null 2>&1 || fail "Node.js not installed"
command -v npm >/dev/null 2>&1 || fail "npm not installed"

XCODE_VERSION=$(xcodebuild -version | head -1)
NODE_VERSION=$(node --version)
ok "Xcode: ${XCODE_VERSION}"
ok "Node: ${NODE_VERSION}"

# ── Step 2: Install dependencies ───────────────────────────────────────────
log "Step 2/8: Installing dependencies..."
npm ci
ok "Dependencies installed"

# ── Step 3: TypeScript check ───────────────────────────────────────────────
log "Step 3/8: Running TypeScript check..."
if npx tsc --noEmit 2>&1; then
  ok "TypeScript check passed"
else
  warn "TypeScript errors found. Attempting to continue (non-blocking for Capacitor builds)..."
fi

# ── Step 4: Add iOS platform & sync ───────────────────────────────────────
log "Step 4/8: Setting up iOS platform..."

# Remove existing iOS directory for clean build
if [ -d "ios" ]; then
  warn "Removing existing iOS directory for clean build..."
  rm -rf ios
fi

npx cap add ios
ok "iOS platform added"

# Copy native plugins
log "Copying native plugins..."
cp ios-plugins/StoreKitPlugin.swift ios/App/App/
cp ios-plugins/StoreKitPlugin.m ios/App/App/
ok "StoreKit plugin copied"

# Sync Capacitor
npx cap sync ios
ok "Capacitor synced"

# ── Step 5: Configure signing ─────────────────────────────────────────────
log "Step 5/8: Configuring build settings..."

# Update Info.plist with correct bundle ID
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier ${APP_ID}" ios/App/App/Info.plist 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName ${APP_NAME}" ios/App/App/Info.plist 2>/dev/null || true

ok "Build settings configured"

# ── Step 6: Build archive ─────────────────────────────────────────────────
log "Step 6/8: Building iOS archive (this takes 5-10 minutes)..."

xcodebuild archive \
  -workspace "${WORKSPACE}" \
  -scheme "${SCHEME}" \
  -sdk iphoneos \
  -configuration Release \
  -archivePath "${ARCHIVE_PATH}" \
  -destination "generic/platform=iOS" \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM="${TEAM_ID}" \
  PRODUCT_BUNDLE_IDENTIFIER="${APP_ID}" \
  MARKETING_VERSION="${VERSION}" \
  CURRENT_PROJECT_VERSION="${BUILD_NUMBER}" \
  | xcpretty || fail "Archive build failed"

ok "Archive created: ${ARCHIVE_PATH}"

# ── Step 7: Export IPA ─────────────────────────────────────────────────────
log "Step 7/8: Exporting IPA..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPORT_OPTIONS="${SCRIPT_DIR}/ExportOptions.plist"

if [ ! -f "${EXPORT_OPTIONS}" ]; then
  warn "ExportOptions.plist not found, creating default..."
  cat > "${EXPORT_OPTIONS}" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>teamID</key>
  <string>${TEAM_ID}</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>uploadBitcode</key>
  <false/>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
PLIST
fi

mkdir -p "${EXPORT_PATH}"
xcodebuild -exportArchive \
  -archivePath "${ARCHIVE_PATH}" \
  -exportPath "${EXPORT_PATH}" \
  -exportOptionsPlist "${EXPORT_OPTIONS}" \
  | xcpretty || fail "Export failed"

ok "IPA exported: ${EXPORT_PATH}"

# ── Step 8: Upload to App Store Connect ────────────────────────────────────
log "Step 8/8: Uploading to App Store Connect..."

IPA_FILE=$(find "${EXPORT_PATH}" -name "*.ipa" | head -1)

if [ -z "${IPA_FILE}" ]; then
  fail "No IPA file found in ${EXPORT_PATH}"
fi

echo ""
echo "=========================================="
echo "  IPA ready: ${IPA_FILE}"
echo "=========================================="
echo ""
echo "To upload to App Store Connect, choose one:"
echo ""
echo "Option A — Xcode Organizer (GUI):"
echo "  1. Open Xcode > Window > Organizer"
echo "  2. Select the Kindar archive"
echo "  3. Click 'Distribute App' > App Store Connect"
echo ""
echo "Option B — Command line (requires API key):"
echo "  xcrun altool --upload-app -f '${IPA_FILE}' -t ios \\"
echo "    --apiKey YOUR_KEY_ID \\"
echo "    --apiIssuer YOUR_ISSUER_ID"
echo ""
echo "Option C — Transporter app:"
echo "  1. Open Transporter (free from Mac App Store)"
echo "  2. Drag the IPA file into Transporter"
echo "  3. Click 'Deliver'"
echo ""

log "Build complete! Version ${VERSION} (${BUILD_NUMBER})"
