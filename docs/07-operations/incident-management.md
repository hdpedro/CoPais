# Gerenciamento de Incidentes — Kindar

> Classificacao de severidade, runbooks e templates de comunicacao.

---

## 1. Niveis de Severidade

| Nivel | Nome | Definicao | Exemplos | SLA Resolucao |
|---|---|---|---|---|
| **P1** | Critico | App completamente indisponivel ou perda de dados | Deploy quebrado, Supabase fora, DB corrompido | 4h |
| **P2** | Alto | Feature principal quebrada para todos | Chat nao envia mensagens, calendario nao carrega, login falha | 8h |
| **P3** | Degradado | Feature secundaria com problemas ou lentidao | Notificacoes push falham, upload lento, export PDF erro | 48h |
| **P4** | Cosmetico | Bug visual ou de baixo impacto | Icone errado, traducao incorreta, alignment off | Backlog |

---

## 2. Processo de Resposta a Incidentes

```
┌──────────┐    ┌──────────┐    ┌──────────────┐    ┌──────────┐    ┌───────────┐
│ DETECTAR │───▶│ AVALIAR  │───▶│  COMUNICAR   │───▶│ CORRIGIR │───▶│POST-MORTEM│
│          │    │Severidade│    │Status page + │    │Fix + Deploy│   │  Doc +    │
│Monitoring│    │P1/P2/P3/4│    │ Stakeholders │    │ + Verify  │   │Aprendizado│
└──────────┘    └──────────┘    └──────────────┘    └──────────┘    └───────────┘
     │                                                                    │
     └────────────────── feedback loop ──────────────────────────────────┘
```

### 2.1 Detectar

| Fonte de Deteccao | O que Monitora | Alerta |
|---|---|---|
| Vercel Status | Deploy status, build errors | Email + Slack |
| Supabase Dashboard | Database health, connections, storage | Email |
| PostHog | Taxa de erros em events, drop em DAU | Slack #alerts |
| Uptime monitoring (ex: Betterstack) | HTTP 200 check a cada 1 min | SMS + Slack |
| Usuarios | Reports via suporte | Email suporte |
| Sentry (a integrar) | Erros JS nao capturados | Slack #errors |

### 2.2 Avaliar

| Pergunta | P1 | P2 | P3 | P4 |
|---|---|---|---|---|
| App acessivel? | Nao | Sim | Sim | Sim |
| Feature principal funciona? | N/A | Nao | Parcialmente | Sim |
| Dados em risco? | Sim | Nao | Nao | Nao |
| Quantos usuarios afetados? | Todos | Maioria | Alguns | Poucos |
| Workaround disponivel? | Nao | Nao | Sim | N/A |

### 2.3 Comunicar

**P1/P2:** Atualizar status page + notificar usuarios afetados
**P3:** Atualizar ticket + responder ao usuario que reportou
**P4:** Registrar no backlog

### 2.4 Corrigir

```
1. Identificar causa raiz
2. Implementar fix (hotfix branch se P1/P2)
3. Testar localmente
4. Deploy para preview/staging
5. Verificar fix em staging
6. Deploy para producao
7. Verificar em producao
8. Confirmar resolucao
```

### 2.5 Post-mortem

Obrigatorio para P1 e P2. Opcional para P3.

---

## 3. Templates de Comunicacao

### 3.1 Template: Incidente Detectado (P1/P2)

```
ASSUNTO: [P1] Kindar — {descricao curta}

STATUS: Investigando
DETECTADO EM: {data/hora}
IMPACTO: {descricao do impacto para o usuario}

Identificamos um problema que esta afetando {feature}.
Nossa equipe esta investigando e trabalhando na resolucao.

Proximo update em {30 min para P1, 2h para P2}.
```

### 3.2 Template: Atualizacao de Progresso

```
ASSUNTO: [P1] Kindar — {descricao curta} — Update

STATUS: Identificado / Em correcao
CAUSA: {descricao tecnica simplificada}
IMPACTO: {quantos usuarios, quais features}

Identificamos a causa do problema: {causa}.
Estamos implementando a correcao e estimamos resolucao em {tempo}.

Proximo update em {tempo}.
```

### 3.3 Template: Incidente Resolvido

```
ASSUNTO: [RESOLVIDO] Kindar — {descricao curta}

STATUS: Resolvido
DETECTADO EM: {data/hora}
RESOLVIDO EM: {data/hora}
DURACAO: {X horas/minutos}
CAUSA: {descricao simplificada}
IMPACTO: {o que os usuarios experimentaram}

O problema foi resolvido. O servico esta funcionando normalmente.

Pedimos desculpas pelo inconveniente. Um post-mortem sera conduzido
para evitar recorrencias.
```

---

## 4. Runbooks para Problemas Comuns

### 4.1 Runbook: Supabase Indisponivel

