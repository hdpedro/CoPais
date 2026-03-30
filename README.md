# Kindar

Aplicativo de coparentalidade para familias com guarda compartilhada. Ajuda pais, avos e cuidadores a organizarem a rotina das criancas de forma colaborativa e respeitosa.

**Producao:** https://kindar.com.br
**Dominio:** kindar.com.br
**Ultima atualizacao:** 29/03/2026

## Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **UI:** React 19
- **Auth & Database:** Supabase (Auth, Postgres, Realtime, RLS)
- **Estilo:** Tailwind CSS 4
- **Linguagem:** TypeScript 5
- **IA:** Groq (Llama 3.3 70B primary → 8B fallback) — assistente conversacional com function calling (12 tools), parsers robustos para PT-BR
- **Deploy:** Vercel
- **Analytics:** PostHog (30+ eventos rastreados)
- **Error Tracking:** Sentry
- **Mobile (iOS):** Capacitor 7 (hybrid app para App Store)
- **i18n:** 5 idiomas (PT, EN, ES, FR, DE) — ~1405 chaves por locale, 38 secoes
- **Testes:** Playwright E2E (34 testes) + Vitest unitarios (50 testes para AI parser)

## Numeros do Projeto

| Metrica | Quantidade |
|---------|-----------|
| Rotas (paginas + API) | 65 |
| Server Actions | 84 funcoes em 23 arquivos |
| Tabelas no banco | 35+ |
| Migrations | 29 |
| Client Components | 36+ |
| Componentes globais | 13 |
| Chaves de traducao | ~1405 por idioma |
| Secoes i18n | 38 |
| Idiomas | 5 (PT, EN, ES, FR, DE) |

## iOS App (Capacitor)

O app esta configurado para distribuicao na Apple App Store via Capacitor:

- **Bundle ID:** `com.kindar.app`
- **Config:** `capacitor.config.ts`
- **Modo:** Hybrid (carrega `kindar.com.br` com integracao nativa)
- **Plugins:** StatusBar, SplashScreen, Haptics, Keyboard, App
- **Safe Areas:** CSS `env(safe-area-inset-*)` em todos os componentes (notch + home indicator)
- **Touch targets:** minimo 44px em todos os elementos interativos (Apple HIG)
- **Haptic feedback:** em interacoes (troca de tab, clique em dia, envio de mensagem)
- **Page transitions:** animacao fade-in (200ms) entre paginas
- **Active press states:** `scale(0.97)` em dispositivos touch
- **Viewport:** `viewport-fit=cover`, sem zoom
- **7 loading skeletons:** arquivos `loading.tsx` com animate-pulse
- **Offline:** Service Worker v3 com navigation caching + pagina offline (`/offline.html`)
- **PWA Install Banner:** `PWAInstallBanner.tsx` exibe banner no iOS Safari pedindo para "Adicionar a Tela de Inicio" (modo standalone, sem barra de URL). Aparece apenas no iOS quando nao esta em standalone e o usuario nao dispensou; dispensa salva em `localStorage` (`kindar-pwa-dismissed`)
- **Deteccao de teclado:** bottom nav se esconde via `visualViewport` API
- **Checklist de submissao:** `docs/ios-submission-checklist.md`

Para buildar o iOS (requer Mac com Xcode):
```bash
npx cap add ios
npx cap sync ios
npx cap open ios
```

## Internacionalizacao (i18n)

O app suporta **5 idiomas** completos:
- **Portugues (BR)** — padrao
- **Ingles (EN)**
- **Espanhol (ES)**
- **Frances (FR)**
- **Alemao (DE)**

**Arquitetura i18n:**
- ~1405 chaves de traducao por idioma, organizadas em 38 secoes
- Arquivos de traducao em `src/i18n/locales/{pt,en,es,fr,de}.json`
- `I18nProvider` envolvendo o layout do app
- Hook `useI18n()` usado em todos os Client Components
- `LanguageSelector` na pagina de perfil para troca de idioma

## Modulos e Funcionalidades (19 modulos)

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
- **Saldo de trocas (Swap Balance)**: componente `SwapBalanceCard` mostra debito/credito de dias entre pais, calculado por `computeSwapBalance()`
- **Troca como divida**: solicitar dia sem oferecer data de retorno gera divida de 1 dia
- Planejador de fins de semana (mostra disponibilidade dos proximos weekends)
- Exportacao iCal para sincronizar com celular (Google Calendar, Apple Calendar)
- **Feriados nacionais brasileiros** automaticos (fixos + moveis: Carnaval, Pascoa, Corpus Christi) com destaque visual vermelho
- Solicitacao de troca entre pais (requer aprovacao)
- Solicitacao de visita por avos/cuidadores (requer aprovacao do responsavel do dia)
- **Performance**: 5 queries paralelas via `Promise.all()`, `useMemo` no grid, `useCallback` nos handlers, fix de timezone com `getBrazilNow()`

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
- **Compartilhar atividade via WhatsApp**: botao de share nos cards do dashboard, DayDetailSheet e ChecklistModal. Usa Web Share API (mobile) com fallback para `wa.me/?text=`. Texto formatado com emoji da categoria, nome da crianca, horario e local

