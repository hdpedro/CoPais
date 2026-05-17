/**
 * Carteirinha de vacinação — OCR de foto da carteirinha SBP/PNI.
 *
 * 1. Usuário fotografa a carteirinha (capa + páginas com vacinas).
 * 2. Native envia multipart/form-data ao endpoint PWA `/api/ai/parse-vaccines`.
 * 3. AI lista cada vacina identificada (nome, dose, data, lote, local).
 * 4. Usuário revisa, marca quais salvar, escolhe a criança.
 * 5. Salva via `vaccination_records` em batch.
 *
 * Mirror funcional do PWA `src/app/(app)/saude/vacinas/carteirinha/page.tsx`.
 */
/* eslint-disable jsx-a11y/alt-text, @typescript-eslint/no-explicit-any */
import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Image, Alert, KeyboardAvoidingView, Platform, TextInput, Switch,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from 'src/store/auth';
import { supabase } from 'src/lib/supabase';
import { apiFetch } from 'src/lib/api-fetch';
import { fetchChildren, type Child } from 'src/services/children';
import ChildPicker from 'src/components/ui/ChildPicker';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';

interface ParsedVaccine {
  vaccine_name: string;
  dose_label: string | null;
  administered_date: string | null;
  batch_number: string | null;
  location: string | null;
  include: boolean;
}

type Step = 'upload' | 'confirm' | 'processing' | 'preview';

