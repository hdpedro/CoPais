# North Star Metric - Kindar

> Ultima atualizacao: Março 2026

---

## North Star: Semanas Ativas de Coparentalidade (SAC)

### Definicao

> **SAC = Numero de semanas em que AMBOS os pais de uma familia realizaram ao menos 1 acao significativa no Kindar.**

Uma "acao significativa" inclui:
- Fazer check-in
- Enviar mensagem no chat
- Registrar ou aprovar despesa
- Votar em decisao
- Registrar evento de saude (doenca, medicamento, consulta)
- Aceitar ou recusar swap request
- Criar ou editar evento no calendario

Uma "semana" e definida como segunda a domingo (timezone America/Sao_Paulo).

### Exemplo Concreto

| Semana | Carolina | Lucas | SAC? |
|--------|----------|-------|------|
| 1-7 Mar | 5 check-ins, 2 despesas | 3 check-ins, 1 mensagem | Sim |
| 8-14 Mar | 4 check-ins, 1 decisao | 0 acoes | Nao |
| 15-21 Mar | 3 check-ins | 2 check-ins, 1 despesa | Sim |
| 22-28 Mar | 6 check-ins, 3 mensagens | 1 check-in | Sim |

**SAC da familia Oliveira em Março: 3 semanas** (de 4 possiveis)

---

## Por que esta metrica

### O que ela captura

| Dimensao | Como SAC captura |
|----------|-----------------|
| **Engajamento** | Exige uso recorrente (semanal, nao mensal) |
| **Valor bilateral** | Exige AMBOS os pais. Um pai sozinho nao conta. Isso reflete o valor real do produto. |
| **Acao significativa** | Nao conta login passivo. O usuario precisa FAZER algo que gera valor. |
| **Habito** | Medicao semanal reflete formacao de habito (nao pico de uso) |
| **Resultados** | Familias com alto SAC tem demonstravelmente menos conflito (hipotese a validar) |

### O que ela NAO captura (e por que esta ok)

| Dimensao nao capturada | Por que ok |
|------------------------|-----------|
| Qualidade da interacao | Impossivel de medir automaticamente. Proxy: NPS trimestral. |
| Satisfacao da crianca | Fora do escopo do app. Proxy: check-in de humor. |
| Revenue | Revenue e consequencia de SAC alto. Medir separadamente. |
| Crescimento de usuarios | SAC mede profundidade, nao largura. DAU/MAU medem crescimento. |

### Comparacao com alternativas rejeitadas

| Metrica alternativa | Por que rejeitada |
|--------------------|-------------------|
| MAU (Monthly Active Users) | Conta usuarios individuais. Uma mae usando sozinha infla MAU mas nao gera valor. |
| DAU | Muito volatil. Nao reflete valor bilateral. |
| Check-ins por semana | Muito restrito. Ignora outros vetores de valor (financeiro, decisoes). |
| Mensagens enviadas | Mais mensagens != melhor coparentalidade. Pode indicar conflito. |
| Decisoes resolvidas | Muito esporadico. Familias saudaveis decidem pouco via app. |
| Revenue | Lagging indicator. Nao e acionavel para produto. |

---

## Metricas de Input (Leading Indicators)

As metricas de input sao os componentes que alimentam o SAC. Melhorar qualquer uma delas melhora o SAC.

### Arvore de Metricas

```
                    SAC (North Star)
                    /              \
           Engajamento           Ativacao Bilateral
           do Pai A              (ambos usam)
          /    |    \                  |
   Check-ins  Chat  Despesas     Convite aceito
      |        |       |         em < 48h
   Lembretes  Canais  Split       |
   diarios    por     automatico  Onboarding
              crianca             do 2o pai
```

### Tabela de Input Metrics

