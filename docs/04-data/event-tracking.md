# Plano de Event Tracking — Kindar

> Eventos de analytics para PostHog. Guia de instrumentacao e definicao de funis.
> Integracao via `captureServerEvent()` (server-side) e `posthog.capture()` (client-side).
> Atualizado: 14/05/2026.
>
> **Cross-platform desde Maio/2026:** PostHog instrumentado em PWA + iOS + Android + server. Super-property `platform` (`web` | `ios` | `android` | `server`) carimba todo evento — permite breakdown de DAU/MAU e funis por plataforma. distinctId: `auth.users.id` em todas as superficies (mesmo user em PWA + native).
>
> **Eventos da Foundation Collab (Fases 1, 1B, 3) — adicionados pos-2026-05:**
> - `notification_sent` (server, recipient distinctId) — props: `record_type`, `actor_user_id`, `priority`, `coalesced` (bool), `coalesced_count`
> - `notification_opened` (client, ao abrir via deep link `?highlight=`) — props: `record_type`, `record_id`
> - `<module>_read` (server, no markRead) — props especificas por modulo (`log_id`, `expense_id`, etc.)
> - `unread_count` (client, dashboard mount) — props: `record_type`, `count`. Saude usa `record_type: 'saude_aggregate'` (tile consolidada).
> - `urgent_created` (server, priority='urgent' no create) — props: `record_type`
>
> **Eventos novos de Despesas (Fase 1B):**
> - `expense_edited` — props: `expense_id`, `status_was`, `reverted_to_pending`
> - `expense_cancelled` (cancel direto pre-aprovacao) — props: `expense_id`, `from_status`
> - `expense_cancel_requested` (approved → cancel_pending) — props: `expense_id`
> - `expense_cancel_approved` / `expense_cancel_rejected` (server, respondToCancelRequest)
> - `expense_reopened` (server, reopenApproval) — props: `expense_id`

---

## 1. Infraestrutura Atual

### Server-side (`src/lib/posthog-server.ts`)
```
captureServerEvent(distinctId, eventName, properties?)
```
- Usado nas Server Actions para eventos criticos
- `distinctId`: user.id ou email (antes do login)

### Client-side (`src/lib/posthog.ts`)
- PostHog JS SDK inicializado no layout
- Captura automatica de page views
- Feature flags para experimentos

---

## 2. Eventos por Categoria

### 2.1 Onboarding

| Evento | Propriedades | Trigger | Prioridade |
|---|---|---|---|
| `user_signup` | has_invite: boolean | signUp() | P0 |
| `user_login` | has_invite: boolean | signIn() | P0 |
| `oauth_login` | provider: string | signInWithOAuth() | P0 |
| `password_reset` | — | resetPassword() | P1 |
| `group_created` | group_id: string | createGroup() | P0 |
| `child_added` | group_id, child_age_months: number | addChild() | P0 |
| `invitation_sent` | group_id, role: string | createInvitation() | P0 |
| `invitation_accepted` | group_id, role: string | acceptInvitation() | P0 |
| `invitation_auto_accepted` | group_id, role: string | autoAcceptPendingInvitations() | P1 |
| `schedule_configured` | group_id, pattern_type: string, months: number, event_count: number | generateSchedule() | P0 |
| `onboarding_completed` | group_id, has_child: boolean, has_schedule: boolean | Dashboard load (ambos pais ativos) | P0 |
| `lgpd_consent_given` | — | Aceitar termos LGPD | P0 |

### 2.2 Engajamento — Calendario

| Evento | Propriedades | Trigger |
|---|---|---|
| `event_created` | group_id, custody_type, is_recurring, event_count? | createCustodyEvent() |
| `swap_requested` | group_id, request_type: swap\|visit\|debt | createSwapRequest() |
| `swap_responded` | group_id, response: approved\|rejected | respondToSwapRequest() |
| `social_event_created` | group_id, has_image: boolean, has_location: boolean | createEvent() |
| `ical_token_generated` | group_id | getOrCreateCalendarToken() |
| `calendar_viewed` | group_id, view_mode: month\|week | Page view calendario |

### 2.3 Engajamento — Comunicacao

| Evento | Propriedades | Trigger |
|---|---|---|
| `message_sent` | group_id, channel_slug, has_media: boolean, is_reply: boolean | Insert chat_messages |
| `channel_switched` | group_id, channel_slug | Troca de aba |
| `message_pinned` | group_id, message_id | Pin toggle |
| `checkin_logged` | group_id, category, child_id | createCheckin() |
| `checkin_viewed` | group_id, days_back: number | Page view checkin |

### 2.4 Engajamento — Decisoes

