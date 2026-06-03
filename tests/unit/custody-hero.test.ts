/**
 * Testes do agregador do card-herói de custódia (src/lib/custody-hero.ts).
 *
 * Motivado pelo bug de UX reportado em 2026-06-03: com 3 filhos todos com
 * a mesma responsável, o herói mostrava só "Henrique está com Celma"
 * (centrado em children[0]) em vez de agregar a família.
 */

import { describe, it, expect } from "vitest";
import {
  buildCustodyHero,
  type TodayCustodyByChild,
  type HeroChild,
} from "@/lib/custody-hero";

const KIDS: HeroChild[] = [
  { id: "h", firstName: "Henrique" },
  { id: "e", firstName: "Eduardo" },
  { id: "a", firstName: "Alexandre" },
];

function withParent(
  childIds: string[],
  opts: { id: string; name: string; isWithMe: boolean; endDate?: string },
): TodayCustodyByChild {
  const map: TodayCustodyByChild = {};
  for (const cid of childIds) {
    map[cid] = {
      responsibleId: opts.id,
      responsibleName: opts.name,
      isWithMe: opts.isWithMe,
      endDate: opts.endDate ?? "2026-06-07",
      custodyType: "regular",
    };
  }
  return map;
}

describe("buildCustodyHero", () => {
  it("mode=none quando nenhuma criança tem custódia hoje", () => {
    const hero = buildCustodyHero(KIDS, {});
    expect(hero.mode).toBe("none");
  });

  it("mode=single com 1 só criança", () => {
    const hero = buildCustodyHero(
      [KIDS[0]],
      withParent(["h"], { id: "celma", name: "Celma", isWithMe: false }),
    );
    expect(hero.mode).toBe("single");
    if (hero.mode === "single") {
      expect(hero.group.childNames).toEqual(["Henrique"]);
      expect(hero.group.responsibleName).toBe("Celma");
      expect(hero.group.isWithMe).toBe(false);
    }
  });

  it("mode=together quando os 3 filhos estão com a mesma responsável (mesmo fim)", () => {
    const hero = buildCustodyHero(
      KIDS,
      withParent(["h", "e", "a"], { id: "celma", name: "Celma", isWithMe: false }),
    );
    expect(hero.mode).toBe("together");
    if (hero.mode === "together") {
      expect(hero.group.childNames).toEqual(["Henrique", "Eduardo", "Alexandre"]);
      expect(hero.group.responsibleName).toBe("Celma");
      expect(hero.allSameEnd).toBe(true);
    }
  });

  it("together com fins de custódia diferentes → allSameEnd=false", () => {
    const map: TodayCustodyByChild = {
      ...withParent(["h", "e"], { id: "celma", name: "Celma", isWithMe: false, endDate: "2026-06-07" }),
      ...withParent(["a"], { id: "celma", name: "Celma", isWithMe: false, endDate: "2026-06-06" }),
    };
    const hero = buildCustodyHero(KIDS, map);
    expect(hero.mode).toBe("together");
    if (hero.mode === "together") expect(hero.allSameEnd).toBe(false);
  });

  it("mode=split quando os filhos estão divididos entre responsáveis", () => {
    const map: TodayCustodyByChild = {
      ...withParent(["h", "e"], { id: "vitor", name: "Vitor", isWithMe: true }),
      ...withParent(["a"], { id: "celma", name: "Celma", isWithMe: false }),
    };
    const hero = buildCustodyHero(KIDS, map);
    expect(hero.mode).toBe("split");
    if (hero.mode === "split") {
      expect(hero.groups).toHaveLength(2);
      // grupo "comigo" vem primeiro
      expect(hero.groups[0].isWithMe).toBe(true);
      expect(hero.groups[0].childNames).toEqual(["Henrique", "Eduardo"]);
      expect(hero.groups[1].responsibleName).toBe("Celma");
      expect(hero.groups[1].childNames).toEqual(["Alexandre"]);
    }
  });

  it("split coloca o grupo do próprio usuário primeiro mesmo se aparece depois", () => {
    const map: TodayCustodyByChild = {
      ...withParent(["h"], { id: "celma", name: "Celma", isWithMe: false }),
      ...withParent(["e", "a"], { id: "vitor", name: "Vitor", isWithMe: true }),
    };
    const hero = buildCustodyHero(KIDS, map);
    if (hero.mode === "split") {
      expect(hero.groups[0].isWithMe).toBe(true);
      expect(hero.groups[0].childNames).toEqual(["Eduardo", "Alexandre"]);
    }
  });

  it("ignora crianças sem evento hoje (subconjunto) e ainda agrega", () => {
    // Só Eduardo e Alexandre têm custódia; Henrique (children[0]) não.
    const hero = buildCustodyHero(
      KIDS,
      withParent(["e", "a"], { id: "celma", name: "Celma", isWithMe: false }),
    );
    expect(hero.mode).toBe("together");
    if (hero.mode === "together") {
      expect(hero.group.childNames).toEqual(["Eduardo", "Alexandre"]);
    }
  });
});
