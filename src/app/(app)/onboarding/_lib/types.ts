/**
 * Tipos compartilhados pelo wizard de onboarding (PWA).
 *
 * Mantidos isolados pra:
 *   - permitir import enxuto nos sub-componentes (sem trazer dependências do reducer)
 *   - manter a paridade com o native (`kindar-native/app/onboarding/_lib/types.ts`)
 */

export type WizardStep =
  | "family"
  | "first-child"
  | "add-child"
  | "edit-child"
  | "family-summary";

export type ChildSex = "M" | "F" | null;

export type InviteRole = "parent" | "grandparent" | "caregiver";

export interface WizardChild {
  /** UUID retornado pelo servidor — `/api/create-group` pra 1ª, `/api/children` pra demais. */
  id: string;
  fullName: string;
  /** ISO YYYY-MM-DD. */
  birthDate: string;
  sex: ChildSex;
}

export interface InviteSentInfo {
  token: string;
  email: string;
}

/** Função `t` do `useI18n` — alias pra evitar repetir a assinatura. */
export type Translate = (key: string, vars?: Record<string, string | number>) => string;
