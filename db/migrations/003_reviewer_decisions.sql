create table if not exists reviewer_decisions (
  id          bigserial primary key,
  owner_key   text not null,
  review_id   text not null,
  decided_at  timestamptz not null default now(),
  kind        text not null,
  draft_hash  text,
  statement   text,
  payload     jsonb not null
);

-- Newest first for one owner's one review. Append-only: no update, no delete.
create index if not exists reviewer_decisions_owner_review_idx
  on reviewer_decisions (owner_key, review_id, decided_at desc);
