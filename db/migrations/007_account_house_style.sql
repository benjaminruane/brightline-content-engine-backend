-- B543. Each account chooses spelling and the thousands separator.
-- Null means the account has not chosen: an admin keeps the current house
-- style, and any other account uses US spelling and a comma.
-- feedback_banner_closed_at is when an admin last closed the feedback banner
-- or opened the inbox. Feedback created after it is still new.
-- Safe to run more than once. Adds nothing that is already there.

alter table accounts add column if not exists spelling text;
alter table accounts add column if not exists thousands text;
alter table accounts add column if not exists feedback_banner_closed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'accounts_spelling_check'
  ) then
    alter table accounts
      add constraint accounts_spelling_check
      check (spelling is null or spelling in ('US', 'UK'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'accounts_thousands_check'
  ) then
    alter table accounts
      add constraint accounts_thousands_check
      check (thousands is null or thousands in ('comma', 'apostrophe'));
  end if;
end $$;
