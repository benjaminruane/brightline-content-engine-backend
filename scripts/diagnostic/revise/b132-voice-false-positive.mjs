#!/usr/bin/env node
/**
 * B132 proposal challenge. Size voice_consistency / first_person_plural
 * false positives on stored Review artefacts. Zero model calls.
 *
 * Usage: node scripts/diagnostic/revise/b132-voice-false-positive.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VOICE_CODES = new Set(["voice_consistency", "first_person_plural"]);
const FIRST_PERSON_RE = /\b(?:we|our|ours|us|we're|we've|we'll|we'd|ourselves)\b/i;
const LEADING_ADVERBIAL_RE =
  /^(?:(?:in|on|as of|during|since|by|at|following|after|before|throughout)\b[^,]{2,40},\s*|(?:on balance|however|furthermore|in addition|overall|accordingly|therefore|separately|more broadly),\s*)/i;
const TEAM_SUBJECT_RE = /^(?:the\s+team|the\s+investment\s+team|the\s+firm's\s+team)\b/i;
const AGENTLESS_RE =
  /\b(?:is|are|was|were)\s+(?:recommended|believed|expected|considered)|it is (?:recommended|believed|noted)\b/i;

const HOUSE_BY_FILE = {
  "suggest-after-r10-review1.json": "Halden Group",
  "suggest-after-r10-review2.json": "Halden Group",
  "condition-b-review.json": "Halden Group",
  "coverage-gap-review.json": "Partners Group",
};

function findStatementArrays(node, out = [], depth = 0) {
  if (!node || typeof node !== "object" || depth > 8) return out;
  if (Array.isArray(node)) {
    if (node.length && node[0] && node[0].qcCard) out.push(node);
    node.forEach((n) => findStatementArrays(n, out, depth + 1));
    return out;
  }
  for (const v of Object.values(node)) findStatementArrays(v, out, depth + 1);
  return out;
}

function citedFromFirstSpan(statement, concern) {
  const spans = Array.isArray(concern?.span) ? concern.span : [];
  const first = spans[0];
  if (!first || typeof first.startChar !== "number" || typeof first.endChar !== "number") {
    return { cited: "", hasSpan: false };
  }
  return {
    cited: String(statement || "").slice(first.startChar, first.endChar),
    hasSpan: true,
    startChar: first.startChar,
    endChar: first.endChar,
  };
}

function houseIsLeadingSubject(statement, house) {
  if (!house) return false;
  const stripped = String(statement || "")
    .trim()
    .replace(LEADING_ADVERBIAL_RE, "");
  const escaped = house.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}\\b`, "i").test(stripped);
}

function teamIsLeadingSubject(statement) {
  const stripped = String(statement || "")
    .trim()
    .replace(LEADING_ADVERBIAL_RE, "");
  return TEAM_SUBJECT_RE.test(stripped);
}

const files = (await readdir(__dirname)).filter((f) => /review.*\.json$/i.test(f) && f.endsWith(".json"));
const rows = [];
let statementCount = 0;

for (const file of files.sort()) {
  const json = JSON.parse(await readFile(path.join(__dirname, file), "utf8"));
  const arrays = findStatementArrays(json);
  const seen = new Set();
  for (const arr of arrays) {
    for (const stmt of arr) {
      const text = String(stmt?.qcCard?.statement || stmt?.text || "");
      const key = `${file}::${stmt?.id ?? stmt?.qcCard?.index}::${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      statementCount += 1;
      const house = HOUSE_BY_FILE[file] || null;
      const concerns = Array.isArray(stmt?.qcCard?.editorialConcerns) ? stmt.qcCard.editorialConcerns : [];
      const voice = concerns.filter((c) => VOICE_CODES.has(c?.concernCode) || VOICE_CODES.has(c?.rule));
      const hasPronoun = FIRST_PERSON_RE.test(text);
      const houseSubject = houseIsLeadingSubject(text, house);
      rows.push({
        file,
        id: stmt?.id ?? stmt?.qcCard?.index,
        text,
        house,
        hasPronoun,
        houseSubject,
        teamSubject: teamIsLeadingSubject(text),
        agentless: AGENTLESS_RE.test(text),
        voiceCount: voice.length,
        voice,
      });
    }
  }
}

const withVoice = rows.filter((r) => r.voiceCount > 0);
const fp = withVoice.filter((r) => r.houseSubject || !r.hasPronoun);
const genuine = withVoice.filter((r) => r.hasPronoun && !r.houseSubject);
const unflaggedNoPronounHouseSubject = rows.filter(
  (r) => r.voiceCount === 0 && (r.houseSubject || (!r.hasPronoun && r.teamSubject))
);

function line(r) {
  const codes = r.voice
    .map((c) => {
      const { cited, hasSpan, startChar, endChar } = citedFromFirstSpan(r.text, c);
      const spanPronoun = FIRST_PERSON_RE.test(cited);
      return `${c.concernCode} span=${hasSpan ? `"${cited}" [${startChar},${endChar}]` : "(none)"} spanHasPronoun=${spanPronoun} dir=${JSON.stringify(c.suggestedDirection || "")}`;
    })
    .join(" | ");
  return (
    `${r.file} S${r.id} pronoun=${r.hasPronoun} houseSubject=${r.houseSubject} ` +
    `teamSubject=${r.teamSubject} agentless=${r.agentless}\n  ${JSON.stringify(r.text)}\n  ${codes || "(no voice concern)"}`
  );
}

console.log("Review files:", files.sort().join(", "));
console.log("statements:", statementCount);
console.log("statements with voice_consistency or first_person_plural:", withVoice.length);
console.log("those with house as leading subject OR no first-person pronoun:", fp.length);
console.log("those with a pronoun and house NOT leading subject (expected keeps):", genuine.length);
console.log("unflagged statements that already have house as subject, or team-subject and no pronoun:", unflaggedNoPronounHouseSubject.length);
console.log("");
console.log("=== EVERY VOICE / FIRST-PERSON CONCERN ===");
for (const r of withVoice) console.log(line(r));
console.log("");
console.log("=== FALSE-POSITIVE CANDIDATES (house subject OR no pronoun) ===");
for (const r of fp) console.log(line(r));
console.log("");
console.log("=== EXPECTED KEEPS ===");
for (const r of genuine) console.log(line(r));
console.log("");
console.log("=== UNFLAGGED HOUSE-SUBJECT OR TEAM-SUBJECT (no pronoun) ===");
for (const r of unflaggedNoPronounHouseSubject) {
  console.log(
    `${r.file} S${r.id} houseSubject=${r.houseSubject} teamSubject=${r.teamSubject} pronoun=${r.hasPronoun}\n  ${JSON.stringify(r.text)}`
  );
}
