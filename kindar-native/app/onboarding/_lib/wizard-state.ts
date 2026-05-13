/**
 * Máquina de estados do wizard de onboarding (nativo).
 *
 * Espelha `src/app/(app)/onboarding/_lib/wizard-state.ts` (PWA) com uma
 * pequena diferença: o nativo tem um step adicional `'checking'`
 * (auto-accept de convites pendentes antes de mostrar o form).
 *
 * `pendingDeleteId` não existe aqui porque a confirmação de remoção no
 * mobile usa `Alert.alert` em vez de inline — não precisa de estado
 * persistente entre renders.
 */

import type {
  ChildSex, InviteRole, InviteSentInfo, WizardChild, WizardStep,
} from './types';

export interface FormState {
  editingChildId: string | null;
  name: string;
  /** ISO YYYY-MM-DD (já normalizado). */
  birthDate: string;
  /** Display BR DD/MM/AAAA enquanto o usuário digita. */
  birthDateInput: string;
  sex: ChildSex | '';
  loading: boolean;
  error: string;
}

export interface InviteState {
  email: string;
  role: InviteRole;
  sending: boolean;
  error: string;
  sent: InviteSentInfo | null;
}

export interface WizardState {
  step: WizardStep;
  groupId: string | null;
  groupName: string;
  kids: WizardChild[];
  form: FormState;
  invite: InviteState;
  /** Snapshot otimista pra revert no delete da criança. Vide PWA reducer. */
  optimisticDelete: { index: number; child: WizardChild } | null;
}

export const initialFormState: FormState = {
  editingChildId: null,
  name: '',
  birthDate: '',
  birthDateInput: '',
  sex: '',
  loading: false,
  error: '',
};

export const initialInviteState: InviteState = {
  email: '',
  role: 'parent',
  sending: false,
  error: '',
  sent: null,
};

export const initialWizardState: WizardState = {
  step: 'checking',
  groupId: null,
  groupName: '',
  kids: [],
  form: initialFormState,
  invite: initialInviteState,
  optimisticDelete: null,
};

export type Action =
  | { type: 'SET_GROUP_NAME'; value: string }
  | { type: 'GOTO_FAMILY' }
  | { type: 'GOTO_FIRST_CHILD' }
  | { type: 'ENTER_ADD_CHILD' }
  | { type: 'ENTER_EDIT_CHILD'; child: WizardChild; birthDateInput: string }
  | { type: 'CANCEL_FORM' }
  | { type: 'FORM_NAME'; value: string }
  | { type: 'FORM_BIRTH'; iso: string; display: string }
  | { type: 'FORM_SEX'; value: ChildSex | '' }
  | { type: 'FORM_SUBMIT_START' }
  | { type: 'FORM_SUBMIT_ERROR'; message: string }
  | { type: 'FIRST_CHILD_SUCCESS'; groupId: string | null; child: WizardChild }
  | { type: 'ANOTHER_CHILD_SUCCESS'; child: WizardChild }
  | { type: 'EDIT_CHILD_SUCCESS'; child: WizardChild }
  /** Remove imediatamente + guarda snapshot pra revert. */
  | { type: 'REMOVE_CHILD_OPTIMISTIC'; id: string }
  /** API confirmou — só limpa o snapshot pendente. */
  | { type: 'REMOVE_CHILD_CONFIRM' }
  /** API falhou — restaura a criança na posição original. */
  | { type: 'REMOVE_CHILD_REVERT' }
  | { type: 'INVITE_EMAIL'; value: string }
  | { type: 'INVITE_ROLE'; value: InviteRole }
  | { type: 'INVITE_SEND_START' }
  | { type: 'INVITE_SEND_SUCCESS'; sent: InviteSentInfo }
  | { type: 'INVITE_SEND_ERROR'; message: string }
  | { type: 'INVITE_SEND_ANOTHER' };

