/**
 * Máquina de estados do wizard de onboarding (PWA).
 *
 * Estado e transições centralizados num reducer pra evitar dispersão em
 * múltiplos `useState`. Cada `Action` é uma transição explícita —
 * mais fácil de auditar, testar e debugar do que vários `setX(...)`
 * espalhados pelos handlers.
 *
 * Estados compostos (form, invite) agrupam campos relacionados pra
 * que a transição "voltar pro resumo" possa limpá-los atomicamente.
 */

import type { ChildSex, InviteRole, InviteSentInfo, WizardChild, WizardStep } from "./types";

export interface FormState {
  /** Quando `editingChildId` for non-null, a sub-etapa `edit-child` está ativa. */
  editingChildId: string | null;
  name: string;
  birthDate: string; // ISO (input type="date")
  sex: ChildSex | "";
  loading: boolean;
  error: string | null;
}

export interface InviteState {
  email: string;
  role: InviteRole;
  sending: boolean;
  error: string | null;
  sent: InviteSentInfo | null;
}

/** Forma da família escolhida no 1º passo — define o herói do painel. */
export type OnboardingArrangement = "rotating" | "together" | "single";

export interface WizardState {
  step: WizardStep;
  groupId: string | null;
  groupName: string;
  /** Default 'rotating' (caso comum do app + preserva comportamento atual). */
  arrangement: OnboardingArrangement;
  kids: WizardChild[];
  form: FormState;
  invite: InviteState;
  pendingDeleteId: string | null;
  /**
   * Snapshot otimista pra revert: quando o usuário confirma "remover",
   * removemos do estado imediatamente e guardamos o pair { index, child }
   * aqui. Se a API falhar, restauramos na mesma posição. Em sucesso,
   * limpamos. Estrutura `[index, child]` preserva a ordem original.
   */
  optimisticDelete: { index: number; child: WizardChild } | null;
  /**
   * Mensagem de erro do resumo (delete falhou, invite errado etc).
   * Live region anuncia em screen reader + banner discreto. Acionada
   * via `SUMMARY_ERROR` e limpa via `CLEAR_SUMMARY_ERROR`.
   */
  summaryError: string | null;
}

export const initialFormState: FormState = {
  editingChildId: null,
  name: "",
  birthDate: "",
  sex: "",
  loading: false,
  error: null,
};

export const initialInviteState: InviteState = {
  email: "",
  role: "parent",
  sending: false,
  error: null,
  sent: null,
};

export const initialWizardState: WizardState = {
  step: "family",
  groupId: null,
  groupName: "",
  arrangement: "rotating",
  kids: [],
  form: initialFormState,
  invite: initialInviteState,
  pendingDeleteId: null,
  optimisticDelete: null,
  summaryError: null,
};

/**
 * Discriminated union — todas as transições possíveis. TypeScript garante
 * que o reducer trate cada caso, e o caller não consegue inventar action.
 */
export type Action =
  | { type: "SET_GROUP_NAME"; value: string }
  | { type: "SET_ARRANGEMENT"; value: OnboardingArrangement }
  | { type: "GOTO_FIRST_CHILD" }
  | { type: "GOTO_FAMILY" }
  | { type: "ENTER_ADD_CHILD" }
  | { type: "ENTER_EDIT_CHILD"; child: WizardChild }
  | { type: "CANCEL_FORM" } // limpa form + volta pro resumo
  | { type: "FORM_FIELD"; field: "name" | "birthDate"; value: string }
  | { type: "FORM_SEX"; value: ChildSex | "" }
  | { type: "FORM_SUBMIT_START" }
  | { type: "FORM_SUBMIT_ERROR"; message: string }
  | { type: "FIRST_CHILD_SUCCESS"; groupId: string | null; child: WizardChild }
  | { type: "ANOTHER_CHILD_SUCCESS"; child: WizardChild }
  | { type: "EDIT_CHILD_SUCCESS"; child: WizardChild }
  | { type: "REQUEST_DELETE"; id: string }
  | { type: "CANCEL_DELETE" }
  /** Remove imediatamente da lista + guarda snapshot pra revert. */
  | { type: "REMOVE_CHILD_OPTIMISTIC"; id: string }
  /** API confirmou — só limpa o snapshot pendente. */
  | { type: "REMOVE_CHILD_CONFIRM" }
  /** API falhou — restaura a criança na posição original. */
  | { type: "REMOVE_CHILD_REVERT"; message: string }
  | { type: "SUMMARY_ERROR"; message: string }
  | { type: "CLEAR_SUMMARY_ERROR" }
  | { type: "INVITE_FIELD"; field: "email"; value: string }
  | { type: "INVITE_ROLE"; value: InviteRole }
  | { type: "INVITE_SEND_START" }
  | { type: "INVITE_SEND_SUCCESS"; sent: InviteSentInfo }
  | { type: "INVITE_SEND_ERROR"; message: string }
  | { type: "INVITE_SEND_ANOTHER" };

