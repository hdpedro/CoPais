# Plano de Testes — Release 22/maio/2026

**Build:** PWA já em produção (Vercel) · Native OTA em curso pros runtimes 1.0.7–1.0.13 · App Store 1.0.13 LIVE
**Duração estimada full pass:** ~2h por tester (priorizar P0/P1 se tempo curto)
**Devices:** mínimo 1 iPhone com 1.0.13 (ou OTA aplicada) + 1 Android com 1.0.11+ + 1 navegador desktop
**Contas necessárias:** 1 par de coparentes ativos com pelo menos 1 criança cadastrada + 1 grupo familiar com 3 membros (admin/member/viewer)

---

## Índice

1. [Como reportar bugs](#1-como-reportar-bugs)
2. [P0 — Bugs críticos resolvidos (validar)](#p0--bugs-críticos-resolvidos-validar)
3. [P1 — Features novas (validar UX)](#p1--features-novas-validar-ux)
4. [P2 — Acentuação pt-BR sweep](#p2--acentuação-pt-br-sweep)
5. [P3 — Foundation técnica (regressão)](#p3--foundation-técnica-regressão)
6. [Cenários multi-plataforma](#cenários-multi-plataforma)
7. [Checklist final](#checklist-final)

---

## 1. Como reportar bugs

Template para cada bug:

```
**Severidade:** P0 (bloqueante) / P1 (alto impacto) / P2 (cosmético)
**Onde:** [PWA | iOS | Android] · [tela/fluxo]
**Versão:** [PWA build hash | app version + build number]
**Repro:**
  1. ...
  2. ...
**Esperado:** ...
**Recebido:** ...
**Screenshot/Video:** [obrigatório pra UI]
**Dados:** [user_id, group_id, child_id se aplicável]
```

Onde mandar: canal `#qa-bugs` no WhatsApp ou pelo próprio Kindar (chat com coparente que é dev).

---

# P0 — Bugs críticos resolvidos (validar)

## P0.1 — Snooze de vacina pendente

**Bug original (Angelino, 21/05):** "Vacina pendente não adia. Só some quando marco q foi tomada."

**Repro (qualquer plataforma):**
1. Abra Saúde → Vacinas
2. Selecione uma criança com vacina pendente (card amarelo)
3. Toque em **Adiar** no card
4. Escolha **"7 dias"** ou **"30 dias"** ou **"Já agendei"**

**Esperado:**
- ✅ Toast verde "Pendência adiada"
- ✅ Card desaparece IMEDIATAMENTE da lista
- ✅ Hero atualiza: "1 reforço pendente" → "Em dia" (se era única)
- ✅ Tile do dashboard "Saúde preventiva · N pendentes" decrementa
- ✅ Após pull-to-refresh, card continua sumido

**Esperado NÃO acontecer (regressão):**
- ❌ Card voltar após refresh
- ❌ Status do hero não atualizar

**Edge cases pra testar:**
- a. Múltiplas crianças — adiar vacina de Criança A não deve afetar Criança B
- b. Adiar 2 vacinas em sequência da mesma criança — ambas devem sumir
- c. Marcar como tomada outra vacina depois — deve aparecer no histórico normalmente

---

## P0.2 — Mensagens do chat (Android)

**Bug original:** No Android, quando coparente mandava 3 mensagens em <1min, user via só a última (as anteriores eram substituídas no shade de notificações).

**Repro:**
1. Tester A no Android, com Kindar instalado e logado
2. Tester B em qualquer dispositivo, abre chat com Tester A
3. Tester A fecha o app (background)
4. Tester B manda 3 mensagens em sequência em ~10 segundos:
   - "msg 1"
   - "msg 2"
   - "msg 3"
5. Tester A olha o shade de notificações

**Esperado:**
- ✅ 3 notificações distintas aparecem (ou agrupadas mas todas visíveis)
- ✅ Tocando em qualquer uma abre o chat

**Esperado NÃO acontecer:**
- ❌ Ver só "msg 3" (bug antigo)

**Testar em iOS também:**
- Mesma sequência, mas iOS deveria agrupar visualmente sob mesmo sender — todas continuam visíveis quando expandido

---

## P0.3 — Notificações de atividade com texto cru

**Bug original:** Push de lembrete de atividade mostrava `reminders.activity.title from Kindar` em vez de "Em breve: {atividade}".

**Repro:**
1. Crie uma atividade pra ~30min adiante (qualquer plataforma)
2. Chip "Quando me lembrar?" → **30 min antes**
3. Salva
4. Aguarda 15min — o cron `/api/cron/activity-due-reminders` dispara
5. Recebe push

**Esperado:**
- ✅ Title: "Em breve: Buscar Bernardo na escola" (ou nome da atividade)
- ✅ Body: "18:00 · Colégio CVS · Levar: Uniforme, Tênis"
- ✅ Tocando abre direto na atividade

**Esperado NÃO acontecer:**
- ❌ "reminders.activity.title from Kindar"
- ❌ "reminders.activity.itemsLabel Uniforme..."

**Variantes pra testar:**
- Lead `manhã do dia (8h)` → title vira "Hoje: {atividade}"
- Lead `véspera (20h)` → title vira "Amanhã: {atividade}"

---

## P0.4 — Digest D-1 noturno

**Repro:**
1. Crie 2-3 atividades pra amanhã, cada uma com checklist
2. Aguarda 20h BRT (cron `sendDailyActivityDigest`)
3. Recebe um único push aggregado

**Esperado:**
- ✅ Title: "Sua agenda de amanhã"
- ✅ Body: "Jiu-Jitsu 09h + Inglês 14h + Médico 16h · 8 itens pra preparar"

**Esperado NÃO acontecer:**
- ❌ "reminders.digest.title" cru
- ❌ Múltiplos pushes (1 por atividade)

---

# P1 — Features novas (validar UX)

## P1.1 — Tela `/perfil/notificacoes`

**Como chegar:**
- PWA: menu Perfil → "Notificações" (logo abaixo de Documentos)
- Native: tab Perfil → cartão "Notificações" entre Segurança e Assinatura

**Validar elementos:**

### A) Header
- [ ] Título "Notificações" + subtítulo "Quem recebe o quê — controle granular."
- [ ] Se houver categorias mutadas: chip amarelo "🔕 N silenciadas" visível no topo
- [ ] Se houver mute global ativo: chip com "Silenciado até {dia, hora}"

### B) Permission banner (Native iOS)
- [ ] Se permissão de notificação está NEGADA no iOS: banner vermelho com botão "Abrir Configurações"
- [ ] Botão deve abrir Settings → Notifications → Kindar (não tela genérica)
- [ ] Se NUNCA decidiu (undetermined): banner brand com botão "Ativar notificações" — clica e iOS pergunta

### C) Seção Mute
- [ ] 4 botões em grid 2×2: "Silenciar 1h", "Silenciar 4h", "Até amanhã de manhã", "Desativar silêncio"
- [ ] Clicar "1h" → toast/feedback, badge amber aparece no topo "Silenciado até HH:MM"
- [ ] Clicar "Desativar silêncio" enquanto ativo → botão fica verde preenchido (CTA primário)
- [ ] Mute persiste após fechar e reabrir o app
- [ ] Mute expirado automaticamente após o tempo (testar com "1h" + esperar 1h+)

### D) Seção Quiet Hours
- [ ] Toggle on/off — quando OFF, pickers de hora não aparecem
- [ ] Toggle ON: aparecem "A partir das HH:MM" e "Até HH:MM"
- [ ] Tap no horário abre time picker nativo (não modal custom feio)
- [ ] Mudar hora persiste após reabrir app
- [ ] Footer hint: "Push fica em silêncio nesse intervalo. Urgências de saúde atravessam..."

### E) Seção Categorias — 4 groups colapsáveis
- [ ] **Sobre as crianças** (4): Saúde, Vacinas, Lembretes, Agenda
- [ ] **Coparente** (4): Chat, Decisões, Despesas, Trocas de guarda
- [ ] **Família** (2): Escola, Aniversários
- [ ] **Sistema** (3): Ajustes de saldo, Acertos, Lembretes de uso
- [ ] Cada group mostra contador "{enabled}/{total}" (ex: "4/4" ou "2/4")
- [ ] Tap no header colapsa/expande (com chevron animado)
- [ ] Switch direita pra cada categoria, com hint embaixo do label
- [ ] Toggle persiste após reabrir

### F) Botões finais
- [ ] **"🔔 Enviar notificação de teste"** — dispara notif local. iOS/Android: aparece em 2s. PWA: pede permissão se ainda não tinha.
- [ ] **"Restaurar padrão"** (link sutil) — abre Alert nativo "Restaurar todas as preferências?". Confirma → tudo volta pro estado inicial (todas categorias ON, quiet hours OFF, sem mute).
- [ ] Footer reassurance: "Urgências de saúde sempre passam, mesmo com tudo silenciado."

### G) Comportamento server-side (validar com coparente)
Cenário crítico: user A muta categoria "Chat". User B manda mensagem.
- [ ] User A NÃO recebe push (chat mutado)
- [ ] User A vê mensagem normalmente no inbox in-app (categoria muta SÓ push, não inbox)

Cenário "urgent override":
- [ ] User A muta tudo + ativa quiet hours 24h
- [ ] Coparente registra `illness_episodes` com severity='grave'
- [ ] User A AINDA recebe o push (urgent bypassa tudo)

---

## P1.2 — Soft prompt antes do hard prompt iOS

**Quando aparece:** primeira vez que abre o app pós-OTA/instalação OU em conta nova.

**Repro:**
1. Reinstala o app (delete + install do TestFlight)
2. Faz login
3. Aguarda ~1.5s após dashboard carregar

**Esperado:**
- ✅ Modal full-screen translúcido com:
  - Ícone 🔔
  - Título "Vamos te avisar quando precisar"
  - 4 bullets (lembretes, mensagens, vacinas, despesas)
  - Footer "Você pode customizar tudo depois em Perfil → Notificações."
  - Botão primário verde "Sim, ativar notificações"
  - Link cinza "Agora não"

**Fluxo "Sim":**
- ✅ Modal fecha
- ✅ iOS dispara o hard prompt nativo ("Kindar would like to send you notifications")
- ✅ Se aceitar: push fica granted, próximas notifs funcionam
- ✅ Se negar: push fica denied, mas modal não aparece de novo

**Fluxo "Agora não":**
- ✅ Modal fecha
- ✅ iOS NÃO pergunta nada
- ✅ Modal não reaparece (até user usar `/perfil/notificacoes` → "Restaurar padrão" — que reabre o flag)

**Esperado NÃO acontecer:**
- ❌ iOS hard prompt aparecer ANTES do soft prompt
- ❌ Soft prompt aparecer 2× pra mesma instalação

---

## P1.3 — "Pediatra orientou não dar" — opção nova de adiar vacina

**Repro:**
1. Saúde → Vacinas → criança com vacina pendente
2. Toque em **Adiar** no card
3. Menu deve mostrar **4 opções** (antes eram 3):
   - "Adiar 7 dias"
   - "Adiar 30 dias"
   - "Já agendei"
   - **"👨‍⚕️ Pediatra orientou não dar"** (NOVA)

**Esperado clicando na nova:**
- ✅ Toast "Pendência adiada"
- ✅ Card some
- ✅ Vacina NÃO reaparece após 30 dias (TTL real é 365 dias)
- ✅ Cron de notificação NÃO envia push de "reentrada" pra essa dose

**Como confirmar no DB (dev only):**
```sql
SELECT reason, dismissed_until 
FROM vaccine_notification_dismissals 
WHERE user_id = '<seu_id>' AND child_id = '<crianca_id>'
ORDER BY created_at DESC LIMIT 1;
```
- ✅ `reason` deve ser `medical_advice`
- ✅ `dismissed_until` deve estar daqui a ~1 ano

---

## P1.4 — Time-Sensitive notifications (iOS — só 1.0.13+)

**Pré-requisito:** iPhone com iOS 15+ E versão 1.0.13 instalada (App Store update mais recente, ~22/maio).

**Repro Activity Reminder:**
1. Crie atividade pra ~1h15min adiante
2. Chip "Quando me lembrar?" → **1h antes**
3. **Ative Modo Foco** no iPhone (Não Perturbe, Sono ou Trabalho — qualquer um)
4. Confirma em Settings → Notifications → Kindar → **Time Sensitive Notifications** está **ON**
5. Aguarda 1h após criação (cron dispara em janela de ±8min)

**Esperado:**
- ✅ Push **atravessa o Foco** e aparece na Lock Screen
- ✅ Permanece 1h na Lock Screen (vs 5min de notif normal)
- ✅ Body inclui nome da criança + atividade

**Variante: emergência médica grave (Foundation Collab urgent)**
1. Tester A com Foco ativo
2. Tester B (coparente) registra "Episódio de doença" com severity = **grave**
3. Tester A deve receber push atravessando Foco (priority='urgent' → time-sensitive automático)

**Esperado NÃO acontecer:**
- ❌ Push silenciado quando Foco ativo (era o comportamento pré-1.0.13)
- ❌ Som diferente (Time-Sensitive NÃO muda som — só comportamento de entrega)

**Validar que continua RESPEITANDO modo silencioso físico:**
- Coloca iPhone no silencioso (chave física Mute na lateral)
- Time-Sensitive NÃO atravessa silent mode (só Critical Alerts atravessam, que Kindar NÃO tem)

---

# P2 — Acentuação pt-BR sweep

Lista de textos que devem aparecer **com acento correto** (eram crus antes):

## P2.1 — Em telas Native

| Tela | Texto esperado | Onde estava errado |
|------|----------------|--------------------|
| Tab Saúde (header) | "Saúde" | "Saude" |
| Tab Saúde (card criança em tratamento/observação) | "Em observação" | "Em observacao" |
| Tab Saúde (card criança saudável) | "Saudável" | "Saudavel" |
| Tab Saúde (seção histórico) | "Histórico" | "Historico" |
| Dashboard (tile Saúde) | "Saúde" | "Saude" |
| Saúde → Detalhe doença | "Diagnóstico", "Início", "Observação" | "Diagnostico", "Inicio", "Observacao" |
| Saúde → Registrar | "Sintoma / Doença", "Médico, dentista", "Remédio", "Nota livre sobre a saúde" | "Doenca", "Medico", "Remedio", "saude" |
| Decisão categoria Saúde | "Saúde" | "Saude" |
| Convite enviar (seção passados) | "Histórico" | "Historico" |
| Saldo de custódia (Histórico de operações) | "Histórico de operações" | "Historico de operacoes" |
| Propor ajuste de saldo | "Observação (opcional)" | "Observacao (opcional)" |
| Família tab Saúde | "Saúde" | "Saude" |

## P2.2 — Em pt.json (testar carregando interfaces que usam)

| Chave | Texto esperado |
|-------|----------------|
| `tabHealth` | "Saúde" |
| `catHealth` | "Saúde" |
| `diagnosis` | "Diagnóstico" |
| `noteOptional` | "Observação (opcional)" |
| `paymentMethod` | "Método de pagamento" |
| `paymentHistory` | "Histórico de pagamentos" |
| `illnessTitle` | "Episódios de Doença" |
| `noteCategory.observacao.label` | "Observação" |
| `noteCategory.preparacao.label` | "Preparação" |
| `noteCategory.juridico.label` | "Jurídico" |
| `notInformed` | "Não informado" |
| `insurance` | "Convênio" |
| `adherence` | "Aderência" |
| `notes` (em todos contextos) | "Observações" |
| `description` | "Descrição" |
| `title` (Notificações) | "Notificações" |
| `catMusic` | "Música" |
| `healthInsurance` | "Plano de saúde" |
| `startDate` | "Data de início" |
| `grade` | "Série/Ano" |
| `gradePlaceholder` | "Ex: 3º ano" |
| `activityMissed` | "Não aconteceu" |
| `dateError` (data inválida) | "A data de início não pode ser posterior à data de fim." |
| `passwordsMismatch` | "As senhas não coincidem." |
| `noDataInPeriod` | "Nenhum registro de saúde no período." |
| `repeatHint` (atividade recorrente) | "Selecione a data de início no dia da semana desejado." |

**Como testar:** abra cada uma dessas telas/fluxos e confira visualmente.

---

# P3 — Foundation técnica (regressão)

Não devem ter quebrado pelo trabalho de hoje:

## P3.1 — Marcar vacina como tomada (fluxo principal)
- [ ] Card pendente → "Marquei como tomada" → form abre → confirma data → toast → card some → aparece em Histórico
- [ ] Vacina aparece no calendário compartilhado como `child_activity` kind=health
- [ ] Coparente recebe push "Vacina registrada" (categoria: `vaccine_alerts`)

## P3.2 — Hero da saúde preventiva
- [ ] Contadores corrigem após snooze (P0.1) — não persiste 1 reforço quando todos foram adiados
- [ ] Tile dashboard reflete contagem real

## P3.3 — Push de vacina via cron diário (09 BRT)
- [ ] Se há vacina pendente: push amanhã 09 BRT
- [ ] Vacina snoozed (testada em P0.1) NÃO deve disparar push até TTL expirar

## P3.4 — Login + Face ID + Onboarding
- [ ] App abre normal pós-OTA
- [ ] Login Apple/Google funciona
- [ ] Face ID desbloqueia (regressão do bug 1.0.7)

## P3.5 — Atividades pré-existentes
- [ ] Atividades criadas em 1.0.11/anterior continuam no calendário
- [ ] Lembretes T-(lead) configurados continuam disparando

## P3.6 — Foundation Collab + Read receipts
- [ ] Coparente cria consulta médica → user recebe push (categoria health_collab)
- [ ] User abre card → "Visto por X · HH:MM" aparece
- [ ] Coparente vê o "Visto por"

## P3.7 — Chat normal (não-bug)
- [ ] User envia mensagem texto → coparente recebe
- [ ] User envia mensagem com imagem → coparente recebe + thumbnail
- [ ] Mensagem do sistema (chat-notify de check-in etc.) aparece como card central

---

# Cenários multi-plataforma

## Coparente A em iOS + Coparente B em Android

1. A muta "Chat" em /perfil/notificacoes
2. B manda 3 mensagens
3. A NÃO recebe push (categoria mutada server-side)
4. A vê as 3 mensagens no inbox in-app

## Coparente A em PWA + Coparente B em Native iOS

1. A entra em /perfil/notificacoes via PWA (browser desktop)
2. A muta "Despesas"
3. B no native cria uma despesa
4. A NÃO recebe push (server-side respeita)
5. A vê notificação no inbox web

## User com Foco ativo recebe vacina urgente vs normal

1. User com Foco "Trabalho" ativo no iOS
2. Cron 09 BRT dispara push "vacina overdue" (categoria: vaccine_alerts, priority info)
3. Push **NÃO** atravessa Foco (correto — vacina é info, não urgent)
4. Coparente registra criança com febre alta (illness severity=grave)
5. Trigger SQL promove pra urgent → Time-Sensitive
6. Push **ATRAVESSA** Foco (correto — urgência médica)

## Quiet hours respeitado mas urgente passa

1. User configura quiet hours 22:00 → 07:00
2. Às 03:00 BRT, coparente registra atividade nova
3. Activity_reminders disparado às 03:00? Não — cron só roda a cada 15min e atividade é futura
4. Mas se rolar algo dentro quiet hours: cron NÃO envia push (skipa)
5. Excepcionalmente: criança grave → push urgent atravessa quiet hours

---

# Checklist final

## Ambiente
- [ ] Testei em **iOS 1.0.13** (App Store update mais recente)
- [ ] Testei em **iOS com OTA aplicada** sobre 1.0.11 (validar bundle compatível)
- [ ] Testei em **Android 1.0.11+ com OTA aplicada**
- [ ] Testei em **PWA navegador desktop** (Chrome/Safari)
- [ ] Testei em **PWA navegador mobile** (Safari iOS, Chrome Android)

## Cenários
- [ ] Conta nova (signup → soft prompt)
- [ ] Conta existente com push já granted
- [ ] Conta existente com push denied
- [ ] Conta com 1 criança vs múltiplas crianças
- [ ] Coparente único vs grupo 3+
- [ ] Offline → online transition

## Acessibilidade
- [ ] VoiceOver iOS lê labels corretamente em /perfil/notificacoes
- [ ] Switch states (on/off) anunciam corretamente
- [ ] Botões críticos têm accessibilityHint

## Performance
- [ ] Tela /perfil/notificacoes carrega <1s
- [ ] Toggle de categoria reflete em <500ms (optimistic UI)
- [ ] OTA aplicada sem app travar
- [ ] Cold start não regrediu (compara antes/depois)

## Telemetria
- [ ] Eventos `notification_skipped` aparecem em PostHog com reason
- [ ] Eventos `soft_prompt_shown/accepted/declined` aparecem
- [ ] Eventos `notification_sent` mantém volume esperado

---

**Esperamos os bugs até dia 24/maio (final de semana) pra incluir num próximo build se houver crítico.**

Boa testagem! 🚀
