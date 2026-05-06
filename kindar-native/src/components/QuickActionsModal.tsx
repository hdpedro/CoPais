import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Modal,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../store/auth';
import { useI18n } from '../i18n';
import { colors, spacing, radius, font, shadows } from '../design-system/tokens';
import {
  QUICK_ACTIONS_CATALOG_NATIVE,
  DEFAULT_QUICK_ACTIONS_NATIVE,
  type QuickActionDefNative,
} from '../lib/constants';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function QuickActionsModal({ visible, onClose }: Props) {
  const t = useI18n(s => s.t);
  const { profile, updateQuickActions } = useAuth();

  const [primary, setPrimary] = useState<string>(DEFAULT_QUICK_ACTIONS_NATIVE.primary);
  const [secondary, setSecondary] = useState<string[]>([...DEFAULT_QUICK_ACTIONS_NATIVE.secondary]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const saved = profile?.quick_actions;
    // Reset estado quando o modal reabre, sincronizando com o profile salvo
    // (padrao "controlled reset on prop change" — set-state-in-effect intencional).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrimary(saved?.primary ?? DEFAULT_QUICK_ACTIONS_NATIVE.primary);
    setSecondary(saved?.secondary?.length ? [...saved.secondary] : [...DEFAULT_QUICK_ACTIONS_NATIVE.secondary]);
  }, [visible, profile]);

  const catalogMap = Object.fromEntries(QUICK_ACTIONS_CATALOG_NATIVE.map(a => [a.id, a]));
  const selectedSecondary = secondary.filter(id => id !== primary);
  const selectedItems: QuickActionDefNative[] = selectedSecondary
    .map(id => catalogMap[id])
    .filter(Boolean);
  const availableToAdd = QUICK_ACTIONS_CATALOG_NATIVE.filter(
    a => a.id !== primary && !selectedSecondary.includes(a.id)
  );
  const maxReached = selectedSecondary.length >= 6;

  function handlePrimaryChange(id: string) {
    Haptics.selectionAsync();
    setPrimary(id);
    setSecondary(prev => prev.filter(s => s !== id));
  }

  function toggleSecondary(id: string) {
    Haptics.selectionAsync();
    setSecondary(prev => {
      if (prev.includes(id)) return prev.filter(s => s !== id);
      if (prev.filter(s => s !== primary).length >= 6) return prev;
      return [...prev, id];
    });
  }

  async function handleSave() {
    setSaving(true);
    const result = await updateQuickActions(primary, selectedSecondary);
    setSaving(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } else {
      Alert.alert('Erro', result.error ?? 'Não foi possível salvar');
    }
  }

  const renderDraggableItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<QuickActionDefNative>) => (
      <ScaleDecorator activeScale={1.03}>
        <TouchableOpacity
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            drag();
          }}
          delayLongPress={150}
          activeOpacity={0.85}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: spacing.md,
            padding: spacing.md, borderRadius: radius.xl, borderWidth: 1,
            borderColor: isActive ? colors.secondary : colors.borderLight,
            backgroundColor: isActive ? `${colors.secondary}06` : colors.bgElevated,
            marginBottom: spacing.sm,
            ...(isActive ? shadows.md : {}),
          }}
        >
          <View style={{
            width: 36, height: 36, borderRadius: 12,
            backgroundColor: `${item.color}15`,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={18} color={item.color} />
          </View>

          <Text style={{ flex: 1, fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text }}>
            {item.defaultLabel}
          </Text>

          {/* Remove button */}
          <TouchableOpacity
            onPress={() => toggleSecondary(item.id)}
            hitSlop={8}
            style={{
              width: 24, height: 24, borderRadius: radius.full,
              backgroundColor: '#FEE2E2',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="close" size={12} color="#EF4444" />
          </TouchableOpacity>

          {/* Drag handle — iOS convention: right side */}
          <Ionicons name="reorder-three-outline" size={22} color={colors.textDim} />
        </TouchableOpacity>
      </ScaleDecorator>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [primary, selectedSecondary]
  );

  const ListHeader = (
    <View style={{ gap: spacing.lg }}>
      {/* PRIMARY ACTION */}
      <View>
        <Text style={{
          fontSize: font.sizes.xs, fontWeight: font.weights.bold,
          color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.2,
          marginBottom: spacing.sm,
        }}>
          {t('dashboard.primaryAction')}
        </Text>
        <View style={{ gap: spacing.sm }}>
          {QUICK_ACTIONS_CATALOG_NATIVE.map(action => {
            const isSelected = primary === action.id;
            return (
              <TouchableOpacity
                key={action.id}
                onPress={() => handlePrimaryChange(action.id)}
                activeOpacity={0.75}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                  padding: spacing.md, borderRadius: radius.xl, borderWidth: 1.5,
                  borderColor: isSelected ? colors.secondary : colors.borderLight,
                  backgroundColor: isSelected ? `${colors.secondary}08` : colors.bgElevated,
                }}
              >
                <View style={{
                  width: 36, height: 36, borderRadius: 12,
                  backgroundColor: `${action.color}15`,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ionicons name={action.icon as keyof typeof Ionicons.glyphMap} size={18} color={action.color} />
                </View>
                <Text style={{ flex: 1, fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text }}>
                  {action.defaultLabel}
                </Text>
                {isSelected && (
                  <View style={{
                    width: 20, height: 20, borderRadius: radius.full,
                    backgroundColor: colors.secondary,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* SECONDARY ACTIONS header + counter */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{
          fontSize: font.sizes.xs, fontWeight: font.weights.bold,
          color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.2,
        }}>
          {t('dashboard.secondaryActions')}
        </Text>
        <View style={{
          paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full,
          backgroundColor: maxReached ? `${colors.secondary}15` : colors.bgSurface,
        }}>
          <Text style={{
            fontSize: 10, fontWeight: font.weights.semibold,
            color: maxReached ? colors.secondary : colors.textMuted,
          }}>
            {selectedSecondary.length}/6
          </Text>
        </View>
      </View>

      {selectedItems.length > 0 && (
        <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: font.weights.medium, marginTop: -spacing.sm }}>
          Segure e arraste para reordenar
        </Text>
      )}
    </View>
  );

  const ListFooter = availableToAdd.length > 0 ? (
    <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
      <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: font.weights.medium }}>
        {maxReached ? t('dashboard.maxActionsReached') : t('dashboard.tapToAdd')}
      </Text>
      {availableToAdd.map(action => (
        <TouchableOpacity
          key={action.id}
          onPress={() => !maxReached && toggleSecondary(action.id)}
          disabled={maxReached}
          activeOpacity={0.75}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: spacing.md,
            padding: spacing.md, borderRadius: radius.xl, borderWidth: 1,
            borderColor: colors.borderLight,
            opacity: maxReached ? 0.4 : 1,
          }}
        >
          <View style={{
            width: 36, height: 36, borderRadius: 12,
            backgroundColor: `${action.color}10`,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name={action.icon as keyof typeof Ionicons.glyphMap} size={18} color={action.color} />
          </View>
          <Text style={{ flex: 1, fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text }}>
            {action.defaultLabel}
          </Text>
          {!maxReached && (
            <View style={{
              width: 24, height: 24, borderRadius: radius.full,
              backgroundColor: `${colors.brand}15`,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="add" size={14} color={colors.brand} />
            </View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  ) : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

        <View style={{
          backgroundColor: colors.bgElevated,
          borderTopLeftRadius: radius['2xl'],
          borderTopRightRadius: radius['2xl'],
          maxHeight: '92%',
          ...shadows.lg,
          paddingBottom: Platform.OS === 'ios' ? spacing['2xl'] : spacing.lg,
        }}>
          {/* iOS pill indicator */}
          <View style={{
            width: 36, height: 4, borderRadius: 2,
            backgroundColor: colors.border,
            alignSelf: 'center',
            marginTop: spacing.sm,
            marginBottom: spacing.xs,
          }} />

          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
            borderBottomWidth: 1, borderBottomColor: colors.borderLight,
          }}>
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
              {t('dashboard.customizeActions')}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={{
                width: 32, height: 32, borderRadius: radius.full,
                backgroundColor: colors.bgSurface,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* DraggableFlatList as main scroll container */}
          <DraggableFlatList
            data={selectedItems}
            keyExtractor={item => item.id}
            onDragEnd={({ data }) => setSecondary(data.map(a => a.id))}
            renderItem={renderDraggableItem}
            ListHeaderComponent={ListHeader}
            ListFooterComponent={ListFooter}
            contentContainerStyle={{
              padding: spacing.lg,
              paddingBottom: spacing['2xl'],
              gap: spacing.sm,
            }}
            activationDistance={5}
          />

          {/* Save button */}
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
              style={{
                backgroundColor: colors.secondary,
                borderRadius: radius.xl,
                padding: spacing.lg,
                alignItems: 'center',
                opacity: saving ? 0.6 : 1,
                flexDirection: 'row',
                justifyContent: 'center',
                gap: spacing.sm,
              }}
            >
              {saving && <ActivityIndicator size="small" color="#fff" />}
              <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.bold, color: '#fff' }}>
                {saving ? `${t('dashboard.saveActions')}...` : t('dashboard.saveActions')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
