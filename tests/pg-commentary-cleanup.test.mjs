import { describe, test } from "vitest";
import assert from "node:assert/strict";
import {
  applyPgFundCommitmentPostFilter,
  cleanPgCommentary,
  normalizePgHouseStyleCharacters,
  PG_METHODOLOGY_DELIMITER,
} from "../lib/prompt-library/pg-commentary-cleanup.mjs";
import { enforcePgCommentaryWordLimit } from "../lib/prompt-library/pg-word-limit.mjs";
import { PG_WRITING_EVENT } from "../lib/prompt-library/pg-writing-prompts.mjs";
import { VISIBILITY } from "../lib/output-intent.js";

describe("pg-commentary-cleanup", () => {
  test("normalizePgHouseStyleCharacters converts smart quotes and dashes", () => {
    const out = normalizePgHouseStyleCharacters("“quoted” — dash");
    assert.equal(out, '"quoted" - dash');
  });

  test("cleanPgCommentary strips delimiter debris and edge orphan quotes", () => {
    const raw = `"In June 2025, Partners Group invested in Acme.\n---METHODOLOGY---\n`;
    assert.equal(cleanPgCommentary(raw), "In June 2025, Partners Group invested in Acme.");
  });

  test("cleanPgCommentary removes partial methodology fragments", () => {
    const raw = "Commentary body.\n-- METHODOLOGY --";
    assert.equal(cleanPgCommentary(raw), "Commentary body.");
  });

  test("enforcePgCommentaryWordLimit always cleans PG commentary artifacts", () => {
    const raw = `“Lead paragraph.”\n${PG_METHODOLOGY_DELIMITER}\nNote.`;
    const result = enforcePgCommentaryWordLimit(raw, {
      eventType: PG_WRITING_EVENT.NEW_DIRECT_INVESTMENT,
      visibility: VISIBILITY.PUBLIC,
    });
    assert.equal(result.cleaned, true);
    assert.doesNotMatch(result.draftText.split(PG_METHODOLOGY_DELIMITER)[0], /[“”]/);
    assert.match(result.draftText, /Note\./);
  });

  test("applyPgFundCommitmentPostFilter rewrites lead commitment and strips metric sentences", () => {
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(" "));

    try {
      const input =
        "In June 2025, Partners Group made a lead commitment to Meridian Capital Partners V. " +
        "The GP's team has a strong thesis.\n\n" +
        "Prior Fund IV delivered 1.9x MOIC. " +
        "Partners Group was attracted to the sector focus.";

      const result = applyPgFundCommitmentPostFilter(input, { requestId: "test" });
      assert.match(result.text, /committed to Meridian Capital Partners V/);
      assert.doesNotMatch(result.text, /lead commitment/i);
      assert.match(result.text, /manager's team/i);
      assert.doesNotMatch(result.text, /\bMOIC\b/i);
      assert.match(result.text, /attracted to the sector focus/);
      assert.ok(result.sentencesRemoved >= 1);
      assert.ok(warnings.some((w) => w.includes("pg_fund_exclusion_filtered")));
    } finally {
      console.warn = originalWarn;
    }
  });

  test("applyPgFundCommitmentPostFilter collapses empty paragraph to one block", () => {
    const input =
      "Partners Group committed to Fund X. The manager targets growth equity.\n\n" +
      "The fund has a ten-year term and a 2% management fee.";
    const result = applyPgFundCommitmentPostFilter(input);
    assert.doesNotMatch(result.text, /management fee/i);
    assert.doesNotMatch(result.text, /\n\s*\n/);
    assert.match(result.text, /growth equity/);
  });

  test("enforcePgCommentaryWordLimit applies fund filter only for NEW_FUND_COMMITMENT", () => {
    const raw = "Partners Group made a lead commitment to Fund A. Fund IV returned 1.9x MOIC.";
    const fund = enforcePgCommentaryWordLimit(raw, {
      eventType: PG_WRITING_EVENT.NEW_FUND_COMMITMENT,
      visibility: VISIBILITY.COMPLETE,
    });
    assert.match(fund.draftText, /committed to Fund A/);
    assert.doesNotMatch(fund.draftText, /MOIC/i);

    const direct = enforcePgCommentaryWordLimit(raw, {
      eventType: PG_WRITING_EVENT.NEW_DIRECT_INVESTMENT,
      visibility: VISIBILITY.COMPLETE,
    });
    assert.match(direct.draftText, /lead commitment/i);
    assert.match(direct.draftText, /MOIC/i);
  });
});
