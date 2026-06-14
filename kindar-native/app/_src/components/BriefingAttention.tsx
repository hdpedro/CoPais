/**
 * "Sua Atenção" — porte native do BriefingAttention do PWA
 * (`src/app/(app)/dashboard/BriefingAttention.tsx`).
 *
 * A régua UNIFICADA do briefing: consolida num só lugar, já priorizado pelo
 * motor (`briefing.ts:composeAttention`), o que antes vivia espalhado em ~6
 * seções soltas (relato pendente, despesa a aprovar, voto, novidades de
 * escola/despesa/saúde). Renderiza logo abaixo do herói.
 *
 * Componente "burro": só renderiza os itens que recebe; o motor decide o quê e
 * a ordem; a UI compõe a copy via `t()`. Tom da marca: terracota pro MOMENTO
 * (topo "attention"), sálvia pra awareness calma — NUNCA vermelho.
 *
 * a11y: cada linha é um botão com label descritivo; ícone decorativo; alvos
 * ≥44px.
 */
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';
import type { AttentionItem, AttentionKind } from 'src/lib/briefing';

const ICON: Record<AttentionKind, string> = {
  swap: '⇄',
  routine_ack: '🔔',
  pending_report: '📝',
  pending_expense: '🧾',
  pending_decision: '🗳️',
  saude_unread: '🩺',
  school_unread: '🎒',
  expenses_unread: '💰',
  vaccine: '💉',
};

// Terracota premium do MOMENTO (sem gradiente: expo-linear-gradient não é dep;
// cor sólida mantém o porte OTA-safe). Aproxima o low-stop do gradiente do PWA.
const MOMENT_BG = '#97502F';
const MOMENT_FG = '#FCF6F1';
const ATTENTION_CTA = '#A85D47';

type Copy = { title: string; cta: string };

export default function BriefingAttention({ items }: { items: AttentionItem[] }) {
  const t = useI18n((s) => s.t);
  if (items.length === 0) return null;

  function copy(item: AttentionItem): Copy {
    switch (item.kind) {
      case 'swap':
        return { title: t('briefing.swap', item.data), cta: t('briefing.ctaView') };
      case 'routine_ack':
        return {
          title: item.data.awaiting ? t('briefing.routineAckMine') : t('briefing.routineAckTheirs', item.data),
          cta: t('briefing.ctaView'),
        };
      case 'pending_report':
        // Atividade da família toda → child vazio → variação sem "de {child}".
        return {
          title: item.data.child ? t('briefing.pendingReport', item.data) : t('briefing.pendingReportFamily', item.data),
          cta: t('briefing.ctaReport'),
        };
      case 'pending_expense':
        return { title: t('briefing.pendingExpense', item.data), cta: t('briefing.ctaView') };
      case 'pending_decision':
        return { title: t('briefing.pendingDecision', item.data), cta: t('briefing.ctaVote') };
      case 'school_unread':
        return { title: t('briefing.schoolNew', item.data), cta: t('briefing.ctaView') };
      case 'expenses_unread':
        return { title: t('briefing.expensesNew', item.data), cta: t('briefing.ctaView') };
      case 'saude_unread':
        return { title: t('briefing.saudeNew', item.data), cta: t('briefing.ctaView') };
      case 'vaccine':
        return { title: t('briefing.vaccineCalm'), cta: t('briefing.ctaView') };
    }
  }

  function go(link: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(link as never);
  }

  // O topo da régua, quando exige você (tom "attention"), vira o MOMENTO — card
  // terracota editorial. O resto desce pra lista calma. Topo já calmo → tudo lista.
  const moment = items[0]?.tone === 'attention' ? items[0] : null;
  const listItems = moment ? items.slice(1) : items;
  const momentCopy = moment ? copy(moment) : null;

  return (
    <View style={{ marginBottom: spacing.lg }} accessibilityLabel={t('briefing.attentionTitle')}>
      <Text style={{ fontSize: 10, fontWeight: font.weights.bold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: spacing.sm, paddingHorizontal: 2 }}>
        {t('briefing.attentionTitle')}
      </Text>

      {moment && momentCopy ? (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => go(moment.link)}
          accessibilityRole="button"
          accessibilityLabel={`${momentCopy.title} — ${momentCopy.cta}`}
          style={{ borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md + 4, marginBottom: spacing.sm, backgroundColor: MOMENT_BG, ...shadows.md }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
            <Text style={{ fontSize: 21, lineHeight: 26 }}>{ICON[moment.kind]}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 18, lineHeight: 23, fontWeight: font.weights.semibold, color: MOMENT_FG }}>
                {momentCopy.title}
              </Text>
              <Text style={{ marginTop: 8, fontSize: 13, fontWeight: font.weights.semibold, color: MOMENT_FG }}>
                {momentCopy.cta} →
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      ) : null}

      {listItems.length > 0 ? (
        <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderLight, overflow: 'hidden', ...shadows.sm }}>
          {listItems.map((item, idx) => {
            const { title, cta } = copy(item);
            const attention = item.tone === 'attention';
            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.7}
                onPress={() => go(item.link)}
                accessibilityRole="button"
                accessibilityLabel={`${title} — ${cta}`}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                  paddingHorizontal: spacing.md, paddingVertical: spacing.md, minHeight: 58,
                  borderTopWidth: idx === 0 ? 0 : 0.5, borderTopColor: colors.borderLight,
                }}
              >
                <View style={{ width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: attention ? 'rgba(192,112,85,0.12)' : 'rgba(91,158,133,0.10)' }}>
                  <Text style={{ fontSize: 16 }}>{ICON[item.kind]}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: font.weights.medium, color: colors.text, lineHeight: 19 }}>
                  {title}
                </Text>
                <Text style={{ fontSize: 12, fontWeight: font.weights.semibold, color: attention ? ATTENTION_CTA : colors.brand }}>
                  {cta}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
