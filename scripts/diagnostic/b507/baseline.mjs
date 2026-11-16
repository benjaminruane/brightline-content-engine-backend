/**
 * B507 step 0. Capture today's Generate base prompt and Rewrite prompt
 * before any assembly change. No model call. Does not commit.
 *
 * Run: node --experimental-test-module-mocks scripts/diagnostic/b507/baseline.mjs
 */
import { mock } from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const calls = [];

mock.module(new URL("../../../lib/observability.js", import.meta.url).href, {
  namedExports: {
    callLLM: async (args) => {
      const messages = Array.isArray(args?.messages) ? args.messages : [];
      calls.push({
        traceName: args?.traceName ?? "",
        system: messages.find((m) => m.role === "system")?.content ?? "",
        user: messages.find((m) => m.role === "user")?.content ?? "",
      });
      return { text: JSON.stringify({ draftText: "The firm completed the transaction." }) };
    },
    hasProviderApiKey: () => true,
    flushObservability: async () => {},
  },
});

const { buildBasePrompt } = await import("../../../lib/prompt-library/index.js");
const { EVENT_TYPE } = await import("../../../lib/event-type.js");
const { OUTPUT_TYPE } = await import("../../../lib/output-intent.js");
const { resolveAuthoringOrganisationName } = await import("../../../lib/qc/first-person-actor.mjs");
const generate = (await import("../../../api/generate.js")).default;
const rewrite = (await import("../../../api/rewrite.js")).default;

const FIXED = {
  investment: "Northwind Holdings",
  transactionDate: "Mar 2026",
  specialPresent: "Mention the sourcing angle.",
  maxWords: 150,
  title: "Assess draft",
  draft: "The firm completed the transaction.",
  authoringOrganisation: resolveAuthoringOrganisationName(null),
  source: {
    name: "Memo",
    text: "Northwind Holdings reported revenue of USD 20 million.",
    role: "facts",
  },
};

const textTypes = [...Object.values(EVENT_TYPE), "none"];
const outputTypes = Object.values(OUTPUT_TYPE);
const visibilities = ["complete", "public"];
const specials = [true, false];

function resStub() {
  return {
    statusCode: 200,
    body: undefined,
    setHeader() {},
    getHeader() {
      return undefined;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

async function capture(handler, body) {
  const before = calls.length;
  const res = resStub();
  const log = console.log;
  console.log = () => {};
  try {
    await handler({ method: "POST", headers: {}, body }, res);
  } finally {
    console.log = log;
  }
  const hit = calls.slice(before).find((c) => c.system || c.user);
  if (!hit) {
    throw new Error(
      `no prompt captured (status ${res.statusCode}): ${JSON.stringify(res.body)}`
    );
  }
  return { system: hit.system, user: hit.user, status: res.statusCode };
}

const rows = [];

for (const textType of textTypes) {
  for (const outputType of outputTypes) {
    for (const visibility of visibilities) {
      for (const special of specials) {
        const specialInstructions = special ? FIXED.specialPresent : "";
        const eventType = textType === "none" ? "" : textType;
        const base = buildBasePrompt({
          outputType,
          visibility,
          eventType,
          transactionDate: FIXED.transactionDate,
          investment: FIXED.investment,
          specialInstructions,
          sources: [FIXED.source],
          authoringOrganisation: FIXED.authoringOrganisation,
        });
        const generatePrompt = await capture(generate, {
          title: FIXED.title,
          notes: specialInstructions,
          eventType,
          outputType,
          visibility,
          transactionDate: FIXED.transactionDate,
          investment: FIXED.investment,
          specialInstructions,
          maxWords: FIXED.maxWords,
          publicSearch: false,
          sources: [FIXED.source],
          bannedWords: [],
        });
        const rewritePrompt = await capture(rewrite, {
          text: FIXED.draft,
          instructions: specialInstructions,
          eventType,
          outputType,
          visibility,
          transactionDate: FIXED.transactionDate,
          investment: FIXED.investment,
          specialInstructions,
          maxWords: FIXED.maxWords,
          publicSearch: false,
          sources: [FIXED.source],
          bannedWords: [],
        });
        rows.push({
          textType,
          outputType,
          visibility,
          specialInstructions,
          basePromptText: base.basePromptText,
          baseGuidanceSummary: base.baseGuidanceSummary,
          generateSystem: generatePrompt.system,
          generateUser: generatePrompt.user,
          rewriteSystem: rewritePrompt.system,
          rewriteUser: rewritePrompt.user,
        });
      }
    }
  }
}

const out = {
  capturedAt: "2026-11-15",
  note: "Today's builders, before B507 layers. All sources are facts. Authoring organisation is the default.",
  fixed: FIXED,
  count: rows.length,
  rows,
};

mkdirSync(here, { recursive: true });
const dest = join(here, "baseline.json");
writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${rows.length} combinations to ${dest}`);
