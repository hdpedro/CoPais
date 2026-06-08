# PRD - Product Requirements Document

## Kindar v2.0 — "Ponte"

> Ultima atualizacao: Maio 2026
> Release target: Q3 2026
> Status: M1 (WhatsApp) em entrega — branch `feat/whatsapp-v2-full`

---

## Resumo Executivo

O Kindar v1.0 estabeleceu a fundacao da plataforma de coparentalidade com calendario de guarda, modulo de saude, financeiro, decisoes estruturadas, chat, check-in e i18n. O v2.0 ("Ponte") foca em tres pilares: **conectividade** (WhatsApp + push), **inteligencia** (mediador IA) e **alcance** (portal profissional + offline). O objetivo e sair de early adopters para product-market fit comprovado com 50k familias ativas.

---

## Priorizacao MoSCoW

### Visao Geral

| Prioridade | Features | Esforco Total Estimado |
|-----------|----------|----------------------|
| **Must Have** | WhatsApp integration, Offline mode basics, Push improvements | 8-10 semanas |
| **Should Have** | AI conflict mediator, Shared photo album, Activity tracker improvements | 8-12 semanas |
| **Could Have** | Video call integration, Professional portal | 6-8 semanas |
| **Won't Have (now)** | Marketplace, Dating features | N/A |

---

## MUST HAVE — Essencial para v2.0

### M1: Kindar Assistente — WhatsApp como canal de entrada e saida

> **Status: M1.1 entregue (branch `feat/whatsapp-v2-full`, 7 commits, 524/524 testes verdes). M1.2 (events/activities/health domain extractions) pendente em sessoes futuras.**

**Descricao**: O escopo original de "notificacoes via WhatsApp" evoluiu para um **assistente bidirectional** (Kindar Assistente) sobre **Meta Cloud API**: o usuario nao so RECEBE alertas, ele tambem REGISTRA acoes pelo proprio chat (despesas, eventos, consultas, decisoes, trocas de dia, check-ins) usando texto livre, audio (transcrito via Whisper/Groq) ou foto (OCR de recibo / receita medica). O canal e dominante no Brasil (99% penetracao) e remove a friccao de abrir o app para qualquer microacao.

**User Story (atualizada)**: Como pai/mae, quero conversar com o Kindar pelo WhatsApp em linguagem natural — "paguei 120 da escola do Joaquim", "trocar dia 15 com a Maria", "o Pedro esta com febre" — e ter cada acao validada, registrada e refletida no app, com aprovacao do coparente quando necessario.

**Criterios de Aceitacao (M1.1 entregue)**:

| # | Criterio | Status | Onde |
|---|---------|--------|------|
| 1 | Webhook Meta Cloud com verificacao HMAC SHA-256 | ✅ | `src/app/api/whatsapp/webhook/route.ts` |
| 2 | Vinculacao de telefone com 2-step (link + codigo de verificacao) | ✅ | `src/actions/whatsapp.ts` + `whatsapp_phone_links` |
| 3 | Multi-grupo: usuario com >1 grupo escolhe via list message | ✅ | `whatsapp/identity.ts` |
| 4 | Texto livre PT-BR informal interpretado por parser local (12 patterns) com fallback Groq → OpenAI | ✅ | `src/lib/ai/local-parser.ts` + `ai/router.ts` |
| 5 | Audio transcrito e reprocessado como texto | ✅ | `whatsapp/audio.ts` |
| 6 | Imagem com caption-router: `/receita`, `/atestado`, `/vacina`, `/exame`, default = recibo | ✅ | `whatsapp/processor.ts:classifyImageIntent` |
| 7 | Recibo OCR em fluxo multi-step: categoria → crianca → confirma | ✅ | `whatsapp/processor.ts:handleReceiptStepReply` |
| 8 | Confirmacao interativa (botoes Sim/Nao) antes de toda acao `create*` | ✅ | `whatsapp/client.ts:sendConfirmation` |
| 9 | Aprovacao two-party: solicitacao de troca chega ao coparente como card com botoes Aprovar/Recusar; resposta atualiza custody automaticamente | ✅ | `whatsapp/approvals.ts` + `services/swap.ts` (protocolo `approve:swap:<uuid>`) |
| 10 | Tools de consulta: agenda, despesas, saldo entre coparentes, status da crianca, historico, inbox de aprovacoes | ✅ | `src/lib/ai/tools.ts` (12 tools, 4 novas em M1.1) |
| 11 | Preferencias por tipo (`expense_notifications`, `event_reminders`, `custody_alerts`, `daily_summary`) respeitadas por broadcast outbound | ✅ | `whatsapp/notify.ts` |
| 12 | Janela de contexto LLM filtrada (TTL 30min + filtro de ruido sintetico) | ✅ | `whatsapp/processor.ts:isHistoricallyMeaningful` |
| 13 | Fluxos two-party para `event_request` e `expense` aprovaveis via WhatsApp | ⏸️ M1.2 | framework codec ja em `whatsapp/approvals.ts` |
| 14 | Cron daily_summary 7h00 com pendencias do dia | ⏸️ M1.2 | tabela ja tem `daily_summary` flag |
| 15 | Templates Meta-aprovados para outbound proativo fora da janela 24h | ⏸️ Backlog | precisa submissao Meta |

