/**
 * Header do perfil da criança — foto + nome + idade + tipo sanguíneo.
 * Usado no topo da tela /criancas/[id] nativa.
 */

import { View, Text, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '../../design-system/tokens';
import type { Child, MedicalInfo } from '../../services/children';

function calcAge(birthDate: string): string {
  const birth = new Date(birthDate);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) years--;
  if (years === 0) {
    const months = (now.getFullYear() - birth.getFullYear()) * 12 + m;
    return `${Math.max(months, 0)} ${months === 1 ? 'mês' : 'meses'}`;
  }
  return `${years} ${years === 1 ? 'ano' : 'anos'}`;
}

interface Props {
  child: Child;
  medicalInfo: MedicalInfo | null;
}

export default function ChildHeader({ child, medicalInfo }: Props) {
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
          accessibilityLabel={`Foto de ${child.full_name}`}
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
          {new Date(child.birth_date).toLocaleDateString('pt-BR')}
        </Text>
      </View>
    </View>
  );
}
