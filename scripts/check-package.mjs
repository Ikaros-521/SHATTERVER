// Scans the built package for vocabulary that gets the Bilibili Toy submission rejected.
//
// The review reads `dist/` — the JS bundle, its source map, index.html meta tags, public/ text
// files and any text burned into images. Three rejections so far were about copy, image text, and
// (2026-11-26) a moderation word list that the bundler shipped as plaintext. This script catches
// the first and third classes; images still need a human look.
//
//   node scripts/check-package.mjs
//
// Exits non-zero when a hard-banned term or an inflated claim is found.

import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('dist');

/** Chinese terms: substring match (no word boundaries in Chinese text). */
const CJK_TERMS = [
  // Political.
  '法轮功',
  '六四',
  '台独',
  '藏独',
  '疆独',
  '反共',
  '达赖',
  '民运',
  '天安门',
  // Adult.
  '色情',
  '黄色网站',
  '裸聊',
  '约炮',
  '一夜情',
  '成人片',
  // Gambling.
  '赌博',
  '博彩',
  '六合彩',
  '百家乐',
  // Drugs.
  '毒品',
  '冰毒',
  '海洛因',
  '大麻',
  '摇头丸',
  // Inflated claims and absolute wording.
  '免安装',
  '极致',
  '最强',
  '顶级',
];

/**
 * Latin terms: matched case-insensitively with word boundaries, so a base64 blob or a minified
 * identifier cannot produce a false positive. All are ≥ 4 characters and unambiguous.
 */
const LATIN_TERMS = [
  // Slurs and hate speech.
  'nigger',
  'nigga',
  'faggot',
  'tranny',
  'kike',
  'wetback',
  'heilhitler',
  'siegsheil',
  'nazi',
  'hitler',
  'genocide',
  'lynching',
  // Adult.
  'porn',
  'hentai',
  'onlyfans',
  'blowjob',
  'handjob',
  'cumshot',
  'bukkake',
  'gangbang',
  'pedophile',
  'paedophile',
  'lolicon',
  'bestiality',
  'childporn',
  'dildo',
  'pussy',
  'vagina',
  'orgasm',
  'penis',
  // Drugs.
  'cocaine',
  'heroin',
  'cannabis',
  'marijuana',
  'ketamine',
  'methamphetamine',
  'fentanyl',
  'makemeth',
  // Gambling.
  'casino',
  'bet365',
  'betway',
  '1xbet',
  'pokerstars',
  'roulette',
  // Extremism and illegal activity.
  'terrorist',
  'jihadist',
  'beheading',
  'howtomakeabomb',
  'tiananmen',
  'falungong',
  'xijinping',
  'taiwanindependence',
  'freetibet',
  'xinjiangcamp',
  // Inflated claims (already rejected twice).
  '0mb',
];

const TEXT_FILE = /\.(js|mjs|map|html|css|txt|svg|json|xml)$/i;

/** Hosts that may appear in the page's own metadata (own site, repo, JSON-LD vocabulary). */
const ALLOWED_HOSTS = new Set(['ikaros-521.github.io', 'github.com', 'schema.org']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (TEXT_FILE.test(entry.name)) out.push(full);
  }
  return out;
}

if (!fs.existsSync(DIST)) {
  console.error('dist/ not found — run `pnpm build` first.');
  process.exit(2);
}

const files = walk(DIST);
const problems = [];

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(DIST, file);

  for (const term of CJK_TERMS) {
    const count = text.split(term).length - 1;
    if (count > 0) problems.push({ rel, term, count });
  }
  for (const term of LATIN_TERMS) {
    const pattern = new RegExp(`(?<![a-z0-9])${term}(?![a-z0-9])`, 'gi');
    const count = (text.match(pattern) ?? []).length;
    if (count > 0) problems.push({ rel, term, count });
  }
}

// Off-platform hosts in the page metadata: informational, because the own-site URLs are expected.
const html = path.join(DIST, 'index.html');
const hosts = new Set();
if (fs.existsSync(html)) {
  for (const match of fs.readFileSync(html, 'utf8').matchAll(/https?:\/\/([^/"'\s]+)/g)) {
    hosts.add(match[1].toLowerCase());
  }
}

console.log(`scanned ${files.length} files in dist/`);

const unexpected = [...hosts].filter((host) => !ALLOWED_HOSTS.has(host));
if (unexpected.length > 0) {
  console.log(`\nNOTE: page metadata references hosts outside the project: ${unexpected.join(', ')}`);
  console.log('      confirm each is not an off-platform promotion (AGENTS.md §2.3).');
}

if (problems.length === 0) {
  console.log('\nno prohibited vocabulary or inflated claims found');
  console.log('remember: images are OCR-scanned too — eyeball any new or regenerated PNG/SVG.');
  process.exit(0);
}

console.error('\nprohibited content found:');
for (const { rel, term, count } of problems) {
  console.error(`  ${rel}: ${term} ×${count}`);
}
console.error('\nFix the source, rebuild, and re-run. See AGENTS.md §2–§4.');
process.exit(1);
