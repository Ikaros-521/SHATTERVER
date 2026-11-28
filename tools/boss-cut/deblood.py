"""deblood.py FILE [FILE…] — recolor blood-red pixels in boss stage art toward the costume violet.

Platform review rejects packages whose imagery shows blood (2026-11-28: the Vesper stage art was
named in the rejection). The stage art ships inside the game package, so blood stains in the
source illustrations cannot go out as-is.

What counts as blood here: pixels whose hue sits in the red band (328°..15°) — dark ones from a
saturation of 0.14 up, bright ones (hair-highlight luminance) only from 0.30 so the silver hair's
warm sheen survives — plus dark maroon (hue 15°..30°, value ≤ 0.50), which is where dried blood
actually sits. The costume is navy-violet, the eyes and lantern orange (hue 18°..45°, bright) —
all outside the bands. Recoloured pixels keep their luminance, take the costume's violet hue, and
lose part of their saturation, so streaks read as bruises/shadow rather than being erased.

Run it on every stage webp after `stages.py` (it is invoked automatically at the end of that
script; this file is also usable standalone):

    python tools/boss-cut/deblood.py src/render/boss/vesper/art/stage-*.webp
"""
import sys

import numpy as np
from PIL import Image

# Blood band, in degrees. Orange (eyes, lantern, embers) lives at 18..45 and is left alone.
HUE_LOW = 328.0
HUE_HIGH = 15.0
SAT_MIN = 0.14
# Bright pixels (V >= VAL_BRIGHT) are hair highlights / warm silver sheen, whose low-saturation
# pink tint must survive; only strongly saturated red up there is blood spatter.
VAL_BRIGHT = 0.55
SAT_BRIGHT = 0.30
VAL_MIN = 0.08
# Dark maroon blood sits at hue 12..30 too, but darker than any bright orange: recolour that
# overlap band only where the pixel is dark, so eyes/lantern/skin highlights survive.
HUE2_LOW = 15.0
HUE2_HIGH = 30.0
SAT2_MIN = 0.25
VAL2_MAX = 0.50
# What blood turns into: the costume's violet, muted.
TARGET_HUE = 248.0
SAT_KEEP = 0.55  # blood keeps this share of its saturation


def rgb_to_hsv(rgb):
    rgb = rgb.astype(np.float32) / 255.0
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    v = mx
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.select(
        [d == 0, mx == r, mx == g, mx == b],
        [np.zeros_like(mx), ((g - b) / np.maximum(d, 1e-6)) % 6, (b - r) / np.maximum(d, 1e-6) + 2, (r - g) / np.maximum(d, 1e-6) + 4],
    ) * 60.0
    return h, s, v


def hsv_to_rgb(h, s, v):
    h = (h % 360) / 60.0
    i = np.floor(h).astype(int) % 6
    f = h - np.floor(h)
    p = v * (1 - s)
    q = v * (1 - s * f)
    t = v * (1 - s * (1 - f))
    r = np.select([i == 0, i == 1, i == 2, i == 3, i == 4, i == 5], [v, q, p, p, t, v])
    g = np.select([i == 0, i == 1, i == 2, i == 3, i == 4, i == 5], [t, v, v, q, p, p])
    b = np.select([i == 0, i == 1, i == 2, i == 3, i == 4, i == 5], [p, p, t, v, v, q])
    return np.stack([r, g, b], -1)


def deblood(path, quality=86):
    im = Image.open(path).convert('RGBA')
    rgba = np.asarray(im).astype(np.float32)
    h, s, v = rgb_to_hsv(rgba[..., :3])
    in_band = (h >= HUE_LOW) | (h <= HUE_HIGH)
    band_sat = np.where(v >= VAL_BRIGHT, SAT_BRIGHT, SAT_MIN)
    dark_maroon = (h >= HUE2_LOW) & (h <= HUE2_HIGH) & (s >= SAT2_MIN) & (v <= VAL2_MAX)
    blood = (in_band & (s >= band_sat) & (v >= VAL_MIN)) | dark_maroon
    if blood.any():
        new_h = np.where(blood, TARGET_HUE, h)
        new_s = np.where(blood, np.minimum(s * SAT_KEEP, 0.5), s)
        rgb = hsv_to_rgb(new_h, new_s, v)
        rgba[..., :3] = rgb * 255.0
    out = Image.fromarray(rgba.clip(0, 255).astype(np.uint8), 'RGBA')
    out.save(path, quality=quality)
    return int(blood.sum())


def main(argv):
    for path in argv[1:]:
        n = deblood(path)
        print(f'{path}: recoloured {n} px')


if __name__ == '__main__':
    main(sys.argv)
