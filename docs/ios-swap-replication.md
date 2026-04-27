# Documento Técnico: Fluxo de Troca de Dia de Guarda — Replicação no iOS

**Branch:** `fix/swap-request-own-day-and-approval`  
**Commits:** `eab08a7`, `2e263a5`  
**Data:** 2026-04-23  
**Autor:** Angelino Barata

---

## 1. Descrição da Regra Corrigida

### Contexto

O calendário do Kindar exibe os dias de guarda de cada responsável. Qualquer responsável pode solicitar a troca de um dia — seja um dia do outro responsável **ou um dia seu próprio**.

Após a correção, o fluxo completo garante:

1. Ambos os responsáveis podem iniciar uma solicitação de troca (qualquer dia futuro com guarda definida).
2. A solicitação sempre é direcionada ao **outro** responsável como alvo da aprovação.
3. Somente o **alvo** (`target_user_id`) pode aprovar ou rejeitar — nem na UI nem no servidor o solicitante pode aprovar a própria solicitação.
4. Ao aprovar, a guarda do dia é transferida para o responsável correto (o original perde, o outro recebe).
5. O balanço de trocas é atualizado somente no momento da aprovação (via `custody_events`), nunca na criação da solicitação.

---

## 2. Antes vs. Depois

### 2.1 Condição de exibição do botão de solicitação (`DayDetailSheet.tsx`)

**Antes:**
```ts
const canRequestSwap = isOtherParentDay && isFutureDate && !pendingSwapForDay;
```
> Bloqueava o botão quando o dia selecionado era do próprio usuário logado.

**Depois:**
```ts
const canRequestSwap = !!dayInfo && isFutureDate && !pendingSwapForDay;
```
> Permite solicitar troca em qualquer dia futuro que tenha guarda definida — seja do outro responsável ou do próprio.

---

### 2.2 Determinação do destinatário da solicitação (`DayDetailSheet.tsx`)

**Antes:**
```ts
formData.set("targetUserId", dayInfo?.userId || "");
```
> Quando o dia era do próprio usuário (`dayInfo.userId === currentUserId`), o alvo era o próprio solicitante — causando que a notificação fosse enviada a si mesmo e que o botão de aprovar aparecesse para o solicitante.

**Depois:**
```ts
const isOwnDay = dayInfo?.userId === currentUserId;
const targetId = isOwnDay
  ? Object.keys(memberNames).find((id) => id !== currentUserId) || ""
  : dayInfo?.userId || "";
formData.set("targetUserId", targetId);
```
> Sempre aponta para o **outro** responsável como alvo da aprovação.

---

### 2.3 Direção da transferência de guarda na aprovação (`calendar.ts`)

**Antes:**
```ts
responsible_user_id: req.requester_id,
```
> Sempre atribuía o dia aprovado ao solicitante, independentemente de quem era o dono original — quebrado quando o solicitante já era o dono do dia.

**Depois:**
```ts
responsible_user_id: origEvents[0].responsible_user_id === req.requester_id
    ? req.target_user_id   // solicitante era dono → alvo recebe o dia
    : req.requester_id,    // alvo era dono → solicitante recebe o dia
```
> A transferência é determinada pelo `responsible_user_id` do evento original de guarda, garantindo que sempre seja o outro responsável que recebe o dia.

---

### 2.4 Deduplicação de notificações push (`push.ts`)

**Antes:**
```ts
tag: type,
```
> Quando várias notificações eram enviadas com o mesmo `type` (ex.: `"swap_request"`), a Web Push API/SO colapsava todas as notificações com a mesma tag — resultando em apenas 1 de 4 notificações sendo exibida.

**Depois:**
```ts
tag: `${type}-${Date.now()}`,
```
> Cada notificação recebe uma tag única, impedindo colapso.

---

## 3. Estrutura de Dados

### Tabela `swap_requests`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | uuid | PK |
| `group_id` | uuid | Grupo de coparentalidade |
| `requester_id` | uuid | Usuário que iniciou a solicitação |
| `target_user_id` | uuid | Usuário que deve aprovar/rejeitar |
| `original_date` | date | Dia cuja guarda será trocada |
| `proposed_date` | date | Dia alternativo proposto (pode ser null) |
| `status` | text | `"pending"`, `"approved"`, `"rejected"` |
| `message` | text | Mensagem opcional do solicitante |
| `created_at` | timestamptz | |

