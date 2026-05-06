/**
 * Detalhe de uma ocorrencia de atividade — rota dedicada.
 *
 * Wrap simples sobre o ActivityDetailSheet existente, mas como tela
 * navegada (router.push) em vez de Modal aninhado dentro do Day Sheet
 * do calendario.
 *
 * Motivo: Modal RN dentro de Modal abria com glitch (spinner aparecia
 * mas, ao mesmo tempo, o tap original propagava pro CalendarGrid e
 * disparava OUTRO Day Sheet de um dia errado — "clique fantasma"
 * reportado pelo Henrique).
 *
 * Trocar por uma rota elimina o problema de raiz: nao ha 2 Modals
 * concorrentes, e o tap nao tem onde "vazar".
 *
 * Aceita: /atividades/[id]?date=YYYY-MM-DD
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../src/store/auth';
import ActivityDetailSheet from '../../src/components/activities/ActivityDetailSheet';
import { colors } from '../../src/design-system/tokens';

export default function ActivityDetailScreen() {
  const params = useLocalSearchParams<{ id: string; date?: string }>();
  const { userId } = useAuth();
  const activityId = typeof params.id === 'string' ? params.id : '';
  const occurrenceDate = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
    ? params.date
    : new Date().toISOString().slice(0, 10);

  useEffect(() => {
    // Sem id valido, volta — defesa.
    if (!activityId || !userId) router.back();
  }, [activityId, userId]);

  if (!activityId || !userId) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ActivityDetailSheet
        visible
        fullscreen
        onClose={() => router.back()}
        activityId={activityId}
        occurrenceDate={occurrenceDate}
        completedBy={userId}
      />
    </View>
  );
}
