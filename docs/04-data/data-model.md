# Modelo de Dados — Kindar

> Documento de referencia para o esquema completo do banco de dados PostgreSQL (Supabase).
> Atualizado em: 14/05/2026 | Versao: 1.4
>
> **Adicoes pos-versao 1.0:**
> - **Foundation Collab** (migrations 00077, 00078, 00080): tabela polimorfica `collab_reads (record_type, record_id, user_id, read_at)`, enum `collab_priority (info|important|urgent)`, audit trail imutavel `expense_history`, funcao `collab_record_group(record_type, record_id)`, RPC `mark_collab_read(record_type, record_id)`. Adocoes: `school_logs`, `expenses`, `medical_appointments`, `illness_episodes`, `active_medications`, `child_allergies`, `vaccination_records`.
> - **Integridade `custody_events`** (00079): view `custody_resolved` (swap > exception > regular), trigger `custody_events_prevent_overlap`, EXCLUDE constraint `no_overlap_same_type` via daterange &&.
> - **Billing multi-provider** (00039, 00051, 00053-00063): `subscriptions` escopada por GRUPO, `plans` com IDs Stripe/Apple/Google, `coupons`, `webhook_events` (idempotencia), `referral_clicks`/`referral_rewards`, `onboarding_quests`, `early_bird_counter` atomico, `subscription_split` entre coparentes.
> - **Calendar occurrences via trigger** (00074): banco vira fonte de verdade pra `calendar_occurrences` — trigger AFTER INSERT/UPDATE em `child_activities` chama `generate_activity_occurrences()` PL/pgSQL. Independe do client.
> - **Assistente IA persistente** (00072): tabela `assistant_session_state` mantem contexto entre turns.
> - **Views read-only para WhatsApp v2** (00065): `child_current_status` (snapshot saude), `expense_balance_per_user` (saldo pendente derivado de split_ratio).
> - **Total atual: ~68 tabelas em origin/main, 83 migrations (ate 00080).**

---

## 1. Visao Geral da Arquitetura

O Kindar utiliza um modelo de **multi-tenancy baseado em grupos**. Cada `coparenting_group` representa uma familia coparental e todos os dados sao isolados por `group_id`. O acesso e controlado por **Row Level Security (RLS)** usando a funcao helper `is_group_member()`.

### Principios de Design

| Principio | Implementacao |
|---|---|
| Isolamento por grupo | Todas as tabelas possuem `group_id` com FK para `coparenting_groups` |
| UUID como PK | `uuid_generate_v4()` ou `gen_random_uuid()` em todas as tabelas |
| Timestamps com timezone | `TIMESTAMPTZ` para todas as colunas de data/hora |
| Imutabilidade do chat | Triggers impedem DELETE e UPDATE de `text` em `chat_messages` |
| Tabelas 1:1 | `child_medical_info` e `child_education` usam UNIQUE em `child_id` |
| Soft-delete onde necessario | Eventos usam `status = 'cancelled'` em vez de DELETE fisico |
| Auditoria basica | `created_by`, `created_at`, `updated_at` em todas as tabelas |

---

## 2. Diagrama ER (ASCII)

