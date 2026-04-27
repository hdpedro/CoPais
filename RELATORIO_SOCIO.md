# Kindar — Relatório da nova estratégia de monetização

**De:** Henrique
**Para:** sócio
**Data:** Abril/2026
**Status:** Implementado em código (Fases 1-5) · Pronto para ativar em produção após setup manual (Stripe, Apple, Google, RevenueCat)

---

## TL;DR

Mudamos de "Premium R$29,90 / Elite R$49,90 por usuário" para **um modelo novo com 3 grandes ganchos**:

1. **1 assinatura cobre a família inteira** — só responsáveis legais (pai/mãe) pagam. Avós, advogados, mediadores, babás entram de graça. Isso é **viralidade em forma de produto**: cada família pagante arrasta 3-5 convidados grátis que espalham o app.
2. **Early Bird eterno para os primeiros 1.000** — R$19,90/mês **para sempre**. Cria urgência real + evangelistas nos primeiros 1.000 clientes.
3. **Degustação 7 dias de Premium Jurídico no signup** — o usuário novo já entra usando o teto do produto. Sem cartão, sem fricção. Se não assinar em 7 dias, cai pro grátis limitado.

A receita líquida esperada com 1.000 famílias pagantes gira em **R$19,7k–R$22k/mês**, dependendo do mix PIX vs cartão vs IAP.

---

## 1. Os planos

| Plano | Preço | Para quem | O que desbloqueia |
|-------|-------|-----------|-------------------|
| **Grátis** | R$ 0 | Qualquer pessoa | 1 criança, 30d histórico, calendário básico. Convidados ilimitados (avó, babá, advogado). |
| **Harmonia — Early Bird** 🎯 | R$ 19,90/mês **para sempre** | Primeiros 1.000 | Tudo: crianças ilimitadas, IA, OCR de receita, saúde completa |
| **Harmonia** | R$ 24,90/mês | Após Early Bird esgotar | Mesmas features do Early Bird |
| **Premium Jurídico** | R$ 39,90/mês | Quem tem processo ou precisa de audit trail | Tudo + export legal PDF, backup jurídico, suporte VIP |

**Anuais com 20% off**: R$ 191 (Early Bird), R$ 239 (Harmonia), R$ 383 (Premium Jurídico).

**PIX**: -R$5 de desconto automático via cupom Stripe quando o cliente escolhe PIX no checkout (Harmonia cai pra R$19,90, Jurídico pra R$34,90). Incentiva o método mais barato pra gente (taxa ~1-2% vs ~4% cartão vs 15% IAP).

---

## 2. Mensagem de venda

Mantida consistente em todos os canais (landing, emails, app):

> **"Assine uma vez. Família toda acessa."**
> Co-responsável, avós, babá, advogado, mediador — todos entram grátis. Só responsáveis legais pagam.

Diferencial contra concorrentes (maioria cobra por usuário): oferecemos uma assinatura mais barata **e** mais valiosa porque inclui toda a rede da família.

---

## 3. Fluxos de valor — o que acontece quando

### Fluxo A — Novo usuário (o funil)

```
Download do app
     ↓
Cria conta + primeiro grupo
     ↓
Recebe automaticamente 7 dias de PREMIUM JURÍDICO grátis (trial)
     ↓  (com IA + OCR + tudo ligado)
Dashboard mostra "Quest: complete 5 passos e veja o Kindar funcionando"
     ↓
Passos que disparam o "wow" (add criança → escala → convidar co-responsável
→ foto de receita com IA → pedir acordo pra IA)
     ↓
Dia 5: email "faltam 2 dias"
Dia 6: push "acaba amanhã"
     ↓
Dia 7: trial expira
     ├→ Usuário assinou nesses 7 dias: vira pagante (15-25% conversão esperada)
     └→ Usuário não assinou: cai pro grátis (fica 1 criança, sem IA, sem OCR)
```

