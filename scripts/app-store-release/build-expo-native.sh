#!/bin/bash
# ============================================================================
# Kindar Native iOS Build & Submit — Expo/EAS Approach
# For the kindar-native repo (React Native + Expo SDK 54)
# Can run on any platform (build happens in EAS cloud)
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
REPO_URL="https://github.com/hdpedro/kindar-native.git"
NATIVE_DIR="${1:-$HOME/kindar-native}"
EXPO_PROJECT_ID="a0390045-42f5-4a37-8264-659fa09c1e0a"
BUNDLE_ID="com.kindar.app"
APPLE_TEAM_ID="ZQ83W8MYUZ"
APPLE_ID="henrique.de.pedro@gmail.com"

log "Kindar Native - EAS Build & Submit"
log "============================================="

# ── Step 1: Verify prerequisites ───────────────────────────────────────────
log "Step 1/7: Checking prerequisites..."

command -v node >/dev/null 2>&1 || fail "Node.js not installed"
command -v npm >/dev/null 2>&1 || fail "npm not installed"
command -v git >/dev/null 2>&1 || fail "git not installed"

# Install EAS CLI if not present
if ! command -v eas >/dev/null 2>&1; then
  log "Installing EAS CLI globally..."
  npm install -g eas-cli
fi

NODE_VERSION=$(node --version)
EAS_VERSION=$(eas --version 2>/dev/null || echo "unknown")
ok "Node: ${NODE_VERSION}"
ok "EAS CLI: ${EAS_VERSION}"

# ── Step 2: Clone & Setup ─────────────────────────────────────────────────
log "Step 2/7: Setting up kindar-native..."

if [ -d "${NATIVE_DIR}" ]; then
  warn "Directory ${NATIVE_DIR} already exists. Pulling latest..."
  cd "${NATIVE_DIR}"
  git pull origin main || warn "Pull failed, continuing with existing code"
else
  log "Cloning kindar-native..."
  git clone "${REPO_URL}" "${NATIVE_DIR}"
  cd "${NATIVE_DIR}"
fi

ok "Repository ready: ${NATIVE_DIR}"

# ── Step 3: Install dependencies ──────────────────────────────────────────
log "Step 3/7: Installing dependencies..."
npm install
ok "Dependencies installed"

# ── Step 4: Create .env ───────────────────────────────────────────────────
log "Step 4/7: Configuring environment..."

if [ ! -f ".env" ]; then
  cat > .env << 'ENVFILE'
EXPO_PUBLIC_SUPABASE_URL=https://jquaysfeeuwvoydsgssi.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdWF5c2ZlZXV3dm95ZHNnc3NpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NTkwNzMsImV4cCI6MjA4OTMzNTA3M30.k6tqIi4mygYgimhaI-EhFCdUyoEKSPREaed2Bbc_gxY
EXPO_PUBLIC_WEB_URL=https://kindar.com.br
ENVFILE
  ok ".env created"
else
  ok ".env already exists"
fi

# ── Step 5: TypeScript check ──────────────────────────────────────────────
log "Step 5/7: Running TypeScript check..."

TS_ERRORS=0
if npx tsc --noEmit 2>&1; then
  ok "TypeScript check passed — no errors"
else
  TS_ERRORS=1
  warn "TypeScript errors detected. Review output above."
  echo ""
  echo "Common fixes:"
  echo "  - Missing types: npm install -D @types/[package]"
  echo "  - Import errors: Check tsconfig.json paths"
  echo "  - Strict null: Add null checks or use '!' operator"
  echo ""
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  [[ $REPLY =~ ^[Yy]$ ]] || fail "Fix TypeScript errors and rerun."
fi

# ── Step 6: EAS Login & Build ─────────────────────────────────────────────
log "Step 6/7: Building with EAS..."

# Check if already logged in
if ! eas whoami 2>/dev/null; then
  log "Please log in to your Expo account:"
  eas login
fi

CURRENT_USER=$(eas whoami 2>/dev/null)
ok "Logged in as: ${CURRENT_USER}"

echo ""
echo "=========================================="
echo "  Starting production build for iOS"
echo "  Bundle ID: ${BUNDLE_ID}"
echo "  Team ID: ${APPLE_TEAM_ID}"
echo "=========================================="
echo ""
echo "NOTE: EAS will ask for your Apple credentials."
echo "  Apple ID: ${APPLE_ID}"
echo "  You'll need to enter your Apple password and 2FA code."
echo ""

# Run EAS build
eas build --platform ios --profile production --non-interactive 2>&1 || {
  warn "Non-interactive build failed. Trying interactive mode..."
  eas build --platform ios --profile production
}

ok "Build submitted to EAS!"
echo ""
log "Build is running in the EAS cloud (typically 10-20 minutes)."
log "Monitor at: https://expo.dev/accounts/henriquedepedros-organization/projects/kindar-native/builds"
echo ""

# Wait for build to complete
read -p "Press Enter when the build is complete to continue with submission..." -r

# ── Step 7: Submit to App Store ───────────────────────────────────────────
log "Step 7/7: Submitting to App Store Connect..."

echo ""
echo "Submitting the latest build to App Store Connect..."
echo "If the app doesn't exist yet in ASC, EAS will prompt to create it."
echo ""

eas submit --platform ios --profile production --latest || {
  warn "Auto-submit failed. Manual submission instructions:"
  echo ""
  echo "1. Go to: https://expo.dev/accounts/henriquedepedros-organization/projects/kindar-native/builds"
  echo "2. Find the latest successful build"
  echo "3. Click 'Submit to App Store'"
  echo ""
  echo "Or run manually:"
  echo "  eas submit --platform ios --profile production --latest"
}

echo ""
echo "=========================================="
echo "  BUILD & SUBMIT COMPLETE"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Go to https://appstoreconnect.apple.com"
echo "  2. Select Kindar app"
echo "  3. Fill in metadata (use app-store-metadata-text.md)"
echo "  4. Upload screenshots"
echo "  5. Configure demo account for review"
echo "  6. Submit for review"
echo ""
ok "Done!"
