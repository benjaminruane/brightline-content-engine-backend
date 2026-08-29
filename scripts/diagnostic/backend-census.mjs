#!/usr/bin/env node
/**
 * Backend code census (read-only). Prints fenced counts for
 * scripts/diagnostic/backend-census.md. No JSON written. No deletions.
 *
 * Usage (from repo root):
 *   node scripts/diagnostic/backend-census.mjs
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "../..");

const CODE_EXT = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".css", ".html", ".sql", ".sh"]);
const SKIP_NAME = new Set(["package-lock.json"]);
const SKIP_EXT = new Set([
  ".pdf",
  ".docx",
  ".xlsx",
  ".pptx",
  ".png",
  ".svg",
  ".map",
  ".gitkeep",
  ".tmp",
  ".backup",
]);

const PRODUCT_ENTRYPOINTS = [
  "api/analyse-statements.js",
  "api/suggest-revision.js",
  "api/generate.js",
  "api/adapt.js",
  "api/rewrite.js",
  "api/extract-draft-text.js",
  "api/summarize-source.js",
  "api/summarize-rewrite-label.js",
  "api/synthesize-review.js",
  "api/constructive-feedback.js",
  "api/export.js",
  "api/review-state.js",
  "api/health.js",
  "api/query.js",
  "api/query-sources.js",
  "api/web-search.js",
  "api/fetch-url.js",
  "api/summarize-source-usage.js",
];

const DEBUG_ENTRYPOINTS = [
  "api/debug-node.js",
  "api/web-test.js",
  "api/stacktrace-test.js",
  "api/import-openai-test.js",
  "api/import-web-helper-test.js",
  "api/generate-minimal.js",
];

/** Execution-graph cuts: imported on Production but not run on the current deploy. */
const FLAG_OFF_CUTS = new Map([
  [
    "api/analyse-statements.js",
    new Set(["lib/qc/pipeline-v3/qc-pipeline-v3.mjs"]),
  ],
  [
    "api/suggest-revision.js",
    new Set(["lib/revise-stage1.mjs"]),
  ],
  [
    "lib/qc/pipeline-v4/index.mjs",
    new Set(["lib/qc/coverage-union.mjs"]),
  ],
]);

const FLAG_OFF_ROOTS = [
  "lib/qc/pipeline-v3/qc-pipeline-v3.mjs",
  "lib/revise-stage1.mjs",
  "lib/qc/coverage-union.mjs",
];

const V4_STAGE_FILES = [
  "lib/qc/pipeline-v4/stage1-extract-statements.mjs",
  "lib/qc/pipeline-v4/stage1b-extract-claim-spans.mjs",
  "lib/qc/pipeline-v4/stage2-match-sources.mjs",
  "lib/qc/pipeline-v4/stage2-match-multipassage.mjs",
  "lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs",
  "lib/qc/pipeline-v4/stage4-select-excerpts.mjs",
  "lib/qc/pipeline-v4/stage5-generate-commentary.mjs",
  "lib/qc/pipeline-v4/index.mjs",
];

function gitLsFiles() {
  const out = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT });
  return out
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function gitSha() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT }).toString("utf8").trim();
}

function duMb(rel) {
  const target = rel ? path.join(ROOT, rel) : ROOT;
  const out = execFileSync("du", ["-sk", target], { cwd: ROOT }).toString("utf8");
  const kb = Number(out.trim().split(/\s+/)[0]) || 0;
  return kb / 1024;
}

function stripJsComments(src) {
  let out = "";
  let i = 0;
  let state = "code";
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (state === "code") {
      if (c === "/" && n === "/") {
        state = "line";
        i += 2;
        continue;
      }
      if (c === "/" && n === "*") {
        state = "block";
        i += 2;
        continue;
      }
      if (c === "'" || c === '"' || c === "`") {
        state = c;
        out += c;
        i += 1;
        continue;
      }
      out += c;
      i += 1;
      continue;
    }
    if (state === "line") {
      if (c === "\n") {
        state = "code";
        out += c;
      }
      i += 1;
      continue;
    }
    if (state === "block") {
      if (c === "*" && n === "/") {
        state = "code";
        i += 2;
        continue;
      }
      if (c === "\n") out += "\n";
      i += 1;
      continue;
    }
    out += c;
    if (c === "\\" && i + 1 < src.length) {
      out += src[i + 1];
      i += 2;
      continue;
    }
    if (c === state) state = "code";
    i += 1;
  }
  return out;
}

