/**
 * Columns the running code reads. Health compares the live database with this
 * list. A migration file that is not named here fails verify:ship.
 */
export const EXPECTED_COLUMNS = Object.freeze([
  { migration: "001", table: "review_state", columns: ["review_id", "owner_key", "state", "created_at", "updated_at"] },
  { migration: "002", table: "model_fingerprint_log", columns: ["id", "stage", "model", "fingerprints", "first_seen"] },
  { migration: "003", table: "reviewer_decisions", columns: ["id", "owner_key", "review_id", "decided_at", "kind", "draft_hash", "statement", "payload"] },
  { migration: "004", table: "accounts", columns: ["id", "email", "name", "writing_for", "created_at", "last_active_at"] },
  { migration: "004", table: "review_state", columns: ["account_id"] },
  { migration: "004", table: "reviewer_decisions", columns: ["account_id"] },
  { migration: "005", table: "spend_events", columns: ["id", "account_id", "route", "review_id", "cost_usd", "models", "created_at"] },
  { migration: "005", table: "accounts", columns: ["monthly_allowance_usd"] },
  { migration: "006", table: "feedback", columns: ["id", "account_id", "comment", "meta", "draft_snapshot", "created_at", "read_at"] },
  { migration: "007", table: "accounts", columns: ["spelling", "thousands", "feedback_banner_closed_at"] },
  { migration: "008", table: "accounts", columns: ["style_choices"] },
  { migration: "009", table: "accounts", columns: ["created_environment"] },
  { migration: "010", table: "accounts", columns: ["profile_refreshed_at"] },
  { migration: "011", table: "feedback", columns: ["diagnostics"] },
  {
    migration: "011",
    table: "problem_events",
    columns: [
      "id",
      "account_id",
      "route",
      "message",
      "request_id",
      "status",
      "duration_ms",
      "build",
      "version",
      "source_count",
      "source_sizes",
      "component_stack",
      "emailed_at",
      "created_at",
    ],
  },
  { migration: "012", table: "problem_events", columns: ["read_at", "email_skip"] },
  { migration: "012", table: "feedback", columns: ["email_skip"] },
]);

export function migrationIds() {
  return [...new Set(EXPECTED_COLUMNS.map((item) => item.migration))];
}
