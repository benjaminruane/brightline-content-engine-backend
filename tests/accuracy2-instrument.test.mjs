import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import {
  LABEL_KIND_DRAFT_INTERNAL_PAIR,
  LABEL_KIND_STATEMENT,
  P29_PROTECTED_NAMES,
  assertNotP29ProtectedWrite,
  formatScoreReport,
  p29ProtectedPaths,
  scoreAccuracy,
} from "../scripts/diagnostic/accuracy/lib.mjs";
import {
  assertNoIntraFixtureNormalizedDuplicates,
  parseExtractArgs,
} from "../scripts/diagnostic/accuracy/extract-stage1.mjs";
import {
  assertFreezeCountForSelectedIds,
  countFreezeRowsForSelectedIds,
  evidenceCardsOutPath,
  parseEvidenceArgs,
  writeEvidenceCards,
} from "../scripts/diagnostic/accuracy/run-evidence.mjs";
import { normalizeLabelRow, normalizeLabelsDoc, parseLoadLabelsArgs, writeLabels } from "../scripts/diagnostic/accuracy/load-labels.mjs";
import { buildSample, parseSampleArgs, writeSample } from "../scripts/diagnostic/accuracy/sample.mjs";
import { parseWorksheetArgs, writeWorksheet } from "../scripts/diagnostic/accuracy/generate-worksheet.mjs";
import { filterFixtures, loadAllFixtures, parseIdsArg } from "../scripts/diagnostic/lib/fixtures.mjs";
import { runScore } from "../scripts/diagnostic/accuracy/score.mjs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";

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

describe("loadAllFixtures directory selection", () => {
  test("default directory is corpus 1; --fixtures-dir can load corpus 2", async () => {
    const corpus1 = await loadAllFixtures();
    assert.ok(corpus1.length > 12);
    const corpus2 = await loadAllFixtures(path.join(ROOT, "scripts/diagnostic/accuracy2/fixtures"));
    assert.equal(corpus2.length, 12);
    assert.deepEqual(
      corpus2.map((f) => String(f.data.id).padStart(2, "0")),
      ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]
    );
  });
});