function countLines(rel, text) {
  const rawLines = text.split(/\r?\n/);
  const raw = rawLines.length;
  const blank = rawLines.filter((ln) => !ln.trim()).length;
  const ext = path.extname(rel).toLowerCase();
  let codeLike = text;
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs" || ext === ".jsx" || ext === ".ts" || ext === ".tsx") {
    codeLike = stripJsComments(text);
  }
  const stripped = codeLike.split(/\r?\n/);
  const nonCommentNonBlank = stripped.filter((ln) => ln.trim()).length;
  return { raw, blank, nonblank: raw - blank, ncn: nonCommentNonBlank };
}

function isGenerated(rel) {
  const lower = rel.toLowerCase();
  if (lower.endsWith(".log")) return true;
  if (/scripts\/diagnostic\/.*rows\.json$/.test(lower)) return true;
  if (/scripts\/diagnostic\/.*\/corpus\.json$/.test(lower)) return true;
  if (/scripts\/diagnostic\/eval-ablation\/.*\.json$/.test(lower) && !lower.endsWith("package.json")) {
    return true;
  }
  if (/scripts\/diagnostic\/coverage-union\/.*\.json$/.test(lower)) return true;
  if (/scripts\/diagnostic\/stage2-span\/.*\.json$/.test(lower)) return true;
  if (/scripts\/diagnostic\/span-/.test(lower) && lower.endsWith(".json")) return true;
  if (/scripts\/diagnostic\/evidence-span-population\/.*\.json$/.test(lower)) return true;
  if (/scripts\/diagnostic\/backstop-needed\/corpus\.json$/.test(lower)) return true;
  if (lower === "init-audit.json") return true;
  if (/tests\/r1_2.*outputs/.test(lower)) return true;
  return false;
}

function isVendored() {
  return false;
}

function bucketDir(rel) {
  const parts = rel.split("/");
  return parts[0] || "(root)";
}

function secondLevel(rel, top) {
  const parts = rel.split("/");
  if (parts[0] !== top) return null;
  if (parts.length === 1) return `${top}/(files)`;
  return `${parts[0]}/${parts[1]}`;
}

function parseSpecifiers(text) {
  const specs = new Set();
  const reFrom = /\bfrom\s+['"]([^'"]+)['"]/g;
  const reSide = /(?:import|export)\s+['"]([^'"]+)['"]/g;
  const reDyn = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const reReq = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const reJoin = /path\.join\([^)]*['"]([^'"]+\.(?:md|js|mjs|cjs|json))['"]/g;
  let m;
  while ((m = reFrom.exec(text))) specs.add(m[1]);
  while ((m = reSide.exec(text))) specs.add(m[1]);
  while ((m = reDyn.exec(text))) specs.add(m[1]);
  while ((m = reReq.exec(text))) specs.add(m[1]);
  while ((m = reJoin.exec(text))) specs.add(m[1]);
  return [...specs];
}

function resolveSpec(fromRel, spec, trackedSet) {
  if (!spec) return null;
  if (spec.startsWith("node:") || spec.startsWith("http:") || spec.startsWith("https:")) return null;
  if (!spec.startsWith(".") && !spec.startsWith("/")) {
    if (trackedSet.has(spec)) return spec;
    return null;
  }
  const fromDir = path.posix.dirname(fromRel);
  const joined = path.posix.normalize(path.posix.join(fromDir, spec));
  const candidates = [
    joined,
    `${joined}.js`,
    `${joined}.mjs`,
    `${joined}.cjs`,
    `${joined}.json`,
    `${joined}/index.js`,
    `${joined}/index.mjs`,
    `${joined}/index.cjs`,
  ];
  if (spec.endsWith(".md") || spec.includes("prompts/")) {
    const promptGuess = path.posix.normalize(path.posix.join(fromDir, "prompts", path.posix.basename(spec)));
    candidates.push(promptGuess);
    const sibling = path.posix.normalize(path.posix.join(fromDir, spec));
    candidates.push(sibling);
  }
  for (const c of candidates) {
    if (trackedSet.has(c)) return c;
  }
  return trackedSet.has(joined) ? joined : null;
}

