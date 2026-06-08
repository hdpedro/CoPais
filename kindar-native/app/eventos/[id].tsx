/**
 * Detalhe de evento social — tela cheia (paridade com /atividades/[id]).
 *
 * Acessado quando o usuario toca num evento no calendario (ex: "Reuniao
 * Escolar" no dia 8/abril). Antes esse tap levava pra /eventos (lista
 * geral), perdendo contexto. Agora abre o detalhe direto, com Editar/
 * Excluir/Compartilhar inline.
 */
import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, Share,
} from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchEventDetail, deleteEvent } from 'src/services/events';
import { useToast } from 'src/components/ui/ToastProvider';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

type EventDetail = NonNullable<Awaited<ReturnType<typeof fetchEventDetail>>>;

const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DAYS_LONG = ['Domingo', 'Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado'];

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d, 12);
  return `${DAYS_LONG[date.getDay()]}, ${d} de ${MONTHS_LONG[m - 1]}`;
}
function formatTime(t: string | null): string {
  return t ? t.slice(0, 5) : '';
}

export default function EventDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useI18n(s => s.t);
  const toast = useToast();
  const eventId = typeof id === 'string' ? id : '';

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const data = await fetchEventDetail(eventId);
      setEvent(data);
    } catch {
      // swallow — render renderiza estado "nao encontrado"
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  // Carrega na montagem E quando volta de /eventos/edit/[id] — useFocusEffect
  // dispara em ambos casos. Refresh garantido sem ficar com dado antigo.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  function handleEdit() {
    if (!event) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/eventos/edit/[id]', params: { id: event.id } } as never);
  }

  async function handleShare() {
    if (!event) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const lines: string[] = [];
    lines.push(`*📅 ${event.title}*`);
    lines.push('');
    lines.push(`🗓️ ${formatDate(event.event_date)}`);
    if (event.event_time && !event.all_day) {
      lines.push(`⏰ ${formatTime(event.event_time)}`);
    } else if (event.all_day) {
      lines.push(`⏰ ${t('eventDetail.allDay')}`);
    }
    if (event.location) lines.push(`📍 ${event.location}`);
    if (event.childName) lines.push(`👶 ${event.childName}`);
    if (event.assignedName) {
      lines.push('');
      lines.push(t('eventDetail.responsibleLabel', { name: event.assignedName }));
    }
    if (event.description) {
      lines.push('');
      lines.push(event.description);
    }
    lines.push('');
    lines.push(t('eventDetail.sharedFooter'));
    try {
      await Share.share({ title: event.title, message: lines.join('\n') });
    } catch {
      // user cancelled
    }
  }

  function handleDelete() {
    if (!event) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      t('eventDetail.deleteTitle', { title: event.title }),
      t('eventDetail.deleteMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'), style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            const r = await deleteEvent(event.id);
            if (r.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } else {
              toast.show({ message: r.error || t('toasts.common.deleteFailed'), variant: 'error' });
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <Header insets={insets} onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl }}>
          <Text style={{ fontSize: font.sizes.md, color: colors.textMuted, textAlign: 'center' }}>
            {t('eventDetail.notFound')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <Header insets={insets} onBack={() => router.back()} />

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 80, paddingTop: spacing.lg }}>
        {/* Card principal */}
        <View style={{
          backgroundColor: `${colors.secondary}10`,
          borderWidth: 1, borderColor: `${colors.secondary}40`,
          borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md }}>
            <View style={{
              width: 44, height: 44, borderRadius: radius.md,
              backgroundColor: `${colors.secondary}25`,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 22 }}>📅</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
                {event.title}
              </Text>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }}>
                {t('calendarTab.event')}
                {event.childName ? ` · ${event.childName}` : ''}
                {event.event_time && !event.all_day ? ` · ${formatTime(event.event_time)}` : ''}
                {event.all_day ? ` · ${t('eventDetail.allDay')}` : ''}
              </Text>
            </View>
          </View>

          <View style={{ gap: 10 }}>
            <DetailRow icon="calendar-outline" label={formatDate(event.event_date)} />
            {event.end_date && event.end_date !== event.event_date ? (
              <DetailRow icon="calendar-outline" label={t('eventDetail.endsOn', { date: formatDate(event.end_date) })} />
            ) : null}
            {event.event_time && !event.all_day ? (
              <DetailRow icon="time-outline" label={formatTime(event.event_time)} />
            ) : null}
            {event.location ? <DetailRow icon="location-outline" label={event.location} /> : null}
            {event.assignedName ? (
              <DetailRow
                icon="person-outline"
                label={t('eventDetail.responsibleLabel', { name: event.assignedName })}
                action={{ label: t('eventDetail.change'), onPress: handleEdit }}
              />
            ) : (
              <DetailRow
                icon="person-outline"
                label={t('eventDetail.noResponsible')}
                action={{ label: t('eventDetail.assign'), onPress: handleEdit }}
              />
            )}
            {event.childName ? <DetailRow icon="people-outline" label={event.childName} /> : null}
          </View>

          {/* Acoes */}
          <View style={{
            flexDirection: 'row', justifyContent: 'space-around',
            marginTop: spacing.lg, paddingTop: spacing.md,
            borderTopWidth: 0.5, borderTopColor: colors.borderLight,
          }}>
            <ActionButton icon="share-outline" label={t('invite.share')} onPress={handleShare} />
            <ActionButton icon="create-outline" label={t('common.edit')} onPress={handleEdit} />
            <ActionButton icon="trash-outline" label={t('common.delete')} onPress={handleDelete} destructive />
          </View>
        </View>

        {/* Descricao (se houver) */}
        {event.description ? (
          <View style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.lg,
            padding: spacing.lg, ...shadows.sm,
          }}>
            <Text style={{
              fontSize: 11, fontWeight: font.weights.semibold,
              color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1,
              marginBottom: 8,
            }}>
              {t('decisions.description')}
            </Text>
            <Text style={{ fontSize: font.sizes.sm, color: colors.text, lineHeight: 20 }}>
              {event.description}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Header({ insets, onBack }: { insets: { top: number }; onBack: () => void }) {
  const t = useI18n(s => s.t);
  return (
    <View style={{
      paddingTop: insets.top + 10, paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: colors.bgElevated,
      borderBottomWidth: 0.5,
      borderBottomColor: colors.borderLight,
    }}>
      <TouchableOpacity onPress={onBack} hitSlop={12}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="chevron-back" size={28} color={colors.brand} />
          <Text style={{ fontSize: font.sizes.md, color: colors.brand, marginLeft: -2, fontWeight: font.weights.medium }}>
            {t('common.back')}
          </Text>
        </View>
      </TouchableOpacity>
      <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.bold, color: colors.text }}>
        {t('eventDetail.headerTitle')}
      </Text>
      <View style={{ width: 60 }} />
    </View>
  );
}

function DetailRow({
  icon, label, action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Ionicons name={icon} size={16} color={colors.textMuted} />
      <Text style={{ flex: 1, fontSize: font.sizes.sm, color: colors.text }}>
        {label}
      </Text>
      {action ? (
        <TouchableOpacity onPress={action.onPress} hitSlop={8}>
          <Text style={{ fontSize: font.sizes.xs, color: colors.brand, fontWeight: font.weights.semibold }}>
            {action.label}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function ActionButton({
  icon, label, onPress, destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const color = destructive ? colors.error : colors.text;
  return (
    <TouchableOpacity onPress={onPress} style={{ alignItems: 'center', gap: 4, paddingHorizontal: spacing.md }}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={{ fontSize: font.sizes.xs, color, fontWeight: font.weights.medium }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