**Tools expostas no WhatsApp (entregues M1.1)**:

- **Acoes**: `create_expense`, `create_event`, `create_appointment`, `create_checkin`, `create_note`, `create_activity`, `create_decision`, `create_swap_request`, `respond_swap_request`
- **Consultas**: `get_custody_info`, `get_expenses_summary`, `get_upcoming_events`, `get_children_info`, `get_health_summary`, `get_pending_approvals`, `get_child_status`, `get_balance`, `get_child_history`
- **Comunicacao**: `draft_message` (ajuda a redigir mensagem ao coparente)

**Arquitetura**:

- **API**: Meta Cloud API direta (sem provedor intermediario). Sem custo por mensagem dentro da janela de 24h.
- **Camada de servicos** (`src/lib/services/`): regra de negocio canonica chamada por PWA action + Native API + WhatsApp tool — fim da divergencia que causou o bug 2026-05-01 (swap proposed_date direction).
- **Schema** (migration `00043` + `00065`):
  - `whatsapp_phone_links` (vinculo + verificacao + grupo ativo)
  - `whatsapp_sessions` (3 maquinas de estado: confirmacao, selecao de grupo, recibo multi-step)
  - `whatsapp_message_logs` (log inbound/outbound)
  - `whatsapp_notification_preferences` (opt-out por kind)
  - Views `child_current_status` e `expense_balance_per_user` (reads do assistente)
- **Idempotencia**: dedup por `wa_message_id`; rate limit 30 msg/min por telefone
- **Privacidade**: numero E.164 hash-armazenado (`phone_hash`); LGPD `lgpd_consent_at` registrado no linking
- **Custo**: dentro da janela 24h, Meta cobra zero. Templates fora da janela ficam para M1.2.

**Pipeline de processamento** (em ordem):

1. Audio → transcribe → reescreve como texto
2. Identidade (vinculo + verificacao + grupo)
3. Carrega sessao
4. Selecao de grupo (multi-grupo)
4.4. Receipt multi-step (G4) — list_replies de categoria/crianca
4.5. Aprovacao (`approve:*`/`reject:*`)
5. Confirmacao pendente (button confirm/cancel)
6. Imagem com caption-router
7. Texto → parser local PT-BR; se confidence ≥ 0.7 chama tool; senao AI router (Groq → OpenAI)

**Esforco realizado vs estimado**: M1.1 entregue em 7 commits (paridade swap + expenses + notes + checkin + decisions + WhatsApp internals). M1.2 (events 956 LoC, activities 1063 LoC, health 1742 LoC, event-requests, e2e webhook tests, i18n, cron daily) estimado em 2-3 semanas adicionais.

---

### M2: Modo Offline Basico

**Descricao**: Permitir que funcionalidades essenciais do Kindar funcionem sem conexao a internet. Critico para pais em areas com conectividade limitada, ou situacoes de emergencia (crianca doente no hospital sem Wi-Fi).

**User Story**: Como pai/mae, quero consultar as alergias e medicamentos do meu filho mesmo sem internet, para que eu possa tomar decisoes de saude em qualquer situacao.

**Criterios de Aceitacao**:

| # | Criterio | Validacao |
|---|---------|-----------|
| 1 | Perfil de saude da crianca (alergias, medicamentos ativos, vacinas) disponivel offline | Cache test |
| 2 | Calendario do mes atual e proximo visivel offline | Cache test |
| 3 | Check-in pode ser preenchido offline e sincroniza quando reconectar | Queue test |
| 4 | Despesas podem ser registradas offline e sincronizam | Queue test |
| 5 | Indicador visual claro de que esta offline: "Modo offline - dados podem estar desatualizados" | UI test |
| 6 | Sincronizacao automatica ao reconectar, sem perda de dados | Conflict resolution test |
| 7 | Conflitos de sincronizacao: last-write-wins para dados simples, merge para listas | Edge case test |

**Consideracoes Tecnicas**:

- **Service Worker**: Next.js 16 com `next-pwa` ou custom service worker para cache de paginas e API responses.
- **IndexedDB**: Usar Dexie.js ou idb para storage local de dados criticos.
- **Cache strategy**:
  - Saude: cache-first (sempre disponivel, refresh em background)
  - Calendario: stale-while-revalidate (mostra cache, atualiza em background)
  - Chat: network-only (nao faz sentido offline)
  - Check-in/Despesas: offline queue com sync quando reconectar
- **Conflitos**: Para check-in e despesas, usar timestamps e user_id como chave de dedup. Para edits concorrentes, last-write-wins com merge log.
- **Tamanho do cache**: Estimar ~2MB por familia (saude + calendario + perfis). Limitar a 10MB total.
- **PWA**: Ja temos manifest. Adicionar service worker para installability completa.

**Esforco estimado**: 3-4 semanas (1 dev frontend senior)

---

### M3: Melhorias em Push Notifications

