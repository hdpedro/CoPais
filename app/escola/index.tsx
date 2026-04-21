import { useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/store/auth';
import { fetchChildren } from '../../src/services/children';
import { supabase } from '../../src/lib/supabase';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import EmptyState from '../../src/components/ui/EmptyState';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

interface ChildSchool { childName: string; schoolName: string | null; grade: string | null; teacherName: string | null; entryTime: string | null; exitTime: string | null; }

export default function EscolaScreen() {
  const { activeGroup } = useAuth();
  const [schools, setSchools] = useState<ChildSchool[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const children = await fetchChildren(activeGroup.groupId);
    const results: ChildSchool[] = [];
    for (const child of children) {
      const { data } = await supabase.from('child_education').select('school_name, grade, teacher_name, entry_time, exit_time').eq('child_id', child.id).single();
      results.push({ childName: child.full_name.split(' ')[0], schoolName: data?.school_name || null, grade: data?.grade || null, teacherName: data?.teacher_name || null, entryTime: data?.entry_time || null, exitTime: data?.exit_time || null });
    }
    setSchools(results);
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Escola" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}>
        {schools.length === 0 && !loading ? <EmptyState icon="🏫" title="Nenhuma escola cadastrada" /> : null}
        {schools.map((s, i) => (
          <View key={i} style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.md, ...shadows.sm }}>
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.sm }}>{s.childName}</Text>
            {s.schoolName ? <Row icon="🏫" label="Escola" value={s.schoolName} /> : <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted }}>Escola nao cadastrada</Text>}
            {s.grade ? <Row icon="📚" label="Serie" value={s.grade} /> : null}
            {s.teacherName ? <Row icon="👩‍🏫" label="Professor" value={s.teacherName} /> : null}
            {s.entryTime ? <Row icon="🕐" label="Horario" value={`${s.entryTime?.slice(0, 5)} - ${s.exitTime?.slice(0, 5) || '?'}`} /> : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm }}>
      <Text style={{ fontSize: 14 }}>{icon}</Text>
      <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted, width: 70 }}>{label}</Text>
      <Text style={{ fontSize: font.sizes.sm, color: colors.text, fontWeight: font.weights.medium, flex: 1 }}>{value}</Text>
    </View>
  );
}
