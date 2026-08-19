# B67 probe (also B60 reproduction)

Planted Nordholt-dirty case. Draft asserts ARR as achieved; the only source occurrence of EUR 95 million is projective (IC memo). Press release and fact sheet do not mention ARR; they state combined annual revenue of EUR 155 million.

Target statement: `ARR reached EUR 95 million.`

Observed 2026-08-19 (Stages 1–3, `stage2_v4.md` unchanged):

| Source | Classification | Cited passage | Expected |
|--------|----------------|---------------|----------|
| IC memo | `conflicting` | `Our base case envisages ARR growth to approximately EUR 95 million.` | **CORRECT.** Achieved-versus-projected catch. Must survive any **B60** change. Do not weaken this. |
| Press release | `conflicting` | `Combined annual revenue for the enlarged group stands at approximately EUR 155 million.` | **DEFECT (B60).** Different metric, does not address ARR. Should become `no_support`. |
| Fact sheet | `conflicting` | `Combined annual revenue: EUR 155 million` | **DEFECT (B60).** Same as press release. Should become `no_support`. |
| LP update | `no_support` | contracted-revenue percentage | Correct silence. |

Card verdict was `conflicting` / `hasConflict=true` only because the one legitimate conflict (IC memo) dominated. Three of four sources returned `conflicting` on a claim only one addresses.

**B67** closed on this probe: the IC memo catch is behaviour to preserve, not to change. No spec.

**B60** owns the press-release / fact-sheet false conflicts (money figures paired across metrics). The F18 `hasConflict` passage dump belongs here as a confirming diagnostic, not as a B60-versus-B48 fork.
