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
  // Violence, disease and poison in copy — the rejection that followed the buffs update named
  // 瘟疫/疫病 in the bundle. Game-mechanic words keep their clean names instead (腐蚀, 爆炸).
  '死',
  '杀',
  '血',
  '毒',
  '疫',
  '瘟',
  '处决',
  '邪魔',
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
  // Third-party service branding — the platform package must carry none of it.
  'cheddaboards',
];

const TEXT_FILE = /\.(js|mjs|map|html|css|txt|svg|json|xml)$/i;

/** Hosts the platform package is allowed to mention (the platform itself, and XML vocabularies). */
const ALLOWED_HOSTS = new Set([
  'www.bilibili.com',
  'bilibili.com',
  's1.hdslb.com',
  'www.bilibilitoy.com',
  'www.bebox.net',
  'schema.org',
  'www.w3.org',
]);

/**
 * Hosts that must not appear in a submission: the game's own web deployment (off-platform
 * promotion) and third-party services it talks to. `pnpm build:toy` removes them.
 */
const DENIED_HOSTS = new Set([
  'ikaros-521.github.io',
  'github.com',
  'www.github.com',
  'cheddaboards.com',
  'api.cheddaboards.com',
]);

/** Files that only exist for the GitHub Pages deployment. */
const WEB_ONLY_FILES = ['llms.txt', 'robots.txt', 'sitemap.xml', 'og-cover.png'];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (TEXT_FILE.test(entry.name)) out.push(full);
  }
  return out;
}

if (!fs.existsSync(DIST)) {
  console.error('dist/ not found — run `pnpm build:toy` first.');
  process.exit(2);
}

const files = walk(DIST);
const problems = [];

for (const name of WEB_ONLY_FILES) {
  if (fs.existsSync(path.join(DIST, name))) {
    problems.push({ rel: name, term: 'web-only artefact (off-platform)', count: 1 });
  }
}

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
  for (const match of text.matchAll(/https?:\/\/([^/"'\s)\]]+)/g)) {
    const host = match[1].toLowerCase();
    if (DENIED_HOSTS.has(host)) problems.push({ rel, term: `off-platform host ${host}`, count: 1 });
  }
}

// Informational: any host that is neither explicitly allowed nor denied still deserves a look.
const html = path.join(DIST, 'index.html');
const hosts = new Set();
if (fs.existsSync(html)) {
  for (const match of fs.readFileSync(html, 'utf8').matchAll(/https?:\/\/([^/"'\s]+)/g)) {
    hosts.add(match[1].toLowerCase());
  }
}

console.log(`scanned ${files.length} files in dist/`);

const unexpected = [...hosts].filter((host) => !ALLOWED_HOSTS.has(host) && !DENIED_HOSTS.has(host));
if (unexpected.length > 0) {
  console.log(`\nNOTE: page metadata references unlisted hosts: ${unexpected.join(', ')}`);
  console.log('      confirm each is not an off-platform promotion (AGENTS.md §2.3).');
}

if (problems.length === 0) {
  console.log('\nno prohibited vocabulary, inflated claims or off-platform references found');
  console.log('remember: images are OCR-scanned too — eyeball any new or regenerated PNG/SVG.');
  process.exit(0);
}

console.error('\nprohibited content found:');
for (const { rel, term, count } of problems) {
  console.error(`  ${rel}: ${term} ×${count}`);
}
console.error('\nFix the source, rebuild, and re-run. See AGENTS.md §2–§4.');
process.exit(1);
