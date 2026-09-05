import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import {
  SAMPLE_SEED,
  WORKSHEET_PIPELINE_IMPORT_PATTERNS,
  countMismatchedSlots,
  flattenStatements,
  formatScoreReport,
  joinKey,
  mapGroupA,
  sampleGroupB,
  scoreAccuracy,
  wilsonInterval,
} from "../scripts/diagnostic/accuracy/lib.mjs";
import { COVER_PAGE as WORKSHEET_COVER } from "../scripts/diagnostic/accuracy/generate-worksheet.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ACC = path.join(ROOT, "scripts/diagnostic/accuracy");

function syntheticStatements() {
  const fixtures = [];
  for (let i = 1; i <= 3; i += 1) {
    const id = String(i).padStart(2, "0");
    const statements = [];
    for (let n = 0; n < 10; n += 1) {
      statements.push({
        index: n,
        text: `Fixture ${id} sentence ${n} about revenue.`,
        charStart: n * 10,
        charEnd: n * 10 + 8,
        occurrence: 0,
      });
    }
    fixtures.push({ fixtureId: id, label: `fx${id}`, statements });
  }
  fixtures.push({
    fixtureId: "15",
    label: "long",
    statements: Array.from({ length: 20 }, (_, n) => ({
      index: n,
      text: `Casa Verde sentence ${n}.`,
      charStart: n,
      charEnd: n + 1,
      occurrence: 0,
    })),
  });
  return { fixtures };
}

describe("worksheet generator cannot read pipeline output", () => {
  test("generate-worksheet.mjs source has no pipeline result imports", () => {
    const src = readFileSync(path.join(ACC, "generate-worksheet.mjs"), "utf8");
    for (const pat of WORKSHEET_PIPELINE_IMPORT_PATTERNS) {
      assert.equal(src.includes(pat), false, `worksheet generator must not mention ${pat}`);
    }
  });

  test("cover page is the shipped string", () => {
    assert.match(WORKSHEET_COVER, /if ANY uploaded source contradicts the statement, the label is X/);
    assert.match(WORKSHEET_COVER, /If you would be guessing, use E/);
    assert.match(
      WORKSHEET_COVER,
      /if the draft matches the most recent source and only an older source disagrees, the label is C/
    );
  });
});

describe("Group A membership never reads a verdict field", () => {
  test("design file has no verdict fields", () => {
    const design = JSON.parse(readFileSync(path.join(ACC, "group-a-design.json"), "utf8"));
    const blob = JSON.stringify(design);
    assert.equal(/"displayVerdict"|"qcCards"|"evidenceSummary"|"classification"|"commentary"/.test(blob), false);
    assert.ok(Array.isArray(design.faults));
    for (const f of design.faults) {
      assert.ok(f.span);
      assert.ok(f.fixtureId);
      assert.equal(Object.prototype.hasOwnProperty.call(f, "verdict"), false);
    }
  });

  test("mapGroupA ignores displayVerdict on the statement object", () => {
    const design = {
      faults: [{ id: "t1", fixtureId: "05", span: "wrong acquirer" }],
    };
    const clean = [
      { fixtureId: "05", text: "This is the wrong acquirer sentence.", occurrence: 0, index: 0 },
      { fixtureId: "05", text: "A clean sentence.", occurrence: 0, index: 1 },
    ];
    const dirty = clean.map((s, i) => ({
      ...s,
      displayVerdict: i === 0 ? "conflict" : "supported_full",
      classification: "conflicting",
      excerpt: "should not matter",
    }));
    const a = mapGroupA(clean, design);
    const b = mapGroupA(dirty, design);
    assert.equal(a.groupA.length, 1);
    assert.deepEqual(
      a.groupA.map((s) => joinKey(s.fixtureId, s.text, s.occurrence)),
      b.groupA.map((s) => joinKey(s.fixtureId, s.text, s.occurrence))
    );
  });
});

describe("seed reproduces the same Group B", () => {
  test("sampleGroupB is deterministic for seed 20260905", () => {
    const statements = flattenStatements(syntheticStatements());
    const groupAKeys = new Set([joinKey("01", statements[0].text, 0)]);
    const first = sampleGroupB({
      statements,
      groupAKeys,
      seed: SAMPLE_SEED,
      targetCount: 20,
      f15Cap: 6,
    });
    const second = sampleGroupB({
      statements,
      groupAKeys,
      seed: SAMPLE_SEED,
      targetCount: 20,
      f15Cap: 6,
    });
    assert.deepEqual(
      first.groupB.map((s) => joinKey(s.fixtureId, s.text, s.occurrence)),
      second.groupB.map((s) => joinKey(s.fixtureId, s.text, s.occurrence))
    );
    assert.ok((first.drawnPerFixture["15"] || 0) <= 6);
  });
});

describe("join reports unmatched on both sides", () => {
  test("unmatched labels and unmatched predictions are kept", () => {
    const result = scoreAccuracy({
      labels: [
        { fixtureId: "01", statementText: "Only in labels.", occurrence: 0, label: "C" },
        { fixtureId: "01", statementText: "Shared sentence.", occurrence: 0, label: "C" },
      ],
      cards: [
        { fixtureId: "01", statement: "Shared sentence.", occurrence: 0, displayVerdict: "supported_full" },
        { fixtureId: "01", statement: "Only in cards.", occurrence: 0, displayVerdict: "conflict" },
      ],
      groupAKeys: new Set(),
      groupBKeys: new Set([joinKey("01", "Shared sentence.", 0)]),
    });
    assert.equal(result.unmatchedLabels.length, 1);
    assert.equal(result.unmatchedLabels[0].statementText, "Only in labels.");
    assert.equal(result.unmatchedPredictions.length, 1);
    assert.equal(result.unmatchedPredictions[0].statementText, "Only in cards.");
  });
});

