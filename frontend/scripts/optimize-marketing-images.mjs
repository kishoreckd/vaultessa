import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
for (const name of ['vaultessa-hero','features','security','how-it-works']) {
  const source = new URL(`../src/Landing/assets/${name}.png`, import.meta.url);
  for (const width of [640, 960, 1536]) {
    const output = new URL(`../src/Landing/assets/${name}-${width}.webp`, import.meta.url);
    const result = await sharp(fileURLToPath(source)).resize({width,withoutEnlargement:true}).webp({quality:80,effort:6}).toFile(fileURLToPath(output));
    console.log(`${name} ${width}w: ${(result.size/1024).toFixed(1)} KiB`);
  }
}
