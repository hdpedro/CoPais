/**
 * Testes do reducer do wizard de onboarding (PWA).
 *
 * Cobre todas as transições críticas:
 *  - Avanço entre steps (family → first-child → family-summary)
 *  - CRUD no array de crianças (add 1ª, add Nx, edit, remove otimista + revert)
 *  - Sub-estado do form (limpa em CANCEL_FORM, persiste em ENTER_EDIT_CHILD)
 *  - Convite (rascunho → success → another → reset)
 *  - Error handling (FORM_SUBMIT_ERROR não muda o step, mantém o form)
 *
 * Estrutura: cada describe agrupa transições relacionadas. Para evitar
 * boilerplate, helpers `applyActions(...)` aplicam várias actions em
 * sequência a partir do estado inicial.
 */

import { describe, expect, it } from "vitest";
import {
  initialWizardState,
  progressIndex,
  wizardReducer,
  type WizardState,
} from "@/app/(app)/onboarding/_lib/wizard-state";
import type {
  Action,
} from "@/app/(app)/onboarding/_lib/wizard-state";
import type { WizardChild } from "@/app/(app)/onboarding/_lib/types";

function applyActions(actions: Action[]): WizardState {
  return actions.reduce(wizardReducer, initialWizardState);
}

const sampleChild = (overrides: Partial<WizardChild> = {}): WizardChild => ({
  id: "child-1",
  fullName: "Maria Silva",
  birthDate: "2020-05-10",
  sex: "F",
  ...overrides,
});

describe("wizardReducer — forma da família (arrangement)", () => {
  it("default é 'rotating' (preserva todo grupo existente)", () => {
    expect(initialWizardState.arrangement).toBe("rotating");
  });
  it("SET_ARRANGEMENT troca a forma sem mexer no resto nem avançar step", () => {
    const s = applyActions([
      { type: "SET_GROUP_NAME", value: "Família Pedro" },
      { type: "SET_ARRANGEMENT", value: "together" },
    ]);
    expect(s.arrangement).toBe("together");
    expect(s.groupName).toBe("Família Pedro");
    expect(s.step).toBe("family");
  });
  it("aceita 'single' e volta pra 'rotating'", () => {
    const s = applyActions([
      { type: "SET_ARRANGEMENT", value: "single" },
      { type: "SET_ARRANGEMENT", value: "rotating" },
    ]);
    expect(s.arrangement).toBe("rotating");
  });
});

describe("wizardReducer — navegação", () => {
  it("começa em step 'family' com tudo zerado", () => {
    expect(initialWizardState.step).toBe("family");
    expect(initialWizardState.kids).toEqual([]);
    expect(initialWizardState.groupId).toBeNull();
    expect(initialWizardState.optimisticDelete).toBeNull();
    expect(initialWizardState.summaryError).toBeNull();
  });

  it("SET_GROUP_NAME atualiza só groupName", () => {
    const next = wizardReducer(initialWizardState, {
      type: "SET_GROUP_NAME",
      value: "Família Silva",
    });
    expect(next.groupName).toBe("Família Silva");
    expect(next.step).toBe("family"); // sem mudança de step
  });

  it("GOTO_FIRST_CHILD limpa form e muda step", () => {
    const dirty = applyActions([
      { type: "FORM_FIELD", field: "name", value: "lixo" },
      { type: "FORM_SUBMIT_ERROR", message: "erro velho" },
    ]);
    const next = wizardReducer(dirty, { type: "GOTO_FIRST_CHILD" });
    expect(next.step).toBe("first-child");
    expect(next.form.name).toBe("");
    expect(next.form.error).toBeNull();
  });

  it("CANCEL_FORM volta pro resumo limpando o form", () => {
    const dirty = applyActions([
      { type: "ENTER_ADD_CHILD" },
      { type: "FORM_FIELD", field: "name", value: "Pedro" },
    ]);
    const next = wizardReducer(dirty, { type: "CANCEL_FORM" });
    expect(next.step).toBe("family-summary");
    expect(next.form.name).toBe("");
    expect(next.form.editingChildId).toBeNull();
  });
});

