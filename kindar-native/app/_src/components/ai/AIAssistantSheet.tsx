/**
 * AIAssistantSheet — modal flutuante do Kindar AI.
 *
 * Equivalente nativo do PWA `src/components/AIAssistant.tsx` (portal + bubble).
 * O conteúdo do chat (mensagens, sugestões, fetch para /api/ai/assistant)
 * é o mesmo de `app/ai.tsx` — apenas embrulhado em um Modal slide-from-bottom
 * controlado pelo store `useAIModal`.
 *
 * Backend: AI Router (Groq → Together → Gemini) + 12 tools.
 *
 * KINDAR BRAIN (Fase 1 — paridade com PWA/WhatsApp): antes do chat geral,
 * o texto passa pelos gates baratos (prova/consulta/guarda) e pela PORTA
 * ÚNICA (narrative-route); foto vai pro /api/ai/assistant/image. O servidor
 * decide e gateia por flag ({found:false} → cai no chat) — nenhuma flag
 * nova no cliente. Prévia → Confirmar/Cancelar → Desfazer, com as MESMAS
 * copies do widget PWA (paridade por construção).
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useI18n } from 'src/i18n';
import { useAuth } from '../../store/auth';
import { useAIModal } from '../../store/ai-modal';
import { colors, spacing, radius, font, shadows } from '../../design-system/tokens';
import {
  looksLikeExamText, looksLikeConsultText, looksLikeCustodyText, looksLikeExpenseText,
  matchOneChildOption, endpointForDocType,
  type BrainIntakeRef, type CaptureResponse, type ChildOption,
} from '../../lib/brain-capture';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  id: string;
  pending?: boolean;
}

/** Foto escolhida (guardada pra reenviar com child_id na repergunta). */
interface PickedImage {
  uri: string;
  name: string;
  type: string;
}

