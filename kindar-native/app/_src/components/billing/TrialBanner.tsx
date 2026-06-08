import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useI18n } from 'src/i18n';

/**
 * Banner de degustação na home Native — PARIDADE com o PWA
 * (`src/components/billing/TrialBanner.tsx`). Fecha o gap descoberto no
 * diagnóstico de conversão (2026-06-01): o PWA mostrava "X dias de Premium
 * restantes" no dashboard, mas a home Native não mostrava nada — usuários em
 * degustação no app só veriam o trial se fossem até /assinatura. Resultado:
 * 43 trials correndo risco de vencer SEM o usuário perceber que tinha Premium.
 *
 * Reaproveita as chaves i18n do namespace `trial` já existentes nos 5 locales
 * (criadas pro assinatura.tsx) — zero copy financeira nova inventada (Regra
 * Canônica #10). Tap → /assinatura.
 *
 * Threshold de urgência escala com a duração (mesma regra do PWA): 2 dias para
 * trial de 7d; 7 dias para trial de 60d (promo "2 meses grátis").
 */
export default function TrialBanner({
  daysRemaining,
  planLabel = 'Plano Harmonia',
}: {
  daysRemaining: number;
  planLabel?: string;
}) {
  const t = useI18n((s) => s.t);
  const urgent = daysRemaining <= (daysRemaining > 30 ? 7 : 2);

  // Hex literais (não tokens) pra garantir compilação sem depender de nomes de
  // token — âmbar suave quando urgente, verde aconchegante caso contrário.
  const bg = urgent ? '#FEF3C7' : '#ECFDF5';
  const border = urgent ? '#FCD34D' : '#A7F3D0';
  const accent = urgent ? '#B45309' : '#047857';

  const title = urgent
    ? `⏰ ${t('trial.bannerUrgentTitle')}`
    : `🎁 ${t('trial.bannerTitle', { plan: planLabel })}`;

  return (
    <TouchableOpacity
      onPress={() => router.push('/assinatura')}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={{
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
        borderRadius: 16,
        padding: 14,
        marginBottom: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#1C1917' }}>{title}</Text>
        <Text style={{ fontSize: 12, color: '#44403C', marginTop: 2 }}>
          {t('trial.statusDaysRemaining', { days: String(daysRemaining) })}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={accent} />
    </TouchableOpacity>
  );
}