**Por que funciona**:
- Trial sem cartão = zero fricção na entrada
- Mostra o teto do produto ("show the ceiling") antes de negociar preço
- Quest de 5 passos correlaciona com conversão (hipótese testável: quem completa ≥3 passos converte 3×)

### Fluxo B — Assinatura e split

```
Pai A decide assinar Harmonia
     ↓
Checkout Stripe (card ou PIX, opcional cupom promocional)
     ↓
Stripe cobra R$24,90 (ou R$19,90 se PIX ou Early Bird)
     ↓
Webhook chega no Kindar:
  - Grava assinatura no banco (per-group, cobre toda a família)
  - Dispara email de boas-vindas ("Bem-vindo ao Harmonia")
  - Se for Early Bird, decrementa contador (1000 → 999 → 998...)
     ↓
Na página /assinatura aparece botão "Dividir custo com co-responsável"
     ↓
Pai A seleciona Pai B (outra parent do grupo) + slider 50%
     ↓
Sistema cria despesa recorrente R$12,45 no módulo Despesas para Pai B
Pai B recebe notificação push + mensagem no chat
     ↓
Todo mês, renovação Stripe cria automaticamente nova despesa split
     ↓
Pai B acerta a dívida via PIX/transferência — zera pelo módulo Despesas
```

**Por que é brilhante (frase sua)**: o módulo de Despesas **já existe**. Zero código novo de billing. Estamos usando uma feature nossa para resolver a briga "quem paga a assinatura".

### Fluxo C — Cancelamento e churn

```
Cartão falha ou usuário cancela
     ↓
Webhook Stripe (ou RevenueCat) avisa
     ↓
Status vira 'past_due' (cartão falhou) ou 'canceled' (usuário cancelou)
     ↓
Se past_due: Stripe tenta de novo automaticamente (Smart Retries)
Se canceled: usuário mantém acesso até current_period_end
     ↓
D-3 (3 dias antes da renovação): email + push transparente
"Sua assinatura renova em 3 dias por R$24,90. Gerenciar →"
     ↓
Dia da expiração: status vira 'canceled', features premium caem
     ↓
Família mantém acesso GRÁTIS (convidados continuam) —
pai/mãe perdem IA, OCR, saúde completa
```

**Por que mandamos o aviso D-3**: reduz "churn surpresa" ("achei que era trial!"). Apple e Google já mandam o aviso deles próprios — o D-3 é só para quem assinou via Stripe no PWA.

### Fluxo D — Multi-plataforma

```
Pai A assina via PWA (Stripe card, R$24,90)
     ↓
Stripe webhook → banco Supabase atualiza subscription
     ↓
Pai A abre app iOS → features premium funcionam instantaneamente
  (o app consulta /api/billing/status, banco é fonte única de verdade)
     ↓
Pai B (mesma família, outro celular) abre Android →
  vê o plano ativo, não vê botão de "assinar" (pagador é Pai A)
     ↓
Avó abre o app → acessa tudo que Pai A paga, não vê nada de billing
```

Todas as 3 plataformas (PWA, iOS nativo, Android nativo) consultam o mesmo endpoint `/api/billing/status`. O banco Supabase é **a** fonte da verdade — nenhum cliente decide sozinho.

---

## 4. Projeção financeira

### 4.1. Premissas realistas

- Meta: **1.000 famílias pagantes** em 12-18 meses
- Mix esperado após 6 meses: 50% Early Bird + 45% Harmonia regular + 5% Premium Jurídico
- Split entre canais: 40% Stripe card + 30% PIX + 20% Apple IAP + 10% Google IAP
- Conversão trial → pago: **15%** (conservador)
- Churn mensal: **3%** (alto para pais que pararam de precisar; baixo para o resto)

### 4.2. Cenário realista — 1.000 assinantes estáveis

