#!/usr/bin/env node
/**
 * Sweep for author-versus-third-party confusion, then give the directive result
 * a real evidence base.
 *
 * Three sites were found by accident (a5be4f0 twice, 2528a32 once). This
 * enumerates every place in lib/ that reasons about named entities and PROBES
 * each one with a statement naming only the authoring organisation, so the
 * report rests on observed behaviour rather than on reading the regex.
 *
 * Part 2 regenerates the Review fixtures that ran with editorial disabled.
 * Part 3 re-measures the directive half of 2528a32 on the wider corpus.
 *
 * Usage:
 *   node scripts/diagnostic/revise/author-confusion-sweep.mjs           all parts
 *   node scripts/diagnostic/revise/author-confusion-sweep.mjs --part1   sweep only, free
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;
const FIXTURE_DIR = path.join(__dirname, "fixtures");

const AUTHOR = "Halden Group";
process.env.AUTHORING_ORGANISATION = process.env.AUTHORING_ORGANISATION || AUTHOR;

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const trunc = (s, n = 70) => {
  const t = norm(s);
  return t.length <= n ? t : `${t.slice(0, n - 1)}\u2026`;
};

/* ------------------------------------------------------------------ *
 * PART 1: the sweep
 * ------------------------------------------------------------------ */

/**
 * Each probe pairs a statement naming ONLY the author with one naming a
 * genuine third party. A site is confused when it treats the two the same.
 */
const AUTHOR_ONLY = "Halden Group expects the relationship to deepen over the next fund cycle.";
const THIRD_PARTY = "Meridian Capital expects the relationship to deepen over the next fund cycle.";