```
                                    ┌─────────────────────┐
                                    │    auth.users        │
                                    │  (Supabase Auth)     │
                                    └──────────┬──────────┘
                                               │ 1:1
                                    ┌──────────▼──────────┐
                                    │     profiles         │
                                    │  id, full_name,      │
                                    │  email, role, locale │
                                    └──────────┬──────────┘
                                               │
                          ┌────────────────────┼────────────────────┐
                          │                    │                    │
               ┌──────────▼──────────┐         │         ┌─────────▼──────────┐
               │   group_members     │         │         │  push_subscriptions │
               │  group_id, user_id, │         │         │  endpoint, p256dh   │
               │  role (admin/member)│         │         └──────────────────────┘
               └──────────┬──────────┘         │
                          │ N:1                │
               ┌──────────▼──────────┐         │
               │ coparenting_groups  │◄────────┘
               │  id, name,          │
               │  created_by         │
               └──────────┬──────────┘
                          │
        ┌─────────────────┼──────────────────────────────────────────┐
        │                 │                                          │
        │      ┌──────────▼──────────┐                               │
        │      │     children        │                               │
        │      │  full_name, birth,  │                               │
        │      │  cpf, rg, photo_url │                               │
        │      └──────────┬──────────┘                               │
        │                 │                                          │
        │    ┌────────────┼────────────────────┐                     │
        │    │            │                    │                     │
        │    │  ┌─────────▼────────┐  ┌────────▼───────┐            │
        │    │  │child_medical_info│  │child_education  │            │
        │    │  │ blood_type, SUS, │  │ school, grade,  │            │
        │    │  │ insurance, 1:1   │  │ teacher, 1:1    │            │
        │    │  └──────────────────┘  └────────────────┘            │
        │    │                                                       │
        │    ├── custody_events (start_date, end_date, type)         │
        │    ├── child_activities (recurrence, checklist)             │
        │    ├── child_allergies (type, severity, reaction)          │
        │    ├── active_medications (dosage, frequency)              │
        │    │     └── medication_doses (administered_at, by)        │
        │    ├── illness_episodes (symptoms[], diagnosis)            │
        │    ├── vaccination_records (vaccine, dose, batch)          │
        │    ├── growth_records (weight, height, head)               │
        │    ├── medical_appointments (date, professional, status)   │
        │    ├── daily_checkins (category, title, description)       │
        │    ├── school_logs (log_type, title, log_date)             │
        │    └── documents (file_url, category, mime_type)           │
        │                                                            │
        ├── expenses (amount, category, split_ratio, receipt)        │
        │     └── settlements (paid_by, paid_to, amount, status)     │
        ├── chat_channels (slug, channel_type, child_id)             │
        │     └── chat_messages (text, sender_id, channel_id)        │
        │     └── chat_channel_reads (last_read_at)                  │
        ├── decisions (title, category, status, deadline)            │
        │     ├── decision_votes (vote: concordo/discordo/pensar)    │
        │     └── decision_arguments (type: pro/contra, text)        │
        ├── agreements (title, category, is_non_negotiable)          │
        ├── events (title, event_date, location, image_url)          │
        ├── sensitive_notes (topic, is_urgent, read_by[])            │
        ├── private_notes (user_id, category, content)               │
        ├── swap_requests (original_date, proposed_date, status)     │
        ├── custody_schedules (pattern JSONB, start_date, months)    │
        ├── invitations (token, email, role, expires_at)             │
        ├── notifications (type, title, message, is_read)            │
        ├── calendar_tokens (token, for iCal subscription)           │
        ├── medical_professionals (name, specialty, CRM)             │
        └── health_views (record_type, viewed_by, viewed_at)         │
```

---

## 3. Tabelas por Dominio

### 3.1 Core (Nucleo)

| Tabela | Descricao | Registros Esperados |
|---|---|---|
| `profiles` | Perfil do usuario (extends auth.users) | 1 por usuario |
| `coparenting_groups` | Grupo familiar de coparentalidade | 1 por familia |
| `group_members` | Associacao usuario-grupo com papel | 2-5 por grupo |
| `children` | Filhos registrados no grupo | 1-4 por grupo |
| `invitations` | Convites pendentes/aceitos | Variavel |
| `notifications` | Notificacoes in-app | Alto volume |
| `push_subscriptions` | Subscricoes Web Push por dispositivo | 1-3 por usuario |

### 3.2 Calendario e Guarda

| Tabela | Descricao | Volume |
|---|---|---|
| `custody_events` | Eventos de guarda (regular, ferias, troca) | ~180/ano por crianca |
| `custody_schedules` | Configuracao da escala quinzenal (JSONB pattern) | 1 por crianca |
| `swap_requests` | Solicitacoes de troca/visita entre pais | Variavel |
| `calendar_tokens` | Tokens para assinatura iCal | 1 por usuario/grupo |
| `events` | Eventos sociais (aniversarios, festas) | Variavel |

### 3.3 Comunicacao

| Tabela | Descricao | Volume |
|---|---|---|
| `chat_messages` | Mensagens do chat (imutaveis por lei) | Alto volume |
| `chat_channels` | Canais de chat (geral + por filho) | 2-5 por grupo |
| `chat_channel_reads` | Marcacao de leitura por canal | 1 por usuario/canal |

### 3.4 Saude

| Tabela | Descricao | Relacao |
|---|---|---|
| `child_medical_info` | Info medica basica (plano, SUS, tipo sanguineo) | 1:1 com children |
| `child_allergies` | Alergias detalhadas com severidade | N por crianca |
| `active_medications` | Medicamentos em uso | N por crianca |
| `medication_doses` | Log de doses administradas | N por medicamento |
| `illness_episodes` | Episodios de doenca com evolucao | N por crianca |
| `vaccination_records` | Caderneta de vacinas | N por crianca |
| `growth_records` | Curva de crescimento (peso, altura, PC) | N por crianca |
| `medical_appointments` | Consultas agendadas/realizadas | N por crianca |
| `medical_professionals` | Cadastro de medicos/especialistas | N por grupo |
| `health_logs` | Logs genericos de saude | N por crianca |
| `health_views` | Tracking de visualizacao de registros | N por registro |

### 3.5 Financeiro

| Tabela | Descricao | Volume |
|---|---|---|
| `expenses` | Despesas compartilhadas com split ratio | ~20/mes por grupo |
| `settlements` | Pagamentos/acertos entre pais (Pix) | ~2/mes por grupo |

