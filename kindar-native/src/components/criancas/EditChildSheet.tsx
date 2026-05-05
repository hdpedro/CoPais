/**
 * EditChildSheet — bottom-sheet form to edit child profile.
 *
 * Native UX upgrades over the PWA inline form (src/app/(app)/criancas/[id]/
 * ChildDetailClient.tsx TabGeral):
 *   - CPF / RG inline masks (vs placeholder-only on web)
 *   - Allergy chip editor with × per chip + add field
 *     (vs single comma-joined string textbox)
 *   - Sex segmented control (web form omits sex entirely)
 *   - Native date wheel via DatePickerField (vs HTML <input type="date">)
 *   - Keyboard-aware bottom sheet with haptics on save
 *
 * Writes go through the existing children.updateChild service which uses
 * safeWrite (offline queue) → Supabase RLS enforces group membership, same
 * guarantee as the PWA's updateChild server action.
 */

import { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, Pressable, ScrollView,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { Child } from '../../services/children';
import { updateChild } from '../../services/children';
import { DatePickerField, isoDateToDisplay } from '../ui/DateTimeField';
import { colors, spacing, radius, font, shadows } from '../../design-system/tokens';

export function formatCpf(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 6);
  const p3 = digits.slice(6, 9);
  const p4 = digits.slice(9, 11);
  let out = p1;
  if (p2) out += '.' + p2;
  if (p3) out += '.' + p3;
  if (p4) out += '-' + p4;
  return out;
}

export function formatRg(raw: string): string {
  // No single canonical RG format in BR; we apply the SP-style 00.000.000-0
  // when it fits, otherwise pass-through (capped at 12 chars).
  const cleaned = raw.replace(/[^0-9Xx]/g, '').toUpperCase().slice(0, 9);
  if (cleaned.length <= 2) return cleaned;
  if (cleaned.length <= 5) return cleaned.slice(0, 2) + '.' + cleaned.slice(2);
  if (cleaned.length <= 8) return cleaned.slice(0, 2) + '.' + cleaned.slice(2, 5) + '.' + cleaned.slice(5);
  return cleaned.slice(0, 2) + '.' + cleaned.slice(2, 5) + '.' + cleaned.slice(5, 8) + '-' + cleaned.slice(8);
}

interface Props {
  visible: boolean;
  child: Child;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

export default function EditChildSheet(props: Props) {
  // The form lives in a child component keyed by `${child.id}-${visible}` so
  // it remounts (with fresh state) every time the sheet opens — avoids the
  // setState-in-effect anti-pattern.
  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
      <SheetBody key={`${props.child.id}-${props.visible ? 'open' : 'closed'}`} {...props} />
    </Modal>
  );
}

