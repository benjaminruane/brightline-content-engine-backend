-- B555. House style choices other than spelling and the thousands separator.
-- style_choices holds banned words and any later choice.
-- The thousands check now also allows a space.
-- Safe to run more than once.

alter table accounts add column if not exists style_choices jsonb;

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'accounts_thousands_check'
  ) then
    alter table accounts drop constraint accounts_thousands_check;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'accounts_thousands_check'
  ) then
    alter table accounts
      add constraint accounts_thousands_check
      check (thousands is null or thousands in ('comma', 'apostrophe', 'space'));
  end if;
end $$;
