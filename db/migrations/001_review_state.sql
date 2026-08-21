create table if not exists review_state (
  review_id  text primary key,
  owner_key  text not null,
  state      jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists review_state_owner_idx
  on review_state (owner_key, updated_at desc);
