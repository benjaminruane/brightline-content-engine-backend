/**
 * B360. A card can show two source passages. Ceiling two. Deterministic.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import { splitSentences, stripOmissionOverclaimWhenDisplayed } from "../lib/qc/card-honesty.mjs";
import { MAX_SHOWN_PASSAGES, excerptsAreSame } from "../lib/qc/excerpt-pair.mjs";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { selectExcerpts } from "../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";

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
const PE_RETURN = "gross investment return of £3,234 million or 14%";
const TOTAL_RETURN_13 = "The total return of 13%";

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

function shownPassages(card) {
  const out = [];
  const a = primaryText(card).trim();
  const b = conflictText(card).trim();
  if (a) out.push(a);
  if (b && b.replace(/\s+/g, " ").toLowerCase() !== a.replace(/\s+/g, " ").toLowerCase()) out.push(b);
  return out;
}

function shownHay(card) {
  return [primaryText(card), conflictText(card)].join("\n");
}

function quoteIsWholeSentences(shown) {
  const t = String(shown || "").trim();
  if (!t) return;
  assert.equal(/\.{3}[A-Za-z0-9€£$]/.test(t), false, `ellipsis glued mid-token: ${t.slice(0, 80)}`);
  assert.equal(/[A-Za-z0-9€£$]\.{3}/.test(t), false, `ellipsis glued after token: ${t.slice(-80)}`);
  const stripped = t.replace(/^\.\.\.\s*/, "").replace(/\s*\.\.\.$/, "").trim();
  const sentences = splitSentences(stripped);
  assert.equal(sentences.length >= 1, true);
  assert.equal(sentences.join("").trim(), stripped);
}

describe("B360 two passages on a card", () => {
  test("ceiling is two", () => {
    assert.equal(MAX_SHOWN_PASSAGES, 2);
  });

  test("doctored S9 shows the GIC passage and still names AGIC", async () => {
    const s9 = await replayCard(DOC, 9);
    const hay = shownHay(s9);
    assert.match(hay, new RegExp(GIC_SLICE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(s9.displayVerdict, "conflict");
    assert.match(s9.evidenceSummary, /AGIC/);
    assert.match(s9.evidenceSummary, /does not mention/);
    assert.equal(/AGIC/.test(hay), false);
    assert.ok(conflictText(s9).trim());
  }, 20000);

  test("statement 1 both payloads make the PE return and the total return available, and show both", async () => {
    for (const payload of [CLEAN, DOC]) {
      const s1 = await replayCard(payload, 1);
      const hay = shownHay(s1);
      assert.match(hay, /£3,234 million/);
      assert.match(hay, /14%/);
      assert.match(hay, /13%/);
      const passages = shownPassages(s1);
      assert.equal(passages.length, 2, "both stored figures are shown");
      assert.match(passages.join("\n"), new RegExp(PE_RETURN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(passages.join("\n"), new RegExp(TOTAL_RETURN_13.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }, 20000);

  test("every conflict card with a distinct competing passage fills conflictExcerpt; one-passage cards stay empty", async () => {
    for (const payload of [CLEAN, DOC]) {
      const tag = payload === CLEAN ? "CLEAN" : "DOC";
      for (let i = 0; i < payload.statements.length; i += 1) {
        const card = await replayCard(payload, i);
        const conflictFace =
          card.displayVerdict === "conflict" ||
          card.supportState === "conflicting" ||
          card.hasConflict === true;
        const primary = primaryText(card).trim();
        const conflict = conflictText(card).trim();
        if (primary && conflict) {
          assert.equal(
            excerptsAreSame(primary, conflict),
            false,
            `${tag} S${i} stores the same text in both slots`
          );
        }
        if (conflictFace && primary && !conflict) {
          assert.equal(card.conflictExcerptEmptyReason, "no_distinct_passage");
        }
      }
    }
  }, 30000);

  test("B359 must-pass still holds", async () => {
    const s9 = await replayCard(CLEAN, 9);
    assert.match(primaryText(s9), /redeployed to acquire a/);
    assert.match(primaryText(s9), /62\.3%/);
    const s6 = await replayCard(CLEAN, 6);
    assert.match(primaryText(s6), /capital restructuring/);
    const s8 = await replayCard(CLEAN, 8);
    assert.match(primaryText(s8), /capital restructuring/);
    const s5 = await replayCard(CLEAN, 5);
    assert.match(primaryText(s5), /6\.3%/);
    const s5doc = await replayCard(DOC, 5);
    assert.match(primaryText(s5doc), /6\.3%/);
    const s7 = await replayCard(CLEAN, 7);
    assert.match(primaryText(s7), /€3\.1 billion/);
    assert.match(primaryText(s7), /€14 million/);
    const s10 = await replayCard(CLEAN, 10);
    assert.match(primaryText(s10), /realisation of MPM/);
    assert.match(primaryText(s10), /3\.2x/);
    assert.match(primaryText(s10), /2\.8x/);
    const s10doc = await replayCard(DOC, 10);
    assert.match(primaryText(s10doc), /realisation of MPM/);
    assert.match(primaryText(s10doc), /2\.8x/);
  }, 30000);

  test("R2 R3 R4 hold on all thirty cards in both payloads", async () => {
    for (const payload of [CLEAN, DOC]) {
      const tag = payload === CLEAN ? "CLEAN" : "DOC";
      for (let i = 0; i < payload.statements.length; i += 1) {
        const card = await replayCard(payload, i);
        const passages = [primaryText(card), conflictText(card)].filter((p) => p.trim());
        for (const p of passages) quoteIsWholeSentences(p);
        const hay = passages.join("\n");
        if (/\bdoes not mention\b/i.test(card.evidenceSummary)) {
          const omission = stripOmissionOverclaimWhenDisplayed({
            commentary: card.evidenceSummary,
            displayedPassages: passages,
            nonGreen:
              card.displayVerdict === "conflict" ||
              card.supportState === "conflicting" ||
              card.hasConflict === true,
          });
          if (omission !== card.evidenceSummary && !/\bdoes not mention\b/i.test(omission)) {
            const clause = [...card.evidenceSummary.matchAll(/\bdoes not mention\s+((?:(?!\.(?:\s|$)).)+)/gi)];
            for (const m of clause) {
              const names = [...(m[1].match(/\b[A-Z]{2,}\b/g) || [])];
              const allNamesHeld = names.length > 0 && names.every((tok) => hay.includes(tok));
              if (names.length > 0 && !allNamesHeld) {
                assert.equal(
                  true,
                  false,
                  `${tag} S${i} stripped silence whose subject is not in the quotes`
                );
              }
            }
          }
        }
      }
    }
  }, 30000);

  test("omission strip tests the named subject, not a neighbouring figure", () => {
    const commentary =
      "The source confirms the 2.2% stake. The conflict arises because the source does not mention an earlier 2.2% stake purchase from AGIC. The reviewer should reconcile this discrepancy.";
    const gic = `${GIC_SLICE} in exchange for newly issued 3i Group plc shares.`;
    const kept = stripOmissionOverclaimWhenDisplayed({
      commentary,
      displayedPassages: [gic],
      nonGreen: true,
    });
    assert.match(kept, /AGIC/);
    assert.match(kept, /does not mention/);
    const gicSilence =
      "The source confirms the 2.2% stake. The source does not mention the GIC purchase.";
    const stripped = stripOmissionOverclaimWhenDisplayed({
      commentary: gicSilence,
      displayedPassages: [gic],
      nonGreen: false,
    });
    assert.equal(/\bdoes not mention\b/i.test(stripped), false);
    assert.match(stripped, /confirms the 2\.2% stake/);
  });
});
