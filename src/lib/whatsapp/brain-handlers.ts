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
import { reportServerError } from "@/lib/error-tracking/report-server";
import { captureServerEvent } from "@/lib/posthog-server";
import { getServerT } from "@/i18n/server";
import type { BrainChild } from "@/lib/ai/brain/types";
import { downloadMedia, sendTextMessage, sendButtonMessage } from "./client";
import { matchChildFromCaption } from "./caption-match";
import { notifyGroupViaWhatsApp } from "./notify";
import { setBrainIntake, setBrainFallbackPhoto, clearPendingAction, type WASession } from "./session";
import {
  renderPreview,
  renderExecuted,
  renderUndone,
  classifyBrainReply,
  isUndoReply,
  isCalendarYes,
} from "./brain-flow";
import type { WAExtractedMessage } from "./types";

const FILE = "src/lib/whatsapp/brain-handlers.ts";

/**
 * Foto de calendário escolar (roteada por legenda) → análise. Retorna `true`
 * se tratou; `false` (beta off) para o processor seguir com o roteamento normal
 * de imagem (recibo etc.), preservando o comportamento de quem não está no beta.
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
  return analyzeCalendarPhoto(supabase, phone, userId, groupId, message.mediaId, message.caption ?? null, session);
}

/**
 * Baixa a mídia, valida, resolve criança e chama o cérebro compartilhado →
 * preview conversacional. Reusado pelo caminho por-legenda (handleCalendarImage)
 * e pelo FALLBACK de recibo (imagem sem legenda que não é recibo). O caller já
 * garantiu o gate de beta. Todo throw é contido: o usuário SEMPRE recebe um
 * fechamento (nunca fica no "Analisando…" sem resposta).
 */
export async function analyzeCalendarPhoto(
  supabase: SupabaseClient,
  phone: string,
  userId: string,
  groupId: string,
  mediaId: string,
  caption: string | null,
  session: WASession,
  /** Buffer já baixado (ex: o classificador por visão já baixou) — evita
   *  re-download. Ausente → baixa por mediaId. */
  preBuffer?: Buffer,
  /** Chamado a partir da classificação por visão (não da legenda explícita).
   *  Nesse caso NÃO afirma "é um calendário" de cara (o classificador pode ter
   *  errado) e, se o cérebro rejeitar (unknown/erro), retorna FALSE pro
   *  processor cair no fluxo de recibo — em vez de dizer "não parece calendário"
   *  e encerrar (evita o dead-end do recibo). */
  fromClassifier = false,
): Promise<boolean> {
  try {
    // Se acabou de criar um lote (executed) e não desfez, avisa que ele já
    // está salvo — a nova foto vai substituir o estado e o Desfazer daquele
    // lote passa a ser só pelo app (evita a promessa "responda Desfazer" quebrar
    // em silêncio).
    if (session.state.brain_intake?.phase === "executed") {
      await sendTextMessage(
        phone,
        "As provas anteriores já estão salvas ✅ (se precisar reverter aquele lote, use o app). Analisando o novo calendário…",
      );
    }

    // Disclosure (paridade com o aviso de compartilhamento do PWA): a imagem é
    // lida por IA e as provas ficam visíveis ao grupo. No caminho do
    // classificador o ack genérico ("Analisando a imagem 🔍") já foi enviado e
    // ainda não afirmamos que É calendário — então pulamos aqui.
    if (!fromClassifier) {
      await sendTextMessage(
        phone,
        "📚 Vou ler esse calendário pra identificar as provas — elas ficam visíveis aos responsáveis do grupo. Analisando…",
      );
    }

    const buffer = preBuffer ?? (await downloadMedia(mediaId));
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
    const matched = captionKids.length > 1 ? matchChildFromCaption(caption ?? undefined, captionKids) : captionKids[0];
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
        // Caminho do classificador: agora CONFIRMAMOS que é calendário → dá a
        // disclosure de compartilhamento (que foi pulada no início).
        if (fromClassifier) {
          await sendTextMessage(
            phone,
            "📚 É um calendário escolar! As provas ficam visíveis aos responsáveis do grupo.",
          );
        }
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
        // Classificador achou que era calendário, mas o cérebro rejeitou →
        // NÃO era. Devolve false pro processor tentar como RECIBO (sem
        // dead-end). No caminho por legenda, o usuário disse que era calendário
        // → mensagem calma.
        if (fromClassifier) return false;
        await sendTextMessage(
          phone,
          "Isso não parece um calendário de provas. Se for, tente uma foto mais nítida. 🙂",
        );
        return true;
      case "duplicate":
        await sendTextMessage(phone, result.message);
        return true;
      default:
        if (fromClassifier) return false; // deixa cair no recibo
        await sendTextMessage(phone, "Não consegui processar agora. Tente de novo em instantes. 🙏");
        return true;
    }
  } catch (err) {
    // downloadMedia (URL da Meta expirada/401), rede, etc. — nunca deixar o
    // usuário no "Analisando…" sem resposta.
    await reportServerError(err, { filePath: FILE, metadata: { step: "analyzeCalendarPhoto", groupId } });
    if (fromClassifier) return false; // classificador: cai no recibo em vez de travar
    await sendTextMessage(phone, "Não consegui processar o calendário agora. Reenvie a foto em instantes. 🙏");
    return true;
  }
}

