/**
 * POST /api/health/vaccines-bulk  → bulk-insert vaccination_records.
 *
 * Native carteirinha screen (`kindar-native/app/saude/vacinas/carteirinha.tsx`)
 * batches vaccines parsed by AI into one call. Single source of truth: the
 * same group/child gates the PWA `parse-vaccines` insert path applies, plus
 * `administered_date NOT NULL` enforcement (DB constraint).
 */

import { NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { captureServerEvent } from "@/lib/posthog-server";
import { notifySaudeCreate } from "@/lib/services/health-collab";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalize messy date strings (often from AI-OCR'd vaccine cards) to
 * canonical YYYY-MM-DD. Returns null when the input cannot be parsed
 * confidently — caller should skip the row and show that to the user
 * rather than failing the whole batch.
 *
 * Accepts:
 *   - YYYY-MM-DD                   (canonical, returned as-is after validation)
 *   - YYYY/MM/DD                   → YYYY-MM-DD
 *   - DD/MM/YYYY  (BR)             → YYYY-MM-DD
 *   - DD-MM-YYYY  (BR)             → YYYY-MM-DD
 *   - DD/MM/YY    (BR short)       → 20YY-MM-DD (only when YY is plausibly 20XX)
 *   - YYYYMMDD    (no separator)   → YYYY-MM-DD
 */
function normalizeDate(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  if (ISO_DATE.test(s)) {
    return isRealDate(s) ? s : null;
  }

  // YYYY/MM/DD
  const slashIso = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashIso) {
    return tryBuild(slashIso[1], slashIso[2], slashIso[3]);
  }

  // DD/MM/YYYY or DD-MM-YYYY (BR)
  const br = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (br) {
    return tryBuild(br[3], br[2], br[1]);
  }

  // DD/MM/YY (BR short) — assume 20YY for YY < 50, 19YY otherwise
  const brShort = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (brShort) {
    const yy = parseInt(brShort[3], 10);
    const fullYear = yy < 50 ? 2000 + yy : 1900 + yy;
    return tryBuild(String(fullYear), brShort[2], brShort[1]);
  }

  // YYYYMMDD compact
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return tryBuild(compact[1], compact[2], compact[3]);
  }

  return null;
}

function tryBuild(y: string, m: string, d: string): string | null {
  const yy = y.padStart(4, "0");
  const mm = m.padStart(2, "0");
  const dd = d.padStart(2, "0");
  const candidate = `${yy}-${mm}-${dd}`;
  return ISO_DATE.test(candidate) && isRealDate(candidate) ? candidate : null;
}

