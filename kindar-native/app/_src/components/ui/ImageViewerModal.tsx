/**
 * ImageViewerModal — visualizador de imagem IN-APP (não abre o navegador).
 *
 * Por quê: documentos-imagem (RG, carteirinha, comprovante) abriam no browser
 * externo via `Linking.openURL`, tirando o usuário do app e perdendo o contexto.
 * Este modal mostra a imagem em tela cheia, com pinch-to-zoom, pan, double-tap
 * e swipe-down-to-dismiss — o padrão que usuários esperam (Fotos/WhatsApp/IG).
 *
 * Gestos (react-native-gesture-handler + reanimated 4):
 *   - Pinch: zoom 1×–4× (clamp).
 *   - Pan: arrasta quando ampliado; quando em 1× vira swipe-down pra fechar.
 *   - Double-tap: alterna 1×↔2× (ou reseta se já ampliado).
 *   Composição: Race(doubleTap, Simultaneous(pinch, pan)) — o double-tap vence
 *   o par pinch+pan, que por sua vez rodam juntos (zoom enquanto arrasta).
 *
 * IMPORTANTE: o RN <Modal> abre uma janela/hierarquia NATIVA própria, FORA do
 * <GestureHandlerRootView> da raiz do app. Sem um GHRV próprio aqui dentro os
 * gestos não chegam ao detector. Por isso o conteúdo é envolvido por um
 * GestureHandlerRootView local (mesma armadilha do KeyboardAvoidingView em
 * Modal — janela separada do adjustResize).
 *
 * Compartilhar: baixa a imagem (signed URL é efêmera) pro cache e abre a sheet
 * nativa via expo-sharing. Fallback em cascata: Share.share (RN) → Linking.
 * Usa a API moderna do expo-file-system 19 (File/Paths) — `downloadAsync`/
 * `cacheDirectory` foram pra `expo-file-system/legacy` no SDK54 e logam
 * deprecation; `File.downloadFileAsync` é o equivalente sem warning.
 *
 * Props mínimas e reutilizáveis: o caller controla visibilidade via `visible` +
 * `uri`; o modal só lê. Reseta zoom/pan/loading/error sempre que abre ou troca
 * de imagem.
 */
import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Linking,
  Share,
  Platform,
} from 'react-native';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useI18n } from 'src/i18n';

interface Props {
  visible: boolean;
  uri: string | null;
  name?: string;
  onClose: () => void;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const MIN_SCALE = 1;
const MAX_SCALE = 4;
/** Distância de arraste vertical (em 1×) que dispara o fechar. */
const DISMISS_THRESHOLD = 120;

/** Worklet helper — limita um valor ao intervalo [min, max]. */
function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

export default function ImageViewerModal({ visible, uri, name, onClose }: Props) {
  const t = useI18n((s) => s.t);
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sharing, setSharing] = useState(false);

  // Transform state (reanimated shared values).
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  // Reseta tudo quando abre (false→true) ou quando a imagem muda.
  useEffect(() => {
    if (visible && uri) {
      setLoading(true);
      setError(false);
      scale.value = 1;
      savedScale.value = 1;
      tx.value = 0;
      ty.value = 0;
      savedTx.value = 0;
      savedTy.value = 0;
    }
    // Shared values são estáveis (não entram nas deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, uri]);

  function handleClose() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClose();
  }

  function openExternally() {
    if (!uri) return;
    Linking.openURL(uri).catch(() => {});
  }

  async function handleShare() {
    if (!uri || sharing) return;
    setSharing(true);
    try {
      // expo-sharing precisa de um arquivo LOCAL. Baixa o (signed) URL pro cache.
      const Sharing = await import('expo-sharing');
      const available = await Sharing.isAvailableAsync();
      if (available) {
        const { File, Paths } = await import('expo-file-system');
        const safeName = (name || 'image').replace(/[^\w.\-]+/g, '_').slice(0, 80) || 'image';
        const dest = new File(Paths.cache, safeName);
        // Se já existe um resíduo com o mesmo nome, remove pra não falhar.
        try {
          if (dest.exists) dest.delete();
        } catch {
          // best-effort
        }
        const downloaded = await File.downloadFileAsync(uri, dest);
        await Sharing.shareAsync(downloaded.uri, { dialogTitle: name });
      } else {
        // Plataforma sem sharing nativo (ex.: web/alguns Androids) → Share RN.
        await Share.share(Platform.OS === 'ios' ? { url: uri } : { message: uri });
      }
    } catch {
      // Fallback final: Share RN com a URL remota; se ainda falhar, navegador.
      try {
        await Share.share(Platform.OS === 'ios' ? { url: uri } : { message: uri });
      } catch {
        openExternally();
      }
    } finally {
      setSharing(false);
    }
  }

  // ── Gestos ────────────────────────────────────────────────────────────────
  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = clamp(savedScale.value * e.scale, MIN_SCALE, MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedTx.value = 0;
        savedTy.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value > 1) {
        tx.value = savedTx.value + e.translationX;
        ty.value = savedTy.value + e.translationY;
      } else {
        // Em 1× só o eixo Y se move (preview do swipe-to-dismiss).
        ty.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (scale.value > 1) {
        savedTx.value = tx.value;
        savedTy.value = ty.value;
      } else if (Math.abs(e.translationY) > DISMISS_THRESHOLD) {
        runOnJS(handleClose)();
      } else {
        ty.value = withTiming(0);
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedScale.value = 1;
        savedTx.value = 0;
        savedTy.value = 0;
      } else {
        scale.value = withTiming(2);
        savedScale.value = 2;
      }
    });

