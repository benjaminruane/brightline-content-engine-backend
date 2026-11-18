create table if not exists feedback (
  id             bigserial primary key,
  account_id     text,
  comment        text not null,
  meta           jsonb,
  draft_snapshot text,
  created_at     timestamptz not null default now(),
  read_at        timestamptz null
);

create index if not exists feedback_created_at_idx
  on feedback (created_at desc);
