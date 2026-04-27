/**
 * Profissionais de Saúde — Lista + criar com address/CRM/notes,
 * matching PWA `/saude/profissionais/novo` form.
 */
import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, RefreshControl, Alert,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { safeWrite } from '../../src/services/offline';
import { useAuth } from '../../src/store/auth';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

interface Professional {
  id: string;
  name: string;
  specialty: string;
  phone: string | null;
  address: string | null;
  crm: string | null;
  notes: string | null;
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
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Professional | null>(null);
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [crm, setCrm] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const { data } = await supabase
      .from('medical_professionals')
      .select('id, name, specialty, phone, address, crm, notes')
      .eq('group_id', activeGroup.groupId)
      .order('name');
    setProfs((data || []) as Professional[]);
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function resetForm() {
    setEditing(null);
    setName(''); setSpecialty(''); setCrm(''); setPhone(''); setAddress(''); setNotes('');
  }

  function openEdit(p: Professional) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditing(p);
    setName(p.name);
    setSpecialty(p.specialty || '');
    setCrm(p.crm || '');
    setPhone(p.phone || '');
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
      address: address.trim() || null,
      crm: crm.trim() || null,
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

  async function handleDelete(p: Professional) {
    Alert.alert('Remover profissional', `Remover ${p.name}? Consultas vinculadas a ele(a) ficam intactas.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          await safeWrite({ table: 'medical_professionals', operation: 'delete', payload: { id: p.id } });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          load();
        },
      },
    ]);
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
              <Text style={{ fontSize: font.sizes.sm, color: colors.text, marginBottom: spacing.xs }}>CRM</Text>
              <TextInput value={crm} onChangeText={setCrm} placeholder="Opcional" placeholderTextColor={colors.textDim} style={fieldStyle()} keyboardType="default" />
            </View>
            <View style={{ flex: 2 }}>
              <Text style={{ fontSize: font.sizes.sm, color: colors.text, marginBottom: spacing.xs }}>Telefone</Text>
              <TextInput value={phone} onChangeText={setPhone} placeholder="Ex: (11) 99999-9999" placeholderTextColor={colors.textDim} keyboardType="phone-pad" style={fieldStyle()} />
            </View>
          </View>

          <Text style={{ fontSize: font.sizes.sm, color: colors.text, marginBottom: spacing.xs, marginTop: spacing.md }}>Endereço</Text>
          <TextInput value={address} onChangeText={setAddress} placeholder="Rua, nº, bairro, cidade" placeholderTextColor={colors.textDim} style={fieldStyle()} />

          <Text style={{ fontSize: font.sizes.sm, color: colors.text, marginBottom: spacing.xs, marginTop: spacing.md }}>Observações</Text>
          <TextInput value={notes} onChangeText={setNotes} placeholder="Convênio aceito, dia de plantão, particularidades…" placeholderTextColor={colors.textDim} multiline style={[fieldStyle(), { minHeight: 80, textAlignVertical: 'top' }]} />

          <TouchableOpacity onPress={handleSave} disabled={saving || !name.trim() || !specialty.trim()}
            style={{ backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.md + 2, alignItems: 'center', marginTop: spacing.lg, opacity: saving || !name.trim() ? 0.5 : 1 }}>
            {saving ? <ActivityIndicator color="#fff" /> : (
              <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.bold }}>
                {editing ? 'Salvar alterações' : 'Adicionar profissional'}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      ) : null}

      <FlatList data={profs} keyExtractor={item => item.id} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : (
          <View style={{ alignItems: 'center', paddingVertical: spacing['4xl'] }}>
            <Text style={{ fontSize: 32, marginBottom: spacing.md }}>👨‍⚕️</Text>
            <Text style={{ color: colors.textMuted }}>Nenhum profissional</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => openEdit(item)} onLongPress={() => handleDelete(item)} activeOpacity={0.85}
            style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Text style={{ fontSize: 20 }}>👨‍⚕️</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>{item.name}</Text>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
                {item.specialty}{item.crm ? ` · CRM ${item.crm}` : ''}
              </Text>
              {item.phone || item.address ? (
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>
                  {[item.phone, item.address].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
          </TouchableOpacity>
        )}
      />
    </KeyboardAvoidingView>
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
