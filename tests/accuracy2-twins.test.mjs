import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import { fromMatchRegex, numericTokens } from "../scripts/diagnostic/accuracy2/prepare-sources.mjs";
import {
  DEFAULT_SOURCES_DIR,
  TWIN_SPECS,
  collapseLetterSpacing,
  isImageMarker,
  isLetterSpacedLine,
  isStandalonePageNumber,
  makeTwin,
  monthlyGridRows,
} from "../scripts/diagnostic/accuracy2/make-twin.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAKE_TWIN = path.join(ROOT, "scripts/diagnostic/accuracy2/make-twin.mjs");
const MAP_PATH = path.join(ROOT, "scripts/diagnostic/accuracy2/sources/name-map.json");

function alphabeticWords(text) {
  return String(text ?? "").match(/[A-Za-z]+/g) || [];
}

function wordCounts(words) {
  const m = new Map();
  for (const w of words) m.set(w, (m.get(w) || 0) + 1);
  return m;
}

function lexiconFrom(text) {
  const set = new Set(["to", "the", "a", "of", "and", "or", "over", "seek", "investment", "objective", "generate", "capital", "growth", "long", "term", "long-term"]);
  for (const line of String(text).split("\n")) {
    if (isLetterSpacedLine(line)) continue;
    for (const tok of line.match(/[A-Za-z][A-Za-z'-]*/g) || []) {
      if (tok.length >= 2) set.add(tok.toLowerCase());
    }
  }
  return [...set].sort((a, b) => b.length - a.length);
}

function ignoreFurniture(raw, { documentTitle }) {
  const lines = String(raw ?? "").split("\n");
  let seenTitle = false;
  const kept = [];
  for (const line of lines) {
    const t = line.trim();
    if (isImageMarker(line) || isStandalonePageNumber(line)) continue;
    if (documentTitle && t === documentTitle) {
      if (seenTitle) continue;
      seenTitle = true;
    } else if (seenTitle && t === "For the period ended March 31, 2026") {
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n");
}

function comparableText(raw, spec) {
  const filtered = ignoreFurniture(raw, spec);
  const lexicon = lexiconFrom(filtered);
  return filtered
    .split("\n")
    .map((line) => collapseLetterSpacing(line, lexicon))
    .join("\n");
}

describe("accuracy2 clean twins", () => {
  test("make-twin.mjs writes both twins and exits zero", () => {
    const spawned = spawnSync(process.execPath, [MAKE_TWIN], { encoding: "utf8" });
    assert.equal(spawned.status, 0, `${spawned.stderr}\n${spawned.stdout}`);
  });

  test("part 1 assertions hold for both twins", async () => {
    const nameMap = JSON.parse(await readFile(MAP_PATH, "utf8"));
    for (const spec of TWIN_SPECS) {
      const ugly = await readFile(path.join(DEFAULT_SOURCES_DIR, spec.inputName), "utf8");
      const twin = await readFile(path.join(DEFAULT_SOURCES_DIR, spec.outputName), "utf8");
      const filteredUgly = ignoreFurniture(ugly, spec);
      const uglyNums = numericTokens(filteredUgly);
      const twinNums = numericTokens(twin);
      for (const [token, count] of uglyNums) {
        assert.equal(twinNums.get(token) || 0, count, `${spec.outputName} numeric ${token}`);
      }
      const uglyWords = wordCounts(alphabeticWords(comparableText(ugly, spec)).filter((w) => w.length >= 2));
      const twinWords = wordCounts(alphabeticWords(comparableText(twin, spec)).filter((w) => w.length >= 2));
      for (const [word, count] of uglyWords) {
        assert.equal(
          twinWords.get(word) || 0,
          count,
          `${spec.outputName} word ${JSON.stringify(word)} ugly=${count} twin=${twinWords.get(word) || 0}`
        );
      }
      assert.ok(twin.split("\n").length < ugly.split("\n").length, `${spec.outputName} line count`);
      assert.doesNotMatch(twin, /\[Image:/);
      for (const line of twin.split("\n")) {
        assert.equal(isStandalonePageNumber(line), false, `digit-only line ${JSON.stringify(line)}`);
        assert.doesNotMatch(line, /^[,)\]]/);
      }
      for (const row of nameMap.replacements) {
        assert.equal(fromMatchRegex(row.from).test(twin), false, `${spec.outputName} still has ${row.from}`);
      }
    }
  });

  test("monthly grid data rows each carry a share class letter", async () => {
    const twin = await readFile(path.join(DEFAULT_SOURCES_DIR, "fund-factsheet-march-2026.clean.txt"), "utf8");
    const rows = monthlyGridRows(twin);
    const data = rows.filter((r) => /20(25|26)\b/.test(r));
    assert.ok(data.length >= 6, `grid rows=${JSON.stringify(rows)}`);
    for (const row of data) {
      assert.match(row, /^[ADI] 20(25|26)\b/, row);
    }
  });

  test("Class A one-year and since-inception values are both still 3.35%", async () => {
    const twin = await readFile(path.join(DEFAULT_SOURCES_DIR, "fund-factsheet-march-2026.clean.txt"), "utf8");
    const classA = twin.split("\n").find((l) => /^A Apr 2025\b/.test(l.trim()));
    assert.ok(classA, "missing Class A net performance row");
    assert.match(classA, /3\.35%.*3\.35%/);
  });

  test("makeTwin does not invent numbers", () => {
    const { text } = makeTwin("Total return of £5,049 million.\n", { documentTitle: "X", inputName: "t" });
    assert.match(text, /£5,049 million/);
  });
});
