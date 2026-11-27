# B613 browser verification (localhost:5173)

## Welcome window
- At 1440x900: Welcome modal centered with CE mark, Brightline Content Engine, four steps, sample cards side by side, pale blue note, Don't show this again, Start with my own, Try an example. Screenshot: b613-welcome-1440.png
- At ~460px: same content; sample cards use single-column grid below 520px. Screenshot: b613-welcome-460-stacked.png
- Ticked Don't show this again, closed with Start with my own, reloaded: Welcome not shown. localStorage brightline.welcome.dismissed=1
- How it works in the header reopened the Welcome window
- Try an example closed Welcome and opened the Examples picker (Ostara, Harbourline, Aldermoor, Lumio, Northwharf)

## Left panel
- Order seen: 1 Sources, 2 Document settings, 3 Draft, then Review with no step circle
- Document settings stayed on one line with the step circle; summary truncated with ellipsis
- Harbourline with 3 sources: badges A, B, C. Screenshot: b613-left-panel-harbourline.png
- Lumio single source: badge A

## Letters / PDF / age / busy
- Passage badges and PDF [A]/[B]/[C]: covered by b613-source-letters tests (screen helper + exportBlocks). No live Review was run for card faces or PDF bytes in this pass (cost).
- Source age: wholeYearsBetween(Oct 12 2010, Nov 27 2026) = 16 years (b613-source-age-years.test.mjs). Anniversary before/on day also pinned.
- Busy states (spinner on control, disabled until done, conflicting controls disabled), from code and b613-busy-states-complete:
  1. Card Undo (editBusy + BusySpinner)
  2. Transaction status buttons (transactionStatusPending + BusySpinner on non-selected)
  3. House style per-note Accept
  4. House style per-note Reject
  5. House style per-note Undo
  6. Upload processing (BusySpinner in InputUploadBox status)
  7. Generate from sources button
  8. Generate draft dialog submit
  9. Feedback Send (status sending + BusySpinner)
- Header shows Brightline Content Engine; page title Brightline Content Engine 0.9.8

## Backend (this repo)
- wholeYearsBetween and formatAgeFromDates: Shopify Oct 12 2010 is 16 years on 27 Nov 2026; day before anniversary is 15; anniversary day is 16. Tests: test/b613-source-age-years.test.mjs
- exportBlocks letterizes source and passage numbers to A/B. Tests: test/b613-source-letters-export.test.mjs
- accounts.welcome_dismissed_at migration 013; PUT dismissWelcome
