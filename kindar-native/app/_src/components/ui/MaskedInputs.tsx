/**
 * MaskedInputs — Inputs com máscara PT-BR.
 *
 * Padrões consolidados:
 *  - PhoneInput: aceita só dígitos, formata `(11) 99999-9999` enquanto digita.
 *    Aceita 10 (fixo) ou 11 (celular) dígitos. Output: dígitos puros (sem máscara)
 *    pro caller persistir.
 *  - CurrencyInput: valor monetário em centavos. UI mostra `R$ 1.500,00`,
 *    output é número (em reais) pro caller. Auto-formata onChange.
 *  - DecimalInput: peso/altura/etc em PT-BR. Aceita `,` ou `.` digitados, UI
 *    mostra `,` (PT-BR), output em float pra DB. Limit configurável de
 *    dígitos antes/depois da vírgula.
 *
 * Todos usam o mesmo visual de TextInput do design-system (bgSurface, radius.md,
 * etc.) — drop-in replacement de TextInput cru.
 */
import { TextInput, View, Text, TextInputProps } from 'react-native';
import { colors, spacing, radius, font } from '../../design-system/tokens';

// ══════════════════════════════════════════
// SHARED STYLE
// ══════════════════════════════════════════

const baseInputStyle = {
  backgroundColor: colors.bgSurface,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors.borderLight,
  paddingVertical: spacing.md,
  paddingHorizontal: spacing.lg,
  fontSize: font.sizes.md,
  color: colors.text,
  minHeight: 48, // ≥ 44pt iOS HIG
} as const;

// ══════════════════════════════════════════
// PHONE INPUT
// ══════════════════════════════════════════

interface PhoneInputProps extends Omit<TextInputProps, 'value' | 'onChangeText' | 'keyboardType'> {
  /** Valor cru (só dígitos) ou formatado — componente aceita os dois. */
  value: string;
  /** Recebe os dígitos puros (sem máscara), ex: "11999999999". */
  onChangeText: (digits: string) => void;
}

/**
 * Formata `(11) 99999-9999` ou `(11) 9999-9999`. Aceita até 11 dígitos.
 */
function formatBRPhone(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function PhoneInput({ value, onChangeText, style, ...rest }: PhoneInputProps) {
  return (
    <TextInput
      {...rest}
      value={formatBRPhone(value)}
      onChangeText={(text) => onChangeText(text.replace(/\D/g, ''))}
      keyboardType="phone-pad"
      maxLength={16} // máscara completa "(11) 99999-9999"
      placeholderTextColor={colors.textMuted}
      style={[baseInputStyle, style]}
    />
  );
}

// ══════════════════════════════════════════
// CURRENCY INPUT
// ══════════════════════════════════════════

interface CurrencyInputProps extends Omit<TextInputProps, 'value' | 'onChangeText' | 'keyboardType'> {
  /** Valor em reais (number). 1500 = R$ 1.500,00. */
  value: number;
  /** Callback recebe valor em reais (number). */
  onChangeText: (reais: number) => void;
  /** Símbolo prefix. Default "R$". Pass empty string pra esconder. */
  prefix?: string;
}

/**
 * Formata um número em reais como `R$ 1.500,00`.
 */
function formatBRL(reais: number, prefix = 'R$'): string {
  if (Number.isNaN(reais)) return prefix ? `${prefix} 0,00` : '0,00';
  const fixed = reais.toFixed(2);
  const [int, dec] = fixed.split('.');
  // Adiciona separador de milhar
  const intWithSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${prefix ? prefix + ' ' : ''}${intWithSep},${dec}`;
}

/**
 * Parse "R$ 1.500,00" → 1500. Usado internamente onChangeText.
 * Estratégia: extrai dígitos, divide por 100 pra obter centavos como reais.
 */
function parseBRLFromInput(text: string): number {
  const digits = text.replace(/\D/g, '');
  if (digits.length === 0) return 0;
  return parseInt(digits, 10) / 100;
}

export function CurrencyInput({ value, onChangeText, prefix = 'R$', style, ...rest }: CurrencyInputProps) {
  return (
    <TextInput
      {...rest}
      value={formatBRL(value, prefix)}
      onChangeText={(text) => onChangeText(parseBRLFromInput(text))}
      keyboardType="decimal-pad"
      placeholderTextColor={colors.textMuted}
      style={[baseInputStyle, style]}
    />
  );
}

// ══════════════════════════════════════════
// DECIMAL INPUT (peso, altura, dosagem)
// ══════════════════════════════════════════

interface DecimalInputProps extends Omit<TextInputProps, 'value' | 'onChangeText' | 'keyboardType'> {
  /** Valor em float (use número). Ex: 8.5 = "8,5" na UI. */
  value: string;
  /** Recebe string PT-BR ("8,5"). Caller converte com parseDecimal helper. */
  onChangeText: (text: string) => void;
  /** Máximo de dígitos antes da vírgula. Default 3 (até 999). */
  maxIntegerDigits?: number;
  /** Máximo de dígitos depois da vírgula. Default 2. */
  maxDecimalDigits?: number;
  /** Unidade (kg, cm, etc.) renderizada à direita. */
  unit?: string;
}

/**
 * Mantém só dígitos e UMA vírgula. Bloqueia ponto (usa vírgula PT-BR).
 * Tetos configuráveis pra integer/decimal parts.
 */
function sanitizeDecimal(text: string, maxInt: number, maxDec: number): string {
  // Aceita ponto digitado e converte pra vírgula (usuário pode digitar de
  // qualquer jeito; saída é sempre PT-BR).
  let t = text.replace(/\./g, ',');
  // Remove caracteres não permitidos
  t = t.replace(/[^0-9,]/g, '');
  // Apenas a primeira vírgula sobrevive
  const firstComma = t.indexOf(',');
  if (firstComma >= 0) {
    t = t.slice(0, firstComma + 1) + t.slice(firstComma + 1).replace(/,/g, '');
  }
  // Aplicar caps
  if (firstComma === -1) {
    return t.slice(0, maxInt);
  }
  const intPart = t.slice(0, firstComma).slice(0, maxInt);
  const decPart = t.slice(firstComma + 1).slice(0, maxDec);
  return `${intPart},${decPart}`;
}

/**
 * Helper pro caller converter "8,5" → 8.5 antes de salvar no DB.
 */
export function parseDecimal(text: string): number | null {
  if (!text || text.trim() === '') return null;
  const n = parseFloat(text.replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

/**
 * Helper inverso pro caller pré-popular o input com um valor do DB.
 */
export function formatDecimal(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value).replace('.', ',');
}

export function DecimalInput({
  value,
  onChangeText,
  maxIntegerDigits = 3,
  maxDecimalDigits = 2,
  unit,
  style,
  ...rest
}: DecimalInputProps) {
  if (unit) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <TextInput
          {...rest}
          value={value}
          onChangeText={(text) => onChangeText(sanitizeDecimal(text, maxIntegerDigits, maxDecimalDigits))}
          keyboardType="decimal-pad"
          placeholderTextColor={colors.textMuted}
          style={[baseInputStyle, { flex: 1 }, style]}
        />
        <Text style={{ fontSize: font.sizes.md, color: colors.textSecondary, fontWeight: font.weights.medium }}>
          {unit}
        </Text>
      </View>
    );
  }
  return (
    <TextInput
      {...rest}
      value={value}
      onChangeText={(text) => onChangeText(sanitizeDecimal(text, maxIntegerDigits, maxDecimalDigits))}
      keyboardType="decimal-pad"
      placeholderTextColor={colors.textMuted}
      style={[baseInputStyle, style]}
    />
  );
}
