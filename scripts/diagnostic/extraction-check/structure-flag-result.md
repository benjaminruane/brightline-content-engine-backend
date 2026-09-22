# B317. Structure-flag extraction times

Harness: `scripts/diagnostic/extraction-check/run-extraction-check.mjs` on the two named files. Flag off then flag on. No model calls. Ran 2026-09-22.

| file | wallMs on | wallMs off | percent saved |
|------|----------:|-----------:|--------------:|
| 3i-press-release-fy2025.pdf | 203672 | 102215 | 49.8 |
| hpif-report-march-2026.pdf | 70670 | 35402 | 49.9 |
| both | 274342 | 137617 | 49.8 |

Extracted TEXT is byte-identical between the two runs on both files.
