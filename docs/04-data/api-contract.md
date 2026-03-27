# Catalogo de Server Actions — Kindar

> Referencia completa de todas as Server Actions (Next.js 16).
> Todas as actions usam `"use server"` e recebem `FormData` ou parametros tipados.

---

## Padrao de Autorizacao

Todas as actions seguem o mesmo padrao:

```
1. Obter usuario autenticado via supabase.auth.getUser()
2. Verificar membership no grupo via verifyGroupMembership() ou getActiveGroup()
3. Validar dados de entrada
4. Executar operacao no Supabase
5. Enviar notificacao push (quando aplicavel)
6. Postar no chat do grupo (quando aplicavel)
7. Revalidar paths afetados
8. Redirecionar ou retornar resultado
```

**Padrao de erro:** Redirect com `?error=` ou `return { error: "mensagem" }`
**Padrao de sucesso:** Redirect com `?success=` ou `return { success: true }`

---

## 1. Autenticacao (`src/actions/auth.ts`)

| Action | Parametros (FormData) | Retorno | Descricao |
|---|---|---|---|
| `signUp` | email, password, fullName, convite? | redirect → /verify-email | Cadastro com email/senha |
| `signIn` | email, password, convite? | redirect → /dashboard ou /convite/{token} | Login |
| `signOut` | — | redirect → /login | Logout |
| `resetPassword` | email | { success } ou { error } | Envio de email de recuperacao |
| `signInWithOAuth` | provider: "google"\|"apple"\|"facebook", redirectPath? | redirect → URL do OAuth | Login social |
| `updatePassword` | password | redirect → /dashboard | Atualizar senha (pos-recovery) |

**Eventos PostHog:** `user_signup`, `user_login`, `password_reset`

---

## 2. Grupo (`src/actions/group.ts`)

| Action | Parametros | Retorno | Descricao |
|---|---|---|---|
| `createGroup` | name, childName?, childBirthDate? | { success } ou { error } | Criar grupo + adicionar criador como admin |
| `addChild` | groupId, fullName, birthDate, allergies?, notes? | redirect → /criancas | Adicionar filho ao grupo |
| `updateChild` | id, fullName, birthDate, allergies?, notes?, cpf?, rg? | redirect → /criancas/{id} | Atualizar dados do filho |

**Autorizacao:** `verifyGroupMembership()` para addChild/updateChild. createGroup cria membership automaticamente.

---

## 3. Membros e Convites (`src/actions/members.ts`, `invitation.ts`)

| Action | Parametros | Retorno | Autorizacao |
|---|---|---|---|
| `createInvitation` | groupId, email, role?, returnTo? | redirect com token | Somente admin |
| `acceptInvitation` | token (string arg) | redirect → /dashboard | Qualquer usuario autenticado |
| `autoAcceptPendingInvitations` | — | boolean | Automatico no login |
| `changeMemberRole` | memberId, groupId, newRole | redirect → /familia | Somente admin |
| `removeMember` | memberId, groupId | redirect → /familia | Somente admin |
| `leaveGroup` | groupId | redirect → /dashboard ou /onboarding | Qualquer membro (admin precisa promover outro) |
| `cancelInvitation` | invitationId | redirect → /familia | Somente admin |
| `deleteInvitation` | invitationId, returnTo? | redirect | Somente admin, nao aceitos |

**Eventos PostHog:** `invitation_sent`, `invitation_accepted`, `invitation_auto_accepted`

---

## 4. Troca de Grupo (`src/actions/group-switch.ts`)

| Action | Parametros | Retorno | Descricao |
|---|---|---|---|
| `switchGroup` | groupId | redirect → /dashboard | Salva activeGroupId em cookie (1 ano) |

---

## 5. Calendario (`src/actions/calendar.ts`)

| Action | Parametros | Retorno | Descricao |
|---|---|---|---|
| `createCustodyEvent` | groupId, childId, responsibleUserId, startDate, endDate, custodyType, notes?, startTime?, endTime?, isRecurring?, recurrenceRule?, recurrenceUntil? | redirect → /calendario | Criar evento de guarda (unico ou recorrente) |
| `createSwapRequest` | groupId, originalDate, proposedDate?, reason?, targetUserId, requestType? | { success } ou { error } | Solicitar troca/visita/divida |
| `respondToSwapRequest` | requestId, response: "approved"\|"rejected" | { success } ou { error } | Aceitar/recusar troca (cria swap events) |
| `generateSchedule` | groupId, childId, pattern (JSON), startDate, months | { success, count } ou { error } | Gerar escala quinzenal (delete+insert atomico) |
| `getOrCreateCalendarToken` | groupId (string arg) | { token } ou { error } | Token para assinatura iCal |

