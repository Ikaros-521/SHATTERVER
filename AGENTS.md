# AGENTS.md — 开发要求

本项目《碎界 SHATTERVERSE》发布在 B 站 Toy（哔哩哔哩）平台。**已经因文案与图片内容被驳回四次**，
每次都要求整改后重新提审。下面是沉淀下来的硬性要求，请在任何改动前后都遵守。

## 一、提审包 = `pnpm build:toy` 的产物，不只是游戏画面

提交的必须是 **Toy 合规构建**：

```sh
pnpm build:toy     # tsc + vite（vite.toy.config.ts）+ 剥离站外产物
```

它和普通 `pnpm build` 的区别：

- `__TOY__ = true`：只走平台排行榜通道，**Chedda 客户端被 tree-shake 掉**（包里没有第三方服务与品牌）
- **无 sourcemap**（`.map` 会嵌入全量源码，是巨大的扫描面）
- 删除 `llms.txt` / `robots.txt` / `sitemap.xml` / `og-cover.png`（它们只为站外网页版存在）
- 清除 `index.html` 里的 canonical、og:url、og:image*、twitter:image、JSON-LD 的 url/image/codeRepository

普通 `pnpm build` 仍用于网页版（GitHub Pages），**不要拿它的 dist 提审**。

提审包里仍会被扫描的内容：

| 载体                             | 来源                | 说明                                     |
| -------------------------------- | ------------------- | ---------------------------------------- |
| `dist/assets/index-*.js`         | `src/` 构建产物     | 自动扫描，最常被点名                     |
| `dist/index.html`                | 根 `index.html`     | title/description/关键词都算文案         |
| `dist/*.png` / `*.svg` / `*.ico` | `public/`           | favicon、图标；**图内文字会被 OCR 识别** |
| `dist/assets/*.css`              | `src/ui/styles.css` | 同上，纯文本                             |

因此：**只看游戏里显示了什么是不够的**。任何进入 bundle 的字符串、任何写进图片的像素文字，都要按
下面的红线检查。

## 二、文案红线

### 2.1 词汇：生命值是「护盾」，不是「血」

- 用：护盾 / 护盾受损 / 护盾击穿 / 挡板 / 砖块 / 球体 / 强化 / 增益。
- 不用：死、杀、血、尸体、武器、弹药、军事、爆头、击杀。
- **疾病、毒、血类也要避开**（第五次驳回就是「瘟疫/疫病」）：疾病词改为腐蚀意象（瘟疫传播→腐蚀蔓延、
  疫病→腐蚀扩散），毒改为腐蚀（腐蚀之毒→深度腐蚀、毒爆→腐爆/剧爆），免疫→不受影响/対象外，
  处决→终结（英 executed→cleared、韩 처형→정리），砖块血量→砖块耐久（Brick durability /
  ブロック耐久 / 블록 내구도）。注意「免**疫**」里的疫同样会命中扫描。
- 已经改过的名字不要改回去：爆裂核心（BLAST CORE）、终末宣告（DECREE）、轨道打击、
  高能球芯、巨型球体、日珥之球、腐蚀蔓延、深度腐蚀。
- 机制通用词可以保留：爆炸、暴击、炮台、弹幕、噩梦、深渊、完美接球、击碎、击败、湮灭砖。

### 2.2 不写夸大 / 绝对化表达

- 禁止：`0MB`、免安装、极致、最强、第一（作为宣传语时）、唯一、绝对、顶级。
- **「0MB」已经踩过两次雷**（promo 封面 → og:description + og-cover 徽章），不要再出现。

### 2.3 不引导站外

- 文案里不写「网页版」「官网」「链接」「点此下载」之类指向站外的表述。
- **提审包里不得出现任何站外域名**：既包括项目自己的 GitHub Pages 地址（那是在宣传站外网页版），
  也包括第三方服务（CheddaBoards / `api.cheddaboards.com`）。`pnpm build:toy` 负责剥离前者，
  `__TOY__` 分支负责后者。
- 第三方品牌名（CheddaBoards）不得出现在平台包的任何位置，包括源码注释——sourcemap 已关闭，
  但 JS 与 HTML 里的字符串仍会被扫。
- `pnpm check:package` 会把 `ikaros-521.github.io`、`github.com`、`cheddaboards.com`、
  `cheddaboards` 以及 web-only 文件（`llms.txt`/`robots.txt`/`sitemap.xml`/`og-cover.png`）
  判为失败。

### 2.4 四语一起改

界面文案有 `zh / en / ja / ko` 四份（`src/i18n/`）。新增任何文案必须四份齐全，并同样遵守红线。
英文避免 `KILLER / WEAPON / DEATH / BOMB` 一类实词（`dead-center`、`deadeye` 这类构词无碍）。

## 三、图片红线

- 图片里**不要出现文字**，除非确有必要；有必要时，文字同样遵守第二节全部规则（会被 OCR 扫描）。
- `og-cover.png` 不进提审包（`build:toy` 会删）；网页版需要改它时用
  `promo/scripts/make_og_cover.mjs` 重生成，不要手改 PNG。
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
pnpm build:toy     # tsc + Toy 合规构建，产出可直接打包的 dist/
pnpm check:package # 扫描 dist/：敏感词、夸大表达、站外域名、web-only 产物
pnpm test          # 全量测试，含文案词汇守门
```

三项全绿后，再人工过一遍本次改动涉及的图片（尤其新图），然后 **zip `dist/` 提交**。

`check:package` 覆盖：

- 政治敏感词（中文）
- 色情 / 毒品 / 赌博 / 极端主义词（中英文）
- 英文 slur
- 夸大表达（0MB 等）
- 站外域名（`ikaros-521.github.io` / `github.com` / `cheddaboards.com`）与第三方品牌 `cheddaboards`
- web-only 文件（`llms.txt` / `robots.txt` / `sitemap.xml` / `og-cover.png`）

## 六、相关文件索引

| 文件                              | 作用                                                                  |
| --------------------------------- | --------------------------------------------------------------------- |
| `vite.toy.config.ts`              | Toy 构建（`__TOY__ = true`、无 sourcemap）                            |
| `scripts/build-toy.mjs`           | Toy 包构建 + 剥离站外产物                                             |
| `tests/tutorial.test.ts`          | 教程文案的「平台审核词汇」正则守门（禁 死/杀/血/武器/弹药/军事/尸体） |
| `tests/blocklist.test.ts`         | 词表编码与文档母本的一致性守门                                        |
| `docs/nickname-blocklist.md`      | 屏蔽词表的可读母本（不进 dist）                                       |
| `scripts/encode-blocklist.mjs`    | 重新生成编码词表                                                      |
| `scripts/check-package.mjs`       | 发布包扫描（词表 + 站外 + 夸大表达）                                  |
| `promo/scripts/make_og_cover.mjs` | 网页版 og 封面重生成（勿手改 PNG，不进提审包）                        |

## 七、改名的连锁点

强化改名时，别只改 `src/game/upgrades/defs.ts`：

- `src/game/starters.ts` 的初始协议 `desc` 会引用强化名
- `src/i18n/*.ts` 四语文案各有对应条目
- 更新日志 `src/i18n/zh.ts` 的 `changelog.versions`（若点名了该强化）

`rg '旧名' src tests` 确认无残留后再构建。
