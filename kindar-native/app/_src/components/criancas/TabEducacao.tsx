import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '../../design-system/tokens';
import type { ChildEducation } from '../../services/children';
import EmptyState from '../ui/EmptyState';

interface Props {
  education: ChildEducation | null;
  onEditPress?: () => void;
}

function Row({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.sm,
        gap: spacing.md,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: colors.brandLight,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={14} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </Text>
        <Text style={{ fontSize: font.sizes.md, color: colors.text, marginTop: 2 }} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export default function TabEducacao({ education, onEditPress }: Props) {
  if (!education || !education.school_name) {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <EmptyState
          icon="school-outline"
          title="Sem dados de escola"
          description="Cadastre nome da escola, série, professor(a) e horários para deixar a rotina mais clara."
          action={onEditPress ? { label: 'Cadastrar escola', onPress: onEditPress } : undefined}
        />
      </ScrollView>
    );
  }

  const hasSchedule = education.entry_time || education.exit_time;
  const extras = education.extracurricular_activities ?? [];

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['3xl'] }} showsVerticalScrollIndicator={false}>
      <View
        style={{
          backgroundColor: colors.bgElevated,
          borderRadius: radius.lg,
          padding: spacing.lg,
          marginBottom: spacing.md,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
          <Text style={{ fontSize: font.sizes.lg, fontWeight: '700', color: colors.text, flex: 1 }} numberOfLines={2}>
            {education.school_name}
          </Text>
          {onEditPress ? (
            <TouchableOpacity onPress={onEditPress} hitSlop={8}>
              <Ionicons name="pencil" size={16} color={colors.brand} />
            </TouchableOpacity>
          ) : null}
        </View>

        <Row icon="location-outline" label="Endereço" value={education.school_address} />
        <Row icon="call-outline" label="Telefone" value={education.school_phone} />
        <Row icon="library-outline" label="Série" value={education.grade} />
        <Row icon="people-outline" label="Turma" value={education.class_name} />
        <Row icon="person-outline" label="Professor(a)" value={education.teacher_name} />
        <Row icon="ribbon-outline" label="Coordenador(a)" value={education.coordinator_name} />
      </View>

      {hasSchedule ? (
        <View
          style={{
            backgroundColor: colors.bgElevated,
            borderRadius: radius.lg,
            padding: spacing.lg,
            marginBottom: spacing.md,
          }}
        >
          <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700', marginBottom: spacing.sm }}>
            Horários
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            {education.entry_time ? (
              <View style={{ alignItems: 'center' }}>
                <Ionicons name="sunny-outline" size={20} color={colors.accent} />
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 4 }}>Entrada</Text>
                <Text style={{ fontSize: font.sizes.lg, color: colors.text, fontWeight: '700', marginTop: 2 }}>
                  {education.entry_time.slice(0, 5)}
                </Text>
              </View>
            ) : null}
            {education.exit_time ? (
              <View style={{ alignItems: 'center' }}>
                <Ionicons name="moon-outline" size={20} color={colors.violet} />
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 4 }}>Saída</Text>
                <Text style={{ fontSize: font.sizes.lg, color: colors.text, fontWeight: '700', marginTop: 2 }}>
                  {education.exit_time.slice(0, 5)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {extras.length > 0 ? (
        <View
          style={{
            backgroundColor: colors.bgElevated,
            borderRadius: radius.lg,
            padding: spacing.lg,
          }}
        >
          <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700', marginBottom: spacing.md }}>
            Atividades extras
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {extras.map((act) => (
              <View
                key={act}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: 6,
                  backgroundColor: colors.brandLight,
                  borderRadius: radius.full,
                }}
              >
                <Text style={{ fontSize: font.sizes.sm, color: colors.brandDark, fontWeight: '600' }}>
                  {act}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
