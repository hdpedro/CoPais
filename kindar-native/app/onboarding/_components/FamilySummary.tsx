import { memo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { colors, font, radius, spacing } from 'src/design-system/tokens';
import { useReduceMotion } from '../_lib/useReduceMotion';
import type {
  InviteRole, InviteSentInfo, Translate, WizardChild,
} from '../_lib/types';
import { ChildCard } from './ChildCard';
import { InviteForm } from './InviteForm';
import { InviteSentCard } from './InviteSentCard';

interface Props {
  groupName: string;
  kids: WizardChild[];
  onAddAnother: () => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;

  inviteEmail: string;
  inviteRole: InviteRole;
  inviteSending: boolean;
  inviteError: string;
  inviteSent: InviteSentInfo | null;
  onInviteEmail: (v: string) => void;
  onInviteRole: (v: InviteRole) => void;
  onSendInvite: () => void;
  onShareLink: () => void;
  onSendAnother: () => void;

  onFinish: () => void;
  t: Translate;
}

/** Resumo da família — celebração + lista de cards + convite inline + CTA final. */
function FamilySummaryImpl({
  groupName, kids,
  onAddAnother, onEdit, onRemove,
  inviteEmail, inviteRole, inviteSending, inviteError, inviteSent,
  onInviteEmail, onInviteRole, onSendInvite, onShareLink, onSendAnother,
  onFinish, t,
}: Props) {
  const reduceMotion = useReduceMotion();
  const count = kids.length;
  const countLabel =
    count === 0 ? t('onboardingForm.familyReady') :
    count === 1 ? t('onboardingForm.familyHasOne') :
    t('onboardingForm.familyHasMany', { count });

  // Animações decorativas viram no-op quando o usuário pede "reduzir
  // movimento". Os sparkles deixam de aparecer (são puramente cosméticos).
  const wrapperEntering = reduceMotion ? undefined : FadeIn.duration(320);
  const heroEntering = reduceMotion ? undefined : ZoomIn.duration(380).springify();

  return (
    <Animated.View entering={wrapperEntering}>
      <Animated.View entering={heroEntering} style={{ alignItems: 'center', marginBottom: spacing.lg }}>
        <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md }}>
          {!reduceMotion && (
            <>
              <Animated.Text
                entering={FadeIn.delay(200).duration(500)}
                style={{ position: 'absolute', top: -8, left: -32, fontSize: 16 }}
                accessibilityElementsHidden
                importantForAccessibility="no"
              >
                ✨
              </Animated.Text>
              <Animated.Text
                entering={FadeIn.delay(320).duration(500)}
                style={{ position: 'absolute', top: -4, right: -32, fontSize: 14 }}
                accessibilityElementsHidden
                importantForAccessibility="no"
              >
                ✨
              </Animated.Text>
              <Animated.Text
                entering={FadeIn.delay(440).duration(500)}
                style={{ position: 'absolute', bottom: 0, left: -8, fontSize: 12 }}
                accessibilityElementsHidden
                importantForAccessibility="no"
              >
                ✨
              </Animated.Text>
            </>
          )}

          <View style={{
            width: 88, height: 88, borderRadius: 44,
            backgroundColor: `${colors.success}15`,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="checkmark-circle" size={56} color={colors.success} />
          </View>
        </View>
        <Text style={{
          fontSize: font.sizes['2xl'], fontWeight: font.weights.extrabold,
          color: colors.text, textAlign: 'center',
        }}>
          {groupName || t('onboardingForm.familyCreated')}
        </Text>
        <Text
          accessibilityLiveRegion="polite"
          style={{
            fontSize: font.sizes.md, color: colors.textSecondary,
            textAlign: 'center', marginTop: spacing.xs,
          }}
        >
          {countLabel}
        </Text>
      </Animated.View>

      <View style={{ marginBottom: spacing.xl }} accessibilityLabel={t('onboardingForm.childrenList')}>
        {kids.map((kid, i) => (
          <ChildCard
            key={kid.id}
            kid={kid}
            index={i}
            onEdit={onEdit}
            onRemove={onRemove}
            t={t}
          />
        ))}
      </View>

      <TouchableOpacity
        testID="onboarding-add-another"
        accessibilityRole="button"
        accessibilityLabel={t('onboardingForm.addAnotherChild')}
        onPress={onAddAnother}
        activeOpacity={0.85}
        style={{
          backgroundColor: colors.bgElevated,
          borderWidth: 2, borderColor: colors.brand, borderStyle: 'dashed',
          borderRadius: radius.xl,
          paddingVertical: spacing.lg,
          alignItems: 'center', justifyContent: 'center',
          flexDirection: 'row', gap: spacing.sm,
          marginBottom: spacing['2xl'],
        }}
      >
        <Ionicons name="add-circle" size={22} color={colors.brand} />
        <Text style={{ color: colors.brand, fontSize: font.sizes.md, fontWeight: font.weights.bold }}>
          {t('onboardingForm.addAnotherChild')}
        </Text>
      </TouchableOpacity>

      {inviteSent ? (
        <InviteSentCard
          email={inviteSent.email}
          onShare={onShareLink}
          onAnother={onSendAnother}
          t={t}
        />
      ) : (
        <InviteForm
          email={inviteEmail}
          role={inviteRole}
          sending={inviteSending}
          error={inviteError}
          onEmail={onInviteEmail}
          onRole={onInviteRole}
          onSend={onSendInvite}
          t={t}
        />
      )}

      <TouchableOpacity
        testID="onboarding-finish"
        accessibilityRole="button"
        accessibilityLabel={t(inviteSent ? 'onboardingForm.finishOnboarding' : 'onboardingForm.goToAppInviteLater')}
        onPress={onFinish}
        activeOpacity={0.7}
        style={{ alignItems: 'center', paddingVertical: spacing.lg, marginTop: spacing.md }}
      >
        <Text style={{
          color: inviteSent ? colors.brand : colors.textMuted,
          fontSize: font.sizes.sm,
          fontWeight: inviteSent ? font.weights.semibold : font.weights.normal,
        }}>
          {t(inviteSent ? 'onboardingForm.finishOnboarding' : 'onboardingForm.goToAppInviteLater')}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export const FamilySummary = memo(FamilySummaryImpl);
