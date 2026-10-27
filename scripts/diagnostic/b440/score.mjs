/**
 * Score the B440 pass against the B437 baseline. No model calls.
 *
 *   node scripts/diagnostic/b440/score.mjs
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
  padFixtureId,
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
      codes: (card?.editorialConcerns || []).map((row) => row.concernCode).filter(Boolean),
    },
    compliance: {
      raised: Array.isArray(card?.complianceConcerns) && card.complianceConcerns.length > 0,
      label: card?.complianceVerdict || null,
      codes: (card?.complianceConcerns || []).map((row) => row.concernCode).filter(Boolean),
    },
    note: {
      raised: noteBucket === "conflicts" || noteBucket === "beyond",
      label: noteBucket,
      said: card?.readingNote?.text || "",
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

async function main() {
  const doc = JSON.parse(await readFile(path.join(__dirname, "pass-1.json"), "utf8"));
  const cards = Array.isArray(doc.cards) ? doc.cards : [];
  const byKey = new Map();
  for (const card of cards) byKey.set(cardKey(card), card);
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
          card.displayVerdictReason,
          evidenceText(card),
          layer.said,
          concernText(card.editorialConcerns),
          concernText(card.complianceConcerns),
        ]);
        const words = wordsHit(fault.span, said);
        raised.push({ layer: name, label: layer.label, named: words.named });
      }
    }
    faults.push({
      id: fault.id,
      caught: raised.length > 0,
      named: raised.some((item) => item.named),
      displayVerdict: card?.displayVerdict || null,
      raised,
    });
  }

  const clean = [];
  for (const [key, row] of labelByKey) {
    if (row.label !== "confirmed") continue;
    const card = byKey.get(key);
    if (!card) {
      clean.push({ missing: true });
      continue;
    }
    const layers = layerSpoken(card);
    const spoke = Object.entries(layers).filter(([, layer]) => layer.raised).map(([name]) => name);
    clean.push({
      fixtureId: card.fixtureId,
      statement: card.statement,
      quiet: spoke.length === 0,
      spoke,
      wording: card.readingNote?.bucket === "wording" || card.wordingNoteWithheld?.count === 1,
    });
  }

  const layerNames = ["evidence", "editorial", "compliance", "note", "framing", "recency"];
  const spoken = clean.filter((row) => !row.quiet && !row.missing);
  const perLayer = {};
  for (const name of layerNames) {
    perLayer[name] = spoken.filter((row) => row.spoke.includes(name)).length;
  }

  const wordingWithheld = cards.filter(
    (card) => card.readingNote?.bucket === "wording" || card.wordingNoteWithheld?.count === 1
  ).length;

  const partials = cards.filter(
    (card) => card.supportState === "partial" || card.displayVerdict === "supported_partial"
  );
  const partialsWithExplanation = partials.filter(
    (card) => Array.isArray(card.matchExplanations) && card.matchExplanations.some((row) => String(row.explanation || "").trim())
  );
  const samples = [];
  for (const card of partialsWithExplanation) {
    for (const row of card.matchExplanations) {
      if (!String(row.explanation || "").trim()) continue;
      samples.push({
        fixtureId: card.fixtureId,
        statement: card.statement,
        classification: row.classification,
        writtenFor: row.writtenFor,
        explanation: row.explanation,
      });
      if (samples.length >= 10) break;
    }
    if (samples.length >= 10) break;
  }

  const silenceExamples = [];
  const seenSilence = new Set();
  for (const card of cards) {
    for (const silence of card.silences || []) {
      const id = silence?.id || "unnamed";
      if (seenSilence.has(id)) continue;
      seenSilence.add(id);
      silenceExamples.push({
        id,
        reason: silence.reason || null,
        count: silence.count ?? null,
        fixtureId: card.fixtureId,
        statement: card.statement,
        displayVerdict: card.displayVerdict,
      });
    }
  }

  const notReviewed = cards.filter((card) => String(card.displayVerdict || "").toLowerCase() === "not reviewed" || card.supportState === "skipped");
  const reasonCounts = {};
  for (const card of notReviewed) {
    const reason = card.evidenceNotReviewedReason || card.notReviewedRecord?.reason || "(empty)";
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
  }

  const caught = faults.filter((fault) => fault.caught).length;
  const extract = {
    cards: cards.length,
    gitSha: doc.gitSha || null,
    spend: doc.spend || null,
    catch: { raised: caught, n: faults.length, misses: faults.filter((fault) => !fault.caught).map((fault) => fault.id) },
    leaveAlone: { quiet: clean.filter((row) => row.quiet).length, n: clean.filter((row) => !row.missing).length, perLayer },
    wordingWithheld,
    partials: { n: partials.length, withExplanation: partialsWithExplanation.length, samples },
    silenceExamples,
    notReviewed: { n: notReviewed.length, reasons: reasonCounts },
    faults,
  };
  await writeFile(path.join(__dirname, "extract.json"), `${JSON.stringify(extract, null, 2)}\n`);

  const lines = [];
  lines.push("# B440");
  lines.push("");
  lines.push(`One pass. Build ${doc.gitSha || "unknown"}. Cache off. USD recorded in spend.json after the run.`);
  lines.push("");
  lines.push("## Catch");
  lines.push("");
  lines.push(`Catch is ${caught} of ${faults.length}. The B437 baseline is 10 of 11.`);
  if (caught !== 10) {
    lines.push("");
    lines.push(`STOP. Catch moved from 10 to ${caught}. Misses: ${extract.catch.misses.join(", ") || "none"}. This is not explained away.`);
  } else {
    lines.push(`Misses: ${extract.catch.misses.join(", ") || "none"}.`);
  }
  lines.push("");
  lines.push("## Leave-alone");
  lines.push("");
  lines.push(`Quiet: ${extract.leaveAlone.quiet} of ${extract.leaveAlone.n}. B437 pass 1 was 20 of 74. A wording note is not speech. It is counted below.`);
  lines.push("What still speaks on the ones that are not silent:");
  for (const name of layerNames) {
    lines.push(`- ${name}: ${perLayer[name]}`);
  }
  lines.push("");
  lines.push("## Wording notes");
  lines.push("");
  lines.push(`Formed and withheld: ${wordingWithheld}.`);
  lines.push("");
  lines.push("## Matcher explanations on partials");
  lines.push("");
  lines.push(`Partials: ${partials.length}. Partials that carry a matcher explanation: ${partialsWithExplanation.length}.`);
  lines.push("");
  lines.push("Ten samples:");
  for (const sample of samples) {
    lines.push(`- fixture ${sample.fixtureId} class ${sample.classification}${sample.writtenFor ? ` written for ${sample.writtenFor}` : ""}: ${flat(sample.explanation)}`);
    lines.push(`  statement: ${flat(sample.statement).slice(0, 180)}`);
  }
  lines.push("");
  lines.push("## Silent-nothing examples");
  lines.push("");
  if (!silenceExamples.length) lines.push("None of the recorded silence ids fired on this pass.");
  for (const row of silenceExamples) {
    lines.push(`- ${row.id}: ${row.reason || ""} fixture ${row.fixtureId}. ${flat(row.statement).slice(0, 180)}`);
  }
  lines.push("");
  lines.push("## Not-reviewed reasons");
  lines.push("");
  lines.push(`Not-reviewed cards: ${notReviewed.length}.`);
  for (const [reason, count] of Object.entries(reasonCounts)) {
    lines.push(`- ${reason}: ${count}`);
  }
  const report = lines.join("\n").replace(/\u2013|\u2014/g, "-");
  if (/[^\x00-\x7F]/.test(report) && /[\u2013\u2014]/.test(report)) {
    throw new Error("report still has a dash");
  }
  await writeFile(path.join(__dirname, "RESULT.md"), `${report}\n`);
  console.log(JSON.stringify({
    catch: extract.catch,
    leaveAlone: extract.leaveAlone,
    wordingWithheld,
    partials: { n: partials.length, withExplanation: partialsWithExplanation.length },
    silences: silenceExamples.map((row) => row.id),
    notReviewed: reasonCounts,
  }, null, 2));
  if (caught !== 10) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
