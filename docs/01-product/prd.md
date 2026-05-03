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