export default function AIAssistantSheet() {
  const t = useI18n((s) => s.t);
  const insets = useSafeAreaInsets();
  const { activeGroup } = useAuth();
  const isOpen = useAIModal((s) => s.isOpen);
  const close = useAIModal((s) => s.close);

  const SUGGESTIONS = [
    t('aiAssistant.suggestionCustody'),
    t('aiAssistant.suggestionActivities'),
    t('aiAssistant.suggestionExpenses'),
    t('aiAssistant.suggestionHealth'),
  ];

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  // ---- Kindar Brain (prévia → confirmar → desfazer; repergunta de criança) ----
  const [pendingIntake, setPendingIntake] = useState<BrainIntakeRef | null>(null);
  const [undoable, setUndoable] = useState<BrainIntakeRef | null>(null);
  const [childPick, setChildPick] = useState<{
    options: ChildOption[];
    resubmit: (childId: string, userLabel: string) => void;
  } | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Initial greeting (rebuilds whenever modal opens with no messages)
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: t('aiAssistant.greeting'),
      }]);
    }
  }, [isOpen, messages.length, t]);

  const pushAssistant = useCallback((content: string) => {
    setMessages(prev => [...prev, { id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, role: 'assistant', content }]);
  }, []);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) throw new Error(t('aiAssistant.sessionExpired'));
    return { Authorization: `Bearer ${token}` };
  }, [t]);

  /** Resposta de captura → estado (prévia/pergunta de criança). Devolve true
   *  se o Brain assumiu a mensagem (o chat geral NÃO roda). */
  const applyCapture = useCallback((data: CaptureResponse, resubmit: (childId: string, userLabel: string) => void): boolean => {
    if (data?.found === false) return false;
    if (data.content) pushAssistant(data.content);
    if (Array.isArray(data.childSelection?.options) && data.childSelection.options.length > 0) {
      setPendingIntake(null);
      setUndoable(null);
      setChildPick({ options: data.childSelection.options, resubmit });
    } else if (data.intake?.id) {
      setChildPick(null);
      setUndoable(null);
      setPendingIntake(data.intake);
    }
    return true;
  }, [pushAssistant]);

  /* ---- Captura por TEXTO (mesmo cérebro do PWA/WhatsApp) ---- */
  const captureText = useCallback(async (text: string, childId: string | undefined, endpoint: string): Promise<boolean> => {
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
      const res = await fetch(`${WEB_URL}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text, child_id: childId }),
      });
      const data: CaptureResponse = await res.json().catch(() => ({ found: false }));
      return applyCapture(data, (cid, label) => {
        setChildPick(null);
        setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', content: label }]);
        setSending(true);
        void captureText(text, cid, endpoint).finally(() => setSending(false));
      });
    } catch {
      return false; // erro de rede → cai no chat, não bloqueia
    }
  }, [authHeaders, applyCapture]);

  /** PORTA ÚNICA: nenhum gate mordeu; o servidor classifica a narrativa e o
   *  cliente chama o playbook certo. {found:false} → chat. Nunca lança. */
  const routeNarrative = useCallback(async (text: string): Promise<boolean> => {
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
      const res = await fetch(`${WEB_URL}/api/ai/assistant/narrative-route`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({ found: false }));
      if (data?.found !== true || typeof data.docType !== 'string') return false;
      const handled = await captureText(text, undefined, endpointForDocType(data.docType));
      if (handled && typeof data.secondHint === 'string' && data.secondHint) {
        pushAssistant(data.secondHint);
      }
      return handled;
    } catch {
      return false;
    }
  }, [authHeaders, captureText, pushAssistant]);

  /* ---- Foto → Brain (calendário escolar / resumo médico / receita) ---- */
  const sendImage = useCallback(async (img: PickedImage, opts?: { childId?: string; userLabel?: string; doc?: string }) => {
    if (sending) return;
    setPendingIntake(null);
    setChildPick(null);
    setUndoable(null);
    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', content: opts?.userLabel ?? '📷 Enviei uma foto' }]);
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const fd = new FormData();
      // RN FormData: {uri, name, type} vira o arquivo no multipart.
      fd.append('file', { uri: img.uri, name: img.name, type: img.type } as unknown as Blob);
      if (opts?.childId) fd.append('child_id', opts.childId);
      if (opts?.doc) fd.append('doc', opts.doc);
      const res = await fetch(`${WEB_URL}/api/ai/assistant/image`, {
        method: 'POST',
        headers: await authHeaders(), // sem Content-Type manual: o RN põe o boundary
        body: fd,
      });
      const data: CaptureResponse & { content?: string } = await res.json().catch(() => ({ content: 'Desculpe, ocorreu um erro. 🙏' }));
      const doc = typeof data.childSelection?.doc === 'string' ? data.childSelection.doc : undefined;
      const took = applyCapture(data, (childId, userLabel) => void sendImage(img, { childId, userLabel, doc }));
      if (!took && data.content) pushAssistant(data.content);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      pushAssistant('Não consegui processar a imagem agora. Tente de novo. 🙏');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [sending, authHeaders, applyCapture, pushAssistant]);

  const pickImage = useCallback(async () => {
    if (sending) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const a = result.assets[0];
    const name = a.fileName || `foto-${Date.now()}.jpg`;
    const type = a.mimeType || 'image/jpeg';
    void sendImage({ uri: a.uri, name, type });
  }, [sending, sendImage]);

  /* ---- Confirmar / Cancelar / Desfazer (paridade de copy com o PWA) ---- */
  const confirmIntake = useCallback(async () => {
    const pi = pendingIntake;
    if (!pi || sending) return;
    const isHealth = pi.doc === 'health';
    const isCustody = pi.doc === 'custody';
    const isExpense = pi.doc === 'expense';
    setPendingIntake(null);
    setUndoable(null);
    setSending(true);
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
      const res = await fetch(`${WEB_URL}/api/brain/intakes/${pi.id}/confirm`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ planHash: pi.planHash, confirmationToken: pi.confirmationToken }),
      });
      const data = await res.json().catch(() => null);
      const ok = data?.kind === 'executed';
      if (ok) setUndoable(pi);
      pushAssistant(
        ok
          ? isExpense
            ? `✅ Pronto! Registrei ${pi.count === 1 ? 'a despesa' : `${pi.count} despesas`} em Despesas — quem divide aprova por lá. Se precisar, é só tocar em Desfazer.`
            : isCustody
              ? '✅ Pronto! Registrei as combinações — quem precisa aprovar já foi avisado. Se precisar, é só tocar em Desfazer.'
              : isHealth
                ? '✅ Pronto! Registrei a consulta em Saúde. Se precisar, é só tocar em Desfazer.'
                : `✅ Pronto! Adicionei ${pi.count === 1 ? '1 prova' : `${pi.count} provas`} no calendário escolar. Se precisar, é só tocar em Desfazer.`
          : isExpense
            ? 'Não consegui registrar agora. Tente pela tela Despesas. 🙏'
            : isCustody
              ? 'Não consegui registrar agora. Tente pelo Calendário. 🙏'
              : isHealth
                ? 'Não consegui registrar agora. Tente pela tela Saúde. 🙏'
                : 'Não consegui adicionar agora. Tente pela tela Escola › Calendário. 🙏',
      );
      Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    } catch {
      pushAssistant(
        isExpense
          ? 'Não consegui registrar agora. Tente pela tela Despesas. 🙏'
          : isCustody
            ? 'Não consegui registrar agora. Tente pelo Calendário. 🙏'
            : isHealth
              ? 'Não consegui registrar agora. Tente pela tela Saúde. 🙏'
              : 'Não consegui adicionar agora. Tente pela tela Escola › Calendário. 🙏',
      );
    } finally {
      setSending(false);
    }
  }, [pendingIntake, sending, authHeaders, pushAssistant]);

  const cancelIntake = useCallback(() => {
    setPendingIntake(null);
    pushAssistant('Ok, não adicionei nada. 🙂');
  }, [pushAssistant]);

  const undoIntake = useCallback(async () => {
    const ui = undoable;
    if (!ui || sending) return;
    const isHealth = ui.doc === 'health';
    const isCustody = ui.doc === 'custody';
    const isExpense = ui.doc === 'expense';
    setUndoable(null);
    setSending(true);
    try {
      const res = await fetch(`${WEB_URL}/api/brain/intakes/${ui.id}`, {
        method: 'DELETE',
        headers: await authHeaders(),
      });
      const data = await res.json().catch(() => null);
      const done = data?.kind === 'undone';
      const removed = typeof data?.removed === 'number' ? data.removed : ui.count;
      const detached = typeof data?.detached === 'number' ? data.detached : 0;
      let content: string;
      if (done && removed > 0) {
        content = isExpense
          ? `Desfeito — removi ${removed === 1 ? '1 despesa' : `${removed} despesas`}.`
          : isCustody
            ? `Desfeito — removi ${removed === 1 ? '1 combinação' : `${removed} combinações`} de guarda e rotina.`
            : isHealth
              ? 'Desfeito — removi o registro da consulta.'
              : `Desfeito — removi ${removed === 1 ? '1 prova' : `${removed} provas`} do calendário.`;
        if (isCustody && detached > 0) {
          content += ` (${detached === 1 ? '1 troca já aceita continua' : `${detached} trocas já aceitas continuam`} valendo.)`;
        }
        if (isExpense && detached > 0) {
          content += ` (${detached === 1 ? '1 despesa já aprovada continua' : `${detached} despesas já aprovadas continuam`} valendo.)`;
        }
      } else if (done) {
        content = 'Já estava desfeito. 🙂';
      } else {
        content = 'Não consegui desfazer agora. Tente de novo em instantes. 🙏';
      }
      pushAssistant(content);
    } catch {
      pushAssistant('Não consegui desfazer agora. Tente de novo em instantes. 🙏');
    } finally {
      setSending(false);
    }
  }, [undoable, sending, authHeaders, pushAssistant]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || sending || !activeGroup) return;
    const trimmed = text.trim();

    // Pergunta de criança pendente + usuário DIGITOU o nome → resolve
    // (paridade com PWA/WhatsApp, que aceitam o nome digitado).
    if (childPick) {
      const opt = matchOneChildOption(trimmed, childPick.options);
      if (opt) {
        setInput('');
        childPick.resubmit(opt.id, trimmed);
        return;
      }
    }

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Bolha "Pensando..." desde já — a extração do Brain leva ~15-20s e o
    // usuário precisa ver que algo acontece. Captura assumiu → a bolha sai
    // (a resposta real já foi anexada); não assumiu → ela segue pro chat.
    const pendingMsg: ChatMessage = { id: `a-${Date.now()}`, role: 'assistant', content: '', pending: true };
    setMessages(prev => [...prev, pendingMsg]);
    const dropPending = () => setMessages(prev => prev.filter(m => m.id !== pendingMsg.id));

    try {
      // KINDAR BRAIN antes do chat geral (mesma fila do PWA): provas →
      // consulta → guarda → porta única. Servidor gateia por flag.
      let captured = false;
      if (looksLikeExamText(trimmed)) {
        captured = await captureText(trimmed, undefined, '/api/ai/assistant/exam-text');
      } else if (looksLikeConsultText(trimmed)) {
        captured = await captureText(trimmed, undefined, '/api/ai/assistant/consult-text');
      } else if (looksLikeCustodyText(trimmed)) {
        captured = await captureText(trimmed, undefined, '/api/ai/assistant/custody-text');
      } else if (looksLikeExpenseText(trimmed)) {
        captured = await captureText(trimmed, undefined, '/api/ai/assistant/expense-text');
      } else {
        captured = await routeNarrative(trimmed);
      }
      if (captured) {
        dropPending();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }

      const history = [...messages.filter(m => m.id !== 'welcome' && !m.pending), userMsg]
        .map(m => ({ role: m.role, content: m.content }));

      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
      const res = await fetch(`${WEB_URL}/api/ai/assistant`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages: history, groupId: activeGroup.groupId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || data?.content || t('aiAssistant.errorStatus', { status: res.status }));
      }

      setMessages(prev => prev.map(m =>
        m.id === pendingMsg.id
          ? { ...m, content: data.content || t('aiAssistant.noResponse'), pending: false }
          : m
      ));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || t('aiAssistant.errorGeneric');
      setMessages(prev => {
        const hadPending = prev.some(m => m.pending);
        return hadPending
          ? prev.map(m => (m.pending ? { ...m, content: `⚠️ ${msg}`, pending: false } : m))
          : [...prev, { id: `a-${Date.now()}`, role: 'assistant' as const, content: `⚠️ ${msg}` }];
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, sending, activeGroup, childPick, captureText, routeNarrative, authHeaders, t]);

  const onScrollContentSizeChange = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: false });
  }, []);

  const handleNewChat = useCallback(() => {
    setPendingIntake(null);
    setUndoable(null);
    setChildPick(null);
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: t('aiAssistant.greeting'),
    }]);
  }, [t]);

  const renderMessage = (m: ChatMessage) => {
    const isMe = m.role === 'user';
    return (
      <View
        key={m.id}
        style={{
          alignItems: isMe ? 'flex-end' : 'flex-start',
          marginBottom: spacing.sm,
          paddingHorizontal: spacing.lg,
        }}
      >
        {!isMe ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, marginLeft: 4 }}>
            <View style={{
              width: 18, height: 18, borderRadius: 9,
              backgroundColor: colors.brand,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 10, color: '#fff', fontWeight: font.weights.bold }}>K</Text>
            </View>
            <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: font.weights.medium }}>
              {t('aiAssistant.title')}
            </Text>
          </View>
        ) : null}
        <View style={{
          maxWidth: '82%',
          backgroundColor: isMe ? colors.brand : colors.bgElevated,
          borderRadius: radius.lg,
          borderTopRightRadius: isMe ? 4 : radius.lg,
          borderTopLeftRadius: isMe ? radius.lg : 4,
          padding: spacing.md,
          ...(!isMe ? shadows.sm : {}),
        }}>
          {m.pending ? (
            <View style={{ flexDirection: 'row', gap: 4, paddingVertical: 4 }}>
              <ActivityIndicator size="small" color={colors.brand} />
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginLeft: 6 }}>{t('aiAssistant.thinking')}</Text>
            </View>
          ) : (
            <Text style={{
              fontSize: font.sizes.md,
              color: isMe ? '#fff' : colors.text,
              lineHeight: 20,
            }}>
              {m.content}
            </Text>
          )}
        </View>
      </View>
    );
  };

  /** Chip de ação inline do Brain (Confirmar/Cancelar/Desfazer/criança). */
  const actionChip = (label: string, onPress: () => void, opts?: { primary?: boolean }) => (
    <TouchableOpacity
      key={label}
      onPress={onPress}
      disabled={sending}
      activeOpacity={0.8}
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.xl,
        backgroundColor: opts?.primary ? colors.brand : colors.bgSurface,
        borderWidth: opts?.primary ? 0 : 1,
        borderColor: colors.borderLight,
        opacity: sending ? 0.5 : 1,
      }}
    >
      <Text style={{
        fontSize: font.sizes.sm,
        fontWeight: font.weights.semibold,
        color: opts?.primary ? '#fff' : colors.text,
      }}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      transparent
      onRequestClose={close}
      presentationStyle="overFullScreen"
    >
      <KeyboardAvoidingView
        // Android: 'height' (não undefined) — Modal abre janela própria, fora do
        // alcance do adjustResize; sem isso o teclado cobre o input do chat.
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        style={{ flex: 1, backgroundColor: colors.bg }}
      >
        {/* Header */}
        <View style={{
          paddingTop: insets.top + spacing.sm,
          paddingBottom: spacing.md,
          paddingHorizontal: spacing.lg,
          backgroundColor: colors.bgElevated,
          borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
          flexDirection: 'row', alignItems: 'center', gap: spacing.md,
        }}>
          <TouchableOpacity onPress={close} hitSlop={8} testID="ai-modal-close">
            <Ionicons name="close" size={26} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{
              width: 32, height: 32, borderRadius: 16,
              backgroundColor: colors.brand,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 14, color: '#fff', fontWeight: font.weights.bold }}>K</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.bold, color: colors.text }}>
                {t('aiAssistant.title')}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                {t('aiAssistant.subtitle')}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleNewChat} hitSlop={8} testID="ai-modal-new-chat">
            <Ionicons name="add-circle-outline" size={24} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: spacing.md }}
          onContentSizeChange={onScrollContentSizeChange}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map(renderMessage)}

          {messages.length === 1 && messages[0].id === 'welcome' ? (
            <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.sm }}>
              <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: font.weights.semibold, textTransform: 'uppercase', letterSpacing: 1 }}>
                {t('aiAssistant.suggestionsLabel')}
              </Text>
              {SUGGESTIONS.map(s => (
                <TouchableOpacity
                  key={s}
                  onPress={() => send(s)}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: colors.bgElevated,
                    borderRadius: radius.md,
                    padding: spacing.md,
                    borderWidth: 1, borderColor: colors.borderLight,
                    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                  }}
                >
                  <Ionicons name="sparkles-outline" size={14} color={colors.brand} />
                  <Text style={{ fontSize: font.sizes.sm, color: colors.text, flex: 1 }}>{s}</Text>
                  <Ionicons name="arrow-forward" size={12} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </ScrollView>

        {/* Ações do Brain: escolher criança / confirmar prévia / desfazer */}
        {childPick && !sending ? (
          <View style={{
            flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
            paddingHorizontal: spacing.md, paddingBottom: spacing.xs,
            backgroundColor: colors.bg,
          }}>
            {childPick.options.map(o => actionChip(o.name.split(' ')[0], () => childPick.resubmit(o.id, o.name.split(' ')[0])))}
          </View>
        ) : null}
        {pendingIntake && !sending ? (
          <View style={{
            flexDirection: 'row', gap: spacing.sm,
            paddingHorizontal: spacing.md, paddingBottom: spacing.xs,
            backgroundColor: colors.bg,
          }}>
            {actionChip('✅ Confirmar e adicionar', () => void confirmIntake(), { primary: true })}
            {actionChip('Cancelar', cancelIntake)}
          </View>
        ) : null}
        {undoable && !sending && !pendingIntake ? (
          <View style={{
            flexDirection: 'row', gap: spacing.sm,
            paddingHorizontal: spacing.md, paddingBottom: spacing.xs,
            backgroundColor: colors.bg,
          }}>
            {actionChip('↩️ Desfazer', () => void undoIntake())}
          </View>
        ) : null}

        {/* Input */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          paddingHorizontal: spacing.md,
          paddingTop: spacing.sm,
          paddingBottom: insets.bottom + spacing.sm,
          backgroundColor: colors.bgElevated,
          borderTopWidth: 0.5, borderTopColor: colors.borderLight,
          gap: spacing.sm,
        }}>
          <TouchableOpacity
            onPress={() => void pickImage()}
            disabled={sending}
            hitSlop={8}
            accessibilityLabel="Enviar foto"
            testID="ai-modal-attach-photo"
            style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: colors.bgSurface,
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 2,
              opacity: sending ? 0.5 : 1,
            }}
          >
            <Ionicons name="image-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={{
            flex: 1,
            backgroundColor: colors.bgSurface,
            borderRadius: radius.xl,
            paddingHorizontal: spacing.lg,
            paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
            maxHeight: 100,
          }}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={t('aiAssistant.inputPlaceholder')}
              placeholderTextColor={colors.textDim}
              multiline
              editable={!sending}
              style={{
                fontSize: font.sizes.md,
                color: colors.text,
                maxHeight: 80,
              }}
              onSubmitEditing={() => send(input)}
            />
          </View>
          <TouchableOpacity
            onPress={() => send(input)}
            disabled={!input.trim() || sending}
            style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: input.trim() && !sending ? colors.brand : colors.borderLight,
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 2,
            }}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="send" size={18} color={input.trim() ? '#fff' : colors.textDim} />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