### Tabela `custody_events`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | uuid | PK |
| `group_id` | uuid | |
| `responsible_user_id` | uuid | Responsável pela guarda neste dia |
| `start_date` | date | Início do período |
| `end_date` | date | Fim do período |
| `custody_type` | text | `"regular"`, `"swap"`, `"exception"` |
| `created_at` | timestamptz | |

> **Regra de prioridade:** `buildCustodyMap` itera eventos ordenados por `start_date`. O **último evento vence** por dia. Eventos `custody_type = "swap"` sempre têm `start_date` mais recente que o evento regular que sobrepõem, portanto sempre ganham.

---

## 4. Fluxo Completo Passo a Passo

### Cenário validado: Angelino solicita troca do próprio dia (28/07)

```
1. Angelino abre o dia 28/07 no calendário
   → custody_events: responsible_user_id = Angelino.id
   → dayInfo.userId = Angelino.id
   → currentUserId = Angelino.id
   → isOwnDay = true
   → canRequestSwap = !!dayInfo && isFutureDate && !pendingSwapForDay = true ✅

2. Angelino clica em "Solicitar Troca" e envia o formulário
   → isOwnDay = true
   → targetId = memberNames keys find (id !== Angelino.id) = Amanda.id
   → createSwapRequest({
       groupId, requesterId: Angelino.id,
       targetUserId: Amanda.id,
       originalDate: "2026-07-28"
     })

3. Banco de dados após criação:
   swap_requests: {
     requester_id: Angelino.id,
     target_user_id: Amanda.id,
     original_date: "2026-07-28",
     status: "pending"
   }
   custody_events: INALTERADO (balanço não muda aqui) ✅

4. Push notification enviada para Amanda
   tag: "swap_request-<timestamp>" → única, não colapsa ✅

5. UI para Angelino:
   → pendingSwapForDay = true
   → canRequestSwap = false (botão some) ✅
   → ponto âmbar visível em 28/07 ✅
   → SwapRequestList mostra a solicitação
   → isTarget = (Amanda.id === Angelino.id) = false → sem botões aprovar/rejeitar ✅

6. UI para Amanda:
   → ponto âmbar visível em 28/07 ✅
   → SwapRequestList: isTarget = (Amanda.id === Amanda.id) = true → botões visíveis ✅

7. Amanda clica em "Aprovar"
   → respondToSwapRequest(requestId, "approved")
   → Servidor: req.target_user_id === user.id → Amanda.id === Amanda.id ✅ (passa guard)

8. Lógica de aprovação (calendar.ts):
   origEvents[0].responsible_user_id = Angelino.id
   origEvents[0].responsible_user_id === req.requester_id
     → Angelino.id === Angelino.id → true
     → responsible_user_id = req.target_user_id = Amanda.id

   INSERT custody_events: {
     responsible_user_id: Amanda.id,
     start_date: "2026-07-28",
     end_date: "2026-07-28",
     custody_type: "swap"
   }

9. Resultado no calendário:
   → buildCustodyMap: evento "swap" mais recente vence
   → 28/07 exibe cor de Amanda ✅
   → computeSwapBalance: Angelino -1, Amanda +1 ✅
```

---

## 5. Pontos Críticos de Implementação

### 5.1 Guard dupla contra auto-aprovação

A proteção existe em **duas camadas** e **ambas devem ser mantidas**:

**Camada 1 — UI** (`SwapRequestList.tsx`):
```ts
const isTarget = req.target_user_id === currentUserId;
{isPending && isTarget && <ApproveRejectButtons />}
```

**Camada 2 — Servidor** (`calendar.ts`, `respondToSwapRequest`):
```ts
if (!req || req.target_user_id !== user.id) {
  return { error: "Não autorizado" };
}
```

> ⚠️ Nunca remover a guard de servidor. A UI pode ser contornada.

