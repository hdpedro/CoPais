# Modelo de Monetizacao — Kindar

> Estrategia freemium, projecoes de receita e unit economics.

---

## 1. Modelo Freemium

### 1.1 Plano Gratuito (Free)

**Objetivo:** Atrair usuarios, demonstrar valor, criar habito.

| Feature | Limite |
|---|---|
| Grupos de coparentalidade | 1 grupo |
| Criancas por grupo | Ate 2 |
| Calendario de guarda | Completo (escala quinzenal, eventos, trocas) |
| Chat entre pais | Completo (mensagens, canais por filho) |
| Decisoes colaborativas | Ate 3 ativas simultaneamente |
| Despesas compartilhadas | Registro ilimitado, split 50/50 fixo |
| Check-ins diarios | Completo |
| Saude basica | Alergias + info medica + 5 registros/mes |
| Vacinas | Completo |
| Atividades recorrentes | Ate 3 ativas |
| Acordos | Ate 5 |
| Documentos | Ate 5 documentos (50MB total) |
| Notas privadas | Ate 10 |
| Notificacoes | Push (in-app) |
| Idiomas | Todos (PT, EN, ES, FR, DE) |
| Assinatura iCal | Sim |

### 1.2 Plano Premium (R$ 29/mes ou R$ 249/ano)

**Objetivo:** Monetizar usuarios engajados. O preco cobre o custo de 1 cafe por semana.

| Feature | Limite |
|---|---|
| Tudo do Free | + |
| Criancas por grupo | Ilimitado |
| Decisoes ativas | Ilimitado |
| Despesas | Split ratio personalizado (60/40, 70/30, etc) |
| Comprovantes de despesa | Upload ilimitado com OCR (futuro) |
| Acertos financeiros | Completo (estilo Splitwise) |
| Saude completa | Registros ilimitados (doencas, medicamentos, consultas, crescimento) |
| Profissionais de saude | Cadastro ilimitado |
| Exportar PDF de saude | Sim (para levar ao medico) |
| Atividades recorrentes | Ilimitado com checklist |
| Documentos | Ilimitado (1GB total) |
| Notas privadas | Ilimitado |
| Notificacoes WhatsApp | Sim (decisoes urgentes, consultas) |
| Moderador de tom AI | Alerta de tom agressivo no chat |
| Historico de chat exportavel | Sim (PDF para advogado) |
| Relatorio mensal AI | Resumo semanal automatico |
| Suporte prioritario | Chat com resposta em 24h |
| Temas sensiveis | Modulo completo com recursos |

### 1.3 Plano Familia (R$ 49/mes ou R$ 449/ano)

**Objetivo:** Monetizar familias complexas com cuidadores adicionais.

| Feature | Limite |
|---|---|
| Tudo do Premium | + |
| Grupos | Ate 3 grupos (ex: 2 casamentos anteriores) |
| Membros por grupo | Ilimitado (avos, cuidadores, babas) |
| Portal do profissional | Acesso readonly para mediador/advogado |
| Calendario compartilhado | Visualizacao para avos/cuidadores |
| Logs escolares | Modulo completo |
| Relatorio para mediador | PDF formatado para audiencia |
| Video-chamada integrada | Para mediacao (futuro) |
| Backup de dados | Export completo mensal automatico |

---

## 2. Projecoes de Receita (12 meses)

### Premissas

| Parametro | Conservador | Moderado | Agressivo |
|---|---|---|---|
| Signups/mes (M1) | 200 | 400 | 800 |
| Crescimento mensal signups | 15% | 25% | 40% |
| Grupos formados (% signups) | 70% | 75% | 80% |
| Free-to-Premium (M6+) | 3% | 5% | 8% |
| Free-to-Familia (M6+) | 0.5% | 1% | 2% |
| Churn premium mensal | 8% | 5% | 3% |
| Desconto anual adoption | 20% | 30% | 40% |

### Projecao Conservadora

