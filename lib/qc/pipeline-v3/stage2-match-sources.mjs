import { callLLM, hasProviderApiKey, logCanaryScore } from "../../observability.js";
import { STAGE_MODELS } from "../model-config.mjs";
const ALLOWED_CLASSIFICATIONS = new Set([
  "confirmed",
  "partially_confirmed",
  "conflicting",
  "no_support",
]);

const DEFAULT_FAILURE_EXPLANATION = "Match call failed — defaulting to no_support.";

// Stage 2 prompt v3 adopted by R2.5.2.1.
// Evaluation evidence: tests/r1_2_5_eval/results_v3prompt.md (R2.5.2).
const STAGE2_SYSTEM_PROMPT = `
Decision rule for mixed cases:
If the statement contains multiple verifiable facts AND any one of those facts is directly contradicted by a specific statement in the source, the classification is \`conflicting\` — regardless of how many other facts in the statement are confirmed. Do not hedge a contradicted fact as \`partially_confirmed\`. \`partially_confirmed\` is reserved for statements where some facts are confirmed and others are absent from the source (not contradicted).

Passage rule:
The passage must be a single contiguous verbatim excerpt from the source. Do not abridge, summarise, or stitch together multiple non-adjacent quotes using ellipsis or '[...]' markers. If the relevant context is longer than one excerpt can capture, return the single most directly relevant continuous span. Better to return a shorter focused excerpt than an abridged composite.

Worked example:
Statement: 'Shopify has signed up Pixar, Amnesty International, and Nike.'
Source: '...Pixar, Amnesty International and Tesla Motors...'
Correct classification: conflicting
Reasoning: Nike is directly contradicted (the source says Tesla Motors in the same construction). The other two confirmations do not erase the contradiction.

You classify whether a source supports a statement.
Return ONLY a JSON object:
{
  "classification": "<one of the four values below>",
  "passage": "<verbatim excerpt from the source>",
  "explanation": "<one to two sentences>"
}

Classification values:
• "confirmed" — source confirms the substance of the statement, including paraphrased or reformatted versions of the same facts
• "partially_confirmed" — source confirms some but not all verifiable facts in the statement; explanation must name what is confirmed and what is not
• "conflicting" — source directly contradicts a specific claim; explanation must name the contradiction
• "no_support" — source does not address the statement

Exact figures confirm. Rounding and formatting differences confirm (e.g. $132mm and $132 million are the same).
Approximate qualifiers in the statement (approximately, roughly, around) widen tolerance.
A stated precise figure in the statement that differs materially from a stated precise figure in the source does not confirm.

Entity fidelity. When the statement names specific entities — people, companies, products, places, or other proper nouns — and the source names different entities performing the same role, this is partially_confirmed, not confirmed. The explanation must name which entities are confirmed and which are not in the source. Example pattern: if the statement names A, B, and C and the source names A, B, and D, classify partially_confirmed; name A and B as confirmed and C as not in the source.

Partially confirmed applies only when the source confirms some specific facts in the statement but not others. A source that discusses the same general topic without confirming any specific claim is no_support, not partially_confirmed.

Return a verbatim excerpt from the source that is most relevant to your classification. Maximum 400 characters.
If the relevant text is longer, trim at a sentence boundary and do not paraphrase.
`.trim();

function safeJsonParse(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
}

function sentencesForPassageTrim(text) {
  const t = typeof text === "string" ? text.trim() : "";
  if (!t) return [];
  const chunks = t.split(/(?<=[.!?])\s+/).filter((c) => c && String(c).trim());
  return chunks.length > 0 ? chunks : [t];
}

function trimPassageToLimit(passage, maxChars = 400) {
  const text = typeof passage === "string" ? passage : "";
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxChars) return trimmed;

  const sents = sentencesForPassageTrim(trimmed);
  let out = "";
  for (const sent of sents) {
    const piece = sent.trim();
    if (!piece) continue;
    const next = out ? `${out} ${piece}` : piece;
    if (next.length <= maxChars) {
      out = next;
    } else {
      break;
    }
  }

  if (out) {
    return out.length < trimmed.length ? `${out}…` : out;
  }

  const candidate = trimmed.slice(0, maxChars);
  let cut = -1;
  for (const marker of [".", "!", "?"]) {
    const idx = candidate.lastIndexOf(marker);
    if (idx > cut) cut = idx;
  }
  if (cut >= 0) {
    return `${candidate.slice(0, cut + 1)}…`;
  }
  return `${candidate.trimEnd()}…`;
}

