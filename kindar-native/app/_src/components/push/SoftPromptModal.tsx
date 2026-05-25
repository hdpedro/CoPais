/**
 * SoftPromptModal — modal pre-permission iOS.
 *
 * Mostrado UMA VEZ por device. Substitui o hard prompt direto que perdia
 * 40% dos users que clicavam "Don't Allow" sem entender o que estavam
 * recusando.
 *
 * UX:
 *  - Aparece transparente sobre a tela atual (não navegação)
 *  - Lista clara do que vamos enviar
 *  - 2 botões: aceitar (CTA primário) / não agora (ghost)
 *  - "Não agora" marca como dismissed — não aparece de novo
 *  - "Sim ativar" chama o hard prompt iOS imediatamente
 *  - Decisão de iOS persiste pra sempre — soft prompt só dispara uma vez
 */

import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

interface Props {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export default function SoftPromptModal({ visible, onAccept, onDecline }: Props) {
  const t = useI18n((s) => s.t);

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: spacing.lg,
        }}
      >
        <View
          style={{
            backgroundColor: colors.bgElevated,
            borderRadius: radius['2xl'],
            padding: spacing.xl,
            maxWidth: 400,
            width: '100%',
            ...shadows.lg,
          }}
        >
          <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: spacing.md }}>
            🔔
          </Text>
          <Text
            style={{
              fontSize: font.sizes.xl,
              fontWeight: font.weights.bold,
              color: colors.text,
              textAlign: 'center',
              marginBottom: spacing.sm,
            }}
            accessibilityRole="header"
          >
            {t('softPrompt.title')}
          </Text>
          <Text
            style={{
              fontSize: font.sizes.sm,
              color: colors.textSecondary,
              textAlign: 'center',
              marginBottom: spacing.lg,
            }}
          >
            {t('softPrompt.subtitle')}
          </Text>

          <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
            <Bullet icon="⏰" text={t('softPrompt.line1')} />
            <Bullet icon="💬" text={t('softPrompt.line2')} />
            <Bullet icon="💉" text={t('softPrompt.line3')} />
            <Bullet icon="🏥" text={t('softPrompt.line4')} />
          </ScrollView>

          <Text
            style={{
              fontSize: font.sizes.xs,
              color: colors.textMuted,
              textAlign: 'center',
              marginTop: spacing.md,
              marginBottom: spacing.lg,
            }}
          >
            {t('softPrompt.footer')}
          </Text>

          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onAccept();
            }}
            accessibilityRole="button"
            accessibilityLabel={t('softPrompt.accept')}
            style={{
              backgroundColor: colors.brand,
              paddingVertical: spacing.md,
              borderRadius: radius.lg,
              alignItems: 'center',
              marginBottom: spacing.sm,
              ...shadows.sm,
            }}
          >
            <Text
              style={{
                color: '#fff',
                fontSize: font.sizes.md,
                fontWeight: font.weights.bold,
              }}
            >
              {t('softPrompt.accept')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              onDecline();
            }}
            accessibilityRole="button"
            accessibilityLabel={t('softPrompt.decline')}
            style={{
              paddingVertical: spacing.sm + 2,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                color: colors.textMuted,
                fontSize: font.sizes.sm,
                fontWeight: font.weights.medium,
              }}
            >
              {t('softPrompt.decline')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Bullet({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm + 2 }}>
      <Text style={{ fontSize: 20 }}>{icon}</Text>
      <Text
        style={{
          flex: 1,
          fontSize: font.sizes.sm,
          color: colors.text,
          lineHeight: 22,
        }}
      >
        {text}
      </Text>
    </View>
  );
}
