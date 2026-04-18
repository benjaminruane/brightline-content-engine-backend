import OpenAI from "openai";
import { logStage } from "./stage-logger.mjs";

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

function passageAcceptableInSource(passage, sourceText) {
  const p = stripTrailingEllipsis(passage);
  if (!p) return false;
  const nSrc = normalizeMatchText(sourceText);
  const nPass = normalizeMatchText(p);
  if (nSrc.includes(nPass)) return true;
  const pieces = passageSentencesForValidation(p).map((x) => normalizeMatchText(x)).filter(Boolean);
  if (pieces.length <= 1) return false;
  return pieces.every((piece) => piece.length > 0 && nSrc.includes(piece));
}

function normalizeValidResponse(parsed, sourceText, traceContext, sourceLabel) {
  const classification = typeof parsed?.classification === "string" ? parsed.classification.trim() : "";
  if (!ALLOWED_CLASSIFICATIONS.has(classification)) return null;

  const explanationRaw = typeof parsed?.explanation === "string" ? parsed.explanation.trim() : "";
  const explanation = explanationRaw || "No explanation provided.";

  const source = typeof sourceText === "string" ? sourceText : "";
  const passageRaw = typeof parsed?.passage === "string" ? parsed.passage : "";
  let passage = trimPassageToLimit(passageRaw, 400);

  if (passage && !passageAcceptableInSource(passage, source)) {
    if (traceContext?.runId) {
      logStage({
        runId: traceContext.runId,
        stmtIndex: traceContext.stmtIndex,
        stage: "stage2_passage_rejected",
        payload: {
          sourceLabel: sourceLabel ?? null,
          passagePreview: passageRaw.slice(0, 200),
        },
      });
    }
    passage = "";
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

async function matchSingleSource(client, statement, sourceText) {
  const userPrompt = `
Statement:
${statement}

Source:
${sourceText}
`.trim();

  const completion = await client.chat.completions.create({
    model: STAGE2_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: STAGE2_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });
  const raw = completion?.choices?.[0]?.message?.content ?? "";
  return { raw, parsed: safeJsonParse(raw) };
}

export async function matchAllSources(statement, sources, traceContext = null) {
  try {
    const safeStatement = typeof statement === "string" ? statement : "";
    const safeSources = Array.isArray(sources) ? sources : [];
    if (!process.env.OPENAI_API_KEY) {
      return safeSources.map((source, index) => {
        const sourceLabel =
          (typeof source?.label === "string" && source.label.trim()) || `Source ${index + 1}`;
        const out = noSupportResult(index, sourceLabel, DEFAULT_FAILURE_EXPLANATION);
        if (traceContext?.runId) {
          logStage({
            runId: traceContext.runId,
            stmtIndex: traceContext.stmtIndex,
            stage: "stage2",
            payload: {
              sourceLabel,
              classification: out.classification,
              passage: out.passage,
              explanation: out.explanation,
              rawLLMResponse: "",
            },
          });
        }
        return out;
      });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const tasks = safeSources.map(async (source, index) => {
      const sourceText = typeof source?.text === "string" ? source.text : "";
      const sourceLabel =
        (typeof source?.label === "string" && source.label.trim()) || `Source ${index + 1}`;
      try {
        const first = await matchSingleSource(client, safeStatement, sourceText);
        let rawLLMResponse = first.raw;
        let normalized = normalizeValidResponse(first.parsed, sourceText, traceContext, sourceLabel);
        if (!normalized) {
          const second = await matchSingleSource(client, safeStatement, sourceText);
          rawLLMResponse = second.raw;
          normalized = normalizeValidResponse(second.parsed, sourceText, traceContext, sourceLabel);
        }

        if (!normalized) {
          console.warn(`stage2: match call failed for source ${index}, defaulting to no_support`);
          const out = noSupportResult(index, sourceLabel, DEFAULT_FAILURE_EXPLANATION);
          if (traceContext?.runId) {
            logStage({
              runId: traceContext.runId,
              stmtIndex: traceContext.stmtIndex,
              stage: "stage2",
              payload: {
                sourceLabel,
                classification: out.classification,
                passage: out.passage,
                explanation: out.explanation,
                rawLLMResponse,
              },
            });
          }
          return out;
        }

        const out = {
          sourceIndex: index,
          sourceLabel,
          classification: normalized.classification,
          passage: normalized.passage,
          explanation: normalized.explanation,
        };
        if (traceContext?.runId) {
          logStage({
            runId: traceContext.runId,
            stmtIndex: traceContext.stmtIndex,
            stage: "stage2",
            payload: {
              sourceLabel,
              classification: out.classification,
              passage: out.passage,
              explanation: out.explanation,
              rawLLMResponse,
            },
          });
        }
        return out;
      } catch {
        console.warn(`stage2: match call failed for source ${index}, defaulting to no_support`);
        const out = noSupportResult(index, sourceLabel, DEFAULT_FAILURE_EXPLANATION);
        if (traceContext?.runId) {
          logStage({
            runId: traceContext.runId,
            stmtIndex: traceContext.stmtIndex,
            stage: "stage2",
            payload: {
              sourceLabel,
              classification: out.classification,
              passage: out.passage,
              explanation: out.explanation,
              rawLLMResponse: "",
            },
          });
        }
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
      if (traceContext?.runId) {
        logStage({
          runId: traceContext.runId,
          stmtIndex: traceContext.stmtIndex,
          stage: "stage2",
          payload: {
            sourceLabel,
            classification: out.classification,
            passage: out.passage,
            explanation: out.explanation,
            rawLLMResponse: "",
          },
        });
      }
      return out;
    });
  }
}
