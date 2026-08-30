/**
 * B138 — withhold non-first-person editorial directives from the reviser
 * on silent cards. Card is untouched. Prompt-string gate. No model calls.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { gatherConcerns, buildRevisionPrompt } from "../lib/build-revision-prompt.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REVISE_DIR = path.join(__dirname, "..", "scripts", "diagnostic", "revise");

const REVIEW_FILES = [
  "suggest-after-r10-review1.json",
  "suggest-after-r10-review2.json",
  "condition-b-review.json",
  "coverage-gap-review.json",
];

const PRIMARY = "coverage-gap-review.json::5::overreach_unsupported_causal";

const LOCKS = [
  "suggest-after-r10-review1.json::7::voice_consistency",
  "suggest-after-r10-review2.json::7::voice_consistency",
  "suggest-after-r10-review1.json::3::overreach_unsupported_causal",
  "suggest-after-r10-review1.json::8::first_person_plural",
  "suggest-after-r10-review1.json::1::marketing_language_excess",
  "suggest-after-r10-review1.json::1::voice_consistency",
  "suggest-after-r10-review2.json::1::voice_consistency",
  "suggest-after-r10-review2.json::3::structural_integrity",
  "condition-b-review.json::1::marketing_language_excess",
  "condition-b-review.json::1::voice_consistency",
  "condition-b-review.json::7::voice_consistency",
  "condition-b-review.json::8::voice_consistency",
  "coverage-gap-review.json::3::marketing_language_excess",
];

function loadReview(file) {
  return JSON.parse(readFileSync(path.join(REVISE_DIR, file), "utf8"));
}

function statementsOf(json) {
  return json?.payload?.statements ?? [];
}

function ruleOf(c) {
  return String(c?.concernCode || c?.rule || c?.ruleId || "").trim();
}

function cardKey(file, stmt, rule) {
  const id = stmt?.id ?? stmt?.qcCard?.index;
  return `${file}::${id}::${rule}`;
}

function snapshotCardDirectives(file, statements) {
  const rows = [];
  for (const stmt of statements) {
    const card = stmt?.qcCard || {};
    const list = Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [];
    for (const c of list) {
      const rule = ruleOf(c);
      if (!rule) continue;
      rows.push({
        key: cardKey(file, stmt, rule),
        file,
        id: stmt?.id ?? card.index,
        supportState: card.supportState,
        rule,
        direction: typeof c.suggestedDirection === "string" ? c.suggestedDirection : "",
        note: typeof c.note === "string" ? c.note : "",
      });
    }
  }
  return rows;
}

function snapshotReviserDirectives(file, statements) {
  const gathered = gatherConcerns(statements, null);
  const rows = [];
  for (const item of gathered) {
    for (const c of item.editorial || []) {
      const rule = String(c.rule || "").trim();
      if (!rule) continue;
      rows.push({
        key: `${file}::${item.statementIndex}::${rule}`,
        file,
        id: item.statementIndex,
        rule,
        direction: typeof c.suggestedDirection === "string" ? c.suggestedDirection : "",
        note: typeof c.note === "string" ? c.note : "",
      });
    }
  }
  return rows;
}

function line(row, tag) {
  return `${tag}  ${row.key}  [${row.supportState ?? ""}]  ${JSON.stringify((row.direction || "").slice(0, 80))}`;
}

describe("B138 silent-card allowlist", () => {
  test("synthetic: silent overreach is withheld; voice reaches; card untouched", () => {
    const card = {
      qcCard: {
        index: 5,
        statement: "This relationship enabled deep insight during the diligence phase.",
        supportState: "not_supported",
        displayVerdict: "not_supported",
        editorialVerdict: "concern",
        editorialConcerns: [
          {
            concernCode: "overreach_unsupported_causal",
            note: "The phrase 'enabled deep insight' implies causation.",
            suggestedDirection:
              "Replace 'enabled deep insight during the diligence phase' with a more neutral statement that does not imply causation.",
          },
          {
            concernCode: "voice_consistency",
            note: "First-person plural.",
            suggestedDirection: "Replace 'we believe' with 'Halden Group believes'.",
          },
        ],
        complianceVerdict: "clean",
      },
    };
    const before = JSON.stringify(card.qcCard.editorialConcerns);
    const [item] = gatherConcerns([card]);
    assert.equal(JSON.stringify(card.qcCard.editorialConcerns), before, "card editorialConcerns must not be mutated");
    assert.equal(card.qcCard.editorialConcerns.length, 2);
    assert.equal(
      card.qcCard.editorialConcerns.some((c) => c.concernCode === "overreach_unsupported_causal"),
      true
    );
    assert.equal(item.editorial.length, 1);
    assert.equal(item.editorial[0].rule, "voice_consistency");
    const prompt = buildRevisionPrompt(card.qcCard.statement, [item], {});
    assert.doesNotMatch(prompt, /rule=overreach_unsupported_causal/);
    assert.doesNotMatch(prompt, /suggestedDirection=Replace 'enabled deep insight/);
    assert.match(prompt, /rule=voice_consistency/);
  });

  test("stored Review artefacts: 1 withheld, 13 locks, card keeps the flag", () => {
    const cardRows = [];
    const reviserRows = [];
    const prompts = new Map();

    for (const file of REVIEW_FILES) {
      const json = loadReview(file);
      const statements = statementsOf(json);
      const cardSnap = snapshotCardDirectives(file, statements);
      cardRows.push(...cardSnap);
      reviserRows.push(...snapshotReviserDirectives(file, statements));
      const draft = statements.map((s) => s?.qcCard?.statement || s?.text || "").join("\n");
      prompts.set(file, buildRevisionPrompt(draft, gatherConcerns(statements, null), {}));
    }

    const cardKeys = new Set(cardRows.map((r) => r.key));
    const reviserKeys = new Set(reviserRows.map((r) => r.key));

    console.log("\nB138 CARD (user-visible, before = after; 14 directives)");
    for (const r of cardRows) console.log(line(r, "CARD    "));
    console.log("\nB138 REVISER (after withhold)");
    for (const r of reviserRows) console.log(line(r, "REVISER "));
    const withheld = cardRows.filter((r) => !reviserKeys.has(r.key));
    console.log("\nB138 WITHHELD");
    for (const r of withheld) console.log(line(r, "WITHHOLD"));

    assert.equal(cardRows.length, 14, "expected 14 stored editorial directives on the cards");
    assert.equal(reviserRows.length, 13, "expected 13 reviser directives after withhold");
    assert.equal(withheld.length, 1);
    assert.equal(withheld[0].key, PRIMARY);

    assert.equal(cardKeys.has(PRIMARY), true, "PRIMARY must be present on the card (no primary if already absent)");
    assert.equal(reviserKeys.has(PRIMARY), false, "PRIMARY must be absent from gatherConcerns");

    const coveragePrompt = prompts.get("coverage-gap-review.json") || "";
    assert.match(coveragePrompt, /Evidence gap \(no_support\)/);
    assert.doesNotMatch(coveragePrompt, /rule=overreach_unsupported_causal/);
    assert.doesNotMatch(
      coveragePrompt,
      /suggestedDirection=Replace 'enabled deep insight during the diligence phase'/
    );

    const missingLocks = LOCKS.filter((k) => !reviserKeys.has(k));
    assert.deepEqual(missingLocks, [], `locks missing from reviser: ${missingLocks.join(", ")}`);

    const r10 = prompts.get("suggest-after-r10-review1.json") || "";
    assert.match(r10, /rule=voice_consistency/);
    assert.match(r10, /rule=first_person_plural/);
    assert.match(r10, /rule=overreach_unsupported_causal/);
    assert.match(r10, /means key-person risk is limited/);

    const coverageGapStatements = statementsOf(loadReview("coverage-gap-review.json"));
    const s5 = coverageGapStatements.find((s) => String(s?.id ?? s?.qcCard?.index) === "5");
    const s5Codes = (s5?.qcCard?.editorialConcerns || []).map((c) => c.concernCode);
    assert.equal(s5Codes.includes("overreach_unsupported_causal"), true, "card still carries the withheld concern");
  });
});
