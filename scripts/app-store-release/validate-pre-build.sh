#!/bin/bash
# ============================================================================
# Kindar — Pre-Build Validation Checklist
# Run this before building for the App Store
# Works for both Capacitor (CoPais) and Expo (kindar-native)
# ============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

check_pass() { echo -e "  ${GREEN}[PASS]${NC} $1"; PASS=$((PASS + 1)); }
check_fail() { echo -e "  ${RED}[FAIL]${NC} $1"; FAIL=$((FAIL + 1)); }
check_warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; WARN=$((WARN + 1)); }

echo ""
echo "=========================================="
echo "  Kindar Pre-Build Validation"
echo "=========================================="
echo ""

# ── 1. Project Structure ──────────────────────────────────────────────────
echo -e "${BLUE}1. Project Structure${NC}"

if [ -f "package.json" ]; then
  check_pass "package.json exists"
else
  check_fail "package.json not found — are you in the right directory?"
fi

if [ -d "node_modules" ]; then
  check_pass "node_modules installed"
else
  check_fail "node_modules missing — run: npm install"
fi

if [ -f ".env" ]; then
  check_pass ".env exists"
else
  check_fail ".env missing — create it with Supabase credentials"
fi

# Detect project type
if [ -f "app.json" ] && grep -q "expo" "app.json" 2>/dev/null; then
  PROJECT_TYPE="expo"
  echo -e "  ${BLUE}[INFO]${NC} Detected: Expo (kindar-native)"
elif [ -f "capacitor.config.ts" ]; then
  PROJECT_TYPE="capacitor"
  echo -e "  ${BLUE}[INFO]${NC} Detected: Capacitor (CoPais)"
else
  PROJECT_TYPE="unknown"
  check_warn "Could not detect project type (Expo or Capacitor)"
fi

# ── 2. TypeScript ─────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}2. TypeScript${NC}"

if npx tsc --noEmit 2>/dev/null; then
  check_pass "TypeScript compilation — zero errors"
else
  check_fail "TypeScript errors found — run: npx tsc --noEmit"
fi

# ── 3. Environment Variables ──────────────────────────────────────────────
echo ""
echo -e "${BLUE}3. Environment Variables${NC}"

if [ -f ".env" ]; then
  if grep -q "SUPABASE_URL" .env 2>/dev/null; then
    check_pass "Supabase URL configured"
  else
    check_fail "SUPABASE_URL missing from .env"
  fi

  if grep -q "SUPABASE_ANON_KEY" .env 2>/dev/null; then
    check_pass "Supabase Anon Key configured"
  else
    check_fail "SUPABASE_ANON_KEY missing from .env"
  fi
else
  check_fail ".env file missing"
fi

# ── 4. App Configuration ─────────────────────────────────────────────────
echo ""
echo -e "${BLUE}4. App Configuration${NC}"

if [ "${PROJECT_TYPE}" = "expo" ]; then
  if [ -f "app.json" ]; then
    check_pass "app.json exists"

    if grep -q "com.kindar.app" app.json 2>/dev/null; then
      check_pass "Bundle ID is com.kindar.app"
    else
      check_fail "Bundle ID not set to com.kindar.app in app.json"
    fi
  fi

  if [ -f "eas.json" ]; then
    check_pass "eas.json exists"

    if grep -q "production" eas.json 2>/dev/null; then
      check_pass "Production profile exists in eas.json"
    else
      check_fail "No production profile in eas.json"
    fi
  else
    check_fail "eas.json missing — run: eas build:configure"
  fi
fi

if [ "${PROJECT_TYPE}" = "capacitor" ]; then
  if [ -f "capacitor.config.ts" ]; then
    check_pass "capacitor.config.ts exists"

    if grep -q "com.kindar.app" capacitor.config.ts 2>/dev/null; then
      check_pass "Bundle ID is com.kindar.app"
    else
      check_fail "Bundle ID not set to com.kindar.app"
    fi
  fi

  if [ -d "ios-plugins" ]; then
    check_pass "iOS plugins directory exists"

    if [ -f "ios-plugins/StoreKitPlugin.swift" ]; then
      check_pass "StoreKit plugin present"
    else
      check_warn "StoreKit plugin missing"
    fi
  fi
