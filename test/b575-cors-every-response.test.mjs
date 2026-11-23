/**
 * B575. Every API route sends CORS headers on a forced 404 and a forced 500.
 */
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "vitest";

const API_DIR = new URL("../api/", import.meta.url);
const ORIGIN = "https://brightline-content-engine-frontend.vercel.app";

function routeFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "_lib") continue;
      routeFiles(full, out);
    } else if (name.endsWith(".js")) {
      out.push(full);
    }
  }
  return out.sort();
}

function createRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    headersSent: false,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    getHeader(name) {
      return this.headers[name];
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
    end() {
      this.headersSent = true;
      return this;
    },
  };
}

const files = routeFiles(fileURLToPath(API_DIR));
assert.ok(files.length >= 30, `route list is short: ${files.length}`);

for (const file of files) {
  const label = path.relative(fileURLToPath(API_DIR), file);
  test(`CORS headers on 404 and 500 for ${label}`, async () => {
    const mod = await import(pathToFileURL(file).href);
    assert.equal(typeof mod.default, "function");
    for (const status of ["404", "500"]) {
      const res = createRes();
      await mod.default({
        method: "GET",
        headers: {
          origin: ORIGIN,
          "x-brightline-force-status": status,
        },
      }, res);
      assert.equal(res.statusCode, Number(status));
      assert.equal(res.headers["Access-Control-Allow-Origin"], ORIGIN);
      assert.match(String(res.headers["Access-Control-Allow-Methods"] || ""), /OPTIONS/);
      assert.match(String(res.headers["Access-Control-Allow-Headers"] || ""), /Authorization/);
    }
  });
}
