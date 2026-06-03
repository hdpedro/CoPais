/* eslint-disable react-hooks/immutability -- Reanimated SharedValue.value
   é mutável por design (essa é a API da lib). React Compiler trata todo
   retorno de hook como imutável, mas isso é um falso positivo aqui. */
import { useEffect, useRef, useState } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  View,
  Linking,
  AppState,
  AccessibilityInfo,
  StyleSheet,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  Easing,
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  withDelay,
  cancelAnimation,
  type SharedValue,
} from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Canvas,
  Circle as SkiaCircle,
  Group,
  BlurMask,
  Image as SkiaImage,
  useImage,
} from '@shopify/react-native-skia';
import * as Updates from 'expo-updates';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from 'src/store/auth';
import { useI18n } from 'src/i18n';
import { setupOffline } from 'src/services/offline';
import { installGlobalErrorHandlers, reportError } from 'src/lib/error-reporter';
import ErrorBoundary from 'src/components/ui/ErrorBoundary';
import {
  setupNotificationHandler,
  registerForPushNotificationsAsync,
  addNotificationResponseListener,
  registerNotificationChannels,
  registerNotificationCategories,
} from 'src/services/push-setup';
import {
  checkSoftPromptStatus,
  markSoftPromptShown,
} from 'src/services/push-soft-prompt';
import SoftPromptModal from 'src/components/push/SoftPromptModal';
import { initializeIAP, identifyUser, resetUser } from 'src/services/iap';
import * as analytics from 'src/lib/analytics';
import { colors } from 'src/design-system/tokens';
// AIFab removed 2026-05-05 — was overlapping buttons on other screens.
import AIAssistantSheet from 'src/components/ai/AIAssistantSheet';
import LockGate from 'src/components/LockGate';
import BillingGate from 'src/components/BillingGate';
import AnalyticsTree from 'src/components/AnalyticsTree';
import { ToastProvider, useToast } from 'src/components/ui/ToastProvider';
import OfflineBanner from 'src/components/ui/OfflineBanner';
// Asset estático do splash — ES import (regra eslint no-require-imports).
// Mesmo PNG que o native splash do Expo usa, garantindo continuidade visual.
import splashLogo from '../assets/splash-icon.png';