| Metrica de Input | Definicao | Meta | Impacto no SAC |
|-----------------|-----------|------|:---:|
| **Check-ins semanais por pai** | Media de check-ins por pai por semana | >= 3 | Alto |
| **Taxa de ativacao bilateral** | % de familias onde ambos pais fizeram acao na semana | > 60% | Critico |
| **Convite aceito em < 48h** | % de convites aceitos dentro de 48h | > 50% | Alto |
| **Mensagens por familia/semana** | Media de mensagens no chat por familia por semana | >= 5 | Medio |
| **Despesas registradas/mes** | Media de despesas por familia por mes | >= 4 | Medio |
| **Decisoes criadas/mes** | Media de decisoes por familia por mes | >= 1 | Medio |
| **Eventos de saude/mes** | Registros de saude por familia por mes | >= 2 | Medio |
| **Swaps resolvidos em < 24h** | % de swap requests resolvidos em < 24 horas | > 75% | Alto |
| **D1 retention** | % de usuarios que voltam no dia seguinte ao signup | > 40% | Alto |
| **D7 retention** | % de usuarios que voltam 7 dias apos signup | > 35% | Alto |
| **Push notification open rate** | % de push notifications que resultam em abertura do app | > 15% | Medio |

---

## Metricas Lagging (Resultados de Longo Prazo)

| Metrica Lagging | Definicao | Meta 6 meses | Relacao com SAC |
|----------------|-----------|-------------|-----------------|
| **NPS** | Net Promoter Score (survey trimestral) | > 50 | Familias com SAC > 3/mes tem NPS 2x maior (hipotese) |
| **Churn mensal** | % de familias premium que cancelam | < 5% | SAC < 2/mes = 80% chance de churn (hipotese) |
| **Referral rate** | % de novos signups via indicacao | > 25% | Familias com SAC > 3/mes indicam 3x mais (hipotese) |
| **Revenue per family** | ARPU mensal medio | R$ 3,50 (blended) | Correlacao direta: SAC alto -> upgrade -> revenue |
| **Conflitos escalados** | % de decisoes que precisaram de mediador | < 10% | SAC alto = comunicacao estruturada = menos escalacao |
| **Tempo de resolucao de decisoes** | Media de dias entre criacao e resolucao | < 7 dias | SAC alto = respostas mais rapidas |

---

## Como Medir

### Query SQL para SAC

```sql
-- SAC: Semanas Ativas de Coparentalidade
-- Familia = grupo com pelo menos 2 membros com role 'parent'

WITH weekly_actions AS (
  -- Uniao de todas as acoes significativas
  SELECT group_id, user_id,
    date_trunc('week', created_at AT TIME ZONE 'America/Sao_Paulo') AS week_start
  FROM (
    SELECT group_id, created_by AS user_id, created_at FROM checkins
    UNION ALL
    SELECT group_id, sender_id AS user_id, created_at FROM messages
    UNION ALL
    SELECT group_id, created_by AS user_id, created_at FROM expenses
    UNION ALL
    SELECT group_id, user_id, created_at FROM decision_votes
    UNION ALL
    SELECT group_id, created_by AS user_id, created_at FROM illness_episodes
    UNION ALL
    SELECT group_id, created_by AS user_id, created_at FROM medications
    UNION ALL
    SELECT group_id, created_by AS user_id, created_at FROM appointments
    UNION ALL
    SELECT group_id, created_by AS user_id, created_at FROM custody_events
    WHERE type = 'swap'
  ) all_actions
  GROUP BY group_id, user_id, week_start
),

parent_members AS (
  SELECT group_id, user_id
  FROM group_members
  WHERE role = 'parent'
),

weekly_bilateral AS (
  SELECT
    wa.group_id,
    wa.week_start,
    COUNT(DISTINCT wa.user_id) AS active_parents
  FROM weekly_actions wa
  JOIN parent_members pm ON wa.group_id = pm.group_id AND wa.user_id = pm.user_id
  GROUP BY wa.group_id, wa.week_start
  HAVING COUNT(DISTINCT wa.user_id) >= 2
)

-- SAC total no periodo
SELECT
  COUNT(*) AS total_sac_weeks,
  COUNT(DISTINCT group_id) AS families_with_sac,
  ROUND(COUNT(*)::decimal / COUNT(DISTINCT group_id), 1) AS avg_sac_per_family
FROM weekly_bilateral
WHERE week_start >= NOW() - INTERVAL '30 days';
```

