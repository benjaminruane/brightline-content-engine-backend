import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

/**
 * THE GUARD.
 *
 * Six places treating the configured authoring organisation as an outside party
 * arrived by accident in three months (a5be4f0 x2, 2528a32, b55ab00 x3). Every
 * one of them started as a Title-Case regex written without the question being
 * asked. The seventh will too, so this asks the question automatically.
 *
 * A file under lib/ that matches names by shape must do one of two things:
 *
 *   1. call isAuthoringOrganisationName, so the author is recognised, or
 *   2. carry an AUTHOR-NAME-BLIND declaration saying why treating the author
 *      like any other name is correct there
 *
 * The declaration is deliberately a sentence rather than a bare marker. The
 * point is not to silence the check; it is to make the next person write down
 * the reasoning that was missing the first six times.
 *
 * Scope is file-level on purpose. Tracking which regex belongs to which function
 * would make this precise and brittle, and a nuisance guard gets deleted.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.join(__dirname, "..", "lib");

/** A regex literal that classifies text by Title-Case or proper-noun shape. */
const NAME_SHAPED_REGEX = /\/[^/\n]*\[A-Z\]\[a-z(?:A-Z)?[^/\n]*\/[gimsuy]*/;

const DECLARATION = "AUTHOR-NAME-BLIND:";
const AUTHOR_AWARE = ["isAuthoringOrganisationName", "resolveAuthoringOrganisationName"];

/** The resolver's own home, and the modules that define the primitive. */
const EXEMPT_FILES = new Set(["qc/first-person-actor.mjs"]);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      yield* walk(full);
      continue;
    }
    if (!/\.(mjs|js|cjs)$/.test(entry.name)) continue;
    if (/\.(tmp|backup)$/.test(entry.name) || /\.mjs\.(tmp|backup)$/.test(full)) continue;
    yield full;
  }
}

async function offenders() {
  const found = [];
  for await (const file of walk(LIB)) {
    const rel = path.relative(LIB, file);
    if (EXEMPT_FILES.has(rel)) continue;
    const text = await readFile(file, "utf8");

    const lines = text.split("\n");
    const hits = [];
    for (let i = 0; i < lines.length; i++) {
      // Skip comment lines: a regex quoted in prose is documentation, not logic.
      const line = lines[i];
      if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) continue;
      if (NAME_SHAPED_REGEX.test(line)) hits.push({ line: i + 1, text: line.trim().slice(0, 100) });
    }
    if (hits.length === 0) continue;
    if (AUTHOR_AWARE.some((sig) => text.includes(sig))) continue;
    if (text.includes(DECLARATION)) continue;
    found.push({ file: rel, hits });
  }
  return found;
}

describe("author name-blindness guard", () => {
  test("every name-shaped regex under lib/ is author-aware or declared name-blind", async () => {
    const found = await offenders();
    const report = found
      .map((f) => `  ${f.file}\n${f.hits.map((h) => `    line ${h.line}: ${h.text}`).join("\n")}`)
      .join("\n");
    assert.equal(
      found.length,
      0,
      `${found.length} file(s) match names by shape without recognising the authoring organisation.\n` +
        `Either call ${AUTHOR_AWARE[0]}, or add a comment beginning "${DECLARATION}" saying why the ` +
        `author should be treated like any other name here.\n\n${report}`
    );
  });

  test("the guard actually detects an undeclared name-shaped regex", () => {
    // Guards that cannot fail are decoration. This proves the matcher fires.
    assert.equal(NAME_SHAPED_REGEX.test('const RE = /\\b[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,3}\\b/g;'), true);
    assert.equal(NAME_SHAPED_REGEX.test('const RE = /\\b[A-Z][a-zA-Z0-9&\'-]+\\b/g;'), true);
    assert.equal(NAME_SHAPED_REGEX.test("const n = text.match(/\\d+/g);"), false);
  });
});