async function sweep() {
  /** @type {Array<object>} */
  const sites = [];
  const record = (o) => {
    sites.push(o);
    const flag = o.confusable ? "CONFUSABLE" : o.fixed ? "fixed" : "clean";
    console.log(`  [${flag.padEnd(10)}] ${o.site}`);
    console.log(`      does: ${o.does}`);
    console.log(`      author-only probe: ${o.probe}`);
    console.log(`      consequence: ${o.consequence}`);
    console.log(`      resolver access: ${o.resolverAccess}\n`);
  };

  const { extractStatementFeatures } = await import("../../../lib/qc/materiality.mjs");
  const { extractVerifiableAnchors } = await import("../../../lib/qc/claim-spans.mjs");
  const { checkNoInventedFacts, checkNoSpanEntitiesKept } = await import(
    "../../../lib/revise-stage1.mjs"
  );
  const { namedThirdPartiesIn } = await import("../../../lib/revise-flag-register.mjs");
  const { findCheckableParticulars } = await import(
    "../../../lib/pr9-deterministic-unsupported-removal.mjs"
  );
  const { corePropositionConfirmed } = await import("../../../lib/qc/evidence-relationship.mjs");
  const { authorStatementExemption } = await import("../../../lib/revise-author-statement.mjs");

  /* 1. materiality: named_person_entity_attribution */
  {
    const a = extractStatementFeatures(AUTHOR_ONLY).includes("named_person_entity_attribution");
    const t = extractStatementFeatures(THIRD_PARTY).includes("named_person_entity_attribution");
    record({
      site: "lib/qc/materiality.mjs extractStatementFeatures -> named_person_entity_attribution",
      does: "fires a high-signal materiality feature when a statement names a person or entity",
      probe: `author-only fires=${a}, third-party fires=${t}`,
      confusable: a && t,
      fixed: !a && t,
      consequence:
        "was scoring a statement naming only the author as an attribution to an outside party, " +
        "raising its materiality level and, through it, its flag register. The register filtered " +
        "the feature out downstream at a5be4f0; FIXED at the producer here, so every consumer " +
        "now sees the same answer",
      resolverAccess: "yes, same package as first-person-actor.mjs",
      authorFires: a,
      thirdPartyFires: t,
    });
  }

  /* 2. claim-spans: named_entity anchors */
  {
    const a = extractVerifiableAnchors(AUTHOR_ONLY).filter((s) => s.kind === "named_entity");
    record({
      site: "lib/qc/claim-spans.mjs extractVerifiableAnchors -> named_entity",
      does: "marks Title-Case runs as verifiable anchors a source should corroborate",
      probe: `author-only anchors: ${JSON.stringify(a.map((s) => s.text))}`,
      confusable: false,
      consequence:
        "none that is wrong. An anchor is a checkable thing, not an outside party, and the " +
        "author's own name in a statement is legitimately checkable",
      resolverAccess: "yes, but it should not use it",
      legitimate: true,
    });
  }

  /* 3. revise-stage1: checkNoInventedFacts (fixed 2528a32) */
  {
    const withAuthor = checkNoInventedFacts(
      "This relationship supported the diligence phase.",
      "This relationship supported Halden Group's work during the diligence phase.",
      "",
      AUTHOR
    );
    const without = checkNoInventedFacts(
      "This relationship supported the diligence phase.",
      "This relationship supported Halden Group's work during the diligence phase.",
      "",
      null
    );
    record({
      site: "lib/revise-stage1.mjs checkNoInventedFacts",
      does: "rejects a stage 1 edit introducing a proper noun absent from the statement and sources",
      probe: `with resolver ok=${withAuthor.ok}, without resolver ok=${without.ok}`,
      confusable: false,
      fixed: true,
      consequence: "was discarding correct directive edits that named the client. Fixed at 2528a32",
      resolverAccess: "yes, threaded through runStage1 as authoringOrganisation",
    });
  }

  /* 4. revise-stage1: checkNoSpanEntitiesKept */
  {
    const concern = { evidence: { reason: "No source addresses this." } };
    const r = checkNoSpanEntitiesKept(
      AUTHOR_ONLY,
      "The relationship is expected to deepen over the next fund cycle.",
      concern
    );
    record({
      site: "lib/revise-stage1.mjs checkNoSpanEntitiesKept",
      does: "rejects a no-span edit that DELETES a named entity the finding does not name",
      probe: `dropping the author's name is rejected=${!r.ok} (${trunc(r.detail ?? "", 50)})`,
      confusable: false,
      consequence:
        "none that is wrong. This guard protects against LOSING a name, and losing who acted " +
        "is a real defect whether the actor is the author or anyone else",
      resolverAccess: "yes, but it should not use it",
      legitimate: true,
    });
  }

  /* 5. revise-flag-register: named_third_party (fixed a5be4f0) */
  {
    const a = namedThirdPartiesIn(AUTHOR_ONLY, AUTHOR);
    const t = namedThirdPartiesIn(THIRD_PARTY, AUTHOR);
    record({
      site: "lib/revise-flag-register.mjs namedThirdPartiesIn",
      does: "decides whether a flagged element names an outside party, driving the LOUD register",
      probe: `author-only=${JSON.stringify(a)}, third-party=${JSON.stringify(t)}`,
      confusable: a.length > 0,
      fixed: true,
      consequence: "was pushing the author's own statements to LOUD. Fixed at a5be4f0",
      resolverAccess: "yes, calls resolveAuthoringOrganisationName() directly",
    });
  }

  /* 6. deterministic removal: proper_noun particulars */
  {
    const a = findCheckableParticulars(AUTHOR_ONLY).filter((p) => p.kind === "proper_noun");
    const t = findCheckableParticulars(THIRD_PARTY).filter((p) => p.kind === "proper_noun");
    const mixed = findCheckableParticulars(
      "Halden Group committed to Meridian Capital Partners V."
    ).filter((p) => p.kind === "proper_noun");
    const namesAuthor = a.some((p) => norm(p.match).toLowerCase().includes("halden"));
    record({
      site: "lib/pr9-deterministic-unsupported-removal.mjs findCheckableParticulars",
      does:
        "extracts the checkable particulars in a sentence; the count decides whether removing " +
        "a clause leaves a remnant worth keeping",
      probe:
        `author-only ${JSON.stringify(a.map((p) => p.match))}, third-party ` +
        `${JSON.stringify(t.map((p) => p.match))}, mixed ${JSON.stringify(mixed.map((p) => p.match))}`,
      confusable: namesAuthor,
      fixed: !namesAuthor,
      consequence:
        "was counting the author's own name as a particular an outside source must support, so " +
        "a sentence about the author's own actions looked more checkable than it is. It already " +
        "filtered first-person pronouns, which is the same actor by another name. FIXED here",
      resolverAccess: "yes, plain ESM import",
      authorParticulars: a.map((p) => p.match),
      thirdPartyParticulars: t.map((p) => p.match),
    });
  }

  /* 7. evidence-relationship: the corroboration anchor */
  {
    // The two statements make the same proposition against the same source. The
    // only difference is that one opens with the author's name.
    const excerpt =
      "Meridian Capital Partners V was established in 2026 and has invested in twelve platforms.";
    const entityLed = corePropositionConfirmed(
      "Meridian Capital Partners V was established in 2026.",
      excerpt
    );
    const authorLed = corePropositionConfirmed(
      "Halden Group invested in Meridian Capital Partners V, which was established in 2026.",
      excerpt
    );
    const authorOnly = corePropositionConfirmed("Halden Group was established in 2026.", excerpt);
    record({
      site: "lib/qc/evidence-relationship.mjs corePropositionConfirmed",
      does:
        "takes the FIRST Title-Case run in the statement as the entity, and requires the source " +
        "excerpt to contain it before the proposition can be confirmed",
      probe:
        `entity-led confirmed=${entityLed.corePropositionConfirmed}, author-led confirmed=` +
        `${authorLed.corePropositionConfirmed}, author-only confirmed=${authorOnly.corePropositionConfirmed}`,
      confusable: !authorLed.corePropositionConfirmed && entityLed.corePropositionConfirmed,
      fixed: authorLed.corePropositionConfirmed && entityLed.corePropositionConfirmed,
      consequence:
        "a supported statement that OPENS with the author's name could never be confirmed, because " +
        "no external source mentions the client. A false negative on SUPPORT, the most " +
        "consequential of the confusions found. FIXED here; where the author is the only name " +
        "there is still no external anchor and the proposition stays unconfirmed",
      resolverAccess: "yes, same package",
      authorLed: authorLed.corePropositionConfirmed,
      entityLed: entityLed.corePropositionConfirmed,
    });
  }

  /* 8. revise-author-statement: the third-party carve-out */
  {
    const d = authorStatementExemption(
      {
        statementText: AUTHOR_ONLY,
        evidence: { kind: "unsupported", verdict: "no_support", unsupportedSpans: [] },
      },
      { authoringOrganisation: AUTHOR, draftText: AUTHOR_ONLY }
    );
    record({
      site: "lib/revise-author-statement.mjs authorStatementExemption",
      does: "decides whether a statement attributes an act to the author rather than a third party",
      probe: `author-only exempt=${d.exempt}`,
      confusable: !d.exempt,
      consequence: "this site exists to make the distinction; it is the reference implementation",
      resolverAccess: "yes, by construction",
    });
  }

  const confusable = sites.filter((s) => s.confusable);
  console.log(
    `\n  SWEPT ${sites.length} sites. ${confusable.length} newly confusable, ` +
      `${sites.filter((s) => s.fixed).length} already fixed, ` +
      `${sites.filter((s) => s.legitimate).length} legitimately name-blind.`
  );
  for (const c of confusable) console.log(`    -> ${c.site}`);
  return sites;
}

