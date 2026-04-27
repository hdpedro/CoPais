import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '../../design-system/tokens';
import type {
  MedicalInfo,
  GrowthRecord,
  Allergy,
  ActiveMedication,
  Vaccination,
} from '../../services/children';

interface Props {
  childId: string;
  medicalInfo: MedicalInfo | null;
  latestGrowth: GrowthRecord | null;
  allergies: Allergy[];
  medications: ActiveMedication[];
  vaccinations: Vaccination[];
}

function Section({ title, action, children }: { title: string; action?: { label: string; onPress: () => void }; children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.bgElevated,
        borderRadius: radius.lg,
        padding: spacing.lg,
        marginBottom: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
        <Text
          style={{
            fontSize: font.sizes.xs,
            color: colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            fontWeight: '700',
          }}
        >
          {title}
        </Text>
        {action ? (
          <TouchableOpacity onPress={action.onPress} hitSlop={8}>
            <Text style={{ fontSize: font.sizes.sm, color: colors.brand, fontWeight: '600' }}>
              {action.label}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted }}>{text}</Text>;
}

export default function TabSaude({ medicalInfo, latestGrowth, allergies, medications, vaccinations }: Props) {
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['3xl'] }} showsVerticalScrollIndicator={false}>
      {/* Quick stats grid */}
      <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
        <Stat
          icon="water"
          color="#C62828"
          bg="#FFE4E1"
          label="Sangue"
          value={medicalInfo?.blood_type ?? '—'}
        />
        <Stat
          icon="speedometer"
          color="#2E7268"
          bg={colors.brandLight}
          label="Peso"
          value={latestGrowth?.weight_kg ? `${latestGrowth.weight_kg}kg` : '—'}
        />
        <Stat
          icon="resize"
          color="#7C6FAE"
          bg="#EAE5F5"
          label="Altura"
          value={latestGrowth?.height_cm ? `${latestGrowth.height_cm}cm` : '—'}
        />
      </View>

      <Section
        title={`Alergias (${allergies.length})`}
        action={{ label: 'Ver tudo', onPress: () => router.push('/saude/alergias') }}
      >
        {allergies.length === 0 ? (
          <Empty text="Nenhuma alergia registrada." />
        ) : (
          allergies.slice(0, 5).map((a) => (
            <View
              key={a.id}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                paddingVertical: spacing.sm,
                gap: spacing.sm,
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  marginTop: 6,
                  backgroundColor:
                    a.severity === 'severa' ? '#E53935' : a.severity === 'moderada' ? '#FFA726' : colors.textMuted,
                }}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.sizes.md, color: colors.text, fontWeight: '500' }}>
                  {a.allergen}
                </Text>
                {a.severity ? (
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }}>
                    Severidade: {a.severity}
                  </Text>
                ) : null}
              </View>
            </View>
          ))
        )}
      </Section>

      <Section
        title={`Medicamentos ativos (${medications.length})`}
        action={{ label: 'Ver tudo', onPress: () => router.push('/saude/medicamentos') }}
      >
        {medications.length === 0 ? (
          <Empty text="Sem medicamentos ativos." />
        ) : (
          medications.map((m) => (
            <View
              key={m.id}
              style={{
                paddingVertical: spacing.sm,
                borderBottomWidth: 0.5,
                borderBottomColor: colors.borderLight,
              }}
            >
              <Text style={{ fontSize: font.sizes.md, color: colors.text, fontWeight: '500' }}>{m.name}</Text>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }}>
                {[m.dosage, m.frequency].filter(Boolean).join(' · ') || 'Sem detalhes'}
              </Text>
            </View>
          ))
        )}
      </Section>

      <Section
        title={`Vacinas (${vaccinations.length})`}
        action={{ label: 'Ver tudo', onPress: () => router.push('/saude/vacinas') }}
      >
        {vaccinations.length === 0 ? (
          <Empty text="Nenhuma vacina registrada." />
        ) : (
          vaccinations.slice(0, 5).map((v) => (
            <View
              key={v.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: spacing.sm,
              }}
            >
              <Ionicons name="shield-checkmark" size={16} color={colors.success} style={{ marginRight: spacing.sm }} />
              <Text style={{ fontSize: font.sizes.sm, color: colors.text, flex: 1 }} numberOfLines={1}>
                {v.vaccine_name}
              </Text>
              {v.applied_date ? (
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>
                  {new Date(v.applied_date).toLocaleDateString('pt-BR')}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </Section>

      {medicalInfo?.health_insurance ? (
        <Section title="Plano de saúde">
          <Text style={{ fontSize: font.sizes.md, color: colors.text }}>{medicalInfo.health_insurance}</Text>
          {medicalInfo.insurance_card_number ? (
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 4 }}>
              Carteirinha: {medicalInfo.insurance_card_number}
            </Text>
          ) : null}
        </Section>
      ) : null}
    </ScrollView>
  );
}

function Stat({
  icon,
  color,
  bg,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  label: string;
  value: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bgElevated,
        borderRadius: radius.lg,
        padding: spacing.md,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 6,
        }}
      >
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, fontWeight: '600' }}>{label}</Text>
      <Text style={{ fontSize: font.sizes.md, color: colors.text, fontWeight: '700', marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
}
