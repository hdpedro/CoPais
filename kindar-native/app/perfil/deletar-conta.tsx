/**
 * Deletar Conta — Apple Guideline 5.1.1(v).
 *
 * Fluxo em 2 etapas:
 *   1. Tela de aviso listando o que sera apagado + aviso sobre Apple IAP
 *   2. Input exigindo que o usuario digite DELETAR (case-sensitive) +
 *      checkbox de consentimento
 *
 * Chama POST /api/auth/delete-account com Bearer token — o endpoint cancela
 * subscriptions Stripe, deleta de auth.users (cascata pra profiles + tudo),
 * entao o native faz signOut e redireciona pra /login.
 */

import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/store/auth';
import { colors, spacing, radius, font } from '../../src/design-system/tokens';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';
const CONFIRM_WORD = 'DELETAR';

const WHAT_GETS_DELETED = [
  'Seu perfil e dados pessoais',
  'Todas as criancas cadastradas por voce',
  'Eventos, calendario e escala de guarda',
  'Despesas, comprovantes e historico financeiro',
  'Mensagens e anexos do chat',
  'Documentos enviados',
  'Registros de saude (consultas, vacinas, medicamentos)',
  'Decisoes, acordos e notas',
];

export default function DeletarContaScreen() {
  const insets = useSafeAreaInsets();
  const [confirmText, setConfirmText] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = confirmText === CONFIRM_WORD && acknowledged && !submitting;

  async function handleDelete() {
    if (!canSubmit) return;

    Alert.alert(
      'Tem certeza absoluta?',
      'Essa acao e irreversivel. Todos os seus dados serao apagados permanentemente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sim, deletar conta',
          style: 'destructive',
          onPress: confirmDelete,
        },
      ]
    );
  }

  async function confirmDelete() {
    setSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        Alert.alert('Erro', 'Sessao expirada. Faca login novamente.');
        setSubmitting(false);
        return;
      }

      const res = await fetch(`${WEB_URL}/api/auth/delete-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ confirmation: CONFIRM_WORD }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Erro ${res.status}`);
      }

      // Sucesso: limpa sessao local e vai pro login
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await useAuth.getState().signOut();
      Alert.alert(
        'Conta deletada',
        'Sua conta e todos os dados associados foram removidos. Obrigado por ter usado o Kindar.',
        [{ text: 'OK', onPress: () => router.replace('/auth/login') }]
      );
    } catch (err: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = (err as { message?: string })?.message || 'Erro inesperado';
      Alert.alert('Erro', msg);
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      {/* Header */}
      <View style={{
        paddingTop: insets.top + spacing.sm,
        paddingBottom: spacing.md,
        paddingHorizontal: spacing.lg,
        flexDirection: 'row', alignItems: 'center', gap: spacing.md,
        borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
      }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} disabled={submitting}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
          Deletar conta
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Warning icon + headline */}
        <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
          <View style={{
            width: 64, height: 64, borderRadius: 32,
            backgroundColor: 'rgba(229,57,53,0.12)',
            alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
          }}>
            <Ionicons name="warning-outline" size={32} color={colors.error} />
          </View>
          <Text style={{
            fontSize: font.sizes.xl, fontWeight: font.weights.bold,
            color: colors.text, textAlign: 'center', marginBottom: spacing.sm,
          }}>
            Esta acao e permanente
          </Text>
          <Text style={{
            fontSize: font.sizes.sm, color: colors.textSecondary,
            textAlign: 'center', lineHeight: 20,
          }}>
            Depois de confirmada, nao e possivel reverter. Considere exportar seus dados antes
            pelo email suporte@kindar.com.br.
          </Text>
        </View>

        {/* What gets deleted */}
        <View style={{
          backgroundColor: colors.bgElevated, borderRadius: radius.lg,
          padding: spacing.lg, marginBottom: spacing.lg,
        }}>
          <Text style={{
            fontSize: font.sizes.xs, fontWeight: font.weights.semibold,
            color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1,
            marginBottom: spacing.md,
          }}>
            O que sera apagado
          </Text>
          {WHAT_GETS_DELETED.map((item, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.xs }}>
              <Ionicons name="close-circle" size={16} color={colors.error} style={{ marginTop: 2 }} />
              <Text style={{ fontSize: font.sizes.sm, color: colors.text, flex: 1, lineHeight: 20 }}>
                {item}
              </Text>
            </View>
          ))}
        </View>

        {/* Apple subscription warning */}
        {Platform.OS === 'ios' ? (
          <View style={{
            backgroundColor: 'rgba(59,130,246,0.06)',
            borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg,
            borderWidth: 1, borderColor: 'rgba(59,130,246,0.18)',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
              <Ionicons name="information-circle-outline" size={18} color="#3B82F6" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text, marginBottom: 4 }}>
                  Assinaturas Apple
                </Text>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, lineHeight: 18 }}>
                  Se voce tem uma assinatura ativa via App Store, ela NAO e cancelada automaticamente
                  com a delecao da conta. Cancele manualmente em Ajustes &gt; Apple ID &gt; Assinaturas
                  &gt; Kindar.
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Typed confirmation */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text, marginBottom: spacing.sm }}>
          Digite DELETAR para confirmar
        </Text>
        <TextInput
          value={confirmText}
          onChangeText={setConfirmText}
          placeholder="DELETAR"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!submitting}
          style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.md,
            borderWidth: 1, borderColor: confirmText === CONFIRM_WORD ? colors.error : colors.borderLight,
            paddingVertical: spacing.md + 2, paddingHorizontal: spacing.lg,
            fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg,
            letterSpacing: 2,
          }}
        />

        {/* Acknowledgement checkbox */}
        <TouchableOpacity
          onPress={() => setAcknowledged(!acknowledged)}
          activeOpacity={0.7}
          disabled={submitting}
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.xl }}
        >
          <View style={{
            width: 18, height: 18, borderRadius: 4, marginTop: 2,
            borderWidth: 1.5,
            borderColor: acknowledged ? colors.error : colors.border,
            backgroundColor: acknowledged ? colors.error : 'transparent',
            alignItems: 'center', justifyContent: 'center',
          }}>
            {acknowledged ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
          </View>
          <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, flex: 1, lineHeight: 18 }}>
            Entendo que esta acao e irreversivel e apagara permanentemente todos os meus dados no Kindar.
          </Text>
        </TouchableOpacity>

        {/* Delete button */}
        <TouchableOpacity
          onPress={handleDelete}
          disabled={!canSubmit}
          activeOpacity={0.85}
          style={{
            backgroundColor: canSubmit ? colors.error : colors.borderLight,
            borderRadius: radius.md,
            paddingVertical: spacing.md + 2, alignItems: 'center',
          }}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: canSubmit ? '#fff' : colors.textMuted, fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
              Deletar minha conta permanentemente
            </Text>
          )}
        </TouchableOpacity>

        {/* Cancel */}
        <TouchableOpacity
          onPress={() => router.back()}
          disabled={submitting}
          style={{ alignItems: 'center', paddingVertical: spacing.lg, marginTop: spacing.sm }}
        >
          <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>
            Cancelar e voltar
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
