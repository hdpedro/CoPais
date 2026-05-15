# Roadmap de Produto - Kindar

> Ultima atualizacao: 14/05/2026
> Horizonte: Q2 2026 - Q1 2027 (4 trimestres)
>
> **Status real de Q2 2026 (midway):**
> - ✅ WhatsApp MVP — implementado (`/api/whatsapp/webhook`, parser PT-BR, OCR de recibos, multi-grupo, 4 tabelas migration 00043 + views v2 em 00065)
> - ✅ Performance — `Promise.all()` paralelos, indexes (00025), queries com colunas especificas + `.limit()` em todas as paginas criticas
> - ✅ Offline basics — `safeWrite` queue native (AsyncStorage), `returnInsertedId: true` para chain de notify pos-write
> - ✅ Push improvements — Foundation Collab com coalescing 60s (FCM `tag`, APNs `thread-id`, web-push `tag`), APNs nativo via expo-notifications + endpoint `/api/native/notify`
> - 🟡 AI Mediator — `tone-moderator.ts` no chat ja existe (analise de tom + sugestao). IA conversacional in-app e WhatsApp 100% funcional
> - ➕ **Bonus entregue em Q2 (nao estava no plano original):** Foundation Collab (Fases 1/1B/3), Billing multi-provider (Stripe + IAP + RevenueCat), Google Sign-In Android, custody_events integrity hardening (00079), calendar_occurrences via trigger (00074), onboarding wizard premium, PostHog cross-platform com super-property `platform`

---

## Visao Geral

```
Q2 2026              Q3 2026              Q4 2026              Q1 2027
"Fundacao"           "Inteligencia"       "Expansao"           "Plataforma"

WhatsApp MVP         AI Mediator          Multi-language       Enterprise
Performance          Professional         Premium features     API Platform
Offline basics       Shared albums        Analytics            Courts/Schools
Push improvements    Activity tracker     Growth engine        Partnerships
```

---

## Q2 2026: "Fundacao" — Conectividade e Performance

**Tema**: Resolver os problemas fundamentais de delivery e performance que impedem product-market fit.

**Objetivo principal**: Garantir que 95% das notificacoes criticas cheguem ao destino e que o app funcione em qualquer condicao de rede.

### Features

| Feature | Descricao | Esforco | Owner |
|---------|-----------|---------|-------|
| **WhatsApp Integration MVP** | Notificacoes criticas (saude, swaps, decisoes com deadline) via WhatsApp Business API | 4-5 sem | Backend |
| **Offline Mode Basics** | Cache de saude + calendario. Fila offline para check-in e despesas | 3-4 sem | Frontend |
| **Push Notifications v2** | Categorias (urgente/importante/info), horario silencioso, deep links, agrupamento | 2-3 sem | Full-stack |
| **Performance Optimization** | Bundle splitting, image optimization, Supabase query optimization, ISR para paginas estaticas | 2 sem | Frontend |
| **Onboarding Flow v2** | Setup progressivo (minimo necessario primeiro), tour interativo, convite WhatsApp melhorado | 2 sem | Frontend + Design |

### Metricas de Sucesso Q2

| Metrica | Baseline (Atual) | Meta Q2 | Como medir |
|---------|:---:|:---:|-----------|
| Notification delivery rate | ~70% (push only) | > 95% | Push service logs + WhatsApp delivery receipts |
| First Contentful Paint | ~2.5s | < 1.5s | Vercel Analytics |
| Onboarding completion (signup -> grupo + filho) | ~45% | > 70% | PostHog funnel |
| Convite aceito em < 48h | ~30% | > 50% | Supabase query |
| D7 retention | ~25% | > 35% | PostHog cohort |

### Dependencias

- Conta WhatsApp Business verificada (processo leva 2-4 semanas)
- Templates WhatsApp aprovados pela Meta (1-2 semanas por template)
- Service Worker compativel com Next.js 16 (testar com novo app router)

### Marcos

| Data | Marco |
|------|-------|
| 1 Abr | WhatsApp Business account aprovada |
| 15 Abr | Primeiro template de notificacao aprovado |
| 1 Mai | WhatsApp notifications em beta (100 familias) |
| 15 Mai | Offline mode em beta |
| 1 Jun | Push v2 em producao |
| 30 Jun | Todas as features Q2 em producao |

---

## Q3 2026: "Inteligencia" — IA e Expansao de Features

**Tema**: Adicionar inteligencia ao produto e expandir o valor para novos stakeholders.

