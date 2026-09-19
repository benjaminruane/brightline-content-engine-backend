/**
 * QRS bullets from a reviewSummary object. Same copy as the screen.
 * Readiness is not invented here.
 */

export function summaryBulletsFromReview(summary, extras = {}) {
  if (!summary || summary.version !== 1) return [];
  const bullets = [];
  const ev = summary.evidence;
  const notSupported = ev?.notSupported ?? 0;
  const conflicting = ev?.conflicting ?? 0;
  const partial = ev?.partial ?? 0;
  const notChecked = summary.notChecked ?? 0;
  const signalConcerns = summary.signalConcerns ?? 0;
  const editorialConcerns = summary.editorial?.concerns ?? 0;
  const complianceConcerns = summary.compliance?.concerns ?? 0;

  if (ev && notSupported > 0) {
    bullets.push(
      notSupported === 1
        ? "1 claim has no source behind it. Remove it or find supporting evidence before this draft is final."
        : `${notSupported} claims have no source behind them. Remove them or find supporting evidence before this draft is final.`
    );
  }
  if (bullets.length >= 3) return bullets.slice(0, 3);

  if (ev && conflicting > 0) {
    bullets.push(
      conflicting === 1
        ? "1 claim conflicts with the cited sources. Reconcile the contradiction before this draft is final."
        : `${conflicting} claims conflict with the cited sources. Reconcile the contradictions before this draft is final.`
    );
  }
  if (bullets.length >= 3) return bullets.slice(0, 3);

  if (notChecked > 0) {
    bullets.push(
      notChecked === 1
        ? "1 claim could not be fully checked. Read it yourself or run Review again."
        : `${notChecked} claims could not be fully checked. Read them yourself or run Review again.`
    );
  }
  if (bullets.length >= 3) return bullets.slice(0, 3);

  if (ev && partial > 0) {
    bullets.push(
      partial === 1
        ? "1 claim has only partial support from the cited sources. Strengthen the evidence where you can."
        : `${partial} claims have only partial support from the cited sources. Strengthen the evidence where you can.`
    );
  }
  if (bullets.length >= 3) return bullets.slice(0, 3);

  if (ev && extras.singleSourceOverReliance === true && notSupported + partial === 0) {
    bullets.push(
      "All claims draw on a single source. A second reference would considerably strengthen the case."
    );
  }
  if (bullets.length >= 3) return bullets.slice(0, 3);

  if (ev && extras.hasVisibleDealClaim === true && extras.missingDealFieldsPhrase) {
    const phrase = extras.missingDealFieldsPhrase;
    const isPlural = extras.missingDealFieldsIsPlural === true;
    bullets.push(
      `The draft does not cover ${phrase}. Consider whether ${isPlural ? "these details belong" : "this detail belongs"} in the text.`
    );
  }
  if (bullets.length >= 3) return bullets.slice(0, 3);

  if (signalConcerns > 0) {
    const n = signalConcerns;
    const cw = n === 1 ? "claim" : "claims";
    const hv = n === 1 ? "has" : "have";
    if (editorialConcerns > 0 && complianceConcerns > 0) {
      bullets.push(
        `${n} ${cw} ${hv} editorial and compliance notes. Work through the cards below before this draft is ready.`
      );
    } else if (editorialConcerns > 0) {
      bullets.push(
        `${n} ${cw} ${hv} editorial notes. Work through the cards below before this draft is ready.`
      );
    } else if (complianceConcerns > 0) {
      bullets.push(
        `${n} ${cw} ${hv} compliance notes. Work through the cards below before this draft is ready.`
      );
    }
  }
  if (bullets.length >= 3) return bullets.slice(0, 3);

  if (bullets.length === 0 && summary.readiness === "Ready") {
    const evidenceOn = summary.evidence != null;
    const editorialOn = summary.editorial != null;
    const complianceOn = summary.compliance != null;
    if (evidenceOn && editorialOn && complianceOn) {
      bullets.push("All claims are backed by sources and no editorial or compliance concerns were found.");
    } else if (evidenceOn && editorialOn) {
      bullets.push("All claims are backed by sources and no editorial concerns were found.");
    } else if (evidenceOn && complianceOn) {
      bullets.push("All claims are backed by sources and no compliance concerns were found.");
    } else if (evidenceOn) {
      bullets.push("All claims are backed by sources.");
    } else if (editorialOn || complianceOn) {
      bullets.push("Evidence review was not run for this output.");
    }
  }

  return bullets.slice(0, 3);
}
