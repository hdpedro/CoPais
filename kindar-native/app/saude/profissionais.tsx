/**
 * Profissionais de Saúde — Lista + criar com address/CRM/notes,
 * matching PWA `/saude/profissionais/novo` form.
 */
import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, RefreshControl, Alert,
  KeyboardAvoidingView, Platform, ScrollView, Modal, Linking,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from 'src/lib/supabase';
import { safeWrite } from 'src/services/offline';
import { useAuth } from 'src/store/auth';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import EmptyState from 'src/components/ui/EmptyState';
import SwipeToDelete from 'src/components/ui/SwipeToDelete';
import { SkeletonList } from 'src/components/ui/Skeleton';
import { confirmDestructive } from 'src/components/ui/DestructiveConfirm';
import { PhoneInput } from 'src/components/ui/MaskedInputs';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import { useCollabRealtime } from 'src/hooks/useCollabRealtime';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';
import { formatCRM } from 'src/lib/format';

interface Professional {
  id: string;
  name: string;
  specialty: string;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  crm: string | null;
  notes: string | null;
}

function cleanWhatsApp(num: string | null): string {
  if (!num) return '';
  const d = num.replace(/\D/g, '');
  if (d.length < 8) return '';
  return d.length <= 11 ? '55' + d : d;
}

const SPECIALTIES = [
  'Pediatra', 'Dentista / Odontopediatra', 'Otorrino', 'Oftalmologista',
  'Dermatologista', 'Cardiologista', 'Ortopedista', 'Endocrinologista',
  'Neurologista', 'Psicólogo / Psiquiatra', 'Nutricionista',
  'Fonoaudiólogo', 'Fisioterapeuta', 'Outro',
];