| Evento | Propriedades | Trigger |
|---|---|---|
| `decision_created` | group_id, category, has_deadline: boolean | createDecision() |
| `vote_cast` | group_id, decision_id, vote: concordo\|discordo\|pensar | castVote() |
| `decision_resolved` | group_id, status: aprovada\|rejeitada, time_to_resolve_hours: number | Auto-resolucao em castVote() |
| `argument_added` | group_id, decision_id, type: pro\|contra | addArgument() |

### 2.5 Engajamento — Financeiro

| Evento | Propriedades | Trigger |
|---|---|---|
| `expense_created` | group_id, category, amount, has_receipt: boolean, has_custom_split: boolean | createExpense() |
| `expense_status_changed` | group_id, status: approved\|rejected, has_rejection_reason: boolean | updateExpenseStatus() |
| `expense_deleted` | group_id | deleteExpense() |
| `settlement_created` | group_id, amount, payment_method | createSettlement() |
| `settlement_confirmed` | group_id, settlement_id | confirmSettlement() |
| `financial_dashboard_viewed` | group_id, total_balance: number | Page view financeiro |

### 2.6 Saude

| Evento | Propriedades | Trigger |
|---|---|---|
| `illness_registered` | group_id, child_id, severity, has_hospital_visit: boolean | createIllnessEpisode() |
| `illness_evolution_added` | group_id, episode_id | addIllnessEvolution() |
| `illness_resolved` | group_id, duration_days: number | updateIllnessEpisode(status=resolved) |
| `medication_added` | group_id, child_id, has_end_date: boolean | createMedication() |
| `medication_dose_logged` | group_id, medication_id | logMedicationDose() |
| `appointment_scheduled` | group_id, child_id, appointment_type, has_professional: boolean | createAppointment() |
| `appointment_completed` | group_id, has_diagnosis: boolean, has_prescriptions: boolean | completeAppointment() |
| `vaccine_recorded` | group_id, child_id, vaccine_name | createVaccinationRecord() |
| `growth_recorded` | group_id, child_id, has_weight: boolean, has_height: boolean | createGrowthRecord() |
| `allergy_registered` | group_id, child_id, severity | createAllergy() |
| `medical_info_updated` | group_id, child_id, fields_filled: number | upsertMedicalInfo() |
| `health_record_viewed` | group_id, record_type, viewed_by | trackHealthView() |
| `health_export_pdf` | group_id, child_id, sections: string[] | Export PDF (futuro) |

### 2.7 Educacao e Atividades

| Evento | Propriedades | Trigger |
|---|---|---|
| `education_info_updated` | group_id, child_id, fields_filled: number | upsertChildEducation() |
| `school_log_created` | group_id, child_id, log_type | createSchoolLog() |
| `activity_created` | group_id, child_id, category, recurrence_type, has_checklist: boolean | createActivity() |
| `activity_deleted` | group_id, activity_id | deleteActivity() |
| `checklist_item_toggled` | group_id, activity_id, completed: boolean | toggleChecklistItem() |

### 2.8 Documentos e Acordos

| Evento | Propriedades | Trigger |
|---|---|---|
| `document_uploaded` | group_id, category, file_size, mime_type | createDocument() |
| `agreement_created` | group_id, category, is_non_negotiable: boolean | createAgreement() |
| `agreement_accepted` | group_id, agreement_id | acceptAgreement() |
| `sensitive_note_created` | group_id, topic, is_urgent: boolean | createSensitiveNote() |
| `private_note_created` | group_id, category | createNote() |

### 2.9 Monetizacao (Futuro)

| Evento | Propriedades | Trigger |
|---|---|---|
| `plan_viewed` | group_id, plan: free\|premium\|family, source: string | Page view pricing |
| `plan_upgrade_started` | group_id, plan, source | Click em upgrade |
| `plan_upgraded` | group_id, plan, payment_method, mrr: number | Webhook Stripe |
| `plan_downgraded` | group_id, from_plan, to_plan | Webhook Stripe |
| `plan_cancelled` | group_id, plan, reason: string | Webhook Stripe |
| `feature_gated` | group_id, feature: string | Acesso negado a feature premium |
| `trial_started` | group_id, plan | Inicio do trial |
| `trial_expired` | group_id, converted: boolean | Fim do trial |

### 2.10 Retencao

| Evento | Propriedades | Trigger |
|---|---|---|
| `daily_active` | group_id, features_used: string[] | Sessao diaria (auto) |
| `weekly_active` | group_id | Agregacao semanal |
| `both_parents_active` | group_id, last_inactive_parent_days: number | Ambos pais logaram na semana |
| `user_churned` | group_id, last_active_date, total_days_active | 30 dias sem login |
| `user_reactivated` | group_id, days_inactive: number | Login apos inatividade |

---

## 3. Schema Padrao de Eventos

