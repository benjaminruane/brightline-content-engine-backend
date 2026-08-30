#!/usr/bin/env node
/**
 * Why did r10-review1 S7 contradict itself on the live prompt?
 * b122-rescore.json (ee170f7) 0 of 3. b134 reference arm (ran before c0e1482)
 * 3 of 3. Same seeds. Parts 1 to 3 make no model calls.
 *
 * Usage: node scripts/diagnostic/revise/reference-arm-contradiction.mjs
 *        PART4=1 to force the billed tail. The script also runs the tail
 *        when Parts 1 to 3 cannot distinguish H2 from H3.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { nl, scoreDirectiveFollow, stripMarkers } from "./directive-follow-scorer.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../../..");
const FIXTURE = "suggest-after-r10-review1.json";
const KEY = `${FIXTURE}::7::voice_consistency`;
const B122_COMMIT = "ee170f7";
const B134_TREE_USED = "6280e73";
const B134_TAGGED = "6c05d9b";
const RECORDED_LIVE_LEN = 37800;
const RECORDED_LIVE_HASH = "ce8cea3d6dcf2e164a77389691b9be67001dce8e08971bbe6e5c6bdb700543fb";
const PROMPT_BLOBS = [
  "lib/build-revision-prompt.mjs",
  "lib/qc/style-guide.mjs",
  "lib/qc/first-person-actor.mjs",
  "lib/output-intent.js",
  `scripts/diagnostic/revise/${FIXTURE}`,
];
const TAIL_SEEDS = [1, 2, 3, 4, 5, 6];
const COST_CEILING_USD = 0.15;
const OUTPUT_TOKEN_GUESS = 1500;

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

function sha256(s) {
  return createHash("sha256").update(String(s ?? ""), "utf8").digest("hex");
}

function git(args, opts = {}) {
  return execFileSync("git", args, {
    cwd: REPO,
    encoding: "utf8",
    ...opts,
  }).trim();
}

function blobId(commit, file) {
  return git(["rev-parse", `${commit}:${file}`]);
}

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

function splitDraft(draft) {
  return stripMarkers(draft)
    .split(/\n\n+/)
    .map((s) => norm(s))
    .filter(Boolean);
}

function revisedStatement(origList, origText, revisedDraft) {
  const revList = splitDraft(revisedDraft);
  const idx = origList.findIndex((t) => t === origText);
  if (idx >= 0 && revList.length === origList.length) return revList[idx];
  const plain = norm(stripMarkers(revisedDraft));
  if (nl(plain).includes(nl(origText))) return origText;
  if (idx >= 0 && revList[idx]) return revList[idx];
  return plain;
}

function flattenDashes(s) {
  return String(s ?? "").replace(/\u2014|\u2013|\u2212/g, "-");
}

function firstDiff(a, b) {
  if (a === b) return null;
  const la = a.split("\n");
  const lb = b.split("\n");
  const n = Math.max(la.length, lb.length);
  for (let i = 0; i < n; i++) {
    if (la[i] !== lb[i]) {
      return {
        line: i + 1,
        a: la[i] ?? "(missing)",
        b: lb[i] ?? "(missing)",
      };
    }
  }
  return { line: null, a: `len ${a.length}`, b: `len ${b.length}` };
}

async function reconstructAt(commit, label) {
  const dest = mkdtempSync(path.join(os.tmpdir(), `ce-ref-${commit}-`));
  git(["worktree", "add", "--detach", dest, commit]);
  try {
    const brpUrl = pathToFileURL(path.join(dest, "lib/build-revision-prompt.mjs")).href;
    const { buildRevisionPrompt, gatherConcerns } = await import(brpUrl);
    const json = JSON.parse(await readFile(path.join(dest, "scripts/diagnostic/revise", FIXTURE), "utf8"));
    const arrays = findStatementArrays(json);
    const statements = arrays.length ? arrays.sort((a, b) => b.length - a.length)[0] : [];
    const origList = statements.map((s) => norm(s.text || s.qcCard?.statement || ""));
    const draft = origList.join("\n\n");
    const concerns = gatherConcerns(statements, null);
    const prompt = buildRevisionPrompt(draft, concerns, {
      outputType: "reporting_commentary",
      requiredVersion: "complete",
    });
    return {
      label,
      commit,
      len: prompt.length,
      hash: sha256(prompt),
      prompt,
      statementCount: statements.length,
      concernCount: concerns.length,
    };
  } finally {
    try {
      git(["worktree", "remove", "--force", dest]);
    } catch {
      rmSync(dest, { recursive: true, force: true });
    }
  }
}

function s7FromB122(json) {
  const rows = (json.scoreRows || []).filter((r) => r.key === KEY);
  const hits = (json.perDirective || []).find((d) => d.key === KEY);
  return {
    ranAt: json.ranAt,
    model: json.model,
    temperature: json.temperature,
    seeds: json.seeds,
    fingerprintPresent: Object.prototype.hasOwnProperty.call(json, "systemFingerprint") ||
      Object.prototype.hasOwnProperty.call(json, "fingerprint") ||
      (json.runs || []).some((r) => r.systemFingerprint || r.fingerprint || r.raw?.system_fingerprint),
    promptHashPresent: Boolean(json.promptHash || json.liveHash || json.hashes),
    newHits: hits ? hits.newHits : rows.filter((r) => r.newFollowed).length,
    total: hits ? hits.total : rows.length,
    rows: rows.map((r) => ({
      seed: r.seed,
      followed: r.newFollowed,
      revisedStatement: r.revisedStatement,
    })),
    inputTokens: (json.runs || [])
      .filter((r) => r.file === FIXTURE)
      .map((r) => ({ seed: r.seed, inputTokens: r.usage?.inputTokens ?? null })),
  };
}

function s7FromB134(json) {
  const rows = (json.scoreRows || []).filter((r) => r.key === KEY && r.arm === "reference");
  const live = (json.hashes || []).find((h) => h.file === FIXTURE);
  return {
    ranAt: json.ranAt,
    model: json.model,
    temperature: json.temperature,
    seeds: json.seeds,
    fingerprintPresent: Object.prototype.hasOwnProperty.call(json, "systemFingerprint") ||
      Object.prototype.hasOwnProperty.call(json, "fingerprint") ||
      (json.runs || []).some((r) => r.systemFingerprint || r.fingerprint || r.raw?.system_fingerprint),
    promptHashPresent: Boolean(live),
    followed: rows.filter((r) => r.followed).length,
    total: rows.length,
    rows: rows.map((r) => ({
      seed: r.seed,
      followed: r.followed,
      revisedStatement: r.revisedStatement,
    })),
    liveLen: live?.liveLen ?? null,
    liveHash: live?.liveHash ?? null,
    inputTokens: (json.runs || [])
      .filter((r) => r.file === FIXTURE && r.arm === "reference")
      .map((r) => ({ seed: r.seed, inputTokens: r.usage?.inputTokens ?? null })),
  };
}

function fence(s) {
  return "```\n" + flattenDashes(String(s ?? "")).trimEnd() + "\n```";
}

async function maybeRunTail(prompt, origList, statementText, direction) {
  const force = process.env.PART4 === "1";
  const skip = process.env.PART4 === "0";
  if (skip) return { skipped: true, reason: "PART4=0" };

  const { callLLM, calculateLlmCostUsd, flushObservability, hasProviderApiKey, getLlmPricingTable } =
    await import("../../../lib/observability.js");
  const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
  const { finalizeSuggestRevisionText } = await import("../../../lib/build-revision-prompt.mjs");
  const cfg = STAGE_MODELS["writing-rewrite"];
  const pricing = getLlmPricingTable()?.openai?.[cfg.model] || { input: 1.25, cachedInput: 0.125, output: 10 };
  const naiveIn = Math.ceil(prompt.length / 4);
  const naive = TAIL_SEEDS.length * ((naiveIn / 1e6) * pricing.input + (OUTPUT_TOKEN_GUESS / 1e6) * pricing.output);
  const naiveHi = naive * 1.4;
  // Same prompt as the b134 carve-out arm for this fixture: 8652 in, ~615 out,
  // prefix cache on later seeds. char/4 overstates; B134 0e already recorded that.
  const measuredIn = 8652;
  const measuredOut = 650;
  const measuredCached = 8448;
  const uncachedTail = Math.max(0, measuredIn - measuredCached);
  const seed1 =
    (measuredIn / 1e6) * pricing.input + (measuredOut / 1e6) * pricing.output;
  const later =
    (measuredCached / 1e6) * (pricing.cachedInput ?? 0.125) +
    (uncachedTail / 1e6) * pricing.input +
    (measuredOut / 1e6) * pricing.output;
  const est = seed1 + later * (TAIL_SEEDS.length - 1);
  const estHi = est * 1.4;
  console.log("\n=== PART 4 COST ESTIMATE (before any model call) ===");
  console.log(`  model ${cfg.provider}/${cfg.model} temperature 0 seeds ${TAIL_SEEDS.join(",")}`);
  console.log(`  calls ${TAIL_SEEDS.length} (1 fixture x 1 arm x 6 seeds)`);
  console.log(`  naive char/4 $${naive.toFixed(4)} to $${naiveHi.toFixed(4)} (overstates; not the gate)`);
  console.log(`  scaled from b134 carved-arm measured tokens $${est.toFixed(4)} to $${estHi.toFixed(4)} (140% upper)`);
  console.log(`  ceiling $${COST_CEILING_USD.toFixed(2)}`);
  if (estHi > COST_CEILING_USD) {
    console.log(`  STOP: upper estimate exceeds ceiling. Not running.`);
    return { skipped: true, reason: "estimate exceeds ceiling", est, estHi };
  }
  if (!hasProviderApiKey(cfg.provider)) {
    console.log("  STOP: no provider API key.");
    return { skipped: true, reason: "no api key", est, estHi };
  }
  if (!force) {
    console.log("  running because Parts 1 to 3 cannot distinguish H2 from H3.");
  }

  const draft = origList.join("\n\n");
  const { gatherConcerns } = await import("../../../lib/build-revision-prompt.mjs");
  const json = JSON.parse(await readFile(path.join(__dirname, FIXTURE), "utf8"));
  const arrays = findStatementArrays(json);
  const statements = arrays.length ? arrays.sort((a, b) => b.length - a.length)[0] : [];
  const concerns = gatherConcerns(statements, null);

  const rows = [];
  let cost = 0;
  for (const seed of TAIL_SEEDS) {
    console.log(`  calling live HEAD seed ${seed}...`);
    const completion = await callLLM({
      provider: cfg.provider,
      model: cfg.model,
      temperature: 0,
      seed,
      messages: [{ role: "user", content: prompt }],
      traceName: "reference-arm-contradiction",
      spanName: `${FIXTURE}-seed${seed}`,
    });
    cost += calculateLlmCostUsd(cfg.provider, cfg.model, completion?.usage);
    const raw = String(completion?.text ?? "")
      .replace(/^```[a-z]*\n?/i, "")
      .replace(/\n?```$/, "")
      .trim();
    const finalized = finalizeSuggestRevisionText(raw, {
      originalDraft: draft,
      concerns,
      deterministicUnsupportedRemoval: false,
      log: () => {},
    });
    const stmt = revisedStatement(origList, statementText, finalized.revisedDraft);
    const scored = scoreDirectiveFollow({
      direction,
      statementText,
      revised: stmt,
    });
    const actor = nl(stmt).includes(nl("Halden Group"));
    const firstPerson = /\bwe\b|\bour\b|\bus\b/.test(nl(stmt));
    rows.push({
      seed,
      followed: scored.followed,
      actor,
      firstPerson,
      revisedStatement: stmt,
      inputTokens: completion?.usage?.inputTokens ?? null,
    });
    console.log(`    followed=${scored.followed} actor=${actor} cost $${cost.toFixed(4)}`);
    console.log(`    ${stmt}`);
  }
  await flushObservability();
  return {
    skipped: false,
    est,
    estHi,
    actual: cost,
    followed: rows.filter((r) => r.followed).length,
    actorPresent: rows.filter((r) => r.actor).length,
    rows,
  };
}

const b122 = JSON.parse(await readFile(path.join(__dirname, "b122-rescore.json"), "utf8"));
const b134 = JSON.parse(await readFile(path.join(__dirname, "b134-carve-out-gate.json"), "utf8"));
const a = s7FromB122(b122);
const b = s7FromB134(b134);

console.log("=== PART 0. JSON artefacts, not reports ===\n");
console.log(`b122-rescore.json  ranAt ${a.ranAt}  model ${a.model}  temp ${a.temperature}  S7 ${a.newHits} of ${a.total}`);
for (const r of a.rows) console.log(`  seed ${r.seed} followed=${r.followed}  ${r.revisedStatement}`);
console.log(`  fingerprint in artefact: ${a.fingerprintPresent}`);
console.log(`  prompt hash in artefact: ${a.promptHashPresent}`);
console.log(`  inputTokens: ${JSON.stringify(a.inputTokens)}`);
console.log("");
console.log(`b134-carve-out-gate.json  ranAt ${b.ranAt}  model ${b.model}  temp ${b.temperature}  S7 reference ${b.followed} of ${b.total}`);
for (const r of b.rows) console.log(`  seed ${r.seed} followed=${r.followed}  ${r.revisedStatement}`);
console.log(`  fingerprint in artefact: ${b.fingerprintPresent}`);
console.log(`  prompt hash in artefact: ${b.promptHashPresent}  recorded live len ${b.liveLen} hash ${b.liveHash}`);
console.log(`  inputTokens: ${JSON.stringify(b.inputTokens)}`);

console.log("\n=== blob identity ee170f7 vs 6280e73 ===");
const blobRows = [];
for (const file of PROMPT_BLOBS) {
  const x = blobId(B122_COMMIT, file);
  const y = blobId(B134_TREE_USED, file);
  const same = x === y;
  blobRows.push({ file, ee170f7: x, "6280e73": y, same });
  console.log(`  ${same ? "SAME" : "DIFF"}  ${file}`);
  if (!same) console.log(`    ${x}\n    ${y}`);
}

console.log("\n=== PART 1. Reconstruct prompts (no model calls) ===");
const recB122 = await reconstructAt(B122_COMMIT, "b122-rescore path at ee170f7");
const recB134Used = await reconstructAt(B134_TREE_USED, "b134 reference tree actually used (6280e73, pre-feat)");
const recB134Tagged = await reconstructAt(B134_TAGGED, "b134 tagged commit 6c05d9b (post-feat live)");

const { buildRevisionPrompt, gatherConcerns } = await import("../../../lib/build-revision-prompt.mjs");
const liveJson = JSON.parse(await readFile(path.join(__dirname, FIXTURE), "utf8"));
const liveArrays = findStatementArrays(liveJson);
const liveStatements = liveArrays.length ? liveArrays.sort((a, b) => b.length - a.length)[0] : [];
const liveOrig = liveStatements.map((s) => norm(s.text || s.qcCard?.statement || ""));
const liveDraft = liveOrig.join("\n\n");
const liveConcerns = gatherConcerns(liveStatements, null);
const liveNow = buildRevisionPrompt(liveDraft, liveConcerns, {
  outputType: "reporting_commentary",
  requiredVersion: "complete",
});
const recNow = { label: "HEAD live now", commit: git(["rev-parse", "--short", "HEAD"]), len: liveNow.length, hash: sha256(liveNow), prompt: liveNow };

for (const rec of [recB122, recB134Used, recB134Tagged, recNow]) {
  console.log(`  ${rec.label}`);
  console.log(`    commit ${rec.commit}  len ${rec.len}  sha256 ${rec.hash}`);
}

const identical = recB122.hash === recB134Used.hash;
const matchesRecorded = recB134Used.hash === RECORDED_LIVE_HASH && recB134Used.len === RECORDED_LIVE_LEN;
console.log(`\n  IDENTICAL ee170f7 vs 6280e73: ${identical}`);
console.log(`  6280e73 matches b134 recorded live hash: ${matchesRecorded}`);
if (!identical) {
  const d = firstDiff(recB122.prompt, recB134Used.prompt);
  console.log("  first differing line:");
  console.log(JSON.stringify(d, null, 2));
}

const s7Concern = liveConcerns.find((c) => c.statementIndex === 7);
const { directivesOn } = await import("../../../lib/revise-stage1.mjs");
const s7Dirs = s7Concern ? directivesOn(s7Concern) : [];
const voiceDir = s7Dirs.find((d) => (d.rule ?? d.kind) === "voice_consistency") || s7Dirs[0];
const statementText = norm(s7Concern?.statementText || "");
const direction = norm(voiceDir?.suggestedDirection || "");

const configSameRecorded =
  a.model === b.model && a.temperature === b.temperature && JSON.stringify(a.seeds) === JSON.stringify(b.seeds);
const fingerprintMissing = !a.fingerprintPresent && !b.fingerprintPresent;

console.log("\n=== PART 2. Recorded configuration ===");
console.log(`  model+temp+seeds same: ${configSameRecorded}  (${a.model} / ${a.temperature} / ${JSON.stringify(a.seeds)})`);
console.log(`  system fingerprint in either artefact: ${!fingerprintMissing}`);
if (fingerprintMissing) {
  console.log("  STOP trying to answer rotation retrospectively. Neither JSON carries a fingerprint.");
}

let hypothesis;
if (!identical) hypothesis = "H1";
else if (!fingerprintMissing && false) hypothesis = "H2";
else hypothesis = "H3";

console.log("\n=== PART 3. Verdict ===");
console.log(`  H1 different prompts: ${identical ? "FALSE" : "TRUE"}`);
console.log(`  H2 same prompt, different model configuration: cannot be confirmed or denied from the artefacts`);
console.log(`  H3 same prompt, same recorded configuration, different behaviour: ${identical && configSameRecorded ? "THE REMAINING LIVE HYPOTHESIS" : "not reached"}`);

const needTail = identical && fingerprintMissing;
let tail = { skipped: true, reason: "not required" };
if (needTail || process.env.PART4 === "1") {
  tail = await maybeRunTail(liveNow, liveOrig, statementText, direction);
} else {
  console.log("\n=== PART 4 skipped (Parts 1 to 3 settled H1) ===");
}

const out = {
  a,
  b,
  blobRows,
  rec: {
    b122: { commit: recB122.commit, len: recB122.len, hash: recB122.hash },
    b134Used: { commit: recB134Used.commit, len: recB134Used.len, hash: recB134Used.hash },
    b134Tagged: { commit: recB134Tagged.commit, len: recB134Tagged.len, hash: recB134Tagged.hash },
    now: { commit: recNow.commit, len: recNow.len, hash: recNow.hash },
  },
  recorded: { len: RECORDED_LIVE_LEN, hash: RECORDED_LIVE_HASH },
  identical,
  matchesRecorded,
  configSameRecorded,
  fingerprintMissing,
  hypothesis,
  tail,
};

console.log("\n=== JSON SUMMARY ===");
console.log(JSON.stringify(out, null, 2));
console.log("\n=== END ===");
