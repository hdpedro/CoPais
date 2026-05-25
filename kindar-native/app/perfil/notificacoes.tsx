/**
 * /perfil/notificacoes — Native screen pra preferências de notificação.
 * Espelha a página PWA. Consume /api/notifications/prefs (GET/PATCH).
 *
 * UI design:
 *  - Section Mute (botões 1h/4h/amanhã/limpar) + indicador quando mutado
 *  - Section Quiet hours (toggle + 2 time pickers quando enabled)
 *  - Section Categories (13 toggles com hint)
 *  - Optimistic UI via state local + sync com server na resposta
 */

import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useI18n } from 'src/i18n';
import { apiFetch } from 'src/lib/api-fetch';
import { reportError } from 'src/lib/error-reporter';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

type Category =
  | 'activity_reminders'
  | 'activity_digest'
  | 'vaccine_alerts'
  | 'chat'
  | 'school_collab'
  | 'expense_collab'
  | 'health_collab'
  | 'decisions'
  | 'swap'
  | 'retention'
  | 'birthday'
  | 'balance_operations'
  | 'settlements';

interface Prefs {
  quiet_hours: { enabled: boolean; start: string; end: string };
  mute_until: string | null;
  categories: Partial<Record<Category, boolean>>;
}

const CATEGORIES: Array<{ key: Category; labelKey: string; hintKey: string }> = [
  { key: 'activity_reminders', labelKey: 'catActivityReminders', hintKey: 'catActivityRemindersHint' },
  { key: 'activity_digest', labelKey: 'catActivityDigest', hintKey: 'catActivityDigestHint' },
  { key: 'chat', labelKey: 'catChat', hintKey: 'catChatHint' },
  { key: 'vaccine_alerts', labelKey: 'catVaccineAlerts', hintKey: 'catVaccineAlertsHint' },
  { key: 'health_collab', labelKey: 'catHealthCollab', hintKey: 'catHealthCollabHint' },
  { key: 'school_collab', labelKey: 'catSchoolCollab', hintKey: 'catSchoolCollabHint' },
  { key: 'expense_collab', labelKey: 'catExpenseCollab', hintKey: 'catExpenseCollabHint' },
  { key: 'decisions', labelKey: 'catDecisions', hintKey: 'catDecisionsHint' },
  { key: 'swap', labelKey: 'catSwap', hintKey: 'catSwapHint' },
  { key: 'balance_operations', labelKey: 'catBalanceOperations', hintKey: 'catBalanceOperationsHint' },
  { key: 'settlements', labelKey: 'catSettlements', hintKey: 'catSettlementsHint' },
  { key: 'birthday', labelKey: 'catBirthday', hintKey: 'catBirthdayHint' },
  { key: 'retention', labelKey: 'catRetention', hintKey: 'catRetentionHint' },
];

