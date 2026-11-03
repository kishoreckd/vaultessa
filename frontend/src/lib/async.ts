/** Preserve result order while bounding expensive asynchronous work. */
export async function mapConcurrent<T, R>(
  values: readonly T[],
  transform: (value: T, index: number) => Promise<R>,
  concurrency = 16,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Invalid concurrency');
  const results = new Array<R>(values.length);
  const iterator = values.entries();
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (true) {
        const entry = iterator.next();
        if (entry.done) return;
        const [index, value] = entry.value;
        results[index] = await transform(value, index);
      }
    }),
  );
  return results;
}
