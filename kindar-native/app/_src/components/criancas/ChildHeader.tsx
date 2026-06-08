/**
 * Header do perfil da criança — foto + nome + idade + tipo sanguíneo.
 * Usado no topo da tela /criancas/[id] nativa.
 */

import { useCallback } from 'react';
import { View, Text, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from 'src/i18n';
import { useIntl } from 'src/lib/intl';
import { colors, spacing, radius, font } from '../../design-system/tokens';
import type { Child, MedicalInfo } from '../../services/children';

interface Props {
  child: Child;
  medicalInfo: MedicalInfo | null;
}

export default function ChildHeader({ child, medicalInfo }: Props) {
  const t = useI18n((s) => s.t);
  const intl = useIntl();

  // Idade humanizada — math numérico (anos/meses) preservado; o TEXTO da
  // unidade é localizado via as chaves `onboardingForm.age*` (mesma lógica do
  // PWA em onboarding/_lib/format.ts → paridade nas 5 línguas).
  const calcAge = useCallback(
    (birthDate: string): string => {
      // Parse YYYY-MM-DD manually — `new Date("YYYY-MM-DD")` is interpreted as
      // UTC midnight, which in BR (UTC-3) shifts to the previous day for
      // edge-case age calculations.
      const [y, m, d] = birthDate.split('-').map(Number);
      if (!y || !m || !d) return '';
      const birth = new Date(y, m - 1, d);
      const now = new Date();
      const months =
        (now.getFullYear() - birth.getFullYear()) * 12 +
        (now.getMonth() - birth.getMonth()) -
        (now.getDate() < birth.getDate() ? 1 : 0);
      if (months < 1) return t('onboardingForm.ageNewborn');
      if (months < 12) {
        return months === 1
          ? t('onboardingForm.ageMonthOne')
          : t('onboardingForm.ageMonths', { count: months });
      }
      const years = Math.floor(months / 12);
      return years === 1
        ? t('onboardingForm.ageYearOne')
        : t('onboardingForm.ageYears', { count: years });
    },
    [t],
  );

  // Data de nascimento exibida (DD/MM/YYYY em pt-BR) → locale-aware.
  const formatBirthDate = useCallback(
    (birthDate: string): string => {
      const [y, m, d] = birthDate.split('-');
      if (!y || !m || !d) return '';
      return intl.formatDate(birthDate);
    },
    [intl],
  );
  const initials = child.full_name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
  const bloodType = medicalInfo?.blood_type ?? null;

  return (
    <View
      style={{
        backgroundColor: colors.bgElevated,
        paddingHorizontal: spacing.xl,
        paddingTop: spacing.lg,
        paddingBottom: spacing.xl,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.lg,
      }}
    >
      {/* RN <Image> uses accessibilityLabel, not alt — disable jsx-a11y rule */}
      {child.photo_url ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image
          source={{ uri: child.photo_url }}
          accessibilityLabel={t('childHeader.photoAlt', { name: child.full_name })}
          style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.bgSurface }}
        />
      ) : (
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: colors.brand,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: 'white', fontSize: font.sizes['2xl'], fontWeight: '700' }}>{initials}</Text>
        </View>
      )}

      <View style={{ flex: 1 }}>
        <Text
          style={{ fontSize: font.sizes.xl, fontWeight: '700', color: colors.text }}
          numberOfLines={1}
        >
          {child.full_name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 }}>
          <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>
            {calcAge(child.birth_date)}
          </Text>
          {bloodType && (
            <>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted }}>·</Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: '#FFE4E1',
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 2,
                  borderRadius: radius.sm,
                }}
              >
                <Ionicons name="water" size={10} color="#C62828" />
                <Text style={{ fontSize: font.sizes.xs, color: '#C62828', fontWeight: '700' }}>
                  {bloodType}
                </Text>
              </View>
            </>
          )}
        </View>
        <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>
          {formatBirthDate(child.birth_date)}
        </Text>
      </View>
    </View>
  );
}