export function wizardReducer(state: WizardState, action: Action): WizardState {
  switch (action.type) {
    case 'SET_GROUP_NAME':
      return { ...state, groupName: action.value };

    case 'GOTO_FAMILY':
      return { ...state, step: 'family', form: { ...initialFormState } };

    case 'GOTO_FIRST_CHILD':
      return { ...state, step: 'first-child', form: { ...initialFormState } };

    case 'ENTER_ADD_CHILD':
      return { ...state, step: 'add-child', form: { ...initialFormState } };

    case 'ENTER_EDIT_CHILD':
      return {
        ...state,
        step: 'edit-child',
        form: {
          editingChildId: action.child.id,
          name: action.child.fullName,
          birthDate: action.child.birthDate,
          birthDateInput: action.birthDateInput,
          sex: action.child.sex ?? '',
          loading: false,
          error: '',
        },
      };

    case 'CANCEL_FORM':
      return { ...state, step: 'family-summary', form: { ...initialFormState } };

    case 'FORM_NAME':
      return { ...state, form: { ...state.form, name: action.value } };

    case 'FORM_BIRTH':
      return {
        ...state,
        form: { ...state.form, birthDate: action.iso, birthDateInput: action.display },
      };

    case 'FORM_SEX':
      return { ...state, form: { ...state.form, sex: action.value } };

    case 'FORM_SUBMIT_START':
      return { ...state, form: { ...state.form, loading: true, error: '' } };

    case 'FORM_SUBMIT_ERROR':
      return { ...state, form: { ...state.form, loading: false, error: action.message } };

    case 'FIRST_CHILD_SUCCESS':
      return {
        ...state,
        step: 'family-summary',
        groupId: action.groupId,
        kids: [action.child],
        form: { ...initialFormState },
      };

    case 'ANOTHER_CHILD_SUCCESS':
      return {
        ...state,
        step: 'family-summary',
        kids: [...state.kids, action.child],
        form: { ...initialFormState },
      };

    case 'EDIT_CHILD_SUCCESS':
      return {
        ...state,
        step: 'family-summary',
        kids: state.kids.map((k) => (k.id === action.child.id ? action.child : k)),
        form: { ...initialFormState },
      };

    case 'REMOVE_CHILD_OPTIMISTIC': {
      const index = state.kids.findIndex((k) => k.id === action.id);
      if (index === -1) return state;
      const child = state.kids[index];
      return {
        ...state,
        kids: state.kids.filter((k) => k.id !== action.id),
        optimisticDelete: { index, child },
      };
    }

    case 'REMOVE_CHILD_CONFIRM':
      return { ...state, optimisticDelete: null };

    case 'REMOVE_CHILD_REVERT': {
      if (!state.optimisticDelete) return state;
      const { index, child } = state.optimisticDelete;
      const restored = [...state.kids];
      restored.splice(Math.min(index, restored.length), 0, child);
      return { ...state, kids: restored, optimisticDelete: null };
    }

    case 'INVITE_EMAIL':
      return { ...state, invite: { ...state.invite, email: action.value } };

    case 'INVITE_ROLE':
      return { ...state, invite: { ...state.invite, role: action.value } };

    case 'INVITE_SEND_START':
      return { ...state, invite: { ...state.invite, sending: true, error: '' } };

    case 'INVITE_SEND_SUCCESS':
      return { ...state, invite: { ...state.invite, sending: false, error: '', sent: action.sent } };

    case 'INVITE_SEND_ERROR':
      return { ...state, invite: { ...state.invite, sending: false, error: action.message } };

    case 'INVITE_SEND_ANOTHER':
      return { ...state, invite: { ...initialInviteState } };
  }
}

/** Mapeia o `step` atual pra índice do progress indicator (0..2). */
export function progressIndex(step: WizardStep): number {
  if (step === 'family' || step === 'checking') return 0;
  if (step === 'first-child' || step === 'add-child' || step === 'edit-child') return 1;
  if (step === 'family-summary') return 1;
  return 2;
}