```
SINTOMAS:
- Erros 500 em todas as paginas
- "Failed to fetch" no console
- Supabase dashboard mostra outage

VERIFICACAO:
1. Checar https://status.supabase.com/
2. Checar Supabase Dashboard → Settings → Health
3. Testar query simples: SELECT 1

ACOES:
1. Se outage global do Supabase:
   a. Nada a fazer no nosso lado
   b. Ativar pagina de manutencao (Vercel Edge Config)
   c. Comunicar usuarios via Twitter/email
   d. Monitorar status page do Supabase
   e. Quando voltar: verificar integridade dos dados

2. Se problema especifico do nosso projeto:
   a. Verificar Supabase Dashboard → Logs → Postgres
   b. Verificar se atingimos limite de connections (pool_size)
   c. Se pool exhausted: restart do Supabase via dashboard
   d. Verificar se migration recente quebrou algo
   e. Se necessario: rollback migration via SQL Editor

PREVENCAO:
- Monitorar connection pool usage
- Implementar retry logic nas Server Actions
- Implementar circuit breaker pattern
```

### 4.2 Runbook: Deploy Vercel Falhou

```
SINTOMAS:
- Build error no Vercel dashboard
- Ultimo deploy falhou, versao anterior ativa
- TypeScript errors, module not found

VERIFICACAO:
1. Vercel Dashboard → Deployments → ultimo deploy → logs
2. Identificar erro especifico (TypeScript, build, runtime)

ACOES:
1. Se TypeScript error:
   a. Corrigir o erro no codigo
   b. Push novo commit
   c. Vercel re-deploya automaticamente

2. Se module not found:
   a. Verificar package.json
   b. Rodar npm install localmente
   c. Verificar se package-lock.json esta atualizado
   d. Push com lock file atualizado

3. Se runtime error (apos deploy bem-sucedido):
   a. Vercel Dashboard → Deployments → Rollback para versao anterior
   b. Investigar causa do runtime error
   c. Corrigir e re-deployar

4. Se ambiente variable faltando:
   a. Vercel Dashboard → Settings → Environment Variables
   b. Adicionar variavel faltante
   c. Re-deployar

PREVENCAO:
- Rodar `npm run build` localmente antes de push
- CI/CD com checks antes do merge
```

### 4.3 Runbook: RLS Policy Quebrada

```
SINTOMAS:
- Usuarios veem dados de outros grupos
- Erro "new row violates row-level security policy"
- Dados nao aparecem apesar de existirem no banco

VERIFICACAO:
1. Supabase Dashboard → SQL Editor
2. Rodar: SELECT * FROM pg_policies WHERE tablename = '{tabela}';
3. Verificar se RLS esta habilitado: SELECT relrowsecurity FROM pg_class WHERE relname = '{tabela}';
4. Testar query como usuario especifico

ACOES:
1. Se RLS desabilitado acidentalmente:
   a. ALTER TABLE public.{tabela} ENABLE ROW LEVEL SECURITY;
   b. Verificar que politicas existem
   c. Testar acesso

2. Se politica incorreta:
   a. Identificar a politica problematica
   b. DROP POLICY IF EXISTS "{nome}" ON public.{tabela};
   c. CREATE POLICY correta
   d. Testar com diferentes usuarios

3. Se dados foram expostos:
   a. SEVERIDADE: P1 — potencial vazamento de dados
   b. Determinar quais dados foram expostos
   c. Determinar quais usuarios acessaram dados indevidos
   d. Notificar DPO para avaliacao LGPD
   e. Se necessario: notificar ANPD em 72h

PREVENCAO:
- Toda migration deve incluir RLS + politicas
- Code review obrigatorio para mudancas de schema
- Testes automatizados de RLS (a implementar)
```

### 4.4 Runbook: Chat Messages Corrompidas

```
SINTOMAS:
- Mensagens aparecendo no grupo errado
- Mensagens de chat deletadas (trigger falhou?)
- Texto de mensagem alterado

VERIFICACAO:
1. Verificar triggers:
   SELECT * FROM information_schema.triggers
   WHERE trigger_name LIKE '%chat%';

2. Verificar se trigger funciona:
   -- Em staging, tentar DELETE (deve falhar)
   DELETE FROM chat_messages WHERE id = '{test_id}';

ACOES:
1. Se trigger de imutabilidade desabilitado:
   a. SEVERIDADE: P1 — integridade legal comprometida
   b. Recriar triggers imediatamente
   c. Verificar logs para determinar se houve delecoes
   d. Se houve: tentar recuperar de backup (Supabase PITR)

2. Se mensagens no grupo errado:
   a. Verificar RLS policy de chat_messages
   b. Corrigir group_id se necessario

PREVENCAO:
- Nunca desabilitar triggers de chat em producao
- Backup point-in-time recovery habilitado no Supabase
```

### 4.5 Runbook: Push Notifications Falhando

```
SINTOMAS:
- Usuarios nao recebem notificacoes push
- Erros em `createNotificationWithPush()`
- push_subscriptions com endpoints invalidos

VERIFICACAO:
1. Verificar VAPID keys no .env
2. Verificar se push_subscriptions tem registros
3. Testar manualmente com webpush.sendNotification()

ACOES:
1. Se VAPID keys invalidas:
   a. Gerar novas keys
   b. Atualizar env vars no Vercel
   c. Re-deployar
   d. Usuarios precisarao reativar notificacoes

2. Se subscriptions expiradas:
   a. Limpar subscriptions invalidas:
      DELETE FROM push_subscriptions WHERE endpoint LIKE '%expired%';
   b. Implementar retry + cleanup automatico

3. Se service worker desatualizado:
   a. Forcar atualizacao do SW via header Cache-Control
   b. Implementar versionamento do SW

IMPACTO: P3 — notificacoes sao complementares, nao criticas
```

