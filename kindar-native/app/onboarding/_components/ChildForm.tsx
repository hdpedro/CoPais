import { memo, useMemo, type RefObject } from 'react';
import {
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { colors, font, radius, spacing } from 'src/design-system/tokens';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import { useReduceMotion } from '../_lib/useReduceMotion';
import type { ChildSex, Translate } from '../_lib/types';

type Kind = 'first' | 'another' | 'edit';

interface Props {
  kind: Kind;
  childName: string;
  childBirthDate: string;
  childSex: ChildSex | '';
  error: string;
  saving: boolean;
  onName: (v: string) => void;
  onBirth: (v: string) => void;
  onSex: (v: ChildSex | '') => void;
  onSave: () => void;
  onBack: () => void;
  nameRef: RefObject<TextInput | null>;
  t: Translate;
}

const SEX_OPTIONS = [
  { value: 'F' as const, key: 'sexFemale', icon: '👧' },
  { value: 'M' as const, key: 'sexMale', icon: '👦' },
];

/** Form unificado pra cadastrar/editar criança (1ª, Nx ou edit). */
function ChildFormImpl({
  kind, childName, childBirthDate, childSex,
  error, saving, onName, onBirth, onSex, onSave, onBack, nameRef, t,
}: Props) {
  const reduceMotion = useReduceMotion();
  const { title, subtitle, cta, heroEmoji } = useMemo(() => ({
    title: t(
      kind === 'first' ? 'onboardingForm.addFirstChild'
      : kind === 'edit' ? 'onboardingForm.editChildTitle'
      : 'onboardingForm.addAnotherChild',
    ),
    subtitle: t(
      kind === 'first' ? 'onboardingForm.firstChildHelp'
      : kind === 'edit' ? 'onboardingForm.editChildHelp'
      : 'onboardingForm.anotherChildHelp',
    ),
    cta: t(
      kind === 'first' ? 'onboardingForm.saveAndContinue'
      : kind === 'edit' ? 'onboardingForm.saveChanges'
      : 'onboardingForm.addToFamily',
    ),
    heroEmoji: kind === 'edit' ? '✏️' : kind === 'first' ? '👶' : '✨',
  }), [kind, t]);

  const canSubmit = !saving && childName.trim().length > 0 && childBirthDate.trim().length > 0;

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(280)}
      exiting={reduceMotion ? undefined : FadeOut.duration(160)}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl }}>
        <TouchableOpacity
          onPress={onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
      </View>

      <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: spacing.lg }}>{heroEmoji}</Text>
      <Text style={{
        fontSize: font.sizes['2xl'], fontWeight: font.weights.extrabold,
        color: colors.text, textAlign: 'center',
      }}>
        {title}
      </Text>
      <Text style={{
        fontSize: font.sizes.md, color: colors.textSecondary,
        textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing['2xl'],
        lineHeight: 22,
      }}>
        {subtitle}
      </Text>

      {error ? (
        <View
          accessibilityRole="alert"
          style={{
            backgroundColor: 'rgba(229,57,53,0.06)', borderRadius: radius.md,
            borderWidth: 1, borderColor: 'rgba(229,57,53,0.2)',
            padding: spacing.md, marginBottom: spacing.lg,
          }}
        >
          <Text style={{ color: colors.error, fontSize: font.sizes.sm }}>{error}</Text>
        </View>
      ) : null}

      <Text style={{
        fontSize: font.sizes.sm, fontWeight: font.weights.medium,
        color: colors.text, marginBottom: spacing.xs,
      }}>
        {t('onboardingForm.childFullName')}
      </Text>
      <TextInput
        ref={nameRef}
        testID="onboarding-child-name"
        accessibilityLabel={t('onboardingForm.childFullName')}
        value={childName}
        onChangeText={onName}
        placeholder={t('onboardingForm.childNamePlaceholder')}
        placeholderTextColor={colors.textDim}
        autoCapitalize="words"
        style={{
          backgroundColor: colors.bgElevated, borderRadius: radius.md,
          borderWidth: 1, borderColor: colors.borderLight,
          padding: spacing.lg, fontSize: font.sizes.md, color: colors.text,
          marginBottom: spacing.lg,
        }}
      />

      <Text style={{
        fontSize: font.sizes.sm, fontWeight: font.weights.medium,
        color: colors.text, marginBottom: spacing.xs,
      }}>
        {t('onboardingForm.birthDate')}
      </Text>
      <TextInput
        testID="onboarding-child-birthdate"
        accessibilityLabel={t('onboardingForm.birthDate')}
        value={childBirthDate}
        onChangeText={onBirth}
        placeholder="DD/MM/AAAA"
        placeholderTextColor={colors.textDim}
        keyboardType="number-pad"
        maxLength={10}
        style={{
          backgroundColor: colors.bgElevated, borderRadius: radius.md,
          borderWidth: 1, borderColor: colors.borderLight,
          padding: spacing.lg, fontSize: font.sizes.md, color: colors.text,
          marginBottom: spacing.lg,
        }}
      />

      <Text style={{
        fontSize: font.sizes.sm, fontWeight: font.weights.medium,
        color: colors.text, marginBottom: spacing.xs,
      }}>
        {t('onboardingForm.sexOptional')}
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl }}>
        {SEX_OPTIONS.map((g) => {
          const active = childSex === g.value;
          return (
            <TouchableOpacity
              key={g.value}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSex(active ? '' : g.value);
              }}
              activeOpacity={0.8}
              accessibilityRole="radio"
              accessibilityLabel={t(`onboardingForm.${g.key}`)}
              accessibilityState={{ selected: active }}
              style={{
                flex: 1,
                backgroundColor: active ? `${colors.brand}15` : colors.bgElevated,
                borderRadius: radius.md,
                borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
              }}
            >
              <Text style={{ fontSize: 22 }}>{g.icon}</Text>
              <Text style={{
                fontSize: font.sizes.md, color: colors.text,
                fontWeight: active ? font.weights.semibold : font.weights.normal,
              }}>
                {t(`onboardingForm.${g.key}`)}
              </Text>
              {active ? <Ionicons name="checkmark-circle" size={18} color={colors.brand} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <PrimaryButton
        label={cta}
        onPress={onSave}
        loading={saving}
        disabled={!canSubmit}
        testID="onboarding-finish"
      />

      {kind !== 'first' ? (
        <TouchableOpacity
          onPress={onBack}
          disabled={saving}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          style={{ alignItems: 'center', paddingVertical: spacing.lg }}
        >
          <Text style={{ color: colors.textMuted, fontSize: font.sizes.sm }}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      ) : null}
    </Animated.View>
  );
}

export const ChildForm = memo(ChildFormImpl);
