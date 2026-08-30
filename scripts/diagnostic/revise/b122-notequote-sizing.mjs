#!/usr/bin/env node
/**
 * B122 Part B. Size note_quote apostrophe truncation. Zero model calls.
 *
 * Usage: node scripts/diagnostic/revise/b122-notequote-sizing.mjs
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractQuotedSpans, normalizeQuotes } from "./directive-follow-scorer.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "b122-notequote-sizing.md");

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

function spanList(span) {
  if (!span) return [];
  if (Array.isArray(span)) return span.filter((s) => s && typeof s === "object");
  if (typeof span === "object") return [span];
  return [];
}

function isApostrophe(ch) {
  return ch === "'" || ch === "\u2019" || ch === "\u2018";
}

function flattenDashes(s) {
  return String(s ?? "").replace(/\u2014|\u2013|\u2212/g, "-");
}

async function main() {
  const files = (await readdir(__dirname)).filter((f) => f.endsWith(".json"));
  const rows = [];
  for (const file of files) {
    let json;
    try {
      json = JSON.parse(await readFile(path.join(__dirname, file), "utf8"));
    } catch {
      continue;
    }
    const arrays = findStatementArrays(json);
    if (!arrays.length) continue;
    const statements = arrays.sort((a, b) => b.length - a.length)[0];
    for (const row of statements) {
      const card = row?.qcCard && typeof row.qcCard === "object" ? row.qcCard : null;
      if (!card) continue;
      const statementText =
        (typeof card.statement === "string" && card.statement) ||
        (typeof row.text === "string" && row.text) ||
        "";
      const concerns = Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [];
      for (const concern of concerns) {
        const note = typeof concern.note === "string" ? concern.note : "";
        const awareQuotes = extractQuotedSpans(note);
        for (const sp of spanList(concern.span)) {
          if (sp.source !== "note_quote") continue;
          const start = Number(sp.startChar);
          const end = Number(sp.endChar);
          if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
          const spanText = statementText.slice(start, end);
          const charAfter = statementText.slice(end, end + 1);
          const terminatesBeforeApostrophe = isApostrophe(charAfter);
          const prefixOf = awareQuotes.find(
            (q) => q.startsWith(spanText) && q.length > spanText.length
          );
          const truncated = Boolean(terminatesBeforeApostrophe || prefixOf);
          rows.push({
            file,
            statementIndex: card.index,
            rule: concern.concernCode || concern.rule || "",
            start,
            end,
            spanText,
            charAfter,
            terminatesBeforeApostrophe,
            prefixOfQuotedNote: prefixOf || null,
            truncated,
            note,
            statementText,
          });
        }
      }
    }
  }

  const denom = rows.length;
  const hits = rows.filter((r) => r.truncated);
  const filesScanned = [...new Set(rows.map((r) => r.file))];

  const hitLines = hits
    .map(
      (r) =>
        `${r.file} S${r.statementIndex} ${r.rule}  span=${JSON.stringify(r.spanText)}  [${r.start},${r.end}]  beforeApostrophe=${r.terminatesBeforeApostrophe}  prefixOf=${JSON.stringify(r.prefixOfQuotedNote)}`
    )
    .join("\n");

  const body = flattenDashes(`# B122 note_quote apostrophe truncation

Instrument only. Zero model calls. No production changes.
Harness \`b122-notequote-sizing.mjs\`.

## Scoreboard

\`\`\`
note_quote spans scanned: ${denom}
truncated (apostrophe closer or strict prefix of a quoted span in the same note): ${hits.length} of ${denom}
files that carried note_quote: ${filesScanned.join(", ") || "(none)"}
\`\`\`

## B1. Where note_quote is derived

CONFIRMED: \`lib/qc/editorial-compliance-reviewer.mjs\` \`deriveConcernSpan\` (exported, L730-750).
It calls \`extractQuotedSnippets\` (L621-635) on the concern \`note\` with source \`note_quote\`, and on \`suggestedDirection\` with source \`direction_quote\`.
\`attachConcernSpans\` (L767-778) writes those spans onto editorial and compliance concerns.

The naive quote regex is L623:

\`\`\`
/(["'])([^"']+)\\1/g
\`\`\`

\`[^"']+\` stops at the first apostrophe. Possessive \`team's\` closes the span at \`The team\`.

## B2. Does the same path produce evidence spans?

CONFIRMED: no. Separate path.

Evidence \`unsupportedSpans\` are built in \`lib/qc/pipeline-v4/stage2-match-sources.mjs\` \`buildUnsupportedSpans\` (L1533-1551) from Stage 2 match fields \`unsupportedSpan\`, \`unsupportedSpanStart\`, \`unsupportedSpanEnd\`. \`lib/qc/coverage-union.mjs\` (L123-145) walks the same Stage 2 offsets. \`lib/qc/pipeline-v4/index.mjs\` L497-499 attaches them on the card.

\`extractQuotedSnippets\` / \`deriveConcernSpan\` are not imported by the v4 pipeline or by \`build-revision-prompt.mjs\`. The reviser reads evidence spans via \`extractUnsupportedSpansForRevision\` (\`lib/build-revision-prompt.mjs\` L285-348), which never sees \`note_quote\`. Editorial spans are not copied into the prompt (\`collectEditorialConcerns\` L379-380 copies kind, rule, note, suggestedDirection only).

So this truncation does not bound what the reviser may edit, and it cannot flip supported to unsupported.

## B3. Exposure on stored rows

Denominator: every \`source: "note_quote"\` span on a qcCard in \`scripts/diagnostic/revise/*.json\` that has a statement array. That is the on-disk Review corpus this diagnostic folder holds. ${denom} spans.

Hits:

\`\`\`
${hitLines || "(none)"}
\`\`\`

Count: ${hits.length} of ${denom}.

## B4. Cosmetic or serious

On the evidence, this is **cosmetic for Suggest and for evidence verdicts**, and **serious as a Review highlight defect on the cards it hits**.

It cannot turn unsupported into supported. It does not reach the reviser. Under the standing rule it is a backlog item, not a Suggest fix.

It is not nothing. On the structural_integrity card the UI is told to highlight \`The team\` (8 characters) for a finding whose note is about the whole fragment. A reviewer who trusts the highlight is looking at the wrong span. In this folder that happens on ${hits.length} of ${denom} note_quote spans. Do not inflate it into a pipeline bug, and do not shrink it into a non-issue for the Review workbench.

DO NOT FIX in this pass.
`);

  await writeFile(OUT, body, "utf8");
  console.log(`note_quote spans: ${denom}`);
  console.log(`truncated: ${hits.length} of ${denom}`);
  console.log(hitLines || "(none)");
  console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