**Descricao**: Otimizar o sistema de push notifications existente (`PushNotificationManager` + `src/lib/push.ts`) para melhor delivery, categorizacao e controle do usuario.

**User Story**: Como pai/mae, quero controlar quais notificacoes recebo e em que horarios, para que o app me alerte sobre o que importa sem me sobrecarregar.

**Criterios de Aceitacao**:

| # | Criterio | Validacao |
|---|---------|-----------|
| 1 | Categorias de notificacao: Urgente, Importante, Informativa | Settings UI |
| 2 | Horario silencioso configuravel (ex: 22h-7h, exceto urgentes) | Cron logic |
| 3 | Agrupamento: multiplos check-ins do mesmo dia viram 1 notificacao | Batch logic |
| 4 | Deep link: toque na notificacao abre a tela correta (nao o dashboard) | Navigation test |
| 5 | Badge count no icone do app (iOS + Android) | PWA badge API |
| 6 | Delivery rate > 95% para notificacoes urgentes | Monitoring |
| 7 | Retry logic para falhas de delivery (3 tentativas com backoff) | Push service |

**Classificacao de Notificacoes**:

| Categoria | Exemplos | Delivery |
|-----------|----------|----------|
| **Urgente** | Doenca registrada, medicamento dado, alergia critica | Push imediato + WhatsApp + ignora modo silencioso |
| **Importante** | Swap request, decisao criada, deadline proximo, despesa alta | Push imediato + respeita modo silencioso |
| **Informativa** | Check-in do outro pai, nova mensagem no chat, settlement concluido | Push agrupado + respeita modo silencioso |

**Consideracoes Tecnicas**:

- Refatorar `createNotificationWithPush` para aceitar categoria e prioridade
- Implementar notification queue com batch processing para categoria "informativa"
- Adicionar tabela `notification_preferences` no Supabase com configuracoes por usuario
- Web Push API ja implementada; melhorar com payload rico (imagens, botoes de acao)

**Esforco estimado**: 2-3 semanas (1 dev full-stack)

---

## SHOULD HAVE — Importante, implementar se possivel

### S1: Mediador de Conflitos por IA

**Descricao**: Assistente de IA integrado ao Kindar que ajuda pais a reformular mensagens agressivas, sugere compromissos em decisoes, e detecta padroes de conflito para intervir proativamente.

**User Story**: Como pai/mae, quero que o app me ajude a comunicar de forma construtiva com meu co-pai, para que nossas interacoes sejam focadas nas criancas e nao em magoas pessoais.

**Criterios de Aceitacao**:

| # | Criterio | Validacao |
|---|---------|-----------|
| 1 | Antes de enviar mensagem no chat, opcao "Suavizar com IA" disponivel | UI toggle |
| 2 | IA reformula mensagem mantendo o conteudo mas removendo tom agressivo | A/B test qualitativo |
| 3 | Em decisoes empatadas, IA sugere compromisso baseado nos argumentos | Suggestion engine |
| 4 | Deteccao de linguagem agressiva com alerta gentil: "Quer revisar a mensagem?" | NLP classifier |
| 5 | IA nunca toma partido ou sugere que um pai esta errado | Bias test |
| 6 | Historico de sugestoes da IA nao e compartilhado com o outro pai | Privacy test |
| 7 | Opt-in: usuario escolhe se quer assistencia da IA | Settings |

**Exemplos de Reformulacao**:

| Mensagem Original | Reformulada pela IA |
|-------------------|---------------------|
| "Voce NUNCA busca as criancas no horario" | "Tenho notado que os horarios de busca tem variado. Podemos combinar um horario fixo?" |
| "Nao vou pagar isso, voce gasta demais" | "Essa despesa ficou acima do que eu esperava. Podemos conversar sobre o valor?" |
| "As criancas sempre voltam da sua casa doentes" | "Pedro voltou doente nas ultimas 2 vezes. Podemos checar se tem algo no ambiente?" |

**Consideracoes Tecnicas**:

- **Model**: Claude API (Anthropic) ou GPT-4 com prompt engineering especifico para coparentalidade
- **Prompt design**: System prompt com regras rigidas de neutralidade, foco na crianca, tom acolhedor
- **Latencia**: Reformulacao em < 3 segundos. Streaming response para UX melhor.
- **Custo**: ~US$ 0.01 por reformulacao. Limitar a 20/dia no free, ilimitado no premium.
- **Privacy**: Mensagens enviadas para IA nao sao armazenadas alem da sessao. Disclosure claro.
- **Edge cases**: Deteccao de abuso real (violencia domestica) deve escalar para recursos de ajuda, nao suavizar.
- **Rota API**: Novo endpoint `/api/ai/reframe` com rate limiting por usuario

**Esforco estimado**: 4-5 semanas (1 dev backend + prompt engineer)

---

### S2: Album de Fotos Compartilhado

**Descricao**: Espaco para ambos os pais compartilharem fotos e videos das criancas, organizados por crianca e data. Resolve o problema de fotos perdidas em WhatsApp e a frustacao de "voce nunca manda foto".

