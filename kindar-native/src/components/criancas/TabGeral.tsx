import { View, Text, ScrollView } from 'react-native';
import { colors, spacing, radius, font } from '../../design-system/tokens';
import type { Child } from '../../services/children';

interface Props {
  child: Child;
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

export default function TabGeral({ child }: Props) {
  return (
    <ScrollView
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
        <Row label="Data de nascimento" value={new Date(child.birth_date).toLocaleDateString('pt-BR')} />
        <Row label="Sexo" value={child.sex === 'M' ? 'Masculino' : child.sex === 'F' ? 'Feminino' : null} />
        <Row label="CPF" value={child.cpf} />
        <Row label="RG" value={child.rg} />
        <Row label="Tipo sanguíneo" value={child.blood_type} />
      </View>

      {child.notes ? (
        <View
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
    </ScrollView>
  );
}
