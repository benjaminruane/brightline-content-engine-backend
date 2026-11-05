/**
 * B477 Part One. How a source gets a date, before any card behaviour changes.
 *
 *   node scripts/diagnostic/b477/dating-audit.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractSourceAsOfDate } from "../../../lib/qc/source-recency.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "dating.md");

const DATE_CORE =
  /(?:(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2},?\s+(?:19|20)\d{2}|\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(?:19|20)\d{2}|(?:19|20)\d{2}-\d{2}-\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(?:19|20)\d{2})/gi;

function pad(id) {
  return String(id).padStart(2, "0");
}

function plain(text) {
  return String(text || "").replace(/[\u2014\u2013\u2012]/g, "-");
}

function contentDates(text, chosenRaw) {
  const found = [];
  const body = String(text || "");
  for (const match of body.matchAll(DATE_CORE)) {
    const raw = match[0].trim();
    if (chosenRaw && raw.toLowerCase() === chosenRaw.toLowerCase()) continue;
    const at = match.index;
    const lineStart = body.lastIndexOf("\n", at) + 1;
    const lineEnd = body.indexOf("\n", at);
    const line = body.slice(lineStart, lineEnd === -1 ? body.length : lineEnd).trim();
    found.push({ raw, line });
  }
  const seen = new Set();
  return found.filter((row) => {
    const key = `${row.raw}|${row.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const fixtures = (await loadAllFixtures()).filter((fixture) => {
  const n = Number(fixture.data.id);
  return n >= 1 && n <= 20;
});

const rows = [];
for (const fixture of fixtures) {
  const sources = await loadPipelineSources(fixture.data.sources || []);
  sources.forEach((source, index) => {
    const asOf = extractSourceAsOfDate(source.text);
    rows.push({
      fixture: pad(fixture.data.id),
      index,
      label: source.label,
      asOf,
      content: contentDates(source.text, asOf?.raw || ""),
    });
  });
}

const undated = rows.filter((row) => !row.asOf);
const lines = [];
lines.push("# B477. How a source is dated");
lines.push("");
lines.push("The function is `extractSourceAsOfDate` in `lib/qc/source-recency.mjs`. It reads only the opening of the document: the first 15 non-empty lines, and, for a date standing on its own, the first 6 non-empty lines when that line is under 40 characters. It accepts a `Date:` or `Dated:` label, an `As of` or `As at` phrase, a dateline, or that short standalone line. It returns the first cue in that order of preference. A date in the body is not used. When nothing in that opening matches, it returns null. It does not return a date it considers uncertain.");
lines.push("");
lines.push("`isConfidentlyDated` in `lib/qc/supersession.mjs` is about a match, not a source. It is true when that match's source has a date from `extractSourceAsOfDate`, or when the match carries a period token. The covering set then drops any match whose source has no as-of date. So a date this stage will sort on is a date `extractSourceAsOfDate` returned, and every such date is one the stage treats as confident. A source with no returned date is not called confident.");
lines.push("");
lines.push("| Fixture | Source | Label | Date | Cue | Stage confidence |");
lines.push("| --- | --- | --- | --- | --- | --- |");
for (const row of rows) {
  const date = row.asOf ? plain(row.asOf.raw) : "none";
  const cue = row.asOf ? plain(row.asOf.cue) : "";
  const confidence = row.asOf ? "confident" : "no date, not confident";
  lines.push(`| ${row.fixture} | ${row.index} | ${row.label} | ${date} | ${cue} | ${confidence} |`);
}
lines.push("");
lines.push(`Sources: ${rows.length}. No date: ${undated.length}. A date the stage does not call confident: 0. The extractor does not return a low-confidence date.`);
lines.push("");
lines.push("Two sources with the same date do not establish an order. The stage sorts by the date and then requires the earlier date to be strictly earlier before it treats one source as older. An equal date is not older, so nothing is cleared and nothing is called a revision.");
lines.push("");
lines.push("A source with a date and a source without one do not establish an order. A match with no as-of date is left out of the covering set, so it cannot be the authority and it cannot be the older source.");
lines.push("");
const withContent = rows.filter((row) => row.content.length);
lines.push(`Sources whose body contains a date the stage did not use: ${withContent.length}.`);
lines.push("");
for (const row of withContent) {
  const bits = row.content.map((item) => `${plain(item.raw)} ("${plain(item.line.slice(0, 140))}")`);
  lines.push(`- ${row.fixture}:${row.index} ${row.label}: ${bits.join("; ")}`);
}
lines.push("");

const fixture18 = rows.filter((row) => row.fixture === "18");
const ordered = fixture18.length === 2 && fixture18.every((row) => row.asOf) && fixture18[0].asOf.date.getTime() !== fixture18[1].asOf.date.getTime();
lines.push(`Fixture 18 sources dated and ordered: ${ordered ? "yes" : "no"}.`);
if (ordered) {
  const sorted = [...fixture18].sort((a, b) => a.asOf.date.getTime() - b.asOf.date.getTime());
  lines.push(`Earlier: ${sorted[0].label}, ${sorted[0].asOf.raw}. Later: ${sorted[1].label}, ${sorted[1].asOf.raw}.`);
}
lines.push("");

writeFileSync(OUT, `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
if (!ordered) process.exit(2);
