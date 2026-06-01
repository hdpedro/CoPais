/**
 * Marketing attribution (first-touch).
 *
 * Fecha o loop "Instagram → cadastro → pagante" que o stitching de navegador
 * do PostHog não consegue: a visita anônima vive numa identidade (device_id),
 * mas os eventos de conversão são server-side e keados por email/user.id — três
 * identidades que não se cruzam num funil. Em vez de tentar costurar pessoas,
 * carregamos a atribuição como PROPRIEDADE do evento de conversão.
 *
 * Fluxo:
 *   1. PostHogAnonymousInit (client) lê os utm_* da URL + referrer na PRIMEIRA
 *      visita e grava o cookie `kindar-attribution` (first-touch, 90 dias).
 *   2. No cadastro (signUp action + OAuth callback) lemos o cookie, persistimos
 *      em `profiles.first_touch_utm` (migration 00104) e carimbamos os eventos
 *      `user_signup` / `signup_completed`.
 *   3. No webhook do Stripe lemos `profiles.first_touch_utm` (o cookie não
 *      existe num webhook) e carimbamos `subscription_started` /
 *      `checkout_completed`.
 *
 * Resultado: `subscription_started WHERE utm_source = 'instagram'` vira uma
 * query trivial e à prova de stitching, quebrável por campanha.
 */

export const ATTRIBUTION_COOKIE = "kindar-attribution";

export interface Attribution {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  referrer: string | null;
  landing: string | null;
  ts: string | null;
}

/** Limita tamanho pra não deixar um UTM gigante poluir o evento/coluna. */
function clampStr(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v.slice(0, 200) : null;
}

/**
 * Parseia o valor cru do cookie (JSON URL-encoded) num Attribution tipado.
 * Pura e sem dependências de runtime — segura pra importar em testes.
 * Retorna null se o cookie estiver ausente, malformado, ou sem sinal útil
 * (nem source, nem campaign, nem referrer).
 */
export function parseAttribution(raw: string | undefined | null): Attribution | null {
  if (!raw) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;

  const a: Attribution = {
    source: clampStr(obj.source),
    medium: clampStr(obj.medium),
    campaign: clampStr(obj.campaign),
    content: clampStr(obj.content),
    term: clampStr(obj.term),
    referrer: clampStr(obj.referrer),
    landing: clampStr(obj.landing),
    ts: clampStr(obj.ts),
  };

  // Sem nenhum sinal de aquisição, não vale persistir nem carimbar.
  if (!a.source && !a.campaign && !a.referrer) return null;
  return a;
}

/**
 * Achata o Attribution nas chaves de propriedade que o PostHog espera
 * (convenção utm_*). Omite chaves nulas pra não criar propriedades vazias.
 * `referrer` vira `first_referrer` (distinto de utm_source pra organic).
 */
export function attributionEventProps(
  a: Attribution | null | undefined,
): Record<string, string> {
  if (!a) return {};
  const props: Record<string, string> = {};
  if (a.source) props.utm_source = a.source;
  if (a.medium) props.utm_medium = a.medium;
  if (a.campaign) props.utm_campaign = a.campaign;
  if (a.content) props.utm_content = a.content;
  if (a.term) props.utm_term = a.term;
  if (a.referrer) props.first_referrer = a.referrer;
  return props;
}

/**
 * Lê o cookie de atribuição no contexto de request (Server Action / Route
 * Handler). Import dinâmico de `next/headers` pra manter o módulo seguro de
 * importar em testes unitários (as funções puras acima não disparam o import).
 * Nunca lança — retorna null em qualquer falha.
 */
export async function getAttribution(): Promise<Attribution | null> {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    return parseAttribution(store.get(ATTRIBUTION_COOKIE)?.value);
  } catch {
    return null;
  }
}
