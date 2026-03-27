# Estrategia de Pricing — Kindar

> Analise de sensibilidade, comparativo de mercado e estrategia de conversao.

---

## 1. Analise de Sensibilidade — Mercado Brasileiro

### 1.1 Contexto Economico

| Fator | Dado | Impacto no Pricing |
|---|---|---|
| Renda media familiar BR (2025) | ~R$ 3.200/mes | Limite de R$ 50/mes para SaaS pessoal |
| % divorcios crescentes | +12% ao ano | Mercado em expansao |
| Penetracao smartphone | 87% da populacao | Acessibilidade mobile-first |
| Adocao de Pix | 85% dos adultos | Facilita pagamento recorrente |
| Cultura de WhatsApp | 99% dos smartphones | WhatsApp notifications como differentiator |
| Classe C dominante | 53% da populacao | Sensivel a preco, precisa de free robusto |

### 1.2 Faixas de Preco Testadas

| Preco | Conversao Estimada | Receita/1000 usuarios | Risco |
|---|---|---|---|
| R$ 14,90/mes | 8-10% | R$ 1.192-1.490 | Margem baixa, percepcion de "barato" |
| R$ 19,90/mes | 6-8% | R$ 1.194-1.592 | Competitivo, mas pouco premium |
| **R$ 29,00/mes** | **4-6%** | **R$ 1.160-1.740** | **Sweet spot: acessivel + premium** |
| R$ 39,00/mes | 3-4% | R$ 1.170-1.560 | Aceitavel se valor percebido alto |
| R$ 49,00/mes | 2-3% | R$ 980-1.470 | Somente para plano Familia |

**Decisao:** R$ 29/mes e o sweet spot para Premium (1 cafe/semana mental model).

### 1.3 Elasticidade por Segmento

| Segmento | Disposicao a Pagar | Plano Ideal |
|---|---|---|
| Classe A/B (renda > R$ 10k) | R$ 49-79/mes | Familia |
| Classe B/C (renda R$ 4-10k) | R$ 19-39/mes | Premium |
| Classe C/D (renda < R$ 4k) | R$ 0-14,90/mes | Free (eventualmente trial) |
| Mandado por corte/mediador | Inelastico (obrigatorio) | Premium/Familia |
| Pais que pagam pensao | Medio (ja gastam com o filho) | Premium |

---

## 2. Comparativo com Concorrentes

### 2.1 Precos Globais

| Produto | Preco Mensal | Preco Anual | Trial | Mercado |
|---|---|---|---|---|
| **Kindar (proposto)** | **R$ 29 (~$5.50)** | **R$ 249 (~$47)** | **14 dias** | **Brasil + LATAM** |
| OurFamilyWizard | $12.99/parent/mes | $99/parent/ano | 30 dias | EUA, Canada |
| AppClose | Gratis (ads) / $9.99 premium | — | — | EUA |
| Cozi | Gratis / $3.99 Gold | $29.99/ano | — | Global |
| OsNossos | Gratis (beta) | — | — | Portugal |
| OFP (Our Family Portal) | Gratis + $4.99 premium | — | — | EUA |
| Custody X Change | $34.95/parent/3 meses | — | — | EUA |

### 2.2 Analise: Kindar vs Concorrentes

| Dimensao | Kindar | Vantagem |
|---|---|---|
| Preco por grupo (nao por pai) | R$ 29 para o grupo todo | OFW cobra por pai ($26/mes o casal) |
| Moeda local | BRL nativo | Sem conversao cambial |
| Metodo de pagamento | Pix, cartao, boleto | Pix e preferido no BR |
| Free tier | Robusto (calendario, chat, check-ins) | OFW nao tem free tier |
| i18n | 5 idiomas | Unico com PT-BR nativo |
| Modulo saude | Profundo (doencas, vacinas, crescimento) | Nenhum concorrente tem |
| Modulo financeiro | Splitwise-style | OFW tem, mas mais basico |

---

## 3. Estrategia de Conversao Free → Paid

### 3.1 Jornada de Conversao

```
Semana 1-2: VALOR
  - Onboarding completo
  - Escala configurada
  - Primeiras mensagens trocadas
  - Ambos pais ativos

Semana 3-4: HABITO
  - Check-ins diarios
  - Primeiras despesas
  - Primeira decisao votada
  - Rotina estabelecida

Semana 5-6: LIMITE
  - Atinge limite de decisoes (3)
  - Tenta split ratio custom
  - Registros de saude atingem 5/mes
  - Feature-gated moments

Semana 7-8: CONVERSAO
  - In-app upsell contextual
  - Email com beneficios
  - Oferta de trial 14 dias
  - Social proof

Semana 9+: RETENCAO PREMIUM
  - Onboarding premium (tour das features)
  - Check-in de satisfacao (7 dias)
  - Email mensal com uso/economia
```

### 3.2 Feature Gates (Momentos de Bloqueio)

