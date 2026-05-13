# Kindar

Aplicativo de coparentalidade para familias com guarda compartilhada. Ajuda pais, avos e cuidadores a organizarem a rotina das criancas de forma colaborativa e respeitosa.

**Producao (PWA):** https://kindar.com.br
**iOS Native:** Kindar Native (Expo/React Native) — TestFlight / App Store
**Dominio:** kindar.com.br
**Repositorio:** https://github.com/hdpedro/CoPais (publico)
**Ultima atualizacao:** 24/04/2026 (v1.1.19)

> 🏗️ **Arquitetura dual**: este repo contem **2 apps** que compartilham o mesmo backend (Supabase):
> - **PWA** (Next.js 16, `src/`) — web + Capacitor wrapper legado
> - **Kindar Native** (Expo/React Native, `kindar-native/`) — app iOS nativo com hybrid WebView para telas complexas (criancas/[id], calendario/novo)
>
> Ambos compartilham o mesmo Supabase, RLS, storage buckets, push notifications (via `/api/native/notify`) e API de automacao (`/api/native/whatsapp`).

## Stack

### PWA (`src/`)
- **Framework:** Next.js 16 (App Router, Turbopack)
- **UI:** React 19
- **Auth & Database:** Supabase (Auth, Postgres, Realtime, RLS)
- **Estilo:** Tailwind CSS 4
- **Linguagem:** TypeScript 5
- **IA:** Multi-provider Router (Groq → Together → Gemini fallback) — assistente conversacional com function calling (12 tools), parsers robustos para PT-BR; Tesseract.js (OCR) para parser de convites de festa; Vision AI para leitura de carteirinha de vacinacao e OCR de recibos (WhatsApp). Vision: Groq llama-4-scout → Together Llama-Vision-Free → Gemini 2.0 Flash. Text: Groq llama-3.3-70b → Together Llama-3.3-70B-Turbo-Free → Gemini 2.0 Flash
- **WhatsApp IA:** Kindar Assistente via Meta Cloud API — webhook, parser local, confirmacao via botoes interativos, OCR de recibos, multi-grupo
- **Deploy:** Vercel (Hobby — free, repo publico)
- **Analytics:** PostHog (30+ eventos rastreados) — cross-platform (PWA + iOS + Android + backend), super-property `platform` stamps every event para breakdown DAU/MAU por plataforma
- **Error Tracking:** Sentry
- **i18n:** 5 idiomas (PT, EN, ES, FR, DE) — ~1488 chaves por locale, 40 secoes
- **Testes:** Playwright E2E (34 testes) + Vitest unitarios (286 testes totais)

### Kindar Native (`kindar-native/`)
- **Framework:** Expo SDK 54 (React Native 0.76, New Architecture)
- **Router:** expo-router v4 (file-based, tab + stack)
- **Auth:** Apple Sign-In (iOS) / Google OAuth (Android) / email
- **Storage:** expo-secure-store (tokens), expo-document-picker, expo-image-picker, expo-calendar
- **Pickers nativos:** `@react-native-community/datetimepicker` (bottom-sheet wheel iOS, dialog Android)
- **WebView hibrida:** `react-native-webview` com session injection Supabase — usado em `criancas/[id]` e `calendario/novo` para reaproveitar 2000+ LOC do PWA
- **Offline:** `safeWrite` queue em `src/services/offline.ts` (AsyncStorage)
- **Push:** APNs via expo-notifications + server-side `/api/native/notify`
- **Analytics:** `posthog-react-native` (`app/_src/lib/analytics.ts`) — SDK puro JS, sem plugin EAS; identifica com `auth.users.id` (mesmo distinctId do PWA) e registra `platform: 'ios' | 'android'` como super-property
- **Build:** EAS Build (production) com `appVersionSource: remote` + autoIncrement
- **Submit:** EAS Submit → App Store Connect API (via `kindar-asc.mjs` local + GitHub Actions)
- **Distribuicao:** Auto-distribute do build para testers individuais + grupos externos (`distributeBuildToTesters` em `kindar-asc.mjs`)

## Numeros do Projeto

| Metrica | Quantidade |
|---------|-----------|
| Rotas PWA (paginas + API) | 66 |
| Rotas Native (expo-router) | 56 telas |
| Server Actions | 86 funcoes em 24 arquivos |
| API routes `/api/native/*` | 2 (notify, whatsapp) |
| Tabelas no banco | 45+ (inclui custody_schedules, custody_balance_operations, activity_reports, medication_doses, checklist_completions, whatsapp_phone_links, clinical_context_inferences) |
| Migrations | 52 |
| Client Components PWA | 36+ |
| Componentes Native | 22 (ui, calendar, activities, profile) |
| Chaves de traducao | ~1488 por idioma (PT/EN/ES/FR/DE) |
| Testes Vitest | 286 passando |
| Builds iOS (TestFlight) | v1.0.1 (32+) |

## Kindar Native (iOS/Android app)

O app nativo vive em `kindar-native/` e foi construido com **Expo SDK 54**. Compartilha 100% do backend com o PWA (mesmo Supabase, mesmas tabelas, mesmas actions). Cobre **paridade funcional completa** com o PWA nas telas criticas (dashboard, calendario, chat, saude, despesas, criancas).

### Estrategia: Native-first com WebView para features complexas

Telas simples (CRUD, listas) sao implementadas nativamente (FlatList + expo-router). Telas com forms de 1000+ LOC ou logica rica (ex: `/criancas/[id]` com 4 tabs + upload, `/calendario/novo` com recorrencia customizada) sao reaproveitadas via **WebView com session injection**:

```ts
// Inject Supabase session into WebView localStorage BEFORE page load
const injectedJS = `
  localStorage.setItem('sb-{project-ref}-auth-token', ${JSON.stringify(sessionPayload)});
`;
<WebView source={{ uri: PWA_URL + path }} injectedJavaScriptBeforeContentLoaded={injectedJS} />
```

Usuario nao precisa fazer login; UX indistinguivel de tela nativa; app ganha todas as features do PWA automaticamente quando o PWA evolui.

### Telas native puras (reescritas em React Native)

| Tela | Gap fechado vs PWA |
|------|--------------------|
| Dashboard | Hero dark com streak, child cards, pending reports, grid 3x2 "Acoes rapidas" |
| Calendario | Cells ricas com pills de horario, feriados BR, CTA "Gerar escala", legenda com nomes (nao email), banner "Amanha: troca de guarda" |
| Chat | Channel tabs, "Hoje" divider, read checks ✓✓, system cards para notificacoes do grupo, image attach |
| Saude (7 subtelas) | Consultas, Vacinas, Crescimento, Doencas (com EvolutionQuickAction ✅ 📈/📉 inline), Medicamentos (com `ConfirmDoseButton` + historico), Alergias, Receita (OCR) |
| Despesas | Delete (longpress) + Receipt viewer modal + date picker nativo + foto comprovante |
| Atividades | Tap = edit, longpress = soft-delete, `Checklist` + `Relatar` modals |
| Escola | Edit flow por crianca com TimePickerField |
| Criancas | Edit modal com todos os campos PWA (full_name, birth_date, gender, blood_type, allergies, CPF, RG, notes) |
| Swap + Balance Operations | `SwapBalanceCard` + `BalanceHistorySheet` + `ProposeBalanceAdjustmentSheet` + approve/reject inline |
| Eventos | Edit + delete + toggle "dia inteiro" |

