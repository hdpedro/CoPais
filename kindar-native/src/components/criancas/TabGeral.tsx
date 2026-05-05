import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius, font, shadows } from '../../design-system/tokens';
import type { Child, MedicalInfo } from '../../services/children';
import EditChildSheet from './EditChildSheet';

interface Props {
  child: Child;
  medicalInfo?: MedicalInfo | null;
  groupId: string;
  onSaved?: () => void | Promise<void>;
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.md,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.borderLight,
      }}
    >
      <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, width: 130 }}>
        {label}
      </Text>
      <Text
        style={{ fontSize: font.sizes.md, color: colors.text, flex: 1, textAlign: 'right' }}
        numberOfLines={2}
      >
        {value ?? '—'}
      </Text>
    </View>
  );
}

export default function TabGeral({ child, medicalInfo, groupId, onSaved }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  // children.allergies is a TEXT[] column written by /criancas/nova. PWA shows
  // these as red chips on the Geral tab so a parent who entered "amendoim"
  // during cadastro actually sees it on the profile. Native was previously
  // dropping this data on the floor — bug fix for parity with
  // src/app/(app)/criancas/[id]/ChildDetailClient.tsx (TabGeral child.allergies block).
  const inlineAllergies = (child.allergies ?? []).filter((a) => a && a.trim().length > 0);

  return (
    <ScrollView
      testID="tab-geral-scroll"
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['3xl'] }}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={{
          backgroundColor: colors.bgElevated,
          borderRadius: radius.lg,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
        }}
      >
        <Row label="Nome completo" value={child.full_name} />
        <Row label="Data de nascimento" value={(() => {
          const [y, m, d] = child.birth_date.split('-');
          return y && m && d ? `${d}/${m}/${y}` : '—';
        })()} />
        <Row label="Sexo" value={child.sex === 'M' ? 'Masculino' : child.sex === 'F' ? 'Feminino' : null} />
        <Row label="CPF" value={child.cpf} />
        <Row label="RG" value={child.rg} />
        <Row label="Tipo sanguíneo" value={medicalInfo?.blood_type ?? null} />
      </View>

      {inlineAllergies.length > 0 ? (
        <View
          testID="tab-geral-allergies"
          style={{
            backgroundColor: colors.bgElevated,
            borderRadius: radius.lg,
            padding: spacing.lg,
            marginTop: spacing.lg,
          }}
        >
          <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' }}>
            Alergias
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }}>
            {inlineAllergies.map((a, i) => (
              <View
                key={`${a}-${i}`}
                testID={`tab-geral-allergy-${i}`}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: 4,
                  backgroundColor: 'rgba(229,57,53,0.1)',
                  borderRadius: radius.full,
                }}
              >
                <Text style={{ fontSize: font.sizes.xs, color: colors.error, fontWeight: '600' }}>
                  {a}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {child.notes ? (
        <View
          testID="tab-geral-notes"
          style={{
            backgroundColor: colors.bgElevated,
            borderRadius: radius.lg,
            padding: spacing.lg,
            marginTop: spacing.lg,
          }}
        >
          <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' }}>
            Anotações
          </Text>
          <Text style={{ fontSize: font.sizes.md, color: colors.text, marginTop: spacing.sm, lineHeight: 22 }}>
            {child.notes}
          </Text>
        </View>
      ) : null}

      {/* Edit CTA — opens bottom-sheet form. Parity with PWA's
          <details>Editar informações</details> block but with native
          chips/masks/date wheel and haptics. */}
      <TouchableOpacity
        testID="tab-geral-edit"
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setEditOpen(true); }}
        activeOpacity={0.85}
        style={{
          marginTop: spacing.lg,
          backgroundColor: colors.bgElevated,
          borderRadius: radius.lg,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          ...shadows.sm,
        }}
      >
        <View
          style={{
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: `${colors.brand}15`,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons name="create-outline" size={18} color={colors.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text }}>
            Editar informações
          </Text>
          <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }}>
            Nome, nascimento, CPF, RG, alergias e anotações
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
      </TouchableOpacity>

      <EditChildSheet
        visible={editOpen}
        child={child}
        medicalInfo={medicalInfo ?? null}
        groupId={groupId}
        onClose={() => setEditOpen(false)}
        onSaved={async () => { if (onSaved) await onSaved(); }}
      />
    </ScrollView>
  );
}
