/**
 * Score the B441 pass against the B440 baseline. No model calls.
 *
 *   node scripts/diagnostic/b441/score.mjs
 *
 * Writes extract.json and RESULT.md.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  joinKey,
  mapDisplayVerdict,
  mapGroupA,
  flattenStatements,
} from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ACCURACY = path.join(__dirname, "../accuracy");

const NAME_STOP = new Set([
  "during", "group", "arr", "eur", "moic", "irr", "ebitda", "the", "and", "from", "with",
  "has", "will", "people", "million", "agreed", "acquire", "support", "continued", "growth",
]);

function norm(value) {
  return String(value ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function needles(span) {
  const full = norm(span);
  const tokens = [];
  for (const raw of String(span).split(/\s+/)) {
    const bare = raw.replace(/'s$/i, "").replace(/[^A-Za-z0-9.%]/g, "");
    if (!bare) continue;
    if (/\d/.test(bare)) tokens.push(bare.toLowerCase());
    else if (/^[A-Z]/.test(bare) && bare.length >= 3 && !NAME_STOP.has(bare.toLowerCase())) {
      tokens.push(bare.toLowerCase());
    }
  }
  return { full, tokens: [...new Set(tokens)] };
}

function wordsHit(span, text) {
  const { full, tokens } = needles(span);
  const hay = norm(text);
  const fullHit = full.length > 0 && hay.includes(full);
  const tokenHits = tokens.filter((token) => hay.includes(token));
  return { fullHit, tokenHits, named: fullHit || tokenHits.length > 0 };
}

function joined(parts) {
  return parts.filter((part) => typeof part === "string" && part.trim()).join("\n");
}

function concernText(concerns) {
  return joined((Array.isArray(concerns) ? concerns : []).flatMap((row) => [row?.concernCode, row?.quote, row?.text]));
}

function evidenceText(card) {
  return joined([
    card?.evidenceSummary,
    card?.primaryExcerpt,
    card?.conflictExcerpt,
    card?.displayedEvidenceProse,
    card?.secondValueLine,
    ...(Array.isArray(card?.unsupportedSpans) ? card.unsupportedSpans : []),
    ...(Array.isArray(card?.evidenceFindings) ? card.evidenceFindings.flatMap((row) => [row?.quote, row?.note]) : []),
  ]);
}

function layerSpoken(card) {
  const evidenceMapped = mapDisplayVerdict(card?.displayVerdict);
  const notReviewed = String(card?.displayVerdict || "").toLowerCase() === "not reviewed";
  const noteBucket = card?.readingNote?.bucket || null;
  return {
    evidence: {
      raised: (evidenceMapped != null && evidenceMapped !== "confirmed") || notReviewed,
      label: evidenceMapped || card?.displayVerdict || null,
    },
    editorial: {
      raised: Array.isArray(card?.editorialConcerns) && card.editorialConcerns.length > 0,
      label: card?.editorialVerdict || null,
    },
    compliance: {
      raised: Array.isArray(card?.complianceConcerns) && card.complianceConcerns.length > 0,
      label: card?.complianceVerdict || null,
    },
    note: {
      raised: noteBucket === "conflicts" || noteBucket === "beyond",
      label: noteBucket,
    },
    framing: {
      raised: Array.isArray(card?.framingFidelityConcerns) && card.framingFidelityConcerns.length > 0,
      label: "framing",
    },
    recency: {
      raised: Array.isArray(card?.sourceRecencyConcerns) && card.sourceRecencyConcerns.length > 0,
      label: "recency",
    },
  };
}

function cardKey(card) {
  return joinKey(card.fixtureId, card.statement, card.occurrence);
}

function flat(text) {
  return String(text || "").replace(/\u2013|\u2014/g, "-");
}

function quietOf(card) {
  if (!card) return false;
  const layers = layerSpoken(card);
  return Object.values(layers).every((layer) => !layer.raised);
}

function spokeNames(card) {
  const layers = layerSpoken(card);
  return Object.entries(layers).filter(([, layer]) => layer.raised).map(([name]) => name);
}

async function main() {
  const doc = JSON.parse(await readFile(path.join(__dirname, "pass-1.json"), "utf8"));
  const prior = JSON.parse(await readFile(path.join(__dirname, "../b440/pass-1.json"), "utf8"));
  const cards = Array.isArray(doc.cards) ? doc.cards : [];
  const before = Array.isArray(prior.cards) ? prior.cards : [];
  const byKey = new Map();
  const priorByKey = new Map();
  for (const card of cards) byKey.set(cardKey(card), card);
  for (const card of before) priorByKey.set(cardKey(card), card);

  const labelsDoc = JSON.parse(await readFile(path.join(ACCURACY, "labels.json"), "utf8"));
  const design = JSON.parse(await readFile(path.join(ACCURACY, "group-a-design.json"), "utf8"));
  const statements = JSON.parse(await readFile(path.join(ACCURACY, "statements.json"), "utf8"));
  const labels = normalizeLabelsDoc({ labels: labelsDoc.labels });
  const mapped = mapGroupA(flattenStatements(statements), design);
  const labelByKey = new Map();
  for (const row of labels) {
    if (row.kind && row.kind !== "statement") continue;
    labelByKey.set(joinKey(row.fixtureId, row.statementText, row.occurrence), row);
  }

  const faults = [];
  for (const fault of design.faults) {
    const row = mapped.mapping.find((item) => item.id === fault.id);
    const key = row?.keys?.[0] || null;
    const card = key ? byKey.get(key) : null;
    const layers = card ? layerSpoken(card) : null;
    const raised = [];
    if (layers) {
      for (const [name, layer] of Object.entries(layers)) {
        if (!layer.raised) continue;
        const said = joined([
          card.displayVerdict,
          card.secondValueLine,
          evidenceText(card),
          concernText(card.editorialConcerns),
          concernText(card.complianceConcerns),
        ]);
        raised.push({ layer: name, label: layer.label, named: wordsHit(fault.span, said).named });
      }
    }
    faults.push({
      id: fault.id,
      caught: raised.length > 0,
      displayVerdict: card?.displayVerdict || null,
      priorVerdict: key ? priorByKey.get(key)?.displayVerdict || null : null,
      secondValueLine: card?.secondValueLine || "",
      raised,
    });
  }

  const clean = [];
  const newlySpeaking = [];
  for (const [key, row] of labelByKey) {
    if (row.label !== "confirmed") continue;
    const card = byKey.get(key);
    const was = priorByKey.get(key);
    if (!card) {
      clean.push({ missing: true });
      continue;
    }
    const quiet = quietOf(card);
    const wasQuiet = quietOf(was);
    clean.push({ fixtureId: card.fixtureId, statement: card.statement, quiet, spoke: spokeNames(card) });
    if (wasQuiet && !quiet) {
      newlySpeaking.push({
        fixtureId: card.fixtureId,
        index: card.index,
        statement: card.statement,
        spoke: spokeNames(card),
        before: was?.displayVerdict || null,
        after: card.displayVerdict,
        secondValueLine: card.secondValueLine || "",
        sentenceLabel: card.sentenceLabel,
      });
    }
  }

  const classChanges = [];
  for (const card of cards) {
    const was = priorByKey.get(cardKey(card));
    if (!was) continue;
    if (was.displayVerdict === card.displayVerdict && was.supportState === card.supportState) continue;
    classChanges.push({
      fixtureId: card.fixtureId,
      index: card.index,
      statement: card.statement,
      before: was.displayVerdict,
      after: card.displayVerdict,
      supportBefore: was.supportState,
      supportAfter: card.supportState,
      secondValueLine: card.secondValueLine || "",
    });
  }

  const caught = faults.filter((fault) => fault.caught).length;
  const extract = {
    cards: cards.length,
    gitSha: doc.gitSha || null,
    spend: doc.spend || null,
    catch: { raised: caught, n: faults.length, misses: faults.filter((fault) => !fault.caught).map((fault) => fault.id), faults },
    leaveAlone: { quiet: clean.filter((row) => row.quiet).length, n: clean.filter((row) => !row.missing).length },
    newlySpeaking,
    classChanges,
  };
  await writeFile(path.join(__dirname, "extract.json"), `${JSON.stringify(extract, null, 2)}\n`);

  const lines = [];
  lines.push("# B441");
  lines.push("");
  lines.push(`One pass. Build recorded on the pass file. Cache off. Compared with B440 pass 1.`);
  lines.push("");
  lines.push("## Catch");
  lines.push("");
  lines.push(`Catch is ${caught} of ${faults.length}. B440 was 10 of 11.`);
  const miss = faults.find((fault) => fault.id === "F13-ebitda");
  if (miss) {
    lines.push(`F13-ebitda display verdict ${miss.priorVerdict} -> ${miss.displayVerdict}. Caught: ${miss.caught}.`);
    if (miss.secondValueLine) lines.push(flat(miss.secondValueLine));
  }
  if (caught !== 11) {
    lines.push(`Misses: ${extract.catch.misses.join(", ") || "none"}.`);
  }
  lines.push("");
  lines.push("## Leave-alone");
  lines.push("");
  lines.push(`Quiet: ${extract.leaveAlone.quiet} of ${extract.leaveAlone.n}. B440 was 40 of 74.`);
  lines.push("");
  lines.push("Clean statements that were quiet on B440 and speak on this pass:");
  if (!newlySpeaking.length) lines.push("None.");
  for (const row of newlySpeaking) {
    lines.push(`- fixture ${row.fixtureId} index ${row.index}. ${row.before} -> ${row.after}. Speaks: ${row.spoke.join(", ") || "none"}.`);
    lines.push(`  ${flat(row.statement)}`);
    lines.push(`  ${row.secondValueLine ? flat(row.secondValueLine) : "No second-value line. This is not the new rule."}`);
  }
  lines.push("");
  lines.push("## Classification changes");
  lines.push("");
  lines.push(`${classChanges.length} statements changed display verdict or support state.`);
  for (const row of classChanges) {
    lines.push(`- fixture ${row.fixtureId} index ${row.index}: ${row.before} -> ${row.after} (support ${row.supportBefore} -> ${row.supportAfter}).`);
    lines.push(`  ${flat(row.statement)}`);
    if (row.secondValueLine) lines.push(`  ${flat(row.secondValueLine)}`);
  }
  const report = lines.join("\n").replace(/\u2013|\u2014/g, "-");
  await writeFile(path.join(__dirname, "RESULT.md"), `${report}\n`);
  console.log(JSON.stringify({
    catch: { raised: caught, misses: extract.catch.misses },
    leaveAlone: extract.leaveAlone,
    newlySpeaking: newlySpeaking.length,
    classChanges: classChanges.length,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
