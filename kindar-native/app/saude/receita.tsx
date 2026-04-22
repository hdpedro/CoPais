/**
 * OCR de Receita — foto da prescricao → AI extrai medicamentos → cria active_medications.
 * Mirrors PWA /saude/receita.
 */
/* eslint-disable jsx-a11y/alt-text */
import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Image, Alert, KeyboardAvoidingView, Platform, TextInput, Switch,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/store/auth';
import { supabase } from '../../src/lib/supabase';
import { fetchChildren, type Child } from '../../src/services/children';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';

interface ParsedMedication {
  name: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  notes: string | null;
  include: boolean;
}

type Step = 'upload' | 'processing' | 'preview';

export default function ReceitaScreen() {
  const insets = useSafeAreaInsets();
  const { activeGroup } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('upload');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [medications, setMedications] = useState<ParsedMedication[]>([]);
  const [doctorName, setDoctorName] = useState('');
  const [crm, setCrm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeGroup) {
      fetchChildren(activeGroup.groupId).then(list => {
        setChildren(list);
        if (list.length > 0) setSelectedChildId(list[0].id);
      });
    }
  }, [activeGroup]);

  const pickImage = useCallback(async (mode: 'camera' | 'library') => {
    if (!selectedChildId) { Alert.alert('Selecione uma crianca', 'Escolha a crianca antes de fotografar'); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const perm = mode === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permissao negada', mode === 'camera' ? 'Permissao de camera necessaria' : 'Permissao de galeria necessaria');
      return;
    }
    const result = mode === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, base64: true });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setImageUri(asset.uri);
    setStep('processing');
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessao expirada');
      const base64 = asset.base64;
      if (!base64) throw new Error('Imagem sem base64');

      const resp = await fetch(`${WEB_URL}/api/ai/parse-prescription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ image: `data:image/jpeg;base64,${base64}` }),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(txt || `Erro ${resp.status}`);
      }
      const data = await resp.json();

      const meds: ParsedMedication[] = (data.medications || []).map((m: { name?: string; dosage?: string; frequency?: string; duration?: string; notes?: string }) => ({
        name: m.name || '',
        dosage: m.dosage || null,
        frequency: m.frequency || null,
        duration: m.duration || null,
        notes: m.notes || null,
        include: true,
      }));

      if (meds.length === 0) {
        throw new Error('Nenhum medicamento identificado. Tente uma foto mais nitida ou outra receita.');
      }

      setMedications(meds);
      setDoctorName(data.doctor_name || '');
      setCrm(data.doctor_crm || '');
      setStep('preview');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message || 'Erro ao processar receita');
      setStep('upload');
      setImageUri(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [selectedChildId]);

  async function handleSave() {
    if (!activeGroup || !selectedChildId) return;
    const toSave = medications.filter(m => m.include && m.name.trim());
    if (toSave.length === 0) { Alert.alert('Nenhum medicamento selecionado', 'Marque ao menos um medicamento pra salvar'); return; }

    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const rows = toSave.map(m => ({
      group_id: activeGroup.groupId,
      child_id: selectedChildId,
      name: m.name.trim(),
      dosage: m.dosage?.trim() || null,
      frequency: m.frequency?.trim() || null,
      duration: m.duration?.trim() || null,
      notes: m.notes?.trim() || null,
      doctor_name: doctorName.trim() || null,
      doctor_crm: crm.trim() || null,
      status: 'active',
      start_date: new Date().toISOString().slice(0, 10),
    }));
    const { error: insertError } = await supabase.from('active_medications').insert(rows);
    setSaving(false);

    if (insertError) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erro', insertError.message);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }

  function updateMed(idx: number, field: keyof ParsedMedication, value: string | boolean) {
    setMedications(prev => prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m)));
  }

  function handleRetry() {
    setStep('upload');
    setImageUri(null);
    setMedications([]);
    setError(null);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text }}>
          Foto de receita
        </Text>
      </View>

      {children.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, flexGrow: 0 }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {children.map(c => {
              const active = selectedChildId === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  disabled={step === 'processing'}
                  onPress={() => setSelectedChildId(c.id)}
                  style={{
                    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                    backgroundColor: active ? colors.brand : colors.bgElevated,
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
        </ScrollView>
      ) : null}

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={{ backgroundColor: 'rgba(229,57,53,0.06)', borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(229,57,53,0.2)', padding: spacing.md, marginBottom: spacing.lg }}>
            <Text style={{ color: colors.error, fontSize: font.sizes.sm }}>{error}</Text>
          </View>
        ) : null}

        {step === 'upload' ? (
          <>
            <View style={{ alignItems: 'center', paddingVertical: spacing['2xl'], marginBottom: spacing.lg }}>
              <Text style={{ fontSize: 56, marginBottom: spacing.md }}>💊</Text>
              <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.sm, textAlign: 'center' }}>
                Fotografe a receita
              </Text>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, textAlign: 'center', maxWidth: 300, lineHeight: 20 }}>
                A IA le a receita e extrai medicamentos com dose, frequencia e duracao. Revise antes de salvar.
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => pickImage('camera')}
              activeOpacity={0.85}
              style={{
                backgroundColor: colors.brand, borderRadius: radius.md,
                paddingVertical: spacing.md + 2, alignItems: 'center',
                flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.sm,
              }}
            >
              <Ionicons name="camera-outline" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
                Tirar foto
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => pickImage('library')}
              activeOpacity={0.85}
              style={{
                backgroundColor: colors.bgElevated, borderRadius: radius.md,
                borderWidth: 1, borderColor: colors.borderLight,
                paddingVertical: spacing.md + 2, alignItems: 'center',
                flexDirection: 'row', justifyContent: 'center', gap: spacing.sm,
              }}
            >
              <Ionicons name="images-outline" size={20} color={colors.text} />
              <Text style={{ color: colors.text, fontSize: font.sizes.md, fontWeight: font.weights.medium }}>
                Escolher da galeria
              </Text>
            </TouchableOpacity>
          </>
        ) : null}

        {step === 'processing' ? (
          <View style={{ alignItems: 'center', paddingVertical: spacing['3xl'] }}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} accessibilityLabel="Receita fotografada" style={{ width: 200, height: 200, borderRadius: radius.lg, marginBottom: spacing.lg }} resizeMode="cover" />
            ) : null}
            <ActivityIndicator color={colors.brand} size="large" />
            <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text, marginTop: spacing.md }}>
              Lendo receita...
            </Text>
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 4 }}>
              Pode levar alguns segundos
            </Text>
          </View>
        ) : null}

        {step === 'preview' ? (
          <>
            <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.lg, ...shadows.sm, marginBottom: spacing.lg }}>
              <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.success, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm }}>
                ✓ {medications.length} medicamento{medications.length > 1 ? 's' : ''} identificado{medications.length > 1 ? 's' : ''}
              </Text>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>
                Revise os dados e ajuste se precisar. Desmarque medicamentos que nao quiser salvar.
              </Text>
            </View>

            {/* Doctor info */}
            <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
              <View style={{ flex: 2 }}>
                <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: 4 }}>Medico</Text>
                <TextInput
                  value={doctorName} onChangeText={setDoctorName}
                  placeholder="Dr. Fulano"
                  placeholderTextColor={colors.textMuted}
                  style={{
                    backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: font.sizes.sm, color: colors.text,
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: 4 }}>CRM</Text>
                <TextInput
                  value={crm} onChangeText={setCrm}
                  placeholder="12345"
                  placeholderTextColor={colors.textMuted}
                  style={{
                    backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: font.sizes.sm, color: colors.text,
                  }}
                />
              </View>
            </View>

            {/* Medications list */}
            {medications.map((m, i) => (
              <View
                key={i}
                style={{
                  backgroundColor: colors.bgElevated, borderRadius: radius.lg,
                  padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm,
                  opacity: m.include ? 1 : 0.5,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
                  <Switch
                    value={m.include}
                    onValueChange={v => updateMed(i, 'include', v)}
                    trackColor={{ true: colors.brand, false: colors.borderLight }}
                    thumbColor={m.include ? '#fff' : colors.textMuted}
                  />
                  <Text style={{ flex: 1, fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>
                    {m.name || '(sem nome)'}
                  </Text>
                </View>
                <TextInput
                  value={m.name}
                  onChangeText={v => updateMed(i, 'name', v)}
                  placeholder="Nome"
                  placeholderTextColor={colors.textMuted}
                  style={{
                    backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: font.sizes.sm, color: colors.text,
                    marginBottom: 6,
                  }}
                />
                <TextInput
                  value={m.dosage || ''}
                  onChangeText={v => updateMed(i, 'dosage', v)}
                  placeholder="Dose (ex: 500mg, 5ml)"
                  placeholderTextColor={colors.textMuted}
                  style={{
                    backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: font.sizes.sm, color: colors.text,
                    marginBottom: 6,
                  }}
                />
                <TextInput
                  value={m.frequency || ''}
                  onChangeText={v => updateMed(i, 'frequency', v)}
                  placeholder="Frequencia (ex: 8/8h, 2x ao dia)"
                  placeholderTextColor={colors.textMuted}
                  style={{
                    backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: font.sizes.sm, color: colors.text,
                    marginBottom: 6,
                  }}
                />
                <TextInput
                  value={m.duration || ''}
                  onChangeText={v => updateMed(i, 'duration', v)}
                  placeholder="Duracao (ex: 7 dias)"
                  placeholderTextColor={colors.textMuted}
                  style={{
                    backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: font.sizes.sm, color: colors.text,
                  }}
                />
              </View>
            ))}

            <TouchableOpacity
              disabled={saving}
              onPress={handleSave}
              activeOpacity={0.85}
              style={{
                backgroundColor: colors.brand, borderRadius: radius.md,
                paddingVertical: spacing.md + 2, alignItems: 'center',
                opacity: saving ? 0.5 : 1, marginTop: spacing.lg, marginBottom: spacing.sm,
              }}
            >
              {saving ? <ActivityIndicator color="#fff" /> : (
                <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
                  Salvar medicamentos
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleRetry} style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
              <Text style={{ color: colors.textMuted, fontSize: font.sizes.sm }}>Tentar com outra foto</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
