// utils/scoreDraft.js
//
// A lightweight heuristic evaluator that produces a 0–1 reliability score.
// This does NOT call the LLM – it uses simple structural and content signals.
// Frontend can convert to 0–100% for display.
//
// Heuristics considered (all very rough but cheap and stable):
// - Length (too short or extremely long is penalised)
// - Number of sentences / paragraphs
// - Presence of years / percentages / numbers (mild positive signal)
// - Red-flag phrases that usually indicate "bad" AI output
//
// IMPORTANT: This function is async only so it fits the existing `await scoreDraft(...)`
// call sites in /api/generate and /api/rewrite.

export async function scoreDraft(text, model) {
  if (!text || typeof text !== "string") {
    return 0.4; // slightly below neutral if we have nothing
  }

  const raw = text.trim();
  if (!raw) return 0.4;

  const words = raw.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const sentenceCount = (raw.match(/[.!?]+/g) || []).length;
  const paragraphCount = raw.split(/\n{2,}/).filter(Boolean).length || 1;

  let score = 0.5; // start from neutral

  // --- Length factor ---------------------------------------------------------
  // Penalise extremely short or very long drafts, reward "reasonable" length.
  if (wordCount < 50) {
    score -= 0.15;
  } else if (wordCount < 150) {
    score -= 0.05;
  } else if (wordCount > 1200) {
    score -= 0.05;
  } else {
    score += 0.05;
  }

  // --- Structure factor ------------------------------------------------------
  // A few sentences and multiple paragraphs is usually better than one blob.
  if (sentenceCount >= 4) score += 0.05;
  if (sentenceCount >= 8) score += 0.03;
  if (paragraphCount >= 2) score += 0.05;
  if (paragraphCount >= 4) score += 0.02;

  // --- Content hints ---------------------------------------------------------
  const lower = raw.toLowerCase();

  // Mild positive signals: years / percentages / numeric detail
  if (/\b\d{4}\b/.test(raw)) score += 0.03; // likely years
  if (/\b\d+(\.\d+)?%/.test(raw)) score += 0.03; // percentages
  if (/\b\d{1,3}(,\d{3})+\b/.test(raw)) score += 0.03; // large formatted numbers

  // Mild positive if it uses headings / bullets
  if (/^#+\s/m.test(raw) || /(?:^|\n)\s*[-*•]\s+/m.test(raw)) {
    score += 0.02;
  }

  // --- Red flags -------------------------------------------------------------
  // Very rough, but catches some obviously bad patterns.
  const redFlagPhrases = [
    "as an ai language model",
    "lorem ipsum",
    "placeholder text",
    "cannot browse the internet",
    "i do not have access to real-time data",
  ];

  if (redFlagPhrases.some((p) => lower.includes(p))) {
    score -= 0.3;
  }

  // Overuse of ALL CAPS can be a mild negative signal.
  const capsMatches = raw.match(/[A-Z]{4,}/g);
  if (capsMatches && capsMatches.length > 10) {
    score -= 0.05;
  }

  // --- Clamp to [0, 1] -------------------------------------------------------
  if (!Number.isFinite(score)) score = 0.5;

  score = Math.max(0, Math.min(1, score));
  return score;
}
