-- B569. Which environment created the account.
-- preview or production. Null when the creating environment is not known.
-- Existing rows are not backfilled. Safe to run more than once.

alter table accounts add column if not exists created_environment text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'accounts_created_environment_check'
  ) then
    alter table accounts
      add constraint accounts_created_environment_check
      check (created_environment is null or created_environment in ('preview', 'production'));
  end if;
end $$;
