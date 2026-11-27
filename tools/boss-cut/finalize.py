"""finalize.py PARTS_DIR OUT_DIR — finish her layers for the game.

The layers come off `segment.py` at four pixels to a figure unit; the game's atlas takes two and a
half, so they are brought down to that in premultiplied space (a filtered edge then carries no
paper white). Her glow is made here too — the light her lantern, her cauldron and the molten seams
of her cloth throw — from the bright of each layer, blurred, as a picture of its own; and the star
core that hangs where her cauldron was once the cauldron is torn off. Last, a TypeScript page with
where every picture lies, in figure units about her neck.
"""
import json
import os
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

PARTS, OUT = sys.argv[1], sys.argv[2]
K_IN, K_OUT = 4.0, 2.4
S = K_OUT / K_IN
os.makedirs(OUT, exist_ok=True)
meta = json.load(open(os.path.join(PARTS, 'parts.json')))
ANCHOR = meta['anchor']


def load(name):
    return np.asarray(Image.open(os.path.join(PARTS, name + '.png')).convert('RGBA')).astype(np.float32) / 255


def resample(rgba, s):
    """Rescaled in premultiplied space, and back again."""
    a = rgba[..., 3:4]
    pm = np.dstack([rgba[..., :3] * a, a])
    h, w = pm.shape[:2]
    channels = [
        np.asarray(Image.fromarray(pm[..., c].astype(np.float32)).resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS))
        for c in range(4)
    ]
    pm = np.dstack(channels)
    a = pm[..., 3:4]
    rgb = np.where(a > 1e-5, pm[..., :3] / np.maximum(a, 1e-5), 0)
    return np.dstack([np.clip(rgb, 0, 1), np.clip(a, 0, 1)])


def save(rgba, name, quality=90):
    im = Image.fromarray((rgba * 255 + 0.5).astype(np.uint8))
    path = os.path.join(OUT, name + '.webp')
    im.save(path, 'WEBP', quality=quality, method=6)
    return im.size, os.path.getsize(path)


# How far each layer's light carries, and how strong: the lantern lights the air around it, the
# seams of her cloth only smoulder.
GLOW = {'lantern': (26, 0.95), 'cauldron': (22, 0.7), 'hat': (18, 0.42), 'robe': (16, 0.2),
        'sleeve.L': (16, 0.2), 'sleeve.R': (16, 0.2)}

layout = {'pxPerUnit': K_OUT, 'anchor': ANCHOR, 'layers': {}, 'glows': {}}
total = 0
for name, part in meta['parts'].items():
    box = part['box']
    x0 = int(round(box[0] * K_IN + ANCHOR[0]))
    y0 = int(round(box[1] * K_IN + ANCHOR[1]))
    w, h = part['px']
    # A few pixels of air on each side, so that nothing she hangs in front of shows a cut edge.
    pad = 3
    src = load(name)
    h, w = src.shape[:2]
    crop = np.zeros((h + 2 * pad, w + 2 * pad, 4), np.float32)
    crop[pad:pad + h, pad:pad + w] = src
    out = resample(crop, S)
    size, nbytes = save(out, name)
    total += nbytes
    # The picture's box in figure units, padding and all: the quad is drawn to this.
    bx0 = (x0 - pad - ANCHOR[0]) / K_IN
    by0 = (y0 - pad - ANCHOR[1]) / K_IN
    layout['layers'][name] = {
        'z': part['z'],
        'box': [bx0, by0, bx0 + out.shape[1] / K_OUT, by0 + out.shape[0] / K_OUT],
    }
    print('%-9s %4dx%-4d %6d B' % (name, size[0], size[1], nbytes))

    if name in GLOW:
        sigma, strength = GLOW[name]
        rgb, a = out[..., :3], out[..., 3]
        lum = rgb.mean(axis=2)
        # Her light: what is bright and warm — gold, amber, the white heart of the lamp.
        warm = np.clip((rgb[..., 0] - rgb[..., 2]) / 70.0, 0, 1)
        light = np.clip((lum - 0.55) / 0.35, 0, 1) * (0.35 + 0.65 * warm) * a
        colour = (rgb * light[..., None]).sum(axis=(0, 1)) / max(light.sum(), 1e-6)
        reach = int(sigma * 3)
        pad_g = reach + 4
        big = np.zeros((out.shape[0] + 2 * pad_g, out.shape[1] + 2 * pad_g, 4), np.float32)
        big[pad_g:pad_g + out.shape[0], pad_g:pad_g + out.shape[1]] = out
        light_big = np.zeros(big.shape[:2], np.float32)
        light_big[pad_g:pad_g + out.shape[0], pad_g:pad_g + out.shape[1]] = light
        halo = ndi.gaussian_filter(light_big, sigma) * strength * 2.2
        halo = np.clip(halo, 0, 0.9)
        glow = np.dstack([np.tile(colour, big.shape[:2] + (1,)), halo[..., None]])
        size, nbytes = save(glow, 'glow-' + name, quality=70)
        total += nbytes
        lb = layout['layers'][name]['box']
        g = pad_g / K_OUT
        layout['glows'][name] = {'box': [lb[0] - g, lb[1] - g, lb[2] + g, lb[3] + g]}
        print('  glow    %4dx%-4d %6d B  colour %s' % (size[0], size[1], nbytes, (colour * 255).astype(int).tolist()))