| Feature Gate | Mensagem | CTA |
|---|---|---|
| 4a decisao ativa | "Voce atingiu o limite de 3 decisoes. Resolva uma ou faca upgrade." | "Experimentar Premium" |
| Split ratio != 50/50 | "Divisao personalizada e um recurso Premium." | "Ver planos" |
| 6o registro de saude no mes | "Voce atingiu o limite mensal de saude. Premium = ilimitado." | "Upgrade" |
| Export PDF | "Exportar PDF e um recurso Premium." | "14 dias gratis" |
| 4a atividade recorrente | "Ate 3 atividades no plano Free." | "Ver Premium" |
| 11a nota privada | "Ate 10 notas no plano Free." | "Fazer upgrade" |
| 6o documento | "Ate 5 documentos no plano Free." | "Premium: ilimitado" |
| WhatsApp notification | "Notificacoes por WhatsApp sao Premium." | "Ativar" |

### 3.3 Trial de 14 Dias

**Regras:**
- Sem cartao de credito para iniciar
- Acesso a todas as features Premium
- Email no dia 7: "Faltam 7 dias do seu trial"
- Email no dia 12: "Faltam 2 dias — assine e mantenha as features"
- Email no dia 14: "Seu trial expirou. Assine ou volte ao Free"
- Dados nao sao perdidos ao expirar — voltam ao Free
- Maximo 1 trial por grupo

### 3.4 Metricas de Conversao

| Metrica | Target | Benchmark |
|---|---|---|
| Trial start rate (de feature gate) | > 20% | 15-25% |
| Trial-to-paid conversion | > 25% | 20-30% |
| Time to conversion (dias) | < 10 | — |
| Free-to-paid (sem trial) | > 3% | 2-5% |
| Annual plan adoption | > 30% | 25-35% |

---

## 4. Estrategias de Desconto

### 4.1 Plano Anual

| Plano | Mensal | Anual | Economia | Desconto Efetivo |
|---|---|---|---|---|
| Premium | R$ 29/mes | R$ 249/ano (R$ 20,75/mes) | R$ 99/ano | 28% |
| Familia | R$ 49/mes | R$ 449/ano (R$ 37,42/mes) | R$ 139/ano | 24% |

**Framing:** "Economize R$ 99 por ano no plano anual" (nao percentual).

### 4.2 Desconto de Indicacao

| Acao | Recompensa |
|---|---|
| Convidar outro grupo que assina | 1 mes gratis para ambos |
| 3 indicacoes convertidas | 3 meses gratis |
| 10 indicacoes convertidas | 1 ano gratis + badge "Embaixador" |

### 4.3 Desconto para Profissionais

| Parceiro | Desconto ao Cliente | Beneficio ao Parceiro |
|---|---|---|
| Mediador com conta Pro | Clientes dele ganham 30% off | Dashboard gratuito |
| Advogado parceiro | Clientes ganham 1 mes gratis | Relatorios exportaveis |
| ONG de apoio familiar | Grupo gratuito permanente | Logo no app |

### 4.4 Cupom de Lancamento

| Fase | Cupom | Desconto | Validade |
|---|---|---|---|
| Early adopters (primeiros 500) | PIONEER | 50% para sempre | Permanente |
| Beta testers | BETA2024 | 3 meses gratis | 1 ano |
| Lancamento publico | LANCE50 | 50% no primeiro mes | 3 meses |
| Black Friday | BF2026 | 40% no plano anual | 1 semana |

---

## 5. Parcerias B2B2C

### 5.1 Modelo para Varas de Familia

```
Vara de Familia → Recomenda Kindar aos pais
Pais usam o Free → App demonstra valor
Vara paga licenca institucional → R$ 999/mes por 100 familias
Pais podem upgrade individual → R$ 29/mes
```

**Proposta de valor para a vara:**
- Dashboard anonimizado de adesao
- Relatorios de uso para audiencia
- Chat imutavel como evidencia
- Reduz carga de trabalho do mediador

### 5.2 Modelo para Mediadores

```
Mediador paga Pro → R$ 99/mes
Ate 10 familias vinculadas → Dashboard readonly
Familias vinculadas → 30% desconto no Premium
Mediador ganha → Ferramenta de trabalho + renda indireta
```

### 5.3 Modelo para Advogados de Familia

```
Advogado paga Pro → R$ 149/mes
Ate 20 familias → Acesso a chat exportavel + relatorios
Exportar PDF para audiencia → Feature exclusiva
Familias do advogado → 1 mes gratis Premium
```

---

## 6. Pricing Roadmap

| Fase | Timeline | Acao |
|---|---|---|
| 1. Free only | Agora - M5 | Validar product-market fit |
| 2. Premium soft launch | M6 | Paywall suave + trial |
| 3. Premium GA | M7 | Stripe integration, pricing page |
| 4. Familia launch | M9 | Plano para familias complexas |
| 5. B2B2C pilot | M10 | 5 mediadores/advogados parceiros |
| 6. Annual plans | M8 | Desconto anual + indicacao |
| 7. Institutional | M12+ | Varas de familia, ONGs |
