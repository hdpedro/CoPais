/**
 * LockScreen — UI exibida enquanto isLocked=true.
 *
 * Padrao WhatsApp: tela neutra com logo + botao "Desbloquear".
 * NAO mostra nenhum dado da app. Auto-dispara Face ID na primeira
 * montagem (e quando volta do background).
 *
 * Se o user cancelar o prompt nativo, fica na tela com botao pra
 * tentar de novo. Se a biometria falhar 3x, iOS oferece passcode
 * automaticamente (disableDeviceFallback=false no service).
 *
 * Se o device nao tem biometria cadastrada (isEnrolled=false), o
 * lock nunca deveria estar ativo — mas como fallback, mostra mensagem
 * pedindo cadastro nas configs do iOS. O toggle em perfil/seguranca
 * impede ligar lock sem biometria cadastrada.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useLock } from '../store/lock';
import { getBiometricCapability, type BiometricCapability } from '../services/biometric-lock';
import { colors, spacing, radius, font } from '../design-system/tokens';

export default function LockScreen() {
  // O store e a fonte unica do estado de autenticacao: garante re-entrancia
  // safe (chamadas concorrentes viram no-op) e sobrevive a remount do
  // componente, que pode acontecer se isLocked oscilar.
  const requestUnlock = useLock(s => s.requestUnlock);
  const authenticating = useLock(s => s.isAuthenticating);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [capability, setCapability] = useState<BiometricCapability | null>(null);
  const insets = useSafeAreaInsets();
  // Em sucesso, a transicao isLocked=true→false desmonta este componente.
  // Qualquer setState depois de um await que rode pos-desmonte e dead code.
  // Guard explicito > dependerm do React 18 engolir silenciosamente.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const tryUnlock = useCallback(async () => {
    if (!mountedRef.current) return;
    // Guard reforçado em 2026-05-17: se já tem um prompt em voo (flag do
    // store), nem chama requestUnlock — o store retornaria 'in_flight' mas
    // assim evitamos até o overhead do call. Defesa contra cenários onde
    // AppState piscadas (PostHog SDK, push register listener) podem
    // disparar re-render do LockScreen com remount do useEffect.
    if (useLock.getState().isAuthenticating) return;
    setErrorMsg(null);

    const cap = capability ?? await getBiometricCapability();
    if (!mountedRef.current) return;
    if (!capability) setCapability(cap);

    if (!cap.hasHardware) {
      setErrorMsg('Este dispositivo nao suporta biometria.');
      return;
    }
    if (!cap.isEnrolled) {
      setErrorMsg(`Cadastre ${cap.label} nos Ajustes do dispositivo para desbloquear.`);
      return;
    }

    const result = await requestUnlock('Desbloquear Kindar');
    if (!mountedRef.current) return;

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return;
    }
    // in_flight = ja tem outro prompt rodando (re-entrancia bloqueada pelo store)
    // user_cancel = user clicou Cancelar no prompt — sem mensagem invasiva
    // user_fallback = user pediu passcode (mas disableDeviceFallback=false ja resolve)
    // lockout = biometria bloqueada por muitas tentativas
    if (result.error === 'in_flight' || result.error === 'user_cancel' || result.error === 'cancel') {
      return;
    }
    if (result.error === 'lockout' || result.error?.includes('lock')) {
      setErrorMsg('Biometria bloqueada. Use a senha do dispositivo.');
    } else if (result.error) {
      setErrorMsg('Tente novamente.');
    }
  }, [capability, requestUnlock]);

  useEffect(() => {
    // Auto-trigger no primeiro render. Pequeno delay pra UI aparecer
    // antes do prompt (UX mais suave que prompt instantaneo).
    const t = setTimeout(() => { tryUnlock(); }, 250);
    return () => clearTimeout(t);
    // Dependencia intencionalmente vazia: auto-trigger e *uma vez por
    // montagem*. Re-disparo acontece via remount (isLocked oscilando) ou
    // toque manual no CTA.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const iconName: 'scan-circle-outline' | 'finger-print-outline' =
    capability?.kind === 'faceId' ? 'scan-circle-outline' : 'finger-print-outline';
  const ctaLabel = capability?.kind === 'faceId'
    ? 'Desbloquear com Face ID'
    : capability?.kind === 'touchId'
    ? 'Desbloquear com Touch ID'
    : 'Desbloquear';

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing['2xl'] }]}>
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoWrap}>
          <View style={styles.logoBox}>
            <Text style={styles.logoEmoji}>🏠</Text>
          </View>
          <Text style={styles.brand}>Kindar</Text>
          <Text style={styles.tagline}>Bloqueado para sua privacidade</Text>
        </View>

        {/* Status / erro */}
        {errorMsg ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}
      </View>

      {/* CTA fixo no rodape */}
      <View style={styles.ctaWrap}>
        <TouchableOpacity
          accessibilityLabel={ctaLabel}
          testID="lock-screen-unlock"
          onPress={tryUnlock}
          disabled={authenticating}
          style={[styles.cta, authenticating && styles.ctaDisabled]}
          activeOpacity={0.85}
        >
          {authenticating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name={iconName} size={22} color="#fff" />
              <Text style={styles.ctaText}>{ctaLabel}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: {
    alignItems: 'center',
  },
  logoBox: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: colors.brandLight,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  logoEmoji: {
    fontSize: 44,
  },
  brand: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: font.sizes.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  errorBox: {
    marginTop: spacing['2xl'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(229,57,53,0.08)',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    maxWidth: 320,
  },
  errorText: {
    fontSize: font.sizes.sm,
    color: colors.error,
    flexShrink: 1,
  },
  ctaWrap: {
    width: '100%',
  },
  cta: {
    backgroundColor: colors.brand,
    borderRadius: radius.full,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 52,
  },
  ctaDisabled: {
    opacity: 0.7,
  },
  ctaText: {
    color: '#fff',
    fontSize: font.sizes.md,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
