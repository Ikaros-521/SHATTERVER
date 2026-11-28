"""stages.py SHEET OUT --id ID [options] — a boss shown as one whole picture a stage.

The sheet is her drawn once for every stage of the fight, side by side on paper, `--rows` by
`--cols`, in reading order. She is taken off the paper whole; then every stage is told from the
next by what joins up — a figure and whatever hangs about her, a cauldron, a staff, a lamp, are
one piece, and a piece belongs to the cell of the grid its middle falls in. No cut lines: stages
may lean over the line between them.

Each stage is then brought to one scale and one place — her eyes are found (by the orange of
them, or given), and every stage is set so that her eyes fall where they do in all the others —
and cut out to its own bounds, fading out along the bottom where the drawing stops. What the
balls may hit is found too: discs laid over where she is solid, the same discs stage by stage,
each one live only in the stages where it lies on her.

Out comes a picture a stage (WebP), the light each throws, a layout that says where every picture
lies and where her hitboxes are, and the page that loads them.

    python tools/boss-cut/stages.py sheet.png src/render/boss/<id> --id <id>

Figure units: the middle between her eyes is the origin, and her eyes are `--eye-units` apart.
"""
import argparse
import os
import sys
import warnings

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

warnings.filterwarnings('ignore', category=RuntimeWarning)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import paper  # noqa: E402

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('sheet', help="the sheet with every stage on it — or a folder of pictures already cut apart, one a stage, in order")
ap.add_argument('out', help='where her pictures go: src/render/boss/<id> (the art/ folder under it)')
ap.add_argument('--id', required=True, help='what the fight knows her by')
ap.add_argument('--rows', type=int, default=3)
ap.add_argument('--cols', type=int, default=2)
ap.add_argument('--blank', action='append', default=[], help="x0,y0,x1,y1 of paper to clear first: a maker's mark. Again for each")
ap.add_argument('--eyes', default='', help='her eyes where they cannot be found: "x,y;x,y|x,y;x,y|…" a stage, in sheet pixels')
ap.add_argument('--eye-units', type=float, default=20.0)
ap.add_argument('--px', type=float, default=2.4, help='pixels to a figure unit in her pictures')
ap.add_argument('--fade', type=float, default=0.12, help='the share of her height over which she fades out at the bottom')
ap.add_argument('--quality', type=int, default=86)
ap.add_argument('--no-glow', action='store_true')
ap.add_argument('--only', default='', help='stages to keep, counting from 0: "0,1,2,3". All if left out')
ap.add_argument('--max-discs', type=int, default=80, help='the most hitboxes to lay over her; she is covered from her middle outwards')
ap.add_argument('--preview', default='', help='a folder to write preview.png to: every stage on a night sky, with her hitboxes')
args = ap.parse_args()

FOLDER = os.path.isdir(args.sheet)
if FOLDER:
    # Numbered from 1 in reading order; `0` is the sheet they were cut from, if it is kept beside them.
    def order(f):
        stem = os.path.splitext(f)[0]
        return (0, int(stem), '') if stem.isdigit() else (1, 0, stem)

    files = sorted((f for f in os.listdir(args.sheet) if f.lower().endswith(('.png', '.webp')) and not os.path.splitext(f)[0] == '0'), key=order)
    if not files:
        sys.exit('no pictures in %s' % args.sheet)
    args.rows, args.cols = 1, len(files)
src = None if FOLDER else np.asarray(Image.open(args.sheet).convert('RGB')).astype(np.float32)
H, W = (0, 0) if FOLDER else src.shape[:2]
blanks = [tuple(int(v) for v in each.split(',')) for each in args.blank]
keep = [int(v) for v in args.only.split(',')] if args.only else list(range(args.rows * args.cols))
eyes_given = (
    [[tuple(float(v) for v in p.split(',')) for p in stage.split(';')] for stage in args.eyes.split('|')]
    if args.eyes
    else None
)

whole = None
owned = None
if FOLDER:
    cut = []
    for f in files:
        im = Image.open(os.path.join(args.sheet, f)).convert('RGBA')
        arr = np.asarray(im).astype(np.float32) / 255.0
        for x0, y0, x1, y1 in blanks:
            arr[y0:y1, x0:x1, 3] = 0
        cut.append(arr)
    stages_raw = cut
