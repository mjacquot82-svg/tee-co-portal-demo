create table if not exists public.process_instances (
  id text primary key,
  application_key text not null,
  subject_type text not null,
  subject_id text not null,
  template_key text not null,
  template_version integer not null check (template_version > 0),
  state text not null default 'Active',
  template_snapshot jsonb not null,
  task_instances jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint process_instances_subject_template_unique
    unique (application_key, subject_type, subject_id, template_key),
  constraint process_instances_task_instances_array
    check (jsonb_typeof(task_instances) = 'array'),
  constraint process_instances_history_array
    check (jsonb_typeof(history) = 'array')
);

create index if not exists process_instances_subject_idx
  on public.process_instances (application_key, subject_type, subject_id);

create index if not exists process_instances_state_idx
  on public.process_instances (application_key, state);

drop trigger if exists set_process_instances_updated_at on public.process_instances;
create trigger set_process_instances_updated_at
before update on public.process_instances
for each row execute function public.set_updated_at();
