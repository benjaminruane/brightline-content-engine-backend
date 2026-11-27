BUILD SPEC. Ids: B619.

WHY
Ben learns when a friend signs up and when they run their first review.

======================================================================
PART 0A. CLAIMS.
======================================================================
C1 BLOCKING. rememberSeenAccount inserts new accounts. CONFIRMED: lib/db/accounts.mjs.
C2 BLOCKING. Completed reviews are saved via saveReviewState / api/review-state with account_id. CONFIRMED: lib/db/review-state.mjs, api/review-state.js.
C3 CHECK. Feedback email uses Resend + VITEST guard. CONFIRMED: lib/feedback-email.mjs.
C4 CHECK. Optional account columns degrade when missing. CONFIRMED: missingOptionalColumns in accounts.mjs.

======================================================================
PART 0B. DESIGN.
======================================================================
D1 Migration 014 adds signup_alert_sent_at and first_review_alert_sent_at; backfill existing; expected-schema + optional columns.
D2 lib/account-alerts.mjs claims atomically and sends; production only; reuse Resend settings.
D3 Wire signup after new insert in rememberSeenAccount; first review after completed save in api/review-state.
D4 Tests in test/b619-account-alerts.test.mjs.

======================================================================
SHIP
======================================================================
Backend only. Commit, tag b619, push, verify:ship. USD 0.
