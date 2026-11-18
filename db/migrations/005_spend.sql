create table if not exists spend_events (
  id bigserial primary key,
  account_id text NULL,
  route text not null,
  review_id text NULL,
  cost_usd numeric(12,6) not null,
  models text,
  created_at timestamptz default now()
);

create index if not exists spend_events_account_created_idx
  on spend_events (account_id, created_at);

alter table accounts add column if not exists monthly_allowance_usd numeric(10,2) NULL;
