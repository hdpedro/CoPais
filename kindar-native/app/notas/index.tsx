/**
 * Notas Privadas — CRUD completo. Notas visiveis apenas ao autor.
 */
import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl, Modal, TextInput,
  ScrollView, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from 'src/store/auth';
import { fetchNotes, createNote, updateNote, deleteNote, type Note } from 'src/services/notes';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import ModalBackdrop from 'src/components/ui/ModalBackdrop';
import FAB from 'src/components/ui/FAB';
import EmptyState from 'src/components/ui/EmptyState';
import { SkeletonList } from 'src/components/ui/Skeleton';
import { useToast } from 'src/components/ui/ToastProvider';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

// Categories must match the CHECK constraint on private_notes.category
// (migration 00019). Aligning the labels with the PWA prevents UX drift
// between web and native.
type NoteCategory = 'lembrete' | 'observacao' | 'preparacao' | 'juridico' | 'outro';
const CATEGORIES: { value: NoteCategory; label: string; icon: string; color: string }[] = [
  { value: 'lembrete', label: 'Lembrete', icon: '📝', color: '#6B7280' },
  { value: 'observacao', label: 'Observação', icon: '👀', color: '#3B82F6' },
  { value: 'preparacao', label: 'Preparação', icon: '📋', color: '#F59E0B' },
  { value: 'juridico', label: 'Jurídico', icon: '⚖️', color: '#5B9E85' },
  { value: 'outro', label: 'Outro', icon: '✏️', color: '#E53935' },
];

export default function NotasScreen() {
  const t = useI18n(s => s.t);
  const toast = useToast();
  const { userId, activeGroup } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<NoteCategory>('lembrete');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!userId || !activeGroup) return;
    // Pass BOTH user_id AND group_id — the previous implementation passed
    // only user_id, which leaks notes between groups when the user has more
    // than one membership. Schema requires both columns NOT NULL.
    setNotes(await fetchNotes(userId, activeGroup.groupId));
    setLoading(false);
  }, [userId, activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function openCreate() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditing(null);
    setTitle(''); setContent(''); setCategory('lembrete');
    setComposerOpen(true);
  }

  function openEdit(note: Note) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditing(note);
    setTitle(note.title);
    setContent(note.content || '');
    const cat = (note.category as NoteCategory | null) ?? 'lembrete';
    setCategory(['lembrete','observacao','preparacao','juridico','outro'].includes(cat) ? cat : 'lembrete');
    setComposerOpen(true);
  }

  async function handleSubmit() {
    if (!userId || !activeGroup || !title.trim()) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = editing
      ? await updateNote(editing.id, {
          title: title.trim(),
          content: content.trim() || undefined,
          category,
        })
      : await createNote({
          userId,
          groupId: activeGroup.groupId,
          title,
          content: content.trim() || undefined,
          category,
        });
    setSubmitting(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setComposerOpen(false);
      await load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: t('toasts.common.saveFailed'), variant: 'error' });
    }
  }

  function handleDelete(note: Note) {
    Alert.alert(
      'Remover nota',
      `Remover "${note.title}"? Esta acao nao pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            const res = await deleteNote(note.id);
            if (res.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await load();
            }
          },
        },
      ]
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('notes.headerTitle')} />
      {loading && notes.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonList count={4} />
        </View>
      ) : null}
      <FlatList
        data={loading && notes.length === 0 ? [] : notes}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : <EmptyState icon="📝" title={t('empty.notas.title')} description={t('empty.notas.description')} />}
        renderItem={({ item }) => {
          const cat = CATEGORIES.find(c => c.value === (item as unknown as { category?: string }).category) || CATEGORIES[0];
          return (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => openEdit(item)}
              onLongPress={() => handleDelete(item)}
              style={{
                backgroundColor: colors.bgElevated, borderRadius: radius.lg,
                padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm,
                borderLeftWidth: 3, borderLeftColor: cat.color,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 }}>
                <Text style={{ fontSize: 14 }}>{cat.icon}</Text>
                <Text style={{ fontSize: font.sizes.xs, color: cat.color, fontWeight: font.weights.semibold, textTransform: 'uppercase' }}>
                  {cat.label}
                </Text>
              </View>
              <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>
                {item.title}
              </Text>
              {item.content ? (
                <Text numberOfLines={3} style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 4, lineHeight: 20 }}>
                  {item.content}
                </Text>
              ) : null}
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: spacing.xs }}>
                {new Date(item.updated_at).toLocaleDateString('pt-BR')}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
      <FAB onPress={openCreate} />

      <Modal visible={composerOpen} animationType="slide" transparent onRequestClose={() => setComposerOpen(false)}>
        <ModalBackdrop onClose={() => setComposerOpen(false)} align="bottom" dim={0.4} padding={0}>
          <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: 40, maxHeight: '90%' }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
                {editing ? 'Editar nota' : 'Nova nota'}
              </Text>
              {editing ? (
                <TouchableOpacity onPress={() => { setComposerOpen(false); handleDelete(editing); }}>
                  <Ionicons name="trash-outline" size={22} color={colors.error} />
                </TouchableOpacity>
              ) : null}
            </View>
            <ScrollView>
              {/* Category picker shown in both create and edit modes (PWA parity). */}
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
                        backgroundColor: active ? `${c.color}20` : colors.bg,
                        borderWidth: 1, borderColor: active ? c.color : colors.borderLight,
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                      }}
                    >
                      <Text style={{ fontSize: 14 }}>{c.icon}</Text>
                      <Text style={{ fontSize: font.sizes.sm, color: active ? c.color : colors.text, fontWeight: active ? font.weights.semibold : font.weights.normal }}>
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TextInput
                value={title} onChangeText={setTitle}
                placeholder="Titulo"
                placeholderTextColor={colors.textMuted}
                style={{
                  backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                  paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                  fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.sm,
                }}
              />
              <TextInput
                value={content} onChangeText={setContent}
                placeholder="Conteudo (opcional)"
                placeholderTextColor={colors.textMuted}
                multiline
                style={{
                  backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                  paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                  fontSize: font.sizes.md, color: colors.text, minHeight: 140, textAlignVertical: 'top',
                  marginBottom: spacing.lg,
                }}
              />

              <PrimaryButton
                label={editing ? 'Salvar' : 'Criar nota'}
                onPress={handleSubmit}
                loading={submitting}
                disabled={!title.trim()}
                testID="notas-submit"
              />
            </ScrollView>
          </View>
        </ModalBackdrop>
      </Modal>
    </View>
  );
}
