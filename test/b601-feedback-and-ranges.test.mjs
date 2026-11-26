/**
 * B601. Range house-style notes, Generate prompt carries the rule,
 * constructive feedback polish follows house rules and status.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { restampAnalyseResponse } from "../lib/qc/b596-stamp.mjs";
import { findRangeStyleNotes } from "../lib/qc/range-style-check.mjs";
import { STYLE_GUIDE, guideEntry } from "../lib/style-guide/guide.mjs";
import { renderDraftStyleSection, resolveStyleChoices } from "../lib/style-guide/render.mjs";
import {
  CONSTRUCTIVE_FEEDBACK_V2_SYSTEM_PROMPT,
  polishConstructiveFeedback,
} from "../lib/qc/constructive-feedback-v2.mjs";
import { WRITER_FEEDBACK_PROMPT } from "../lib/qc/reading-contract.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

test("numeric_range is in the style guide and on by default in Generate prompt", () => {
  const entry = guideEntry("numeric_range");
  assert.ok(entry);
  assert.match(entry.rule, /hyphen/i);
  assert.match(entry.rule, /12-15/);
  assert.equal(resolveStyleChoices(null).numericRange, "on");
  const section = renderDraftStyleSection(resolveStyleChoices(null));
  assert.match(section, /12-15 companies|numeric ranges with a hyphen/i);
  assert.ok(STYLE_GUIDE.some((row) => row.id === "numeric_range"));
});

test("Aldermoor ranges get notes; Helvetia multiple movement gets none", () => {
  const ald = JSON.parse(
    readFileSync(path.join(ROOT, "fixtures/b600/aldermoor-live-b599.json"), "utf8"),
  );
  const draft = ald._b600?.draftText
    || ald.meta?.draftText
    || ald.statements.map((s) => s.text || s.qcCard?.statement || "").join(" ");
  // Prefer live draft sentences that carry ranges.
  const rangeSentences = (ald.statements || [])
    .map((s) => s.text || s.qcCard?.statement || "")
    .filter((t) => /\bto\b/i.test(t) && /\d/.test(t));
  const corpus = rangeSentences.length ? rangeSentences.join(" ") : draft;
  // Explicit Aldermoor-style ranges from the house-style examples in the draft pool.
  const sample = `${corpus} The fund holds 12 to 15 portfolio companies. Ticket sizes run EUR 150 million to EUR 500 million.`;
  const notes = findRangeStyleNotes(sample);
  const proposals = notes.map((n) => n.proposal);
  assert.ok(
    proposals.some((p) => /12-15/.test(p)),
    `expected 12-15 proposal, got ${proposals.join(" | ")}`,
  );
  assert.ok(
    proposals.some((p) => /EUR 150-500/.test(p)),
    `expected EUR 150-500 proposal, got ${proposals.join(" | ")}`,
  );

  const helvetia = "The applied multiple rose from 11.2x to 11.9x over the quarter.";
  assert.equal(findRangeStyleNotes(helvetia).length, 0);

  const stamped = restampAnalyseResponse({
    ...ald,
    meta: { ...(ald.meta || {}), houseStyle: { numericRange: "on" } },
  });
  // Inject a range sentence through the gate path.
  const withRange = {
    ...stamped,
    statements: [
      ...stamped.statements,
      {
        id: "range-test",
        text: "The fund backs 12 to 15 portfolio companies across Europe.",
        qcCard: {
          statement: "The fund backs 12 to 15 portfolio companies across Europe.",
          sentenceState: "nothing_raised",
          statementVerdict: { state: "nothing_raised" },
          shownReason: "The source supports the sentence.",
        },
      },
    ],
  };
  const gated = restampAnalyseResponse(withRange);
  const rangeCard = gated.statements.find((s) => /12 to 15/.test(s.text || ""));
  const house = rangeCard?.qcCard?.houseStyleConcerns || [];
  assert.ok(house.some((c) => c.ruleId === "numeric_range"));
});

test("constructive feedback prompt and polish: status fix, no team actor, two sentences", () => {
  assert.match(CONSTRUCTIVE_FEEDBACK_V2_SYSTEM_PROMPT, /at most two sentences/i);
  assert.match(CONSTRUCTIVE_FEEDBACK_V2_SYSTEM_PROMPT, /set the transaction status/i);
  assert.match(CONSTRUCTIVE_FEEDBACK_V2_SYSTEM_PROMPT, /never make the investment team or a committee the actor/i);
  assert.match(CONSTRUCTIVE_FEEDBACK_V2_SYSTEM_PROMPT, /12-15 companies/i);
  assert.match(WRITER_FEEDBACK_PROMPT, /set the transaction status/i);

  const raw = `The draft overstates the commitment.
To fix
"In October 2026, Halden Group committed to Aldermoor…" The source only recommends the commitment. For example: Halden Group's investment team has recommended a commitment of EUR 65 million to Aldermoor Capital Fund VI. Confirm against the source.
For next time
Check status before stating a completed commitment.`;

  const polished = polishConstructiveFeedback(raw, {
    findings: [{
      label: "Needs a look",
      reason: "The source recommends this transaction and does not say it has completed. Confirm its status below.",
    }],
  });
  assert.equal(/investment team has recommended/i.test(polished), false);
  assert.match(polished, /set the transaction status/i);
  assert.equal(/Confirm against the source/i.test(polished), false);

  const toFixBlock = polished.split(/For next time/i)[0];
  const entries = toFixBlock.split(/\n/).slice(1).filter(Boolean);
  for (const entry of entries) {
    const sentences = entry.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [entry];
    assert.ok(sentences.length <= 2, `entry too long: ${entry}`);
  }
});
