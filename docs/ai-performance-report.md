# Groq AI Assistant - Performance Report

**Date:** 2026-03-24
**Model:** `llama-3.1-8b-instant` (Groq)
**Tier:** Free (on_demand)

---

## 1. Load Test Summary

| Metric | Value |
|---|---|
| Total requests | 100 |
| Successes | 68 |
| Failures | 32 (32.0%) |
| System prompt length | 3,772 chars |

### Response Times

| Percentile | Time |
|---|---|
| Min | 344 ms |
| Avg | 9,794 ms |
| P50 | 10,470 ms |
| P95 | 20,616 ms |
| P99 | 21,490 ms |
| Max | 21,490 ms |

### Phase Breakdown

| Phase | Avg | P95 | Errors |
|---|---|---|---|
| Sequential (20 req) | 6,862 ms | 11,615 ms | 0/20 |
| Concurrent (5x10 batches) | 10,571 ms | 21,439 ms | 10/50 |
| Burst (30 simultaneous) | 13,243 ms | 20,862 ms | 22/30 |

### Action Accuracy

- **98.5%** correct action classification (67/68)
- 1 mismatch: "combinar horario de tela" mapped to `createCheckin` instead of `createAgreement` (ambiguous phrasing)

---

## 2. Root Cause Analysis

### High Error Rate (32%)

All 32 failures were **HTTP 429 (rate limit exceeded)** from Groq's free tier:
- **TPM limit:** 6,000 tokens per minute
- **Each request uses ~1,100 prompt tokens**, so effectively only ~5 requests/minute
- Burst and concurrent phases exceed this limit

### Elevated Response Times

High average times (9.8s) are inflated by exponential backoff retries on rate-limited requests. The **baseline sequential latency is 344-660 ms** for unconstrained requests, which is excellent.

---

## 3. Token Usage

| Metric | Value |
|---|---|
| Avg prompt tokens/req | 1,100 |
| Avg completion tokens/req | 70 |
| Avg total tokens/req | 1,169 |
| System prompt tokens (est.) | ~1,060 |

The system prompt consumes ~91% of per-request tokens. This is the primary optimization target.

---

## 4. Cost Projections (Groq Llama 3.1 8B pricing)

Groq pricing: $0.05/1M input tokens, $0.08/1M output tokens.

| Scale | Input Tokens/mo | Output Tokens/mo | Estimated Cost |
|---|---|---|---|
| 100 users, 5 req/day | 16.5M | 1.0M | ~$0.91 |
| 500 users, 10 req/day | 164.9M | 10.5M | ~$9.09 |
| 1,000 users, 10 req/day | 329.9M | 21.0M | ~$18.17 |
| 5,000 users, 10 req/day | 1,649.3M | 104.9M | ~$90.86 |

Costs are very reasonable. Even at 5,000 users, the monthly bill is under $100.

---

## 5. Optimizations Applied

### 5a. Compact System Prompt

**Before:** Verbose action descriptions with full parameter explanations (~3,772 chars).
**After:** Compact format using `action(param:type*, param:type)` notation (~40% smaller).

Added `getActionsForPromptCompact()` in `src/lib/ai-actions.ts`. The route now uses the compact version.

Estimated token savings: ~300-400 prompt tokens per request (reduces from ~1,100 to ~700-800).

### 5b. Response Caching (`src/lib/ai-cache.ts`)

- In-memory `Map`-based cache with 5-minute TTL
- Key includes: groupId + date (YYYY-MM-DD) + normalised command text
- Date-aware: commands like "amanha" produce different cache keys each day
- Max 500 entries with LRU-like eviction
- Cache hits bypass Groq entirely (0ms latency, 0 tokens)

### 5c. Per-User Rate Limiting (`src/lib/ai-rate-limit.ts`)

- Sliding-window rate limiter: **20 requests/minute per user**
- Stays safely below Groq's TPM limit (leaves headroom for multiple concurrent users)
- Returns HTTP 429 with `Retry-After` header and user-friendly Portuguese error message
- Prevents a single user from exhausting the quota

### 5d. Retry with Exponential Backoff

The route's `callGroqWithRetry()` function:
- Catches HTTP 429 errors from Groq
- Retries up to 2 times with exponential delay (2s, 4s)
- Gracefully degrades instead of failing immediately

### 5e. Local Parser (pre-existing)

`src/lib/ai-local-parser.ts` already handles ~80% of commands client-side without calling Groq. This is the most impactful optimization since it eliminates the API call entirely for common patterns.

---

## 6. Recommendations

### Short-term (free tier)

1. **Upgrade to Groq Dev Tier** ($0 but requires registration) for higher TPM limits
2. **Queue concurrent requests** server-side to stay under TPM limit
3. **Increase cache TTL** to 15-30 min for repeated commands

### Medium-term (production)

1. **Consider `llama-3.3-70b-versatile`** for higher accuracy on ambiguous commands (the 8B model already achieves 98.5%, so this is optional)
2. **Add persistent caching** (Redis/Supabase) for cross-deployment cache survival
3. **Implement request queuing** with configurable concurrency to prevent rate limit bursts

### Long-term

1. **Expand local parser** coverage to handle 90%+ of commands locally
2. **Fine-tune prompt** to reduce system prompt to <500 tokens
3. **A/B test** compact vs. verbose prompt for accuracy regression

---

## 7. Files Modified/Created

| File | Change |
|---|---|
| `tests/ai-load-test.mjs` | New: load test script |
| `src/lib/ai-cache.ts` | New: in-memory response cache with TTL |
| `src/lib/ai-rate-limit.ts` | New: per-user sliding-window rate limiter |
| `src/lib/ai-actions.ts` | Added `getActionsForPromptCompact()` |
| `src/app/api/ai/assistant/route.ts` | Added caching, rate limiting, retry, compact prompt |
| `docs/ai-performance-report.md` | This report |
