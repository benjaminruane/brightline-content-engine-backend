/**
 * Shared throwaway prompt pieces for the per-finding action-list harness.
 * Copied from shipped whole-draft rule (b) plus B134. Not the abandoned
 * per-statement prefix.
 */
export const SHIPPED_SILENCE_AND_B134 = `SILENCE AND SOURCE-STATED VALUES (shipped principle):
If the source STATES a specific value for what the draft asserts, put that source value in the proposed change (house style). Never invent a figure the source does not state.
When the source is SILENT or vague on what the draft asserts, leave the CLAIM exactly as written. Do not soften the claim, do not drop a figure, do not cut the clause, do not substitute a different fact, do not strip the actor so that a judgement becomes an unattributed statement. Silence is the absence of evidence, not evidence against the claim, and the author decides what to do about the CLAIM.
A source that contradicts the draft, or that states a value the draft got wrong or left unsupported, is not silence. Propose the source value.
One operation is permitted on a silent card when a craft or style_guide suggestedDirection names it, and only this operation: replace a first-person subject or object (we / our / us) with the named authoring organisation as grammatical subject (or as the object, when the pronoun is an object). Change nothing else in the sentence. Never delete the actor.
  "We believe X" -> "Halden Group believes X"
  "we recommend the commitment" -> "Halden Group recommends the commitment"
  "available to us" -> "available to Halden Group"
Never "X". Never "is believed". Never "is recommended". THE ACTOR STAYS. Do not recast into an agentless or passive construction such as "was attractive", "is considered", "is expected to", "it is noted that", or "is recommended".
Preserve every hedge and modal exactly. Only the grammatical subject or object pronoun changes.
Still forbidden on a silent card: deleting evaluative language; neutralising a causal verb; removing a hedge or modal; substituting a different fact; completing a fragment; deleting a view-marker; or any other craft operation not named above.
NEVER SUBSTITUTE A DIFFERENT FACT. Where the source is silent on what the draft asserts, do not replace the draft's claim with some other statement drawn from the source.
For a conflict: if the source passage states a competing value, the proposed change must carry that source value, not a vague hedge.
For a partial: keep the confirmed portion unchanged. If the source states a specific value for the unsupported element, that value is the proposed change. If the source is silent on the unsupported element, do not propose an edit to the claim.`;

export function findingBlock(finding) {
  const thing1 = finding.thing1?.quote || finding.statement;
  const direction =
    typeof finding.suggestedDirection === "string" && finding.suggestedDirection.trim()
      ? finding.suggestedDirection.trim()
      : "(none)";
  const excerpt = finding.primaryExcerpt || "(none)";
  return `id: ${finding.id}
kind: ${finding.kind}
rule: ${finding.rule}
ORIGINAL statement: ${finding.statement}
Thing 1 (offending ORIGINAL span, copied from Review): ${thing1}
Thing 2 (what is wrong, copied from Review): ${finding.thing2}
Review suggestedDirection: ${direction}
Source excerpt, if any: ${excerpt}`;
}

export function buildArmOnePrompt(finding, authoringOrganisation) {
  return `You propose ONE revision action for ONE Review finding. You are not rewriting the rest of the draft. Do not return an id.

${SHIPPED_SILENCE_AND_B134}

Authoring organisation: ${authoringOrganisation}

${findingBlock(finding)}

Return JSON only:
{
  "proposedChange": "the exact replacement text for the offending part, or a short description of a deletion, or KEEP if the shipped silence rule forbids an edit",
  "why": "why this fix rather than another, specific to THIS finding, in plain words. Not a class label. Not 'revised this span'."
}`;
}

export function buildArmTwoPrompt(findings, authoringOrganisation) {
  const blocks = findings.map((f, i) => `FINDING ${i + 1}\n${findingBlock(f)}`).join("\n\n");
  const ids = findings.map((f) => f.id).join("\n");
  return `You propose one revision action per Review finding below. Return one object per finding, keyed by the harness id exactly as issued. You must use those ids. Do not invent ids. Do not omit an issued id. Do not merge two findings into one object.

${SHIPPED_SILENCE_AND_B134}

Authoring organisation: ${authoringOrganisation}

Issued ids (the expected set):
${ids}

${blocks}

Return JSON only:
{
  "actions": [
    {
      "id": "one of the issued ids, copied exactly",
      "proposedChange": "the exact replacement text for the offending part, or a short description of a deletion, or KEEP if the shipped silence rule forbids an edit",
      "why": "why this fix rather than another, specific to THIS finding, in plain words. Not a class label. Not 'revised this span'."
    }
  ]
}`;
}

export function parseJsonObject(text) {
  const trimmed = String(text ?? "").trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/;
  const unfenced = fence.test(trimmed) ? trimmed.replace(fence, "$1").trim() : trimmed;
  try {
    const parsed = JSON.parse(unfenced);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(unfenced.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function decisionVerb(proposedChange) {
  const t = String(proposedChange ?? "").trim();
  if (!t) return "UNKNOWN";
  if (/^keep\b/i.test(t)) return "KEEP";
  if (/^delete\b|^remove\b/i.test(t) || /\bDELETE\b/.test(t)) return "DELETE";
  return "REPLACE";
}