else:
    whole = paper.off_paper(src, blank=blanks) / 255.0
    figure = whole[..., 3] > 0

    # A line drawn on the sheet — a rule under a row, a border — joins up whatever it runs under,
    # and is paper like the rest of it.
    raw, _ = ndi.label(figure)
    for i, slc in enumerate(ndi.find_objects(raw), start=1):
        if slc is None:
            continue
        h_, w_ = slc[0].stop - slc[0].start, slc[1].stop - slc[1].start
        if (h_ <= 5 and w_ >= 0.3 * W) or (w_ <= 5 and h_ >= 0.3 * H):
            figure[slc][raw[slc] == i] = False
            whole[..., 3][slc][raw[slc] == i] = 0

    # What joins up is a stage: grown a little first, so that a charm hanging from a brim by a
    # chain and the sparks about a lamp go with her.
    pieces, count = ndi.label(ndi.binary_dilation(figure, iterations=6))
    index = np.arange(1, count + 1)
    sizes = ndi.sum(figure, pieces, index=index)
    centres = ndi.center_of_mass(figure, pieces, index=index)

    def cell_of(x, y):
        """The cell of the grid a point of the sheet lies in."""
        return min(args.rows - 1, int(y / H * args.rows)) * args.cols + min(args.cols - 1, int(x / W * args.cols))

    owned = [np.zeros((H, W), bool) for _ in range(args.rows * args.cols)]
    dropped = 0
    for lab, size, (cy, cx) in zip(index, sizes, centres):
        # A fleck of nothing — dust in the paper — is nobody's.
        if size < 6:
            dropped += 1
            continue
        owned[cell_of(cx, cy)] |= pieces == lab
    stages_raw = []
    for n in keep:
        ys, xs = np.where(owned[n])
        print('stage %d: x %d..%d  y %d..%d  (%d px)' % (n, xs.min(), xs.max(), ys.min(), ys.max(), int(owned[n].sum())))
        stages_raw.append(whole[ys.min():ys.max() + 1, xs.min():xs.max() + 1] * owned[n][..., None])
    if dropped:
        print("%d flecks too small to be anybody's were left on the paper" % dropped)


def find_eyes(rgb, opaque):
    """
    Her eyes: two patches of the orange of her irises, a face's width apart, something pale between,
    and the nearest such pair to the heart of the figure's upper half — a lamp is as orange as her
    eyes, and hangs off to one side.
    """
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = rgb.mean(axis=2)
    iris = (r > 190) & (g > 95) & (g < 205) & (b < 95) & (r - b > 130) & (r - g > 35) & (r - g < 120) & (lum < 225)
    lab, n = ndi.label(ndi.binary_closing(iris, iterations=2))
    index = np.arange(1, n + 1)
    sizes = ndi.sum(iris, lab, index=index)
    centres = ndi.center_of_mass(iris, lab, index=index)
    patches = sorted([(int(s), (c[1], c[0])) for s, c in zip(sizes, centres) if s >= 25], reverse=True)[:14]
    # What a face is between the eyes: pale, and faintly coloured at most — her skin in shadow is
    # lavender-grey in these drawings. What a lamp is between two bright patches of itself: yellow.
    pale = (lum >= 118) & (rgb.max(axis=2) - rgb.min(axis=2) <= 70)
    oy, ox = np.where(opaque)
    upper = oy < np.percentile(oy, 50)
    heart = (float(np.median(ox[upper])), float(np.percentile(oy[upper], 25)))
    best = None
    for i, (sa, a) in enumerate(patches):
        for sb, b_ in patches[i + 1:]:
            dx, dy = abs(a[0] - b_[0]), abs(a[1] - b_[1])
            if not (40 <= dx <= 160 and dy <= 45 and max(sa, sb) <= 5 * min(sa, sb)):
                continue
            t = np.linspace(0.2, 0.8, 24)
            across = pale[np.round(a[1] + t * (b_[1] - a[1])).astype(int), np.round(a[0] + t * (b_[0] - a[0])).astype(int)]
            if across.mean() < 0.6:
                continue
            mid = ((a[0] + b_[0]) / 2, (a[1] + b_[1]) / 2)
            score = np.hypot(mid[0] - heart[0], mid[1] - heart[1]) - 0.05 * (sa + sb)
            if best is None or score < best[0]:
                best = (score, a, b_)
    if best is None:
        return None
    a, b_ = best[1], best[2]
    return (a, b_) if a[0] < b_[0] else (b_, a)


