#!/usr/bin/env node
/**
 * A3.9.28: Repo scan for init-like surfaces in statement analysis code.
 * Outputs a deterministic JSON inventory (stdout or --out <path>).
 * No parser dependency; heuristic regex scan only.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const DIRS = ["lib", "api"];
const EXTENSIONS = [".mjs", ".js", ".cjs"];

const RE_INIT_FUNCTION = /(function|const|let)\s+([A-Za-z0-9_]*init[A-Za-z0-9_]*)/gi;
const RE_INIT_TAG = /\[A3\.[0-9.]+\]\[(INIT|HELPERS_INIT|MODULE_SCOPE|POST_HOOK|IMPL_EXPORT_SCAN|TASK_LIB_)/gi;
const RE_SET_IMPL_UTILS = /setImplUtils\s*\(/g;
const RE_TRY_BLOCK = /\btry\s*\{/g;
const RE_ENV_REF = /process\.env\.([A-Z0-9_]+)/g;

function* walkDir(dir, base = "") {
  const full = path.join(repoRoot, base, dir);
  if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) return;
  const entries = fs.readdirSync(full, { withFileTypes: true });
  for (const e of entries) {
    const rel = path.join(base, dir, e.name);
    if (e.isDirectory()) {
      yield* walkDir(e.name, path.join(base, dir));
    } else if (e.isFile() && EXTENSIONS.some(ext => e.name.endsWith(ext))) {
      yield rel;
    }
  }
}

function collectFiles() {
  const files = [];
  for (const d of DIRS) {
    if (!fs.existsSync(path.join(repoRoot, d))) continue;
    for (const rel of walkDir(d, "")) {
      files.push(rel);
    }
  }
  return files.sort();
}

function scanFile(relPath) {
  const fullPath = path.join(repoRoot, relPath);
  let content;
  try {
    content = fs.readFileSync(fullPath, "utf8");
  } catch (e) {
    return { path: relPath, error: e.message, sizeBytes: 0, initFunctionDefs: [], initTags: [], wiringCalls: [], tryBlocks: [], envRefs: [] };
  }
  const sizeBytes = Buffer.byteLength(content, "utf8");
  const lines = content.split("\n");

  const initFunctionDefs = [];
  let m;
  RE_INIT_FUNCTION.lastIndex = 0;
  while ((m = RE_INIT_FUNCTION.exec(content)) !== null) {
    const lineNum = content.slice(0, m.index).split("\n").length;
    initFunctionDefs.push({ name: (m[2] || "").trim() || m[0], line: lineNum });
  }

  const initTags = [];
  RE_INIT_TAG.lastIndex = 0;
  while ((m = RE_INIT_TAG.exec(content)) !== null) {
    const lineNum = content.slice(0, m.index).split("\n").length;
    const tag = m[1] || "INIT";
    if (!initTags.some(t => t.tag === tag && t.line === lineNum)) {
      initTags.push({ tag, line: lineNum });
    }
  }

  const wiringCalls = [];
  RE_SET_IMPL_UTILS.lastIndex = 0;
  while ((m = RE_SET_IMPL_UTILS.exec(content)) !== null) {
    const lineNum = content.slice(0, m.index).split("\n").length;
    wiringCalls.push({ kind: "setImplUtils", line: lineNum });
  }

  const tryBlocks = [];
  RE_TRY_BLOCK.lastIndex = 0;
  while ((m = RE_TRY_BLOCK.exec(content)) !== null) {
    const lineNum = content.slice(0, m.index).split("\n").length;
    tryBlocks.push({ line: lineNum });
  }

  const envRefs = [];
  RE_ENV_REF.lastIndex = 0;
  while ((m = RE_ENV_REF.exec(content)) !== null) {
    const lineNum = content.slice(0, m.index).split("\n").length;
    const key = m[1] || "";
    if (!envRefs.some(r => r.key === key && r.line === lineNum)) {
      envRefs.push({ key, line: lineNum });
    }
  }

  return {
    path: relPath,
    sizeBytes,
    initFunctionDefs,
    initTags,
    wiringCalls,
    tryBlocks,
    envRefs
  };
}

function run() {
  const files = collectFiles();
  const findings = files.map(rel => scanFile(rel));

  let initFunctionCount = 0;
  let filesWithInitTags = 0;
  let filesWithSetImplUtils = 0;
  let filesWithTryBlocks = 0;
  const scoreByPath = new Map();

  for (const f of findings) {
    initFunctionCount += (f.initFunctionDefs || []).length;
    if ((f.initTags || []).length > 0) filesWithInitTags += 1;
    if ((f.wiringCalls || []).length > 0) filesWithSetImplUtils += 1;
    if ((f.tryBlocks || []).length > 0) filesWithTryBlocks += 1;
    const score = (f.initFunctionDefs?.length || 0) + (f.initTags?.length || 0) * 2 + (f.wiringCalls?.length || 0) * 3 + (f.tryBlocks?.length || 0) + (f.envRefs?.length || 0);
    scoreByPath.set(f.path, score);
  }

  const topFilesByFindings = [...scoreByPath.entries()]
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([p, score]) => ({ path: p, score }));

  const report = {
    generatedAtIso: new Date().toISOString(),
    filesScanned: files.length,
    findings,
    summary: {
      initFunctionCount,
      filesWithInitTags,
      filesWithSetImplUtils,
      filesWithTryBlocks,
      topFilesByFindings
    }
  };

  const outPath = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : null;
  const json = JSON.stringify(report, null, 2);
  if (outPath) {
    fs.writeFileSync(outPath, json, "utf8");
    console.error(`Wrote ${outPath}`);
  } else {
    console.log(json);
  }
}

run();
