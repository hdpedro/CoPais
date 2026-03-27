# Plano de Experimentos A/B — Kindar

> Framework para rodar, analisar e shipar experimentos.
> Todos os testes usam PostHog Feature Flags + Experimentation.

---

## 1. Framework de Experimentacao

### Processo em 6 Etapas

```
1. HIPOTESE → Definir o que acreditamos e por que
2. DESIGN → Metrica primaria, variantes, sample size, duracao
3. IMPLEMENTAR → Feature flag + instrumentacao de eventos
4. RODAR → Monitorar guardrails e sanity checks
5. ANALISAR → Significancia estatistica (p < 0.05, poder > 80%)
6. DECIDIR → Ship winner, iterar, ou descartar
```

### Template de Hipotese

```
Acreditamos que [MUDANCA]
para [SEGMENTO DE USUARIOS]
resultara em [RESULTADO MENSURAVEL]
porque [RAZAO/INSIGHT].
Mediremos isso por [METRICA PRIMARIA]
com meta de [X% de melhoria].
```

### Guardrails

Para cada experimento, definir metricas que NAO devem piorar:
- Tempo de carregamento da pagina (LCP < 2.5s)
- Taxa de erro nas Server Actions (< 2%)
- Satisfacao geral (NPS nao cair)

---

## 2. Experimento 1: Fluxo de Onboarding

### Contexto
Atualmente o onboarding e livre: usuario cria conta, cria grupo, adiciona filho, e precisa descobrir que deve configurar a escala. Drop-off de 60% entre signup e onboarding completo.

### Hipotese
```
Acreditamos que um wizard guiado de 5 etapas com progress bar
para novos usuarios que acabaram de criar conta
resultara em aumento de 15% na taxa de onboarding completo
porque reduz a carga cognitiva e deixa claro o proximo passo.
```

### Design

| Item | Controle (A) | Variante (B) |
|---|---|---|
| Fluxo | Paginas separadas, navegacao livre | Wizard com steps 1-5 e progress bar |
| Etapas | Mesmas paginas em rotas distintas | Step 1: Grupo, 2: Filho, 3: Convite, 4: Escala, 5: Tour |
| Progresso | Nenhum indicador | Barra de progresso "Etapa 2 de 5" |
| Skip | Pode ignorar etapas | Pode pular (botao secundario), mas tooltip incentiva |
| Feature flag | `onboarding-wizard-v2` | |

| Parametro | Valor |
|---|---|
| Metrica primaria | Onboarding completion rate (5 etapas em 7 dias) |
| Metricas secundarias | Time to completion, D7 retention, invite sent rate |
| Guardrails | Signup drop-off nao aumentar, LCP da pagina |
| Sample size | 400 usuarios por variante (800 total) |
| Duracao minima | 4 semanas |
| Significancia | p < 0.05, poder 80% |
| Segmento | Novos usuarios (signup apos ativacao do teste) |

### Criterio de Sucesso
- WIN: Completion rate >= 55% (vs baseline 40%) = +15pp
- SHIP: Se win, implementar wizard como default
- ITERAR: Se melhoria < 10pp mas positiva, otimizar steps individuais

---

## 3. Experimento 2: Urgencia de Notificacao para Decisoes

### Contexto
Decisoes criadas levam em media 72h para resolucao. 30% expiram sem todos votarem. Notificacao push atual e generica.

### Hipotese
```
Acreditamos que adicionar urgencia visual e canal alternativo (WhatsApp)
para membros do grupo quando uma decisao e criada
resultara em reducao de 40% no tempo ate resolucao
porque reduz a friccao de abrir o app e cria senso de urgencia.
```

### Design

| Variante | Descricao |
|---|---|
| A (Controle) | Push notification padrao: "Nova Decisao: {titulo}" |
| B (Push urgente) | Push com badge vermelho + reminder apos 24h se nao votou |
| C (WhatsApp) | Push + mensagem WhatsApp via API (Twilio/Meta Business) |
| D (Ambos) | Push urgente + WhatsApp |

