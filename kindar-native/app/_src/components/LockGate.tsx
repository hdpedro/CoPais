/**
 * LockGate — wrapper que mostra LockScreen quando isLocked=true e tambem
 * uma "Privacy Cover" enquanto o app esta inactive/background.
 *
 * Responsabilidades:
 * 1. Hidratar preferencias do SecureStore no mount (cold start).
 *    Se enabled=true, isLocked ja vem true do hydrate.
 * 2. AppState listener:
 *    - 'background': marca timestamp (pra calculo de timeout depois).
 *    - 'inactive'/'background': mostra cover branca em cima da UI
 *      enquanto o iOS tira screenshot pro app switcher. Padrao WhatsApp:
 *      no task switcher voce nao ve conteudo, ve so o logo.
 *    - 'active': se elapsed >= timeout configurado, marca isLocked=true
 *      e o LockScreen toma conta.
 * 3. Padrao "fullscreen lock":
 *    - isAuthenticated=false → libera (telas de login/onboarding).
 *    - enabled=false → libera (lock desligado nos ajustes).
 *    - isLocked=true → mostra LockScreen.
 *    - state !== 'active' AND enabled → mostra PrivacyCover (logo).
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus, View, Text, StyleSheet } from 'react-native';
import { useLock } from '../store/lock';
import { useAuth } from '../store/auth';
import LockScreen from './LockScreen';
import { colors } from '../design-system/tokens';
import { logLockTelemetry } from '../lib/lock-telemetry';

// Filtragem de alto volume centralizada em lock-telemetry.ts.
const logLockGateEvent = (event: string, extra?: Record<string, unknown>): void =>
  logLockTelemetry('lockgate', event, extra);

interface Props {
  children: ReactNode;
}

export default function LockGate({ children }: Props) {
  const { hydrated, hydrate, enabled, isLocked, isAuthenticating, markBackground, evaluateOnForeground } = useLock();
  const isAuthenticated = useAuth(s => s.isAuthenticated);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const lastStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Hidrata preferencias persistidas (uma vez por sessao).
  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  // AppState listener — fonte unica de verdade pra background/foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = lastStateRef.current;
      const snapshot = useLock.getState();
      logLockGateEvent('appstate.change', {
        prev,
        next,
        isLocked: snapshot.isLocked,
        isAuthenticating: snapshot.isAuthenticating,
        postUnlockGrace: snapshot.postUnlockGrace,
        lastUnlockAt: snapshot.lastUnlockAt,
        lastBackgroundAt: snapshot.lastBackgroundAt,
      });
      if (next === 'background') {
        // Registra quando saiu pro calculo de elapsed na proxima volta.
        // NAO trava aqui — o calculo de isLocked acontece quando volta.
        markBackground();
      } else if (next === 'active' && prev !== 'active') {
        // Volta do background ou inactive → avalia timeout.
        evaluateOnForeground();
      }
      lastStateRef.current = next;
      setAppState(next);
    });
    return () => sub.remove();
  }, [markBackground, evaluateOnForeground]);

  // Nao bloqueia tela de auth — sem usuario logado nao tem o que proteger.
  if (!isAuthenticated || !hydrated || !enabled) return <>{children}</>;

  // IMPORTANTE: sempre renderizamos children por baixo pra preservar nav
  // state do Expo Router (Stack, tabs, modals abertos). LockScreen e
  // PrivacyCover ficam por cima via absoluteFill — quando o user destrava,
  // some o overlay e ele volta exatamente pra tela onde estava.
  // Padrao usado por WhatsApp e apps bancarios serios.
  //
  // O cover SO aparece em backgrounding genuino. Durante o prompt biometrico
  // o iOS pisca o AppState pra inactive/background; renderizar o cover
  // nessa janela causa flicker visivel apos sucesso (transicao isLocked
  // true→false acontece *antes* do AppState voltar pra 'active'). Suprimir
  // via isAuthenticating elimina a janela.
  const showCover = !isLocked && !isAuthenticating && appState !== 'active';
  return (
    <View style={{ flex: 1 }}>
      {children}
      {isLocked ? (
        <View style={StyleSheet.absoluteFill}>
          <LockScreen />
        </View>
      ) : showCover ? (
        <View style={[StyleSheet.absoluteFill, styles.cover]}>
          <View style={styles.logoBox}><Text style={styles.logoEmoji}>🏠</Text></View>
          <Text style={styles.brand}>Kindar</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginBottom: 16,
  },
  logoEmoji: { fontSize: 44 },
  brand: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
});
