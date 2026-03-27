# Plano de Suporte — Kindar

> Tiers de atendimento, base de conhecimento e tratamento de situacoes sensiveis.

---

## 1. Tiers de Suporte

### Tier 0: Self-Service (FAQ + Knowledge Base)

**Objetivo:** Resolver 70% das duvidas sem contato humano.

| Categoria | Artigos Prioritarios |
|---|---|
| Primeiros passos | Como criar conta, como convidar o outro pai, como configurar a escala |
| Calendario | Como funciona a escala quinzenal, como solicitar troca de dia, como exportar iCal |
| Chat | Como funciona o chat, por que mensagens nao podem ser apagadas, como usar canais |
| Despesas | Como registrar despesa, como aprovar/rejeitar, como funciona o split |
| Saude | Como registrar vacina, como usar o modulo de medicamentos, como registrar doenca |
| Decisoes | Como criar decisao, como funciona a votacao, o que acontece quando todos votam |
| Conta | Como trocar senha, como sair do grupo, como deletar conta |
| Premium | O que inclui o Premium, como assinar, como cancelar |
| Problemas | Nao recebo notificacoes, app nao carrega, convite expirou |

**Formato:** Centro de ajuda no app (pagina /ajuda) com busca full-text.

### Tier 1: Suporte por Email

**Canal:** suporte@kindar.com.br
**Horario:** Segunda a sexta, 9h-18h (BRT)
**SLA:** Resposta em 24h uteis (free), 12h (premium)

| Tipo de Issue | Resposta Padrao | Escalacao |
|---|---|---|
| Duvida sobre funcionalidade | Artigo da FAQ + explicacao | — |
| Bug reportado | Agradecer, pedir detalhes, criar issue | Tier 2 se critico |
| Problema de login | Reset password + verificar email | — |
| Convite nao funciona | Verificar expiracao, reenviar | — |
| Despesa disputada | Explicar processo de aprovacao/rejeicao | — |
| Solicitacao de dados (LGPD) | Encaminhar para DPO | Tier 3 |
| Situacao de violencia | Protocolo sensivel (ver secao 5) | Tier 3 imediato |

### Tier 2: Suporte Premium (Chat)

**Canal:** Chat in-app (somente Premium/Familia)
**Horario:** Segunda a sexta, 9h-18h (BRT)
**SLA:** Resposta em 4h uteis

| Tipo de Issue | Acao |
|---|---|
| Bug que impede uso | Prioridade P2 para engenharia |
| Duvida complexa sobre financeiro | Guia personalizado |
| Configuracao de escala complexa | Ajuda na configuracao |
| Exportacao de dados | Gerar e enviar |
| Integracao com profissional | Configurar acesso |

### Tier 3: Escalacao (Fundadores + Legal)

