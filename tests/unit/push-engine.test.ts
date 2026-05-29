/**
 * Regression tests for the push engine fixes (2026-04-28).
 *
 * Three real bugs were closed:
 *   #1  Token wipes on transient errors / env-missing.
 *       sendApnsPush + sendFcmPush previously returned `boolean`;
 *       caller deleted the token on any `false`. With env vars missing
 *       (e.g. preview deploy, key rotation) or a single 5xx blip, every
 *       APNs/FCM token in the user's row got deleted. After the fix the
 *       senders return a discriminated `{delivered, removeToken, reason}`
 *       and the caller deletes ONLY when `removeToken: true`.
 *
 *   #2  Health pushes used `type='system'`, the same value used to flag
 *       the internal push_sub/apns_token/fcm_token rows. The inbox query
 *       in src/app/(app)/notificacoes/page.tsx filters those out, so
 *       legitimate health notifications never reached the user's inbox
 *       even though the push fired. They now use specific types
 *       (health_appointment_created, health_allergy_created, etc.)
 *       which pass through the `.neq('type','system')` gate.
 *
 *   #3  APNs payload had `badge: 1` hardcoded. After the first push of
 *       a session the badge stuck at 1 and the user couldn't tell
 *       whether new things had arrived. Now the engine queries the user's
 *       unread count once per fanout and sends that as the badge.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const PUSH = fs.readFileSync(
  path.resolve(__dirname, "../../src/lib/push.ts"),
  "utf8",
);
const PUSH_FCM = fs.readFileSync(
  path.resolve(__dirname, "../../src/lib/push-fcm.ts"),
  "utf8",
);
const HEALTH = fs.readFileSync(
  path.resolve(__dirname, "../../src/actions/health.ts"),
  "utf8",
);
const BALANCE = fs.readFileSync(
  path.resolve(__dirname, "../../src/actions/balance-operations.ts"),
  "utf8",
);
const INBOX_PWA = fs.readFileSync(
  path.resolve(__dirname, "../../src/app/(app)/notificacoes/page.tsx"),
  "utf8",
);

describe("BUG #1 — token lifecycle (no wipe on transient errors)", () => {
  it("sendApnsPush returns a discriminated PushSendResult, not a bare boolean", () => {
    expect(PUSH).toMatch(/export type PushSendResult\s*=/);
    expect(PUSH).toMatch(/sendApnsPush[\s\S]*?Promise<PushSendResult>/);
  });

  it("APNs env-missing branch returns removeToken: false (env_missing reason)", () => {
    expect(PUSH).toMatch(/removeToken: false[^}]*reason: ["']env_missing/);
  });

  it("APNs network-error catch returns removeToken: false (preserves token)", () => {
    expect(PUSH).toMatch(/removeToken: false[^}]*reason: ["']network_error/);
  });

  it("APNs 410 Unregistered returns removeToken: true", () => {
    // Local var renomeada de `res.status` pra `resStatus` em 2026-05-26
    // quando refatorou fetch → http2 nativo (Apple requer HTTP/2).
    // Janela ampliada em 2026-05-28 pra acomodar console.warn antes do
    // return (logging detalhado pra debug Apple status code real).
    expect(PUSH).toMatch(/(?:res\.status|resStatus) === 410[\s\S]{0,400}removeToken: true[^}]*reason: ["']unregistered/);
  });

  it("APNs 400 BadDeviceToken returns removeToken: true", () => {
    expect(PUSH).toMatch(/BadDeviceToken[\s\S]{0,400}removeToken: true[^}]*reason: ["']bad_token/);
  });

  it("APNs caller only deletes when removeToken === true", () => {
    expect(PUSH).toMatch(/const r = await sendApnsPush[\s\S]{0,200}!r\.delivered && r\.removeToken[\s\S]{0,80}removeApnsToken/);
  });

  it("sendFcmPush returns FcmSendResult discriminated union", () => {
    expect(PUSH_FCM).toMatch(/export type FcmSendResult\s*=/);
    expect(PUSH_FCM).toMatch(/Promise<FcmSendResult>/);
  });

  it("FCM env-missing returns removeToken: false (env_missing)", () => {
    expect(PUSH_FCM).toMatch(/removeToken: false[^}]*reason: ["']env_missing/);
  });

  it("FCM oauth-failed returns removeToken: false (oauth_failed)", () => {
    expect(PUSH_FCM).toMatch(/removeToken: false[^}]*reason: ["']oauth_failed/);
  });

  it("FCM network-error returns removeToken: false (network_error)", () => {
    expect(PUSH_FCM).toMatch(/removeToken: false[^}]*reason: ["']network_error/);
  });

  it("FCM 404 UNREGISTERED returns removeToken: true", () => {
    expect(PUSH_FCM).toMatch(/res\.status === 404[\s\S]{0,400}UNREGISTERED[\s\S]{0,100}removeToken: true/);
  });

  it("FCM caller only deletes when removeToken === true", () => {
    expect(PUSH).toMatch(/const r = await sendFcmPush[\s\S]{0,200}!r\.delivered && r\.removeToken[\s\S]{0,80}removeFcmToken/);
  });

  it("regression: removeToken: false also covers transient http_xxx in APNs", () => {
    expect(PUSH).toMatch(/removeToken: false[^}]*reason:\s*`http_/);
  });

  it("regression: removeToken: false covers transient http_xxx in FCM", () => {
    expect(PUSH_FCM).toMatch(/removeToken: false[^}]*reason:\s*`http_/);
  });
});

describe("BUG #2 — health pushes use specific types (visible in inbox)", () => {
  it("inbox query filters type='system' (so health pushes must NOT be 'system')", () => {
    expect(INBOX_PWA).toMatch(/\.neq\(["']type["'],\s*["']system["']\)/);
  });

  // 2026-05-13: createAppointment + createAllergy migraram pra Saúde Foundation
  // (migration 00080). O push agora vai via notifyCollabCreate, que internamente
  // usa `${recordType}_created` (medical_appointment_created, child_allergy_created).
  // Bug #2 (não usar 'system') continua validado pelo teste catch-all abaixo.
  it("createAppointment usa notifySaudeCreate('medical_appointment') — Foundation pattern", () => {
    expect(HEALTH).toMatch(/notifySaudeCreate\(\s*\{[\s\S]{0,300}recordType:\s*["']medical_appointment["']/);
  });

  it("createAllergy usa notifySaudeCreate('child_allergy') — Foundation pattern", () => {
    expect(HEALTH).toMatch(/notifySaudeCreate\(\s*\{[\s\S]{0,300}recordType:\s*["']child_allergy["']/);
  });

  it("createVaccinationRecord uses health_vaccine_created", () => {
    expect(HEALTH).toMatch(/createNotificationWithPush\([^,]+,\s*["']health_vaccine_created["']/);
  });

  it("createGrowthRecord uses health_growth_created", () => {
    expect(HEALTH).toMatch(/createNotificationWithPush\([^,]+,\s*["']health_growth_created["']/);
  });

  it("createSymptomEntry uses health_symptom_created", () => {
    expect(HEALTH).toMatch(/createNotificationWithPush\([^,]+,\s*["']health_symptom_created["']/);
  });

  it("createIllnessWithMedicationAndAppointment uses health_illness_created", () => {
    expect(HEALTH).toMatch(/createNotificationWithPush\([^,]+,\s*["']health_illness_created["']/);
  });

  it("savePrescriptionToHealth uses health_prescription_created", () => {
    expect(HEALTH).toMatch(/createNotificationWithPush\([^,]+,\s*["']health_prescription_created["']/);
  });

  it("balance proposal uses balance_proposal", () => {
    expect(BALANCE).toMatch(/createNotificationWithPush\([\s\S]*?,\s*["']balance_proposal["']/);
  });

  it("balance response uses balance_response", () => {
    expect(BALANCE).toMatch(/createNotificationWithPush\([\s\S]*?,\s*["']balance_response["']/);
  });

  it("zero remaining 'system' pushes in actions (would still hit the inbox filter)", () => {
    const actionsDir = path.resolve(__dirname, "../../src/actions");
    const files = fs.readdirSync(actionsDir).filter((f) => f.endsWith(".ts"));
    let hitsFound = 0;
    const offenders: string[] = [];
    for (const f of files) {
      const content = fs.readFileSync(path.join(actionsDir, f), "utf8");
      // Match createNotificationWithPush(..., "system", ...)
      const matches = content.match(/createNotificationWithPush\([\s\S]{0,200}?,\s*["']system["']/g);
      if (matches) {
        hitsFound += matches.length;
        offenders.push(`${f}: ${matches.length}`);
      }
    }
    expect(hitsFound, `system push leaks: ${offenders.join("; ")}`).toBe(0);
  });
});

describe("BUG #3 — APNs badge reflects real unread count", () => {
  it("getUnreadBadgeCount helper exists and excludes internal rows", () => {
    expect(PUSH).toMatch(/getUnreadBadgeCount/);
    expect(PUSH).toMatch(/getUnreadBadgeCount[\s\S]{0,800}\.neq\(["']title["'],\s*["']push_sub["']\)/);
    expect(PUSH).toMatch(/getUnreadBadgeCount[\s\S]{0,800}\.neq\(["']title["'],\s*["']apns_token["']\)/);
    expect(PUSH).toMatch(/getUnreadBadgeCount[\s\S]{0,800}\.neq\(["']title["'],\s*["']fcm_token["']\)/);
  });

  it("getUnreadBadgeCount returns 0 on error (never throws into push pipeline)", () => {
    expect(PUSH).toMatch(/getUnreadBadgeCount[\s\S]{0,800}catch\s*\{[\s\S]{0,40}return 0/);
  });

  it("APNs payload uses dynamic badge variable (not hardcoded 1)", () => {
    // Match `badge,` or `badge:` followed by the variable, NOT `badge: 1,`
    expect(PUSH).not.toMatch(/aps:\s*\{[\s\S]{0,200}badge:\s*1\b/);
    expect(PUSH).toMatch(/aps:\s*\{[\s\S]{0,800}badge,/);
  });

  it("sendApnsPush takes badge as third argument", () => {
    expect(PUSH).toMatch(/sendApnsPush\([\s\S]{0,150}badge:\s*number/);
  });

  it("APNs caller computes badge once per fanout and passes it to each device", () => {
    expect(PUSH).toMatch(/const badge = await getUnreadBadgeCount\(userId\)[\s\S]{0,400}sendApnsPush\(token, payload, badge\)/);
  });
});

describe("Push engine — invariants & non-regressions", () => {
  it("VAPID configured-flag gates web-push (no crash when keys absent)", () => {
    expect(PUSH).toMatch(/vapidConfigured/);
    expect(PUSH).toMatch(/if \(subscriptions\.length > 0 && vapidConfigured\)/);
  });

  it("web-push 410/404 still auto-removes the subscription (existing path preserved)", () => {
    expect(PUSH).toMatch(/statusCode === 410 \|\| statusCode === 404[\s\S]{0,80}removePushSubscription/);
  });

  it("tag is unique per createNotificationWithPush call (anti-coalesce)", () => {
    expect(PUSH).toMatch(/tag:\s*`\$\{type\}-\$\{Date\.now\(\)\}/);
  });

  it("savePushSubscription is idempotent (updates keys for same endpoint)", () => {
    expect(PUSH).toMatch(/stored\.endpoint === subscription\.endpoint/);
  });

  it("APNs uses ES256 JWT (mandatory by Apple)", () => {
    expect(PUSH).toMatch(/alg:\s*["']ES256["']/);
  });

  it("APNs uses production endpoint (api.push.apple.com)", () => {
    expect(PUSH).toMatch(/api\.push\.apple\.com/);
  });

  it("FCM uses HTTP v1 endpoint (not legacy)", () => {
    expect(PUSH_FCM).toMatch(/fcm\.googleapis\.com\/v1\/projects/);
  });

  it("FCM access token cached with 5-min safety margin", () => {
    expect(PUSH_FCM).toMatch(/expiresAt - now > 300/);
  });

  it("Promise.allSettled across users so one failure doesn't break the fanout", () => {
    expect(PUSH).toMatch(/Promise\.allSettled\(\s*userIds\.map/);
  });

  it("createNotificationWithPush wraps inbox-insert in try/catch (non-blocking)", () => {
    expect(PUSH).toMatch(/createNotificationWithPush[\s\S]{0,800}try\s*\{[\s\S]{0,400}from\(["']notifications["']\)\.insert/);
  });
});
