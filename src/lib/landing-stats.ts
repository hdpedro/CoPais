import { createAdminClient } from "@/lib/supabase/admin";

export interface LandingStats {
  activeFamilies: number;
  childrenOrganized: number;
}

const FALLBACK: LandingStats = {
  activeFamilies: 0,
  childrenOrganized: 0,
};

/**
 * Tempo máximo que aceitamos esperar pelas COUNTs antes de cair pro
 * fallback. /pricing é PÚBLICO e cached por 30s — não tem o luxo de
 * esperar 30s de timeout da Vercel function se o pool de Postgres está
 * saturado. Melhor mostrar a tela SEM o badge de social proof do que
 * fazer a página inteira retornar 504.
 */
const TIMEOUT_MS = 1500;

// In-memory soft cache no nível do módulo: serverless instances são
// efêmeras mas dentro de 1 instância warm, várias requests podem
// reaproveitar o mesmo valor. Reforço sobre o `revalidate = 30` do page.
type CachedStats = { value: LandingStats; at: number };
let memCache: CachedStats | null = null;
const MEM_CACHE_TTL_MS = 60_000;

/**
 * Counts for the landing page social-proof band. Page já tem
 * `revalidate = 30`, mas a Vercel pode cold-start ou um pool de DB
 * saturado pode segurar a chamada — então:
 *   1. In-memory cache (60s) pra reduzir hits
 *   2. Promise.race com timeout 1.5s pra nunca segurar a página
 *   3. Fallback `{ 0, 0 }` que faz o componente esconder a band
 *
 * Usa admin client porque /pricing é renderizado anonimamente e a
 * `coparenting_groups` tem RLS que bloqueia anon reads.
 */
export async function getLandingStats(): Promise<LandingStats> {
  const now = Date.now();
  if (memCache && now - memCache.at < MEM_CACHE_TTL_MS) {
    return memCache.value;
  }

  try {
    const admin = createAdminClient();

    // Promise.race com timeout — se Postgres demora mais de TIMEOUT_MS,
    // descartamos a query e usamos fallback. NÃO bloqueia a página.
    const queryPromise = Promise.all([
      admin.from("coparenting_groups").select("*", { count: "exact", head: true }),
      admin.from("children").select("*", { count: "exact", head: true }),
    ]).then(([groupsRes, kidsRes]) => ({
      activeFamilies: groupsRes.count ?? 0,
      childrenOrganized: kidsRes.count ?? 0,
    }));

    const timeoutPromise = new Promise<LandingStats>((_, reject) =>
      setTimeout(() => reject(new Error("landing-stats timeout")), TIMEOUT_MS),
    );

    const result = await Promise.race([queryPromise, timeoutPromise]);

    // Cache só quando sucesso real (timeout faz throw, vai pro catch).
    memCache = { value: result, at: now };
    return result;
  } catch (err) {
    console.warn("[landing-stats] Failed to read counters:", err);
    // Cacheia o fallback por TTL menor pra retentar antes — se Postgres
    // se recuperar, vamos voltar a mostrar a band em <= 60s.
    memCache = { value: FALLBACK, at: now - (MEM_CACHE_TTL_MS - 10_000) };
    return FALLBACK;
  }
}
