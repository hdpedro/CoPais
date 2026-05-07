-- ===================================================================
-- assistant_session_state: memória conversacional curta do parser local
--
-- Guarda última intent + params + child mencionado por (user, group)
-- pra permitir follow-ups ("e em julho?") e resolução de pronomes
-- ("ele tem alergia?" depois de falar do Bernardo).
--
-- TTL implícito: registros > 30min são tratados como expirados pelo
-- código (sem job de limpeza por ora — tabela é pequena).
-- ===================================================================

create table if not exists public.assistant_session_state (
  user_id    uuid not null references auth.users(id) on delete cascade,
  group_id   uuid not null references public.coparenting_groups(id) on delete cascade,
  last_intent text,
  last_params jsonb,
  last_child_id uuid references public.children(id) on delete set null,
  last_period_start date,
  last_period_end   date,
  updated_at timestamptz not null default now(),
  primary key (user_id, group_id)
);

alter table public.assistant_session_state enable row level security;

-- Só admin/server (service role) lê/escreve essa tabela. RLS bloqueia
-- acesso direto do client; o parser sempre usa createAdminClient().
-- Não há policy explícita: default deny.

create index if not exists assistant_session_state_updated_at
  on public.assistant_session_state (updated_at desc);

comment on table public.assistant_session_state is
  'Estado conversacional curto do assistente local (last intent + params, TTL 30min).';
