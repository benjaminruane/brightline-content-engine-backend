/**
 * One source for the spelling choice.
 * Account storage keeps US / UK. This module is the wording and the dictionary names.
 */

export const SPELLING_US = "us";
export const SPELLING_BRITISH = "british";

const CHOICES = Object.freeze({
  [SPELLING_US]: Object.freeze({
    id: SPELLING_US,
    stored: "US",
    label: "US English",
    dictionary: "Merriam-Webster",
    display: "US English (Merriam-Webster)",
    prompt: "Use US English spelling (Merriam-Webster) throughout. Quoted source passages keep their own spelling.",
    check: "Flag UK spellings that should be US English. Do not change quoted source passages. A proper noun keeps its own spelling.",
  }),
  [SPELLING_BRITISH]: Object.freeze({
    id: SPELLING_BRITISH,
    stored: "UK",
    label: "British English",
    dictionary: "Oxford",
    display: "British English (Oxford)",
    prompt: "Use British English spelling (Oxford) throughout. Quoted source passages keep their own spelling.",
    check: "Flag US spellings that should be British English. Do not change quoted source passages. A proper noun keeps its own spelling.",
  }),
});

/** Normalise a stored or id value. Default is US English. */
export function spellingChoice(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value === "UK" || value === SPELLING_BRITISH || /^british$/i.test(value)) {
    return CHOICES[SPELLING_BRITISH];
  }
  return CHOICES[SPELLING_US];
}

export function spellingStored(raw) {
  return spellingChoice(raw).stored;
}

export function spellingDisplay(raw) {
  return spellingChoice(raw).display;
}

export function spellingPromptLine(raw) {
  return spellingChoice(raw).prompt;
}

export function spellingCheckLine(raw) {
  return spellingChoice(raw).check;
}

export function spellingOptions() {
  return [CHOICES[SPELLING_US], CHOICES[SPELLING_BRITISH]];
}