### 4. Eventos (`/eventos` -> integrado no Calendario)
- Eventos sociais (aniversarios, festas) integrados no calendario
- Suporte a **eventos multi-dia** (`end_date`), **all-day**, **viagem**
- Campo `assigned_to` para responsavel pelo evento
- CRUD completo: createEvent, updateEvent, deleteEvent, cancelEvent

### 5. Chat com IA Mediadora (`/chat`)
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

### 6. Saude Completa (`/saude` — 8 sub-modulos)
- **Dashboard central** com doencas ativas, medicamentos, alergias, consultas, vacinas, retornos pendentes
- **Banner de vacinas atrasadas** no dashboard de saude
- **Doencas** (`/saude/doencas`): episodios com sintomas, severidade (leve/moderado/grave), evolucao timestamped, status (ativo/resolvido/cronico), ida ao hospital, `ResolveButton`, `UpdateEpisodeForm`. Validacao de status — rejeita valores invalidos em `updateIllnessEpisode`
- **Medicamentos** (`/saude/medicamentos`): dosagem, frequencia, registro de doses, status (ativo/pausado/completo/cancelado), pagina de detalhe por medicamento (`/saude/medicamentos/[id]`). **Validacao server-side de intervalo entre doses** (rejeita se < 30 min). `ConfirmDoseButton` na lista de medicamentos
- **Consultas** (`/saude/consultas`): agendamento, profissional, tipo (rotina/emergencia/retorno/exame), diagnostico, data de retorno, auto-sync com calendario, `CompleteAppointmentForm` (i18n completo), botao WhatsApp para agendamento
- **Alergias** (`/saude/alergias`): tipo, severidade, reacao, info medica (tipo sanguineo, convenio, SUS). **Edicao e exclusao inline** com formulario. Service role usado para query (workaround de RLS). Fix de coluna `notes` inexistente
- **Vacinas** (`/saude/vacinas`): comparacao com **calendario SBP** (Sociedade Brasileira de Pediatria), confirmacao de doses (`ConfirmDoseButton`)
- **Crescimento** (`/saude/crescimento`): peso, altura, perimetro cefalico com **grafico visual** (`GrowthChart`), dados WHO
- **Profissionais** (`/saude/profissionais`): diretorio com especialidade, CRM, telefone, WhatsApp
- **Exportacao** (`/saude/export`): exportar registros de saude
- **Rastreamento de visualizacoes** (`HealthViewTracker`, `ViewedByBadge` com i18n)
- **Push notifications** para TODOS os eventos de saude (alergias, vacinas, consultas, crescimento)
- **Sanitizacao de input** em todos os campos de texto de saude (max length limits)
- **Link /saude/alergias/editar-info corrigido** (agora faz scroll ate o formulario)

### 7. Despesas / Financeiro (`/despesas`, `/financeiro`)
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

### 8. Decisoes (`/decisoes`)
- Votacao estruturada: concordo / discordo / vou pensar
- Argumentos pro/contra por decisao
- **Auto-resolucao** quando todos votam
- **Indicadores de urgencia**
- Widget no Dashboard com decisoes pendentes

### 9. Acordos (`/acordos`)
- Registro de acordos de coparentalidade
- **10 categorias**: principio, valor, regra, limite, rotina + 5 mais
- Aceitar/rejeitar acordos (`acceptAgreement`)
- Flag **nao-negociavel** para acordos criticos

### 10. Notas Privadas (`/notas`)
- Notas pessoais visiveis apenas pelo criador
- CRUD completo (criar, editar, deletar)
- Nao compartilhadas com o grupo

### 11. Documentos (`/documentos`)
- Dashboard de documentos com visao geral de **todas as criancas**
- Card por crianca com **barra de completude** (0-100%)
- Indicadores de documentos faltantes (badges)
- Upload e visualizacao de documentos (`DocumentList`, `DocumentViewer`)
- Links diretos para upload na aba Documentos do perfil da crianca
- Suporte a upload por crianca
- **Prevencao de upload duplicado**: botao desabilitado durante upload + reset do input apos sucesso

