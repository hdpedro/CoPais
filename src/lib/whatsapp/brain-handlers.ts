/* ------------------------------------------------------------------ */
/* brain-handlers.ts — I/O do Kindar Brain no WhatsApp (Passo 2b)       */
/*                                                                      */
/* Liga o núcleo PURO (brain-flow.ts) ao processador real: recebe a     */
/* foto do calendário escolar, chama o cérebro COMPARTILHADO             */
/* (createAndAnalyzeIntake, channel:"whatsapp") e conduz a conversa de  */
/* confirmar / escolher (deseleção) / cancelar / desfazer via estado de */
/* sessão. Mesmo cérebro do PWA — só o canal muda. O ator (confirm/undo)*/
/* sai do user_id resolvido pelo telefone; o processor usa client        */
/* service_role, então passamos actorUserId explícito (migration 00132).*/
/* pt-BR literal é permitido em src/lib/whatsapp/ (bot é pt-BR).         */
/* ------------------------------------------------------------------ */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAndAnalyzeIntake, confirmIntake } from "@/lib/services/brain";
import { undoIntake } from "@/lib/services/brain-undo";
import { isBrainEnabledForGroup } from "@/lib/services/brain-flag";
import { validateImageUpload } from "@/lib/ai/brain/upload-guard";
import { getServerT } from "@/i18n/server";
import type { BrainChild } from "@/lib/ai/brain/types";
import { downloadMedia, sendTextMessage, sendButtonMessage } from "./client";
import { matchChildFromCaption } from "./caption-match";
import { notifyGroupViaWhatsApp } from "./notify";
import { setBrainIntake, clearPendingAction, type WASession } from "./session";
import { renderPreview, renderExecuted, renderUndone, parseKeepIndices } from "./brain-flow";
import type { WAExtractedMessage } from "./types";

const CANCEL_RE = /\b(cancelar|cancela|deixa|esquece|para|nao|não)\b/i;
const UNDO_RE = /\b(desfazer|desfaz|desfa[cç]a|reverter|apagar|remover)\b/i;

/**
 * Foto de calendário escolar → intake → preview conversacional. Retorna
 * `true` se tratou a mensagem; `false` (beta off) para o processor seguir com
 * o roteamento normal de imagem (recibo etc.), preservando o comportamento
 * atual pra quem não está no beta.
 */
export async function handleCalendarImage(
  supabase: SupabaseClient,
  phone: string,
  userId: string,
  groupId: string,
  message: WAExtractedMessage,
  session: WASession,
): Promise<boolean> {
  if (!message.mediaId) return false;
  if (!(await isBrainEnabledForGroup(supabase, groupId))) return false; // não-beta → fluxo normal

  await sendTextMessage(phone, "📚 Analisando o calendário escolar…");

  const buffer = await downloadMedia(message.mediaId);
  const val = validateImageUpload(buffer);
  if (!val.ok || !val.type) {
    await sendTextMessage(
      phone,
      "Não consegui ler essa imagem. Tente uma foto nítida do calendário (JPG ou PNG). 🙏",
    );
    return true;
  }

  const { data: rows } = await supabase
    .from("children")
    .select("id, full_name, birth_date")
    .eq("group_id", groupId);
  const captionKids = (rows ?? []).map((r) => ({
    id: r.id as string,
    full_name: (r.full_name as string) ?? null,
    birth_date: (r.birth_date as string) ?? null,
  }));
  if (captionKids.length === 0) {
    await sendTextMessage(
      phone,
      "Você ainda não tem crianças cadastradas no Kindar. Cadastre pelo app antes de enviar o calendário. 🙏",
    );
    return true;
  }
  const children: BrainChild[] = captionKids.map((k) => ({
    id: k.id,
    name: (k.full_name || "").split(" ")[0] || "criança",
  }));

  // >1 criança: tenta o nome na legenda; senão deixa o cérebro pedir a escolha.
  const matched = captionKids.length > 1 ? matchChildFromCaption(message.caption, captionKids) : captionKids[0];
  const requestedChildId = matched?.id ?? null;

  const result = await createAndAnalyzeIntake({
    supabase,
    groupId,
    userId,
    channel: "whatsapp",
    source: "document",
    buffer,
    mime: val.type,
    children,
    requestedChildId,
  });

  switch (result.kind) {
    case "preview": {
      const acts = result.preview.plan.activities ?? [];
      const resolvedChildId = acts[0]?.childId ?? requestedChildId;
      const childName = children.find((c) => c.id === resolvedChildId)?.name ?? "seu filho(a)";
      const t = await getServerT("pt");
      const previewText = renderPreview(result.preview, childName, t, { withCta: false });
      await sendTextMessage(phone, previewText);
      await sendButtonMessage(phone, "Posso adicionar essas provas ao Kindar?", [
        { id: "brain_confirm", title: "Confirmar" },
        { id: "brain_choose", title: "Escolher" },
        { id: "brain_cancel", title: "Cancelar" },
      ]);
      await setBrainIntake(supabase, session.id, {
        intake_id: result.preview.intakeId,
        plan_hash: result.preview.planHash,
        confirmation_token: result.preview.confirmationToken,
        child_name: childName,
        total: acts.length,
        phase: "preview",
      });
      return true;
    }
    case "needs_child_selection": {
      const names = result.options.map((o) => o.name).join(", ");
      await sendTextMessage(
        phone,
        `De qual criança é esse calendário? Reenvie a foto com o nome na legenda (ex: *calendário Otto*).\n\nCrianças: ${names}.`,
      );
      return true;
    }
    case "unknown_document":
      await sendTextMessage(
        phone,
        "Isso não parece um calendário de provas. Se for, tente uma foto mais nítida. 🙂",
      );
      return true;
    case "duplicate":
      await sendTextMessage(phone, result.message);
      return true;
    default:
      await sendTextMessage(phone, "Não consegui processar agora. Tente de novo em instantes. 🙏");
      return true;
  }
}

