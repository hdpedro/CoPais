/**
 * AIAssistantSheet — modal flutuante do Kindar AI.
 *
 * Equivalente nativo do PWA `src/components/AIAssistant.tsx` (portal + bubble).
 * O conteúdo do chat (mensagens, sugestões, fetch para /api/ai/assistant)
 * é o mesmo de `app/ai.tsx` — apenas embrulhado em um Modal slide-from-bottom
 * controlado pelo store `useAIModal`.
 *
 * Backend: AI Router (Groq → Together → Gemini) + 12 tools.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useI18n } from 'src/i18n';
import { useAuth } from '../../store/auth';
import { useAIModal } from '../../store/ai-modal';
import { colors, spacing, radius, font, shadows } from '../../design-system/tokens';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  id: string;
  pending?: boolean;
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

  const send = useCallback(async (text: string) => {
    if (!text.trim() || sending || !activeGroup) return;

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text.trim() };
    const pendingMsg: ChatMessage = { id: `a-${Date.now()}`, role: 'assistant', content: '', pending: true };
    setMessages(prev => [...prev, userMsg, pendingMsg]);
    setInput('');
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const history = [...messages.filter(m => m.id !== 'welcome' && !m.pending), userMsg]
        .map(m => ({ role: m.role, content: m.content }));

      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error(t('aiAssistant.sessionExpired'));

      const res = await fetch(`${WEB_URL}/api/ai/assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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
      setMessages(prev => prev.map(m =>
        m.id === pendingMsg.id
          ? { ...m, content: `⚠️ ${msg}`, pending: false }
          : m
      ));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, sending, activeGroup, t]);

  const onScrollContentSizeChange = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: false });
  }, []);

  const handleNewChat = useCallback(() => {
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
