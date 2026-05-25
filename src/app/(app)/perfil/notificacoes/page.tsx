/**
 * /perfil/notificacoes — Server Component pra preferências de notificação.
 *
 * Server fetches prefs atuais via service. Client component (NotifPrefsClient)
 * renderiza form com server actions inline (sem state local).
 *
 * Atende Fase C do plano de alertas (CLAUDE.md → activity reminders).
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getServerT } from "@/i18n/server";
import { getNotificationPrefs } from "@/lib/services/notification-prefs";
import NotifPrefsClient from "./NotifPrefsClient";

export const dynamic = "force-dynamic";

export default async function NotificacoesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const t = await getServerT();
  const prefs = await getNotificationPrefs(user.id);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-dark">{t("notifPrefs.title")}</h1>
        <p className="text-sm text-muted mt-1">{t("notifPrefs.subtitle")}</p>
      </header>
      <NotifPrefsClient initialPrefs={prefs} />
    </div>
  );
}
