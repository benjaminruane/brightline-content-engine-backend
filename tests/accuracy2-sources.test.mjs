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
  DEFAULT_OUT_DIR,
  SOURCE_FILES,
  fromMatchRegex,
  lineCount,
  numericTokens,
  prepareSources,
  prepareText,
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

describe("matcher wrap, case and scan false positives", () => {
  test("a name split across a newline is replaced and line count is unchanged", async () => {
    const nameMap = JSON.parse(await readFile(DEFAULT_MAP_PATH, "utf8"));
    const input = "hold assets Royal\nSanders, and by the performance\n";
    const output = prepareText(input, nameMap);
    assert.match(output, /Skaldwick/);
    assert.equal(lineCount(output), lineCount(input));
    assert.equal(fromMatchRegex("Royal Sanders").test(output), false);
  });

  test("a lowercase occurrence inside a URL is replaced in lower case", async () => {
    const nameMap = JSON.parse(await readFile(DEFAULT_MAP_PATH, "utf8"));
    const output = prepareText("visit harbourvest.com/hpif for the fund\n", nameMap);
    assert.match(output, /cravenford\.com\/cpif/);
    assert.doesNotMatch(output, /harbourvest/i);
    assert.doesNotMatch(output, /hpif/i);
  });

  test("an all-caps occurrence is replaced in all caps", async () => {
    const nameMap = JSON.parse(await readFile(DEFAULT_MAP_PATH, "utf8"));
    const output = prepareText("See HPIF and HVP notes.\n", nameMap);
    assert.match(output, /CPIF/);
    assert.match(output, /CVP/);
    assert.doesNotMatch(output, /HPIF/);
    assert.doesNotMatch(output, /HVP/);
  });

  test("the scan does not flag a truncated line beginning with a mapped replacement", async () => {
    const nameMap = JSON.parse(await readFile(DEFAULT_MAP_PATH, "utf8"));
    const allowDoc = JSON.parse(await readFile(DEFAULT_ALLOW_LIST_PATH, "utf8"));
    const hits = scanUnmappedNames("Cravenford Registered Advisers L.P. continues.", {
      nameMap,
      allowTerms: allowDoc.terms,
      fileLabel: "trunc.txt",
    });
    assert.equal(
      hits.filter((h) => /Cravenford Registered Advisers/.test(h.text)).length,
      0,
      JSON.stringify(hits)
    );
  });

  test("the scan still flags a genuinely unmapped capitalised name", async () => {
    const nameMap = JSON.parse(await readFile(DEFAULT_MAP_PATH, "utf8"));
    const allowDoc = JSON.parse(await readFile(DEFAULT_ALLOW_LIST_PATH, "utf8"));
    const hits = scanUnmappedNames("ZephyrQuay Holdings reported results.", {
      nameMap,
      allowTerms: allowDoc.terms,
      fileLabel: "planted.txt",
    });
    assert.ok(hits.some((h) => /ZephyrQuay/.test(h.text)));
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
          const re = fromMatchRegex(row.from);
          assert.equal(re.test(file.output), false, `${file.outputName} still contains ${JSON.stringify(row.from)}`);
        }
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("line count of each output equals its input except the asserted press-contact delta", async () => {
    const { dir, result } = await renamed();
    try {
      const press = result.files.find((f) => f.outputName === "press-release-fy25-highlights.txt");
      const sheet = result.files.find((f) => f.outputName === "fund-factsheet-march-2026.txt");
      assert.equal(lineCount(sheet.output), lineCount(sheet.input));
      const contactDelta = lineCount(press.output) - lineCount(press.input);
      assert.equal(contactDelta, -5);
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
      const removed = numericTokens(result.nameMap.deletions.map((d) => d.before).join("\n"));
      for (const [token, count] of inPress) {
        const expected = count - (removed.get(token) || 0);
        assert.equal(outPress.get(token) || 0, expected, `press-release numeric ${token}`);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("the press-contact deletion removes the expected block and nothing above it", async () => {
    const { dir, result } = await renamed();
    try {
      const press = result.files.find((f) => f.outputName === "press-release-fy25-highlights.txt");
      assert.doesNotMatch(press.output, /Silvia Santoro/);
      assert.doesNotMatch(press.output, /Kathryn van der Kroft/);
      assert.doesNotMatch(press.output, /please contact:/);
      assert.doesNotMatch(press.output, /020 7975 3258/);
      assert.doesNotMatch(press.output, /020 7975 3021/);
      assert.match(press.output, /A year of consistently strong growth/);
      assert.match(press.output, /Martin Ashcombe/);
      assert.match(press.output, /Financial highlights/);
      assert.match(press.output, /For further information regarding the announcement/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

const COMMITTED_PRESS = path.join(DEFAULT_OUT_DIR, "press-release-fy25-highlights.txt");
const COMMITTED_SHEET = path.join(DEFAULT_OUT_DIR, "fund-factsheet-march-2026.txt");
const HAS_COMMITTED = existsSync(COMMITTED_PRESS) && existsSync(COMMITTED_SHEET);

describe.skipIf(!HAS_COMMITTED)("committed corpus 2 sources", () => {
  test("defect-survival assertions still pass on the final committed files", async () => {
    const sheet = await readFile(COMMITTED_SHEET, "utf8");
    const returnsLine = "2025 N/A N/A N/A 1.03% 2.83% 1.95% -0.31% 0.75% -0.17% -0.98% 0.92% -0.17% 5.95%";
    assert.ok(sheet.split(returnsLine).length - 1 >= 2);
    const fundHits = sheet.split("Cravenford Private Investments Fund").length - 1;
    assert.ok(fundHits >= 3, `fund name count=${fundHits}`);
    assert.match(sheet, /YTD 2/);
    assert.ok(
      sheet.includes(
        "I n ve s t m e n t o b je c t ive : Se e k t o g e n e ra t e c a p it a l g ro w t h o ve r t h e lo n g -t e rm ."
      )
    );
  });

  test("no from value from map v1 or v2 survives in either committed file", async () => {
    const nameMap = JSON.parse(await readFile(DEFAULT_MAP_PATH, "utf8"));
    const press = await readFile(COMMITTED_PRESS, "utf8");
    const sheet = await readFile(COMMITTED_SHEET, "utf8");
    for (const body of [press, sheet]) {
      for (const row of nameMap.replacements) {
        const re = fromMatchRegex(row.from);
        assert.equal(re.test(body), false, `committed file still contains ${JSON.stringify(row.from)}`);
      }
    }
  });
});
