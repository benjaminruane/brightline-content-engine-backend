/**
 * Dry scan. No model calls. Every statement in fixtures 01 to 20.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { filterFixtures, loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { frozenRowsByFixture } from "../accuracy/run-evidence.mjs";
import { padFixtureId } from "../accuracy/lib.mjs";
import { findSecondValue } from "../../../lib/qc/pipeline-v4/second-value.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const statementsDoc = JSON.parse(
    await readFile(path.join(__dirname, "../accuracy/statements.json"), "utf8")
  );
  const { byId } = frozenRowsByFixture(statementsDoc);
  const fixtures = filterFixtures(await loadAllFixtures(), { range: { from: "01", to: "20" } });
  let hits = 0;
  for (const fixture of fixtures) {
    const id = padFixtureId(fixture.data.id);
    const sources = await loadPipelineSources(fixture.data.sources || []);
    const rows = byId.get(id) || [];
    for (const row of rows) {
      for (const src of sources) {
        const text = typeof src?.text === "string" ? src.text : "";
        const hit = findSecondValue(row.text, text);
        if (!hit) continue;
        hits += 1;
        console.log(`${id} ${hit.metric} ${hit.statementRaw} vs ${hit.sourceRaw}\n  STMT ${row.text}\n  ${hit.line}\n`);
      }
    }
  }
  console.log(`HITS ${hits}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
