import { VISIBILITY } from "../../output-intent.js";
import { actorName, buildBindingPrecedence, PG_WRITING_EVENT } from "../pg-binding.mjs";

export const label = "New direct investment";
export const mustCover = [
  "investment merits and thesis",
  "thematic fit within the firm's wider strategy",
  "history with the asset, if the source gives it",
  "the overall investment view",
  "what the company does, where, and its scale",
  "the transaction (stake, seller, co-investors, status stated exactly as the source states it)",
  "value creation plan",
  "Do not state the equity amount or the valuation multiple.",
];

export function completeBody(houseName) {
  const house = actorName(houseName);
  return `${buildBindingPrecedence(PG_WRITING_EVENT.NEW_DIRECT_INVESTMENT, VISIBILITY.COMPLETE, houseName)}

Objective: Draft a commentary addressing the transaction, focusing on the largest
component of the transaction if relevant.
Length and shape: Two paragraphs. The first describes the asset; the
second covers the investment merits and why ${house} was attracted to it.
Must include:
- Classification into lead, joint, or co-investment status, if known.
- A description of the asset and its business and operational highlights.
- A headline valuation metric (e.g. enterprise valuation) if relevant, but avoid
  detailed financial metrics.
- Investment merits, grouped into themes such as track record, entry valuation, and
  operating team.
- Why ${house} was attracted to the investment, in a more narrative tone.
- Why ${house} was invited or selected for the opportunity, if relevant
  (especially in co-investment scenarios).`;
}

export function publicBody(houseName) {
  return `${buildBindingPrecedence(PG_WRITING_EVENT.NEW_DIRECT_INVESTMENT, VISIBILITY.PUBLIC, houseName)}

Objective: As above, public-safe.
Length and shape: Single paragraph.
Constraints: Based only on publicly available information. Exclude anything overly
sensitive or not publicly verifiable.`;
}

export const guidance = completeBody(null);
