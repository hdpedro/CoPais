# Kindar — Estratégia de Monetização

> Documento corrigido e validado. Versão realista para tomada de decisão.

---

## 1. TAXAS DAS LOJAS (o "pedágio")

| Loja | Taxa padrão | Taxa p/ startup (<US$1M/ano) | Assinatura após 1 ano |
|------|------------|-------------------------------|----------------------|
| **Apple** | 30% | **15%** (Small Business Program) | 15% |
| **Google** | 30% | **15%** (baseline seguro) | 15% |

> ⚠️ Google 10% existe em casos específicos (parcerias, media). **Use 15% como base segura para projeções.**

---

## 2. SOBRE O CADE / APPLE NO BRASIL

### O que está acontecendo:
- A Apple está sendo pressionada pelo CADE e por decisões globais
- Flexibilizações estão em andamento
- Acordo prevê possibilidade de pagamentos externos e lojas alternativas

### ⚠️ O que NÃO assumir:
- ❌ NÃO é totalmente livre colocar pagamento externo sem regras
- ❌ Pode haver comissão residual (3% a 27%)
- ❌ Restrições de UX podem ser impostas pela Apple
- ❌ Necessidade de entitlement/aprovação da Apple

### ✅ Como tratar no planejamento:
> "Possibilidade emergente de pagamentos externos no iOS, sujeita a regras e aprovação da Apple. Considerar como oportunidade futura, não como garantia."

**Na prática:** Planejar com IAP (15%) como cenário base. Se a abertura se confirmar, será um bônus de margem.

---

## 3. PIX AUTOMÁTICO — Realidade vs Hype

### ✅ O que é verdade:
- Taxa baixa (~1-2%) ✅
- Alta penetração no Brasil ✅
- Sem chargeback ✅
- Fit perfeito para app de famílias (rotina, previsibilidade) ✅
- Atinge brasileiros sem cartão de crédito ✅

### ⚠️ O que NÃO usar como projeção:
- ❌ "Crescimento de 41% ao mês" — dado de early stage, não sustentável
- ❌ Não usar como base de projeção financeira

### ✅ Como usar:
> PIX Automático é **arma competitiva real**, mas projetar receita com base em taxas de cartão/IAP (cenário conservador).

---

## 4. CONVERSÃO DE TRIAL — Expectativas Realistas

### ❌ O que eu disse antes (otimista demais):
- "Trial de 7 dias = 40% de conversão"

### ✅ Realidade de mercado:
| Faixa | Conversão |
|-------|-----------|
| Comum | 5% - 15% |
| Excelente | 15% - 20% |
| Excepcional | 20% - 30% |
| Top 1% (produto muito validado) | 30%+ |

### ✅ Para o Kindar, esperar:
> **10% - 20% no início.** Melhorar com iterações de produto e onboarding.

### Sobre "trial sem cartão":
- ✅ Melhor para Brasil (muitos sem cartão)
- ⚠️ iOS pode exigir método de pagamento via IAP
- ⚠️ Conversão pode ser menor vs trial com cartão
- 📌 **Precisa ser testado, não assumido**

---

## 5. ESTRATÉGIA CORRIGIDA — 3 Fases

### 🔹 Fase 1 — Lançamento (validação de produto)

**Apenas o essencial:**
- Apple IAP
- Google IAP
- RevenueCat (grátis até US$ 2.500/mês)

**Por que apenas isso:**
- Menos fricção para aprovação nas lojas
- Mais rápido para ir ao ar
- Foco em validar o produto, não em otimizar margem
- RevenueCat resolve cross-platform + analytics

**Preço:** R$ 19,90/mês (entrada)

---

### 🔹 Fase 2 — Otimização (após PMF validado)

**Adiciona:**
- Stripe Brasil (web checkout)
- PIX como opção de pagamento
- Landing page externa com checkout

**Estratégia:**
- Usuário entra no app → vê valor → faz upgrade
- Direciona para web para pagamento (Stripe/PIX = taxa menor)
- Mantém IAP como opção de conveniência

**Preço:** R$ 24,90/mês (ajuste após validação)

---

### 🔹 Fase 3 — Otimização agressiva de margem