```json
{
  "event": "expense_created",
  "distinct_id": "uuid-do-usuario",
  "properties": {
    "group_id": "uuid-do-grupo",
    "category": "health",
    "amount": 150.00,
    "has_receipt": true,
    "has_custom_split": false,
    "$current_url": "/despesas/nova",
    "$browser": "Chrome",
    "$device_type": "Mobile",
    "$os": "Android",
    "app_version": "1.0.0",
    "locale": "pt-BR"
  },
  "timestamp": "2026-03-22T14:30:00Z"
}
```

### Propriedades Globais (Auto-capturadas)

| Propriedade | Origem | Descricao |
|---|---|---|
| `$current_url` | PostHog auto | URL da pagina |
| `$browser` | PostHog auto | Navegador |
| `$device_type` | PostHog auto | Mobile/Desktop/Tablet |
| `$os` | PostHog auto | Sistema operacional |
| `$referrer` | PostHog auto | Pagina de origem |
| `locale` | profiles.locale | Idioma do usuario |
| `user_role` | profiles.role | parent/grandparent/etc |
| `group_count` | Calculado | Quantos grupos o usuario tem |

---

## 4. Definicao de Funis

### 4.1 Funil de Onboarding

```
signup → group_created → child_added → invitation_sent → schedule_configured → onboarding_completed
```

| Etapa | Evento | Meta de Conversao |
|---|---|---|
| 1. Cadastro | `user_signup` | 100% (baseline) |
| 2. Criar grupo | `group_created` | > 85% |
| 3. Adicionar filho | `child_added` | > 80% |
| 4. Enviar convite | `invitation_sent` | > 70% |
| 5. Configurar escala | `schedule_configured` | > 50% |
| 6. Onboarding completo | `onboarding_completed` | > 40% |

**Tempo maximo do funil:** 7 dias

### 4.2 Funil de Ativacao

```
onboarding_completed → first_decision_created → first_expense_logged → both_parents_active
```

| Etapa | Evento | Meta |
|---|---|---|
| 1. Onboarding completo | `onboarding_completed` | Baseline |
| 2. Primeira decisao | `decision_created` | > 60% em 7 dias |
| 3. Primeira despesa | `expense_created` | > 50% em 14 dias |
| 4. Ambos pais ativos | `both_parents_active` | > 40% em 14 dias |

### 4.3 Funil de Monetizacao

```
feature_gated → plan_viewed → plan_upgrade_started → plan_upgraded
```

| Etapa | Evento | Meta |
|---|---|---|
| 1. Feature bloqueada | `feature_gated` | Trigger natural |
| 2. Viu planos | `plan_viewed` | > 30% |
| 3. Iniciou upgrade | `plan_upgrade_started` | > 15% |
| 4. Upgrade concluido | `plan_upgraded` | > 8% |

### 4.4 Funil de Convite

```
invitation_sent → invitation_accepted → second_parent_first_action → both_parents_active
```

| Etapa | Evento | Meta |
|---|---|---|
| 1. Convite enviado | `invitation_sent` | Baseline |
| 2. Convite aceito | `invitation_accepted` | > 60% em 7 dias |
| 3. Primeira acao do 2o pai | Qualquer acao | > 50% em 3 dias |
| 4. Ambos ativos | `both_parents_active` | > 40% em 14 dias |

---

## 5. Coortes de Analise

| Coorte | Definicao | Uso |
|---|---|---|
| `signup_week` | Semana do cadastro | Retencao por coorte |
| `invite_accepted` | Aceitou convite vs criou grupo | Comparar comportamento |
| `schedule_users` | Configurou escala quinzenal | Ativacao |
| `health_power_users` | >= 5 registros de saude/mes | Engajamento profundo |
| `financial_active` | >= 3 despesas/mes | Uso do modulo financeiro |
| `both_parents_weekly` | Ambos pais ativos na semana | Saude do grupo |
| `premium_converted` | Converteu para premium | Revenue analysis |
| `single_parent_groups` | Grupos onde so 1 pai usa | Churn risk |

---

## 6. Alertas Automaticos

| Alerta | Condicao | Canal |
|---|---|---|
| Novo signup sem grupo | `user_signup` sem `group_created` em 24h | Slack #growth |
| Convite nao aceito | `invitation_sent` sem `invitation_accepted` em 72h | Email ao convidador |
| Grupo inativo | Nenhum evento do grupo em 14 dias | Email a ambos pais |
| Churn iminente | Somente 1 pai ativo por 21+ dias | Email + in-app prompt |
| Erro de pagamento | `plan_upgrade_started` sem `plan_upgraded` em 1h | Slack #revenue |
| Pico de erros | Taxa de erros em actions > 5% em 1h | Slack #engineering |
