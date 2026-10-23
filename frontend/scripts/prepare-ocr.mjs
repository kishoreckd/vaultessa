import { copyFile, mkdir, readdir } from 'node:fs/promises';
const target = new URL('../public/ocr/', import.meta.url);
await mkdir(target, { recursive: true });
await copyFile(new URL('../node_modules/tesseract.js/dist/worker.min.js', import.meta.url), new URL('worker.min.js', target));
const core = new URL('../node_modules/tesseract.js-core/', import.meta.url);
for (const file of await readdir(core)) {
  if (/^tesseract-core(?:-simd|-relaxedsimd)?-lstm\.wasm(?:\.js)?$/.test(file)) await copyFile(new URL(file, core), new URL(file, target));
}
await copyFile(new URL('../node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', import.meta.url), new URL('eng.traineddata.gz', target));
