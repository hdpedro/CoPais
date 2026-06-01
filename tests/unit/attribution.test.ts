/**
 * Cobre o parser de atribuição (first-touch UTM) + o achatador de propriedades
 * de evento. Estas são as funções puras de `src/lib/attribution.ts` — a
 * `getAttribution` (que usa next/headers) não é testada aqui de propósito; o
 * import dinâmico mantém este teste livre de mocks de runtime do Next.
 *
 * Contexto: fecha o loop "Instagram → cadastro → pagante". O parser tem que ser
 * defensivo (cookie vem do navegador, pode estar malformado) e o achatador tem
 * que respeitar a convenção utm_* + omitir nulos.
 */
import { describe, it, expect } from "vitest";
import {
  parseAttribution,
  attributionEventProps,
  type Attribution,
} from "../../src/lib/attribution";

function cookieValue(obj: Record<string, unknown>): string {
  return encodeURIComponent(JSON.stringify(obj));
}

describe("parseAttribution", () => {
  it("retorna null pra cookie ausente/vazio", () => {
    expect(parseAttribution(undefined)).toBeNull();
    expect(parseAttribution(null)).toBeNull();
    expect(parseAttribution("")).toBeNull();
  });

  it("retorna null pra JSON malformado (defensivo — cookie é do cliente)", () => {
    expect(parseAttribution("não-é-json")).toBeNull();
    expect(parseAttribution("%7Bbroken")).toBeNull();
  });

  it("retorna null quando não há sinal de aquisição (sem source/campaign/referrer)", () => {
    expect(parseAttribution(cookieValue({ medium: "paid", landing: "/" }))).toBeNull();
  });

  it("parseia um first-touch de campanha do Instagram", () => {
    const raw = cookieValue({
      source: "instagram",
      medium: "paid",
      campaign: "lancamento-junho",
      content: "video-1",
      term: null,
      referrer: "l.instagram.com",
      landing: "/",
      ts: "2026-06-01T00:00:00.000Z",
    });
    expect(parseAttribution(raw)).toEqual<Attribution>({
      source: "instagram",
      medium: "paid",
      campaign: "lancamento-junho",
      content: "video-1",
      term: null,
      referrer: "l.instagram.com",
      landing: "/",
      ts: "2026-06-01T00:00:00.000Z",
    });
  });

  it("aceita só referrer (tráfego orgânico do IG, sem UTM)", () => {
    const a = parseAttribution(cookieValue({ referrer: "l.instagram.com" }));
    expect(a?.referrer).toBe("l.instagram.com");
    expect(a?.source).toBeNull();
  });

  it("trunca strings gigantes em 200 chars (anti-poluição)", () => {
    const huge = "x".repeat(5000);
    const a = parseAttribution(cookieValue({ source: huge }));
    expect(a?.source?.length).toBe(200);
  });

  it("ignora campos não-string (number/objeto viram null)", () => {
    const a = parseAttribution(
      cookieValue({ source: "instagram", campaign: 123, content: { a: 1 } }),
    );
    expect(a?.source).toBe("instagram");
    expect(a?.campaign).toBeNull();
    expect(a?.content).toBeNull();
  });
});

describe("attributionEventProps", () => {
  it("retorna objeto vazio pra null/undefined", () => {
    expect(attributionEventProps(null)).toEqual({});
    expect(attributionEventProps(undefined)).toEqual({});
  });

  it("mapeia source/medium/campaign/content/term pras chaves utm_*", () => {
    const a: Attribution = {
      source: "instagram",
      medium: "paid",
      campaign: "lancamento-junho",
      content: "video-1",
      term: "coparentalidade",
      referrer: "l.instagram.com",
      landing: "/",
      ts: null,
    };
    expect(attributionEventProps(a)).toEqual({
      utm_source: "instagram",
      utm_medium: "paid",
      utm_campaign: "lancamento-junho",
      utm_content: "video-1",
      utm_term: "coparentalidade",
      first_referrer: "l.instagram.com",
    });
  });

  it("omite chaves nulas (não cria propriedade vazia)", () => {
    const a: Attribution = {
      source: "instagram",
      medium: null,
      campaign: null,
      content: null,
      term: null,
      referrer: null,
      landing: null,
      ts: null,
    };
    expect(attributionEventProps(a)).toEqual({ utm_source: "instagram" });
  });

  it("referrer vira first_referrer (não utm_source) pra orgânico", () => {
    const a = parseAttribution(cookieValue({ referrer: "l.instagram.com" }));
    expect(attributionEventProps(a)).toEqual({ first_referrer: "l.instagram.com" });
  });
});