stages = []
for k, (n, rgba) in enumerate(zip(keep, stages_raw)):
    opaque = rgba[..., 3] > 0.5
    ys, xs = np.where(opaque)
    rgba = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    opaque = opaque[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    found = find_eyes(rgba[..., :3] * 255, opaque) if eyes_given is None else [(ex - xs.min(), ey - ys.min()) for ex, ey in eyes_given[k]]
    if found is None:
        sys.exit('stage %d: her eyes were not found — give them with --eyes "x,y;x,y|x,y;x,y|…"' % n)
    (ax, ay), (bx, by) = found
    apart = float(np.hypot(bx - ax, by - ay))
    print('stage %d: %dx%d, eyes at (%.0f, %.0f) and (%.0f, %.0f), %.1f px apart' % (n, rgba.shape[1], rgba.shape[0], ax, ay, bx, by, apart))
    stages.append({'n': n, 'rgba': rgba, 'origin': ((ax + bx) / 2, (ay + by) / 2), 'upp': args.eye_units / apart})

# Where each stage lies in the figure, and so where the whole of her does.
for st in stages:
    oy, ox = np.where(st['rgba'][..., 3] > 0.12)
    upp, (mx, my) = st['upp'], st['origin']
    st['box'] = [float(min(ox)) * upp - mx * upp, float(min(oy)) * upp - my * upp, float(max(ox) + 1) * upp - mx * upp, float(max(oy) + 1) * upp - my * upp]
frame = [min(s['box'][0] for s in stages), min(s['box'][1] for s in stages), max(s['box'][2] for s in stages), max(s['box'][3] for s in stages)]
pad = 3.0
fw, fh = frame[2] - frame[0], frame[3] - frame[1]
print('frame: %.0f x %.0f figure units about the middle between her eyes' % (fw, fh))

art = os.path.join(args.out, 'art')
os.makedirs(art, exist_ok=True)


def save(rgba, name, quality):
    im = Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8))
    path = os.path.join(art, name + '.webp')
    im.save(path, 'WEBP', quality=quality, method=6)
    if name.startswith('stage-'):
        # The stage art ships inside the game package, and platform review rejects blood in
        # imagery: recolour blood-red pixels toward the costume violet before they can ship.
        import deblood

        deblood.deblood(path, quality=quality)
    return im.size, os.path.getsize(path)


def faded(rgba, share):
    """Faded out along the bottom: where the drawing stops, she thins into the dark."""
    h = rgba.shape[0]
    v = np.arange(h, dtype=np.float32)
    t = np.clip((v - (1 - share) * h) / max(1.0, share * h), 0, 1)
    ramp = (1 - t * t * (3 - 2 * t))[:, None]
    out = rgba.copy()
    out[..., 3] *= ramp
    return out


