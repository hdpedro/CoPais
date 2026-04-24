/**
 * Kindar AI Assistant — chat com IA que chama /api/ai/assistant do PWA.
 *
 * Mesmo backend que o AIAssistant do PWA (685 LOC), que usa AI Router
 * (Groq → Together → Gemini) + 12 tools (create_expense, create_event,
 * get_custody_info, etc.) com confirmacao antes de acoes.
 *
 * TODO (v1.1.22+): Voice input via @jamsch/expo-speech-recognition (usa
 * SFSpeechRecognizer no iOS + SpeechRecognizer no Android). Requer:
 *  1. npm i @jamsch/expo-speech-recognition
 *  2. Config plugin no app.json com NSMicrophoneUsageDescription +
 *     NSSpeechRecognitionUsageDescription
 *  3. Prebuild + nova build EAS
 * Nao foi incluido nesta build (35) para nao atrasar o pacote de fixes.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/store/auth';
import { colors, spacing, radius, font, shadows } from '../src/design-system/tokens';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  id: string;
  pending?: boolean;
}

const SUGGESTIONS = [
  'Quem esta com a guarda hoje?',
  'Quais as proximas atividades?',
  'Qual meu saldo de despesas?',
  'Ver historico de saude das criancas',
];

export default function AIAssistantScreen() {
  const insets = useSafeAreaInsets();
  const { activeGroup } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Initial greeting
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: 'Oi! Sou o Kindar AI 👋\n\nPosso ajudar com despesas, eventos, consultas, resumos da familia e muito mais. O que voce precisa?',
      }]);
    }
  }, [messages.length]);

  async function send(text: string) {
    if (!text.trim() || sending || !activeGroup) return;

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text.trim() };
    const pendingMsg: ChatMessage = { id: `a-${Date.now()}`, role: 'assistant', content: '', pending: true };
    setMessages(prev => [...prev, userMsg, pendingMsg]);
    setInput('');
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      // Build history for the API (excluding welcome message and pending)
      const history = [...messages.filter(m => m.id !== 'welcome' && !m.pending), userMsg]
        .map(m => ({ role: m.role, content: m.content }));

      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error('Sessao expirada');

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
        throw new Error(data?.error || `Erro ${res.status}`);
      }

      // Replace pending message with actual response
      setMessages(prev => prev.map(m =>
        m.id === pendingMsg.id
          ? { ...m, content: data.content || 'Sem resposta.', pending: false }
          : m
      ));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Nao consegui responder agora';
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
  }

  const onScrollContentSizeChange = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: false });
  }, []);

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
              Kindar AI
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
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginLeft: 6 }}>Pensando...</Text>
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
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
              Kindar AI
            </Text>
            <Text style={{ fontSize: 11, color: colors.textSecondary }}>
              Assistente da familia
            </Text>
          </View>
        </View>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingVertical: spacing.md }}
        onContentSizeChange={onScrollContentSizeChange}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map(renderMessage)}

        {/* Suggestions — only when just the welcome message is present */}
        {messages.length === 1 && messages[0].id === 'welcome' ? (
          <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.sm }}>
            <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: font.weights.semibold, textTransform: 'uppercase', letterSpacing: 1 }}>
              Sugestoes
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
            placeholder="Pergunte qualquer coisa..."
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
  );
}
