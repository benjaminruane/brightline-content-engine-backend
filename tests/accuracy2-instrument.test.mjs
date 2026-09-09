import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import {
  LABEL_KIND_DRAFT_INTERNAL_PAIR,
  LABEL_KIND_STATEMENT,
  formatScoreReport,
  scoreAccuracy,
} from "../scripts/diagnostic/accuracy/lib.mjs";
import {
  P29_PROTECTED_NAMES,
  assertNoIntraFixtureNormalizedDuplicates,
  assertNotP29ProtectedWrite,
  parseExtractArgs,
  p29ProtectedPaths,
} from "../scripts/diagnostic/accuracy/extract-stage1.mjs";
import {
  assertFreezeCountForSelectedIds,
  countFreezeRowsForSelectedIds,
  parseEvidenceArgs,
} from "../scripts/diagnostic/accuracy/run-evidence.mjs";
import { normalizeLabelRow, normalizeLabelsDoc } from "../scripts/diagnostic/accuracy/load-labels.mjs";
import { filterFixtures, parseIdsArg } from "../scripts/diagnostic/lib/fixtures.mjs";
import { runScore } from "../scripts/diagnostic/accuracy/score.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ACC = path.join(ROOT, "scripts/diagnostic/accuracy");

function fx(id) {
  return { data: { id } };
}

const FIXTURES = ["01", "02", "03", "04", "05"].map(fx);

describe("filterFixtures ids", () => {
  test("selects exactly the named ids", () => {
    const selected = filterFixtures(FIXTURES, { ids: parseIdsArg("01,03,05") });
    assert.deepEqual(
      selected.map((f) => String(f.data.id).padStart(2, "0")),
      ["01", "03", "05"]
    );
  });

  test("ids beats only and range", () => {
    const selected = filterFixtures(FIXTURES, {
      ids: ["03", "05"],
      only: "01",
      range: { from: "01", to: "20" },
    });
    assert.deepEqual(
      selected.map((f) => String(f.data.id).padStart(2, "0")),
      ["03", "05"]
    );
  });
});

describe("extract-stage1 P29 write guard", () => {
  test("refuses to write each of the four P29 paths", () => {
    const protectedPaths = p29ProtectedPaths(ACC);
    assert.equal(protectedPaths.length, 4);
    assert.deepEqual(
      P29_PROTECTED_NAMES.slice().sort(),
      ["group-a-design.json", "labels.json", "sample-manifest.json", "statements.json"]
    );
    for (const filePath of protectedPaths) {
      assert.throws(
        () => assertNotP29ProtectedWrite(filePath, ACC),
        (err) => {
          const msg = String(err.message);
          assert.match(msg, /P29-protected/);
          assert.match(msg, /corpus 1 is closed/);
          assert.ok(msg.includes(path.basename(filePath)), msg);
          return true;
        }
      );
    }
  });

  test("allows a statements.json outside the corpus 1 directory", () => {
    assert.doesNotThrow(() =>
      assertNotP29ProtectedWrite(path.join(ROOT, "scripts/diagnostic/accuracy2/statements.json"), ACC)
    );
  });

  test("parseExtractArgs reads --ids, --out, and --stability-gate", () => {
    const args = parseExtractArgs(["--stability-gate", "--ids", "01,03,05", "--out", "/tmp/c2.json"]);
    assert.equal(args.stabilityGate, true);
    assert.deepEqual(args.ids, ["01", "03", "05"]);
    assert.equal(args.out, "/tmp/c2.json");
  });
});

describe("extract-stage1 freeze duplicate guard", () => {
  test("refuses duplicate normalised text within one fixture", () => {
    const freeze = {
      fixtures: [
        {
          fixtureId: "01",
          statements: [{ text: "Revenue grew 12%." }, { text: "  Revenue   grew 12%. " }],
        },
      ],
    };
    assert.throws(
      () => assertNoIntraFixtureNormalizedDuplicates(freeze),
      (err) => {
        const msg = String(err.message);
        assert.match(msg, /F01/);
        assert.match(msg, /Revenue grew 12%\./);
        return true;
      }
    );
  });

  test("accepts the same text in two different fixtures", () => {
    const freeze = {
      fixtures: [
        { fixtureId: "01", statements: [{ text: "Revenue grew 12%." }] },
        { fixtureId: "02", statements: [{ text: "Revenue grew 12%." }] },
      ],
    };
    assert.doesNotThrow(() => assertNoIntraFixtureNormalizedDuplicates(freeze));
  });
});

describe("run-evidence --statements and selected-id freeze count", () => {
  test("accepts --statements at a non-default path", () => {
    const args = parseEvidenceArgs(["--statements", "/tmp/c2-statements.json", "--ids", "01,03", "--pass", "c2-1"]);
    assert.equal(args.statements, "/tmp/c2-statements.json");
    assert.deepEqual(args.ids, ["01", "03"]);
    assert.equal(args.pass, "c2-1");
  });

  test("validates freeze count against selected ids rather than 261", () => {
    const statementsDoc = {
      fixtures: [
        {
          fixtureId: "01",
          statements: [{ text: "A." }, { text: "B." }, { text: "C." }],
        },
        {
          fixtureId: "03",
          statements: [{ text: "D." }, { text: "E." }],
        },
      ],
    };
    const counted = countFreezeRowsForSelectedIds(statementsDoc, ["01", "03"]);
    assert.equal(counted.actual, 5);
    assert.notEqual(counted.actual, 261);
    assert.deepEqual(counted.missing, []);
    assert.equal(assertFreezeCountForSelectedIds(statementsDoc, ["01", "03"]), 5);

    assert.throws(
      () => assertFreezeCountForSelectedIds(statementsDoc, ["01", "03", "99"]),
      (err) => {
        const msg = String(err.message);
        assert.match(msg, /actual 5/);
        assert.match(msg, /expected freeze rows/);
        assert.match(msg, /99/);
        return true;
      }
    );
  });
});

