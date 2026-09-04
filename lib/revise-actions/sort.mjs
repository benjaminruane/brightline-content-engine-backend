/**
 * Two-question sort: does a source speak to this claim, and does the inherited
 * policy permit the fix this finding asks for on this card.
 * Does not reuse the silent-card withhold filter.
 */
import { isFirstPersonActorRule, statementHasFirstPersonPronoun } from "../qc/first-person-actor.mjs";
import { inventoryStatements } from "./inventory.mjs";
import { statementIsSilent } from "./silence.mjs";

export const NO_PROPOSAL = {
  policy_forbids:
    "This concern stands. No source speaks to the claim, so changing the wording is yours to decide, not the product's.",
  silence_no_edit:
    "No supplied source speaks to this claim, either way. Nothing is proposed and the wording is yours.",
  visible_signal: "This concern is on the card so you can see it. Nothing is proposed.",
  first_person_unnamed:
    "This sentence is written in the first person, which reporting commentary does not allow. Nothing is proposed. Rewrite it in the third person.",
};

function hasDirection(finding) {
  return typeof finding.suggestedDirection === "string" && finding.suggestedDirection.trim().length > 0;
}

function sortedRecord(finding, { disposition, policyPermit, silenceOnCard, reasonCode }) {
  const { card, ...rest } = finding;
  const entry = {
    ...rest,
    disposition,
    sort: {
      policyPermit,
      silenceOnCard,
      rule: finding.rule,
      reasonCode,
    },
  };
  if (disposition === "ACKNOWLEDGE") {
    entry.noProposalReason = NO_PROPOSAL[reasonCode] || NO_PROPOSAL.visible_signal;
  }
  void card;
  return entry;
}

function action(finding, silenceOnCard, reasonCode = "permitted") {
  return sortedRecord(finding, {
    disposition: "ACTION",
    policyPermit: true,
    silenceOnCard,
    reasonCode,
  });
}

function acknowledge(finding, silenceOnCard, reasonCode) {
  return sortedRecord(finding, {
    disposition: "ACKNOWLEDGE",
    policyPermit: false,
    silenceOnCard,
    reasonCode,
  });
}

function firstPersonWithoutPronoun(finding) {
  return (
    isFirstPersonActorRule(finding.rule, finding.rule) &&
    !statementHasFirstPersonPronoun(finding.statement)
  );
}

export function sortFinding(finding, silenceOnCard) {
  const kind = finding.kind;

  if (kind === "framing" || kind === "recency") {
    return acknowledge(finding, silenceOnCard, "visible_signal");
  }

  if (kind === "evidence") {
    if (silenceOnCard) return acknowledge(finding, silenceOnCard, "silence_no_edit");
    return action(finding, silenceOnCard);
  }

  if (kind === "editorial" || kind === "compliance") {
    if (silenceOnCard) {
      if (kind === "editorial" && isFirstPersonActorRule(finding.rule, finding.rule)) {
        if (firstPersonWithoutPronoun(finding)) {
          return acknowledge(finding, silenceOnCard, "visible_signal");
        }
        return action(finding, silenceOnCard);
      }
      return acknowledge(finding, silenceOnCard, "policy_forbids");
    }
    if (hasDirection(finding)) {
      if (kind === "editorial" && firstPersonWithoutPronoun(finding)) {
        return acknowledge(finding, silenceOnCard, "visible_signal");
      }
      return action(finding, silenceOnCard);
    }
    return acknowledge(finding, silenceOnCard, "visible_signal");
  }

  return acknowledge(finding, silenceOnCard, "visible_signal");
}

export function buildSortedEntries(statements) {
  const findings = inventoryStatements(statements);
  return findings.map((finding) => sortFinding(finding, statementIsSilent(finding.card)));
}
