import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import { P29_PROTECTED_NAMES, assertNotP29ProtectedWrite, p29ProtectedPaths } from "../scripts/diagnostic/accuracy/lib.mjs";
import {
  DEFAULT_ALLOW_LIST_PATH,
  DEFAULT_IN_DIR,
  DEFAULT_MAP_PATH,
  SOURCE_FILES,
  lineCount,
  numericTokens,
  prepareSources,
  scanUnmappedNames,
} from "../scripts/diagnostic/accuracy2/prepare-sources.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ACC = path.join(ROOT, "scripts/diagnostic/accuracy");
const PREPARE = path.join(ROOT, "scripts/diagnostic/accuracy2/prepare-sources.mjs");
const HAS_EXTRACTS = SOURCE_FILES.every((f) => existsSync(path.join(DEFAULT_IN_DIR, f.inputName)));

describe("P29 worksheet protection", () => {
  test("writing to scripts/diagnostic/accuracy/worksheet.md is refused", () => {
    assert.ok(P29_PROTECTED_NAMES.includes("worksheet.md"));
    const sheet = path.join(ACC, "worksheet.md");
    assert.ok(p29ProtectedPaths(ACC).includes(path.resolve(sheet)));
    assert.throws(
      () => assertNotP29ProtectedWrite(sheet, ACC),
      (err) => {
        const msg = String(err.message);
        assert.match(msg, /P29-protected/);
        assert.match(msg, /corpus 1 is closed/);
        assert.ok(msg.includes("worksheet.md"), msg);
        return true;
      }
    );
  });
});

describe("unmapped-name scan", () => {
  test("exits non-zero on a fixture containing a planted unmapped name", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "accuracy2-unmapped-"));
    try {
      await writeFile(path.join(dir, "3i-press-release-fy25-highlights.txt"), "ZephyrQuay Holdings reported results.\n");
      await writeFile(
        path.join(dir, "hpif-factsheet-march-2026.txt"),
        "Kelvedge Group plc reported NAV and EBITDA in March.\n"
      );
      const outDir = path.join(dir, "out");
      const spawned = spawnSync(
        process.execPath,
        [PREPARE, "--in-dir", dir, "--out-dir", outDir, "--map", DEFAULT_MAP_PATH, "--allow-list", DEFAULT_ALLOW_LIST_PATH],
        { encoding: "utf8" }
      );
      assert.notEqual(spawned.status, 0);
      const report = `${spawned.stderr || ""}${spawned.stdout || ""}`;
      assert.match(report, /UNMAPPED_NAMES/);
      assert.match(report, /ZephyrQuay Holdings/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("exits zero on a clean fixture", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "accuracy2-clean-"));
    try {
      const clean = "Kelvedge Group plc reported NAV and EBITDA in March 2025.\n";
      await writeFile(path.join(dir, "3i-press-release-fy25-highlights.txt"), clean);
      await writeFile(path.join(dir, "hpif-factsheet-march-2026.txt"), clean);
      const outDir = path.join(dir, "out");
      const spawned = spawnSync(
        process.execPath,
        [PREPARE, "--in-dir", dir, "--out-dir", outDir, "--map", DEFAULT_MAP_PATH, "--allow-list", DEFAULT_ALLOW_LIST_PATH],
        { encoding: "utf8" }
      );
      assert.equal(spawned.status, 0, `${spawned.stderr}\n${spawned.stdout}`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("scanUnmappedNames flags a planted name in-process", async () => {
    const nameMap = JSON.parse(await readFile(DEFAULT_MAP_PATH, "utf8"));
    const allowDoc = JSON.parse(await readFile(DEFAULT_ALLOW_LIST_PATH, "utf8"));
    const hits = scanUnmappedNames("ZephyrQuay Holdings reported results.", {
      nameMap,
      allowTerms: allowDoc.terms,
      fileLabel: "planted.txt",
    });
    assert.ok(hits.some((h) => /ZephyrQuay/.test(h.text)));
    const clean = scanUnmappedNames("Kelvedge Group plc reported NAV and EBITDA in March.", {
      nameMap,
      allowTerms: allowDoc.terms,
      fileLabel: "clean.txt",
    });
    assert.equal(clean.length, 0);
  });
});

describe.skipIf(!HAS_EXTRACTS)("renamed corpus 2 sources", () => {
  async function renamed() {
    const dir = await mkdtemp(path.join(os.tmpdir(), "accuracy2-rename-"));
    const result = await prepareSources({ outDir: dir, write: true });
    return { dir, result };
  }

  test("no string from name-map.json from-side survives in either output", async () => {
    const { dir, result } = await renamed();
    try {
      const nameMap = result.nameMap;
      for (const file of result.files) {
        for (const row of nameMap.replacements) {
          const from = row.from;
          const re = new RegExp(`(?<![A-Za-z0-9])${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9])`);
          assert.equal(re.test(file.output), false, `${file.outputName} still contains ${JSON.stringify(from)}`);
        }
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("line count of each output equals its input except the asserted ten23 delta", async () => {
    const { dir, result } = await renamed();
    try {
      const press = result.files.find((f) => f.outputName === "press-release-fy25-highlights.txt");
      const sheet = result.files.find((f) => f.outputName === "fund-factsheet-march-2026.txt");
      assert.equal(lineCount(sheet.output), lineCount(sheet.input));
      const ten23Delta = lineCount(press.output) - lineCount(press.input);
      assert.equal(ten23Delta, 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("known extraction defects survive the rename", async () => {
    const { dir, result } = await renamed();
    try {
      const sheet = result.files.find((f) => f.outputName === "fund-factsheet-march-2026.txt").output;
      const returnsLine = "2025 N/A N/A N/A 1.03% 2.83% 1.95% -0.31% 0.75% -0.17% -0.98% 0.92% -0.17% 5.95%";
      const returnsHits = sheet.split(returnsLine).length - 1;
      assert.ok(returnsHits >= 2, `duplicated returns line count=${returnsHits}`);
      const inputFundHits = result.files
        .find((f) => f.outputName === "fund-factsheet-march-2026.txt")
        .input.split("HarbourVest Private Investments Fund").length - 1;
      const fundHits = sheet.split("Cravenford Private Investments Fund").length - 1;
      assert.equal(fundHits, inputFundHits);
      assert.ok(fundHits >= 3, `fund name count=${fundHits}`);
      assert.match(sheet, /YTD 2/);
      const objective =
        "I n ve s t m e n t o b je c t ive : Se e k t o g e n e ra t e c a p it a l g ro w t h o ve r t h e lo n g -t e rm .";
      assert.ok(sheet.includes(objective));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("every numeric token in each input appears in its output, same count", async () => {
    const { dir, result } = await renamed();
    try {
      const press = result.files.find((f) => f.outputName === "press-release-fy25-highlights.txt");
      const sheet = result.files.find((f) => f.outputName === "fund-factsheet-march-2026.txt");
      const inSheet = numericTokens(sheet.input);
      const outSheet = numericTokens(sheet.output);
      assert.deepEqual([...outSheet.entries()].sort(), [...inSheet.entries()].sort());

      const inPress = numericTokens(press.input);
      const outPress = numericTokens(press.output);
      const expected54 = (inPress.get("54") || 0) - 1;
      assert.equal(outPress.get("54") || 0, expected54);
      for (const [token, count] of inPress) {
        if (token === "54") continue;
        assert.equal(outPress.get(token) || 0, count, `press-release numeric ${token}`);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