describe("wizardReducer — CRUD de crianças", () => {
  it("FIRST_CHILD_SUCCESS popula kids + groupId + vai pro resumo", () => {
    const child = sampleChild();
    const next = wizardReducer(initialWizardState, {
      type: "FIRST_CHILD_SUCCESS",
      groupId: "group-1",
      child,
    });
    expect(next.step).toBe("family-summary");
    expect(next.groupId).toBe("group-1");
    expect(next.kids).toEqual([child]);
    expect(next.form).toEqual(initialWizardState.form);
  });

  it("ANOTHER_CHILD_SUCCESS adiciona ao fim da lista", () => {
    const first = sampleChild();
    const second = sampleChild({ id: "child-2", fullName: "Pedro" });
    const state = applyActions([
      { type: "FIRST_CHILD_SUCCESS", groupId: "g1", child: first },
      { type: "ANOTHER_CHILD_SUCCESS", child: second },
    ]);
    expect(state.kids).toEqual([first, second]);
  });

  it("ENTER_EDIT_CHILD popula form com dados da criança", () => {
    const child = sampleChild({ sex: "M" });
    const state = applyActions([
      { type: "FIRST_CHILD_SUCCESS", groupId: "g1", child },
      { type: "ENTER_EDIT_CHILD", child },
    ]);
    expect(state.step).toBe("edit-child");
    expect(state.form.name).toBe(child.fullName);
    expect(state.form.birthDate).toBe(child.birthDate);
    expect(state.form.sex).toBe("M");
    expect(state.form.editingChildId).toBe(child.id);
  });

  it("ENTER_EDIT_CHILD com sex=null normaliza pra ''", () => {
    const child = sampleChild({ sex: null });
    const state = wizardReducer(initialWizardState, {
      type: "ENTER_EDIT_CHILD",
      child,
    });
    expect(state.form.sex).toBe("");
  });

  it("EDIT_CHILD_SUCCESS atualiza só a criança alvo, preservando ordem", () => {
    const a = sampleChild({ id: "a", fullName: "Ana" });
    const b = sampleChild({ id: "b", fullName: "Beatriz" });
    const c = sampleChild({ id: "c", fullName: "Carlos" });
    const updated = { ...b, fullName: "Bia" };
    const state = applyActions([
      { type: "FIRST_CHILD_SUCCESS", groupId: "g1", child: a },
      { type: "ANOTHER_CHILD_SUCCESS", child: b },
      { type: "ANOTHER_CHILD_SUCCESS", child: c },
      { type: "EDIT_CHILD_SUCCESS", child: updated },
    ]);
    expect(state.kids.map((k) => k.fullName)).toEqual(["Ana", "Bia", "Carlos"]);
  });
});

describe("wizardReducer — optimistic delete", () => {
  it("REMOVE_CHILD_OPTIMISTIC remove + guarda snapshot", () => {
    const a = sampleChild({ id: "a", fullName: "Ana" });
    const b = sampleChild({ id: "b", fullName: "Bia" });
    const state = applyActions([
      { type: "FIRST_CHILD_SUCCESS", groupId: "g1", child: a },
      { type: "ANOTHER_CHILD_SUCCESS", child: b },
      { type: "REMOVE_CHILD_OPTIMISTIC", id: "b" },
    ]);
    expect(state.kids.map((k) => k.id)).toEqual(["a"]);
    expect(state.optimisticDelete).toEqual({ index: 1, child: b });
    expect(state.pendingDeleteId).toBeNull();
  });

  it("REMOVE_CHILD_OPTIMISTIC sem encontrar id é no-op", () => {
    const initial = applyActions([
      { type: "FIRST_CHILD_SUCCESS", groupId: "g1", child: sampleChild() },
    ]);
    const next = wizardReducer(initial, {
      type: "REMOVE_CHILD_OPTIMISTIC",
      id: "ghost",
    });
    expect(next).toBe(initial); // mesma referência = no-op
  });

  it("REMOVE_CHILD_REVERT restaura na posição original", () => {
    const a = sampleChild({ id: "a" });
    const b = sampleChild({ id: "b" });
    const c = sampleChild({ id: "c" });
    const state = applyActions([
      { type: "FIRST_CHILD_SUCCESS", groupId: "g1", child: a },
      { type: "ANOTHER_CHILD_SUCCESS", child: b },
      { type: "ANOTHER_CHILD_SUCCESS", child: c },
      { type: "REMOVE_CHILD_OPTIMISTIC", id: "b" },
      { type: "REMOVE_CHILD_REVERT", message: "falhou" },
    ]);
    expect(state.kids.map((k) => k.id)).toEqual(["a", "b", "c"]);
    expect(state.optimisticDelete).toBeNull();
    expect(state.summaryError).toBe("falhou");
  });

  it("REMOVE_CHILD_REVERT sem snapshot só seta erro", () => {
    const state = wizardReducer(initialWizardState, {
      type: "REMOVE_CHILD_REVERT",
      message: "erro",
    });
    expect(state.summaryError).toBe("erro");
    expect(state.kids).toEqual([]);
  });

  it("REMOVE_CHILD_CONFIRM limpa o snapshot", () => {
    const a = sampleChild({ id: "a" });
    const state = applyActions([
      { type: "FIRST_CHILD_SUCCESS", groupId: "g1", child: a },
      { type: "REMOVE_CHILD_OPTIMISTIC", id: "a" },
      { type: "REMOVE_CHILD_CONFIRM" },
    ]);
    expect(state.kids).toEqual([]);
    expect(state.optimisticDelete).toBeNull();
  });
});