  const composed = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const imageAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  // Backdrop preto que clareia conforme o swipe-down (só em 1×).
  const backdropAnimatedStyle = useAnimatedStyle(() => {
    const opacity = scale.value <= 1 ? 1 - Math.min(Math.abs(ty.value) / 300, 0.7) : 1;
    return { opacity };
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <GestureHandlerRootView style={styles.root}>
        {/* Backdrop preto animado (separado do conteúdo p/ fade no swipe). */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropAnimatedStyle]} />

        {/* Imagem + gestos */}
        <GestureDetector gesture={composed}>
          <Animated.View style={styles.imageWrap} collapsable={false}>
            {uri && !error ? (
              <Animated.Image
                source={{ uri }}
                style={[styles.image, imageAnimatedStyle]}
                resizeMode="contain"
                onLoadEnd={() => setLoading(false)}
                onError={() => {
                  setLoading(false);
                  setError(true);
                }}
                accessibilityRole="image"
                accessibilityLabel={name}
              />
            ) : null}
          </Animated.View>
        </GestureDetector>

        {/* Loading */}
        {loading && !error ? (
          <View style={styles.centerOverlay} pointerEvents="none">
            <ActivityIndicator color="#fff" size="large" />
          </View>
        ) : null}

        {/* Error */}
        {error ? (
          <View style={styles.centerOverlay}>
            <Ionicons name="image-outline" size={48} color="rgba(255,255,255,0.7)" />
            <Text style={styles.errorText}>{t('imageViewer.error')}</Text>
            <TouchableOpacity
              onPress={() => {
                setError(false);
                setLoading(true);
              }}
              style={styles.errorBtn}
              accessibilityRole="button"
            >
              <Ionicons name="reload-outline" size={18} color="#fff" />
              <Text style={styles.errorBtnText}>{t('dashboard.retry')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openExternally}
              style={[styles.errorBtn, styles.errorBtnGhost]}
              accessibilityRole="button"
            >
              <Ionicons name="open-outline" size={18} color="#fff" />
              <Text style={styles.errorBtnText}>{t('imageViewer.openExternal')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Header (absoluto, sobre a imagem) */}
        <View style={[styles.header, { paddingTop: insets.top + 4 }]} pointerEvents="box-none">
          <TouchableOpacity
            onPress={handleClose}
            style={styles.iconBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>

          <Text style={styles.title} numberOfLines={1}>
            {name ?? ''}
          </Text>

          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={handleShare}
              disabled={sharing}
              style={styles.iconBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('imageViewer.share')}
            >
              {sharing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="share-outline" size={24} color="#fff" />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openExternally}
              style={styles.iconBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('imageViewer.openExternal')}
            >
              <Ionicons name="open-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    backgroundColor: '#000',
  },
  imageWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: SCREEN_W,
    height: SCREEN_H,
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 9999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  errorBtnGhost: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  errorBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 4,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
