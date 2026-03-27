# Plano de Analytics — Kindar

> Estrutura de dashboards, pipeline de dados e plano de analise de coortes.

---

## 1. Arquitetura de Dados

```
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│  Next.js App  │───▶│   PostHog    │───▶│  Dashboards      │
│  (client +    │    │  (eventos +  │    │  (PostHog UI)     │
│   server)     │    │   sessions)  │    └──────────────────┘
└──────┬───────┘    └──────────────┘
       │
       ▼
┌──────────────┐    ┌──────────────┐
│   Supabase   │───▶│  Supabase    │
│  (PostgreSQL) │    │  Dashboard   │
└──────────────┘    │  (infra)     │
                    └──────────────┘
       │
       ▼
┌──────────────┐
│   Vercel     │
│  Analytics   │
│  (Web Vitals)│
└──────────────┘
```

### Fontes de Dados

| Fonte | Tipo de Dados | Frequencia |
|---|---|---|
| PostHog (server events) | Acoes do usuario (signup, expense_created, etc) | Real-time |
| PostHog (client auto-capture) | Page views, sessoes, device info | Real-time |
| Supabase Dashboard | Metricas de banco (rows, connections, storage) | 1 min |
| Vercel Analytics | Core Web Vitals, latencia, erros | Real-time |

---

## 2. Dashboards

### 2.1 Dashboard Executivo

**Audiencia:** Fundadores, investidores
**Frequencia de consulta:** Semanal

| Metrica | Fonte | Visualizacao |
|---|---|---|
| Usuarios ativos (DAU/WAU/MAU) | PostHog | Grafico de linha com tendencia |
| Novos cadastros (diario/semanal) | PostHog: `user_signup` | Barra empilhada (organico vs convite) |
| Grupos ativos | PostHog: `daily_active` com group_id | Numero + delta semanal |
| Taxa de convite aceito | PostHog: `invitation_accepted` / `invitation_sent` | Percentual + tendencia |
| Ambos pais ativos (%) | PostHog: `both_parents_active` / total grupos | Gauge + tendencia |
| MRR (futuro) | Stripe webhooks | Numero + grafico de crescimento |
| Retencao D7/D30 | PostHog retention | Curva de retencao |

### 2.2 Dashboard de Produto

**Audiencia:** Product Manager, Designers
**Frequencia:** Diaria

| Metrica | Fonte | Descricao |
|---|---|---|
| Feature adoption | PostHog: eventos por feature | Heatmap de uso por funcionalidade |
| Funil de onboarding | PostHog funnel | signup → grupo → filho → convite → escala |
| Tempo ate ativacao | PostHog: tempo entre signup e `both_parents_active` | Distribuicao + mediana |
| Top features usadas | PostHog: contagem por tipo de evento | Ranking semanal |
| Modulo saude depth | Registros de saude por grupo | Histograma de profundidade |
| Erros de UX | PostHog: eventos de redirect com `?error=` | Lista de erros mais frequentes |
| Sessoes por plataforma | PostHog: $device_type | Pizza: mobile vs desktop |
| i18n adoption | PostHog: locale property | Pizza: distribuicao por idioma |

### 2.3 Dashboard de Engenharia

**Audiencia:** Desenvolvedores
**Frequencia:** Diaria

| Metrica | Fonte | Descricao |
|---|---|---|
| Core Web Vitals (LCP, FID, CLS) | Vercel Analytics | P75 com threshold verde/amarelo/vermelho |
| Latencia de Server Actions | PostHog: duracao de eventos | P50, P95, P99 |
| Taxa de erros | PostHog: eventos com `error` property | Percentual por action |
| Supabase connections | Supabase Dashboard | Grafico de pool usage |
| Supabase row count | Supabase Dashboard | Tabela com contagem por tabela |
| Storage usage | Supabase Dashboard | GB usados em receipts + documents |
| Deploy frequency | Vercel | Deploys por semana |
| Build time | Vercel | Tempo medio de build |

### 2.4 Dashboard de Growth

**Audiencia:** Growth Lead
**Frequencia:** Diaria

| Metrica | Fonte | Descricao |
|---|---|---|
| Funil de convite | PostHog funnel | sent → opened → signup → accepted |
| Viral coefficient (K) | Calculado: convites aceitos / usuarios ativos | Numero: meta K > 0.5 |
| Time to value | PostHog: signup → primeira acao de valor | Distribuicao em horas |
| Stickiness (DAU/MAU) | PostHog | Ratio + tendencia |
| Engagement score | Composto: acoes por semana por usuario | Score 0-100 |
| Churn prediction | PostHog: grupos com 1 pai inativo 14+ dias | Lista com contagem |
| Reactivation rate | PostHog: `user_reactivated` / `user_churned` | Percentual mensal |
| NPS (futuro) | Survey in-app | Score + distribuicao |

---

## 3. Analise de Coortes

### 3.1 Coortes por Data de Cadastro

Agrupar usuarios por semana de signup e medir retencao:

| Coorte | D1 | D7 | D14 | D30 | D60 | D90 |
|---|---|---|---|---|---|---|
| Sem 1 (Jan) | 80% | 45% | 35% | 25% | 18% | 15% |
| Sem 2 (Jan) | 82% | 48% | 38% | 28% | 20% | — |
| ... | ... | ... | ... | ... | ... | ... |

**Meta:** D30 > 30% (benchmark apps de utilidade familiar)

### 3.2 Coortes por Tipo de Aquisicao

