/**
 * B435. Where the stored clean notes anchor a dispute.
 * No model call.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { locatedDisputes } from "../../../lib/qc/reading-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const reading = JSON.parse(readFileSync(path.join(root, "scripts/diagnostic/b403c/runs/reading.json"), "utf8"));
const clean = reading.drafts.find((draft) => draft.doc === "HICL" && draft.arm === "clean");

const anchored = [];
const unmarked = [];
for (const row of clean?.statements || []) {
  if (row.bucket !== "conflicts" && row.bucket !== "beyond") continue;
  const note = { bucket: row.bucket, text: row.shownNote || "" };
  const spans = locatedDisputes(row.text, note);
  if (spans.length) anchored.push({ index: row.index, surfaces: spans.map((span) => span.surface) });
  else unmarked.push({ index: row.index, bucket: row.bucket });
}

const lines = [];
const say = (line = "") => lines.push(line);
say("# B435. Dispute anchors");
say("");
say("A dispute is the phrase the note quotes, located in the statement. A matched fact the note does not quote stays matched. No model call. USD 0.");
say("");
say(`Anchored to the text the note names: ${anchored.length}.`);
for (const row of anchored) say(`- S${row.index}: ${row.surfaces.map((surface) => JSON.stringify(surface)).join(", ")}`);
say("");
say(`No mark: ${unmarked.length}.`);
for (const row of unmarked) say(`- S${row.index} ${row.bucket}: the note quotes nothing that is in the statement.`);
say("");
say("The Fortysouth sentence quotes \"and valuation gains,\". The mark is that phrase. EBITDA and Fortysouth stay matched.");
say("");

const report = `${lines.join("\n")}\n`;
writeFileSync(path.join(root, "scripts/diagnostic/b435/report.md"), report);
console.log(report);
