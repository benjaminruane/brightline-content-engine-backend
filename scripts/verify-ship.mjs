#!/usr/bin/env node
/**
 * Is the work that was just done actually finished and actually on the remote.
 * Prints one verdict line. Exits 1 on the first failure.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(reason) {
  process.stdout.write(`SHIP NOT VERIFIED  ${reason}\n`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
    ...opts,
  });
}

function git(args) {
  return run("git", args);
}

const fetchResult = git(["fetch"]);
if (fetchResult.status !== 0) fail("fetch failed");

const porcelain = git(["status", "--porcelain"]);
if (porcelain.status !== 0) fail("working tree dirty");
if (String(porcelain.stdout || "").trim().length > 0) fail("working tree dirty");

const head = git(["rev-parse", "HEAD"]);
if (head.status !== 0) fail("working tree dirty");
const headSha = String(head.stdout || "").trim();

const upstream = git(["rev-parse", "@{upstream}"]);
if (upstream.status !== 0) fail("local ahead of remote");
const upstreamSha = String(upstream.stdout || "").trim();

if (headSha !== upstreamSha) {
  const counts = git(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]);
  const [aheadRaw, behindRaw] = String(counts.stdout || "")
    .trim()
    .split(/\s+/);
  const ahead = Number(aheadRaw) || 0;
  const behind = Number(behindRaw) || 0;
  if (ahead > 0) fail("local ahead of remote");
  if (behind > 0) fail("local behind remote");
  fail("local ahead of remote");
}

const tests = run("npm", ["test"]);
const testOutput = `${tests.stdout || ""}${tests.stderr || ""}`;
if (tests.status !== 0) {
  process.stdout.write(testOutput);
  if (testOutput.length > 0 && !testOutput.endsWith("\n")) process.stdout.write("\n");
  fail("tests failed");
}

const filesMatch = testOutput.match(/Test Files[^\n]*\((\d+)\)/);
const testsMatch = testOutput.match(/^\s*Tests[^\n]*\((\d+)\)/m);
const fileCount = filesMatch ? filesMatch[1] : "unknown";
const testCount = testsMatch ? testsMatch[1] : "unknown";

const short = git(["rev-parse", "--short", "HEAD"]);
const branch = git(["branch", "--show-current"]);
const sha = String(short.stdout || "").trim() || headSha.slice(0, 7);
const name = String(branch.stdout || "").trim() || "HEAD";

process.stdout.write(`SHIP VERIFIED  ${sha}  ${name}  ${fileCount} files  ${testCount} tests\n`);
process.exit(0);