export function wizardReducer(state: WizardState, action: Action): WizardState {
  switch (action.type) {
    case "SET_GROUP_NAME":
      return { ...state, groupName: action.value };

    case "SET_ARRANGEMENT":
      return { ...state, arrangement: action.value };

    case "GOTO_FIRST_CHILD":
      return { ...state, step: "first-child", form: { ...initialFormState } };

    case "GOTO_FAMILY":
      return { ...state, step: "family", form: { ...initialFormState } };

    case "ENTER_ADD_CHILD":
      return { ...state, step: "add-child", form: { ...initialFormState } };

    case "ENTER_EDIT_CHILD":
      return {
        ...state,
        step: "edit-child",
        form: {
          editingChildId: action.child.id,
          name: action.child.fullName,
          birthDate: action.child.birthDate,
          sex: action.child.sex ?? "",
          loading: false,
          error: null,
        },
      };

    case "CANCEL_FORM":
      return { ...state, step: "family-summary", form: { ...initialFormState } };

    case "FORM_FIELD":
      return { ...state, form: { ...state.form, [action.field]: action.value } };

    case "FORM_SEX":
      return { ...state, form: { ...state.form, sex: action.value } };

    case "FORM_SUBMIT_START":
      return { ...state, form: { ...state.form, loading: true, error: null } };

    case "FORM_SUBMIT_ERROR":
      return { ...state, form: { ...state.form, loading: false, error: action.message } };

    case "FIRST_CHILD_SUCCESS":
      return {
        ...state,
        step: "family-summary",
        groupId: action.groupId,
        kids: [action.child],
        form: { ...initialFormState },
      };

    case "ANOTHER_CHILD_SUCCESS":
      return {
        ...state,
        step: "family-summary",
        kids: [...state.kids, action.child],
        form: { ...initialFormState },
      };

    case "EDIT_CHILD_SUCCESS":
      return {
        ...state,
        step: "family-summary",
        kids: state.kids.map((k) => (k.id === action.child.id ? action.child : k)),
        form: { ...initialFormState },
      };

    case "REQUEST_DELETE":
      return { ...state, pendingDeleteId: action.id };

    case "CANCEL_DELETE":
      return { ...state, pendingDeleteId: null };

    case "REMOVE_CHILD_OPTIMISTIC": {
      const index = state.kids.findIndex((k) => k.id === action.id);
      if (index === -1) return state;
      const child = state.kids[index];
      return {
        ...state,
        kids: state.kids.filter((k) => k.id !== action.id),
        pendingDeleteId: null,
        optimisticDelete: { index, child },
        summaryError: null,
      };
    }

    case "REMOVE_CHILD_CONFIRM":
      return { ...state, optimisticDelete: null };

    case "REMOVE_CHILD_REVERT": {
      if (!state.optimisticDelete) {
        return { ...state, summaryError: action.message };
      }
      const { index, child } = state.optimisticDelete;
      // Re-insere na posição original — preserva ordem visual.
      const restored = [...state.kids];
      restored.splice(Math.min(index, restored.length), 0, child);
      return {
        ...state,
        kids: restored,
        optimisticDelete: null,
        summaryError: action.message,
      };
    }

    case "SUMMARY_ERROR":
      return { ...state, summaryError: action.message };

    case "CLEAR_SUMMARY_ERROR":
      return { ...state, summaryError: null };

    case "INVITE_FIELD":
      return { ...state, invite: { ...state.invite, [action.field]: action.value } };

    case "INVITE_ROLE":
      return { ...state, invite: { ...state.invite, role: action.value } };

    case "INVITE_SEND_START":
      return { ...state, invite: { ...state.invite, sending: true, error: null } };

    case "INVITE_SEND_SUCCESS":
      return { ...state, invite: { ...state.invite, sending: false, error: null, sent: action.sent } };

    case "INVITE_SEND_ERROR":
      return { ...state, invite: { ...state.invite, sending: false, error: action.message } };

    case "INVITE_SEND_ANOTHER":
      return { ...state, invite: { ...initialInviteState } };
  }
}

/** Mapeia o `step` atual pra índice do progress indicator (0..2). */
export function progressIndex(step: WizardStep): number {
  if (step === "family") return 0;
  if (step === "family-summary") return 1;
  if (step === "first-child" || step === "add-child" || step === "edit-child") return 1;
  return 2;
}