export default function ProfissionaisScreen() {
  const { userId, activeGroup } = useAuth();
  const [profs, setProfs] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Professional | null>(null);
  const [viewing, setViewing] = useState<Professional | null>(null);
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [crm, setCrm] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const { data } = await supabase
      .from('medical_professionals')
      .select('id, name, specialty, phone, whatsapp, address, crm, notes')
      .eq('group_id', activeGroup.groupId)
      .order('name');
    setProfs((data || []) as Professional[]);
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useCollabRealtime({
    table: 'medical_professionals',
    groupId: activeGroup?.groupId,
    onChange: load,
    displayLabel: 'profissional',
    myUserId: userId,
  });

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function resetForm() {
    setEditing(null);
    setName(''); setSpecialty(''); setCrm(''); setPhone(''); setWhatsapp(''); setAddress(''); setNotes('');
  }

  function openEdit(p: Professional) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewing(null);
    setEditing(p);
    setName(p.name);
    setSpecialty(p.specialty || '');
    // Strip leading "CRM"/"CRO" so the input shows just the number — UX
    // expects the field to mean "registration number", not the prefixed
    // form. Saving keeps whatever the user types (we re-strip on display).
    setCrm(formatCRM(p.crm));
    setPhone(p.phone || '');
    setWhatsapp(p.whatsapp || '');
    setAddress(p.address || '');
    setNotes(p.notes || '');
    setShowForm(true);
  }

  async function handleSave() {
    if (!name.trim() || !specialty.trim() || !userId || !activeGroup) return;
    setSaving(true);
    const payload = {
      group_id: activeGroup.groupId,
      name: name.trim(),
      specialty: specialty.trim(),
      phone: phone.trim() || null,
      whatsapp: whatsapp.trim() || null,
      address: address.trim() || null,
      crm: formatCRM(crm) || null,
      notes: notes.trim() || null,
    };
    const result = editing
      ? await safeWrite({ table: 'medical_professionals', operation: 'update', payload: { id: editing.id, ...payload } })
      : await safeWrite({ table: 'medical_professionals', operation: 'insert', payload: { ...payload, created_by: userId } });
    setSaving(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowForm(false);
      resetForm();
      load();
    } else {
      Alert.alert('Erro', result.error || 'Falha');
    }
  }

  /**
   * Conta dependências antes do delete pro contexto enriquecido (Stripe-style).
   * Roda em paralelo via Promise.all pra ser rápido (< 300ms tipicamente).
   */
  async function countDependencies(profId: string): Promise<{ appointments: number; prescriptions: number }> {
    if (!activeGroup) return { appointments: 0, prescriptions: 0 };
    const [appts, presc] = await Promise.all([
      supabase
        .from('medical_appointments')
        .select('id', { count: 'exact', head: true })
        .eq('professional_id', profId),
      supabase
        .from('active_medications')
        .select('id', { count: 'exact', head: true })
        .eq('prescribed_by_id', profId),
    ]);
    return {
      appointments: appts.count ?? 0,
      prescriptions: presc.count ?? 0,
    };
  }

  async function handleDelete(p: Professional) {
    // Confirma com contexto enriquecido. SwipeToDelete também chama esse
    // handler — então centralizamos a UX aqui (ele passa a só executar).
    // Mas pra mantermos compat: SwipeToDelete já chamou confirm; aqui
    // executamos direto. Caller do modal de detalhe usa confirmDestructive
    // explícito (mais abaixo).
    await safeWrite({ table: 'medical_professionals', operation: 'delete', payload: { id: p.id } });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    load();
  }

  /**
   * Versão "rica" usada pelo modal de detalhe (não pelo swipe). Mostra
   * dependências antes de apagar.
   */
  async function handleDeleteWithContext(p: Professional) {
    const deps = await countDependencies(p.id);
    const ok = await confirmDestructive({
      title: `Apagar ${p.name}?`,
      consequences: [
        { count: deps.appointments, label: 'consultas usam ele/ela como profissional', impact: 'sem-vinculo' },
        { count: deps.prescriptions, label: 'medicamentos prescritos por ele/ela', impact: 'preservado' },
      ],
    });
    if (!ok) return;
    await handleDelete(p);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title="Profissionais"
        rightAction={{
          icon: showForm ? 'close' : 'add',
          onPress: () => {
            if (showForm) { setShowForm(false); resetForm(); } else { setShowForm(true); resetForm(); }
          },
        }}
      />

      {showForm ? (
        <ScrollView style={{ backgroundColor: colors.bgElevated, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }} contentContainerStyle={{ padding: spacing.xl }}>
          <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.md }}>
            {editing ? 'Editar profissional' : 'Novo profissional'}
          </Text>

          <Text style={{ fontSize: font.sizes.sm, color: colors.text, marginBottom: spacing.xs }}>Nome *</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Ex: Dra. Maria Silva" placeholderTextColor={colors.textDim} style={fieldStyle()} />

          <Text style={{ fontSize: font.sizes.sm, color: colors.text, marginBottom: spacing.xs, marginTop: spacing.md }}>Especialidade *</Text>
          <TextInput value={specialty} onChangeText={setSpecialty} placeholder="Ex: Pediatra" placeholderTextColor={colors.textDim} style={fieldStyle()} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.xs }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {SPECIALTIES.map(s => (
                <TouchableOpacity key={s} onPress={() => setSpecialty(s)}
                  style={{
                    paddingHorizontal: spacing.sm + 2, paddingVertical: 6, borderRadius: radius.full,
                    backgroundColor: specialty === s ? colors.brandLight : colors.bg,
                    borderWidth: 1, borderColor: specialty === s ? colors.brand : colors.borderLight,
                  }}>
                  <Text style={{ fontSize: font.sizes.xs, color: specialty === s ? colors.brand : colors.textSecondary }}>
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.sizes.sm, color: colors.text, marginBottom: spacing.xs }}>CRM/CRO</Text>
              <TextInput value={crm} onChangeText={setCrm} placeholder="Ex: 226050/RJ" placeholderTextColor={colors.textDim} style={fieldStyle()} keyboardType="default" />
            </View>
            <View style={{ flex: 2 }}>
              <Text style={{ fontSize: font.sizes.sm, color: colors.text, marginBottom: spacing.xs }}>Telefone</Text>
              <PhoneInput value={phone} onChangeText={setPhone} placeholder="(11) 99999-9999" style={fieldStyle()} />
            </View>
          </View>

          <Text style={{ fontSize: font.sizes.sm, color: colors.text, marginBottom: spacing.xs, marginTop: spacing.md }}>WhatsApp</Text>
          <PhoneInput value={whatsapp} onChangeText={setWhatsapp} placeholder="(11) 99999-9999" style={fieldStyle()} />

          <Text style={{ fontSize: font.sizes.sm, color: colors.text, marginBottom: spacing.xs, marginTop: spacing.md }}>Endereço</Text>
          <TextInput value={address} onChangeText={setAddress} placeholder="Rua, nº, bairro, cidade" placeholderTextColor={colors.textDim} style={fieldStyle()} />

          <Text style={{ fontSize: font.sizes.sm, color: colors.text, marginBottom: spacing.xs, marginTop: spacing.md }}>Observações</Text>
          <TextInput value={notes} onChangeText={setNotes} placeholder="Convênio aceito, dia de plantão, particularidades…" placeholderTextColor={colors.textDim} multiline style={[fieldStyle(), { minHeight: 80, textAlignVertical: 'top' }]} />

          <View style={{ marginTop: spacing.lg }}>
            <PrimaryButton
              label={editing ? 'Salvar alterações' : 'Adicionar profissional'}
              onPress={handleSave}
              loading={saving}
              disabled={!name.trim() || !specialty.trim()}
              testID="profissional-save-button"
            />
          </View>
        </ScrollView>
      ) : null}

      {loading && profs.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonList count={3} />
        </View>
      ) : null}
      <FlatList data={loading && profs.length === 0 ? [] : profs} keyExtractor={item => item.id} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : (
          <EmptyState
            icon="👨‍⚕️"
            title="Comece pelo pediatra"
            description={'Com cada profissional cadastrado:\n• Contato direto em 1 toque (WhatsApp/ligação)\n• Vínculo com consultas pra rastrear histórico\n• Ficha de emergência traz o pediatra automaticamente'}
            action={{ label: 'Adicionar profissional', onPress: () => setShowForm(true), accessibilityHint: 'Abre formulário pra cadastrar profissional' }}
          />
        )}
        renderItem={({ item }) => {
          const cleanCrm = formatCRM(item.crm);
          return (
            <View style={{ marginBottom: spacing.sm }}>
              <SwipeToDelete
                onDelete={() => handleDelete(item)}
                confirmTitle="Remover profissional"
                confirmMessage={`Remover ${item.name}? Consultas vinculadas ficam intactas.`}
              >
                <TouchableOpacity
                  onPress={() => {
                    Haptics.selectionAsync();
                    setViewing(item);
                  }}
                  activeOpacity={0.85}
                  style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, ...shadows.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
                >
                  <Text style={{ fontSize: 20 }}>👨‍⚕️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>{item.name}</Text>
                    <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
                      {item.specialty}{cleanCrm ? ` · CRM ${cleanCrm}` : ''}
                    </Text>
                    {item.phone || item.address ? (
                      <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>
                        {[item.phone, item.address].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
                </TouchableOpacity>
              </SwipeToDelete>
            </View>
          );
        }}
      />

      <ProfessionalDetailModal
        professional={viewing}
        onClose={() => setViewing(null)}
        onEdit={(p) => openEdit(p)}
        onDelete={(p) => {
          setViewing(null);
          handleDeleteWithContext(p);
        }}
      />
    </KeyboardAvoidingView>
  );
}

function ProfessionalDetailModal({
  professional,
  onClose,
  onEdit,
  onDelete,
}: {
  professional: Professional | null;
  onClose: () => void;
  onEdit: (p: Professional) => void;
  onDelete: (p: Professional) => void;
}) {
  if (!professional) return null;
  const p = professional;
  const cleanCrm = formatCRM(p.crm);
  const waNumber = cleanWhatsApp(p.whatsapp);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        accessibilityLabel="Fechar"
        accessibilityRole="button"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
      >
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingBottom: spacing['2xl'] }}>
          {/* Drag handle */}
          <View style={{ alignItems: 'center', paddingTop: spacing.sm }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight }} />
          </View>

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md }}>
            <Text style={{ fontSize: 28 }}>👨‍⚕️</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>{p.name}</Text>
              {p.specialty ? (
                <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 2 }}>{p.specialty}</Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.lg }}>
            {cleanCrm ? <Field label="CRM/CRO" value={cleanCrm} /> : null}
            {p.phone ? <Field label="Telefone" value={p.phone} /> : null}
            {p.whatsapp ? <Field label="WhatsApp" value={p.whatsapp} /> : null}
            {p.address ? <Field label="Endereço" value={p.address} /> : null}
            {p.notes ? <Field label="Observações" value={p.notes} /> : null}
            {!cleanCrm && !p.phone && !p.whatsapp && !p.address && !p.notes ? (
              <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted, fontStyle: 'italic' }}>
                Sem dados adicionais cadastrados.
              </Text>
            ) : null}
          </ScrollView>

          {/* Quick actions */}
          {(p.phone || waNumber) ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}>
              {p.phone ? (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`tel:${p.phone!.replace(/\D/g, '')}`)}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.borderLight }}
                >
                  <Ionicons name="call" size={16} color={colors.brand} />
                  <Text style={{ fontSize: font.sizes.sm, color: colors.brand, fontWeight: font.weights.medium }}>Ligar</Text>
                </TouchableOpacity>
              ) : null}
              {waNumber ? (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`https://wa.me/${waNumber}`)}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: '#25D36615', borderWidth: 1, borderColor: '#25D366' }}
                >
                  <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                  <Text style={{ fontSize: font.sizes.sm, color: '#1f9e4d', fontWeight: font.weights.medium }}>WhatsApp</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {/* Edit / Delete */}
          <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl }}>
            <TouchableOpacity
              onPress={() => onDelete(p)}
              style={{ paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight }}
            >
              <Ionicons name="trash-outline" size={18} color={colors.error} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onEdit(p)}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.brand }}
            >
              <Ionicons name="create-outline" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.bold }}>Editar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: '700' }}>
        {label}
      </Text>
      <Text style={{ fontSize: font.sizes.md, color: colors.text, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function fieldStyle() {
  return {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: font.sizes.md,
    color: colors.text,
  } as const;
}