function parseHHMM(s: string): { h: number; m: number } {
  const [h, m] = s.split(':').map(Number);
  return { h: h || 0, m: m || 0 };
}
function fmtHHMM(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function NotificacoesScreen() {
  const t = useI18n((s) => s.t);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch<Prefs>('/api/notifications/prefs');
      if (r.ok && r.data) setPrefs(r.data);
    } catch (e) {
      reportError(e, { filePath: 'app/perfil/notificacoes.tsx', metadata: { phase: 'load' } });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function patch(body: Partial<Prefs>) {
    if (!prefs) return;
    // Optimistic
    const optimistic: Prefs = {
      quiet_hours: { ...prefs.quiet_hours, ...(body.quiet_hours ?? {}) },
      mute_until: body.mute_until !== undefined ? body.mute_until : prefs.mute_until,
      categories: { ...prefs.categories, ...(body.categories ?? {}) },
    };
    setPrefs(optimistic);
    setSaving(true);
    try {
      const r = await apiFetch<Prefs>('/api/notifications/prefs', { method: 'PATCH', body });
      if (r.ok && r.data) setPrefs(r.data);
    } catch (e) {
      reportError(e, { filePath: 'app/perfil/notificacoes.tsx', metadata: { phase: 'patch' } });
      load();
    } finally {
      setSaving(false);
    }
  }

  function toggleCategory(key: Category, value: boolean) {
    Haptics.selectionAsync();
    patch({ categories: { [key]: value } });
  }

  function toggleQuietHours(value: boolean) {
    Haptics.selectionAsync();
    patch({ quiet_hours: { enabled: value, start: prefs?.quiet_hours.start || '22:00', end: prefs?.quiet_hours.end || '07:00' } });
  }

  function applyQuickMute(duration: '1h' | '4h' | 'tomorrow' | 'clear') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const now = new Date();
    let mute_until: string | null = null;
    if (duration === '1h') mute_until = new Date(now.getTime() + 60 * 60_000).toISOString();
    else if (duration === '4h') mute_until = new Date(now.getTime() + 4 * 60 * 60_000).toISOString();
    else if (duration === 'tomorrow') {
      const tom = new Date(now.getTime() + 24 * 60 * 60_000);
      tom.setUTCHours(11, 0, 0, 0);
      mute_until = tom.toISOString();
    }
    patch({ mute_until });
  }

  const isMuted = !!(prefs?.mute_until && new Date(prefs.mute_until) > new Date());

  if (loading || !prefs) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={t('notifPrefs.title')} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </View>
    );
  }

  const startTime = parseHHMM(prefs.quiet_hours.start);
  const endTime = parseHHMM(prefs.quiet_hours.end);
  const startDate = new Date();
  startDate.setHours(startTime.h, startTime.m, 0, 0);
  const endDate = new Date();
  endDate.setHours(endTime.h, endTime.m, 0, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('notifPrefs.title')} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted, marginBottom: spacing.lg }}>
          {t('notifPrefs.subtitle')}
        </Text>

        {/* Mute */}
        <Section title={t('notifPrefs.sectionMute')} hint={t('notifPrefs.muteHint')}>
          {isMuted ? (
            <View style={{
              padding: spacing.sm, backgroundColor: '#FFFBEB', borderRadius: radius.md,
              borderWidth: 1, borderColor: '#FCD34D', marginBottom: spacing.sm,
            }}>
              <Text style={{ color: '#92400E', fontSize: font.sizes.sm }}>
                🔕 {t('notifPrefs.mutedUntil', {
                  time: new Date(prefs.mute_until!).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', weekday: 'short' }),
                })}
              </Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            <MuteButton label={t('notifPrefs.mute1h')} onPress={() => applyQuickMute('1h')} disabled={saving} />
            <MuteButton label={t('notifPrefs.mute4h')} onPress={() => applyQuickMute('4h')} disabled={saving} />
            <MuteButton label={t('notifPrefs.muteTomorrow')} onPress={() => applyQuickMute('tomorrow')} disabled={saving} />
            <MuteButton label={t('notifPrefs.muteClear')} onPress={() => applyQuickMute('clear')} disabled={saving || !isMuted} variant="success" />
          </View>
        </Section>

        {/* Quiet hours */}
        <Section title={t('notifPrefs.sectionQuietHours')} hint={t('notifPrefs.quietHoursLabel')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
            <Text style={{ fontSize: font.sizes.sm, color: colors.text }}>{t('notifPrefs.quietHoursLabel')}</Text>
            <Switch
              value={prefs.quiet_hours.enabled}
              onValueChange={toggleQuietHours}
              disabled={saving}
              trackColor={{ false: '#D1D5DB', true: colors.brand }}
            />
          </View>
          {prefs.quiet_hours.enabled ? (
            <>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                <TimeButton label={t('notifPrefs.quietHoursStart')} value={prefs.quiet_hours.start} onPress={() => setShowStartPicker(true)} />
                <TimeButton label={t('notifPrefs.quietHoursEnd')} value={prefs.quiet_hours.end} onPress={() => setShowEndPicker(true)} />
              </View>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: spacing.xs }}>
                {t('notifPrefs.quietHoursHint')}
              </Text>
              {showStartPicker && (
                <DateTimePicker
                  value={startDate}
                  mode="time"
                  display="default"
                  onChange={(_, d) => {
                    setShowStartPicker(false);
                    if (d) patch({ quiet_hours: { enabled: prefs.quiet_hours.enabled, start: fmtHHMM(d.getHours(), d.getMinutes()), end: prefs.quiet_hours.end } });
                  }}
                />
              )}
              {showEndPicker && (
                <DateTimePicker
                  value={endDate}
                  mode="time"
                  display="default"
                  onChange={(_, d) => {
                    setShowEndPicker(false);
                    if (d) patch({ quiet_hours: { enabled: prefs.quiet_hours.enabled, start: prefs.quiet_hours.start, end: fmtHHMM(d.getHours(), d.getMinutes()) } });
                  }}
                />
              )}
            </>
          ) : null}
        </Section>

        {/* Categories */}
        <Section title={t('notifPrefs.sectionCategories')} hint={t('notifPrefs.categoriesHint')}>
          {CATEGORIES.map((cat, i) => {
            const enabled = prefs.categories[cat.key] ?? true;
            return (
              <View key={cat.key} style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingVertical: spacing.sm + 2,
                borderTopWidth: i > 0 ? 0.5 : 0, borderTopColor: colors.borderLight,
                gap: spacing.md,
              }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text }}>
                    {t(`notifPrefs.${cat.labelKey}`)}
                  </Text>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 1 }}>
                    {t(`notifPrefs.${cat.hintKey}`)}
                  </Text>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={(v) => toggleCategory(cat.key, v)}
                  disabled={saving}
                  trackColor={{ false: '#D1D5DB', true: colors.brand }}
                />
              </View>
            );
          })}
        </Section>

        <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg, paddingHorizontal: spacing.md }}>
          {t('notifPrefs.footerHint')}
        </Text>
      </ScrollView>
    </View>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{
      backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.lg,
      marginBottom: spacing.md, borderWidth: 1, borderColor: colors.borderLight, ...shadows.sm,
    }}>
      <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text, marginBottom: 2 }}>
        {title}
      </Text>
      {hint ? (
        <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: spacing.sm }}>
          {hint}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

function MuteButton({ label, onPress, disabled, variant }: { label: string; onPress: () => void; disabled?: boolean; variant?: 'success' }) {
  const isSuccess = variant === 'success';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flexGrow: 1, minWidth: 140,
        paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
        borderRadius: radius.md, borderWidth: 1,
        backgroundColor: isSuccess ? '#ECFDF5' : '#fff',
        borderColor: isSuccess ? '#A7F3D0' : colors.borderLight,
        alignItems: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.medium, color: isSuccess ? '#065F46' : colors.text }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function TimeButton({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={{
        flex: 1, padding: spacing.sm,
        borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
        backgroundColor: colors.bg,
      }}
    >
      <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: 2 }}>{label}</Text>
      <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text }}>{value}</Text>
    </TouchableOpacity>
  );
}