/**
 * Resposta do usuário durante um fluxo do Brain (preview → confirmar/escolher/
 * cancelar; executed → desfazer). Retorna `true` se tratou; `false` para o
 * processor seguir processando a mensagem normalmente (ex: já executado e o
 * usuário mandou outra coisa).
 */
export async function handleBrainReply(
  supabase: SupabaseClient,
  phone: string,
  userId: string,
  groupId: string,
  message: WAExtractedMessage,
  session: WASession,
): Promise<boolean> {
  const brain = session.state.brain_intake;
  if (!brain) return false;
  const text = (message.text || "").trim();
  const btn = message.buttonReplyId;

  /* ---- fase executed: só aguarda "Desfazer" ---- */
  if (brain.phase === "executed") {
    if (btn === "brain_undo" || UNDO_RE.test(text)) {
      const r = await undoIntake({ supabase, intakeId: brain.intake_id, actorUserId: userId });
      await clearPendingAction(supabase, session.id);
      await sendTextMessage(phone, r.kind === "undone" ? renderUndone(r.removed) : "Não consegui desfazer agora. Tente pelo app. 🙏");
      return true;
    }
    // Outra coisa qualquer → encerra o fluxo e deixa processar como mensagem nova.
    await clearPendingAction(supabase, session.id);
    return false;
  }

  /* ---- fase preview ---- */
  if (btn === "brain_cancel" || (!btn && CANCEL_RE.test(text) && !/\d/.test(text))) {
    await clearPendingAction(supabase, session.id);
    await sendTextMessage(phone, "Ok, não adicionei nada. Pode reenviar a foto quando quiser. 🙂");
    return true;
  }

  if (btn === "brain_choose") {
    // Reabre a janela e pede os números; a próxima mensagem cai no parseKeepIndices.
    await setBrainIntake(supabase, session.id, brain);
    await sendTextMessage(
      phone,
      `Quais provas você quer adicionar? Responda os números — ex: *tirar 2 e 4* (remove essas) ou *manter 1 e 3* (só essas). Ou *Confirmar* pra todas.`,
    );
    return true;
  }

  if (btn === "brain_confirm") {
    return await confirmBrain(supabase, phone, userId, groupId, session, brain, undefined);
  }

  // Texto: pode ser "confirmar/todas" (→ todas) ou deseleção ("tirar 2 e 4").
  const keep = parseKeepIndices(text, brain.total);
  if (keep === null) {
    await sendTextMessage(
      phone,
      `Não entendi. Responda *Confirmar* pra adicionar todas, diga quais tirar (ex: *tirar 2 e 4*), ou *Cancelar*.`,
    );
    return true;
  }
  // parseKeepIndices devolve todos os índices quando é "confirmar/todas".
  const keepIndices = keep.length === brain.total ? undefined : keep;
  if (keepIndices !== undefined && keepIndices.length === 0) {
    await sendTextMessage(phone, "Assim não sobra nenhuma prova pra adicionar. Escolha ao menos uma, ou *Cancelar*.");
    return true;
  }
  return await confirmBrain(supabase, phone, userId, groupId, session, brain, keepIndices);
}

/** Confirma o intake (subconjunto opcional), avisa o grupo e arma o Desfazer. */
async function confirmBrain(
  supabase: SupabaseClient,
  phone: string,
  userId: string,
  groupId: string,
  session: WASession,
  brain: NonNullable<WASession["state"]["brain_intake"]>,
  keepIndices: number[] | undefined,
): Promise<boolean> {
  const r = await confirmIntake({
    supabase,
    intakeId: brain.intake_id,
    planHash: brain.plan_hash,
    confirmationToken: brain.confirmation_token,
    keepIndices,
    actorUserId: userId,
  });

  if (r.kind === "executed") {
    await setBrainIntake(supabase, session.id, { ...brain, phase: "executed", created_count: r.createdCount });
    await sendTextMessage(phone, renderExecuted(r.createdCount));
    await sendButtonMessage(phone, "Precisa reverter?", [{ id: "brain_undo", title: "Desfazer" }]);
    // Coordenação: avisa os coparentes (menos quem confirmou). Fire-and-forget.
    const n = r.createdCount === 1 ? "1 prova" : `${r.createdCount} provas`;
    await notifyGroupViaWhatsApp(
      groupId,
      userId,
      `📚 *${brain.child_name}*: ${n} adicionada(s) ao calendário escolar do Kindar.`,
      "event",
    );
    return true;
  }

  if (r.kind === "stale_plan") {
    await clearPendingAction(supabase, session.id);
    await sendTextMessage(phone, r.message);
    return true;
  }
  if (r.kind === "already_processing") {
    await clearPendingAction(supabase, session.id);
    await sendTextMessage(phone, "Essas provas já estão sendo adicionadas. 🙂");
    return true;
  }
  await sendTextMessage(phone, r.kind === "error" ? r.message : "Não consegui confirmar agora. Tente de novo. 🙏");
  return true;
}
