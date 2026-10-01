/**
 * B362. Silence strip tests the subject. Last-finding backstop. Empty
 * conflict slot stays empty. Scale and cause lexicon, arithmetic, and
 * universal-set plus one holding.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import { stripOmissionOverclaimWhenDisplayed } from "../lib/qc/card-honesty.mjs";
import { excerptsAreSame } from "../lib/qc/excerpt-pair.mjs";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { selectExcerpts } from "../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";
import { buildClaimInventory } from "../lib/qc/commentary-inventory.mjs";
import {
  arithmeticScaleCheck,
  extractScaleCauseClaims,
  universalSetHits,
} from "../lib/qc/scale-cause.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-09-29");
const CLEAN = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "clean-review.json"), "utf8"));
const DOC = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "doc-review.json"), "utf8"));

const REVIEWS_ON = {
  evidenceEnabled: true,
  editorialEnabled: true,
  complianceEnabled: true,
};

const silentFramingJudge = async () => ({
  fire: false,
  evaluativePhrase: "",
  sourceStance: "",
  note: "",
  reason: "",
});

const GIC_SLICE = "In September 2025, 3i acquired 2.2% of Action equity from GIC";

function supportStateToVerdict(supportState) {
  if (supportState === "supported") return "confirmed";
  if (supportState === "partial") return "partially_confirmed";
  if (supportState === "conflicting") return "conflicting";
  if (supportState === "skipped") return "not_reviewed";
  return "not_supported";
}

function excerptPointer(card, sources) {
  const label = card.primaryRefTitle || sources[0]?.label || sources[0]?.name || "";
  const p = card.primaryExcerpt;
  if (p == null) return null;
  if (typeof p === "string") return { passage: p, sourceLabel: label };
  if (typeof p.passage === "string") return { passage: p.passage, sourceLabel: p.sourceLabel || label };
  return null;
}

function matchesFromCard(card, sources) {
  const label = sources[0]?.label || sources[0]?.name || "";
  const fps = Array.isArray(card.stage2SourceFingerprints) ? card.stage2SourceFingerprints : [];
  const pointer = excerptPointer(card, sources);
  if (fps.length > 0) {
    return fps.map((fp) => ({
      sourceIndex: Number.isFinite(fp.sourceIndex) ? fp.sourceIndex : 0,
      sourceLabel: fp.sourceLabel || label,
      classification: fp.classification,
      passage: pointer?.passage || "",
    }));
  }
  return [];
}

async function replayCard(payload, index) {
  const card = payload.statements[index].qcCard;
  const sources = payload.sources;
  const verdict = supportStateToVerdict(card.supportState);
  const sourceMatches = matchesFromCard(card, sources);
  const excerpts = selectExcerpts({
    statementMatches: sourceMatches,
    verdict,
    hasConflict: card.hasConflict === true,
    supportSpans: card.supportSpans,
    sources,
    statementText: card.statement,
  });
  return assembleCard(
    {
      statementText: card.statement,
      startChar: card.charStart,
      endChar: card.charEnd,
      supportSpans: card.supportSpans,
      sourceMatches,
      verdictResult: {
        verdict,
        hasConflict: card.hasConflict === true,
        confirmingMatches: [{ sourceIndex: 0, sourceLabel: sources[0]?.label || sources[0]?.name }],
        contributingSourceIndices: [0],
      },
      excerptResult: excerpts,
      commentaryResult: { commentary: card.evidenceSummary || "" },
      editorialResult: {
        editorialVerdict: card.editorialVerdict,
        editorialConcerns: Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [],
        editorialNote: card.editorialNote,
        editorialSuggestedDirection: card.editorialSuggestedDirection,
        editorialSuggestedRewrite: card.editorialSuggestedRewrite,
        complianceVerdict: card.complianceVerdict,
        complianceConcerns: Array.isArray(card.complianceConcerns) ? card.complianceConcerns : [],
      },
    },
    index,
    {
      pipelineRoute: "v4",
      sources,
      reviewOptions: REVIEWS_ON,
      skipEditorialDuplicationJudge: true,
      framingFidelityJudge: silentFramingJudge,
      today: new Date("2026-09-29T00:00:00.000Z"),
    }
  );
}

function primaryText(card) {
  const p = card.primaryExcerpt;
  if (p == null) return "";
  if (typeof p === "string") return p;
  if (typeof p.passage === "string") return p.passage;
  return "";
}

function conflictText(card) {
  const p = card.conflictExcerpt;
  if (p && typeof p.passage === "string") return p.passage;
  return "";
}

describe("B362 silence subject, last finding, empty slot, scale and cause", () => {
  test("doctored S9 still names AGIC, stays Conflicting, and shows the GIC passage", async () => {
    const s9 = await replayCard(DOC, 9);
    assert.equal(s9.displayVerdict, "conflict");
    assert.equal(s9.supportState, "conflicting");
    assert.match(s9.evidenceSummary, /AGIC/);
    assert.match(s9.evidenceSummary, /does not mention/);
    assert.match(conflictText(s9), new RegExp(GIC_SLICE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }, 20000);

  test("clean S9 still strips GIC silence and stays Confirmed", async () => {
    const s9 = await replayCard(CLEAN, 9);
    assert.equal(s9.displayVerdict, "supported_full");
    assert.equal(/\bdoes not mention\b/i.test(s9.evidenceSummary), false);
    assert.match(conflictText(s9) + primaryText(s9), /GIC/);
  }, 20000);

  test("a conflict card whose only explaining sentence would be removed keeps it and logs", () => {
    const logs = [];
    const orig = console.info;
    console.info = (...args) => {
      logs.push(args.map(String).join(" "));
    };
    try {
      const commentary = "The source does not mention GIC.";
      const quote = `${GIC_SLICE} in exchange for newly issued 3i Group plc shares.`;
      const out = stripOmissionOverclaimWhenDisplayed({
        commentary,
        displayedPassages: [quote],
        nonGreen: true,
        statementIndex: 99,
      });
      assert.match(out, /does not mention GIC/);
      assert.equal(
        logs.some((line) => /comment-finding-backstop/.test(line) && /omission-overclaim/.test(line)),
        true
      );
    } finally {
      console.info = orig;
    }
  });

  test("no card stores the same text in both excerpt slots", async () => {
    for (const payload of [CLEAN, DOC]) {
      const tag = payload === CLEAN ? "CLEAN" : "DOC";
      for (let i = 0; i < payload.statements.length; i += 1) {
        const card = await replayCard(payload, i);
        const a = primaryText(card);
        const b = conflictText(card);
        if (a.trim() && b.trim()) {
          assert.equal(excerptsAreSame(a, b), false, `${tag} S${i} duplicate slots`);
        }
      }
    }
  }, 30000);

  test("two distinct passages still fill both slots; one-passage conflict stays empty with a reason", async () => {
    const s1 = await replayCard(CLEAN, 1);
    assert.ok(primaryText(s1).trim());
    assert.ok(conflictText(s1).trim());
    assert.equal(excerptsAreSame(primaryText(s1), conflictText(s1)), false);

    const s0 = await replayCard(CLEAN, 0);
    assert.equal(s0.displayVerdict, "conflict");
    assert.ok(primaryText(s0).trim());
    assert.equal(conflictText(s0).trim(), "");
    assert.equal(s0.conflictExcerptEmptyReason, "no_distinct_passage");
  }, 20000);

  test("doctored S12 stops reading Confirmed; clean S12, S1, S5 stay; S2 inventory names the cause", async () => {
    const doc12 = await replayCard(DOC, 12);
    assert.notEqual(doc12.displayVerdict, "supported_full");
    assert.equal(doc12.displayVerdict, "conflict");
    assert.equal(doc12.displayVerdictReason, "scale_set_one_holding");
    assert.match(doc12.evidenceSummary, /TCR/);

    const clean12 = await replayCard(CLEAN, 12);
    assert.equal(clean12.displayVerdict, CLEAN.statements[12].qcCard.displayVerdict);
    assert.equal(universalSetHits(CLEAN.statements[12].qcCard.statement).length, 0);

    const s1 = await replayCard(CLEAN, 1);
    assert.equal(s1.displayVerdict, CLEAN.statements[1].qcCard.displayVerdict);
    const s1Arith = arithmeticScaleCheck(CLEAN.statements[1].qcCard.statement, [
      primaryText(s1),
      conflictText(s1),
    ]);
    if (s1Arith) assert.equal(s1Arith.pass, true);

    const s5 = await replayCard(CLEAN, 5);
    assert.equal(s5.displayVerdict, CLEAN.statements[5].qcCard.displayVerdict);
    const s5Claims = extractScaleCauseClaims(CLEAN.statements[5].qcCard.statement);
    assert.equal(
      s5Claims.some((c) => /period/i.test(c)),
      false
    );

    const s2Statement = CLEAN.statements[2].qcCard.statement;
    const s2Inventory = buildClaimInventory(s2Statement);
    assert.equal(
      s2Inventory.some((item) => /driven largely by/i.test(item)),
      true,
      `S2 inventory missing cause: ${JSON.stringify(s2Inventory)}`
    );
  }, 30000);

  test("lexicon hits across both fixture payloads", () => {
    let hits = 0;
    const rows = [];
    for (const payload of [CLEAN, DOC]) {
      const tag = payload === CLEAN ? "CLEAN" : "DOC";
      for (let i = 0; i < payload.statements.length; i += 1) {
        const claims = extractScaleCauseClaims(payload.statements[i].qcCard.statement);
        hits += claims.length;
        if (claims.length) rows.push(`${tag} S${i}: ${claims.join(" | ")}`);
      }
    }
    assert.equal(hits > 0, true);
    console.info(`[b362] lexicon-hits total=${hits}`);
    for (const row of rows) console.info(`[b362] ${row}`);
  });
});
