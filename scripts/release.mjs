#!/usr/bin/env node
/**
 * Fast-forward the release branch to main and tag v<version>.
 * Refuses a dirty tree, unpushed main, a non-fast-forward, or a VERSION file
 * that is not that number.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function releaseRefusals({
  dirty,
  onMain,
  head,
  originMain,
  releaseExists,
  releaseIsAncestor,
  versionFileMatches,
}) {
  const reasons = [];
  if (dirty) reasons.push("dirty tree");
  if (!onMain) reasons.push("not on main");
  if (onMain && head && originMain && head !== originMain) reasons.push("unpushed main");
  if (releaseExists && !releaseIsAncestor) reasons.push("not a fast-forward");
  if (versionFileMatches === false) reasons.push("VERSION does not match");
  return reasons;
}

function fail(message) {
  process.stderr.write(`release: ${message}\n`);
  process.exit(1);
}

function git(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) {
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    fail(output || `git ${args.join(" ")} failed`);
  }
  return String(result.stdout || "").trim();
}

function main() {
  const version = String(process.argv[2] || "").trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) fail("pass a version like 0.9.0");

  const fetch = spawnSync("git", ["fetch", "origin"], { cwd: ROOT, encoding: "utf8" });
  if (fetch.status !== 0) fail("could not fetch origin");

  const porcelain = git(["status", "--porcelain"]);
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const head = git(["rev-parse", "HEAD"]);
  const originMain = git(["rev-parse", "origin/main"]);
  const releaseProbe = spawnSync("git", ["rev-parse", "--verify", "origin/release"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const releaseExists = releaseProbe.status === 0;
  const releaseIsAncestor = releaseExists
    ? spawnSync("git", ["merge-base", "--is-ancestor", "origin/release", "HEAD"], { cwd: ROOT }).status === 0
    : true;
  const versionFile = readFileSync(path.join(ROOT, "VERSION"), "utf8").trim();
  const reasons = releaseRefusals({
    dirty: porcelain.length > 0,
    onMain: branch === "main",
    head,
    originMain,
    releaseExists,
    releaseIsAncestor,
    versionFileMatches: versionFile === version,
  });
  if (reasons.length > 0) fail(reasons.join("; "));

  const ship = spawnSync("npm", ["run", "verify:ship"], { cwd: ROOT, stdio: "inherit" });
  if (ship.status !== 0) process.exit(ship.status || 1);

  git(["push", "origin", "HEAD:release"]);
  const tag = `v${version}`;
  const existing = spawnSync("git", ["rev-parse", "--verify", `refs/tags/${tag}`], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (existing.status === 0) fail(`${tag} already exists`);
  git(["tag", tag]);
  git(["push", "origin", tag]);
  const sha = git(["rev-parse", "HEAD"]);
  process.stdout.write(`RELEASED ${tag} ${sha}\n`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
