// lib/rulebook/complianceRules.js
// A8.23: Compliance rulebook (curated). reviewerNote is prompt guidance only, not user-facing.

const ALL = ["reporting_commentary", "investor_letter", "press_release", "linkedin_post"];
const TWO_RC_IL = ["reporting_commentary", "investor_letter"];
const PR_LI = ["press_release", "linkedin_post"];

export default [
  {
    id: "promissory_or_guaranteed_language",
    category: "compliance",
    severity: "hard_concern",
    description:
      "Language that promises or guarantees investment outcomes. Words and phrases like 'guaranteed', 'risk-free', 'certain to', 'will return', 'no chance of loss', or any language framing future investment returns as certainties.",
    appliesTo: [...ALL],
    appliesToVersion: null,
  },
  {
    id: "return_figure_gross_net_qualifier_missing",
    category: "compliance",
    severity: "soft_concern",
    description:
      "Return figures (multiples such as '2.5x', IRRs such as '12% IRR', dollar-amount returns, realised returns) presented without a gross-or-net-of-fees qualifier. The qualifier may be 'gross', 'net', 'gross of fees', 'net of fees', 'before fees', or 'after fees', and must appear in the sentence or the immediately surrounding context.",
    appliesTo: [...ALL],
    appliesToVersion: null,
  },
  {
    id: "forward_looking_statement_without_qualifier",
    category: "compliance",
    severity: "hard_concern",
    description:
      "Forward-looking statements (projections, forecasts, expectations, 'will', 'expects to', 'projected to', 'anticipates') without an uncertainty qualifier ('may', 'could', 'expected', 'subject to market conditions') or a disclaimer nearby.",
    appliesTo: [...ALL],
    appliesToVersion: null,
  },
  {
    id: "precise_confidential_detail_in_public_version",
    category: "compliance",
    severity: "hard_concern",
    description:
      "Content with the hallmarks of confidentiality in a public version: specific LP names; exact fund-level returns metrics (IRR, MOIC, TVPI, DPI, RVPI) rather than stated ranges; named portfolio-company financials (EBITDA, revenue, margin) not publicly disclosed; specific valuation figures (pre-money, post-money, enterprise value); valuation multiples (e.g. EV/EBITDA, EV/Revenue, P/E); specific deal terms (liquidation preference, preferred structure, board composition). The reviewer flags for human confirmation — the reviewer cannot verify what is NDA-bound, only that the content has the shape of confidential detail.",
    appliesTo: [...ALL],
    appliesToVersion: ["public"],
    reviewerNote:
      "Frame this concern as a review prompt, not a definitive finding. Example note: 'This sentence names a specific LP and appears in a public version. Confirm this disclosure is permitted before publishing.'",
  },
  {
    id: "expected_disclosure_language_absent_on_public",
    category: "compliance",
    severity: "soft_concern",
    description:
      "External-facing content (investor letter or press release) in Public visibility that makes performance claims, forward-looking statements, or investment-related representations without accompanying disclosure language a typical professional audience would expect (e.g. 'past performance is not a guide to future returns', 'this is not investment advice', forward-looking-statements disclaimer, jurisdiction-specific risk statements). The reviewer flags the absence — the reviewer cannot determine which specific disclosure is required for the jurisdiction or audience.",
    appliesTo: ["investor_letter", "press_release"],
    appliesToVersion: ["public"],
    reviewerNote:
      "Frame as review prompt, not a determination. Example: 'This sentence makes a forward-looking claim in a public investor letter without accompanying disclosure language. Confirm the appropriate disclaimer is present elsewhere in the document or add one.'",
  },
  {
    id: "material_omission",
    category: "compliance",
    severity: "soft_concern",
    description:
      "The statement omits a fact that a reasonable reader would consider material to understanding the claim. This rule is tightly scoped: it only fires when a specific, identifiable counter-fact is missing, not when the sentence is merely positive in tone. Example trigger: 'the investment returned 3x' without noting the hold period when hold period is material. Do not fire on: supported facts stated affirmatively, positive figures without additional context.",
    appliesTo: [...TWO_RC_IL],
    appliesToVersion: null,
  },
  {
    id: "regulatory_prohibited_language",
    category: "compliance",
    severity: "hard_concern",
    description:
      "Language restricted or prohibited under fund marketing regulations. Unqualified superlatives applied to fund performance ('the best fund', 'top-performing'), absolute claims of market position without substantiation, or promissory phrasing beyond C1.",
    appliesTo: [...ALL],
    appliesToVersion: null,
  },
  {
    id: "named_individual_attribution_in_public_content",
    category: "compliance",
    severity: "soft_concern",
    description:
      "A specific individual is named in external-facing content (beyond the firm's own senior leadership or the portfolio company CEO in announcement contexts). The reviewer flags for human confirmation — consent for attribution cannot be verified by the reviewer.",
    appliesTo: [...PR_LI],
    appliesToVersion: ["public"],
    reviewerNote:
      "Frame as review prompt. Example note: '[Name] is attributed in this external post. Confirm consent has been obtained.'",
  },
  {
    id: "selective_presentation_of_data",
    category: "compliance",
    severity: "soft_concern",
    description:
      "A specific data point is presented in a way that materially misrepresents the broader picture. This rule only fires when a specific counter-fact, comparator, or alternative framing is identifiable and missing. Do not fire on affirmative framing of supported facts without evidence of selective omission.",
    appliesTo: [...TWO_RC_IL],
    appliesToVersion: null,
  },
  {
    id: "comparative_claim_without_basis",
    category: "compliance",
    severity: "soft_concern",
    severityByOutput: {
      reporting_commentary: "soft_concern",
      investor_letter: "soft_concern",
      press_release: "hard_concern",
      linkedin_post: "hard_concern",
    },
    description:
      "Comparative claims ('outperforms peers', 'larger than competitors', 'fastest-growing', 'leading') without a named benchmark, time period, or source nearby.",
    appliesTo: [...ALL],
    appliesToVersion: null,
  },
];