**Logica complexa em `generateSchedule`:**
1. Parseia pattern de 14 posicoes (2 semanas)
2. Gera custody_events agrupando dias consecutivos do mesmo pai
3. Delete atomico dos eventos `regular` anteriores
4. Insert em batches de 100
5. Rollback (restaura eventos antigos) se houver erro
6. Salva config em `custody_schedules` (upsert)

**Notificacoes push:** createSwapRequest → target_user; respondToSwapRequest → requester
**Chat automatico:** Ambas postam mensagem no chat do grupo

---

## 6. Eventos Sociais (`src/actions/events.ts`)

| Action | Parametros | Retorno | Autorizacao |
|---|---|---|---|
| `createEvent` | groupId, childId?, title, description?, eventDate, eventTime?, location?, image? (File) | redirect → /calendario | Membro do grupo |
| `updateEvent` | eventId, groupId, childId?, title, description?, eventDate, eventTime?, location? | redirect → /calendario | Criador ou admin |
| `deleteEvent` | eventId, groupId | redirect → /calendario | Criador ou admin |
| `cancelEvent` | eventId, groupId | redirect → /calendario | Criador ou admin (soft-delete) |

---

## 7. Despesas (`src/actions/expenses.ts`)

| Action | Parametros | Retorno | Descricao |
|---|---|---|---|
| `createExpense` | groupId, childId?, category, description, amount, expenseDate, splitRatio? (JSON), receipt? (File) | redirect → /despesas | Criar despesa com upload opcional de comprovante |
| `updateExpenseStatus` | expenseId, status, rejectionReason? | redirect → /despesas | Aprovar/rejeitar (nao pode aprovar a propria, exceto admin) |
| `deleteExpense` | expenseId | redirect → /despesas | Somente criador, somente se nao aprovada |

**Validacoes:**
- amount: > 0, <= 999999.99, Number.isFinite
- splitRatio: JSON com valores 0-100 que somam 100
- receipt: max 5MB, tipos: image/jpeg, image/png, image/heic, image/heif, application/pdf

**Eventos PostHog:** `expense_created`
**Notificacoes push:** Para todos os outros membros do grupo
**Chat automatico:** Posta mensagem com valor e descricao

---

## 8. Acertos Financeiros (`src/actions/settlements.ts`)

| Action | Parametros | Retorno | Descricao |
|---|---|---|---|
| `createSettlement` | groupId, paidTo, amount, paymentMethod?, referenceNote?, settlementDate? | redirect → /financeiro | Registrar pagamento |
| `confirmSettlement` | settlementId | redirect → /financeiro | Confirmar recebimento (somente destinatario) |

**Validacoes:** Nao pode pagar a si mesmo. Destinatario deve ser membro do grupo.
**Eventos PostHog:** `settlement_created`, `settlement_confirmed`

---

## 9. Saude (`src/actions/health.ts`)

| Action | Parametros | Retorno | Descricao |
|---|---|---|---|
| `createHealthLog` | groupId, childId, logType, value?, notes? | redirect → /saude | Registro generico de saude |
| `createProfessional` | groupId, name, specialty?, crm?, phone?, whatsapp?, address?, notes? | redirect → /saude/profissionais | Cadastrar medico/profissional |
| `createAppointment` | groupId, childId, professionalId?, title, appointmentDate, appointmentTime, location?, notes?, appointmentType?, returnDate?, returnNotes? | redirect → /saude/consultas | Agendar consulta (cria calendar event) |
| `updateAppointmentStatus` | appointmentId, status, summary?, returnDate?, returnNotes? | redirect → /saude/consultas | Atualizar status (cancela calendar event se cancelled) |
| `completeAppointment` | appointmentId, summary?, diagnosis?, prescriptions?, returnDate?, returnNotes? | redirect → /saude/consultas | Concluir consulta com resumo |
| `createMedication` | groupId, childId, name, dosage, frequency, frequencyHours?, reason?, prescribedBy?, startDate, endDate?, notes? | redirect → /saude/medicamentos | Adicionar medicamento |
| `logMedicationDose` | medicationId, redirectTo? | redirect | Confirmar dose administrada |
| `updateMedicationStatus` | medicationId, status | redirect → /saude/medicamentos | Pausar/completar/cancelar medicamento |
| `createIllnessEpisode` | groupId, childId, title, symptoms (CSV), startDate, diagnosis?, notes?, severity?, hospitalVisit?, hospitalName?, hospitalDate? | redirect → /saude/doencas | Registrar episodio de doenca |
| `updateIllnessEpisode` | episodeId, status?, endDate?, diagnosis? | redirect → /saude/doencas | Atualizar/resolver episodio |
| `addIllnessEvolution` | episodeId, evolutionNote | redirect → /saude/doencas | Adicionar nota de evolucao (append ao notes) |
| `createAllergy` | groupId, childId, name, allergyType?, severity?, reaction? | redirect → /saude/alergias | Registrar alergia |
| `upsertMedicalInfo` | childId, groupId, bloodType?, insuranceName?, insuranceNumber?, susNumber?, primaryPediatricianId? | redirect → /saude/alergias | Upsert info medica (1:1) |
| `createVaccinationRecord` | groupId, childId, vaccineName, doseLabel?, administeredDate, batchNumber?, location?, notes? | redirect → /saude/vacinas | Registrar vacina |
| `createGrowthRecord` | groupId, childId, measuredDate, weightKg?, heightCm?, headCm?, notes? | redirect → /saude/crescimento | Registrar medida de crescimento |
| `trackHealthView` | recordType, recordId?, childId, groupId | void | Marcar registro como visualizado |