**User Story**: Como pai/mae, quero ter um album compartilhado de fotos dos meus filhos acessivel por ambos os pais, para que nenhum momento importante se perca e ambos possam acompanhar o crescimento.

**Criterios de Aceitacao**:

| # | Criterio | Validacao |
|---|---------|-----------|
| 1 | Upload de fotos por crianca com data e descricao opcional | Upload test |
| 2 | Timeline cronologica de fotos de cada crianca | UI test |
| 3 | Ambos os pais podem adicionar fotos | Permission test |
| 4 | Avos/cuidadores podem VER fotos mas nao fazer upload (configuravel) | Role test |
| 5 | Storage: 1GB free, 10GB premium | Quota logic |
| 6 | Compressao automatica para otimizar storage | Image processing |
| 7 | Download de todas as fotos como ZIP | Export feature |

**Consideracoes Tecnicas**:

- Supabase Storage (ja usado para receipts e documents — buckets existentes)
- Compressao client-side com browser Canvas API antes do upload
- Thumbnails gerados server-side para listagem rapida
- CDN Supabase para delivery de imagens
- Metadados EXIF preservados (data original da foto)

**Esforco estimado**: 3-4 semanas (1 dev full-stack)

---

### S3: Melhorias no Rastreamento de Atividades

**Descricao**: Expandir o modulo de atividades (`/atividades`) com recorrencia melhorada, checklist de itens por atividade, lembretes inteligentes e integracao com calendario.

**User Story**: Como pai/mae, quero gerenciar as atividades extracurriculares dos meus filhos com checklist e lembretes, para que nenhum dos dois esqueca material, horario ou pagamento.

**Criterios de Aceitacao**:

| # | Criterio | Validacao |
|---|---------|-----------|
| 1 | Atividades recorrentes aparecem no calendario de guarda | Calendar integration |
| 2 | Checklist editavel por atividade (uniforme, material, etc.) | CRUD test |
| 3 | Lembrete 1h antes da atividade para o pai que esta com a crianca | Push + calendar logic |
| 4 | Historico de presenca (foi / nao foi / cancelada) | Tracking UI |
| 5 | Custo mensal vinculado ao modulo financeiro | Expense auto-create |
| 6 | Check/uncheck de itens do checklist no dia da atividade | Interactive checklist |

**Consideracoes Tecnicas**:

- Ja existe `DEFAULT_CHECKLIST_ITEMS` em constants.ts para categorias padrao
- Ja existe recurrence engine em `src/lib/recurrence-utils.ts`
- Necessario: vincular atividade ao calendario (overlay no CalendarGrid)
- Necessario: push notification contextual (quem esta com a crianca naquele dia recebe o lembrete)

**Esforco estimado**: 2-3 semanas (1 dev full-stack)

---

## COULD HAVE — Desejavel, implementar se houver tempo

### C1: Integracao de Video Chamada

**Descricao**: Permitir que a crianca faca videochamada com o pai que nao esta presente, diretamente pelo app, sem precisar de WhatsApp ou FaceTime.

**User Story**: Como pai/mae, quero que meu filho possa me ligar por video pelo app quando estiver na outra casa, para manter nosso vinculo diario sem depender do outro pai intermediar.

**Criterios de Aceitacao**:

| # | Criterio | Validacao |
|---|---------|-----------|
| 1 | Botao "Ligar para [pai/mae]" no perfil da crianca | UI test |
| 2 | Chamada peer-to-peer via WebRTC | Connection test |
| 3 | Horarios configurados (ex: video call todo dia as 19h) | Settings |
| 4 | Historico de chamadas (duracao, quem iniciou) | Log |
| 5 | Ambos os pais podem configurar horarios disponiveis | Availability settings |

**Consideracoes Tecnicas**:

- WebRTC com Twilio ou Daily.co como provider
- TURN server para NAT traversal
- Custo significativo (~US$ 0.004/min por participante)
- Complexidade alta: audio/video em PWA e inconsistente

**Esforco estimado**: 6-8 semanas (1 dev especialista em real-time)

---

### C2: Portal Profissional (Mediadores e Advogados)

**Descricao**: Interface web dedicada para mediadores e advogados familiaristas gerenciarem multiplas familias, com dashboards, alertas e geracao de relatorios.

**User Story**: Como mediador/advogado, quero um painel para acompanhar todas as familias que atendo, para identificar conflitos proativamente e gerar relatorios para tribunal.

**Criterios de Aceitacao**:

| # | Criterio | Validacao |
|---|---------|-----------|
| 1 | Dashboard multi-familia com indicadores de saude da relacao | UI test |
| 2 | Alertas automaticos: "Familia X tem 3 decisoes sem resposta" | Alert engine |
| 3 | Relatorio PDF exportavel com historico de comunicacao e decisoes | PDF generation |
| 4 | Acesso somente leitura aos dados das familias (com consentimento) | Permission model |
| 5 | Notas privadas do profissional por familia | CRUD |
| 6 | Cobranca separada: R$ 49,90/mes por profissional | Billing |

**Consideracoes Tecnicas**:

