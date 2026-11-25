import { b, pct } from '../game/upgrades/format';
import type { ContentOverrides } from './content-types';
import type { UiDict } from './zh';

/**
 * 日本語ロケール。UI 文言は `zh.ts` と同じ鍵構造を持ち、`content` 部は `game/` 側に中国語の
 * 正本があるゲーム内文字列（アップグレード名・フレーバー・説明、ステージ名、BOSS、変異、
 * 元素反応など）の日本語上書きテーブル。
 */
export const ja: UiDict & { content: ContentOverrides } = {
  common: {
    back: '戻る',
  },
  meta: {
    title: '碎界 SHATTERVERSE',
    description: '碎界 SHATTERVERSE — 突飛なビルドと極上の爽快感を追い求めるローグライト ブロック壊し。',
    htmlLang: 'ja',
  },
  boot: {
    canvasLabel: 'ゲーム画面',
    noscript: '『碎界』の実行には JavaScript が必要です。',
    fatalTitle: '碎界',
    fatalCannotStart: '起動できません',
    fatalErrored: '起動時にエラーが発生しました',
    fatalNoWebgl:
      'このブラウザまたはデバイスは WebGL2 に対応していません。最新の Chrome・Edge・Firefox を使い、ハードウェアアクセラレーションが有効かご確認ください。',
    fatalGeneric:
      'ページを再読み込みしてお試しください。解決しない場合は、下の情報を開発者へお知らせください。',
  },
  menu: {
    tagline: 'プレイするほど突飛になるローグライト ブロック壊し',
    campaign: 'キャンペーン',
    endless: 'エンドレス',
    tutorial: '遊び方',
    codex: 'アップグレード図鑑',
    history: '戦績ランキング',
    cloud: 'クラウドランキング',
    settings: '設定',
    help: 'マウスでパドル操作 · <kbd>Space</kbd>/クリックでオーバードライブ · <kbd>P</kbd> で一時停止',
    recordsEmpty: 'まだ記録がありません。最初の1局をここから。',
    recordCampaignDepth: 'キャンペーン最深 {n}',
    recordBossNote: '（BOSS撃破 ×{n}）',
    recordEndlessDepth: 'エンドレス最深 第{n}層',
    recordBestScore: '最高スコア {n}',
    recordWins: '{n}回コンプリート',
    recordRuns: '{n}局プレイ',
  },
  hud: {
    shield: 'シールド',
    build: 'ビルド',
    buildEmpty: '1ステージクリアで3択。',
    keySpace: 'Space',
    odReady: 'オーバードライブ可能 · クリック',
    phase: 'PHASE {n}',
    enraged: '激怒 ENRAGED',
    statDamage: '総ダメージ',
    statBalls: 'ボール',
    statComboBonus: 'コンボ補正',
    statCrit: 'クリティカル率',
    buffs: 'パワーアップ',
  },
  starter: {
    title: '初期プロトコルを選択',
    sub: 'プロトコルはビルドの起点。その後の3択はすべて、あなたが決めます。',
    campaignEyebrow: 'CAMPAIGN · 15 SECTORS · 3 BOSSES',
    endlessEyebrow: 'ENDLESS · 終わりのない階層',
    crystals: '+{n} クリスタル',
  },
  draft: {
    title: 'アップグレードを1つ選択',
    eyebrow: 'SECTOR {code} CLEAR',
    reroll: 'リロール',
    skip: 'スキップ',
    newUpgrade: 'NEW',
    maxed: 'MAX',
  },
  pause: {
    title: '一時停止',
    resume: '再開',
    settings: '設定',
    abandon: 'この局を諦める',
  },
  over: {
    titleWon: '深淵は砕かれた',
    titleLost: 'シールド撃破',
    subWon: '3体のBOSS、15のセクター、突飛の極みのビルド。',
    diffSuffix: '{name} · ',
    campaignMode: 'キャンペーン',
    endlessMode: 'エンドレス',
    stopAt: '{code}{name}で終了',
    tileScore: '最終スコア',
    tileLevel: '到達セクター',
    tileDamage: '総ダメージ',
    tileCombo: '最大コンボ',
    tileBricks: '破壊ブロック',
    tileTime: '生存時間',
    endlessLevel: '第{n}層',
    newRecord: '新記録',
    rankNote: '歴代第{rank}位 · 全{total}局',
    timelineTip: '{level} {name} · {time}秒 · 被弾 {n}',
    retry: 'もう一局',
    saveShot: '戦績カードを保存',
    shotSaved: '保存しました ✓',
    shotFailed: '生成に失敗',
    viewHistory: '戦績を見る',
    cloudBoard: 'クラウドランキング',
    backToMenu: 'メインメニュー',
  },
  history: {
    title: '戦績ランキング',
    summary: 'ローカル{runs}局 · コンプリート{wins}回 · 累計{bricks}個のブロックを破壊',
    tabCampaign: 'キャンペーン',
    tabEndless: 'エンドレス',
    emptyCampaign: 'まだキャンペーンの記録がありません。最初の1局はメインメニューから。',
    emptyEndless: 'まだエンドレスの記録がありません。',
    whereWon: '{code} {name} を制覇',
    whereLost: '{code} {name} で終了',
    whereEndless: '第{level}層',
    chipLatest: '新着',
    metaRow: '{where} · コンボ {combo} · ダメージ {damage} · {time} · {date}',
  },
  cloud: {
    title: 'クラウドランキング',
    sub: 'スコアは自動アップロード。総合榜は全難易度混合。難易度別・モード別のボードはサービス側で作成後に自動表示されます。',
    nicknameLabel: 'ニックネーム',
    nicknamePlaceholder: '3〜16文字の半角英数字・アンダースコア',
    saveName: '名前を保存',
    noteRule: 'クラウドのニックネームは{min}〜{max}文字の半角英数字・アンダースコアです。',
    noteOk: '「{name}」は使用できます。',
    toyEyebrow: 'CLOUD · BILIBILI TOY',
    toySub:
      'スコアはビリビリ Toy のランキングへ自動アップロード：総合 / 週間 / 今日のほか、エンドレス・キャンペーン・アビスのボードあり。「グローバル」は CheddaBoards 世界ランキングの閲覧専用ミラーです。',
    toyNote: 'クラウドの表示名はビリビリのニックネームです。設定は不要です。',
    toyNoteNamed: 'クラウドの表示名：ビリビリのニックネーム「{name}」',
    noNickname:
      'ニックネームが未設定です。設定しない場合はサーバーが割り当てた Player_ 番号が表示されます。{min}〜{max}文字の半角英数字・アンダースコアのみ。',
    pendingNickname: '「{name}」は次回スコアのアップロード後にクラウドに表示されます。',
    currentNickname: '現在のニックネーム：{name}',
    saving: '保存中…',
    loading: '読み込み中…',
    offline:
      'クラウドに接続できません。スコアとニックネームはこの端末に保存済みです。回復したらここから再試行してください。',
    emptyBoard: 'このボードにはまだスコアがありません。最初の1局があなたのものに。',
    you: 'あなた',
    streak: '最大コンボ {n}',
    totalEntries: '全{n}件',
    myRank: 'あなたの順位 #{rank}',
    myRankOf: 'あなたの順位 #{rank} / {total}',
  },
  codex: {
    title: 'アップグレード図鑑',
    tabUpgrades: 'アップグレード',
    tabReactions: '元素反応',
    tabBuffs: 'パワーアップ',
    tabRules: '遊び方',
    progressUpgrades: '{total}種類のうち{n}種類に遭遇済み。同じ系統のアップグレードは一緒に出やすい。',
    progressReactions: '2種類の元素を同時に持つと自動解除。反応は固定のリズムで発動し、毎回ではありません。',
    progressBuffs:
      'ブロックを壊すと、ときどきカプセルが落ちます。取ると数秒間だけ効果があり、そのステージ限りです。',
    buffTimed: '{n}秒',
    buffInstant: '即時',
    progressRules: '30秒で習得、一生かけて強くなる。',
    maxLevel: '最大 Lv{n}',
    unique: '唯一',
    undiscovered: '未遭遇',
    requires: '必要：{list}',
    maxedDesc: '最大：{desc}',
    nextLevel: '次のレベル：{desc}',
    notOwned: '未所持',
    ruleTarget: '目標',
    ruleTargetBody:
      '各ステージのブロックをすべて壊す。ブロックの壁は沈み続け、<b>赤い警戒ライン</b>を超えたブロックは砕けてシールドを1つ失う。シールドが尽きるとその局は終わり。',
    ruleCatch: 'キャッチと狙い',
    ruleCatchBody:
      '底に落ちたボールは<b>失われません</b>。少ししてパドルから再発射されます。パドルのどこで受けるかで反発角が変わります：端で大きく、中央で真上。ど真ん中の<b>パーフェクトキャッチ</b>はチャージ量が最大。',
    ruleBullets: '弾幕',
    ruleBulletsBody:
      'タレットとBOSSはパドルへ弾幕を撃ちます。<b>パドルで迎撃</b>すればよく、底部に漏らした分だけシールドを失います。ボールとレーザーでも弾幕を破壊できます。',
    ruleOverdrive: 'オーバードライブ',
    ruleOverdriveBody:
      'ヒットとキャッチがパドルをチャージ。満充電で <kbd>Space</kbd> かクリックで、数秒間のダメージと速度の爆発。',
    ruleBuild: 'ビルド',
    ruleBuildBody:
      '1ステージクリアごとに3択。全{n}種・レアリティ5段階。同系統は一緒に出やすく、レジェンドとミシックは対応系統の布石が前提。2元素を集めると<b>元素反応</b>が自動解除。',
    ruleBuffs: 'パワーアップ',
    ruleBuffsBody:
      'ブロックを壊すと、ときどき<b>カプセル</b>が落ちます——ボール分裂、ボール巨大化、パドル延長、時停など。取ると数秒間効果が続き、残り時間が画面に表示されます。効果はそのステージ限り。「共鳴」系統のアップグレードで、出現間隔が短くなり、効果時間も延びます。',
    ruleCrystals: 'クリスタル',
    ruleCrystalsBody:
      'ブロックを壊すとクリスタル◆が落ちます。3択の<b>リロール</b>に使うか、<b>スキップ</b>して貯めることも。',
  },
  settings: {
    title: '設定',
    language: '言語',
    music: '音楽の音量',
    sfx: '効果音の音量',
    shake: '画面振動',
    flashes: 'フラッシュ演出',
    quality: '画質',
    qualityLow: '低 · 快適優先',
    qualityMedium: '中',
    qualityHigh: '高 · フルエフェクト',
    seed: 'シード固定',
    seedPlaceholder: '空欄なら毎局ランダム',
    perfHead: 'パフォーマンス診断',
    perfButton: '描画時間を計測',
    perfCollecting: '計測中…',
    perfLine: '平均 {fps} fps · 最遅5% {low} fps · 遅延フレーム {jank}%',
    perfAdjusted:
      '実際の設定：{tier}。フレームレートが足りないときゲームは自動で段階を下げて記憶します。手動で選ぶと、その選択を優先します。',
    perfGaveUp:
      'フレームレートは低めですが、画質を下げても改善しません——多くはシステムの省電力モードによるフレームレート制限で、画質とは無関係です。',
    perfFail: '描画時間を測定できませんでした。',
    gpuLine: 'GPU 約{ms} ms/フレーム — {parts}（各パスに約0.1msの計測オーバーヘッドを含む）',
    gpuComposite: '合成',
    gpuBackdrop: '背景',
    gpuLights: '光效',
    gpuSurfaces: 'ブロックとボール',
    gpuBloom: 'ブルーム',
    gpuNebula: '星雲',
    gpuText: '数字',
    done: '完了',
  },
  callouts: {
    perfectSub: 'パーフェクトキャッチ',
    bossDownSub: 'BOSS撃破',
    enragedSub: 'BOSS激怒',
    phaseSub: '第{n}段階',
    overdriveSub: 'オーバードライブ',
    timeStopSub: '時停',
    sectorClearSub: 'セクター制覇',
    buffSub: '{name} · {n}秒',
    buffTwinSub: '{name} · 双共鳴 {n}秒',
    dodgeSub: 'シールド無傷',
    reactionToast: '元素反応 · {name}',
    reactionDetail: '{recipe}：{desc}',
    difficultyToast: '{en} · {name}',
    firstToastTitle: 'マウスでパドルを操作',
    firstToastBody:
      '底に落ちたボールは失われません。端で受ければ大きく跳び、ど真ん中のキャッチはチャージ最大。',
    bannerMutator: '変異 · {name} — {desc}',
    qualityAdjustedTitle: '画質を自動調整しました',
    qualityAdjustedBody:
      'フレームレートが足りないため「{tier}」に切り替え、この端末用に記憶しました。設定からいつでも変更できます',
    qualityGaveUpTitle: '選択した画質に戻しました',
    qualityGaveUpBody:
      '画質を下げてもフレームレートは改善しませんでした。遅延の原因は別にあります（多くは省電力モードのフレームレート制限）',
  },
  governor: {
    qualityHigh: '高',
    qualityMedium: '中',
    qualityLow: '低',
    scaled: '{name}（描画解像度 {pct}%）',
  },
  tutorial: {
    sub: 'ルール・シールド・アップグレード・変異を1分で。',
    skip: 'スキップ',
    prev: '戻る',
    next: '次へ',
    start: 'ゲーム開始',
    dotsLabel: '説明ページ',
    pageAria: '{n}ページ',
    pages: [
      {
        eyebrow: 'TUTORIAL · 01',
        title: '碎界へようこそ',
        html: `
      <p>『碎界』は<b>プレイするほど突飛になるローグライト ブロック壊し</b>。各ステージのブロックを砕き、パドルとボールをあなた流の突飛ビルドへ育て上げます。</p>
      <p>キャンペーンは15セクター・3体のBOSS。エンドレスに終わりはなく、深く進むほど過酷になります。</p>
      <p>この先のページは1分で読めます。急ぎならいつでも<b>スキップ</b>を——メインメニューの「遊び方」からいつでも戻ってこれます。</p>`,
      },
      {
        eyebrow: 'TUTORIAL · 02',
        title: 'パドルとボール',
        art: 'paddle',
        html: `
      <p><b>マウスか指</b>でパドルを操作。底に落ちたボールは<b>失われません</b>。少ししてパドルから再発射されます。</p>
      <p>受ける位置で反発角が変わります：<b>端</b>なら大きく、<b>中央</b>なら真上。ど真ん中は<b>パーフェクトキャッチ</b>で、チャージ量も最大です。</p>
      <p><b>オーバードライブ</b>：ヒットとキャッチがパドルをチャージ。満充電で <kbd>Space</kbd> か画面下のボタンを押すと、{overdrive}秒間のダメージと速度の爆発。</p>
      <p>PCでは <kbd>P</kbd> か <kbd>Esc</kbd> でいつでも一時停止。</p>`,
      },
      {
        eyebrow: 'TUTORIAL · 03',
        title: 'シールドと被弾',
        art: 'danger',
        html: `
      <p>画面左上の光るマスがあなたの<b>シールド</b>（ライフ）です。初期値は{maxHp}で、一部のアップグレードで上限を上げられます。</p>
      <p>シールドが減るのは次の2つだけ：</p>
      <ul>
        <li><b>警戒ライン</b>——ブロックの壁は沈み続け、底部の赤い警戒ラインを超えたブロックは砕けてシールド −1。</li>
        <li><b>弾幕</b>——タレットとBOSSはパドルへ弾幕を撃ちます。パドルで迎撃すればよく、底部に漏れると −1。</li>
      </ul>
      <p>被弾の直後は約1秒の無敵時間があり連続で受けることはありません。ただしコンボはリセットされ、オーバードライブのチャージも一部失われます。</p>
      <p>回復：BOSS撃破で +1。ステージ内ではたまにハートが落ちるので、受け取ると +1。<b>シールドが尽きると、その局は終わり。</b></p>`,
      },
      {
        eyebrow: 'TUTORIAL · 04',
        title: '3択アップグレード',
        html: `
      <p>1ステージクリアごとに<b>3択</b>。選んだアップグレードはこの局だけで有効で、積み重ねてビルドになります。全{upgrades}種・レアリティ5段階：コモン → レア → エピック → レジェンド → ミシック。</p>
      <p>アップグレードには系統があります——ボール / パドル / ダメージ / 炎 / 氷 / 雷 / 腐食 / 虚空 / 爆発 / レーザー / 時空 / 強欲 / 生存 / オーバードライブ / 共鳴。<b>同系統は一緒に出やすい</b>。</p>
      <p><b>元素反応</b>：2種類の元素（氷・炎・雷・毒）を同時に持つと組み合わせ効果が自動解除。たとえば「氷＋炎」の融解。</p>
      <p><b>パワーアップ</b>：ステージ中、ブロックを壊すとときどき<b>カプセル</b>が落ちます——ボール分裂、ボール巨大化、パドル延長、時停など。取ると数秒間効果があり、そのステージ限りです。「共鳴」系統のアップグレードはこれらと連動します。</p>
      <p><b>クリスタル</b>：ブロックを壊すとクリスタル◆が落ちます。3択の「リロール」に使うか、「スキップ」して貯めておくことも。</p>`,
      },
      {
        eyebrow: 'TUTORIAL · 05',
        title: 'ステージ変異と障害',
        art: 'threats',
        mutators: true,
        html: `
      <p>ステージによっては開幕に<b>変異</b>が告知されます：ステージ全体のルールが書き換わるもので、邪魔をするものもあれば、得になるものも。</p>
      <p>高難易度ではボールを<b>飲み込む消滅ブロック</b>も登場。「アビス」では16秒ごとに余分なボールが1つ消えます。BOSS戦は長引くほど危険——時間超過で<b>激怒</b>し、弾幕が濃くなります。</p>`,
      },
      {
        eyebrow: 'TUTORIAL · 06',
        title: '準備完了',
        html: `
      <p>最初の数ステージはゆるやか。まずキャッチの手感を掴みましょう。ビルドが形になると、画面はどんどん賑やかになります。</p>
      <p>アップグレードの詳細と元素反応はメインメニュー →<b>アップグレード図鑑</b>。「遊び方」タブに同じルールのまとめがあります。</p>
      <p>設定では音量・画質・画面振動を調整できます。フレームレートが足りない端末では、ゲームが自動で段階を下げて快適さを保ちます。</p>
      <p>準備はいいですか？右下から、1局どうぞ。</p>`,
      },
    ],
  },
  scorecard: {
    report: 'RUN REPORT · 戦績カード',
    finalScore: 'FINAL SCORE · 最終スコア',
    newRecord: '新記録 NEW RECORD',
    rank: '歴代第{rank}位 · RANK #{rank}',
    localCount: 'ローカル{n}局',
    clearedAll: '全セクター制覇',
    stoppedAt: '{code} {name} で終了',
    modeCampaign: 'CAMPAIGN · キャンペーン',
    modeEndless: 'ENDLESS · エンドレス',
    modeCampaignShort: 'キャンペーン',
    modeEndlessShort: 'エンドレス',
    tileLevel: '到達セクター',
    tileDamage: '総ダメージ',
    tileCombo: '最大コンボ',
    tileBricks: '破壊ブロック',
    tileTime: '生存時間',
    tileRank: 'ローカル順位',
    endlessLevel: '第{n}層',
    rankOf: '第{rank} / {total}局',
    firstRun: '初挑戦',
    build: 'FINAL BUILD · 最終ビルド',
    noBuild: '白紙のまま出発 · 持ち越しアップグレードなし',
    tagline: 'ローグライト ブロック壊し · ROGUELITE BREAKOUT',
  },
  net: {
    boardAllTime: '総合',
    boardWeekly: '週間',
    boardDaily: '今日',
    boardEndless: 'エンドレス',
    boardCampaign: 'キャンペーン',
    boardAbyss: 'アビス',
    boardGlobal: 'グローバル',
    renamePending: '「{name}」を保存しました。初回スコアのアップロード後にクラウドに表示されます。',
    renameApplied: 'ニックネームを「{name}」に更新しました。',
    renameRejected: 'ニックネームが拒否されました：{error}',
    renameRateLimited: '操作が集中しています。しばらくしてからもう一度。',
    renameOffline: 'クラウドに接続できず、ニックネームはこの端末にのみ保存されました。',
    renameFailed: 'ニックネームを保存できませんでした：{error}',
    scoreZero: 'この局はスコアがなく、アップロードしません。',
    uploadedRank: 'アップロード済み · 世界第{rank}位 / {total}',
    uploaded: 'クラウドにアップロードしました',
    scoreRejected: 'スコアが検証を通過せず、ローカルに保存しました。',
    scoreRateLimited: '送信が集中しています。この局のスコアは次回アップロードされます。',
    scoreOffline: 'クラウドに接続できず、スコアはローカルに保存しました。',
    scoreFailed: 'スコアはアップロードされず、ローカルに保存しました。',
    toyNotLoggedIn: 'ビリビリに未ログインのため、スコアはローカルに保存しました。',
    toyFailed: 'スコアはビリビリにアップロードされず、ローカルに保存しました。',
    nickEmpty: 'ニックネームを入力してください',
    nickLength: 'ニックネームは{min}〜{max}文字です',
    nickCharset:
      'ニックネームは半角英数字・アンダースコアのみ（クラウドでは中国語・空白・絵文字は使えません）',
    nickBlocked: 'このニックネームは使用できません。別の名前にしてください',
    nickReserved: 'このニックネームは予約されています。別の名前にしてください',
    toyApiFailed: 'ビリビリ API の呼び出しに失敗しました',
  },
  content: {
    upgrades: {
      multiball: {
        name: 'マルチボール',
        flavor: '1つで足りなければ、もう1つ。',
        describe: (lv) => `ボール数 ${b('+' + lv)}。`,
      },
      power: {
        name: 'ハイパワーコア',
        flavor: '発電所まるごと、ボール1個に。',
        describe: (lv) => `基本ダメージ ${b('+' + pct(0.3 * lv))}。`,
      },
      wide: {
        name: 'ワイドフィールド',
        flavor: '面積こそ正義。',
        describe: (lv) => `パドル幅 ${b('+' + pct(0.22 * lv))}。`,
      },
      bigball: {
        name: '巨大ボール',
        flavor: '物理学からの謝罪文。',
        describe: (lv) => `ボール半径 ${b('+' + pct(0.28 * lv))}、基本ダメージ ${b('+' + pct(0.15 * lv))}。`,
      },
      speed: {
        name: '超音速',
        flavor: 'ソニックブームだけがブレーキ音。',
        describe: (lv) => `ボール速度 ${b('+' + pct(0.14 * lv))}、基本ダメージ ${b('+' + pct(0.12 * lv))}。`,
      },
      lucky: {
        name: '幸運の星',
        flavor: '宇宙も時々、あなたの味方をする。',
        describe: (lv) =>
          `幸運 ${b('+' + lv)}（高レアの出現率）、クリスタル獲得 ${b('+' + pct(0.25 * lv))}。`,
      },
      growth: {
        name: '成長プロトコル',
        flavor: '複利は世界第八不思議。',
        describe: (lv) => `ステージクリアごとに基本ダメージ ${b('+' + pct(0.15 * lv))}（永続で積み上がる）。`,
      },
      shield: {
        name: '位相シールド',
        flavor: '命が1つ増え、突飛の可能性も1つ増える。',
        describe: (lv) => `シールド上限 ${b('+' + lv)}、さらに即時 ${b(lv)} 回復。`,
      },
      crit: {
        name: 'クリティカル・マトリクス',
        flavor: '弱点？ 全部が弱点だ。',
        describe: (lv) =>
          `クリティカル率 ${b('+' + pct(0.12 * lv))}、クリティカルダメージ ${b('+' + pct(0.3 * lv))}。`,
      },
      pierce: {
        name: '位相貫通',
        flavor: '壁？ どの壁？',
        describe: (lv) => `ボールが ${b(pct(0.22 * lv))} の確率で${b('貫通')}し、ブロックで跳ね返らない。`,
      },
      homing: {
        name: 'ガイダンスコア',
        flavor: 'ボールは自分が行くべき場所を知っている。',
        describe: (lv) => `ボールが最寄りのブロックを自動追尾。旋回力 ${b('+' + lv)} ランク。`,
      },
      split: {
        name: '分裂プロトコル',
        flavor: '細胞分裂、指数関数的成長。',
        describe: (lv) =>
          `ブロック破壊時に ${b(pct(0.16 * lv))} の確率で子ボールが分裂（ダメージ45%、4秒生存）。`,
      },
      fire: {
        name: '灼熱付与',
        flavor: 'すべてを燃やせ。',
        describe: (lv) => `ヒットに${b('灼熱')}を付与：毎秒 ${b(pct(0.45 * lv))} の攻撃力ダメージ、3秒間。`,
      },
      frost: {
        name: '極冷付与',
        flavor: '絶対的な冷静。',
        describe: (lv) =>
          `ヒットに ${b(pct(Math.min(1, 0.22 * lv)))} の確率で${b('凍結')} 1.6秒。凍結ブロックは被ダメージ ${b('+30%')}。`,
      },
      shock: {
        name: '雷撃付与',
        flavor: '高圧電流、触るな。',
        describe: (lv) =>
          `ヒットで${b('雷鎖')}を放出、${b(2 * lv)} 体にジャンプし、それぞれ ${b('45%')} のダメージ。`,
      },
      laser: {
        name: 'レーザーアレイ',
        flavor: 'パドルはただのパドルでいたくない。',
        describe: (lv) =>
          `パドルが0.9秒ごとにレーザー ${b(lv)} 本を発射、1本あたり ${b(pct(0.6 * lv))} の攻撃力ダメージ。`,
      },
      magnet: {
        name: '磁力アンカー',
        flavor: 'あなたは取り逃しても、ボールはしない。',
        describe: (lv) =>
          `パドル上部に${b('磁力場')}が出現（範囲 ${b(110 * lv)}）、落ちてくるボールを吸い寄せる。`,
      },
      empower: {
        name: 'チャージリバウンド',
        flavor: '帰り道にちょっと充電。',
        describe: (lv) =>
          `パドルで弾き返されたボールは${b('蓄電')}を得る：ダメージ ${b('+' + pct(0.6 * lv))}、3秒間。`,
      },
      echo: {
        name: 'エコープロトコル',
        flavor: '1発目は挨拶、2発目こそが答えだ。',
        describe: (lv) =>
          `ヒット時に ${b(pct(0.18 * lv))} の確率で${b('残響')}：0.25秒後に60%ダメージを再び与える。`,
      },
      shatter: {
        name: '破片ストーム',
        flavor: '破片はブロック本体より危険。',
        describe: (lv) => `ブロック破壊時に破片 ${b(3 * lv)} 枚が飛散、1枚あたり攻撃力の30%ダメージ。`,
      },
      explosive: {
        name: '爆裂コア',
        flavor: 'すべてのブロックは花火だ。',
        describe: (lv) =>
          `ブロック破壊で${b('爆発')}：範囲 ${b(85 + 18 * (lv - 1))}、${b(pct(0.5 * lv))} の攻撃力ダメージ。`,
      },
      combo: {
        name: 'コンボオーバーロード',
        flavor: '止まるな。',
        describe: (lv) => `コンボ10ごとにダメージ ${b('+' + pct(0.05 * lv))}。${b('上限なし')}。`,
      },
      chainreaction: {
        name: '連鎖反応',
        flavor: '1つのブロックが倒れ、壁まるごとお供する。',
        describe: () =>
          `爆発で砕かれたブロックは${b('再び爆発')}し、ダメージは減衰しない。1回の連鎖で十分だ。`,
      },
      meltdown: {
        name: 'メルトダウンコア',
        flavor: '冷却システム？ 解体済み。',
        describe: () =>
          `爆発範囲 ${b('+60%')}、さらにその場に2秒間の${b('火の海')}を残す（毎秒攻撃力の70%ダメージ）。`,
      },
      void: {
        name: '虚空侵食',
        flavor: 'ここの空間は少し不安定だ。',
        describe: (lv) =>
          `ブロック破壊時に ${b(pct(0.07 * lv))} の確率で${b('ブラックホール')}が出現：ボールの軌道を曲げ、周囲のブロックを挽き、最後に破裂する。`,
      },
      reaper: {
        name: '終焉の宣告',
        flavor: '数値はあくまで提案だ。',
        describe: (lv) =>
          `残りライフが ${b(pct(0.06 * lv))} 未満のブロックを${b('即処理')}（BOSSコアは免疫）。`,
      },
      poison: {
        name: '腐食の毒',
        flavor: 'パーセンテージ。あらゆる防御を無視する。',
        describe: (lv) =>
          `ヒットに${b('腐食')}を付与：毎秒、対象の最大ライフの ${b(pct(0.025 * lv))} 分のダメージ、4秒間。BOSSの天敵。`,
      },
      solar: {
        name: 'プロミネンス',
        flavor: 'ボール1つ1つが小さな太陽だ。',
        describe: (lv) =>
          `ボールの周囲に${b('コロナ')}が出現（範囲80）、毎秒 ${b(pct(0.45 * lv))} の攻撃力ダメージ。`,
      },
      orbital: {
        name: 'オービタルランス',
        flavor: '軌道支援、着位置についた。',
        describe: (lv) =>
          `4秒ごとに ${b(lv)} 本の${b('軌道ビーム')}が縦列を貫通。列内の全ブロックに攻撃力の300%ダメージ。`,
      },
      timestop: {
        name: '時停フィールド',
        flavor: '世界よ、止まれ。',
        describe: (lv) =>
          `20秒ごとに自動で ${b((2.5 + 0.5 * lv).toFixed(1))} 秒の${b('時停')}：敵はすべて静止し、ボールのダメージは ${b('×2')}。`,
      },
      mirror: {
        name: 'ミラーバース',
        flavor: '鏡の中でも誰かがブロック壊しをしている。',
        describe: (lv) =>
          `各ボールに${b('鏡像のゴーストボール')}が付き、${b(pct(0.4 * lv))} のダメージを与える。`,
      },
      singularity: {
        name: 'シンギュラリティ',
        flavor: '奴はえり好みしない。',
        describe: () => `${b('シンギュラリティ')}が1つフィールドを徘徊し、通過するブロックを挽き続ける。`,
      },
      phantom: {
        name: 'ファントムランス',
        flavor: '道を塞ぐものは、すべて装飾だ。',
        describe: () =>
          `貫通確率が ${b('100%')} に上昇。貫通1回ごとにそのボールのダメージ ${b('+25%')}（パドル接触でリセット、最大 +300%）。`,
      },
      recursion: {
        name: '無限分裂',
        flavor: '分裂の分裂の、そのまた分裂……',
        describe: () => `分裂確率 ${b('+30%')}、さらに${b('子ボールも分裂できる')}。理論上、終わりはない。`,
      },
      overclock: {
        name: 'オーバークロック',
        flavor: '保証？ どの保証？',
        describe: () =>
          `${b('オーバードライブ')}の持続時間が ${b('×2')}、その間のダメージもさらに ${b('×2')}。`,
      },
      momentum: {
        name: 'モーメンタム',
        flavor: '跳ねるほど痛くなる。',
        describe: () =>
          `ボールがブロックを撃つごとにダメージ ${b('+12%')}（パドル接触でリセット、最大 ${b('+300%')}）。`,
      },
      supernova: {
        name: 'スーパーノヴァ',
        flavor: '恒星最後のアンコール。',
        describe: () =>
          `爆発範囲 ${b('×2')}。爆発ごとに ${b('25%')} の確率で${b('超新星')}へ昇華——範囲×3.5、ダメージ×3、画面全体を照らす。`,
      },
      eventhorizon: {
        name: '事象の地平',
        flavor: '光さえも逃げられない。',
        describe: () =>
          `ブラックホールの範囲と持続が ${b('×2')}、破裂ダメージ ${b('×3')}。シンギュラリティのダメージ ${b('×2')}。`,
      },
      absolutezero: {
        name: '絶対零度',
        flavor: '分子さえも思考を止めた。',
        describe: () =>
          `凍結が${b('必ず発動')}。凍結ブロックが砕けると${b('氷爆')}を起こす（範囲130、攻撃力の120%ダメージ）。`,
      },
      resonator: {
        name: '共鳴コイル',
        flavor: 'どんな力も、少しだけ長く。',
        describe: (lv) => `パワーアップの効果時間 ${b('+' + pct(0.35 * lv))}。`,
      },
      capacitor: {
        name: 'コンデンサ',
        flavor: 'もう少し。もう少しだけ。',
        describe: (lv) => `オーバードライブのゲージ獲得 ${b('+' + pct(0.3 * lv))}。`,
      },
      recycler: {
        name: 'リサイクル',
        flavor: '廃棄物など存在しない。',
        describe: (lv) => `クリスタル獲得 ${b('+' + pct(0.4 * lv))}。`,
      },
      calibration: {
        name: 'キャリブレーション',
        flavor: '髪の毛ほどの差が、世界を分ける。',
        describe: (lv) =>
          `パーフェクトキャッチの判定範囲 ${b('+' + pct(0.6 * lv))}、パーフェクトキャッチのチャージ量 ${b('+' + pct(0.25 * lv))}。`,
      },
      antenna: {
        name: '増幅アンテナ',
        flavor: '良いものは、まずあなたを見つける。',
        describe: (lv) => `カプセルの出現間隔が ${b(pct(1 - 1 / (1 + 0.5 * lv)))} 短縮。`,
      },
      adrenaline: {
        name: 'アドレナリン',
        flavor: '心拍数は180。',
        describe: (lv) =>
          `パワーアップ効果中、ダメージ ${b('+' + pct(0.4 * lv))}、ボール速度 ${b('+' + pct(0.2 * lv))}。`,
      },
      trampoline: {
        name: 'トランポリン',
        flavor: '床より：もう一回どうぞ。',
        describe: (lv) => `底に落ちたボールは、ロストになる前に${b('床で ' + lv + ' 回')}はね返ります。`,
      },
      evade: {
        name: '回避プロトコル',
        flavor: 'すれ違いざま、一枚上手。',
        describe: (lv) =>
          `被弾時に ${b(pct(0.2 * lv))} の確率で${b('回避')}：シールドを失わず、コンボも途切れません。`,
      },
      slowfield: {
        name: '減速力場',
        flavor: '世界を半拍遅らせる。',
        describe: (lv) => `壁の沈降速度と弾幕の速度 ${b('−' + pct(0.15 * lv))}。`,
      },
      afterglow: {
        name: '残光',
        flavor: '残り火でも火傷をする。',
        describe: () =>
          `オーバードライブ終了時に${b('画面全体の衝撃波')}を放ち、全ブロックに ${b('200%')} の攻撃力ダメージ。`,
      },
      thunderhead: {
        name: '雷雲',
        flavor: '頭上にはいつも雨雲。',
        describe: (lv) =>
          `2.5秒ごとに、警戒ラインに最も近いブロックへ落雷：${b(pct(3 * lv))} の攻撃力ダメージと${b('雷鎖')}（${b(2 * lv)} 回ジャンプ）。`,
      },
      plague: {
        name: '疫病',
        flavor: '1つ倒れ、列ごと感染する。',
        describe: () => `${b('腐食')}中のブロックが砕けると、半径 ${b(150)} 内の全ブロックに腐食を広げる。`,
      },
      wildfire: {
        name: '野火',
        flavor: '一度燃えれば止まらない。',
        describe: () => `${b('灼熱')}中のブロックが砕けると、半径 ${b(140)} 内の全ブロックに着火する。`,
      },
      prism: {
        name: 'プリズム',
        flavor: '1本入って、3本出る。',
        describe: () =>
          `レーザー命中時に左右へ${b('屈折')}し、両隣のブロックへも命中（${b('50%')} の攻撃力ダメージ）。`,
      },
      twinresonance: {
        name: '双共鳴',
        flavor: 'カプセル1つで、楽しみ2倍。',
        describe: () =>
          `パワーアップ取得時、${b('別のランダムなパワーアップ')}も同時に発動（効果時間は50%）。`,
      },
      criticalmass: {
        name: '臨界質量',
        flavor: '止まらない連鎖反応。',
        describe: () =>
          `オーバードライブ中に ${b(5)} ブロック壊すごとに、継続時間が ${b('0.5秒')}延長（最大 ${b('6秒')}）。`,
      },
      perpetuum: {
        name: '永久機関',
        flavor: 'エネルギー保存則？ 聞いたことがない。',
        describe: () =>
          `オーバードライブ中は${b('パワーアップの残り時間が止まり')}、パワーアップ効果中はオーバードライブのゲージ獲得が ${b('×3')}。`,
      },
    },
    buffs: {
      split: {
        name: 'ボール分裂',
        desc: '飛んでいる本体ボールがそれぞれ2つの分身（ダメージ70%）に分裂。効果が切れると分身も消えます。',
      },
      giant: {
        name: 'ボール巨大化',
        desc: 'ボールの半径 ×2.2、ダメージ +60%。',
      },
      wide: {
        name: 'パドル延長',
        desc: 'パドルの幅 ×1.8。',
      },
      laser: {
        name: 'レーザーバースト',
        desc: 'パドルがレーザーを3本追加で発射。',
      },
      magnet: {
        name: 'スーパーマグネット',
        desc: '強力な磁場が落ちてくるボールをパドルへ引き寄せる。',
      },
      ghost: {
        name: 'フェイズ',
        desc: 'ボールがブロックをすり抜け、跳ね返らない。すり抜けるごとにダメージ +20%（パドルで受けるとリセット）。',
      },
      homing: {
        name: 'シーカー',
        desc: 'ボールが最も近いブロックを強力に追尾する。',
      },
      rage: {
        name: 'レイジ',
        desc: 'ダメージ ×2。',
      },
      aegis: {
        name: 'バリア',
        desc: 'パドルの下にバリアが展開し、すべての弾幕を防ぐ。',
      },
      gold: {
        name: 'クリスタルシャワー',
        desc: 'すべてのブロックがクリスタルを落とし、量も2倍になる。',
      },
      deadeye: {
        name: '弱点看破',
        desc: 'クリティカル率100%。',
      },
      blast: {
        name: '一斉爆破',
        desc: 'ブロックを砕くたびに爆発が起こる。',
      },
      storm: {
        name: '元素ストーム',
        desc: 'ヒット時に灼熱・凍結・腐食・雷撃を同時に付与し、すべての元素反応が発生する。',
      },
      timestop: {
        name: '時停',
        desc: '敵はすべて静止し、ボールのダメージ ×2。',
      },
      turbo: {
        name: 'ターボ',
        desc: 'ボール速度 +40%、ダメージ +40%。',
      },
      overcharge: {
        name: 'オーバーチャージ',
        desc: 'オーバードライブのゲージをすぐに満タンにする。',
        short: 'ゲージ満タン',
      },
      repair: {
        name: '緊急修理',
        desc: 'シールドを1つすぐに回復する。',
        short: 'シールド +1',
      },
    },
    difficulty: {
      standard: {
        name: '標準',
        desc: 'オリジナルの体験。ビルドが形になればどんどん楽になる。',
        detail: ['ステージはオリジナルのまま'],
      },
      advanced: {
        name: 'アドバンスド',
        desc: '壁は厚く、沈みは速く。強度に意味が出始める。',
        detail: ['ブロック体力 +25%', '沈降速度 +30%', '追加1列'],
      },
      hard: {
        name: 'ハード',
        desc: 'パドルは細く、弾幕は濃く、ボールを飲む消滅ブロックが出現。',
        detail: [
          'ブロック体力 +30%',
          '沈降速度 +40%',
          '追加2列',
          'パドル −5%',
          '弾幕 +10%',
          '消滅ブロック4%',
        ],
      },
      nightmare: {
        name: 'ナイトメア',
        desc: 'ボール速度を封圧、消滅ブロックは列をなす。突飛ビルドのための試験場。',
        detail: [
          'ブロック体力 +50%',
          '沈降速度 +60%',
          '追加3列',
          'パドル −10%',
          'ボール速度 −4%',
          '弾幕 +20%',
          '消滅ブロック7%',
        ],
      },
      abyss: {
        name: 'アビス',
        desc: '界の外なる何か。16秒ごとに余分なボールが1つ抹消される。',
        detail: [
          'ブロック体力 +75%',
          '沈降速度 +90%',
          '追加4列',
          'パドル −22%',
          'ボール速度 −10%',
          '弾幕 +50%',
          '消滅ブロック12%',
          '16秒ごとに余分なボールを1つ抹消',
        ],
      },
    },
    starters: {
      blank: {
        name: 'ブランクスレート',
        desc: 'アップグレードを持たず、代わりにクリスタル60を持って出発。どの道を行くかは、この後のあなたの選択が決める。',
      },
      barrage: {
        name: 'バラージ',
        desc: 'マルチボール Lv1 + 分裂プロトコル Lv1。画面のボールは増え続ける。',
      },
      battery: {
        name: 'バッテリー',
        desc: 'レーザーアレイ Lv1 + ハイパワーコア Lv1。パドルが自分で撃つ。',
      },
      element: {
        name: 'エレメンタル',
        desc: '灼熱付与 Lv1 + 雷撃付与 Lv1。開局から元素反応「過負荷」が発動可能。',
      },
    },
    chapters: [
      {
        name: 'ネオンシティ',
        places: [
          'ネオン街区',
          'データ高速',
          'ホロ広場',
          'パルスタワー',
          '量子駅',
          'ミラータワー',
          '電力ハブ',
          '深夜のアーケード',
        ],
      },
      {
        name: 'ソーラーコア',
        places: [
          '溶岩パイプライン',
          'コロナの井戸',
          '過負荷炉',
          '赤鉄鉱地帯',
          '灼熱回廊',
          '噴火口',
          '灰の貯槽',
        ],
      },
      {
        name: 'ヴォイドリフト',
        places: [
          '虚空回廊',
          'シンギュラリティの縁',
          '静寂の海',
          '裂け目の奥',
          '消滅の地',
          '零度空間',
          '夢の残骸',
        ],
      },
    ],
    mutators: {
      gravity: {
        name: '重力乱流',
        desc: 'ボールが下向きの引力を受け、軌道が弧を描く。',
      },
      rush: {
        name: '高圧プロトコル',
        desc: '壁の沈降 +50%。ボール速度 +25%、ダメージ +25%。',
      },
      regen: {
        name: '再生装甲',
        desc: 'ブロックが毎秒体力の2.5%を回復。状態異常で再生を抑えられる。',
      },
      stealth: {
        name: '光学迷彩',
        desc: 'ブロックの40%が不可視。撃たれるまで姿を現さない。',
      },
      flak: {
        name: 'フラックゾーン',
        desc: 'タレットがパドルへ弾幕を撃つ。パドルで迎撃すればよく、底部に漏れるとシールドを失う。',
      },
      gold: {
        name: 'ゴールドラッシュ',
        desc: 'クリスタルの落ち量 ×2。金ブロックが大量出現。',
      },
    },
    bosses: {
      warden: {
        name: 'ウォーデン・零式',
        title: 'ネオンシティの注視者',
      },
      solar: {
        name: '溶陽の心',
        title: '止まない過負荷炉',
      },
      sovereign: {
        name: 'ヴォイドソブリン',
        title: '深淵の果ての玉座',
      },
    },
    reactions: {
      melt: {
        name: '融解',
        recipe: '氷 + 炎',
        desc: '氷と炎が出会った瞬間に攻撃力の120%ダメージを与え、凍結を溶かす。',
      },
      overload: {
        name: '過負荷',
        recipe: '炎 + 雷',
        desc: '雷が灼熱中のブロックに当たると爆発を起こす。',
      },
      superconduct: {
        name: '超電導',
        recipe: '氷 + 雷',
        desc: '雷が凍結ブロックに当たると、雷鎖が2回余分にジャンプしてダメージ90%になり、凍結を広げる。',
      },
      venom: {
        name: '毒爆',
        recipe: '毒 + 炎',
        desc: '炎が腐食中のブロックを誘爆させ、大範囲の爆発を起こす。',
      },
    },
    comboTiers: ['熱の上昇', '白熱', '眩さ', '獰猛', '神がかり', '超越', '宇宙級', '奇点', '名状しがたし'],
    rarity: {
      common: 'コモン',
      rare: 'レア',
      epic: 'エピック',
      legendary: 'レジェンド',
      mythic: 'ミシック',
    },
    tags: {
      ball: 'ボール',
      paddle: 'パドル',
      damage: 'ダメージ',
      fire: '炎',
      frost: '氷',
      shock: '雷',
      poison: '腐食',
      void: '虚空',
      explosion: '爆発',
      laser: 'レーザー',
      time: '時空',
      greed: '強欲',
      defense: '生存',
      overdrive: 'オーバードライブ',
      resonance: '共鳴',
    },
  },
};
