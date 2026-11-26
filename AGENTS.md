# AGENTS.md — 开发要求

本项目《碎界 SHATTERVERSE》发布在 B 站 Toy（哔哩哔哩）平台。**已经因文案与图片内容被驳回三次**，
每次都要求整改后重新提审。下面是沉淀下来的硬性要求，请在任何改动前后都遵守。

## 一、提审载体 = `dist/` 整包，不只是游戏画面

`pnpm build` 之后，以下内容都会随包提交，**全部在审核扫描范围内**：

| 载体                             | 来源                               | 说明                                               |
| -------------------------------- | ---------------------------------- | -------------------------------------------------- |
| `dist/assets/index-*.js`         | `src/` 构建产物                    | 自动扫描，最常被点名                               |
| `dist/assets/index-*.js.map`     | sourcemap（`vite.config.ts` 开启） | 含全量源码文本，风险同 JS                          |
| `dist/index.html`                | 根 `index.html`                    | title/description/og/twitter/JSON-LD 都算文案      |
| `dist/*.png` / `*.svg` / `*.ico` | `public/`                          | og-cover、favicon、图标；**图内文字会被 OCR 识别** |
| `dist/llms.txt`                  | `public/llms.txt`                  | 同上，纯文本                                       |

因此：**只看游戏里显示了什么是不够的**。任何进入 bundle 的字符串、任何写进图片的像素文字、任何
public/ 下的文本文件，都要按下面的红线检查。

## 二、文案红线

### 2.1 词汇：生命值是「护盾」，不是「血」

- 用：护盾 / 护盾受损 / 护盾击穿 / 挡板 / 砖块 / 球体 / 强化 / 增益。
- 不用：死、杀、血、尸体、武器、弹药、军事、爆头、击杀。
- 已经改过的名字不要改回去：爆裂核心（BLAST CORE）、终末宣告（DECREE）、轨道打击、
  高能球芯、巨型球体、日珥之球。
- 机制通用词可以保留：爆炸、暴击、炮台、弹幕、噩梦、深渊、完美接球、击碎、击败、湮灭砖。

### 2.2 不写夸大 / 绝对化表达

- 禁止：`0MB`、免安装、极致、最强、第一（作为宣传语时）、唯一、绝对、顶级。
- **「0MB」已经踩过两次雷**（promo 封面 → og:description + og-cover 徽章），不要再出现。

### 2.3 不引导站外

- 文案里不写「网页版」「官网」「链接」「点此下载」之类指向站外的表述。
- 引用的域名只保留项目自身（GitHub Pages / 仓库地址）。新增第三方域名（尤其播放/下载/商店页）
  要先确认是否构成站外导流，并记录原因。

### 2.4 四语一起改

界面文案有 `zh / en / ja / ko` 四份（`src/i18n/`）。新增任何文案必须四份齐全，并同样遵守红线。
英文避免 `KILLER / WEAPON / DEATH / BOMB` 一类实词（`dead-center`、`deadeye` 这类构词无碍）。

## 三、图片红线

- 图片里**不要出现文字**，除非确有必要；有必要时，文字同样遵守第二节全部规则（会被 OCR 扫描）。
- `og-cover.png` 不要手改：用 `promo/scripts/make_og_cover.mjs` 从原图重生成
  （原图备份在 `promo/.cover-tmp/`）。
- 新增任何 `public/` 图片或 SVG：先自查是否有站外 logo、二维码、绝对化文案、军事/死亡意象。

## 四、数据表红线（最隐蔽的一类）

**任何"数据表"都会被 bundler 原样打进包**：黑名单、过滤词、测试夹具、字典、示例文本。
2026-11-26 的驳回就是因为昵称屏蔽词表 `src/net/blocklist.ts` 的明文（法轮功、六四、色情、
约炮、nigger、porn、casino……）被原样打进 JS，扫描器无法区分"屏蔽数据"与"展示文案"。

规则：

- 敏感词表**不得以明文出现在 `src/`**。当前做法：编码存储 + 运行时可解码，
  可读母本放在不进包的 `docs/nickname-blocklist.md`。
- 修改词表：编辑 `docs/nickname-blocklist.md` → 运行 `node scripts/encode-blocklist.mjs`
  → `tests/blocklist.test.ts` 会守住两边一致。
- 其它同类数据（成就名、过滤规则、邮件模板、示例姓名）同理：先问"它会不会进 bundle"。

## 五、提审前检查清单

```sh
pnpm build                 # tsc + vite，产出 dist/
pnpm check:package         # 扫描 dist/（JS、map、html、txt、svg）里的敏感词与夸大表达
pnpm test                  # 全量测试，含文案词汇守门
```

三项全绿后，再人工过一遍本次改动涉及的图片（尤其新图）。`check:package` 是最近一次驳回后
新增的，覆盖：

- 政治敏感词（中文）
- 色情 / 毒品 / 赌博 / 极端主义词（中英文）
- 英文 slur
- 夸大表达（0MB 等）

## 六、相关文件索引

| 文件                              | 作用                                                                  |
| --------------------------------- | --------------------------------------------------------------------- |
| `tests/tutorial.test.ts`          | 教程文案的「平台审核词汇」正则守门（禁 死/杀/血/武器/弹药/军事/尸体） |
| `tests/blocklist.test.ts`         | 词表编码与文档母本的一致性守门                                        |
| `docs/nickname-blocklist.md`      | 屏蔽词表的可读母本（不进 dist）                                       |
| `scripts/encode-blocklist.mjs`    | 重新生成编码词表                                                      |
| `scripts/check-package.mjs`       | 发布包敏感词扫描                                                      |
| `promo/scripts/make_og_cover.mjs` | og 封面重生成（勿手改 PNG）                                           |

## 七、改名的连锁点

强化改名时，别只改 `src/game/upgrades/defs.ts`：

- `src/game/starters.ts` 的初始协议 `desc` 会引用强化名
- `src/i18n/*.ts` 四语文案各有对应条目
- 更新日志 `src/i18n/zh.ts` 的 `changelog.versions`（若点名了该强化）

`rg '旧名' src tests` 确认无残留后再构建。