### 12. Criancas (`/criancas`)
- Lista de criancas com foto e idade
- **Perfil individual com 4 abas** (`/criancas/[id]`):
  - **Geral**: nome, data de nascimento, CPF, RG, notas
  - **Saude**: peso/altura, tipo sanguineo, convenio, alergias, medicamentos, vacinas (dados agregados)
  - **Documentos**: upload/visualizacao de documentos por crianca (RG, CPF, passaporte, certidao)
  - **Educacao**: nome/endereco/telefone da escola, serie, professor(a), coordenador(a), horarios de entrada/saida, atividades extracurriculares
- Novos campos: `cpf`, `rg`
- Tabela `child_education` (informacoes escolares, relacao 1:1 com `children`)

### 13. Check-in Diario (`/checkin`)
- Registro rapido: tempo de tela, alimentacao, sono, humor, saude, atividade, escola
- **8 categorias** com icones e templates rapidos
- Historico de check-ins por crianca
- **Integracao com Chat**: cada check-in envia mensagem automatica ao grupo

### 14. Escola (`/escola`)
- Registro de notas escolares e ocorrencias
- Integrado na aba Educacao do perfil da crianca

### 15. Temas Sensiveis (`/temas-sensiveis`)
- Espaco para discussao de temas delicados
- **Delecao com dupla aprovacao**: `requestDeletion`, `approveDeletion`, `cancelDeletion` — um solicita, outro confirma
- Campos `deletion_requested_by`, `deletion_requested_at` para tracking

### 16. Familia / Gestao de Grupo (`/familia`)
- Visualizacao dos membros do grupo familiar
- **Sistema de roles**: admin, member, readonly
- Acoes de membro: `changeMemberRole`, `removeMember`, `leaveGroup`
- Cancelar/deletar convites pendentes
- Gestao de convites por email com link unico (token)
- Status visual: Aceito (verde), Pendente (amarelo), Expirado (vermelho)
- Roles: Pai/Mae, Avo, Cuidador, Mediador, Advogado

### 17. Assistente IA Kindar (`/api/ai/assistant`)
- **Assistente conversacional completo** com interface de chat, sugestoes rapidas e input por voz (Speech Recognition API)
- **Modelo**: Groq `llama-3.3-70b-versatile` (primario) → `llama-3.1-8b-instant` (fallback quando rate limited). 8B tem recuperacao `tool_use_failed` (retenta sem tools para resposta text-only)
- **Fallback de qualidade**: quando modelo 8B retorna respostas pobres (so emojis), sistema usa resultados coletados das tools como resposta
- **Resiliencia**: timeout de 8s por chamada Groq (`groqWithTimeout`), sanitizacao de respostas malformadas do 8B (`sanitizeResponse`), `maxDuration = 60` no Vercel, frontend trata erros 504/502 graciosamente
- **Parsers robustos para PT-BR**: `parseAmount()` ("R$ 45,00", "120 conto" — distingue decimal de milhar), `parseDate()` ("DD/MM/YYYY", "DD/MM"), `parseTime()` ("14h", "14h30", "14:00"), `parseDaysOfWeek()` ("terca", "quinta" → formato DB)
- **12 tools Groq-compatible** (`ai-tools.ts`):
  - **6 tools de acao**: `create_expense`, `create_event`, `create_appointment`, `create_checkin`, `create_note`, `create_activity`
  - **5 tools de consulta**: `get_custody_info`, `get_expenses_summary`, `get_upcoming_events`, `get_children_info`, `get_health_summary`
  - **1 tool de comunicacao**: `draft_message`
- **Confirmacao antes de acoes**: tools de criacao (create_*) pedem confirmacao do usuario antes de executar ("Confirma? [descricao]"). Tools de consulta (get_*) executam imediatamente. Prefixo `CONFIRM_PREFIX` ("⏳"), `CONFIRM_WORDS` e `CANCEL_WORDS` regex em `route.ts`. System prompt do Groq tambem instrui o modelo a pedir confirmacao
- **Fix de categorias em portugues**: `create_note` usava categorias em ingles (reminder, observation, etc.) que violavam o check constraint do banco `private_notes`. Corrigido em `ai-tools.ts`, `ai-actions.ts` e `route.ts` para usar categorias em PT (lembrete, observacao, preparacao, juridico, outro)
- **Multi-round tool calling**: ate 3 rodadas com `tool_choice: "auto"` + resposta final forcada com `tool_choice: "none"`
- **Contexto familiar** (`ai-context.ts`): injeta dados de filhos, membros e custodia para respostas personalizadas
- **React Portal**: componente `AIAssistant.tsx` renderiza em `document.body` via `createPortal` (escapa CSS `backdrop-blur` containing block no header mobile)
- **Integracao no shell**: botao IA no header mobile + botao flutuante no desktop (`ResponsiveShell.tsx`)
- **Rate limiting** (`ai-rate-limit.ts`) por usuario com mensagens amigaveis
- **Cache de respostas** (`ai-cache.ts`) com TTL de 5 minutos
- **Compatibilidade com Groq**: todos os parametros de tools usam `type: "string"` (evita erros de validacao com output do LLM)
- **Tabela children**: usa coluna `full_name`; info escolar vem de `child_education` (join separado)
- **50 testes unitarios** (Vitest) com **98.5% de acuracia** em load test
- **SSR-safe**: container do Portal usa `useState` + `useEffect` para compatibilidade com server-side rendering