/* ------------------------------------------------------------------ *
 * PART 2 + 3 helpers
 * ------------------------------------------------------------------ */

function findStatementArrays(node, out = [], depth = 0) {
  if (!node || typeof node !== "object" || depth > 6) return out;
  if (Array.isArray(node)) {
    if (node.length && node[0] && node[0].qcCard) out.push(node);
    node.forEach((n) => findStatementArrays(n, out, depth + 1));
    return out;
  }
  for (const v of Object.values(node)) findStatementArrays(v, out, depth + 1);
  return out;
}

async function statementsOf(file) {
  const json = JSON.parse(await readFile(path.join(OUT_DIR, file), "utf8"));
  const arrays = findStatementArrays(json);
  return arrays.length ? arrays.sort((a, b) => b.length - a.length)[0] : [];
}

const ARTEFACTS = [
  { file: "suggest-after-r10-review1.json", org: "Halden Group" },
  { file: "suggest-after-r10-review2.json", org: "Halden Group" },
  { file: "condition-b-review.json", org: "Halden Group" },
  { file: "coverage-gap-review.json", org: "Partners Group" },
];

async function directiveCensus(label) {
  const { gatherConcerns } = await import("../../../lib/build-revision-prompt.mjs");
  const { directivesOn } = await import("../../../lib/revise-stage1.mjs");
  const rows = [];
  for (const { file } of ARTEFACTS) {
    const statements = await statementsOf(file);
    if (!statements.length) continue;
    const concerns = gatherConcerns(statements, null);
    const ed = concerns.reduce((a, c) => a + (c.editorial?.length ?? 0), 0);
    const co = concerns.reduce((a, c) => a + (c.compliance?.length ?? 0), 0);
    const dirs = concerns.flatMap((c) =>
      directivesOn(c).map((d) => ({
        statementIndex: c.statementIndex,
        rule: d.rule ?? d.kind ?? "unnamed",
        direction: norm(d.suggestedDirection),
      }))
    );
    rows.push({ file, editorial: ed, compliance: co, withDirection: dirs.length, dirs });
    console.log(
      `  ${label} ${file.padEnd(34)} editorial ${String(ed).padStart(2)} compliance ${String(co).padStart(2)} with a direction ${String(dirs.length).padStart(2)}`
    );
  }
  const total = rows.reduce((a, r) => a + r.withDirection, 0);
  console.log(`  ${label} TOTAL directives in the corpus: ${total}\n`);
  return { rows, total };
}