export default function CarteirinhaScreen() {
  const insets = useSafeAreaInsets();
  const { activeGroup } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('upload');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [vaccines, setVaccines] = useState<ParsedVaccine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeGroup) return;
    fetchChildren(activeGroup.groupId).then(list => {
      setChildren(list);
      if (list.length > 0) setSelectedChildId(list[0].id);
    });
  }, [activeGroup]);

  const [pendingAsset, setPendingAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);

  const pickImage = useCallback(async (mode: 'camera' | 'library') => {
    if (!selectedChildId) {
      Alert.alert('Selecione uma criança', 'Escolha a criança antes de fotografar a carteirinha.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const perm = mode === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permissão negada', mode === 'camera' ? 'Precisamos da permissão da câmera' : 'Precisamos da permissão da galeria');
      return;
    }
    const result = mode === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    // step="confirm" pra usuário revisar antes de gastar cota OCR
    setImageUri(asset.uri);
    setPendingAsset(asset);
    setStep('confirm');
    setError(null);
  }, [selectedChildId]);

  const processConfirmedImage = useCallback(async () => {
    if (!pendingAsset) return;
    const asset = pendingAsset;
    setStep('processing');
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada');

      // multipart/form-data — endpoint reads `request.formData().get("file")`.
      const fileMime = asset.mimeType || 'image/jpeg';
      const fileName = asset.fileName || `vaccines-${Date.now()}.jpg`;
      const form = new FormData();
      form.append('file', { uri: asset.uri, name: fileName, type: fileMime } as any);

      const resp = await fetch(`${WEB_URL}/api/ai/parse-vaccines`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      // Server may return HTML (Next.js 500/redirect page) when the route
      // throws before its own try/catch. Don't dump the raw HTML into the
      // error banner — show a friendly message and surface a snippet only
      // if it looks like JSON.
      if (!resp.ok) {
        const ct = resp.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const j = await resp.json().catch(() => null);
          throw new Error((j && j.error) || `Erro ${resp.status}`);
        }
        throw new Error(`Erro ao processar a foto (${resp.status}). Tente novamente em instantes.`);
      }
      const data = await resp.json();
      const parsed: ParsedVaccine[] = (data.vaccines || []).map((v: any) => ({
        vaccine_name: v.vaccine_name || '',
        dose_label: v.dose_label ?? null,
        administered_date: v.administered_date ?? null,
        batch_number: v.batch_number ?? null,
        location: v.location ?? null,
        include: true,
      }));
      if (parsed.length === 0) {
        throw new Error(data.error || 'Nenhuma vacina identificada. Tente uma foto mais nítida.');
      }
      setVaccines(parsed);
      setStep('preview');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message || 'Erro ao ler a carteirinha');
      setStep('upload');
      setImageUri(null);
      setPendingAsset(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [pendingAsset]);

  /** Cancela o asset e volta pro step upload. */
  const retakePhoto = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImageUri(null);
    setPendingAsset(null);
    setStep('upload');
    setError(null);
  }, []);

  function updateVaccine(idx: number, field: keyof ParsedVaccine, value: string | boolean | null) {
    setVaccines(prev => prev.map((v, i) => (i === idx ? { ...v, [field]: value } : v)));
  }

  async function handleSave() {
    if (!activeGroup || !selectedChildId) return;
    const toSave = vaccines.filter(v => v.include && v.vaccine_name.trim());
    if (toSave.length === 0) {
      Alert.alert('Nada para salvar', 'Marque ao menos uma vacina.');
      return;
    }
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Send to PWA bulk endpoint — server applies group/child gates and
    // enforces administered_date NOT NULL (DB constraint).
    const rows = toSave.map(v => ({
      vaccine_name: v.vaccine_name.trim().slice(0, 200),
      dose_label: v.dose_label?.trim().slice(0, 100) || null,
      administered_date: v.administered_date || null,
      batch_number: v.batch_number?.trim().slice(0, 100) || null,
      location: v.location?.trim().slice(0, 200) || null,
    }));
    const r = await apiFetch<{
      success: true;
      inserted: number;
      skipped?: number;
      skippedDetails?: Array<{ name: string; reason: string; rawDate: string }>;
    }>(`/api/health/vaccines-bulk`, {
      method: 'POST',
      body: {
        groupId: activeGroup.groupId,
        childId: selectedChildId,
        vaccines: rows,
      },
    });
    setSaving(false);
    if (!r.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erro', r.error || 'Falha ao salvar vacinas');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const skipped = r.data?.skipped ?? 0;
    const inserted = r.data?.inserted ?? 0;
    if (skipped > 0) {
      const list = (r.data?.skippedDetails || [])
        .slice(0, 5)
        .map(d => `· ${d.name} — ${d.reason}${d.rawDate ? ` ("${d.rawDate}")` : ''}`)
        .join('\n');
      const more = (r.data?.skippedDetails?.length || 0) > 5
        ? `\n... e mais ${(r.data?.skippedDetails?.length || 0) - 5}`
        : '';
      Alert.alert(
        `${inserted} vacinas salvas`,
        `${skipped} ${skipped === 1 ? 'pulada' : 'puladas'} por data inválida:\n\n${list}${more}\n\nEdite a foto ou as datas e tente de novo.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
      return;
    }

    router.back();
  }

  function handleRetry() {
    setStep('upload');
    setImageUri(null);
    setVaccines([]);
    setError(null);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text }}>
          Carteirinha de vacinação
        </Text>
      </View>

      <ChildPicker
        items={children}
        selectedId={selectedChildId}
        onSelect={(id) => setSelectedChildId(id)}
        disabled={step === 'processing'}
        containerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}
        testID="carteirinha-child-picker"
      />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={{ backgroundColor: 'rgba(229,57,53,0.06)', borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(229,57,53,0.2)', padding: spacing.md, marginBottom: spacing.lg }}>
            <Text style={{ color: colors.error, fontSize: font.sizes.sm }}>{error}</Text>
          </View>
        ) : null}

        {step === 'upload' ? (
          <>
            <View style={{ alignItems: 'center', paddingVertical: spacing['2xl'], marginBottom: spacing.lg }}>
              <Text style={{ fontSize: 56, marginBottom: spacing.md }}>💉</Text>
              <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.sm, textAlign: 'center' }}>
                Fotografe a carteirinha
              </Text>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, textAlign: 'center', maxWidth: 320, lineHeight: 20 }}>
                A IA lê a página com vacinas e identifica cada dose, lote e data. Revise antes de salvar.
              </Text>
            </View>

            <TouchableOpacity onPress={() => pickImage('camera')} activeOpacity={0.85}
              style={{ backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.md + 2, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
              <Ionicons name="camera-outline" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>Tirar foto</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => pickImage('library')} activeOpacity={0.85}
              style={{ backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, paddingVertical: spacing.md + 2, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: spacing.sm }}>
              <Ionicons name="images-outline" size={20} color={colors.text} />
              <Text style={{ color: colors.text, fontSize: font.sizes.md, fontWeight: font.weights.medium }}>Escolher da galeria</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {step === 'confirm' && imageUri ? (
          <View style={{ marginBottom: spacing.lg }}>
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.sm }}>
              A foto está nítida?
            </Text>
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 20 }}>
              Confira se as vacinas e datas estão legíveis. Fotos tremidas ou escuras geram resultado incompleto.
            </Text>
            <Image
              source={{ uri: imageUri }}
              accessibilityLabel="Carteirinha fotografada — revise antes de processar"
              style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: radius.lg, marginBottom: spacing.lg, backgroundColor: colors.bgElevated }}
              resizeMode="contain"
            />
            <View style={{ gap: spacing.sm }}>
              <PrimaryButton
                label="Processar carteirinha"
                onPress={processConfirmedImage}
                testID="carteirinha-process-button"
                accessibilityHint="Envia a foto pra IA identificar vacinas"
              />
              <PrimaryButton
                label="Refotografar"
                onPress={retakePhoto}
                variant="secondary"
                testID="carteirinha-retake-button"
              />
            </View>
          </View>
        ) : null}

        {step === 'processing' ? (
          <View style={{ alignItems: 'center', paddingVertical: spacing['3xl'] }}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} accessibilityLabel="Carteirinha fotografada" style={{ width: 200, height: 200, borderRadius: radius.lg, marginBottom: spacing.lg }} resizeMode="cover" />
            ) : null}
            <ActivityIndicator color={colors.brand} size="large" />
            <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text, marginTop: spacing.md }}>
              Identificando vacinas…
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
                ✓ {vaccines.length} vacina{vaccines.length > 1 ? 's' : ''} identificada{vaccines.length > 1 ? 's' : ''}
              </Text>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>
                Revise os dados e ajuste se precisar. Desmarque vacinas que não quiser salvar.
              </Text>
            </View>

            {vaccines.map((v, i) => (
              <View key={i} style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm, opacity: v.include ? 1 : 0.5 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
                  <Switch value={v.include} onValueChange={x => updateVaccine(i, 'include', x)}
                    trackColor={{ true: colors.brand, false: colors.borderLight }} thumbColor={v.include ? '#fff' : colors.textMuted} />
                  <Text style={{ flex: 1, fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>
                    {v.vaccine_name || '(sem nome)'}
                  </Text>
                </View>
                <TextInput value={v.vaccine_name} onChangeText={x => updateVaccine(i, 'vaccine_name', x)}
                  placeholder="Nome da vacina" placeholderTextColor={colors.textMuted}
                  style={{ backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: font.sizes.sm, color: colors.text, marginBottom: 6 }} />
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                  <TextInput value={v.dose_label || ''} onChangeText={x => updateVaccine(i, 'dose_label', x)}
                    placeholder="Dose (ex: 1ª, reforço)" placeholderTextColor={colors.textMuted}
                    style={{ flex: 1, backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: font.sizes.sm, color: colors.text }} />
                  <TextInput value={v.administered_date || ''} onChangeText={x => updateVaccine(i, 'administered_date', x)}
                    placeholder="AAAA-MM-DD" placeholderTextColor={colors.textMuted}
                    style={{ flex: 1, backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: font.sizes.sm, color: colors.text }} />
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TextInput value={v.batch_number || ''} onChangeText={x => updateVaccine(i, 'batch_number', x)}
                    placeholder="Lote (opcional)" placeholderTextColor={colors.textMuted}
                    style={{ flex: 1, backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: font.sizes.sm, color: colors.text }} />
                  <TextInput value={v.location || ''} onChangeText={x => updateVaccine(i, 'location', x)}
                    placeholder="Local (UBS, posto)" placeholderTextColor={colors.textMuted}
                    style={{ flex: 1, backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: font.sizes.sm, color: colors.text }} />
                </View>
              </View>
            ))}

            <TouchableOpacity disabled={saving} onPress={handleSave} activeOpacity={0.85}
              style={{ backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.md + 2, alignItems: 'center', opacity: saving ? 0.5 : 1, marginTop: spacing.lg, marginBottom: spacing.sm }}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
                  Salvar vacinas
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
