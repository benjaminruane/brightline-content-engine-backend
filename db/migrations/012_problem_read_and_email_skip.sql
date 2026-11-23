alter table problem_events add column if not exists read_at timestamptz;

alter table problem_events add column if not exists email_skip text;

alter table feedback add column if not exists email_skip text;
