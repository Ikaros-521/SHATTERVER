# 微信小游戏 · 云开发全服榜设计稿

> 状态:设计定稿,客户端通道(`src/net/wechatchannel.ts`)已落地并带测试;云函数参考实现在
> `wechat/cloudfunctions/board/`。UI(canvas 化)与构建线(`vite.wechat.config.ts`)属后续阶段。

## 为什么是云开发,而不是别的

- **免备案域名**:`wx.cloud.callFunction` 走微信内部通道,不占用 request 合法域名白名单。
  自建后端被「HTTPS + ICP 备案 + 备案主体与小程序主体一致」卡死;cheddaboards
  (`api.cheddaboards.com`,境外、无备案)同样进不了白名单——**复用 chedda 通道这条路是死的**,
  开发者工具里「不校验合法域名」只对开发期有效。
- **零成本起步**:每账号 1 个免费云环境(2025-02 起),免费环境每账号仅一个,留给本游戏。
  超配额后最低套餐 19.9 元/月;真到那一步说明游戏火了。
- **身份免交互**:云函数端 `cloud.getWXContext().OPENID` 静默取 openid,无登录弹窗。
  昵称不走 `wx.getUserProfile`(已收紧,多返回灰头像)——**玩家手动输入**,复用现有
  屏蔽词表机制。

## 总体形态

三通道并存,`net/leaderboard.ts` 的通道抽象不变:

| 端 | 通道 | 后端 |
| --- | --- | --- |
| 网页版 | `Cloud`(chedda) | CheddaBoards |
| B站 Toy | `ToyChannel` | 平行榜(TToy SDK) |
| 微信 | `WeChatChannel`(本稿) | 微信云开发 |

`__WECHAT__` 编译期开关(与 `__TOY__` 同构):web/toy 构建里为 `false`,WeChatChannel 与
wxstorage 适配器被 tree-shake 掉,包里无 `wx.` 引用;微信构建里为 `true`,chedda 客户端同理被剥掉。

## 云函数契约(单函数 `board`)

一个云函数,按 `data.action` 分发。返回值永远 `{ok:true,...}` 或 `{ok:false,reason}`,客户端
据此映射到既有四语文案,**不新增 i18n key**。

### `submit`(一局一次,一个调用)

请求:`{action:'submit', score:number, streak:number, mode:'campaign'|'endless', difficulty:string}`
响应:`{ok:true, rank:number, total:number}` / `{ok:false, reason:'rate-limited'|'invalid'}`

服务端做:

1. `score` 收敛为 `0..1e15` 整数,`streak` 同理非负——**不做真实性校验**(见「防刷」)。
2. 限频:同一 openid 距上次提交 `< 2s` 直接拒绝(一次 finishRun 只有一次调用,正常游玩撞不上)。
3. 窗口写入:overall 板写 `all` / 本周 / 今日 三个窗口;mode 板(campaign/endless)与
   difficulty=abyss 的 abyss 板只写 `all` 窗口。全部 **keep-best**:仅当分数更高才更新。
4. 返回 overall/all 窗口的 `(rank, total)`。

**分数不做 16M 压缩**:云开发是自建库,没有 Toy 平台的 1670 万上限,原始分数直接存。
`clampToyScore/decompressToyScore` 仅属于 Toy 通道。

### `list`

请求:`{action:'list', board:'overall'|'endless'|'campaign'|'abyss', window:'all'|'week'|'day', limit:number}`
响应:`{ok:true, entries:[{nickname,score,streak,rank}], total}`

`window` 由服务端时钟推导周/日边界(客户端钟不可信)。`limit` 服务端钳到 `1..50`。

### `myRank`

请求:`{action:'myRank', board:'overall', window:'all'}`
响应:`{ok:true, ranked:boolean, rank:number, score:number, total}`

### `rename`

请求:`{action:'rename', nickname:string}`
响应:`{ok:true, nickname:string}` / `{ok:false, reason:'invalid'}`