**Chat automatico:** createMedication, createIllnessEpisode, addIllnessEvolution

---

## 10. Educacao (`src/actions/children.ts`)

| Action | Parametros | Retorno | Descricao |
|---|---|---|---|
| `upsertChildEducation` | childId, groupId, school_name, school_address, school_phone, grade, class_name, teacher_name, coordinator_name, entry_time, exit_time, extracurricular_activities (CSV) | redirect → /criancas/{id}?tab=educacao | Upsert dados escolares |
| `uploadChildDocument` | groupId, childId, category, name, file (File) | redirect → /criancas/{id}?tab=documentos | Upload documento do filho |

---

## 11. Escola (`src/actions/school.ts`)

| Action | Parametros | Retorno | Descricao |
|---|---|---|---|
| `createSchoolLog` | groupId, childId, logType, title, description?, logDate? | redirect → /escola | Registrar ocorrencia escolar |

**logTypes:** grade, meeting, behavior, homework, event, absence, achievement, concern, other

---

## 12. Check-in Diario (`src/actions/checkin.ts`)

| Action | Parametros | Retorno | Descricao |
|---|---|---|---|
| `createCheckin` | groupId, childId, category, title, description? | { success } ou { error } | Registrar check-in + enviar ao chat |

**Categories:** screen_time, food, sleep, mood, health, activity, school, other

---

## 13. Decisoes (`src/actions/decisions.ts`)

| Action | Parametros | Retorno | Descricao |
|---|---|---|---|
| `createDecision` | groupId, title, description?, category, deadline? | redirect → /decisoes | Criar decisao |
| `castVote` | decisionId, vote | redirect → /decisoes | Votar (upsert) + auto-resolver |
| `addArgument` | decisionId, argumentType (pro/contra), text | redirect → /decisoes | Adicionar argumento |

**Logica de auto-resolucao:**
- Apos cada voto, verifica se todos os membros votaram
- Se ha `discordo` → `rejeitada`; se todos `concordo` → `aprovada`
- Envia push notification ao criador e post no chat

---

## 14. Acordos (`src/actions/agreements.ts`)

| Action | Parametros | Retorno | Descricao |
|---|---|---|---|
| `createAgreement` | groupId, title, description, category, isNonNegotiable? | redirect → /acordos | Criar acordo/regra |
| `acceptAgreement` | agreementId | redirect → /acordos | Aceitar acordo (accepted_by + accepted_at) |

---

## 15. Atividades (`src/actions/activities.ts`)

| Action | Parametros | Retorno | Descricao |
|---|---|---|---|
| `createActivity` | name, category, childId?, recurrenceType, daysOfWeek?, dayOfMonth?, startDate, endDate?, customInterval?, customUnit?, timeStart?, timeEnd?, location?, notes?, checklistItems? (JSON) | redirect → /calendario | Criar atividade recorrente com checklist |
| `deleteActivity` | activityId (string arg) | redirect → /calendario | Deletar atividade |
| `toggleChecklistItem` | activityId, itemId, occurrenceDate, completed (args) | { success } | Marcar/desmarcar item do checklist |
| `sendActivityReminders` | — | { sent: number } | Cron: enviar lembretes para atividades de amanha |