function bfs(starts, edges, cuts) {
  const seen = new Set();
  const q = [];
  for (const s of starts) {
    if (!s) continue;
    seen.add(s);
    q.push(s);
  }
  while (q.length) {
    const cur = q.shift();
    const blocked = cuts?.get(cur) || new Set();
    for (const nxt of edges.get(cur) || []) {
      if (blocked.has(nxt)) continue;
      if (seen.has(nxt)) continue;
      seen.add(nxt);
      q.push(nxt);
    }
  }
  return seen;
}

function isDiagnosticPath(rel) {
  return (
    rel.startsWith("scripts/") ||
    rel.startsWith("tests/") ||
    rel.startsWith("tools/") ||
    rel.startsWith("fixtures/") ||
    rel.startsWith("scratch/")
  );
}

function isAppCodePath(rel, ext) {
  if (!CODE_EXT.has(ext) && ext !== ".md") return false;
  if (rel.startsWith("tests/")) return false;
  if (rel.startsWith("docs/") || rel.startsWith("ai/")) return false;
  if (ext === ".md" && !rel.includes("/prompts/") && !rel.startsWith("lib/")) return false;
  return CODE_EXT.has(ext);
}

function fmt(n) {
  return Number(n).toLocaleString("en-US");
}

function block(title, lines) {
  const body = Array.isArray(lines) ? lines.join("\n") : String(lines);
  return `### ${title}\n\n\`\`\`\n${body}\n\`\`\`\n`;
}

const tracked = gitLsFiles();
const trackedSet = new Set(tracked);
const fileInfo = new Map();
const edges = new Map();

for (const rel of tracked) {
  const ext = path.extname(rel).toLowerCase();
  const base = path.basename(rel);
  if (SKIP_NAME.has(base) || SKIP_EXT.has(ext)) continue;
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs) || !statSync(abs).isFile()) continue;
  let text = "";
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    continue;
  }
  const counts = countLines(rel, text);
  const bytes = Buffer.byteLength(text, "utf8");
  fileInfo.set(rel, {
    rel,
    ext,
    ...counts,
    bytes,
    generated: isGenerated(rel),
    vendored: isVendored(rel),
    text,
  });
  if (CODE_EXT.has(ext) || ext === ".md") {
    const dests = [];
    for (const spec of parseSpecifiers(text)) {
      const resolved = resolveSpec(rel, spec, trackedSet);
      if (resolved && resolved !== rel) dests.push(resolved);
    }
    edges.set(rel, dests);
  }
}

const liveSet = bfs(PRODUCT_ENTRYPOINTS, edges, FLAG_OFF_CUTS);
for (const promptRel of [
  "lib/qc/pipeline-v4/prompts/stage2_v4.md",
  "lib/qc/pipeline-v4/prompts/stage2_v4_span_elicit.md",
  "lib/qc/pipeline-v4/prompts/stage2_v4_multipassage.md",
  "lib/qc/pipeline-v4/prompts/stage1b_v1.md",
  "lib/qc/pipeline-v4/prompts/stage5_v2.md",
]) {
  liveSet.add(promptRel);
}
const debugSet = bfs(DEBUG_ENTRYPOINTS, edges, null);
const flagOffSet = bfs(FLAG_OFF_ROOTS, edges, null);
for (const f of FLAG_OFF_ROOTS) flagOffSet.add(f);

const classes = new Map();
function setClass(rel, cls) {
  classes.set(rel, cls);
}

for (const rel of fileInfo.keys()) {
  if (isDiagnosticPath(rel)) {
    setClass(rel, "DIAGNOSTIC");
    continue;
  }
  if (liveSet.has(rel)) {
    setClass(rel, "LIVE");
    continue;
  }
  if (flagOffSet.has(rel) && !liveSet.has(rel)) {
    setClass(rel, "FLAG_OFF");
    continue;
  }
  const ext = path.extname(rel).toLowerCase();
  if (CODE_EXT.has(ext) || (ext === ".md" && rel.includes("/prompts/"))) {
    setClass(rel, "ORPHAN");
    continue;
  }
  if (debugSet.has(rel) && !liveSet.has(rel)) {
    setClass(rel, "LIVE");
    continue;
  }
  setClass(rel, "OTHER");
}

for (const rel of DEBUG_ENTRYPOINTS) {
  if (fileInfo.has(rel)) setClass(rel, "LIVE");
}

const byTop = new Map();
const byLib2 = new Map();
const byScripts2 = new Map();
function addDir(map, key, info) {
  if (!map.has(key)) map.set(key, { files: 0, raw: 0, nonblank: 0, ncn: 0 });
  const row = map.get(key);
  row.files += 1;
  row.raw += info.raw;
  row.nonblank += info.nonblank;
  row.ncn += info.ncn;
}

