# B396. Element check on the nine inconclusive cards

| | |
|---|---|
| SHIPPED | `SHIP VERIFIED  474625a  main  166 files  1819 tests` |
| Cost | USD 0. No model calls. |
| Matcher | `scripts/diagnostic/b392/elements.mjs`, definition `scripts/diagnostic/b394/ELEMENTS-v3.md`. |
| Evidence | `scripts/diagnostic/b396/runs/nine.json`. Passages from `scripts/diagnostic/b395/runs/diff.json`. |

The nine cards are the ones B395 moved from `supported_full` to `not reviewed`. The displayed passage is the recovered passage on that diff. The whole source is the source text stored on the review. The nine are two doctored cards and seven clean cards. The seven clean cards are five distinct statements, because GP Industries S1 is the same sentence on runs 3, 4 and 5. There is no fourth doctored card in the list.

## M1, M2, M3

Every element on every card is found in the whole source. None is missing from the source.

| | Cards | All elements in the displayed passage (M1) | At least one element missing from the passage (M2) | No checkable element (M3) |
|---|---|---|---|---|
| All nine | 9 | 4 | 5 | 0 |
| Clean cards | 7 | 3 | 4 | 0 |
| Clean statements | 5 | 3 | 2 | 0 |
| Doctored cards | 2 | 1 | 1 | 0 |

M1, an earned green if the rule were "every element is in the displayed passage": ClearPoint doctored S3, and clean S0, S7 and S8. Doctored S3 is the planted error. Its elements are 80%, IRRAflow and 3.0. "vast majority" is not an element, so this rule would green the error.

M2, a specific mark if the rule were "any element missing from the displayed passage": ClearPoint S1 on both the doctored and the clean draft, and GP Industries S1 on runs 3, 4 and 5. On each of these the missing elements are in the whole source. The mark would be about the fragment, not about a token the source lacks. ClearPoint S1 is the same sentence on both drafts. It is not a planted substitution.

M3 is empty. None of the nine is beyond a deterministic element check. The check still cannot see a scale phrase, and it did not extract `iCT` from clean S8.

## Per card

### Doctored

ClearPoint doctored S1. Class M2. Four elements.

The company delivered 43% year-on-year growth in revenue to USD 12.1 million, driven by an expansion of the activated installed base to more than 175 global centers and ongoing integration of the recently-acquired IRRAflow product portfolio.

| Kind | Surface | Displayed passage | Whole source |
|---|---|---|---|
| figure | 43% | found | found |
| figure | USD 12.1 million | found | found |
| figure | 175 | not found | found |
| name | IRRAflow | not found | found |

ClearPoint doctored S3. Class M1. Three elements. This is the planted "vast majority" error.

Topline growth was driven by the neurosurgery navigation, therapy and access division, which contributed the vast majority of the company's overall revenue and achieved 80% year-on-year growth, benefitting from contributions from the IRRAflow product line and the 3.0 operating room navigation software.

| Kind | Surface | Displayed passage | Whole source |
|---|---|---|---|
| figure | 80% | found | found |
| name | IRRAflow | found | found |
| figure | 3.0 | found | found |

### Clean

ClearPoint clean S0. Class M1. Three elements. The recovered passage is 12,174 characters.

In May 2026, ClearPoint Neuro reported its financial results for the first quarter of 2026.

| Kind | Surface | Displayed passage | Whole source |
|---|---|---|---|
| date | May 2026 | found | found |
| name | ClearPoint Neuro | found | found |
| date | first quarter of 2026 | found | found |

ClearPoint clean S1. Class M2. Same sentence and same four elements as doctored S1. 43% and USD 12.1 million are in the passage. 175 and IRRAflow are not. All four are in the source.

ClearPoint clean S7. Class M1. Two elements. The recovered passage is 7,059 characters.

Notably, FDA clearance was received and first clinical procedures completed utilizing the company's Velocity Alpha MR High Speed Surgical Drill System.

| Kind | Surface | Displayed passage | Whole source |
|---|---|---|---|
| name | FDA | found | found |
| name | Velocity Alpha MR High Speed Surgical Drill System | found | found |

ClearPoint clean S8. Class M1. Six elements. The recovered passage is 499 characters. `iCT` was not extracted.

Elsewhere, Health Canada issued a medical device license for the ClearPoint Neuro Navigation System, which covers both MRI-guidance and iCT guidance workflows, while the first commercial drug delivery case utilizing ClearPoint technology was completed in the Asia-Pacific region.

| Kind | Surface | Displayed passage | Whole source |
|---|---|---|---|
| name | Health Canada | found | found |
| name | ClearPoint Neuro Navigation System | found | found |
| name | MRI | found | found |
| name | ClearPoint | found | found |
| name | Asia | found | found |
| name | Pacific | found | found |

GP Industries clean S1, runs 3, 4 and 5. Class M2. The same twelve elements on each run. The recovered passage is 39 characters: "It also has two other plants in the UK."

The company currently operates three facilities in Malaysia, two in Vietnam, and one in Thailand, alongside two other plants in the UK and one plant in China, which will now focus primarily on the European and Asian markets.

| Kind | Surface | Displayed passage | Whole source |
|---|---|---|---|
| figure | three | not found | found |
| name | Malaysia | not found | found |
| figure | two | found | found |
| name | Vietnam | not found | found |
| figure | one | not found | found |
| name | Thailand | not found | found |
| figure | two | found | found |
| name | UK | found | found |
| figure | one | not found | found |
| name | China | not found | found |
| name | European | not found | found |
| name | Asian | not found | found |

The two "two" figures and the two "one" figures are separate elements. The passage contains the UK "two". It does not contain the Vietnam "two" or either "one".
