import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import { dictionary as commonDictionary, adjacencyGraphs } from '@zxcvbn-ts/language-common';
import { dictionary as englishDictionary, translations } from '@zxcvbn-ts/language-en';

const estimator = new ZxcvbnFactory({
  dictionary: { ...commonDictionary, ...englishDictionary },
  graphs: adjacencyGraphs,
  translations,
  maxLength: 256,
});

import type { Strength } from './strength';

export function evaluateStrength(password: string): Strength {
  if (!password) return { score: 0, label: 'Empty', entropyBits: 0 };

  const result = estimator.check(password);
  let score = result.score;
  // Keep a conservative guard for personal names outside the bundled dictionaries.
  const simpleWordAndNumber =
    /^[^a-zA-Z0-9]*[a-zA-Z]{1,20}[^a-zA-Z0-9]*\d{1,12}[^a-zA-Z0-9]*$/.test(password) ||
    /^[^a-zA-Z0-9]*\d{1,12}[^a-zA-Z0-9]*[a-zA-Z]{1,20}[^a-zA-Z0-9]*$/.test(password);
  if (simpleWordAndNumber) score = Math.min(score, 1) as Strength['score'];
  return {
    score,
    label: ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][score]!,
    // Retained for generated-passphrase compatibility; not displayed as measured entropy.
    entropyBits: Math.round(Math.log2(Math.max(1, result.guesses))),
  };
}