---

## 5. Monitoramento

### 5.1 Stack de Monitoramento

| Ferramenta | O que Monitora | Alerta |
|---|---|---|
| **Vercel Analytics** | Core Web Vitals, latencia, erros HTTP | Dashboard |
| **Supabase Dashboard** | DB health, connections, disk, queries lentas | Email |
| **PostHog** | Eventos de usuario, erros de actions, funis | Webhook → Slack |
| **Betterstack (a integrar)** | Uptime HTTP (1 min check) | SMS + Slack + Email |
| **Sentry (a integrar)** | Erros JS nao capturados, sourcemaps | Slack #errors |

### 5.2 Alertas Configurados

| Alerta | Condicao | Severidade | Canal |
|---|---|---|---|
| App down | HTTP != 200 por 2 min | P1 | SMS + Slack |
| Error rate > 5% | PostHog event error rate | P2 | Slack |
| Supabase connections > 80% | Pool usage | P2 | Slack |
| Build failed | Vercel deploy error | P3 | Email |
| LCP > 4s | Vercel Analytics P75 | P3 | Slack (weekly) |
| DAU drop > 30% | PostHog | P3 | Slack |
| Zero signups in 24h | PostHog | P3 | Slack |
| Storage > 80% | Supabase | P4 | Email (weekly) |

---

## 6. On-Call Rotation

### Fase Atual (Time Pequeno)

```
- Fundador/CTO: On-call 24/7
- Alertas P1: SMS imediato
- Alertas P2: Slack (horario comercial), SMS (fora do horario)
- Alertas P3/P4: Slack (proxima sessao de trabalho)
```

### Fase Futura (Time > 3 engenheiros)

```
Semana 1: Eng A (primary) + Eng B (secondary)
Semana 2: Eng B (primary) + Eng C (secondary)
Semana 3: Eng C (primary) + Eng A (secondary)

Primary: Responde a todos os alertas
Secondary: Backup se primary nao responder em 15 min (P1) ou 1h (P2)
```

**Compensacao on-call:**
- R$ 500/semana de on-call
- Dia de folga apos semana on-call
- Bonus por incidente P1 resolvido fora do horario

---

## 7. Template de Post-Mortem

```markdown
# Post-Mortem: {Titulo do Incidente}

## Resumo
- **Data:** {YYYY-MM-DD}
- **Duracao:** {X horas/minutos}
- **Severidade:** P{1/2/3}
- **Impacto:** {numero de usuarios afetados, features impactadas}
- **Detectado por:** {monitoring/usuario/deploy}
- **Resolvido por:** {nome}

## Timeline (UTC-3)
- HH:MM — {evento}
- HH:MM — {evento}
- HH:MM — {evento}
- HH:MM — Incidente resolvido

## Causa Raiz
{Descricao tecnica detalhada da causa}

## Resolucao
{O que foi feito para resolver}

## O que deu certo
- {item}
- {item}

## O que deu errado
- {item}
- {item}

## Action Items
| Acao | Responsavel | Prazo | Status |
|---|---|---|---|
| {acao preventiva} | {nome} | {data} | Pendente |
| {melhoria de monitoring} | {nome} | {data} | Pendente |

## Licoes Aprendidas
- {licao}
- {licao}
```

---

## 8. Plano de Disaster Recovery

### 8.1 Backup

| Componente | Metodo | Frequencia | Retencao |
|---|---|---|---|
| Database (PostgreSQL) | Supabase PITR (Point-in-Time Recovery) | Continuo | 7 dias (Pro) |
| Storage (arquivos) | Supabase Storage replication | Continuo | Enquanto ativo |
| Codigo | Git (GitHub) | A cada push | Permanente |
| Env vars | Vercel + documentacao segura | Manual | Atualizado |
| Migrations | Git (supabase/migrations/) | A cada push | Permanente |

### 8.2 RTO e RPO

| Metrica | Target | Atual |
|---|---|---|
| **RPO** (Recovery Point Objective) | < 1 hora | ~minutos (PITR) |
| **RTO** (Recovery Time Objective) | < 4 horas | ~1-2 horas (redeploy) |

### 8.3 Cenarios de Desastre

| Cenario | Probabilidade | Acao |
|---|---|---|
| Supabase projeto corrompido | Muito baixa | Restore from PITR |
| Vercel deploy catastrofico | Baixa | Rollback para deploy anterior |
| Credenciais vazadas | Baixa | Revogar + rotacionar todas as chaves |
| Ransomware/hack | Muito baixa | Restore from backup + investigacao forense |
| Supabase pricing change | Media | Migrar para PostgreSQL self-hosted |
| Vercel pricing change | Media | Migrar para Coolify/Railway |
