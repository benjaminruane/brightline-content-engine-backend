BUILD SPEC. Ids: B618.

WHY
Amber refused-reading cards show a support restatement instead of the gap. Welcome reopens on tab focus. Users need an About this app entry.

======================================================================
PART 0A. CLAIMS. STOP IF A BLOCKING ONE IS FALSE.
======================================================================
C1 BLOCKING. Exit gate can replace amber shownReason. CONFIRMED: lib/qc/exit-gate.mjs applyExitGate.
C2 BLOCKING. refusedReading stays amber when evidence is partial and the reading is refused. CONFIRMED: lib/qc/shown-verdict.mjs.
C3 CHECK. Account refresh on focus recreates the account object and re-runs Welcome effect. CONFIRMED: App.jsx FocusTopBar.
C4 CHECK. Health does not expose model names. CONFIRMED: api/health.js. About copy uses the fixed model text.

======================================================================
PART 0B. DESIGN.
======================================================================
D1 Backend. When readingNote.refused and the card is amber, if the reason is support-style or does not name a gap, replace it with the matcher's partial/conflicting explanation (scrubbed, whole sentences) or the existing refused-reading sentence. B606 C2: never leave support-only as the only amber reason.
D2 Frontend Welcome. Decide once after account is available. Page-load latch: once shown or closed this load, stay closed on refetch. Local dismiss flag written immediately when "Don't show this again" is ticked. How it works still opens on demand.
D3 Frontend About. Account menu item opens a small modal with the specified copy and build short ref from getBuildCommit(). Esc and Close dismiss it.

======================================================================
PART 1. Backend refused-reading reason + test.
======================================================================
test/b618-refused-reading-reason.test.mjs with the Shopify S2 card shape.

======================================================================
PART 2. Frontend Welcome once + About + tests.
======================================================================
src/components/modals/__tests__/b618-welcome-once.test.js
About modal + menu item test in the same or a sibling test file as needed.
Preview verify at 1440x900.

======================================================================
SHIP
======================================================================
blbe commit/tag/push/verify:ship. blfe commit/tag/push/verify:ship. BACKLOG both repos. USD 0 unless preview Review bills.