### Telas via WebView (reaproveitam PWA)

| Tela | Motivo |
|------|--------|
| `/criancas/[id]` | 964 LOC no PWA com 4 tabs + upload de documentos + growth charts |
| `/calendario/novo` | 1167 LOC no PWA com recorrencia avancada, split custody, approval workflow |

### Features native-only (nao existem no PWA)

- **Sincronizar com Celular** — `expo-calendar` exporta eventos (guarda/atividades/eventos) para o calendario nativo do iOS/Android. Compacta runs contiguos de custody em single multi-day entry (em vez de N entries diarias).
- **Auto-distribute para TestFlight** — `kindar-asc.mjs` apos build VALID: lista beta groups externos + testers individuais, anexa build via `POST /v1/betaGroups/{id}/relationships/builds` e `POST /v1/builds/{id}/relationships/individualTesters` → email de convite enviado automaticamente.
- **Push deep link** — `addNotificationResponseListener` em `_layout.tsx` faz `Linking.openURL` ou `router.push` baseado no payload.

### Build e deploy

```bash
# Tag release → CI roda automaticamente
git tag v1.1.20
git push origin v1.1.20

# GitHub Actions (ios-release.yml) executa:
# 1. audit → metadata config (categorias, copyright, age rating, content rights, pricing)
# 2. EAS Build production (autoIncrement build number)
# 3. EAS Submit to ASC (via AuthKey.p8)
# 4. Wait Apple processing (max 30min polling)
# 5. distributeBuildToTesters (anexa build a grupos externos + testers individuais)
# 6. Submit for Review (cria reviewSubmission, anexa version)
```

Fluxo local (se tiver quota EAS):
```bash
cd kindar-native
eas build --platform ios --profile production --non-interactive --wait
eas submit --platform ios --profile production --latest
cd .. && node kindar-asc.mjs --wait-processing
```

Ver [`DEPLOY-IOS.md`](DEPLOY-IOS.md) para detalhes do pipeline ASC (schema 2024+ do age rating, custody_schedules vs coparenting_groups, pricing via v1 com manualPrices nested).

### Legado: iOS App (Capacitor)

> ⚠️ **Deprecado em favor do Kindar Native**. Mantido como fallback PWA wrapper (`ios-plugins/` + `capacitor.config.ts`). Builds novos devem usar Expo via `kindar-native/`.

## Internacionalizacao (i18n)

O app suporta **5 idiomas** completos:
- **Portugues (BR)** — padrao
- **Ingles (EN)**
- **Espanhol (ES)**
- **Frances (FR)**
- **Alemao (DE)**

**Arquitetura i18n:**
- ~1488 chaves de traducao por idioma, organizadas em 40 secoes
- Arquivos de traducao em `src/i18n/locales/{pt,en,es,fr,de}.json`
- `I18nProvider` envolvendo o layout do app
- Hook `useI18n()` usado em todos os Client Components
- `LanguageSelector` na pagina de perfil para troca de idioma

## Modulos e Funcionalidades (20 modulos)

### 1. Dashboard (`/dashboard`)
- Saudacao personalizada com nome do usuario e data
- Card "Guarda ativa" com info de custodia por filho, streak de dias, proxima troca
- Visao da semana (7 dias com cores de guarda + feriados)
- **Alertas de saude**: medicamentos ativos, alergias criticas, consultas proximas, doencas ativas
- **Atividades do dia/amanha**: cards com icone de categoria, horario, checklist preview
- **Eventos sociais** integrados na mesma secao de atividades
- Card "Agenda" com proximos compromissos (guarda especial + atividades + eventos)
- **Decisoes pendentes** com votacao pendente e urgencia
- **Relatorios pendentes** de atividades
- Resumo financeiro do mes com saldo entre responsaveis
- Despesas pendentes de aprovacao
- Check-ins recentes
- Acoes rapidas (Agenda, Despesas, Check-in, Chat, Saude, Documentos)
- **Performance**: queries consolidadas e paralelas com `Promise.all()`

### 2. Agenda Unificada / Calendario (`/calendario`)
- **Grade mensal** estilo Apple com 7 colunas (Dom-Sab), pills coloridos por responsavel
- **Barras de custodia** coloridas (teal = 1o pai, coral = 2o pai)
- **Dots laranjas** nos dias com atividades/eventos
- Destaque do dia atual (ring), navegacao entre meses
- **Day Detail Sheet** com accordion: guarda do dia + atividades + eventos ao clicar num dia
- **Fix de eventos**: removida coluna `category` inexistente do SELECT na query de eventos (causava retorno null do Supabase); categoria hardcoded como "evento"
- **Saldo de trocas (Swap Balance)**: componente `SwapBalanceCard` mostra debito/credito de dias entre pais, calculado por `computeSwapBalance()` + ajustes do ledger via `getEffectiveBalance()`
- **Operacoes de Saldo Consensual (Balance Operations)**: sistema de ajustes bilaterais — debit, credit, waive (sem saldo), gift_day (doacao), forgive_balance (perdao parcial), reset_balance (zeramento), manual_adjustment. Tabela `custody_balance_operations` + actions em `balance-operations.ts`. UI: card premium com historico, botao "Propor ajuste", notificacoes push + chat. Todas as operacoes requerem aprovacao bilateral
- **Troca como divida**: solicitar dia sem oferecer data de retorno gera divida de 1 dia
- Planejador de fins de semana (mostra disponibilidade dos proximos weekends)
- Exportacao iCal para sincronizar com celular (Google Calendar, Apple Calendar)
- **Feriados nacionais brasileiros** automaticos (fixos + moveis: Carnaval, Pascoa, Corpus Christi) com destaque visual vermelho
- **Aniversarios das criancas**: pill magenta automatico em cada aniversario derivado de `children.birth_date` (sem nova tabela). Para nascidos em 29/02, em anos nao-bissextos cai em 28/02. Lembrete push + in-app **7 dias antes** via cron `/api/cron/birthday-reminders`
- Solicitacao de troca entre pais (requer aprovacao)
- Solicitacao de visita por avos/cuidadores (requer aprovacao do responsavel do dia)
- **Sistema de aprovacao de eventos**: criador edita direto + notifica; outro usuario cria request de aprovacao. Troca de guarda sempre requer aprovacao. Badge visual "pendente" bloqueia acoes duplicadas. Diff visual (antes/depois) na lista de requests. Audit trail completo via `event_history`. Validacao de snapshot previne conflitos de edicao simultanea
- **Performance**: 8 queries paralelas via `Promise.all()`, range reduzido (3 meses), `.limit()` em todas as queries, `useMemo` no grid, `useCallback` nos handlers, fix de timezone com `getBrazilNow()`