export default function RootLayout() {
  const { isLoading, initialize, userId } = useAuth();
  // OTA gating: enquanto `updateChecked=false`, mantemos splash visível.
  // Garante que o user NÃO vê o app no bundle antigo se um OTA está chegando
  // — splash fica → check → fetch → reload (mata JS) → app inicia no bundle
  // NOVO. Sem flicker visível de "app antigo aparece, depois recarrega".
  //
  // Em dev (Updates.isEnabled=false) inicializamos com true pra não bloquear.
  const [updateChecked, setUpdateChecked] = useState(!Updates.isEnabled);
  // OTA "post-reload toast": flag setada antes de Updates.reloadAsync() é lida
  // depois do reload pra mostrar "App atualizado" — converte o que user percebia
  // como "fechou sozinho" (bug Carolina 2026-05-20) em "ah, foi atualização".
  const [showOtaToast, setShowOtaToast] = useState(false);

  // One-time setup: error handlers FIRST (so any crash in the rest of the
  // bootstrap is captured) + offline sync + push handler + RevenueCat + i18n
  useEffect(() => {
    installGlobalErrorHandlers();
    initialize();
    // Hydrate persisted locale before any screen renders translated strings.
    useI18n.getState().hydrate();
    const cleanup = setupOffline();
    setupNotificationHandler();
    // Channels Android dedicados (lembrete de atividade com som distinto +
    // importance MAX). Idempotente; falha não é fatal. iOS no-op.
    registerNotificationChannels().catch(() => {});
    // RevenueCat pode inicializar antes do login (anon user); quando userId
    // aparecer, o effect abaixo chama identifyUser() pra fazer o link.
    initializeIAP().catch(() => {});
    // Analytics: bootstrap antes do primeiro evento. $app_opened de ciclo
    // de vida cobre DAU/MAU sem instrumentar tela. identify acontece no
    // effect [userId] abaixo, mesmo padrão do RevenueCat.
    analytics.initAnalytics();

    // OTA "premium" (atualizado 2026-05-19): com checkAutomatically=ON_LOAD
    // o expo-updates baixa o bundle novo em background e o `Updates.reload-
    // Async()` aplica imediatamente. PORÉM, sem gating o user via o app
    // brevemente no bundle antigo antes do reload disparar (flicker de
    // ~500ms-2s). Solução: bloquear `isLoading→false` até OTA check
    // terminar — splash continua visível durante checkForUpdateAsync +
    // fetchUpdateAsync + reloadAsync. Quando reload mata o JS engine, o
    // app reinicia já no bundle novo, e o splash some quando o novo bundle
    // termina de hidratar. User vê: 1 splash → app correto. Sem flicker.
    //
    // Failsafe: timeout 4s pra cobrir rede travada — se passar disso sem
    // resposta do server EAS, libera mesmo no bundle antigo (network grace-
    // ful degradation). Sem timeout, app travaria no splash pra users
    // offline ou com EAS Updates fora do ar.
    if (Updates.isEnabled) {
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        setUpdateChecked(true);
      };
      const failsafe = setTimeout(release, 4000);
      (async () => {
        try {
          // Lê flag de reload prévio. Se TRUE, esse boot é após um reload
          // OTA — mostra toast e limpa a flag. Bug Carolina 2026-05-20:
          // sem feedback, user achava que app "fechou sozinho".
          try {
            const flag = await AsyncStorage.getItem('kindar.ota_reload_pending');
            if (flag === '1') {
              setShowOtaToast(true);
              await AsyncStorage.removeItem('kindar.ota_reload_pending');
            }
          } catch { /* AsyncStorage indisponível — toast cosmético, não bloqueia */ }

          const update = await Updates.checkForUpdateAsync();
          if (update.isAvailable) {
            await Updates.fetchUpdateAsync();
            // Marca pendência ANTES do reload pra próximo boot mostrar toast.
            try { await AsyncStorage.setItem('kindar.ota_reload_pending', '1'); } catch {}
            // reloadAsync mata o JS engine; nunca retorna. Splash já é o
            // último que o user vê do bundle atual.
            await Updates.reloadAsync();
            return; // unreachable
          }
        } catch {
          // sem internet, fingerprint mismatch, ou erro de rede —
          // mantem o bundle atual; nao quebra o app.
        } finally {
          clearTimeout(failsafe);
          release();
        }
      })();
    }

    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Soft prompt state: visível quando iOS permission é "undetermined" AND
  // user ainda não recusou via soft prompt antes. Setado pela checagem em
  // checkSoftPromptStatus() abaixo. Industry standard pra preservar opt-in
  // rate (60-70% vs 30-40% sem soft prompt).
  const [showSoftPrompt, setShowSoftPrompt] = useState(false);

  // Register for push + identify RevenueCat user after login. Tambem re-tenta
  // o registro APNs/FCM toda vez que o app volta pro foreground — cobre o
  // cenario onde o registro inicial falhou (sem internet, backend instavel)
  // e o token nunca foi salvo no DB. Idempotente no backend (dedup por user
  // + token), entao executar varias vezes nao gera duplicatas.
  //
  // BEHAVIOR CHANGE 2026-05-22: registerForPushNotificationsAsync() agora
  // NÃO chama o hard prompt iOS direto (vide push-setup.ts). Em vez disso,
  // checamos primeiro se devemos mostrar o soft prompt; só depois do user
  // clicar "Sim" no modal disparamos o request nativo.
  useEffect(() => {
    if (!userId) {
      resetUser().catch(() => {});
      analytics.reset();
      return;
    }
    // 1. Tenta registrar (no-op se ainda não temos permission)
    registerForPushNotificationsAsync().catch((e) =>
      reportError(e, { filePath: '_layout', metadata: { phase: 'push_register_post_login' }, severity: 'warning' }),
    );
    // 2. Verifica se devemos mostrar o soft prompt depois de login
    // Delay pequeno pra não competir com splash/onboarding na primeira tela
    const t = setTimeout(async () => {
      try {
        const status = await checkSoftPromptStatus();
        if (status === 'show_modal') {
          setShowSoftPrompt(true);
          analytics.track('soft_prompt_shown', { context: 'post_login_delay' });
        }
      } catch (e) {
        reportError(e, { filePath: '_layout', metadata: { phase: 'soft_prompt_check' }, severity: 'warning' });
      }
    }, 1500);
    identifyUser(userId).catch(() => {});
    analytics.identify(userId);

    let lastState = AppState.currentState;
    let lastBackgroundAt = 0;
    const sub = AppState.addEventListener('change', async (next) => {
      // OTA auto-apply on long-background resume (2026-05-19):
      // se o user mandou app pro background há MAIS QUE 5 minutos E há OTA
      // pendente baixado, reload silencioso. User espera o app "rebooting"
      // depois de tanto tempo em background, então o splash do reload se
      // funde com o resume — invisível.
      if (next === 'background' || next === 'inactive') {
        lastBackgroundAt = Date.now();
      }
      if (next === 'active' && lastState !== 'active') {
        // Re-register push (idempotente)
        registerForPushNotificationsAsync().catch((e) =>
          reportError(e, { filePath: '_layout', metadata: { phase: 'push_register_foreground' }, severity: 'warning' }),
        );

        // OTA auto-apply: só age se ficou > 30min em background.
        // Bug Carolina 2026-05-20: threshold antigo de 5min disparava
        // muito frequente — toda saída pro WhatsApp / notificações de
        // 5+ minutos triggava reload no resume. Visualmente parece "app
        // fechou sozinho". 30min é mais conservador: cobre o caso de
        // "voltou no dia seguinte" sem incomodar quem só foi ver msg.
        const longBackground = lastBackgroundAt > 0 && Date.now() - lastBackgroundAt > 30 * 60 * 1000;
        if (longBackground && Updates.isEnabled) {
          try {
            // Verifica se há update pendente baixado (não baixa agora pra
            // não atrasar resume; checkAutomatically=ON_LOAD + splash gate
            // já cobrem o caso de cold start).
            const u = await Updates.checkForUpdateAsync();
            if (u.isAvailable) {
              await Updates.fetchUpdateAsync();
              // Flag pra próximo boot mostrar toast "App atualizado".
              try { await AsyncStorage.setItem('kindar.ota_reload_pending', '1'); } catch {}
              await Updates.reloadAsync();
            }
          } catch {
            // sem internet, fingerprint mismatch — mantém atual.
          }
        }
      }
      lastState = next;
    });
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, [userId]);

  // Soft prompt handlers — chamados pelo SoftPromptModal abaixo.
  //
  // ORDEM CRÍTICA (bug 2026-05-25): fechar o modal + disparar register ANTES
  // de qualquer chamada de analytics. Versão anterior chamava `analytics.
  // capture(...)` na primeira linha, mas a função exportada é `analytics.
  // track(...)` — TypeError quebrava o handler antes do registerForPush-
  // NotificationsAsync({forceRequest:true}), por isso ZERO apns_token foram
  // registrados em prod desde o refactor de soft prompt. Mesmo com a função
  // certa, mantemos analytics POR ÚLTIMO pra qualquer regressão futura de
  // telemetria não bloquear o caminho crítico de registro.
  const handleSoftPromptAccept = async () => {
    await markSoftPromptShown().catch((e) =>
      reportError(e, { filePath: '_layout', metadata: { phase: 'soft_prompt_mark_shown' } }),
    );
    setShowSoftPrompt(false);
    // Dispara o hard prompt iOS + registra token APNs/FCM no backend.
    const token = await registerForPushNotificationsAsync({ forceRequest: true }).catch((e) => {
      reportError(e, { filePath: '_layout', metadata: { phase: 'soft_prompt_register' } });
      return null;
    });
    analytics.track('soft_prompt_accepted');
    analytics.track('soft_prompt_outcome', {
      outcome: token ? 'granted' : 'denied_at_native',
    });
  };

  const handleSoftPromptDecline = async () => {
    await markSoftPromptShown().catch((e) =>
      reportError(e, { filePath: '_layout', metadata: { phase: 'soft_prompt_mark_shown_decline' } }),
    );
    setShowSoftPrompt(false);
    analytics.track('soft_prompt_declined');
    // Não dispara hard prompt — user pode reativar via /perfil/notificacoes
    // depois (que mostra banner permissionUndetermined + CTA "Ativar
    // notificações" que chama o hard prompt diretamente).
  };

  // Notificações: registra categorias de quick action + trata tap/ação.
  useEffect(() => {
    // Quick actions "Aconteceu? Sim/Não/Adiar" do follow-up de atividade.
    registerNotificationCategories().catch(() => {});

    const OUTCOME: Record<string, 'happened' | 'missed' | 'snoozed'> = {
      act_happened: 'happened',
      act_missed: 'missed',
      act_snooze: 'snoozed',
    };

    const remove = addNotificationResponseListener((url, actionIdentifier) => {
      // Botão da notificação (Sim/Não/Adiar): registra o desfecho via API SEM
      // abrir tela. activity_id + date vêm do deep link
      // (/atividades/{id}?date=YYYY-MM-DD&followup=1). Feedback Amanda: marcar
      // sem ter que abrir o app.
      const status = OUTCOME[actionIdentifier];
      if (status && url) {
        const activityId = url.split('?')[0].split('/').filter(Boolean).pop();
        const dateMatch = url.match(/[?&]date=([^&]+)/);
        const occurrenceDate = dateMatch ? decodeURIComponent(dateMatch[1]) : null;
        if (activityId && occurrenceDate) {
          (async () => {
            try {
              const { apiFetch } = await import('src/lib/api-fetch');
              await apiFetch('/api/activities/outcome', {
                method: 'POST',
                body: { activityId, occurrenceDate, status },
              });
            } catch (e) {
              reportError(e, { filePath: '_layout', metadata: { phase: 'followup_quick_action', status } });
            }
          })();
        }
        return;
      }

      if (!url) return;
      // Parse full URLs (kindar://...) via Linking, relative paths via router
      if (url.startsWith('http') || url.startsWith('kindar://')) {
        Linking.openURL(url).catch(() => {});
      } else {
        router.push(url as Parameters<typeof router.push>[0]);
      }
    });
    return remove;
  }, []);

  // Splash visível enquanto auth carrega OU OTA check pendente.
  // Ordem: primeiro garante bundle correto (OTA), depois auth.
  const splashVisible = isLoading || !updateChecked;

  // Haptic sutil quando o app fica pronto — Apple HIG style. Roda 1× só.
  // useRef em vez de useState pra evitar re-render (não precisamos rerenderizar
  // o RootLayout só pra marcar que o haptic já rodou) e evitar o warning
  // react-hooks/set-state-in-effect.
  const readyHapticDoneRef = useRef(false);
  useEffect(() => {
    if (!splashVisible && !readyHapticDoneRef.current) {
      Haptics.selectionAsync().catch(() => {});
      readyHapticDoneRef.current = true;
    }
  }, [splashVisible]);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
        {/* Splash em absolute SOBRE o dashboard. Quando splashVisible
            vira false, splash desmonta com FadeOut 400ms via Reanimated
            layout animation. Dashboard renderiza por baixo. Como ambos
            usam mesma backgroundColor cream, transição é imperceptível
            de cor — só os elementos de UI emergem. Cinematic crossfade.

            Anti-flicker: usar render condicional invés de absolute
            permanente — dashboard só monta quando ready, então não
            consome recursos durante boot. Quando flipa pra dashboard,
            entering FadeIn no inner view dá o "emerge by behind". */}
        {splashVisible ? (
          <Animated.View
            key="splash-cinematic"
            exiting={FadeOut.duration(400).easing(
              Easing.bezier(0.4, 0, 0.2, 1),
            )}
            style={StyleSheet.absoluteFill}
          >
            <SplashScreen isLoading={isLoading} />
          </Animated.View>
        ) : (
        <Animated.View
          entering={FadeIn.duration(280).delay(80).easing(
            Easing.out(Easing.cubic),
          )}
          style={{ flex: 1 }}
        >
        <ToastProvider>
        {/* Bug Carolina 2026-05-20: app fechou sozinho 2x. Causa: auto-reload
            OTA no resume após >5min reseta a view sem feedback. Fix: aumenta
            threshold pra 30min E mostra esse toast no boot pós-reload pra
            converter "fechou sozinho" em "ah, atualização". */}
        <OtaUpdatedToastTrigger show={showOtaToast} onShown={() => setShowOtaToast(false)} />
        <AnalyticsTree>
        <LockGate>
        <BillingGate>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <Stack screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'slide_from_right',
            gestureEnabled: true,
          }}>
            <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
            <Stack.Screen name="auth" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
            <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="chat" />
            <Stack.Screen name="saude" />
            <Stack.Screen name="despesas" />
            <Stack.Screen name="calendario" />
            <Stack.Screen name="financeiro" />
            <Stack.Screen name="atividades" />
            <Stack.Screen name="eventos" />
            <Stack.Screen name="criancas" />
            <Stack.Screen name="familia" />
            <Stack.Screen name="perfil" />
            <Stack.Screen name="notificacoes" />
            <Stack.Screen name="documentos" />
            <Stack.Screen name="acordos" />
            <Stack.Screen name="decisoes" />
            <Stack.Screen name="checkin" />
            <Stack.Screen name="escola" />
            <Stack.Screen name="notas" />
            <Stack.Screen name="temas-sensiveis" />
            <Stack.Screen name="semana" />
            <Stack.Screen name="pricing" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="ai" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          </Stack>
          {/* Kindar AI assistant — FAB removido em 2026-05-05 a pedido do
              usuário (estava sobrepondo botões de outras telas em iOS+Android).
              Sheet permanece montado pra ser aberto via outros gatilhos
              (header sparkle button do dashboard, deep link /ai, etc.). */}
          <AIAssistantSheet />
          {/* Banner global de offline/sync. Vive acima das telas via absolute
              positioning + zIndex; gated por estar dentro de LockGate (não
              mostra durante o lock screen). */}
          <OfflineBanner />
        </View>
        </BillingGate>
        </LockGate>
        </AnalyticsTree>
        </ToastProvider>
        </Animated.View>
        )}
        {/* Soft prompt pre-permission iOS. Aparece UMA VEZ por device quando
            iOS permission é undetermined e user ainda não dismissou. Antes
            do hard prompt iOS (que é irrevogável) — preserva opt-in rate. */}
        <SoftPromptModal
          visible={showSoftPrompt}
          onAccept={handleSoftPromptAccept}
          onDecline={handleSoftPromptDecline}
        />
        <StatusBar style="dark" />
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

/**
 * Mostra toast "App atualizado" uma única vez após reload OTA.
 * Vive dentro do ToastProvider — só assim consegue chamar useToast().
 *
 * Bug Carolina (DM Angelino 2026-05-20): user via app "fechar sozinho 2×"
 * porque o reload OTA é silencioso. Esse trigger transforma o reset visual
 * em feedback positivo: "Kindar atualizado ✓".
 */
function OtaUpdatedToastTrigger({ show, onShown }: { show: boolean; onShown: () => void }) {
  const toast = useToast();
  useEffect(() => {
    if (!show) return;
    // Pequeno delay pra splash sumir antes do toast — animation mais limpa.
    const id = setTimeout(() => {
      toast.show({ message: 'Kindar atualizado para a última versão', variant: 'success', durationMs: 3200 });
      onShown();
    }, 600);
    return () => clearTimeout(id);
  }, [show, toast, onShown]);
  return null;
}

/**
 * Splash interno do app — vive enquanto auth/i18n/etc. estão hidratando.
 * Não confundir com o native splash do Expo (controlado por expo-splash-screen
 * + app.json/splash), que aparece ANTES do React montar. Este aqui é o fallback
 * "JS já bootou mas estado ainda não chegou".
 *
 * Antes era um hard cut quando isLoading virava false. Agora fazemos um fade-in
 * de 280ms ao montar pra suavizar a transição splash → dashboard. O fade-out
 * acontece naturalmente quando isLoading vira false (React desmonta e remonta
 * o conteúdo abaixo).
 */
/**
 * SplashScreen — assinatura emocional Kindar (top-tier mobile premium).
 *
 * Direção entregue por Henrique 2026-05-20 (acting como Principal Motion
 * Engineer + Staff UX Engineer + QA Lead): "produto premium global,
 * nível Apple/Linear/Headspace", evitando vibes fintech/AI/crypto/kid-app.
 * Identidade visual: "a rotina da família se organizando silenciosamente".
 *
 * Choreography (cinematic, 1.6s total + idle loops):
 *
 *   t=0     Background warm cream montado (já no parent)
 *   t=200   Logo entra: scale 0.5→1.05 (overshoot spring) + opacity 0→1
 *           + drop-shadow building. Apple HIG damping=14, stiffness=110.
 *   t=400   GLOW SVG RADIAL champagne (#F6EBDD) com falloff Gaussian
 *           REAL — escala 0.5→1.5 em 1600ms (cubic), opacity 0→0.22→0.
 *           Usa <RadialGradient> com 3 stops pra falloff orgânico.
 *   t=400+  Constelação aparece staggered (cada 220ms), 4 dots orbitam
 *           em VELOCIDADES DIFERENTES (0.85x, 1.0x, 1.18x, 1.32x) pra
 *           micro-drift orgânico — abstrato, NUNCA literal.
 *   t=600   Logo settles 1.05→1.0 (spring natural)
 *   t=750   Wordmark: scale 1.06→1.0 + opacity 0→1 + translateY 8→0
 *           SIMULTÂNEOS (mimics blur→sharp focus, easing cubic-out)
 *   t=1050  Tagline: scale 1.04→1.0 + tracking 0.5→2.5px + fade +
 *           translateY 6→0 (premium emocional, Apple/Notion style)
 *   t=1450  Breathing underline (Arc Browser): 0↔80px loop senoidal
 *
 * Loops ativos (idle):
 *   - Logo respirando APENAS se isLoading (1.0↔1.025 cada 2.8s)
 *   - Constelação orbita a velocidades drift-friendly
 *   - Underline respira indefinidamente até unmount
 *
 * Exit (ready):
 *   - cancelAnimation no logoScale → assenta suave 1.0
 *   - Haptics.selectionAsync() no RootLayout (separado)
 *   - FadeOut 400ms cubic via Animated.View exiting do parent
 *   - Dashboard cross-mount com FadeIn 200ms (delay 60ms) por baixo
 *
 * A11y:
 *   - AccessibilityInfo.isReduceMotionEnabled() respeitado: skip orbit,
 *     skip breathing, skip glow expansion. Fade simples 200ms.
 *
 * Safe area:
 *   - SafeAreaView do react-native-safe-area-context pra notch/dynamic
 *     island. Logo perfectly centered no espaço seguro.
 *
 * Performance:
 *   - 100% useNativeDriver-equivalent (Reanimated worklets) → 60fps GPU
 *   - SVG Defs reusadas, sem alocação por frame
 *   - useAnimatedStyle só toca props animadas (translateX/Y, opacity,
 *     scale) — sem layout shift
 *   - Sem setState em effects (useRef pra haptic-done)
 *   - Cancelamento explícito de loops no unmount via cleanup
 */
const CHAMPAGNE = '#F6EBDD';
// 124px = logo half (72) + 52px breathing room. Antes era 80 = dots
// quase tocavam a borda do logo (visto no vídeo Henrique 2026-05-21).
// Agora dots ficam claramente fora do logo, formando constelação real.
const CONSTELLATION_RADIUS = 124;
const CONSTELLATION_DOTS = [
  { angle: -Math.PI / 2, speed: 1.0, size: 5, delay: 460 },     // N
  { angle: 0, speed: 0.85, size: 5.5, delay: 660 },              // E
  { angle: Math.PI / 2, speed: 1.32, size: 4.5, delay: 880 },    // S
  { angle: Math.PI, speed: 1.18, size: 5, delay: 1080 },         // W
];

// Multi-layer glow stack — bloom fotográfico real. Cada camada tem
// tamanho/opacidade/timing próprios pra simular lens flare/aura premium.
// Ordem ascendente em z (maior atrás, menor na frente). Apple Music /
// Headspace usam pattern similar.
const GLOW_LAYERS = [
  { size: 360, peakOpacity: 0.10, duration: 2000, delay: 380 }, // outer ambient
  { size: 280, peakOpacity: 0.20, duration: 1700, delay: 400 }, // mid bloom
  { size: 200, peakOpacity: 0.35, duration: 1400, delay: 440 }, // core warm
];

const KINDAR_LETTERS = ['K', 'i', 'n', 'd', 'a', 'r'];
const LETTER_STAGGER_MS = 70;
const WORDMARK_BASE_DELAY = 750;

function SplashScreen({ isLoading }: { isLoading: boolean }) {
  const t = useI18n((s) => s.t);

  // Reduce motion gate — accessibility compliance. Quando true: skip
  // orbit/breathing/glow expansion, só fade simples 200ms.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((rm) => {
      if (!cancelled) setReduceMotion(rm);
    });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (rm) => setReduceMotion(rm),
    );
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const logoScale = useSharedValue(0.5);
  const logoOpacity = useSharedValue(0);
  const orbitProgress = useSharedValue(0);
  const underlineWidth = useSharedValue(0);

  const taglineTracking = useSharedValue(0.5);
  const taglineOpacity = useSharedValue(0);
  const taglineScale = useSharedValue(1.04);
  const taglineY = useSharedValue(6);

  // Pulse ring (anel sonar que expande no momento isLoading=false).
  // Sincroniza com haptic + crossfade. Confirma "chegamos" visualmente.
  const pulseScale = useSharedValue(0.85);
  const pulseOpacity = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      // Modo a11y: tudo aparece com fade simples em 200ms, sem motion.
      logoOpacity.value = withTiming(1, { duration: 200 });
      logoScale.value = 1.0;
      taglineOpacity.value = withTiming(0.55, { duration: 200 });
      taglineScale.value = 1.0;
      taglineY.value = 0;
      taglineTracking.value = 2.5;
      return;
    }

    // === Logo entrance: spring overshoot Apple HIG ===
    logoOpacity.value = withTiming(1, { duration: 420 });
    logoScale.value = withDelay(
      200,
      withSpring(1, { damping: 14, stiffness: 110 }),
    );

    // === Tagline — tracking expand + blur→sharp ===
    taglineOpacity.value = withDelay(
      1050,
      withTiming(0.55, { duration: 380 }),
    );
    taglineScale.value = withDelay(
      1050,
      withTiming(1.0, { duration: 460, easing: Easing.out(Easing.cubic) }),
    );
    taglineY.value = withDelay(
      1050,
      withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) }),
    );
    taglineTracking.value = withDelay(
      1050,
      withTiming(2.5, { duration: 620, easing: Easing.out(Easing.cubic) }),
    );

    // === Breathing underline (Arc Browser) — começa após choreography ===
    underlineWidth.value = withDelay(
      1450,
      withRepeat(
        withSequence(
          withTiming(80, {
            duration: 1500,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(0, {
            duration: 1500,
            easing: Easing.inOut(Easing.sin),
          }),
        ),
        -1,
        false,
      ),
    );

    // === Constelação orbita lento — 90s rotação completa base. Cada dot
    // tem seu próprio speed multiplier (definido em CONSTELLATION_DOTS),
    // criando micro-drift orgânico ao longo de minutos. ===
    orbitProgress.value = withRepeat(
      withTiming(1, { duration: 90_000, easing: Easing.linear }),
      -1,
      false,
    );
  }, [
    reduceMotion,
    logoOpacity,
    logoScale,
    taglineOpacity,
    taglineScale,
    taglineY,
    taglineTracking,
    underlineWidth,
    orbitProgress,
  ]);

  // === Pulse ring on ready — anel sonar expandindo no momento em que
  // isLoading flips false. Sincroniza com haptic (no parent) e crossfade.
  // Confirma "chegamos" visualmente. Apple/Linear style. ===
  useEffect(() => {
    if (reduceMotion) return;
    if (!isLoading) {
      pulseOpacity.value = withSequence(
        withTiming(0.55, {
          duration: 80,
          easing: Easing.out(Easing.quad),
        }),
        withTiming(0, {
          duration: 700,
          easing: Easing.out(Easing.cubic),
        }),
      );
      pulseScale.value = withTiming(1.85, {
        duration: 800,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [isLoading, reduceMotion, pulseOpacity, pulseScale]);

  // Logo breathing — gated por isLoading + reduceMotion. Quando isLoading
  // vira false: cancelAnimation + assenta suave em 1.0 (anti-pulo).
  useEffect(() => {
    if (reduceMotion) return;
    if (isLoading) {
      logoScale.value = withDelay(
        1600,
        withRepeat(
          withSequence(
            withTiming(1.025, {
              duration: 1400,
              easing: Easing.inOut(Easing.sin),
            }),
            withTiming(1.0, {
              duration: 1400,
              easing: Easing.inOut(Easing.sin),
            }),
          ),
          -1,
          false,
        ),
      );
    } else {
      cancelAnimation(logoScale);
      logoScale.value = withTiming(1.0, { duration: 280 });
    }
  }, [isLoading, logoScale, reduceMotion]);

  const underlineStyle = useAnimatedStyle(() => ({
    width: underlineWidth.value,
  }));
  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
    letterSpacing: taglineTracking.value,
    transform: [
      { scale: taglineScale.value },
      { translateY: taglineY.value },
    ],
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
    transform: [{ scale: pulseScale.value }],
  }));

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          position: 'relative',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Multi-layer glow — 3 SVG radial gradients empilhados (bloom
            fotográfico real). Maior atrás, menor na frente. Apple Music /
            Headspace pattern. */}
        {GLOW_LAYERS.map((layer, i) => (
          <GlowLayer
            key={i}
            size={layer.size}
            peakOpacity={layer.peakOpacity}
            duration={layer.duration}
            delay={layer.delay}
            reduceMotion={reduceMotion}
          />
        ))}

        {/* Pulse ring on ready — anel sonar que expande quando isLoading
            vira false. Sincroniza com haptic + crossfade. Apple/Linear
            signature de "ready". Sutil mas memorável. */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 180,
              height: 180,
              borderRadius: 90,
              borderWidth: 1.5,
              borderColor: colors.brand,
            },
            pulseStyle,
          ]}
          pointerEvents="none"
        />

        {/* Constelação — 4 dots orbitando com micro-drift orgânico */}
        {CONSTELLATION_DOTS.map((d, i) => (
          <ConstellationDot
            key={i}
            angle={d.angle}
            speedMultiplier={d.speed}
            size={d.size}
            orbitProgress={orbitProgress}
            staggerDelay={d.delay}
            reduceMotion={reduceMotion}
          />
        ))}

        {/* Logo via Skia Canvas com BlurMask GPU REAL — blur entrance
            (radius 18→0 em 700ms cubic-out). Drop-shadow Apple HIG
            no wrapper Animated.View. */}
        <AnimatedLogo
          scale={logoScale}
          opacity={logoOpacity}
          reduceMotion={reduceMotion}
        />
      </View>

      {/* Wordmark — per-letter stagger (Apple Keynote / Linear signature).
          Cada letra reveal sequenciada (70ms entre) + blur→sharp (scale
          + opacity + translateY simultâneos). Text-shadow sutil pra depth
          Apple HIG. */}
      <View
        style={{ flexDirection: 'row', marginTop: 22 }}
        accessible
        accessibilityRole="header"
        accessibilityLabel="Kindar"
      >
        {KINDAR_LETTERS.map((letter, i) => (
          <WordmarkLetter
            key={i}
            letter={letter}
            index={i}
            reduceMotion={reduceMotion}
          />
        ))}
      </View>

      {/* Breathing underline (Arc Browser style) abaixo do wordmark */}
      <Animated.View
        style={[
          {
            height: 1.5,
            backgroundColor: colors.brand,
            marginTop: 6,
            opacity: 0.4,
            borderRadius: 1,
          },
          underlineStyle,
        ]}
        pointerEvents="none"
      />

      {/* Tagline — tracking expand + scale (blur→sharp) + slide-up */}
      <Animated.Text
        style={[
          {
            fontSize: 10,
            color: colors.textMuted,
            marginTop: 12,
            textTransform: 'uppercase',
            fontWeight: '500',
          },
          taglineStyle,
        ]}
      >
        {t('splash.tagline')}
      </Animated.Text>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

