import { redirect } from "next/navigation";

/**
 * Redirect-only: a PWA não tem detalhe de atividade por id — só `/atividades`
 * (lista) e `/atividades/nova`. Os deep-links de notificação/push de atividade
 * (`/atividades/{id}?date=...&followup=1`, de lembrete / follow-up "como foi?" /
 * briefing — ver src/lib/services/activity-reminders.ts) caíam em 404 (feedback
 * tester L, 09/jun). Mandamos pra lista, onde dá pra ver e relatar a atividade.
 *
 * (Ideal futuro: abrir direto o relato da ocorrência via ActivityReportModal.)
 */
export default function AtividadeDetailRedirect() {
  redirect("/atividades");
}