for (const info of fileInfo.values()) {
  addDir(byTop, bucketDir(info.rel), info);
  const lib2 = secondLevel(info.rel, "lib");
  if (lib2) addDir(byLib2, lib2, info);
  const sc2 = secondLevel(info.rel, "scripts");
  if (sc2) addDir(byScripts2, sc2, info);
}

function dirLines(map) {
  return [...map.entries()]
    .sort((a, b) => b[1].raw - a[1].raw)
    .map(
      ([k, v]) =>
        `${k.padEnd(28)} files=${String(v.files).padStart(4)}  raw=${fmt(v.raw).padStart(8)}  nonblank=${fmt(v.nonblank).padStart(8)}  noncomment_nonblank=${fmt(v.ncn).padStart(8)}`
    );
}

const largest = [...fileInfo.values()].sort((a, b) => b.raw - a.raw);
const over2k = largest.filter((f) => f.raw > 2000);

const handwritten = { files: 0, raw: 0 };
const generated = { files: 0, raw: 0 };
for (const info of fileInfo.values()) {
  if (info.generated) {
    generated.files += 1;
    generated.raw += info.raw;
  } else {
    handwritten.files += 1;
    handwritten.raw += info.raw;
  }
}

function classTotals(kind) {
  let files = 0;
  let raw = 0;
  let ncn = 0;
  const codeFiles = [];
  for (const [rel, cls] of classes) {
    if (cls !== kind) continue;
    const info = fileInfo.get(rel);
    if (!info) continue;
    const ext = info.ext;
    const countIt = CODE_EXT.has(ext) || (ext === ".md" && rel.includes("/prompts/"));
    if (!countIt) continue;
    files += 1;
    raw += info.raw;
    ncn += info.ncn;
    codeFiles.push(info);
  }
  return { files, raw, ncn, codeFiles };
}

const liveTot = classTotals("LIVE");
const flagTot = classTotals("FLAG_OFF");
const diagTot = classTotals("DIAGNOSTIC");
const orphanTot = classTotals("ORPHAN");

const appCodeFiles = [...fileInfo.values()].filter((f) => isAppCodePath(f.rel, f.ext) && !f.rel.startsWith("scripts/") && !f.rel.startsWith("tools/"));
const scriptCodeFiles = [...fileInfo.values()].filter(
  (f) => f.rel.startsWith("scripts/") && CODE_EXT.has(f.ext)
);
const testCodeFiles = [...fileInfo.values()].filter(
  (f) => f.rel.startsWith("tests/") && CODE_EXT.has(f.ext)
);
const sumRaw = (arr) => arr.reduce((s, f) => s + f.raw, 0);

const importers = new Map();
for (const [from, dests] of edges) {
  for (const d of dests) {
    if (!importers.has(d)) importers.set(d, new Set());
    importers.get(d).add(from);
  }
}

function importerList(rel) {
  const set = importers.get(rel) || new Set();
  return [...set].sort();
}

const v3Files = [...fileInfo.values()].filter((f) => f.rel.startsWith("lib/qc/pipeline-v3/"));
const v3Live = v3Files.filter((f) => f.rel.endsWith("stage7-assemble-card.mjs"));
const v3Rest = v3Files.filter((f) => !f.rel.endsWith("stage7-assemble-card.mjs"));

const diagJson = [...fileInfo.values()].filter(
  (f) => f.rel.startsWith("scripts/diagnostic/") && f.ext === ".json"
);
const jsonBySub = new Map();
for (const f of diagJson) {
  const parts = f.rel.split("/");
  const sub = parts.length >= 4 ? `${parts[0]}/${parts[1]}/${parts[2]}` : path.posix.dirname(f.rel);
  if (!jsonBySub.has(sub)) jsonBySub.set(sub, { files: 0, raw: 0, bytes: 0 });
  const row = jsonBySub.get(sub);
  row.files += 1;
  row.raw += f.raw;
  row.bytes += f.bytes;
}

