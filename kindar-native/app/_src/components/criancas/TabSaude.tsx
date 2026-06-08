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
  MedicalProfessional,
} from '../../services/children';
import { formatCRM } from '../../lib/format';
import { useI18n } from '../../i18n';

interface Props {
  childId: string;
  medicalInfo: MedicalInfo | null;
  latestGrowth: GrowthRecord | null;
  allergies: Allergy[];
  medications: ActiveMedication[];
  vaccinations: Vaccination[];
  professionals: MedicalProfessional[];
  /** Abre o editor da criança (tipo sanguíneo vive lá). Vem do [id].tsx. */
  onEditBloodType?: () => void;
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

// Mapeamento enum → chave i18n. Resolvido com t() no render (paridade
// visual com `app/saude/alergias.tsx`). Retorna a key da label, ou null
// quando o enum é desconhecido — aí o render cai pro valor cru.
function allergyTypeKey(type: string): string | null {
  switch (type) {
    case 'food': return 'childHealth.allergyTypeFood';
    case 'medication': return 'healthRegister.type_medication';
    case 'environmental': return 'childHealth.allergyTypeEnvironmental';
    case 'insect': return 'childHealth.allergyTypeInsect';
    case 'other': return 'health.export.typeOther';
    default: return null;
  }
}

function severityKey(severity: string): string | null {
  switch (severity) {
    case 'severe': return 'health.severityGrave';
    case 'moderate': return 'health.severityModerate';
    case 'mild': return 'health.severityMild';
    default: return null;
  }
}

export default function TabSaude({ childId, medicalInfo, latestGrowth, allergies, medications, vaccinations, professionals, onEditBloodType }: Props) {
  const t = useI18n((s) => s.t);
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['3xl'] }} showsVerticalScrollIndicator={false}>
      {/* Quick stats grid */}
      <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
        <Stat
          icon="water"
          color="#C62828"
          bg="#FFE4E1"
          label={t('childHealth.statBlood')}
          value={medicalInfo?.blood_type ?? '—'}
          onPress={onEditBloodType}
        />
        <Stat
          icon="speedometer"
          color="#2E7268"
          bg={colors.brandLight}
          label={t('health.weight')}
          value={latestGrowth?.weight_kg ? `${latestGrowth.weight_kg}kg` : '—'}
          onPress={() => router.push(`/saude/crescimento?childId=${childId}` as never)}
        />
        <Stat
          icon="resize"
          color="#7C6FAE"
          bg="#EAE5F5"
          label={t('health.height')}
          value={latestGrowth?.height_cm ? `${latestGrowth.height_cm}cm` : '—'}
          onPress={() => router.push(`/saude/crescimento?childId=${childId}` as never)}
        />
      </View>

      <Section
        title={t('childHealth.allergiesSection', { count: allergies.length })}
        action={{ label: t('saudeTab.seeAll'), onPress: () => router.push('/saude/alergias') }}
      >
        {allergies.length === 0 ? (
          <Empty text={t('health.noAllergiesRegistered')} />
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
              {/*
                Severity enum no banco e 'severe' | 'moderate' | 'mild'
                (vide `app/saude/alergias.tsx` + validacao em
                `api/health/allergies/route.ts`). Antes desse fix
                comparavamos com 'severa'/'moderada' (PT-BR feminino) e
                o dot nunca virava vermelho/amarelo — sempre cinza.
              */}
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  marginTop: 6,
                  backgroundColor:
                    a.severity === 'severe' ? '#E53935' : a.severity === 'moderate' ? '#FFA726' : '#4CAF50',
                }}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.sizes.md, color: colors.text, fontWeight: '500' }}>
                  {a.name}
                </Text>
                {/* Linha secundaria: tipo + severidade + reacao quando houver. */}
                <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }}>
                  {[
                    a.allergy_type ? (allergyTypeKey(a.allergy_type) ? t(allergyTypeKey(a.allergy_type)!) : a.allergy_type) : null,
                    a.severity ? (severityKey(a.severity) ? t(severityKey(a.severity)!) : a.severity) : null,
                    a.reaction || null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </View>
          ))
        )}
      </Section>

      <Section
        title={t('healthExport.medicationsSection', { count: medications.length })}
        action={{ label: t('saudeTab.seeAll'), onPress: () => router.push('/saude/medicamentos') }}
      >
        {medications.length === 0 ? (
          <Empty text={t('childHealth.noActiveMedications')} />
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
                {[m.dosage, m.frequency].filter(Boolean).join(' · ') || t('childHealth.noDetails')}
              </Text>
            </View>
          ))
        )}
      </Section>

      <Section
        title={t('childHealth.vaccinesSection', { count: vaccinations.length })}
        action={{ label: t('saudeTab.seeAll'), onPress: () => router.push('/saude/vacinas') }}
      >
        {vaccinations.length === 0 ? (
          <Empty text={t('childProfile.noVaccines')} />
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
                {v.dose_label ? <Text style={{ color: colors.textMuted }}> · {v.dose_label}</Text> : null}
              </Text>
              {v.administered_date ? (
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>
                  {/* Usar split em vez de new Date pra evitar shift de timezone
                      (DATE column do PG vem como YYYY-MM-DD e new Date()
                      interpreta como UTC midnight, voltando 1 dia em UTC-3). */}
                  {v.administered_date.split('-').reverse().join('/')}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </Section>

      {medicalInfo?.insurance_name ? (
        <Section title={t('childProfile.healthInsurance')}>
          <Text style={{ fontSize: font.sizes.md, color: colors.text }}>{medicalInfo.insurance_name}</Text>
          {medicalInfo.insurance_number ? (
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 4 }}>
              {t('childHealth.insuranceCardLabel')} {medicalInfo.insurance_number}
            </Text>
          ) : null}
        </Section>
      ) : null}

      <Section
        title={t('childHealth.professionalsSection', { count: professionals.length })}
        action={{ label: t('saudeTab.seeAll'), onPress: () => router.push('/saude/profissionais') }}
      >
        {professionals.length === 0 ? (
          <Empty text={t('health.export.noProfessionals')} />
        ) : (
          professionals.slice(0, 3).map((p, idx) => {
            const crm = formatCRM(p.crm);
            const last = idx === Math.min(professionals.length, 3) - 1;
            return (
              <TouchableOpacity
                key={p.id}
                onPress={() => router.push('/saude/profissionais')}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: spacing.sm,
                  borderBottomWidth: last ? 0 : 0.5,
                  borderBottomColor: colors.borderLight,
                  gap: spacing.sm,
                }}
              >
                <Text style={{ fontSize: 18 }}>👨‍⚕️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.sizes.md, color: colors.text, fontWeight: '500' }} numberOfLines={1}>
                    {p.name}
                  </Text>
                  {(p.specialty || crm) ? (
                    <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>
                      {[p.specialty, crm ? `CRM ${crm}` : null].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.textDim} />
              </TouchableOpacity>
            );
          })
        )}
      </Section>
    </ScrollView>
  );
}

function Stat({
  icon,
  color,
  bg,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const t = useI18n((s) => s.t);
  const card = (
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
      {/* Dica de descoberta: tester iOS (2026-06-04) tocou os cards esperando
          editar e nada acontecia — eram só resumo. Agora levam ao editor
          certo (Sangue → editar criança; Peso/Altura → Crescimento). */}
      {onPress ? (
        <Text style={{ fontSize: 10, color: colors.brand, fontWeight: '600', marginTop: 3 }}>
          {t('calendarTab.actionEdit')}
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) return card;
  return (
    <TouchableOpacity
      style={{ flex: 1 }}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={t('childHealth.editStatA11y', { label })}
    >
      {card}
    </TouchableOpacity>
  );
}
