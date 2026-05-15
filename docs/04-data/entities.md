# Entidades — Schema Detalhado

> Esquema detalhado das 15 tabelas centrais do Kindar.
> Referencia para desenvolvimento, integracao e auditoria.
> Atualizado: 14/05/2026.
>
> **Nota:** o banco total tem ~68 tabelas em `origin/main`. Este doc cobre o nucleo historico (profiles, groups, children, custody_events, expenses, chat_messages, etc.). Para o catalogo completo ver `DOCUMENTACAO.md > Banco de Dados`. Para detalhes da Foundation Collab ver `DOCUMENTACAO.md > Foundation: Collaborative Records` e `data-model.md`.

---

## 1. profiles

**Descricao:** Perfil do usuario, criado automaticamente pelo trigger `on_auth_user_created`.

| Coluna | Tipo | Restricoes | Descricao |
|---|---|---|---|
| `id` | UUID | PK, FK → auth.users(id) ON DELETE CASCADE | ID do usuario (Supabase Auth) |
| `full_name` | TEXT | NOT NULL | Nome completo |
| `display_name` | TEXT | | Nome de exibicao (opcional) |
| `email` | TEXT | NOT NULL | E-mail |
| `phone` | TEXT | | Telefone |
| `role` | user_role | NOT NULL, DEFAULT 'parent' | parent, grandparent, caregiver, mediator, lawyer |
| `avatar_url` | TEXT | | URL do avatar |
| `locale` | TEXT | NOT NULL, DEFAULT 'pt-BR' | Idioma preferido (pt-BR, en, es, fr, de) |
| `lgpd_consent_at` | TIMESTAMPTZ | | Data do consentimento LGPD |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Criacao |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Ultima atualizacao |

**RLS:**
- SELECT: Usuario ve seu perfil + perfis de co-membros de grupo
- UPDATE: Apenas o proprio usuario

---

## 2. coparenting_groups

**Descricao:** Grupo de coparentalidade. Unidade fundamental de multi-tenancy.

| Coluna | Tipo | Restricoes | Descricao |
|---|---|---|---|
| `id` | UUID | PK, DEFAULT uuid_generate_v4() | ID do grupo |
| `name` | TEXT | NOT NULL | Nome do grupo (ex: "Familia Silva") |
| `created_by` | UUID | NOT NULL, FK → profiles(id) | Criador do grupo |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data de criacao |

**RLS:**
- SELECT: `is_group_member(id)`
- INSERT: `auth.uid() = created_by`

---

## 3. children

**Descricao:** Filhos cadastrados no grupo.

| Coluna | Tipo | Restricoes | Descricao |
|---|---|---|---|
| `id` | UUID | PK, DEFAULT uuid_generate_v4() | ID da crianca |
| `group_id` | UUID | NOT NULL, FK → coparenting_groups(id) CASCADE | Grupo |
| `full_name` | TEXT | NOT NULL | Nome completo |
| `birth_date` | DATE | NOT NULL | Data de nascimento |
| `photo_url` | TEXT | | URL da foto |
| `cpf` | TEXT | | CPF da crianca |
| `rg` | TEXT | | RG da crianca |
| `allergies` | TEXT[] | | Array de alergias (legado) |
| `notes` | TEXT | | Observacoes gerais |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Criacao |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Ultima atualizacao |

**RLS:**
- SELECT/INSERT/UPDATE: `is_group_member(group_id)`

**Relacoes 1:1:** `child_medical_info`, `child_education`
**Relacoes 1:N:** custody_events, child_allergies, active_medications, illness_episodes, vaccination_records, growth_records, medical_appointments, child_activities, daily_checkins, school_logs, documents

---

## 4. custody_events

**Descricao:** Eventos de guarda no calendario. Um evento por range de dias consecutivos com o mesmo responsavel.

