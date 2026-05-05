/**
 * Documentos — TELA NATIVA com paridade ao PWA /documentos.
 *
 * Antes: WebView do PWA via PWAWebView.
 * Agora: 100% React Native, lendo do MESMO Supabase que o PWA.
 *
 * Mostra todos os documentos do grupo familiar agrupados por criança,
 * com filtro por categoria, search, preview por tap, exclusão por
 * pressionar e upload via expo-document-picker / expo-image-picker.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Linking,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/store/auth';
import { fetchChildren, type Child } from '../../src/services/children';
import {
  fetchDocuments,
  deleteDocument,
  DOCUMENT_CATEGORIES,
  type Document,
} from '../../src/services/documents';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import EmptyState from '../../src/components/ui/EmptyState';
import UploadSheet from '../../src/components/criancas/UploadSheet';
import { colors, spacing, radius, font } from '../../src/design-system/tokens';

const CATEGORY_BY_VALUE = Object.fromEntries(DOCUMENT_CATEGORIES.map((c) => [c.value, c]));

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

export default function DocumentosScreen() {
  const { activeGroup, userId } = useAuth();
  const groupId = activeGroup?.groupId;

  const [docs, setDocs] = useState<Document[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | 'all'>('all');
  const [activeChild, setActiveChild] = useState<string | 'all'>('all');

  const [uploadOpen, setUploadOpen] = useState(false);

  const load = useCallback(async () => {
    if (!groupId) return;
    const [d, c] = await Promise.all([fetchDocuments(groupId), fetchChildren(groupId)]);
    setDocs(d);
    setChildren(c);
  }, [groupId]);

  // setState dentro do effect é intencional — bridge entre React state
  // e Supabase (que só pode rodar client-side, depois do mount).
  useEffect(() => {
    if (!groupId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [groupId, load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (activeCategory !== 'all' && d.category !== activeCategory) return false;
      if (activeChild !== 'all' && d.child_id !== activeChild) return false;
      if (q && !d.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [docs, search, activeCategory, activeChild]);

  // Group by child for display
  const grouped = useMemo(() => {
    const map: Record<string, { childName: string; items: Document[] }> = {};
    for (const d of filtered) {
      const key = d.child_id ?? 'group';
      const childName =
        children.find((c) => c.id === d.child_id)?.full_name?.split(' ')[0] ?? 'Família';
      if (!map[key]) map[key] = { childName, items: [] };
      map[key].items.push(d);
    }
    return Object.entries(map);
  }, [filtered, children]);

  async function handleOpen(doc: Document) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { getSignedFileUrl } = await import('../../src/services/storage');
    const signed = await getSignedFileUrl('documents', doc.file_url, 3600);
    const target = signed || doc.file_url;
    Linking.openURL(target).catch(() => Alert.alert('Erro', 'Não foi possível abrir.'));
  }

  function handleDelete(doc: Document) {
    Alert.alert('Excluir documento', `"${doc.name}" será removido. Tem certeza?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const res = await deleteDocument(doc.id);
          if (!res.success) Alert.alert('Erro', res.error);
          else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            load();
          }
        },
      },
    ]);
  }

  if (!groupId || !userId) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="Documentos" />
        <EmptyState icon="folder-outline" title="Sem grupo ativo" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title="Documentos"
        rightAction={{ icon: 'add-circle', onPress: () => setUploadOpen(true) }}
      />

      {/* Search + filters */}
      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: spacing.sm,
          backgroundColor: colors.bgElevated,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.borderLight,
          gap: spacing.sm,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.bgSurface,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            gap: spacing.sm,
          }}
        >
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por nome…"
            placeholderTextColor={colors.textMuted}
            style={{
              flex: 1,
              paddingVertical: spacing.sm,
              fontSize: font.sizes.md,
              color: colors.text,
            }}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Child filter chips */}
        {children.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm }}
          >
            <Chip
              label="Todas as crianças"
              active={activeChild === 'all'}
              onPress={() => setActiveChild('all')}
            />
            {children.map((c) => (
              <Chip
                key={c.id}
                label={c.full_name.split(' ')[0]}
                active={activeChild === c.id}
                onPress={() => setActiveChild(c.id)}
              />
            ))}
          </ScrollView>
        ) : null}

        {/* Category filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm }}
        >
          <Chip
            label="Todas categorias"
            active={activeCategory === 'all'}
            onPress={() => setActiveCategory('all')}
          />
          {DOCUMENT_CATEGORIES.map((c) => (
            <Chip
              key={c.value}
              icon={c.icon}
              label={c.label}
              active={activeCategory === c.value}
              onPress={() => setActiveCategory(c.value)}
            />
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : filtered.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ flex: 1, justifyContent: 'center' }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <EmptyState
            icon="folder-open-outline"
            title={docs.length === 0 ? 'Nenhum documento ainda' : 'Nada encontrado'}
            description={
              docs.length === 0
                ? 'Toque no + para adicionar o primeiro documento — RG, carteirinha, escolar.'
                : 'Tente outros filtros ou limpe a busca.'
            }
            action={
              docs.length === 0
                ? { label: 'Adicionar documento', onPress: () => setUploadOpen(true) }
                : undefined
            }
          />
        </ScrollView>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['3xl'] }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {grouped.map(([key, group]) => (
            <View key={key} style={{ marginBottom: spacing.lg }}>
              <Text
                style={{
                  fontSize: font.sizes.xs,
                  color: colors.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  fontWeight: '700',
                  marginBottom: spacing.sm,
                  paddingHorizontal: spacing.sm,
                }}
              >
                {group.childName} · {group.items.length}
              </Text>
              {group.items.map((doc) => {
                const cat = CATEGORY_BY_VALUE[doc.category] ?? { icon: '📁', label: doc.category };
                const isImage = !!doc.mime_type?.startsWith('image/');
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
                      <Text style={{ fontSize: 20 }}>{isImage ? '🖼️' : cat.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{ fontSize: font.sizes.md, color: colors.text, fontWeight: '600' }}
                        numberOfLines={1}
                      >
                        {doc.name}
                      </Text>
                      <Text
                        style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}
                      >
                        {cat.label}
                        {doc.file_size ? ` · ${formatSize(doc.file_size)}` : ''} ·{' '}
                        {new Date(doc.created_at).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          <Text
            style={{
              fontSize: font.sizes.xs,
              color: colors.textMuted,
              textAlign: 'center',
              marginTop: spacing.md,
            }}
          >
            Toque para abrir · Pressionar para excluir
          </Text>
        </ScrollView>
      )}

      <UploadSheet
        visible={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => {
          load();
        }}
        groupId={groupId}
        childId={activeChild === 'all' ? null : activeChild}
        uploadedBy={userId}
      />
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        borderRadius: radius.full,
        backgroundColor: active ? colors.brand : colors.bgSurface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {icon ? <Text style={{ fontSize: 12 }}>{icon}</Text> : null}
      <Text
        style={{
          fontSize: font.sizes.sm,
          color: active ? 'white' : colors.text,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