describe("wizardReducer — convite inline", () => {
  it("INVITE_FIELD + INVITE_ROLE atualizam só o sub-estado de invite", () => {
    const state = applyActions([
      { type: "INVITE_FIELD", field: "email", value: "co@ex.com" },
      { type: "INVITE_ROLE", value: "grandparent" },
    ]);
    expect(state.invite.email).toBe("co@ex.com");
    expect(state.invite.role).toBe("grandparent");
    expect(state.invite.sending).toBe(false);
  });

  it("INVITE_SEND_SUCCESS preenche sent + reseta sending/error", () => {
    const state = applyActions([
      { type: "INVITE_FIELD", field: "email", value: "co@ex.com" },
      { type: "INVITE_SEND_START" },
      { type: "INVITE_SEND_SUCCESS", sent: { token: "tok-1", email: "co@ex.com" } },
    ]);
    expect(state.invite.sent).toEqual({ token: "tok-1", email: "co@ex.com" });
    expect(state.invite.sending).toBe(false);
    expect(state.invite.error).toBeNull();
  });

  it("INVITE_SEND_ANOTHER zera o sub-estado de invite", () => {
    const state = applyActions([
      { type: "INVITE_FIELD", field: "email", value: "co@ex.com" },
      { type: "INVITE_SEND_SUCCESS", sent: { token: "tok-1", email: "co@ex.com" } },
      { type: "INVITE_SEND_ANOTHER" },
    ]);
    expect(state.invite.sent).toBeNull();
    expect(state.invite.email).toBe("");
    expect(state.invite.role).toBe("parent");
  });
});

describe("wizardReducer — error handling", () => {
  it("FORM_SUBMIT_ERROR seta erro mas não muda step nem campos", () => {
    const dirty = applyActions([
      { type: "ENTER_ADD_CHILD" },
      { type: "FORM_FIELD", field: "name", value: "Pedro" },
      { type: "FORM_SUBMIT_START" },
      { type: "FORM_SUBMIT_ERROR", message: "Não foi possível" },
    ]);
    expect(dirty.step).toBe("add-child");
    expect(dirty.form.name).toBe("Pedro");
    expect(dirty.form.loading).toBe(false);
    expect(dirty.form.error).toBe("Não foi possível");
  });

  it("SUMMARY_ERROR + CLEAR_SUMMARY_ERROR funcionam isoladamente", () => {
    const set = wizardReducer(initialWizardState, {
      type: "SUMMARY_ERROR",
      message: "x",
    });
    expect(set.summaryError).toBe("x");
    const cleared = wizardReducer(set, { type: "CLEAR_SUMMARY_ERROR" });
    expect(cleared.summaryError).toBeNull();
  });
});

describe("progressIndex", () => {
  it.each([
    ["family", 0],
    ["first-child", 1],
    ["add-child", 1],
    ["edit-child", 1],
    ["family-summary", 1],
  ] as const)("step %s → progressIndex %i", (step, expected) => {
    expect(progressIndex(step)).toBe(expected);
  });
});
