export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string; entropyBits: number };

const COMMON_PATTERNS = /password|passw0rd|qwerty|123456|abc123|letmein|admin|welcome|iloveyou/i;

/**
 * Rough entropy-based estimate. Good enough for a meter; replace with zxcvbn-ts in P1
 * (docs/06-roadmap.md) for dictionary-aware scoring.
 */
export function estimateStrength(password: string): Strength {
  if (!password) return { score: 0, label: 'Empty', entropyBits: 0 };

  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/\d/.test(password)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(password)) pool += 33;

  let bits = password.length * Math.log2(pool);
  if (new Set(password).size / password.length < 0.5) bits *= 0.6;
  if (/(.)\1{2,}/.test(password)) bits *= 0.8;
  if (COMMON_PATTERNS.test(password)) bits *= 0.4;
  const entropyBits = Math.round(bits);

  if (entropyBits < 28) return { score: 0, label: 'Very weak', entropyBits };
  if (entropyBits < 40) return { score: 1, label: 'Weak', entropyBits };
  if (entropyBits < 60) return { score: 2, label: 'Fair', entropyBits };
  if (entropyBits < 80) return { score: 3, label: 'Strong', entropyBits };
  return { score: 4, label: 'Very strong', entropyBits };
}
