export const label = "Direct investment add-on";
export const priorities = true;
export const essential = [
  "the platform's buy-and-build strategy and how the target fits",
  "what the target is and does",
  "what the target adds",
  "how the firm intends to create value or grow the business over its ownership (value creation plan, business plan, investment plan, growth plan, growth initiatives, or value creation levers, whatever the source calls it)",
  "the valuation and the stake acquired",
  "rationale, backed by concrete figures where the source has them",
  "any prior history with the target",
];
export const mustCover = [
  ...essential,
  "The platform company is the acquirer; do not say the firm invested unless the source says so.",
];
export const guidance =
  "Write the add-on as the platform company's acquisition. When a source gives two versions of the terms, use one version's figures throughout and say in the Methodology Note which one was used. Never combine figures from different versions. Write every growth figure with its period. Weigh the points below. They are priorities, not a checklist, and only where the sources support them.";
export const exclude = [
  "legal deal terms, including liquidation preferences, board seats, forced-sale rights and similar rights",
  "how the acquisition is financed",
  "a 100-day plan, unless it contains a major step the longer-term plan does not (a leadership change, separation from a former parent, a named acquisition, or a major restructuring)",
];
