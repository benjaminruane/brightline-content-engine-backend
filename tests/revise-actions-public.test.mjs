/**
 * Public action-list rows carry thing1State. The 0.80 line stays in thing1.mjs.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { runActionList } from "../lib/revise-actions/run.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REVIEW_PATH = path.join(
  __dirname,
  "..",
  "scripts",
  "diagnostic",
  "revise",
  "suggest-after-r10-review1.json"
);

function loadStatements() {
  const json = JSON.parse(readFileSync(REVIEW_PATH, "utf8"));
  return json?.payload?.statements ?? [];
}

describe("revise-actions public rows", () => {
  test("every public row includes phrase / whole-statement / none", async () => {
    const result = await runActionList(loadStatements(), {
      callModel: async () => ({
        text: JSON.stringify({
          proposedChange: "Replace 'We' with 'Halden Group'.",
          resultingSentence: "Halden Group was attracted to Meridian.",
          why: "Third-person voice.",
        }),
      }),
    });
    assert.equal(result.ok, true);
    assert.ok(result.entries.length > 0);
    for (const entry of result.entries) {
      assert.ok(
        entry.thing1State === "PHRASE" ||
          entry.thing1State === "WHOLE_STATEMENT" ||
          entry.thing1State === "NONE",
        `${entry.id} missing thing1State`
      );
    }
  });
});
