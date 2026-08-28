create table if not exists model_fingerprint_log (
  id           bigserial primary key,
  stage        text not null,
  model        text not null,
  fingerprints jsonb not null,
  first_seen   timestamptz not null default now()
);

-- One row per observed configuration change, newest first per stage.
create index if not exists model_fingerprint_log_stage_idx
  on model_fingerprint_log (stage, first_seen desc);