### 3. Atividades Recorrentes (integrado na Agenda)
- **Atividades recorrentes** das criancas (futsal, natacao, dentista, etc.) com 7 opcoes de recorrencia
- **Checklist inteligente**: itens pre-preenchidos por categoria (ex: esporte -> uniforme, chuteira, meia)
- **Relatorios de atividade (Activity Reports)**: status da atividade (completa/faltou/cancelada), humor da crianca, notas. **Modal reseta campos** ao abrir para nova atividade. **Fix de cor de texto** no textarea (cor explicita + placeholder para evitar texto invisivel)
- **Editar ocorrencia unica vs todas** (estilo Google Calendar): `editActivityOccurrence` para overrides JSONB de uma data, `editActivityAll` para alterar atividade inteira
- **Cancelar ocorrencia unica** (`cancelActivityOccurrence`): cancelar apenas uma data especifica
- **Trocar responsavel** (`changeActivityResponsible` / `changeActivityResponsibleAll`): trocar responsavel para uma ocorrencia ou para todas
- **Campos extras**: professor, turma, sala, responsavel fixo
- **Push notifications** 24h antes de cada atividade com lista de materiais
- Suporte a **multiplos filhos** por atividade/evento (opcao "Todos")
- **Cron automatico** para lembretes via Vercel Cron (`/api/cron/activity-reminders`)
- **Cron de lembretes nao respondidos** (`sendMissedReportReminders`)
- **Observabilidade de CRONs**: executor central com retry 1x, log persistente em `cron_logs`, relatorio diario agregado por email via `/api/cron/daily-report`
- **Relatorio Mensal da Crianca**: email automatico no dia 1 de cada mes com resumo completo (atividades, saude, custodia, despesas) enviado a cada responsavel via `/api/cron/monthly-report`
- **Compartilhar atividade via WhatsApp**: botao de share nos cards do dashboard, DayDetailSheet e ChecklistModal. Usa Web Share API (mobile) com fallback para `wa.me/?text=`. Texto formatado com emoji da categoria, nome da crianca, horario e local

### 4. Invite Parser — Adicionar via Convite (`/calendario/convite`)
- Usuario faz upload de foto ou PDF de convite de festa
- **OCR via Tesseract.js** extrai o texto da imagem (100% client-side, sem custo)
- **Groq LLM** interpreta o texto extraido e estrutura os dados do evento (titulo, data, horario, local, notas)
- Preview editavel mostra os dados detectados antes de salvar
- Usuario pode vincular a um filho e confirmar para salvar no calendario
- **100% free tier**: Tesseract.js (gratuito) + Groq API (plano gratuito)
- **Arquitetura modular** (`src/lib/ai/parser/`):
  - `types.ts` — interfaces `ParsedEventData`, `ParseResult`, `ParserMetadata`
  - `event-parser.interface.ts` — interface `EventParser`
  - `ocr.ts` — extracao de texto via Tesseract.js
  - `groq-event-parser.ts` — interpretacao via Groq LLM
  - `pilot-parser.ts` — `PilotParser` (implementacao free tier)
  - `index.ts` — factory com flag `AI_MODE` para troca futura de backend
- **API Route**: `POST /api/ai/parse-invite` — recebe arquivo, executa OCR + LLM, retorna dados estruturados com logging
- **Tabela de log**: `ai_event_logs` (migration `00030_ai_event_logs.sql`) — armazena `raw_text`, `parsed_json`, `success`, `parser_type`, `processing_time_ms`, `ocr_confidence` para analise de qualidade
- **Navegacao**: acessivel a partir de `/calendario/novo` (seletor de categoria tem atalho "Via convite")
- **i18n**: chaves `inviteParser.*` em todos os 5 idiomas

### 5. Eventos (`/eventos` -> integrado no Calendario)
- Eventos sociais (aniversarios, festas) integrados no calendario
- Suporte a **eventos multi-dia** (`end_date`), **all-day**, **viagem**
- Campo `assigned_to` para responsavel pelo evento
- CRUD completo: createEvent, updateEvent, deleteEvent, cancelEvent

### 6. Chat com IA Mediadora (`/chat`)
- Chat em tempo real via Supabase Realtime (postgres_changes)
- **Canais de chat**: canal Geral + canais por crianca (modulo `chat-channels`)
- **Troca de canal instantanea**: client-side switching sem reload de pagina, com **cache LRU em memoria** (ate 5 canais)
- **Tabs de canal** mostram inicial do nome da crianca (em vez de emoji generico)
- **Atualizacao otimista**: mensagens aparecem instantaneamente ao enviar (fix de duplicacao)
- **Read receipts** com `Promise.allSettled` para robustez
- Analise de tom automatica: detecta linguagem agressiva antes de enviar
- Sugestao de reformulacao pela IA Mediadora quando tom inadequado detectado
- Opcoes: usar sugestao, enviar original ou descartar
- Refresh automatico de sessao para evitar expiracao de token
- **Fix de memory leak** no listener de tempo real
- **Deteccao de teclado**: bottom nav se esconde automaticamente quando teclado virtual abre
- Exportacao PDF com filtro por canal
- Mensagens **imutaveis** (conformidade legal — triggers impedem DELETE/UPDATE)
- **API Route** `/api/chat/messages` para busca de mensagens por canal