/** Reject 2026-02-30, 2026-13-01 etc. (regex passes, calendar doesn't). */
function isRealDate(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

interface VaccineInput {
  vaccine_name?: unknown;
  dose_label?: unknown;
  administered_date?: unknown;
  batch_number?: unknown;
  location?: unknown;
  notes?: unknown;
  // OCR-derived confidence (0..1). Quando presente, persiste em
  // `vaccination_records.confidence_score` pra UI poder destacar registros
  // de baixa confiança (ex: chip "Revisar data") em telas futuras.
  confidence_score?: unknown;
}

const VALID_SOURCES = new Set(["manual", "ocr", "imported"] as const);
type VaccineSource = "manual" | "ocr" | "imported";

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const groupId = body.groupId as string | undefined;
  const childId = body.childId as string | undefined;
  const vaccinesRaw = body.vaccines;
  // Source explicit (default 'manual' pra back-compat). Carteirinha OCR passa 'ocr'
  // — viabiliza distinguir entradas digitadas vs reconhecidas no banco e em métricas.
  const sourceRaw = body.source;
  const source: VaccineSource = VALID_SOURCES.has(sourceRaw as VaccineSource)
    ? (sourceRaw as VaccineSource)
    : "manual";

  if (!groupId || !childId) {
    return NextResponse.json(
      { error: "groupId e childId obrigatórios." },
      { status: 400 },
    );
  }
  if (!Array.isArray(vaccinesRaw) || vaccinesRaw.length === 0) {
    return NextResponse.json(
      { error: "Lista de vacinas vazia." },
      { status: 400 },
    );
  }
  if (vaccinesRaw.length > 100) {
    return NextResponse.json(
      { error: "Limite de 100 vacinas por requisição." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Group-membership gate
  const { data: membership } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();
  if (!membership) {
    return NextResponse.json(
      { error: "Sem permissão para este grupo." },
      { status: 403 },
    );
  }

  // child-belongs-to-group gate
  const { data: child } = await admin
    .from("children")
    .select("id")
    .eq("id", childId)
    .eq("group_id", groupId)
    .single();
  if (!child) {
    return NextResponse.json(
      { error: "Criança não pertence a este grupo." },
      { status: 403 },
    );
  }

  // Validate + normalize each row. administered_date is NOT NULL in DB,
  // so we MUST have a real date for each insertion. Strategy:
  //   1. Try to normalize messy formats (DD/MM/YYYY, DD-MM-YY etc.) to
  //      canonical YYYY-MM-DD via normalizeDate().
  //   2. If unparseable, skip the row but track it — report to client
  //      so the user knows which lines didn't go in instead of losing
  //      the whole batch.
  const rows: Array<Record<string, unknown>> = [];
  const skipped: Array<{ name: string; reason: string; rawDate: string }> = [];

  for (const raw of vaccinesRaw as VaccineInput[]) {
    const name = String(raw.vaccine_name ?? "").trim();
    if (!name) {
      // Empty name = pure user mistake on a single row. Skip silently
      // (user wouldn't have included it intentionally).
      continue;
    }
    const rawDate = String(raw.administered_date ?? "").trim();
    const normalized = normalizeDate(rawDate);
    if (!normalized) {
      skipped.push({
        name,
        reason: rawDate ? "Data não reconhecida" : "Data ausente",
        rawDate,
      });
      continue;
    }
    // confidence_score: aceita number ∈ [0, 1]; qualquer outra coisa vira null.
    // Trigger normalize_vaccination_catalog (migration 00093) resolve catalog_id
    // automaticamente — não precisa fazer inferCatalogMatch aqui.
    const conf = typeof raw.confidence_score === "number"
      && Number.isFinite(raw.confidence_score)
      && raw.confidence_score >= 0
      && raw.confidence_score <= 1
      ? raw.confidence_score
      : null;
    rows.push({
      group_id: groupId,
      child_id: childId,
      vaccine_name: name.slice(0, 200),
      dose_label: raw.dose_label
        ? String(raw.dose_label).trim().slice(0, 100) || null
        : null,
      administered_date: normalized,
      batch_number: raw.batch_number
        ? String(raw.batch_number).trim().slice(0, 100) || null
        : null,
      location: raw.location
        ? String(raw.location).trim().slice(0, 200) || null
        : null,
      notes: raw.notes
        ? String(raw.notes).trim().slice(0, 1000) || null
        : null,
      source,
      confidence_score: conf,
      created_by: user.id,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json(
      {
        success: false,
        inserted: 0,
        skipped: skipped.length,
        skippedDetails: skipped,
        error: "Nenhuma vacina pôde ser salva. Confira as datas (formato esperado: AAAA-MM-DD ou DD/MM/AAAA).",
      },
      { status: 400 },
    );
  }

  const { data: inserted, error } = await admin
    .from("vaccination_records")
    .insert(rows)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  captureServerEvent(user.id, "vaccines_bulk_inserted", {
    count: rows.length,
    skipped: skipped.length,
    source,
    avg_confidence: rows.length > 0
      ? (rows.reduce(
          (acc, r) => acc + ((r.confidence_score as number | null) ?? 0),
          0,
        ) / rows.length)
      : null,
    group_id: groupId,
  });

  // Saúde Foundation: dispara notificações pra cada vacina inserida. O
  // coalescing 60s da Foundation transforma N pushes individuais em uma
  // notificação agregada ("Amanda registrou N vacinas") no device do
  // coparente. Inbox em-app mostra cada uma separadamente.
  if (inserted && inserted.length > 0) {
    const [profileRes, childRes] = await Promise.all([
      admin.from("profiles").select("full_name").eq("id", user.id).single(),
      admin.from("children").select("full_name").eq("id", childId).single(),
    ]);
    const actorName = (profileRes.data?.full_name as string | undefined)?.split(" ")[0] || "Alguém";
    const childName = (childRes.data?.full_name as string | undefined)?.split(" ")[0];
    // Em paralelo — coalescing dedup já cuida de evitar spam no device.
    await Promise.allSettled(
      inserted.map((row, idx) =>
        notifySaudeCreate({
          recordType: "vaccination_record",
          recordId: row.id as string,
          groupId,
          actorUserId: user.id,
          actorFirstName: actorName,
          childFirstName: childName,
          description: rows[idx]?.vaccine_name as string,
        }),
      ),
    );
  }

  revalidateTag(`health-${groupId}`, "max");
  revalidatePath("/saude");
  return NextResponse.json({
    success: true,
    inserted: inserted?.length ?? 0,
    skipped: skipped.length,
    skippedDetails: skipped,
  });
}