# Her core: the star stuff the cauldron held, left hanging where it stood once the cauldron is
# gone. A hard bright heart, a four-point flare, a ring of swirl and a few loose sparks.
N = 160
CORE_HALF = 16  # figure units: the star hangs as wide as the cauldron's belly
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
cx = cy = (N - 1) / 2
dx, dy = xx - cx, yy - cy
r = np.hypot(dx, dy) / (N / 2)
th = np.arctan2(dy, dx)
heart = np.clip(1 - r / 0.2, 0, 1) ** 0.35
ball = np.clip(1 - r / 0.5, 0, 1) ** 1.8
flare = (np.clip(1 - np.abs(dx) / (N / 2), 0, 1) ** 16 * np.clip(1 - np.abs(dy) / 3.2, 0, 1)
         + np.clip(1 - np.abs(dy) / (N / 2), 0, 1) ** 16 * np.clip(1 - np.abs(dx) / 3.2, 0, 1))
tilt = th + np.pi / 4
cross = (np.clip(1 - np.abs(np.cos(tilt) * r) / 0.012, 0, 1) * np.clip(1 - np.abs(np.sin(tilt) * r) / 0.34, 0, 1)
         + np.clip(1 - np.abs(np.sin(tilt) * r) / 0.012, 0, 1) * np.clip(1 - np.abs(np.cos(tilt) * r) / 0.34, 0, 1))
swirl = np.clip(1 - np.abs(r - 0.56 - 0.05 * np.sin(3 * th)) / 0.035, 0, 1) * np.clip(1 - r / 0.9, 0, 1)
spark = np.zeros_like(r)
for angle, reach, size in ((0.4, 0.74, 0.035), (2.1, 0.8, 0.028), (3.9, 0.7, 0.03), (5.3, 0.82, 0.024)):
    spark += np.clip(1 - np.hypot(dx - np.cos(angle) * reach * N / 2, dy - np.sin(angle) * reach * N / 2) / (size * N / 2), 0, 1)
a = np.clip(heart + 0.5 * ball + 0.95 * flare + 0.55 * cross + 0.6 * swirl + spark, 0, 1)
gold = np.array([1.0, 0.6, 0.16], np.float32)
cream = np.array([1.0, 0.97, 0.86], np.float32)
mix = np.clip(heart + 0.8 * flare + 0.7 * cross + spark, 0, 1)[..., None]
core = np.dstack([gold * (1 - mix) + cream * mix, a])
size, nbytes = save(core, 'core')
total += nbytes
layout['core'] = {'box': [-CORE_HALF, -CORE_HALF, CORE_HALF, CORE_HALF], 'centre': None}
print('core      %4dx%-4d %6d B' % (size[0], size[1], nbytes))
print('total %d B (%.2f MB)' % (total, total / 1048576))

# The cauldron's middle in figure units, for where the core hangs: the middle of its own box is
# its handle's as much as its belly, so it is a little below that.
cb = layout['layers']['cauldron']['box']
layout['core']['centre'] = [(cb[0] + cb[2]) / 2, (cb[1] + cb[3]) / 2 + 6]

json.dump(layout, open(os.path.join(OUT, 'layout.json'), 'w'), indent=1)


def num(v):
    return ('%.4f' % v).rstrip('0').rstrip('.') if abs(v) >= 1e-4 else '0'


def box(b):
    return '[' + ', '.join(num(v) for v in b) + ']'


order = sorted(layout['layers'], key=lambda n: layout['layers'][n]['z'])
lines = ['/**', ' * Where every picture of Vesper lies, in figure units about her neck — the origin of her',
         ' * figure. Generated from her master art by the cut (`docs/boss/vesper.md` tells how); do not',
         ' * edit by hand, edit the cut and run it again.', ' */', '',
         '/** [left, top, right, bottom] of each layer\'s picture, back to front. */',
         'export const VESPER_LAYERS: Readonly<Record<string, readonly [number, number, number, number]>> = {']
for n in order:
    lines.append('  %s: %s,' % (n.replace('.', '_').replace('-', '_'), box(layout['layers'][n]['box'])))
lines += ['};', '', '/** The light each layer throws: its picture\'s box, about the same origin. */',
          'export const VESPER_GLOWS: Readonly<Record<string, readonly [number, number, number, number]>> = {']
for n in order:
    if n in layout['glows']:
        lines.append('  %s: %s,' % (n.replace('.', '_'), box(layout['glows'][n]['box'])))
lines += ['};', '', '/** Her star core: its picture\'s box, and where its middle hangs. */',
          'export const VESPER_CORE = { box: %s, at: [%s, %s] } as const;' % (
              box(layout['core']['box']), num(layout['core']['centre'][0]), num(layout['core']['centre'][1])),
          '']
open(os.path.join(OUT, 'layout.ts'), 'w', encoding='utf-8', newline='\n').write('\n'.join(lines))
print('wrote layout.ts')