### 7. Saude Completa (`/saude` — 9 sub-modulos)
- **Dashboard context-aware com 3 estados**: (A) Saudavel — card verde, acoes rapidas; (B) Doente — hero vermelho com evolucao inline (melhorou/piorou), botao resolver doenca, medicamentos dedicados, diario de sintomas; (C) Em Tratamento — hero azul com foco em medicamentos
- **Timeline de atividade recente**: ultimos 10 eventos de saude (doses, sintomas, consultas, doencas, crescimento) em ordem cronologica com links diretos
- **Menu compacto de navegacao**: 5 icones (Vacinas, Crescimento, Profissionais, Historico, PDF) com badges de alerta
- **Wizard "Crianca esta doente"** (`/saude/doencas/nova`): fluxo guiado de 3 passos — (1) doenca com sintomas e severidade, (2) medicamento opcional com frequencia, (3) consulta opcional. Cria tudo em uma unica action com notificacao consolidada
- **Acoes rapidas inline**: `EvolutionQuickAction` (melhorou/piorou com nota), `ResolveIllnessAction` (resolver doenca com opcao de finalizar medicamentos). Ambas com feedback visual e notificacao ao co-parent
- **Banner de vacinas atrasadas** no dashboard de saude
- **Diario de Sintomas** (`/saude/sintomas`): registro rapido de sintomas (febre, vomito, diarreia, tosse, dor, mancha, falta de apetite, outro) com intensidade (leve/moderado/forte), temperatura para febre, notas, vinculo com episodio de doenca ativo. Timeline cronologica agrupada por dia (ultimos 7 dias). Botao "Compartilhar com pediatra" copia resumo formatado. Push notifications para grupo. Bottom sheet modal com design mobile-first
- **Doencas** (`/saude/doencas`): episodios com sintomas, severidade (leve/moderado/grave), evolucao timestamped, status (ativo/resolvido/cronico), ida ao hospital, `ResolveButton`, `UpdateEpisodeForm`. Validacao de status — rejeita valores invalidos em `updateIllnessEpisode`
- **Medicamentos** (`/saude/medicamentos`): dosagem, frequencia, registro de doses, status (ativo/pausado/completo/cancelado), pagina de detalhe por medicamento (`/saude/medicamentos/[id]`). **Validacao server-side de intervalo entre doses** (rejeita se < 30 min). `ConfirmDoseButton` na lista E no detalhe do medicamento. **Validacao server-side de campos obrigatorios** (nome, dosagem, frequencia, data inicio) antes do insert. Progress de tratamento pre-computado no server (progressMap). **Uso continuo** para medicamentos sem data final ("Uso continuo — Dia N"). **Medicamentos sob demanda** (SOS) mostram ultima dose. Links diretos do dashboard para detalhe do medicamento. Proxima dose estimada na pagina de detalhe
- **Consultas** (`/saude/consultas`): agendamento, profissional, tipo (rotina/emergencia/retorno/exame), diagnostico, data de retorno, auto-sync com calendario, `CompleteAppointmentForm` (i18n completo), botao WhatsApp para agendamento
- **Alergias** (`/saude/alergias`): tipo, severidade, reacao, info medica (tipo sanguineo, convenio, SUS). **Edicao e exclusao inline** com formulario. Service role usado para query (workaround de RLS). Fix de coluna `notes` inexistente
- **Vacinas** (`/saude/vacinas`): comparacao com **calendario SBP** (Sociedade Brasileira de Pediatria), confirmacao de doses (`ConfirmDoseButton`)
- **Crescimento** (`/saude/crescimento`): peso, altura, perimetro cefalico com **grafico visual** (`GrowthChart`), dados WHO
- **Profissionais** (`/saude/profissionais`): diretorio com especialidade, CRM, telefone, WhatsApp
- **Ficha de Emergencia** (`/saude/emergencia`): QR Code com dados criticos de saude para emergencias. Endpoint publico renderiza HTML auto-contido. Token UUID por crianca para seguranca
- **Inferencia Clinica de Receita** (`/saude/receita`): Upload de foto de receita medica com OCR via Vision AI, inferencia de possiveis indicacoes clinicas por medicamento, cruzamento com historico da crianca (antibioticos recentes, recorrencias, sintomas, alergias), alertas inteligentes. Suporte via WhatsApp (caption "receita"). Feature gating: Free (OCR), Premium (inferencia + historico), Elite (alertas). Tabela `clinical_context_inferences` com enrichment em `illness_episodes`. Cache de inferencias por medicamento normalizado (30 dias). NUNCA diagnostica — linguagem informativa com disclaimer obrigatorio
- **Exportacao** (`/saude/export`): exportar registros de saude
- **Rastreamento de visualizacoes** (`HealthViewTracker`, `ViewedByBadge` com i18n)
- **Push notifications** para TODOS os eventos de saude (alergias, vacinas, consultas, crescimento)
- **Coordenação ativa (Fase 3 da Foundation Collab — `00080`)**:
  - Push pra coparentes ao criar consulta / doença / medicamento / alergia / vacina (coalescing 60s + priority-aware)
  - `illness_episodes.severity='grave'` promove priority pra `urgent` **automaticamente via trigger SQL** (server enforce — não confia no client)
  - Dashboard tile **consolidada** "Saúde · N novos" (soma agregada dos 5 record_types) com deep link pra `/saude`
  - Telemetria PostHog: `unread_count` (saude_aggregate), `notification_sent`, `urgent_created` (quando grave)
  - Migration `00080_collab_saude.sql`: 5 ALTER TABLE com priority, `collab_record_group()` estendida, trigger genérico `saude_auto_mark_creator_read`, trigger `illness_episodes_grave_to_urgent`, backfill em 5 tabelas
  - Wrapper server `src/lib/services/health-collab.ts:notifySaudeCreate` + endpoint `POST /api/health/notify-create` pro native chamar pós-INSERT
  - `safeWrite` estendido com `returnInsertedId` (backward-compatible) pra capturar id da row criada e disparar notify
  - Fora da adoção (anti-spam): doses, sintomas, crescimento, info médica básica, profissionais
- **Sanitizacao de input** em todos os campos de texto de saude (max length limits)
- **Link /saude/alergias/editar-info corrigido** (agora faz scroll ate o formulario)

### 8. Despesas / Financeiro (`/despesas`, `/financeiro`)
- Registro de despesas compartilhadas com categorias (8 categorias)
- **Upload de comprovantes** (JPG/PNG/HEIC/WebP/PDF) com visualizador (`ReceiptViewer`). Deteccao de PDF corrigida para URLs com query params
- **Seletor de crianca multi-select** com chips (pode selecionar 1, 2 ou todas as criancas)
- Aprovacao/rejeicao de despesas. **Auto-aprovacao bloqueada** — nenhum usuario pode aprovar sua propria despesa
- **Regressao de status impedida** — despesas aprovadas/rejeitadas nao podem voltar para pendente
- **Exclusao de despesas** com confirmacao (`DeleteExpenseButton`)
- **Splitwise-style balances**: split_ratio configuravel, calculo automatico de saldo (**somente despesas aprovadas** contam no balanco)
- **Limite de query aumentado** de 200 para 10000 para calculo preciso de saldo
- **Validacao server-side de acertos**: valor validado contra saldo real (rejeita valor > saldo + R$0.01)
- Dashboard financeiro com resumo mensal, breakdown por categoria, historico
- **Acertos financeiros (Settlements)**: registro de pagamentos (PIX, dinheiro, transferencia), confirmacao de recebimento
- Redirect apos criacao de despesa corrigido (removido try/catch que capturava excecao de redirect)
- **Coordenação ativa (Fase 1B da Foundation Collab — `00078`)**:
  - Push pro outro responsável quando despesa é criada (coalescing 60s + priority-aware)
  - Badge "Nova" no card, chip de prioridade (Info / Importante / Urgente), "Visto por X · 14:32" no card expandido
  - Filtros por status (Tudo / Pendentes / Aprovadas / Rejeitadas / Canceladas) + agrupamento por mês com total
  - markAsRead apenas no tap explícito do card
  - Dashboard mostra linha "N despesas pra ver" linkando pra /despesas
