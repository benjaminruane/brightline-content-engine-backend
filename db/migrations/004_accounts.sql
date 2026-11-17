create table if not exists accounts (
  id text primary key,
  email text,
  name text,
  writing_for text,
  created_at timestamptz default now(),
  last_active_at timestamptz
);

alter table review_state add column if not exists account_id text;

create index if not exists review_state_account_updated_idx
  on review_state (account_id, updated_at desc);

alter table reviewer_decisions add column if not exists account_id text;

create index if not exists reviewer_decisions_account_idx
  on reviewer_decisions (account_id);
