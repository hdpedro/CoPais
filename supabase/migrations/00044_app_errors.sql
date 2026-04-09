-- ============================================================
-- App Errors — error tracking with folder classification
-- ============================================================

create table public.app_errors (
  id              uuid primary key default gen_random_uuid(),
  message         text not null,
  stack_trace     text,
  file_path       text,
  folder_category text not null default 'unknown'
    check (folder_category in (
      'app', 'components', 'lib', 'hooks', 'actions', 'services', 'supabase', 'unknown'
    )),
  user_id         uuid references auth.users(id) on delete set null,
  severity        text not null default 'error'
    check (severity in ('warning', 'error', 'critical')),
  status          text not null default 'new'
    check (status in ('new', 'acknowledged', 'fixing', 'fixed', 'ignored')),
  fix_pr_url      text,
  sentry_event_id text,
  metadata        jsonb default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Indexes for dashboard and worker queries
create index idx_app_errors_status   on public.app_errors(status);
create index idx_app_errors_folder   on public.app_errors(folder_category);
create index idx_app_errors_created  on public.app_errors(created_at desc);

-- RLS enabled — all access via admin client (service role)
alter table public.app_errors enable row level security;

-- Auto-update updated_at on row change
create or replace function public.handle_app_errors_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_app_errors_updated
  before update on public.app_errors
  for each row
  execute function public.handle_app_errors_updated_at();
