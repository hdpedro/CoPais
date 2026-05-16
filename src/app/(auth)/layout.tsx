import { I18nProvider } from "@/i18n/provider";
import { getRequestLocale } from "@/i18n/server";

// Auth routes (login, signup, verify-email, forgot-password, reset-password)
// historically had no I18nProvider — every useI18n() inside them would crash
// at runtime. Wrapping here lets every auth page consume t() the same way
// (app) pages do, with the initial locale resolved server-side from the
// kindar-locale cookie (set by middleware on first visit).
//
// `force-dynamic`: forgot-password / reset-password were previously static-
// exported by Next 16. With the I18nProvider now in the tree but the page
// pre-render running BEFORE the provider hydrated, useI18n() threw during
// `next build` ("useI18n must be used within an I18nProvider"). Forcing
// dynamic per-request rendering matches the actual data flow — each auth
// hit reads a fresh cookie value anyway.
export const dynamic = "force-dynamic";

export default async function AuthLayout({
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
