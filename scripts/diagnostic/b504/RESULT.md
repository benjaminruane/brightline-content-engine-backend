# B504 replay

b490 pass 1
catch: 13/13
group A: 11/11
raised cards with an empty reason: 0
edge vs label mismatches: 0
Assessment count vs card count mismatches: 0

b490 pass 2
catch: 13/13
group A: 11/11
raised cards with an empty reason: 0
edge vs label mismatches: 0
Assessment count vs card count mismatches: 0

b503 pass 1
catch: 13/13
group A: 11/11
raised cards with an empty reason: 0
edge vs label mismatches: 0
Assessment count vs card count mismatches: 0
23:2 reason was empty, now: The CRF_IC_memo records 1.2 GW of installed capacity, but the CRF_diligence_update (April 2025) confirms installed capacity of 1.4 GW following completion of a solar phase during diligence.

06:1 read (no behaviour change)
statement: Revenue grew to GBP 312 million for the year, up from GBP 187 million at the time of our investment in March 2022 — a compound annual growth rate of approximately 19 percent.
shown label: Conflicts with the source
sentence state: conflicts
reading note: The source states the compound annual growth rate is 18.6 percent, while the statement gives approximately 19 percent.
bucket: conflicts
evidence summary: The source states the compound annual growth rate is 18.6 percent, while the statement gives approximately 19 percent.
displayed evidence prose: The source states the compound annual growth rate is 18.6 percent, while the statement gives approximately 19 percent.
source quote: Revenue has grown from GBP 187 million at
the time of our investment to GBP 312 million for the financial year ended 31 December 2025,
representing a compound annual growth rate of 18.6 percent.
primary excerpt: Revenue has grown from GBP 187 million at
the time of our investment to GBP 312 million for the financial year ended 31 December 2025,
representing a compound annual growth rate of 18.6 percent.
conflict excerpt: 
source difference: 
second value line: 
display verdict: supported_full
support state: supported
completion: 
label rule: the shown label follows the reading-note bucket stored as sentence state (conflicts). The matcher display verdict is supported_full.
match 0: classification confirmed writtenFor  label 06_synth_listed_pe_report_excerpt explanation The source confirms the revenue growth from GBP 187 million to GBP 312 million and states a compound annual growth rate of 18.6 percent, which rounds to approximately 19 percent as stated.

Cards whose shown reason changed
b503 pass 1 23:2: The CRF_IC_memo records 1.2 GW of installed capacity, but the CRF_diligence_update (April 2025) confirms installed capacity of 1.4 GW following completion of a solar phase during diligence.

Deleted files
backend: lib/build-compliance-signals.cjs, lib/build-cross-statement-numeric-fragility.cjs, lib/build-evidence-density-mismatch.cjs, lib/build-evidence-density-reuse-spread.cjs, lib/build-evidence-judgement.cjs, lib/build-fragility-driver-tags-p3.cjs, lib/build-fragility-drivers.cjs, lib/build-judgement-aggregation-p4.cjs, lib/build-scoring-bridge-p4.cjs, lib/build-suggest-bundle-p5.cjs, lib/build-suggest-execution-p5.cjs, lib/build-suggest-priority-p5.cjs, lib/qc/binding-directness.mjs, lib/qc/citation-authority.mjs
frontend: src/components/Layout/LeftPane.jsx, src/components/Layout/PanelCollapseToggle.jsx, src/components/Layout/RightPane.jsx, src/components/Layout/TwoColumn.jsx, src/components/WritingBadge.jsx, src/components/drawers/DrawerTabs.jsx, src/components/primitives/CharCounter.jsx, src/components/primitives/CollapsiblePanel.jsx, src/components/primitives/Input.jsx, src/components/primitives/TextArea.jsx, src/modules/drafting/AdvancedSettingsPanel.jsx, src/modules/drafting/EventTitlePanel.jsx, src/modules/drafting/QuestionHistoryPanel.jsx, src/modules/drafting/SourcesPanel.jsx, src/modules/drafting/qcHighlightMatch.js, src/modules/drafting/utils/renderInlineCitations.js, src/modules/drafting/workbenchSnapshotHelpers.js, src/utils/rewriteWordLimitInference.js, src/utils/scoreDraft.js, src/utils/styleGuide.js, src/utils/themeVolumeIndicator.js

No other difference on shown label, tier, edge, reason, or Assessment counts.
GATES HELD