# Each stage read out at its own bounds, and — coarsely, a pixel to a unit — over the whole frame,
# to find what the balls may hit.
coarse = []
pictures = []
total = 0
for k, st in enumerate(stages):
    box = [st['box'][0] - pad, st['box'][1] - pad, st['box'][2] + pad, st['box'][3] + pad]
    size = (int(round((box[2] - box[0]) * args.px)), int(round((box[3] - box[1]) * args.px)))
    pic = faded(paper.warp(st['rgba'], args.px, st['origin'], st['upp'], box, size), args.fade)
    (w, h), nbytes = save(pic, 'stage-%d' % k, args.quality)
    total += nbytes
    entry = {'box': box, 'glow': None}
    print('         picture %4dx%-4d %6d B' % (w, h, nbytes))
    if not args.no_glow:
        rgb, a = pic[..., :3], pic[..., 3]
        lum = rgb.mean(axis=2)
        warm = np.clip((rgb[..., 0] - rgb[..., 2]) / 0.28, 0, 1)
        light = np.clip((lum - 0.55) / 0.35, 0, 1) * (0.35 + 0.65 * warm) * a
        if light.max() > 0.05:
            colour = (rgb * light[..., None]).sum(axis=(0, 1)) / max(light.sum(), 1e-6)
            sigma = 0.035 * h
            halo = np.clip(ndi.gaussian_filter(light, sigma) * 1.7, 0, 0.85)
            reach = int(sigma * 3)
            big = np.zeros((h + 2 * reach, w + 2 * reach, 4), np.float32)
            big[reach:reach + h, reach:reach + w, 3] = halo
            big[..., 3] = ndi.gaussian_filter(big[..., 3], sigma * 0.6)
            big[..., :3] = colour
            (gw, gh), nbytes = save(paper.resample(big, 0.3), 'glow-%d' % k, 70)
            total += nbytes
            g = reach / args.px
            entry['glow'] = [box[0] - g, box[1] - g, box[2] + g, box[3] + g]
            print('         light   %4dx%-4d %6d B' % (gw, gh, nbytes))
    pictures.append(entry)
    coarse.append(paper.warp(st['rgba'], 1.0, st['origin'], st['upp'], [frame[0], frame[1], frame[0] + fw, frame[1] + fh], (int(round(fw)) + 1, int(round(fh)) + 1))[..., 3])

# ── hitboxes ──
# A few regions of her, not a carpet of discs: her head (hat and all), her body above the waist,
# her skirt below it, and what hangs to either side of her — a lamp, a staff, a cauldron. Each is
# covered with discs of one size, and each disc is live only in the stages where she is solid
# there, so that where a cauldron was the ball flies once it is gone.
solid = []
for c in coarse:
    s_ = c > 0.5
    lab, n = ndi.label(s_)
    index = np.arange(1, n + 1)
    sizes = ndi.sum(s_, lab, index=index)
    # Sparks and stray bits are not her, as far as a ball is concerned.
    solid.append(np.isin(lab, index[sizes >= 60]))
union = np.any(solid, axis=0)
height = int(round(fh)) + 1
width = int(round(fw)) + 1
# Her waist: where she is narrowest between the bust and the hem, looked for over the middle of her.
rows = union.sum(axis=1)
lo, hi = int(height * 0.42), int(height * 0.72)
waist = lo + int(np.argmin(rows[lo:hi] + 0.0)) if hi > lo else int(height * 0.5)
oy, ox = np.where(union)
mid = float(np.median(ox))
spread = np.percentile(np.abs(ox - mid), 84)

REGIONS = [
    ('head', 0.0, 0.27, 0.0, 2.0),
    ('body', 0.27, (waist / height), 0.0, 1.25),
    ('skirt', (waist / height), 1.0, 0.0, 1.35),
    # `side` says which way of her middle a region lies: -1.0 her left, 1.0 her right.
    ('side.L', 0.2, 0.95, -1.0, 1.0),
    ('side.R', 0.2, 0.95, 1.0, 1.0),
]


def in_region(x, y, top, bottom, side, reach):
    fy = (y - frame[1]) / fh
    if not (top <= fy < bottom):
        return False
    if side == 0.0:
        return abs((x - frame[0]) - mid) <= reach * spread
    return ((x - frame[0]) - mid) * side > reach * spread


radius = float(np.clip(0.075 * fh, 12, 24))
# The share of a disc's area the drawing must cover before a region without a live disc there
# gets one anyway. Tests/vesper.test.ts guards the fight is always finishable; if that guard
# ever fails for a region, lower this or re-cut the picture.
WIDEN_MIN = 0.25
rr = int(np.ceil(radius))
yy, xx = np.mgrid[-rr:rr + 1, -rr:rr + 1]
kernel = ((xx ** 2 + yy ** 2) <= radius ** 2).astype(np.float32)
kernel /= kernel.sum()


def cover(mask):
    return ndi.convolve(mask.astype(np.float32), kernel, mode='constant')