/**
 * GlowLayer — camada de glow com **Skia BlurMask REAL Gaussian blur** rendered
 * direto na GPU. Múltiplas instâncias empilhadas formam o bloom fotográfico
 * de verdade — paridade Headspace/Apple Music/Robinhood.
 *
 * Skia BlurMask aplica Gaussian blur radius `blurRadius` em qualquer shape.
 * Diferente de SVG RadialGradient (que aproxima blur via gradient stops),
 * isso é blur de verdade calculado por shader. Resultado: glow muito mais
 * soft e orgânico, sem nenhum "anel" visível.
 *
 * Cada layer tem ciclo próprio (scale 0.5→1.x + opacity bell curve) pra
 * dar sensação de "energia respirando" em camadas. reduceMotion=true:
 * skip toda a expansão.
 */
function GlowLayer({
  size,
  peakOpacity,
  duration,
  delay,
  reduceMotion,
}: {
  size: number;
  peakOpacity: number;
  duration: number;
  delay: number;
  reduceMotion: boolean;
}) {
  const scale = useSharedValue(0.5);
  const opacityShared = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    scale.value = withDelay(
      delay,
      withTiming(1.5, {
        duration,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      }),
    );
    const peakRatio = 0.3;
    opacityShared.value = withDelay(
      delay,
      withSequence(
        withTiming(peakOpacity, {
          duration: duration * peakRatio,
          easing: Easing.out(Easing.quad),
        }),
        withTiming(0, {
          duration: duration * (1 - peakRatio),
          easing: Easing.in(Easing.quad),
        }),
      ),
    );
  }, [scale, opacityShared, duration, delay, peakOpacity, reduceMotion]);

  // Derived values pra Skia (precisa de useDerivedValue, não useAnimatedStyle).
  const skiaCircleOpacity = useDerivedValue(() => opacityShared.value);
  // Raio efetivo escala com o scale shared value pra crescer junto.
  const skiaRadius = useDerivedValue(() => (size / 2) * scale.value);

  // BlurMask radius proporcional ao tamanho — quanto maior o layer,
  // mais blur (ambient outer = blur enorme, core inner = blur menor).
  const blurAmount = size * 0.18;

  return (
    <View
      style={{
        position: 'absolute',
        width: size,
        height: size,
      }}
      pointerEvents="none"
    >
      <Canvas style={{ flex: 1 }}>
        <Group>
          <BlurMask blur={blurAmount} style="normal" />
          <SkiaCircle
            cx={size / 2}
            cy={size / 2}
            r={skiaRadius}
            color={CHAMPAGNE}
            opacity={skiaCircleOpacity}
          />
        </Group>
      </Canvas>
    </View>
  );
}

