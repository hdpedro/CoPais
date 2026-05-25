# Manual PostHog — Visão Sócio Kindar

> Guia prático pra sócios/investidores acompanharem o Kindar via PostHog sem precisar de background técnico. Última atualização: 2026-05-21.

---

## 1. O que é o PostHog e por que importa

PostHog é a ferramenta onde **cada ação relevante** que acontece no Kindar (PWA + iOS + Android) vira um evento. Combinando esses eventos respondemos perguntas como:

- Quantos usuários novos chegaram esta semana?
- Quantos dos que se cadastraram realmente usam o app?
- Onde estão travando no onboarding?
- Quanto cresce nossa base ativa por mês?

Sem PostHog, vivemos no "achismo". Com PostHog, decisões viram **leitura de números**.

---

## 2. Login

🔐 **URL:** https://us.posthog.com
📧 **Email:** `angelino.barata@gmail.com`
🔑 **Senha:** se não lembrar, clica **"Forgot password?"** e recebe link de reset.

Após login, vai cair direto no dashboard pinned **"Kindar — Visão Sócio (Acompanhamento)"**.

> Caso não caia, abre direto: https://us.posthog.com/project/350548/dashboard/1614527

---

## 3. O Dashboard "Visão Sócio" — Tour dos 8 tiles (de cima pra baixo)

O dashboard segue uma **narrativa**: começa com a saúde geral, mergulha no funil, e termina nos detalhes operacionais.

### 🩺 BLOCO TOPO — Saúde em 4 números (Bold Numbers)

#### 👥 Tile 1: Base ativa neste mês (MAU)
**O que mostra:** quantos usuários únicos logaram pelo menos uma vez nos últimos 30 dias.
**O que é bom:** subir mês a mês.
**O que é alarme:** cair 2 meses seguidos = churn maior que aquisição.

#### 📧 Tile 2: Conversão · E-mail confirmado (signup → confirmed %)
**O que mostra:** % dos cadastros que clicaram no link de confirmação por email.
**Benchmark:** >80% = saudável. <60% = canal email com problema (spam, link quebrado, copy ruim).
**Onde escavar:** se baixa, checar SPF/DMARC + deliverability Outlook/Gmail.

#### 🔐 Tile 3: Conversão · Voltou e logou (signup → login %)
**O que mostra:** % dos signups que voltaram pelo menos 1x.
**Benchmark:** >70% = bom. <50% = D1 retention crítico (algo não engancha após cadastro).
**Onde escavar:** se baixa, ver onboarding step inicial + welcome email + push opt-in.

#### 🎯 Tile 4: Ativação completa fim-a-fim (signup → 1ª mensagem %)
**O que mostra:** % que chegaram até enviar a primeira mensagem ao coparente.
**Esta é a métrica mais importante.** É o sinal de que o user achou valor social no app.
**Benchmark:** >15% = produto-mercado em formação. <5% = ativação travada.
**Janela:** sem limite de tempo — conta qualquer signup que eventualmente tenha mandado mensagem.

### 🎯 BLOCO MEIO — Funil detalhado

#### 🎯 Tile 5: Funil de ativação · 7 passos
**O que mostra:** de 100 pessoas que se cadastram, quantas chegam em cada passo até "enviou primeira mensagem ao coparente". Cada barra é um passo.

Os 7 passos (na ordem):
1. **Conta criada** (signup_completed) — fez o cadastro
2. **E-mail confirmado** (signup_confirmed) — clicou no link
3. **Primeiro login** (user_login) — voltou e entrou
4. **Grupo criado** (group_created) — criou o espaço do co-parenting
5. **Criança adicionada** (child_added) — cadastrou pelo menos 1 filho
6. **Primeiro evento** (event_created) — criou evento no calendário
7. **Primeira mensagem** (message_sent) — conversou com o coparente

**O que é bom:** drops pequenos entre passos (5-10%).
**O que é alarme:** drop > 30% entre passos consecutivos.
**Onde olhar primeiro:** o **maior drop** te diz o gargalo principal.
**Janela:** 7 dias entre passos (se passou de 7d entre dois passos, não conta).

> 💡 **Annotations no eixo X** marcam releases importantes (i18n, Face ID fix, fixtures cleanup, etc.) — ajuda a correlacionar quedas/picos com causas reais.

### 📈 BLOCO BASE — Detalhes operacionais (Line Charts)