### 5.2 `memberNames` deve conter todos os membros

Em `DayDetailSheet.tsx`, `memberNames` é um `Record<string, string>` passado pelo `CalendarClient`. A lógica de `targetId` usa `Object.keys(memberNames).find(id => id !== currentUserId)`.

> Se o grupo tiver **mais de 2 membros**, essa lógica pode escolher um membro aleatório. Para o caso atual (2 responsáveis por grupo), está correto.

### 5.3 Ordem de eventos no `buildCustodyMap`

A query que alimenta `buildCustodyMap` **deve ordenar por `start_date` ASC** para que o último evento vença. Qualquer alteração na query de `custody_events` que mude a ordenação quebra a sobreposição de swaps.

### 5.4 `proposed_date` pode ser null

A segunda parte da aprovação (troca do dia proposto) usa `req.proposed_date`. Se for `null`, o bloco de inserção do `proposed_date` é ignorado. Isso é correto e deve ser mantido.

### 5.5 Balanço não é afetado por solicitações pendentes

`computeSwapBalance` filtra apenas `custody_events`. Solicitações em `status: "pending"` **nunca alteram o balanço** — somente eventos inseridos na aprovação.

---

## 6. Dependências Envolvidas

| Arquivo | Papel |
|---|---|
| `src/app/(app)/calendario/DayDetailSheet.tsx` | Formulário de solicitação, lógica `canRequestSwap`, `targetId` |
| `src/app/(app)/calendario/SwapRequestList.tsx` | Listagem, guard UI de aprovação |
| `src/app/(app)/calendario/CalendarClient.tsx` | Build de `pendingSwapDates`, passa `memberNames` |
| `src/app/(app)/calendario/CalendarGrid.tsx` | Ponto âmbar visual |
| `src/app/(app)/calendario/page.tsx` | Query de `swap_requests` pendentes |
| `src/actions/calendar.ts` | `createSwapRequest`, `respondToSwapRequest`, lógica de aprovação |
| `src/lib/calendar-utils.ts` | `buildCustodyMap`, `computeSwapBalance` |
| `src/lib/push.ts` | Envio de push (web + APNs), deduplicação por tag |

---

## 7. Critérios de Teste

### 7.1 Testes manuais obrigatórios

| # | Ação | Resultado esperado |
|---|---|---|
| 1 | Abrir dia do outro responsável | Botão "Solicitar Troca" visível |
| 2 | Abrir dia próprio (futuro) | Botão "Solicitar Troca" visível |
| 3 | Abrir dia próprio (passado) | Botão NÃO visível |
| 4 | Solicitar troca de dia próprio | Notificação vai para o **outro** responsável |
| 5 | Verificar UI do solicitante após criar | Sem botão aprovar/rejeitar |
| 6 | Verificar UI do alvo após criar | Botão aprovar/rejeitar visível |
| 7 | Aprovar troca de dia do solicitante | Dia fica com cor do **alvo** no calendário |
| 8 | Aprovar troca de dia do alvo | Dia fica com cor do **solicitante** no calendário |
| 9 | Verificar balanço após aprovação | +1 para quem recebeu, -1 para quem cedeu |
| 10 | Verificar balanço na criação (antes de aprovar) | Sem alteração no balanço |
| 11 | Solicitar troca com pendente no mesmo dia | Botão NÃO visível (ponto âmbar, sem botão) |
| 12 | Enviar 4 notificações em sequência | Todas 4 aparecem no dispositivo (sem colapso) |

### 7.2 Testes de segurança

| # | Ação | Resultado esperado |
|---|---|---|
| S1 | Solicitante tenta aprovar via chamada direta à action | Erro "Não autorizado" |
| S2 | Usuário de outro grupo tenta aprovar | Erro "Não autorizado" |

---

## 8. Cuidados para Não Quebrar o App Nativo (iOS via Capacitor)

### 8.1 Push Notifications (APNs)

O app iOS usa **APNs** (não Web Push/VAPID). Os tokens APNs são armazenados na tabela `notifications` com `type='system', title='apns_token'`.

