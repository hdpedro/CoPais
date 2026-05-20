import { I18nProvider } from "@/i18n/provider";
import { getRequestLocale } from "@/i18n/server";

/**
 * Layout pra rotas filhas de /auth/confirm (a route.ts a.k.a. handler
 * GET/POST não usa layout — só /auth/confirm/error/page.tsx é afetado).
 *
 * Espelha o (auth)/layout.tsx pra que a error page tenha mesma visual
 * (centered card sobre bg-light) sem precisar viver dentro do route group.
 */
export const dynamic = "force-dynamic";

export default async function ConfirmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getRequestLocale();
  return (
    <I18nProvider initialLocale={locale}>
      <div className="min-h-screen flex items-center justify-center bg-light px-4">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </I18nProvider>
  );
}
