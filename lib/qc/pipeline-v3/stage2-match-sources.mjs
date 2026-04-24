import { callOpenAI, logCanaryScore } from "../../observability.js";

const STAGE2_MODEL = "gpt-4o";
const ALLOWED_CLASSIFICATIONS = new Set([
  "confirmed",
  "partially_confirmed",
  "conflicting",
  "no_support",
]);

const DEFAULT_FAILURE_EXPLANATION = "Match call failed — defaulting to no_support.";

const STAGE2_SYSTEM_PROMPT = `
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

/** Pairs: smart / curly punctuation → ASCII (after NFKC). Order-independent per-char replace. */
const MATCH_TEXT_PUNCT_REPLACEMENTS = [
  ["\u2018", "'"],
  ["\u2019", "'"],
  ["\u201A", "'"],
  ["\u201B", "'"],
  ["\u201C", '"'],
  ["\u201D", '"'],
  ["\u201E", '"'],
  ["\u201F", '"'],
  ["\u2014", "-"],
  ["\u2013", "-"],
  ["\u2012", "-"],
  ["\u2015", "-"],
  ["\u2026", "..."],
];

function normalizeMatchText(s) {
  let t = String(s || "").normalize("NFKC");
  for (const [from, to] of MATCH_TEXT_PUNCT_REPLACEMENTS) {
    if (t.includes(from)) {
      t = t.split(from).join(to);
    }
  }
  t = t.replace(/[\u2022\u00B7]/g, "");
  t = t.replace(/\uFFFD/g, "");
  return t.toLowerCase().replace(/\s+/g, " ").trim();
}

/** A8.18: same as normalizeMatchText but keeps U+FFFD in the source for wildcard matching. */
function normalizeMatchTextKeepFffd(s) {
  let t = String(s || "").normalize("NFKC");
  for (const [from, to] of MATCH_TEXT_PUNCT_REPLACEMENTS) {
    if (t.includes(from)) {
      t = t.split(from).join(to);
    }
  }
  t = t.replace(/[\u2022\u00B7]/g, "");
  return t.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Substring match where each U+FFFD in haystack matches exactly one character in needle.
 * Equivalent to a regex built from haystack with FFFD as `.` and a window the length of needle.
 */
function wildcardSubstringMatch(needle, haystack) {
  if (!needle || haystack.length < needle.length) return false;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      const h = haystack[i + j];
      if (h === "\uFFFD") continue;
      if (h !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

function stripTrailingEllipsis(passage) {
  const p = typeof passage === "string" ? passage : "";
  return p.replace(/…\s*$/u, "").trim();
}

function passageSentencesForValidation(passage) {
  const core = stripTrailingEllipsis(passage);
  if (!core) return [];
  const parts = core.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [core];
}

function passageAcceptableInSourceFirstPass(passage, sourceText) {
  const p = stripTrailingEllipsis(passage);
  if (!p) return false;
  const nSrc = normalizeMatchText(sourceText);
  const nPass = normalizeMatchText(p);
  if (nSrc.includes(nPass)) return true;
  const pieces = passageSentencesForValidation(p).map((x) => normalizeMatchText(x)).filter(Boolean);
  if (pieces.length <= 1) return false;
  return pieces.every((piece) => piece.length > 0 && nSrc.includes(piece));
}

function passageAcceptableInSourceSecondPass(passage, sourceText) {
  const p = stripTrailingEllipsis(passage);
  if (!p) return false;
  const nSrc = normalizeMatchTextKeepFffd(sourceText);
  const nPass = normalizeMatchText(p);
  if (!nPass) return false;
  if (wildcardSubstringMatch(nPass, nSrc)) return true;
  const pieces = passageSentencesForValidation(p).map((x) => normalizeMatchText(x)).filter(Boolean);
  if (pieces.length <= 1) return false;
  return pieces.every((piece) => piece.length > 0 && wildcardSubstringMatch(piece, nSrc));
}

function normalizeValidResponse(parsed, sourceText) {
  const classification = typeof parsed?.classification === "string" ? parsed.classification.trim() : "";
  if (!ALLOWED_CLASSIFICATIONS.has(classification)) return null;

  const explanationRaw = typeof parsed?.explanation === "string" ? parsed.explanation.trim() : "";
  const explanation = explanationRaw || "No explanation provided.";

  const source = typeof sourceText === "string" ? sourceText : "";
  const passageRaw = typeof parsed?.passage === "string" ? parsed.passage : "";
  let passage = trimPassageToLimit(passageRaw, 400);

  if (passage) {
    const firstOk = passageAcceptableInSourceFirstPass(passage, source);
    if (!firstOk) {
      const secondOk = passageAcceptableInSourceSecondPass(passage, source);
      if (!secondOk) {
        passage = "";
      }
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
  const userPrompt = `
Statement:
${statement}

Source:
${sourceText}
`.trim();

  const completion = await callOpenAI({
    model: STAGE2_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: STAGE2_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  }, {
    traceId: options.traceId,
    traceName: "qc-run",
    spanName: "qc-stage2-source-matching",
    metadata: options.metadata,
  });
  const raw = completion?.choices?.[0]?.message?.content ?? "";
  return { raw, parsed: safeJsonParse(raw) };
}

export async function matchAllSources(statement, sources, options = {}) {
  try {
    const safeStatement = typeof statement === "string" ? statement : "";
    const safeSources = Array.isArray(sources) ? sources : [];
    if (!process.env.OPENAI_API_KEY) {
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
        let normalized = normalizeValidResponse(first.parsed, sourceText);
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
          normalized = normalizeValidResponse(second.parsed, sourceText);
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
