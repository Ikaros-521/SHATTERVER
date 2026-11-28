"""paper.py — taking a figure off the paper it was drawn on. Shared by the boss-cut scripts.

Paper is a colour, not a place: what is that colour and joined to the edge of the picture is paper,
and so is a large pocket of it fenced in by hair. The picture's own white — a star on a robe, the
shine on a nose — is that colour too, but small, and stays. What paper stains (the warm or grey
haze lying against it, out in the open or fenced in) goes with it; light is made again where the
figure is drawn.
"""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

T_INK, T_PAPER, FLECK, DEEP = 30, 8, 40, 40


def paper_colour(rgb):
    """The colour of the paper: the median of the picture's border."""
    h, w, _ = rgb.shape
    border = np.concatenate([rgb[:12].reshape(-1, 3), rgb[-12:].reshape(-1, 3), rgb[:, :12].reshape(-1, 3), rgb[:, -12:].reshape(-1, 3)])
    return np.median(border, axis=0)


def off_paper(src, paper=None, blank=()):
    """
    `src`: HxWx3 float RGB, 0..255. `blank`: rectangles (x0, y0, x1, y1) to treat as paper first —
    a maker's mark, a caption. Returns float RGBA, 0..255, with the rim recoloured from just inside
    it (so that no half-paper pixel is left to halo the figure on a dark sky) and the colour of
    every clear pixel set to the nearest figure colour (so that filtering never drags paper in).
    """
    h, w, _ = src.shape
    b = paper_colour(src) if paper is None else np.asarray(paper, np.float32)
    d = np.abs(src - b).max(axis=2)
    for x0, y0, x1, y1 in blank:
        d[max(0, y0):y1, max(0, x0):x1] = 0
    lum = src.mean(axis=2)

    ink = d >= T_INK
    paperish = ~ink & (lum <= b.mean() + 2)
    flat = d < T_PAPER
    lab, n = ndi.label(flat)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    edge.discard(0)
    sizes = ndi.sum(flat, lab, index=np.arange(1, n + 1))
    is_outer = np.isin(lab, list(edge))
    deep = ndi.distance_transform_edt(~is_outer) >= DEEP
    # Paper out in the open; paper fenced in, unless it is a fleck marooned deep inside the figure.
    seed = is_outer | (flat & ~is_outer & (np.isin(lab, np.nonzero(sizes >= FLECK)[0] + 1) | ~deep))
    paper_mask = ndi.binary_propagation(seed, mask=paperish)
    figure = ndi.binary_fill_holes(ink) & ~paper_mask

    rgb = src.copy()
    alpha = np.ones((h, w), np.float32)
    alpha[~figure] = 0
    inner = ndi.binary_erosion(figure, iterations=2)
    ring1 = figure & ~ndi.binary_erosion(figure, iterations=1)
    ring2 = ndi.binary_erosion(figure, iterations=1) & ~inner
    _, idx = ndi.distance_transform_edt(~inner, return_indices=True)
    rgb[~inner] = src[idx[0][~inner], idx[1][~inner]]
    alpha[ring1] = 0.55
    alpha[ring2] = 0.85
    return np.dstack([np.clip(rgb, 0, 255), alpha * 255])


def resample(rgba, s):
    """Rescaled by `s` in premultiplied space, and back again: a filtered edge carries no paper."""
    a = rgba[..., 3:4]
    pm = np.dstack([rgba[..., :3] * a, a])
    h, w = pm.shape[:2]
    size = (max(1, round(w * s)), max(1, round(h * s)))
    channels = [np.asarray(Image.fromarray(pm[..., c].astype(np.float32)).resize(size, Image.LANCZOS)) for c in range(4)]
    pm = np.dstack(channels)
    a = pm[..., 3:4]
    rgb = np.where(a > 1e-5, pm[..., :3] / np.maximum(a, 1e-5), 0)
    return np.dstack([np.clip(rgb, 0, 1), np.clip(a, 0, 1)])


def warp(rgba, px_per_unit, origin, units_per_px, box, size):
    """
    A picture drawn in source pixels, read out in figure units: `origin` is where the figure's
    origin lies in the source, `units_per_px` how many figure units a source pixel spans there,
    `box` the [left, top, right, bottom] of the figure the read-out covers, and `size` its
    (width, height) in pixels at `px_per_unit`. In premultiplied space, so edges stay clean.
    """
    a = rgba[..., 3:4]
    pm = np.dstack([rgba[..., :3] * a, a])
    k = 1.0 / (units_per_px * px_per_unit)
    # source x = k * out x + origin_x + box_left / units_per_px
    c = origin[0] + box[0] / units_per_px
    f = origin[1] + box[1] / units_per_px
    out = np.dstack([
        np.asarray(Image.fromarray(pm[..., ch].astype(np.float32)).transform(size, Image.AFFINE, (k, 0, c, 0, k, f), resample=Image.BILINEAR))
        for ch in range(4)
    ])
    a = out[..., 3:4]
    rgb = np.where(a > 1e-5, out[..., :3] / np.maximum(a, 1e-5), 0)
    return np.dstack([np.clip(rgb, 0, 1), np.clip(a, 0, 1)])