### 3.6 Educacao

| Tabela | Descricao | Relacao |
|---|---|---|
| `child_education` | Info escolar (escola, turma, professora) | 1:1 com children |
| `school_logs` | Registros escolares (notas, reunioes, ocorrencias) | N por crianca |

### 3.7 Atividades

| Tabela | Descricao | Relacao |
|---|---|---|
| `child_activities` | Atividades recorrentes (futsal, natacao) | N por crianca |
| `activity_checklist_items` | Itens do checklist (mochila, uniforme) | N por atividade |
| `checklist_completions` | Conclusao de itens por data | N por item/data |

### 3.8 Decisoes e Acordos

| Tabela | Descricao | Volume |
|---|---|---|
| `decisions` | Decisoes que precisam de consenso | ~2/mes por grupo |
| `decision_votes` | Votos (concordo/discordo/pensar) | 2-5 por decisao |
| `decision_arguments` | Argumentos pro/contra | N por decisao |
| `agreements` | Acordos/regras entre os pais | ~5-10 por grupo |

### 3.9 Registros Sensiveis

| Tabela | Descricao | Volume |
|---|---|---|
| `sensitive_notes` | Notas sobre temas sensiveis (violencia, bullying) | Raro |
| `private_notes` | Notas privadas do usuario (so ele ve) | Variavel |
| `daily_checkins` | Check-ins diarios sobre a crianca | ~1/dia por crianca |
| `documents` | Documentos digitalizados (RG, receitas) | N por grupo |

---

## 4. Decisoes de Design

### 4.1 Isolamento por Grupo (Multi-tenancy)

Todas as tabelas que contem dados de usuarios possuem `group_id` como FK obrigatoria. A funcao `is_group_member()` e usada em todas as politicas RLS:

```sql
CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

**Excecoes ao padrao group_id:**
- `private_notes`: filtrada por `user_id` (dados privados do usuario)
- `notifications`: filtrada por `user_id`
- `push_subscriptions`: filtrada por `user_id`
- `medication_doses`: acesso via JOIN com `active_medications`
- `decision_votes` e `decision_arguments`: acesso via JOIN com `decisions`

### 4.2 Tabelas 1:1

`child_medical_info` e `child_education` usam `UNIQUE(child_id)` para garantir uma unica entrada por crianca. Operacoes usam `UPSERT` com `onConflict: "child_id"`.

### 4.3 Imutabilidade do Chat

Mensagens de chat sao legalmente inalteraveis (requisito para uso como evidencia judicial):

```sql
-- Impede DELETE fisico
CREATE TRIGGER no_delete_chat_messages
  BEFORE DELETE ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION prevent_chat_delete();

-- Impede alteracao do texto
CREATE TRIGGER no_update_chat_text
  BEFORE UPDATE ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION prevent_chat_text_update();
```

### 4.4 Recorrencia de Atividades

Atividades suportam recorrencia flexivel:
- `recurrence_type`: never, daily, weekly, biweekly, monthly, yearly, custom
- `days_of_week`: JSON array (ex: `"[1,3,5]"` para seg/qua/sex)
- `custom_interval` + `custom_unit`: para intervalos personalizados

### 4.5 Escala de Guarda (Pattern JSONB)

A tabela `custody_schedules` armazena um array de 14 posicoes (2 semanas):
- Indices 0-6: Semana 1 (Dom=0, Seg=1, ..., Sab=6)
- Indices 7-13: Semana 2
- Cada posicao contem `user_id` ou `null` (dia nao atribuido)

O sistema gera `custody_events` individuais com base no pattern, otimizando ranges consecutivos.

---

## 5. Estrategia de Indices

### 5.1 Indices Existentes

```
-- Core
idx_group_members_user          (user_id)
idx_group_members_group         (group_id)
idx_children_group              (group_id)

-- Calendario
idx_custody_events_group_date   (group_id, start_date, end_date)

-- Financeiro
idx_expenses_group              (group_id)
idx_expenses_date               (expense_date)
idx_settlements_group_id        (group_id)
idx_settlements_paid_by         (paid_by)
idx_settlements_status          (status)

-- Chat
idx_chat_messages_group_created (group_id, created_at)
idx_chat_channels_group         (group_id)
idx_chat_channel_reads_user     (user_id)

-- Saude
idx_medical_professionals_group (group_id)
idx_medical_appointments_group  (group_id, appointment_date)
idx_medical_appointments_child  (child_id, appointment_date)
idx_active_medications_child    (child_id, status)
idx_medication_doses_med        (medication_id, administered_at)
idx_illness_episodes_child      (child_id, start_date)
idx_child_allergies_child       (child_id)
idx_vaccination_records_child   (child_id, administered_date)
idx_growth_records_child        (child_id, measured_date)
idx_health_logs_child           (child_id, logged_at)