**Incentiva PIX:**
- Desconto para quem paga via PIX (ex: R$ 24,90 → R$ 19,90)
- Benefícios extras para assinantes PIX
- PIX Automático para recorrência

**Explora CADE (se confirmado):**
- Botão de pagamento externo no iOS
- Redução de dependência das lojas

**Preço:** R$ 24,90 - R$ 29,90/mês (segmentado)

> 💡 **O jogo:** trocar margem por conversão inteligente. Desconto no PIX custa menos que a taxa da Apple.

---

## 6. ARQUITETURA FINAL

```
App (UX)
    ↓
RevenueCat (gestão de assinaturas)
    ↓
─────────────────────────────────
IAP (Apple/Google)  → conveniência (15%)
Stripe (PIX/Web)    → margem (1-4%)
─────────────────────────────────
```

---

## 7. PROJEÇÕES CONSERVADORAS

### Com 1.000 famílias pagantes a R$ 19,90/mês:

| Cenário | Mix | Receita bruta | Taxa média | Receita líquida |
|---------|-----|--------------|-----------|-----------------|
| Conservador | 100% IAP | R$ 19.900 | 15% | **R$ 16.915** |
| Realista | 60% IAP + 40% PIX | R$ 19.900 | ~10% | **R$ 17.910** |
| Otimista | 30% IAP + 70% PIX | R$ 19.900 | ~6% | **R$ 18.706** |

### Conversão de trial (cenário realista):

| Métrica | Conservador | Realista | Otimista |
|---------|------------|---------|----------|
| Downloads/mês | 1.000 | 1.000 | 1.000 |
| Ativam trial | 30% = 300 | 40% = 400 | 50% = 500 |
| Convertem p/ pago | 10% = 30 | 15% = 60 | 20% = 100 |
| **Novos pagantes/mês** | **30** | **60** | **100** |

> Para chegar a 1.000 pagantes no cenário realista: ~17 meses.

---

## 8. PREÇO RECOMENDADO

| Faixa | Valor | Quando |
|-------|-------|--------|
| Entrada | **R$ 19,90/mês** | Lançamento |
| Padrão | **R$ 24,90/mês** | Após validação |
| Premium | **R$ 29,90/mês** | Com features diferenciadas |

> 👉 **Começa em R$ 19,90. Sobe depois.** Prioridade é base de usuários.

### Anual com desconto:
- R$ 19,90/mês → R$ 189,90/ano (equivale a R$ 15,83/mês — 20% off)
- Incentiva retenção e previsibilidade de receita

---

## 9. VISÃO DE FUTURO — Por que o Kindar pode ser grande

### A vantagem absurda do Kindar:
> **Problema recorrente + emocional + obrigatório**

Pais separados PRECISAM se comunicar sobre os filhos. Não é opcional. Isso gera:
- Retenção altíssima (churn baixo)
- Uso diário/semanal garantido
- Disposição a pagar por algo que reduz conflito

### Evolução possível:

| Fase | Modelo | Receita adicional |
|------|--------|------------------|
| Atual | SaaS (assinatura) | Core business |
| Futura | Marketplace de serviços (advogados, mediadores) | Comissão por conexão |
| Futura | Fintech leve (split de despesas, pensão) | Taxa sobre transações |
| Futura | Jurídico (acordos digitais com validade legal) | Parceria com escritórios |

> 💰 **SaaS + Fintech leve** é onde está o dinheiro de verdade.

---

## 10. RESUMO EXECUTIVO

| Item | Decisão |
|------|---------|
| **Preço inicial** | R$ 19,90/mês |
| **Modelo** | Freemium + Trial 7 dias |
| **Pagamento Fase 1** | IAP (Apple/Google) via RevenueCat |
| **Pagamento Fase 2** | + Stripe/PIX (web) |
| **Pagamento Fase 3** | + PIX Automático + incentivos |
| **Conversão esperada** | 10-20% (realista) |
| **Meta 1.000 pagantes** | 12-18 meses |
| **Custo infra até lá** | R$ 0 - R$ 250/mês |
| **Taxa média sobre receita** | 10-15% |

---

*Documento atualizado em: Março/2026*
*Validado com análise de mercado real*
