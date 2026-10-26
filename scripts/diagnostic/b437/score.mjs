/**
 * Score the two B437 passes. No model calls.
 *
 *   node scripts/diagnostic/b437/score.mjs
 *
 * Writes extract.json. The report is written by hand from that extract.
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
import { scoreAccuracy } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ACCURACY = path.join(__dirname, "../accuracy");

const NAME_STOP = new Set([
  "during", "group", "arr", "eur", "moic", "irr", "ebitda", "the", "and", "from", "with",
  "has", "will", "people", "million", "agreed", "acquire", "support", "continued", "growth",
]);

function norm(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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
      said: joined([card?.displayVerdict, card?.displayVerdictReason, evidenceText(card)]),
    },
    editorial: {
      raised: Array.isArray(card?.editorialConcerns) && card.editorialConcerns.length > 0,
      label: card?.editorialVerdict || null,
      said: concernText(card?.editorialConcerns),
      codes: (card?.editorialConcerns || []).map((row) => row.concernCode).filter(Boolean),
    },
    compliance: {
      raised: Array.isArray(card?.complianceConcerns) && card.complianceConcerns.length > 0,
      label: card?.complianceVerdict || null,
      said: concernText(card?.complianceConcerns),
      codes: (card?.complianceConcerns || []).map((row) => row.concernCode).filter(Boolean),
    },
    note: {
      raised: noteBucket === "conflicts" || noteBucket === "beyond" || noteBucket === "wording",
      label: noteBucket,
      said: card?.readingNote?.text || "",
    },
    framing: {
      raised: Array.isArray(card?.framingFidelityConcerns) && card.framingFidelityConcerns.length > 0,
      label: "framing",
      said: concernText(card?.framingFidelityConcerns),
    },
    recency: {
      raised: Array.isArray(card?.sourceRecencyConcerns) && card.sourceRecencyConcerns.length > 0,
      label: "recency",
      said: concernText(card?.sourceRecencyConcerns),
    },
  };
}

function concernSignature(card) {
  const codes = [];
  for (const row of card?.editorialConcerns || []) {
    if (row?.concernCode) codes.push(`editorial:${row.concernCode}`);
  }
  for (const row of card?.complianceConcerns || []) {
    if (row?.concernCode) codes.push(`compliance:${row.concernCode}`);
  }
  for (const row of card?.framingFidelityConcerns || []) {
    if (row?.concernCode) codes.push(`framing:${row.concernCode}`);
  }
  for (const row of card?.sourceRecencyConcerns || []) {
    if (row?.concernCode) codes.push(`recency:${row.concernCode}`);
  }
  if (card?.readingNote?.bucket) codes.push(`note:${card.readingNote.bucket}`);
  return codes.sort().join("|");
}

function cardKey(card) {
  return joinKey(card.fixtureId, card.statement, card.occurrence);
}

async function readPass(name) {
  const doc = JSON.parse(await readFile(path.join(__dirname, name), "utf8"));
  const cards = Array.isArray(doc.cards) ? doc.cards : [];
  const byKey = new Map();
  for (const card of cards) byKey.set(cardKey(card), card);
  return { doc, cards, byKey };
}

function historical(labels, cards, manifest) {
  const groupAKeys = new Set((manifest.groupA || []).map((row) => joinKey(row.fixtureId, row.statementText, row.occurrence)));
  const groupBKeys = new Set((manifest.groupB || []).map((row) => joinKey(row.fixtureId, row.statementText, row.occurrence)));
  return scoreAccuracy({ labels, cards, groupAKeys, groupBKeys });
}

async function main() {
  const pass1 = await readPass("pass-1.json");
  const pass2 = await readPass("pass-2.json");
  const labelsDoc = JSON.parse(await readFile(path.join(ACCURACY, "labels.json"), "utf8"));
  const manifest = JSON.parse(await readFile(path.join(ACCURACY, "sample-manifest.json"), "utf8"));
  const design = JSON.parse(await readFile(path.join(ACCURACY, "group-a-design.json"), "utf8"));
  const statements = JSON.parse(await readFile(path.join(ACCURACY, "statements.json"), "utf8"));
  const labels = normalizeLabelsDoc({ labels: labelsDoc.labels });
  const flat = flattenStatements(statements);
  const mapped = mapGroupA(flat, design);
  const labelByKey = new Map();
  for (const row of labels) {
    if (row.kind && row.kind !== "statement") continue;
    labelByKey.set(joinKey(row.fixtureId, row.statementText, row.occurrence), row);
  }

  const faults = [];
  for (const fault of design.faults) {
    const row = mapped.mapping.find((item) => item.id === fault.id);
    const key = row?.keys?.[0] || null;
    const card = key ? pass1.byKey.get(key) : null;
    const layers = card ? layerSpoken(card) : null;
    const raised = [];
    if (layers) {
      for (const [name, layer] of Object.entries(layers)) {
        if (!layer.raised) continue;
        const words = wordsHit(fault.span, layer.said);
        raised.push({
          layer: name,
          label: layer.label,
          named: words.named,
          fullSpan: words.fullHit,
          tokenHits: words.tokenHits,
          said: layer.said.slice(0, 700),
        });
      }
    }
    const ben = key ? labelByKey.get(key) : null;
    faults.push({
      id: fault.id,
      fixtureId: padFixtureId(fault.fixtureId),
      span: fault.span,
      why: fault.why,
      mapStatus: row?.status || "missing",
      statement: card?.statement || null,
      benLabel: ben?.label || null,
      displayVerdict: card?.displayVerdict || null,
      sentenceState: card?.sentenceState || null,
      sentenceLabel: card?.sentenceLabel || null,
      tier: card?.tier || null,
      raised,
      caught: raised.length > 0,
      named: raised.some((item) => item.named),
    });
  }

  const clean = [];
  const falseAlarms = [];
  for (const [key, row] of labelByKey) {
    if (row.label !== "confirmed") continue;
    const card = pass1.byKey.get(key);
    if (!card) {
      clean.push({ key, missing: true, statement: row.statementText });
      continue;
    }
    const layers = layerSpoken(card);
    const spoke = Object.entries(layers)
      .filter(([, layer]) => layer.raised)
      .map(([name, layer]) => ({
        layer: name,
        label: layer.label,
        said: layer.said.slice(0, 700),
        codes: layer.codes || [],
      }));
    const record = {
      fixtureId: card.fixtureId,
      statement: card.statement,
      displayVerdict: card.displayVerdict,
      sentenceState: card.sentenceState,
      quiet: spoke.length === 0,
      spoke,
    };
    clean.push(record);
    if (spoke.length > 0) falseAlarms.push(record);
  }

  const layerNames = ["evidence", "editorial", "compliance", "note", "framing", "recency"];
  const perLayer = {};
  for (const name of layerNames) {
    perLayer[name] = {
      caught: faults.filter((fault) => fault.raised.some((item) => item.layer === name)).length,
      named: faults.filter((fault) => fault.raised.some((item) => item.layer === name && item.named)).length,
      falseAlarms: falseAlarms.filter((row) => row.spoke.some((item) => item.layer === name)).length,
    };
  }

  const moved = [];
  const keys = new Set([...pass1.byKey.keys(), ...pass2.byKey.keys()]);
  for (const key of keys) {
    const a = pass1.byKey.get(key);
    const b = pass2.byKey.get(key);
    if (!a || !b) {
      moved.push({ key, missing: !a ? "pass1" : "pass2", statement: (a || b).statement });
      continue;
    }
    const fields = {
      label: [a.sentenceLabel || null, b.sentenceLabel || null],
      supportState: [a.supportState || null, b.supportState || null],
      displayVerdict: [a.displayVerdict || null, b.displayVerdict || null],
      concerns: [concernSignature(a), concernSignature(b)],
      tier: [a.tier || null, b.tier || null],
    };
    const changed = Object.entries(fields)
      .filter(([name, pair]) => name !== "tier" && pair[0] !== pair[1])
      .map(([name, pair]) => ({ field: name, pass1: pair[0], pass2: pair[1] }));
    const tierChanged = fields.tier[0] !== fields.tier[1];
    if (changed.length > 0 || tierChanged) {
      moved.push({
        fixtureId: a.fixtureId,
        statement: a.statement,
        tierChanged,
        tier: fields.tier,
        changed,
      });
    }
  }

  const quiet = clean.filter((row) => row.quiet).length;
  const pass2Faults = [];
  for (const fault of design.faults) {
    const row = mapped.mapping.find((item) => item.id === fault.id);
    const key = row?.keys?.[0] || null;
    const card = key ? pass2.byKey.get(key) : null;
    const layers = card ? layerSpoken(card) : null;
    const raised = layers ? Object.values(layers).filter((layer) => layer.raised) : [];
    pass2Faults.push({ id: fault.id, caught: raised.length > 0, displayVerdict: card?.displayVerdict || null });
  }
  let pass2Quiet = 0;
  let pass2Spoke = 0;
  for (const [key, row] of labelByKey) {
    if (row.label !== "confirmed") continue;
    const card = pass2.byKey.get(key);
    if (!card) continue;
    const layers = layerSpoken(card);
    const spoke = Object.values(layers).some((layer) => layer.raised);
    if (spoke) pass2Spoke += 1;
    else pass2Quiet += 1;
  }
  const extract = {
    pass1Cards: pass1.cards.length,
    pass2Cards: pass2.cards.length,
    pass1Finished: pass1.doc.finishedAt || null,
    pass2Finished: pass2.doc.finishedAt || null,
    pass1Spend: pass1.doc.spend || null,
    pass2Spend: pass2.doc.spend || null,
    groupAMapFailed: mapped.failed,
    faults,
    catch: {
      raised: faults.filter((fault) => fault.caught).length,
      named: faults.filter((fault) => fault.named).length,
      n: faults.length,
      misses: faults.filter((fault) => !fault.caught).map((fault) => fault.id),
    },
    leaveAlone: {
      quiet,
      n: clean.length,
      falseAlarmStatements: falseAlarms.length,
    },
    pass2: {
      catchRaised: pass2Faults.filter((fault) => fault.caught).length,
      catchMisses: pass2Faults.filter((fault) => !fault.caught).map((fault) => fault.id),
      quiet: pass2Quiet,
      spoke: pass2Spoke,
    },
    perLayer,
    falseAlarms,
    movement: {
      statements: keys.size,
      changedAtAll: moved.length,
      changedTier: moved.filter((row) => row.tierChanged).length,
      rows: moved,
    },
    historicalPass1: historical(labels, pass1.cards, manifest),
    historicalPass2: historical(labels, pass2.cards, manifest),
  };

  await writeFile(path.join(__dirname, "extract.json"), `${JSON.stringify(extract, null, 2)}\n`);
  console.log(JSON.stringify({
    catch: extract.catch,
    leaveAlone: extract.leaveAlone,
    perLayer: extract.perLayer,
    movement: {
      statements: extract.movement.statements,
      changedAtAll: extract.movement.changedAtAll,
      changedTier: extract.movement.changedTier,
    },
    historicalPass1: {
      groupA: extract.historicalPass1.groupA.n,
      leave: extract.historicalPass1.groupB.amongBenConfirmed,
    },
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