/**
 * AnimatedLogo — logo renderizado via Skia Canvas com BlurMask animado.
 * Entrada: blur 18→0 durante a entrada (blur→sharp focus REAL via shader
 * Gaussian). Combinado com scale spring overshoot, dá efeito cinematográfico
 * que apenas Skia/Lottie/native consegue entregar.
 *
 * Wrapper Animated.View aplica scale + opacity por cima do Canvas Skia.
 * Skia handle do blur internamente via useDerivedValue.
 */
function AnimatedLogo({
  scale,
  opacity,
  reduceMotion,
}: {
  scale: SharedValue<number>;
  opacity: SharedValue<number>;
  reduceMotion: boolean;
}) {
  const logoImage = useImage(splashLogo);
  const blurRadius = useSharedValue(reduceMotion ? 0 : 18);

  useEffect(() => {
    if (reduceMotion) {
      blurRadius.value = 0;
      return;
    }
    // Blur entrance — 18px blur → 0 em sync com spring scale do logo.
    // delay 200 = começa junto com o spring (logo aparece "vindo de longe"
    // e foca quando assenta).
    blurRadius.value = withDelay(
      200,
      withTiming(0, {
        duration: 700,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [blurRadius, reduceMotion]);

  const wrapperStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const skiaBlur = useDerivedValue(() => blurRadius.value);

  return (
    <Animated.View
      style={[
        {
          width: 144,
          height: 144,
          // iOS shadow no wrapper (sombra na "view", não no Skia raster)
          shadowColor: '#1a1a1a',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.08,
          shadowRadius: 18,
          elevation: 4,
        },
        wrapperStyle,
      ]}
    >
      <Canvas style={{ width: 144, height: 144 }}>
        {logoImage ? (
          <Group>
            <BlurMask blur={skiaBlur} style="normal" />
            <SkiaImage
              image={logoImage}
              x={0}
              y={0}
              width={144}
              height={144}
              fit="contain"
            />
          </Group>
        ) : null}
      </Canvas>
    </Animated.View>
  );
}

/**
 * WordmarkLetter — uma letra do "Kindar" com reveal staggered.
 * Pattern de Apple Keynote / Linear: cada letra revela 70ms após a
 * anterior com blur→sharp focus (scale 1.06→1.0 + opacity 0→1 +
 * translateY 8→0 simultâneos, easing cubic-out 440ms).
 *
 * Text-shadow sutil dá depth Apple HIG. reduceMotion=true: aparece
 * instantâneo no estado final.
 */
function WordmarkLetter({
  letter,
  index,
  reduceMotion,
}: {
  letter: string;
  index: number;
  reduceMotion: boolean;
}) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(1.06);
  const y = useSharedValue(8);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = withTiming(1, { duration: 200 });
      scale.value = 1.0;
      y.value = 0;
      return;
    }
    const delay = WORDMARK_BASE_DELAY + index * LETTER_STAGGER_MS;
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: 440, easing: Easing.out(Easing.cubic) }),
    );
    scale.value = withDelay(
      delay,
      withTiming(1.0, { duration: 440, easing: Easing.out(Easing.cubic) }),
    );
    y.value = withDelay(
      delay,
      withTiming(0, { duration: 440, easing: Easing.out(Easing.cubic) }),
    );
  }, [opacity, scale, y, index, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { translateY: y.value }],
  }));

  return (
    <Animated.Text
      style={[
        {
          fontSize: 32,
          fontWeight: '700',
          color: colors.text,
          letterSpacing: -0.8,
          // Text shadow sutil — depth Apple HIG sem competir com logo
          textShadowColor: 'rgba(0,0,0,0.06)',
          textShadowOffset: { width: 0, height: 2 },
          textShadowRadius: 8,
        },
        style,
      ]}
    >
      {letter}
    </Animated.Text>
  );
}