describe("pair label kind", () => {
  test("load-labels round-trips a draft_internal_pair row", () => {
    const pair = {
      kind: LABEL_KIND_DRAFT_INTERNAL_PAIR,
      fixtureId: "13",
      statementTextA: "The Company employs 320 people.",
      occurrenceA: 0,
      statementTextB: "Headcount is 285.",
      occurrenceB: 0,
      worksheetRow: 4,
      group: "A",
      label: "conflicting",
    };
    const round = normalizeLabelRow(pair);
    assert.equal(round.kind, LABEL_KIND_DRAFT_INTERNAL_PAIR);
    assert.equal(round.fixtureId, "13");
    assert.equal(round.statementTextA, pair.statementTextA);
    assert.equal(round.occurrenceA, 0);
    assert.equal(round.statementTextB, pair.statementTextB);
    assert.equal(round.occurrenceB, 0);
    assert.equal(round.label, "conflicting");
    assert.equal(Object.prototype.hasOwnProperty.call(round, "statementText"), false);

    const fromCorpus1 = normalizeLabelRow({
      fixtureId: "01",
      statementText: "We recommend approval.",
      occurrence: 0,
      worksheetRow: 4,
      group: "B",
      label: "confirmed",
    });
    assert.equal(fromCorpus1.kind, LABEL_KIND_STATEMENT);
    assert.equal(fromCorpus1.statementText, "We recommend approval.");

    const doc = normalizeLabelsDoc({ labels: [pair, { fixtureId: "01", statementText: "Hi.", occurrence: 0, label: "C" }] });
    assert.equal(doc[0].kind, LABEL_KIND_DRAFT_INTERNAL_PAIR);
    assert.equal(doc[1].kind, LABEL_KIND_STATEMENT);
  });

  test("score.mjs skips pair rows, counts them, and matches statement-only numbers", () => {
    const statementLabels = [
      { fixtureId: "01", statementText: "Shared sentence.", occurrence: 0, label: "C" },
      { fixtureId: "02", statementText: "Group A fault.", occurrence: 0, label: "X" },
    ];
    const cards = [
      { fixtureId: "01", statement: "Shared sentence.", occurrence: 0, displayVerdict: "supported_full" },
      { fixtureId: "02", statement: "Group A fault.", occurrence: 0, displayVerdict: "conflict" },
    ];
    const groupAKeys = new Set(["02::Group A fault.::0"]);
    const groupBKeys = new Set(["01::Shared sentence.::0"]);
    const statementOnly = scoreAccuracy({
      labels: statementLabels,
      cards,
      groupAKeys,
      groupBKeys,
    });
    const withPair = scoreAccuracy({
      labels: [
        ...statementLabels,
        {
          kind: LABEL_KIND_DRAFT_INTERNAL_PAIR,
          fixtureId: "13",
          statementTextA: "Employs 320.",
          occurrenceA: 0,
          statementTextB: "Headcount is 285.",
          occurrenceB: 0,
          label: "X",
        },
      ],
      cards,
      groupAKeys,
      groupBKeys,
    });
    assert.equal(statementOnly.skippedNonStatement.count, 0);
    assert.equal(withPair.skippedNonStatement.count, 1);
    assert.equal(withPair.skippedNonStatement.byKind[LABEL_KIND_DRAFT_INTERNAL_PAIR], 1);
    assert.equal(withPair.groupA.n, statementOnly.groupA.n);
    assert.equal(withPair.groupA.agreements, statementOnly.groupA.agreements);
    assert.equal(withPair.groupB.n, statementOnly.groupB.n);
    assert.equal(withPair.groupB.amongBenConfirmed.n, statementOnly.groupB.amongBenConfirmed.n);
    assert.equal(withPair.unmatchedLabels.length, statementOnly.unmatchedLabels.length);
    const printed = formatScoreReport(withPair);
    assert.match(printed, /SKIPPED_NON_STATEMENT: 1/);
  });
});

describe("corpus 1 score is unchanged", () => {
  test("lift-1 still catch 9 of 11 and leave-alone 67 of 74", async () => {
    const result = await runScore({
      labelsPath: path.join(ACC, "labels.json"),
      cardsPath: path.join(ACC, "runs/evidence-pass-lift-1/cards.json"),
      manifestPath: path.join(ACC, "sample-manifest.json"),
    });
    assert.equal(result.groupA.n, 11);
    assert.equal(result.groupA.agreements, 9);
    assert.equal(result.groupB.amongBenConfirmed.n, 74);
    assert.equal(result.groupB.amongBenConfirmed.pipelineAlsoConfirmed, 67);
    assert.equal(result.skippedNonStatement.count, 0);
  });
});
