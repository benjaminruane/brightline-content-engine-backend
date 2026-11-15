import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { CONTEXT_SOURCE_LINE, composeLayers } from "../lib/prompt-library/compose.mjs";
import { HOUSE_RULES_PARAGRAPHS } from "../lib/prompt-library/house-rules.mjs";
import { TEXT_TYPE_MODULES } from "../lib/prompt-library/text-types/index.mjs";
import { parseSummarizeResponse, textTypeForSummary } from "../lib/source-summary.mjs";

const OLD_SOURCE_ROLES_LINE =
  "Sources marked as context are background only. Do not take a figure, date or name from a context source unless a facts source states it.";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(root, "scripts/diagnostic/drafting/fixtures");

const MUST_COVER = {
  NEW_DIRECT_INVESTMENT: [
    "investment merits and thesis",
    "thematic fit within the firm's wider strategy",
    "history with the asset, if the source gives it",
    "the overall investment view",
    "what the company does, where, and its scale",
    "the transaction (stake, seller, co-investors, status stated exactly as the source states it)",
    "value creation plan",
    "Do not state the equity amount or the valuation multiple.",
  ],
  ADD_ON_DIRECT_INVESTMENT: [
    "the platform's buy-and-build strategy and how the target fits",
    "what the target adds",
    "rationale",
    "history with the target",
    "the overall view",
    "status",
    "The platform company is the acquirer; do not say the firm invested unless the source says so.",
  ],
  DIRECT_INVESTMENT_EXIT: [
    "buyer",
    "what changed under the firm's ownership",
    "returns achieved, with gross or net stated as the source states it",
    "holding period",
    "status (agreed or completed) exactly as the source states it",
    "any reinvestment",
    "thematic fit",
    "The transaction enterprise value may be stated.",
  ],
  DIRECT_INVESTMENT_REVALUATION: [
    "direction and size of the change as a percentage or in words",
    "the drivers in proportion (earnings, market multiples, currency, other)",
    "an update on the company",
    "a measured outlook",
  ],
  NEW_SECONDARY_INVESTMENT: [
    "investment merits and thesis, including pricing in words",
    "thematic fit within the secondaries programme",
    "history with the funds, managers or assets, stated exactly as the source states it",
    "the overall view",
    "number of funds and managers, vintages, sectors, geographies and maturity of the underlying portfolio",
  ],
  NEW_PRIMARY_COMMITMENT: [
    "the manager and strategy",
    "investment merits and thematic fit",
    "history with the manager",
    "the overall view",
    "the number of portfolio companies the fund intends to back",
    "the target enterprise value range",
    "target sectors and geographies",
    "track record only in abstract terms supported by the source",
  ],
  FUND_CAPITAL_CALL: [
    "the purpose of the call: each investment it funds, what each company does, and why it fits the fund's strategy",
    "Do not mention fees or expenses.",
  ],
  FUND_DISTRIBUTION: [
    "where the proceeds came from",
    "what triggered the distribution, dated as the facts source dates it",
    "returns from the exit that triggered it, with gross or net and the portion they apply to stated as the source states them",
    "a short account of the company",
  ],
  FUND_REVALUATION: [
    "the direction and size of the NAV change as a percentage or in words",
    "what drove it",
    "an update on the main driver investment and what caused the change in its valuation",
    "other notable moves in brief",
  ],
  SPECIAL_TOPIC: [],
};

function loadFixtures() {
  return readdirSync(fixturesDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(path.join(fixturesDir, name), "utf8")));
}

function promptFor(fixture) {
  const layers = composeLayers({
    outputType: fixture.outputType,
    visibility: fixture.visibility,
    eventType: fixture.textType,
    transactionDate: fixture.transactionDate,
    investment: fixture.investment,
    specialInstructions: fixture.specialInstructions,
    sources: (fixture.sources || []).map((source) => ({
      label: source.file,
      text: "Source text.",
      role: source.role,
    })),
    authoringOrganisation: null,
  });
  return layers
    .map((layer) => layer.text)
    .filter(Boolean)
    .join("\n\n");
}

test("each text type exports its mustCover list as stated", () => {
  for (const [key, expected] of Object.entries(MUST_COVER)) {
    assert.deepEqual(TEXT_TYPE_MODULES[key].mustCover, expected, key);
  }
  assert.equal(
    TEXT_TYPE_MODULES.SPECIAL_TOPIC.guidance,
    "Lead with the purpose given in the special instructions. State only what the sources support."
  );
});

test("house rules and the new source-roles line are in the composed prompt", () => {
  const fixtures = loadFixtures();
  assert.equal(fixtures.length, 10);
  for (const fixture of fixtures) {
    const prompt = promptFor(fixture);
    for (const paragraph of HOUSE_RULES_PARAGRAPHS) {
      assert.equal(prompt.includes(paragraph), true, fixture.textType);
    }
    assert.equal(prompt.includes(OLD_SOURCE_ROLES_LINE), false, fixture.textType);
    for (const item of MUST_COVER[fixture.textType]) {
      assert.equal(prompt.includes(item), true, `${fixture.textType}: ${item}`);
    }
    const hasContext = fixture.sources.some((source) => source.role === "context");
    assert.equal(prompt.includes(CONTEXT_SOURCE_LINE), hasContext, fixture.textType);
  }
});

test("a missing or unusable suggestion is not a role", () => {
  assert.equal(textTypeForSummary(""), null);
  assert.equal(textTypeForSummary("not-a-type"), null);
  assert.equal(textTypeForSummary("FUND_CAPITAL_CALL").label, "Fund capital call");
  const parsed = parseSummarizeResponse(
    JSON.stringify({
      description: "A call notice.",
      publicationState: "restricted",
      suggestedRole: "context",
    })
  );
  assert.equal(parsed.suggestedRole, "context");
  assert.equal(
    parseSummarizeResponse(
      JSON.stringify({ description: "A note.", publicationState: "unknown", suggestedRole: "both" })
    ).suggestedRole,
    ""
  );
  assert.equal(
    parseSummarizeResponse(
      JSON.stringify({ description: "A note.", publicationState: "unknown", suggestedRole: "facts" }),
      { allowRole: false }
    ).suggestedRole,
    ""
  );
});
