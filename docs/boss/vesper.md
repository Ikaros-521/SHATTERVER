# 角色类 Boss：薇斯珀，以及一个角色怎么进游戏

第 10 关的 Boss「星炉占星师·薇斯珀」是游戏里第二个角色类 Boss（第一个是第 15 关的
「樱之誓约·绯樱」），也是第一个非机甲形态的。她的美术来自一张 AI 生成的立绘，裁成图层接进游戏。

## 一、一个角色由什么组成

一个角色 = 三样东西，别的代码都不认人：

| 是什么 | 在哪 | 内容 |
| --- | --- | --- |
| 一份战斗定义 | `src/game/<id>.ts`（`CharacterDef`，类型在 `src/game/character.ts`） | 部件与圆盘、重量、护盾与弱点、站在哪、怎么摆、进攻表、对砖块场的手 |
| 一张图层表 | `src/render/boss/<id>/` | 每个部件一层图和它的运动、光晕、受损怎么画 |
| 一段四语台词 | `src/i18n/*.ts` 的 `characterBoss.<id>` | 名字、称号、代号、装甲条与护盾的标注、六句台词 |

战斗状态机 `src/game/characterBoss.ts` 只读定义；渲染层 `src/render/boss/layer.ts` 按 `def.id`
向登记过的来源要图；HUD 与横幅按同一个 id 取文案。所以第三个角色是第三页数字，不是第三场战斗。

## 二、薇斯珀的美术

- **原图不进仓库。** 一张 1664×2496 的 AI 生成立绘（豆包），放在 `art-src/boss/vesper/master.png`
  ——`art-src/` 被 `.gitignore` 挡着（太重，也不是游戏该发布的）。自己留一份。
- **进仓库的是切好的图层**：`src/render/boss/vesper/art/` 下 16 个 WebP（9 个部件层 + 6 张光晕 +
  炉心星核），合计约 0.4 MB。它们只由 `src/app.ts` 引入，所以只进网页版和 Toy 包；微信包是独立入口，不带。
- **原图右下角带「AI 生成」标识。** 游戏资产是从原图裁出的透明图层，纸和标识一起去掉了。
  提审时按平台要求申报 AI 生成内容；要不要在游戏里加一句声明，由项目定。
- **受损态不是图片。** 烘焙图集时现画：整件压暗、金色裂纹从轮廓往里走、轮廓上咬出缺口；
  同一个部件每次画得一样，并且不画到脸上。图集里完好态按全密度、受损态按七成密度烘焙，
  光晕按五分之一（模糊图不需要更细）——图集装不下时 `fitScale` 会自动降密度。
- **脱落的部件留下星尘残影**：着色器把它画成半透明的金色形状，垫在她其余部分之下。
  她是星屑之身，这样散场不像是有人在受伤。

## 三、怎么从原图切出图层（`tools/boss-cut/`）

需要 Python 3.10+ 与 numpy、scipy、Pillow——项目自己的工具链不依赖它们，这三支脚本也不进任何包。

```sh
mkdir -p /tmp/vesper
python tools/boss-cut/matte.py   art-src/boss/vesper/master.png /tmp/vesper/matte.png
python tools/boss-cut/segment.py /tmp/vesper/matte.png /tmp/vesper/parts --overlay
python tools/boss-cut/finalize.py /tmp/vesper/parts src/render/boss/vesper/art
```

1. `matte.py`：抠图。纸是一种颜色，凡是这个颜色并连到画面边缘的都是纸；被发丝围住的纸屑
   （够大、且不远离画面外）也是纸；纸上的星点是封闭的小块，留。原图纸面的云纹与光晕一并去掉，
   光晕在引擎里另画。右下角的标识先当成纸。
2. `segment.py`：拆层。每个部件从种子点沿自己的颜色漫延，遇到别的颜色或手画的边界线停下；
   前面的部件先认领，后面的部件在前面部件底下多画一段（挪动时不露洞）。帽子压刘海的那条
   金边斜线是照原图量的，换一张图要重新量多边形。
3. `finalize.py`：按预乘 alpha 降到 2.4 像素/单位、压成 WebP，从每层的亮处生成光晕，画出星核，
   并写出 `src/render/boss/vesper/layout.ts`（每张图在人物坐标系里的位置）。**`layout.ts` 是生成物，不要手改。**

`segment.py --overlay` 会在输出目录的上一级留两张检查图：`segments.png`（各部件着色）与
`torn.png`（各层朝不同方向错开十像素，看接缝处露不露洞）。

## 四、数值在哪里调

| 要调什么 | 在哪 |
| --- | --- |
| 部件的位置、大小、耐打、重量 | `src/game/vesper.ts` 的 `parts` |
| 进攻节奏（按阶段）与进攻表 | 同上，`attackCd`、`attacks` |
| 回炉（往砖块场倒砖）的间隔与位置 | 同上，`reforge` |
| 站位、摆动、整体大小 | 同上，`x` / `y` / `swayX` / `figure` |
| 各层的运动、光晕、裂纹、场上的光 | `src/render/boss/vesper/sheet.ts` |
| 台词与名字 | `src/i18n/{zh,en,ja,ko}.ts` 的 `characterBoss.vesper` |

这些数值都是首版拍的，等实打过后再调。

## 五、再加一个角色

1. 出图并切层（同第三节的管线，或像绯樱那样用 Canvas 直绘 / 图组），放到 `src/render/boss/<id>/`。
2. `src/game/<id>.ts` 写一份 `CharacterDef`：部件的重量加起来是 1；`core` 与 `shield` 没有就写 `null`。
3. 在 `src/game/characterBoss.ts` 的 `CAST` 里按 Boss 槽位登记（第 5、10、15 关各一个槽）。
4. 写图层表：一个部件一层（`ghost: true` 可留残影），光晕层的 `part` 为 `null`、随部件熄灭。
5. `src/app.ts` 里 `boss.register(<id>, …)`，图片类的要预载。
6. 四语各加一段 `characterBoss.<id>`——**守 `AGENTS.md` 第二节的每一条红线**。
7. 测试照着 `tests/vesper.test.ts`（战斗与接线）与 `tests/boss-vesper.test.ts`（图层表）写。

调试图：`__shatterverse.character()` 读她各部件的状态与图集情况；传一张「部件 → 状态」的表可以
直接把她摆成指定样子，配 `__shatterverse.freeze(true)` 截图。

## 六、相关的守门

- `tests/character-boss.test.ts`、`tests/character-fight.test.ts`：绯樱的战斗与接线。
- `tests/vesper.test.ts`、`tests/boss-vesper.test.ts`：薇斯珀的战斗、接线、台词与图层表。
- 实机上着色器编译失败只有真 GPU 能抓到——`__shatterverse.errors` 应当为空。
