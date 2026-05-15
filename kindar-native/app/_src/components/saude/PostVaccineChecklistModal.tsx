/**
 * PostVaccineChecklistModal (Native) — paridade com PWA.
 *
 * Modal bottom-sheet aparece após registrar vacina. Pergunta se o user
 * quer criar lembrete 48h pra observar reações leves. Cria child_activity
 * curta de 48h.
 *
 * Tom calmo, SEM juízo clínico. Copy: "Reações leves são esperadas. Em
 * caso de dúvida, contate o pediatra."
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from 'src/lib/supabase';
import { useI18n } from 'src/i18n';
import { useAuth } from 'src/store/auth';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

interface Props {
  visible: boolean;
  vaccineRecordId: string;
  childFirstName: string;
  onDone: () => void;
  onSkip: () => void;
}

export default function PostVaccineChecklistModal({
  visible,
  vaccineRecordId,
  childFirstName,
  onDone,
  onSkip,
}: Props) {
  const t = useI18n((s) => s.t);
  const { userId } = useAuth();
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!userId || !vaccineRecordId) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const { data: rec } = await supabase
        .from('vaccination_records')
        .select('group_id, child_id, vaccine_name, administered_date')
        .eq('id', vaccineRecordId)
        .single();
      if (!rec) {
        Alert.alert(t('common.error') || 'Erro', 'Registro não encontrado');
        return;
      }
      const startDate = rec.administered_date as string;
      const endDate = new Date(new Date(startDate + 'T12:00:00').getTime() + 2 * 86400000)
        .toISOString()
        .slice(0, 10);
      await supabase.from('child_activities').insert({
        group_id: rec.group_id,
        child_id: rec.child_id,
        name: `Observar pós-vacina: ${rec.vaccine_name}`,
        category: 'health',
        recurrence_type: 'never',
        start_date: startDate,
        end_date: endDate,
        is_active: true,
        notes:
          'Lembrete para observar nas primeiras 48h após a vacina. Reações leves (febre baixa, dor no local) são esperadas. Em caso de dúvida, contate o pediatra.',
        notify_hours_before: 24,
        created_by: userId,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone();
    } catch (e: any) {
      Alert.alert(t('common.error') || 'Erro', e?.message || 'Falha');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onSkip}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.3)',
          justifyContent: 'flex-end',
        }}
      >
        <View
          style={{
            backgroundColor: colors.bg,
            borderTopLeftRadius: radius.xl + 4,
            borderTopRightRadius: radius.xl + 4,
            padding: spacing.lg,
            paddingBottom: spacing.xl + 8,
            ...shadows.lg,
          }}
        >
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.borderLight,
              alignSelf: 'center',
              marginBottom: spacing.md,
            }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                backgroundColor: '#ECFDF5',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 18 }}>✓</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>
                {t('health.vaccineEngine.checklistPostVaccineTitle')}
                {childFirstName ? (
                  <Text style={{ color: colors.textMuted, fontWeight: font.weights.normal }}>
                    {' · '}
                    {childFirstName}
                  </Text>
                ) : null}
              </Text>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: spacing.xs }}>
                {t('health.vaccineEngine.checklistPostVaccineBody')}
              </Text>
            </View>
          </View>
          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            <TouchableOpacity
              disabled={saving}
              onPress={handleCreate}
              activeOpacity={0.85}
              style={{
                backgroundColor: colors.brand,
                paddingVertical: spacing.md,
                borderRadius: radius.md,
                alignItems: 'center',
              }}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
                  {t('health.vaccineEngine.checklistPostVaccineCreate')}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onSkip}
              activeOpacity={0.85}
              style={{
                paddingVertical: spacing.md,
                borderRadius: radius.md,
                alignItems: 'center',
                backgroundColor: colors.bgSurface,
              }}
            >
              <Text style={{ color: colors.textMuted, fontSize: font.sizes.md, fontWeight: font.weights.medium }}>
                {t('health.vaccineEngine.checklistPostVaccineSkip')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
