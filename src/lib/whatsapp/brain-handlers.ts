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
import { createAndAnalyzeIntake, createAndAnalyzeText, confirmIntake } from "@/lib/services/brain";
import { looksLikeExamText, looksLikeConsultText, looksLikeCustodyText, looksLikeExpenseText, looksLikeInviteText } from "@/lib/ai/brain/exam-text-gate";
import { buildCustodyPreviewMessage } from "@/lib/ai/brain/custody-preview";
import { buildExpensePreviewMessage } from "@/lib/ai/brain/expense-preview";
import { buildInvitePreviewMessage } from "@/lib/ai/brain/invite-preview";
import { undoIntake } from "@/lib/services/brain-undo";
import { isBrainEnabledForGroup, isHealthVisitEnabled, isCustodyRoutineEnabled, isExpenseEnabled, isEventInviteEnabled } from "@/lib/services/brain-flag";
import { validateImageUpload } from "@/lib/ai/brain/upload-guard";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { captureServerEvent } from "@/lib/posthog-server";
import { getServerT } from "@/i18n/server";
import type { BrainChild, DocType, IntakePreview } from "@/lib/ai/brain/types";
import { downloadMedia, sendTextMessage, sendButtonMessage } from "./client";
import { matchChildFromCaption } from "./caption-match";
import { notifyGroupViaWhatsApp } from "./notify";
import {
  setBrainIntake,
  setBrainFallbackPhoto,
  setBrainChildSelection,
  clearPendingAction,
  type WASession,
} from "./session";
import {
  renderPreview,
  renderExecuted,
  renderUndone,
  renderHealthPreview,
  renderHealthExecuted,
  renderHealthUndone,
  renderCustodyExecuted,
  renderCustodyUndone,
  renderExpenseExecuted,
  renderExpenseUndone,
  classifyBrainReply,
  isUndoReply,
  isDeclineUndoReply,
  isCalendarYes,
  matchChildName,
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
  /** Criança resolvida (usuário respondeu "de qual criança?") — sobrepõe a
   *  detecção por legenda, reanalisando a MESMA foto sem reenviar. */
  forcedChildId?: string | null,
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

    // Criança: forçada (usuário respondeu a seleção) > nome na legenda > única.
    const matched = captionKids.length > 1 ? matchChildFromCaption(caption ?? undefined, captionKids) : captionKids[0];
    const requestedChildId = forcedChildId ?? matched?.id ?? null;

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
        // Caminho do classificador: agora CONFIRMAMOS que é calendário → dá a
        // disclosure de compartilhamento (que foi pulada no início).
        if (fromClassifier) {
          await sendTextMessage(
            phone,
            "📚 É um calendário escolar! As provas ficam visíveis aos responsáveis do grupo.",
          );
        }
        await sendBrainPreview(supabase, phone, session, result.preview, children);
        return true;
      }
      case "needs_child_selection": {
        // Guarda a foto (media_id) → o usuário só RESPONDE o nome (ou toca no
        // botão), sem reenviar a imagem.
        await sendBrainChildQuestion(
          supabase,
          phone,
          session,
          result.options.map((o) => ({ id: o.id, name: o.name })),
          { media_id: mediaId },
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
 * Foto de CONSULTA (resumo/receita/pedido de exame) → análise. Espelho de
 * analyzeCalendarPhoto pro Playbook de Saúde (o escolar fica INTOCADO = zero
 * risco). Gate próprio (isHealthVisitEnabled, OFF) checado pelo caller. Usa
 * createAndAnalyzeIntake docType='health_visit' → sendBrainPreview (ramifica).
 */
export async function analyzeConsultaPhoto(
  supabase: SupabaseClient,
  phone: string,
  userId: string,
  groupId: string,
  mediaId: string,
  caption: string | null,
  session: WASession,
  preBuffer?: Buffer,
  fromClassifier = false,
  forcedChildId?: string | null,
): Promise<boolean> {
  try {
    if (!fromClassifier) {
      await sendTextMessage(
        phone,
        "🩺 Vou ler essa consulta pra organizar no histórico de Saúde — fica visível aos responsáveis do grupo. Analisando…",
      );
    }
    const buffer = preBuffer ?? (await downloadMedia(mediaId));
    const val = validateImageUpload(buffer);
    if (!val.ok || !val.type) {
      await sendTextMessage(phone, "Não consegui ler essa imagem. Tente uma foto nítida (JPG ou PNG). 🙏");
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
      await sendTextMessage(phone, "Você ainda não tem crianças cadastradas. Cadastre pelo app antes de enviar a consulta. 🙏");
      return true;
    }
    const children: BrainChild[] = captionKids.map((k) => ({ id: k.id, name: (k.full_name || "").split(" ")[0] || "criança" }));
    const matched = captionKids.length > 1 ? matchChildFromCaption(caption ?? undefined, captionKids) : captionKids[0];
    const requestedChildId = forcedChildId ?? matched?.id ?? null;

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
      docType: "health_visit",
    });

    switch (result.kind) {
      case "preview": {
        if (fromClassifier) {
          await sendTextMessage(phone, "🩺 É uma consulta médica! Os dados ficam visíveis aos responsáveis do grupo.");
        }
        await sendBrainPreview(supabase, phone, session, result.preview, children);
        return true;
      }
      case "needs_child_selection":
        await sendBrainChildQuestion(
          supabase,
          phone,
          session,
          result.options.map((o) => ({ id: o.id, name: o.name })),
          { media_id: mediaId, doc_type: "health_visit" },
        );
        return true;
      case "unknown_document":
        if (fromClassifier) return false; // cai no recibo (sem dead-end)
        await sendTextMessage(phone, "Isso não parece uma consulta médica. Se for, tente uma foto mais nítida. 🙂");
        return true;
      case "duplicate":
        await sendTextMessage(phone, result.message);
        return true;
      default:
        if (fromClassifier) return false;
        await sendTextMessage(phone, "Não consegui processar agora. Tente de novo em instantes. 🙏");
        return true;
    }
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "analyzeConsultaPhoto", groupId } });
    if (fromClassifier) return false;
    await sendTextMessage(phone, "Não consegui processar a consulta agora. Reenvie a foto em instantes. 🙏");
    return true;
  }
}

