/**
 * Review reads the style guide through this module.
 * The rule text lives in lib/style-guide/guide.mjs.
 */
import { renderReviewStyleRules, resolveStyleChoices } from "../style-guide/render.mjs";

const ALL_RULES = renderReviewStyleRules(resolveStyleChoices(null), { all: true });

export const STYLE_GUIDE_LAYER_1 = ALL_RULES.filter((rule) => rule.layer === 1);
export const STYLE_GUIDE_LAYER_2_CLIENT = ALL_RULES.filter((rule) => rule.layer === 2);

export function selectStyleGuideClient(_documentContext) {
  return "CLIENT";
}

export function resolveStyleGuide(documentContext = {}) {
  const choices = resolveStyleChoices({
    ...(documentContext.houseStyle && typeof documentContext.houseStyle === "object" ? documentContext.houseStyle : {}),
    ...(documentContext.styleChoices && typeof documentContext.styleChoices === "object" ? documentContext.styleChoices : {}),
  });
  return renderReviewStyleRules(choices, documentContext);
}

export function formatStyleGuideRulesForPrompt(rules) {
  const blocks = (Array.isArray(rules) ? rules : []).map((rule) => {
    let block = `- ${rule.id}: ${rule.description}\n  Correct: ${rule.correct_example}\n  Incorrect: ${rule.incorrect_example}`;
    if (typeof rule.fixDirection === "string" && rule.fixDirection.trim()) {
      block += `\n  fixDirection: ${rule.fixDirection.trim()}`;
    }
    return block;
  });
  return `Apply the following style rules. When you raise a concern that corresponds to one of these rules, include the rule id in the concern's \`rule\` field.\n\n${blocks.join("\n\n")}`;
}
