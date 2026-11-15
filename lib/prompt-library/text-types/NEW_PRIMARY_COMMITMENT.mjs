import { VISIBILITY } from "../../output-intent.js";
import { actorName, buildBindingPrecedence, PG_WRITING_EVENT } from "../pg-binding.mjs";

export const label = "New fund commitment";
export const mustCover = [];

export function completeBody(houseName) {
  const house = actorName(houseName);
  return `${buildBindingPrecedence(PG_WRITING_EVENT.NEW_FUND_COMMITMENT, VISIBILITY.COMPLETE, houseName)}

Objective: Draft a commentary addressing the transaction, focusing on the largest
component if relevant.
Length and shape: Two paragraphs. The first describes the fund; the
second covers the investment merits and why ${house} was attracted to it.
Must include:
- A description of the fund and its target size.
- The fund's investment strategy, and whether this is a new strategy or a continuation
  of an existing strategy.
- How many investments the fund intends to make.
- Key sectors the fund targets.
- Target equity value or enterprise values for each investment.
- The manager's value-creation approach, described both thematically and structurally
  (e.g. "digital transformation" and "Portfolio Support Group").
- Investment merits, grouped into themes such as track record, entry valuation, and
  operating team.
- Why ${house} was attracted to the investment, in a more narrative tone.
- If the fund has been seeded with certain assets or has already started investing,
  mention this and give a very brief description of the seed assets or assets already
  in the portfolio (e.g. name and description).

Narrative calibration:
- Write a thesis-led narrative, not a data dump. Integrate figures into sentences;
  never leave a bare figure as its own fragment.
- Include the fund's sector strategy / sector focus if present in the source.
- Include: fund strategy and target size, sector focus, the manager's value-creation
  approach, and why ${house} finds the strategy attractive. Lead with the
  investment thesis and thematic relevance.`;
}

export function publicBody(houseName) {
  return `${buildBindingPrecedence(PG_WRITING_EVENT.NEW_FUND_COMMITMENT, VISIBILITY.PUBLIC, houseName)}

Objective: As above, public-safe.
Length and shape: Single paragraph.
Constraints: Based only on publicly available information. Exclude anything overly
sensitive or not publicly verifiable.`;
}

export const guidance = completeBody(null);
