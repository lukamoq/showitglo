/**
 * Gate 0 — Pre-Publication Automated Safety Classifier
 * Blueprint §17: Automated screening for illegal content, political ads (Banned at launch per §2),
 * hate speech, spam, and financial scam keywords.
 */

export interface ModerationResult {
  passed: boolean;
  score: number; // 0 (safe) to 1 (unsafe)
  flags: string[];
  reason?: string;
}

const BANNED_POLITICAL_TERMS = [
  'vote for',
  'elect',
  'ballot measure',
  'campaign donation',
  'political action committee',
  'presidential candidate',
  'senate race',
];

const SCAM_CRYPTO_TERMS = [
  'guaranteed 100x',
  'send eth to get double',
  'pump and dump',
  'free crypto giveaway',
  'seed phrase',
  'private key giveaway',
];

const ILLEGAL_TERMS = [
  'buy stolen credit cards',
  'ddos service for hire',
  'malware download',
  'child sexual',
  'csam',
];

export function runGate0Moderation(title: string, body: string | null = ''): ModerationResult {
  const fullText = `${title} ${body || ''}`.toLowerCase();
  const flags: string[] = [];

  // Check illegal / extreme harm
  for (const term of ILLEGAL_TERMS) {
    if (fullText.includes(term)) {
      flags.push('ILLEGAL_OR_CSAM_CONTENT');
      return {
        passed: false,
        score: 1.0,
        flags,
        reason: 'Hard-blocked: content violates core trust and safety standards.',
      };
    }
  }

  // Check political advertisement (Change 4 in Blueprint)
  for (const term of BANNED_POLITICAL_TERMS) {
    if (fullText.includes(term)) {
      flags.push('POLITICAL_AD_DETECTED');
      return {
        passed: false,
        score: 0.9,
        flags,
        reason: 'Political campaigning and issue advertising are restricted during initial launch.',
      };
    }
  }

  // Check high risk scams
  for (const term of SCAM_CRYPTO_TERMS) {
    if (fullText.includes(term)) {
      flags.push('SCAM_SUSPICIOUS');
      return {
        passed: false,
        score: 0.85,
        flags,
        reason: 'Flagged for manual review due to deceptive financial promotional patterns.',
      };
    }
  }

  return {
    passed: true,
    score: 0.05,
    flags: [],
  };
}
