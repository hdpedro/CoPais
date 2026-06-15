import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Image,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius, font } from '../../design-system/tokens';
import type { ChildDocument } from '../../services/children';
import { getSignedFileUrl } from '../../services/storage';
import { useToast } from '../ui/ToastProvider';
import { useI18n } from '../../i18n';
import { useIntl } from '../../lib/intl';

interface Props {
  doc: ChildDocument | null;
  onClose: () => void;
}

const CATEGORY_KEY: Record<string, string> = {
  personal: 'catPersonal',
  health: 'catHealth',
  education: 'catEducation',
  legal: 'catLegal',
  other: 'catOther',
};

// Subtle per-category pill colors. Mantém o tom premium calmo do app
// (sem vermelho forte) — paridade conceitual com o catColors do PWA.
const CATEGORY_PILL: Record<string, { bg: string; fg: string }> = {
  personal: { bg: '#E6F1FB', fg: '#185FA5' },
  health: { bg: '#E1F5EE', fg: '#0F6E56' },
  education: { bg: '#EEEDFE', fg: '#534AB7' },
  legal: { bg: '#FAEEDA', fg: '#854F0B' },
  other: { bg: '#F1EFE8', fg: '#5F5E5A' },
};

function isImage(mime: string | null): boolean {
  return !!mime && mime.startsWith('image/');
}

function fallbackIcon(mime: string | null): keyof typeof Ionicons.glyphMap {
  if (mime?.includes('pdf')) return 'document-text-outline';
  return 'document-outline';
}

/**
 * Sheet content. Recebe sempre um doc não-nulo e é montado com `key={doc.id}`
 * pelo pai — assim cada doc novo remonta com estado limpo, sem precisar de
 * setState síncrono dentro do effect (evita cascading renders).
 */
function DocViewerSheet({ doc, onClose }: { doc: ChildDocument; onClose: () => void }) {
  const t = useI18n((s) => s.t);
  const intl = useIntl();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(true);
  const [imgFailed, setImgFailed] = useState(false);
  const [opening, setOpening] = useState(false);

  // Assina a URL ao montar (TTL 1h cobre a sessão de visualização com folga;
  // a URL só vive em memória, nunca persiste). setState só em callback async.
  useEffect(() => {
    let active = true;
    getSignedFileUrl('documents', doc.file_url, 3600)
      .then((url) => {
        if (active) setSignedUrl(url || doc.file_url);
      })
      .finally(() => {
        if (active) setLoadingUrl(false);
      });
    return () => {
      active = false;
    };
  }, [doc.file_url]);

  async function handleOpenExternal() {
    if (!signedUrl || opening) return;
    setOpening(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      // openBrowserAsync abre um sheet in-app (SFSafariViewController no iOS,
      // Custom Tab no Android) que renderiza PDF/Word nativamente e oferece
      // salvar/compartilhar — sem mandar o documento da criança a terceiros.
      await WebBrowser.openBrowserAsync(signedUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        controlsColor: colors.brand,
      });
    } catch {
      toast.show({ message: t('toasts.common.fallbackError'), variant: 'error' });
    } finally {
      setOpening(false);
    }
  }

  const category = doc.category ?? 'other';
  const pill = CATEGORY_PILL[category] ?? CATEGORY_PILL.other;
  const catLabel = t(`docViewer.${CATEGORY_KEY[category] ?? 'catOther'}`);
  const showImage = isImage(doc.mime_type) && !imgFailed;

  return (
    <View
      style={{
        backgroundColor: colors.bgElevated,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        paddingBottom: insets.bottom + spacing.lg,
        maxHeight: '92%',
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: spacing.sm,
          padding: spacing.lg,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: font.sizes.lg, fontWeight: '700', color: colors.text }} numberOfLines={2}>
            {doc.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <View style={{ backgroundColor: pill.bg, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 }}>
              <Text style={{ fontSize: font.sizes.xs, fontWeight: '600', color: pill.fg }}>{catLabel}</Text>
            </View>
            {doc.uploaderName ? (
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>
                {t('docViewer.uploadedBy')} {doc.uploaderName}
              </Text>
            ) : null}
            {doc.created_at ? (
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>
                {intl.formatDate(doc.created_at, { day: '2-digit', month: 'short', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        </View>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: colors.bgSurface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="close" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        contentContainerStyle={{
          minHeight: 280,
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.lg,
        }}
      >
        {loadingUrl ? (
          <ActivityIndicator size="large" color={colors.brand} />
        ) : showImage ? (
          <Image
            source={{ uri: signedUrl || undefined }}
            alt={doc.name}
            style={{ width: '100%', height: 360, borderRadius: radius.md }}
            resizeMode="contain"
            onError={() => setImgFailed(true)}
            accessibilityLabel={doc.name}
          />
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: radius.lg,
                backgroundColor: colors.bgSurface,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: spacing.md,
              }}
            >
              <Ionicons name={fallbackIcon(doc.mime_type)} size={34} color={colors.textMuted} />
            </View>
            <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.lg, paddingHorizontal: spacing.lg }}>
              {t('docViewer.tapToOpen')}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Action */}
      <View style={{ paddingHorizontal: spacing.lg }}>
        <TouchableOpacity
          onPress={handleOpenExternal}
          disabled={opening || loadingUrl}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('docViewer.openFile')}
          style={{
            backgroundColor: colors.brand,
            borderRadius: radius.lg,
            paddingVertical: spacing.md,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            opacity: opening || loadingUrl ? 0.6 : 1,
          }}
        >
          {opening ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="open-outline" size={18} color="#fff" />
          )}
          <Text style={{ fontSize: font.sizes.md, fontWeight: '700', color: '#fff' }}>
            {showImage ? t('docViewer.open') : t('docViewer.openFile')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function DocumentViewerModal({ doc, onClose }: Props) {
  const t = useI18n((s) => s.t);
  return (
    <Modal visible={!!doc} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} />
        {doc ? <DocViewerSheet key={doc.id} doc={doc} onClose={onClose} /> : null}
      </View>
    </Modal>
  );
}