#### 📈 Tile 6: Novos cadastros por dia · com comparação semana anterior
**O que mostra:** cadastros novos por dia (linha sólida) vs mesmo período anterior (linha tracejada).
**O que é bom:** sólida acima da tracejada = crescendo.
**O que é alarme:** flat ou abaixo da tracejada = aquisição estagnou ou caiu.
**Onde olhar:** picos coincidem com campanhas? Quedas coincidem com bugs em prod (use as annotations)?

#### 🟢 Tile 7: Quem entrou no app a cada dia · com comparação
**O que mostra:** quantas pessoas distintas logaram em cada dia. Linha sólida vs período anterior tracejada.
**O que é bom:** linha plana ou subindo (= base usa o app no dia-a-dia) e acima da tracejada.
**O que é alarme:** zigue-zague selvagem ou queda contínua relativa à comparação.
**Cuidado:** "Logaram" ≠ "abriram o app". Se app fica aberto sem deslogar, pode subestimar o DAU real.

#### 🌱 Tile 8: Signups por canal · convite vs referral vs orgânico
**O que mostra:** barra empilhada dos signups por semana, separados por canal de aquisição (`has_invite=true` = via convite de coparente, `has_referral=true` = via referral code, ambos `false` = orgânico).
**O que é bom:** mix saudável (não 100% dependente de 1 só canal).
**O que é alarme:** 100% vindo de orgânico = produto não viraliza; 100% via convite = aquisição depende só de quem já está usando.
**Decisão que isso responde:** onde investir crescimento — se orgânico domina, ASO/SEO/conteúdo. Se convite domina, fricção no fluxo de convite ou incentivo pra mais convites.

---

## 4. Glossário rápido

| Termo | Tradução prática |
|---|---|
| **Event** | Qualquer ação registrada (`signup_completed`, `child_added`, etc.) |
| **Person** | Usuário único, identificado pelo `user_id` do Supabase |
| **Funnel** | Sequência ordenada de eventos. Mostra conversão entre cada passo |
| **DAU / WAU / MAU** | Daily / Weekly / Monthly Active Users — únicos por janela |
| **Property** | Atributo de evento ou usuário (ex: `locale`, `has_invite`) |
| **Cohort** | Grupo de usuários com critério em comum (ex: "criaram conta esta semana") |
| **Insight** | Gráfico salvo (funnel, trend, table) |
| **Dashboard** | Coleção de insights agrupados |

---

## 5. Perguntas que o dashboard responde

| Pergunta de sócio | Tile a olhar |
|---|---|
| Estamos crescendo? | **Signups/dia** (subindo?) + **MAU** (mês comparado) |
| Quem cadastra realmente usa? | **Onboarding Funnel** (conversion final) |
| Qual o gargalo do onboarding? | **Onboarding Funnel** (maior drop) |
| Tem retenção? | **DAU** (linha plana ou crescente = sim) |
| Lançamento de feature impactou? | Compare **DAU** antes/depois |

---

## 6. Quando algo chama atenção — onde escavar

PostHog tem muito mais que o dashboard. Quando algo te intrigar, aqui está o roteiro:

### 6.1 Quero ver users individuais
👉 **People** (menu esquerdo) → busca por email ou explora cohort.

### 6.2 Quero ver replay de uma sessão
👉 **Session replay** (menu esquerdo). Vê gravação real de tela do user (rola, clica, etc.) — útil pra entender bugs ou frustration patterns.
⚠️ Por privacy, ativamos só pra subset de sessões.

### 6.3 Quero filtrar o funnel por algo
👉 Abre o **Onboarding Funnel** → "Filter" → ex: filtrar só users com `has_invite=true` (convidados por coparente) e comparar com `has_invite=false` (orgânicos).

### 6.4 Quero ver TODOS os eventos disponíveis
👉 **Data → Event definitions**. Lista completa do que rastreamos. Ex.:
- `signup_completed`, `signup_confirmed`, `user_login`, `password_reset`, `magic_link_sent`
- `group_created`, `child_added`, `custody_enabled`, `event_created`, `activity_created`
- `message_sent`, `notification_opened`
- `expense_created`, `expense_edited`, `expense_cancelled`, `expense_reopened`
- `vaccine_status_viewed`, `vaccine_marked_taken`, `vaccine_pending_dismissed`
- `school_log_read`, `unread_count`, `urgent_created`

### 6.5 Quero query SQL livre
👉 **SQL** (menu esquerdo). Permite query direta sobre eventos. Roda contra ClickHouse.

---

## 7. Eventos importantes pra entender o produto