| Fonte | Qtd | Preço médio | Receita bruta |
|-------|-----|-------------|---------------|
| Early Bird (R$19,90) | 500 | R$19,90 | R$ 9.950 |
| Harmonia (R$24,90) | 450 | R$24,90 | R$ 11.205 |
| Premium Jurídico (R$39,90) | 50 | R$39,90 | R$ 1.995 |
| **Total bruto** | **1.000** | — | **R$ 23.150** |

**Taxas das lojas** (desconto da receita bruta):
| Canal | % do volume | Taxa | Custo |
|-------|-------------|------|-------|
| Stripe card | 40% | 4% | R$370 |
| PIX | 30% | 1,5% | R$104 |
| Apple IAP | 20% | 15% | R$694 |
| Google IAP | 10% | 15% | R$347 |
| **Total taxas** | | **~6,5%** | **R$ 1.515** |

**Resultado líquido: ~R$ 21.635/mês** de receita recorrente (MRR).

**ARR projetado** (anualizando): **R$ 259,6k/ano**.

### 4.3. Cenário otimista — Early Bird vira hype, 60% via PIX

- 600 Early Bird × R$19,90 = R$11.940
- 350 Harmonia × R$24,90 = R$8.715
- 50 Premium Jurídico × R$39,90 = R$1.995
- Total bruto: R$22.650
- Mix PIX 60% / card 20% / IAP 20%: taxa média ~5% = R$1.132
- **Líquido: ~R$21.517/mês**

### 4.4. Cenário conservador — PIX não decola, maioria via IAP

- 500 Early Bird + 500 Harmonia = R$22.400
- 50% Apple + 30% Google + 20% Stripe card: taxa ~12,6% = R$2.822
- **Líquido: ~R$19.577/mês**

### 4.5. "Custo" do Early Bird — investimento em aquisição

Se os 1.000 primeiros fossem Harmonia normal a R$24,90 em vez de Early Bird a R$19,90:
- Receita bruta seria R$24.900 em vez de R$23.150
- **Diferença: R$1.750/mês permanente (R$21k/ano)**

Esse é o **CAC embutido no produto**. Só vale a pena se o Early Bird gerar pelo menos 10-20% a mais de volume pela urgência (counter ao vivo "restam X/1000") + efeito word-of-mouth dos 1.000 "founding members". Tudo indica que vale — é estratégia validada em muitas startups SaaS.

---

## 5. Growth loops embutidos

Três mecanismos que devem puxar novos usuários sem custo de marketing:

### 5.1. Convidados grátis infinitos

Cada família paga 1 assinatura. Essa família convida em média:
- 1 co-responsável (outro pai/mãe)
- 2 avós
- 1 cuidador/babá
- Eventualmente: mediador, advogado

**6 contas por 1 pagante**. Cada convidado que vê o Kindar funcionando vira um lead warm. Quando um deles se separar, ou tiver filhos, ou trocar de família, já conhece o app.

### 5.2. Early Bird evangelistas

Os primeiros 1.000 vão contar pra amigos:
> "Eu paguei R$19,90, foi nos primeiros 1.000. Agora subiu pra R$24,90. Mas vale demais, testa."

Isso é **prova social + preço ancorado**. Gera volume orgânico nos primeiros 6 meses.

### 5.3. Split como viralidade

Quando Pai A ativa o split, Pai B entra no módulo de Despesas e **vê a assinatura sendo cobrada**. Se estava pensando em assinar por conta própria, agora vê que a família já tem o plano — não duplica.

Mais importante: se Pai B tem um **segundo grupo familiar** (família recomposta, novo filho com novo parceiro), leva o Kindar para esse grupo também.

---

## 6. Funcionalidades que foram implementadas (o código existe, falta só ativar)

### 6.1. Core de billing
- [x] Assinatura por grupo (não por usuário)
- [x] Só responsáveis legais (role=parent) podem pagar
- [x] Avós, advogados, mediadores, babás sempre de graça
- [x] Fonte única de verdade cross-platform (`/api/billing/status`)

