alter table feedback add column if not exists diagnostics jsonb;

create table if not exists problem_events (
  id               bigserial primary key,
  account_id       text,
  route            text,
  message          text,
  request_id       text,
  status           integer,
  duration_ms      integer,
  build            text,
  version          text,
  source_count     integer,
  source_sizes     jsonb,
  component_stack  text,
  emailed_at       timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists problem_events_created_at_idx
  on problem_events (created_at desc);

create index if not exists problem_events_account_emailed_idx
  on problem_events (account_id, emailed_at desc);
