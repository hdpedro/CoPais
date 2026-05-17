/**
 * Detalhe da vacina (Native) — paridade com PWA /saude/vacinas/[id].
 *
 * Hero verde + field rows + ações Editar/Excluir. Edit usa form inline
 * com mesmos campos. Delete confirma + dispara trigger que reabre
 * pendência se a vacina estava cobrindo overdue/due_soon.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from 'src/lib/supabase';
import { useI18n } from 'src/i18n';
import { useAuth } from 'src/store/auth';
import { reportError } from 'src/lib/error-reporter';
import { withTimeout } from 'src/lib/with-timeout';
import {
  updateVaccinationRecordViaEngine,
  deleteVaccinationRecordViaEngine,
} from 'src/services/health';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import { useToast } from 'src/components/ui/ToastProvider';
import { DatePickerField } from 'src/components/ui/DateTimeField';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

interface RecordData {
  id: string;
  child_id: string;
  group_id: string;
  vaccine_name: string;
  dose_label: string | null;
  dose_number: number | null;
  administered_date: string;
  batch_number: string | null;
  location: string | null;
  notes: string | null;
  source: string | null;
  catalog_id: string | null;
  created_at: string;
  author_name: string | null;
  child_name: string | null;
  catalog_name: string | null;
}

function formatBrDate(iso: string): string {
  return iso.split('-').reverse().join('/');
}

function formatRelative(iso: string): string {
  const d = new Date(iso).getTime();
  const ms = Date.now() - d;
  const days = Math.floor(ms / 86400000);
  if (days < 1) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 30) return `há ${days} dias`;
  if (days < 365) return `há ${Math.floor(days / 30)} meses`;
  return `há ${Math.floor(days / 365)} anos`;
}

export default function VaccineDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const t = useI18n((s) => s.t);
  const toast = useToast();
  const { userId } = useAuth();
  const recordId = params.id as string;

  const [record, setRecord] = useState<RecordData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editVaccineName, setEditVaccineName] = useState('');
  const [editDoseLabel, setEditDoseLabel] = useState('');
  const [editAdministeredDate, setEditAdministeredDate] = useState('');
  const [editBatchNumber, setEditBatchNumber] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const load = useCallback(async () => {
    if (!recordId) {
      setLoading(false);
      return;
    }
    try {
      const { data: rec } = await withTimeout(
        supabase
          .from('vaccination_records')
          .select(
            'id, child_id, group_id, vaccine_name, dose_label, dose_number, administered_date, batch_number, location, notes, source, catalog_id, created_at, profiles:created_by(full_name), children(full_name), vaccine_catalog(name)',
          )
          .eq('id', recordId)
          .maybeSingle(),
        7000,
        'VaccineDetail.load',
      );

      if (!rec) {
        setRecord(null);
        return;
      }

      const authorRaw = (rec as any).profiles as { full_name: string } | { full_name: string }[] | null;
      const childRaw = (rec as any).children as { full_name: string } | { full_name: string }[] | null;
      const catalogRaw = (rec as any).vaccine_catalog as { name: string } | { name: string }[] | null;

      const r: RecordData = {
        id: (rec as any).id,
        child_id: (rec as any).child_id,
        group_id: (rec as any).group_id,
        vaccine_name: (rec as any).vaccine_name,
        dose_label: (rec as any).dose_label || null,
        dose_number: (rec as any).dose_number || null,
        administered_date: (rec as any).administered_date,
        batch_number: (rec as any).batch_number || null,
        location: (rec as any).location || null,
        notes: (rec as any).notes || null,
        source: (rec as any).source || 'manual',
        catalog_id: (rec as any).catalog_id || null,
        created_at: (rec as any).created_at,
        author_name: Array.isArray(authorRaw) ? authorRaw[0]?.full_name : authorRaw?.full_name || null,
        child_name: Array.isArray(childRaw) ? childRaw[0]?.full_name : childRaw?.full_name || null,
        catalog_name: Array.isArray(catalogRaw) ? catalogRaw[0]?.name : catalogRaw?.name || null,
      };
      setRecord(r);
      // Inicializa form com valores atuais
      setEditVaccineName(r.vaccine_name);
      setEditDoseLabel(r.dose_label || '');
      setEditAdministeredDate(r.administered_date);
      setEditBatchNumber(r.batch_number || '');
      setEditLocation(r.location || '');
      setEditNotes(r.notes || '');
    } catch (e) {
      reportError(e, { filePath: 'app/saude/vacinas/[id].tsx', metadata: { recordId } });
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  useEffect(() => {
    // Lança load() em microtask pra não disparar setState direto no body
    // (eslint-react react-hooks/set-state-in-effect).
    const handle = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(handle);
  }, [load]);

  async function handleSave() {
    if (!record || !userId) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const r = await updateVaccinationRecordViaEngine({
      recordId: record.id,
      vaccineName: editVaccineName.trim() || undefined,
      doseLabel: editDoseLabel.trim() || null,
      administeredDate: editAdministeredDate || undefined,
      batchNumber: editBatchNumber.trim() || null,
      location: editLocation.trim() || null,
      notes: editNotes.trim() || null,
    });
    setSaving(false);
    if (r.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(false);
      load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: r.error || t('toasts.common.fallbackError'), variant: 'error' });
    }
  }

  function handleDelete() {
    if (!record) return;
    Alert.alert(
      'Excluir este registro?',
      'Se essa vacina estava cobrindo uma pendência, ela será reaberta como disponível no calendário.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sim, excluir',
          style: 'destructive',
          onPress: async () => {
            const r = await deleteVaccinationRecordViaEngine(record.id);
            if (r.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.replace(`/saude/vacinas?crianca=${record.child_id}` as never);
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              toast.show({ message: r.error || t('toasts.common.fallbackError'), variant: 'error' });
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={t('health.vaccineEngine.detailTitle')} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </View>
    );
  }

  if (!record) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={t('health.vaccineEngine.detailTitle')} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
          <Text style={{ fontSize: 40, marginBottom: spacing.md }}>🤔</Text>
          <Text style={{ color: colors.text, fontWeight: font.weights.semibold, marginBottom: spacing.xs }}>
            Registro não encontrado
          </Text>
          <Text style={{ color: colors.textMuted, textAlign: 'center', fontSize: font.sizes.xs }}>
            Pode ter sido excluído ou você não tem acesso.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            style={{ marginTop: spacing.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}
          >
            <Text style={{ color: colors.brand, fontWeight: font.weights.semibold }}>← Voltar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <ScreenHeader title={t('health.vaccineEngine.detailTitle')} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {/* Hero */}
        <View
          style={{
            backgroundColor: '#ECFDF5',
            borderRadius: radius.xl,
            borderWidth: 1,
            borderColor: '#A7F3D0',
            padding: spacing.lg + 2,
            flexDirection: 'row',
            gap: spacing.md,
            alignItems: 'flex-start',
            marginBottom: spacing.md,
            ...shadows.sm,
          }}
        >
          <View
            style={{
              width: 56, height: 56, borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.85)',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 30 }}>💉</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: font.weights.semibold, color: '#047857', textTransform: 'uppercase', letterSpacing: 1 }}>
              Vacina aplicada
            </Text>
            <Text style={{ fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: '#064E3B', marginTop: 2 }}>
              {record.vaccine_name}
            </Text>
            {record.dose_label ? (
              <Text style={{ fontSize: font.sizes.sm, color: '#065F46', marginTop: 4 }}>{record.dose_label}</Text>
            ) : null}
            <Text style={{ fontSize: font.sizes.xs, color: '#065F46', marginTop: 6 }}>
              Tomada em <Text style={{ fontWeight: font.weights.semibold }}>{formatBrDate(record.administered_date)}</Text>
            </Text>
          </View>
        </View>

        {/* Field rows OR Edit form */}
        {!editing ? (
          <View
            style={{
              backgroundColor: colors.bgElevated,
              borderRadius: radius.xl,
              borderWidth: 1,
              borderColor: colors.borderLight,
              overflow: 'hidden',
              marginBottom: spacing.md,
            }}
          >
            {record.batch_number ? <DetailRow label="Lote" value={record.batch_number} /> : null}
            {record.location ? <DetailRow label="Local" value={record.location} /> : null}
            {record.dose_number ? <DetailRow label="Dose número" value={String(record.dose_number)} /> : null}
            {record.catalog_name ? <DetailRow label="Catálogo" value={record.catalog_name} muted /> : null}
            {record.notes ? <DetailRow label="Observações" value={record.notes} /> : null}
            <DetailRow
              label="Registrado"
              value={`${record.author_name ? `por ${record.author_name} ` : ''}${formatRelative(record.created_at)}`}
              muted
            />
            <DetailRow
              label="Origem"
              value={record.source === 'ocr' ? 'Importado da carteirinha' : 'Cadastro manual'}
              muted
            />
          </View>
        ) : (
          <View style={{ marginBottom: spacing.md, gap: spacing.sm }}>
            <FieldCard label="Nome da vacina" required>
              <TextInput
                value={editVaccineName}
                onChangeText={setEditVaccineName}
                style={styles.input}
                autoCapitalize="words"
              />
            </FieldCard>
            <FieldCard label="Dose">
              <TextInput
                value={editDoseLabel}
                onChangeText={setEditDoseLabel}
                placeholder="Ex: 1ª dose, reforço"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </FieldCard>
            <FieldCard label="Data" required>
              <DatePickerField
                value={editAdministeredDate}
                onChange={(d) => setEditAdministeredDate(d || '')}
                maximumDate={new Date()}
              />
            </FieldCard>
            <FieldCard label="Lote">
              <TextInput value={editBatchNumber} onChangeText={setEditBatchNumber} style={styles.input} />
            </FieldCard>
            <FieldCard label="Local">
              <TextInput value={editLocation} onChangeText={setEditLocation} style={styles.input} />
            </FieldCard>
            <FieldCard label="Observações">
              <TextInput
                value={editNotes}
                onChangeText={setEditNotes}
                style={[styles.input, { height: 80 }]}
                multiline
                textAlignVertical="top"
              />
            </FieldCard>

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Salvar mudanças"
                accessibilityState={{ disabled: saving, busy: saving }}
                style={{
                  flex: 1,
                  backgroundColor: colors.brand,
                  paddingVertical: spacing.md,
                  borderRadius: radius.md,
                  alignItems: 'center',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
                    Salvar mudanças
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setEditing(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancelar"
                style={{
                  flex: 1,
                  backgroundColor: colors.bgSurface,
                  paddingVertical: spacing.md,
                  borderRadius: radius.md,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: colors.textMuted, fontSize: font.sizes.md, fontWeight: font.weights.medium }}>
                  Cancelar
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Actions */}
        {!editing ? (
          <View style={{ gap: spacing.sm }}>
            <TouchableOpacity
              onPress={() => setEditing(true)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Editar registro"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.sm,
                paddingVertical: spacing.md,
                borderRadius: radius.xl,
                backgroundColor: colors.brandLight,
              }}
            >
              <Ionicons name="create-outline" size={18} color={colors.brand} />
              <Text style={{ color: colors.brand, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>
                Editar registro
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDelete}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Excluir registro"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.sm,
                paddingVertical: spacing.md,
                borderRadius: radius.xl,
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#FCA5A5',
              }}
            >
              <Ionicons name="trash-outline" size={18} color="#DC2626" />
              <Text style={{ color: '#DC2626', fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>
                Excluir registro
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function DetailRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
        borderTopWidth: 0.5,
        borderTopColor: colors.borderLight,
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontWeight: font.weights.semibold,
          color: colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        {label}
      </Text>
      <Text style={{ fontSize: font.sizes.sm, color: muted ? colors.textMuted : colors.text, marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
}

function FieldCard({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.bgElevated,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.borderLight,
        padding: spacing.md,
      }}
    >
      <Text
        style={{
          fontSize: font.sizes.xs,
          fontWeight: font.weights.semibold,
          color: colors.text,
          marginBottom: spacing.xs,
        }}
      >
        {label} {required ? '*' : null}
      </Text>
      {children}
    </View>
  );
}

const styles = {
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    fontSize: font.sizes.sm,
    color: colors.text,
  } as const,
};
