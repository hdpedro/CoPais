/**
 * Agrega a custódia de HOJE de todas as crianças do grupo num único
 * "herói" para o dashboard — em vez de mostrar só a 1ª criança.
 *
 * # Por que existe
 *
 * O card-herói antigo era centrado em `children[0]`: mostrava
 * "Henrique está com Celma" mesmo quando os 3 filhos estavam com a
 * Celma — e escondia por completo o caso de guarda DIVIDIDA (cada filho
 * com um responsável diferente no mesmo dia). Também falhava quando a 1ª
 * criança não tinha evento hoje mas as outras tinham (caía no estado
 * "sem escala" indevidamente).
 *
 * Esta função agrupa as crianças pelo responsável de hoje (reusando o
 * `todayCustodyByChild` já resolvido por swap > exception > regular) e
 * classifica em 3 modos:
 *
 *   - `single`   → 1 só criança com custódia hoje (igual ao antigo).
 *   - `together` → todas as crianças (com custódia) com o MESMO responsável.
 *   - `split`    → crianças distribuídas entre 2+ responsáveis.
 *
 * Pura e serializável — testável sem banco.
 */

export type TodayCustodyEntry = {
  responsibleId: string;
  responsibleName: string;
  isWithMe: boolean;
  endDate: string;
  custodyType: string;
};

export type TodayCustodyByChild = Record<string, TodayCustodyEntry>;

export type HeroChild = { id: string; firstName: string };

export type CustodyHeroGroup = {
  responsibleId: string;
  responsibleName: string;
  isWithMe: boolean;
  childNames: string[];
};

export type CustodyHero =
  | { mode: "none" }
  | { mode: "single"; group: CustodyHeroGroup }
  | { mode: "together"; group: CustodyHeroGroup; allSameEnd: boolean }
  | { mode: "split"; groups: CustodyHeroGroup[] };

/**
 * @param children Crianças do grupo, em ordem (id + primeiro nome já extraído).
 * @param todayCustodyByChild Mapa childId → responsável resolvido HOJE.
 */
export function buildCustodyHero(
  children: readonly HeroChild[],
  todayCustodyByChild: TodayCustodyByChild,
): CustodyHero {
  const withCustody = children.filter((c) => todayCustodyByChild[c.id]);
  if (withCustody.length === 0) return { mode: "none" };

  // Agrupa por responsável, preservando a ordem de primeira aparição.
  const order: string[] = [];
  const groupMap = new Map<string, CustodyHeroGroup>();
  for (const c of withCustody) {
    const cust = todayCustodyByChild[c.id];
    let g = groupMap.get(cust.responsibleId);
    if (!g) {
      g = {
        responsibleId: cust.responsibleId,
        responsibleName: cust.responsibleName,
        isWithMe: cust.isWithMe,
        childNames: [],
      };
      groupMap.set(cust.responsibleId, g);
      order.push(cust.responsibleId);
    }
    g.childNames.push(c.firstName);
  }
  const groups = order.map((id) => groupMap.get(id)!);

  if (groups.length === 1) {
    const group = groups[0];
    if (group.childNames.length === 1) return { mode: "single", group };
    const ends = new Set(withCustody.map((c) => todayCustodyByChild[c.id].endDate));
    return { mode: "together", group, allSameEnd: ends.size === 1 };
  }

  // split: coloca o grupo "comigo" primeiro pra dar destaque; mantém a
  // ordem estável (sort estável) no resto.
  const ordered = [...groups].sort((a, b) => {
    if (a.isWithMe === b.isWithMe) return 0;
    return a.isWithMe ? -1 : 1;
  });
  return { mode: "split", groups: ordered };
}
