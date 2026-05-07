import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '../../design-system/tokens';

export type ChildTab = 'geral' | 'saude' | 'documentos' | 'educacao';

interface Tab {
  id: ChildTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const TABS: Tab[] = [
  { id: 'geral', label: 'Geral', icon: 'person-outline' },
  { id: 'saude', label: 'Saúde', icon: 'medkit-outline' },
  { id: 'documentos', label: 'Documentos', icon: 'document-text-outline' },
  { id: 'educacao', label: 'Educação', icon: 'school-outline' },
];

interface Props {
  active: ChildTab;
  onChange: (tab: ChildTab) => void;
  documentCount?: number;
}

export default function TabBar({ active, onChange, documentCount }: Props) {
  return (
    <View
      style={{
        backgroundColor: colors.bgElevated,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.borderLight,
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          gap: spacing.md,
          alignItems: 'center',
        }}
      >
        {TABS.map((tab) => {
          const isActive = active === tab.id;
          const showBadge = tab.id === 'documentos' && documentCount && documentCount > 0;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => onChange(tab.id)}
              activeOpacity={0.7}
              style={{
                paddingVertical: spacing.md,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                borderBottomWidth: 2,
                borderBottomColor: isActive ? colors.brand : 'transparent',
              }}
            >
              <Ionicons
                name={tab.icon}
                size={16}
                color={isActive ? colors.brand : colors.textSecondary}
              />
              <Text
                style={{
                  fontSize: font.sizes.sm,
                  fontWeight: isActive ? '700' : '500',
                  color: isActive ? colors.brand : colors.textSecondary,
                }}
              >
                {tab.label}
              </Text>
              {showBadge ? (
                <View
                  style={{
                    backgroundColor: isActive ? colors.brand : colors.bgSurface,
                    minWidth: 18,
                    height: 18,
                    borderRadius: radius.full,
                    paddingHorizontal: 5,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: isActive ? 'white' : colors.textSecondary,
                    }}
                  >
                    {documentCount}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