fi

# ── 5. App Icon ───────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}5. App Icon${NC}"

ICON_FOUND=false
for icon_path in "assets/icon.png" "assets/images/icon.png" "public/icon-512.png"; do
  if [ -f "${icon_path}" ]; then
    ICON_FOUND=true
    check_pass "Icon found: ${icon_path}"

    # Check dimensions (requires imagemagick)
    if command -v identify >/dev/null 2>&1; then
      DIMENSIONS=$(identify -format "%wx%h" "${icon_path}" 2>/dev/null || echo "unknown")
      if [ "${DIMENSIONS}" = "1024x1024" ]; then
        check_pass "Icon is 1024x1024"
      else
        check_warn "Icon is ${DIMENSIONS} — App Store requires 1024x1024"
      fi

      # Check for alpha channel
      HAS_ALPHA=$(identify -format "%A" "${icon_path}" 2>/dev/null || echo "unknown")
      if [ "${HAS_ALPHA}" = "True" ] || [ "${HAS_ALPHA}" = "true" ]; then
        check_fail "Icon has alpha channel — App Store rejects this. Fix: convert ${icon_path} -background white -alpha remove -alpha off ${icon_path}"
      else
        check_pass "Icon has no alpha channel"
      fi
    else
      check_warn "imagemagick not installed — cannot verify icon dimensions/alpha"
    fi
    break
  fi
done

if [ "${ICON_FOUND}" = false ]; then
  check_warn "No app icon found in standard locations"
fi

# ── 6. Supabase Connectivity ─────────────────────────────────────────────
echo ""
echo -e "${BLUE}6. Supabase Connectivity${NC}"

SUPABASE_URL="https://jquaysfeeuwvoydsgssi.supabase.co"
if command -v curl >/dev/null 2>&1; then
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${SUPABASE_URL}/rest/v1/" -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdWF5c2ZlZXV3dm95ZHNnc3NpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NTkwNzMsImV4cCI6MjA4OTMzNTA3M30.k6tqIi4mygYgimhaI-EhFCdUyoEKSPREaed2Bbc_gxY" 2>/dev/null || echo "000")

  if [ "${HTTP_CODE}" = "200" ]; then
    check_pass "Supabase API reachable (HTTP ${HTTP_CODE})"
  else
    check_warn "Supabase API returned HTTP ${HTTP_CODE}"
  fi
else
  check_warn "curl not available — cannot test Supabase connectivity"
fi

# ── 7. Native API Endpoint ────────────────────────────────────────────────
echo ""
echo -e "${BLUE}7. Native API Endpoint${NC}"

if command -v curl >/dev/null 2>&1; then
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://kindar.com.br/api/native/notify" -X POST -H "Content-Type: application/json" -d '{}' 2>/dev/null || echo "000")

  if [ "${HTTP_CODE}" = "401" ]; then
    check_pass "Native notify endpoint reachable (returns 401 without auth — correct)"
  elif [ "${HTTP_CODE}" = "000" ]; then
    check_warn "Cannot reach kindar.com.br"
  else
    check_warn "Native notify endpoint returned HTTP ${HTTP_CODE}"
  fi
else
  check_warn "curl not available"
fi

# ── Summary ───────────────────────────────────────────────────────────────
echo ""
echo "=========================================="
echo "  Validation Summary"
echo "=========================================="
echo -e "  ${GREEN}PASS: ${PASS}${NC}"
echo -e "  ${RED}FAIL: ${FAIL}${NC}"
echo -e "  ${YELLOW}WARN: ${WARN}${NC}"
echo ""

if [ ${FAIL} -gt 0 ]; then
  echo -e "  ${RED}BLOCKING ISSUES FOUND — fix before building${NC}"
  exit 1
else
  echo -e "  ${GREEN}Ready to build!${NC}"
  exit 0
fi
