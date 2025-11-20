// helpers/promptRecipes.js

export const OUTPUT_TYPES = {
  press_release: "press_release",
  investment_note: "investment_note",
  linkedin_post: "linkedin_post",
  transaction_text: "transaction_text",
};

const baseSystemPrompt = `
You are an expert investment writer producing institutional-grade content.
Follow the provided style guide exactly.
Use a clear, structured format and avoid marketing fluff.
Write for sophisticated investors who care about facts, risks, and rationale.
`;

const baseTemplate = `
Write a {{outputTypeLabel}} for the scenario "{{scenario}}".

Title:
{{title}}

Notes from the user (constraints, must-include points):
{{notes}}

Source material to base your writing on:
{{text}}

Instructions:
- Follow the style guide carefully.
- Do not invent facts; rely on the source material.
- Use clear structure, headings, and short paragraphs.
`;

// Extra guidance for different scenarios
export const SCENARIO_INSTRUCTIONS = {
  new_investment: `
- Emphasise what was acquired or invested in, who the counterparties are, and the strategic rationale.
- Include, where appropriate, the strategy, sector, and how this fits into the firm's investment themes.
- If size or financial terms are not disclosed, avoid inventing them; use neutral language like "undisclosed terms".
`,

  exit_realisation: `
- Emphasise what asset or company is being exited, who the buyer is (if known), and how long the asset was held.
- Focus on value creation, key achievements, and high-level performance, without disclosing confidential numbers unless provided.
- Highlight continuity for management teams and clients where relevant.
`,

  portfolio_update: `
- Focus on operational progress, milestones, and key developments for existing portfolio companies or assets.
- Group related developments logically (by theme, sector, or geography) to make the update easy to scan.
- Keep the tone balanced: transparent about challenges, clear on positive progress.
`,

  default: `
- Provide balanced, factual context for the situation.
- Emphasise what is most relevant for an institutional investor trying to understand "what happened" and "why it matters".
`,
};

export const PROMPT_RECIPES = {
  default: {
    systemPrompt: baseSystemPrompt,
    templates: {
      press_release: baseTemplate.replace("{{outputTypeLabel}}", "press release"),
      investment_note: baseTemplate.replace("{{outputTypeLabel}}", "investment note"),
      linkedin_post: baseTemplate.replace("{{outputTypeLabel}}", "LinkedIn post"),
      transaction_text: baseTemplate.replace(
        "{{outputTypeLabel}}",
        "short internal transaction description"
      ),
    },
  },
};
