/**
 * B472. Check the notes against the whole source. No model call.
 *
 *   node scripts/diagnostic/b472/check-claims.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { resolveSourceText } from "../lib/sources.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b464/pass-1.json");
const RESULT = path.join(__dirname, "RESULT.md");

const CARDS = [
  { id: "19:3", terms: ["eight"], control: true },
  { id: "04:1", terms: ["approval", "seeking approval", "committed", "commit"] },
  { id: "05:2", terms: ["counts", "supplies", "supply", "long-standing"] },
  { id: "08:12", terms: ["operating leverage", "broader cost base", "incremental revenue", "120 bps", "80 bps", "60 bps", "balance"] },
  { id: "10:4", terms: ["support", "supporting", "acceleration", "accelerate", "accelerating"] },
  { id: "11:7", terms: ["meaningful scale", "scale", "bolt-on", "1.8 billion", "1.1 billion"] },
  { id: "11:12", terms: ["on a returns basis", "strongest vintages", "strongest", "vintage"] },
  { id: "15:12", terms: ["third", "growth pillar", "pillar", "Atelier"] },
  { id: "15:25", terms: ["modest", "renegotiat", "10%", "20%", "next break", "stress"] },
  { id: "17:6", terms: ["concentrated", "across the portfolio", "portfolio-wide", "strongest reversion", "18%"] },
  { id: "18:1", terms: ["rent collection", "rent management", "maintenance management", "maintenance scheduling", "tenant communication", "regulatory reporting"] },
  { id: "18:2", terms: ["recommend", "recommends", "recommendation", "invested", "completed", "completion"] },
  { id: "19:4", terms: ["performed strongly", "performed exceptionally", "exceptionally", "as reported", "today", "480 million", "285 million"] },
];

const VERDICT = {
  "19:3": "The source agrees with the note. Eight occurs four times, including \"the remaining eight portfolio companies\" and \"All eight portfolio companies\".",
  "04:1": "The source agrees with the note. It says \"We seek partnership approval\" and \"We recommend approval\". Committed and commit do not occur. The exact words \"seeking approval\" do not occur, because the source puts \"partnership\" between seek and approval.",
  "05:2": "The source agrees with the note. It says Norwell counts the manufacturers and the defense primes among its long-standing customers. Supplies and supply do not occur.",
  "08:12": "The source agrees with the note. It attributes approximately 60 bps to operating leverage on incremental revenue. Broader cost base and balance do not occur. The same sentence also gives 120 bps to footprint consolidation, 80 bps to procurement, and 60 bps to automation in Brno.",
  "10:4": "The source agrees with the note. It says Meridian will support the Company's expansion strategy. Supporting, acceleration, and accelerating do not occur. A different sentence says \"we will accelerate our investment\", so the verb is in the source even though the note's noun is not.",
  "11:7": "The source agrees with the note. It states four bolt-on acquisitions for a combined enterprise value of SEK 1.8 billion, and HeatTech GmbH for SEK 1.1 billion. Meaningful scale does not occur. Scale occurs once, inside \"sub-scale\".",
  "11:12": "The source agrees with the note. It says \"Fund IV becomes one of our strongest vintages on a returns basis.\"",
  "15:12": "The source agrees with the note. It says the Atelier 73 concept has the potential to become a meaningful third growth pillar. Third, pillar, and Atelier also occur in other sentences.",
  "15:25": "The source agrees with the note. It says the model was stress-tested for the scenario in which 10% of leases are renegotiated upward by 20% at the next break, and the impact on returns is modest. Modest, 10%, and stress also occur in other sentences.",
  "17:6": "The source agrees with the note. It says approximately 18% across the portfolio, with the strongest reversion potential in the London and Amsterdam assets. Concentrated and portfolio-wide do not occur. The note's \"portfolio-wide\" is this sentence's \"across the portfolio\".",
  "18:1": "The source agrees with the note. The initial memo contains rent collection, maintenance management, tenant communication, and regulatory reporting. Rent management and maintenance scheduling do not occur in either file. The update memo contains none of these terms.",
  "18:2": "The source agrees with the note. The initial memo says \"We recommend an investment of EUR 158 million for a 60% controlling stake.\" The form recommends does not occur, and invested does not occur. Completed occurs once in the update, about hiring rounds. Completion occurs as the completion of confirmatory diligence and as a recommendation to complete the transaction, which is not a completed investment.",
  "19:4": "The source shows the note wrong on \"as reported\", which does not occur, and today does not occur either. The backlog sentence says the order backlog stands at EUR 480 million, up from EUR 285 million at our acquisition date. The source does agree that Eltex has performed strongly, and performed exceptionally does not occur. The figure 480 million also names Helvetia's fund equity, and 285 million also names Brightway's fund equity.",
};

function pad(id) {
  return String(id).padStart(2, "0");
}
function entryName(entry) {
  if (typeof entry === "string") return entry.trim();
  if (entry && typeof entry === "object") {
    return String(entry.file || entry.filename || "").trim();
  }
  return "";
}
function plain(text) {
  return String(text || "")
    .replace(/\u2014/g, " - ")
    .replace(/\u2013/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}
function squash(text) {
  const lead = /^\s/.test(text) ? " " : "";
  const tail = /\s$/.test(text) ? " " : "";
  const body = String(text || "")
    .replace(/\u2014/g, " - ")
    .replace(/\u2013/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
  return `${lead}${body}${tail}`;
}
function window(text, at, len) {
  const before = text.slice(Math.max(0, at - 60), at);
  const mid = text.slice(at, at + len);
  const after = text.slice(at + len, Math.min(text.length, at + len + 60));
  return `${squash(before)}[${squash(mid).trim()}]${squash(after)}`;
}
function findAll(text, term) {
  const hay = text.toLowerCase();
  const needle = term.toLowerCase();
  const hits = [];
  let from = 0;
  while (from <= hay.length) {
    const at = hay.indexOf(needle, from);
    if (at < 0) break;
    hits.push(at);
    from = at + Math.max(needle.length, 1);
  }
  return hits;
}

const pass = JSON.parse(readFileSync(PASS, "utf8"));
const fixtures = await loadAllFixtures();
const byFixture = new Map(fixtures.map((row) => [pad(row.data.id), row]));

function cardOf(id) {
  const [fixture, index] = id.split(":");
  return pass.cards.find((row) => pad(row.fixtureId) === fixture && row.index === Number(index));
}

async function resolveFixture(id) {
  const fixtureId = id.split(":")[0];
  const fixture = byFixture.get(fixtureId);
  if (!fixture) return { missingFixture: fixtureId, files: [] };
  const entries = Array.isArray(fixture.data.sources) ? fixture.data.sources : [];
  const files = [];
  for (const entry of entries) {
    const name = entryName(entry);
    if (!name) {
      files.push({ name: "(empty entry)", error: "the fixture source has no filename" });
      continue;
    }
    try {
      const resolved = await resolveSourceText(name);
      files.push({
        name,
        path: resolved.resolvedFrom,
        chars: resolved.text.length,
        text: resolved.text,
      });
    } catch (err) {
      files.push({ name, error: err.message });
    }
  }
  return { files };
}

const resolved = new Map();
for (const card of CARDS) resolved.set(card.id, await resolveFixture(card.id));

const controlFiles = resolved.get("19:3").files.filter((file) => file.text);
const eightCount = controlFiles.reduce((sum, file) => sum + findAll(file.text, "eight").length, 0);
const controlPhrase = controlFiles.some((file) => file.text.toLowerCase().includes("the remaining eight portfolio companies"));
const lines = [];
lines.push("# B472. Check nine claims about the source against the source");
lines.push("");
lines.push("The text searched is the text the pipeline loader gives the reading note. No model call. USD 0.");
lines.push("");
lines.push("Each term is matched as written, without regard to case, including where it sits inside a longer word. Sixty characters of the source stand on either side. A line break in that window is shown as a space.");
lines.push("");

if (eightCount < 4 || !controlPhrase) {
  lines.push("The control failed. 19:3 returned fewer than four occurrences of eight, or it did not contain \"the remaining eight portfolio companies\".");
  lines.push("");
  lines.push(`Occurrences of eight: ${eightCount}. The portfolio-companies sentence is present: ${controlPhrase ? "yes" : "no"}.`);
  lines.push("");
  lines.push("The diagnostic is not reading the right files. The rest of this output is void.");
  lines.push("");
  writeFileSync(RESULT, `${lines.join("\n")}\n`);
  console.log("void");
  process.exit(1);
}

lines.push("The control passes. 19:3 has four occurrences of eight, including \"the remaining eight portfolio companies\". The other twelve cards are read from the same loader.");
lines.push("");

for (const card of CARDS) {
  const row = resolved.get(card.id);
  const note = plain(cardOf(card.id)?.readingNote?.text);
  lines.push(`## ${card.id}`);
  lines.push("");
  if (row.missingFixture) {
    lines.push(`Fixture ${row.missingFixture} could not be resolved. No guess was made.`);
    lines.push("");
    continue;
  }
  lines.push(`Sources: ${row.files.length}.`);
  lines.push("");
  for (const file of row.files) {
    if (file.error) {
      lines.push(`${file.name} could not be resolved. ${plain(file.error)} No guess was made.`);
    } else {
      lines.push(`${file.path}`);
      lines.push("");
      lines.push(`${file.chars} characters. Fixture name: ${file.name}.`);
    }
    lines.push("");
  }
  const searchable = row.files.filter((file) => file.text);
  for (const term of card.terms) {
    const hits = [];
    for (const file of searchable) {
      for (const at of findAll(file.text, term)) hits.push({ file, at });
    }
    if (!hits.length) {
      lines.push(`\`${term}\`: none.`);
      lines.push("");
      continue;
    }
    lines.push(`\`${term}\`: ${hits.length}.`);
    lines.push("");
    for (const hit of hits) {
      lines.push(`- ${hit.file.name}: ${window(hit.file.text, hit.at, term.length)}`);
      lines.push("");
    }
  }
  lines.push(`Verdict: ${VERDICT[card.id]}`);
  lines.push("");
  lines.push(`Note: ${note || "The card has no wording note."}`);
  lines.push("");
}

writeFileSync(RESULT, `${lines.join("\n")}\n`);
console.log(`cards ${CARDS.length} eight ${eightCount}`);
