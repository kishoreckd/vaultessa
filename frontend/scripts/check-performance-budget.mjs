import { readdir, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

// Build-output regression checks, not a substitute for real-device performance measurements.
const assets = new URL('../dist/assets/', import.meta.url);
const files = await readdir(assets);
const limits = [
  { label: 'Shared entry JavaScript (gzip)', pattern: /^index-.*\.js$/, max: 190 * 1024, gzip: true },
  { label: 'Landing JavaScript (gzip)', pattern: /^LandingPage-.*\.js$/, max: 25 * 1024, gzip: true },
  { label: 'Public detail-page JavaScript (gzip)', pattern: /^MarketingPage-.*\.js$/, max: 25 * 1024, gzip: true },
  { label: 'Public page artwork', pattern: /^(features|security|how-it-works)-.*\.webp$/, max: 120 * 1024, gzip: false },
  { label: 'Login JavaScript (gzip)', pattern: /^LoginPage-.*\.js$/, max: 20 * 1024, gzip: true },
  { label: 'Registration JavaScript (gzip)', pattern: /^RegisterPage-.*\.js$/, max: 20 * 1024, gzip: true },
  { label: 'Shared CSS (gzip)', pattern: /^index-.*\.css$/, max: 25 * 1024, gzip: true },
  { label: 'Hero artwork', pattern: /^vaultessa-hero-.*\.(png|webp|avif)$/, max: 120 * 1024, gzip: false },
];
let failed = false;
for (const { label, pattern, max, gzip } of limits) {
  const matches = files.filter((file) => pattern.test(file));
  if (!matches.length) { console.error(`FAIL ${label}: missing build artifact in ${fileURLToPath(assets)}`); failed = true; continue; }
  for (const file of matches) {
    const contents = await readFile(new URL(file, assets));
    const size = gzip ? gzipSync(contents).length : contents.length;
    const pass = size <= max;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${label}: ${(size / 1024).toFixed(1)} / ${(max / 1024).toFixed(0)} KiB`);
    if (!pass) failed = true;
  }
}
if (failed) process.exitCode = 1;