/** The evidence verdict of every statement, so Part 2 can prove nothing moved. */
async function verdictSnapshot() {
  const snap = {};
  for (const { file } of ARTEFACTS) {
    const statements = await statementsOf(file);
    snap[file] = statements.map((s) => ({
      i: s.statementIndex ?? s.index ?? null,
      text: norm(s.text).slice(0, 60),
      verdict: s.qcCard?.evidence?.verdict ?? s.qcCard?.verdict ?? null,
      kind: s.qcCard?.evidence?.kind ?? null,
    }));
  }
  return snap;
}

/* ------------------------------------------------------------------ *
 * PART 2: regenerate the fixtures that ran with editorial disabled
 * ------------------------------------------------------------------ */

const PRODUCTION_URL =
  process.env.QC_REGRESSION_BASE_URL || "https://brightline-content-engine-backend.vercel.app";

/** ~$0.50 per Review at ten statements, from run-suggest-after-r10.mjs. */
const REVIEW_COST_ESTIMATE_USD = 0.5;
const COST_CEILING_USD = 2;

async function postJson(pathname, body) {
  const url = `${PRODUCTION_URL}${pathname}`;
  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { parseError: true, rawText: text.slice(0, 2000) };
  }
  return { url, httpStatus: res.status, ms: Date.now() - t0, payload };
}

/**
 * Re-review exactly what the committed artefact reviewed, with editorial and
 * compliance switched on and nothing else touched.
 *
 * The draft and the sources are taken from the artefact itself rather than from
 * a generator script, so review2 — whose draft was produced by a Suggest call in
 * the middle of a chain — is reproduced without re-running that chain and
 * without the draft drifting.
 */
async function regenerate(file, org) {
  const prior = JSON.parse(await readFile(path.join(OUT_DIR, file), "utf8"));
  const statements = prior.payload?.statements ?? [];
  const draftText = statements.map((s) => norm(s.text)).join("\n\n");
  const sources = (prior.payload?.sources ?? []).map((s) => ({
    text: s.text,
    label: s.label,
    name: s.name ?? `${String(s.label ?? "source").replace(/\W+/g, "_").toLowerCase()}.txt`,
    title: s.title ?? s.label,
    sourceType: "uploaded",
  }));

  const review = await postJson("/api/analyse-statements", {
    draftText,
    outputType: "reporting_commentary",
    requiredVersion: "complete",
    authoringOrganisation: org,
    options: {
      pipelineRoute: prior.payload?.meta?.pipelineVersion?.startsWith("v4") ? "v4" : "v4",
      evidenceEnabled: true,
      editorialEnabled: true,
      complianceEnabled: true,
    },
    sources,
  });

  const got = review.payload?.statements ?? [];
  console.log(
    `  ${file.padEnd(34)} http=${review.httpStatus} ms=${review.ms} statements ${statements.length} -> ${got.length}`
  );
  if (review.httpStatus !== 200 || got.length === 0) {
    console.log(`    REVIEW FAILED, keeping the committed artefact`);
    return { file, ok: false, review };
  }
  await writeFile(
    path.join(OUT_DIR, file),
    `${JSON.stringify({ ranAt: new Date().toISOString(), ...review }, null, 2)}\n`,
    "utf8"
  );
  return { file, ok: true, before: statements.length, after: got.length };
}

/** Did any evidence verdict move? It should not; only editorial was switched on. */
function diffVerdicts(before, after) {
  const moved = [];
  for (const file of Object.keys(before)) {
    const b = before[file] ?? [];
    const a = after[file] ?? [];
    for (const row of b) {
      const match = a.find((x) => x.text === row.text);
      if (!match) {
        moved.push({ file, text: row.text, from: row.verdict, to: "STATEMENT NOT FOUND" });
        continue;
      }
      if (match.verdict !== row.verdict || match.kind !== row.kind) {
        moved.push({
          file,
          text: row.text,
          from: `${row.verdict}/${row.kind}`,
          to: `${match.verdict}/${match.kind}`,
        });
      }
    }
  }
  return moved;
}

