/**
 * Onboarding wizard — Kindar Native.
 *
 * Orquestrador enxuto: combina reducer (`_lib/wizard-state.ts`), helpers
 * de formatação (`_lib/format.ts`), classificador de erros
 * (`_lib/errors.ts`) e sub-componentes memoizados (`_components/*`).
 *
 * Sub-etapas: family → first-child → family-summary com loop
 * add-child/edit-child + remove otimista + convite inline.
 *
 * Paridade PWA: `src/app/(app)/onboarding/OnboardingForm.tsx` segue o
 * mesmo desenho. Veja `_components/README.md` pra arquitetura completa.
 */
import {
  useCallback, useEffect, useReducer, useRef,
} from 'react';
import {
  AccessibilityInfo, ActivityIndicator, Alert, BackHandler,
  KeyboardAvoidingView, Platform, ScrollView, Share, Text, View, TextInput,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from 'src/lib/supabase';
import { useAuth } from 'src/store/auth';
import { markQuestStep } from 'src/services/quest';
import { useI18n } from 'src/i18n';
import { colors, font, spacing } from 'src/design-system/tokens';

import { ChildForm } from './_components/ChildForm';
import { FamilyStep } from './_components/FamilyStep';
import { FamilySummary } from './_components/FamilySummary';
import { ProgressDots } from './_components/ProgressDots';
import { isAbortError, resolveFetchErrorMessage } from './_lib/errors';
import {
  applyBirthDateMask, brFromIso, isoFromBR, withTimeout,
} from './_lib/format';
import type { ChildSex, InviteRole, WizardChild } from './_lib/types';
import {
  initialWizardState, progressIndex, wizardReducer,
} from './_lib/wizard-state';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';
const TOTAL_STEPS = 3;
const AUTO_ACCEPT_TIMEOUT_MS = 3000;

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const t = useI18n((s) => s.t);

  const [state, dispatch] = useReducer(wizardReducer, initialWizardState);
  const { step, groupId, groupName, kids, form, invite } = state;

  const nameRef = useRef<TextInput>(null);
  /**
   * Pool de AbortControllers em-flight. Cleanup no unmount aborta tudo
   * pra evitar dispatch em componente desmontado.
   */
  const controllersRef = useRef<Set<AbortController>>(new Set());

  useEffect(() => {
    const controllers = controllersRef.current;
    return () => {
      controllers.forEach((c) => c.abort());
      controllers.clear();
    };
  }, []);

  function makeController(): AbortController {
    const c = new AbortController();
    controllersRef.current.add(c);
    return c;
  }
  function disposeController(c: AbortController) {
    controllersRef.current.delete(c);
  }

  // Auto-aceita convites pendentes antes de mostrar o form (timeout 3s).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const controller = makeController();
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          if (!cancelled) dispatch({ type: 'GOTO_FAMILY' });
          return;
        }
        const resp = await withTimeout(
          fetch(`${WEB_URL}/api/onboarding/auto-accept-invitation`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${session.access_token}` },
            signal: controller.signal,
          }),
          AUTO_ACCEPT_TIMEOUT_MS,
        );
        if (resp.ok) {
          const data = await resp.json();
          if (data.accepted) {
            if (!cancelled) {
              await useAuth.getState().loadActiveGroup();
              router.replace('/(tabs)');
              return;
            }
          }
        }
      } catch {
        // Inclui timeout/abort — fall-through silencioso pro form manual.
      } finally {
        disposeController(controller);
      }
      if (!cancelled) dispatch({ type: 'GOTO_FAMILY' });
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Botão voltar do Android — comportamento contextual.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 'add-child' || step === 'edit-child') {
        dispatch({ type: 'CANCEL_FORM' });
        return true;
      }
      if (step === 'family-summary') {
        Alert.alert(
          t('onboardingForm.exitConfirmTitle'),
          t('onboardingForm.exitConfirmMessage'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('onboardingForm.exitConfirmAction'),
              style: 'destructive',
              onPress: () => router.replace('/(tabs)'),
            },
          ],
        );
        return true;
      }
      if (step === 'first-child') {
        dispatch({ type: 'GOTO_FAMILY' });
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [step, t]);

  // Anuncia transições importantes pra screen reader (TalkBack/VoiceOver).
  useEffect(() => {
    if (step === 'family-summary') {
      const count = state.kids.length;
      const countMsg =
        count === 0 ? t('onboardingForm.familyReady') :
        count === 1 ? t('onboardingForm.familyHasOne') :
        t('onboardingForm.familyHasMany', { count });
      AccessibilityInfo.announceForAccessibility(
        `${groupName || t('onboardingForm.familyCreated')}. ${countMsg}`,
      );
    }
  }, [step, groupName, state.kids.length, t]);

  // ────────────────────────────────────────────────────────────────────
  // Handlers — memoizados pra estabilizar identidade dos props.
  // ────────────────────────────────────────────────────────────────────

  const setGroupName = useCallback((value: string) => {
    dispatch({ type: 'SET_GROUP_NAME', value });
  }, []);

  const gotoFirstChild = useCallback(() => {
    if (!groupName.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dispatch({ type: 'GOTO_FIRST_CHILD' });
  }, [groupName]);

  const gotoFamily = useCallback(() => dispatch({ type: 'GOTO_FAMILY' }), []);

  const cancelForm = useCallback(() => dispatch({ type: 'CANCEL_FORM' }), []);

  const setFormName = useCallback((value: string) => {
    dispatch({ type: 'FORM_NAME', value });
  }, []);

  /**
   * Mantém display BR (DD/MM/AAAA) no input + ISO normalizado no estado.
   * Só "compromete" o ISO quando os 8 dígitos formam data válida.
   */
  const setFormBirth = useCallback((display: string) => {
    const formatted = applyBirthDateMask(display);
    const iso = isoFromBR(formatted) || '';
    dispatch({ type: 'FORM_BIRTH', iso, display: formatted });
  }, []);

  const setFormSex = useCallback((value: ChildSex | '') => {
    dispatch({ type: 'FORM_SEX', value });
  }, []);

  const focusName = useCallback(() => {
    setTimeout(() => nameRef.current?.focus(), 200);
  }, []);

  const startAddChild = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dispatch({ type: 'ENTER_ADD_CHILD' });
    focusName();
  }, [focusName]);

  const startEditChild = useCallback((childId: string) => {
    const child = state.kids.find((k) => k.id === childId);
    if (!child) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dispatch({
      type: 'ENTER_EDIT_CHILD',
      child,
      birthDateInput: brFromIso(child.birthDate),
    });
    focusName();
  }, [focusName, state.kids]);

  // ────────────────────────────────────────────────────────────────────
  // Submits — START → SUCCESS/ERROR com AbortController + erros contextuais.
  // ────────────────────────────────────────────────────────────────────

  const saveFirstChild = useCallback(async () => {
    if (!userId || !groupName.trim() || !form.name.trim() || !form.birthDate) return;
    dispatch({ type: 'FORM_SUBMIT_START' });

    const controller = makeController();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error(t('common.sessionExpired'));

      const resp = await fetch(`${WEB_URL}/api/create-group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        signal: controller.signal,
        body: JSON.stringify({
          name: groupName.trim(),
          childName: form.name.trim(),
          childBirthDate: form.birthDate,
          childSex: form.sex || null,
        }),
      });
      const body = await resp.json().catch(() => ({} as { groupId?: string; childId?: string; error?: string }));
      if (!resp.ok) {
        const message = resolveFetchErrorMessage({
          status: resp.status,
          serverMessage: body.error,
          fallbackKey: 'onboardingForm.errorCreating',
        }, t);
        if (message) dispatch({ type: 'FORM_SUBMIT_ERROR', message });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      await useAuth.getState().loadActiveGroup();
      const active = useAuth.getState().activeGroup;
      const newGroupId = body.groupId || active?.groupId || null;
      const child: WizardChild = {
        id: body.childId || `local-${Date.now()}`,
        fullName: form.name.trim(),
        birthDate: form.birthDate,
        sex: form.sex || null,
      };

      markQuestStep('add_child', { via: 'onboarding_wizard' });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      dispatch({ type: 'FIRST_CHILD_SUCCESS', groupId: newGroupId, child });
    } catch (cause) {
      if (isAbortError(cause)) return;
      const message = resolveFetchErrorMessage({
        cause,
        fallbackKey: 'onboardingForm.errorCreating',
      }, t);
      if (message) dispatch({ type: 'FORM_SUBMIT_ERROR', message });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      disposeController(controller);
    }
  }, [form.birthDate, form.name, form.sex, groupName, t, userId]);

  const saveAnotherChild = useCallback(async () => {
    if (!userId || !groupId || !form.name.trim() || !form.birthDate) return;
    dispatch({ type: 'FORM_SUBMIT_START' });

    const controller = makeController();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error(t('common.sessionExpired'));

      const resp = await fetch(`${WEB_URL}/api/children`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        signal: controller.signal,
        body: JSON.stringify({
          groupId,
          fullName: form.name.trim(),
          birthDate: form.birthDate,
          sex: form.sex || null,
        }),
      });
      const body = await resp.json().catch(() => ({} as { child?: { id: string }; error?: string }));
      if (!resp.ok) {
        const message = resolveFetchErrorMessage({
          status: resp.status,
          serverMessage: body.error,
          fallbackKey: 'onboardingForm.errorAddingChild',
        }, t);
        if (message) dispatch({ type: 'FORM_SUBMIT_ERROR', message });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      const child: WizardChild = {
        id: body.child?.id || `local-${Date.now()}`,
        fullName: form.name.trim(),
        birthDate: form.birthDate,
        sex: form.sex || null,
      };
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      dispatch({ type: 'ANOTHER_CHILD_SUCCESS', child });
    } catch (cause) {
      if (isAbortError(cause)) return;
      const message = resolveFetchErrorMessage({
        cause,
        fallbackKey: 'onboardingForm.errorAddingChild',
      }, t);
      if (message) dispatch({ type: 'FORM_SUBMIT_ERROR', message });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      disposeController(controller);
    }
  }, [form.birthDate, form.name, form.sex, groupId, t, userId]);

  const saveEditChild = useCallback(async () => {
    if (!userId || !groupId || !form.editingChildId || !form.name.trim() || !form.birthDate) return;
    dispatch({ type: 'FORM_SUBMIT_START' });

    const controller = makeController();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error(t('common.sessionExpired'));

      const resp = await fetch(`${WEB_URL}/api/children/${form.editingChildId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        signal: controller.signal,
        body: JSON.stringify({
          groupId,
          fullName: form.name.trim(),
          birthDate: form.birthDate,
          sex: form.sex || null,
        }),
      });
      const body = await resp.json().catch(() => ({} as { error?: string }));
      if (!resp.ok) {
        const message = resolveFetchErrorMessage({
          status: resp.status,
          serverMessage: body.error,
          fallbackKey: 'onboardingForm.errorUpdatingChild',
        }, t);
        if (message) dispatch({ type: 'FORM_SUBMIT_ERROR', message });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      const child: WizardChild = {
        id: form.editingChildId,
        fullName: form.name.trim(),
        birthDate: form.birthDate,
        sex: form.sex || null,
      };
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      dispatch({ type: 'EDIT_CHILD_SUCCESS', child });
    } catch (cause) {
      if (isAbortError(cause)) return;
      const message = resolveFetchErrorMessage({
        cause,
        fallbackKey: 'onboardingForm.errorUpdatingChild',
      }, t);
      if (message) dispatch({ type: 'FORM_SUBMIT_ERROR', message });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      disposeController(controller);
    }
  }, [form.birthDate, form.editingChildId, form.name, form.sex, groupId, t, userId]);

  /**
   * Optimistic delete — remove o card imediatamente; em falha, restaura
   * via REVERT + Alert pra o usuário. Snapshot vive em state.optimisticDelete.
   */
  const removeChild = useCallback((childId: string) => {
    const child = state.kids.find((k) => k.id === childId);
    if (!child) return;

    Alert.alert(
      t('onboardingForm.removeChildConfirmTitle'),
      t('onboardingForm.removeChildConfirmMessage', { name: child.fullName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('onboardingForm.removeChild'),
          style: 'destructive',
          onPress: async () => {
            if (!groupId) return;
            dispatch({ type: 'REMOVE_CHILD_OPTIMISTIC', id: childId });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

            const controller = makeController();
            try {
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) throw new Error(t('common.sessionExpired'));

              const resp = await fetch(
                `${WEB_URL}/api/children/${childId}?groupId=${encodeURIComponent(groupId)}`,
                {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${session.access_token}` },
                  signal: controller.signal,
                },
              );
              if (!resp.ok) {
                const body = await resp.json().catch(() => ({} as { error?: string }));
                const message = resolveFetchErrorMessage({
                  status: resp.status,
                  serverMessage: body.error,
                  fallbackKey: 'onboardingForm.errorRemovingChild',
                }, t) || t('onboardingForm.errorRemovingChild');
                dispatch({ type: 'REMOVE_CHILD_REVERT' });
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                Alert.alert(t('common.error'), message);
                return;
              }
              dispatch({ type: 'REMOVE_CHILD_CONFIRM' });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (cause) {
              if (isAbortError(cause)) return;
              const message = resolveFetchErrorMessage({
                cause,
                fallbackKey: 'onboardingForm.errorRemovingChild',
              }, t) || t('onboardingForm.errorRemovingChild');
              dispatch({ type: 'REMOVE_CHILD_REVERT' });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert(t('common.error'), message);
            } finally {
              disposeController(controller);
            }
          },
        },
      ],
    );
  }, [groupId, state.kids, t]);

  const setInviteEmail = useCallback((value: string) => {
    dispatch({ type: 'INVITE_EMAIL', value });
  }, []);

  const setInviteRole = useCallback((value: InviteRole) => {
    dispatch({ type: 'INVITE_ROLE', value });
  }, []);

  const sendAnotherInvite = useCallback(() => {
    dispatch({ type: 'INVITE_SEND_ANOTHER' });
  }, []);

  const sendInvite = useCallback(async () => {
    if (!groupId || !invite.email.trim() || !invite.email.includes('@')) {
      dispatch({ type: 'INVITE_SEND_ERROR', message: t('onboardingForm.invalidEmail') });
      return;
    }
    dispatch({ type: 'INVITE_SEND_START' });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const controller = makeController();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error(t('common.sessionExpired'));

      const resp = await fetch(`${WEB_URL}/api/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        signal: controller.signal,
        body: JSON.stringify({
          groupId,
          email: invite.email.trim().toLowerCase(),
          role: invite.role,
        }),
      });
      const body = await resp.json().catch(() => ({} as { token?: string; error?: string }));
      if (!resp.ok || !body.token) {
        const message = resolveFetchErrorMessage({
          status: resp.status,
          serverMessage: body.error,
          fallbackKey: 'onboardingForm.errorSendingInvite',
        }, t);
        if (message) dispatch({ type: 'INVITE_SEND_ERROR', message });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      dispatch({
        type: 'INVITE_SEND_SUCCESS',
        sent: { token: body.token, email: invite.email.trim() },
      });
    } catch (cause) {
      if (isAbortError(cause)) return;
      const message = resolveFetchErrorMessage({
        cause,
        fallbackKey: 'onboardingForm.errorSendingInvite',
      }, t);
      if (message) dispatch({ type: 'INVITE_SEND_ERROR', message });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      disposeController(controller);
    }
  }, [groupId, invite.email, invite.role, t]);

  const shareInviteLink = useCallback(async () => {
    if (!invite.sent) return;
    const link = `${WEB_URL}/convite/${invite.sent.token}`;
    const firstName = useAuth.getState().profile?.full_name?.split(' ')[0] || 'Kindar';
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Share.share({
        message: t('onboardingForm.shareMessage', {
          firstName,
          groupName: groupName || 'Kindar',
          link,
        }),
        url: link,
      });
    } catch (e) {
      // AbortError = usuário cancelou — não é erro real.
      if (!isAbortError(e)) {
        console.warn('[onboarding] share failed:', e instanceof Error ? e.message : e);
      }
    }
  }, [invite.sent, groupName, t]);

  const finishOnboarding = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/(tabs)');
  }, []);

  // ────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────

  if (step === 'checking') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.brand} />
        <Text style={{ marginTop: spacing.md, fontSize: font.sizes.sm, color: colors.textSecondary }}>
          {t('onboardingForm.checkingInvitations')}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + spacing['3xl'],
          paddingHorizontal: spacing.xl,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <ProgressDots activeIndex={progressIndex(step)} totalSteps={TOTAL_STEPS} t={t} />

        {step === 'family' && (
          <FamilyStep
            groupName={groupName}
            onChange={setGroupName}
            onContinue={gotoFirstChild}
            t={t}
          />
        )}

        {step === 'first-child' && (
          <ChildForm
            kind="first"
            childName={form.name}
            childBirthDate={form.birthDateInput}
            childSex={form.sex}
            error={form.error}
            saving={form.loading}
            onName={setFormName}
            onBirth={setFormBirth}
            onSex={setFormSex}
            onSave={saveFirstChild}
            onBack={gotoFamily}
            nameRef={nameRef}
            t={t}
          />
        )}

        {step === 'add-child' && (
          <ChildForm
            kind="another"
            childName={form.name}
            childBirthDate={form.birthDateInput}
            childSex={form.sex}
            error={form.error}
            saving={form.loading}
            onName={setFormName}
            onBirth={setFormBirth}
            onSex={setFormSex}
            onSave={saveAnotherChild}
            onBack={cancelForm}
            nameRef={nameRef}
            t={t}
          />
        )}

        {step === 'edit-child' && (
          <ChildForm
            kind="edit"
            childName={form.name}
            childBirthDate={form.birthDateInput}
            childSex={form.sex}
            error={form.error}
            saving={form.loading}
            onName={setFormName}
            onBirth={setFormBirth}
            onSex={setFormSex}
            onSave={saveEditChild}
            onBack={cancelForm}
            nameRef={nameRef}
            t={t}
          />
        )}

        {step === 'family-summary' && (
          <FamilySummary
            groupName={groupName}
            kids={kids}
            onAddAnother={startAddChild}
            onEdit={startEditChild}
            onRemove={removeChild}
            inviteEmail={invite.email}
            inviteRole={invite.role}
            inviteSending={invite.sending}
            inviteError={invite.error}
            inviteSent={invite.sent}
            onInviteEmail={setInviteEmail}
            onInviteRole={setInviteRole}
            onSendInvite={sendInvite}
            onShareLink={shareInviteLink}
            onSendAnother={sendAnotherInvite}
            onFinish={finishOnboarding}
            t={t}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