| Mes | Signups | Grupos | Premium | Familia | MRR |
|---|---|---|---|---|---|
| M1 | 200 | 140 | 0 | 0 | R$ 0 |
| M2 | 230 | 161 | 0 | 0 | R$ 0 |
| M3 | 265 | 185 | 0 | 0 | R$ 0 |
| M4 | 304 | 213 | 0 | 0 | R$ 0 |
| M5 | 350 | 245 | 0 | 0 | R$ 0 |
| M6 | 403 | 282 | 32 | 5 | R$ 1.173 |
| M7 | 463 | 324 | 56 | 9 | R$ 2.069 |
| M8 | 533 | 373 | 81 | 14 | R$ 3.039 |
| M9 | 613 | 429 | 108 | 19 | R$ 4.087 |
| M10 | 705 | 493 | 137 | 25 | R$ 5.198 |
| M11 | 810 | 567 | 169 | 31 | R$ 6.452 |
| M12 | 932 | 652 | 204 | 38 | R$ 7.778 |
| **Total** | **5.808** | **4.064** | — | — | **ARR: ~R$ 93k** |

### Projecao Moderada

| Mes | Signups | Grupos Acum. | Premium | Familia | MRR |
|---|---|---|---|---|---|
| M6 | 1.221 | 2.286 | 114 | 23 | R$ 4.453 |
| M9 | 2.384 | 5.961 | 298 | 60 | R$ 11.582 |
| M12 | 4.657 | 13.505 | 675 | 135 | R$ 26.250 |
| **ARR M12** | | | | | **~R$ 315k** |

### Projecao Agressiva

| Mes | Signups | Grupos Acum. | Premium | Familia | MRR |
|---|---|---|---|---|---|
| M6 | 4.295 | 6.440 | 515 | 129 | R$ 21.266 |
| M9 | 11.788 | 19.750 | 1.580 | 395 | R$ 65.145 |
| M12 | 32.339 | 55.380 | 4.430 | 1.108 | R$ 182.862 |
| **ARR M12** | | | | | **~R$ 2.2M** |

---

## 3. Unit Economics

### 3.1 Custo por Usuario (Infrastructure)

| Componente | Custo/mes | Por usuario (1.000 usuarios) |
|---|---|---|
| Supabase Pro | R$ 125 ($25) | R$ 0,13 |
| Vercel Pro | R$ 100 ($20) | R$ 0,10 |
| PostHog (free tier ate 1M eventos) | R$ 0 | R$ 0,00 |
| Dominio + DNS | R$ 5 | R$ 0,005 |
| WhatsApp Business API (premium only) | R$ 0,50/msg | R$ 0,10 (media) |
| Storage (Supabase, 1GB/usuario) | Incluido | R$ 0,00 |
| **Total infraestrutura** | | **~R$ 0,34/usuario/mes** |

### 3.2 CAC (Customer Acquisition Cost)

| Canal | Investimento/mes | Novos grupos | CAC |
|---|---|---|---|
| SEO + Content | R$ 2.000 | 50 | R$ 40 |
| Google Ads | R$ 3.000 | 40 | R$ 75 |
| Instagram/Facebook | R$ 2.000 | 30 | R$ 67 |
| Parcerias (mediadores) | R$ 500 | 20 | R$ 25 |
| Viral/Organico | R$ 0 | 60 | R$ 0 |
| **Blended CAC** | **R$ 7.500** | **200** | **R$ 37,50** |

### 3.3 LTV (Lifetime Value)

| Plano | ARPU/mes | Retencao media | LTV |
|---|---|---|---|
| Free | R$ 0 | 6 meses | R$ 0 |
| Premium | R$ 29 | 10 meses | R$ 290 |
| Premium (anual) | R$ 20,75 | 14 meses | R$ 290,50 |
| Familia | R$ 49 | 12 meses | R$ 588 |
| Familia (anual) | R$ 37,42 | 16 meses | R$ 598,67 |
| **Blended (5% premium, 1% familia)** | | | **R$ 32,70** |

### 3.4 LTV/CAC

