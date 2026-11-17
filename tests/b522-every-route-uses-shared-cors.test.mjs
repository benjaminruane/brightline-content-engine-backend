import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "vitest";

const ORIGIN = "https://brightline-content-engine-frontend.vercel.app";
const HEADER = "Access-Control-Allow-Origin";
const HELPER = path.normalize("lib/http/frontend-origins.mjs");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(?:js|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

test("no route or library hard-codes an origin or sets Allow-Origin itself", () => {
  const files = [...walk("api"), ...walk("lib")];
  for (const file of files) {
    if (path.normalize(file) === HELPER) continue;
    const text = readFileSync(file, "utf8");
    assert.equal(text.includes(ORIGIN), false, file);
    assert.equal(text.includes(HEADER), false, file);
    assert.equal(text.includes('headers.origin || "*"'), false, file);
  }
});

test("every api route except the cron uses the shared helper", () => {
  const routes = readdirSync("api").filter((name) => name.endsWith(".js"));
  for (const name of routes) {
    const text = readFileSync(path.join("api", name), "utf8");
    assert.equal(text.includes("applyCors("), true, name);
  }
  const cron = readFileSync("api/cron/langfuse-retention.js", "utf8");
  assert.equal(cron.includes("applyCors"), false);
  assert.equal(cron.includes("CRON_SECRET") || cron.includes("authorized"), true);
});
