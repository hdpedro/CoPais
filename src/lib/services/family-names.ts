/**
 * family-names.ts — Resolve o nome de criança(s) pra usar em texto de push
 * de atividade.
 *
 * Por que existe:
 *   Antes 2026-05-26, textos de push de atividade caíam no fallback
 *   genérico "Crianca" quando `child_activities.child_id` era NULL.
 *   Famílias que cadastram atividade compartilhada (ex: Jiu Jitsu pra ambos
 *   os filhos como UMA atividade, não duas) recebiam push "Crianca teve
 *   Jiu Jitsu" — frio e impessoal. Pior: pra evitar isso, alguns users
 *   duplicavam a atividade (Otto-Jiu Jitsu + Martim-Jiu Jitsu), gerando
 *   2 pushes idênticos.
 *
 *   Esse helper resolve: quando child_id é NULL, lista TODAS as crianças
 *   do grupo separadas por "e", formatando natural ("Otto e Martim").
 *
 * Performance:
 *   `resolveChildrenName` faz 1-2 queries por chamada — OK pra one-off
 *   (createActivity, submitReport, cancel, changeResponsible).
 *   Pra crons que processam N atividades em batch (sendMissedReportReminders,
 *   activity-due-reminders, digest), usar `buildChildrenNameResolver` que
 *   pré-fetcha TODOS os names em 1 query única + retorna closure resolver.
 *
 * UX rationale:
 *   - 2 filhos: "Otto e Martim"
 *   - 3+ filhos: "Otto, Martim e Joaquim" (Oxford comma evitado pra português)
 *   - 1 filho: nome único
 *   - 0 filhos no grupo (raro): "as crianças" (plural, gender-neutral, mais
 *     natural que "Crianca" antigo)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Concatena nomes em formato natural pt-BR: "A", "A e B", "A, B e C" */
function joinNamesNaturalPtBR(names: string[]): string {
  if (names.length === 0) return "as crianças";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} e ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/** Primeiro nome a partir de full_name. */
function firstName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const trimmed = fullName.trim().split(" ")[0];
  return trimmed || null;
}

/**
 * Resolve o nome de criança(s) pra UMA atividade individual.
 *
 * Use em paths one-off (createActivity, submitActivityReport, etc).
 * Pra crons em batch, prefira `buildChildrenNameResolver`.
 *
 * @param supabase  client (preferir admin pra cron — bypass RLS)
 * @param childId   ID da criança específica (NULL se atividade família-wide)
 * @param groupId   ID do grupo (usado se childId é null pra listar crianças)
 * @param embeddedName  Opcional — primeiro nome já carregado em outro lugar
 *                      (otimização pra evitar query extra)
 *
 * @returns "Otto" | "Otto e Martim" | "Otto, Martim e Joaquim" | "as crianças"
 */
export async function resolveChildrenName(
  supabase: SupabaseClient,
  args: {
    childId: string | null;
    groupId: string;
    embeddedFullName?: string | null;
  },
): Promise<string> {
  // Otimização: já temos full_name embutido (de join anterior)
  if (args.embeddedFullName) {
    const first = firstName(args.embeddedFullName);
    if (first) return first;
  }

  // Atividade com criança específica
  if (args.childId) {
    const { data } = await supabase
      .from("children")
      .select("full_name")
      .eq("id", args.childId)
      .single();
    const first = firstName(data?.full_name ?? null);
    if (first) return first;
  }

  // Atividade família-wide: listar todas as crianças do grupo
  const { data: kids } = await supabase
    .from("children")
    .select("full_name, birth_date")
    .eq("group_id", args.groupId)
    .order("birth_date", { ascending: true }); // mais velho primeiro (convenção pt-BR)

  const names = (kids ?? [])
    .map((k) => firstName(k.full_name))
    .filter((n): n is string => !!n);

  return joinNamesNaturalPtBR(names);
}

/**
 * Builder pra crons em batch. Pré-fetcha nomes de TODAS as crianças de N
 * grupos em 1 query, retorna closure resolver que NÃO faz queries em runtime.
 *
 * Garante O(1) lookup em loops grandes (sendMissedReportReminders pode
 * processar 100+ atividades de 50+ grupos sem N+1).
 *
 * @example
 *   const resolve = await buildChildrenNameResolver(admin, groupIds);
 *   for (const act of activities) {
 *     const name = resolve(act.child_id, act.group_id);
 *     // ... usa name no template
 *   }
 */
export async function buildChildrenNameResolver(
  supabase: SupabaseClient,
  groupIds: string[],
): Promise<(childId: string | null, groupId: string) => string> {
  if (groupIds.length === 0) {
    return () => "as crianças";
  }

  const { data } = await supabase
    .from("children")
    .select("id, group_id, full_name, birth_date")
    .in("group_id", groupIds)
    .order("birth_date", { ascending: true });

  // Index por (group_id) + lookup por (id)
  const byGroup = new Map<string, Array<{ id: string; first: string }>>();
  for (const k of data ?? []) {
    const first = firstName(k.full_name);
    if (!first) continue;
    const arr = byGroup.get(k.group_id) ?? [];
    arr.push({ id: k.id, first });
    byGroup.set(k.group_id, arr);
  }

  return (childId, groupId) => {
    const kids = byGroup.get(groupId) ?? [];
    if (childId) {
      const kid = kids.find((k) => k.id === childId);
      if (kid) return kid.first;
    }
    return joinNamesNaturalPtBR(kids.map((k) => k.first));
  };
}
