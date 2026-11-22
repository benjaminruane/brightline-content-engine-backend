-- B572. When the account name and email were last read from Clerk.
-- Null means never. Existing rows are not backfilled. Safe to run more than once.

alter table accounts add column if not exists profile_refreshed_at timestamptz;