describe("extract-stage1 P29 write guard", () => {
  test("refuses to write each of the four P29 paths", () => {
    const protectedPaths = p29ProtectedPaths(ACC);
    assert.equal(protectedPaths.length, 5);
    assert.deepEqual(
      P29_PROTECTED_NAMES.slice().sort(),
      ["group-a-design.json", "labels.json", "sample-manifest.json", "statements.json", "worksheet.md"]
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

  test("parseExtractArgs reads --ids, --out, --fixtures-dir, and --stability-gate", () => {
    const args = parseExtractArgs([
      "--stability-gate",
      "--ids",
      "01,03,05",
      "--out",
      "/tmp/c2.json",
      "--fixtures-dir",
      "scripts/diagnostic/accuracy2/fixtures",
    ]);
    assert.equal(args.stabilityGate, true);
    assert.deepEqual(args.ids, ["01", "03", "05"]);
    assert.equal(args.out, "/tmp/c2.json");
    assert.equal(args.fixturesDir, "scripts/diagnostic/accuracy2/fixtures");
    const defaults = parseExtractArgs(["--out", "/tmp/c1.json"]);
    assert.equal(defaults.fixturesDir, null);
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
    const args = parseEvidenceArgs([
      "--statements",
      "/tmp/c2-statements.json",
      "--ids",
      "01,03",
      "--pass",
      "c2-1",
      "--runs-root",
      "/tmp/c2-runs",
      "--fixtures-dir",
      "scripts/diagnostic/accuracy2/fixtures",
    ]);
    assert.equal(args.statements, "/tmp/c2-statements.json");
    assert.deepEqual(args.ids, ["01", "03"]);
    assert.equal(args.pass, "c2-1");
    assert.equal(args.runsRoot, "/tmp/c2-runs");
    assert.equal(args.fixturesDir, "scripts/diagnostic/accuracy2/fixtures");
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

function make54FaultCorpus() {
  const planted = [];
  const faults = [];
  for (let i = 0; i < 54; i += 1) {
    const token = `ZXFAULT${String(i).padStart(3, "0")}Q`;
    planted.push({
      index: i,
      text: `${token} unique planted sentence.`,
      charStart: i,
      charEnd: i + 1,
      occurrence: 0,
    });
    faults.push({ id: `F01-f${i}`, fixtureId: "01", span: token });
  }
  const clean = Array.from({ length: 50 }, (_, i) => ({
    index: 54 + i,
    text: `Clean bulk sentence ${i}.`,
    charStart: 54 + i,
    charEnd: 55 + i,
    occurrence: 0,
  }));
  return {
    statementsDoc: { fixtures: [{ fixtureId: "01", label: "synthetic", statements: [...planted, ...clean] }] },
    design: { faults },
  };
}

describe("P29 write refusal on remaining writers", () => {
  test("each of the four writers refuses each of the four P29 paths", async () => {
    const dummy = path.join(ACC, "labels.json");
    const writers = [
      (outPath) => writeSample({ statementsPath: dummy, designPath: dummy, outPath }),
      (outPath) => writeWorksheet({ manifestPath: dummy, statementsPath: dummy, outPath }),
      (outPath) => writeLabels({ worksheetPath: dummy, manifestPath: dummy, statementsPath: dummy, outPath }),
      (outPath) => writeEvidenceCards(outPath, { cards: [] }),
    ];
    for (const p29 of p29ProtectedPaths(ACC)) {
      for (const write of writers) {
        await assert.rejects(
          () => write(p29),
          (err) => {
            const msg = String(err.message);
            assert.match(msg, /P29-protected/);
            assert.match(msg, /corpus 1 is closed/);
            assert.ok(msg.includes(path.basename(p29)), msg);
            return true;
          }
        );
      }
    }
  });
});

describe("parameterised writers", () => {
  test("sample, worksheet and load-labels write to supplied non-default paths", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "accuracy2-writers-"));
    try {
      const designCopy = path.join(dir, "in-design.json");
      const statementsCopy = path.join(dir, "in-statements-c1.json");
      await writeFile(designCopy, await readFile(path.join(ACC, "group-a-design.json")));
      await writeFile(statementsCopy, await readFile(path.join(ACC, "statements.json")));
      const sampleArgs = parseSampleArgs([
        "--design",
        designCopy,
        "--statements",
        statementsCopy,
        "--out",
        path.join(dir, "sample-manifest.json"),
        "--group-a-cap",
        "25",
      ]);
      const sampled = await writeSample({
        designPath: sampleArgs.design,
        statementsPath: sampleArgs.statements,
        outPath: sampleArgs.out,
        groupACap: sampleArgs.groupACap,
      });
      const writtenManifest = JSON.parse(await readFile(sampled.outPath, "utf8"));
      assert.equal(writtenManifest.groupACount, 11);
      assert.equal(writtenManifest.groupAHardCap, 25);

      const tinyManifest = {
        groupA: [
          { fixtureId: "01", statementText: "Hello world.", occurrence: 0, index: 0, designIds: ["t"] },
        ],
        groupB: [],
      };
      const tinyStatements = { fixtures: [{ fixtureId: "01", statements: [{ text: "Hello world.", index: 0 }] }] };
      const manifestPath = path.join(dir, "in-manifest.json");
      const statementsPath = path.join(dir, "in-statements.json");
      await writeFile(manifestPath, `${JSON.stringify(tinyManifest)}\n`);
      await writeFile(statementsPath, `${JSON.stringify(tinyStatements)}\n`);
      const wsArgs = parseWorksheetArgs([
        "--manifest",
        manifestPath,
        "--statements",
        statementsPath,
        "--out",
        path.join(dir, "worksheet.md"),
        "--ids",
        "01",
        "--fixtures-dir",
        "scripts/diagnostic/accuracy2/fixtures",
      ]);
      assert.equal(wsArgs.fixturesDir, "scripts/diagnostic/accuracy2/fixtures");
      const sheet = await writeWorksheet({
        manifestPath: wsArgs.manifest,
        statementsPath: wsArgs.statements,
        outPath: wsArgs.out,
        ids: wsArgs.ids,
        loadFixtures: async () => [
          {
            data: {
              id: "01",
              label: "synthetic",
              sources: ["synthetic.txt"],
              config: { outputType: "memo", requiredVersion: "complete" },
            },
          },
        ],
        loadSources: async () => [{ label: "synthetic", text: "Source body." }],
      });
      const md = await readFile(sheet.outPath, "utf8");
      assert.match(md, /Hello world\./);
      assert.match(md, /Source body\./);

      const worksheetCopy = path.join(dir, "in-worksheet.md");
      const manifestCopy = path.join(dir, "in-c1-manifest.json");
      await writeFile(worksheetCopy, await readFile(path.join(ACC, "worksheet.md")));
      await writeFile(manifestCopy, await readFile(path.join(ACC, "sample-manifest.json")));
      const labelArgs = parseLoadLabelsArgs([
        "--worksheet",
        worksheetCopy,
        "--manifest",
        manifestCopy,
        "--statements",
        statementsCopy,
        "--out",
        path.join(dir, "labels.json"),
      ]);
      const labelled = await writeLabels({
        worksheetPath: labelArgs.worksheet,
        manifestPath: labelArgs.manifest,
        statementsPath: labelArgs.statements,
        outPath: labelArgs.out,
      });
      const labelsDoc = JSON.parse(await readFile(labelled.outPath, "utf8"));
      assert.equal(labelsDoc.labels.length, 100);
      assert.equal(labelsDoc.mix.C, 74);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("run-evidence writes under a supplied --runs-root", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "accuracy2-runs-"));
    try {
      const args = parseEvidenceArgs(["--runs-root", dir, "--pass", "c2-1"]);
      const outPath = evidenceCardsOutPath(args.runsRoot, args.pass);
      await writeEvidenceCards(outPath, { pass: "c2-1", cards: [{ fixtureId: "01", statement: "x" }] });
      const written = JSON.parse(await readFile(outPath, "utf8"));
      assert.equal(written.pass, "c2-1");
      assert.equal(path.dirname(path.dirname(outPath)), path.resolve(dir));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("configurable group A cap", () => {
  test("cap of 60 accepts 54 mapped faults; cap of 25 refuses them", async () => {
    const { statementsDoc, design } = make54FaultCorpus();
    const ok = await buildSample({ statementsDoc, design, groupACap: 60 });
    assert.equal(ok.mapped.groupA.length, 54);
    assert.equal(ok.manifest.groupAHardCap, 60);
    await assert.rejects(
      () => buildSample({ statementsDoc, design, groupACap: 25 }),
      (err) => {
        const msg = String(err.message);
        assert.match(msg, /54/);
        assert.match(msg, /25/);
        return true;
      }
    );
  });

  test("an ambiguous span still fails sampling regardless of the cap", async () => {
    const statementsDoc = {
      fixtures: [
        {
          fixtureId: "01",
          statements: [
            { index: 0, text: "The same span appears here.", occurrence: 0 },
            { index: 1, text: "And the same span appears again.", occurrence: 0 },
            { index: 2, text: "Clean leftover.", occurrence: 0 },
          ],
        },
      ],
    };
    const design = { faults: [{ id: "ambig", fixtureId: "01", span: "same span appears" }] };
    await assert.rejects(
      () => buildSample({ statementsDoc, design, groupACap: 60 }),
      (err) => {
        const msg = String(err.message);
        assert.match(msg, /exactly one statement/);
        assert.match(msg, /ambiguous/);
        assert.equal(/hard cap/.test(msg), false);
        return true;
      }
    );
  });
});
