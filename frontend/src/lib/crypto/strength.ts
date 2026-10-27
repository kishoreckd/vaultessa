export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string; entropyBits: number };

let evaluate: ((password: string) => Strength) | undefined;
let loading: Promise<boolean> | undefined;

/** Load local dictionaries on password screens, never on the public landing page. */
export function loadStrengthEstimator(): Promise<boolean> {
  loading ??= import('./dictionary-strength').then((module) => {
    evaluate = module.evaluateStrength;
    return true;
  }).catch((error: unknown) => {
    loading = undefined;
    throw error;
  });
  return loading;
}

export function estimateStrength(password: string): Strength {
  if (!password) return { score: 0, label: 'Empty', entropyBits: 0 };
  return evaluate?.(password) ?? { score: 0, label: 'Checking?', entropyBits: 0 };
}
