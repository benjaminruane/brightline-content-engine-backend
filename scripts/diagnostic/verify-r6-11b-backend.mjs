#!/usr/bin/env node
/**
 * R6.11b backend VERIFY — verbatim stdout.
 * Run: node --experimental-loader ./scripts/diagnostic/verify-r6-11a-loader.mjs ./scripts/diagnostic/verify-r6-11b-backend.mjs
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFiles } from "./lib/env.mjs";
import { FIXTURES_DIR } from "./lib/paths.mjs";

loadLocalEnvFiles();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { default: editorialRules } = await import("../../lib/rulebook/editorialRules.js");
const {
  getOutputTypeLabel,
  normalizeOutputType,
  normalizeVisibility,
  VISIBILITY,
} = await import("../../lib/output-intent.js");
const { normalizeEventType } = await import("../../lib/event-type.js");
const {
  runEditorialStyleReview,
  recomputeV4EditorialVerdictFromConcerns,
} = await import("../../lib/qc/editorial-compliance-reviewer.mjs");
const { assembleCard } = await import("../../lib/qc/pipeline-v3/stage7-assemble-card.mjs");

const MOCK_CASE4 = JSON.stringify({
  concerns: [
    {
      category: "editorial",
      ruleId: "made_up_rule",
      note: "Fabricated concern for control test.",
      suggestedDirection: "Remove the fabricated violation.",
    },
  ],
  verdict: "concern",
  verdictNote: "",
});

const CANONICAL_TO_RULEBOOK_OUTPUT = {
  REPORTING_COMMENTARY: "reporting_commentary",
  INVESTOR_LETTER: "investor_letter",
  PRESS_RELEASE: "press_release",
  LINKEDIN_POST: "linkedin_post",
};

function rulebookOutputSlug(canonicalOt) {
  return CANONICAL_TO_RULEBOOK_OUTPUT[canonicalOt] ?? "reporting_commentary";
}

function rulebookVersionSlug(visibility) {
  return visibility === VISIBILITY.PUBLIC ? "public" : "complete";
}

function filterRulesForRun(rules, outputSlug, versionSlug) {
  return rules.filter((r) => {
    if (!Array.isArray(r.appliesTo) || !r.appliesTo.includes(outputSlug)) return false;
    if (r.appliesToVersion == null) return true;
    if (Array.isArray(r.appliesToVersion) && r.appliesToVersion.includes(versionSlug)) return true;
    return false;
  });
}

async function loadFixture20() {
  const raw = await readFile(
    path.join(FIXTURES_DIR, "20_synth_fund_close_announcement.json"),
    "utf8"
  );
  return JSON.parse(raw);
}

function buildReviewArgs(fixture, sentenceText, statementIndex) {
  const cfg = fixture.config ?? {};
  const outputType = normalizeOutputType(cfg.outputType);
  const requiredVersion = normalizeVisibility(cfg.requiredVersion);
  const outputSlug = rulebookOutputSlug(outputType);
  const versionSlug = rulebookVersionSlug(requiredVersion);
  const editorialFiltered = filterRulesForRun(editorialRules, outputSlug, versionSlug);
  return {
    sentenceText,
    outputType,
    outputTypeLabel: getOutputTypeLabel(outputType),
    requiredVersion,
    draftText: typeof fixture.draft === "string" ? fixture.draft : "",
    eventType: normalizeEventType(cfg.eventType),
    evidenceExcerpt: null,
    contextBefore: null,
    contextAfter: null,
    evidenceBlock: "(No excerpt text available for this statement.)",
    editorialRules: editorialFiltered,
    outputSlug,
    traceId: "verify-r6-11b",
    statementIndex,
  };
}

/** Mirrors api/export.js buildReviewData editorialFlag path (lines 43-50, 125-134). */
function buildExportStatementRow(qcCard) {
  const editorialConcerns = Array.isArray(qcCard.editorialConcerns) ? qcCard.editorialConcerns : [];
  const editorialFallback = editorialConcerns
    .map((c) => c?.note)
    .filter((x) => typeof x === "string" && x.trim())
    .join(" ");
  const editorialNote =
    typeof qcCard.editorialNote === "string" && qcCard.editorialNote !== ""
      ? qcCard.editorialNote
      : editorialFallback || null;
  const v = qcCard.editorialVerdict;
  const isEditorialExportConcerned =
    v === "soft_concern" ||
    v === "hard_concern" ||
    v === "concern" ||
    v === "not_reviewed";
  const editorialFlag = isEditorialExportConcerned || editorialNote != null;
  return { editorialVerdict: v, editorialNote, editorialFlag };
}

