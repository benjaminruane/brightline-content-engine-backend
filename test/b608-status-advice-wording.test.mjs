/**
 * B608. Status advice says "transaction", not "commitment".
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  STATUS_ADVICE_SENTENCE,
  stampStatusAdvice,
} from "../lib/qc/b602-card-rules.mjs";
import {
  CONSTRUCTIVE_FEEDBACK_V2_SYSTEM_PROMPT,
  polishConstructiveFeedback,
} from "../lib/qc/constructive-feedback-v2.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED =
  "If the transaction has been approved or completed, set its status; otherwise add the closing document.";

test("STATUS_ADVICE_SENTENCE is the transaction wording", () => {
  assert.equal(STATUS_ADVICE_SENTENCE, EXPECTED);
  assert.doesNotMatch(STATUS_ADVICE_SENTENCE, /\bcommitment\b/i);
});

test("stampStatusAdvice stamps the transaction wording when status is unset", () => {
  const out = stampStatusAdvice(
    { statusDependent: true, statement: "The sale completed." },
    "As the source states",
  );
  assert.equal(out.statusAdvice, EXPECTED);
});

test("constructive feedback prompt and polish use the transaction wording", () => {
  assert.match(CONSTRUCTIVE_FEEDBACK_V2_SYSTEM_PROMPT, /If the transaction has been approved or completed, set its status/);
  assert.doesNotMatch(CONSTRUCTIVE_FEEDBACK_V2_SYSTEM_PROMPT, /If the commitment has been approved/);

  const contract = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../lib/qc/reading-contract.mjs"),
    "utf8",
  );
  assert.match(contract, /If the transaction has been approved or completed, set its status/);
  assert.doesNotMatch(contract, /If the commitment has been approved or completed/);

  const polished = polishConstructiveFeedback(
    `The draft overstates the sale.
To fix
"The sale completed…" The source only recommends. For example: the investment team has recommended completion. Confirm against the source.
For next time
Check status before stating completion.`,
    {
      findings: [{
        label: "Needs a look",
        reason: "The source recommends this transaction and does not say it has completed.",
      }],
    },
  );
  assert.match(polished, /If the transaction has been approved or completed, set its status; otherwise add the closing document\./);
  assert.doesNotMatch(polished, /\bcommitment has been approved\b/i);
});