| Cenario | LTV | CAC | LTV/CAC | Payback Period |
|---|---|---|---|---|
| Premium (organico) | R$ 290 | R$ 0 | Infinito | 0 meses |
| Premium (blended) | R$ 290 | R$ 37,50 | 7.7x | 1,3 meses |
| Familia (blended) | R$ 588 | R$ 37,50 | 15.7x | 0,8 meses |
| **Blended total** | **R$ 32,70** | **R$ 37,50** | **0.87x** | **Negativo (free)** |
| **Somente pagantes** | **R$ 339** | **R$ 625** | **5.4x** | **1,8 meses** |

> **Nota:** CAC por usuario pagante = Blended CAC / taxa de conversao (6%) = R$ 625

**Target saudavel:** LTV/CAC > 3x com payback < 12 meses. Estamos acima do target.

---

## 4. Psicologia de Pricing

### 4.1 Contexto Emocional

O Kindar opera em um contexto altamente emocional:
- Pais recem-separados estao vulneraveis
- Dinheiro e ponto sensivel (ja dividindo gastos)
- Percepcao de "pagar para coparentar" pode gerar resistencia

### 4.2 Estrategias de Pricing para Produto Emocional

| Estrategia | Implementacao no Kindar |
|---|---|
| **Framing de investimento, nao custo** | "R$ 29/mes para paz de espirito na coparentalidade" |
| **Comparacao com alternativas** | "Menos que 1 sessao de mediacao (R$ 200+)" |
| **Valor para a crianca** | "Investimento na organizacao da vida do seu filho" |
| **Trial sem risco** | 14 dias gratis, sem cartao de credito upfront |
| **Downgrade suave** | Ao cancelar, nao perde dados — volta ao free |
| **Social proof** | "2.500 familias ja usam para coparentar melhor" |
| **Grandfathering** | Primeiros 500 pagantes tem preco fixo para sempre |

### 4.3 Triggers de Upgrade

| Momento | Mensagem | Canal |
|---|---|---|
| Atingir 3 decisoes ativas | "Voce tem decisoes pendentes. Premium: decisoes ilimitadas." | In-app banner |
| Tentar split ratio != 50/50 | "Divisao personalizada e recurso Premium." | Modal |
| 30 dias de uso ativo | "Voce esta usando o Kindar ha 1 mes! Que tal experimentar o Premium?" | Email |
| Registrar 5a doenca/medicamento | "Seus registros de saude estao crescendo. Premium: ilimitado + PDF." | In-app |
| Tentar exportar PDF | "Exportar PDF e recurso Premium. Experimente 14 dias gratis." | Modal |
| Convite a 3o membro (avo) | "Adicionar familia estendida e recurso Familia." | Modal |

---

## 5. Revenue Streams Futuras

### 5.1 B2B2C: Parcerias com Profissionais

| Parceiro | Modelo | Receita Estimada |
|---|---|---|
| Mediadores familiares | R$ 99/mes por acesso a dashboard de 10 familias | R$ 99/mediador/mes |
| Advogados de familia | R$ 149/mes por exportacao de relatorios e chat | R$ 149/advogado/mes |
| Psicologos infantis | R$ 49/mes por acesso readonly a check-ins | R$ 49/profissional/mes |
| Varas de familia | Licenca institucional: R$ 999/mes por 100 familias | R$ 999/vara/mes |

### 5.2 Marketplace (Longo Prazo)

| Servico | Modelo | Receita |
|---|---|---|
| Mediacao online | % sobre sessao agendada via app | 15% da sessao |
| Assessoria juridica | % sobre consulta agendada | 15% da consulta |
| Terapia infantil | % sobre sessao | 10% da sessao |

### 5.3 Dados Anonimizados (Somente com Consentimento)

| Produto | Comprador | Receita |
|---|---|---|
| Insights de coparentalidade | Pesquisadores/universidades | Doacao/licenca |
| Benchmarks de guarda | Varas de familia | Licenca institucional |

> **NOTA:** Monetizacao de dados requer consentimento explicito separado (LGPD Art. 7).
> Nunca vender dados identificaveis. Somente agregados e anonimizados.