| Coluna | Tipo | Restricoes | Descricao |
|---|---|---|---|
| `id` | UUID | PK | ID do evento |
| `group_id` | UUID | NOT NULL, FK → coparenting_groups CASCADE | Grupo |
| `child_id` | UUID | NOT NULL, FK → children CASCADE | Crianca |
| `responsible_user_id` | UUID | NOT NULL, FK → profiles | Responsavel neste periodo |
| `start_date` | DATE | NOT NULL | Inicio |
| `end_date` | DATE | NOT NULL, CHECK >= start_date | Fim |
| `custody_type` | custody_type | NOT NULL, DEFAULT 'regular' | regular, holiday, swap, vacation, special |
| `notes` | TEXT | | Observacoes |
| `start_time` | TIME | | Hora inicio (para eventos pontuais) |
| `end_time` | TIME | | Hora fim |
| `is_recurring` | BOOLEAN | NOT NULL, DEFAULT false | Se e recorrente |
| `recurrence_rule` | TEXT | | Regra de recorrencia (daily, weekly, biweekly, monthly) |
| `created_by` | UUID | NOT NULL, FK → profiles | Criador |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Criacao |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Atualizacao |

**Indice principal:** `(group_id, start_date, end_date)` — query do calendario mensal

**RLS:**
- SELECT/INSERT/UPDATE: `is_group_member(group_id)`

---

## 5. chat_messages

**Descricao:** Mensagens do chat. Legalmente imutaveis — nao podem ser deletadas nem ter o texto alterado.

| Coluna | Tipo | Restricoes | Descricao |
|---|---|---|---|
| `id` | UUID | PK | ID da mensagem |
| `group_id` | UUID | NOT NULL, FK → coparenting_groups CASCADE | Grupo |
| `channel_id` | UUID | FK → chat_channels | Canal (nullable para retrocompatibilidade) |
| `sender_id` | UUID | NOT NULL, FK → profiles | Remetente |
| `text` | TEXT | | Texto da mensagem |
| `audio_url` | TEXT | | URL de audio |
| `image_url` | TEXT | | URL de imagem |
| `reply_to_id` | UUID | FK → chat_messages (self-ref) | Mensagem em resposta |
| `is_pinned` | BOOLEAN | NOT NULL, DEFAULT false | Fixada |
| `read_by` | JSONB | NOT NULL, DEFAULT '{}' | Mapa de leitura |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data/hora de envio |

**Nota:** Nao ha `updated_at` nem `deleted_at` — mensagens sao imutaveis por design.

**Triggers:**
- `no_delete_chat_messages`: RAISE EXCEPTION em DELETE
- `no_update_chat_text`: RAISE EXCEPTION se `OLD.text IS DISTINCT FROM NEW.text`

**RLS:**
- SELECT: `is_group_member(group_id)`
- INSERT: `is_group_member(group_id) AND sender_id = auth.uid()`
- UPDATE: `is_group_member(group_id)` (somente read_by, is_pinned)
- DELETE: `USING (false)` — sempre bloqueado

---

## 6. decisions

**Descricao:** Decisoes que precisam de consenso entre os pais. Resolvidas automaticamente quando todos votam.

| Coluna | Tipo | Restricoes | Descricao |
|---|---|---|---|
| `id` | UUID | PK | ID |
| `group_id` | UUID | NOT NULL, FK → coparenting_groups CASCADE | Grupo |
| `title` | TEXT | NOT NULL | Titulo da decisao |
| `description` | TEXT | | Detalhamento |
| `category` | TEXT | NOT NULL, CHECK IN ('escola','saude','atividade','viagem','financeiro','moradia','outro') | Categoria |
| `status` | TEXT | NOT NULL, DEFAULT 'aberta', CHECK IN ('aberta','aprovada','rejeitada','expirada') | Status |
| `deadline` | DATE | | Prazo para votacao |
| `created_by` | UUID | NOT NULL, FK → profiles | Criador |
| `resolved_at` | TIMESTAMPTZ | | Data da resolucao |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Criacao |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Atualizacao |

