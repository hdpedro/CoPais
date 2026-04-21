import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../src/store/auth';
import { getUserSubscription, purchaseProduct, restorePurchases, isNativeIAP, PRODUCTS, type UserSubscription } from '../../src/services/payments';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

const FEATURES = [
  { icon: '📅', text: 'Calendario ilimitado' },
  { icon: '💬', text: 'Chat sem limites' },
  { icon: '❤️', text: 'Modulo saude completo' },
  { icon: '📄', text: 'Documentos ilimitados' },
  { icon: '🤖', text: 'Assistente IA' },
  { icon: '📊', text: 'Relatorios financeiros' },
];

export default function PricingScreen() {
  const { userId } = useAuth();
  const [sub, setSub] = useState<UserSubscription | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    if (userId) getUserSubscription(userId).then(setSub);
  }, [userId]);

  async function handlePurchase() {
    setPurchasing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await purchaseProduct(PRODUCTS.premium_monthly);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (userId) setSub(await getUserSubscription(userId));
    } else {
      Alert.alert('Erro', result.error || 'Nao foi possivel completar a compra');
    }
    setPurchasing(false);
  }

  async function handleRestore() {
    setRestoring(true);
    // Restore requires StoreKit transaction data from the native layer.
    // For now, re-check subscription status from the database.
    if (userId) {
      const fresh = await getUserSubscription(userId);
      setSub(fresh);
      if (fresh.tier !== 'free') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Restaurado', 'Sua assinatura foi encontrada.');
      } else {
        Alert.alert('Info', 'Nenhuma assinatura ativa encontrada.');
      }
    }
    setRestoring(false);
  }

  const isPremium = sub?.tier === 'premium' || sub?.tier === 'elite';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Assinatura" />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }}>
        {/* Hero */}
        <View style={{ alignItems: 'center', marginBottom: spacing['2xl'] }}>
          <Text style={{ fontSize: 48, marginBottom: spacing.md }}>👑</Text>
          <Text style={{ fontSize: font.sizes['2xl'], fontWeight: font.weights.extrabold, color: colors.text }}>
            {isPremium ? 'Voce e Premium!' : 'Kindar Premium'}
          </Text>
          <Text style={{ fontSize: font.sizes.md, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs }}>
            {isPremium ? 'Aproveite todos os recursos' : 'Desbloqueie tudo o que o Kindar oferece'}
          </Text>
        </View>

        {/* Features */}
        <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.xl, ...shadows.md }}>
          {FEATURES.map((f, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm,
              borderTopWidth: i > 0 ? 0.5 : 0, borderTopColor: colors.borderLight }}>
              <Text style={{ fontSize: 18 }}>{f.icon}</Text>
              <Text style={{ fontSize: font.sizes.md, color: colors.text, flex: 1 }}>{f.text}</Text>
              <Ionicons name="checkmark-circle" size={18} color={isPremium ? colors.success : colors.textDim} />
            </View>
          ))}
        </View>

        {/* CTA */}
        {!isPremium ? (
          <>
            <TouchableOpacity onPress={handlePurchase} disabled={purchasing}
              style={{ backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center', marginBottom: spacing.md, opacity: purchasing ? 0.5 : 1 }}>
              {purchasing ? <ActivityIndicator color="#fff" /> : (
                <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.bold }}>
                  Assinar Premium
                </Text>
              )}
            </TouchableOpacity>

            {isNativeIAP() ? (
              <TouchableOpacity onPress={handleRestore} disabled={restoring} style={{ alignItems: 'center', paddingVertical: spacing.md }}>
                <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm }}>
                  {restoring ? 'Restaurando...' : 'Restaurar compras'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : (
          <View style={{ backgroundColor: `${colors.success}10`, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center' }}>
            <Ionicons name="checkmark-circle" size={32} color={colors.success} />
            <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.bold, color: colors.success, marginTop: spacing.sm }}>
              Assinatura ativa
            </Text>
            {sub?.currentPeriodEnd ? (
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: spacing.xs }}>
                Valida ate {new Date(sub.currentPeriodEnd).toLocaleDateString('pt-BR')}
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