### Dashboard Design

```
+------------------------------------------------------------------+
|  NORTH STAR: SAC                                    Periodo: Mar  |
|  +-----------+  +-----------+  +-----------+  +-----------+      |
|  |   3.200   |  |   68%     |  |   3.1     |  |   +12%    |      |
|  | SAC weeks |  | Bilateral |  | Avg SAC   |  | vs Feb    |      |
|  | (total)   |  | rate      |  | /familia  |  |           |      |
|  +-----------+  +-----------+  +-----------+  +-----------+      |
|                                                                   |
|  SAC Trend (12 semanas)                                          |
|  4.0 |                                          *                |
|  3.0 |                              *     * *                    |
|  2.0 |              *    *    *  *                                |
|  1.0 |    *    *  *                                              |
|  0.0 |___|____|____|____|____|____|____|____|____|____|___|___  |
|       S1   S2   S3   S4   S5   S6   S7   S8   S9  S10  S11 S12  |
|                                                                   |
|  Input Metrics Breakdown                                         |
|  +-------------------+--------+--------+--------+               |
|  | Metric            | Actual | Target | Status |               |
|  +-------------------+--------+--------+--------+               |
|  | Check-ins/pai/sem | 2.8    | 3.0    |  !!    |               |
|  | Bilateral rate    | 68%    | 60%    |  OK    |               |
|  | Mensagens/fam/sem | 4.2    | 5.0    |  !!    |               |
|  | Despesas/fam/mes  | 3.8    | 4.0    |  !!    |               |
|  | Convite < 48h     | 52%    | 50%    |  OK    |               |
|  | D7 retention      | 33%    | 35%    |  !!    |               |
|  +-------------------+--------+--------+--------+               |
|                                                                   |
|  SAC Distribution                                                |
|  +----+                                                          |
|  | 0  | ======== 15% (familias inativas)                        |
|  | 1  | ============ 20%                                         |
|  | 2  | ================ 25%                                     |
|  | 3  | ============== 22%                                       |
|  | 4+ | =========== 18% (power users)                           |
|  +----+                                                          |
+------------------------------------------------------------------+
```

### Implementacao Tecnica

| Componente | Ferramenta | Descricao |
|-----------|-----------|-----------|
| Coleta de eventos | PostHog + Supabase | Cada acao significativa dispara evento PostHog + persiste no Supabase |
| Calculo SAC | Supabase SQL function | View materializada atualizada a cada hora |
| Dashboard interno | Metabase ou Retool | Conectado ao Supabase read-replica |
| Alertas | PostHog + Slack | Alerta se SAC cair > 10% week-over-week |
| Segmentacao | PostHog cohorts | Segmentos: SAC alto (3+), medio (1-2), inativo (0) |

---

## Targets por Periodo

### 3 Meses (Jun 2026)

| Metrica | Target | Racional |
|---------|--------|----------|
| Familias com SAC >= 1/mes | 3.000 | 60% das familias ativas tem ao menos 1 semana bilateral |
| SAC medio por familia | 2.0 | Metade das semanas com atividade bilateral |
| Bilateral rate | > 55% | Mais da metade das familias tem ambos os pais ativos |
| Check-ins/pai/semana | >= 2.5 | Habito inicial formando |

### 6 Meses (Set 2026)

| Metrica | Target | Racional |
|---------|--------|----------|
| Familias com SAC >= 1/mes | 10.000 | Crescimento 3x com WhatsApp + IA |
| SAC medio por familia | 2.8 | IA mediator e push melhorado aumentam engajamento |
| Bilateral rate | > 65% | Onboarding melhorado + WhatsApp notifications resolvem o "segundo pai" |
| Check-ins/pai/semana | >= 3.0 | Habito formado |
| Decisoes resolvidas em < 7d | > 70% | IA ajuda a desbloquear |
| NPS | > 45 | Satisfacao crescente |

### 12 Meses (Mar 2027)

