import { b, pct } from '../game/upgrades/format';
import type { ContentOverrides } from './content-types';
import type { UiDict } from './zh';

/**
 * 한국어 로케일. UI 문안은 `zh.ts`와 같은 키 구조를 가지며, `content` 부분은 `game/` 쪽에
 * 중국어 정본이 있는 게임 내 문자열(업그레이드 이름·플레이버·설명, 스테이지 이름, 보스, 변이,
 * 원소 반응 등)의 한국어 덮어쓰기 테입니다.
 */
export const ko: UiDict & { content: ContentOverrides } = {
  common: {
    back: '뒤로',
  },
  meta: {
    title: '碎界 SHATTERVERSE',
    description: '碎界 SHATTERVERSE — 터무니없는 빌드와 극한의 쾌감을 추구하는 로그라이트 벽돌깨기.',
    htmlLang: 'ko',
  },
  boot: {
    canvasLabel: '게임 화면',
    noscript: '『碎界』 실행에는 JavaScript가 필요합니다.',
    fatalTitle: '碎界',
    fatalCannotStart: '시작할 수 없음',
    fatalErrored: '시작 중 오류 발생',
    fatalNoWebgl:
      '이 브라우저나 기기는 WebGL2를 지원하지 않습니다. 최신 Chrome, Edge 또는 Firefox를 사용하고 하드웨어 가속이 켜져 있는지 확인해 주세요.',
    fatalGeneric:
      '페이지를 새로 고친 후 다시 시도해 주세요. 문제가 계속되면 아래 정보를 개발자에게 알려주세요.',
  },
  menu: {
    tagline: '오래할수록 터무니없어지는 로그라이트 벽돌깨기',
    campaign: '캠페인',
    endless: '엔드리스',
    tutorial: '게임 방법',
    codex: '업그레이드 도감',
    history: '전적 랭킹',
    cloud: '클라우드 랭킹',
    settings: '설정',
    help: '마우스로 패들 조작 · <kbd>Space</kbd>/클릭 오버드라이브 · <kbd>P</kbd> 일시정지',
    recordsEmpty: '아직 기록이 없습니다. 첫 판을 여기서 시작하세요.',
    recordCampaignDepth: '캠페인 최고 {n}',
    recordBossNote: ' (보스 격파 ×{n})',
    recordEndlessDepth: '엔드리스 최고 제{n}단',
    recordBestScore: '최고 점수 {n}',
    recordWins: '{n}회 클리어',
    recordRuns: '{n}판 플레이',
  },
  hud: {
    shield: '실드',
    build: '빌드',
    buildEmpty: '한 스테이지를 클리어하면 3택.',
    keySpace: 'Space',
    odReady: '오버드라이브 준비됨 · 클릭',
    phase: 'PHASE {n}',
    enraged: '격노 ENRAGED',
    statDamage: '총 피해',
    statBalls: '공',
    statComboBonus: '콤보 보너스',
    statCrit: '치명타율',
    buffs: '파워업',
  },
  starter: {
    title: '초기 프로토콜 선택',
    sub: '프로토콜은 빌드의 출발점입니다. 이후의 모든 3택은 당신이 결정합니다.',
    campaignEyebrow: 'CAMPAIGN · 15 SECTORS · 3 BOSSES',
    endlessEyebrow: 'ENDLESS · 끝이 없는 층',
    crystals: '+{n} 크리스털',
  },
  draft: {
    title: '업그레이드 하나를 선택',
    eyebrow: 'SECTOR {code} CLEAR',
    reroll: '리롤',
    skip: '건너뛰기',
    newUpgrade: 'NEW',
    maxed: 'MAX',
  },
  pause: {
    title: '일시정지',
    resume: '계속하기',
    settings: '설정',
    abandon: '이 판 포기',
  },
  over: {
    titleWon: '심연은 부서졌다',
    titleLost: '실드 파괴',
    subWon: '세 보스, 열다섯 섹터, 터무니없기 짝이 없는 빌드.',
    diffSuffix: '{name} · ',
    campaignMode: '캠페인',
    endlessMode: '엔드리스',
    stopAt: '{code}{name}에서 종료',
    tileScore: '최종 점수',
    tileLevel: '도달 섹터',
    tileDamage: '총 피해',
    tileCombo: '최고 콤보',
    tileBricks: '파괴한 블록',
    tileTime: '생존 시간',
    endlessLevel: '제{n}단',
    newRecord: '신기록',
    rankNote: '역대 {rank}위 · 총 {total}판',
    timelineTip: '{level} {name} · {time}초 · 피격 {n}',
    retry: '한 판 더',
    saveShot: '전적 카드 저장',
    shotSaved: '저장됨 ✓',
    shotFailed: '생성 실패',
    viewHistory: '전적 보기',
    cloudBoard: '클라우드 랭킹',
    backToMenu: '메인 메뉴',
  },
  history: {
    title: '전적 랭킹',
    summary: '로컬 {runs}판 · 클리어 {wins}회 · 누계 {bricks}개 블록 파괴',
    tabCampaign: '캠페인',
    tabEndless: '엔드리스',
    emptyCampaign: '아직 캠페인 기록이 없습니다. 첫 판은 메인 메뉴에서.',
    emptyEndless: '아직 엔드리스 기록이 없습니다.',
    whereWon: '{code} {name} 정복',
    whereLost: '{code} {name}에서 종료',
    whereEndless: '제{level}단',
    chipLatest: '최신',
    metaRow: '{where} · 콤보 {combo} · 피해 {damage} · {time} · {date}',
  },
  cloud: {
    title: '클라우드 랭킹',
    sub: '점수는 자동 업로드됩니다. 종합판은 모든 난이도가 섞이며, 난이도별·모드별 판은 서비스 콘솔에서 만든 뒤 자동으로 나타납니다.',
    nicknameLabel: '닉네임',
    nicknamePlaceholder: '3~16자 영문, 숫자, 밑줄',
    saveName: '이름 저장',
    noteRule: '클라우드 닉네임은 {min}~{max}자의 영문, 숫자, 밑줄이어야 합니다.',
    noteOk: '「{name}」은 사용할 수 있습니다.',
    toyEyebrow: 'CLOUD · BILIBILI TOY',
    toySub:
      '점수는 빌리빌리 Toy 랭킹에 자동 업로드됩니다: 종합 / 주간 / 오늘 외에 엔드리스·캠페인·심연 판이 있습니다. 「글로벌」은 CheddaBoards 세계 랭킹의 읽기 전용 미러입니다.',
    toyNote: '클라우드에는 빌리빌리 닉네임이 표시됩니다. 설정이 필요 없습니다.',
    toyNoteNamed: '클라우드 표시명: 빌리빌리 닉네임 「{name}」',
    noNickname:
      '닉네임이 아직 없습니다. 설정하지 않으면 서버가 할당한 Player_ 번호가 표시됩니다. {min}~{max}자의 영문, 숫자, 밑줄만 가능합니다.',
    pendingNickname: '「{name}」은 다음 판 점수가 업로드된 후 클라우드에 나타납니다.',
    currentNickname: '현재 닉네임: {name}',
    saving: '저장 중…',
    loading: '불러오는 중…',
    offline:
      '클라우드에 연결할 수 없습니다. 점수와 닉네임은 이 기기에 저장되어 있으며, 연결이 회복되면 여기서 다시 시도하세요.',
    emptyBoard: '이 판에는 아직 점수가 없습니다. 한 판 하면 첫 기록은 당신의 것.',
    you: '나',
    streak: '최고 콤보 {n}',
    totalEntries: '총 {n}건',
    myRank: '내 순위 #{rank}',
    myRankOf: '내 순위 #{rank} / {total}',
  },
  codex: {
    title: '업그레이드 도감',
    tabUpgrades: '업그레이드',
    tabReactions: '원소 반응',
    tabBuffs: '파워업',
    tabRules: '기본',
    progressUpgrades: '{total}종 중 {n}종을 만났습니다. 같은 계열의 업그레이드는 함께 나올 확률이 높습니다.',
    progressReactions:
      '두 원소를 동시에 가지면 자동 해금. 반응은 고정된 리듬으로 발동하며 매번 터지지는 않습니다.',
    progressBuffs:
      '블록을 깨면 가끔 캡슐이 떨어집니다. 받으면 몇 초간 효과가 있고, 해당 스테이지에서만 유효합니다.',
    buffTimed: '{n}초',
    buffInstant: '즉시',
    progressRules: '30초면 익히고, 평생을 강해집니다.',
    maxLevel: '최대 Lv{n}',
    unique: '유일',
    undiscovered: '미발견',
    requires: '필요: {list}',
    maxedDesc: '최대: {desc}',
    nextLevel: '다음 단계: {desc}',
    notOwned: '미보유',
    ruleTarget: '목표',
    ruleTargetBody:
      '각 스테이지의 블록을 모두 깨세요. 벽은 계속 가라앉고, <b>빨간 경고선</b>을 넘은 블록은 부서지며 실드를 1점 잃습니다. 실드가 0이 되면 그 판은 끝입니다.',
    ruleCatch: '받치기와 조준',
    ruleCatchBody:
      '바닥에 떨어진 공은 <b>사라지지 않습니다</b>. 잠시 후 패들에서 다시 발사됩니다. 패들의 어디로 받치는지에 따라 반사각이 달라집니다: 가장자리는 크게, 중앙은 수직으로. 정중앙의 <b>퍼펙트 캐치</b>는 충전량이 가장 큽니다.',
    ruleBullets: '탄막',
    ruleBulletsBody:
      '터렛과 보스는 패들을 향해 탄막을 쏩니다. <b>패들로 요격</b>하면 되고, 바닥으로 넘어간 것만큼 실드를 잃습니다. 공과 레이저로도 탄막을 파괴할 수 있습니다.',
    ruleOverdrive: '오버드라이브',
    ruleOverdriveBody:
      '명중과 받치기가 패들을 충전합니다. 가득 차면 <kbd>Space</kbd>나 클릭으로 수 초간 피해와 속도가 폭발합니다.',
    ruleBuild: '빌드',
    ruleBuildBody:
      '스테이지를 클리어할 때마다 3택. 총 {n}종·등급 5단계. 같은 계열은 함께 나오기 쉽고, 전설과 신화는 해당 계열의 포석이 전제됩니다. 두 원소를 모으면 <b>원소 반응</b>이 자동 해금됩니다.',
    ruleBuffs: '파워업',
    ruleBuffsBody:
      '블록을 깨면 가끔 <b>캡슐</b>이 떨어집니다——공 분열, 공 거대화, 패들 연장, 시간 정지 등. 받으면 몇 초간 효과가 이어지며 남은 시간이 화면에 표시됩니다. 효과는 해당 스테이지에서만 유효하고, 「공명」 계열의 업그레이드는 캡슐이 더 자주 나오고 더 오래 지속되게 합니다.',
    ruleCrystals: '크리스털',
    ruleCrystalsBody:
      '블록을 깨면 크리스털 ◆가 떨어집니다. 3택을 <b>리롤</b>하거나 <b>건너뛰기</b>로 모아둘 수 있습니다.',
  },
  settings: {
    title: '설정',
    language: '언어',
    music: '음악 음량',
    sfx: '효과음 음량',
    shake: '화면 흔들림',
    flashes: '플래시 효과',
    quality: '화질',
    qualityLow: '낮음 · 쾌적 우선',
    qualityMedium: '중간',
    qualityHigh: '높음 · 풀 이펙트',
    seed: '시드 고정',
    seedPlaceholder: '비우면 판마다 무작위',
    perfHead: '성능 진단',
    perfButton: '렌더 시간 측정',
    perfCollecting: '수집 중…',
    perfLine: '평균 {fps} fps · 최저 5% {low} fps · 지연 프레임 {jank}%',
    perfAdjusted:
      '실제 적용: {tier}. 프레임 레이트가 부족하면 게임이 자동으로 단계를 내리고 기억합니다. 직접 선택하면 그 선택을 다시 시도합니다.',
    perfGaveUp:
      '프레임 레이트가 낮지만 화질을 낮춰도 개선되지 않습니다—대부분은 시스템 절전 모드의 프레임 제한 때문이며 화질과는 무관합니다.',
    perfFail: '렌더 시간을 측정하지 못했습니다.',
    gpuLine: 'GPU 프레임당 약 {ms} ms — {parts} (각 패스에 약 0.1ms 측정 오버헤드 포함)',
    gpuComposite: '합성',
    gpuBackdrop: '배경',
    gpuLights: '광효과',
    gpuSurfaces: '블록과 공',
    gpuBloom: '블룸',
    gpuNebula: '성운',
    gpuText: '숫자',
    done: '완료',
  },
  callouts: {
    perfectSub: '퍼펙트 캐치',
    bossDownSub: '보스 격파',
    enragedSub: '보스 격노',
    phaseSub: '제{n}단계',
    overdriveSub: '오버드라이브',
    timeStopSub: '시간 정지',
    sectorClearSub: '섹터 클리어',
    buffSub: '{name} · {n}초',
    buffTwinSub: '{name} · 쌍공명 {n}초',
    dodgeSub: '실드 무사',
    reactionToast: '원소 반응 · {name}',
    reactionDetail: '{recipe}: {desc}',
    difficultyToast: '{en} · {name}',
    firstToastTitle: '마우스로 패들 조작',
    firstToastBody:
      '바닥에 떨어진 공은 사라지지 않습니다. 가장자리로 받으면 크게 튀고, 정중앙 캐치는 충전량이 최대입니다.',
    bannerMutator: '변이 · {name} — {desc}',
    qualityAdjustedTitle: '화질이 자동 조정되었습니다',
    qualityAdjustedBody:
      '프레임 레이트가 부족하여 「{tier}」로 전환했고 이 기기용으로 기억했습니다. 설정에서 언제든 바꿀 수 있습니다',
    qualityGaveUpTitle: '선택한 화질로 복원했습니다',
    qualityGaveUpBody:
      '화질을 낮춰도 프레임 레이트가 오르지 않았습니다. 원인은 다른 곳에 있습니다(흔히 절전 모드의 프레임 제한)',
  },
  governor: {
    qualityHigh: '높음',
    qualityMedium: '중간',
    qualityLow: '낮음',
    scaled: '{name} (렌더 해상도 {pct}%)',
  },
  tutorial: {
    sub: '규칙·실드·업그레이드·변이를 1분 동안.',
    skip: '건너뛰기',
    prev: '이전',
    next: '다음',
    start: '게임 시작',
    dotsLabel: '설명 페이지',
    pageAria: '{n}페이지',
    pages: [
      {
        eyebrow: 'TUTORIAL · 01',
        title: '碎界에 온 것을 환영합니다',
        html: `
      <p>『碎界』는 <b>오래할수록 터무니없어지는 로그라이트 벽돌깨기</b>입니다. 각 스테이지의 블록을 깨고 패들과 공을 당신만의 터무니없는 빌드로 키워 나가세요.</p>
      <p>캠페인은 15개 섹터와 3명의 보스. 엔드리스에는 끝이 없으며 깊이 들어갈수록 힘들어집니다.</p>
      <p>다음 몇 장은 1분이면 읽습니다. 급하면 언제든 <b>건너뛰기</b>——메인 메뉴의 「게임 방법」에서 언제든 다시 볼 수 있습니다.</p>`,
      },
      {
        eyebrow: 'TUTORIAL · 02',
        title: '패들과 공',
        art: 'paddle',
        html: `
      <p><b>마우스나 손가락</b>으로 패들을 조작합니다. 바닥에 떨어진 공은 <b>사라지지 않습니다</b>. 잠시 후 패들에서 다시 발사됩니다.</p>
      <p>받치는 위치가 반사각을 정합니다. <b>가장자리</b>는 크게, <b>중앙</b>은 수직으로. 정중앙은 <b>퍼펙트 캐치</b>로 충전량이 가장 큽니다.</p>
      <p><b>오버드라이브</b>: 명중과 받치기가 패들을 충전합니다. 가득 차면 <kbd>Space</kbd>나 화면 아래 버튼을 눌러 {overdrive}초간 피해와 속도가 폭발합니다.</p>
      <p>PC에서는 <kbd>P</kbd>나 <kbd>Esc</kbd>로 언제든 일시정지할 수 있습니다.</p>`,
      },
      {
        eyebrow: 'TUTORIAL · 03',
        title: '실드와 피격',
        art: 'danger',
        html: `
      <p>화면 왼쪽 위의 빛나는 칸이 당신의 <b>실드</b>(생명)입니다. 초기값은 {maxHp}이고 일부 업그레이드로 상한을 높일 수 있습니다.</p>
      <p>실드가 줄어드는 길은 두 가지뿐입니다:</p>
      <ul>
        <li><b>경고선</b>—블록 벽은 계속 가라앉으며, 바닥의 빨간 경고선을 넘은 블록은 부서지며 실드 −1.</li>
        <li><b>탄막</b>—터렛과 보스는 패들을 향해 탄막을 쏩니다. 패들로 요격하면 되고 바닥으로 넘어가면 −1.</li>
      </ul>
      <p>피격 직후 약 1초의 무적 시간이 있어 연속으로 맞지는 않습니다. 대신 콤보는 0이 되고 오버드라이브 충전도 일부 잃습니다.</p>
      <p>회복: 보스 격파 시 +1. 스테이지 안에서는 가끔 하트가 떨어지며, 받으면 +1. <b>실드가 0이 되면 그 판은 끝납니다.</b></p>`,
      },
      {
        eyebrow: 'TUTORIAL · 04',
        title: '3택 업그레이드',
        html: `
      <p>스테이지를 클리어할 때마다 <b>3택</b>. 선택한 업그레이드는 이 판에서만 유효하며 쌓여서 빌드가 됩니다. 총 {upgrades}종·등급 5단계: 커먼 → 레어 → 에픽 → 전설 → 신화.</p>
      <p>업그레이드에는 계열이 있습니다—공 / 패들 / 피해 / 화염 / 빙결 / 뇌전 / 부식 / 공허 / 폭발 / 레이저 / 시공 / 탐욕 / 생존 / 오버드라이브 / 공명. <b>같은 계열은 함께 나오기 쉽습니다</b>.</p>
      <p><b>원소 반응</b>: 두 원소(빙결·화염·뇌전·부식)를 동시에 가지면 조합 효과가 자동 해금됩니다. 예컨대 「빙결 + 화염」의 융해.</p>
      <p><b>파워업</b>: 스테이지 중 블록을 깨면 가끔 <b>캡슐</b>이 떨어집니다——공 분열, 공 거대화, 패들 연장, 시간 정지 등. 받으면 몇 초간 효과가 있으며 해당 스테이지에서만 유효합니다. 「공명」 계열의 업그레이드는 이들과 연동됩니다.</p>
      <p><b>크리스털</b>: 블록을 깨면 크리스털 ◆가 떨어집니다. 3택을 「리롤」하거나 「건너뛰기」해서 모아둘 수도 있습니다.</p>`,
      },
      {
        eyebrow: 'TUTORIAL · 05',
        title: '스테이지 변이와 장애',
        art: 'threats',
        mutators: true,
        html: `
      <p>스테이지에 따라서는 개막에 <b>변이</b>가 공고됩니다: 스테이지 전체의 규칙이 다시 쓰이는 것으로, 성가신 것도 있고 오히려 이로운 것도 있습니다.</p>
      <p>높은 난이도에서는 공을 <b>삼키는 소멸 블록</b>도 등장합니다. 「심연」에서는 16초마다 남는 공이 하나 지워집니다. 보스전은 길어질수록 위험—시간 초과로 <b>격노</b>하면 탄막이 촘촘해집니다.</p>`,
      },
      {
        eyebrow: 'TUTORIAL · 06',
        title: '준비 완료',
        html: `
      <p>처음 몇 스테이지는 여유로운 템포입니다. 먼저 받치는 감각을 익히세요. 빌드가 형태를 갖추면 화면은 갈수록 후끈해집니다.</p>
      <p>업그레이드 상세와 원소 반응은 메인 메뉴 → <b>업그레이드 도감</b>. 「기본」 탭에 같은 규칙 요약이 있습니다.</p>
      <p>설정에서는 음량·화질·화면 흔들림을 조정할 수 있습니다. 프레임 레이트를 못 따라가는 기기에서는 게임이 자동으로 단계를 내려 쾌적함을 유지합니다.</p>
      <p>준비되었나요? 오른쪽 아래에서, 한 판 시작하세요.</p>`,
      },
    ],
  },
  scorecard: {
    report: 'RUN REPORT · 전적 카드',
    finalScore: 'FINAL SCORE · 최종 점수',
    newRecord: '신기록 NEW RECORD',
    rank: '역대 {rank}위 · RANK #{rank}',
    localCount: '로컬 {n}판',
    clearedAll: '전 섹터 정복',
    stoppedAt: '{code} {name}에서 종료',
    modeCampaign: 'CAMPAIGN · 캠페인',
    modeEndless: 'ENDLESS · 엔드리스',
    modeCampaignShort: '캠페인',
    modeEndlessShort: '엔드리스',
    tileLevel: '도달 섹터',
    tileDamage: '총 피해',
    tileCombo: '최고 콤보',
    tileBricks: '파괴한 블록',
    tileTime: '생존 시간',
    tileRank: '로컬 순위',
    endlessLevel: '제{n}단',
    rankOf: '제{rank} / {total}판',
    firstRun: '첫 도전',
    build: 'FINAL BUILD · 최종 빌드',
    noBuild: '백지 출발 · 지닌 업그레이드 없음',
    tagline: '로그라이트 벽돌깨기 · ROGUELITE BREAKOUT',
  },
  net: {
    boardAllTime: '종합',
    boardWeekly: '주간',
    boardDaily: '오늘',
    boardEndless: '엔드리스',
    boardCampaign: '캠페인',
    boardAbyss: '심연',
    boardGlobal: '글로벌',
    renamePending: '「{name}」을 저장했습니다. 첫 점수 업로드 후 클라우드에 표시됩니다.',
    renameApplied: '닉네임이 「{name}」(으)로 갱신되었습니다.',
    renameRejected: '닉네임이 거부되었습니다: {error}',
    renameRateLimited: '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.',
    renameOffline: '클라우드에 연결할 수 없어 닉네임은 이 기기에만 저장되었습니다.',
    renameFailed: '닉네임을 저장하지 못했습니다: {error}',
    scoreZero: '이 판은 점수가 없어 업로드하지 않습니다.',
    uploadedRank: '업로드됨 · 세계 {rank}위 / {total}',
    uploaded: '클라우드에 업로드되었습니다',
    scoreRejected: '점수가 검증을 통과하지 못해 로컬에 저장했습니다.',
    scoreRateLimited: '제출이 너무 잦습니다. 이 판의 점수는 다음에 업로드됩니다.',
    scoreOffline: '클라우드에 연결할 수 없어 점수는 로컬에 저장했습니다.',
    scoreFailed: '점수가 업로드되지 않고 로컬에 저장되었습니다.',
    toyNotLoggedIn: '빌리빌리에 로그인하지 않아 점수는 로컬에 저장했습니다.',
    toyFailed: '점수가 빌리빌리에 업로드되지 않고 로컬에 저장되었습니다.',
    nickEmpty: '닉네임을 입력해 주세요',
    nickLength: '닉네임은 {min}~{max}자여야 합니다',
    nickCharset:
      '닉네임은 영문, 숫자, 밑줄만 사용할 수 있습니다(클라우드는 한글, 공백, 이모지를 지원하지 않습니다)',
    nickBlocked: '사용할 수 없는 닉네임입니다. 다른 이름을 지어 주세요',
    nickReserved: '시스템이 예약한 닉네임입니다. 다른 이름을 지어 주세요',
    toyApiFailed: '빌리빌리 API 호출에 실패했습니다',
  },
  content: {
    upgrades: {
      multiball: {
        name: '멀티볼',
        flavor: '하나로 부족하면, 하나 더.',
        describe: (lv) => `공 개수 ${b('+' + lv)}.`,
      },
      power: {
        name: '하이파워 코어',
        flavor: '발전소 하나를 공 한 알에 우겨넣었습니다.',
        describe: (lv) => `기본 피해 ${b('+' + pct(0.3 * lv))}.`,
      },
      wide: {
        name: '와이드 필드',
        flavor: '면적이 곧 정의.',
        describe: (lv) => `패들 폭 ${b('+' + pct(0.22 * lv))}.`,
      },
      bigball: {
        name: '거대 공',
        flavor: '물리학의 사과문.',
        describe: (lv) => `공 반지름 ${b('+' + pct(0.28 * lv))}, 기본 피해 ${b('+' + pct(0.15 * lv))}.`,
      },
      speed: {
        name: '초음속',
        flavor: '소닉 붐이 유일한 브레이크 소리.',
        describe: (lv) => `공 속도 ${b('+' + pct(0.14 * lv))}, 기본 피해 ${b('+' + pct(0.12 * lv))}.`,
      },
      lucky: {
        name: '행운의 별',
        flavor: '우주도 가끔은 당신 편입니다.',
        describe: (lv) => `행운 ${b('+' + lv)}(높은 등급 등장률), 크리스털 획득 ${b('+' + pct(0.25 * lv))}.`,
      },
      growth: {
        name: '성장 프로토콜',
        flavor: '복리는 세계 제8 불가사의.',
        describe: (lv) => `스테이지를 클리어할 때마다 기본 피해 ${b('+' + pct(0.15 * lv))}(영구 누적).`,
      },
      shield: {
        name: '위상 실드',
        flavor: '목숨 하나 더, 터무니없을 기회 하나 더.',
        describe: (lv) => `실드 상한 ${b('+' + lv)}, 즉시 ${b(lv)} 회복.`,
      },
      crit: {
        name: '치명타 매트릭스',
        flavor: '약점? 전부가 약점입니다.',
        describe: (lv) => `치명타율 ${b('+' + pct(0.12 * lv))}, 치명타 피해 ${b('+' + pct(0.3 * lv))}.`,
      },
      pierce: {
        name: '위상 관통',
        flavor: '벽? 무슨 벽?',
        describe: (lv) => `공이 ${b(pct(0.22 * lv))} 확률로 블록을 ${b('관통')}하고 튕기지 않습니다.`,
      },
      homing: {
        name: '유도 코어',
        flavor: '공은 자기가 가야 할 곳을 압니다.',
        describe: (lv) => `공이 가장 가까운 블록을 자동 추적. 선회력 ${b('+' + lv)}급.`,
      },
      split: {
        name: '분열 프로토콜',
        flavor: '세포 분열, 지수 성장.',
        describe: (lv) => `블록 파괴 시 ${b(pct(0.16 * lv))} 확률로 자식 공이 분열(피해 45%, 4초 생존).`,
      },
      fire: {
        name: '작열 부여',
        flavor: '모든 것에 불을 지르세요.',
        describe: (lv) => `명중에 ${b('작열')} 부여: 매초 ${b(pct(0.45 * lv))} 공격력 피해, 3초 지속.`,
      },
      frost: {
        name: '극냉 부여',
        flavor: '절대적인 침착.',
        describe: (lv) =>
          `명중 시 ${b(pct(Math.min(1, 0.22 * lv)))} 확률로 ${b('빙결')} 1.6초. 빙결된 블록은 피해 ${b('+30%')}.`,
      },
      shock: {
        name: '뇌격 부여',
        flavor: '고전압, 만지지 마세요.',
        describe: (lv) => `명중 시 ${b('뇌쇄')}를 방출, ${b(2 * lv)}개 대상으로 튀어 각각 ${b('45%')} 피해.`,
      },
      laser: {
        name: '레이저 어레이',
        flavor: '패들은 그저 패들로만 있기 싫대요.',
        describe: (lv) =>
          `패들이 0.9초마다 레이저 ${b(lv)}발을 발사, 한 발당 ${b(pct(0.6 * lv))} 공격력 피해.`,
      },
      magnet: {
        name: '자력 앵커',
        flavor: '당신은 놓쳐도, 공은 아닙니다.',
        describe: (lv) =>
          `패들 위에 ${b('자기장')}이 형성(범위 ${b(110 * lv)})되어 떨어지는 공을 끌어당깁니다.`,
      },
      empower: {
        name: '충전 리바운드',
        flavor: '돌아가는 길에 살짝 충전하고 왔습니다.',
        describe: (lv) =>
          `패들에 튕겨 나간 공은 ${b('충전')}을 얻습니다: 피해 ${b('+' + pct(0.6 * lv))}, 3초 지속.`,
      },
      echo: {
        name: '에코 프로토콜',
        flavor: '첫 타는 인사, 두 번째 타가 대답입니다.',
        describe: (lv) =>
          `명중 시 ${b(pct(0.18 * lv))} 확률로 ${b('잔향')} 발동: 0.25초 뒤 60% 피해를 다시 줍니다.`,
      },
      shatter: {
        name: '파편 폭풍',
        flavor: '파편이 블록 본체보다 위험합니다.',
        describe: (lv) => `블록이 깨질 때 파편 ${b(3 * lv)}개가 흩날리며 각각 공격력의 30% 피해를 줍니다.`,
      },
      explosive: {
        name: '폭렬 코어',
        flavor: '모든 블록은 폭죽입니다.',
        describe: (lv) =>
          `블록 파괴 시 ${b('폭발')}: 범위 ${b(85 + 18 * (lv - 1))}, ${b(pct(0.5 * lv))} 공격력 피해.`,
      },
      combo: {
        name: '콤보 오버로드',
        flavor: '멈추지 마세요.',
        describe: (lv) => `콤보 10마다 피해 ${b('+' + pct(0.05 * lv))}. ${b('상한 없음')}.`,
      },
      chainreaction: {
        name: '연쇄 반응',
        flavor: '블록 하나가 쓰러지면 벽 전체가 함께 갑니다.',
        describe: () =>
          `폭발로 깨진 블록이 ${b('다시 폭발')}하며 피해는 감쇠하지 않습니다. 연쇄 한 번이면 충분합니다.`,
      },
      meltdown: {
        name: '멜트다운 코어',
        flavor: '냉각 시스템? 철거했습니다.',
        describe: () =>
          `폭발 범위 ${b('+60%')}, 그 자리에 2초간 ${b('불바다')}를 남깁니다(초당 공격력의 70% 피해).`,
      },
      void: {
        name: '공허 침식',
        flavor: '이곳의 공간은 좀 불안정합니다.',
        describe: (lv) =>
          `블록 파괴 시 ${b(pct(0.07 * lv))} 확률로 ${b('블랙홀')}이 찢어집니다: 공의 궤적을 휘게 하고 주변 블록을 갈아버리며 끝에 파열합니다.`,
      },
      reaper: {
        name: '종언 선고',
        flavor: '수치는 어디까지나 제안입니다.',
        describe: (lv) =>
          `생명이 ${b(pct(0.06 * lv))} 미만인 블록을 ${b('즉시 처형')}합니다(보스 코어 면역).`,
      },
      poison: {
        name: '부식의 독',
        flavor: '퍼센트 피해. 모든 방어를 무시합니다.',
        describe: (lv) =>
          `명중에 ${b('부식')} 부여: 매초 대상 최대 생명의 ${b(pct(0.025 * lv))}만큼 피해, 4초 지속. 보스의 천적.`,
      },
      solar: {
        name: '프로미넌스',
        flavor: '공 하나하나가 작은 태양입니다.',
        describe: (lv) =>
          `공 주위에 ${b('코로나')}가 형성(범위 80)되어 매초 ${b(pct(0.45 * lv))} 공격력 피해를 줍니다.`,
      },
      orbital: {
        name: '오비탈 랜스',
        flavor: '궤도 지원이 자리에 도착했습니다.',
        describe: (lv) =>
          `4초마다 ${b(lv)}줄의 ${b('궤도 빔')}이 세로열을 관통. 열 안의 모든 블록이 공격력의 300% 피해를 입습니다.`,
      },
      timestop: {
        name: '시정 필드',
        flavor: '세계여, 멈춰라.',
        describe: (lv) =>
          `20초마다 자동으로 ${b((2.5 + 0.5 * lv).toFixed(1))}초의 ${b('시간 정지')}: 적은 모두 멈추고 공의 피해는 ${b('×2')}.`,
      },
      mirror: {
        name: '미러 버스',
        flavor: '거울 속에서도 누군가 벽돌깨기를 하고 있습니다.',
        describe: (lv) => `각 공에 ${b('거울 유령 공')}이 붙어 ${b(pct(0.4 * lv))} 피해를 줍니다.`,
      },
      singularity: {
        name: '특이점',
        flavor: '이것은 가리는 입맛이 없습니다.',
        describe: () => `${b('특이점')} 하나가 필드를 배회하며 지나가는 모든 블록을 갈아버립니다.`,
      },
      phantom: {
        name: '팬텀 랜스',
        flavor: '길을 막는 것은 전부 장식입니다.',
        describe: () =>
          `관통 확률이 ${b('100%')}로 상승. 관통할 때마다 그 공의 피해 ${b('+25%')}(패들 접촉 시 리셋, 최대 +300%).`,
      },
      recursion: {
        name: '무한 분열',
        flavor: '분열의 분열의, 그 분열의……',
        describe: () =>
          `분열 확률 ${b('+30%')}, 그리고 ${b('자식 공도 분열할 수 있습니다')}. 이론상 끝이 없습니다.`,
      },
      overclock: {
        name: '오버클럭',
        flavor: '보증? 무슨 보증?',
        describe: () => `${b('오버드라이브')} 지속시간 ${b('×2')}, 그 동안 피해도 추가로 ${b('×2')}.`,
      },
      momentum: {
        name: '모멘텀',
        flavor: '튕길수록 아픕니다.',
        describe: () => `공이 블록을 칠 때마다 피해 ${b('+12%')}(패들 접촉 시 리셋, 최대 ${b('+300%')}).`,
      },
      supernova: {
        name: '초신성',
        flavor: '별의 마지막 앙코르.',
        describe: () =>
          `폭발 범위 ${b('×2')}. 폭발마다 ${b('25%')} 확률로 ${b('초신성')}으로 승화—범위 ×3.5, 피해 ×3, 화면 전체를 밝힙니다.`,
      },
      eventhorizon: {
        name: '사상의 지평',
        flavor: '빛조차도 빠져나갈 수 없습니다.',
        describe: () => `블랙홀 범위와 지속 ${b('×2')}, 파열 피해 ${b('×3')}. 특이점 피해 ${b('×2')}.`,
      },
      absolutezero: {
        name: '절대영도',
        flavor: '분자마저도 생각을 멈췄습니다.',
        describe: () =>
          `빙결이 ${b('반드시 발동')}. 빙결된 블록이 깨질 때 ${b('빙폭')}을 일으킵니다(범위 130, 공격력의 120% 피해).`,
      },
      resonator: {
        name: '공명 코일',
        flavor: '어떤 힘이든 조금 더 오래.',
        describe: (lv) => `파워업 지속시간 ${b('+' + pct(0.35 * lv))}.`,
      },
      capacitor: {
        name: '커패시터',
        flavor: '조금만, 아주 조금만 더.',
        describe: (lv) => `오버드라이브 게이지 획득량 ${b('+' + pct(0.3 * lv))}.`,
      },
      recycler: {
        name: '재활용 프로토콜',
        flavor: '버릴 것은 아무것도 없다.',
        describe: (lv) => `크리스털 획득 ${b('+' + pct(0.4 * lv))}.`,
      },
      calibration: {
        name: '교정',
        flavor: '머리카락 만큼의 차이가 세상을 가른다.',
        describe: (lv) =>
          `퍼펙트 캐치 판정 범위 ${b('+' + pct(0.6 * lv))}, 퍼펙트 캐치 충전량 ${b('+' + pct(0.25 * lv))}.`,
      },
      antenna: {
        name: '증폭 안테나',
        flavor: '좋은 것은 먼저 당신을 찾아온다.',
        describe: (lv) => `캡슐이 더 자주 나옵니다: 출현 간격 ${b(pct(1 - 1 / (1 + 0.5 * lv)))} 단축.`,
      },
      adrenaline: {
        name: '아드레날린',
        flavor: '심박수 180.',
        describe: (lv) => `파워업 효과 중 피해 ${b('+' + pct(0.4 * lv))}, 공 속도 ${b('+' + pct(0.2 * lv))}.`,
      },
      trampoline: {
        name: '트램펄린',
        flavor: '바닥이 말합니다: 한 번 더.',
        describe: (lv) => `바닥에 떨어진 공은 로스트되기 전에 ${b('바닥에서 ' + lv + '회')} 튕겨 올라옵니다.`,
      },
      evade: {
        name: '회피 프로토콜',
        flavor: '스치고 지나갑니다.',
        describe: (lv) =>
          `피격 시 ${b(pct(0.2 * lv))} 확률로 ${b('회피')}: 실드를 잃지 않고 콤보도 유지됩니다.`,
      },
      slowfield: {
        name: '감속 장',
        flavor: '세상을 반 박자 늦게.',
        describe: (lv) => `벽의 침하 속도와 탄막 속도 ${b('−' + pct(0.15 * lv))}.`,
      },
      afterglow: {
        name: '여광',
        flavor: '잔불도 뜨겁습니다.',
        describe: () =>
          `오버드라이브가 끝날 때 ${b('화면 전체 충격파')}를 방출해 모든 블록에 ${b('200%')} 공격력 피해를 줍니다.`,
      },
      thunderhead: {
        name: '뇌운',
        flavor: '머리 위에는 언제나 먹구름.',
        describe: (lv) =>
          `2.5초마다 경고선에 가장 가까운 블록에 낙뢰: ${b(pct(3 * lv))} 공격력 피해와 ${b('뇌쇄')}(${b(2 * lv)}회 도약).`,
      },
      plague: {
        name: '역병',
        flavor: '하나가 쓰러지면 한 줄이 옮는다.',
        describe: () => `${b('부식')} 중인 블록이 깨지면 반경 ${b(150)} 안의 모든 블록에 부식을 퍼뜨립니다.`,
      },
      wildfire: {
        name: '들불',
        flavor: '한번 붙으면 멈추지 않는다.',
        describe: () => `${b('작열')} 중인 블록이 깨지면 반경 ${b(140)} 안의 모든 블록에 불을 붙입니다.`,
      },
      prism: {
        name: '프리즘',
        flavor: '한 줄기가 들어가 세 줄기가 나온다.',
        describe: () =>
          `레이저 명중 시 좌우로 ${b('굴절')}해 양옆의 다음 블록도 맞힙니다(${b('50%')} 공격력 피해).`,
      },
      twinresonance: {
        name: '쌍공명',
        flavor: '캡슐 하나에 즐거움 두 배.',
        describe: () => `파워업을 얻으면 ${b('다른 무작위 파워업')}도 지속시간 50%로 함께 발동합니다.`,
      },
      criticalmass: {
        name: '임계 질량',
        flavor: '멈추지 않는 연쇄 반응.',
        describe: () =>
          `오버드라이브 중 블록 ${b(5)}개를 깨울 때마다 지속시간 ${b('0.5초')} 연장(최대 ${b('6초')}).`,
      },
      perpetuum: {
        name: '영구 기관',
        flavor: '에너지 보존 법칙? 들어본 적 없는데요.',
        describe: () =>
          `오버드라이브 중에는 ${b('파워업 남은 시간이 멈추고')}, 파워업 효과 중에는 오버드라이브 게이지 획득량이 ${b('×3')}.`,
      },
    },
    buffs: {
      split: {
        name: '공 분열',
        desc: '날아가는 본체 공마다 2개의 분신(피해 70%)으로 분열합니다. 효과가 끝나면 분신도 사라집니다.',
      },
      giant: {
        name: '공 거대화',
        desc: '공 반지름 ×2.2, 피해 +60%.',
      },
      wide: {
        name: '패들 연장',
        desc: '패들 폭 ×1.8.',
      },
      laser: {
        name: '레이저 버스트',
        desc: '패들이 레이저를 3발 추가로 발사합니다.',
      },
      magnet: {
        name: '슈퍼 자석',
        desc: '강력한 자기장이 떨어지는 공을 패들로 끌어당깁니다.',
      },
      ghost: {
        name: '위상 통과',
        desc: '공이 블록을 통과하고 튕기지 않습니다. 통과할 때마다 피해 +20%(패들 접촉 시 리셋).',
      },
      homing: {
        name: '시커',
        desc: '공이 가장 가까운 블록을 강력하게 추적합니다.',
      },
      rage: {
        name: '레이지',
        desc: '피해 ×2.',
      },
      aegis: {
        name: '방어막',
        desc: '패들 아래에 방어막이 펼쳐져 모든 탄막을 막습니다.',
      },
      gold: {
        name: '크리스털 소나기',
        desc: '모든 블록이 크리스털을 떨어뜨리며 양도 2배가 됩니다.',
      },
      deadeye: {
        name: '약점 간파',
        desc: '치명타율 100%.',
      },
      blast: {
        name: '일제 폭파',
        desc: '블록을 깰 때마다 폭발이 일어납니다.',
      },
      storm: {
        name: '원소 폭풍',
        desc: '명중 시 작열·빙결·부식·뇌전을 동시에 부여해 모든 원소 반응이 발동합니다.',
      },
      timestop: {
        name: '시간 정지',
        desc: '적은 모두 멈추고 공의 피해 ×2.',
      },
      turbo: {
        name: '터보',
        desc: '공 속도 +40%, 피해 +40%.',
      },
      overcharge: {
        name: '오버차지',
        desc: '오버드라이브 게이지를 즉시 가득 채웁니다.',
        short: '게이지 가득',
      },
      repair: {
        name: '긴급 수리',
        desc: '실드를 1 즉시 회복합니다.',
        short: '실드 +1',
      },
    },
    difficulty: {
      standard: {
        name: '표준',
        desc: '원본 그대로의 체험. 빌드가 갖춰지면 점점 수월해집니다.',
        detail: ['스테이지는 원본 그대로'],
      },
      advanced: {
        name: '고급',
        desc: '벽은 두껍고 가라앉음은 빠릅니다. 강도가 의미를 갖기 시작합니다.',
        detail: ['블록 체력 +25%', '침하 속도 +30%', '추가 1줄'],
      },
      hard: {
        name: '어려움',
        desc: '패들은 좁아지고 탄막은 촘촘해지며 공을 삼키는 소멸 블록이 등장합니다.',
        detail: ['블록 체력 +30%', '침하 속도 +40%', '추가 2줄', '패들 −5%', '탄막 +10%', '소멸 블록 4%'],
      },
      nightmare: {
        name: '악몽',
        desc: '공 속도가 억압되고 소멸 블록이 줄을 섭니다. 터무니없는 빌드를 위한 시험장.',
        detail: [
          '블록 체력 +50%',
          '침하 속도 +60%',
          '추가 3줄',
          '패들 −10%',
          '공 속도 −4%',
          '탄막 +20%',
          '소멸 블록 7%',
        ],
      },
      abyss: {
        name: '심연',
        desc: '계 바깥의 무언가. 16초마다 남는 공이 하나 지워집니다.',
        detail: [
          '블록 체력 +75%',
          '침하 속도 +90%',
          '추가 4줄',
          '패들 −22%',
          '공 속도 −10%',
          '탄막 +50%',
          '소멸 블록 12%',
          '16초마다 남는 공 하나를 지움',
        ],
      },
    },
    starters: {
      blank: {
        name: '백지 슬레이트',
        desc: '업그레이드 없이 크리스털 60을 들고 출발. 어느 길을 갈지는 이후의 모든 선택이 결정합니다.',
      },
      barrage: {
        name: '배리지',
        desc: '멀티볼 Lv1 + 분열 프로토콜 Lv1. 화면의 공은 계속 불어납니다.',
      },
      battery: {
        name: '배터리',
        desc: '레이저 어레이 Lv1 + 하이파워 코어 Lv1. 패들이 스스로 발사합니다.',
      },
      element: {
        name: '엘리멘탈',
        desc: '작열 부여 Lv1 + 뇌격 부여 Lv1. 첫 스테이지부터 원소 반응 「과부하」가 발동 가능.',
      },
    },
    chapters: [
      {
        name: '네온 시티',
        places: [
          '네온 블록',
          '데이터 고속로',
          '홀로그램 광장',
          '펄스 타워',
          '양자 역',
          '미러 타워',
          '전력 허브',
          '자정의 아케이드',
        ],
      },
      {
        name: '솔라 코어',
        places: ['용암 배관', '코로나 우물', '과부하로', '적철광 지대', '작열 회랑', '분화구', '재 저장조'],
      },
      {
        name: '보이드 리프트',
        places: [
          '공허 회랑',
          '특이점 가장자리',
          '침묵의 바다',
          '틈 깊은 곳',
          '소멸의 땅',
          '영도 공간',
          '꿈의 잔해',
        ],
      },
    ],
    mutators: {
      gravity: {
        name: '중력 난류',
        desc: '공이 아래로 끌리는 힘을 받아 궤적이 호를 그립니다.',
      },
      rush: {
        name: '고압 프로토콜',
        desc: '벽의 침하 +50%. 공 속도 +25%, 피해 +25%.',
      },
      regen: {
        name: '재생 장갑',
        desc: '블록이 매초 체력의 2.5%를 회복. 상태이상으로 재생을 억제할 수 있습니다.',
      },
      stealth: {
        name: '광학 미채',
        desc: '블록의 40%가 투명 상태입니다. 맞혀야 모습을 드러냅니다.',
      },
      flak: {
        name: '포화 지대',
        desc: '터렛이 패들을 향해 탄막을 쏩니다. 패들로 요격하면 되고 바닥으로 넘어가면 실드를 잃습니다.',
      },
      gold: {
        name: '골드 러시',
        desc: '크리스털 낙하 ×2, 황금 블록이 대량 등장.',
      },
    },
    bosses: {
      warden: {
        name: '워든·영식',
        title: '네온 시티의 주시자',
      },
      solar: {
        name: '용양의 심장',
        title: '멈추지 않는 과부하로',
      },
      sovereign: {
        name: '보이드 소버린',
        title: '심연 끝의 왕좌',
      },
    },
    reactions: {
      melt: {
        name: '융해',
        recipe: '빙결 + 화염',
        desc: '빙결과 화염이 만난 순간 공격력의 120% 피해를 주고 빙결을 녹입니다.',
      },
      overload: {
        name: '과부하',
        recipe: '화염 + 뇌전',
        desc: '뇌전이 작열 중인 블록에 맞으면 폭발을 일으킵니다.',
      },
      superconduct: {
        name: '초전도',
        recipe: '빙결 + 뇌전',
        desc: '뇌전이 빙결 블록에 맞으면 뇌쇄가 2번 추가로 튀어 피해가 90%로 오르고 빙결을 퍼뜨립니다.',
      },
      venom: {
        name: '독폭',
        recipe: '부식 + 화염',
        desc: '화염이 부식 중인 블록을 유폭시켜 넓은 범위의 폭발을 일으킵니다.',
      },
    },
    comboTiers: [
      '열이 오르는 중',
      '백열',
      '눈부심',
      '사나움',
      '신의 경지',
      '초월',
      '우주급',
      '특이',
      '이름붙일 수 없는 것',
    ],
    rarity: {
      common: '커먼',
      rare: '레어',
      epic: '에픽',
      legendary: '전설',
      mythic: '신화',
    },
    tags: {
      ball: '공',
      paddle: '패들',
      damage: '피해',
      fire: '화염',
      frost: '빙결',
      shock: '뇌전',
      poison: '부식',
      void: '공허',
      explosion: '폭발',
      laser: '레이저',
      time: '시공',
      greed: '탐욕',
      defense: '생존',
      overdrive: '오버드라이브',
      resonance: '공명',
    },
  },
};
