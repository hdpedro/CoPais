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

import { useState } from 'react';
import { View, Text, ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from 'src/store/auth';
import { fetchChildDetail, type ChildDetail } from 'src/services/children';
import { useCachedFetch } from 'src/lib/use-cached-fetch';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import ChildHeader from 'src/components/criancas/ChildHeader';
import TabBar, { type ChildTab } from 'src/components/criancas/TabBar';
import TabGeral from 'src/components/criancas/TabGeral';
import TabSaude from 'src/components/criancas/TabSaude';
import TabTamanhos from 'src/components/criancas/TabTamanhos';
import TabDocumentos from 'src/components/criancas/TabDocumentos';
import TabEducacao from 'src/components/criancas/TabEducacao';
import UploadSheet from 'src/components/criancas/UploadSheet';
import { useI18n } from 'src/i18n';
import { colors, spacing, font } from 'src/design-system/tokens';

export default function ChildDetailScreen() {
  const t = useI18n(s => s.t);
  const { id, tab: initialTab } = useLocalSearchParams<{ id: string; tab?: ChildTab }>();
  const router = useRouter();
  const { activeGroup, userId } = useAuth();
  const groupId = activeGroup?.groupId;

  const [tab, setTab] = useState<ChildTab>((initialTab as ChildTab) || 'geral');
  const [refreshing, setRefreshing] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data, loading, refresh: load } = useCachedFetch<ChildDetail | null>({
    cacheKey: id && groupId ? `crianca_detail_${id}_${groupId}` : null,
    tag: 'criancas:detail:load',
    empty: null,
    fetcher: () => fetchChildDetail(id!, groupId!),
  });

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
        <ScreenHeader title={t('childDetail.headerLoading')} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={t('childDetail.headerFallback')} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
          <Text style={{ fontSize: font.sizes.md, color: colors.textSecondary, textAlign: 'center' }}>
            {t('childDetail.notFound')}
          </Text>
        </View>
      </View>
    );
  }

  const { child, medicalInfo, latestGrowth, allergies, medications, vaccinations, documents, education, professionals } = data;

  return (
    <View testID="child-detail-screen" style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={child.full_name.split(' ')[0] || t('childDetail.headerFallback')} />
      <ChildHeader child={child} medicalInfo={medicalInfo} />
      <TabBar active={tab} onChange={setTab} documentCount={documents.length} />

      {tab === 'geral' && (
        <ScrollView
          style={{ flex: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <TabGeral child={child} medicalInfo={medicalInfo} groupId={groupId} onSaved={load} />
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
            professionals={professionals}
          />
        </ScrollView>
      )}
      {tab === 'tamanhos' && (
        <View style={{ flex: 1 }}>
          <TabTamanhos childId={child.id} groupId={groupId} />
        </View>
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
