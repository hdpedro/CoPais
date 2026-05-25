/**
 * push-soft-prompt.ts — Gerencia o "soft prompt" pré-permission iOS.
 *
 * RACIONAL: iOS `Notifications.requestPermissionsAsync()` é hard prompt
 * irrevogável — se user nega, NUNCA mais pede de novo até user ir em
 * Settings → Notifications → Kindar → Allow. Industry pattern: mostrar
 * modal explicativo ANTES, com botão "Sim, ativar" → só aí chama o nativo.
 *
 * Benchmark: apps que fazem soft prompt têm 60-70% opt-in. Apps que vão
 * direto pro hard prompt: 30-40%. Diferença = retenção.
 *
 * Estado tracking:
 *   - iOS-level permission (granted/denied/undetermined) → fonte de verdade
 *   - SecureStore flag `push_soft_prompt_shown` → "já mostramos uma vez"
 *
 * Decisão flow:
 *   1. iOS granted → registrado, no-op
 *   2. iOS denied → user disse não no nativo. Pode reabrir só via Settings.
 *      Não mostramos modal de novo.
 *   3. iOS undetermined + soft NÃO mostrado → mostrar modal
 *   4. iOS undetermined + soft JÁ mostrado → respeitar decisão prévia
 *      (user pode reativar via /perfil/notificacoes)
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

const SOFT_PROMPT_KEY = 'kindar_push_soft_prompt_shown';

export type SoftPromptDecision = 'show_modal' | 'already_granted' | 'permanently_denied' | 'previously_dismissed' | 'not_applicable';

/**
 * Decide se devemos mostrar o soft prompt agora.
 * Cheap — pode chamar a cada montagem de tela autenticada.
 */
export async function checkSoftPromptStatus(): Promise<SoftPromptDecision> {
  // Web/simulador não tem push real
  if (Platform.OS === 'web') return 'not_applicable';

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return 'already_granted';
    if (status === 'denied') return 'permanently_denied';

    // status === 'undetermined' — verifica flag local
    const shown = await SecureStore.getItemAsync(SOFT_PROMPT_KEY);
    if (shown === '1') return 'previously_dismissed';
    return 'show_modal';
  } catch {
    return 'not_applicable';
  }
}

/**
 * Marca o soft prompt como mostrado. Idempotente — pode chamar várias vezes.
 */
export async function markSoftPromptShown(): Promise<void> {
  try {
    await SecureStore.setItemAsync(SOFT_PROMPT_KEY, '1');
  } catch {
    // Não-fatal — pior caso, modal aparece mais uma vez
  }
}

/**
 * Limpa o flag (pra testes ou se user reabriu via /perfil/notificacoes).
 */
export async function resetSoftPromptFlag(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SOFT_PROMPT_KEY);
  } catch {
    // Não-fatal
  }
}

/**
 * Triggers the iOS hard prompt — SÓ chamado depois do user clicar "Sim"
 * no soft prompt. Retorna o status final.
 */
export async function requestPushPermissionNative(): Promise<'granted' | 'denied' | 'undetermined'> {
  if (Platform.OS === 'web') return 'undetermined';
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status as 'granted' | 'denied' | 'undetermined';
  } catch {
    return 'undetermined';
  }
}
