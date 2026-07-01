/* ------------------------------------------------------------------ */
/* POST /api/ai/assistant/image — imagem no assistente Kindar (Fase 2)   */
/*                                                                      */
/* PARIDADE com o WhatsApp: o assistente do app ganha entrada de imagem. */
/* Fluxo: auth → grupo → valida → classifica por VISÃO (o MESMO          */
/* classifyDocumentByVision do WhatsApp) → roteia:                       */
/*  - calendário escolar (grupo beta) → createAndAnalyzeIntake → devolve  */
/*    um preview que o widget confirma INLINE (sem reenviar).            */
/*  - outros tipos → mensagem + link pra tela certa (recibo/saúde).      */
/* Retorna { content } (+ intake p/ confirmar, + link) pro chat renderizar.*/
/* ------------------------------------------------------------------ */

import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { isBrainEnabledForGroup } from "@/lib/services/brain-flag";
import { validateImageUpload } from "@/lib/ai/brain/upload-guard";
import { classifyDocumentByVision } from "@/lib/ai/document-classifier";
import { createAndAnalyzeIntake } from "@/lib/services/brain";
import type { BrainChild } from "@/lib/ai/brain/types";

const FILE = "src/app/api/ai/assistant/image/route.ts";

/** Mensagem + link pra cada tipo que ainda não é processado inline. */
function routeMessage(type: string): { content: string; link?: string } {
  switch (type) {
    case "receipt":
      return { content: "Isso parece um recibo de despesa 🧾. Registre em Despesas para dividir com o coparente.", link: "/despesas/nova" };
    case "prescription":
      return { content: "Isso parece uma receita médica 💊. Anexe em Saúde › Documentos para eu extrair os medicamentos.", link: "/saude" };
    case "vaccine_proof":
      return { content: "Isso parece um comprovante de vacina 💉. Anexe em Saúde › Vacinas.", link: "/saude" };
    case "attestation":
    case "exam":
      return { content: "Isso parece um documento de saúde 📄. Anexe em Saúde › Documentos.", link: "/saude" };
    default:
      return { content: "Não tenho certeza do que é essa imagem 🤔. Você pode me contar o que gostaria de fazer com ela?" };
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await resolveAuthenticatedUser(request);
    if (!auth) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const supabase = await createClient();
    const group = await getActiveGroup(supabase, auth.id);
    if (!group) return NextResponse.json({ error: "Sem grupo ativo." }, { status: 403 });

    const form = (await request.formData()) as unknown as globalThis.FormData;
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const guard = validateImageUpload(buffer);
    if (!guard.ok || !guard.type) {
      // PDF/tipos não suportados: orienta (por ora, só foto).
      const msg =
        guard.reason === "too_large"
          ? "Imagem muito grande (máx. 8 MB)."
          : "Por enquanto eu leio FOTOS (JPEG, PNG ou WebP). Se for um PDF, tire um print ou foto da página e me mande. 🙏";
      return NextResponse.json({ content: msg }, { status: 200 });
    }

    // Classificação por VISÃO — a MESMA do WhatsApp (cérebro único).
    const cls = await classifyDocumentByVision(buffer, undefined);

    // Calendário escolar → processa pelo Brain (gated no beta), devolve preview.
    if (cls.type === "school_calendar" && cls.confidence >= 0.6) {
      if (!(await isBrainEnabledForGroup(supabase, group.groupId))) {
        return NextResponse.json(
          { content: "📚 Parece um calendário escolar! O recurso de leitura de calendário ainda está chegando pra você." },
          { status: 200 },
        );
      }
      const { data: childRows } = await supabase
        .from("children")
        .select("id, full_name, birth_date")
        .eq("group_id", group.groupId);
      const children: BrainChild[] = (childRows ?? []).map((c) => ({
        id: c.id as string,
        name: (c.full_name as string) ?? "",
        birthDate: (c.birth_date as string | null) ?? undefined,
      }));
      if (children.length === 0) {
        return NextResponse.json({ content: "📚 É um calendário escolar! Cadastre uma criança no grupo antes de adicionar as provas." }, { status: 200 });
      }

      const result = await createAndAnalyzeIntake({
        supabase,
        groupId: group.groupId,
        userId: auth.id,
        channel: "pwa",
        buffer,
        mime: guard.type,
        children,
        requestedChildId: (form.get("child_id") as string | null) || null,
      });

      if (result.kind === "preview") {
        const acts = result.preview.plan.activities ?? [];
        const childName = children.find((c) => c.id === (acts[0]?.childId ?? null))?.name || "seu filho(a)";
        const n = acts.length;
        return NextResponse.json(
          {
            content: `📚 É um calendário escolar! Encontrei ${n === 1 ? "1 prova" : `${n} provas`} para ${childName}. Quer que eu adicione? Você pode revisar tudo em Escola › Calendário.`,
            intake: {
              id: result.preview.intakeId,
              planHash: result.preview.planHash,
              confirmationToken: result.preview.confirmationToken,
              count: n,
            },
            link: "/escola/calendario",
          },
          { status: 200 },
        );
      }
      if (result.kind === "needs_child_selection") {
        return NextResponse.json(
          { content: "📚 É um calendário escolar! Abra Escola › Calendário pra escolher de qual criança é e confirmar.", link: "/escola/calendario" },
          { status: 200 },
        );
      }
      if (result.kind === "unknown_document") {
        return NextResponse.json({ content: "Achei que fosse um calendário, mas não consegui ler as provas. Tente uma foto mais nítida. 🙂" }, { status: 200 });
      }
      return NextResponse.json({ content: "Não consegui processar o calendário agora. Tente de novo em instantes. 🙏" }, { status: 200 });
    }

    // Outros tipos → mensagem + link pra tela certa.
    return NextResponse.json(routeMessage(cls.type), { status: 200 });
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "assistant_image" } });
    return NextResponse.json({ content: "Não consegui processar a imagem agora. Tente de novo em instantes. 🙏" }, { status: 200 });
  }
}
