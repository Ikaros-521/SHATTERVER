# boss-cut：把一张立绘变成角色 Boss 的美术

`stages.py` 把一组「每个阶段一张」的立绘变成游戏能用的东西（`src/render/boss/<id>/`）：
对齐好的 WebP、光晕、打击区表（`layout.ts`）和加载页（`art.ts`）。

需要 Python 3.10+ 与 numpy、scipy、Pillow。项目自己的工具链不依赖它们，这些脚本也不进任何包。
用法、每一步在做什么、以及怎么再加一个角色：见 `docs/boss/stages.md`。

```sh
# 一个文件夹的透明 PNG（1.png、2.png……），或一张没切开的拼图
python tools/boss-cut/stages.py <文件夹或拼图> src/render/boss/<id> --id <id> --preview /tmp/<id>
```

`paper.py` 是它用的抠图模块（拼图模式下把人物从纸上取下来）。
`layout.ts` 与 `art.ts` 是生成物，不要手改。