- Nova rota `/profissional` com layout dedicado
- Role "mediator" e "lawyer" ja existem em `USER_ROLES`
- Queries agregadas pesadas — considerar views materializadas no Supabase
- LGPD: consentimento explicito de ambos os pais para acesso do profissional

**Esforco estimado**: 6-8 semanas (1 dev full-stack + designer)

---

## WON'T HAVE (AGORA) — Fora de escopo para v2.0

### W1: Marketplace de Profissionais

**Razao**: Necessita massa critica de familias e profissionais. Prematuro antes de 50k familias.

### W2: Features de Relacionamento/Dating

**Razao**: Conflito fundamental com a missao do produto. O Kindar e sobre as criancas, nao sobre os pais. Adicionar dating comprometeria a percepcao de neutralidade.

### W3: Rede Social entre Familias

**Razao**: Privacidade e a prioridade. Familias separadas nao querem exposicao. Forum anonimo talvez no futuro.

### W4: Integracao com Wearables (smartwatch da crianca)

**Razao**: Mercado de wearables infantis ainda imaturo no Brasil. Revisitar em 2027.

---

## Gestao de Conflitos — Design Framework

### Principio Central

> O Kindar nao resolve conflitos — ele previne conflitos ao criar estrutura, transparencia e previsibilidade.

### Framework de Comunicacao

```
Nivel 1: Estruturado (preferido)
  - Check-in com campos pre-definidos
  - Decisoes com votacao
  - Swap requests formais
  - Despesas com categorias e recibos
  [Minimo de interpretacao, maximo de dados]

Nivel 2: Semi-estruturado
  - Chat com canais separados por crianca
  - Temas sensiveis em area protegida
  - Mensagens com tom sugerido pela IA
  [Comunicacao livre mas canalizada]

Nivel 3: Escalacao
  - Mediador adicionado ao grupo
  - Decisao marcada como "precisamos de ajuda"
  - Timer de resposta + registro de nao-resposta
  [Intervencao profissional com dados]
```

### Decisoes: Quando usar qual fluxo

| Cenario | Fluxo Recomendado | Exemplo |
|---------|-------------------|---------|
| Rotina simples | Check-in automatico | "Pedro dormiu bem, comeu toda a janta" |
| Informacao factual | Registro direto | "Dei Paracetamol as 15h" |
| Coordenacao logistica | Swap request | "Preciso trocar quinta por sabado" |
| Despesa normal | Registro + split automatico | "Escola: R$ 2.800, split 50/50" |
| Decisao binaria | Votacao simples | "Natacao sim ou nao?" |
| Decisao complexa | Decisao estruturada + argumentos | "Escola particular vs publica" |
| Impasse | Escalacao para mediador | "Nao concordamos sobre a viagem" |
| Emergencia | Registro + push urgente + WhatsApp | "Luisa caiu, estamos no hospital" |

### Anti-padroes que o Design Evita

| Anti-padrao | Como o Kindar evita |
|-------------|---------------------|
| "Voce nunca me avisa" | Registros automaticos + push + WhatsApp |
| "Voce gasta demais" | Despesas com recibo + split configurado + settlement periodico |
| "Voce sempre troca e eu nunca" | Swap balance automatico com historico |
| "Eu nao sabia que ele estava doente" | Modulo de saude visivel para ambos + push urgente |
| "Voce nao participa das decisoes" | Decisoes com deadline + registro de nao-resposta |
| "Na minha casa e diferente" | Check-in em ambas as casas cria visibilidade cruzada |

---

## Requisitos Nao-Funcionais

| Requisito | Meta | Justificativa |
|-----------|------|---------------|
| **Performance** | First Contentful Paint < 1.5s | Mobile-first, conexoes 4G variadas |
| **Uptime** | 99.9% | Pais dependem do app para informacoes de saude em emergencia |
| **Latencia API** | p95 < 500ms | UX fluida, especialmente no check-in |
| **Storage** | < 50MB cache local | Dispositivos de entrada com storage limitado |
| **Acessibilidade** | WCAG 2.1 AA | Avos com dificuldade visual (Dona Marta) |
| **Seguranca** | LGPD compliant, dados criptografados em transito e repouso | Dados sensiveis de criancas |
| **Internacionalizacao** | 5 idiomas mantidos em parity | Ja implementado (PT, EN, ES, FR, DE) |
| **Compatibilidade** | iOS Safari 15+, Chrome 90+, Samsung Internet | Cobertura de 95% do mercado BR |

---

## Riscos e Mitigacoes

| Risco | Probabilidade | Impacto | Mitigacao |
|-------|:---:|:---:|-----------|
| WhatsApp API rejeta templates | Media | Alto | Preparar templates conservadores. Ter SMS como fallback. |
| IA sugere algo inapropriado | Baixa | Alto | Guardrails rigidos no prompt. Review humano dos primeiros 1000 usos. Botao "reportar sugestao". |
| Offline sync gera conflitos de dados | Media | Medio | Last-write-wins + merge log + UI de conflito para casos raros |
| Custo de WhatsApp + IA inviabiliza free tier | Media | Alto | Limitar mensagens WhatsApp a 10/mes free. IA reformulacoes 5/dia free. |
| Adocao baixa do segundo pai | Alta | Alto | Valor individual (saude, check-in funciona solo). Nudges. Convite via WhatsApp. |
| LGPD: dados de menores | Media | Alto | Consentimento explicito. Data minimization. Direito de exclusao completa. |