function SheetBody({ child, onClose, onSaved }: Props) {
  const [fullName, setFullName] = useState(child.full_name);
  const [birthDate, setBirthDate] = useState<string>(child.birth_date);
  const [sex, setSex] = useState<'M' | 'F' | null>(child.sex);
  const [cpf, setCpf] = useState<string>(child.cpf || '');
  const [rg, setRg] = useState<string>(child.rg || '');
  const [allergies, setAllergies] = useState<string[]>(child.allergies || []);
  const [allergyDraft, setAllergyDraft] = useState('');
  const [notes, setNotes] = useState<string>(child.notes || '');
  const [saving, setSaving] = useState(false);

  const canSave = useMemo(() => fullName.trim().length > 0 && !!birthDate && !saving, [fullName, birthDate, saving]);

  function addAllergy() {
    const next = allergyDraft.trim();
    if (!next) return;
    if (allergies.some(a => a.toLowerCase() === next.toLowerCase())) {
      setAllergyDraft('');
      return;
    }
    setAllergies([...allergies, next]);
    setAllergyDraft('');
    Haptics.selectionAsync();
  }

  function removeAllergy(idx: number) {
    setAllergies(allergies.filter((_, i) => i !== idx));
    Haptics.selectionAsync();
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await updateChild(child.id, {
      full_name: fullName.trim(),
      birth_date: birthDate,
      sex,
      cpf: cpf.trim() || null,
      rg: rg.trim() || null,
      allergies: allergies.length > 0 ? allergies : null,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await onSaved();
      onClose();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erro', result.error || 'Falha ao salvar');
    }
  }

  return (
    <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: '#00000080' }} />
        <View
          style={{
            backgroundColor: colors.bgElevated,
            borderTopLeftRadius: radius['2xl'],
            borderTopRightRadius: radius['2xl'],
            paddingTop: spacing.md,
            paddingBottom: 40,
            maxHeight: '92%',
          }}
        >
          {/* Drag handle */}
          <View
            style={{
              width: 36, height: 4, borderRadius: 2,
              backgroundColor: colors.borderLight,
              alignSelf: 'center', marginBottom: spacing.md,
            }}
          />

          {/* Header */}
          <View
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: spacing.xl, marginBottom: spacing.md,
            }}
          >
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
              Editar informações
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xl }}
          >
            {/* Nome completo */}
            <Label>Nome completo</Label>
            <TextInput
              testID="edit-child-name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Nome completo"
              placeholderTextColor={colors.textDim}
              style={inputStyle}
            />

            {/* Data de nascimento */}
            <Label>Data de nascimento</Label>
            <DatePickerField
              value={birthDate || null}
              onChange={(iso) => setBirthDate(iso || '')}
              placeholder="DD/MM/AAAA"
            />
            {birthDate ? (
              <Text style={hintStyle}>
                {ageHint(birthDate)} · {isoDateToDisplay(birthDate)}
              </Text>
            ) : null}

            {/* Sexo */}
            <Label>Sexo</Label>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {(
                [
                  { v: 'M' as const, label: 'Masculino' },
                  { v: 'F' as const, label: 'Feminino' },
                  { v: null as 'M' | 'F' | null, label: 'Não informar' },
                ]
              ).map((opt) => {
                const active = sex === opt.v;
                return (
                  <TouchableOpacity
                    key={String(opt.v)}
                    onPress={() => { Haptics.selectionAsync(); setSex(opt.v); }}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: active ? colors.brand : colors.borderLight,
                      backgroundColor: active ? `${colors.brand}10` : colors.bg,
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: font.sizes.sm,
                        fontWeight: active ? font.weights.semibold : font.weights.medium,
                        color: active ? colors.brand : colors.textSecondary,
                      }}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* CPF / RG */}
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
              <View style={{ flex: 1 }}>
                <Label>CPF</Label>
                <TextInput
                  testID="edit-child-cpf"
                  value={cpf}
                  onChangeText={(t) => setCpf(formatCpf(t))}
                  placeholder="000.000.000-00"
                  placeholderTextColor={colors.textDim}
                  keyboardType="number-pad"
                  maxLength={14}
                  style={inputStyle}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Label>RG</Label>
                <TextInput
                  testID="edit-child-rg"
                  value={rg}
                  onChangeText={(t) => setRg(formatRg(t))}
                  placeholder="00.000.000-0"
                  placeholderTextColor={colors.textDim}
                  maxLength={12}
                  style={inputStyle}
                />
              </View>
            </View>

            {/* Alergias */}
            <Label>Alergias</Label>
            {allergies.length > 0 ? (
              <View
                style={{
                  flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs,
                  marginBottom: spacing.sm,
                }}
              >
                {allergies.map((a, i) => (
                  <TouchableOpacity
                    key={`${a}-${i}`}
                    onPress={() => removeAllergy(i)}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 6,
                      backgroundColor: 'rgba(229,57,53,0.1)',
                      borderRadius: radius.full,
                    }}
                  >
                    <Text style={{ fontSize: font.sizes.xs, color: colors.error, fontWeight: font.weights.semibold }}>
                      {a}
                    </Text>
                    <Ionicons name="close-circle" size={14} color={colors.error} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TextInput
                testID="edit-child-allergy-draft"
                value={allergyDraft}
                onChangeText={setAllergyDraft}
                onSubmitEditing={addAllergy}
                placeholder="Ex: Amendoim"
                placeholderTextColor={colors.textDim}
                returnKeyType="done"
                style={[inputStyle, { flex: 1, marginBottom: 0 }]}
              />
              <TouchableOpacity
                onPress={addAllergy}
                disabled={allergyDraft.trim().length === 0}
                style={{
                  paddingHorizontal: spacing.lg,
                  borderRadius: radius.md,
                  backgroundColor: colors.brand,
                  justifyContent: 'center',
                  opacity: allergyDraft.trim().length === 0 ? 0.4 : 1,
                }}
              >
                <Ionicons name="add" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Anotações */}
            <Label>Anotações</Label>
            <TextInput
              testID="edit-child-notes"
              value={notes}
              onChangeText={setNotes}
              placeholder="Informações adicionais..."
              placeholderTextColor={colors.textDim}
              multiline
              style={[inputStyle, { minHeight: 88, textAlignVertical: 'top' }]}
            />

            {/* Save button */}
            <TouchableOpacity
              testID="edit-child-save"
              onPress={handleSave}
              disabled={!canSave}
              style={{
                marginTop: spacing.xl,
                backgroundColor: colors.brand,
                borderRadius: radius.md,
                paddingVertical: spacing.md + 2,
                alignItems: 'center',
                opacity: canSave ? 1 : 0.5,
                ...shadows.sm,
              }}
            >
              <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.bold }}>
                {saving ? 'Salvando…' : 'Salvar alterações'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
  );
}

function ageHint(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  const birth = new Date(y, m - 1, d);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const dm = now.getMonth() - birth.getMonth();
  if (dm < 0 || (dm === 0 && now.getDate() < birth.getDate())) years--;
  if (years < 1) {
    const months = Math.max(0, (now.getFullYear() - birth.getFullYear()) * 12 + dm);
    return `${months} ${months === 1 ? 'mês' : 'meses'}`;
  }
  return `${years} ${years === 1 ? 'ano' : 'anos'}`;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontSize: font.sizes.xs,
        fontWeight: font.weights.semibold,
        color: colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginTop: spacing.lg,
        marginBottom: 6,
      }}
    >
      {children}
    </Text>
  );
}

const inputStyle = {
  backgroundColor: colors.bg,
  borderWidth: 1,
  borderColor: colors.borderLight,
  borderRadius: radius.md,
  paddingHorizontal: spacing.md,
  paddingVertical: 10,
  fontSize: font.sizes.md,
  color: colors.text,
} as const;

const hintStyle = {
  fontSize: font.sizes.xs,
  color: colors.textMuted,
  marginTop: 4,
} as const;
