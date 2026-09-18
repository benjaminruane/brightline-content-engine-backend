export const PLACEHOLDER_GUARD_MESSAGE =
  "The rewrite came back with a placeholder in it, so your draft has not changed. Add the missing detail to the draft, or try again.";

// Letter-and-space interiors only, so numbered citations such as [1] still pass.
const LETTER_PLACEHOLDER_RE = /\[[A-Za-z][A-Za-z ]{0,80}\]/;

export function draftContainsBracketedPlaceholder(text) {
  return LETTER_PLACEHOLDER_RE.test(String(text ?? ""));
}

export function applyPlaceholderGuard(modelOutput, previousText) {
  const next = typeof modelOutput === "string" ? modelOutput : "";
  if (draftContainsBracketedPlaceholder(next)) {
    return {
      accepted: false,
      text: typeof previousText === "string" ? previousText : "",
      message: PLACEHOLDER_GUARD_MESSAGE,
    };
  }
  return { accepted: true, text: next, message: null };
}
