/**
 * WeekendPlanner — Horizontal strip with next N weekends and custody status.
 * Mirrors PWA /calendario/WeekendPlanner.
 *
 * Legend:
 *   - "Livre"    = fim de semana inteiro com o outro responsavel (voce pode viajar)
 *   - "Com voce" = fim de semana inteiro com voce
 *   - "Parcial"  = apenas um dos dias com voce
 *   - "Sem info" = nenhum evento de guarda marcado
 */

import { View, Text, ScrollView } from 'react-native';
import type { CalendarEvent } from '../../hooks/useCalendar';
import { useI18n } from '../../i18n';
import { useIntl } from '../../lib/intl';
import { colors, spacing, radius, font, shadows } from '../../design-system/tokens';

interface WeekendInfo {
  satDate: string;
  sunDate: string;
  satResponsibleId: string | null;
  satColor: string | null;
  sunResponsibleId: string | null;
  sunColor: string | null;
  status: 'livre' | 'parcial' | 'ocupado' | 'sem_info';
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Compute next N weekends with custody status for the current user. */
function computeWeekends(events: CalendarEvent[], currentUserId: string, count: number): WeekendInfo[] {
  // Build a per-day lookup from custody events. useCalendar pushes events in
  // priority order (swap → exception → regular), so the FIRST entry per day
  // wins — matches the calendar grid's `dayEvents.find(...)` behavior. Using
  // .set unconditionally would overwrite swaps with the regular schedule,
  // reverting the weekend strip to the pre-swap state (Angelino bug
  // 2026-05-05).
  const custodyByDay = new Map<string, { userId: string; color: string }>();
  for (const e of events) {
    if (e.type === 'custody' && e.responsibleId && !custodyByDay.has(e.date)) {
      custodyByDay.set(e.date, { userId: e.responsibleId, color: e.color });
    }
  }

  const today = new Date();
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dayOfWeek = current.getDay();
  const daysUntilSat = dayOfWeek === 6 ? 0 : 6 - dayOfWeek;
  current.setDate(current.getDate() + daysUntilSat);

  const out: WeekendInfo[] = [];
  for (let i = 0; i < count; i++) {
    const satKey = formatDateKey(current);
    const sun = new Date(current);
    sun.setDate(sun.getDate() + 1);
    const sunKey = formatDateKey(sun);

    const sat = custodyByDay.get(satKey) || null;
    const sunInfo = custodyByDay.get(sunKey) || null;

    let status: WeekendInfo['status'] = 'sem_info';
    if (sat && sunInfo) {
      const satIsOther = sat.userId !== currentUserId;
      const sunIsOther = sunInfo.userId !== currentUserId;
      if (satIsOther && sunIsOther) status = 'livre';
      else if (!satIsOther && !sunIsOther) status = 'ocupado';
      else status = 'parcial';
    } else if (sat || sunInfo) {
      status = 'parcial';
    }

    out.push({
      satDate: satKey, sunDate: sunKey,
      satResponsibleId: sat?.userId || null, satColor: sat?.color || null,
      sunResponsibleId: sunInfo?.userId || null, sunColor: sunInfo?.color || null,
      status,
    });
    current.setDate(current.getDate() + 7);
  }
  return out;
}

const STATUS_META: Record<WeekendInfo['status'], { labelKey: string; bg: string; border: string; text: string }> = {
  livre: { labelKey: 'weekendPlanner.statusFree', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.3)', text: '#15803d' },
  parcial: { labelKey: 'weekendPlanner.statusPartial', bg: 'rgba(232,162,40,0.1)', border: 'rgba(232,162,40,0.3)', text: '#b45309' },
  ocupado: { labelKey: 'weekendPlanner.statusWithYou', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)', text: '#1d4ed8' },
  sem_info: { labelKey: 'weekendPlanner.statusNoInfo', bg: 'rgba(107,114,128,0.08)', border: colors.borderLight, text: colors.textMuted },
};

interface Props {
  events: CalendarEvent[];
  currentUserId: string;
  count?: number;
}

export default function WeekendPlanner({ events, currentUserId, count = 6 }: Props) {
  const t = useI18n(s => s.t);
  const intl = useIntl();
  const weekends = computeWeekends(events, currentUserId, count);
  if (weekends.length === 0) return null;

  return (
    <View style={{ marginHorizontal: spacing.lg, marginBottom: spacing.lg, backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.lg, ...shadows.sm }}>
      <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text, marginBottom: spacing.sm }}>
        {t('weekendPlanner.heading')}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}>
        {weekends.map(w => {
          const sat = parseDateKey(w.satDate);
          const sun = parseDateKey(w.sunDate);
          const monthName = intl.formatMonthShort(sat);
          const cfg = STATUS_META[w.status];
          return (
            <View
              key={w.satDate}
              style={{
                width: 96, borderRadius: radius.md,
                borderWidth: 1, borderColor: cfg.border, backgroundColor: cfg.bg,
                paddingVertical: spacing.sm, paddingHorizontal: spacing.xs,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: 2 }}>
                {monthName}
              </Text>
              <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.bold, color: colors.text }}>
                {sat.getDate()}-{sun.getDate()}
              </Text>
              <View style={{ flexDirection: 'row', gap: 3, marginTop: 6, marginBottom: 4 }}>
                {w.satColor ? <View style={{ width: 18, height: 4, borderRadius: 2, backgroundColor: w.satColor }} /> : <View style={{ width: 18, height: 4 }} />}
                {w.sunColor ? <View style={{ width: 18, height: 4, borderRadius: 2, backgroundColor: w.sunColor }} /> : <View style={{ width: 18, height: 4 }} />}
              </View>
              <View style={{
                backgroundColor: cfg.bg, borderWidth: 1, borderColor: cfg.border,
                paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.full,
              }}>
                <Text style={{ fontSize: 10, color: cfg.text, fontWeight: font.weights.semibold }}>
                  {t(cfg.labelKey)}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
      <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: spacing.sm }}>
        {t('weekendPlanner.footer')}
      </Text>
    </View>
  );
}
