# boss-cut：把一张立绘切成角色 Boss 的图层

把 `art-src/boss/<id>/master.png` 那样的一张白底立绘，切成游戏能用的透明图层
（`src/render/boss/<id>/art/*.webp`）与它的布局（`layout.ts`）。

需要 Python 3.10+ 与 numpy、scipy、Pillow。项目自己的工具链不依赖它们，这些脚本也不进任何包。
用法、每一步在做什么、以及怎么再加一个角色：见 `docs/boss/vesper.md`。

```sh
python tools/boss-cut/matte.py   <原图.png> <抠好的.png>
python tools/boss-cut/segment.py <抠好的.png> <输出目录> --overlay
python tools/boss-cut/finalize.py <输出目录> src/render/boss/<id>/art
```

`segment.py` 里的多边形是照薇斯珀那张原图量的像素坐标，换一张图要重新量。
`finalize.py` 末尾写出的 `layout.ts` 是生成物，不要手改。
