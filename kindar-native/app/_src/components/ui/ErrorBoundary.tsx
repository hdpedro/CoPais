/**
 * Top-level ErrorBoundary com recovery UI premium.
 *
 * Resolve a queixa do sweep anterior: o fallback estático "Algo deu errado"
 * não orienta o usuário. Esta versão:
 *  - Detecta o tipo do erro (network / storage / permission / unknown) e
 *    mostra hint contextual + ícone apropriado.
 *  - "Tentar novamente" reseta o boundary (mantido) — primeira ação.
 *  - "Voltar pro início" navega pro dashboard (segunda chance).
 *  - "Copiar detalhes" pra clipboard pra usuário mandar pro suporte.
 *  - Reporta automaticamente pro Sentry/PWA via reportError().
 *  - Botões com PrimaryButton (consistência + haptic + a11y).
 */

import { Component, type ReactNode } from 'react';
import { View, Text, ScrollView, Alert, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { reportError } from '../../lib/error-reporter';
import { useI18n } from '../../i18n';
import { colors, spacing, font } from '../../design-system/tokens';
import PrimaryButton from './PrimaryButton';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

type ErrorKind = 'network' | 'storage' | 'permission' | 'rendering' | 'unknown';

interface ErrorContext {
  kind: ErrorKind;
  icon: keyof typeof Ionicons.glyphMap;
  titleKey: string;
  hintKey: string;
  color: string;
}

/**
 * Heurística por mensagem do erro pra classificar tipo. Não é 100% mas cobre
 * os casos mais comuns que aparecem em produção. Title/hint vêm via i18n key
 * (Regras Canônicas 1+6).
 */
function classifyError(error: Error | null): ErrorContext {
  const msg = (error?.message || '').toLowerCase();
  if (/network|fetch|offline|timeout|connection/.test(msg)) {
    return {
      kind: 'network',
      icon: 'cloud-offline-outline',
      titleKey: 'errors.boundary.networkTitle',
      hintKey: 'errors.boundary.networkHint',
      color: '#D97706',
    };
  }
  if (/storage|quota|disk|space|asyncstorage/.test(msg)) {
    return {
      kind: 'storage',
      icon: 'archive-outline',
      titleKey: 'errors.boundary.storageTitle',
      hintKey: 'errors.boundary.storageHint',
      color: '#DC2626',
    };
  }
  if (/permission|denied|unauthorized|forbidden/.test(msg)) {
    return {
      kind: 'permission',
      icon: 'lock-closed-outline',
      titleKey: 'errors.boundary.permissionTitle',
      hintKey: 'errors.boundary.permissionHint',
      color: '#DC2626',
    };
  }
  if (/render|undefined is not|cannot read property|hook/.test(msg)) {
    return {
      kind: 'rendering',
      icon: 'construct-outline',
      titleKey: 'errors.boundary.renderingTitle',
      hintKey: 'errors.boundary.renderingHint',
      color: '#92400E',
    };
  }
  return {
    kind: 'unknown',
    icon: 'alert-circle-outline',
    titleKey: 'errors.boundary.unknownTitle',
    hintKey: 'errors.boundary.unknownHint',
    color: '#92400E',
  };
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }): void {
    const ctx = classifyError(error);
    reportError(error, {
      severity: 'critical',
      filePath: 'ErrorBoundary',
      metadata: {
        errorKind: ctx.kind,
        componentStack: info.componentStack?.slice(0, 2000),
      },
    });
  }

  reset = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    this.setState({ hasError: false, error: null });
  };

  goHome = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    this.setState({ hasError: false, error: null });
    router.replace('/(tabs)');
  };

  copyDetails = async () => {
    const t = useI18n.getState().t;
    const text = `${t('errors.boundary.errorDetailsTitle')}: ${this.state.error?.message ?? t('errors.boundary.errorNoMessage')}\nStack: ${this.state.error?.stack?.slice(0, 1500) ?? ''}`;
    try {
      await Share.share({ message: text });
    } catch {
      Alert.alert(t('errors.boundary.errorDetailsTitle'), text);
    }
  };

  render() {
    if (this.state.hasError) {
      const ctx = classifyError(this.state.error);
      // Pegamos t() do store imperativamente — class component não tem
      // acesso a hooks. zustand permite getState() em qualquer lugar.
      const t = useI18n.getState().t;
      return (
        <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, justifyContent: 'center' }}>
          <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
            <Ionicons name={ctx.icon} size={56} color={ctx.color} />
          </View>
          <Text
            accessibilityRole="header"
            style={{
              fontSize: font.sizes['2xl'],
              fontWeight: font.weights.extrabold,
              color: colors.text,
              textAlign: 'center',
              marginBottom: spacing.sm,
            }}
          >
            {t(ctx.titleKey)}
          </Text>
          <Text
            style={{
              fontSize: font.sizes.md,
              color: colors.textSecondary,
              textAlign: 'center',
              marginBottom: spacing.xl,
              lineHeight: 22,
            }}
          >
            {t(ctx.hintKey)}
          </Text>
          <ScrollView
            style={{ maxHeight: 120, marginBottom: spacing.xl, backgroundColor: colors.bgElevated, borderRadius: 8, padding: spacing.md }}
          >
            <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, fontFamily: 'monospace' }}>
              {this.state.error?.message ?? t('errors.boundary.errorNoMessage')}
            </Text>
          </ScrollView>
          <View style={{ gap: spacing.sm }}>
            <PrimaryButton
              label={t('errors.boundary.btnRetry')}
              onPress={this.reset}
              testID="error-boundary-retry"
            />
            <PrimaryButton
              label={t('errors.boundary.btnHome')}
              onPress={this.goHome}
              variant="secondary"
              testID="error-boundary-home"
            />
            <PrimaryButton
              label={t('errors.boundary.btnReport')}
              onPress={this.copyDetails}
              variant="secondary"
              testID="error-boundary-report"
              accessibilityHint={t('errors.boundary.reportHint')}
            />
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}