A função `sendPushToUser` em `src/lib/push.ts` **já envia para ambos**: Web Push (VAPID) e APNs nativamente. Nenhuma alteração no iOS é necessária para receber as notificações.

> Variáveis de ambiente necessárias para APNs:
> - `APNS_KEY_ID`
> - `APNS_TEAM_ID`  
> - `APNS_KEY_P8` (conteúdo do arquivo `.p8` com `\n` escapados)
> - `APNS_BUNDLE_ID` (default: `com.kindar.app`)

### 8.2 Capacitor WebView

O app iOS é um **WebView** que carrega a PWA. Todas as mudanças são em lógica de servidor/client React — não há código nativo a ser alterado.

As correções deste documento são **totalmente transparentes** para a camada Capacitor.

### 8.3 Registro do token APNs

O token APNs é registrado pelo app nativo via chamada à API `/api/push/apns-token` (ou equivalente). Certifique-se de que:
1. O token é registrado no login/abertura do app
2. O token é removido no logout (`removePushSubscription` ou equivalente para APNs)

### 8.4 Tag de notificação no iOS

A propriedade `tag` do Web Push não tem equivalente direto no APNs. No código atual, o campo `thread-id` do APNs recebe o valor do `tag`:

```ts
aps: {
  ...(payload.tag ? { "thread-id": payload.tag } : {}),
}
```

No iOS, `thread-id` agrupa notificações na Central de Notificações, mas **não substitui** notificações como o `tag` faz no Web Push. O problema original de colapso **não ocorre no iOS nativo** — ele era exclusivo do Web Push.

### 8.5 Build e deploy

Após merge em `main`:
1. **Vercel** faz deploy automático da PWA
2. **iOS via Capacitor:** se o WebView carrega URL de produção (`kindar.com.br`), o app iOS recebe as correções automaticamente no próximo carregamento — **sem nova submissão à App Store necessária**.
3. Se o app tiver assets nativos bundled (bundle estático), será necessária nova build com `npx cap sync` + submissão.

---

## 9. Instruções para Replicação Manual no iOS (se necessário)

Se por algum motivo for necessário replicar a lógica em código nativo Swift/Objective-C (ex.: migração futura do WebView para app nativo), os pontos de atenção são:

### 9.1 Determinação do alvo da solicitação

```swift
// Pseudo-código Swift
let isOwnDay = selectedDay.responsibleUserId == currentUser.id
let targetUserId = isOwnDay
    ? groupMembers.first(where: { $0.id != currentUser.id })?.id ?? ""
    : selectedDay.responsibleUserId
```

### 9.2 Direção da transferência na aprovação

```swift
// Pseudo-código Swift
let originalOwnerId = originalCustodyEvent.responsibleUserId
let newOwnerId = (originalOwnerId == swapRequest.requesterId)
    ? swapRequest.targetUserId   // solicitante cede → alvo recebe
    : swapRequest.requesterId    // alvo cede → solicitante recebe
```

### 9.3 Guard de segurança na aprovação

```swift
// Verificar SEMPRE antes de processar aprovação
guard swapRequest.targetUserId == currentUser.id else {
    throw AppError.unauthorized
}
```

---

## 10. Checklist de Deploy

- [ ] PR `fix/swap-request-own-day-and-approval` aprovado e mergeado em `main`
- [ ] Deploy Vercel concluído sem erros
- [ ] Teste manual do cenário 28/07 (Angelino solicita troca do próprio dia) em staging
- [ ] Verificar ponto âmbar no calendário para ambos os usuários
- [ ] Verificar que Angelino não vê botões de aprovação
- [ ] Verificar que Amanda vê e consegue usar botões de aprovação
- [ ] Após aprovação: confirmar cor do dia no calendário e balanço
- [ ] Testar envio de 4 notificações simultâneas → todas devem aparecer
- [ ] Verificar no iOS (APNs) que notificações chegam corretamente
- [ ] Confirmar que app iOS (Capacitor WebView) reflete as mudanças sem nova build

---

*Documento gerado em 2026-04-23. Referência: commits `eab08a7` e `2e263a5` no branch `fix/swap-request-own-day-and-approval`.*
