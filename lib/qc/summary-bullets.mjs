/**
 * QRS bullets from a reviewSummary object. Same copy as the screen.
 * Readiness is not invented here.
 * A list longer than three keeps the first three and says the rest were cut.
 */

function discloseTruncation(bullets) {
  if (bullets.length <= 3) return bullets;
  const hidden = bullets.slice(3);
  const editorial = hidden.some((line) => /editorial|compliance/i.test(line));
  const n = hidden.length;
  const more = n === 1 ? "1 more point is not shown" : `${n} more points are not shown`;
  const line = editorial ? `${more}, including editorial or compliance notes.` : `${more}.`;
  return [...bullets.slice(0, 3), line];
}

export function summaryBulletsFromReview(summary, extras = {}) {
  if (!summary || summary.version !== 1) return [];
  const bullets = [];
  const ev = summary.evidence;
  const notSupported = ev?.notSupported ?? 0;
  const conflicting = ev?.conflicting ?? 0;
  const partial = ev?.partial ?? 0;
  const beyond = ev?.beyond ?? 0;
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
  if (ev && conflicting > 0) {
    bullets.push(
      conflicting === 1
        ? "1 claim conflicts with the cited sources. Reconcile the contradiction before this draft is final."
        : `${conflicting} claims conflict with the cited sources. Reconcile the contradictions before this draft is final.`
    );
  }
  if (notChecked > 0) {
    const boundHits = Number(summary.rateLimitBoundHits?.statements) || 0;
    if (boundHits > 0) {
      bullets.push(
        notChecked === 1
          ? "1 claim could not be fully checked in this pass. The review ran out of time waiting for capacity. Read it yourself or run Review again."
          : `${notChecked} claims could not be fully checked in this pass. The review ran out of time waiting for capacity. Read them yourself or run Review again.`
      );
    } else {
      bullets.push(
        notChecked === 1
          ? "1 claim could not be fully checked. Read it yourself or run Review again."
          : `${notChecked} claims could not be fully checked. Read them yourself or run Review again.`
      );
    }
  }
  if (ev && beyond > 0) {
    bullets.push(
      beyond === 1
        ? "1 statement goes beyond the source."
        : `${beyond} statements go beyond the source.`
    );
  }
  if (ev && partial > 0) {
    bullets.push(
      partial === 1
        ? "1 statement is partly in the source."
        : `${partial} statements are partly in the source.`
    );
  }
  const needsLook = ev?.needsLook ?? 0;
  if (ev && needsLook > 0) {
    bullets.push(
      needsLook === 1
        ? "1 statement needs a look."
        : `${needsLook} statements need a look.`
    );
  }
  if (ev && extras.singleSourceOverReliance === true && notSupported + partial === 0) {
    bullets.push(
      "All claims draw on a single source. A second reference would considerably strengthen the case."
    );
  }
  if (ev && extras.hasVisibleDealClaim === true && extras.missingDealFieldsPhrase) {
    const phrase = extras.missingDealFieldsPhrase;
    const isPlural = extras.missingDealFieldsIsPlural === true;
    bullets.push(
      `The draft does not cover ${phrase}. Consider whether ${isPlural ? "these details belong" : "this detail belongs"} in the text.`
    );
  }
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
  const unbadged = ev?.unbadged ?? 0;
  if (ev && unbadged > 0) {
    bullets.push(
      unbadged === 1
        ? "1 sentence has a note and no factual badge."
        : `${unbadged} sentences have a note and no factual badge.`
    );
  }
  if (bullets.length === 0 && summary.readiness === "Ready") {
    const evidenceOn = summary.evidence != null;
    const editorialOn = summary.editorial != null;
    const complianceOn = summary.compliance != null;
    if (evidenceOn && editorialOn && complianceOn) {
      bullets.push("Nothing raised, and no editorial or compliance concerns were found.");
    } else if (evidenceOn && editorialOn) {
      bullets.push("Nothing raised, and no editorial concerns were found.");
    } else if (evidenceOn && complianceOn) {
      bullets.push("Nothing raised, and no compliance concerns were found.");
    } else if (evidenceOn) {
      bullets.push("Nothing raised.");
    } else if (editorialOn || complianceOn) {
      bullets.push("Evidence review was not run for this output.");
    }
  }

  return discloseTruncation(bullets);
}