/**
 * Resposta do usuário durante um fluxo do Brain (preview → confirmar/escolher/
 * cancelar; executed → desfazer). Retorna `true` se tratou; `false` para o
 * processor seguir processando a mensagem normalmente — o que EVITA sequestrar
 * o assistente: uma mensagem qualquer ("qual o saldo?") durante um preview
 * pendente cai no assistente, e o preview continua vivo até o timeout.
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

  /* ---- fase executed: só "Desfazer" (botão ou verbo ancorado) ---- */
  if (brain.phase === "executed") {
    if (btn === "brain_undo" || isUndoReply(text)) {
      const r = await undoIntake({ supabase, intakeId: brain.intake_id, actorUserId: userId });
      await clearPendingAction(supabase, session.id);
      await sendTextMessage(
        phone,
        r.kind === "undone" ? renderUndone(r.removed, r.detached) : "Não consegui desfazer agora. Tente pelo app. 🙏",
      );
      return true;
    }
    // Não é undo → deixa o assistente responder, MANTENDO o estado (o "Desfazer"
    // continua disponível até o timeout de 30min). Sem clear = sem lockout.
    return false;
  }

  /* ---- fase preview ---- */
  if (btn === "brain_cancel") {
    await clearPendingAction(supabase, session.id);
    captureServerEvent(userId, "brain_intake_cancelled", { intake_id: brain.intake_id, via: "button" });
    await sendTextMessage(phone, "Ok, não adicionei nada. Pode reenviar a foto quando quiser. 🙂");
    return true;
  }
  if (btn === "brain_choose") {
    await setBrainIntake(supabase, session.id, { ...brain, awaiting_selection: true });
    await sendTextMessage(
      phone,
      `Quais provas você quer adicionar? Responda os números — ex: *tirar 2 e 4* (remove essas) ou *manter 1 e 3* (só essas). Ou *Confirmar* pra todas.`,
    );
    return true;
  }
  if (btn === "brain_confirm") {
    return await confirmBrain(supabase, phone, userId, groupId, session, brain, undefined);
  }

  // Texto: classifica com segurança (NUNCA confirma por engano).
  const intent = classifyBrainReply(text, brain.total, brain.awaiting_selection === true);
  switch (intent.action) {
    case "confirm":
      return await confirmBrain(supabase, phone, userId, groupId, session, brain, undefined);
    case "cancel":
      await clearPendingAction(supabase, session.id);
      captureServerEvent(userId, "brain_intake_cancelled", { intake_id: brain.intake_id, via: "text" });
      await sendTextMessage(phone, "Ok, não adicionei nada. Pode reenviar a foto quando quiser. 🙂");
      return true;
    case "deselect":
      captureServerEvent(userId, "brain_intake_deselected", {
        intake_id: brain.intake_id,
        kept: intent.keepIndices.length,
        total: brain.total,
      });
      return await confirmBrain(supabase, phone, userId, groupId, session, brain, intent.keepIndices);
    case "empty_selection":
      await sendTextMessage(
        phone,
        "Assim não sobra nenhuma prova pra adicionar. Escolha ao menos uma, ou responda *Cancelar*.",
      );
      return true;
    case "bad_numbers":
      await sendTextMessage(
        phone,
        `Não entendi os números. Eles vão de 1 a ${brain.total}. Ex: *tirar 2 e 4*, *manter 1 e 3*, ou *Confirmar* pra todas.`,
      );
      return true;
    default:
      // Não é resposta ao Brain → assistente responde; preview segue vivo.
      return false;
  }
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
    await setBrainIntake(supabase, session.id, { ...brain, phase: "executed", created_count: r.createdCount, awaiting_selection: false });
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

/**
 * Chamado quando o OCR de RECIBO falhou numa imagem. Em grupo beta, oferece o
 * Brain como fallback (a foto pode ser um calendário sem legenda — caso comum:
 * família manda a foto sem escrever nada). Guarda o media_id e pede um "sim".
 * Retorna true se ofereceu (o caller NÃO manda a mensagem de recibo-falhou);
 * false se não é beta (caller segue normal). Não hijacka recibo: só entra
 * DEPOIS do OCR de recibo falhar.
 */
export async function offerBrainAfterReceiptFail(
  supabase: SupabaseClient,
  phone: string,
  groupId: string,
  mediaId: string,
  session: WASession,
): Promise<boolean> {
  if (!(await isBrainEnabledForGroup(supabase, groupId))) return false;
  await setBrainFallbackPhoto(supabase, session.id, { media_id: mediaId });
  await sendTextMessage(
    phone,
    "Não consegui ler como recibo 🧾. Se for um *calendário de provas/escola*, responda *calendário* que eu leio as provas pra você. 📚",
  );
  return true;
}

/**
 * Resposta ao fallback de recibo→calendário. "sim/calendário/provas" →
 * reprocessa a foto guardada pelo Brain (sem precisar reenviar). Outra coisa →
 * limpa e devolve false (o caller processa como mensagem nova).
 */
export async function handleReceiptFallbackReply(
  supabase: SupabaseClient,
  phone: string,
  userId: string,
  groupId: string,
  message: WAExtractedMessage,
  session: WASession,
): Promise<boolean> {
  const pending = session.state.brain_fallback_photo;
  if (!pending) return false;
  const text = (message.text || "").trim();

  if (isCalendarYes(text)) {
    await clearPendingAction(supabase, session.id); // sai do estado de fallback
    return analyzeCalendarPhoto(supabase, phone, userId, groupId, pending.media_id, null, session);
  }
  // Não é "sim" → encerra o fallback e deixa o assistente responder a msg nova.
  await clearPendingAction(supabase, session.id);
  return false;
}