**Objetivo principal**: Lançar o mediador IA como diferencial competitivo e o portal profissional como novo canal de revenue.

### Features

| Feature | Descricao | Esforco | Owner |
|---------|-----------|---------|-------|
| **AI Conflict Mediator** | Reformulacao de mensagens, sugestao de compromissos, deteccao de tom agressivo | 4-5 sem | Backend + AI |
| **Professional Portal MVP** | Dashboard para mediadores: visao multi-familia, indicadores de conflito, notas privadas | 6 sem | Full-stack |
| **Shared Photo Album** | Upload de fotos por crianca, timeline, compressao automatica, 1GB free / 10GB premium | 3-4 sem | Full-stack |
| **Activity Tracker v2** | Checklist interativo, integracao com calendario, lembretes contextuais, custos vinculados | 2-3 sem | Full-stack |
| **Health Export** | Exportacao do historico de saude em PDF para pediatra ou hospital | 2 sem | Full-stack |

### Metricas de Sucesso Q3

| Metrica | Baseline (Q2 end) | Meta Q3 | Como medir |
|---------|:---:|:---:|-----------|
| Familias ativas (ambos pais usaram no mes) | 5.000 | 15.000 | Supabase query |
| Mensagens reformuladas pela IA / mes | 0 | 10.000 | AI service logs |
| % mensagens agressivas suavizadas | 0% | > 40% dos alertas | AI classifier |
| Profissionais cadastrados | 0 | 200 | Supabase |
| Fotos uploadadas / mes | 0 | 50.000 | Storage metrics |
| NPS | A medir | > 45 | Survey in-app |

### Dependencias

- API key de LLM provider (Claude/GPT-4) com acordo de processamento de dados
- LGPD compliance para dados enviados a LLM (anonimizacao)
- Designer para portal profissional (diferente da interface de pais)
- Supabase Storage upgrade para suportar volume de fotos

### Marcos

| Data | Marco |
|------|-------|
| 15 Jul | AI Mediator em alpha (equipe interna + 50 familias) |
| 1 Ago | Portal profissional em beta (10 mediadores convidados) |
| 15 Ago | Shared albums em producao |
| 1 Set | AI Mediator em producao (com guardrails) |
| 30 Set | Health export em producao |

---

## Q4 2026: "Expansao" — Multi-idioma e Monetizacao

**Tema**: Expandir o alcance global e estabelecer revenue sustentavel.

**Objetivo principal**: Lançar em mercados internacionais (ES, EN) e atingir R$ 500k ARR.

### Features

| Feature | Descricao | Esforco | Owner |
|---------|-----------|---------|-------|
| **Multi-language Launch** | Lançamento oficial em EN (US/UK), ES (LATAM), FR, DE. Marketing localizado | 3 sem | Full-stack + Marketing |
| **Premium Tier** | Paywall com Stripe: R$ 19,90/mes ou R$ 199/ano. Features: ilimitado, export, storage, IA | 4 sem | Full-stack + Backend |
| **Analytics Dashboard (internal)** | Dashboard interno com metricas de produto, cohorts, revenue, churn | 3 sem | Data + Full-stack |
| **Family Health Report** | Relatorio mensal automatico com resumo de saude, vacinas pendentes, consultas proximas | 2 sem | Full-stack |
| **Settlement Automation** | Calculo automatico de settlement mensal com geracao de link PIX | 2 sem | Backend |
| **Referral Program** | "Indique uma familia, ganhe 1 mes gratis" com tracking e reward | 2 sem | Full-stack + Growth |

### Metricas de Sucesso Q4

| Metrica | Baseline (Q3 end) | Meta Q4 | Como medir |
|---------|:---:|:---:|-----------|
| Familias ativas totais | 15.000 | 35.000 | Supabase |
| Familias fora do Brasil | 0 | 2.000 | Supabase (locale) |
| ARR | R$ 0 | R$ 500k | Stripe |
| Free -> Premium conversion | 0% | > 10% | Stripe + Supabase |
| Churn mensal premium | N/A | < 5% | Stripe |
| Referrals (% new signups via referral) | ~10% organico | > 25% | UTM tracking |

### Dependencias

- Stripe integration para pagamentos (BRL + USD + EUR)
- Traducoes revisadas por nativos em cada idioma (ja temos i18n base)
- App Store presence para mercados internacionais (ASO em EN, ES)
- Compliance GDPR para mercado europeu

### Marcos

