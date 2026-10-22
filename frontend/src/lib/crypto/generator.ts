export type GeneratorOptions = {
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
  avoidAmbiguous: boolean;
  characterGroups?: string[];
};

export const DEFAULT_GENERATOR_OPTIONS: GeneratorOptions = {
  length: 20,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
  avoidAmbiguous: false,
};

const CHARSETS = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/~',
} as const;
const AMBIGUOUS = /[Il1O0o|]/g;

/** Uniform random integer in [0, max) using rejection sampling (no modulo bias). */
export function randomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0 || max > 2 ** 32) throw new RangeError('max out of range');
  const limit = Math.floor(2 ** 32 / max) * max;
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    const value = buffer[0]!;
    if (value < limit) return value % max;
  }
}

/** Generates a password containing at least one character from each selected set. */
export function generatePassword(options: GeneratorOptions): string {
  if (!Number.isInteger(options.length) || options.length < 1 || options.length > 1024)
    throw new RangeError('Length must be between 1 and 1024');
  const sets = (
    options.characterGroups ??
    (Object.keys(CHARSETS) as Array<keyof typeof CHARSETS>)
      .filter((name) => options[name])
      .map((name) => CHARSETS[name])
  )
    .map((set) => Array.from(options.avoidAmbiguous ? set.replace(AMBIGUOUS, '') : set))
    .filter((set) => set.length > 0);
  if (sets.length === 0) throw new Error('Select at least one character set');

  const length = Math.max(options.length, sets.length);
  const all = sets.flat();
  const chars = sets.map((set) => set[randomInt(set.length)]!);
  while (chars.length < length) chars.push(all[randomInt(all.length)]!);

  // Fisher–Yates so the guaranteed characters aren't always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}

// Local dictionary; eight words provide more than 56 bits of entropy.
const WORDS =
  `acorn amber anchor apple apron arch arrow atlas autumn badge bamboo basin beach beacon berry birch blossom boat breeze bridge bronze brook cabin cactus candle canyon canvas cedar cherry chestnut circle clay cloud clover coast cobalt coral cotton crane creek crown crystal dawn desert dune eagle earth echo elm ember falcon feather fern field finch flame flint forest fossil fox frost garden gate ginger glacier globe gold granite grape grass grove harbor hazel hill honey horizon island ivory jade jasmine jewel juniper kettle kite lake lantern lark laurel leaf lemon lilac lily linen lotus lunar maple marble meadow melon mint mist moon moss mountain nectar night north oak ocean olive onyx orchid otter owl palm paper peach pearl pebble pepper petal pine planet plum pond poppy quartz raven reed reef river robin rock rose ruby sage sand satin scarlet shell shore silver sky slate snow solar sparrow spring spruce star stone storm stream summit sun sunset swift thyme tiger timber topaz trail tulip valley velvet violet walnut wave west wheat willow wind winter wolf wood wren yellow zenith`.split(
    ' ',
  );

export function generatePassphrase(count = 8, separator = '-'): string {
  if (!Number.isInteger(count) || count < 6 || count > 16) throw new RangeError('Choose 6 to 16 words');
  if (!['-', ' ', '.', '_'].includes(separator)) throw new Error('Unsupported separator');
  return Array.from({ length: count }, () => WORDS[randomInt(WORDS.length)]!).join(separator);
}

export function passphraseStrength(count: number) {
  const entropyBits = Math.floor(count * Math.log2(WORDS.length));
  const score = (
    entropyBits < 28 ? 0 : entropyBits < 40 ? 1 : entropyBits < 60 ? 2 : entropyBits < 80 ? 3 : 4
  ) as 0 | 1 | 2 | 3 | 4;
  return { entropyBits, score, label: ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][score]! };
}
