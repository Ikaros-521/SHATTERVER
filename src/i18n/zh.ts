/**
 * 中文文案 — the canonical locale and the shape every other locale must match.
 *
 * UI copy lives here; game-content copy (upgrade names, level names, …) stays canonical in the
 * `game/` modules and is overridden per locale through `content-types.ts`. `{name}`-style
 * placeholders in values are filled by `t()`.
 */

/**
 * One tutorial slide. `art` names an illustration from `ui/tutorialArt.ts` shown above the text;
 * `mutators` renders the level-mutator grid under the page text.
 */
export interface TutorialPage {
  eyebrow: string;
  title: string;
  html: string;
  art?: string;
  mutators?: boolean;
}

export const zh = {
  common: {
    back: '返回',
  },
  meta: {
    title: '碎界 SHATTERVERSE',
    description: '碎界 SHATTERVERSE — 以离谱构筑与拉满爽感为核心的肉鸽打砖块。',
    htmlLang: 'zh-CN',
  },
  boot: {
    canvasLabel: '游戏画面',
    noscript: '需要启用 JavaScript 才能运行《碎界》。',
    fatalTitle: '碎界',
    fatalCannotStart: '无法启动',
    fatalErrored: '启动时出错',
    fatalNoWebgl:
      '当前浏览器或设备不支持 WebGL2。请使用最新版 Chrome、Edge 或 Firefox，并确认已开启硬件加速。',
    fatalGeneric: '请刷新页面重试。如果问题持续，请把下面的信息反馈给开发者。',
  },
  menu: {
    tagline: '越打越离谱的肉鸽打砖块',
    campaign: '开始闯关',
    endless: '无尽模式',
    tutorial: '新手说明',
    codex: '强化图鉴',
    history: '战绩排行',
    cloud: '云端排行榜',
    settings: '设置',
    help: '移动鼠标 控制挡板 · <kbd>空格</kbd>/点击 超载 · <kbd>P</kbd> 暂停',
    recordsEmpty: '还没有记录。第一局，从这里开始。',
    recordCampaignDepth: '闯关最深 {n}',
    recordBossNote: '（击败 BOSS ×{n}）',
    recordEndlessDepth: '无尽最深 第 {n} 关',
    recordBestScore: '最高分 {n}',
    recordWins: '通关 {n} 次',
    recordRuns: '已打 {n} 局',
  },
  hud: {
    shield: '护盾',
    build: '构筑',
    buildEmpty: '每通过一关，三选一。',
    keySpace: '空格',
    odReady: '超载就绪 · 点击',
    phase: '阶段 {n} · PHASE {n}',
    enraged: '狂暴 ENRAGED',
    statDamage: '总伤害',
    statBalls: '球体',
    statComboBonus: '连击加成',
    statCrit: '暴击率',
  },
  starter: {
    title: '选择初始协议',
    sub: '协议决定这局构筑的起点。之后的每一次三选一，都由你决定。',
    campaignEyebrow: 'CAMPAIGN · 15 SECTORS · 3 BOSSES',
    endlessEyebrow: 'ENDLESS · 没有终点',
    crystals: '+{n} 碎晶',
  },
  draft: {
    title: '选择一项强化',
    eyebrow: 'SECTOR {code} CLEAR',
    reroll: '刷新',
    skip: '跳过',
    newUpgrade: 'NEW · 新强化',
    maxed: '满级',
  },
  pause: {
    title: '已暂停',
    resume: '继续',
    settings: '设置',
    abandon: '放弃本局',
  },
  over: {
    titleWon: '深渊已被碾碎',
    titleLost: '护盾击穿',
    subWon: '三个 BOSS，十五个扇区，一套离谱到没边的构筑。',
    diffSuffix: '{name}难度 · ',
    campaignMode: '闯关模式',
    endlessMode: '无尽模式',
    stopAt: '止步 {code}{name}',
    tileScore: '最终得分',
    tileLevel: '抵达关卡',
    tileDamage: '总伤害',
    tileCombo: '最高连击',
    tileBricks: '击碎砖块',
    tileTime: '存活时间',
    endlessLevel: '第 {n} 关',
    newRecord: '新纪录',
    rankNote: '历史第 {rank} 名 · 共 {total} 局',
    timelineTip: '{level} {name} · {time} 秒 · 受创 {n}',
    retry: '再来一局',
    saveShot: '保存战绩截图',
    shotSaved: '已保存 ✓',
    shotFailed: '生成失败',
    viewHistory: '查看战绩',
    cloudBoard: '云端榜单',
    backToMenu: '返回主菜单',
  },
  history: {
    title: '战绩排行',
    summary: '本地共 {runs} 局 · 通关 {wins} 次 · 累计击碎 {bricks} 块砖',
    tabCampaign: '闯关',
    tabEndless: '无尽',
    emptyCampaign: '还没有闯关记录。第一局，从主菜单开始。',
    emptyEndless: '还没有无尽模式记录。',
    whereWon: '通关 {code} {name}',
    whereLost: '止步 {code} {name}',
    whereEndless: '第 {level} 关',
    chipLatest: '最新',
    metaRow: '{where} · 连击 {combo} · 伤害 {damage} · {time} · {date}',
  },
  cloud: {
    title: '云端排行榜',
    sub: '成绩自动上传。总榜混合所有难度，难度与模式各有独立榜单（需在服务后台创建后自动出现）。',
    nicknameLabel: '昵称',
    nicknamePlaceholder: '3–16 位英文字母、数字或下划线',
    saveName: '保存昵称',
    noteRule: '云榜昵称需 {min}–{max} 位英文字母、数字或下划线。',
    noteOk: '可以使用「{name}」。',
    toyEyebrow: 'CLOUD · BILIBILI TOY',
    toySub:
      '成绩自动上传到B站排行榜：总榜 / 本周 / 今日，另有无尽、战役与深渊榜。 「全球榜」是 CheddaBoards 全球榜的只读镜像。',
    toyNote: '云榜显示你的B站昵称（支持中文），无需另外设置。',
    toyNoteNamed: '云榜显示你的B站昵称：{name}',
    noNickname:
      '还没有设置昵称。不设置的话，云榜会显示服务器自动分配的 Player_ 编号。只能使用 {min}–{max} 位英文字母、数字或下划线。',
    pendingNickname: '「{name}」会在下一局成绩上传后出现在云榜上。',
    currentNickname: '当前昵称：{name}',
    saving: '正在保存…',
    loading: '读取中…',
    offline: '连不上云榜。成绩和昵称都还在本机，网络恢复后打开这里再试。',
    emptyBoard: '这个榜还没有成绩。打一局，你就是第一条。',
    you: '你',
    streak: '最高连击 {n}',
    totalEntries: '共 {n} 条',
    myRank: '你排第 {rank}',
    myRankOf: '你排第 {rank} / {total}',
  },
  codex: {
    title: '强化图鉴',
    tabUpgrades: '强化',
    tabReactions: '元素反应',
    tabRules: '玩法',
    progressUpgrades: '已遇到 {n} / {total} 种强化。同体系的强化更容易一起出现。',
    progressReactions: '同时拥有两种元素时自动解锁。反应按固定节奏触发，不会每一下都炸。',
    progressRules: '三十秒上手，一辈子变强。',
    maxLevel: '最高 Lv {n}',
    unique: '唯一',
    undiscovered: '未遇到',
    requires: '需要 {list}',
    maxedDesc: '满级：{desc}',
    nextLevel: '下一级：{desc}',
    notOwned: '尚未获得',
    ruleTarget: '目标',
    ruleTargetBody:
      '清空每一关的砖块。砖墙会不断下沉，<b>沉过红色警戒线</b>的砖块会击碎一点护盾；护盾归零，本局结束。',
    ruleCatch: '接球与瞄准',
    ruleCatchBody:
      '球落到底部<b>不会丢失</b>，稍后从挡板重新发射。用挡板的不同位置接球可以控制回弹角度：边缘打出大角度，中心垂直弹回。正中接球是<b>完美接球</b>，大量充能。',
    ruleBullets: '弹幕',
    ruleBulletsBody:
      '炮台与 BOSS 会发射弹幕。<b>用挡板拦截</b>即可，漏到底部才会损失护盾。球和激光也能摧毁弹幕。',
    ruleOverdrive: '超载',
    ruleOverdriveBody: '击中与接球会为挡板充能。充满后按 <b>空格</b> 或点击，获得数秒的伤害与速度爆发。',
    ruleBuild: '构筑',
    ruleBuildBody:
      '每通过一关三选一，共 39 种强化、5 个稀有度。同体系的强化更容易一起出现；传说与神话以对应体系的强化为前提。集齐两种元素会自动解锁<b>元素反应</b>。',
    ruleCrystals: '碎晶',
    ruleCrystalsBody: '击碎砖块掉落碎晶，可用于<b>刷新</b>三选一，或<b>跳过</b>换取更多碎晶。',
  },
  settings: {
    title: '设置',
    language: '语言',
    music: '音乐音量',
    sfx: '音效音量',
    shake: '屏幕震动',
    flashes: '闪烁效果',
    quality: '画质',
    qualityLow: '低 · 流畅优先',
    qualityMedium: '中',
    qualityHigh: '高 · 全特效',
    seed: '固定种子',
    seedPlaceholder: '留空则每局随机',
    perfHead: '性能诊断',
    perfButton: '检测渲染耗时',
    perfCollecting: '正在采集…',
    perfLine: '平均 {fps} fps · 低帧 {low} fps · 卡顿 {jank}%',
    perfAdjusted:
      '实际生效：{tier}。本机帧率不足时游戏会自动降档并记住；手动选择画质后，会按你的选择重新尝试。',
    perfGaveUp: '检测到帧率偏低，但降低画质并不能改善——多半是系统省电模式限制了帧率，与画质无关。',
    perfFail: '未能测得渲染耗时。',
    gpuLine: 'GPU 每帧约 {ms} ms — {parts}（每个通道含约 0.1ms 测量开销）',
    gpuComposite: '合成',
    gpuBackdrop: '背景',
    gpuLights: '光效',
    gpuSurfaces: '砖与球',
    gpuBloom: '泛光',
    gpuNebula: '星云',
    gpuText: '数字',
    done: '完成',
  },
  callouts: {
    perfectSub: '完美接球',
    bossDownSub: '首领击破',
    enragedSub: 'BOSS 狂暴',
    phaseSub: '阶段 {n}',
    overdriveSub: '超载',
    timeStopSub: '时停',
    sectorClearSub: '关卡清除',
    reactionToast: '元素反应 · {name}',
    reactionDetail: '{recipe}：{desc}',
    difficultyToast: '{name}难度 · {en}',
    firstToastTitle: '移动鼠标控制挡板',
    firstToastBody: '球落到底部不会丢失。用挡板边缘接球可以打出大角度，正中接球大量充能。',
    bannerMutator: '变异 · {name} — {desc}',
    qualityAdjustedTitle: '画质已自动调整',
    qualityAdjustedBody: '本机帧率不足，现为「{tier}」，已为这台设备记住。可在设置里手动改回',
    qualityGaveUpTitle: '已恢复你选择的画质',
    qualityGaveUpBody: '降低画质并没有提高帧率，卡顿另有原因（常见于系统省电模式限制帧率）',
  },
  governor: {
    qualityHigh: '高',
    qualityMedium: '中',
    qualityLow: '低',
    scaled: '{name}（{pct}% 渲染分辨率）',
  },
  tutorial: {
    sub: '一分钟了解碎界的规则、护盾、强化与变异。',
    skip: '跳过',
    prev: '上一步',
    next: '下一步',
    start: '开始游戏',
    dotsLabel: '说明页',
    pageAria: '第 {n} 页',
    pages: [
      // The annotation keeps `mutators` readable on every page despite only one page carrying it.
      ...([
        {
          eyebrow: 'TUTORIAL · 01',
          title: '欢迎来到碎界',
          html: `
      <p>《碎界》是一款<b>越打越离谱的肉鸽打砖块</b>：击碎每一关的砖块，一路把挡板和球养成你的离谱流派。</p>
      <p>闯关模式共 15 个扇区、3 个 BOSS；无尽模式没有终点，越往深走越难。</p>
      <p>下面几页一分钟就能翻完。赶时间也可以随时点<b>跳过</b>——之后随时能在主菜单的「新手说明」里回来看。</p>`,
        },
        {
          eyebrow: 'TUTORIAL · 02',
          title: '挡板与球',
          art: 'paddle',
          html: `
      <p>移动<b>鼠标或手指</b>控制挡板。球落到底部<b>不会丢失</b>，稍后会从挡板重新发射。</p>
      <p>用挡板的不同位置接球控制回弹角度：<b>边缘</b>打出大角度，<b>中心</b>垂直弹回。正中接球是<b>完美接球</b>，充能最多。</p>
      <p><b>超载</b>：击中砖块和接球都会为挡板充能。充满后按 <kbd>空格</kbd> 或点击屏幕下方的提示按钮，获得 {overdrive} 秒的伤害与速度爆发。</p>
      <p>电脑端随时可按 <kbd>P</kbd> 或 <kbd>Esc</kbd> 暂停。</p>`,
        },
        {
          eyebrow: 'TUTORIAL · 03',
          title: '护盾与受损',
          art: 'danger',
          html: `
      <p>画面左上角那排发光小格就是你的<b>护盾</b>（生命值）：开局 {maxHp} 格，部分强化能提高上限。</p>
      <p>护盾只从两个地方掉：</p>
      <ul>
        <li><b>警戒线</b>——砖墙一直在下沉，沉过底部红色警戒线的砖块被击碎，护盾 −1。</li>
        <li><b>弹幕</b>——炮台与 BOSS 会朝挡板发射弹幕。用挡板拦截即可，漏到底部护盾 −1。</li>
      </ul>
      <p>每次受损后有约 1 秒的缓冲，不会连续受损；但连击会清零，超载能量也会损失一部分。</p>
      <p>回复途径：击败 BOSS 护盾 +1；关卡内偶尔掉落红心，接住即回复 1 格。<b>护盾归零，本局结束。</b></p>`,
        },
        {
          eyebrow: 'TUTORIAL · 04',
          title: '三选一强化',
          html: `
      <p>每通过一关进行<b>三选一</b>，所选强化只在本局内生效，一层层叠成流派。目前共有 39 种强化、5 个稀有度：普通 → 稀有 → 史诗 → 传说 → 神话。</p>
      <p>强化分体系——球体 / 挡板 / 伤害 / 烈焰 / 极寒 / 雷霆 / 腐蚀 / 虚空 / 爆炸 / 激光 / 时空 / 贪婪 / 生存 / 超载。<b>同体系的强化更容易一起出现</b>。</p>
      <p><b>元素反应</b>：同时拥有两种元素强化（冰、火、雷、毒）会自动解锁组合效果，例如「冰 + 火」的融化。</p>
      <p><b>碎晶</b>：击碎砖块掉落碎晶 ◆，可以在三选一里「刷新」选项，也可以「跳过」换取碎晶攒着用。</p>`,
        },
        {
          eyebrow: 'TUTORIAL · 05',
          title: '关卡变异与阻碍',
          art: 'threats',
          mutators: true,
          html: `
      <p>部分关卡开场会预告一条<b>变异</b>：整关的规则被改写，有的添乱，有的反而给甜头。</p>
      <p>更高的难度还会出现会<b>吞球的湮灭砖</b>；「深渊」难度每 16 秒还会抹掉一个多余的球。BOSS 战拖得越久越危险——超时进入<b>狂暴</b>后，弹幕更密更难拦。</p>`,
        },
        {
          eyebrow: 'TUTORIAL · 06',
          title: '准备就绪',
          html: `
      <p>前几关节奏轻松，先把接球手感找回来。构筑成型之后，画面会越来越热闹。</p>
      <p>想查强化细节和元素反应：主菜单 →<b>强化图鉴</b>，「玩法」标签里有同样的规则速览。</p>
      <p>设置里可以调整音量、画质与屏幕震动；本机帧率不足时，游戏会自动降档保流畅。</p>
      <p>准备好了？点右下角，开一局。</p>`,
        },
      ] as TutorialPage[]),
    ],
  },
  scorecard: {
    report: 'RUN REPORT · 战绩报告',
    finalScore: '最终得分 · FINAL SCORE',
    newRecord: '新纪录 NEW RECORD',
    rank: '历史第 {rank} 名 · RANK #{rank}',
    localCount: '本地 {n} 局',
    clearedAll: '通关全部扇区',
    stoppedAt: '止步 {code} {name}',
    modeCampaign: 'CAMPAIGN · 闯关模式',
    modeEndless: 'ENDLESS · 无尽模式',
    modeCampaignShort: '闯关模式',
    modeEndlessShort: '无尽模式',
    tileLevel: '抵达关卡',
    tileDamage: '总伤害',
    tileCombo: '最高连击',
    tileBricks: '击碎砖块',
    tileTime: '存活时间',
    tileRank: '历史排名',
    endlessLevel: '第 {n} 关',
    rankOf: '第 {rank} / {total} 局',
    firstRun: '首次出击',
    build: 'FINAL BUILD · 最终构筑',
    noBuild: '白板开局 · 没有携带任何强化',
    tagline: '越打越离谱 · ROGUELITE BREAKOUT',
  },
  net: {
    boardAllTime: '总榜',
    boardWeekly: '本周',
    boardDaily: '今日',
    boardEndless: '无尽榜',
    boardCampaign: '战役榜',
    boardAbyss: '深渊榜',
    boardGlobal: '全球榜',
    renamePending: '已保存「{name}」，会在第一次提交成绩后出现在云榜上。',
    renameApplied: '昵称已更新为「{name}」。',
    renameRejected: '昵称被拒绝：{error}',
    renameRateLimited: '操作太频繁，请稍后再试。',
    renameOffline: '连不上云榜，昵称只保存在本机。',
    renameFailed: '昵称未能保存：{error}',
    scoreZero: '本局没有得分，未上传。',
    uploadedRank: '已上传云榜 · 全球第 {rank} / {total}',
    uploaded: '已上传云榜',
    scoreRejected: '成绩未通过校验，已保存在本地。',
    scoreRateLimited: '提交太频繁，本局成绩下次再传。',
    scoreOffline: '连不上云榜，成绩已保存在本地。',
    scoreFailed: '成绩未上传，已保存在本地。',
    toyNotLoggedIn: '还未登录B站，成绩已保存在本地。',
    toyFailed: '成绩未上传到B站，已保存在本地。',
    nickEmpty: '昵称不能为空',
    nickLength: '昵称需为 {min}–{max} 个字符',
    nickCharset: '昵称只能使用英文字母、数字和下划线（云榜不支持中文、空格与表情）',
    nickBlocked: '这个昵称不可用，请换一个',
    nickReserved: '这个昵称被系统保留，请换一个',
    toyApiFailed: 'B站接口调用失败',
  },
};

/** The UI-dictionary shape every locale must implement (game content rides separately). */
export type UiDict = typeof zh;