**Tabelas relacionadas:**
- `decision_votes` (UNIQUE decision_id + user_id): concordo, discordo, pensar
- `decision_arguments` (N por decisao): pro, contra

**Logica de resolucao:**
- Se algum voto = `discordo` → status = `rejeitada`
- Se todos votaram `concordo` → status = `aprovada`

**RLS:**
- SELECT/INSERT/UPDATE: `is_group_member(group_id)`

---

## 7. expenses

**Descricao:** Despesas compartilhadas com divisao personalizada.

| Coluna | Tipo | Restricoes | Descricao |
|---|---|---|---|
| `id` | UUID | PK | ID |
| `group_id` | UUID | NOT NULL, FK → coparenting_groups CASCADE | Grupo |
| `child_id` | UUID | FK → children | Crianca (opcional) |
| `category` | expense_category | NOT NULL | education, health, food, clothing, transport, leisure, housing, other |
| `description` | TEXT | NOT NULL | Descricao |
| `amount` | NUMERIC(10,2) | NOT NULL, CHECK > 0 | Valor em BRL |
| `currency` | TEXT | NOT NULL, DEFAULT 'BRL' | Moeda |
| `paid_by` | UUID | NOT NULL, FK → profiles | Quem pagou |
| `split_ratio` | JSONB | NOT NULL, DEFAULT '{"default": 50}' | Razao de divisao (ex: {"userId1": 60, "userId2": 40}) |
| `receipt_url` | TEXT | | URL do comprovante |
| `status` | approval_status | NOT NULL, DEFAULT 'pending' | pending, approved, rejected, disputed |
| `approved_by` | UUID | FK → profiles | Quem aprovou |
| `approved_at` | TIMESTAMPTZ | | Data da aprovacao |
| `rejection_reason` | TEXT | | Motivo de rejeicao |
| `expense_date` | DATE | NOT NULL | Data da despesa |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Criacao |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Atualizacao |

**RLS:**
- SELECT: `is_group_member(group_id)`
- INSERT: `is_group_member(group_id) AND paid_by = auth.uid()`
- UPDATE: `is_group_member(group_id)`

---

## 8. child_medical_info

**Descricao:** Informacoes medicas basicas da crianca. Relacao 1:1 com children.

| Coluna | Tipo | Restricoes | Descricao |
|---|---|---|---|
| `id` | UUID | PK | ID |
| `child_id` | UUID | NOT NULL, UNIQUE, FK → children CASCADE | Crianca (1:1) |
| `group_id` | UUID | NOT NULL, FK → coparenting_groups CASCADE | Grupo |
| `blood_type` | TEXT | | Tipo sanguineo |
| `insurance_name` | TEXT | | Nome do plano de saude |
| `insurance_number` | TEXT | | Numero da carteirinha |
| `sus_number` | TEXT | | Numero do cartao SUS |
| `primary_pediatrician_id` | UUID | FK → medical_professionals ON DELETE SET NULL | Pediatra principal |
| `notes` | TEXT | | Observacoes |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Criacao |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Atualizacao |

**RLS:**
- SELECT/INSERT/UPDATE: `is_group_member(group_id)`

---

## 9. child_education

**Descricao:** Informacoes escolares da crianca. Relacao 1:1 com children.

| Coluna | Tipo | Restricoes | Descricao |
|---|---|---|---|
| `id` | UUID | PK | ID |
| `child_id` | UUID | NOT NULL, UNIQUE, FK → children CASCADE | Crianca (1:1) |
| `group_id` | UUID | NOT NULL, FK → coparenting_groups CASCADE | Grupo |
| `school_name` | TEXT | | Nome da escola |
| `school_address` | TEXT | | Endereco |
| `school_phone` | TEXT | | Telefone da escola |
| `grade` | TEXT | | Serie/ano |
| `class_name` | TEXT | | Turma |
| `teacher_name` | TEXT | | Professor(a) |
| `coordinator_name` | TEXT | | Coordenador(a) |
| `entry_time` | TIME | | Horario de entrada |
| `exit_time` | TIME | | Horario de saida |
| `extracurricular_activities` | TEXT[] | | Atividades extracurriculares |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Criacao |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Atualizacao |

