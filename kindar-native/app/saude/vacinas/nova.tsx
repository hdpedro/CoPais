/**
 * Nova vacina — form Native com autocomplete contra catálogo + duplicate retry.
 *
 * Espelha o PWA /saude/vacinas/nova:
 *  - Autocomplete digitando nome → server busca em vaccine_catalog
 *  - Dose suggestion via equivalence_group (motor)
 *  - Duplicate detection: ao salvar, se o motor retorna warning='duplicate_dose',
 *    mostra modal "Já registramos essa dose" + botão "Sim, registrar mesmo assim"
 *  - SUCCESS: redirect /saude/vacinas?postVaccine=<id> para mostrar modal
 *    opcional de "Reações leves nas próximas 48h"
 *
 * Tom calmo, sem juízo clínico.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from 'src/lib/supabase';
import { useI18n } from 'src/i18n';
import { useAuth } from 'src/store/auth';
import { reportError } from 'src/lib/error-reporter';
import { withTimeout } from 'src/lib/with-timeout';
import { recordVaccinationViaEngine, matchVaccineCatalog } from 'src/services/health';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import { DatePickerField, dateToIso } from 'src/components/ui/DateTimeField';
import ChildPicker from 'src/components/ui/ChildPicker';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

interface CatalogMatch {
  id: string;
  code: string;
  name: string;
  similarity: number;
}

interface Child {
  id: string;
  full_name: string;
}

export default function NovaVacinaScreen() {
  const params = useLocalSearchParams<{
    crianca?: string;
    duplicate?: string;
    vaccineName?: string;
    catalogId?: string;
    doseLabel?: string;
    doseNumber?: string;
    administeredDate?: string;
    batchNumber?: string;
    location?: string;
    notes?: string;
  }>();
  const t = useI18n((s) => s.t);
  const { userId, activeGroup } = useAuth();

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>(params.crianca || '');
  const [vaccineName, setVaccineName] = useState<string>(params.vaccineName || '');
  const [catalogId, setCatalogId] = useState<string | null>(params.catalogId || null);
  const [matches, setMatches] = useState<CatalogMatch[]>([]);
  const [searchingMatches, setSearchingMatches] = useState(false);
  const [doseLabel, setDoseLabel] = useState<string>(params.doseLabel || '');
  const [administeredDate, setAdministeredDate] = useState<string>(
    params.administeredDate || dateToIso(new Date()),
  );
  const [batchNumber, setBatchNumber] = useState<string>(params.batchNumber || '');
  const [location, setLocation] = useState<string>(params.location || '');
  const [notes, setNotes] = useState<string>(params.notes || '');
  const [saving, setSaving] = useState(false);
  const isDuplicateRetry = params.duplicate === '1';

  // Load children
  useEffect(() => {
    if (!activeGroup) return;
    withTimeout(
      supabase
        .from('children')
        .select('id, full_name')
        .eq('group_id', activeGroup.groupId)
        .order('birth_date'),
      6000,
      'NovaVacina.children',
    )
      .then(({ data }) => {
        const list = (data || []) as Child[];
        setChildren(list);
        if (!selectedChildId && list.length > 0) setSelectedChildId(list[0].id);
      })
      .catch((e) => reportError(e, { filePath: 'app/saude/vacinas/nova.tsx' }));
  }, [activeGroup, selectedChildId]);

  // Fuzzy match contra catálogo (debounced).
  // Mutamos `setMatches([])` SÓ no callback assíncrono (eslint-react: setState
  // direto no body do effect causa cascading render).
  useEffect(() => {
    if (catalogId || vaccineName.length < 2) {
      const handle = setTimeout(() => setMatches([]), 0);
      return () => clearTimeout(handle);
    }
    let cancelled = false;
    const startSearch = setTimeout(() => {
      if (cancelled) return;
      setSearchingMatches(true);
      matchVaccineCatalog(vaccineName)
        .then((results) => {
          if (!cancelled) setMatches(results);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setSearchingMatches(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(startSearch);
    };
  }, [vaccineName, catalogId]);

  const pickCatalog = useCallback((c: CatalogMatch) => {
    Haptics.selectionAsync();
    setCatalogId(c.id);
    setVaccineName(c.name);
    setMatches([]);
  }, []);

  async function handleSave(forceDuplicate = false) {
    if (!activeGroup || !selectedChildId || !userId) return;
    const name = vaccineName.trim();
    if (!name) {
      Alert.alert(t('common.error') || 'Erro', t('health.vaccineEngine.registerFieldName'));
      return;
    }
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const r = await recordVaccinationViaEngine({
      groupId: activeGroup.groupId,
      childId: selectedChildId,
      vaccineName: name,
      catalogId,
      doseLabel: doseLabel.trim() || null,
      doseNumber: params.doseNumber ? Number(params.doseNumber) : null,
      administeredDate,
      batchNumber: batchNumber.trim() || null,
      location: location.trim() || null,
      notes: notes.trim() || null,
      source: 'manual',
      forceDuplicate: forceDuplicate || isDuplicateRetry,
    });

    setSaving(false);

    if (!r.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t('common.error') || 'Erro', r.error || 'Falha');
      return;
    }

    // Duplicate sem force → mostra modal de confirmação
    if (r.warning === 'duplicate_dose' && !forceDuplicate) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        t('health.vaccineEngine.duplicateModalTitle'),
        t('health.vaccineEngine.duplicateModalBody', {
          vaccineName: name,
          doseNumber: String(r.doseNumber ?? '?'),
        }),
        [
          { text: t('health.vaccineEngine.duplicateModalCancel'), style: 'cancel' },
          {
            text: t('health.vaccineEngine.duplicateModalConfirm'),
            onPress: () => handleSave(true),
          },
        ],
      );
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Redireciona pra /saude/vacinas com flag postVaccine pra mostrar checklist 48h opt-in
    if (r.id) {
      router.replace(`/saude/vacinas?crianca=${selectedChildId}&postVaccine=${r.id}` as never);
    } else {
      router.replace(`/saude/vacinas?crianca=${selectedChildId}` as never);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <ScreenHeader title={t('health.vaccineEngine.registerTitle')} />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {isDuplicateRetry ? (
          <View
            style={{
              padding: spacing.md,
              borderRadius: radius.lg,
              backgroundColor: '#FFFBEB',
              borderWidth: 1,
              borderColor: '#FCD34D',
              marginBottom: spacing.md,
            }}
          >
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: '#92400E' }}>
              {t('health.vaccineEngine.duplicateModalTitle')}
            </Text>
            <Text style={{ fontSize: font.sizes.xs, color: '#92400E', marginTop: spacing.xs }}>
              {t('health.vaccineEngine.duplicateModalBody', {
                vaccineName: params.vaccineName || '',
                doseNumber: params.doseNumber || '?',
              })}
            </Text>
            <Text style={{ fontSize: 10, color: '#92400E', marginTop: spacing.xs, opacity: 0.8 }}>
              Os campos foram pré-preenchidos. Se for outra dose, clique em &quot;Salvar mesmo assim&quot;.
            </Text>
          </View>
        ) : null}

        {/* Criança */}
        {children.length > 1 ? (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={styles.label}>{t('health.child')}</Text>
            <ChildPicker
              items={children}
              selectedId={selectedChildId}
              onSelect={(id) => setSelectedChildId(id ?? '')}
              hideWhenSingle={false}
              testID="vacina-nova-child-picker"
            />
          </View>
        ) : null}

        {/* Nome (autocomplete) */}
        <View style={{ marginBottom: spacing.md }}>
          <Text style={styles.label}>{t('health.vaccineEngine.registerFieldName')} *</Text>
          <TextInput
            value={vaccineName}
            onChangeText={(val) => {
              setVaccineName(val);
              setCatalogId(null);
            }}
            placeholder={t('health.vaccineEngine.registerFieldName')}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            autoCapitalize="words"
          />
          {searchingMatches ? (
            <ActivityIndicator size="small" color={colors.brand} style={{ marginTop: spacing.xs }} />
          ) : null}
          {matches.length > 0 ? (
            <View
              style={{
                marginTop: spacing.xs,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.borderLight,
                overflow: 'hidden',
                backgroundColor: colors.bgElevated,
              }}
            >
              {matches.map((m, i) => (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => pickCatalog(m)}
                  accessibilityRole="button"
                  accessibilityLabel={`Selecionar ${m.name} do catálogo`}
                  style={{
                    padding: spacing.sm + 2,
                    borderTopWidth: i > 0 ? 0.5 : 0,
                    borderTopColor: colors.borderLight,
                  }}
                >
                  <Text style={{ fontSize: font.sizes.sm, color: colors.text }}>{m.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>

        {/* Dose */}
        <View style={{ marginBottom: spacing.md }}>
          <Text style={styles.label}>{t('health.vaccineEngine.registerFieldDose')}</Text>
          <TextInput
            value={doseLabel}
            onChangeText={setDoseLabel}
            placeholder="Ex: 1ª dose, reforço"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
            {t('health.vaccineEngine.registerFieldDoseHint')}
          </Text>
        </View>

        {/* Data */}
        <View style={{ marginBottom: spacing.md }}>
          <Text style={styles.label}>{t('health.vaccineEngine.registerFieldDate')} *</Text>
          <DatePickerField
            value={administeredDate}
            onChange={setAdministeredDate}
            maximumDate={new Date()}
          />
        </View>

        {/* Lote */}
        <View style={{ marginBottom: spacing.md }}>
          <Text style={styles.label}>{t('health.vaccineEngine.registerFieldBatch')}</Text>
          <TextInput
            value={batchNumber}
            onChangeText={setBatchNumber}
            placeholder={t('health.vaccineEngine.registerFieldBatch')}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
        </View>

        {/* Local */}
        <View style={{ marginBottom: spacing.md }}>
          <Text style={styles.label}>{t('health.vaccineEngine.registerFieldLocation')}</Text>
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder={t('health.vaccineEngine.registerFieldLocation')}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
        </View>

        {/* Notas */}
        <View style={{ marginBottom: spacing.lg }}>
          <Text style={styles.label}>{t('health.vaccineEngine.registerFieldNotes')}</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder={t('health.vaccineEngine.registerFieldNotes')}
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { height: 80 }]}
            multiline
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity
          onPress={() => handleSave(false)}
          disabled={saving || !vaccineName.trim() || !selectedChildId}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={isDuplicateRetry ? t('health.vaccineEngine.duplicateModalConfirm') : t('health.vaccineEngine.registerSave')}
          accessibilityState={{ disabled: saving || !vaccineName.trim() || !selectedChildId, busy: saving }}
          style={{
            backgroundColor: colors.brand,
            paddingVertical: spacing.md + 2,
            borderRadius: radius.md,
            alignItems: 'center',
            opacity: saving || !vaccineName.trim() || !selectedChildId ? 0.5 : 1,
            ...shadows.sm,
          }}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              {isDuplicateRetry ? <Ionicons name="checkmark" size={18} color="#fff" /> : null}
              <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
                {isDuplicateRetry
                  ? t('health.vaccineEngine.duplicateModalConfirm')
                  : t('health.vaccineEngine.registerSave')}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = {
  label: {
    fontSize: font.sizes.xs,
    fontWeight: font.weights.semibold,
    color: colors.text,
    marginBottom: 6,
  } as const,
  input: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    fontSize: font.sizes.sm,
    color: colors.text,
  } as const,
};
