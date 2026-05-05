/**
 * Child Detail — TELA NATIVA com paridade ao PWA /criancas/[id].
 *
 * Antes: WebView do PWA via PWAWebView (UX híbrida ruim).
 * Agora: 100% React Native nativa, lendo do MESMO Supabase que o PWA.
 *
 * Princípio: zero duplicação de dado. PWA e nativo consomem `children`,
 * `child_medical_info`, `child_allergies`, `active_medications`,
 * `vaccination_records`, `growth_records`, `documents` e `child_education`
 * via RLS. Quem assina pode ler — qualquer mudança em um lado aparece no
 * outro instantaneamente (com pull-to-refresh ou re-foco da tela).
 */

import { useEffect, useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/store/auth';
import { fetchChildDetail, type ChildDetail } from '../../src/services/children';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import ChildHeader from '../../src/components/criancas/ChildHeader';
import TabBar, { type ChildTab } from '../../src/components/criancas/TabBar';
import TabGeral from '../../src/components/criancas/TabGeral';
import TabSaude from '../../src/components/criancas/TabSaude';
import TabDocumentos from '../../src/components/criancas/TabDocumentos';
import TabEducacao from '../../src/components/criancas/TabEducacao';
import UploadSheet from '../../src/components/criancas/UploadSheet';
import { colors, spacing, font } from '../../src/design-system/tokens';

export default function ChildDetailScreen() {
  const { id, tab: initialTab } = useLocalSearchParams<{ id: string; tab?: ChildTab }>();
  const router = useRouter();
  const { activeGroup, userId } = useAuth();
  const groupId = activeGroup?.groupId;

  const [tab, setTab] = useState<ChildTab>((initialTab as ChildTab) || 'geral');
  const [data, setData] = useState<ChildDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id || !groupId) return;
    const result = await fetchChildDetail(id, groupId);
    setData(result);
  }, [id, groupId]);

  // Initial fetch — setState dentro do effect é intencional aqui
  // (precisamos coordenar loading state com a chamada async ao Supabase
  // que só pode rodar no client). É um bridge entre React state e o
  // backend, exatamente o caso permitido pela regra.
  useEffect(() => {
    if (!id || !groupId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [id, groupId, load]);

  // Refresh when screen regains focus (came back from /saude/* etc)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!groupId || !userId) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textSecondary }}>Sem grupo ativo.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="Carregando…" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="Criança" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
          <Text style={{ fontSize: font.sizes.md, color: colors.textSecondary, textAlign: 'center' }}>
            Criança não encontrada ou sem permissão.
          </Text>
        </View>
      </View>
    );
  }

  const { child, medicalInfo, latestGrowth, allergies, medications, vaccinations, documents, education } = data;

  return (
    <View testID="child-detail-screen" style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={child.full_name.split(' ')[0] || 'Criança'} />
      <ChildHeader child={child} medicalInfo={medicalInfo} />
      <TabBar active={tab} onChange={setTab} documentCount={documents.length} />

      {tab === 'geral' && (
        <ScrollView
          style={{ flex: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <TabGeral child={child} medicalInfo={medicalInfo} onSaved={load} />
        </ScrollView>
      )}
      {tab === 'saude' && (
        <ScrollView
          style={{ flex: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <TabSaude
            childId={child.id}
            medicalInfo={medicalInfo}
            latestGrowth={latestGrowth}
            allergies={allergies}
            medications={medications}
            vaccinations={vaccinations}
          />
        </ScrollView>
      )}
      {tab === 'documentos' && (
        <View style={{ flex: 1 }}>
          <TabDocumentos
            childId={child.id}
            documents={documents}
            onUploadPress={() => setUploadOpen(true)}
            onChange={load}
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        </View>
      )}
      {tab === 'educacao' && (
        <ScrollView
          style={{ flex: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <TabEducacao
            education={education}
            onEditPress={() => {
              // /criancas/[id]/escola does NOT exist as a route — the schools
              // editor is /escola (lists all children with per-child modals).
              // Previously this navigation no-op'd silently, breaking the
              // "Cadastrar escola" CTA on the empty-state.
              router.push('/escola' as never);
            }}
          />
        </ScrollView>
      )}

      <UploadSheet
        visible={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => {
          load();
        }}
        groupId={groupId}
        childId={child.id}
        uploadedBy={userId}
      />
    </View>
  );
}
