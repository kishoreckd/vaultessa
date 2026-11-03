import { expect, it } from 'vitest';
import { mapConcurrent } from '../src/lib/async';

it('bounds active work and preserves order despite different completion times', async () => {
  let active = 0;
  let maximum = 0;
  const results = await mapConcurrent(
    [3, 1, 4, 2],
    async (value) => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, value));
      active--;
      return value * 2;
    },
    2,
  );
  expect(results).toEqual([6, 2, 8, 4]);
  expect(maximum).toBe(2);
  expect(await mapConcurrent([], async (value) => value)).toEqual([]);
  await expect(mapConcurrent([1], async (value) => value, 0)).rejects.toThrow('Invalid concurrency');
});
