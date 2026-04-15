#!/bin/bash
# ============================================================================
# Kindar Native — Quick Setup Script
# Clones the repo, installs deps, creates .env, runs TS check
# ============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[SETUP]${NC} $1"; }
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

NATIVE_DIR="${1:-$HOME/kindar-native}"

log "Kindar Native Setup"
log "==================="

# 1. Clone
if [ -d "${NATIVE_DIR}" ]; then
  log "Directory exists. Pulling latest..."
  cd "${NATIVE_DIR}"
  git pull origin main
else
  log "Cloning kindar-native..."
  git clone https://github.com/hdpedro/kindar-native.git "${NATIVE_DIR}"
  cd "${NATIVE_DIR}"
fi
ok "Repository cloned"

# 2. Install
log "Installing dependencies..."
npm install
ok "Dependencies installed"

# 3. .env
log "Creating .env..."
cat > .env << 'EOF'
EXPO_PUBLIC_SUPABASE_URL=https://jquaysfeeuwvoydsgssi.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdWF5c2ZlZXV3dm95ZHNnc3NpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NTkwNzMsImV4cCI6MjA4OTMzNTA3M30.k6tqIi4mygYgimhaI-EhFCdUyoEKSPREaed2Bbc_gxY
EXPO_PUBLIC_WEB_URL=https://kindar.com.br
EOF
ok ".env created"

# 4. TypeScript check
log "Running TypeScript check..."
if npx tsc --noEmit 2>&1; then
  ok "TypeScript — zero errors"
else
  echo ""
  echo "TypeScript errors found. Fix them before building."
  echo "Run: npx tsc --noEmit"
  exit 1
fi

# 5. Verify EAS CLI
if command -v eas >/dev/null 2>&1; then
  ok "EAS CLI installed: $(eas --version)"
else
  log "Installing EAS CLI..."
  npm install -g eas-cli
  ok "EAS CLI installed"
fi

echo ""
echo "=========================================="
echo "  Setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  cd ${NATIVE_DIR}"
echo ""
echo "  # Test locally (requires Mac with Xcode):"
echo "  npx expo start --ios"
echo ""
echo "  # Build for App Store:"
echo "  eas build --platform ios --profile production"
echo ""
echo "  # Submit to App Store:"
echo "  eas submit --platform ios --profile production --latest"
echo ""