### 6.2. Early Bird
- [x] 1.000 vagas garantidas via trigger Postgres (anti-oversell)
- [x] Counter ao vivo na landing e pricing (cache 30s)
- [x] Preço travado para sempre nos grandfathered

### 6.3. Trial de 7 dias (degustação)
- [x] Automático no primeiro signup (sem cartão)
- [x] Premium Jurídico (maior tier) por 7 dias
- [x] Email no D-5, push no D-6
- [x] Cron diário expira e avisa

### 6.4. Onboarding Quest
- [x] 5 passos que passam pelas features premium
- [x] Widget no dashboard com progress bar
- [x] Tracking automático em todas as actions relevantes

### 6.5. Split automático
- [x] Um clique para dividir com co-responsável
- [x] Cria despesa recorrente no módulo Despesas
- [x] Renovação mensal dispara nova despesa automaticamente
- [x] Notificação push + mensagem no chat para o co

### 6.6. PIX + desconto
- [x] Toggle PIX/Cartão na UI
- [x] -R$5 via cupom Stripe
- [x] Tracking do método escolhido (reports)

### 6.7. Nativo iOS e Android
- [x] RevenueCat integrado (abstrai StoreKit + Google Billing)
- [x] Webhook RevenueCat reconcilia com Supabase
- [x] Tela `/assinatura` nativa com restore purchase (requisito Apple)
- [x] Deep link para Apple/Google manage subscription

### 6.8. Admin interno
- [x] `/admin/metrics` — MRR, conversão, Early Bird, churn, quest
- [x] `/admin/coupons` — criar/desativar cupons com sync Stripe automático
- [x] Controle de acesso via ADMIN_EMAILS (env var)

### 6.9. Cupons promocionais
- [x] Admin cria no painel interno → sincroniza com Stripe
- [x] Usuário digita no `/assinatura` → valida + aplica no checkout
- [x] Tracking de redemptions para analytics

### 6.10. Emails automáticos
- [x] Signup → welcome
- [x] Trial D-5 → ending soon
- [x] Trial D-7 → expired
- [x] Compra concluída → subscription welcome
- [x] Renovação D-3 → transparente

### 6.11. Customer Portal Stripe
- [x] Link "Gerenciar cartão · cancelar · notas fiscais" em `/assinatura`

---

## 7. O que precisa ser manual (para ativar em produção)

Não é código — são setups em contas externas. Tudo está documentado passo-a-passo em `MANUAL_OPERACIONAL.md` no repositório.

| Onde | O que | Tempo |
|------|-------|-------|
| Supabase | Rodar 6 migrations (00054-00060) | 10 min |
| Vercel | Setar env vars (STRIPE_*, REVENUECAT_*, ADMIN_EMAILS, CRON_SECRET) | 15 min |
| Stripe | Criar 6 produtos + 6 preços | 30 min |
| Stripe | Configurar webhook (eventos: checkout, subscription, invoice) | 10 min |
| Stripe | Criar cupom PIX_5_FOREVER (R$5 off) | 5 min |
| Stripe | Pedir acesso ao PIX Automático (beta, 2-7 dias de aprovação) | 5 min ativo + espera |
| Stripe | Habilitar Customer Portal com branding Kindar | 10 min |
| Apple | Criar 6 produtos IAP em App Store Connect | 30 min |
| Google | Criar 6 subscriptions em Play Console | 30 min |
| RevenueCat | Criar projeto, conectar iOS + Android, criar entitlement + offering | 30 min |
| RevenueCat | Configurar webhook apontando para `/api/revenuecat/webhook` | 5 min |
| EAS | Build + submit iOS e Android com nova tela `/assinatura` | Build 30 min + Apple review 24-48h + Google review ~4h |

**Total trabalho ativo**: ~3-4 horas espalhadas.
**Gargalo real**: review da Apple (24-48h) + aprovação PIX Automático (2-7 dias).

---