| Parametro | Valor |
|---|---|
| Metrica primaria | Tempo mediano ate resolucao (todas as votacoes concluidas) |
| Metricas secundarias | Taxa de resolucao (% decisoes resolvidas antes de expirar), engajamento com argumentos |
| Guardrails | Opt-out de notificacoes nao aumentar, NPS |
| Sample size | 200 grupos por variante (800 total) |
| Duracao minima | 6 semanas |
| Feature flag | `decision-notification-urgency` (multivariate) |

### Criterio de Sucesso
- WIN: Tempo mediano < 36h (vs baseline 72h) para qualquer variante
- BONUS: Taxa de resolucao > 85% (vs baseline 70%)

---

## 4. Experimento 3: Timing do Upsell Premium

### Contexto
Ainda nao lancamos premium, entao precisamos testar quando apresentar a oferta para maximizar conversao sem prejudicar retencao free.

### Hipotese
```
Acreditamos que apresentar o upsell apos 14 dias de uso ativo
para usuarios que ja atingiram o "aha moment" (ambos pais ativos)
resultara na melhor taxa de conversao
porque o usuario ja entende o valor e quer mais.
```

### Design

| Variante | Timing | Trigger |
|---|---|---|
| A | 7 dias apos signup | Qualquer usuario com 7+ dias |
| B | 14 dias apos signup | Somente usuarios com `both_parents_active` |
| C | 30 dias apos signup | Somente usuarios com engagement score > 25 |
| D | Feature-gated (sob demanda) | Somente quando tenta usar feature premium |

| Parametro | Valor |
|---|---|
| Metrica primaria | Free-to-paid conversion rate (30 dias apos ver upsell) |
| Metricas secundarias | Time to conversion, churn do plano free (ver upsell e desistir), ARPU |
| Guardrails | D30 retention do plano free nao cair > 3pp |
| Sample size | 300 usuarios por variante (1.200 total) |
| Duracao minima | 8 semanas |
| Feature flag | `premium-upsell-timing` (multivariate) |

### Criterio de Sucesso
- WIN: Conversao > 5% sem queda de retencao free
- OPTIMAL: Variante com melhor LTV (conversao x retencao premium)

---

## 5. Experimento 4: Moderacao de Tom no Chat

### Contexto
O Kindar ja possui `tone-moderator.ts` que analisa o tom das mensagens. Precisa testar se o aviso de tom agressivo reduz conflitos ou se irrita os usuarios.

### Hipotese
```
Acreditamos que mostrar um alerta suave quando detectamos tom agressivo
para usuarios que estao digitando mensagens no chat
resultara em reducao de 20% em mensagens com tom negativo
porque o alerta cria um momento de reflexao antes de enviar.
```

### Design

| Variante | Descricao |
|---|---|
| A (Controle) | Sem moderacao de tom |
| B (Alerta suave) | Banner amarelo: "Sua mensagem parece ter tom agressivo. Deseja revisar?" com botoes "Revisar" e "Enviar assim mesmo" |
| C (Reescrita AI) | Mesmo alerta + sugestao de reescrita com tom neutro gerada por AI |

| Parametro | Valor |
|---|---|
| Metrica primaria | % de mensagens com tom negativo (classificadas pelo moderador) |
| Metricas secundarias | Mensagens enviadas/dia (nao deve cair), % que clica "Revisar" vs "Enviar assim mesmo", satisfacao com chat (survey) |
| Guardrails | Volume de mensagens nao cair > 10%, NPS |
| Sample size | 200 grupos por variante (600 total) |
| Duracao minima | 6 semanas |
| Feature flag | `chat-tone-moderator` (multivariate) |

### Metricas de Moderacao

| Metrica | Definicao |
|---|---|
| `tone_warning_shown` | Alerta exibido |
| `tone_warning_revised` | Usuario clicou "Revisar" |
| `tone_warning_dismissed` | Usuario clicou "Enviar assim mesmo" |
| `tone_rewrite_accepted` | Usuario aceitou sugestao AI |
| `tone_rewrite_edited` | Usuario editou sugestao AI |

