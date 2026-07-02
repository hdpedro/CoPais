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
import { isBrainEnabledForGroup, isHealthVisitEnabled, isEventInviteEnabled } from "@/lib/services/brain-flag";
import { validateImageUpload } from "@/lib/ai/brain/upload-guard";
import { classifyDocumentByVision } from "@/lib/ai/document-classifier";
import { createAndAnalyzeIntake } from "@/lib/services/brain";
import { buildHealthPreviewMessage } from "@/lib/ai/brain/health-preview";
import { buildInvitePreviewMessage } from "@/lib/ai/brain/invite-preview";
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
    // 2º passo: o usuário já escolheu a criança (botão) → reprocessa a MESMA
    // foto atribuindo a ela (paridade com o WhatsApp — sem reenviar/trocar tela).
    const requestedChildId = (form.get("child_id") as string | null) || null;

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
    const mime = guard.type;

    /** Processa a foto como calendário escolar (gated no beta) e devolve o
     *  preview inline — ou os botões de criança quando não dá pra atribuir. */
    async function handleCalendar(): Promise<NextResponse> {
      if (!(await isBrainEnabledForGroup(supabase, group!.groupId))) {
        return NextResponse.json(
          { content: "📚 Parece um calendário escolar! O recurso de leitura de calendário ainda está chegando pra você." },
          { status: 200 },
        );
      }
      const { data: childRows } = await supabase
        .from("children")
        .select("id, full_name, birth_date")
        .eq("group_id", group!.groupId);
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
        groupId: group!.groupId,
        userId: auth!.id,
        channel: "pwa",
        buffer,
        mime,
        children,
        requestedChildId,
      });

      if (result.kind === "preview") {
        const acts = result.preview.plan.activities ?? [];
        const childName = children.find((c) => c.id === (acts[0]?.childId ?? null))?.name || "seu filho(a)";
        const n = acts.length;
        const already = result.preview.alreadyPresent ?? 0;
        const alreadyNote =
          already > 0
            ? ` (${already === 1 ? "1 já estava" : `${already} já estavam`} no Kindar, mostro só ${n === 1 ? "a nova" : "as novas"})`
            : "";
        return NextResponse.json(
          {
            content: `📚 É um calendário escolar! Encontrei ${n === 1 ? "1 prova" : `${n} provas`} para ${childName}${alreadyNote}. Quer que eu adicione? Você pode revisar tudo em Escola › Calendário.`,
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
      if (result.kind === "duplicate") {
        // Reenvio do MESMO calendário: nada a adicionar (cérebro único).
        return NextResponse.json({ content: result.message, link: "/escola/calendario" }, { status: 200 });
      }
      if (result.kind === "needs_child_selection") {
        // Paridade com o WhatsApp: pergunta CONVERSACIONAL (botões), sem pedir
        // pra reenviar ou trocar de tela. O widget re-posta a mesma foto com
        // child_id ao tocar num nome.
        return NextResponse.json(
          {
            content: "📚 É um calendário escolar! De qual criança é? É só tocar no nome:",
            childSelection: {
              options: (result.options ?? children).map((c) => ({ id: c.id, name: c.name })),
            },
          },
          { status: 200 },
        );
      }
      if (result.kind === "unknown_document") {
        return NextResponse.json({ content: "Achei que fosse um calendário, mas não consegui ler as provas. Tente uma foto mais nítida. 🙂" }, { status: 200 });
      }
      return NextResponse.json({ content: "Não consegui processar o calendário agora. Tente de novo em instantes. 🙏" }, { status: 200 });
    }

    /** Processa a foto como CONSULTA médica (gate próprio da saúde + beta) e
     *  devolve o preview inline — ou os botões de criança. Espelha handleCalendar.
     *  O confirm/undo do widget é docType-agnóstico (confirmIntake dispatcha). */
    async function handleHealthVisit(): Promise<NextResponse> {
      if (!isHealthVisitEnabled() || !(await isBrainEnabledForGroup(supabase, group!.groupId))) {
        return NextResponse.json(
          { content: "🩺 Parece uma consulta médica! A leitura de consultas ainda está chegando pra você." },
          { status: 200 },
        );
      }
      const { data: childRows } = await supabase
        .from("children")
        .select("id, full_name, birth_date")
        .eq("group_id", group!.groupId);
      const children: BrainChild[] = (childRows ?? []).map((c) => ({
        id: c.id as string,
        name: (c.full_name as string) ?? "",
        birthDate: (c.birth_date as string | null) ?? undefined,
      }));
      if (children.length === 0) {
        return NextResponse.json({ content: "🩺 É uma consulta! Cadastre uma criança no grupo antes de registrar." }, { status: 200 });
      }

      const result = await createAndAnalyzeIntake({
        supabase,
        groupId: group!.groupId,
        userId: auth!.id,
        channel: "pwa",
        buffer,
        mime,
        children,
        requestedChildId,
        docType: "health_visit",
      });

      if (result.kind === "preview") {
        const health = result.preview.plan.health;
        const childId = health?.appointment.childId ?? null;
        const childName = children.find((c) => c.id === childId)?.name || "seu filho(a)";
        return NextResponse.json(
          {
            content: health ? buildHealthPreviewMessage(health, childName) : "🩺 Organizei a consulta. Quer que eu registre?",
            intake: {
              id: result.preview.intakeId,
              planHash: result.preview.planHash,
              confirmationToken: result.preview.confirmationToken,
              count: health?.medications?.length ?? 0,
              // O widget usa `doc` pra falar de CONSULTA (não "provas") no confirmar/desfazer.
              doc: "health",
            },
            link: "/saude",
          },
          { status: 200 },
        );
      }
      if (result.kind === "duplicate") {
        return NextResponse.json({ content: result.message, link: "/saude" }, { status: 200 });
      }
      if (result.kind === "needs_child_selection") {
        // `doc: "health"` faz o widget reenviar a foto marcada como saúde (o
        // resubmit dispatcha handleHealthVisit em vez de handleCalendar).
        return NextResponse.json(
          {
            content: "🩺 É uma consulta médica! De qual criança é? É só tocar no nome:",
            childSelection: { doc: "health", options: (result.options ?? children).map((c) => ({ id: c.id, name: c.name })) },
          },
          { status: 200 },
        );
      }
      if (result.kind === "unknown_document") {
        return NextResponse.json({ content: "Achei que fosse uma consulta, mas não consegui ler os detalhes. Tente uma foto mais nítida. 🙂" }, { status: 200 });
      }
      return NextResponse.json({ content: "Não consegui processar a consulta agora. Tente de novo em instantes. 🙏" }, { status: 200 });
    }

    /** Processa a foto como CONVITE (aniversário/festa/reunião…) e devolve o
     *  preview inline — ou os botões de criança. Espelha handleHealthVisit. */
    async function handleEventInvite(): Promise<NextResponse> {
      if (!isEventInviteEnabled() || !(await isBrainEnabledForGroup(supabase, group!.groupId))) {
        return NextResponse.json(
          { content: "🎉 Parece um convite! A leitura de convites ainda está chegando pra você." },
          { status: 200 },
        );
      }
      const { data: childRows } = await supabase
        .from("children")
        .select("id, full_name, birth_date")
        .eq("group_id", group!.groupId);
      const children: BrainChild[] = (childRows ?? []).map((c) => ({
        id: c.id as string,
        name: (c.full_name as string) ?? "",
        birthDate: (c.birth_date as string | null) ?? undefined,
      }));
      if (children.length === 0) {
        return NextResponse.json({ content: "🎉 É um convite! Cadastre uma criança no grupo antes de adicionar." }, { status: 200 });
      }

      const result = await createAndAnalyzeIntake({
        supabase,
        groupId: group!.groupId,
        userId: auth!.id,
        channel: "pwa",
        buffer,
        mime,
        children,
        requestedChildId,
        docType: "event_invite",
      });

      if (result.kind === "preview") {
        const invite = result.preview.plan.invite;
        const nameOf = (id: string) => children.find((c) => c.id === id)?.name.split(" ")[0] ?? "";
        return NextResponse.json(
          {
            content: invite
              ? buildInvitePreviewMessage(invite, nameOf)
              : "🎉 Organizei o convite. Quer que eu adicione ao calendário?",
            intake: {
              id: result.preview.intakeId,
              planHash: result.preview.planHash,
              confirmationToken: result.preview.confirmationToken,
              count: 1,
              // O widget usa `doc` pra falar de EVENTO no confirmar/desfazer.
              doc: "invite",
            },
            link: "/calendario",
          },
          { status: 200 },
        );
      }
      if (result.kind === "duplicate") {
        return NextResponse.json({ content: result.message, link: "/calendario" }, { status: 200 });
      }
      if (result.kind === "needs_child_selection") {
        return NextResponse.json(
          {
            content: "🎉 É um convite! De qual criança é? É só tocar no nome:",
            childSelection: { doc: "invite", options: (result.options ?? children).map((c) => ({ id: c.id, name: c.name })) },
          },
          { status: 200 },
        );
      }
      if (result.kind === "unknown_document") {
        return NextResponse.json({ content: "Achei que fosse um convite, mas não consegui ler a data. Tente uma foto mais nítida. 🙂" }, { status: 200 });
      }
      return NextResponse.json({ content: "Não consegui processar o convite agora. Tente de novo em instantes. 🙏" }, { status: 200 });
    }

    // 2º passo (criança escolhida): dispatcha pelo tipo que o widget devolveu.
    // Sem `doc` → calendário (byte-idêntico); `doc=health` → consulta;
    // `doc=invite` → convite.
    if (requestedChildId) {
      const doc = form.get("doc") as string | null;
      if (doc === "health") return await handleHealthVisit();
      if (doc === "invite") return await handleEventInvite();
      return await handleCalendar();
    }

    // 1º passo: classificação por VISÃO — a MESMA do WhatsApp (cérebro único).
    const cls = await classifyDocumentByVision(buffer, undefined);
    if (cls.type === "school_calendar" && cls.confidence >= 0.6) return await handleCalendar();
    // Consulta médica / receita → playbook de saúde (gate próprio OFF por padrão:
    // com o gate OFF cai no routeMessage abaixo = comportamento ATUAL).
    if (
      isHealthVisitEnabled() &&
      (cls.type === "medical_summary" || cls.type === "prescription") &&
      cls.confidence >= 0.6
    ) {
      return await handleHealthVisit();
    }
    // Convite (aniversário/festa/reunião…) → evento no calendário. Flag OFF →
    // cai no routeMessage abaixo (comportamento atual).
    if (isEventInviteEnabled() && cls.type === "event_invite" && cls.confidence >= 0.6) {
      return await handleEventInvite();
    }

    // Outros tipos → mensagem + link pra tela certa.
    return NextResponse.json(routeMessage(cls.type), { status: 200 });
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "assistant_image" } });
    return NextResponse.json({ content: "Não consegui processar a imagem agora. Tente de novo em instantes. 🙏" }, { status: 200 });
  }
}