## 8. Métricas que vamos monitorar

Todas automáticas via PostHog + painel `/admin/metrics`:

| Métrica | Target inicial | Alerta se |
|---------|----------------|-----------|
| Trial → pago | ≥15% | < 10% |
| Conversão grátis → pago (sem trial) | ≥8% | < 5% |
| Early Bird esgotar em | 6-12 meses | < 1 mês (preço pode estar baixo demais) ou > 18 meses (produto/marketing fraco) |
| Adoção PIX | ≥30% após 60d | < 15% |
| Split ativado (grupos 2+ pais) | ≥40% | < 20% |
| Churn mensal | ≤3% | > 6% |
| Quest 5/5 completos | ≥25% em 7d | < 10% |

---

## 9. Riscos e mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Early Bird esgotar rápido demais (ex: em 2 semanas) | Urgência vira frustração; pessoas não conseguem aproveitar | Subir limite para 2.000 se esgotar em < 3 meses |
| PIX Automático não for aprovado pela Stripe | Não conseguimos cobrar mensal via PIX, só pagamento único | Fallback: aceitar PIX só para plano anual (cobrança única) |
| Apple rejeitar o app por copy de "dividir com co-responsável" | Atraso no lançamento iOS | Retirar screenshot do split, publicar primeiro com core subscription |
| Trial de 7 dias gerar muito uso de IA grátis (custo) | R$300-500/mês extra em API de IA | Rate limit por user durante trial: 50 mensagens IA / 5 OCRs máx |
| Cupom ser compartilhado em redes sociais e explodir | Perda de margem se desconto alto | Sempre usar `max_redemptions` quando criar cupom público |

---

## 10. Cronograma recomendado

| Semana | Ação |
|--------|------|
| **1** | Rodar migrations · configurar Stripe · criar produtos Apple e Google · configurar RevenueCat |
| **2** | Ativar landing Early Bird · lançar PWA em produção com novo pricing · submeter build iOS com `/assinatura` |
| **3** | Review Apple aprova · ativar iOS · esperar aprovação PIX Automático em paralelo |
| **4** | Primeiros 100 clientes — medir conversão trial→pago, onde Early Bird counter está |
| **5-8** | Iterar onboarding quest baseado em dados · testar primeiros cupons de parceria (ex: pediatras) |
| **Mês 3** | Avaliar se Early Bird precisa expandir pra 2.000 · decidir se sobe preço base de R$24,90 pra R$29,90 |

---

## 11. Decisões em aberto pra discutirmos

1. **Limite do Early Bird**: vai de 1.000 ou expande se esgotar rápido?
2. **Qual app store atacar primeiro**: iOS (padrão brasileiro é Android, mas iOS gasta mais) ou ambos juntos?
3. **Parceiros iniciais para cupons**: psicólogos infantis? Advogados de família? Pediatras? Define 2-3 primeiros pra criar cupons customizados.
4. **Preço do Premium Jurídico**: R$39,90 está OK? Ou é cedo demais e deixamos só Harmonia no lançamento, lanço Premium Jurídico depois?
5. **Idiomas**: lançamos já em inglês, espanhol, francês e alemão também? (código suporta). Mercado brasileiro primeiro e expande?

---

## 12. Anexo — Arquivos técnicos no repositório

Quem quiser o detalhe técnico, os docs completos estão em:

- `MONETIZACAO.md` — estratégia completa, plan IDs, features por tier, fases implementadas
- `MANUAL_OPERACIONAL.md` — passo-a-passo de setup em Stripe, Apple, Google, RevenueCat (13 seções, 14.6 de validação)
- Schema: 6 migrations novas (00054-00060)
- Código: módulo `src/lib/billing/` + webhooks + crons + painel admin + UI nativa iOS/Android
- Testes: 315 automatizados passando

---

*Gerado em Abril/2026 após implementação completa das Fases 1-5. Pronto para revisão em conjunto e próximos passos.*