function baseStatementEntry(editorialResult, verdict = "confirmed") {
  return {
    statementText: "Synthetic statement for assembly verify.",
    startChar: 0,
    endChar: 40,
    verdictResult: {
      verdict,
      hasConflict: verdict === "conflicting",
      confirmingMatches: [],
    },
    excerptResult: {
      primaryExcerpt: { passage: "Source excerpt text.", sourceLabel: "Stub" },
      conflictExcerpt: null,
    },
    commentaryResult: { commentary: "Evidence explanation for duplication judge." },
    editorialResult,
    sourceMatches: [],
  };
}

function printSection(title) {
  console.log(`\n${"=".repeat(72)}`);
  console.log(title);
  console.log("=".repeat(72));
}

async function main() {
  printSection("1. R6.11a forced-total-failure (made_up_rule) — runEditorialStyleReview fallback");

  globalThis.__R611A_MOCK_HANDLER = async () => MOCK_CASE4;

  const f20 = await loadFixture20();
  const fallbackResult = await runEditorialStyleReview(
    buildReviewArgs(f20, "Synthetic control statement for unknown ruleId.", 0)
  );

  console.log("\n--- resolved fields ---");
  console.log("editorialVerdict:", JSON.stringify(fallbackResult?.editorialVerdict ?? null));
  console.log("editorialConcerns:", JSON.stringify(fallbackResult?.editorialConcerns ?? null));
  console.log("editorialNote:", JSON.stringify(fallbackResult?.editorialNote ?? null));
  console.log("schemaValid:", JSON.stringify(fallbackResult?.schemaValid ?? null));
  console.log("retried:", JSON.stringify(fallbackResult?.retried ?? null));

  printSection("2. Stage 7 assembly — not_reviewed card (duplication-judge / recompute path)");

  const editorialBefore = {
    editorialVerdict: "not_reviewed",
    editorialConcerns: [],
    editorialNote: "",
    editorialSuggestedDirection: null,
    editorialSuggestedRewrite: null,
    complianceVerdict: "clean",
    complianceConcerns: [],
    complianceNote: null,
    complianceSuggestedDirection: null,
    complianceSuggestedRewrite: null,
    suppressInQcWorkbench: false,
  };

  console.log("\n--- BEFORE assembly (editorialResult input) ---");
  console.log("editorialVerdict:", JSON.stringify(editorialBefore.editorialVerdict));
  console.log("editorialConcerns:", JSON.stringify(editorialBefore.editorialConcerns));
  console.log("editorialNote:", JSON.stringify(editorialBefore.editorialNote));

  const cardEmpty = await assembleCard(
    baseStatementEntry(editorialBefore, "conflicting"),
    0,
    { pipelineRoute: "v4", outputType: "reporting_commentary", traceId: "verify-r6-11b" }
  );

  console.log("\n--- AFTER assembly (qcCard output, v4 conflicting, zero concerns) ---");
  console.log("editorialVerdict:", JSON.stringify(cardEmpty.editorialVerdict));
  console.log("editorialConcerns:", JSON.stringify(cardEmpty.editorialConcerns));
  console.log("editorialNote:", JSON.stringify(cardEmpty.editorialNote));

  console.log(
    "\n--- recompute guard simulation (judge would drop all concerns; incoming not_reviewed) ---"
  );
  const editorialWithConcern = {
    ...editorialBefore,
    editorialConcerns: [
      {
        concernCode: "overreach_unsupported_causal",
        note: "Test concern.",
        category: "editorial",
        suggestedDirection: "Fix it.",
      },
    ],
  };
  const kept = [];
  const incomingVerdict = editorialWithConcern.editorialVerdict.trim();
  let simulatedOut;
  if (kept.length !== editorialWithConcern.editorialConcerns.length) {
    if (incomingVerdict === "not_reviewed") {
      simulatedOut = {
        editorialVerdict: "not_reviewed",
        editorialNote: editorialWithConcern.editorialNote,
      };
    } else {
      simulatedOut = {
        editorialVerdict: recomputeV4EditorialVerdictFromConcerns(kept, "reporting_commentary"),
      };
    }
  }
  console.log(
    "recomputeV4EditorialVerdictFromConcerns([], outputType) without guard:",
    JSON.stringify(recomputeV4EditorialVerdictFromConcerns([], "reporting_commentary"))
  );
  console.log("stage7 guard branch editorialVerdict:", JSON.stringify(simulatedOut?.editorialVerdict));

  const editorialBeforeJudge = {
    ...editorialBefore,
    editorialConcerns: editorialWithConcern.editorialConcerns,
  };
  console.log("\n--- BEFORE assembly (not_reviewed + 1 concern, conflicting — judge path eligible) ---");
  console.log("editorialVerdict:", JSON.stringify(editorialBeforeJudge.editorialVerdict));
  console.log("editorialConcerns.length:", editorialBeforeJudge.editorialConcerns.length);

  const cardJudge = await assembleCard(
    baseStatementEntry(editorialBeforeJudge, "conflicting"),
    1,
    { pipelineRoute: "v4", outputType: "reporting_commentary", traceId: "verify-r6-11b" }
  );

  console.log("\n--- AFTER assembly (same card through judge + merge path) ---");
  console.log("editorialVerdict:", JSON.stringify(cardJudge.editorialVerdict));
  console.log("editorialConcerns:", JSON.stringify(cardJudge.editorialConcerns));
  console.log("editorialNote:", JSON.stringify(cardJudge.editorialNote));

  printSection("3. Stage 7 assembly — genuine clean and concern (guard must not break)");

  const editorialClean = {
    editorialVerdict: "clean",
    editorialConcerns: [],
    editorialNote: "No editorial or style concerns identified under the listed rules.",
    editorialSuggestedDirection: null,
    editorialSuggestedRewrite: null,
    complianceVerdict: "clean",
    complianceConcerns: [],
    complianceNote: null,
    complianceSuggestedDirection: null,
    complianceSuggestedRewrite: null,
    suppressInQcWorkbench: false,
  };

  const cardClean = await assembleCard(
    baseStatementEntry(editorialClean, "confirmed"),
    2,
    { pipelineRoute: "v4", outputType: "reporting_commentary" }
  );

  console.log("\n--- CLEAN after assembly ---");
  console.log("editorialVerdict:", JSON.stringify(cardClean.editorialVerdict));
  console.log("editorialNote:", JSON.stringify(cardClean.editorialNote));

  const editorialConcern = {
    editorialVerdict: "concern",
    editorialConcerns: [
      {
        concernCode: "percentage_notation",
        note: "Uses '96 percent' instead of %.",
        category: "style_guide",
        rule: "percentage_notation",
        suggestedDirection: "Replace '96 percent' with '96%'.",
      },
    ],
    editorialNote: null,
    editorialSuggestedDirection: "Replace '96 percent' with '96%'.",
    editorialSuggestedRewrite: null,
    complianceVerdict: "clean",
    complianceConcerns: [],
    complianceNote: null,
    complianceSuggestedDirection: null,
    complianceSuggestedRewrite: null,
    suppressInQcWorkbench: false,
  };

  const cardConcern = await assembleCard(
    baseStatementEntry(editorialConcern, "confirmed"),
    3,
    { pipelineRoute: "v4", outputType: "reporting_commentary" }
  );

  console.log("\n--- CONCERN after assembly ---");
  console.log("editorialVerdict:", JSON.stringify(cardConcern.editorialVerdict));
  console.log("editorialNote:", JSON.stringify(cardConcern.editorialNote));
  console.log("editorialConcerns.length:", cardConcern.editorialConcerns?.length ?? 0);

  printSection("4. Export payload — buildReviewData editorialFlag (api/export.js logic)");

  const rowNotReviewed = buildExportStatementRow({
    editorialVerdict: "not_reviewed",
    editorialNote: "",
    editorialConcerns: [],
    statement: "Test",
    displayVerdict: "supported_full",
    supportState: "supported",
  });
  const rowConcern = buildExportStatementRow({
    editorialVerdict: "concern",
    editorialNote: null,
    editorialConcerns: [
      { note: "Uses percent spelled out.", concernCode: "percentage_notation" },
    ],
    statement: "Test",
    displayVerdict: "supported_full",
    supportState: "supported",
  });

  console.log("\n--- not_reviewed export row ---");
  console.log(JSON.stringify(rowNotReviewed, null, 2));
  console.log("\n--- v4 concern export row ---");
  console.log(JSON.stringify(rowConcern, null, 2));
}

main().catch((err) => {
  console.error("[verify-r6-11b-backend] fatal:", err?.message || err);
  process.exit(1);
});
