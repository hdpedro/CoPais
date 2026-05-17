import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '../../design-system/tokens';
import {
  type ChildDocument,
  // re-using same shape from children.ts
} from '../../services/children';
import { deleteDocument, DOCUMENT_CATEGORIES } from '../../services/documents';
import EmptyState from '../ui/EmptyState';
import { useToast } from '../ui/ToastProvider';
import { useI18n } from '../../i18n';

interface Props {
  childId: string;
  documents: ChildDocument[];
  onUploadPress: () => void;
  onChange: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
}

const CATEGORY_BY_VALUE = Object.fromEntries(DOCUMENT_CATEGORIES.map((c) => [c.value, c]));

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function isImage(mimeType: string | null): boolean {
  return !!mimeType && mimeType.startsWith('image/');
}

export default function TabDocumentos({
  documents,
  onUploadPress,
  onChange,
  refreshing,
  onRefresh,
}: Props) {
  const t = useI18n(s => s.t);
  const toast = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleOpen(doc: ChildDocument) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { getSignedFileUrl } = await import('../../services/storage');
    const signed = await getSignedFileUrl('documents', doc.file_url, 3600);
    const target = signed || doc.file_url;
    Linking.openURL(target).catch(() => {
      toast.show({ message: t('toasts.common.fallbackError'), variant: 'error' });
    });
  }

  function handleDelete(doc: ChildDocument) {
    Alert.alert(
      'Excluir documento',
      `"${doc.name}" será removido permanentemente. Tem certeza?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(doc.id);
            const res = await deleteDocument(doc.id);
            setDeletingId(null);
            if (!res.success) {
              toast.show({ message: res.error || t('toasts.common.deleteFailed'), variant: 'error' });
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onChange();
            }
          },
        },
      ]
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['3xl'] }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined
      }
    >
      {/* Upload CTA */}
      <TouchableOpacity
        onPress={onUploadPress}
        activeOpacity={0.8}
        style={{
          backgroundColor: colors.brand,
          borderRadius: radius.lg,
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          marginBottom: spacing.lg,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: 'rgba(255,255,255,0.2)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="cloud-upload-outline" size={18} color="white" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: font.sizes.md, color: 'white', fontWeight: '700' }}>
            Adicionar documento
          </Text>
          <Text style={{ fontSize: font.sizes.xs, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
            Foto, PDF ou Word — até 10MB
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.85)" />
      </TouchableOpacity>

      {documents.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title={t('empty.childDocuments.title')}
          description={t('empty.childDocuments.description')}
        />
      ) : (
        documents.map((doc) => {
          const cat = CATEGORY_BY_VALUE[doc.category] ?? { icon: '📁', label: doc.category };
          const isDeleting = deletingId === doc.id;
          return (
            <TouchableOpacity
              key={doc.id}
              onPress={() => handleOpen(doc)}
              onLongPress={() => handleDelete(doc)}
              activeOpacity={0.7}
              style={{
                backgroundColor: colors.bgElevated,
                borderRadius: radius.lg,
                padding: spacing.md,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                marginBottom: spacing.sm,
                opacity: isDeleting ? 0.5 : 1,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: radius.md,
                  backgroundColor: colors.bgSurface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 20 }}>{isImage(doc.mime_type) ? '🖼️' : cat.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: font.sizes.md, color: colors.text, fontWeight: '600' }}
                  numberOfLines={1}
                >
                  {doc.name}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>{cat.label}</Text>
                  {doc.file_size ? (
                    <>
                      <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>·</Text>
                      <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>
                        {formatSize(doc.file_size)}
                      </Text>
                    </>
                  ) : null}
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>·</Text>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>
                    {new Date(doc.created_at).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </Text>
                </View>
              </View>
              {isDeleting ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <>
                  {/* Botão de excluir visível (não só long-press) — bug
                      Mauricio 2026-05-14: usuário não descobria que dava pra
                      excluir porque o long-press não era sugestivo. Ícone
                      lixeira em cinza-vermelho ao lado do chevron resolve sem
                      remover o long-press (que continua funcionando). */}
                  <TouchableOpacity
                    onPress={(ev) => {
                      ev.stopPropagation();
                      handleDelete(doc);
                    }}
                    hitSlop={10}
                    style={{ padding: 6, marginRight: -4 }}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </>
              )}
            </TouchableOpacity>
          );
        })
      )}

      {documents.length > 0 ? (
        <Text
          style={{
            fontSize: font.sizes.xs,
            color: colors.textMuted,
            textAlign: 'center',
            marginTop: spacing.md,
          }}
        >
          Toque para abrir · Lixeira ou pressione para excluir
        </Text>
      ) : null}
    </ScrollView>
  );
}
