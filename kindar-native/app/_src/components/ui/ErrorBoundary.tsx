/**
 * Top-level ErrorBoundary so a single render crash doesn't take the whole
 * app down with no logging. Reports to the PWA `/api/log-error` pipeline
 * via `reportError()`.
 */

import { Component, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { reportError } from '../../lib/error-reporter';
import { colors, spacing, radius, font } from '../../design-system/tokens';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }): void {
    reportError(error, {
      severity: 'critical',
      filePath: 'ErrorBoundary',
      metadata: { componentStack: info.componentStack?.slice(0, 2000) },
    });
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, justifyContent: 'center' }}>
          <Text style={{ fontSize: font.sizes['2xl'], fontWeight: font.weights.extrabold, color: colors.text, textAlign: 'center', marginBottom: spacing.md }}>
            Algo deu errado
          </Text>
          <Text style={{ fontSize: font.sizes.md, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl, lineHeight: 22 }}>
            O Kindar encontrou um problema inesperado. O erro foi registrado e nossa equipe vai investigar.
          </Text>
          <ScrollView style={{ maxHeight: 200, marginBottom: spacing.xl }}>
            <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, fontFamily: 'monospace' }}>
              {this.state.error?.message}
            </Text>
          </ScrollView>
          <TouchableOpacity
            onPress={this.reset}
            style={{ backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.bold }}>
              Tentar novamente
            </Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}
