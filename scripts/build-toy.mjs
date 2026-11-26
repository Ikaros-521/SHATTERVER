// Builds the Bilibili Toy submission package into dist/.
//
// The platform package must not advertise the web version or carry third-party branding, so this
// runs the app through `vite.toy.config.ts` (`__TOY__` = true, Chedda client tree-shaken) and then
// removes the artefacts that exist only for the GitHub Pages deployment:
//
//   - public/llms.txt, robots.txt, sitemap.xml  (they name the external site / "Play Online" link)
//   - public/og-cover.png                       (only referenced by the external og:image URL)
//   - <link rel="canonical">, og:url, og:image*, twitter:image, and the JSON-LD url/image
//
//   pnpm build:toy        # tsc + this script
//
// The resulting dist/ is what gets zipped for review. `pnpm check:package` enforces the result.

import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';

const DIST = path.resolve('dist');

const WEB_ONLY_FILES = ['llms.txt', 'robots.txt', 'sitemap.xml', 'og-cover.png'];

/** Tags and JSON-LD fields that point at the web deployment outside the platform. */
const HTML_SCRUBBERS = [
  [/\s*<link rel="canonical"[^>]*>/g, 'canonical'],
  [/\s*<meta property="og:url"[^>]*>/g, 'og:url'],
  [/\s*<meta property="og:image(?::\w+)?"[^>]*>/g, 'og:image*'],
  [/\s*<meta name="twitter:image"[^>]*>/g, 'twitter:image'],
  [/\s*"url":\s*"https?:\/\/[^"]*",?/g, 'json-ld url'],
  [/\s*"image":\s*"https?:\/\/[^"]*",?/g, 'json-ld image'],
  [/\s*"codeRepository":\s*"https?:\/\/[^"]*",?/g, 'json-ld codeRepository'],
];

async function main() {
  await build({ configFile: path.resolve('vite.toy.config.ts'), mode: 'production' });

  const removed = [];
  for (const name of WEB_ONLY_FILES) {
    const file = path.join(DIST, name);
    if (fs.existsSync(file)) {
      fs.rmSync(file);
      removed.push(name);
    }
  }

  const htmlPath = path.join(DIST, 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  for (const [pattern, label] of HTML_SCRUBBERS) {
    if (pattern.test(html)) removed.push(`index.html:${label}`);
    html = html.replace(pattern, '');
  }
  fs.writeFileSync(htmlPath, html, 'utf8');

  // Fail loudly rather than shipping an off-platform link by accident.
  const leftovers = [
    ['ikaros-521.github.io', html],
    ['Play Online', html],
  ].filter(([needle, text]) => text.includes(needle));
  if (leftovers.length > 0) {
    console.error(`still off-platform text in index.html: ${leftovers.map(([n]) => n).join(', ')}`);
    process.exit(1);
  }

  console.log('toy package built — removed:');
  for (const item of removed) console.log(`  ${item}`);
  console.log('\nnext: pnpm check:package && pnpm test  — then zip dist/ for review');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
