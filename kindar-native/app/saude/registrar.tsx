/**
 * Health Event Wizard — 3-step registration flow.
 * Step 1: Event type (symptom, medication, appointment, observation)
 * Step 2: Dynamic fields based on type
 * Step 3: Confirm & save
 */

import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/store/auth';
import { useHealth } from '../../src/hooks/useHealth';
import { safeWrite } from '../../src/services/offline';
import { notifyAction } from '../../src/services/notify';
import { getBrazilToday } from '../../src/lib/constants';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

type EventType = 'illness' | 'medication' | 'appointment' | 'observation';

const EVENT_TYPES: Array<{ type: EventType; icon: string; label: string; desc: string }> = [
  { type: 'illness', icon: '🤒', label: 'Sintoma / Doenca', desc: 'Febre, dor, gripe, etc.' },
  { type: 'medication', icon: '💊', label: 'Medicamento', desc: 'Remedio, dosagem, frequencia' },
  { type: 'appointment', icon: '🏥', label: 'Consulta', desc: 'Medico, dentista, exame' },
  { type: 'observation', icon: '📝', label: 'Observacao', desc: 'Nota livre sobre a saude' },
];

export default function RegistrarScreen() {
  const insets = useSafeAreaInsets();
  const { userId, activeGroup } = useAuth();
  const { data: healthData } = useHealth();
  const [step, setStep] = useState(1);
  const [eventType, setEventType] = useState<EventType | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form fields
  const [title, setTitle] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [severity, setSeverity] = useState<'leve' | 'moderado' | 'grave'>('leve');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');

  const children = healthData?.children || [];

  // Auto-select first child if only one
  if (children.length === 1 && !selectedChildId) {
    setSelectedChildId(children[0].id);
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
    } else if (eventType === 'medication') {
      result = await safeWrite({
        table: 'active_medications',
        operation: 'insert',
        payload: {
          group_id: groupId, child_id: selectedChildId, name: title,
          dosage: dosage || 'Conforme prescricao', frequency: frequency || 'Conforme prescricao',
          start_date: today, status: 'active', notes: notes || null, created_by: userId,
        },
      });
    } else if (eventType === 'appointment') {
      result = await safeWrite({
        table: 'medical_appointments',
        operation: 'insert',
        payload: {
          group_id: groupId, child_id: selectedChildId, title,
          appointment_date: new Date().toISOString(),
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
  const canProceedStep3 = title.length > 0;

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
        <TouchableOpacity onPress={() => step > 1 ? setStep(step - 1) : router.back()} hitSlop={8}>
          <Ionicons name={step > 1 ? 'arrow-back' : 'close'} size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text, flex: 1 }}>
          Registrar evento
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
              O que aconteceu?
            </Text>
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.xl }}>
              Selecione o tipo de evento e a crianca
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
                    {et.label}
                  </Text>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>{et.desc}</Text>
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
                  Crianca
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  {children.map(c => (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => setSelectedChildId(c.id)}
                      style={{
                        paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
                        borderRadius: radius.full,
                        backgroundColor: selectedChildId === c.id ? colors.brand : colors.bgElevated,
                        borderWidth: 1,
                        borderColor: selectedChildId === c.id ? colors.brand : colors.borderLight,
                      }}
                    >
                      <Text style={{
                        fontSize: font.sizes.sm, fontWeight: font.weights.medium,
                        color: selectedChildId === c.id ? '#fff' : colors.text,
                      }}>
                        {c.full_name.split(' ')[0]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ─── STEP 2: Dynamic fields ─── */}
        {step === 2 ? (
          <View>
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.xs }}>
              {eventType === 'illness' ? 'Descreva os sintomas'
                : eventType === 'medication' ? 'Dados do medicamento'
                  : eventType === 'appointment' ? 'Dados da consulta'
                    : 'Observacao'}
            </Text>
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.xl }}>
              Preencha as informacoes principais
            </Text>

            {/* Title (always) */}
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.authText, marginBottom: spacing.xs }}>
              {eventType === 'medication' ? 'Nome do medicamento' : eventType === 'appointment' ? 'Titulo da consulta' : 'Titulo'}
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={eventType === 'illness' ? 'Ex: Febre, Gripe, Dor de garganta'
                : eventType === 'medication' ? 'Ex: Paracetamol, Amoxicilina'
                  : eventType === 'appointment' ? 'Ex: Pediatra, Dentista'
                    : 'Descreva a observacao'}
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
                  Sintomas (separados por virgula)
                </Text>
                <TextInput
                  value={symptoms}
                  onChangeText={setSymptoms}
                  placeholder="Ex: febre, tosse, dor de cabeca"
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
                  Gravidade
                </Text>
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
                  {([
                    { val: 'leve' as const, label: 'Leve', icon: '🟢' },
                    { val: 'moderado' as const, label: 'Moderado', icon: '🟡' },
                    { val: 'grave' as const, label: 'Grave', icon: '🔴' },
                  ]).map(s => (
                    <TouchableOpacity
                      key={s.val}
                      onPress={() => setSeverity(s.val)}
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
                  Dosagem
                </Text>
                <TextInput
                  value={dosage}
                  onChangeText={setDosage}
                  placeholder="Ex: 5ml, 1 comprimido, 10 gotas"
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
                  Frequencia
                </Text>
                <TextInput
                  value={frequency}
                  onChangeText={setFrequency}
                  placeholder="Ex: 8 em 8 horas, 2x ao dia"
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
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.authText, marginBottom: spacing.xs }}>
                  Local
                </Text>
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder="Ex: Clinica Sao Lucas, Hospital XYZ"
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
              Observacoes (opcional)
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Detalhes adicionais..."
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
              Confirmar registro
            </Text>
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.xl }}>
              Revise as informacoes antes de salvar
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
                    {EVENT_TYPES.find(e => e.type === eventType)?.label}
                  </Text>
                </View>
              </View>

              {/* Summary rows */}
              {[
                { label: 'Crianca', value: children.find(c => c.id === selectedChildId)?.full_name?.split(' ')[0] },
                eventType === 'illness' ? { label: 'Gravidade', value: severity } : null,
                eventType === 'illness' && symptoms ? { label: 'Sintomas', value: symptoms } : null,
                eventType === 'medication' && dosage ? { label: 'Dosagem', value: dosage } : null,
                eventType === 'medication' && frequency ? { label: 'Frequencia', value: frequency } : null,
                eventType === 'appointment' && location ? { label: 'Local', value: location } : null,
                notes ? { label: 'Observacoes', value: notes } : null,
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
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setStep(step + 1);
            }}
            disabled={step === 1 ? !canProceedStep2 : !canProceedStep3}
            style={{
              backgroundColor: colors.brand, borderRadius: radius.md,
              paddingVertical: spacing.lg, alignItems: 'center',
              opacity: (step === 1 ? !canProceedStep2 : !canProceedStep3) ? 0.4 : 1,
            }}
          >
            <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.bold }}>
              Continuar
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={{
              backgroundColor: colors.brand, borderRadius: radius.md,
              paddingVertical: spacing.lg, alignItems: 'center',
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.bold }}>
                Salvar registro
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
