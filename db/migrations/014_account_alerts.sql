-- B619. Email Ben on new sign-up and on a user's first review.
-- Existing accounts are stamped so they do not fire alerts.
alter table accounts
  add column if not exists signup_alert_sent_at timestamptz;

alter table accounts
  add column if not exists first_review_alert_sent_at timestamptz;

update accounts
   set signup_alert_sent_at = now()
 where signup_alert_sent_at is null;

update accounts
   set first_review_alert_sent_at = now()
 where first_review_alert_sent_at is null
   and exists (
     select 1 from review_state r where r.account_id = accounts.id
   );