per_stage = [cover(s_) for s_ in solid]
on_union = cover(union)
discs = []
for name, top, bottom, side, reach in REGIONS:
    taken = []
    step = 1.25 * radius
    for y in np.arange(frame[1] + top * fh + radius * 0.6, frame[1] + bottom * fh - radius * 0.3, step):
        row = 0
        for x in np.arange(frame[0] + radius * 0.6, frame[0] + fw - radius * 0.3, step):
            if not in_region(x, y, top, bottom, side, reach):
                continue
            px, py = int(round(x - frame[0])), int(round(y - frame[1]))
            if not (0 <= px < width and 0 <= py < height) or on_union[py, px] < 0.5:
                continue
            mask = 0
            for i, s_ in enumerate(per_stage):
                if s_[py, px] >= 0.4:
                    mask |= 1 << i
            if not mask:
                continue
            # Staggered rows pack better than a grid.
            xx_ = x + (step / 2 if row % 2 else 0)
            discs.append((name, xx_, y, mask))
            row += 1

# A standing region must stay strikable for as long as any picture draws it. The grid spots are
# fixed, but a prop held a little differently in one picture (the lamp, say) can leave the spot a
# disc sits on just uncovered there — and a fight whose last standing region has nothing left to
# strike on the picture showing is a fight with no way on. Where a picture draws a region that
# owns discs but none of them is live there, widen that region's nearest disc to the stage.
for name_, top, bottom, side, reach in REGIONS:
    mine = [i for i, d in enumerate(discs) if d[0] == name_]
    if not mine:
        continue
    for s_, cov in enumerate(per_stage):
        if any(discs[i][3] >> s_ & 1 for i in mine):
            continue
        drawn_here = False
        for y in np.arange(frame[1] + top * fh, frame[1] + bottom * fh, radius):
            if drawn_here:
                break
            for x in np.arange(frame[0], frame[0] + fw, radius):
                if not in_region(x, y, top, bottom, side, reach):
                    continue
                px, py = int(round(x - frame[0])), int(round(y - frame[1]))
                if 0 <= px < width and 0 <= py < height and cov[py, px] >= 0.4:
                    drawn_here = True
                    break
        if not drawn_here:
            continue
        best_i, best_c = None, 0.0
        for i in mine:
            _, x, y, _ = discs[i]
            px, py = int(round(x - frame[0])), int(round(y - frame[1]))
            if 0 <= px < width and 0 <= py < height and cov[py, px] > best_c:
                best_i, best_c = i, float(cov[py, px])
        # A disc is widened only where the drawing genuinely sits under it: below this share the
        # picture merely grazes the region (hair at the edge), and a hitbox widened there would
        # hang in half-empty air — and hand an early stage a target the art does not show.
        if best_c >= WIDEN_MIN:
            nm, x, y, mask = discs[best_i]
            discs[best_i] = (nm, x, y, mask | (1 << s_))
            print('region %s is drawn in picture %d but had no hitbox there — widened its nearest disc (coverage %.2f)' % (name_, s_, best_c))
        elif best_c > 0:
            print('region %s in picture %d: drawing grazes its disc spot only (coverage %.2f) — left unhittable there' % (name_, s_, best_c))
print('hitboxes: ' + ', '.join('%s %d' % (n, sum(1 for d in discs if d[0] == n)) for n, *_ in REGIONS) + ' (%d of radius %.1f units)' % (len(discs), radius))
print('pictures total %d B (%.2f MB)' % (total, total / 1048576))


def num(v):
    return ('%.4f' % v).rstrip('0').rstrip('.') if abs(v) >= 1e-4 else '0'


def seq(values):
    return '[' + ', '.join(num(v) for v in values) + ']'


def quoted(text):
    return "'" + text.replace('\\', '\\\\').replace("'", "\\'") + "'"