describe("escapes are excluded from both rates", () => {
  test("E does not enter n", () => {
    const result = scoreAccuracy({
      labels: [
        { fixtureId: "01", statementText: "A.", occurrence: 0, label: "E" },
        { fixtureId: "01", statementText: "B.", occurrence: 0, label: "C" },
        { fixtureId: "02", statementText: "C.", occurrence: 0, label: "X" },
      ],
      cards: [
        { fixtureId: "01", statement: "A.", occurrence: 0, displayVerdict: "not_supported" },
        { fixtureId: "01", statement: "B.", occurrence: 0, displayVerdict: "supported_full" },
        { fixtureId: "02", statement: "C.", occurrence: 0, displayVerdict: "conflict" },
      ],
      groupAKeys: new Set([joinKey("02", "C.", 0)]),
      groupBKeys: new Set([joinKey("01", "A.", 0), joinKey("01", "B.", 0)]),
    });
    assert.equal(result.escapes.count, 1);
    assert.equal(result.groupB.n, 1);
    assert.equal(result.groupA.n, 1);
    assert.equal(result.groupA.rate, 1);
    assert.equal(result.groupB.rate, 1);
  });
});

describe("A and B are never averaged", () => {
  test("score object has no combined rate field", () => {
    const result = scoreAccuracy({
      labels: [
        { fixtureId: "01", statementText: "A.", occurrence: 0, label: "C" },
        { fixtureId: "02", statementText: "B.", occurrence: 0, label: "N" },
      ],
      cards: [
        { fixtureId: "01", statement: "A.", occurrence: 0, displayVerdict: "supported_full" },
        { fixtureId: "02", statement: "B.", occurrence: 0, displayVerdict: "supported_full" },
      ],
      groupAKeys: new Set([joinKey("01", "A.", 0)]),
      groupBKeys: new Set([joinKey("02", "B.", 0)]),
    });
    assert.equal(Object.prototype.hasOwnProperty.call(result, "combined"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "overall"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "average"), false);
    assert.notEqual(result.groupA.rate, result.groupB.rate);
    const printed = formatScoreReport(result);
    assert.equal(/combined rate|overall rate|average of group/i.test(printed), false);
    assert.match(printed, /GROUP A/);
    assert.match(printed, /GROUP B/);
  });

  test("score.mjs source does not average the two groups", () => {
    const src = `${readFileSync(path.join(ACC, "score.mjs"), "utf8")}\n${readFileSync(path.join(ACC, "lib.mjs"), "utf8")}`;
    assert.equal(src.includes("groupA.rate + groupB.rate"), false);
    assert.equal(src.includes("combinedRate"), false);
    assert.equal(src.includes("overallRate"), false);
  });
});

describe("wilson and any-confirmed-wins", () => {
  test("wilson is not a normal approximation at n=0", () => {
    const w = wilsonInterval(0, 0);
    assert.equal(w.rate, null);
  });

  test("disagreement from any-confirmed-wins is counted separately", () => {
    const result = scoreAccuracy({
      labels: [{ fixtureId: "18", statementText: "ARR is 38.", occurrence: 0, label: "X" }],
      cards: [
        {
          fixtureId: "18",
          statement: "ARR is 38.",
          occurrence: 0,
          displayVerdict: "supported_full",
          hasConflict: true,
          sourceMatches: [{ classification: "confirmed" }, { classification: "conflicting" }],
        },
      ],
      groupAKeys: new Set([joinKey("18", "ARR is 38.", 0)]),
      groupBKeys: new Set(),
    });
    assert.equal(result.groupA.n, 1);
    assert.equal(result.groupA.agreements, 0);
    assert.equal(result.anyConfirmedWins.count, 1);
    assert.equal(result.groupA.disagreements.length, 1);
  });
});

describe("score.mjs against a synthetic label file", () => {
  test("runScore reads files and does not drop unmatched", async () => {
    const { runScore } = await import("../scripts/diagnostic/accuracy/score.mjs");
    const result = await runScore({
      labelsPath: path.join(ROOT, "tests/accuracy-synthetic-labels.json"),
      cardsPath: path.join(ROOT, "tests/accuracy-synthetic-cards.json"),
      manifestPath: path.join(ROOT, "tests/accuracy-synthetic-manifest.json"),
    });
    assert.equal(result.unmatchedLabels.length, 1);
    assert.equal(result.unmatchedPredictions.length, 1);
    assert.equal(result.escapes.count, 1);
    assert.equal(result.groupA.n, 1);
    assert.equal(result.groupA.agreements, 0);
    assert.equal(result.anyConfirmedWins.count, 1);
    assert.equal(result.groupB.n, 1);
    assert.equal(result.groupB.amongBenConfirmed.n, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "combined"), false);
  });
});

describe("stability slot count", () => {
  test("identical runs have zero mismatched slots", () => {
    const run = syntheticStatements();
    const cmp = countMismatchedSlots(run, run);
    assert.equal(cmp.mismatchedSlots, 0);
  });

  test("one split counts as mismatched slots", () => {
    const a = syntheticStatements();
    const b = syntheticStatements();
    b.fixtures[0].statements[0].text = "Different sentence.";
    const cmp = countMismatchedSlots(a, b);
    assert.equal(cmp.mismatchedSlots, 1);
  });
});