### 18. Notificacoes (`/notificacoes`)
- **In-app**: lista de notificacoes com marcacao de lida (`markNotificationRead`, `markAllNotificationsRead`)
- **Web Push**: push notifications via VAPID (web-push)
- **Badge count**: `NotificationBadge.tsx` mostra contagem no nav
- **Push para chat**: `/api/push/chat` envia push ao receber mensagem
- **Subscribe**: `/api/push/subscribe` para registro de subscription
- 12 tipos de notificacao (expense_new, swap_request, chat_message, activity_reminder, etc.)
- Todas as acoes importantes geram notificacao automatica via `postChatNotification()`

### 19. Perfil (`/perfil`)
- Edicao de nome e dados pessoais (`EditProfileForm`)
- **Seletor de idioma** (`LanguageSelector`) — 5 idiomas
- **Sincronizacao de calendario** (iCal) via `CalendarExportButton`
- **Seletor de grupo** (`GroupSelector`) para usuarios em multiplos grupos

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
- **Calendar API otimizada**: 3.1s em vez de timeout
- **Landing page otimizada**: cookie check antes de `getUser()`
- **Promise.all()** em queries paralelas (Dashboard, Calendario)

## Arquitetura

### Padrao Server/Client Split
O app segue um padrao consistente de separacao:
1. **`page.tsx` (Server Component)**: busca dados no Supabase, verifica autenticacao com `getUser()`
2. **`*Client.tsx` (Client Component)**: recebe dados via props, usa `useI18n()` para traducoes, gerencia interatividade

**36+ Client Components** criados seguindo este padrao (DashboardClient, SaudeClient, ProfileContent, etc.)

### Queries sem FK Joins
Todos os PostgREST FK joins foram removidos e substituidos por **joins manuais** via queries separadas, evitando problemas com RLS e melhorando previsibilidade.

### API Routes (12 total)
| Rota | Funcao |
|------|--------|
| `/api/ai/assistant` | Assistente IA conversacional (Groq function calling, 12 tools, multi-round) |
| `/api/ai/context` | Contexto familiar para IA |
| `/api/auth/signout` | Logout via API |
| `/api/auth/test-login` | Login de teste (dev) |
| `/api/calendar/[token]` | Feed iCalendar (RFC 5545) |
| `/api/chat/export` | Exportacao de chat em PDF |
| `/api/chat/messages` | Busca mensagens por canal |
| `/api/create-group` | Criacao de grupo familiar |
| `/api/cron/activity-reminders` | Cron: lembretes push 24h antes |
| `/api/cron/custody-change` | Cron: notificacao de mudanca de custodia |
| `/api/push/chat` | Push notification para chat |
| `/api/push/subscribe` | Registro de push subscription |

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
      onboarding/       # Primeiro acesso / criar grupo
      perfil/           # Perfil do usuario + seletor de idioma
      saude/            # Registros de saude (8 sub-modulos + exportacao)
      temas-sensiveis/  # Discussoes sensiveis com delecao dual-approval
      acordos/          # Acordos entre pais (10 categorias)
    api/
      ai/               # Assistente IA (assistant + context)
      auth/             # Auth routes (signout, test-login)
      calendar/[token]  # API publica para exportacao iCal
      chat/             # Chat API (messages + export)
      cron/             # Cron jobs (lembretes de atividades, mudanca de custodia)
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
      pt.json           # Portugues (~1405 chaves, 38 secoes)
      en.json           # Ingles
      es.json           # Espanhol
      fr.json           # Frances
      de.json           # Alemao
  lib/
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
GROQ_API_KEY=                     # Chave API do Groq (assistente IA)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=     # Chave publica VAPID (push notifications)
VAPID_PRIVATE_KEY=                # Chave privada VAPID
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

```bash
npx vercel --prod
```

Variaveis de ambiente devem estar configuradas no painel do Vercel ou via CLI:
```bash
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
```

## Acessibilidade

- `aria-labels` em todos os links de navegacao
- `aria-current="page"` para item ativo na navegacao
- `role="navigation"` no sidebar e bottom nav
- Touch targets minimos 44x44px (Apple HIG)
- Contraste de cores adequado
