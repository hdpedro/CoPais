/**
 * Health Event Wizard — 3-step registration flow.
 * Step 1: Event type (symptom, medication, appointment, observation)
 * Step 2: Dynamic fields based on type
 * Step 3: Confirm & save
 */

import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from 'src/i18n';
import { useAuth } from 'src/store/auth';
import { useHealth } from 'src/hooks/useHealth';
import { supabase } from 'src/lib/supabase';
import { useCachedFetch } from 'src/lib/use-cached-fetch';
import { safeWrite } from 'src/services/offline';
import { notifyAction } from 'src/services/notify';
import { getBrazilToday } from 'src/lib/constants';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';
import { DatePickerField, TimePickerField, isoDateToDisplay } from 'src/components/ui/DateTimeField';
import ChildPicker from 'src/components/ui/ChildPicker';
import PrimaryButton from 'src/components/ui/PrimaryButton';

type EventType = 'illness' | 'medication' | 'treatment' | 'procedure' | 'appointment' | 'observation';

/** Profissional cadastrado do grupo — alimenta o seletor da consulta. */
interface AppointmentProfessional {
  id: string;
  name: string;
  specialty: string | null;
  address: string | null;
}

// User-facing label/desc are resolved via t() inside the component (see
// eventTypeLabel/eventTypeDesc) to avoid translating at module scope.
const EVENT_TYPES: Array<{ type: EventType; icon: string }> = [
  { type: 'illness', icon: '🤒' },
  { type: 'medication', icon: '💊' },
  { type: 'treatment', icon: '🩹' },
  { type: 'procedure', icon: '🩺' },
  { type: 'appointment', icon: '🏥' },
  { type: 'observation', icon: '📝' },
];

