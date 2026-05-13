/**
 * Helpers puros de formatação usados pelos sub-componentes do wizard.
 *
 * Não importam React nem o estado do wizard — qualquer caller pode usar.
 * Tudo aqui é determinístico e seguro pra usar em renderização.
 */

import type { ChildSex, Translate } from "./types";

/** Converte ISO (YYYY-MM-DD) pra formato BR (DD/MM/YYYY) sem alocar objetos Date. */
export function formatBR(iso: string): string {
  return iso.split("-").reverse().join("/");
}

/**
 * Idade humanizada relativa a hoje. Crianças pequenas em meses
 * porque "0 anos" passa percepção de erro pro usuário ("essa criança não
 * tem idade?"). i18n é injetado pra reaproveitar nas 5 línguas sem
 * acoplar com o store global.
 */
export function ageLabel(iso: string, t: Translate): string {
  const birth = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return "";
  const now = new Date();
  const months =
    (now.getFullYear() - birth.getFullYear()) * 12
    + (now.getMonth() - birth.getMonth())
    - (now.getDate() < birth.getDate() ? 1 : 0);
  if (months < 1) return t("onboardingForm.ageNewborn");
  if (months < 12) {
    return months === 1
      ? t("onboardingForm.ageMonthOne")
      : t("onboardingForm.ageMonths", { count: months });
  }
  const years = Math.floor(months / 12);
  return years === 1
    ? t("onboardingForm.ageYearOne")
    : t("onboardingForm.ageYears", { count: years });
}

/** Avatar emoji derivado do sexo. `null` cai num neutro 🧒. */
export function avatarEmoji(sex: ChildSex): string {
  if (sex === "F") return "👧";
  if (sex === "M") return "👦";
  return "🧒";
}
