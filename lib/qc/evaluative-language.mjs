// lib/qc/evaluative-language.mjs
// Shared contract for marketing_language_excess and hyperbole_vs_qualitative:
// delete an unsupported evaluative word, or keep and flag it. Never substitute
// a milder one.

export const EVALUATIVE_LANGUAGE_INSTRUCTION = `Never substitute a milder evaluative word for a stronger one. Replacing "exceptional" with "strong" launders the claim: the milder word reads as considered judgement, the claim is no better supported, and it is then harder to challenge. This is the same test already applied to unsupported figures: never approximate an author's unbacked number into a vaguer one.

Apply one test. After the evaluative word is removed, does the remaining clause still tell a reader something?

If yes, delete the evaluative word and any intensifier attached only to it. Leave the rest. The figures or the substantive word were always doing the work. If deleting the word leaves stranded scaffolding ("that is", "which is", a hanging colon), delete that scaffolding too so the remainder still reads as a sentence. Do not fill the hole with a quieter adjective.
  "a track record that is genuinely exceptional: 2.4x gross MOIC and 21% gross IRR across seventeen exits" -> "a track record of 2.4x gross MOIC and 21% gross IRR across seventeen exits"
  "origination that is genuinely proprietary" -> "origination that is proprietary"

Deleting only an intensifier in front of a standard qualitative descriptor is substituting a milder evaluation. "exceptionally strong" must not become "strong". "genuinely exceptional" must not become "exceptional". Keep the whole phrase and flag it.

Deleting an intensifier in front of a substantive, non-evaluative word is not substitution. "proprietary" still tells the reader what the origination is. Delete "genuinely" and keep "proprietary".

If no, the evaluation is the whole point of the clause. Keep the wording and flag it. Do not weaken it and do not silently cut the author's point.
  "which in this market is a genuine differentiator" stays. Flag it.
  "The franchise is exceptionally strong." stays. Flag it. Do not rewrite it as "The franchise is strong."

Do not flag standard qualitative descriptors such as "strong", "high-quality", "leading" (when applied to widely-accepted market positions), "well-positioned", "robust", "defensible", "compelling", "solid" when those words are the author's original wording. They are the working vocabulary of investment writing. Do not suggest them as replacements for hyperbole.`;

export const EVALUATIVE_LANGUAGE_FIX_DIRECTION =
  "Apply the remaining-clause test. If the clause still informs after the evaluative word is removed, begin with Delete and quote that word (and its intensifier). Example: \"Delete 'genuinely exceptional'.\" If the evaluation is the whole point of the clause, begin with Keep and quote the phrase. Example: \"Keep 'genuine differentiator' and flag it. Removing the evaluation would empty the clause.\" Never begin with Replace. Never offer a milder synonym. Wrong: Delete 'exceptionally strong' and rewrite as 'The franchise is strong.' That is a milder substitution. Right: Keep 'exceptionally strong' and flag it.";
