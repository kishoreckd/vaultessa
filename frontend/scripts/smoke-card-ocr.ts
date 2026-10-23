/** Real-engine smoke check using a generated fictional card; no user data. */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { parseCardText } from '../src/features/vault/cardOcrParser';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="650">
<rect width="1200" height="650" fill="white"/>
<g fill="black" font-family="Consolas, monospace" font-size="52">
<text x="70" y="110">VISA</text>
<text x="70" y="250">4242 4242 4242 4242</text>
<text x="70" y="390">09/29</text>
<text x="70" y="530">JANE DOE</text>
</g></svg>`;
const image = await sharp(Buffer.from(svg)).png().toBuffer();
const worker = await createWorker('eng', 1, {
  langPath: fileURLToPath(new URL('../public/ocr/', import.meta.url)),
  corePath: fileURLToPath(new URL('../public/ocr/tesseract-core-lstm.wasm.js', import.meta.url)),
  cacheMethod: 'none',
  errorHandler: () => {},
});
try {
  const result = await worker.recognize(image);
  assert.deepEqual(parseCardText(result.data.text), { number: '4242424242424242', expiry: '09/29', cardholder: 'JANE DOE' });
  console.log('PASS: local OCR extracted the generated test card details.');
} finally { await worker.terminate(); }