function normalizePassageForComparison(text) {
  return String(text || "")
    // Curly single quotes -> straight
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    // Curly double quotes -> straight
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    // Em/en dashes and minus -> hyphen
    .replace(/[\u2013\u2014\u2015\u2212]/g, "-")
    // Non-breaking spaces and other unicode whitespace -> space
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, " ")
    // Collapse runs of whitespace
    .replace(/\s+/g, " ")
    .trim();
}

function stripTrailingEllipsis(passage) {
  const p = typeof passage === "string" ? passage : "";
  return p.replace(/…\s*$/u, "").trim();
}

function splitAbridgedSegments(normalizedPassage) {
  const safe = typeof normalizedPassage === "string" ? normalizedPassage : "";
  const SEP = " <<SEP>> ";
  let tagged = safe.replace(/\[\s*\.\.\.\s*\]/g, SEP).replace(/…/g, SEP);
  tagged = tagged.replace(/(^|[\s.!?])\.\.\.(?=$|[\s.!?])/g, `$1${SEP}`);
  const abridged = tagged.includes("<<SEP>>");
  if (!abridged) {
    return { abridged: false, segments: [safe] };
  }
  const segments = tagged
    .split("<<SEP>>")
    .map((s) => s.trim())
    .filter(Boolean);
  return { abridged: true, segments };
}

function validatePassageAgainstSource(passage, sourceText) {
  const p = stripTrailingEllipsis(passage);
  if (!p) return { accepted: false, abridged: false, segmentCount: 0 };
  const nSrc = normalizePassageForComparison(sourceText);
  const nPass = normalizePassageForComparison(p);
  if (!nPass) return { accepted: false, abridged: false, segmentCount: 0 };

  const split = splitAbridgedSegments(nPass);
  if (!split.abridged) {
    return { accepted: nSrc.includes(nPass), abridged: false, segmentCount: 1 };
  }
  if (split.segments.length === 0) {
    return { accepted: false, abridged: true, segmentCount: 0 };
  }

  const accepted = split.segments.every((segment) => nSrc.includes(segment));
  return { accepted, abridged: true, segmentCount: split.segments.length };
}

function normalizeValidResponse(parsed, sourceText, options = {}) {
  const classification = typeof parsed?.classification === "string" ? parsed.classification.trim() : "";
  if (!ALLOWED_CLASSIFICATIONS.has(classification)) return null;

  const explanationRaw = typeof parsed?.explanation === "string" ? parsed.explanation.trim() : "";
  const explanation = explanationRaw || "No explanation provided.";

  const source = typeof sourceText === "string" ? sourceText : "";
  const passageRaw = typeof parsed?.passage === "string" ? parsed.passage : "";
  let passage = trimPassageToLimit(passageRaw, 400);

  const sourceLabel =
    typeof options?.sourceLabel === "string" && options.sourceLabel.trim()
      ? options.sourceLabel.trim()
      : "unknown";
  if (passage) {
    const validation = validatePassageAgainstSource(passage, source);
    if (validation.accepted && validation.abridged) {
      console.debug(`[stage2] passage accepted as abridged (${validation.segmentCount} segments, all verbatim)`);
      if (typeof options?.traceId === "string" && options.traceId.trim()) {
        logCanaryScore({
          traceId: options.traceId.trim(),
          name: "stage2_passage_abridged_accepted",
          value: 1,
          comment: `source=${sourceLabel}; segments=${validation.segmentCount}`,
        });
      }
    }
    if (!validation.accepted) {
      const truncated = passage.length > 120 ? `${passage.slice(0, 120)}...` : passage;
      console.warn(`[stage2] passage rejected for source ${sourceLabel} after normalisation: "${truncated}"`);
      if (typeof options?.traceId === "string" && options.traceId.trim()) {
        logCanaryScore({
          traceId: options.traceId.trim(),
          name: "stage2_passage_rejected",
          value: 1,
          comment: `source=${sourceLabel}; passage="${truncated}"`,
        });
      }
      passage = "";
    }
  }

  return {
    classification,
    passage,
    explanation,
  };
}

function noSupportResult(sourceIndex, sourceLabel, explanation = DEFAULT_FAILURE_EXPLANATION) {
  return {
    sourceIndex,
    sourceLabel,
    classification: "no_support",
    passage: "",
    explanation,
  };
}

