/**
 * B523. The texts list reports the scenario that was saved.
 * A blank scenario is no type.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { LIST_REVIEWS_SQL, listedTextType } from "../lib/db/accounts.mjs";

test("a saved scenario is the list type, and a blank one is none", () => {
  assert.equal(LIST_REVIEWS_SQL.includes("state->>'scenario'"), true);
  assert.equal(listedTextType("FUND_CAPITAL_CALL"), "FUND_CAPITAL_CALL");
  assert.equal(listedTextType("NEW_DIRECT_INVESTMENT"), "NEW_DIRECT_INVESTMENT");
  assert.equal(listedTextType(""), null);
  assert.equal(listedTextType("   "), null);
  assert.equal(listedTextType(null), null);
  assert.equal(listedTextType(undefined), null);
});
