import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import {
  INPUTS_DIR,
  applyCorrections,
  parseDraftFile,
} from "../scripts/diagnostic/accuracy2/build-design.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = path.join(ROOT, "scripts/diagnostic/accuracy2/build-design.mjs");
const DESIGN_PATH = path.join(ROOT, "scripts/diagnostic/accuracy2/design.json");
const FIXTURES_DIR = path.join(ROOT, "scripts/diagnostic/accuracy2/fixtures");

const VERDICT_KEYS = ["verdict", "displayVerdict", "classification", "evidenceVerdict"];

describe("accuracy2 design and fixtures", () => {
  test("build-design.mjs exits zero", () => {
    const spawned = spawnSync(process.execPath, [BUILD], { encoding: "utf8" });
    assert.equal(spawned.status, 0, `${spawned.stderr}\n${spawned.stdout}`);
  });

  test("part 2 shape-count and span assertions", async () => {
    const spawned = spawnSync(process.execPath, [BUILD], { encoding: "utf8" });
    assert.equal(spawned.status, 0, `${spawned.stderr}\n${spawned.stdout}`);
    const design = JSON.parse(await readFile(DESIGN_PATH, "utf8"));
    const names = (await readdir(FIXTURES_DIR)).filter((n) => n.endsWith(".json")).sort();
    assert.equal(names.length, 12);
    const fixtures = [];
    for (const name of names) {
      fixtures.push(JSON.parse(await readFile(path.join(FIXTURES_DIR, name), "utf8")));
    }
    const kelvedge = await readFile(path.join(INPUTS_DIR, "drafts-kelvedge.md"), "utf8");
    const cravenford = await readFile(path.join(INPUTS_DIR, "drafts-cravenford.md"), "utf8");
    const drafts = applyCorrections([...parseDraftFile(kelvedge), ...parseDraftFile(cravenford)]);
    assert.equal(
      drafts.reduce((n, d) => n + d.statements.length, 0),
      240
    );

    const draftByFixture = {};
    const metaOrder = [
      "K-D1",
      "K-D2",
      "K-D3",
      "K-D4",
      "K-D5",
      "K-D6",
      "C-D1",
      "C-D2",
      "C-D3",
      "C-D4",
      "C-D5",
      "C-D6",
    ];
    metaOrder.forEach((id, i) => {
      draftByFixture[String(i + 1).padStart(2, "0")] = drafts.find((d) => d.draftId === id);
    });

    const entries = design.faults;
    for (const e of entries) {
      for (const k of VERDICT_KEYS) assert.equal(e[k], undefined, `${e.id} has ${k}`);
      if (e.falsifiable === false) assert.equal(e.expected, "notConfirmed", e.id);
    }

    const byShape = (shape, kind) =>
      entries.filter((e) => e.shape === shape && (kind ? e.kind === kind : e.kind !== "twin"));

    for (let i = 1; i <= 16; i += 1) {
      const shape = `S${String(i).padStart(2, "0")}`;
      const rows = byShape(shape).filter((e) => e.kind === "statement");
      assert.equal(rows.length, 3, `${shape} count=${rows.length}`);
    }
    assert.equal(byShape("S17", "draft_internal_pair").length, 3);
    assert.equal(byShape("S18").filter((e) => e.kind === "statement").length, 3);
    assert.equal(entries.filter((e) => e.kind === "twin").length, 12);

    const decoys = entries.filter((e) => /^D\d{2}$/.test(e.shape) && e.kind === "statement");
    assert.equal(decoys.length, 56, `decoys=${decoys.length}`);
    for (let i = 1; i <= 14; i += 1) {
      const shape = `D${String(i).padStart(2, "0")}`;
      assert.ok(
        decoys.filter((e) => e.shape === shape).length >= 1,
        `missing decoy ${shape}`
      );
    }

    const shapes = [...new Set(entries.map((e) => e.shape))];
    for (const shape of shapes) {
      const rows = entries.filter((e) => e.shape === shape && e.kind !== "twin");
      const train = rows.filter((e) => e.split === "training");
      const held = rows.filter((e) => e.split === "heldout");
      assert.equal(train.length, 1, `${shape} training=${train.length}`);
      assert.ok(held.length >= 2, `${shape} heldout=${held.length}`);
    }

    const uglyShapes = new Set(
      entries.filter((e) => e.sourceTier === "ugly" && e.kind === "statement" && e.shape.startsWith("S")).map((e) => e.shape)
    );
    const twinShapes = new Set(entries.filter((e) => e.kind === "twin").map((e) => e.shape));
    for (const shape of uglyShapes) {
      if (shape === "S17" || shape === "S18") continue;
      assert.ok(twinShapes.has(shape), `ugly shape ${shape} missing from twin subset`);
    }

    for (const e of entries) {
      const draft = draftByFixture[e.fixtureId];
      assert.ok(draft, `missing draft for fixture ${e.fixtureId}`);
      const hits = draft.statements.filter((s) => s.text.includes(e.span));
      assert.equal(hits.length, 1, `${e.id} span hits=${hits.length} span=${JSON.stringify(e.span)}`);
    }

    assert.equal(design.seed, 20260909);
    assert.equal(design.labelBudget, 240);
    assert.equal(design.groupACap, 60);
    assert.equal(design.f15Cap, undefined);
  });
});
