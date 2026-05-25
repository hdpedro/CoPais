"use client";

/**
 * Onboarding wizard — PWA.
 *
 * Orquestrador enxuto. Combina o reducer (`_lib/wizard-state.ts`), os
 * helpers de formatação (`_lib/format.ts`), o classificador de erros
 * (`_lib/errors.ts`) e os sub-componentes memoizados (`_components/*`).
 *
 * Sub-etapas: family → first-child → family-summary com loop
 * add-child/edit-child + remove otimista + convite inline.
 *
 * Endpoints REST compartilhados com o native:
 *   POST /api/create-group            (1ª criança + grupo, atomic com rollback)
 *   POST /api/children                (Nx)
 *   PATCH /api/children/[id]          (editar)
 *   DELETE /api/children/[id]         (remover; UI otimista)
 *   POST /api/invitations             (convite com dual-auth)
 *
 * Paridade native: `kindar-native/app/onboarding/index.tsx` segue o mesmo
 * desenho. Veja `_components/README.md` pra arquitetura completa.
 */

import {
  useCallback, useEffect, useReducer, useRef, type FormEvent,
} from "react";
import { useI18n } from "@/i18n/provider";
import { markOnboardingFinished } from "@/actions/onboarding-quest";
import { ChildForm } from "./_components/ChildForm";
import { FamilyStep } from "./_components/FamilyStep";
import { FamilySummary } from "./_components/FamilySummary";
import { ProgressDots } from "./_components/ProgressDots";
import { isAbortError, resolveFetchErrorMessage } from "./_lib/errors";
import type { ChildSex, InviteRole, WizardChild } from "./_lib/types";
import {
  initialWizardState, progressIndex, wizardReducer,
} from "./_lib/wizard-state";

const TOTAL_STEPS = 3;