| Metrica | Target | Racional |
|---------|--------|----------|
| Familias com SAC >= 1/mes | 35.000 | Expansao multi-idioma + premium |
| SAC medio por familia | 3.2 | Power users puxam media pra cima |
| Bilateral rate | > 70% | Produto maduro, ambos os pais veem valor |
| Free -> Premium conversion | > 12% | Features premium desbloqueiadas pela jornada |
| ARR | R$ 500k | SAC alto -> retention alta -> revenue |
| Churn mensal premium | < 5% | Familias com SAC alto nao cancelam |

---

## Segmentacao por SAC

| Segmento | SAC/mes | % Estimado | Comportamento | Acao |
|----------|:---:|:---:|-----------|------|
| **Inativo** | 0 | 15% | Nenhum pai usou, ou apenas 1 usou | Reengajamento: WhatsApp, email, push com valor |
| **Esporadico** | 1 | 20% | Ambos usam mas raramente | Nudges: lembretes de check-in, destacar features nao usadas |
| **Regular** | 2 | 25% | Padrao saudavel, quinzenal | Expansao: sugerir convite de avos, features avancadas |
| **Ativo** | 3 | 22% | Uso semanal consistente | Upgrade: mostrar valor premium, pedir NPS e referral |
| **Power User** | 4+ | 18% | Toda semana, multiplas features | Advocacy: early access, beta features, testimonials |

### Acoes por Segmento

**Inativo -> Esporadico** (maior impacto):
- Push semanal: "Joao registrou um check-in sobre Pedro. Veja como ele esta."
- WhatsApp: resumo semanal do que aconteceu (opt-in)
- Email: "Faz X dias que voce nao acessa o Kindar. Pedro teve Y eventos esta semana."

**Esporadico -> Regular** (segundo maior impacto):
- Streak rewards sutis: "2 semanas seguidas de check-in conjunto!"
- Feature discovery: "Voces ja experimentaram as Decisoes Estruturadas?"
- Lembrete contextual: "Amanha e dia de troca. Tudo pronto?"

**Regular -> Ativo** (otimizacao):
- Sugestao de features nao usadas: "Voces registram despesas mas nunca fizeram settlement. Quer fechar o mes?"
- Convite para rede: "Adicione os avos para eles verem o calendario."

**Ativo -> Power User** (advocacy):
- Early access a features novas (IA, albums)
- Convite para programa de referral
- Request de testimonial / review na app store

---

## Correlacoes a Validar

Hipoteses que conectam SAC a outcomes de negocio. Validar com dados apos 3 meses:

| Hipotese | Medicao | Acao se confirmada |
|----------|---------|-------------------|
| SAC >= 3 -> NPS > 60 | Correlacao SAC x NPS response | Focar em mover familias para SAC 3 |
| SAC < 2 por 3 meses -> 70% churn | Correlacao SAC trend x cancelamento | Alerta proativo + oferta de reengajamento |
| SAC alto -> 3x mais referrals | Correlacao SAC x UTM referral | Pedir referral no momento de SAC alto |
| Check-in e o maior driver de SAC | Regressao: qual acao mais impacta SAC | Investir em UX de check-in |
| WhatsApp notification -> +30% SAC | A/B test: com vs sem WhatsApp | Priorizar WhatsApp integration |
| IA mediator -> +20% bilateral rate | A/B test: com vs sem IA | Validar ROI da IA |

---

## Revisao e Governanca

| Frequencia | Acao | Responsavel |
|-----------|------|-------------|
| Diaria | Monitorar SAC no dashboard | Product/Eng |
| Semanal | Review de input metrics vs targets | Product Lead |
| Mensal | Deep dive: SAC por cohort, segmento, feature | Product + Data |
| Trimestral | Revisar se SAC ainda e a North Star correta | CEO + Product Lead |

### Criterios para Mudar a North Star

A SAC deve ser revista se:
1. Atingimos 100k familias e a metrica satura (todos em SAC 4)
2. Descobrimos que SAC nao correlaciona com NPS/revenue (hipotese invalidada)
3. O modelo de negocio muda significativamente (ex: B2B puro)
4. Surge uma metrica que captura melhor o valor bilateral + engajamento

Ate la, SAC e o numero que toda a empresa otimiza.