/** Foto de consulta roteada por LEGENDA (isConsultIntent). Gate próprio de saúde
 *  + beta; se off, retorna false e o processor segue o roteamento normal. */
export async function handleConsultaImage(
  supabase: SupabaseClient,
  phone: string,
  userId: string,
  groupId: string,
  message: WAExtractedMessage,
  session: WASession,
): Promise<boolean> {
  if (!message.mediaId) return false;
  if (!isHealthVisitEnabled()) return false;
  if (!(await isBrainEnabledForGroup(supabase, groupId))) return false;
  return analyzeConsultaPhoto(supabase, phone, userId, groupId, message.mediaId, message.caption ?? null, session);
}

/**
 * Foto de CONVITE (aniversário, reunião de pais, apresentação, campeonato…) →
 * análise. Espelho de analyzeConsultaPhoto pro playbook de Convites (C3).
 * Entrada é o classificador de visão (sem rota por legenda). Gate próprio
 * (isEventInviteEnabled, OFF) checado pelo caller. Usa createAndAnalyzeIntake
 * docType='event_invite' → sendBrainPreview (ramifica pro cartão 🎉).
 */
export async function analyzeInvitePhoto(
  supabase: SupabaseClient,
  phone: string,
  userId: string,
  groupId: string,
  mediaId: string,
  caption: string | null,
  session: WASession,
  preBuffer?: Buffer,
  fromClassifier = false,
  forcedChildId?: string | null,
): Promise<boolean> {
  try {
    if (!fromClassifier) {
      await sendTextMessage(phone, "🎉 Vou ler esse convite pra organizar no calendário da família. Analisando…");
    }
    const buffer = preBuffer ?? (await downloadMedia(mediaId));
    const val = validateImageUpload(buffer);
    if (!val.ok || !val.type) {
      await sendTextMessage(phone, "Não consegui ler essa imagem. Tente uma foto nítida (JPG ou PNG). 🙏");
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
      await sendTextMessage(phone, "Você ainda não tem crianças cadastradas. Cadastre pelo app antes de enviar o convite. 🙏");
      return true;
    }
    const children: BrainChild[] = captionKids.map((k) => ({ id: k.id, name: (k.full_name || "").split(" ")[0] || "criança" }));
    const matched = captionKids.length > 1 ? matchChildFromCaption(caption ?? undefined, captionKids) : captionKids[0];
    const requestedChildId = forcedChildId ?? matched?.id ?? null;

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
      docType: "event_invite",
    });

    switch (result.kind) {
      case "preview": {
        if (fromClassifier) {
          await sendTextMessage(phone, "🎉 É um convite! Vou organizar pra adicionar ao calendário da família.");
        }
        await sendBrainPreview(supabase, phone, session, result.preview, children);
        return true;
      }
      case "needs_child_selection":
        await sendBrainChildQuestion(
          supabase,
          phone,
          session,
          result.options.map((o) => ({ id: o.id, name: o.name })),
          { media_id: mediaId, doc_type: "event_invite" },
        );
        return true;
      case "unknown_document":
        if (fromClassifier) return false; // cai no recibo (sem dead-end)
        await sendTextMessage(phone, "Isso não parece um convite. Se for, tente uma foto mais nítida. 🙂");
        return true;
      case "duplicate":
        await sendTextMessage(phone, result.message);
        return true;
      default:
        if (fromClassifier) return false;
        await sendTextMessage(phone, "Não consegui processar agora. Tente de novo em instantes. 🙏");
        return true;
    }
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "analyzeInvitePhoto", groupId } });
    if (fromClassifier) return false;
    await sendTextMessage(phone, "Não consegui processar o convite agora. Reenvie a foto em instantes. 🙏");
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
      const isHealth = brain.doc_type === "health_visit";
      const isCustody = brain.doc_type === "custody_routine";
      const isExpense = brain.doc_type === "expense";
      const isInvite = brain.doc_type === "event_invite";
      const undoneMsg =
        r.kind === "undone"
          ? isInvite
            ? r.removed > 0
              ? `Desfeito — removi ${r.removed === 1 ? "o evento" : `${r.removed} eventos`} do calendário.`
              : "Já estava desfeito — não havia nada a remover."
            : isExpense
            ? renderExpenseUndone(r.removed, r.detached) // detached = já aprovadas
            : isCustody
              ? renderCustodyUndone(r.removed, r.detached) // detached = trocas já aceitas
              : isHealth
                ? renderHealthUndone(r.removed)
                : renderUndone(r.removed, r.detached)
          : "Não consegui desfazer agora. Tente pelo app. 🙏";
      await sendTextMessage(phone, undoneMsg);
      return true;
    }
    // Recusou o desfazer ("não", "tá bom", "obrigado"…) → fecha com um aceno
    // caloroso em vez de cair no assistente (que respondia com a saudação/menu).
    // MANTÉM o estado: o "Desfazer" segue valendo até o timeout se mudar de ideia.
    if (isDeclineUndoReply(text)) {
      // Fecha o ciclo com calor E deixa EXPLÍCITO que a reversão continua na
      // mesa (feedback do dono: o usuário pode achar que encerrou e não notar a
      // janela segura). O estado segue vivo até o timeout, então a promessa vale.
      await sendTextMessage(
        phone,
        "Perfeito, tá tudo certo então! 🙂 Se mudar de ideia, é só responder *Desfazer* que eu reverto.",
      );
      return true;
    }
    // Nem undo nem recusa (ex: "qual o saldo?") → deixa o assistente responder,
    // MANTENDO o estado (o "Desfazer" continua disponível). Sem clear = sem lockout.
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
    const isHealth = brain.doc_type === "health_visit";
    const isCustody = brain.doc_type === "custody_routine";
    const isExpense = brain.doc_type === "expense";
    const isInvite = brain.doc_type === "event_invite";
    await sendTextMessage(
      phone,
      isInvite
        ? "Pronto! Adicionei o evento ao calendário. 🎉"
        : isExpense
        ? renderExpenseExecuted(r.createdCount)
        : isCustody
          ? renderCustodyExecuted()
          : isHealth
            ? renderHealthExecuted()
            : renderExecuted(r.createdCount),
    );
    await sendButtonMessage(phone, "Precisa reverter?", [{ id: "brain_undo", title: "Desfazer" }]);
    // Coordenação WhatsApp: avisa os coparentes (menos quem confirmou). Além
    // disso o outbox entrega a coordenação push (3d). Fire-and-forget. 'event'
    // = a pref event_reminders governa (não há kind de saúde dedicado).
    if (isInvite) {
      await notifyGroupViaWhatsApp(
        groupId,
        userId,
        `🎉 Convite adicionado ao calendário do Kindar — confira os detalhes por lá.`,
        "event",
      );
    } else if (isExpense) {
      const n = r.createdCount === 1 ? "1 despesa registrada" : `${r.createdCount} despesas registradas`;
      await notifyGroupViaWhatsApp(
        groupId,
        userId,
        `💳 ${n} no Kindar — aprovação na tela Despesas.`,
        "event",
      );
    } else if (isCustody) {
      await notifyGroupViaWhatsApp(
        groupId,
        userId,
        `🗓️ Combinações de guarda e rotina atualizadas no Kindar — o que precisa da sua aprovação chega em seguida.`,
        "event",
      );
    } else if (isHealth) {
      await notifyGroupViaWhatsApp(
        groupId,
        userId,
        `🩺 *${brain.child_name}*: consulta registrada no histórico de Saúde do Kindar.`,
        "event",
      );
    } else {
      const n = r.createdCount === 1 ? "1 prova" : `${r.createdCount} provas`;
      const adj = r.createdCount === 1 ? "adicionada" : "adicionadas";
      await notifyGroupViaWhatsApp(
        groupId,
        userId,
        `📚 *${brain.child_name}*: ${n} ${adj} ao calendário escolar do Kindar.`,
        "event",
      );
    }
    return true;
  }

  if (r.kind === "stale_plan") {
    await clearPendingAction(supabase, session.id);
    await sendTextMessage(phone, r.message);
    return true;
  }
  if (r.kind === "already_processing") {
    await clearPendingAction(supabase, session.id);
    await sendTextMessage(
      phone,
      brain.doc_type === "event_invite"
        ? "Esse convite já está sendo adicionado. 🙂"
        : brain.doc_type === "expense"
        ? "Essas despesas já estão sendo registradas. 🙂"
        : brain.doc_type === "custody_routine"
          ? "Essas combinações já estão sendo registradas. 🙂"
          : brain.doc_type === "health_visit"
            ? "Essa consulta já está sendo registrada. 🙂"
            : "Essas provas já estão sendo adicionadas. 🙂",
    );
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

/**
 * Resposta a "de qual criança é o calendário?" — botão ou nome digitado.
 * Resolve a criança e REANALISA a MESMA foto (media_id guardado) sem reenviar.
 * Nome não reconhecido → repete a pergunta (sem encerrar).
 */
export async function handleChildSelectionReply(
  supabase: SupabaseClient,
  phone: string,
  userId: string,
  groupId: string,
  message: WAExtractedMessage,
  session: WASession,
): Promise<boolean> {
  const sel = session.state.brain_child_selection;
  if (!sel) return false;
  const btn = message.buttonReplyId;
  const text = (message.text || "").trim();

  let childId: string | null = null;
  if (btn && btn.startsWith("brain_child:")) {
    const id = btn.slice("brain_child:".length);
    childId = sel.options.some((o) => o.id === id) ? id : null;
  } else if (text) {
    childId = matchChildName(text, sel.options);
  }

  if (!childId) {
    await sendTextMessage(
      phone,
      `Não reconheci 🤔. De qual criança é? Responda o nome: ${sel.options.map((o) => o.name).join(", ")}.`,
    );
    return true;
  }

  // Reprocessa a MESMA origem (texto OU foto) com a criança resolvida, sem
  // reenviar. Texto (assistente/áudio) reusa handleExamText; foto, analyzeCalendarPhoto.
  await clearPendingAction(supabase, session.id);
  if (sel.text) {
    return handleExamText(supabase, phone, userId, groupId, sel.text, session, !!sel.from_audio, childId, sel.doc_type);
  }
  if (sel.media_id) {
    return sel.doc_type === "health_visit"
      ? analyzeConsultaPhoto(supabase, phone, userId, groupId, sel.media_id, null, session, undefined, false, childId)
      : sel.doc_type === "event_invite"
        ? analyzeInvitePhoto(supabase, phone, userId, groupId, sel.media_id, null, session, undefined, false, childId)
        : analyzeCalendarPhoto(supabase, phone, userId, groupId, sel.media_id, null, session, undefined, false, childId);
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Preview + pergunta de criança COMPARTILHADOS (foto e texto)          */
/* ------------------------------------------------------------------ */

/** Renderiza a prévia numerada + botões (Confirmar/Escolher/Cancelar) e arma o
 *  estado do intake. Mesmo cérebro, mesmo preview — venha de foto ou texto. */
async function sendBrainPreview(
  supabase: SupabaseClient,
  phone: string,
  session: WASession,
  preview: IntakePreview,
  children: BrainChild[],
): Promise<void> {
  const isHealth = preview.plan.docType === "health_visit";
  const isCustody = preview.plan.docType === "custody_routine";
  const isExpense = preview.plan.docType === "expense";
  const isInvite = preview.plan.docType === "event_invite";
  const acts = preview.plan.activities ?? [];
  const childName = isHealth
    ? children.find((c) => c.id === (preview.plan.health?.appointment.childId ?? null))?.name ?? "seu filho(a)"
    : children.find((c) => c.id === (acts[0]?.childId ?? null))?.name ?? "seu filho(a)";
  const t = await getServerT("pt");
  if (isInvite && preview.plan.invite) {
    const nameOf = (id: string) => children.find((c) => c.id === id)?.name.split(" ")[0] ?? "";
    await sendTextMessage(phone, buildInvitePreviewMessage(preview.plan.invite, nameOf, { withCta: false }));
    await sendButtonMessage(phone, "Posso adicionar ao calendário?", [
      { id: "brain_confirm", title: "Confirmar" },
      { id: "brain_cancel", title: "Cancelar" },
    ]);
  } else if (isExpense && preview.plan.expense) {
    // Despesas: copy PURA compartilhada com o app; confirma a cena inteira.
    const nameOf = (id: string) => children.find((c) => c.id === id)?.name.split(" ")[0] ?? "";
    await sendTextMessage(phone, buildExpensePreviewMessage(preview.plan.expense, nameOf, { withCta: false }));
    await sendButtonMessage(phone, "Posso registrar no Kindar?", [
      { id: "brain_confirm", title: "Confirmar" },
      { id: "brain_cancel", title: "Cancelar" },
    ]);
  } else if (isCustody && preview.plan.custody) {
    // Guarda & rotina: copy PURA compartilhada com o app (mesma prévia) — sem
    // deseleção numerada (confirma a cena inteira) → só 2 botões.
    const nameOf = (id: string) => children.find((c) => c.id === id)?.name ?? "";
    await sendTextMessage(
      phone,
      buildCustodyPreviewMessage(preview.plan.custody, nameOf, children.length, { withCta: false }),
    );
    await sendButtonMessage(phone, "Posso registrar essas combinações? Quem precisa aprovar será avisado.", [
      { id: "brain_confirm", title: "Confirmar" },
      { id: "brain_cancel", title: "Cancelar" },
    ]);
  } else if (isHealth) {
    // Consulta: sem deseleção numerada (A0 confirma a cena inteira) → só 2 botões.
    await sendTextMessage(phone, renderHealthPreview(preview, childName, { withCta: false }));
    await sendButtonMessage(phone, "Posso registrar essa consulta no Kindar?", [
      { id: "brain_confirm", title: "Confirmar" },
      { id: "brain_cancel", title: "Cancelar" },
    ]);
  } else {
    await sendTextMessage(phone, renderPreview(preview, childName, t, { withCta: false }));
    await sendButtonMessage(phone, "Posso adicionar essas provas ao Kindar?", [
      { id: "brain_confirm", title: "Confirmar" },
      { id: "brain_choose", title: "Escolher" },
      { id: "brain_cancel", title: "Cancelar" },
    ]);
  }
  await setBrainIntake(supabase, session.id, {
    intake_id: preview.intakeId,
    plan_hash: preview.planHash,
    confirmation_token: preview.confirmationToken,
    child_name: isCustody || isExpense ? "família" : childName,
    total: isExpense
      ? preview.plan.expense?.items.length ?? 0
      : isCustody
        ? preview.plan.custody?.items.length ?? 0
        : isHealth
          ? preview.plan.health?.medications?.length ?? 0
          : acts.length,
    phase: "preview",
    doc_type: isInvite ? "event_invite" : isExpense ? "expense" : isCustody ? "custody_routine" : isHealth ? "health_visit" : undefined,
  });
}

/** Pergunta "de qual criança?" guardando a ORIGEM (foto media_id OU texto) pra
 *  reprocessar sem reenviar quando o usuário responder o nome/botão. */
async function sendBrainChildQuestion(
  supabase: SupabaseClient,
  phone: string,
  session: WASession,
  options: Array<{ id: string; name: string }>,
  source: { media_id?: string; text?: string; from_audio?: boolean; doc_type?: DocType },
): Promise<void> {
  await setBrainChildSelection(supabase, session.id, {
    media_id: source.media_id,
    text: source.text,
    from_audio: source.from_audio,
    // Marcador de playbook (ausente = escolar). Estreita o DocType: guarda e
    // despesa pulam a pergunta de criança; saúde e convite passam por aqui.
    doc_type: source.doc_type === "health_visit" ? "health_visit" : source.doc_type === "event_invite" ? "event_invite" : undefined,
    options,
  });
  if (options.length >= 2 && options.length <= 3) {
    await sendButtonMessage(
      phone,
      "De qual criança são essas provas? É só tocar no nome 🙂",
      options.map((o) => ({ id: `brain_child:${o.id}`, title: o.name.slice(0, 20) })),
    );
  } else {
    await sendTextMessage(
      phone,
      `De qual criança são essas provas? Responda o nome: ${options.map((o) => o.name).join(", ")}.`,
    );
  }
}

/**
 * Captura de provas por TEXTO/ÁUDIO no WhatsApp (paridade com o assistente do
 * app). O usuário descreve as provas ("Otto tem prova de matemática dia 10/09");
 * o áudio já chega transcrito. Gate conservador → se não parece captura, ou fora
 * do beta, ou a IA não reconhece provas → devolve FALSE e o processor segue pro
 * assistente (nunca sequestra a conversa). Mesmo cérebro (createAndAnalyzeText).
 */
export async function handleExamText(
  supabase: SupabaseClient,
  phone: string,
  userId: string,
  groupId: string,
  text: string,
  session: WASession,
  fromAudio: boolean,
  forcedChildId?: string | null,
  docType?: DocType,
  /** true = a PORTA ÚNICA (classifyNarrative) já classificou — pula o gate
   *  regex (os interruptores de flag CONTINUAM valendo). */
  skipGate?: boolean,
): Promise<boolean> {
  const isHealth = docType === "health_visit";
  const isCustody = docType === "custody_routine";
  const isExpense = docType === "expense";
  const isInvite = docType === "event_invite";
  // Gate por playbook: consulta usa looksLikeConsultText + o interruptor próprio
  // de saúde; guarda usa looksLikeCustodyText + o seu; despesa idem (todos OFF
  // por padrão → nunca disparam); provas seguem o gate escolar. skipGate pula
  // SÓ o regex.
  if (isHealth) {
    if (!isHealthVisitEnabled() || (!skipGate && !looksLikeConsultText(text))) return false;
  } else if (isCustody) {
    if (!isCustodyRoutineEnabled() || (!skipGate && !looksLikeCustodyText(text))) return false;
  } else if (isExpense) {
    if (!isExpenseEnabled() || (!skipGate && !looksLikeExpenseText(text))) return false;
  } else if (isInvite) {
    if (!isEventInviteEnabled() || (!skipGate && !looksLikeInviteText(text))) return false;
  } else if (!skipGate && !looksLikeExamText(text)) {
    return false;
  }
  if (!(await isBrainEnabledForGroup(supabase, groupId))) return false;
  try {
    const { data: rows } = await supabase
      .from("children")
      .select("id, full_name")
      .eq("group_id", groupId);
    const children: BrainChild[] = (rows ?? []).map((r) => ({
      id: r.id as string,
      name: ((r.full_name as string) || "").split(" ")[0] || "criança",
    }));
    if (children.length === 0) return false;

    const result = await createAndAnalyzeText({
      supabase,
      groupId,
      userId,
      channel: "whatsapp",
      source: fromAudio ? "audio" : "message",
      text,
      children,
      requestedChildId: forcedChildId ?? null,
      docType,
    });

    switch (result.kind) {
      case "preview":
        await sendBrainPreview(supabase, phone, session, result.preview, children);
        return true;
      case "needs_child_selection":
        await sendBrainChildQuestion(
          supabase,
          phone,
          session,
          result.options.map((o) => ({ id: o.id, name: o.name })),
          { text, from_audio: fromAudio, doc_type: docType },
        );
        return true;
      case "duplicate":
        await sendTextMessage(phone, result.message);
        return true;
      default:
        // unknown_document / error / already_processing → não era captura de
        // provas: deixa o assistente responder.
        return false;
    }
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "handleExamText", groupId } });
    return false; // erro → cai no assistente
  }
}
