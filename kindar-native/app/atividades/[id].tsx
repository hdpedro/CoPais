/**
 * Detalhe de uma ocorrencia de atividade — rota dedicada.
 *
 * Wrap sobre o ActivityDetailSheet existente, mas como tela navegada
 * (router.push) em vez de Modal aninhado dentro do Day Sheet do calendario
 * (Modal-dentro-de-Modal abria com glitch — "clique fantasma" do Henrique).
 *
 * Query params:
 *   - date=YYYY-MM-DD     → data da ocorrência (default hoje)
 *   - followup=1          → veio do push "Aconteceu? Sim/Não/Adiar" (feedback
 *                          Amanda). Abre o ActivityReportModal direto pra
 *                          marcar o desfecho (completed/missed) sem fricção.
 *   - report=1, reminder=1, briefing=1 → tracking de origem (notif tap).
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { supabase } from 'src/lib/supabase';
import { useAuth } from 'src/store/auth';
import ActivityDetailSheet from 'src/components/activities/ActivityDetailSheet';
import ActivityReportModal from 'src/components/activities/ActivityReportModal';
import { colors } from 'src/design-system/tokens';

export default function ActivityDetailScreen() {
  const params = useLocalSearchParams<{ id: string; date?: string; followup?: string }>();
  const { userId, activeGroup } = useAuth();
  const activityId = typeof params.id === 'string' ? params.id : '';
  const occurrenceDate = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
    ? params.date
    : new Date().toISOString().slice(0, 10);
  const cameFromFollowup = params.followup === '1';

  const [showReport, setShowReport] = useState(false);
  const [activity, setActivity] = useState<{ name: string; childId: string | null } | null>(null);

  useEffect(() => {
    // Sem id valido, volta — defesa.
    if (!activityId || !userId) router.back();
  }, [activityId, userId]);

  // Carrega nome + criança pra alimentar o ActivityReportModal e auto-abre o
  // modal quando o user veio do quick-action/deep-link do follow-up.
  useEffect(() => {
    if (!activityId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('child_activities')
          .select('name, child_id')
          .eq('id', activityId)
          .maybeSingle();
        if (cancelled || !data) return;
        setActivity({ name: (data as { name: string }).name, childId: (data as { child_id: string | null }).child_id ?? null });
        if (cameFromFollowup) setShowReport(true);
      } catch {
        // falha de rede — o botão "Como foi?" do sheet ainda abre o modal
      }
    })();
    return () => { cancelled = true; };
  }, [activityId, cameFromFollowup]);

  if (!activityId || !userId) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ActivityDetailSheet
        visible
        fullscreen
        onClose={() => router.back()}
        activityId={activityId}
        occurrenceDate={occurrenceDate}
        completedBy={userId}
        onReport={() => setShowReport(true)}
        // Apos delete bem-sucedido, volta pro calendario.
        onChanged={() => router.back()}
      />
      {showReport && activeGroup && activity ? (
        <ActivityReportModal
          visible={showReport}
          onClose={() => setShowReport(false)}
          groupId={activeGroup.groupId}
          activityId={activityId}
          activityName={activity.name}
          childId={activity.childId}
          reporterId={userId}
          occurrenceDate={occurrenceDate}
          onSubmitted={() => { setShowReport(false); router.back(); }}
        />
      ) : null}
    </View>
  );
}