const testByLib2 = new Map();
for (const t of testCodeFiles) {
  const dests = edges.get(t.rel) || [];
  const libHits = dests.filter((d) => d.startsWith("lib/"));
  const keys = new Set();
  for (const d of libHits) {
    const sl = secondLevel(d, "lib");
    if (sl) keys.add(sl);
  }
  if (keys.size === 0) keys.add("lib/(unmapped)");
  for (const k of keys) {
    if (!testByLib2.has(k)) testByLib2.set(k, { testLines: 0, tests: 0 });
    const row = testByLib2.get(k);
    row.testLines += t.raw;
    row.tests += 1;
  }
}

const lib2App = new Map();
for (const f of appCodeFiles) {
  const sl = secondLevel(f.rel, "lib");
  if (!sl) continue;
  if (!lib2App.has(sl)) lib2App.set(sl, { app: 0, files: 0 });
  lib2App.get(sl).app += f.raw;
  lib2App.get(sl).files += 1;
}

const stageDirectTests = V4_STAGE_FILES.map((stage) => {
  const tests = [];
  for (const t of testCodeFiles) {
    const dests = edges.get(t.rel) || [];
    if (dests.includes(stage)) tests.push(t.rel);
  }
  return { stage, tests, lines: fileInfo.get(stage)?.raw || 0 };
});

