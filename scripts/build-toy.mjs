// Builds the Bilibili Toy submission package into dist/.
//
// The platform package must not advertise the web version or carry third-party branding, so this
// runs the app through `vite.toy.config.ts` (`__TOY__` = true, Chedda client tree-shaken) and then
// removes the artefacts that exist only for the GitHub Pages deployment:
//
//   - public/llms.txt, robots.txt, sitemap.xml  (they name the external site / "Play Online" link)
//   - public/og-cover.png                       (only referenced by the external og:image URL)
//   - the whole web-page machinery in index.html: canonical, the Open Graph block, the Twitter
//     Card block, robots/keywords/author meta, the llms.txt alternate link, and the GEO/SEO
//     JSON-LD block — inside a platform iframe these only say "wrapped external web page"
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
  // Web-page sharing metadata: meaningless inside a platform iframe, and a signal that this is a
  // wrapped external web page rather than a platform submission. The whole blocks go.
  [/\s*<!-- Open Graph[^>]*-->/g, 'og comment'],
  [/\s*<meta[^>]*property="og:[^"]*"[^>]*>/g, 'og:*'],
  [/\s*<!-- Twitter Card -->/g, 'twitter comment'],
  [/\s*<meta[^>]*name="twitter:[^"]*"[^>]*>/g, 'twitter:*'],
  // Web-authorship and crawler machinery.
  [/\s*<meta[^>]*name="robots"[^>]*>/g, 'robots'],
  [/\s*<meta[^>]*name="keywords"[^>]*>/g, 'keywords'],
  [/\s*<meta[^>]*name="author"[^>]*>/g, 'author'],
  [/\s*<link rel="alternate"[^>]*>/g, 'llms.txt alternate link'],
  // The whole GEO/SEO structured-data block (its url/image/codeRepository pointed off-platform).
  [/\s*<!-- Structured Data \(GEO \/ SEO\) -->\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, 'json-ld block'],
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

  // Fail loudly rather than shipping web-page machinery or an off-platform link by accident.
  const leftovers = [
    ['ikaros-521.github.io', html],
    ['Play Online', html],
    ['property="og:', html],
    ['name="twitter:', html],
    ['ld+json', html],
    ['llms.txt', html],
    ['name="robots"', html],
    ['name="keywords"', html],
    ['name="author"', html],
  ].filter(([needle, text]) => text.includes(needle));
  if (leftovers.length > 0) {
    console.error(`still web-page machinery or off-platform text in index.html: ${leftovers.map(([n]) => n).join(', ')}`);
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
