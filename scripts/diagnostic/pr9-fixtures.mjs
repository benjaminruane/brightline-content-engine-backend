/**
 * Shared Pr9 suggest-revision fixtures (used by pr9-sample and
 * pr9-marker-consistency). Card-shaped statements, not QC pipeline output.
 */

export const PR9_FIXTURES = [
  {
    id: "F1",
    label: "FIXTURE 1 - Acme growth / marketing / returns",
    draftText:
      "Acme Capital grew revenue 40% year on year to $120m. We are excited to announce incredible growth across every segment. Investors will see strong returns as we scale the platform.",
    statements: [
      {
        text: "Acme Capital grew revenue 40% year on year to $120m.",
        qcCard: {
          index: 0,
          statement: "Acme Capital grew revenue 40% year on year to $120m.",
          supportState: "not_supported",
          displayVerdict: "not_supported",
          primaryExcerpt: {
            sourceLabel: "IC memo",
            passage: "Revenue increased approximately 18% to about $95m.",
          },
          evidenceSummary: "Sources support material growth but not the 40% / $120m figures stated.",
          editorialVerdict: "clean",
          complianceVerdict: "clean",
        },
      },
      {
        text: "We are excited to announce incredible growth across every segment.",
        qcCard: {
          index: 1,
          statement: "We are excited to announce incredible growth across every segment.",
          supportState: "supported",
          displayVerdict: "supported_full",
          editorialVerdict: "soft_concern",
          editorialConcerns: [
            {
              ruleId: "marketing_language_excess",
              note: "Promotional register ('incredible', 'excited to announce').",
              suggestedDirection:
                "Replace 'incredible growth' with a concrete, evidence-backed description of segment performance.",
            },
          ],
          complianceVerdict: "clean",
        },
      },
      {
        text: "Investors will see strong returns as we scale the platform.",
        qcCard: {
          index: 2,
          statement: "Investors will see strong returns as we scale the platform.",
          supportState: "partial",
          displayVerdict: "supported_partial",
          primaryExcerptText: "The firm aims to improve returns as AUM scales.",
          evidenceSummary: "Sources describe an aim, not a promise of strong returns.",
          editorialVerdict: "clean",
          complianceVerdict: "soft_concern",
          complianceConcerns: [
            {
              note: "Promissory 'will see strong returns' lacks hedging.",
              suggestedDirection:
                "Hedge with language such as 'may' or 'aims to' and avoid promising returns.",
            },
          ],
        },
      },
    ],
    outputType: "REPORTING_COMMENTARY",
    requiredVersion: "complete",
  },
  {
    id: "F2",
    label: "FIXTURE 2 - BVP named-entity evidence keep + house-style",
    draftText:
      "BVP is evaluating an investment of up to $7,000,000 in Shopify. Shopify's 24 employees are located in Ottawa, Canada.",
    statements: [
      {
        text: "BVP is evaluating an investment of up to $7,000,000 in Shopify.",
        qcCard: {
          index: 0,
          statement: "BVP is evaluating an investment of up to $7,000,000 in Shopify.",
          supportState: "conflicting",
          displayVerdict: "conflict",
          primaryExcerpt: {
            sourceLabel: "Shopify_memo",
            passage: "The firm is evaluating an investment of up to $7,000,000.",
          },
          evidenceSummary:
            "Source says 'the firm' is evaluating the investment without naming BVP; the BVP attribution is not confirmed.",
          editorialVerdict: "soft_concern",
          editorialConcerns: [
            {
              ruleId: "thousand_separator",
              note: "Comma thousands separator.",
              suggestedDirection: "Replace '$7,000,000' with '$7'000'000'.",
            },
            {
              ruleId: "currency_format",
              note: "Currency symbol before amount.",
              suggestedDirection: "Use ISO code + spelled magnitude, e.g. 'USD 7 million'.",
            },
          ],
          complianceVerdict: "clean",
        },
      },
      {
        text: "Shopify's 24 employees are located in Ottawa, Canada.",
        qcCard: {
          index: 1,
          statement: "Shopify's 24 employees are located in Ottawa, Canada.",
          supportState: "supported",
          displayVerdict: "supported_full",
          primaryExcerpt: {
            sourceLabel: "Shopify_memo",
            passage: "Shopify's 24 employees are located in Ottawa, Canada.",
          },
          evidenceSummary: "Source confirms 24 employees in Ottawa.",
          editorialVerdict: "clean",
          complianceVerdict: "clean",
        },
      },
    ],
    outputType: "REPORTING_COMMENTARY",
    requiredVersion: "complete",
  },
  {
    id: "F3",
    label: "FIXTURE 3 - compliance_strip public downgrade vs strip",
    draftText:
      "Jane Smith led the diligence on the transaction. Fund IV returned 22% net IRR last year.",
    statements: [
      {
        text: "Jane Smith led the diligence on the transaction.",
        qcCard: {
          index: 0,
          statement: "Jane Smith led the diligence on the transaction.",
          supportState: "supported",
          displayVerdict: "supported_full",
          supportRefIds: [0],
          editorialVerdict: "clean",
          complianceVerdict: "hard_concern",
          complianceConcerns: [
            {
              concernCode: "named_individual_attribution_in_public_content",
              note: "Named individual in external-facing content.",
              suggestedDirection: "Remove 'Jane Smith' or replace with a role title pending consent.",
            },
          ],
        },
      },
      {
        text: "Fund IV returned 22% net IRR last year.",
        qcCard: {
          index: 1,
          statement: "Fund IV returned 22% net IRR last year.",
          supportState: "supported",
          displayVerdict: "supported_full",
          supportRefIds: [1],
          editorialVerdict: "clean",
          complianceVerdict: "hard_concern",
          complianceConcerns: [
            {
              concernCode: "precise_confidential_detail_in_public_version",
              note: "Exact fund-level IRR in a public version.",
              suggestedDirection: "Strip the precise 22% net IRR or replace with a stated range.",
            },
          ],
        },
      },
    ],
    sources: [
      { index: 0, publicationState: "published_external" },
      { index: 1, publicationState: "restricted" },
    ],
    outputType: "PRESS_RELEASE",
    requiredVersion: "public",
  },
  {
    id: "F4",
    label: "FIXTURE 4 - compliance_add forward-looking return target",
    draftText: "The Fund will deliver 18% net IRR in 2027.",
    statements: [
      {
        text: "The Fund will deliver 18% net IRR in 2027.",
        qcCard: {
          index: 0,
          statement: "The Fund will deliver 18% net IRR in 2027.",
          supportState: "supported",
          displayVerdict: "supported_full",
          editorialVerdict: "clean",
          complianceVerdict: "hard_concern",
          complianceConcerns: [
            {
              concernCode: "forward_looking_statement_without_qualifier",
              note: "Forward-looking IRR without an uncertainty qualifier.",
              suggestedDirection: "Add an uncertainty qualifier such as 'is expected to'.",
            },
          ],
        },
      },
    ],
    outputType: "INVESTOR_LETTER",
    requiredVersion: "public",
  },
  {
    id: "F5",
    label: "FIXTURE 5 - deletion direction Cut ...",
    draftText: "Revenue grew 12% year on year. The office also has a red kettle.",
    statements: [
      {
        text: "Revenue grew 12% year on year.",
        qcCard: {
          index: 0,
          statement: "Revenue grew 12% year on year.",
          supportState: "supported",
          displayVerdict: "supported_full",
          editorialVerdict: "clean",
          complianceVerdict: "clean",
        },
      },
      {
        text: "The office also has a red kettle.",
        qcCard: {
          index: 1,
          statement: "The office also has a red kettle.",
          supportState: "supported",
          displayVerdict: "supported_full",
          editorialVerdict: "soft_concern",
          editorialConcerns: [
            {
              ruleId: "narrative_coherence",
              note: "Incidental aside that does not advance the argument.",
              suggestedDirection: "Cut the kettle detail.",
            },
          ],
          complianceVerdict: "clean",
        },
      },
    ],
    outputType: "REPORTING_COMMENTARY",
    requiredVersion: "complete",
  },
  {
    id: "F6",
    label: "FIXTURE 6 - partial evidence (confirmed scale, unsupported threshold)",
    draftText: "AUM exceeded $2bn.",
    statements: [
      {
        text: "AUM exceeded $2bn.",
        qcCard: {
          index: 0,
          statement: "AUM exceeded $2bn.",
          supportState: "partial",
          displayVerdict: "supported_partial",
          primaryExcerptText: "AUM was reported near $1.9bn.",
          evidenceSummary: "Sources confirm AUM at about USD 1.9 billion, not that it exceeded USD 2 billion.",
          editorialVerdict: "clean",
          complianceVerdict: "clean",
        },
      },
    ],
    outputType: "REPORTING_COMMENTARY",
    requiredVersion: "complete",
  },
];
