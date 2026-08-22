/**
 * The EU/EEA withdrawal consent taken at top-up.
 *
 * A consumer buying digital content at a distance has 14 days to withdraw
 * (Consumer Rights Directive 2011/83/EU, art. 9). That right falls away for
 * content already supplied only if the consumer made an *express request* for
 * immediate performance AND acknowledged losing the right (art. 16(m)). Both
 * halves have to be in one affirmative act, and we have to be able to prove it
 * later — which is why the wording lives here, in one place, versioned:
 *
 *   * the checkout renders exactly these words;
 *   * the server refuses the charge without the tick;
 *   * the audit row records the version, so a dispute two years from now can be
 *     answered with the text the customer actually saw.
 *
 * Bump `WITHDRAWAL_CONSENT_VERSION` whenever the sentence changes, and never
 * edit a released sentence in place — old audit rows point at it.
 */

export const WITHDRAWAL_CONSENT_VERSION = '2026-08-22.v1';

/**
 * Rendered as one sentence with `LINK_TEXT` as a link to /terms. Split at the
 * link so the checkout and this record cannot drift apart.
 */
export const WITHDRAWAL_CONSENT_BEFORE_LINK =
  'I ask for my credits to be delivered immediately and acknowledge that spent credits are final — ' +
  'for spent credits I lose my 14-day EU right of withdrawal. I accept the ';

export const WITHDRAWAL_CONSENT_LINK_TEXT = 'Terms';

export const WITHDRAWAL_CONSENT_AFTER_LINK = '.';

/** The full sentence as plain text — what a dispute file would quote. */
export const WITHDRAWAL_CONSENT_TEXT =
  WITHDRAWAL_CONSENT_BEFORE_LINK + WITHDRAWAL_CONSENT_LINK_TEXT + WITHDRAWAL_CONSENT_AFTER_LINK;

/** Shown when the checkout is submitted without the tick. */
export const WITHDRAWAL_CONSENT_REQUIRED_MESSAGE =
  'Please tick the immediate-delivery box before paying. We need your express request and your ' +
  'acknowledgement before credits can be delivered.';