export default function OnboardingForm() {
  const { t } = useI18n();
  const [state, dispatch] = useReducer(wizardReducer, initialWizardState);
  const {
    step, groupId, groupName, kids, form, invite,
    pendingDeleteId, summaryError,
  } = state;

  // ────────────────────────────────────────────────────────────────────
  // Refs — focus management + AbortController pra cleanup de fetches.
  // ────────────────────────────────────────────────────────────────────
  const nameRef = useRef<HTMLInputElement>(null);
  const summaryHeadingRef = useRef<HTMLHeadingElement>(null);
  /**
   * Pool de AbortControllers em-flight. Toda chamada fetch registra o
   * seu controller aqui; no unmount, abortamos todos pra evitar
   * "setState on unmounted component" warnings + memory leaks. O
   * controller também é abortado quando uma chamada concorrente é
   * iniciada (deduplicação implícita).
   */
  const controllersRef = useRef<Set<AbortController>>(new Set());
  /**
   * Flag pra permitir saída intencional via finishOnboarding. Sem isso o
   * `beforeunload` handler bloqueia o reload pro /dashboard com prompt
   * "Leave site?" — pra Chrome MCP/QA isso parecia um botão quebrado.
   */
  const allowExitRef = useRef(false);

  useEffect(() => {
    // Capture o ref atual num closure — o cleanup roda no unmount com
    // o set que existia naquele momento.
    const controllers = controllersRef.current;
    return () => {
      controllers.forEach((c) => c.abort());
      controllers.clear();
    };
  }, []);

  /** Cria um AbortController novo + registra pro cleanup. */
  function makeController(): AbortController {
    const c = new AbortController();
    controllersRef.current.add(c);
    return c;
  }
  /** Remove um controller já consumido. */
  function disposeController(c: AbortController) {
    controllersRef.current.delete(c);
  }

  // Foca o input principal ao entrar em first-child/add-child/edit-child.
  useEffect(() => {
    if (step === "add-child" || step === "first-child" || step === "edit-child") {
      const tmr = setTimeout(() => nameRef.current?.focus(), 80);
      return () => clearTimeout(tmr);
    }
    // Ao chegar no resumo, joga o foco no heading pra screen readers
    // anunciarem "{groupName}" — usuário de teclado/AT não fica órfão.
    if (step === "family-summary") {
      const tmr = setTimeout(() => summaryHeadingRef.current?.focus(), 80);
      return () => clearTimeout(tmr);
    }
  }, [step]);

  // Avisa antes de fechar a aba quando o onboarding já tem grupo criado.
  // Mas permite saída intencional via `allowExitRef.current = true` (vide
  // finishOnboarding) — sem isso, o reload pro /dashboard disparava o
  // prompt "Leave site?" e a navegação era cancelada (bug F#20, 25 users
  // ficaram stuck no step 2).
  useEffect(() => {
    if (step !== "family-summary") return;
    function handler(e: BeforeUnloadEvent) {
      if (allowExitRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [step]);

  // ────────────────────────────────────────────────────────────────────
  // Handlers — memoizados pra estabilizar identidade dos props.
  // ────────────────────────────────────────────────────────────────────

  const setGroupName = useCallback((value: string) => {
    dispatch({ type: "SET_GROUP_NAME", value });
  }, []);

  const gotoFirstChild = useCallback(() => {
    if (state.groupName.trim()) dispatch({ type: "GOTO_FIRST_CHILD" });
  }, [state.groupName]);

  const gotoFamily = useCallback(() => dispatch({ type: "GOTO_FAMILY" }), []);

  const startAddChild = useCallback(() => dispatch({ type: "ENTER_ADD_CHILD" }), []);

  const startEditChild = useCallback((childId: string) => {
    const child = state.kids.find((k) => k.id === childId);
    if (child) dispatch({ type: "ENTER_EDIT_CHILD", child });
  }, [state.kids]);

  const cancelForm = useCallback(() => dispatch({ type: "CANCEL_FORM" }), []);

  const setFormName = useCallback((value: string) => {
    dispatch({ type: "FORM_FIELD", field: "name", value });
  }, []);

  const setFormBirth = useCallback((value: string) => {
    dispatch({ type: "FORM_FIELD", field: "birthDate", value });
  }, []);

  const setFormSex = useCallback((value: ChildSex | "") => {
    dispatch({ type: "FORM_SEX", value });
  }, []);

  const requestDelete = useCallback((id: string) => {
    dispatch({ type: "REQUEST_DELETE", id });
  }, []);

  const cancelDelete = useCallback(() => dispatch({ type: "CANCEL_DELETE" }), []);

  const dismissSummaryError = useCallback(() => {
    dispatch({ type: "CLEAR_SUMMARY_ERROR" });
  }, []);

  const setInviteEmail = useCallback((value: string) => {
    dispatch({ type: "INVITE_FIELD", field: "email", value });
  }, []);

  const setInviteRole = useCallback((value: InviteRole) => {
    dispatch({ type: "INVITE_ROLE", value });
  }, []);

  const sendAnother = useCallback(() => dispatch({ type: "INVITE_SEND_ANOTHER" }), []);

  // ────────────────────────────────────────────────────────────────────
  // Submits — START → SUCCESS/ERROR com AbortController.
  // ────────────────────────────────────────────────────────────────────

  const handleFirstChildSubmit = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!groupName.trim() || !form.name.trim() || !form.birthDate) return;
    dispatch({ type: "FORM_SUBMIT_START" });

    const controller = makeController();
    try {
      const res = await fetch("/api/create-group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          name: groupName.trim(),
          childName: form.name.trim(),
          childBirthDate: form.birthDate,
          childSex: form.sex || null,
        }),
      });
      const result = (await res.json().catch(() => ({}))) as {
        groupId?: string; childId?: string; error?: string; code?: string;
      };
      if (!res.ok || result.error) {
        const message = resolveFetchErrorMessage({
          status: res.status,
          serverMessage: result.error,
          errorCode: result.code,
          fallbackKey: "onboardingForm.errorCreating",
        }, t);
        if (message) dispatch({ type: "FORM_SUBMIT_ERROR", message });
        return;
      }
      const child: WizardChild = {
        id: result.childId || `local-${Date.now()}`,
        fullName: form.name.trim(),
        birthDate: form.birthDate,
        sex: form.sex || null,
      };
      dispatch({ type: "FIRST_CHILD_SUCCESS", groupId: result.groupId || null, child });
    } catch (cause) {
      if (isAbortError(cause)) return;
      const message = resolveFetchErrorMessage({
        cause,
        fallbackKey: "onboardingForm.unexpectedError",
      }, t);
      if (message) dispatch({ type: "FORM_SUBMIT_ERROR", message });
    } finally {
      disposeController(controller);
    }
  }, [groupName, form.name, form.birthDate, form.sex, t]);

  const handleAnotherChildSubmit = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!groupId || !form.name.trim() || !form.birthDate) return;
    dispatch({ type: "FORM_SUBMIT_START" });

    const controller = makeController();
    try {
      const res = await fetch("/api/children", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          groupId,
          fullName: form.name.trim(),
          birthDate: form.birthDate,
          sex: form.sex || null,
        }),
      });
      const result = (await res.json().catch(() => ({}))) as {
        child?: { id: string }; error?: string; code?: string;
      };
      if (!res.ok || result.error) {
        const message = resolveFetchErrorMessage({
          status: res.status,
          serverMessage: result.error,
          errorCode: result.code,
          fallbackKey: "onboardingForm.errorAddingChild",
        }, t);
        if (message) dispatch({ type: "FORM_SUBMIT_ERROR", message });
        return;
      }
      const child: WizardChild = {
        id: result.child?.id || `local-${Date.now()}`,
        fullName: form.name.trim(),
        birthDate: form.birthDate,
        sex: form.sex || null,
      };
      dispatch({ type: "ANOTHER_CHILD_SUCCESS", child });
    } catch (cause) {
      if (isAbortError(cause)) return;
      const message = resolveFetchErrorMessage({
        cause,
        fallbackKey: "onboardingForm.errorAddingChild",
      }, t);
      if (message) dispatch({ type: "FORM_SUBMIT_ERROR", message });
    } finally {
      disposeController(controller);
    }
  }, [groupId, form.name, form.birthDate, form.sex, t]);

  const handleEditChildSubmit = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!groupId || !form.editingChildId || !form.name.trim() || !form.birthDate) return;
    dispatch({ type: "FORM_SUBMIT_START" });

    const controller = makeController();
    try {
      const res = await fetch(`/api/children/${form.editingChildId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          groupId,
          fullName: form.name.trim(),
          birthDate: form.birthDate,
          sex: form.sex || null,
        }),
      });
      const result = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok || result.error) {
        const message = resolveFetchErrorMessage({
          status: res.status,
          serverMessage: result.error,
          errorCode: result.code,
          fallbackKey: "onboardingForm.errorUpdatingChild",
        }, t);
        if (message) dispatch({ type: "FORM_SUBMIT_ERROR", message });
        return;
      }
      const child: WizardChild = {
        id: form.editingChildId,
        fullName: form.name.trim(),
        birthDate: form.birthDate,
        sex: form.sex || null,
      };
      dispatch({ type: "EDIT_CHILD_SUCCESS", child });
    } catch (cause) {
      if (isAbortError(cause)) return;
      const message = resolveFetchErrorMessage({
        cause,
        fallbackKey: "onboardingForm.errorUpdatingChild",
      }, t);
      if (message) dispatch({ type: "FORM_SUBMIT_ERROR", message });
    } finally {
      disposeController(controller);
    }
  }, [groupId, form.editingChildId, form.name, form.birthDate, form.sex, t]);

  /**
   * Delete otimista: remove o card imediatamente; se a API falhar,
   * restaura na posição original + mostra banner de erro no resumo.
   * Snapshot vive em `state.optimisticDelete` (vide reducer).
   */
  const confirmDelete = useCallback(async (childId: string) => {
    if (!groupId) return;
    dispatch({ type: "REMOVE_CHILD_OPTIMISTIC", id: childId });

    const controller = makeController();
    try {
      const res = await fetch(
        `/api/children/${childId}?groupId=${encodeURIComponent(groupId)}`,
        { method: "DELETE", signal: controller.signal },
      );
      const result = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok || result.error) {
        const message = resolveFetchErrorMessage({
          status: res.status,
          serverMessage: result.error,
          errorCode: result.code,
          fallbackKey: "onboardingForm.errorRemovingChild",
        }, t);
        dispatch({
          type: "REMOVE_CHILD_REVERT",
          message: message || t("onboardingForm.errorRemovingChild"),
        });
        return;
      }
      dispatch({ type: "REMOVE_CHILD_CONFIRM" });
    } catch (cause) {
      if (isAbortError(cause)) {
        // O usuário saiu da tela — não vamos restaurar porque não há tela.
        // O servidor pode já ter aceitado o DELETE; a próxima visita ao
        // app reflete o estado correto via fetch normal.
        return;
      }
      const message = resolveFetchErrorMessage({
        cause,
        fallbackKey: "onboardingForm.errorRemovingChild",
      }, t);
      dispatch({
        type: "REMOVE_CHILD_REVERT",
        message: message || t("onboardingForm.errorRemovingChild"),
      });
    } finally {
      disposeController(controller);
    }
  }, [groupId, t]);

  const handleSendInvite = useCallback(async () => {
    if (!groupId || !invite.email.trim() || !invite.email.includes("@")) {
      dispatch({ type: "INVITE_SEND_ERROR", message: t("onboardingForm.invalidEmail") });
      return;
    }
    dispatch({ type: "INVITE_SEND_START" });

    const controller = makeController();
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          groupId,
          email: invite.email.trim().toLowerCase(),
          role: invite.role,
        }),
      });
      const result = (await res.json().catch(() => ({}))) as {
        token?: string; error?: string;
      };
      if (!res.ok || !result.token) {
        const message = resolveFetchErrorMessage({
          status: res.status,
          serverMessage: result.error,
          fallbackKey: "onboardingForm.errorSendingInvite",
        }, t);
        if (message) dispatch({ type: "INVITE_SEND_ERROR", message });
        return;
      }
      dispatch({
        type: "INVITE_SEND_SUCCESS",
        sent: { token: result.token, email: invite.email.trim() },
      });
    } catch (cause) {
      if (isAbortError(cause)) return;
      const message = resolveFetchErrorMessage({
        cause,
        fallbackKey: "onboardingForm.errorSendingInvite",
      }, t);
      if (message) dispatch({ type: "INVITE_SEND_ERROR", message });
    } finally {
      disposeController(controller);
    }
  }, [groupId, invite.email, invite.role, t]);

  const finishOnboarding = useCallback(async () => {
    // 1. Persiste onboarding_step=4 no DB ANTES de navegar. Sem isso, o
    //    /api/create-group deixava step=2 e jobs/quests/dashboards
    //    permaneciam segmentando o user como "onboarding incompleto".
    //    Fire-and-forget: se falhar, navegação prossegue (não-fatal).
    try {
      await markOnboardingFinished();
    } catch {
      // Server action falhou — logamos client-side mas seguimos.
      // Próxima visita ao /dashboard pode rodar idempotente.
    }
    // 2. Libera o beforeunload pra evitar prompt "Leave site?" no reload.
    allowExitRef.current = true;
    // 3. Reload completo evita issues raros com token Supabase + redirect server-side.
    window.location.href = "/dashboard";
  }, []);

  // ────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <ProgressDots activeIndex={progressIndex(step)} totalSteps={TOTAL_STEPS} t={t} />

      {step === "family" && (
        <FamilyStep
          value={groupName}
          onChange={setGroupName}
          onContinue={gotoFirstChild}
          t={t}
        />
      )}

      {step === "first-child" && (
        <ChildForm
          kind="first"
          name={form.name} birth={form.birthDate} sex={form.sex}
          loading={form.loading} error={form.error}
          onName={setFormName} onBirth={setFormBirth} onSex={setFormSex}
          onSubmit={handleFirstChildSubmit}
          onBack={gotoFamily}
          nameRef={nameRef}
          t={t}
        />
      )}

      {step === "add-child" && (
        <ChildForm
          kind="another"
          name={form.name} birth={form.birthDate} sex={form.sex}
          loading={form.loading} error={form.error}
          onName={setFormName} onBirth={setFormBirth} onSex={setFormSex}
          onSubmit={handleAnotherChildSubmit}
          onBack={cancelForm}
          nameRef={nameRef}
          t={t}
        />
      )}

      {step === "edit-child" && (
        <ChildForm
          kind="edit"
          name={form.name} birth={form.birthDate} sex={form.sex}
          loading={form.loading} error={form.error}
          onName={setFormName} onBirth={setFormBirth} onSex={setFormSex}
          onSubmit={handleEditChildSubmit}
          onBack={cancelForm}
          nameRef={nameRef}
          t={t}
        />
      )}

      {step === "family-summary" && (
        <FamilySummary
          groupName={groupName}
          kids={kids}
          headingRef={summaryHeadingRef}
          summaryError={summaryError}
          onDismissSummaryError={dismissSummaryError}
          onAddAnother={startAddChild}
          onEdit={startEditChild}
          pendingDeleteId={pendingDeleteId}
          onRequestDelete={requestDelete}
          onConfirmDelete={confirmDelete}
          onCancelDelete={cancelDelete}
          inviteEmail={invite.email}
          inviteRole={invite.role}
          inviteSending={invite.sending}
          inviteError={invite.error}
          inviteSent={invite.sent}
          onInviteEmail={setInviteEmail}
          onInviteRole={setInviteRole}
          onSendInvite={handleSendInvite}
          onSendAnother={sendAnother}
          onFinish={finishOnboarding}
          t={t}
        />
      )}
    </div>
  );
}