服务端仅做最小收敛(trim、去控制字符、截 12 字);**内容过滤在客户端**(编码词表,见「审核红线」)。
可选升级:接 `security.msgSecCheck` 做服务端文本检测——消耗额外配额,P1 不做。

## 数据模型

集合 `boards`,一个文档 = 一个玩家在一个榜一个窗口的历史最佳:

```
{ _openid, board, window, nick, score, streak, at }
```

- `window ∈ {'all', '2026-W48', '2026-11-26'}`(ISO 周 / 自然日,服务端推导)
- 唯一性由「查后写」维持(openid+board+window 查到即 update,否则 add);并发重复顶多
  多写一条,keep-best 读序不受影响。
- 索引(控制台建):`board + window + score(倒序)` 复合索引——list 与 rank 都吃它。
- 文档量估算:活跃玩家每贡献 ~2 文档/日(日窗+可能的周窗/总榜),免费额度内的量级。
  日/周窗口的过期文档可后续用定时触发器清理,P1 先留着(读查询按 window 过滤,不膨胀结果)。

## 配额账(免费环境,粗算)

| 动作 | 消耗 |
| --- | --- |
| 一局结束 | 1 次云函数调用 + ~3-5 次写 + 1 次 count 读 |
| 打开榜单 | 每个打开的 tab:1 调用 + 1 读;30s 客户端缓存(TTL 与另两通道一致) |

## 防刷(V1 的诚实边界)

- 做了:openid 身份(服务端取,不可伪造)、2s 限频、keep-best(刷分无收益叠加)、
  分数/streak 类型与量程收敛。
- 没做:分数真实性对账(时长/砖数 vs 分数)。理由:自建库、榜无奖励挂钩、刷榜收益仅为虚名;
  深无尽合法分数可达 1e10,任何朴素上限都会误杀真玩家。若日后发现刷分,升级路径:
  客户端把 `time/bricks/kills` 随 submit 附上,服务端按 `SCORE_BRICK_CAP × bricks` 量级做软标记(不拒收,只标记)。

## 审核红线(承接 AGENTS.md)

- **屏蔽词表不得明文进包**:微信提审包与 B站同理会被扫描。沿用编码存储机制
  (`scripts/encode-blocklist.mjs`);云函数目录(`wechat/`)同样不放明文词表——内容过滤在客户端。
- 昵称支持中文后的词表缺口:现有词表是 ASCII 词(B站 Toy 通道昵称是平台昵称,不需要我们过滤)。
  中文辱骂/敏感词的补充**走同一编码机制**,改 `docs/nickname-blocklist.md` 母本再重生成。
  这是 P1 上线前必须补的一项(见「未决」)。
- 无站外导流、无二维码、绝对化用语——检查清单与 `check:package` 精神一致,后续微信构建线
  复用同一扫描脚本。
- 广告(流量主)属 P2:接激励视频前必须先修订 SNCL License(禁盈利条款),且不得强制看广告
  解锁核心功能。

## 未决 / 后续

1. **中文屏蔽词补充**(P1 必须,机制现成)。
2. canvas UI:昵称输入、榜单页、提交流程的 canvas 化——`Leaderboard` 接口已就绪,UI 分支需把
   `kind === 'wechat'` 纳入昵称输入路径(同 chedda)。
3. `vite.wechat.config.ts` 构建线 + `game.json/game.js` 入口 + 真机联调。
4. msgSecCheck 服务端昵称检测(可选)。
5. 过期窗口文档的定时清理(可选)。

## 部署步骤(首次)

1. mp 后台开通云开发,建环境(免费环境仅 1 个);把环境 ID 填进构建变量 `VITE_WX_CLOUD_ENV`
   (不填则用默认环境)。
2. 控制台建集合 `boards` 与复合索引 `board+window+score(倒序)`。
3. 用微信开发者工具上传 `wechat/cloudfunctions/board`(云函数依赖 `wx-server-sdk`,
   属服务端部署物,不算游戏运行时依赖;游戏本身依旧零 npm 依赖)。
4. 权限:`boards` 设为「仅创建者可读写」(云函数走管理端绕过规则,客户端不可直读)。