export default function RegistrarScreen() {
  const t = useI18n(s => s.t);
  const insets = useSafeAreaInsets();
  const { userId, activeGroup } = useAuth();
  const { data: healthData } = useHealth();

  // Profissionais cadastrados do grupo — alimentam o seletor da consulta e o
  // auto-preenchimento de especialidade/local. Mesmo padrão cache-first de
  // consultas.tsx/profissionais.tsx; cache key próprio pra não conflitar com o
  // shape completo (telefone/whatsapp/crm…) que a tela de profissionais grava.
  const { data: professionals } = useCachedFetch<AppointmentProfessional[]>({
    cacheKey: activeGroup ? `saude_prof_picker_${activeGroup.groupId}` : null,
    tag: 'registrar:profissionais:load',
    empty: [],
    fetcher: async () => {
      const { data } = await supabase
        .from('medical_professionals')
        .select('id, name, specialty, address')
        .eq('group_id', activeGroup!.groupId)
        .order('name');
      return (data || []) as AppointmentProfessional[];
    },
  });

  const eventTypeLabel = (type: EventType) => t(`healthRegister.type_${type}`);
  const eventTypeDesc = (type: EventType) => t(`healthRegister.typeDesc_${type}`);
  const [step, setStep] = useState(1);
  const [eventType, setEventType] = useState<EventType | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [, setError] = useState('');

  // Form fields
  const [title, setTitle] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [severity, setSeverity] = useState<'leve' | 'moderado' | 'grave'>('leve');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [location, setLocation] = useState('');
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  // Appointment date+time — bug Angelino 2026-05-16 iOS: o wizard salvava
  // `appointment_date: new Date().toISOString()` (data/hora atual) em vez
  // da data que o usuário escolhia, fazendo a consulta aparecer no
  // calendário no dia em que foi REGISTRADA, não no dia em que ACONTECE.
  // Default: amanhã às 09:00 — heurística "consulta marcada provavelmente
  // não é pra hoje", coerente com o PWA createAppointment.
  const [apptDate, setApptDate] = useState<string | null>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const d = String(tomorrow.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const [apptTime, setApptTime] = useState<string | null>('09:00');

  const children = healthData?.children || [];

  // Auto-select first child if only one
  if (children.length === 1 && !selectedChildId) {
    setSelectedChildId(children[0].id);
  }

  // Ao escolher um profissional cadastrado, vinculamos por professional_id
  // (não jogamos o nome solto nas observações) e PREENCHEMOS o máximo da tela:
  // especialidade e local. fill-if-empty — nunca sobrescreve o que o usuário
  // já digitou.
  function handleSelectProfessional(p: AppointmentProfessional | null) {
    Haptics.selectionAsync();
    setProfessionalId(p?.id ?? null);
    if (!p) return;
    if (!title.trim() && p.specialty) setTitle(p.specialty);
    if (!location.trim() && p.address) setLocation(p.address);
  }

  async function handleSave() {
    if (!userId || !activeGroup || !selectedChildId || !title) return;
    setSaving(true);
    setError('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const groupId = activeGroup.groupId;
    const today = getBrazilToday();

    let result: { success: boolean; error?: string; queued?: boolean };

    if (eventType === 'illness') {
      result = await safeWrite({
        table: 'illness_episodes',
        operation: 'insert',
        payload: {
          group_id: groupId, child_id: selectedChildId, title,
          symptoms: symptoms ? symptoms.split(',').map(s => s.trim()).filter(Boolean) : null,
          severity: severity || null, start_date: today, status: 'active',
          notes: notes || null, created_by: userId,
        },
      });
    } else if (eventType === 'medication' || eventType === 'treatment' || eventType === 'procedure') {
      result = await safeWrite({
        table: 'active_medications',
        operation: 'insert',
        payload: {
          group_id: groupId, child_id: selectedChildId, name: title,
          dosage: dosage || t('healthRegister.asPrescribed'), frequency: frequency || t('healthRegister.asPrescribed'),
          care_type: eventType, // 'medication' | 'treatment' | 'procedure' — discriminador (migration 00119)
          start_date: today, status: 'active', notes: notes || null, created_by: userId,
        },
      });
    } else if (eventType === 'appointment') {
      // Compose appointment_date como timestamptz com timezone BR explícito.
      // Igual ao service health.ts:createAppointment (linha 300) e PWA
      // createAppointment. SEM esse fix o calendário mostrava a consulta
      // no dia/hora em que ela foi REGISTRADA, não no dia em que acontece.
      const datetime = `${apptDate}T${apptTime}:00-03:00`;
      result = await safeWrite({
        table: 'medical_appointments',
        operation: 'insert',
        payload: {
          group_id: groupId, child_id: selectedChildId, title,
          appointment_date: datetime,
          // Vínculo relacional com o profissional cadastrado (mirrors PWA
          // createAppointment + consultas.tsx). Antes o nome ia solto nas
          // observações, sem virar FK — o histórico/ficha não cruzava.
          professional_id: professionalId || null,
          location: location || null, status: 'scheduled',
          notes: notes || null, created_by: userId,
        },
      });
    } else {
      // Observation → health_logs (includes group_id via child lookup)
      result = await safeWrite({
        table: 'health_logs',
        operation: 'insert',
        payload: {
          child_id: selectedChildId, log_type: 'other',
          value: title, notes: notes || null, logged_by: userId,
        },
      });
    }

    if (result.success) {
      if (!result.queued) {
        const childName = children.find(c => c.id === selectedChildId)?.full_name?.split(' ')[0] || '';
        notifyAction('health_event_created', groupId, { title, childName, eventType });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } else {
      setError(result.error || 'Erro ao salvar registro');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setSaving(false);
  }

  const canProceedStep2 = eventType !== null && selectedChildId !== null;
  // Appointments require both date AND time so the calendar lands on the
  // intended slot. Other event types only need a title.
  const canProceedStep3 =
    title.length > 0 &&
    (eventType !== 'appointment' || (!!apptDate && !!apptTime));

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      {/* Header */}
      <View style={{
        paddingTop: insets.top + spacing.sm, paddingBottom: spacing.md,
        paddingHorizontal: spacing.lg, backgroundColor: colors.bgElevated,
        borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
        flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      }}>
        <TouchableOpacity onPress={() => step > 1 ? setStep(step - 1) : router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel={step > 1 ? t('common.back') : t('common.close')}>
          <Ionicons name={step > 1 ? 'arrow-back' : 'close'} size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text, flex: 1 }}>
          {t('healthRegister.title')}
        </Text>
        <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted }}>
          {step}/3
        </Text>
      </View>

      {/* Progress bar */}
      <View style={{ height: 3, backgroundColor: colors.borderLight }}>
        <View style={{ height: 3, backgroundColor: colors.brand, width: `${(step / 3) * 100}%` }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ─── STEP 1: Type + Child ─── */}
        {step === 1 ? (
          <View>
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.xs }}>
              {t('healthRegister.step1Title')}
            </Text>
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.xl }}>
              {t('healthRegister.step1Subtitle')}
            </Text>

            {/* Event type cards */}
            {EVENT_TYPES.map(et => (
              <TouchableOpacity
                key={et.type}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setEventType(et.type);
                }}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityState={{ selected: eventType === et.type }}
                accessibilityLabel={eventTypeLabel(et.type)}
                accessibilityHint={eventTypeDesc(et.type)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: spacing.lg,
                  backgroundColor: eventType === et.type ? `${colors.brand}10` : colors.bgElevated,
                  borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm,
                  borderWidth: eventType === et.type ? 2 : 1,
                  borderColor: eventType === et.type ? colors.brand : colors.borderLight,
                }}
              >
                <Text style={{ fontSize: 28 }}>{et.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>
                    {eventTypeLabel(et.type)}
                  </Text>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>{eventTypeDesc(et.type)}</Text>
                </View>
                {eventType === et.type ? (
                  <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
                ) : null}
              </TouchableOpacity>
            ))}

            {/* Child selector */}
            {children.length > 1 ? (
              <View style={{ marginTop: spacing.xl }}>
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.textSecondary, marginBottom: spacing.md }}>
                  {t('health.child')}
                </Text>
                <ChildPicker
                  items={children}
                  selectedId={selectedChildId}
                  onSelect={(id) => setSelectedChildId(id ?? '')}
                  hideWhenSingle={false}
                  testID="registrar-child-picker"
                />
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ─── STEP 2: Dynamic fields ─── */}
        {step === 2 ? (
          <View>
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.xs }}>
              {eventType === 'illness' ? t('healthRegister.step2TitleIllness')
                : eventType === 'medication' ? t('healthRegister.step2TitleMedication')
                  : eventType === 'treatment' ? t('healthRegister.step2TitleTreatment')
                    : eventType === 'procedure' ? t('healthRegister.step2TitleProcedure')
                      : eventType === 'appointment' ? t('healthRegister.step2TitleAppointment')
                        : t('healthRegister.step2TitleObservation')}
            </Text>
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.xl }}>
              {t('healthRegister.step2Subtitle')}
            </Text>

            {/* Title (always) */}
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.authText, marginBottom: spacing.xs }}>
              {eventType === 'medication' ? t('health.medicationName')
                : eventType === 'treatment' ? t('healthRegister.treatmentNameLabel')
                  : eventType === 'procedure' ? t('healthRegister.procedureNameLabel')
                    : eventType === 'appointment' ? t('healthRegister.appointmentSpecialtyLabel')
                      : t('healthRegister.titleLabel')}
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={eventType === 'illness' ? t('healthRegister.titlePlaceholderIllness')
                : eventType === 'medication' ? t('healthRegister.titlePlaceholderMedication')
                  : eventType === 'treatment' ? t('healthRegister.treatmentNamePlaceholder')
                    : eventType === 'procedure' ? t('healthRegister.procedureNamePlaceholder')
                      : eventType === 'appointment' ? t('healthRegister.appointmentSpecialtyPlaceholder')
                        : t('healthRegister.titlePlaceholderObservation')}
              placeholderTextColor={colors.textDim}
              style={{
                backgroundColor: colors.bgElevated, borderRadius: radius.md,
                borderWidth: 1, borderColor: colors.borderLight,
                paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                fontSize: font.sizes.md, color: colors.text,
                marginBottom: spacing.lg,
              }}
            />

            {/* Type-specific fields */}
            {eventType === 'illness' ? (
              <>
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.authText, marginBottom: spacing.xs }}>
                  {t('healthRegister.symptomsLabel')}
                </Text>
                <TextInput
                  value={symptoms}
                  onChangeText={setSymptoms}
                  placeholder={t('healthRegister.symptomsPlaceholder')}
                  placeholderTextColor={colors.textDim}
                  style={{
                    backgroundColor: colors.bgElevated, borderRadius: radius.md,
                    borderWidth: 1, borderColor: colors.borderLight,
                    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                    fontSize: font.sizes.md, color: colors.text,
                    marginBottom: spacing.lg,
                  }}
                />

                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.authText, marginBottom: spacing.sm }}>
                  {t('health.severity')}
                </Text>
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
                  {([
                    { val: 'leve' as const, label: t('health.severityMild'), icon: '🟢' },
                    { val: 'moderado' as const, label: t('health.severityModerate'), icon: '🟡' },
                    { val: 'grave' as const, label: t('health.severityGrave'), icon: '🔴' },
                  ]).map(s => (
                    <TouchableOpacity
                      key={s.val}
                      onPress={() => setSeverity(s.val)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: severity === s.val }}
                      accessibilityLabel={t('healthRegister.severityA11y', { level: s.label })}
                      style={{
                        flex: 1, paddingVertical: spacing.md, borderRadius: radius.md,
                        backgroundColor: severity === s.val ? `${colors.brand}10` : colors.bgElevated,
                        borderWidth: severity === s.val ? 2 : 1,
                        borderColor: severity === s.val ? colors.brand : colors.borderLight,
                        alignItems: 'center', gap: spacing.xs,
                      }}
                    >
                      <Text>{s.icon}</Text>
                      <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.medium, color: colors.text }}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}

            {eventType === 'medication' ? (
              <>
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.authText, marginBottom: spacing.xs }}>
                  {t('health.dosage')}
                </Text>
                <TextInput
                  value={dosage}
                  onChangeText={setDosage}
                  placeholder={t('healthRegister.dosagePlaceholder')}
                  placeholderTextColor={colors.textDim}
                  style={{
                    backgroundColor: colors.bgElevated, borderRadius: radius.md,
                    borderWidth: 1, borderColor: colors.borderLight,
                    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                    fontSize: font.sizes.md, color: colors.text,
                    marginBottom: spacing.lg,
                  }}
                />
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.authText, marginBottom: spacing.xs }}>
                  {t('health.frequency')}
                </Text>
                <TextInput
                  value={frequency}
                  onChangeText={setFrequency}
                  placeholder={t('healthRegister.frequencyPlaceholder')}
                  placeholderTextColor={colors.textDim}
                  style={{
                    backgroundColor: colors.bgElevated, borderRadius: radius.md,
                    borderWidth: 1, borderColor: colors.borderLight,
                    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                    fontSize: font.sizes.md, color: colors.text,
                    marginBottom: spacing.lg,
                  }}
                />
              </>
            ) : null}

            {eventType === 'treatment' ? (
              <>
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.authText, marginBottom: spacing.xs }}>
                  {t('healthRegister.treatmentGuidanceLabel')}
                </Text>
                <TextInput
                  value={dosage}
                  onChangeText={setDosage}
                  placeholder={t('healthRegister.treatmentGuidancePlaceholder')}
                  placeholderTextColor={colors.textDim}
                  style={{
                    backgroundColor: colors.bgElevated, borderRadius: radius.md,
                    borderWidth: 1, borderColor: colors.borderLight,
                    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                    fontSize: font.sizes.md, color: colors.text,
                    marginBottom: spacing.lg,
                  }}
                />
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.authText, marginBottom: spacing.xs }}>
                  {t('health.frequency')}
                </Text>
                <TextInput
                  value={frequency}
                  onChangeText={setFrequency}
                  placeholder={t('healthRegister.frequencyPlaceholder')}
                  placeholderTextColor={colors.textDim}
                  style={{
                    backgroundColor: colors.bgElevated, borderRadius: radius.md,
                    borderWidth: 1, borderColor: colors.borderLight,
                    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                    fontSize: font.sizes.md, color: colors.text,
                    marginBottom: spacing.lg,
                  }}
                />
              </>
            ) : null}

            {eventType === 'procedure' ? (
              <>
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.authText, marginBottom: spacing.xs }}>
                  {t('healthRegister.procedureDetailsLabel')}
                </Text>
                <TextInput
                  value={dosage}
                  onChangeText={setDosage}
                  placeholder={t('healthRegister.procedureDetailsPlaceholder')}
                  placeholderTextColor={colors.textDim}
                  style={{
                    backgroundColor: colors.bgElevated, borderRadius: radius.md,
                    borderWidth: 1, borderColor: colors.borderLight,
                    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                    fontSize: font.sizes.md, color: colors.text,
                    marginBottom: spacing.lg,
                  }}
                />
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.authText, marginBottom: spacing.xs }}>
                  {t('healthRegister.whenToRepeatLabel')}
                </Text>
                <TextInput
                  value={frequency}
                  onChangeText={setFrequency}
                  placeholder={t('healthRegister.whenToRepeatPlaceholder')}
                  placeholderTextColor={colors.textDim}
                  style={{
                    backgroundColor: colors.bgElevated, borderRadius: radius.md,
                    borderWidth: 1, borderColor: colors.borderLight,
                    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                    fontSize: font.sizes.md, color: colors.text,
                    marginBottom: spacing.lg,
                  }}
                />
              </>
            ) : null}

            {eventType === 'appointment' ? (
              <>
                {/* Profissional — seletor dos profissionais cadastrados no grupo.
                    Vincula por professional_id (mirrors consultas.tsx/PWA) e, ao
                    escolher, preenche Especialidade + Local automaticamente. */}
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.authText, marginBottom: spacing.xs }}>
                  {t('healthRegister.appointmentProfessionalLabel')}
                </Text>
                {professionals.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <TouchableOpacity
                        onPress={() => handleSelectProfessional(null)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: professionalId === null }}
                        accessibilityLabel={t('appointments.noProfessional')}
                        style={chipStyle(professionalId === null)}
                      >
                        <Text style={{ fontSize: font.sizes.sm, color: professionalId === null ? '#fff' : colors.text }}>
                          {t('appointments.noProfessional')}
                        </Text>
                      </TouchableOpacity>
                      {professionals.map(p => (
                        <TouchableOpacity
                          key={p.id}
                          onPress={() => handleSelectProfessional(p)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: professionalId === p.id }}
                          accessibilityLabel={p.specialty ? `${p.name} — ${p.specialty}` : p.name}
                          style={chipStyle(professionalId === p.id)}
                        >
                          <Text numberOfLines={1} style={{ fontSize: font.sizes.sm, maxWidth: 180, color: professionalId === p.id ? '#fff' : colors.text }}>
                            👨‍⚕️ {p.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                ) : null}
                <TouchableOpacity
                  onPress={() => { Haptics.selectionAsync(); router.push('/saude/profissionais'); }}
                  accessibilityRole="button"
                  accessibilityLabel={t('health.appointmentForm.registerNewProfessional')}
                  hitSlop={8}
                  style={{ marginTop: spacing.sm, marginBottom: spacing.lg }}
                >
                  <Text style={{ fontSize: font.sizes.sm, color: colors.brand, fontWeight: font.weights.medium }}>
                    {t('health.appointmentForm.registerNewProfessional')}
                  </Text>
                </TouchableOpacity>

                {/* Data + Hora — campos obrigatórios para appointment.
                    DatePickerField/TimePickerField usam o picker nativo
                    iOS/Android e armazenam ISO/HH:MM strings. */}
                <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
                  <View style={{ flex: 3 }}>
                    <DatePickerField
                      label={t('healthRegister.appointmentDateLabel')}
                      value={apptDate}
                      onChange={setApptDate}
                      placeholder={t('healthRegister.datePlaceholder')}
                    />
                  </View>
                  <View style={{ flex: 2 }}>
                    <TimePickerField
                      label={t('healthRegister.appointmentTimeLabel')}
                      value={apptTime}
                      onChange={setApptTime}
                      placeholder={t('healthRegister.timePlaceholder')}
                    />
                  </View>
                </View>

                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.authText, marginBottom: spacing.xs }}>
                  {t('health.location')}
                </Text>
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder={t('healthRegister.locationPlaceholder')}
                  placeholderTextColor={colors.textDim}
                  style={{
                    backgroundColor: colors.bgElevated, borderRadius: radius.md,
                    borderWidth: 1, borderColor: colors.borderLight,
                    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                    fontSize: font.sizes.md, color: colors.text,
                    marginBottom: spacing.lg,
                  }}
                />
              </>
            ) : null}

            {/* Notes (always) */}
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.authText, marginBottom: spacing.xs }}>
              {t('healthRegister.notesLabel')}
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t('healthRegister.notesPlaceholder')}
              placeholderTextColor={colors.textDim}
              multiline
              numberOfLines={3}
              style={{
                backgroundColor: colors.bgElevated, borderRadius: radius.md,
                borderWidth: 1, borderColor: colors.borderLight,
                paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                fontSize: font.sizes.md, color: colors.text,
                minHeight: 80, textAlignVertical: 'top',
              }}
            />
          </View>
        ) : null}

        {/* ─── STEP 3: Confirm ─── */}
        {step === 3 ? (
          <View>
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.xs }}>
              {t('healthRegister.step3Title')}
            </Text>
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.xl }}>
              {t('healthRegister.step3Subtitle')}
            </Text>

            <View style={{
              backgroundColor: colors.bgElevated, borderRadius: radius.xl,
              padding: spacing.xl, ...shadows.sm,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }}>
                <Text style={{ fontSize: 28 }}>
                  {EVENT_TYPES.find(e => e.type === eventType)?.icon}
                </Text>
                <View>
                  <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
                    {title}
                  </Text>
                  <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>
                    {eventType ? eventTypeLabel(eventType) : ''}
                  </Text>
                </View>
              </View>

              {/* Summary rows */}
              {[
                { label: t('health.child'), value: children.find(c => c.id === selectedChildId)?.full_name?.split(' ')[0] },
                eventType === 'illness' ? { label: t('health.severity'), value: severity } : null,
                eventType === 'illness' && symptoms ? { label: t('healthRegister.symptomsSummary'), value: symptoms } : null,
                eventType === 'medication' && dosage ? { label: t('health.dosage'), value: dosage } : null,
                eventType === 'medication' && frequency ? { label: t('health.frequency'), value: frequency } : null,
                eventType === 'treatment' && dosage ? { label: t('healthRegister.treatmentGuidanceLabel'), value: dosage } : null,
                eventType === 'treatment' && frequency ? { label: t('health.frequency'), value: frequency } : null,
                eventType === 'procedure' && dosage ? { label: t('healthRegister.procedureDetailsLabel'), value: dosage } : null,
                eventType === 'procedure' && frequency ? { label: t('healthRegister.whenToRepeatLabel'), value: frequency } : null,
                // Appointment summary: show the scheduled slot the user picked.
                // Critical for catching mistakes BEFORE saving (e.g. defaulting
                // to "amanhã 09:00" when intended next Friday 18:00).
                eventType === 'appointment' ? { label: t('healthRegister.dateLabel'), value: t('healthRegister.dateTimeValue', { date: isoDateToDisplay(apptDate), time: apptTime || '—' }) } : null,
                eventType === 'appointment' && professionalId ? { label: t('healthRegister.appointmentProfessionalLabel'), value: professionals.find(p => p.id === professionalId)?.name } : null,
                eventType === 'appointment' && location ? { label: t('health.location'), value: location } : null,
                notes ? { label: t('healthRegister.notesSummary'), value: notes } : null,
              ].filter(Boolean).map((row, i) => (
                <View key={i} style={{
                  flexDirection: 'row', justifyContent: 'space-between',
                  paddingVertical: spacing.sm,
                  borderTopWidth: 0.5, borderTopColor: colors.borderLight,
                }}>
                  <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted }}>{row!.label}</Text>
                  <Text style={{ fontSize: font.sizes.sm, color: colors.text, fontWeight: font.weights.medium, maxWidth: '60%', textAlign: 'right' }}>
                    {row!.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Bottom action button */}
      <View style={{
        paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + spacing.lg,
        paddingTop: spacing.md, backgroundColor: colors.bgElevated,
        borderTopWidth: 0.5, borderTopColor: colors.borderLight,
      }}>
        {step < 3 ? (
          <PrimaryButton
            label={t('healthRegister.continueButton')}
            onPress={() => setStep(step + 1)}
            disabled={step === 1 ? !canProceedStep2 : !canProceedStep3}
            testID="saude-registrar-continuar"
          />
        ) : (
          <PrimaryButton
            label={t('healthRegister.saveButton')}
            onPress={handleSave}
            loading={saving}
            testID="saude-registrar-salvar"
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

/** Chip do seletor de profissional — preenchido (brand) quando selecionado. */
function chipStyle(selected: boolean) {
  return {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: selected ? colors.brand : colors.borderLight,
    backgroundColor: selected ? colors.brand : colors.bgElevated,
  } as const;
}