- **Edição/correção (Fase 1B)**:
  - **Editar**: pending/rejected = edita livre; approved = qualquer mudança REVERTE pra pending (re-aprovação obrigatória)
  - **Cancelar**: pending/rejected = cancela direto; approved = pede acordo do reviewer (status `cancel_pending` → coparente aprova ou recusa)
  - **Reabrir**: reviewer pode reabrir aprovação em até 24h (motivo obrigatório, server enforce)
  - **Audit trail imutável** (`expense_history`): quem fez o quê e quando, snapshot before/after pra edits, motivo nas ações que exigem. Panel inline no card expandido
- Votacao estruturada: concordo / discordo / vou pensar
- Argumentos pro/contra por decisao
- **Auto-resolucao** quando todos votam
- **Indicadores de urgencia**
- Widget no Dashboard com decisoes pendentes

### 10. Acordos (`/acordos`)
- Registro de acordos de coparentalidade
- **10 categorias**: principio, valor, regra, limite, rotina + 5 mais
- Aceitar/rejeitar acordos (`acceptAgreement`)
- Flag **nao-negociavel** para acordos criticos

### 11. Notas Privadas (`/notas`)
- Notas pessoais visiveis apenas pelo criador
- CRUD completo (criar, editar, deletar)
- Nao compartilhadas com o grupo

### 12. Documentos (`/documentos`)
- Dashboard de documentos com visao geral de **todas as criancas**
- Card por crianca com **barra de completude** (0-100%)
- Indicadores de documentos faltantes (badges)
- Upload e visualizacao de documentos (`DocumentList`, `DocumentViewer`)
- Links diretos para upload na aba Documentos do perfil da crianca
- Suporte a upload por crianca
- **Prevencao de upload duplicado**: botao desabilitado durante upload + reset do input apos sucesso

### 13. Criancas (`/criancas`)
- Lista de criancas com foto e idade
- **Perfil individual com 4 abas** (`/criancas/[id]`):
  - **Geral**: nome, data de nascimento, CPF, RG, notas
  - **Saude**: peso/altura, tipo sanguineo, convenio, alergias, medicamentos, vacinas (dados agregados)
  - **Documentos**: upload/visualizacao de documentos por crianca (RG, CPF, passaporte, certidao)
  - **Educacao**: nome/endereco/telefone da escola, serie, professor(a), coordenador(a), horarios de entrada/saida, atividades extracurriculares
- Novos campos: `cpf`, `rg`
- Tabela `child_education` (informacoes escolares, relacao 1:1 com `children`)

### 14. Check-in Diario (`/checkin`)
- Registro rapido: tempo de tela, alimentacao, sono, humor, saude, atividade, escola
- **8 categorias** com icones e templates rapidos
- Historico de check-ins por crianca
- **Integracao com Chat**: cada check-in envia mensagem automatica ao grupo

### 15. Escola (`/escola`)
- Registro de notas escolares e ocorrencias
- Integrado na aba Educacao do perfil da crianca
- **Coordenação ativa (Fase 1 da Foundation Collab — `00077`)**:
  - Push pro outro responsável quando alguém cria registro (com coalescing 60s)
  - Badge "Novo" no card, "Visto por X · 14:32" estilo iMessage, chip de prioridade (Info / Importante / Urgente)
  - Sort: unread DESC → priority DESC → date DESC
  - markAsRead SOMENTE no tap explícito do card (nunca em scroll/mount)
  - Dashboard mostra linha "N registros escolares novos" linkando pra /escola
  - Migration `00077_collab_foundation.sql` introduz infra reutilizável pros próximos módulos colaborativos (Saúde, Decisões, Financeiro). Vide `.claude/CLAUDE.md` seção "Foundation: Collaborative Records".

### 16. Temas Sensiveis (`/temas-sensiveis`)
- Espaco para discussao de temas delicados
- **Delecao com dupla aprovacao**: `requestDeletion`, `approveDeletion`, `cancelDeletion` — um solicita, outro confirma
- Campos `deletion_requested_by`, `deletion_requested_at` para tracking

### 17. Familia / Gestao de Grupo (`/familia`)
- Visualizacao dos membros do grupo familiar
- **Sistema de roles**: admin, member, readonly
- Acoes de membro: `changeMemberRole`, `removeMember`, `leaveGroup`
- Cancelar/deletar convites pendentes
- Gestao de convites por email com link unico (token)
- Status visual: Aceito (verde), Pendente (amarelo), Expirado (vermelho)
- Roles: Pai/Mae, Avo, Cuidador, Mediador, Advogado

### 18. Assistente IA Kindar (`/api/ai/assistant`)
- **Assistente conversacional completo** com interface de chat, sugestoes rapidas e input por voz (Speech Recognition API)
- **Arquitetura AI centralizada** (`src/lib/ai/`): todo codigo de IA em modulo unico com subpastas `core/`, `providers/`, `router.ts`, `image-utils.ts`
- **Multi-provider AI Router** (`src/lib/ai/router.ts`): Groq (primario) → Together (fallback) → Gemini (ultimo recurso)
  - **Vision**: Groq `llama-4-scout` → Together `Llama-Vision-Free` → Gemini `gemini-2.0-flash`
  - **Text**: Groq `llama-3.3-70b` → Together `Llama-3.3-70B-Turbo-Free` → Gemini `gemini-2.0-flash`
  - **Tools**: Groq → Together (ambos OpenAI-compatible function calling)
- **AI Service**: `generateAIResponse()` ponto de entrada unico para todas as features de IA (`src/lib/ai/core/`)
- **Usage tracking**: `canUseAI()`, `recordUsage()` — preparado para monetizacao (billing desabilitado por ora)
- **Novas tabelas**: `ai_requests` (logging de requests) e `usage_events` (tracking de monetizacao)
- **Supabase Admin Client**: `src/lib/supabase/admin.ts` — client centralizado com service role
- **Parsers robustos para PT-BR**: `parseAmount()` ("R$ 45,00", "120 conto" — distingue decimal de milhar), `parseDate()` ("DD/MM/YYYY", "DD/MM"), `parseTime()` ("14h", "14h30", "14:00"), `parseDaysOfWeek()` ("terca", "quinta" → formato DB)
- **12 tools Groq-compatible** (`ai-tools.ts`):
  - **6 tools de acao**: `create_expense`, `create_event`, `create_appointment`, `create_checkin`, `create_note`, `create_activity`
  - **5 tools de consulta**: `get_custody_info`, `get_expenses_summary`, `get_upcoming_events`, `get_children_info`, `get_health_summary`
  - **1 tool de comunicacao**: `draft_message`
