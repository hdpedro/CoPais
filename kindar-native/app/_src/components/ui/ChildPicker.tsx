/**
 * ChildPicker — Seletor de criança reusável.
 *
 * Consolida o pattern duplicado em 10+ telas (saúde, calendário, despesas)
 * onde o usuário escolhe entre filhos via fileira de chips. Usa flex-wrap
 * para que famílias com 3+ filhos vejam todos os chips sem arrastar
 * (alinhado com timeline.tsx iteração 2 e o sweep UX/i18n do commit cfd9f3c).
 *
 * Decisões de UX consolidadas aqui (em vez de espalhadas em cada caller):
 *  - Esconde sozinho quando há ≤1 filho (não polui hub com 1 chip).
 *  - Tap target mínimo 44pt (paddingVertical 10 + font sm = ~44pt).
 *  - Haptic Light no select (consistente com resto do app).
 *  - Mostra primeiro nome (`split(' ')[0]`) — telas estreitas, chip curto.
 *  - Acessibilidade: cada chip é `radio` no a11y tree com `selected` state.
 *  - Suporta opção "Todos" (allowAll=true) pro caso de filtros agregados.
 *
 * Quando aposentar: este componente substitui blocos manuais em
 *   saude/{sintomas,emergencia,vacinas/carteirinha,receita,export,
 *           consultas,consultas/resumo,medicamentos,alergias,crescimento}.tsx
 *   calendario/{escala,convite}.tsx
 *   despesas/nova.tsx (parcial — split picker tem semântica diferente)
 */
import { View, Text, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius, font } from '../../design-system/tokens';

interface ChildPickerOption {
  id: string;
  full_name: string;
}

interface ChildPickerProps {
  /** Lista de filhos. Renomeado de `children` (que conflita com JSX). */
  items: ChildPickerOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Permite chip "Todos" antes da lista (passa null no onSelect). */
  allowAll?: boolean;
  /** Label do chip "Todos" — default "Todos". */
  allLabel?: string;
  /** Desabilita interação (ex: enquanto submitting). */
  disabled?: boolean;
  /** Esconde quando há ≤1 filho. Default true. */
  hideWhenSingle?: boolean;
  /** Tema visual; default `brand` (azul). `error` usa vermelho (alergias graves). */
  tone?: 'brand' | 'error';
  /** Estilo extra do container, ex: margin / padding adicional. */
  containerStyle?: object;
  /** testID raiz, propaga `${testID}-chip-${childId}` em cada chip. */
  testID?: string;
}

export default function ChildPicker({
  items,
  selectedId,
  onSelect,
  allowAll = false,
  allLabel = 'Todos',
  disabled = false,
  hideWhenSingle = true,
  tone = 'brand',
  containerStyle,
  testID,
}: ChildPickerProps) {
  if (hideWhenSingle && !allowAll && items.length <= 1) return null;
  if (items.length === 0) return null;

  const activeBg = tone === 'error' ? colors.error : colors.brand;

  function handleSelect(id: string | null) {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(id);
  }

  return (
    <View style={containerStyle}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, rowGap: spacing.sm }}>
        {allowAll ? (
          <Chip
            label={allLabel}
            active={selectedId === null}
            disabled={disabled}
            activeBg={activeBg}
            onPress={() => handleSelect(null)}
            testID={testID ? `${testID}-chip-all` : undefined}
          />
        ) : null}
        {items.map(c => (
          <Chip
            key={c.id}
            label={c.full_name.split(' ')[0]}
            active={selectedId === c.id}
            disabled={disabled}
            activeBg={activeBg}
            onPress={() => handleSelect(c.id)}
            testID={testID ? `${testID}-chip-${c.id}` : undefined}
          />
        ))}
      </View>
    </View>
  );
}

function Chip({
  label,
  active,
  disabled,
  activeBg,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  activeBg: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected: active, disabled }}
      accessibilityLabel={`Selecionar ${label}`}
      activeOpacity={0.7}
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: 10,           // 10 + line-height ≈ 44pt (iOS HIG)
        minHeight: 44,
        justifyContent: 'center',
        borderRadius: radius.md,
        backgroundColor: active ? activeBg : colors.bgElevated,
        borderWidth: 1,
        borderColor: active ? activeBg : colors.borderLight,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text
        style={{
          fontSize: font.sizes.sm,
          color: active ? '#fff' : colors.text,
          fontWeight: active ? font.weights.semibold : font.weights.normal,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
