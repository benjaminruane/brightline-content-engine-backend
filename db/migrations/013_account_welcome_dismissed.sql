-- B613. Welcome window "Don't show this again" is per account.
alter table accounts
  add column if not exists welcome_dismissed_at timestamptz;