**Canal:** Interno (Slack #escalacoes)
**SLA:** Resposta em 2h

| Tipo de Issue | Responsavel |
|---|---|
| Solicitacao LGPD (exclusao, portabilidade) | DPO |
| Situacao de violencia domestica | Protocolo de seguranca |
| Ameaca juridica contra a plataforma | Assessoria juridica |
| Bug P1 (app indisponivel) | CTO |
| Fraude/abuso da plataforma | Fundadores |

---

## 2. Problemas Comuns e Resolucoes

### 2.1 Autenticacao

| Problema | Causa | Resolucao |
|---|---|---|
| "E-mail ou senha incorretos" | Senha errada ou conta via OAuth | Verificar metodo de login, usar "Esqueci senha" |
| "E-mail ainda nao confirmado" | Nao clicou no link de verificacao | Reenviar email, verificar spam |
| "Muitas tentativas" | Rate limit do Supabase | Aguardar 60 segundos |
| "Sessao expirada" | Token JWT expirado | Fazer login novamente |
| Convite expirado | Token expira em 7 dias | Admin reenvia convite |

### 2.2 Calendario

| Problema | Causa | Resolucao |
|---|---|---|
| Escala nao aparece | Schedule nao gerada ou childId errado | Regenerar em /calendario/escala |
| Troca nao aparece no calendario | Swap aprovada mas evento nao criado | Verificar logs, recriar manualmente |
| Eventos duplicados | Escala regenerada sem limpar anterior | generateSchedule ja faz delete+insert |
| iCal nao sincroniza | Token invalido ou app de calendario cacheou | Regenerar token, limpar cache |

### 2.3 Financeiro

| Problema | Causa | Resolucao |
|---|---|---|
| "Nao pode aprovar propria despesa" | Logica de negocio (exceto admin) | Outro membro deve aprovar |
| Split ratio invalido | JSON malformado ou soma != 100 | Corrigir valores no formulario |
| Despesa aprovada nao pode ser deletada | Regra de negocio | Criar despesa de estorno |

### 2.4 Saude

| Problema | Causa | Resolucao |
|---|---|---|
| Dose de medicamento nao registra | Permissao via JOIN com medication | Verificar membership no grupo |
| Consulta nao aparece no calendario | calendar_event_id nao foi linkado | Verificar criacao do calendar event |
| Evolucao de doenca sumiu | Notes e append-only, pode ter falhado | Verificar no banco |

---

## 3. Matriz de Escalacao

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Tier 0     │───▶│   Tier 1     │───▶│   Tier 2     │
│  Self-service│    │   Email      │    │   Chat       │
│  (FAQ)       │    │   (24h SLA)  │    │   (4h SLA)   │
└──────────────┘    └──────┬───────┘    └──────┬───────┘
                           │                    │
                           ▼                    ▼
                    ┌──────────────────────────────────┐
                    │          Tier 3                   │
                    │  DPO | CTO | Legal | Fundadores  │
                    │         (2h SLA)                  │
                    └──────────────────────────────────┘
```

### Criterios de Escalacao

| De → Para | Criterio |
|---|---|
| Tier 0 → Tier 1 | Usuario nao encontrou resposta na FAQ |
| Tier 1 → Tier 2 | Bug confirmado OU usuario premium |
| Tier 1 → Tier 3 | Situacao de violencia, LGPD, legal |
| Tier 2 → Tier 3 | Bug P1/P2, solicitacao de dados |

---

## 4. SLAs por Severidade

| Severidade | Definicao | Primeira Resposta | Resolucao |
|---|---|---|---|
| **P1 — Critico** | App indisponivel, perda de dados | 30 min | 4h |
| **P2 — Alto** | Feature principal quebrada (chat, calendario) | 2h | 24h |
| **P3 — Medio** | Feature secundaria com problema | 12h (free), 4h (premium) | 72h |
| **P4 — Baixo** | Cosmetico, sugestao de melhoria | 24h | Backlog |

---

## 5. Tratamento de Situacoes Sensiveis

### 5.1 Violencia Domestica

O Kindar pode ser usado em contextos onde ha ou houve violencia domestica. O suporte deve estar preparado.

**Protocolo:**

```
1. DETECTAR — Palavras-chave: "violencia", "ameaca", "medo", "bateu", "agrediu"
2. ACOLHER — Resposta empatetica, sem julgamento
3. NÃO MEDIAR — Nunca sugerir reconciliacao ou mediacao direta
4. INFORMAR — Compartilhar recursos oficiais:
   - Central de Atendimento a Mulher: 180
   - Policia Militar: 190
   - SAMU: 192
   - Delegacia da Mulher mais proxima
5. PROTEGER — Nao compartilhar dados de um pai com o outro
6. REGISTRAR — Documentar internamente (sem expor usuario)
7. ESCALAR — Tier 3 imediato
```

**Template de resposta:**
```
Obrigado por compartilhar isso conosco. Sua seguranca e a das criancas
e nossa prioridade.

Se voce ou alguem esta em perigo imediato, ligue:
- Emergencia: 190 (PM) ou 192 (SAMU)
- Central de Atendimento a Mulher: 180 (24h, gratuito, confidencial)

O Kindar nao e uma ferramenta de mediacao e nao substitui
acompanhamento profissional. Recomendamos procurar ajuda especializada.

Seus dados estao seguros e protegidos no app.
```

### 5.2 Disputas de Guarda

```
1. Nunca tomar partido
2. Explicar que o app e ferramenta, nao arbitro
3. Sugerir mediacao profissional
4. Lembrar que o chat e imutavel e pode ser usado como evidencia
5. Se solicitado por advogado: exigir autorizacao do usuario
```

### 5.3 Solicitacao Judicial de Dados

```
1. Exigir mandado judicial ou oficio formal
2. Encaminhar para assessoria juridica
3. Notificar ambos os usuarios do grupo
4. Fornecer somente os dados especificados no mandado
5. Documentar tudo
```

### 5.4 Denuncia de Abuso Infantil

```
1. Nao investigar — nao somos autoridade competente
2. Orientar a denunciar:
   - Disque 100 (Direitos Humanos)
   - Conselho Tutelar local
   - Delegacia de Protecao a Crianca
3. Registrar internamente
4. Se evidencia clara no app (fotos, mensagens): preservar dados
5. Escalar para Tier 3 + assessoria juridica
```

---

## 6. Estrutura da Base de Conhecimento

```
/ajuda
  /primeiros-passos
    - criar-conta
    - convidar-outro-pai
    - adicionar-filho
    - configurar-escala
  /calendario
    - escala-quinzenal
    - trocas-de-dia
    - exportar-ical
    - eventos-sociais
  /comunicacao
    - chat-entre-pais
    - canais-por-filho
    - check-ins-diarios
    - mensagens-imutaveis
  /financeiro
    - registrar-despesa
    - aprovar-rejeitar
    - acertos-pix
    - split-ratio
  /saude
    - registrar-vacina
    - medicamentos-e-doses
    - episodios-de-doenca
    - consultas-medicas
    - curva-de-crescimento
  /decisoes
    - criar-decisao
    - votacao
    - argumentos
  /conta
    - trocar-senha
    - sair-do-grupo
    - deletar-conta
    - exportar-dados
  /premium
    - planos-e-precos
    - como-assinar
    - cancelar-assinatura
  /problemas
    - notificacoes
    - convite-expirado
    - app-nao-carrega
    - erro-ao-registrar
```

---

## 7. Metricas de Suporte

| Metrica | Target | Frequencia |
|---|---|---|
| CSAT (Customer Satisfaction) | > 4.2/5 | Por ticket |
| Primeira resposta (mediana) | < 8h (free), < 2h (premium) | Diaria |
| Resolucao (mediana) | < 48h | Semanal |
| Tickets/MAU | < 5% | Mensal |
| Self-service resolution rate | > 70% | Mensal |
| Escalacoes para Tier 3 | < 2% dos tickets | Mensal |
| NPS de suporte | > 50 | Trimestral |