- **Confirmacao antes de acoes**: tools de criacao (create_*) pedem confirmacao do usuario antes de executar ("Confirma? [descricao]"). Tools de consulta (get_*) executam imediatamente
- **Multi-round tool calling**: ate 3 rodadas com `tool_choice: "auto"` + resposta final forcada com `tool_choice: "none"`
- **Contexto familiar** (`ai-context.ts`): injeta dados de filhos, membros e custodia para respostas personalizadas
- **System prompt adaptativo**: tom de coparentalidade quando `custody_enabled=true`, tom de organizacao familiar quando `custody_enabled=false` — suporta posicionamento duplo do app
- **React Portal**: componente `AIAssistant.tsx` renderiza em `document.body` via `createPortal` (escapa CSS `backdrop-blur` containing block no header mobile)
- **Integracao no shell**: botao IA no header mobile + botao flutuante no desktop (`ResponsiveShell.tsx`)
- **Rate limiting** (`ai-rate-limit.ts`) por usuario com mensagens amigaveis
- **Cache de respostas** (`ai-cache.ts`) com TTL de 5 minutos
- **50 testes unitarios** (Vitest) com **98.5% de acuracia** em load test
- **SSR-safe**: container do Portal usa `useState` + `useEffect` para compatibilidade com server-side rendering

### 19. Notificacoes (`/notificacoes`)
- **In-app**: lista de notificacoes com marcacao de lida (`markNotificationRead`, `markAllNotificationsRead`)
- **Web Push**: push notifications via VAPID (web-push)
- **Badge count**: `NotificationBadge.tsx` mostra contagem no nav
- **Push para chat**: `/api/push/chat` envia push ao receber mensagem
- **Subscribe**: `/api/push/subscribe` para registro de subscription
- 12 tipos de notificacao (expense_new, swap_request, chat_message, activity_reminder, etc.)
- Todas as acoes importantes geram notificacao automatica via `postChatNotification()`

### 20. Perfil (`/perfil`)
- Edicao de nome e dados pessoais (`EditProfileForm`)
- **Seletor de idioma** (`LanguageSelector`) — 5 idiomas
- **Sincronizacao de calendario** (iCal) via `CalendarExportButton`
- **Seletor de grupo** (`GroupSelector`) para usuarios em multiplos grupos

### 21. Assinatura / Billing (`/assinatura`)
- **Modelo per-group**: 1 assinatura por `coparenting_group` cobre todos os membros. Apenas `profiles.role = 'parent'` pode pagar — avos, cuidadores, mediadores e advogados sempre gratis.
- **3 planos no lançamento**: Gratis / Harmonia (R$24,90/mes) / Premium Juridico (R$39,90/mes). Anuais com 20% off.
- **Early Bird eterno**: primeiras 1.000 familias pagam R$19,90/mes para sempre. Capacity enforcement via trigger Postgres + advisory lock (migration 00056).
- **Degustação de 7 dias**: todo novo grupo recebe Premium Juridico automaticamente no signup, sem cartão. Uma trial por usuario, para sempre.
- **Onboarding Quest**: widget no dashboard com 5 passos que tocam features premium (add_child, setup_calendar, invite_co, ocr_prescription, ai_agreement) — correlaciona com conversao.
- **Fonte de verdade cross-platform**: `GET /api/billing/status?groupId=X` retorna tier, status, trial info, counters. PWA / iOS / Android consultam antes de mostrar features premium.
- **Crons**: `/api/cron/trial-expiry` (03:00 UTC, marca expirados) + `/api/cron/trial-reminder` (17:00 UTC, email D-5 + push D-6).
- **Mensagem central**: "Assine uma vez. Família toda acessa."
- **Split automático** (Fase 2): botão "Dividir com co-responsavel" usa módulo Despesas existente para criar despesa recorrente 50/50.
- **Stack**: `src/lib/billing/` (tiers, payer, group-subscription, early-bird, feature-gate, trial) + `src/actions/onboarding-quest.ts` + `src/components/billing/` (TrialBanner, OnboardingQuest, EarlyBirdBadge).
- Documentacao completa: `MONETIZACAO.md`.

## Escala de Guarda (`/calendario/escala`)
- **Escala opcional**: botao "Limpar escala" permite uso do app sem escala definida
- **Dashboard adapta** quando nao ha escala (oculta card de guarda ativa)
- **Padrao quinzenal**: grade de 14 dias (2 semanas x 7 dias)
- Tocar no dia alterna entre responsaveis (ciclo: vazio -> pai A -> pai B -> vazio)
- **4 modelos prontos**: semanas alternadas, 5-2/2-5, 3-4/4-3, 2-3+FDS alternado
- Seletor de data de inicio, duracao (3, 6 ou 12 meses)
- Gera eventos em lote no banco (batches de 100)
- **Limpar escala**: `clearCustodySchedule` para resetar

