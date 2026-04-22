/**
 * Documentos — Lista + upload. Paridade com PWA /documentos.
 */
import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl, Linking, Modal, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/store/auth';
import { fetchDocuments, uploadDocument, type Document } from '../../src/services/documents';
import { fetchChildren, type Child } from '../../src/services/children';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import FAB from '../../src/components/ui/FAB';
import EmptyState from '../../src/components/ui/EmptyState';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

const CAT_ICONS: Record<string, string> = { personal: '👤', health: '❤️', education: '🎓', legal: '⚖️', other: '📄' };
const CATEGORIES: { value: string; label: string }[] = [
  { value: 'personal', label: 'Pessoal' },
  { value: 'health', label: 'Saude' },
  { value: 'education', label: 'Educacao' },
  { value: 'legal', label: 'Juridico' },
  { value: 'other', label: 'Outro' },
];

interface PickedFile { uri: string; name: string; mimeType: string; size: number; }

export default function DocumentosScreen() {
  const { userId, activeGroup } = useAuth();
  const [docs, setDocs] = useState<Document[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [category, setCategory] = useState<string>('personal');
  const [childId, setChildId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (activeGroup) fetchChildren(activeGroup.groupId).then(setChildren);
  }, [activeGroup]);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    setDocs(await fetchDocuments(activeGroup.groupId));
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function openComposer() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFile(null); setDisplayName(''); setCategory('personal'); setChildId(null);
    setComposerOpen(true);
  }

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf', 'application/msword',
             'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets || result.assets.length === 0) return;
    const a = result.assets[0];
    const picked: PickedFile = {
      uri: a.uri,
      name: a.name || 'arquivo',
      mimeType: a.mimeType || 'application/octet-stream',
      size: a.size || 0,
    };
    setFile(picked);
    if (!displayName.trim()) {
      // default display name = filename without extension
      setDisplayName(picked.name.replace(/\.[^/.]+$/, ''));
    }
  }

  async function handleSubmit() {
    if (!activeGroup || !userId || !file || !displayName.trim()) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await uploadDocument({
      uri: file.uri, fileName: file.name, mimeType: file.mimeType, size: file.size,
      groupId: activeGroup.groupId, childId: childId,
      category, displayName: displayName.trim(), uploadedBy: userId,
    });
    setSubmitting(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setComposerOpen(false);
      await load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erro', result.error);
    }
  }

  const renderItem = ({ item }: { item: Document }) => (
    <TouchableOpacity onPress={() => item.file_url && Linking.openURL(item.file_url)} activeOpacity={0.7}
      style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <Text style={{ fontSize: 22 }}>{CAT_ICONS[item.category] || '📄'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>{item.name}</Text>
        <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
          {item.uploaderName}{item.childName ? ` · ${item.childName}` : ''}
        </Text>
      </View>
      <Ionicons name="open-outline" size={16} color={colors.textDim} />
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Documentos" />
      <FlatList data={docs} keyExtractor={item => item.id} renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : <EmptyState icon="📄" title="Nenhum documento" subtitle="Compartilhe documentos importantes" />}
      />
      <FAB onPress={openComposer} />

      <Modal visible={composerOpen} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setComposerOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} />
          <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: 40, maxHeight: '90%' }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.md }}>
              Novo documento
            </Text>
            <ScrollView>
              <TouchableOpacity
                onPress={pickFile}
                style={{
                  borderWidth: 1, borderStyle: 'dashed', borderColor: file ? colors.brand : colors.borderLight,
                  borderRadius: radius.md, padding: spacing.lg, alignItems: 'center', marginBottom: spacing.md,
                  backgroundColor: file ? `${colors.brand}10` : colors.bg,
                }}
              >
                <Ionicons name={file ? 'document-text-outline' : 'cloud-upload-outline'} size={28} color={file ? colors.brand : colors.textMuted} />
                <Text style={{ fontSize: font.sizes.sm, color: file ? colors.brand : colors.textSecondary, marginTop: 6, textAlign: 'center' }}>
                  {file ? file.name : 'Escolher arquivo (PDF, imagem, DOC — max 10MB)'}
                </Text>
                {file ? (
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>
                    {(file.size / 1024).toFixed(1)} KB
                  </Text>
                ) : null}
              </TouchableOpacity>

              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>Categoria</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
                {CATEGORIES.map(c => {
                  const active = category === c.value;
                  return (
                    <TouchableOpacity
                      key={c.value}
                      onPress={() => setCategory(c.value)}
                      style={{
                        paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                        backgroundColor: active ? colors.brand : colors.bg,
                        borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                      }}
                    >
                      <Text style={{ fontSize: 14 }}>{CAT_ICONS[c.value]}</Text>
                      <Text style={{ fontSize: font.sizes.sm, color: active ? '#fff' : colors.text, fontWeight: active ? font.weights.semibold : font.weights.normal }}>
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {children.length > 0 ? (
                <>
                  <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>Crianca (opcional)</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
                    <TouchableOpacity
                      onPress={() => setChildId(null)}
                      style={{
                        paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                        backgroundColor: childId === null ? colors.brand : colors.bg,
                        borderWidth: 1, borderColor: childId === null ? colors.brand : colors.borderLight,
                      }}
                    >
                      <Text style={{ fontSize: font.sizes.sm, color: childId === null ? '#fff' : colors.text }}>Geral</Text>
                    </TouchableOpacity>
                    {children.map(c => {
                      const active = childId === c.id;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          onPress={() => setChildId(c.id)}
                          style={{
                            paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                            backgroundColor: active ? colors.brand : colors.bg,
                            borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                          }}
                        >
                          <Text style={{ fontSize: font.sizes.sm, color: active ? '#fff' : colors.text }}>
                            {c.full_name.split(' ')[0]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : null}

              <TextInput
                value={displayName} onChangeText={setDisplayName}
                placeholder="Nome do documento"
                placeholderTextColor={colors.textMuted}
                style={{
                  backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                  paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                  fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg,
                }}
              />

              <TouchableOpacity
                disabled={submitting || !file || !displayName.trim()}
                onPress={handleSubmit}
                style={{
                  backgroundColor: colors.brand, borderRadius: radius.md,
                  paddingVertical: spacing.md + 2, alignItems: 'center',
                  opacity: submitting || !file || !displayName.trim() ? 0.5 : 1,
                }}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : (
                  <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
                    Enviar documento
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
