/**
 * B485. Deal status is judged in the prompt. No status-word list is used to match.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

const WORDS = ["recommended", "committed", "invested", "approved"];
const WORD = WORDS.join("|");
const LIST = new RegExp(`\\[(?:[^\\]\\n]{0,120}["'\`](?:${WORD})["'\`][^\\]\\n]{0,80}){2,}\\]`, "i");
const CALL = new RegExp(`(?:includes|has|test|match)\\(\\s*["'\`](?:${WORD})["'\`]`, "i");
const ALT = new RegExp(`["'\`/]\\(?\\?:?(?:${WORD})\\|(?:${WORD})`, "i");

function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (/\.(mjs|js)$/.test(name)) out.push(full);
  }
  return out;
}

export function statusMatchHits(root) {
  const hits = [];
  for (const file of filesUnder(root)) {
    const text = readFileSync(file, "utf8");
    if (LIST.test(text) || CALL.test(text) || ALT.test(text)) {
      hits.push(path.relative(root, file));
    }
  }
  return hits;
}

describe("B485 no status vocabulary", () => {
  test("lib has no status-word list and no status-word match", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../lib");
    const hits = statusMatchHits(root);
    assert.deepEqual(hits, []);
  });
});
