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
  default: `
Write in a professional, concise investment style suitable for institutional investors.
- Prioritise factual accuracy and clarity over marketing language.
- Emphasise what happened, why it matters, and the implications for investors.
- Assume the reader has a solid financial background but limited time.
`,

  new_investment: `
New direct investment announcement.

Focus on:
- Clear description of the company / asset (sector, geography, business model).
- Deal type (majority / minority, growth, buyout, co-investment, etc.).
- Investment thesis: key value drivers, growth levers, differentiators.
- Role of your firm (lead, co-lead, consortium, partnership, etc.).
- Any value-creation or stewardship themes (governance, operational improvement, ESG where genuinely material).
- Forward-looking comments must be measured and consistent with a professional, non-promotional tone.
Avoid over-claiming, hard forecasts, or anything that could be interpreted as financial advice.
`,

  new_fund_commitment: `
New fund commitment (LP commitment to a fund or programme).

Focus on:
- Fund name, strategy, and target sectors/regions.
- Manager identity (GP), their track record and platform strengths.
- Rationale for committing: strategic fit, diversification, access, cycle positioning.
- Structure of the commitment (primary, secondary, co-investment sleeve, evergreen vs closed-end where relevant).
- Role of the commitment in the broader portfolio (e.g. building exposure to a theme or region).
Tone:
- Disciplined, allocators' perspective.
- Avoid marketing slogans; emphasise due diligence, selectivity, and portfolio construction.
`,

  exit_realisation: `
Exit / realisation announcement.

Focus on:
- What has been realised: company/asset name, sector, geography.
- Type of exit (trade sale, secondary buyout, IPO, refinancing, partial vs full realisation).
- Holding period and key value-creation themes during ownership (operational improvements, strategic repositioning, governance, etc.).
- High-level outcome (successful realisation, strong performance, disciplined exit) without disclosing confidential numbers unless explicitly provided.
- Portfolio implications (e.g. de-risking, recycling capital, track record continuity).
Tone:
- Balanced and professional, avoiding excessive celebration.
- Do not invent multiples, returns, or numerical performance metrics.
`,

  portfolio_update: `
Portfolio update / hold position commentary.

Focus on:
- Current status of selected portfolio assets or strategies.
- Key developments since the last update (operational, strategic, market-related).
- Risk and opportunity balance: don’t only highlight positives; acknowledge material challenges where relevant.
- How the assets or strategies are positioned going forward (without providing detailed forecasts).
Tone:
- Calm, measured, and analytical.
- Aim to help an informed investor understand how the portfolio is evolving and why.
`,

  revaluation: `
Revaluation-driven update (fair value change, write-up, write-down).

Focus on:
- The fact and direction of the revaluation (increase, decrease, stable) and whether it is realised or unrealised.
- The primary drivers of the change (trading performance, comparable multiples, discount rate, FX, one-offs, etc.).
- How the valuation remains grounded in robust methodology and governance.
- Portfolio-level impact where appropriate (e.g. contribution to performance, risk metrics).
Tone:
- Sober, transparent, and technically grounded.
- Avoid spin: do not over-justify positive changes or downplay negative ones.
- Do not invent specific valuations, price levels, IRRs, or multiples beyond what is explicitly provided in the source material.
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