async function matchSingleSource(statement, sourceText, options = {}) {
  const stageModel = STAGE_MODELS["stage2-matching"];
  const userPrompt = `
Statement:
${statement}

Source:
${sourceText}
`.trim();

  const completion = await callLLM({
    provider: stageModel.provider,
    model: stageModel.model,
    temperature: 0,
    messages: [
      { role: "system", content: STAGE2_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    traceId: options.traceId,
    traceName: "qc-run",
    spanName: "qc-stage2-source-matching",
    metadata: options.metadata,
  });
  const raw = completion?.text ?? "";
  return { raw, parsed: safeJsonParse(raw) };
}

export async function matchAllSources(statement, sources, options = {}) {
  try {
    const safeStatement = typeof statement === "string" ? statement : "";
    const safeSources = Array.isArray(sources) ? sources : [];
    const stageModel = STAGE_MODELS["stage2-matching"];
    if (!hasProviderApiKey(stageModel.provider)) {
      return safeSources.map((source, index) => {
        const sourceLabel =
          (typeof source?.label === "string" && source.label.trim()) || `Source ${index + 1}`;
        const out = noSupportResult(index, sourceLabel, DEFAULT_FAILURE_EXPLANATION);
        return out;
      });
    }

    const tasks = safeSources.map(async (source, index) => {
      const sourceText = typeof source?.text === "string" ? source.text : "";
      const sourceLabel =
        (typeof source?.label === "string" && source.label.trim()) || `Source ${index + 1}`;
      try {
        const baseMetadata = { stage: "stage2", sourceIndex: index, sourceLabel };
        const first = await matchSingleSource(safeStatement, sourceText, {
          traceId: options.traceId,
          metadata: { ...baseMetadata, attempt: 1 },
        });
        let rawLLMResponse = first.raw;
        let normalized = normalizeValidResponse(first.parsed, sourceText, {
          sourceLabel,
          traceId: options.traceId,
        });
        if (!normalized) {
          logCanaryScore({
            traceId: options.traceId,
            name: "schema_validation_failed",
            value: 1,
            comment: `Stage 2 schema failed for ${sourceLabel} on first attempt.`,
          });
          logCanaryScore({
            traceId: options.traceId,
            name: "llm_retry_or_fallback",
            value: 1,
            comment: `Stage 2 retry triggered for ${sourceLabel}.`,
          });
          const second = await matchSingleSource(safeStatement, sourceText, {
            traceId: options.traceId,
            metadata: { ...baseMetadata, attempt: 2 },
          });
          rawLLMResponse = second.raw;
          normalized = normalizeValidResponse(second.parsed, sourceText, {
            sourceLabel,
            traceId: options.traceId,
          });
        }

        if (!normalized) {
          logCanaryScore({
            traceId: options.traceId,
            name: "schema_validation_failed",
            value: 1,
            comment: `Stage 2 schema failed for ${sourceLabel} on retry.`,
          });
          logCanaryScore({
            traceId: options.traceId,
            name: "llm_retry_or_fallback",
            value: 1,
            comment: `Stage 2 defaulted to no_support for ${sourceLabel}.`,
          });
          console.warn(`stage2: match call failed for source ${index}, defaulting to no_support`);
          const out = noSupportResult(index, sourceLabel, DEFAULT_FAILURE_EXPLANATION);
          return out;
        }

        const out = {
          sourceIndex: index,
          sourceLabel,
          classification: normalized.classification,
          passage: normalized.passage,
          explanation: normalized.explanation,
        };
        return out;
      } catch {
        logCanaryScore({
          traceId: options.traceId,
          name: "llm_retry_or_fallback",
          value: 1,
          comment: `Stage 2 call failed and defaulted for ${sourceLabel}.`,
        });
        console.warn(`stage2: match call failed for source ${index}, defaulting to no_support`);
        const out = noSupportResult(index, sourceLabel, DEFAULT_FAILURE_EXPLANATION);
        return out;
      }
    });

    return await Promise.all(tasks);
  } catch (err) {
    const safeSources = Array.isArray(sources) ? sources : [];
    const message = err?.message || String(err);
    return safeSources.map((source, index) => {
      const sourceLabel =
        (typeof source?.label === "string" && source.label.trim()) || `Source ${index + 1}`;
      const out = noSupportResult(
        index,
        sourceLabel,
        `Match call failed — defaulting to no_support. ${message}`
      );
      return out;
    });
  }
}