-- Outros
idx_notifications_user          (user_id, is_read, created_at)
idx_invitations_token           (token) -- UNIQUE
idx_invitations_email           (email)
idx_daily_checkins_group_date   (group_id, checkin_date DESC)
idx_daily_checkins_child        (child_id, checkin_date DESC)
idx_decisions_group             (group_id)
idx_decisions_status            (status)
idx_child_activities_group      (group_id)
idx_child_activities_child      (child_id)
idx_child_activities_active     (is_active) WHERE is_active = true  -- partial
idx_events_group_id             (group_id)
idx_events_event_date           (event_date)
idx_events_status               (status)
idx_agreements_group_id         (group_id)
idx_private_notes_user          (user_id)
idx_private_notes_group         (group_id, user_id)
idx_school_logs_group_id        (group_id)
idx_school_logs_child_id        (child_id)
idx_school_logs_log_date        (log_date)
idx_sensitive_notes_group_id    (group_id)
idx_sensitive_notes_topic       (topic)
idx_sensitive_notes_is_urgent   (is_urgent)
```

### 5.2 Indices Compostos Estrategicos

Os indices mais criticos sao os compostos que suportam as queries mais frequentes:

| Indice | Query Suportada |
|---|---|
| `(group_id, start_date, end_date)` em custody_events | Calendario mensal |
| `(group_id, created_at)` em chat_messages | Lista de mensagens |
| `(child_id, status)` em active_medications | Medicamentos ativos |
| `(child_id, appointment_date)` em medical_appointments | Proximas consultas |
| `(user_id, is_read, created_at)` em notifications | Badge de notificacoes |
| `(group_id, checkin_date DESC)` em daily_checkins | Feed de check-ins |

### 5.3 Indice Parcial

```sql
idx_child_activities_active (is_active) WHERE is_active = true
```
Otimiza queries de atividades ativas sem indexar registros inativos.

---

## 6. Enumeracoes (ENUMs)

| Enum | Valores | Usado em |
|---|---|---|
| `user_role` | parent, grandparent, caregiver, mediator, lawyer | profiles.role |
| `member_role` | admin, member, readonly | group_members.role |
| `custody_type` | regular, holiday, swap, vacation, special | custody_events |
| `expense_category` | education, health, food, clothing, transport, leisure, housing, other | expenses |
| `approval_status` | pending, approved, rejected, disputed | expenses.status |
| `health_log_type` | fever, medication, mood, screen_time, food, sleep, weight, height, vaccine, other | health_logs |
| `document_category` | personal, health, education, legal, other | documents |
| `swap_status` | pending, approved, rejected, cancelled | swap_requests |
| `notification_type` | expense_new, expense_approved, expense_rejected, swap_request, swap_response, chat_message, document_uploaded, custody_change, invitation, system | notifications |
| `invitation_status` | pending, accepted, expired, revoked | invitations |

---

## 7. Triggers

| Trigger | Tabela | Funcao |
|---|---|---|
| `set_updated_at` | profiles, children, custody_events, expenses, decisions, decision_votes, agreements, private_notes, child_activities | `update_updated_at()` |
| `no_delete_chat_messages` | chat_messages | `prevent_chat_delete()` |
| `no_update_chat_text` | chat_messages | `prevent_chat_text_update()` |
| `on_auth_user_created` | auth.users | `handle_new_user()` — cria profile automaticamente |

---

## 8. Storage Buckets (Supabase Storage)

| Bucket | Uso | Limite |
|---|---|---|
| `receipts` | Comprovantes de despesas (JPG, PNG, HEIC, PDF) | 5MB/arquivo |
| `documents` | Documentos gerais + imagens de eventos | 10MB/arquivo |

---

## 9. Contagem Total de Tabelas

| Categoria | Quantidade | Tabelas |
|---|---|---|
| Core | 5 | profiles, coparenting_groups, group_members, children, push_subscriptions |
| Calendario | 5 | custody_events, custody_schedules, swap_requests, calendar_tokens, events |
| Comunicacao | 3 | chat_messages, chat_channels, chat_channel_reads |
| Saude | 10 | child_medical_info, child_allergies, active_medications, medication_doses, illness_episodes, vaccination_records, growth_records, medical_appointments, medical_professionals, health_views |
| Financeiro | 2 | expenses, settlements |
| Educacao | 2 | child_education, school_logs |
| Atividades | 3 | child_activities, activity_checklist_items, checklist_completions |
| Decisoes | 3 | decisions, decision_votes, decision_arguments |
| Acordos | 1 | agreements |
| Registros | 4 | sensitive_notes, private_notes, daily_checkins, documents |
| Sistema | 3 | notifications, invitations, health_logs |
| **TOTAL** | **41** | |
