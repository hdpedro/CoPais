/**
 * Email locale resolution + HTML template helpers.
 *
 * Server-only. Resolves the recipient's locale (profiles.locale via
 * getUserLocale) and returns a t() bound to that locale, ready to be used
 * inside the buildHtml functions of each individual email module.
 *
 * Why a separate helper:
 *   - Email templates run from cron / webhooks / server actions — never
 *     inside a request scope. Cannot use getRequestLocale() (which reads
 *     cookies).
 *   - The set of recipients per email is single (transactional), so we
 *     don't need the bulk `getUsersLocale` plumbing collab.ts uses.
 *
 * Usage:
 *   import { resolveEmailLocale } from "@/lib/emails/_locale";
 *   const { t, locale, bcp47 } = await resolveEmailLocale({ userId, email });
 *   const subject = t("emails.welcome.subject", { name });
 *   const html = buildWelcomeHtml(name, t, bcp47);
 */
import "server-only";
import { getServerT } from "@/i18n/server";
import { getUserLocale, toBcp47 } from "@/lib/locale-utils";
import { DEFAULT_LOCALE, type Locale } from "@/i18n";

export interface ResolveEmailLocaleArgs {
  /**
   * If provided, looks up profiles.locale for this user. Preferred when the
   * caller has it (most cases — emails are user-bound).
   */
  userId?: string | null;
  /**
   * Explicit locale override. Wins over userId lookup. Useful for emails
   * triggered from forms where the user hasn't been created yet (signup
   * welcome) and the form passed a `lang` query param.
   */
  locale?: Locale | null;
}

export interface ResolvedEmailLocale {
  /** Synchronous t() bound to the resolved locale. */
  t: Awaited<ReturnType<typeof getServerT>>;
  /** App locale (pt|en|es|fr|de). */
  locale: Locale;
  /** BCP 47 region tag for Intl.* formatters inside templates. */
  bcp47: string;
}

export async function resolveEmailLocale(
  args: ResolveEmailLocaleArgs = {},
): Promise<ResolvedEmailLocale> {
  let locale: Locale = DEFAULT_LOCALE;
  if (args.locale) {
    locale = args.locale;
  } else if (args.userId) {
    locale = await getUserLocale(args.userId);
  }
  const t = await getServerT(locale);
  return { t, locale, bcp47: toBcp47(locale) };
}