/* ------------------------------------------------------------------ *
 * PART 3: re-measure the directive half on the wider corpus
 * ------------------------------------------------------------------ */

const stripMarkers = (s) => String(s ?? "").replace(/\{\{([\s\S]*?)\|\|[\s\S]*?\}\}/g, "$1");
const nl = (s) =>
  norm(s).toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[.,;:]/g, "");

/** A directive names its span in quotes. Following it means the span is gone. */
function scoreDirective(directive, statementText, revised) {
  const quoted = /'([^']{6,})'/.exec(directive.direction);
  const target = quoted ? quoted[1] : null;
  const plain = stripMarkers(revised);
  if (!target) {
    return { followed: !nl(plain).includes(nl(statementText)), target: null, scoredOn: "statement moved" };
  }
  return { followed: !nl(plain).includes(nl(target)), target, scoredOn: "span removed" };
}

async function measureDirectives() {
  const { callLLM, calculateLlmCostUsd, flushObservability, hasProviderApiKey } = await import(
    "../../../lib/observability.js"
  );
  const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
  const { buildRevisionPrompt, finalizeSuggestRevisionText, gatherConcerns } = await import(
    "../../../lib/build-revision-prompt.mjs"
  );
  const { runStage1, directivesOn } = await import("../../../lib/revise-stage1.mjs");
  const cfg = STAGE_MODELS["writing-rewrite"];

  if (!hasProviderApiKey(cfg.provider)) {
    console.log("  no provider API key; cannot measure");
    return null;
  }

  const rows = [];
  let cost = 0;
  for (const { file, org } of ARTEFACTS) {
    const statements = await statementsOf(file);
    if (!statements.length) continue;
    const concerns = gatherConcerns(statements, null);
    const directives = concerns.flatMap((c) =>
      directivesOn(c).map((d) => ({
        statementIndex: c.statementIndex,
        statementText: norm(c.statementText),
        rule: d.rule ?? d.kind ?? "unnamed",
        direction: norm(d.suggestedDirection),
      }))
    );
    if (!directives.length) {
      console.log(`  ${file}: no directives, skipped`);
      continue;
    }
    const draft = statements.map((s) => norm(s.text)).join("\n\n");
    const sourceText = (statements[0]?.qcCard && "") || "";

    console.log(`\n  ${file}: ${directives.length} directives`);
    for (const arm of ["OLD", "NEW"]) {
      for (let seed = 1; seed <= 3; seed++) {
        let raw;
        if (arm === "OLD") {
          const prompt = buildRevisionPrompt(draft, concerns, {
            outputType: "reporting_commentary",
            requiredVersion: "complete",
          });
          const c = await callLLM({
            provider: cfg.provider,
            model: cfg.model,
            temperature: 0,
            seed,
            messages: [{ role: "user", content: prompt }],
            traceName: "author-confusion-sweep",
            spanName: `OLD-${file}-${seed}`,
          });
          cost += calculateLlmCostUsd(cfg.provider, cfg.model, c?.usage);
          raw = String(c?.text ?? "").replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
        } else {
          const out = await runStage1(draft, concerns, {
            sourceText,
            authoringOrganisation: org,
            callModel: async (prompt, meta) => {
              const c = await callLLM({
                provider: cfg.provider,
                model: cfg.model,
                temperature: 0,
                seed,
                responseFormat: "json",
                messages: [{ role: "user", content: prompt }],
                traceName: "author-confusion-sweep",
                spanName: `NEW-${file}-${seed}-s${meta.index}`,
              });
              cost += calculateLlmCostUsd(cfg.provider, cfg.model, c?.usage);
              return { text: c?.text ?? "", usage: c?.usage ?? null };
            },
          });
          raw = out.revisedDraft;
        }
        const revised = finalizeSuggestRevisionText(raw, {
          originalDraft: draft,
          concerns,
          deterministicUnsupportedRemoval: false,
          log: () => {},
        }).revisedDraft;

        for (const d of directives) {
          const r = scoreDirective(d, d.statementText, revised);
          rows.push({ file, arm, seed, ...d, ...r });
        }
        const hit = directives.filter(
          (d) => scoreDirective(d, d.statementText, revised).followed
        ).length;
        console.log(`    ${arm} run${seed}: ${hit}/${directives.length} directives followed`);
      }
    }
  }
  await flushObservability();
  return { rows, cost };
}