/**
 * ConstellationDot — micro-ponto que aparece staggered e depois orbita
 * lentamente em torno do logo. Cada dot tem speed multiplier próprio pra
 * criar drift orgânico: dots ficam fora de fase ao longo do tempo,
 * eliminando rigidez de rotação síncrona.
 *
 * Tamanho ligeiramente variado (4.5-5.5px) pra organicidade visual.
 * reduceMotion=true: posição estática no ângulo base, sem orbit.
 */
function ConstellationDot({
  angle,
  speedMultiplier,
  size,
  orbitProgress,
  staggerDelay,
  reduceMotion,
}: {
  angle: number;
  speedMultiplier: number;
  size: number;
  orbitProgress: SharedValue<number>;
  staggerDelay: number;
  reduceMotion: boolean;
}) {
  const appearOpacity = useSharedValue(0);
  const appearScale = useSharedValue(0.3);

  useEffect(() => {
    if (reduceMotion) {
      appearOpacity.value = withTiming(0.3, { duration: 200 });
      appearScale.value = 1;
      return;
    }
    appearOpacity.value = withDelay(
      staggerDelay,
      withTiming(0.38, { duration: 540, easing: Easing.out(Easing.quad) }),
    );
    appearScale.value = withDelay(
      staggerDelay,
      withSpring(1, { damping: 12, stiffness: 90 }),
    );
  }, [appearOpacity, appearScale, staggerDelay, reduceMotion]);

  const style = useAnimatedStyle(() => {
    const orbital = reduceMotion
      ? 0
      : orbitProgress.value * Math.PI * 2 * speedMultiplier;
    const currentAngle = angle + orbital;
    const x = Math.cos(currentAngle) * CONSTELLATION_RADIUS;
    const y = Math.sin(currentAngle) * CONSTELLATION_RADIUS;
    return {
      opacity: appearOpacity.value,
      transform: [
        { translateX: x },
        { translateY: y },
        { scale: appearScale.value },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.brand,
        },
        style,
      ]}
      pointerEvents="none"
    />
  );
}