---

## 16. Notas Privadas (`src/actions/notes.ts`)

| Action | Parametros | Retorno | Descricao |
|---|---|---|---|
| `createNote` | groupId, childId?, category, title, content?, noteDate? | redirect → /notas | Criar nota privada |
| `updateNote` | noteId, title, content?, category?, childId?, noteDate? | redirect → /notas | Atualizar nota |
| `deleteNote` | noteId | redirect → /notas | Deletar nota |

**RLS:** Somente o proprio usuario ve/edita/deleta suas notas.

---

## 17. Temas Sensiveis (`src/actions/sensitive.ts`)

| Action | Parametros | Retorno | Descricao |
|---|---|---|---|
| `createSensitiveNote` | groupId, childId?, topic, title, content, sourceUrl?, isUrgent? | redirect → /temas-sensiveis | Registrar nota sensivel |

**Topics:** gender_violence, sexual_violence, bullying, mental_health, substance_abuse, safety, other

---

## 18. Documentos (`src/actions/documents.ts`)

| Action | Parametros | Retorno | Descricao |
|---|---|---|---|
| `createDocument` | groupId, childId?, category, name, file (File) | redirect → /documentos | Upload de documento |

**Limite:** 10MB por arquivo. Storage bucket: `documents`.

---

## 19. Chat Channels (`src/actions/chat-channels.ts`)

| Action | Parametros | Retorno | Descricao |
|---|---|---|---|
| `ensureDefaultChannels` | groupId (string arg) | ChatChannel[] | Cria canal "geral" + canais por filho se nao existem |
| `markChannelRead` | channelId (string arg) | void | Marca canal como lido (upsert) |

---

## 20. Perfil (`src/actions/profile.ts`)

| Action | Parametros | Retorno | Descricao |
|---|---|---|---|
| `updateProfile` | fullName | { success } ou { error } | Atualizar nome do perfil |

---

## Resumo Quantitativo

| Dominio | Actions | Arquivo |
|---|---|---|
| Auth | 6 | auth.ts |
| Grupo/Filhos | 3 | group.ts |
| Membros/Convites | 8 | members.ts, invitation.ts |
| Troca de grupo | 1 | group-switch.ts |
| Calendario | 5 | calendar.ts |
| Eventos sociais | 4 | events.ts |
| Despesas | 3 | expenses.ts |
| Acertos | 2 | settlements.ts |
| Saude | 16 | health.ts |
| Educacao | 2 | children.ts |
| Escola | 1 | school.ts |
| Check-in | 1 | checkin.ts |
| Decisoes | 3 | decisions.ts |
| Acordos | 2 | agreements.ts |
| Atividades | 4 | activities.ts |
| Notas | 3 | notes.ts |
| Temas sensiveis | 1 | sensitive.ts |
| Documentos | 1 | documents.ts |
| Chat channels | 2 | chat-channels.ts |
| Perfil | 1 | profile.ts |
| **TOTAL** | **69** | **21 arquivos** |

---

## Tratamento de Erros

### Padrao de Redirect com Erro
```typescript
redirect("/pagina?error=" + encodeURIComponent(error.message));
```

### Padrao de Retorno com Erro
```typescript
return { error: "Mensagem em portugues" };
```

### Erros de Autenticacao
Todas as actions verificam `supabase.auth.getUser()`. Se nao autenticado:
- Redirect para `/login` (maioria das actions)
- Return `{ error: "Nao autenticado" }` (actions que retornam JSON)

### Erros de Autorizacao
Verificacao de membership via `verifyGroupMembership()` ou `getActiveGroup()`. Se nao autorizado:
- Redirect para `/dashboard?error=Sem+permissao+para+este+grupo`

---

## Recomendacoes de Rate Limiting

| Endpoint | Limite Recomendado | Justificativa |
|---|---|---|
| signUp, signIn | 5/min por IP | Prevenir brute force |
| resetPassword | 1/60s por email | Ja limitado pelo Supabase |
| createExpense | 20/min por usuario | Prevenir spam |
| createCheckin | 30/min por usuario | Frequencia alta esperada |
| chat_messages (via Realtime) | 60/min por usuario | Conversa ativa |
| createSwapRequest | 5/min por usuario | Prevenir spam de trocas |
| uploadDocument | 10/min por usuario | Uploads pesados |
| generateSchedule | 3/min por grupo | Operacao custosa (batch insert) |
