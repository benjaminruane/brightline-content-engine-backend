#!/usr/bin/env node
/**
 * B384. Token delta between two revisions of the direct PDF extractor.
 *
 *   node scripts/diagnostic/b384/token-delta.mjs [beforeRev] [afterRev]
 *
 * Defaults: HEAD~1 and HEAD. Loads lib/extract-pdf-direct.mjs from each
 * revision with git show, into a temp directory whose node_modules is the
 * repo's, and extracts every PDF under the repo except node_modules.
 * Basenames that collide keep the first path in sorted order.
 * No model calls. Does not edit the working tree.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

function tokensOf(text) {
  return String(text).split(/\s+/).filter(Boolean);
}

async function walkPdfs(dir, out) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name === "node_modules" || ent.name === ".git") continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) await walkPdfs(full, out);
    else if (ent.name.toLowerCase().endsWith(".pdf")) out.push(full);
  }
}

async function loadExtractor(rev) {
  const { stdout } = await execFileAsync("git", ["show", `${rev}:lib/extract-pdf-direct.mjs`], {
    cwd: ROOT,
    maxBuffer: 10 * 1024 * 1024,
    encoding: "utf8",
  });
  const dir = path.join(tmpdir(), `b384-${rev.replace(/[^A-Za-z0-9._-]/g, "_")}-${process.pid}`);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "extract-pdf-direct.mjs");
  await writeFile(file, stdout);
  const modules = path.join(dir, "node_modules");
  try {
    await symlink(path.join(ROOT, "node_modules"), modules);
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }
  const mod = await import(pathToFileURL(file).href);
  if (typeof mod.extractPdfDirect !== "function") {
    throw new Error(`${rev} does not export extractPdfDirect`);
  }
  return mod.extractPdfDirect;
}

async function main() {
  const beforeRev = process.argv[2] || "HEAD~1";
  const afterRev = process.argv[3] || "HEAD";
  const pdfs = [];
  await walkPdfs(ROOT, pdfs);
  pdfs.sort();
  const byBase = new Map();
  const skipped = [];
  for (const filePath of pdfs) {
    const base = path.basename(filePath);
    if (byBase.has(base)) skipped.push(`${base} kept ${byBase.get(base)} skipped ${filePath}`);
    else byBase.set(base, filePath);
  }

  const extractBefore = await loadExtractor(beforeRev);
  const extractAfter = await loadExtractor(afterRev);
  const novel = [];
  let changed = 0;
  const files = [...byBase.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [name, filePath] of files) {
    const buf = await readFile(filePath);
    const beforeText = (await extractBefore(buf)).text;
    const afterText = (await extractAfter(buf)).text;
    const beforeTokens = tokensOf(beforeText);
    const afterTokens = tokensOf(afterText);
    const beforeSet = new Set(beforeTokens);
    const seen = new Set();
    const added = [];
    for (const tok of afterTokens) {
      if (beforeSet.has(tok) || seen.has(tok)) continue;
      seen.add(tok);
      added.push(tok);
      novel.push({ name, tok, len: tok.length });
    }
    if (beforeText !== afterText) changed += 1;
    console.log(`FILE ${name} before=${beforeTokens.length} after=${afterTokens.length}`);
    for (const tok of added) console.log(`  + ${tok}`);
  }
  novel.sort((a, b) => b.len - a.len || a.tok.localeCompare(b.tok) || a.name.localeCompare(b.name));
  console.log("NEW TOKENS");
  for (const row of novel) console.log(`${row.len}\t${row.name}\t${row.tok}`);
  const distinct = new Set(novel.map((row) => row.tok));
  console.log(
    `SUMMARY pdfs=${files.length} changed=${changed} newTokenRows=${novel.length} distinctNewTokens=${distinct.size} skippedBasenames=${skipped.length}`
  );
  for (const line of skipped) console.log(`SKIP ${line}`);
  console.log(`REVS ${beforeRev} ${afterRev}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
