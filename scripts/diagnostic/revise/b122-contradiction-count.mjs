#!/usr/bin/env node
/**
 * B122 Part 3. Count Review statements whose editorial directives contradict.
 * Zero model calls.
 *
 * A hit is a statement with two or more editorial concerns where:
 *   (A) one concern's quoted replacement contains a phrase another concern
 *       asks to delete, or
 *   (B) two concerns quote overlapping spans of the statement with different
 *       required outcomes (delete vs keep-in-replacement).
 *
 * Usage: node scripts/diagnostic/revise/b122-contradiction-count.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyDirection,
  nl,
  normalizeQuotes,
} from "./directive-follow-scorer.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findStatementArrays(node, out = [], depth = 0) {
  if (!node || typeof node !== "object" || depth > 8) return out;
  if (Array.isArray(node)) {
    if (node.length && node[0] && node[0].qcCard) out.push(node);
    node.forEach((n) => findStatementArrays(n, out, depth + 1));
    return out;
  }
  for (const v of Object.values(node)) findStatementArrays(v, out, depth + 1);
  return out;
}

function locate(hay, needle) {
  const h = normalizeQuotes(hay);
  const n = normalizeQuotes(needle);
  if (!n) return null;
  const at = h.toLowerCase().indexOf(n.toLowerCase());
  if (at < 0) return null;
  return { start: at, end: at + n.length };
}

function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

function deleteTargets(c) {
  const out = [];
  if (c.shape === "delete" && c.src) out.push(c.src);
  if (c.shape === "replace_and_delete") {
    for (const z of c.alsoDelete || []) out.push(z);
  }
  return out;
}

function replacements(c) {
  if (c.shape === "replace" && c.dst) return [c.dst];
  if (c.shape === "replace_and_delete" && c.dst) return [c.dst];
  return [];
}

function sourceSpans(c, statementText) {
  const spans = [];
  if (c.src) {
    const loc = locate(statementText, c.src);
    if (loc) spans.push({ ...loc, outcome: c.shape === "delete" ? "delete" : "replace-src" });
  }
  for (const z of c.alsoDelete || []) {
    const loc = locate(statementText, z);
    if (loc) spans.push({ ...loc, outcome: "delete" });
  }
  return spans;
}

export async function countContradictions(dir = __dirname) {
  const files = (await readdir(dir)).filter((f) => /review.*\.json$/i.test(f) && f.endsWith(".json"));
  const multi = [];
  const hits = [];
  let statementCount = 0;

  for (const file of files) {
    let json;
    try {
      json = JSON.parse(await readFile(path.join(dir, file), "utf8"));
    } catch {
      continue;
    }
    const arrays = findStatementArrays(json);
    if (!arrays.length) continue;
    const statements = arrays.sort((a, b) => b.length - a.length)[0];
    for (const row of statements) {
      const card = row?.qcCard && typeof row.qcCard === "object" ? row.qcCard : null;
      if (!card) continue;
      statementCount += 1;
      const statementText =
        (typeof card.statement === "string" && card.statement) ||
        (typeof row.text === "string" && row.text) ||
        "";
      const concerns = (Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [])
        .filter((c) => c && typeof c.suggestedDirection === "string" && c.suggestedDirection.trim());
      if (concerns.length < 2) continue;

      const classified = concerns.map((c) => ({
        rule: c.concernCode || c.rule || "",
        direction: c.suggestedDirection.trim(),
        ...classifyDirection(c.suggestedDirection),
      }));
      multi.push({
        file,
        statementIndex: card.index,
        rules: classified.map((c) => c.rule),
        statementText,
      });

      const reasons = [];
      const dels = classified.flatMap(deleteTargets);
      const reps = classified.flatMap(replacements);
      for (const rep of reps) {
        for (const del of dels) {
          if (del && nl(rep).includes(nl(del))) {
            reasons.push(`replacement ${JSON.stringify(rep)} contains delete target ${JSON.stringify(del)}`);
          }
        }
      }

      const locs = classified.flatMap((c) =>
        sourceSpans(c, statementText).map((s) => ({ ...s, rule: c.rule, shape: c.shape }))
      );
      for (let i = 0; i < locs.length; i++) {
        for (let j = i + 1; j < locs.length; j++) {
          if (!overlaps(locs[i], locs[j])) continue;
          if (locs[i].outcome === locs[j].outcome && locs[i].rule === locs[j].rule) continue;
          if (locs[i].outcome !== locs[j].outcome) {
            reasons.push(
              `overlapping spans ${locs[i].rule}:${locs[i].outcome} [${locs[i].start},${locs[i].end}] vs ${locs[j].rule}:${locs[j].outcome} [${locs[j].start},${locs[j].end}]`
            );
          }
        }
      }

      if (reasons.length) {
        hits.push({
          file,
          statementIndex: card.index,
          rules: classified.map((c) => c.rule),
          reasons: [...new Set(reasons)],
          directions: classified.map((c) => c.direction),
        });
      }
    }
  }

  return { files, statementCount, multiCount: multi.length, multi, hitCount: hits.length, hits };
}

async function main() {
  const got = await countContradictions();
  console.log(`Review files: ${got.files.join(", ")}`);
  console.log(`statements: ${got.statementCount}`);
  console.log(`with 2+ directed editorial concerns: ${got.multiCount}`);
  console.log(`contradictions: ${got.hitCount} of ${got.multiCount}`);
  for (const h of got.hits) {
    console.log(`\n  ${h.file} S${h.statementIndex} [${h.rules.join(", ")}]`);
    for (const r of h.reasons) console.log(`    ${r}`);
  }
  for (const m of got.multi) {
    const hit = got.hits.some((h) => h.file === m.file && h.statementIndex === m.statementIndex);
    if (!hit) console.log(`\n  compatible: ${m.file} S${m.statementIndex} [${m.rules.join(", ")}]`);
  }
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
