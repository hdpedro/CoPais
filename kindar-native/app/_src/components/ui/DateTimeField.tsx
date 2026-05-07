/**
 * DateTimeField / DatePickerField / TimePickerField
 *
 * Shared native date/time pickers. Replace all manual DD/MM/AAAA + HH:MM
 * TextInput flows with these. Uses @react-native-community/datetimepicker
 * for native iOS/Android wheel/calendar pickers.
 *
 * Usage:
 *   <DatePickerField label="Data" value={date} onChange={setDate} />
 *   <TimePickerField label="Hora" value={time} onChange={setTime} />
 *
 * Value model:
 *   - DatePickerField stores an ISO `YYYY-MM-DD` string (or null for unset)
 *   - TimePickerField stores an `HH:MM` string (or null for unset)
 *
 * Display is always pt-BR (DD/MM/AAAA) regardless of device locale, so the
 * UX matches the PWA exactly.
 */

import { useState } from 'react';
import { View, Text, TouchableOpacity, Platform, Modal } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '../../design-system/tokens';

// ── Helpers ──────────────────────────────────────────────────────────────

export function isoDateToDisplay(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

export function dateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isoToDate(iso: string | null): Date {
  if (!iso) return new Date();
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

export function timeToHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function hhmmToDate(hhmm: string | null): Date {
  const d = new Date();
  if (!hhmm) return d;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isFinite(h)) d.setHours(h);
  if (Number.isFinite(m)) d.setMinutes(m);
  d.setSeconds(0);
  return d;
}

// ── Base field UI ────────────────────────────────────────────────────────

interface FieldShellProps {
  label?: string;
  value: string;
  placeholder: string;
  icon: 'calendar-outline' | 'time-outline';
  onPress: () => void;
  disabled?: boolean;
}

function FieldShell({ label, value, placeholder, icon, onPress, disabled }: FieldShellProps) {
  return (
    <View>
      {label ? (
        <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginBottom: 4, fontWeight: font.weights.medium }}>
          {label}
        </Text>
      ) : null}
      <TouchableOpacity
        activeOpacity={0.75}
        disabled={disabled}
        onPress={onPress}
        style={{
          backgroundColor: colors.bg,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.borderLight,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Ionicons name={icon} size={18} color={colors.textMuted} />
        <Text style={{ flex: 1, fontSize: font.sizes.md, color: value ? colors.text : colors.textMuted }}>
          {value || placeholder}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── DatePickerField ──────────────────────────────────────────────────────

export interface DatePickerFieldProps {
  label?: string;
  value: string | null;              // 'YYYY-MM-DD' or null
  onChange: (iso: string) => void;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  disabled?: boolean;
}

export function DatePickerField({
  label, value, onChange, placeholder = 'Selecione a data',
  minimumDate, maximumDate, disabled,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(isoToDate(value));

  function handleOpen() {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTempDate(isoToDate(value));
    setOpen(true);
  }

  function handleAndroidChange(event: DateTimePickerEvent, selected?: Date) {
    // Android picker dismisses itself; we commit on "set", cancel on "dismissed"
    setOpen(false);
    if (event.type === 'set' && selected) {
      onChange(dateToIso(selected));
    }
  }

  function handleIosChange(_event: DateTimePickerEvent, selected?: Date) {
    if (selected) setTempDate(selected);
  }

  function confirmIos() {
    onChange(dateToIso(tempDate));
    setOpen(false);
  }

  return (
    <>
      <FieldShell
        label={label}
        value={isoDateToDisplay(value)}
        placeholder={placeholder}
        icon="calendar-outline"
        onPress={handleOpen}
        disabled={disabled}
      />

      {/* Android: modal native dialog */}
      {Platform.OS === 'android' && open ? (
        <DateTimePicker
          value={isoToDate(value)}
          mode="date"
          display="default"
          onChange={handleAndroidChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          locale="pt-BR"
        />
      ) : null}

      {/* iOS: bottom-sheet wheel picker with Confirm/Cancel */}
      {Platform.OS === 'ios' ? (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setOpen(false)} />
            <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], paddingBottom: 40 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: spacing.lg, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
                <TouchableOpacity onPress={() => setOpen(false)}>
                  <Text style={{ fontSize: font.sizes.md, color: colors.textSecondary }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmIos}>
                  <Text style={{ fontSize: font.sizes.md, color: colors.brand, fontWeight: font.weights.semibold }}>Confirmar</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempDate}
                mode="date"
                display="spinner"
                onChange={handleIosChange}
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                locale="pt-BR"
                textColor={colors.text}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

// ── TimePickerField ──────────────────────────────────────────────────────

export interface TimePickerFieldProps {
  label?: string;
  value: string | null;              // 'HH:MM' or null
  onChange: (hhmm: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function TimePickerField({
  label, value, onChange, placeholder = 'Selecione o horario', disabled,
}: TimePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(hhmmToDate(value));

  function handleOpen() {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTempDate(hhmmToDate(value));
    setOpen(true);
  }

  function handleAndroidChange(event: DateTimePickerEvent, selected?: Date) {
    setOpen(false);
    if (event.type === 'set' && selected) {
      onChange(timeToHHMM(selected));
    }
  }

  function handleIosChange(_event: DateTimePickerEvent, selected?: Date) {
    if (selected) setTempDate(selected);
  }

  function confirmIos() {
    onChange(timeToHHMM(tempDate));
    setOpen(false);
  }

  return (
    <>
      <FieldShell
        label={label}
        value={value || ''}
        placeholder={placeholder}
        icon="time-outline"
        onPress={handleOpen}
        disabled={disabled}
      />

      {Platform.OS === 'android' && open ? (
        <DateTimePicker
          value={hhmmToDate(value)}
          mode="time"
          display="default"
          is24Hour
          onChange={handleAndroidChange}
          locale="pt-BR"
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setOpen(false)} />
            <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], paddingBottom: 40 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: spacing.lg, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
                <TouchableOpacity onPress={() => setOpen(false)}>
                  <Text style={{ fontSize: font.sizes.md, color: colors.textSecondary }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmIos}>
                  <Text style={{ fontSize: font.sizes.md, color: colors.brand, fontWeight: font.weights.semibold }}>Confirmar</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempDate}
                mode="time"
                display="spinner"
                is24Hour
                onChange={handleIosChange}
                locale="pt-BR"
                textColor={colors.text}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}
