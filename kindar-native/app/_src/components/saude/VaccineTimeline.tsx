/**
 * VaccineTimeline (Native) — versão Apple Health da carteirinha vacinal.
 *
 * Render em FlatList aninhada (cada faixa etária = section). Pontos coloridos
 * indicam status. Tap abre detalhes inline (toggle).
 *
 * Sem juízo clínico. Linguagem calma.
 */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font } from 'src/design-system/tokens';
import type { TimelineGroup, VaccineDoseStatus, VaccineStatus } from 'src/services/health';

interface Props {
  timeline: TimelineGroup[];
}

const STATUS_COLOR: Record<VaccineStatus, string> = {
  taken: '#10B981', // emerald-500
  due_soon: '#FBBF24', // amber-400
  overdue: '#F59E0B', // amber-500
  upcoming: '#7DD3FC', // sky-300
  future: '#E5E7EB', // gray-200
  historical_gap: '#D1D5DB', // gray-300
  out_of_window: '#F3F4F6', // gray-100
};

function formatBrDate(iso: string): string {
  return iso.split('-').reverse().join('/');
}

export default function VaccineTimeline({ timeline }: Props) {
  const t = useI18n((s) => s.t);
  const [expanded, setExpanded] = useState<string | null>(null);

  const items = useMemo(() => {
    const arr: Array<{ type: 'group'; ageBucket: string } | { type: 'dose'; dose: VaccineDoseStatus }> = [];
    for (const g of timeline) {
      arr.push({ type: 'group', ageBucket: g.ageBucket });
      for (const d of g.doses) arr.push({ type: 'dose', dose: d });
    }
    return arr;
  }, [timeline]);

  if (items.length === 0) {
    return (
      <View style={{ padding: spacing.xl, alignItems: 'center' }}>
        <Text style={{ color: colors.textMuted, fontSize: font.sizes.sm }}>
          {t('health.vaccineEngine.timelineEmpty')}
        </Text>
      </View>
    );
  }

  function statusLabel(d: VaccineDoseStatus): string {
    if (d.status === 'taken' && d.takenDate) {
      return t('health.vaccineEngine.doseTakenOn', { date: formatBrDate(d.takenDate) });
    }
    if (d.status === 'future') return t('health.vaccineEngine.doseFuture');
    if (d.status === 'historical_gap') return t('health.vaccineEngine.doseHistoricalGap');
    if (d.status === 'out_of_window') return t('health.vaccineEngine.doseOutOfWindow');
    if (d.status === 'upcoming') return `${t('health.vaccineEngine.doseFuture')} · ${formatBrDate(d.dueDate)}`;
    return formatBrDate(d.dueDate);
  }

  return (
    <FlatList
      data={items}
      scrollEnabled={false}
      keyExtractor={(item, idx) =>
        item.type === 'group' ? `g-${item.ageBucket}-${idx}` : `d-${item.dose.id}`
      }
      renderItem={({ item }) => {
        if (item.type === 'group') {
          return (
            <View style={{ marginTop: spacing.md, marginBottom: spacing.xs, paddingHorizontal: spacing.lg }}>
              <Text
                style={{
                  fontSize: font.sizes.xs,
                  fontWeight: font.weights.semibold,
                  color: colors.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                {t(`health.vaccineEngine.ageBucket_${item.ageBucket}`)}
              </Text>
            </View>
          );
        }
        const d = item.dose;
        const isOpen = expanded === d.id;
        // Doses taken com record_id → tap abre detalhe.
        // Doses pendentes/futuras → tap expande inline com janela info.
        const isLinkable = d.status === 'taken' && d.takenRecordId;
        return (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              if (isLinkable && d.takenRecordId) {
                router.push(`/saude/vacinas/${d.takenRecordId}` as never);
              } else {
                setExpanded(isOpen ? null : d.id);
              }
            }}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm,
              gap: spacing.md,
            }}
          >
            <View
              style={{
                width: 12,
                height: 12,
                marginTop: 6,
                borderRadius: 6,
                backgroundColor: STATUS_COLOR[d.status],
                borderWidth: 1,
                borderColor: '#0006',
              }}
            />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text }}>
                  {d.vaccineName}
                  {d.doseLabel ? (
                    <Text style={{ color: colors.textSecondary, fontWeight: font.weights.normal }}>
                      {' · '}
                      {d.doseLabel}
                    </Text>
                  ) : null}
                </Text>
                {d.ruleNetwork === 'public' ? (
                  <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: '#ECFDF5' }}>
                    <Text style={{ fontSize: 9, fontWeight: font.weights.semibold, color: '#047857', letterSpacing: 0.5 }}>
                      PNI
                    </Text>
                  </View>
                ) : d.ruleNetwork === 'private' ? (
                  <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: '#F0F9FF' }}>
                    <Text style={{ fontSize: 9, fontWeight: font.weights.semibold, color: '#0369A1', letterSpacing: 0.5 }}>
                      SBIm
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }}>
                {statusLabel(d)}
              </Text>
              {isOpen ? (
                <View
                  style={{
                    marginTop: spacing.xs,
                    paddingTop: spacing.xs,
                    borderTopWidth: 0.5,
                    borderTopColor: colors.borderLight,
                  }}
                >
                  {d.validUntilDate ? (
                    <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>
                      Janela até {formatBrDate(d.validUntilDate)}
                    </Text>
                  ) : null}
                  {d.overdueDays && d.status === 'overdue' ? (
                    <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>
                      Disponível há {d.overdueDays} dia{d.overdueDays === 1 ? '' : 's'}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        );
      }}
      ItemSeparatorComponent={() => null}
      style={{
        borderLeftWidth: 1,
        borderLeftColor: colors.borderLight,
        marginLeft: spacing.lg,
      }}
    />
  );
}