**RLS:**
- SELECT/INSERT/UPDATE: `is_group_member(group_id)`

---

## 10. documents

**Descricao:** Documentos digitalizados armazenados no Supabase Storage.

| Coluna | Tipo | Restricoes | Descricao |
|---|---|---|---|
| `id` | UUID | PK | ID |
| `group_id` | UUID | NOT NULL, FK → coparenting_groups CASCADE | Grupo |
| `child_id` | UUID | FK → children | Crianca (opcional) |
| `category` | document_category | NOT NULL | personal, health, education, legal, other |
| `name` | TEXT | NOT NULL | Nome do documento |
| `file_url` | TEXT | NOT NULL | URL do arquivo no Storage |
| `file_size` | INTEGER | | Tamanho em bytes |
| `mime_type` | TEXT | | Tipo MIME |
| `uploaded_by` | UUID | NOT NULL, FK → profiles | Quem fez upload |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Data do upload |

**RLS:**
- SELECT: `is_group_member(group_id)`
- INSERT: `is_group_member(group_id) AND uploaded_by = auth.uid()`

---

## 11. settlements

**Descricao:** Pagamentos/acertos entre os pais (estilo Splitwise).

| Coluna | Tipo | Restricoes | Descricao |
|---|---|---|---|
| `id` | UUID | PK | ID |
| `group_id` | UUID | NOT NULL, FK → coparenting_groups | Grupo |
| `paid_by` | UUID | NOT NULL, FK → profiles | Quem pagou |
| `paid_to` | UUID | NOT NULL, FK → profiles | Quem recebeu |
| `amount` | NUMERIC(10,2) | NOT NULL, CHECK > 0 | Valor |
| `payment_method` | TEXT | DEFAULT 'pix' | Metodo (pix, transferencia, dinheiro) |
| `reference_note` | TEXT | | Nota de referencia |
| `status` | TEXT | DEFAULT 'pending', CHECK IN ('pending','confirmed','disputed') | Status |
| `confirmed_by` | UUID | FK → profiles | Quem confirmou |
| `confirmed_at` | TIMESTAMPTZ | | Data da confirmacao |
| `settlement_date` | DATE | NOT NULL, DEFAULT CURRENT_DATE | Data do pagamento |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | Criacao |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | Atualizacao |

**RLS:**
- SELECT/INSERT/UPDATE: `is_group_member(group_id)`

---

## 12. active_medications

**Descricao:** Medicamentos em uso pela crianca, com log de doses.

| Coluna | Tipo | Restricoes | Descricao |
|---|---|---|---|
| `id` | UUID | PK | ID |
| `group_id` | UUID | NOT NULL, FK → coparenting_groups CASCADE | Grupo |
| `child_id` | UUID | NOT NULL, FK → children CASCADE | Crianca |
| `name` | TEXT | NOT NULL | Nome do medicamento |
| `dosage` | TEXT | NOT NULL | Dosagem (ex: "5ml", "1 comprimido") |
| `frequency` | TEXT | NOT NULL | Frequencia (ex: "8/8h", "2x ao dia") |
| `frequency_hours` | INT | | Intervalo em horas |
| `reason` | TEXT | | Motivo da prescricao |
| `prescribed_by` | TEXT | | Medico que prescreveu |
| `start_date` | DATE | NOT NULL | Inicio do tratamento |
| `end_date` | DATE | | Fim do tratamento |
| `status` | TEXT | NOT NULL, DEFAULT 'active' | active, paused, completed, cancelled |
| `notes` | TEXT | | Observacoes |
| `created_by` | UUID | NOT NULL, FK → profiles | Quem cadastrou |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Criacao |