const writers = [];
for (const info of fileInfo.values()) {
  if (!info.rel.startsWith("scripts/")) continue;
  if (!CODE_EXT.has(info.ext)) continue;
  if (!/writeFile|writeFileSync/.test(info.text)) continue;
  const trackedWrites = [];
  const re = /["'`]([^"'`]+\.(?:json|md|log|txt))["'`]/g;
  let m;
  while ((m = re.exec(info.text))) {
    const guess = m[1];
    if (guess.includes("${") || guess.startsWith("http")) continue;
    const norm = guess.replace(/^\.\//, "");
    const candidates = [
      norm,
      path.posix.normalize(path.posix.join(path.posix.dirname(info.rel), guess)),
    ];
    for (const c of candidates) {
      if (trackedSet.has(c) && (c.endsWith(".json") || c.endsWith(".md"))) {
        trackedWrites.push(c);
      }
    }
  }
  if (trackedWrites.length) {
    writers.push({ script: info.rel, writes: [...new Set(trackedWrites)].sort() });
  }
}

const sha = gitSha();
const repoMb = duMb("");
const gitMb = duMb(".git");
const trackedDataLines = [...fileInfo.values()]
  .filter((f) => f.ext === ".json" || f.ext === ".txt" || f.ext === ".csv" || f.ext === ".tsv" || f.ext === ".log")
  .reduce((s, f) => s + f.raw, 0);

const sections = [];

sections.push(
  block(
    "1.1 top-level directories",
    dirLines(byTop)
  )
);
sections.push(block("1.1 lib/ second level", dirLines(byLib2)));
sections.push(block("1.1 scripts/ second level", dirLines(byScripts2)));

sections.push(
  block(
    "1.1 code vs diagnostic split (this is what the 94k mixed)",
    [
      `api+lib+helpers+utils app code files     ${appCodeFiles.length}  raw=${fmt(sumRaw(appCodeFiles))}`,
      `scripts/ code files                      ${scriptCodeFiles.length}  raw=${fmt(sumRaw(scriptCodeFiles))}`,
      `tests/ code files                        ${testCodeFiles.length}  raw=${fmt(sumRaw(testCodeFiles))}`,
    ]
  )
);

sections.push(
  block(
    "1.2 30 largest tracked text files",
    largest.slice(0, 30).map((f, i) => {
      const cls = classes.get(f.rel) || "OTHER";
      return `${String(i + 1).padStart(2)}. ${fmt(f.raw).padStart(7)}  ${cls.padEnd(11)}  ${f.rel}`;
    })
  )
);

sections.push(
  block(
    "1.3 files over 2000 lines",
    over2k.map((f) => `${fmt(f.raw).padStart(7)}  ${classes.get(f.rel) || "OTHER"}  ${f.rel}`)
  )
);

sections.push(
  block("1.4 handwritten vs generated (rule in report)", [
    `handwritten  files=${handwritten.files}  raw=${fmt(handwritten.raw)}`,
    `generated    files=${generated.files}  raw=${fmt(generated.raw)}`,
    `vendored     files=0  raw=0`,
  ])
);

sections.push(
  block("2 entrypoints (product)", PRODUCT_ENTRYPOINTS)
);
sections.push(block("2 entrypoints (debug, still deployed)", DEBUG_ENTRYPOINTS));
sections.push(
  block("2 FLAG_OFF cuts (not followed for LIVE)", [
    "api/analyse-statements.js  ->  lib/qc/pipeline-v3/qc-pipeline-v3.mjs   [QC_PIPELINE_V4=1 in Production]",
    "api/suggest-revision.js    ->  lib/revise-stage1.mjs                  [perStatementRevise, frontend never sends]",
    "lib/qc/pipeline-v4/index.mjs -> lib/qc/coverage-union.mjs             [QC_MULTISOURCE_COVERAGE unset, default OFF]",
  ])
);

sections.push(
  block("2 class totals (code + pipeline prompts only)", [
    `LIVE        files=${String(liveTot.files).padStart(4)}  raw=${fmt(liveTot.raw).padStart(8)}  ncn=${fmt(liveTot.ncn).padStart(8)}`,
    `FLAG_OFF    files=${String(flagTot.files).padStart(4)}  raw=${fmt(flagTot.raw).padStart(8)}  ncn=${fmt(flagTot.ncn).padStart(8)}`,
    `DIAGNOSTIC  files=${String(diagTot.files).padStart(4)}  raw=${fmt(diagTot.raw).padStart(8)}  ncn=${fmt(diagTot.ncn).padStart(8)}`,
    `ORPHAN      files=${String(orphanTot.files).padStart(4)}  raw=${fmt(orphanTot.raw).padStart(8)}  ncn=${fmt(orphanTot.ncn).padStart(8)}`,
  ])
);

sections.push(
  block(
    "2 LIVE files",
    liveTot.codeFiles.sort((a, b) => b.raw - a.raw).map((f) => `${fmt(f.raw).padStart(6)}  ${f.rel}`)
  )
);
sections.push(
  block(
    "2 FLAG_OFF files",
    flagTot.codeFiles.sort((a, b) => b.raw - a.raw).map((f) => `${fmt(f.raw).padStart(6)}  ${f.rel}`)
  )
);
sections.push(
  block(
    "2 ORPHAN code files",
    orphanTot.codeFiles.sort((a, b) => b.raw - a.raw).map((f) => `${fmt(f.raw).padStart(6)}  ${f.rel}`)
  )
);

sections.push(
  block("3a pipeline-v3", [
    `all pipeline-v3          files=${v3Files.length}  raw=${fmt(sumRaw(v3Files))}`,
    `live (stage7 assemble)   files=${v3Live.length}  raw=${fmt(sumRaw(v3Live))}`,
    `flag-off rest            files=${v3Rest.length}  raw=${fmt(sumRaw(v3Rest))}`,
    "",
    "per file:",
    ...v3Files
      .sort((a, b) => b.raw - a.raw)
      .map((f) => `${fmt(f.raw).padStart(6)}  ${classes.get(f.rel)}  ${f.rel}`),
    "",
    "importers of qc-pipeline-v3.mjs:",
    ...(importerList("lib/qc/pipeline-v3/qc-pipeline-v3.mjs").length
      ? importerList("lib/qc/pipeline-v3/qc-pipeline-v3.mjs")
      : ["(none)"]),
    "",
    "importers of stage7-assemble-card.mjs:",
    ...importerList("lib/qc/pipeline-v3/stage7-assemble-card.mjs"),
  ])
);

const named = [
  ["3b deterministic removal", "lib/pr9-deterministic-unsupported-removal.mjs"],
  ["3c per-statement revision", "lib/revise-stage1.mjs"],
  ["3c prompt", "lib/revise-stage1-prompt.mjs"],
  ["3d coverage union", "lib/qc/coverage-union.mjs"],
  ["3e/f claim spans helpers", "lib/qc/claim-spans.mjs"],
  ["3f stage1b", "lib/qc/pipeline-v4/stage1b-extract-claim-spans.mjs"],
];
for (const [label, rel] of named) {
  const info = fileInfo.get(rel);
  sections.push(
    block(label, [
      `path=${rel}`,
      `raw=${info ? fmt(info.raw) : "MISSING"}  class=${classes.get(rel) || "n/a"}`,
      "importers:",
      ...(importerList(rel).length ? importerList(rel) : ["(none)"]),
    ])
  );
}

sections.push(
  block(
    "3g parallel stage implementations (v3 vs v4 same stage name)",
    [
      "v3 stage1  lib/qc/pipeline-v3/stage1-extract-statements.mjs",
      "v4 stage1  lib/qc/pipeline-v4/stage1-extract-statements.mjs",
      "v3 stage2  lib/qc/pipeline-v3/stage2-match-sources.mjs",
      "v4 stage2  lib/qc/pipeline-v4/stage2-match-sources.mjs",
      "v4 extra   lib/qc/pipeline-v4/stage2-match-multipassage.mjs",
      "v3 stage3  lib/qc/pipeline-v3/stage3-aggregate-verdict.mjs",
      "v4 stage3  lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs",
      "v3 stage4  lib/qc/pipeline-v3/stage4-select-excerpts.mjs",
      "v4 stage4  lib/qc/pipeline-v4/stage4-select-excerpts.mjs",
      "v3 stage5  lib/qc/pipeline-v3/stage5-generate-commentary.mjs",
      "v4 stage5  lib/qc/pipeline-v4/stage5-generate-commentary.mjs  (reads prompts/stage5_v2.md)",
      "v4 unused  lib/qc/pipeline-v4/prompts/stage5_v1.md",
      "v4 unused  lib/qc/pipeline-v4/prompts/stage2_v4_multipassage_shadow.md  (diagnostic only)",
      "shared     lib/qc/pipeline-v3/stage7-assemble-card.mjs  (live from v4)",
      "legacy     lib/extract-statements.mjs  (deterministic fallback, live from v4 stage1)",
    ].map((line) => {
      const m = line.match(/(\S+\.(?:mjs|md|js))$/);
      if (!m) return line;
      const info = fileInfo.get(m[1]);
      const cls = classes.get(m[1]) || "";
      return info ? `${line}  raw=${fmt(info.raw)}  ${cls}` : line;
    })
  )
);

sections.push(
  block(
    "4.1 test lines vs app lines by lib/ second level",
    [...new Set([...lib2App.keys(), ...testByLib2.keys()])]
      .sort()
      .map((k) => {
        const app = lib2App.get(k)?.app || 0;
        const tests = testByLib2.get(k)?.testLines || 0;
        const ratio = app ? (tests / app).toFixed(3) : "n/a";
        return `${k.padEnd(28)} app=${fmt(app).padStart(7)}  test_ref=${fmt(tests).padStart(7)}  test/app=${ratio}`;
      })
  )
);

sections.push(
  block(
    "4.2 pipeline-v4 stages, direct test importers",
    stageDirectTests.map((s) => {
      const list = s.tests.length ? s.tests.join(", ") : "(none)";
      return `${s.stage}  raw=${fmt(s.lines)}  tests=${list}`;
    })
  )
);

sections.push(
  block(
    "5.1 tracked JSON under scripts/diagnostic/ by subdirectory",
    [
      `TOTAL files=${diagJson.length}  raw=${fmt(sumRaw(diagJson))}  bytes=${fmt(diagJson.reduce((s, f) => s + f.bytes, 0))}`,
      "",
      ...[...jsonBySub.entries()]
        .sort((a, b) => b[1].raw - a[1].raw)
        .map(
          ([k, v]) =>
            `${k.padEnd(48)} files=${String(v.files).padStart(3)}  raw=${fmt(v.raw).padStart(8)}  bytes=${fmt(v.bytes).padStart(10)}`
        ),
    ]
  )
);

sections.push(
  block(
    "5.1 each tracked diagnostic JSON file",
    diagJson
      .sort((a, b) => b.raw - a.raw)
      .map((f) => `${fmt(f.raw).padStart(7)}  ${fmt(f.bytes).padStart(9)}B  ${f.rel}`)
  )
);

sections.push(
  block("5.3 sizes", [
    `repo_on_disk_mb=${repoMb.toFixed(1)}`,
    `dot_git_mb=${gitMb.toFixed(1)}`,
  ])
);

sections.push(
  block(
    "5.4 scripts that write to tracked json/md paths (string literals that match git ls-files)",
    writers.length
      ? writers.map((w) => `${w.script}\n  ${w.writes.join("\n  ")}`)
      : ["(none matched by literal path)"]
  )
);

sections.push(
  block("7 slope line inputs", [
    `date=${new Date().toISOString().slice(0, 10)}`,
    `sha=${sha}`,
    `app_lines=${sumRaw(appCodeFiles)}`,
    `test_lines=${sumRaw(testCodeFiles)}`,
    `tracked_data_lines=${trackedDataLines}`,
    `repo_mb=${repoMb.toFixed(1)}`,
  ])
);

process.stdout.write(sections.join("\n"));
process.stdout.write("\n");