name = args.id.upper().replace('-', '_')
layout = '''/**
 * Where every picture of %(id)s lies, in figure units about the middle between her eyes — the
 * origin of her figure. Generated from her stage sheet by `tools/boss-cut/stages.py`; do not edit
 * by hand, run that again.
 */

/** A picture a stage, in order: where it lies, and where the light it throws lies (null: none). */
export const %(NAME)s_STAGES: Readonly<
  Record<number, readonly [readonly [number, number, number, number], readonly [number, number, number, number] | null]>
> = {
%(pictures)s
};

/** What the balls may hit: the region of her, x, y and radius in figure units, and the stages it is live in. */
export const %(NAME)s_DISCS: readonly (readonly [string, number, number, number, readonly number[]])[] = [
%(discs)s
];
''' % {
    'id': args.id,
    'NAME': name,
    'pictures': '\n'.join('  %d: [%s, %s],' % (k, seq(p['box']), seq(p['glow']) if p['glow'] else 'null') for k, p in enumerate(pictures)),
    'discs': chr(10).join('  [%s, %s, %s, %s, [%s]],' % (quoted(nm), num(x), num(y), num(radius), ', '.join(str(k) for k in range(len(stages)) if mask >> k & 1)) for nm, x, y, mask in discs),
}
open(os.path.join(args.out, 'layout.ts'), 'w', encoding='utf-8', newline='\n').write(layout)

imports = ''.join("import stage%d from './art/stage-%d.webp';\n" % (k, k) for k in range(len(stages)))
glow_imports = ''.join("import glow%d from './art/glow-%d.webp';\n" % (k, k) for k in range(len(stages)) if pictures[k]['glow'])
pairs = chr(10).join('  [stage%d, %s],' % (k, ('glow%d' % k) if pictures[k]['glow'] else 'null') for k in range(len(stages)))
art_ts = '''%(imports)s%(glow_imports)simport { loadStagePictures, type StagePicture } from '../stage/sheet';

/**
 * %(id)s's pictures: her stage sheet cut up (`layout.ts` says where each lies). They are fetched
 * when the game opens and are part of the web page's bundle only.
 */
const PICTURES: readonly (readonly [string, string | null])[] = [
%(pairs)s
];

/** Her pictures once fetched and decoded, a stage each; null where one did not come. */
export function load%(NAME)s(): Promise<readonly (StagePicture | null)[]> {
  return loadStagePictures(PICTURES);
}
''' % {'imports': imports, 'glow_imports': glow_imports, 'id': args.id, 'NAME': name, 'pairs': pairs}
open(os.path.join(args.out, 'art.ts'), 'w', encoding='utf-8', newline='\n').write(art_ts)
print('wrote layout.ts and art.ts in %s' % args.out)

# For looking at: every stage on a night sky, in its box, with her hitboxes drawn over.
if args.preview:
    os.makedirs(args.preview, exist_ok=True)
    tiles = []
    for st, p in zip(stages, pictures):
        box = p['box']
        size = (int(round((box[2] - box[0]))), int(round((box[3] - box[1]))))
        pic = faded(paper.warp(st['rgba'], 1.0, st['origin'], st['upp'], box, size), args.fade)
        canvas = np.zeros(pic.shape, np.float32)
        canvas[..., :3] = np.array([16, 12, 34]) / 255
        a = pic[..., 3:4]
        canvas[..., :3] = pic[..., :3] * a + canvas[..., :3] * (1 - a)
        yy, xx = np.mgrid[0:pic.shape[0], 0:pic.shape[1]]
        for _, x, y, mask in discs:
            if not mask >> k & 1:
                continue
            ring = np.abs(np.hypot(xx - (x - box[0]), yy - (y - box[1])) - radius) < 0.5
            canvas[ring, :3] = np.array([0, 1, 1])
        tiles.append(canvas)
    tw = max(t.shape[1] for t in tiles) + 8
    th = max(t.shape[0] for t in tiles) + 8
    cols = 3
    rows = (len(tiles) + cols - 1) // cols
    sheet = np.zeros((rows * th, cols * tw, 3), np.float32)
    for i, t in enumerate(tiles):
        y, x = (i // cols) * th + 4, (i % cols) * tw + 4
        sheet[y:y + t.shape[0], x:x + t.shape[1]] = t[..., :3]
    Image.fromarray((np.clip(sheet, 0, 1) * 255).astype(np.uint8)).save(os.path.join(args.preview, 'preview.png'))
    print('preview: %s' % os.path.join(args.preview, 'preview.png'))