**Tabela filha:** `medication_doses` (log de cada dose administrada)

---

## 13. illness_episodes

**Descricao:** Episodios de doenca com evolucao temporal.

| Coluna | Tipo | Restricoes | Descricao |
|---|---|---|---|
| `id` | UUID | PK | ID |
| `group_id` | UUID | NOT NULL, FK → coparenting_groups CASCADE | Grupo |
| `child_id` | UUID | NOT NULL, FK → children CASCADE | Crianca |
| `title` | TEXT | NOT NULL | Titulo (ex: "Gripe", "Otite") |
| `symptoms` | TEXT[] | | Array de sintomas |
| `start_date` | DATE | NOT NULL | Inicio dos sintomas |
| `end_date` | DATE | | Fim (quando resolvido) |
| `status` | TEXT | NOT NULL, DEFAULT 'active' | active, resolved, chronic |
| `diagnosis` | TEXT | | Diagnostico medico |
| `severity` | TEXT | | leve, moderado, grave |
| `hospital_visit` | BOOLEAN | | Se houve ida ao hospital |
| `hospital_name` | TEXT | | Nome do hospital |
| `hospital_date` | DATE | | Data da ida ao hospital |
| `notes` | TEXT | | Evolucao (append-only, formatado com timestamps) |
| `created_by` | UUID | NOT NULL, FK → profiles | Quem registrou |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Criacao |

---

## 14. invitations

**Descricao:** Convites para ingressar em um grupo de coparentalidade.

| Coluna | Tipo | Restricoes | Descricao |
|---|---|---|---|
| `id` | UUID | PK | ID |
| `group_id` | UUID | NOT NULL, FK → coparenting_groups CASCADE | Grupo |
| `invited_by` | UUID | NOT NULL, FK → profiles | Quem convidou |
| `email` | TEXT | | E-mail do convidado |
| `phone` | TEXT | | Telefone do convidado |
| `role` | user_role | NOT NULL, DEFAULT 'parent' | Papel do convidado |
| `group_role` | member_role | NOT NULL, DEFAULT 'member' | Papel no grupo |
| `token` | TEXT | NOT NULL, UNIQUE | Token de convite (32 bytes hex) |
| `status` | invitation_status | NOT NULL, DEFAULT 'pending' | pending, accepted, expired, revoked |
| `expires_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() + 7 days | Validade |
| `accepted_by` | UUID | FK → profiles | Quem aceitou |
| `accepted_at` | TIMESTAMPTZ | | Data da aceitacao |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Criacao |

**Constraint:** `CHECK (email IS NOT NULL OR phone IS NOT NULL)` — ao menos um contato

**RLS:**
- SELECT: Quem convidou OU cujo email e o do convidado
- INSERT: `is_group_admin(group_id)`
- UPDATE: Convidado com email correspondente

---

## 15. agreements

**Descricao:** Acordos e regras combinadas entre os pais.

| Coluna | Tipo | Restricoes | Descricao |
|---|---|---|---|
| `id` | UUID | PK | ID |
| `group_id` | UUID | NOT NULL, FK → coparenting_groups CASCADE | Grupo |
| `title` | TEXT | NOT NULL | Titulo do acordo |
| `description` | TEXT | NOT NULL | Descricao detalhada |
| `category` | TEXT | NOT NULL, CHECK IN ('principle','value','rule','boundary','routine') | Categoria |
| `is_non_negotiable` | BOOLEAN | NOT NULL, DEFAULT false | Se e inegociavel |
| `created_by` | UUID | NOT NULL, FK → profiles | Quem criou |
| `accepted_by` | UUID | FK → profiles | Quem aceitou |
| `accepted_at` | TIMESTAMPTZ | | Data da aceitacao |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Criacao |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Atualizacao |

**RLS:**
- SELECT/INSERT/UPDATE: `is_group_member(group_id)`
- DELETE: `created_by = auth.uid()` (somente criador)