| Tipo | Definicao | Metricas Comparadas |
|---|---|---|
| Organico | `user_signup` com `has_invite: false` | Retencao, time-to-value, engagement |
| Convite | `user_signup` com `has_invite: true` | Retencao, ativacao (espera-se melhor) |
| OAuth (Google) | `oauth_login` com provider=google | Retencao vs email/senha |

**Hipotese:** Usuarios que entram por convite tem retencao 2x maior (ja tem contexto).

### 3.3 Coortes por Aceitacao de Convite

| Segmento | Definicao | Tamanho Esperado |
|---|---|---|
| Ambos pais em < 48h | `invitation_accepted` em ate 48h | 30% dos grupos |
| Ambos pais em 3-7 dias | `invitation_accepted` entre 3 e 7 dias | 25% |
| Somente 1 pai | Convite enviado mas nunca aceito | 40% |
| Sem convite | Grupo sem `invitation_sent` | 5% |

**Analise:** Comparar engagement score e retencao entre os segmentos.

### 3.4 Coortes por Profundidade de Uso

| Nivel | Criterio | Descricao |
|---|---|---|
| L1 - Basico | Calendario apenas | Usa so escala/guarda |
| L2 - Comunicacao | Calendario + Chat + Check-ins | Comunica sobre o dia-a-dia |
| L3 - Gestao | + Decisoes + Despesas | Gerencia a coparentalidade |
| L4 - Power User | + Saude + Atividades + Documentos | Uso completo |

**Hipotese:** Usuarios L3+ tem retencao D30 > 50%.

---

## 4. Analise de Funis

### 4.1 Funil Principal (Onboarding)

```
[User Signup] ──100%──▶ [Create Group] ──85%──▶ [Add Child] ──80%──▶
[Send Invite] ──70%──▶ [Configure Schedule] ──50%──▶ [Onboarding Done] ──40%
```

**Acoes para melhorar drop-offs:**

| Etapa com Drop | Acao | Impacto Esperado |
|---|---|---|
| Signup → Grupo (15% drop) | Wizard guiado com progress bar | +5% |
| Filho → Convite (10% drop) | Botao prominente "Convidar o outro pai" | +5% |
| Convite → Escala (20% drop) | Templates de escala pre-definidos | +10% |
| Escala → Completo (10% drop) | Email de follow-up para 2o pai | +5% |

### 4.2 Funil de Feature Adoption (Saude)

```
[Saude Page View] ──60%──▶ [First Record] ──40%──▶ [3+ Records] ──20%──▶ [Regular User]
```

### 4.3 Funil de Conversao Premium (Futuro)

```
[Feature Gated] ──30%──▶ [Plan Viewed] ──50%──▶ [Upgrade Started] ──55%──▶ [Plan Upgraded]
```

---

## 5. Metricas de Engajamento Compostas

### 5.1 Engagement Score (0-100)

Calculado semanalmente por usuario:

| Acao | Pontos | Max/semana |
|---|---|---|
| Login (dia unico) | 2 | 14 (7 dias) |
| Mensagem enviada | 1 | 10 |
| Check-in registrado | 3 | 15 |
| Despesa registrada | 4 | 8 |
| Decisao criada/votada | 5 | 10 |
| Registro de saude | 3 | 12 |
| Documento uploaded | 2 | 4 |
| Atividade gerenciada | 2 | 6 |
| Troca solicitada/respondida | 4 | 8 |
| Acordo criado/aceito | 5 | 10 |
| **TOTAL MAX** | | **97** |

**Faixas:**
- 0-10: Dormant
- 11-25: Light User
- 26-50: Active
- 51-75: Engaged
- 76+: Power User

### 5.2 Group Health Score (0-100)

| Fator | Peso | Calculo |
|---|---|---|
| Ambos pais ativos na semana | 30% | Binario: 0 ou 30 |
| Mensagens trocadas na semana | 20% | 0-20 baseado em quantidade |
| Decisoes sem conflito | 15% | % aprovadas vs total |
| Despesas em dia | 15% | % aprovadas em < 7 dias |
| Uso de check-in | 10% | Frequencia de check-ins |
| Profundidade de features | 10% | Quantos modulos usados |

---

## 6. Experimentos e Feature Flags

### Configuracao PostHog Feature Flags

| Flag | Tipo | Descricao |
|---|---|---|
| `onboarding-wizard-v2` | A/B | Wizard guiado vs fluxo livre |
| `ai-tone-moderator` | Boolean | Ativar moderador de tom no chat |
| `premium-upsell-timing` | Multivariate | 7d vs 14d vs 30d para mostrar upsell |
| `whatsapp-notifications` | Boolean | Notificacoes via WhatsApp |
| `health-export-pdf` | Boolean | Exportar PDF de saude |

### Fluxo de Experimento

```
1. Definir hipotese e metrica primaria
2. Configurar feature flag no PostHog
3. Calcular sample size (PostHog Experimentation)
4. Rodar por duracao definida
5. Analisar com significancia estatistica (p < 0.05)
6. Ship winner ou iterar
```

---

## 7. Relatorios Automaticos

| Relatorio | Frequencia | Audiencia | Conteudo |
|---|---|---|---|
| Weekly Pulse | Semanal (segunda) | Time inteiro | DAU, signups, retencao, top features |
| Growth Report | Quinzenal | Fundadores | Funis, coortes, K-factor, projecoes |
| Engineering Health | Semanal | Engenharia | Web Vitals, erros, latencia, infra |
| Investor Update | Mensal | Investidores | MAU, MRR, retencao, NPS |
