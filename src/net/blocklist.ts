/**
 * Word lists behind the nickname filter.
 *
 * Why a hand-vendored list instead of an npm package: this game ships with **zero runtime
 * dependencies**, and every candidate package either drags a dictionary loader into the bundle or
 * bundles a list far broader than a 16-character ASCII handle needs. The matcher in
 * `nickname.ts` is a few dozen lines and the data below is the part that actually needs review —
 * so the data lives here, in one readable file, with the evasion handling kept separate.
 *
 * Categories follow what a game leaderboard must not show: sexual content, drugs, gambling ads,
 * hate speech and slurs, and political terms that are not publishable in the mainland China
 * market. The list is a *starter set*, not a compliance certificate: an operator shipping to a
 * specific market should extend it with the list their legal review supplies. Add plain lowercase
 * ASCII to `BLOCKED_SUBSTRINGS` (matched anywhere) or `BLOCKED_WHOLE` (must be the whole handle).
 *
 * Matching notes:
 * - `_` and other separators are stripped before matching, so `f_u_c_k` is caught.
 * - Leet substitutions are folded (`sh1t` → `shit`), and runs of a repeated letter collapse, so
 *   `fuuuck` is caught.
 * - Short or ambiguous terms live in `BLOCKED_WHOLE` and only match a handle that *is* the word
 *   (plus an optional digit suffix). This is what keeps `Cass`, `Sussex` and `Grape` playable
 *   while still blocking `Ass`, `Sex` and `Rape`.
 * - Ordinary place names and ordinary words are deliberately absent: only terms that are abusive,
 *   illegal or politically unpublishable are listed.
 */

/** Terms matched anywhere in the normalised handle. All are ≥ 5 characters and unambiguous. */
export const BLOCKED_SUBSTRINGS: readonly string[] = [
  // Slurs and hate speech.
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'tranny',
  'kike',
  'spic',
  'chink',
  'wetback',
  'whitepower',
  'heilhitler',
  'siegsheil',
  'nazi',
  'hitler',
  'genocide',
  'lynching',
  // Sexual content.
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
  'incest',
  'bestiality',
  'dildo',
  'orgasm',
  'penis',
  'vagina',
  'pussy',
  // Drugs.
  'cocaine',
  'heroin',
  'cannabis',
  'marijuana',
  'ketamine',
  'methamphetamine',
  'ecstasy',
  'fentanyl',
  'mdma',
  // Gambling advertising.
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
  'childporn',
  'howtomakeabomb',
  'makemeth',
  // Political terms not publishable in the mainland China market. Ordinary geography is not
  // included: `Taiwan` on its own is a place, `taiwanindependence` is the slogan.
  'tiananmen',
  'falungong',
  'falun',
  'xijinping',
  'jinping',
  'hongkongindependence',
  'taiwanindependence',
  'freetibet',
  'xinjiangcamp',
];

/**
 * Short or ambiguous terms: blocked only when they are the entire handle, so ordinary names that
 * merely contain the letters stay usable.
 */
export const BLOCKED_WHOLE: readonly string[] = [
  // Profanity.
  'fuck',
  'fuk',
  'phuck',
  'fux',
  'shit',
  'bitch',
  'bastard',
  'cunt',
  'dick',
  'cock',
  'twat',
  'prick',
  'slut',
  'whore',
  'skank',
  'wanker',
  'moron',
  'idiot',
  // Sexual.
  'sex',
  'sexy',
  'nude',
  'nudes',
  'anal',
  'rape',
  'raped',
  'rapist',
  'cum',
  'boobs',
  'tits',
  'ass',
  'anus',
  // Drugs.
  'weed',
  'meth',
  'crack',
  'coke',
  // Gambling.
  'bet',
  'bets',
  'gamble',
  'gambler',
  // Political / meme references.
  'winnie',
  'pooh',
  'ccp',
  'isis',
  'kkk',
  // Abuse.
  'kys',
  'kill',
  'killer',
  'murder',
  'murderer',
  'pedo',
];

/**
 * Handles that would impersonate the game, the platform or its staff. Matched as a prefix, so
 * `Shatterver_Admin` is caught too.
 */
export const RESERVED_PREFIXES: readonly string[] = [
  'admin',
  'administrator',
  'mod',
  'moderator',
  'official',
  'staff',
  'system',
  'support',
  'developer',
  'shatterverse',
  'shatterver',
  'cheddaboards',
  'chedda',
  'guest',
  'anonymous',
  'player_',
  'null',
  'undefined',
  'root',
];

/**
 * Role words that must not appear as a `_`-separated segment, whatever comes before them. This is
 * what catches `Shatterverse_Staff` without banning every fan name that starts with the game's.
 */
export const RESERVED_SEGMENTS: readonly string[] = [
  'admin',
  'administrator',
  'mod',
  'moderator',
  'official',
  'staff',
  'support',
  'system',
  'developer',
  'root',
];

/**
 * Chinese terms, matched against any text that is not pure ASCII. Handles on the board are ASCII
 * only, so these never fire today — they are here so the same filter still holds if the charset
 * rule is ever relaxed, or if the local display name starts accepting Chinese.
 */
export const BLOCKED_CJK: readonly string[] = [
  // Porn / sexual.
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
  '大麻',
  '摇头丸',
  // Political.
  '法轮功',
  '六四',
  '台独',
  '藏独',
  '疆独',
  '反共',
];