### Criterio de Sucesso
- WIN: Reducao >= 20% em mensagens negativas sem queda de volume
- BONUS: > 40% dos alertas resultam em revisao
- FAIL: Volume de mensagens cai > 10% (moderacao inibidora)

---

## 6. Backlog de Experimentos Futuros

| # | Nome | Hipotese Resumida | Metrica Primaria | Prioridade |
|---|---|---|---|---|
| 5 | Templates de escala | Oferecer 3 templates populares (alternada, 5-2-2-5, 7-7) | Schedule configuration rate | Alta |
| 6 | Gamificacao de check-in | Streak de dias consecutivos com check-in | Check-in frequency | Media |
| 7 | Email de reativacao | Email personalizado para usuarios inativos 14d | Reactivation rate | Alta |
| 8 | Onboarding video | Video de 60s explicando o app vs texto | Onboarding completion | Media |
| 9 | Share button (calendario) | Compartilhar calendario da semana via WhatsApp | Invite acceptance rate | Alta |
| 10 | Dark mode default | Dark mode auto baseado no OS | Session duration | Baixa |
| 11 | Simplificar despesas | Fluxo de 1 tela vs multiplas etapas | Expense creation rate | Media |
| 12 | AI summary semanal | Resumo semanal por AI (saude, financeiro, calendario) | Email open rate + DAU | Alta |

---

## 7. Calculo de Sample Size

### Formula

Para teste A/B com proporcoes:

```
n = (Z_alpha/2 + Z_beta)^2 * (p1(1-p1) + p2(1-p2)) / (p2 - p1)^2
```

### Tabela de Referencia Rapida

| Baseline | Efeito Minimo Detectavel | Sample por Variante | Total (2 variantes) |
|---|---|---|---|
| 40% | +10pp (50%) | 385 | 770 |
| 40% | +15pp (55%) | 175 | 350 |
| 5% | +2pp (7%) | 2.400 | 4.800 |
| 5% | +3pp (8%) | 1.100 | 2.200 |
| 25% | +5pp (30%) | 1.000 | 2.000 |
| 25% | +10pp (35%) | 265 | 530 |

**Nota:** Com alpha=0.05 e power=0.80 (padrao).

### Duracao Estimada

```
Duracao (semanas) = Sample Total / (Signups por semana * % elegivel)
```

Exemplo: 800 usuarios necessarios, 100 signups/semana, 80% elegiveis:
```
800 / (100 * 0.8) = 10 semanas
```

---

## 8. Governanca de Experimentos

### Regras

1. **Maximo 3 experimentos simultaneos** — evitar interacao entre testes
2. **Nao sobrepor segmentos** — cada usuario participa de no maximo 1 teste
3. **Guardrails obrigatorios** — todo teste deve definir metricas que nao podem piorar
4. **Review semanal** — check dos dados toda sexta (parar cedo se guardrails quebrarem)
5. **Documentacao** — todo experimento deve ter documento com hipotese, design, e resultado

### Priorizacao (ICE Score)

| Criterio | Peso | Escala |
|---|---|---|
| Impact (impacto na North Star) | 40% | 1-10 |
| Confidence (confianca no resultado) | 30% | 1-10 |
| Ease (facilidade de implementar) | 30% | 1-10 |

**Score = (Impact * 0.4) + (Confidence * 0.3) + (Ease * 0.3)**

| Experimento | Impact | Confidence | Ease | ICE Score | Prioridade |
|---|---|---|---|---|---|
| 1. Onboarding wizard | 9 | 7 | 6 | 7.5 | 1o |
| 3. Upsell timing | 8 | 5 | 7 | 6.8 | 2o |
| 2. Notificacao decisoes | 7 | 6 | 5 | 6.1 | 3o |
| 4. Moderacao de tom | 6 | 4 | 4 | 4.8 | 4o |
