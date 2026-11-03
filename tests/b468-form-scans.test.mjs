/**
 * B468. The final comma and the number form are scans.
 * The other four prompt-only rules stay in the review prompt.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { OUTPUT_TYPE, getOutputTypeLabel } from "../lib/output-intent.js";
import editorialRules from "../lib/rulebook/editorialRules.js";
import { buildEditorialStyleSystemPrompt } from "../lib/qc/editorial-compliance-reviewer.mjs";
import { scanListCommas } from "../lib/qc/list-comma-scan.mjs";
import { SCANNED_STYLE_RULE_IDS } from "../lib/qc/mechanics-scan.mjs";
import { scanNumberForm } from "../lib/qc/number-form-scan.mjs";
import { resolveStyleGuide } from "../lib/qc/style-guide.mjs";
import { restoredSourceAwarenessConcerns } from "../lib/qc/editorial-source-awareness.mjs";

const pass = JSON.parse(readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/diagnostic/b464/pass-1.json"),
  "utf8",
));

function card(fixture, index) {
  return pass.cards.find((row) => String(row.fixtureId).padStart(2, "0") === fixture && row.index === index);
}

describe("B468 form scans", () => {
  test("a missing comma is one concern, and a comma that is present is not", () => {
    const missing = scanListCommas({
      statement: "The deal team included legal, tax and operations advisers.",
    });
    assert.equal(missing.length, 1);
    assert.equal(missing[0].concernCode, "oxford_comma");
    assert.equal(missing[0].quote, "legal, tax and operations");
    assert.equal(missing[0].span.length, 1);
    assert.equal(scanListCommas({
      statement: "The team included legal and tax advisers.",
    }).length, 0);
    assert.equal(scanListCommas({
      statement: "The team included legal, tax, and operations advisers.",
    }).length, 0);
    const statement = card("16", 0).statement;
    assert.match(statement, /,\s+and pregnancy/);
    assert.equal(scanListCommas({ statement }).length, 0);
    assert.equal(restoredSourceAwarenessConcerns(card("16", 0)).length, 0);
  });

  test("two misses on one statement are one concern", () => {
    const rows = scanListCommas({
      statement: "The pack listed legal, tax and operations. The note listed finance, tax and audit.",
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].span.length, 2);
  });

  test("a decimal is not spelled into a different number", () => {
    const statement = card("15", 24).statement;
    assert.match(statement, /7\.2/);
    assert.equal(scanNumberForm({ statement }).length, 0);
    assert.equal(restoredSourceAwarenessConcerns(card("15", 24)).length, 0);
    const eight = scanNumberForm({ statement: "The Company currently has 8 employees." });
    assert.equal(eight.length, 1);
    assert.equal(eight[0].quote, "8");
    assert.match(eight[0].suggestedDirection, /eight/);
    assert.doesNotMatch(eight[0].suggestedDirection, /seven|change the value|7\.2/);
    const pair = scanNumberForm({ statement: "We anticipate 10 to 12 platform investments." });
    assert.equal(pair.length, 1);
    assert.equal(pair[0].span.length, 2);
    assert.match(pair[0].note, /ten/);
    assert.match(pair[0].note, /twelve/);
    assert.equal(scanNumberForm({ statement: "Paid channels account for 10-15% of sign-ups." }).length, 0);
    assert.equal(scanNumberForm({ statement: "Installation is targeted for Q3 2026." }).length, 0);
    assert.equal(scanNumberForm({ statement: "A B2B SaaS platform." }).length, 0);
    assert.equal(scanNumberForm({ statement: "Sessions run 2-3 minutes." }).length, 0);
    const months = scanNumberForm({ statement: "The customer asked for 12 months of monitoring." });
    assert.equal(months.length, 1);
    assert.match(months[0].note, /twelve/);
  });

  test("a missing statement is loud", () => {
    assert.throws(() => scanListCommas({}), /statement is missing/);
    assert.throws(() => scanNumberForm({}), /statement is missing/);
  });

  test("the scanned set grows by these two, and the other four stay in the prompt", () => {
    assert.equal(SCANNED_STYLE_RULE_IDS.has("oxford_comma"), true);
    assert.equal(SCANNED_STYLE_RULE_IDS.has("number_spelling"), true);
    assert.equal(SCANNED_STYLE_RULE_IDS.size, 5);
    const commentary = buildEditorialStyleSystemPrompt({
      outputTypeLabel: getOutputTypeLabel(OUTPUT_TYPE.REPORTING_COMMENTARY),
      editorialRules,
      structuredStyleRules: resolveStyleGuide({
        outputType: OUTPUT_TYPE.REPORTING_COMMENTARY,
        promptHouseName: "Halden Group",
      }),
      outputSlug: "reporting_commentary",
      outputType: OUTPUT_TYPE.REPORTING_COMMENTARY,
      houseName: "Halden Group",
    });
    assert.equal(commentary.includes("\n- oxford_comma:"), false);
    assert.equal(commentary.includes("\n- number_spelling:"), false);
    assert.match(commentary, /thousand_separator:/);
    assert.match(commentary, /currency_format:/);
    assert.match(commentary, /english_variant:/);
    assert.match(commentary, /date_format:/);
  });
});