| Evento | Quando dispara | Por que importa |
|---|---|---|
| `signup_completed` | User finaliza o cadastro | Acquisition |
| `signup_confirmed` | Clica no link do e-mail | Validação real (anti-bot, anti-erro) |
| `user_login` | Faz login | Retention proxy |
| `group_created` | Cria o espaço de co-parenting | Activation step 1 |
| `child_added` | Cadastra primeiro filho | Activation step 2 |
| `event_created` | Cria evento no calendário | Activation step 3 (uso real) |
| `message_sent` | Conversa com coparente | Activation final (valor social) |
| `notification_opened` | Toca em push e abre | Engagement core |
| `urgent_created` | Cria registro com priority=urgent | Sinal de uso "sério" |
| `vaccine_marked_taken` | Marca vacina como aplicada | Saúde — uso de feature avançada |
| `expense_created` | Cria despesa compartilhada | Financeiro — engajamento monetário |

---

## 8. Quem ajusta o quê (roles)

Você (Angelino) é **Member**. Isso significa:

✅ **Pode:**
- Ver TODOS os dashboards e insights
- Criar novos insights pra explorar dados
- Adicionar comentários em insights
- Criar dashboards próprios

❌ **Não pode:**
- Convidar/remover outros membros (precisa ser Admin)
- Mexer em billing / configurações do projeto
- Apagar insights de outros (mas pode os seus)

Se precisar de Admin (pra gerir time), me avisa que promovo.

---

## 9. Limites conhecidos (caveats)

⚠️ **Test accounts:** até hoje (21-mai), 11 contas de teste poluíam métricas. **Já foram removidas.** Daqui pra frente, novos seeders usam `is_test_account=true` (excluídos automaticamente).

⚠️ **DAU baseado em `user_login`:** subestima quem mantém sessão aberta sem novo login. Pra DAU real-real, vamos instrumentar `session_start` event no próximo ciclo.

⚠️ **Native (iOS/Android) eventos:** funnel cobre os 7 passos via PWA + Native (PostHog une por `user_id`). Apenas alguns eventos client-only (lock screen, calendar interactions) são Native-only.

⚠️ **Locale:** Hoje só PT está ativo (`NEXT_PUBLIC_ENABLE_LOCALE_SWITCH=0`). EN/ES/FR/DE existem como scaffolding mas usuários não veem.

⚠️ **Histórico curto:** ~60 dias de dados. Tendências longas ainda não dá pra observar.

---

## 10. Quando me chamar

Me manda mensagem (WhatsApp ou email) sempre que:
- 📉 **Drop estranho** em alguma métrica → "o que aconteceu?"
- 💡 **Tese pra testar** → "quero ver se X causa Y" → eu monto a query
- 🚨 **Erro/feature quebrada** → vê em Error tracking → me alerta
- 🎯 **Decisão de prioridade** → "vale a pena investir em X?" → olhamos dados juntos

---

## 11. Convenções de naming (pra futuro evento que aparecer)

Quando vir evento novo no PostHog, decifrar fica fácil:

- `<entidade>_<verbo>` → `group_created`, `child_added`, `expense_edited`
- `<entidade>_<estado>` → `signup_completed`, `signup_confirmed`, `signup_resend`
- `<acao>_<contexto>` → `notification_opened`, `magic_link_sent`

Mais sobre nomenclatura: [`docs/03-architecture/REGRAS_CANONICAS.md`](../03-architecture/REGRAS_CANONICAS.md).

---

## 12. Próximos passos pra você

1. **Loga uma vez** → confirma que o dashboard aparece
2. **Olha cada um dos 4 tiles** → forma intuição inicial (números atuais)
3. **Abre o Onboarding Funnel** → vê onde está o maior drop (esse é o gargalo principal hoje)
4. **Volta uma vez por semana** → mesma rotina, vê o que mudou
5. **Quando algo intrigar** → me chama

---

**Referências:**
- Dashboard: https://us.posthog.com/project/350548/dashboard/1614527
- Onboarding Funnel: https://us.posthog.com/project/350548/insights/4Eo2WTjU
- Catálogo de eventos: [`src/lib/analytics.ts`](../../src/lib/analytics.ts) + [`kindar-native/app/_src/lib/analytics.ts`](../../kindar-native/app/_src/lib/analytics.ts)
- Análise correlata: [`docs/05-growth/analytics-plan.md`](analytics-plan.md), [`docs/05-growth/metrics.md`](metrics.md)
