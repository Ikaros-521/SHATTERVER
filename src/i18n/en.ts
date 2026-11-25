import { b, pct } from '../game/upgrades/format';
import type { ContentOverrides } from './content-types';
import type { UiDict } from './zh';

/**
 * English locale. UI copy mirrors `zh.ts` key for key; the `content` section carries the full
 * English override table for the game-content strings whose Chinese text is canonical in `game/`
 * (upgrade names/flavors/descriptions, level names, bosses, mutators, reactions, …).
 */
export const en: UiDict & { content: ContentOverrides } = {
  common: {
    back: 'Back',
  },
  meta: {
    title: 'SHATTERVERSE 碎界',
    description: 'SHATTERVERSE — a roguelite brick-breaker built around absurd builds and maximum game feel.',
    htmlLang: 'en',
  },
  boot: {
    canvasLabel: 'Game view',
    noscript: 'SHATTERVERSE needs JavaScript to run.',
    fatalTitle: 'SHATTERVERSE',
    fatalCannotStart: 'Cannot start',
    fatalErrored: 'Something broke on start-up',
    fatalNoWebgl:
      'This browser or device does not support WebGL2. Please use an up-to-date Chrome, Edge or Firefox and make sure hardware acceleration is on.',
    fatalGeneric:
      'Please refresh the page and try again. If the problem persists, send the details below to the developer.',
  },
  menu: {
    tagline: 'The roguelite breakout that gets more absurd the longer you play',
    campaign: 'Campaign',
    endless: 'Endless',
    tutorial: 'How to play',
    codex: 'Codex',
    history: 'Records',
    cloud: 'Cloud board',
    settings: 'Settings',
    help: 'Move the mouse to steer · <kbd>Space</kbd>/click for Overdrive · <kbd>P</kbd> to pause',
    recordsEmpty: 'No records yet. Your first run starts here.',
    recordCampaignDepth: 'Campaign best: sector {n}',
    recordBossNote: ' (bosses down ×{n})',
    recordEndlessDepth: 'Endless best: level {n}',
    recordBestScore: 'Best score {n}',
    recordWins: '{n} campaigns cleared',
    recordRuns: '{n} runs played',
  },
  hud: {
    shield: 'Shield',
    build: 'Build',
    buildEmpty: 'Clear a level, draft one of three.',
    keySpace: 'Space',
    odReady: 'Overdrive ready · click',
    phase: 'PHASE {n}',
    enraged: 'ENRAGED',
    statDamage: 'Total damage',
    statBalls: 'Balls',
    statComboBonus: 'Combo bonus',
    statCrit: 'Crit chance',
    buffs: 'Power-ups',
  },
  starter: {
    title: 'Pick a starting protocol',
    sub: 'The protocol is where your build begins. Every three-way draft after that is yours to call.',
    campaignEyebrow: 'CAMPAIGN · 15 SECTORS · 3 BOSSES',
    endlessEyebrow: 'ENDLESS · NO FINAL SECTOR',
    crystals: '+{n} crystals',
  },
  draft: {
    title: 'Pick one upgrade',
    eyebrow: 'SECTOR {code} CLEAR',
    reroll: 'Reroll',
    skip: 'Skip',
    newUpgrade: 'NEW',
    maxed: 'MAX',
  },
  pause: {
    title: 'Paused',
    resume: 'Resume',
    settings: 'Settings',
    abandon: 'Abandon run',
  },
  over: {
    titleWon: 'The rift has been shattered',
    titleLost: 'Shield breached',
    subWon: 'Three bosses, fifteen sectors, one completely absurd build.',
    diffSuffix: '{name} · ',
    campaignMode: 'Campaign',
    endlessMode: 'Endless',
    stopAt: 'stopped at {code}{name}',
    tileScore: 'Final score',
    tileLevel: 'Sector reached',
    tileDamage: 'Total damage',
    tileCombo: 'Best combo',
    tileBricks: 'Bricks shattered',
    tileTime: 'Time survived',
    endlessLevel: 'Level {n}',
    newRecord: 'New record',
    rankNote: '#{rank} of {total} runs',
    timelineTip: '{level} {name} · {time}s · hits taken {n}',
    retry: 'Run it back',
    saveShot: 'Save score card',
    shotSaved: 'Saved ✓',
    shotFailed: 'Render failed',
    viewHistory: 'Records',
    cloudBoard: 'Cloud board',
    backToMenu: 'Main menu',
  },
  history: {
    title: 'Records',
    summary: '{runs} local runs · {wins} campaigns cleared · {bricks} bricks shattered in total',
    tabCampaign: 'Campaign',
    tabEndless: 'Endless',
    emptyCampaign: 'No campaign runs yet. Your first one starts at the main menu.',
    emptyEndless: 'No endless runs yet.',
    whereWon: 'cleared {code} {name}',
    whereLost: 'stopped at {code} {name}',
    whereEndless: 'Level {level}',
    chipLatest: 'NEW',
    metaRow: '{where} · combo {combo} · damage {damage} · {time} · {date}',
  },
  cloud: {
    title: 'Cloud board',
    sub: 'Scores upload automatically. The all-time board mixes every difficulty; per-difficulty and per-mode boards appear once created in the service console.',
    nicknameLabel: 'Nickname',
    nicknamePlaceholder: '3–16 letters, digits or underscores',
    saveName: 'Save name',
    noteRule: 'Cloud nicknames take {min}–{max} letters, digits or underscores.',
    noteOk: '「{name}」 works.',
    toyEyebrow: 'CLOUD · BILIBILI TOY',
    toySub:
      'Scores upload to the Bilibili Toy boards automatically: all-time / weekly / daily, plus the endless, campaign and abyss boards. "Global" is a read-only mirror of the CheddaBoards global board.',
    toyNote: 'The cloud board shows your Bilibili nickname — nothing to set up.',
    toyNoteNamed: 'The cloud board shows your Bilibili nickname: {name}',
    noNickname:
      'No nickname yet. Without one the board shows a server-assigned Player_ number. {min}–{max} letters, digits or underscores only.',
    pendingNickname: '「{name}」 will appear on the cloud board once your first score is uploaded.',
    currentNickname: 'Current nickname: {name}',
    saving: 'Saving…',
    loading: 'Loading…',
    offline:
      'The cloud board is unreachable. Scores and nicknames stay on this device; try again from here once the network is back.',
    emptyBoard: 'No scores on this board yet. Play one run and the first entry is yours.',
    you: 'You',
    streak: 'Best combo {n}',
    totalEntries: '{n} entries',
    myRank: 'You rank #{rank}',
    myRankOf: 'You rank #{rank} / {total}',
  },
  codex: {
    title: 'Codex',
    tabUpgrades: 'Upgrades',
    tabReactions: 'Reactions',
    tabBuffs: 'Power-ups',
    tabRules: 'Basics',
    progressUpgrades:
      'Encountered {n} of {total} upgrades. Upgrades from the same school show up together more often.',
    progressReactions:
      'Unlocks automatically once your build owns both elements. Reactions fire on a fixed rhythm — not every single hit.',
    progressBuffs:
      'Bricks drop capsules now and then; a capsule falls straight down and must be caught on the paddle (a magnet pulls it in). Its power-up lasts a few seconds — for the current level only.',
    buffTimed: '{n}s',
    buffInstant: 'Instant',
    progressRules: 'Thirty seconds to learn, a lifetime to escalate.',
    maxLevel: 'Max Lv {n}',
    unique: 'Unique',
    undiscovered: 'Not yet seen',
    requires: 'Requires {list}',
    maxedDesc: 'At max: {desc}',
    nextLevel: 'Next level: {desc}',
    notOwned: 'Not owned',
    ruleTarget: 'The goal',
    ruleTargetBody:
      'Clear every level of bricks. The brick wall keeps sinking, and bricks that sink past the <b>red warning line</b> shatter and cost one shield; at zero shields the run ends.',
    ruleCatch: 'Catching and aiming',
    ruleCatchBody:
      'A ball that reaches the bottom is <b>never lost</b> — it relaunches from the paddle shortly after. Where the paddle catches it steers the return angle: the edges send it wide, the center sends it straight up. A dead-center catch is a <b>perfect catch</b> and charges the most.',
    ruleBullets: 'Barrages',
    ruleBulletsBody:
      'Turrets and bosses fire barrages at the paddle. <b>Intercept them with the paddle</b>; only the ones that slip past the bottom cost shield. Balls and lasers can destroy barrages too.',
    ruleOverdrive: 'Overdrive',
    ruleOverdriveBody:
      'Hits and catches charge the paddle. When full, press <b>Space</b> or click for seconds of boosted damage and speed.',
    ruleBuild: 'Builds',
    ruleBuildBody:
      'Each cleared level offers a three-way draft — {n} upgrades across 5 rarities. Upgrades from the same school appear together more often; legendaries and mythics presuppose their school. Owning two elements unlocks <b>elemental reactions</b>.',
    ruleBuffs: 'Power-ups',
    ruleBuffsBody:
      'Shattering bricks drops <b>capsules</b> from time to time — ball splits, giant balls, a longer paddle, time stop… A capsule falls straight down from where it dropped: catch it on the paddle or it is gone for good; a <b>magnet</b> pulls it in. A caught power-up lasts a few seconds, with the time left shown on screen. Power-ups last for the current level only; the <b>Resonance</b> school makes them come sooner and last longer.',
    ruleCrystals: 'Crystals',
    ruleCrystalsBody:
      'Shattered bricks drop crystals ◆ — spend them to <b>reroll</b> a draft, or <b>skip</b> the draft to bank more.',
  },
  settings: {
    title: 'Settings',
    language: 'Language',
    music: 'Music volume',
    sfx: 'Sound volume',
    shake: 'Screen shake',
    flashes: 'Flash effects',
    quality: 'Quality',
    qualityLow: 'Low · smoothness first',
    qualityMedium: 'Medium',
    qualityHigh: 'High · full effects',
    seed: 'Fixed seed',
    seedPlaceholder: 'Leave empty for a random seed each run',
    perfHead: 'Diagnostics',
    perfButton: 'Measure render times',
    perfCollecting: 'Collecting…',
    perfLine: 'avg {fps} fps · worst 5% {low} fps · late frames {jank}%',
    perfAdjusted:
      'In effect: {tier}. When the frame rate falls short the game steps quality down and remembers; pick a quality by hand and it tries yours again.',
    perfGaveUp:
      'The frame rate is low, but lowering quality does not help — most likely the system power saver is capping the frame rate, which has nothing to do with quality.',
    perfFail: 'Could not measure render times.',
    gpuLine: 'GPU ≈ {ms} ms per frame — {parts} (each pass includes ~0.1ms of measuring overhead)',
    gpuComposite: 'composite',
    gpuBackdrop: 'backdrop',
    gpuLights: 'lights',
    gpuSurfaces: 'bricks & balls',
    gpuBloom: 'bloom',
    gpuNebula: 'nebula',
    gpuText: 'numbers',
    done: 'Done',
  },
  callouts: {
    perfectSub: 'Perfect catch',
    bossDownSub: 'Boss down',
    enragedSub: 'The boss is furious',
    phaseSub: 'Phase {n}',
    overdriveSub: 'Overdrive',
    timeStopSub: 'Time stop',
    sectorClearSub: 'Sector clear',
    buffSub: '{name} · {n}s',
    buffTwinSub: '{name} · twin · {n}s',
    dodgeSub: 'Shield intact',
    reactionToast: 'Elemental reaction · {name}',
    reactionDetail: '{recipe}: {desc}',
    difficultyToast: '{en} · {name}',
    firstToastTitle: 'Move the mouse to steer',
    firstToastBody:
      'Balls that fall off the bottom are never lost. Edge catches send the ball wide; dead-center catches charge the most.',
    bannerMutator: 'MUTATOR · {name} — {desc}',
    qualityAdjustedTitle: 'Quality adjusted automatically',
    qualityAdjustedBody:
      'The frame rate fell short, so the game is now at 「{tier}」 and will remember it for this device. Change it any time in settings.',
    qualityGaveUpTitle: 'Restored your chosen quality',
    qualityGaveUpBody:
      'Lowering quality did not raise the frame rate — the stutter has another cause (often a system power saver capping the frame rate).',
  },
  governor: {
    qualityHigh: 'High',
    qualityMedium: 'Medium',
    qualityLow: 'Low',
    scaled: '{name} ({pct}% render resolution)',
  },
  tutorial: {
    sub: 'One minute on the rules, the shield, upgrades and mutators.',
    skip: 'Skip',
    prev: 'Back',
    next: 'Next',
    start: 'Play',
    dotsLabel: 'Tutorial pages',
    pageAria: 'Page {n}',
    pages: [
      {
        eyebrow: 'TUTORIAL · 01',
        title: 'Welcome to the rift',
        html: `
      <p>SHATTERVERSE is a <b>roguelite brick-breaker that gets more absurd the longer you play</b>: shatter every level's bricks and grow the paddle and the balls into your own ridiculous school of thought.</p>
      <p>The campaign runs 15 sectors and 3 bosses; Endless has no final sector — the deeper you go, the harder it gets.</p>
      <p>The next few pages take a minute. In a hurry? <b>Skip</b> at any time — you can always come back via "How to play" in the main menu.</p>`,
      },
      {
        eyebrow: 'TUTORIAL · 02',
        title: 'The paddle and the balls',
        art: 'paddle',
        html: `
      <p>Steer the paddle with your <b>mouse or finger</b>. A ball that reaches the bottom is <b>never lost</b> — it relaunches from the paddle shortly after.</p>
      <p>Where you catch the ball steers its return angle: the <b>edges</b> send it wide, the <b>center</b> sends it straight up. A dead-center catch is a <b>perfect catch</b> and charges the most.</p>
      <p><b>Overdrive</b>: hits and catches charge the paddle. When full, press <kbd>Space</kbd> or tap the prompt at the bottom of the screen for {overdrive} seconds of boosted damage and speed.</p>
      <p>On desktop, <kbd>P</kbd> or <kbd>Esc</kbd> pauses at any time.</p>`,
      },
      {
        eyebrow: 'TUTORIAL · 03',
        title: 'The shield and taking hits',
        art: 'danger',
        html: `
      <p>The row of glowing cells in the top-left corner is your <b>shield</b> (your life): it starts at {maxHp}, and some upgrades raise the cap.</p>
      <p>The shield only drops in two ways:</p>
      <ul>
        <li><b>The warning line</b> — the brick wall keeps sinking; a brick that sinks past the red line at the bottom shatters and costs −1 shield.</li>
        <li><b>Barrages</b> — turrets and bosses fire at the paddle. Intercept them with the paddle; one that slips past the bottom costs −1 shield.</li>
      </ul>
      <p>After each hit you get about a second of grace before the next one can land, but your combo resets and some Overdrive charge drains away.</p>
      <p>Recovery: clearing a boss restores +1; hearts occasionally drop in a level — catch one for +1. <b>At zero shields, the run ends.</b></p>`,
      },
      {
        eyebrow: 'TUTORIAL · 04',
        title: 'Three-way drafts',
        html: `
      <p>Every cleared level offers a <b>choice of one of three</b> upgrades; they last for the run and stack into your school of thought. There are {upgrades} upgrades across 5 rarities: common → rare → epic → legendary → mythic.</p>
      <p>Upgrades belong to schools — Ball / Paddle / Damage / Flame / Frost / Shock / Corrode / Void / Blast / Laser / Time / Greed / Survival / Overdrive / Resonance. <b>Upgrades from the same school appear together more often</b>.</p>
      <p><b>Elemental reactions</b>: owning two of the elements (frost, flame, shock, corrode) unlocks combo effects automatically — like Melt from frost + flame.</p>
      <p><b>Power-ups</b>: shattered bricks now and then drop <b>capsules</b> — ball splits, giant balls, a longer paddle, time stop… A capsule falls straight down: catch it on the paddle or it is gone; a magnet pulls it in. A caught one lasts a few seconds, for the current level only. The <b>Resonance</b> school is built around them.</p>
      <p><b>Crystals</b>: shattered bricks drop crystals ◆. Spend them to <b>reroll</b> a draft, or <b>skip</b> the draft to bank them for later.</p>`,
      },
      {
        eyebrow: 'TUTORIAL · 05',
        title: 'Mutators and hazards',
        art: 'threats',
        mutators: true,
        html: `
      <p>Some levels open with a <b>mutator</b> announcement: the whole level plays by altered rules — some make trouble, some pay out.</p>
      <p>Higher difficulties also field <b>ball-swallowing eraser bricks</b>; on Abyss a surplus ball is erased every 16 seconds. The longer a boss fight drags, the more dangerous it gets — past its timer the boss goes <b>enraged</b> and its barrages thicken.</p>`,
      },
      {
        eyebrow: 'TUTORIAL · 06',
        title: 'Ready',
        html: `
      <p>The first few sectors keep an easy pace — find your catch first. Once the build comes together, the screen gets busy.</p>
      <p>For upgrade details and reactions: main menu → <b>Codex</b>; the Basics tab holds the same rules recap.</p>
      <p>Settings covers volume, quality and screen shake; when a device cannot keep the frame rate, the game steps quality down on its own to stay smooth.</p>
      <p>Ready? Bottom-right corner — start a run.</p>`,
      },
    ],
  },
  scorecard: {
    report: 'RUN REPORT',
    finalScore: 'FINAL SCORE',
    newRecord: 'NEW RECORD',
    rank: 'RANK #{rank}',
    localCount: '{n} local runs',
    clearedAll: 'cleared every sector',
    stoppedAt: 'stopped at {code} {name}',
    modeCampaign: 'CAMPAIGN',
    modeEndless: 'ENDLESS',
    modeCampaignShort: 'Campaign',
    modeEndlessShort: 'Endless',
    tileLevel: 'Sector reached',
    tileDamage: 'Total damage',
    tileCombo: 'Best combo',
    tileBricks: 'Bricks shattered',
    tileTime: 'Time survived',
    tileRank: 'Local rank',
    endlessLevel: 'Level {n}',
    rankOf: '#{rank} of {total} runs',
    firstRun: 'First run',
    build: 'FINAL BUILD',
    noBuild: 'A blank slate — no upgrades carried',
    tagline: 'ROGUELITE BREAKOUT',
  },
  net: {
    boardAllTime: 'All-time',
    boardWeekly: 'Weekly',
    boardDaily: 'Today',
    boardEndless: 'Endless',
    boardCampaign: 'Campaign',
    boardAbyss: 'Abyss',
    boardGlobal: 'Global',
    renamePending: 'Saved 「{name}」 — it will appear on the cloud board once your first score is uploaded.',
    renameApplied: 'Nickname updated to 「{name}」.',
    renameRejected: 'Nickname rejected: {error}',
    renameRateLimited: 'Too many attempts — try again shortly.',
    renameOffline: 'The cloud board is unreachable; the nickname is saved on this device only.',
    renameFailed: 'Nickname not saved: {error}',
    scoreZero: 'This run scored nothing — nothing to upload.',
    uploadedRank: 'Uploaded · global #{rank} / {total}',
    uploaded: 'Uploaded to the cloud board',
    scoreRejected: 'The score failed validation; it is saved locally.',
    scoreRateLimited: 'Too many submissions — this run uploads next time.',
    scoreOffline: 'The cloud board is unreachable; the score is saved locally.',
    scoreFailed: 'The score was not uploaded; it is saved locally.',
    toyNotLoggedIn: 'Not signed in to Bilibili; the score is saved locally.',
    toyFailed: 'The score was not uploaded to Bilibili; it is saved locally.',
    nickEmpty: 'The nickname cannot be empty',
    nickLength: 'Nicknames take {min}–{max} characters',
    nickCharset:
      'Nicknames accept letters, digits and underscores only (the cloud board does not take Chinese, spaces or emoji)',
    nickBlocked: 'That nickname is not available — pick another',
    nickReserved: 'That nickname is reserved — pick another',
    toyApiFailed: 'Bilibili API call failed',
  },
  content: {
    upgrades: {
      multiball: {
        name: 'Multiball',
        flavor: 'One is not enough? Then have another.',
        describe: (lv) => `Ball count ${b('+' + lv)}.`,
      },
      power: {
        name: 'Power Core',
        flavor: 'A whole power plant, packed into one ball.',
        describe: (lv) => `Base damage ${b('+' + pct(0.3 * lv))}.`,
      },
      wide: {
        name: 'Wide Field',
        flavor: 'Surface area is justice.',
        describe: (lv) => `Paddle width ${b('+' + pct(0.22 * lv))}.`,
      },
      bigball: {
        name: 'Bulwark',
        flavor: "Physics' letter of apology.",
        describe: (lv) => `Ball radius ${b('+' + pct(0.28 * lv))}, base damage ${b('+' + pct(0.15 * lv))}.`,
      },
      speed: {
        name: 'Supersonic',
        flavor: 'The sonic boom is the only braking sound.',
        describe: (lv) => `Ball speed ${b('+' + pct(0.14 * lv))}, base damage ${b('+' + pct(0.12 * lv))}.`,
      },
      lucky: {
        name: 'Lucky Charm',
        flavor: 'Now and then the universe takes your side.',
        describe: (lv) =>
          `Luck ${b('+' + lv)} (higher-rarity roll rates), crystal gain ${b('+' + pct(0.25 * lv))}.`,
      },
      growth: {
        name: 'Growth Protocol',
        flavor: 'Compound interest, the eighth wonder of the world.',
        describe: (lv) =>
          `Every cleared level grants base damage ${b('+' + pct(0.15 * lv))} (stacks permanently).`,
      },
      shield: {
        name: 'Phase Shield',
        flavor: 'One more life, one more chance to be absurd.',
        describe: (lv) => `Max shield ${b('+' + lv)}, and restores ${b(lv)} right away.`,
      },
      crit: {
        name: 'Crit Matrix',
        flavor: 'Weak points? Everywhere is a weak point.',
        describe: (lv) => `Crit chance ${b('+' + pct(0.12 * lv))}, crit damage ${b('+' + pct(0.3 * lv))}.`,
      },
      pierce: {
        name: 'Phase Pierce',
        flavor: 'A wall? What wall?',
        describe: (lv) =>
          `Balls have a ${b(pct(0.22 * lv))} chance to ${b('pierce')} bricks without bouncing.`,
      },
      homing: {
        name: 'Guidance',
        flavor: 'They know where they need to go.',
        describe: (lv) => `Balls home in on the nearest brick; steering force ${b('+' + lv)} grade.`,
      },
      split: {
        name: 'Mitosis',
        flavor: 'Cell division, exponential growth.',
        describe: (lv) =>
          `A shattered brick has a ${b(pct(0.16 * lv))} chance to split off a child ball (45% damage, lives 4s).`,
      },
      fire: {
        name: 'Ignition',
        flavor: 'Set everything alight.',
        describe: (lv) => `Hits apply ${b('burn')}: ${b(pct(0.45 * lv))} attack damage per second for 3s.`,
      },
      frost: {
        name: 'Cryo',
        flavor: 'Absolutely calm.',
        describe: (lv) =>
          `Hits have a ${b(pct(Math.min(1, 0.22 * lv)))} chance to ${b('freeze')} for 1.6s; frozen bricks take ${b('+30%')} damage.`,
      },
      shock: {
        name: 'Tesla',
        flavor: 'High voltage — do not touch.',
        describe: (lv) =>
          `Hits release a ${b('lightning chain')} that jumps to ${b(2 * lv)} targets for ${b('45%')} damage each.`,
      },
      laser: {
        name: 'Laser Array',
        flavor: 'The paddle declines to remain a mere paddle.',
        describe: (lv) =>
          `The paddle fires ${b(lv)} laser(s) every 0.9s, each dealing ${b(pct(0.6 * lv))} attack damage.`,
      },
      magnet: {
        name: 'Magnet Anchor',
        flavor: 'You can miss, but the ball will not.',
        describe: (lv) =>
          `A ${b('magnetic field')} forms above the paddle (range ${b(110 * lv)}), pulling falling balls and power-up capsules in.`,
      },
      empower: {
        name: 'Charged Return',
        flavor: 'Charged a little on the way back, no big deal.',
        describe: (lv) =>
          `Balls bounced back by the paddle gain a ${b('charge')}: damage ${b('+' + pct(0.6 * lv))} for 3s.`,
      },
      echo: {
        name: 'Echo',
        flavor: 'The first hit is a greeting; the second is the answer.',
        describe: (lv) =>
          `Hits have a ${b(pct(0.18 * lv))} chance to trigger an ${b('echo')}: 60% damage again after 0.25s.`,
      },
      shatter: {
        name: 'Shrapnel',
        flavor: 'The splinters are more dangerous than the brick.',
        describe: (lv) => `A breaking brick flings ${b(3 * lv)} splinters, each dealing 30% attack damage.`,
      },
      explosive: {
        name: 'Blast Core',
        flavor: 'Every brick is a firework.',
        describe: (lv) =>
          `Shattered bricks ${b('explode')}: radius ${b(85 + 18 * (lv - 1))}, dealing ${b(pct(0.5 * lv))} attack damage.`,
      },
      combo: {
        name: 'Combo Flow',
        flavor: 'Do not stop.',
        describe: (lv) => `Every 10 combo, damage ${b('+' + pct(0.05 * lv))}. ${b('No cap')}.`,
      },
      chainreaction: {
        name: 'Chain Reaction',
        flavor: 'One brick falls, a whole wall goes with it.',
        describe: () =>
          `Bricks shattered by an explosion ${b('explode again')} at full damage. One chain is all it takes.`,
      },
      meltdown: {
        name: 'Meltdown',
        flavor: 'Cooling system? Removed.',
        describe: () =>
          `Explosion radius ${b('+60%')}, and each blast leaves a ${b('fire pool')} for 2s (70% attack damage per second).`,
      },
      void: {
        name: 'Void Touch',
        flavor: 'Space is a little unstable here.',
        describe: (lv) =>
          `Shattered bricks have a ${b(pct(0.07 * lv))} chance to tear open a ${b('black hole')}: it bends ball paths, grinds nearby bricks and bursts at the end.`,
      },
      reaper: {
        name: 'Decree',
        flavor: 'Numbers are merely a suggestion.',
        describe: (lv) =>
          `Bricks below ${b(pct(0.06 * lv))} health are ${b('executed')} outright (boss cores are immune).`,
      },
      poison: {
        name: 'Corrosive',
        flavor: 'Percentage damage ignores every defense.',
        describe: (lv) =>
          `Hits apply ${b('corrosion')}: damage per second equal to ${b(pct(0.025 * lv))} of the target's max health, for 4s. The boss killer.`,
      },
      solar: {
        name: 'Prominence',
        flavor: 'Every ball is a tiny sun.',
        describe: (lv) =>
          `A ${b('corona')} surrounds each ball (range 80), dealing ${b(pct(0.45 * lv))} attack damage per second.`,
      },
      orbital: {
        name: 'Orbital Lance',
        flavor: 'Orbital support is on station.',
        describe: (lv) =>
          `Every 4s, ${b(lv)} ${b('orbital beam(s)')} sweep a full column; every brick in the column takes 300% attack damage.`,
      },
      timestop: {
        name: 'Temporal Stasis',
        flavor: 'World, stop.',
        describe: (lv) =>
          `Every 20s, an automatic ${b('time stop')} of ${b((2.5 + 0.5 * lv).toFixed(1))}s: everything hostile freezes and ball damage ${b('×2')}.`,
      },
      mirror: {
        name: 'Mirror Verse',
        flavor: 'Someone is playing in the mirror too.',
        describe: (lv) => `Each ball carries a ${b('mirror ghost ball')} dealing ${b(pct(0.4 * lv))} damage.`,
      },
      singularity: {
        name: 'Singularity',
        flavor: 'It is not a picky eater.',
        describe: () =>
          `A ${b('singularity')} roams the field, continuously grinding up every brick it passes.`,
      },
      phantom: {
        name: 'Phantom Lance',
        flavor: 'Whatever stands in the way is decoration.',
        describe: () =>
          `Pierce chance raised to ${b('100%')}; each pierce grants that ball ${b('+25%')} damage (resets on paddle touch, up to +300%).`,
      },
      recursion: {
        name: 'Recursion',
        flavor: 'Splits of splits of splits…',
        describe: () => `Split chance ${b('+30%')}, and ${b('child balls split too')}. In theory, no end.`,
      },
      overclock: {
        name: 'Overclock',
        flavor: 'Warranty? What warranty?',
        describe: () =>
          `${b('Overdrive')} lasts ${b('×2')} longer and deals ${b('×2')} damage on top while active.`,
      },
      momentum: {
        name: 'Momentum',
        flavor: 'It hurts more with every bounce.',
        describe: () =>
          `Each brick a ball strikes grants ${b('+12%')} damage (resets on paddle touch, up to ${b('+300%')}).`,
      },
      supernova: {
        name: 'Supernova',
        flavor: 'A star’s final encore.',
        describe: () =>
          `Explosion radius ${b('×2')}; each explosion has a ${b('25%')} chance to bloom into a ${b('supernova')} — radius ×3.5, damage ×3, lights up the whole screen.`,
      },
      eventhorizon: {
        name: 'Event Horizon',
        flavor: 'Not even light escapes.',
        describe: () =>
          `Black hole radius and duration ${b('×2')}, burst damage ${b('×3')}; singularity damage ${b('×2')}.`,
      },
      absolutezero: {
        name: 'Absolute Zero',
        flavor: 'Even the molecules stopped thinking.',
        describe: () =>
          `Freeze ${b('always triggers')}; a frozen brick that shatters sets off an ${b('ice burst')} (radius 130, 120% attack damage).`,
      },
      resonator: {
        name: 'Resonance Coil',
        flavor: 'Let every gift linger a little.',
        describe: (lv) => `Power-up duration ${b('+' + pct(0.35 * lv))}.`,
      },
      capacitor: {
        name: 'Capacitor',
        flavor: 'One more charge. Just one more.',
        describe: (lv) => `Overdrive energy gained ${b('+' + pct(0.3 * lv))}.`,
      },
      recycler: {
        name: 'Recycler',
        flavor: 'There is no such thing as scrap.',
        describe: (lv) => `Crystal gain ${b('+' + pct(0.4 * lv))}.`,
      },
      calibration: {
        name: 'Calibration',
        flavor: "A hair's breadth, a world of difference.",
        describe: (lv) =>
          `The perfect-catch zone grows ${b('+' + pct(0.6 * lv))}, and a perfect catch charges ${b('+' + pct(0.25 * lv))} more.`,
      },
      antenna: {
        name: 'Surge Antenna',
        flavor: 'Good things find you first.',
        describe: (lv) =>
          `Power-up capsules come sooner: the gap between them shrinks by ${b(pct(1 - 1 / (1 + 0.5 * lv)))}.`,
      },
      adrenaline: {
        name: 'Adrenaline',
        flavor: 'Heart rate: one-eighty.',
        describe: (lv) =>
          `While any power-up is running, damage ${b('+' + pct(0.4 * lv))} and ball speed ${b('+' + pct(0.2 * lv))}.`,
      },
      trampoline: {
        name: 'Trampoline',
        flavor: 'The floor says: once more.',
        describe: (lv) =>
          `A ball that reaches the bottom ${b('bounces off the floor ' + lv + '×')} before it counts as lost.`,
      },
      evade: {
        name: 'Evade',
        flavor: 'A near miss.',
        describe: (lv) =>
          `A hit has a ${b(pct(0.2 * lv))} chance to be ${b('dodged')}: no shield lost, combo intact.`,
      },
      slowfield: {
        name: 'Slow Field',
        flavor: 'Let the world run half a beat late.',
        describe: (lv) => `The wall's descent and the bullets' speed ${b('−' + pct(0.15 * lv))}.`,
      },
      afterglow: {
        name: 'Afterglow',
        flavor: 'The embers still burn.',
        describe: () =>
          `When Overdrive runs out it releases a ${b('screen-wide shockwave')}: ${b('200%')} attack damage to every brick.`,
      },
      thunderhead: {
        name: 'Thunderhead',
        flavor: 'There is always a cloud overhead.',
        describe: (lv) =>
          `Every 2.5s, lightning strikes the brick nearest the danger line for ${b(pct(3 * lv))} attack damage and sets off a ${b('lightning chain')} (${b(2 * lv)} jumps).`,
      },
      plague: {
        name: 'Plague',
        flavor: 'One falls, the row follows.',
        describe: () =>
          `A brick that shatters while ${b('corroded')} spreads its corrosion to every brick within ${b(150)}.`,
      },
      wildfire: {
        name: 'Wildfire',
        flavor: 'Once it catches, it does not stop.',
        describe: () =>
          `A brick that shatters while ${b('burning')} sets every brick within ${b(140)} alight.`,
      },
      prism: {
        name: 'Prism',
        flavor: 'One beam in, three out.',
        describe: () =>
          `A laser hit ${b('refracts')} sideways into the next brick on each side (${b('50%')} attack damage).`,
      },
      twinresonance: {
        name: 'Twin Resonance',
        flavor: 'One capsule, twice the fun.',
        describe: () => `Every power-up also triggers ${b('a second, random power-up')} at 50% duration.`,
      },
      criticalmass: {
        name: 'Critical Mass',
        flavor: 'A chain that will not stop.',
        describe: () =>
          `Overdrive lasts ${b('0.5s')} longer for every ${b(5)} bricks shattered while it runs (at most ${b('6s')} longer).`,
      },
      perpetuum: {
        name: 'Perpetuum',
        flavor: 'Conservation of energy? Never heard of it.',
        describe: () =>
          `While Overdrive runs, ${b('power-up countdowns pause')}; while a power-up runs, Overdrive energy gained ${b('×3')}.`,
      },
    },
    buffs: {
      split: {
        name: 'Ball Split',
        desc: 'Every real ball in flight forks into two twins (70% damage). The twins leave when the power-up does.',
      },
      giant: {
        name: 'Giant',
        desc: 'Ball radius ×2.2, damage +60%.',
      },
      wide: {
        name: 'Wide',
        desc: 'Paddle width ×1.8.',
      },
      laser: {
        name: 'Laser Burst',
        desc: 'The paddle fires 3 extra lasers.',
      },
      magnet: {
        name: 'Super Magnet',
        desc: 'A strong field pulls falling balls and power-up capsules onto the paddle.',
      },
      ghost: {
        name: 'Phase',
        desc: 'Balls pass through bricks without bouncing; each pass banks +20% damage (resets on paddle touch).',
      },
      homing: {
        name: 'Seeker',
        desc: 'Balls home hard on the nearest brick.',
      },
      rage: {
        name: 'Rage',
        desc: 'Damage ×2.',
      },
      aegis: {
        name: 'Aegis',
        desc: 'A barrier opens under the paddle and swallows every bullet.',
      },
      gold: {
        name: 'Crystal Rain',
        desc: 'Every brick drops crystals, at double value.',
      },
      deadeye: {
        name: 'Weak Point',
        desc: 'Crit chance 100%.',
      },
      blast: {
        name: 'Demolition',
        desc: 'Every brick shattered sets off an explosion.',
      },
      storm: {
        name: 'Elemental Storm',
        desc: 'Hits apply burn, frost, corrosion and lightning at once, setting off every elemental reaction.',
      },
      timestop: {
        name: 'Time Stop',
        desc: 'Everything hostile stands still; ball damage ×2.',
      },
      turbo: {
        name: 'Turbo',
        desc: 'Ball speed +40%, damage +40%.',
      },
      overcharge: {
        name: 'Overcharge',
        desc: 'Fills the Overdrive meter at once.',
        short: 'Meter full',
      },
      repair: {
        name: 'Repair',
        desc: 'Restores 1 shield at once.',
        short: 'Shield +1',
      },
    },
    difficulty: {
      standard: {
        name: 'Standard',
        desc: 'The game as designed. Once a build comes together, it eases up.',
        detail: ['Sectors as designed'],
      },
      advanced: {
        name: 'Advanced',
        desc: 'Thicker walls, sinking faster. Strength starts to matter.',
        detail: ['Brick health +25%', 'Descent speed +30%', '+1 row of bricks'],
      },
      hard: {
        name: 'Hard',
        desc: 'A narrower paddle, denser barrages, and ball-eating eraser bricks.',
        detail: [
          'Brick health +30%',
          'Descent speed +40%',
          '+2 rows of bricks',
          'Paddle −5%',
          'Barrages +10%',
          '4% eraser bricks',
        ],
      },
      nightmare: {
        name: 'Nightmare',
        desc: 'Ball speed suppressed, eraser bricks in ranks. The exam hall for absurd builds.',
        detail: [
          'Brick health +50%',
          'Descent speed +60%',
          '+3 rows of bricks',
          'Paddle −10%',
          'Ball speed −4%',
          'Barrages +20%',
          '7% eraser bricks',
        ],
      },
      abyss: {
        name: 'Abyss',
        desc: 'Something from beyond the rift. Every 16 seconds, one surplus ball is erased.',
        detail: [
          'Brick health +75%',
          'Descent speed +90%',
          '+4 rows of bricks',
          'Paddle −22%',
          'Ball speed −10%',
          'Barrages +50%',
          '12% eraser bricks',
          'Erases one surplus ball every 16s',
        ],
      },
    },
    starters: {
      blank: {
        name: 'Blank Slate',
        desc: 'Depart with no upgrades but 60 crystals in your pocket — the road you take is decided by every choice after this one.',
      },
      barrage: {
        name: 'Barrage',
        desc: 'Multiball Lv1 + Mitosis Lv1. The balls on screen will keep multiplying.',
      },
      battery: {
        name: 'Battery',
        desc: 'Laser Array Lv1 + Power Core Lv1. The paddle opens fire on its own.',
      },
      element: {
        name: 'Elemental',
        desc: 'Ignition Lv1 + Tesla Lv1. The reaction "Overload" is live from level one.',
      },
    },
    chapters: [
      {
        name: 'Neon City',
        places: [
          'Neon Blocks',
          'Data Speedway',
          'Holo Plaza',
          'Pulse Tower',
          'Quantum Station',
          'Mirror Tower',
          'Grid Hub',
          'Midnight Arcade',
        ],
      },
      {
        name: 'Solar Core',
        places: [
          'Lava Pipelines',
          'Corona Well',
          'Overload Furnace',
          'Hematite Belt',
          'Scorching Gallery',
          'Eruption Vent',
          'Ash Storage',
        ],
      },
      {
        name: 'Void Rift',
        places: [
          'Void Gallery',
          'Singularity Edge',
          'The Silent Sea',
          'Rift Depths',
          'Annihilation Fields',
          'Zero Space',
          'Dream Wreckage',
        ],
      },
    ],
    mutators: {
      gravity: {
        name: 'Gravity Well',
        desc: 'Balls feel a downward pull; trajectories bend into arcs.',
      },
      rush: {
        name: 'Overpressure',
        desc: 'The wall sinks +50%. Ball speed +25%, damage +25%.',
      },
      regen: {
        name: 'Regenerating',
        desc: 'Bricks restore 2.5% health per second; status ailments suppress the regeneration.',
      },
      stealth: {
        name: 'Cloaked',
        desc: '40% of bricks are invisible until struck.',
      },
      flak: {
        name: 'Flak Zone',
        desc: 'Turrets fire barrages at the paddle. Intercept them; one past the bottom costs shield.',
      },
      gold: {
        name: 'Gold Rush',
        desc: 'Crystal drops ×2, and gold bricks everywhere.',
      },
    },
    bosses: {
      warden: {
        name: 'Warden-0',
        title: 'The watcher of Neon City',
      },
      solar: {
        name: 'Solar Heart',
        title: 'The furnace that never idles',
      },
      sovereign: {
        name: 'Void Sovereign',
        title: 'The throne at the bottom of the rift',
      },
    },
    reactions: {
      melt: {
        name: 'Melt',
        recipe: 'Frost + Flame',
        desc: 'The instant frost meets flame, deal 120% attack damage and melt the freeze.',
      },
      overload: {
        name: 'Overload',
        recipe: 'Flame + Shock',
        desc: 'Shock striking a burning brick sets off an explosion.',
      },
      superconduct: {
        name: 'Superconduct',
        recipe: 'Frost + Shock',
        desc: 'Shock striking a frozen brick: the chain jumps 2 extra times at 90% damage and spreads the freeze.',
      },
      venom: {
        name: 'Venom Burst',
        recipe: 'Corrode + Flame',
        desc: 'Flame detonates corroding bricks in a wide blast.',
      },
    },
    comboTiers: [
      'Running hot',
      'Blazing',
      'Radiant',
      'Ferocious',
      'Godlike',
      'Transcendent',
      'Cosmic',
      'Singular',
      'Beyond',
    ],
    rarity: {
      common: 'Common',
      rare: 'Rare',
      epic: 'Epic',
      legendary: 'Legendary',
      mythic: 'Mythic',
    },
    tags: {
      ball: 'Ball',
      paddle: 'Paddle',
      damage: 'Damage',
      fire: 'Flame',
      frost: 'Frost',
      shock: 'Shock',
      poison: 'Corrode',
      void: 'Void',
      explosion: 'Blast',
      laser: 'Laser',
      time: 'Time',
      greed: 'Greed',
      defense: 'Survival',
      overdrive: 'Overdrive',
      resonance: 'Resonance',
    },
  },
};