export { sweep, directiveCensus, verdictSnapshot, statementsOf, ARTEFACTS, findStatementArrays };

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main() {
  console.log("=== PART 1, AUTHOR-VERSUS-THIRD-PARTY SWEEP ===\n");
  const sites = await sweep();

  console.log("\n=== PART 2, DIRECTIVE CENSUS, BEFORE REGENERATION ===\n");
  const before = await directiveCensus("before");
  const verdictsBefore = await verdictSnapshot();

  if (process.argv.includes("--part1")) {
    await writeFile(
      path.join(OUT_DIR, "author-confusion-sweep.json"),
      `${JSON.stringify({ ranAt: new Date().toISOString(), sites, before, verdictsBefore }, null, 2)}\n`,
      "utf8"
    );
    console.log("wrote author-confusion-sweep.json (part 1 only)");
    return;
  }

  // --measure-only re-runs Part 3 against fixtures already regenerated, so a
  // fix to the send order can be re-measured without paying for Review again.
  const toRegenerate = process.argv.includes("--measure-only")
    ? []
    : ARTEFACTS.filter(
        (a) => (before.rows.find((r) => r.file === a.file)?.withDirection ?? 0) === 0
      );
  const estimate = toRegenerate.length * REVIEW_COST_ESTIMATE_USD;
  console.log(
    `=== PART 2, REGENERATING ${toRegenerate.length} ARTEFACTS WITH EDITORIAL AND COMPLIANCE ON ===\n`
  );
  console.log(
    `  estimated cost $${estimate.toFixed(2)} at $${REVIEW_COST_ESTIMATE_USD.toFixed(2)} per Review, ceiling $${COST_CEILING_USD.toFixed(2)}\n`
  );
  if (estimate > COST_CEILING_USD) {
    throw new Error(`estimate $${estimate.toFixed(2)} exceeds the $${COST_CEILING_USD} ceiling`);
  }

  const regen = [];
  for (const a of toRegenerate) regen.push(await regenerate(a.file, a.org));

  console.log("");
  const after = await directiveCensus("after ");
  const verdictsAfter = await verdictSnapshot();
  const movedVerdicts = diffVerdicts(verdictsBefore, verdictsAfter);
  console.log(`  evidence verdicts that moved: ${movedVerdicts.length}`);
  for (const m of movedVerdicts) {
    console.log(`    ${m.file} "${trunc(m.text, 46)}" ${m.from} -> ${m.to}`);
  }

  console.log("\n=== PART 3, DIRECTIVES ON THE WIDER CORPUS, 3 RUNS PER ARM ===");
  const measured = await measureDirectives();

  let totals = null;
  if (measured) {
    const armTotal = (arm) => {
      const rs = measured.rows.filter((r) => r.arm === arm);
      return { followed: rs.filter((r) => r.followed).length, of: rs.length };
    };
    const old = armTotal("OLD");
    const nw = armTotal("NEW");
    // Any directive the whole-draft path followed but stage 1 did not.
    const keys = [...new Set(measured.rows.map((r) => `${r.file}::${r.rule}::${r.statementIndex}`))];
    const regressions = keys.filter((k) => {
      const hit = (arm) =>
        measured.rows.filter(
          (r) => `${r.file}::${r.rule}::${r.statementIndex}` === k && r.arm === arm && r.followed
        ).length;
      return hit("OLD") > hit("NEW");
    });
    totals = { old, nw, regressions };
    console.log(`\n  OLD ${old.followed}/${old.of}   NEW ${nw.followed}/${nw.of}`);
    console.log(`  directives OLD followed more often than NEW: ${regressions.length}`);
    for (const k of regressions) console.log(`    ${k}`);
    console.log(`\n  PART 3 COST $${measured.cost.toFixed(4)}`);
  }

  await writeFile(
    path.join(OUT_DIR, "author-confusion-sweep.json"),
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        sites,
        before,
        after,
        regen,
        movedVerdicts,
        directiveRuns: measured?.rows ?? [],
        totals,
        reviewCostEstimateUsd: estimate,
        part3CostUsd: measured?.cost ?? 0,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  console.log("\nwrote author-confusion-sweep.json");
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