---

## Correcoes de QA — Teste Fechado Android (2026-06-03/04)

> Ciclo de correcoes a partir do feedback dos testers do teste fechado Android (track `internal` do Play). Os testers estavam na build **1.0.11** enquanto o `main` ja estava em **1.0.19** — varios bugs ja corrigidos no main nunca chegaram (OTA nao atravessa runtime; ver "Entrega"). Diagnostico + correcao numa sessao unica, browser-assisted.

### Bugs reportados + correcoes

| # | Bug (tester / e-mail) | Causa-raiz | Correcao | Entrega |
|---|---|---|---|---|
| 1 | Editar despesa → "Falha ao editar" (Alexandre) | `/api/expenses` faltava na allowlist Bearer do middleware → request do Native (sem cookie) era redirecionada 307 → /session-recovery → HTML → `apiFetch.JSON.parse` falha → `r.data` null → fallback generico. 3a recorrencia (apos `/api/notifications/prefs`, `/api/children/sizes`). create/approve/delete usam `safeWrite`, por isso so editar/cancelar/reabrir quebravam. | +`/api/expenses` na allowlist (`src/lib/supabase/middleware.ts`) | ✅ Server-side (PR #61) — chega a TODOS na hora, ate no 1.0.11 |
| 2 | Adicionar crianca → "Salvar" nao fazia nada (Apollo, onboarding) | Data futura (2045): `isoFromBR` zera o ISO mas o botao habilita pelo campo de exibicao → os 3 handlers davam `return` SILENCIOSO sem erro. | Helper `birthDateErrorKey` + handlers mostram erro (`errorFutureBirthdate`/`errorInvalidDate`) | ✅ build vc35 (PR #62) |
| 3 | Chat: msg enviada so aparecia ao sair/voltar (oferret2008, mecoelho) | Sem insert otimista; dependia 100% do echo do realtime, que nao chega no envio proprio (Android/rede instavel). Causava re-envio duplicado. 6a divergencia PWA↔Native. | Insert otimista + reconciliacao no handler INSERT + remocao em falha (espelha o PWA) | ✅ build vc35 (PR #62) |
| 4 | Texto cortado no fim em varias telas | Sem cap global de font scale → aparelho com fonte do SO ampliada estoura layouts fixos. | `maxFontSizeMultiplier=1.3` global em Text/TextInput + `numberOfLines` no grid de Saude | ✅ build vc35 (PR #62) |
| 5 | CPF invalido sem aviso (mecoelho) | `cpfValid` dentro de `canSave` → botao desabilitava em silencio; mensagem inline discreta. | CPF nao bloqueia o botao; toast "CPF invalido" no toque | ✅ build vc35 (PR #63) |
| 6 | Acordos: chaves i18n cruas (`AGREEMENTS.CATEGORYLABEL`, `agreements.nonNegotiableHint`) + "Comunicacao" estourando | Build 1.0.11 antiga (10 categorias + `t('agreements.categoryLabel')` inexistente). Main atual usa rotulo fixo + 5 categorias + `nonNegotiableHint` existe. | Ja resolvido no main | ✅ entregue com o build novo |
| 7 | WhatsApp: codigo de vinculo nao chega (Alexandre, Amanda) | OTP enviado como **texto livre**, que a Meta so entrega dentro da janela de 24h. Usuario novo (zero inbound) nunca recebe; Meta retorna HTTP 200 sem erro. NAO e bug de plataforma (iOS/PWA "funcionam" porque tinham janela aberta). | Requer **template de Autenticacao aprovado na Meta** (ver M1 criterio #15) + trocar `sendTextMessage`→`sendTemplateMessage`. Pendente aprovacao Meta (assincrono). | ⏸️ Pendente acao na Meta |
| 8 | Login Google → "Acesso bloqueado / Erro 400 invalid_request" (dias.m.augusto) | Reproduzido no navegador: **"Custom URI scheme is not enabled for your Android client"**. O Google DESCONTINUOU o esquema de URI personalizado pro Android (2026) → fluxo do `expo-auth-session` morto no Android. iOS/PWA funcionam (mecanismos diferentes). | Migracao pro SDK nativo **`@react-native-google-signin`** (Credential Manager + SHA-1 + webClientId `2Lares Web`); iOS mantem expo-auth-session via branch por plataforma. | ✅ build vc36 (PR #66) — validar no device |
| 9 | Crianca com idade impossivel: data **11/11/1111** → "914 anos" (Magalhaes, onboarding, 2026-06-04) | `11/11/1111` e data passada e bem-formada → passava por `isIsoDate` (formato) + `isFutureDate` (nao-futura); faltava **limite inferior**. O fix do bug 2 so cobria data futura/malformada. | Guard `isTooOldDate` (>120 anos) no service consolidado `createChild`/`updateChild` → cobre create-group + /api/children + actions/group.ts numa tacada. Novo errorCode `birthdate_out_of_range` cai no fallback `serverMessage` (msg PT "Data de nascimento invalida. Verifique o ano."). | ✅ Server-side (PR #68) — chega a TODOS na hora, ate no 1.0.11 |
| 10 | Sangue/Peso/Altura na aba Saude "nao passiveis para edicao" (martins.00542, **iOS**, 2026-06-04) | Os 3 cards (`Stat` em TabSaude) eram **so resumo** (`View` sem `onPress`). Os valores SAO editaveis, mas em outro lugar (Sangue → editar crianca; Peso/Altura → Crescimento) → **descoberta**, nao campo travado. | Cards clicaveis (hint "editar"): Peso/Altura → `/saude/crescimento?childId=` (pre-seleciona a crianca); Sangue → aba Geral (editor de tipo sanguineo). | ✅ OTA **Android + iOS** (PR #70, 2026-06-04) — PWA já era descobrível (link "Ver mais") |
| 11 | Medicamento salva sem dosagem/horario/quantidade (martins.00542, **iOS**, 2026-06-04) | So `name` e obrigatorio; dosagem/frequencia em branco viram `"Conforme prescricao"` **silenciosamente** (colunas NOT NULL). Default e **intencional/flexivel** → decisao de produto (nao bug). | **Meio-termo nos 3** (decisao do dono): native confirma ao salvar vazio (#70). **A validacao cross-platform revelou que o PWA EXIGIA os campos** (regra divergente!) → alinhado ao meio-termo (#72). | ✅ Native **Android+iOS** (OTA #70) + **PWA** (#72, Vercel) — os 3 com a MESMA regra (Regra 19) |
| 12 | Push Android: `Default FirebaseApp is not initialized` (`services/push-setup`, build-wide, 2026-06-04) | App `com.kindar.app` **nunca registrado no Firebase** (projeto `kindar-68480` tinha zero apps) → sem `google-services.json` → Firebase nao inicializa → `getDevicePushTokenAsync` lanca. **Push Android nunca funcionou ponta-a-ponta** (cliente E servidor sem config). NAO e crash (capturado, retorna null). | **Cliente:** registrei o app no Firebase `kindar-68480` + `google-services.json` via **EAS secret** `GOOGLE_SERVICES_JSON` + `app.config.js` (repo PUBLICO → nao commitado) → **build vc37**. **Servidor:** `FCM_PROJECT_ID`/`FCM_CLIENT_EMAIL`/`FCM_PRIVATE_KEY` **nao existem no Vercel** → setup pendente. | 🔶 vc37 (#74) submetido ao `internal` — **mata o erro + registra token**; entrega REAL do push depende das envs FCM no servidor (acao do dono) |
| 13 | Nao consegue **remover despesa** pendente (sem co-responsavel) (2026-06-04) | `expenses` tinha policies INSERT/SELECT/UPDATE mas **NENHUMA DELETE** → com RLS, todo delete negado **silenciosamente** (0 linhas). `deleteExpense` (safeWrite = DELETE sob RLS, nao /api) nunca apagou nada, pra ninguem. "Co-responsavel" do dialogo era incidental. | Migration **00108**: policy DELETE espelhando a UI (`paid_by = (select auth.uid()) AND status IN ('pending','rejected')`). FK `expense_history` = ON DELETE CASCADE. | ✅ Server-side (PR #76) — vale pros 3 na hora; verificado por delete RLS-simulado (`deleted_under_rls=1`, antes 0) |
| 14 | (Audit) Mesmo bug LATENTE em 3 tabelas: `child_allergies`, `custody_events`, `medical_professionals` | Varrendo todos os `safeWrite delete` do client × `pg_policies`: RLS on + sem policy DELETE → apagar alergia / evento de ferias-custodia / profissional tambem falhava em silencio (ainda nao reportado). | Migration **00109**: 3 policies DELETE `is_group_member(group_id)` (espelha o UPDATE). FKs que as referenciam = ON DELETE SET NULL. | ✅ Server-side (migration 00109) — autorizado pelo dono; vale pros 3 na hora |
| 15 | Enviar **foto grande crasha o app** (ele "reinicia") no envio — reportado em **Novo documento** (Murilo, 2026-06-08); mesmo padrao em **recibo de despesa**, **imagem do chat** e **foto da crianca** (achados por varredura `grep arrayBuffer`). **Crash NATIVO → nada em `app_errors`** (so da pra diagnosticar por relato + e-mail do reporter). | `fetch(uri).arrayBuffer()` carrega o arquivo **inteiro** na memoria. O cap de 10MB se baseava no `fileSize` do `ImagePicker`, que **reporta 0 no Android** → `0 > 10MB === false` → guard furado → imagem gigante na RAM → **OOM nativo** (app reinicia). **4 uploads** com o mesmo padrao: documents, receipts, chat, avatar da crianca. | Helper PURO `app/_src/lib/upload-size.ts` (`uploadSizeError` usa o **MAX(reportado, on-disk)** → 0 nao fura mais) + resolver o tamanho REAL on-disk via `FileSystem.getInfoAsync(uri)` (`expo-file-system/legacy`) **ANTES** do `arrayBuffer()`. `documents` primeiro (#106), depois varredura nos outros 3: `uploadExpenseReceipt`, `uploadChatImage` (contrato → `{ok,path\|tooLarge}` p/ msg amigavel no toast), `uploadChildAvatar` (#107). Gotcha: expo-fs ~19 **nao** aceita `getInfoAsync(uri,{size:true})` (erro tsc; `size` ja vem quando `exists`). | ✅ **documents** em `main` (#106). 🔶 **recibo/chat/foto** = **PR #107** (`fix/native-upload-oom-batch`), **OTA-able** (sem dep nova) — aguarda merge+OTA. tsc verde + `upload-size.spec` 10/10. PWA nao afetado (server-actions ja validam tamanho). |

### Entrega (track `internal` do Play — auto-update pelos testers)
- **vc35 / 1.0.19** (bugs 2-6): submetido + `completed` (live).
- **vc36 / 1.0.19** (bug 8, Google nativo): build + submit.
- **Server-side** (bugs 1 e 9): live imediatamente (PR #61, #68), independe de build — backstop que vale ate no 1.0.11.
- **OTA nativa (bugs 10-11)**: 2026-06-04, **Android E iOS**, 7 runtimes cada (1.0.7→1.0.19), via `ota:android` + `ota:ios` (`--platform` explícito — publicações separadas e deliberadas, já que a runtime é compartilhada). Reporter era **iOS** → corrigido E entregue **no iOS** (regra correta: bug reportado no iOS se entrega no iOS; o "nunca tocar iOS" é só contra publish **acidental**, não contra fix deliberado). `TARGET_VERSIONS` += **1.0.19**. Verificado seguro p/ iOS: o bundle não importa `@react-native-google-signin` no iOS (guard `Platform.OS !== 'android'` antes do dynamic import).
- **PWA (bug 11)**: o PWA **EXIGIA** dosagem/frequência (divergente do native) → **alinhado ao meio-termo** (#72, via Vercel) + chave i18n nos 5 locales. Os 3 (iOS/Android/PWA) agora com a MESMA regra de medicamento.
- **Build vc37 / 1.0.19 (bug 12, push Android)**: 2026-06-04, `--platform android`, submetido ao `internal` (`completed`). Firebase confirmado no `.aab` (`resources.pb` tem `kindar-68480` + `158871147404` + `gcm_defaultSenderId` + `google_app_id`). ⚠️ **Falta o lado servidor**: gerar service account em `kindar-68480` (Firebase → Contas de serviço) → setar `FCM_PROJECT_ID=kindar-68480` + `FCM_CLIENT_EMAIL` + `FCM_PRIVATE_KEY` no Vercel (Production) + redeploy. Entrar a chave privada = ação do dono.
- **RLS DELETE policies (bugs 13-14)**: `expenses` (00108, PR #76) + `child_allergies`/`custody_events`/`medical_professionals` (00109) — faltavam policies DELETE → deletes negados em silêncio. Server-side, valem pros 3 clientes na hora. **Lição:** tabela com RLS precisa de policy pra CADA operação que o client executa (auditar `safeWrite delete` × `pg_policies`).
- **OOM em uploads grandes (bug 15)**: `fetch().arrayBuffer()` lia o arquivo inteiro; `ImagePicker.fileSize=0` no Android furava o cap de 10MB → **crash nativo** (invisivel em `app_errors`). Fix = guard `upload-size.ts` + `FileSystem.getInfoAsync` antes do read, nos **4 uploads**. `documents` ja em `main` (#106); **recibo/chat/foto** em **PR #107**, **OTA-able** (runtime compartilhada → ao mergear, `ota:android` + `ota:ios` deliberados, com `--platform` explícito). **Fix REAL futuro** (fora de escopo, maior impacto): streaming via `FileSystem.uploadAsync` + `supabase.storage.createSignedUploadUrl` elimina OOM em **qualquer** tamanho (hoje so barra >10MB; ≤10MB ainda lê na RAM).
- ⚠️ **Armadilha versionCode**: `app.json` estava em `3`, Play ja em `34` (via 1.0.20/alpha) → SEMPRE rodar `npm run play:status` antes de bumpar. Builds desta leva: vc35 → vc36 → vc37.
- ⚠️ **OTA nao atravessa runtime** (`runtimeVersion=appVersion`): pra entregar a quem esta numa build antiga = **BUILD NOVO no track** (Play auto-update), nao OTA.

### Duas linhas de release divergentes (atencao produto)
- `main` (1.0.19) = os bug fixes acima, **SEM** paywall.
- `chore/native-1.0.20` (alpha) = **paywall Harmonia #53** + monetizacao, **SEM** os bug fixes.
- ⚠️ Antes de subir o paywall (1.0.20) pra producao, **mergear o `main`** — senao a producao vai sem as correcoes.