## Novo Compromisso (`/calendario/novo`) — Formulario Unificado Premium
- **Seletor de categoria**: grid 4 colunas com icones grandes, 11 categorias incluindo Curso e Viagem
- **Design premium**: cards brancos rounded-2xl com shadow-sm, secoes com icones e labels uppercase
- **Progressive disclosure**: detalhes adicionais, checklist e notas em secoes colapsaveis
- **Responsavel com avatar**: mostra NOME com iniciais coloridas em circulos
- **Selector de filhos com iniciais**: circulos coloridos (Sage #5B9E85)
- **Recorrencia simplificada**: 3 opcoes rapidas (Unica vez / Semanal / Personalizar)
- **Touch targets**: minimo 44px em todos os botoes interativos
- **Botao submit fixo**: fixed bottom com gradiente
- **93 novas chaves i18n** para o formulario (`newForm.*`)
- **Campos variam por tipo**: Atividade, Evento, Guarda — cada um com ordem otimizada de campos

## Performance

- **Dynamic imports** para 6 componentes pesados (AIAssistant, GrowthChart, etc.)
- **React.memo** em ChatRoom MessageBubble
- **useMemo** em DashboardClient, FinancialDashboard, CalendarGrid
- **i18n lazy loading**: apenas locale padrao carregado, demais sob demanda
- **PostHog**: 30+ eventos rastreados em todas as actions
- **Sentry**: error tracking em producao
- **Calendario otimizado**: range reduzido de 6 para 3 meses, 8 queries paralelas, `.limit()` em todas as queries
- **Landing page otimizada**: cookie check antes de `getUser()`
- **Promise.all()** em queries paralelas (Dashboard, Calendario, Check-in, Sintomas)
- **App-wide**: `select("*")` eliminado em TODAS as paginas — colunas especificas + `.limit()` de seguranca em despesas, criancas, chat, decisoes, financeiro, check-in, saude

## Arquitetura

### Progressive Disclosure — Posicionamento Neutro

O Kindar usa **Progressive Disclosure** para atender qualquer tipo de familia sem forcar categorizacao:

- **Slogan**: "Organize a rotina de quem voce cuida" (neutro, universal)
- **Flag `custody_enabled`** (boolean na tabela `coparenting_groups`): controla visibilidade de features de guarda compartilhada
- **Default**: `custody_enabled = true` para todos os grupos (revertido em 2026-05-05). Guarda eh feature core do ICP que paga; modo universal disponivel via dispensa do CTA, nao via default tecnico
- **Calendario sempre exibe CTA `/calendario/escala`** quando nao ha escala — defesa em profundidade contra esse bug voltar
- **Modulos afetados**: Dashboard, Calendario, Financeiro, IA, Cron, Landing Page, Auth, Onboarding, i18n

O sistema **nao pergunta** sobre situacao familiar. Features de coparentalidade aparecem quando fazem sentido (2o adulto entra, ou usuario busca).

### Padrao Server/Client Split
O app segue um padrao consistente de separacao:
1. **`page.tsx` (Server Component)**: busca dados no Supabase, verifica autenticacao com `getUser()`
2. **`*Client.tsx` (Client Component)**: recebe dados via props, usa `useI18n()` para traducoes, gerencia interatividade

**36+ Client Components** criados seguindo este padrao (DashboardClient, SaudeClient, ProfileContent, etc.)

### Queries sem FK Joins
Todos os PostgREST FK joins foram removidos e substituidos por **joins manuais** via queries separadas, evitando problemas com RLS e melhorando previsibilidade.

### API Routes (16 total)
| Rota | Funcao |
|------|--------|
| `/api/ai/assistant` | Assistente IA conversacional (Groq function calling, 12 tools, multi-round) |
| `/api/ai/context` | Contexto familiar para IA |
| `/api/ai/parse-invite` | Parser de convite (OCR Tesseract.js + Groq LLM, retorna dados estruturados do evento) |
| `/api/auth/signout` | Logout via API |
| `/api/auth/test-login` | Login de teste (dev) |
| `/api/calendar/[token]` | Feed iCalendar (RFC 5545) |
| `/api/chat/export` | Exportacao de chat em PDF |
| `/api/chat/messages` | Busca mensagens por canal |
| `/api/create-group` | Criacao de grupo familiar |
| `/api/cron/activity-reminders` | Cron: lembretes push 24h antes + relatorios nao preenchidos |
| `/api/cron/custody-change` | Cron: notificacao de mudanca de custodia |
| `/api/cron/retention` | Cron: notificacoes de retencao D+1/3/7/14 |
| `/api/cron/daily-report` | Cron: agrega logs e envia relatorio por email |
| `/api/cron/monthly-report` | Cron: relatorio mensal da crianca por email (dia 1) |
| `/api/discord/interactions` | Discord bot: recebe cliques de botoes (Fix/Acknowledge/Ignore) |
| `/api/discord/feedback` | Webhook: recebe status de CI/deploy e posta no Discord |
| `/api/log-error` | Error tracking: captura, classifica por pasta e notifica Discord |
| `/api/push/chat` | Push notification para chat |
| `/api/push/subscribe` | Registro de push subscription |

### Error Tracking & Auto-Fix Pipeline
Sistema de rastreamento de erros com classificacao por pasta e auto-correcao via IA:
1. **Captura**: Error boundaries reportam erros via `/api/log-error`
2. **Classificacao**: Erros classificados por pasta (app, components, lib, hooks, actions, services, supabase)
3. **Notificacao**: Discord recebe embed com detalhes + botoes interativos (Fix/Acknowledge/Ignore)
4. **Auto-Fix**: Claude analisa o erro e gera correcao automatica
5. **PR Automatico**: Fix e commitado em branch + PR aberto no GitHub
6. **CI**: Tests scopados por pasta rodam no PR
7. **Feedback**: Resultado do CI/deploy e postado de volta no Discord

## Seguranca

- **65+ correcoes de seguranca** aplicadas
- 13 fixes de autorizacao em events/expenses/calendar, validacao de input, `Number.isFinite`, `revalidatePath`
- **38 arquivos migrados** de `getSession()` para `getUser()` (metodo seguro recomendado pelo Supabase)
- **Middleware usa `getUser()`** em `src/lib/supabase/middleware.ts` — fix de persistencia de sessao em Safari (access token expirado nao era renovado por `getSession()` que nao faz chamada de rede)
- Todas as Server Actions verificam autorizacao do usuario
- **RLS** habilitado em todas as tabelas
- **LGPD**: campo `lgpd_consent_at` no perfil
- **Chat imutavel**: triggers impedem DELETE/UPDATE (conformidade legal)
- **Auto-aprovacao de despesas bloqueada** (independente de role)
- **Regressao de status de despesa impedida** (approved/rejected nao voltam para pending)
- **Validacao server-side de acertos financeiros** (valor nao pode exceder saldo real)
- **Validacao server-side de intervalo entre doses** de medicamento (< 30 min rejeitado)
- **Sanitizacao de input** em campos de texto de saude (max length limits)
- **Validacao server-side de campos obrigatorios** em `createMedication` (nome, dosagem, frequencia, data inicio)
- **Validacao de status de doenca** — `updateIllnessEpisode` rejeita valores invalidos
- **Calculo de saldo financeiro** considera apenas despesas aprovadas (pending/disputed excluidas)
- **Delecao dual-approval** em temas sensiveis
- **Remember-me no login**: checkbox "Lembrar-me" controla persistencia da sessao (30 dias via cookie `maxAge` vs sessao do navegador). Fix de logout em Safari/iOS
- **Persistencia de sessao em Safari**: middleware redireciona para `/session-recovery` (nao `/login`) quando cookies de auth sao perdidos. Pagina de recovery restaura sessao via localStorage backup automaticamente
- **Safari ITP Recovery**: `AuthSessionProvider` faz backup de tokens no localStorage em cada auth event e visibilitychange; `/session-recovery` restaura sessao via `setSession()` e redireciona para pagina original
- **Validacao server-side de MIME type** em uploads (documents.ts, children.ts, events.ts) antes de enviar ao Supabase Storage

## Estrutura do Projeto

```
src/
  app/
    (app)/              # Rotas autenticadas (layout com navbar + I18nProvider)
      atividades/       # Atividades recorrentes das criancas
      calendario/       # Agenda unificada (guarda + atividades + eventos)
        convite/        # Invite Parser (upload foto/PDF → OCR → LLM → preview editavel → salvar)
      chat/             # Chat em tempo real com IA Mediadora + canais
      checkin/          # Check-in diario
      convite/          # Envio e gestao de convites
      criancas/         # Cadastro e perfil de filhos (4 abas)
      dashboard/        # Tela inicial
      decisoes/         # Decisoes em grupo com votacao
      despesas/         # Gestao financeira + comprovantes
      documentos/       # Upload de documentos + dashboard de completude
      escola/           # Informacoes escolares
      eventos/          # Redirect -> /calendario (unificado)
      familia/          # Membros do grupo + roles
      financeiro/       # Resumo financeiro (Splitwise-style)
      mais/             # Menu adicional
      notas/            # Notas privadas
      notificacoes/     # Central de notificacoes
      onboarding/       # Wizard premium single-screen (familia → criancas com edit/remove inline → convite inline com share). PWA + nativo compartilham 4 endpoints: `/api/create-group` (1a, retorna childId), `/api/children` (Nx), `/api/children/[id]` PATCH/DELETE, `/api/invitations` (convite). Celebracao animada + ARIA live + timeout 3s no auto-accept
      perfil/           # Perfil do usuario + seletor de idioma
      saude/            # Registros de saude (8 sub-modulos + exportacao)
      temas-sensiveis/  # Discussoes sensiveis com delecao dual-approval
      acordos/          # Acordos entre pais (10 categorias)
    api/
      ai/               # Assistente IA (assistant + context)
      auth/             # Auth routes (signout, test-login)
      calendar/[token]  # API publica para exportacao iCal
      chat/             # Chat API (messages + export)
      cron/             # Cron jobs (5 routes via runCronWithReport: activity-reminders, custody-change, retention, daily-report, monthly-report)
      create-group/     # Criacao de grupo familiar
      push/             # Push notifications (subscribe + chat)
    (auth)/             # Rotas publicas (login, signup, etc.)
  actions/              # Server Actions (Supabase) — 23 arquivos, 84 funcoes
  components/           # Componentes globais (12 arquivos)
    BottomNav.tsx       # Nav inferior mobile (com aria-labels)
    Sidebar.tsx         # Sidebar desktop (com aria-labels)
    ResponsiveShell.tsx # Shell responsivo
    GroupSelector.tsx   # Seletor de grupo ativo
    LanguageSelector.tsx # Seletor de idioma
    NotificationBadge.tsx # Badge de contagem de notificacoes
    AIAssistant.tsx     # Interface do assistente IA
    KindarLogo.tsx      # Logo do app
    PushNotificationManager.tsx # Gerenciamento de push
    PWAInstallBanner.tsx # Banner iOS para "Adicionar a Tela de Inicio" (PWA standalone)
  i18n/                 # Sistema de internacionalizacao
    locales/            # Arquivos de traducao
      pt.json           # Portugues (~1488 chaves, 40 secoes)
      en.json           # Ingles
      es.json           # Espanhol
      fr.json           # Frances
      de.json           # Alemao
  lib/
    ai/
      parser/              # Invite Parser modular
        types.ts           # ParsedEventData, ParseResult, ParserMetadata
        event-parser.interface.ts # Interface EventParser
        ocr.ts             # OCR via Tesseract.js
        groq-event-parser.ts # Interpretacao Groq LLM
        pilot-parser.ts    # PilotParser (free tier)
        index.ts           # Factory com AI_MODE env flag
    ai-actions.ts          # Acoes do assistente IA
    ai-cache.ts            # Cache de respostas IA
    ai-context.ts          # Contexto familiar para IA (filhos, membros, custodia)
    ai-local-parser.ts     # Parser local (12 padroes, 0ms)
    ai-rate-limit.ts       # Rate limiting por usuario
    ai-tools.ts            # 12 tool definitions Groq-compatible (acoes, consultas, comunicacao)
    brazilian-holidays.ts  # Feriados nacionais BR (fixos + moveis)
    calendar-utils.ts      # Utilitarios do calendario, custodia e computeSwapBalance()
    capacitor.ts           # Bridge para Capacitor (haptics, status bar, splash screen)
    chat-notify.ts         # Notificacoes automaticas no chat
    constants.ts           # Cores, categorias, checklist items
    group-utils.ts         # getActiveGroup() para multi-grupo
    haptics.ts             # Haptic feedback (Capacitor nativo + Web Vibration fallback)
    health-constants.ts    # Constantes de saude
    ical.ts                # Geracao de arquivo iCal
    posthog.ts             # PostHog client analytics
    posthog-server.ts      # PostHog server analytics
    push.ts                # Web Push notifications (VAPID)
    cron/
      types.ts             # CronResult, CronReport, DailyReport
      cron-executor.ts     # runCronWithReport (auth, retry, log)
      report-aggregator.ts # generateDailyReport
      report-formatter.ts  # HTML + texto do relatorio diario
    reports/
      monthly-child-report.ts    # Coletor de dados mensal por crianca
      monthly-report-formatter.ts # HTML + texto do relatorio mensal
    recurrence-utils.ts    # Motor de recorrencia (7 tipos: diario, semanal, etc.)
    sbp-vaccine-calendar.ts # Calendario vacinal SBP
    tone-moderator.ts      # Analise de tom para chat
    who-growth-data.ts     # Dados crescimento WHO
    supabase/
      client.ts            # Cliente browser (createBrowserClient)
      server.ts            # Cliente server (createServerClient)
      middleware.ts        # Refresh de sessao e protecao de rotas
```

## Variaveis de Ambiente

```env
NEXT_PUBLIC_SUPABASE_URL=         # URL do projeto Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # Chave publica (anon) do Supabase
SUPABASE_SERVICE_ROLE_KEY=        # Chave service role (server-side only, bypass RLS)
NEXT_PUBLIC_APP_URL=              # URL do app
NEXT_PUBLIC_POSTHOG_KEY=          # Chave PostHog (analytics)
NEXT_PUBLIC_POSTHOG_HOST=         # Host PostHog
SENTRY_DSN=                       # DSN do Sentry (error tracking)
GROQ_API_KEY=                     # Chave API do Groq (assistente IA + invite parser)
AI_MODE=                          # (opcional) "pilot" (padrao, free tier) para troca futura de backend do parser
NEXT_PUBLIC_VAPID_PUBLIC_KEY=     # Chave publica VAPID (push notifications)
VAPID_PRIVATE_KEY=                # Chave privada VAPID
CRON_REPORT_EMAIL=                # Email para relatorio diario dos CRONs (opcional)
```

## Desenvolvimento

```bash
npm install
npm run dev
```

Abra http://localhost:3000

## Testes

```bash
# Testes unitarios (Vitest)
npx vitest

# Testes E2E (Playwright)
npx playwright test
```

## Deploy

### PWA (Vercel)

```bash
npx vercel --prod
```

Variaveis de ambiente devem estar configuradas no painel do Vercel ou via CLI:
```bash
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
```

### Kindar Native (iOS)

Tag release → workflow `ios-release.yml` disparado automaticamente:
```bash
git tag v1.1.X
git push origin v1.1.X
```

Pipeline completo em `DEPLOY-IOS.md`. Workflow serializado (`concurrency: ios-release-all`) para evitar colisoes de `buildNumber` no EAS autoIncrement.

**Repositorio publico** → GitHub Actions e Vercel rodam sem custo (limite so se aplica a repos privados no tier Free).

## Acessibilidade

- `aria-labels` em todos os links de navegacao
- `aria-current="page"` para item ativo na navegacao
- `role="navigation"` no sidebar e bottom nav
- Touch targets minimos 44x44px (Apple HIG)
- Contraste de cores adequado
