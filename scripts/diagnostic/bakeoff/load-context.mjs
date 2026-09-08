/**
 * Shared bake-off loaders. Cache off. No labels in prompts.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadAllFixtures, filterFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { flattenStatements, padFixtureId } from "../accuracy/lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ACC = path.join(__dirname, "../accuracy");
const MODEL = "gpt-4o-2024-08-06";
const INPUT_USD_PER_M = 2.5;
const OUTPUT_USD_PER_M = 10.0;

export function parseJsonObject(text) {
  const raw = String(text || "").trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in model output");
  return JSON.parse(body.slice(start, end + 1));
}

export async function loadPrompt(name) {
  return readFile(path.join(__dirname, "prompts", name), "utf8");
}

export async function loadFixtureContexts() {
  const statementsDoc = JSON.parse(await readFile(path.join(ACC, "statements.json"), "utf8"));
  const frozen = flattenStatements(statementsDoc);
  const byFid = new Map();
  for (const s of frozen) {
    const id = padFixtureId(s.fixtureId);
    if (!byFid.has(id)) byFid.set(id, []);
    byFid.get(id).push(s);
  }
  const fixtures = filterFixtures(await loadAllFixtures(), { range: { from: "01", to: "20" } });
  const out = [];
  for (const fixture of fixtures) {
    const id = padFixtureId(fixture.data.id);
    const statements = byFid.get(id) || [];
    if (statements.length === 0) continue;
    const sources = await loadPipelineSources(fixture.data.sources || []);
    const draft = typeof fixture.data.draft === "string" ? fixture.data.draft : "";
    out.push({
      fixtureId: id,
      label: fixture.data.label || "",
      draft,
      sources: sources.map((s, i) => ({
        index: i,
        label: s.label,
        text: s.text,
        publicationState: s.publicationState,
      })),
      statements: statements.map((s, i) => ({
        statementIndex: i,
        fixtureId: id,
        text: s.text,
        occurrence: s.occurrence,
        index: s.index,
      })),
    });
  }
  return out;
}

function tokensFromChars(chars) {
  return Math.ceil(chars / 4);
}

function costUsd(inChars, outChars) {
  return (
    (tokensFromChars(inChars) / 1_000_000) * INPUT_USD_PER_M +
    (tokensFromChars(outChars) / 1_000_000) * OUTPUT_USD_PER_M
  );
}

export function estimatePassAUsd(contexts, promptA) {
  let inputCharsA = 0;
  let outputCharsA = 0;
  for (const fx of contexts) {
    const sourceChars = fx.sources.reduce((n, s) => n + String(s.text || "").length, 0);
    const stmtChars = fx.statements.reduce((n, s) => n + String(s.text || "").length, 0);
    const draftChars = String(fx.draft || "").length;
    inputCharsA += promptA.length + draftChars + sourceChars + stmtChars + 400;
    outputCharsA += fx.statements.length * 420;
  }
  const onePassA = costUsd(inputCharsA, outputCharsA);
  return {
    model: MODEL,
    onePassA,
    twoPassA: 2 * onePassA,
    inputCharsA,
  };
}

export function estimateFourRunsUsd(contexts, promptA, promptB) {
  const a = estimatePassAUsd(contexts, promptA);
  let inputCharsB = 0;
  let outputCharsB = 0;
  for (const fx of contexts) {
    const sourceChars = fx.sources.reduce((n, s) => n + String(s.text || "").length, 0);
    const draftChars = String(fx.draft || "").length;
    inputCharsB += promptB.length + draftChars + sourceChars + 400;
    outputCharsB += 2500;
  }
  const oneB = costUsd(inputCharsB, outputCharsB);
  return {
    model: MODEL,
    onePassA: a.onePassA,
    onePassB: oneB,
    fourRuns: 2 * a.onePassA + 2 * oneB,
    twoPassA: a.twoPassA,
    inputCharsA: a.inputCharsA,
    inputCharsB,
  };
}

export function buildVariantAUser(fx) {
  const sourceBlocks = fx.sources
    .map(
      (s, i) =>
        `SOURCE ${i} (${s.label}${s.publicationState ? `, publicationState=${s.publicationState}` : ""}):\n${s.text}`
    )
    .join("\n\n");
  const stmtBlocks = fx.statements.map((s, i) => `${i}. ${s.text}`).join("\n");
  return `DRAFT:\n${fx.draft}\n\n${sourceBlocks}\n\nSTATEMENTS:\n${stmtBlocks}`;
}

export function buildVariantBUser(fx) {
  const sourceBlocks = fx.sources
    .map(
      (s, i) =>
        `SOURCE ${i} (${s.label}${s.publicationState ? `, publicationState=${s.publicationState}` : ""}):\n${s.text}`
    )
    .join("\n\n");
  return `DRAFT:\n${fx.draft}\n\n${sourceBlocks}`;
}

export { MODEL };
