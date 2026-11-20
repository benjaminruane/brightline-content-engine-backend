-- B543. Each account chooses spelling and the thousands separator.
-- Null means the account has not chosen: an admin keeps the current house
-- style, and any other account uses US spelling and a comma.
-- feedback_banner_closed_at is when an admin last closed the feedback banner
-- or opened the inbox. Feedback created after it is still new.

alter table accounts add column spelling text;
alter table accounts add column thousands text;
alter table accounts add column feedback_banner_closed_at timestamptz;

alter table accounts add constraint accounts_spelling_check
  check (spelling is null or spelling in ('US', 'UK'));
alter table accounts add constraint accounts_thousands_check
  check (thousands is null or thousands in ('comma', 'apostrophe'));