| Data | Marco |
|------|-------|
| 1 Out | Premium tier lancado no Brasil (beta com early adopters) |
| 15 Out | Lançamento em espanhol (Argentina, Colombia) |
| 1 Nov | Lançamento em ingles (US, UK) |
| 15 Nov | Referral program ativo |
| 1 Dez | Settlement automation em producao |
| 31 Dez | Meta de R$ 500k ARR atingida |

---

## Q1 2027: "Plataforma" — Enterprise e Ecossistema

**Tema**: Transformar o Kindar de app consumer em plataforma de coparentalidade.

**Objetivo principal**: Estabelecer canais B2B e criar API para integracao com ecossistema juridico e de saude.

### Features

| Feature | Descricao | Esforco | Owner |
|---------|-----------|---------|-------|
| **API Platform v1** | API publica RESTful para integracao com sistemas de terceiros (escolas, clinicas) | 6 sem | Backend |
| **Courts Integration Pilot** | Parceria com varas de familia para uso do Kindar como ferramenta oficial de acompanhamento | 4 sem | Backend + Legal |
| **School Integration** | Webhook para receber updates de escola (faltas, notas, comunicados) e exibir no Kindar | 4 sem | Backend |
| **Professional Portal v2** | Relatorios para tribunal, historico completo exportavel, multi-familia avancado | 4 sem | Full-stack |
| **Data Analytics for Professionals** | Metricas de cooperacao, indice de conflito, historico de cumprimento de acordos | 3 sem | Data + Full-stack |
| **White-label for Organizations** | Marca customizavel para escritorios de advocacia e nucleos de mediacao | 3 sem | Full-stack |

### Metricas de Sucesso Q1 2027

| Metrica | Baseline (Q4 end) | Meta Q1 2027 | Como medir |
|---------|:---:|:---:|-----------|
| Familias ativas totais | 35.000 | 50.000 | Supabase |
| ARR | R$ 500k | R$ 1.5M | Stripe |
| Profissionais pagantes | 200 | 1.000 | Stripe |
| Varas de familia parceiras | 0 | 5 (piloto) | Contratos |
| API calls / mes | 0 | 100.000 | API gateway |
| Revenue B2B (% total) | 0% | 15% | Stripe |

### Dependencias

- Parceria formal com OAB ou associacao de mediadores
- Acordo piloto com ao menos 1 vara de familia
- Documentacao de API e developer portal
- Certificacao de seguranca (SOC 2 ou equivalente para dados de menores)

### Marcos

| Data | Marco |
|------|-------|
| 15 Jan | API v1 em beta (documentacao + sandbox) |
| 1 Fev | Primeiro piloto com vara de familia iniciado |
| 15 Fev | Professional portal v2 em producao |
| 1 Mar | White-label disponivel para primeiros parceiros |
| 31 Mar | Meta de R$ 1.5M ARR e 50k familias |

---

## Visao de Longo Prazo (2027-2029)

| Periodo | Tema | Features Macro |
|---------|------|---------------|
| H2 2027 | Ecossistema | Marketplace de profissionais, integracao com planos de saude, app nativo (React Native) |
| H1 2028 | Inteligencia | IA preditiva (prever conflitos), coaching parental automatizado, relatorios de desenvolvimento |
| H2 2028 | Escala Global | Lançamento em Asia (japones, coreano), compliance local, parcerias com governos |
| 2029 | Plataforma Completa | Kindar como infraestrutura: schools dashboard, healthcare integration, government reporting |

---

## Alocacao de Recursos por Quarter

| Quarter | Eng (devs) | Design | Data | Marketing | Total Headcount |
|---------|:---:|:---:|:---:|:---:|:---:|
| Q2 2026 | 3 | 1 | 0 | 1 | 5 |
| Q3 2026 | 4 | 1 | 1 | 1 | 7 |
| Q4 2026 | 5 | 1 | 1 | 2 | 9 |
| Q1 2027 | 6 | 2 | 1 | 2 | 11 |

---

## Riscos por Quarter

| Quarter | Risco Principal | Probabilidade | Mitigacao |
|---------|----------------|:---:|-----------|
| Q2 | WhatsApp API delays | Media | Comecar processo de verificacao AGORA. SMS como fallback. |
| Q3 | IA gera sugestao problematica | Media | Guardrails rigidos, review humano, botao de report, desligar feature rapidamente |
| Q4 | Conversao premium abaixo de 5% | Media | Testar pricing. A/B test paywall. Ajustar mix de features free vs premium. |
| Q1 2027 | Parceria com varas de familia nao avanca | Alta | Burocracia publica e lenta. Focar em mediadores privados como alternativa. |
