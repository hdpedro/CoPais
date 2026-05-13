/**
 * Tipos compartilhados pelo wizard de onboarding (nativo).
 *
 * Espelha `src/app/(app)/onboarding/_lib/types.ts` (PWA). Mantém paridade
 * dos tipos entre as duas plataformas — qualquer mudança aqui deve ser
 * refletida no PWA também (e vice-versa).
 */

export type WizardStep =
  | 'checking'
  | 'family'
  | 'first-child'
  | 'add-child'
  | 'edit-child'
  | 'family-summary';

export type ChildSex = 'M' | 'F' | null;

export type InviteRole = 'parent' | 'grandparent' | 'caregiver';

export interface WizardChild {
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
export type Translate = (key: string, params?: Record<string, string | number>) => string;
