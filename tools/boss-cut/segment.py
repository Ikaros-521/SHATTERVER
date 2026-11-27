"""segment.py MATTE OUTDIR [--overlay] — cut the matte into her parts, frontmost first.

A part is grown from seeds through the pixels of its own colours, stopped by the picture's own
edges and by an outline drawn where two parts share a colour (a sleeve and the robe are one cloth).
The front part claims first; what no flood claims goes to the nearest part that has one. Every
part is then painted on under the parts in front of it, so that a layer moved a little shows
cloth and not a hole.
"""
import json
import os
import sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

K = 4.0  # source pixels to a figure unit
ANCHOR = (832.0, 648.0)  # the neck, in source pixels: where her figure's origin lies

src = np.asarray(Image.open(sys.argv[1]).convert('RGBA')).astype(np.float32)
H, W, _ = src.shape
rgb, alpha = src[..., :3], src[..., 3] / 255.0
figure = alpha > 0
lum = rgb.mean(axis=2)
R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]

# Dark cloth is navy; a sleeve's tip is a lighter purple, past the most lavender the hair goes.
cloth = (lum < 135) & (B > R + 8)
cloth_light = (B > R + 34) & (lum < 215)
# ...and at its tip it is a dusky wine, told from hair shadow by its stain.
cloth_dark = (lum < 105) & (rgb.max(axis=2) - rgb.min(axis=2) > 22)
gold = (R - B > 70) & (lum > 90)
brown = (R >= B - 4) & (lum < 150)
hairc = (lum >= 60) & (B <= R + 30) & (R - B < 14)
skin = (R - B >= 14) & (R - B <= 70) & (lum >= 120)

blur = ndi.gaussian_filter(lum, 1.2)
gy, gx = np.gradient(blur)
gm = np.hypot(gx, gy)
for c in (0, 2):
    g = ndi.gaussian_filter(rgb[..., c], 1.2)
    gyx = np.gradient(g)
    gm = gm + 0.35 * np.hypot(gyx[1], gyx[0])
barrier = ndi.binary_dilation(gm > 16, iterations=1)


def poly(*shapes):
    """The union of some polygons (each a list of points) and boxes (each four numbers)."""
    im = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(im)
    for shape in shapes:
        if len(shape) == 4 and not isinstance(shape[0], (tuple, list)):
            d.rectangle(shape, fill=255)
        else:
            d.polygon(shape, fill=255)
    return np.asarray(im) > 0


ROBE_L = [(767,704),(790,780),(760,810),(751,900),(756,950),(739,1000),(687,1100),(684,1130),(682,1200),(668,1260),(650,1300),(644,1330),(656,1380),(659,1450),(659,1520),(651,1600),(639,1700),(616,1800),(588,1900),(553,2000),(533,2050),(512,2100)]
ROBE_R = [(918,700),(918,900),(945,950),(953,1000),(996,1100),(1019,1200),(1027,1300),(1021,1380),(1018,1450),(1019,1520),(1026,1600),(1044,1700),(1070,1800),(1099,1900),(1133,2000),(1153,2050),(1174,2100)]
AT_L = ROBE_L.index((644, 1330))
AT_R = ROBE_R.index((1021, 1380))
SLEEVE_L_IN = [(770,705),(770,760),(750,830),(745,860),(732,900),(712,950),(702,1000),(689,1100),(686,1130),(684,1200),(670,1260),(652,1300)] + ROBE_L[AT_L:]
SLEEVE_L_OUT = [(700,700),(690,735),(627,893),(560,987),(520,1000),(453,1100),(419,1200),(442,1300),(459,1380),(443,1450),(409,1520),(362,1600),(320,1700),(299,1800),(286,1900),(326,2000),(352,2036)]
SLEEVE_R_IN = [(980,665),(985,700),(976,900),(993,950),(1000,1000),(1012,1100),(1025,1200),(1046,1300)] + ROBE_R[AT_R:]
SLEEVE_R_OUT = [(975,660),(1010,720),(1050,800),(1090,880),(1105,930),(1160,980),(1225,1050),(1225,1100),(1274,1200),(1251,1300),(1233,1380),(1241,1450),(1279,1520),(1326,1600),(1368,1700),(1396,1800),(1400,1900),(1364,2000),(1336,2036)]

# The hat's outline, with its lower edge drawn where the brim truly meets the hair: the brim's
# gold-trimmed edge runs as one diagonal over the bangs, from the crown down to the left.
HAT = [
    (570,310),(575,250),(590,200),(625,150),(650,120),(700,95),(760,60),(800,45),(840,60),(880,130),(930,230),
    (970,300),(1000,320),(1050,305),(1130,280),(1210,280),(1270,310),(1285,360),(1265,440),(1235,500),(1180,545),
    (1100,580),(1040,560),(1000,520),(976,440),(948,392),
    (920,404),(880,420),(840,436),(800,452),(760,468),(728,492),(720,530),(708,570),(692,610),
    (640,606),(560,592),(480,572),(420,548),(395,522),(400,505),(450,488),(520,458),(600,425),(660,402),
    (700,385),(722,368),(712,340),(695,290),(680,240),(650,205),(610,250),(580,300),
]
LANTERN = [
    [(1194, 858), (1392, 614), (1410, 630), (1214, 878)],                         # the staff
    [(1338, 648), (1366, 606), (1418, 596), (1454, 622), (1456, 676), (1440, 702),  # the hook
     (1420, 700), (1424, 668), (1408, 646), (1384, 652)],
    [(1330, 696), (1504, 696), (1504, 996), (1330, 996)],                          # the lamp
]
CAULDRON_BOX = [(128, 585, 452, 1000)]
# The head with the hair that hangs in front of her shoulders; along the brim it follows the
# hat's own edge, so that no lining of the brim is taken for her.
HEAD = [
    (720,380),(940,380),(948,392),(976,440),(1000,520),(1036,556),(1060,600),(1085,625),(1070,660),
    (1000,700),(990,800),(985,900),(965,935),(935,935),(918,880),(910,800),(905,720),(895,690),(880,655),
    (840,655),(825,690),(835,740),(838,790),(822,810),(795,792),(778,745),(767,700),(755,660),(740,625),
    (730,590),(718,520),(712,440),
]
HEM = [(400,2150),(200,2250),(150,2285),(200,2345),(500,2335),(800,2455),(900,2455),(1100,2335),(1400,2345),(1520,2295),(1450,2245),(1250,2150)]
robe_poly = poly(ROBE_L + HEM + ROBE_R[::-1] + [(900,680),(820,645)])
hair_l_poly = poly([(100,380),(832,380),(832,640),(900,680)] + ROBE_L[::-1] + [(480,2100),(300,2160),(100,1500)])
hair_r_poly = poly([(832,380),(1600,380),(1600,1500),(1420,2160),(1240,2120)] + ROBE_R)

bridge = 5  # how wide a gap in a part's colours the flood steps over: a star, a vein, an outline

# name, z, colours, seeds, region, how far it is painted on under what is in front of it
PARTS = [
    ('hat',      7, cloth | gold | brown, [(800,250),(520,520),(1100,420),(600,300),(483,620),(548,655),(615,642),(1077,598),(1150,543),(1212,480)], poly(HAT, (455,560,650,690), (1055,440,1240,625)), 10),
    ('lantern',  6, brown | gold,        [(1450,860),(1380,860),(1420,800),(1300,750),(1425,640)], poly(*LANTERN), 10),
    ('cauldron', 6, brown | gold,        [(300,800),(240,640),(300,730),(330,700)], poly((128, 585, 452, 1000)), 10),
    ('head',     5, hairc | skin | gold, [(860,600),(820,480),(950,760),(790,700),(1000,560),(800,740),(1060,600)], poly(HEAD), 70),
    ('sleeve.L', 4, cloth | cloth_light | cloth_dark | gold | skin,  [(560,1150),(560,1350),(420,1700),(600,800),(360,1150)], poly(SLEEVE_L_OUT + SLEEVE_L_IN[::-1][1:], (295,1080,432,1222)), 26),
    ('sleeve.R', 4, cloth | cloth_light | cloth_dark | gold | skin,  [(1150,1300),(1200,1650),(1330,1850),(1040,1000),(1100,760),(1280,1160)], poly(SLEEVE_R_OUT + SLEEVE_R_IN[::-1][1:], (1215,1080,1340,1250)), 26),
    ('hair.L',   3, hairc,               [(330,1300),(250,1450),(450,850),(600,820),(680,1000),(640,1380),(500,1780),(400,1900),(560,1750),(500,1850),(440,1960)], hair_l_poly, 36),
    ('hair.R',   3, hairc,               [(1450,1300),(1500,1150),(1150,650),(1050,1080),(1200,1300),(1200,1750),(1420,1250),(1180,1820),(1260,1740),(1330,1830)], hair_r_poly, 36),
    ('robe',     2, cloth | cloth_light | cloth_dark | gold,       [(830,800),(830,1200),(700,2000),(1000,2200),(600,2250),(850,665)], robe_poly, 40),
]

# Under the left of the brim, and at the right of the crown, her hair falls in front of the hat:
# the light strands are hers before the hat floods, and the hat keeps what shows between them.
OVER_HAT = []
names = [p[0] for p in PARTS]
owner = np.zeros((H, W), np.int32)  # 0 = nobody yet, else index into PARTS + 1
light_hair = (lum >= 110) & (B <= R + 30) & (R - B < 14)
for name, zone in OVER_HAT:
    owner[light_hair & figure & poly(zone)] = names.index(name) + 1
for i, (name, z, colours, seeds, region, _) in enumerate(PARTS):
    free = figure & (owner == 0)
    # Strands of hair are drawn with their shadow between them: the hair takes a little more of
    # what lies against it than cloth does.
    if name.startswith(('head', 'hair')):
        near = colours | (ndi.binary_dilation(colours, iterations=3) & ~(gold | skin | brown) & (lum < 150))
    else:
        near = ndi.binary_dilation(colours, iterations=1)
    reach = ndi.binary_dilation(colours, iterations=bridge) & region & free
    lab, n = ndi.label(reach)
    pts_all = np.array(seeds)
    seed_at = lab[pts_all[:, 1], pts_all[:, 0]]
    # A seed a little off its colours takes the nearest piece of them instead of coming to nothing.
    off = seed_at == 0
    if off.any():
        _, idx = ndi.distance_transform_edt(lab == 0, return_indices=True)
        pts = pts_all[off]
        seed_at[off] = lab[idx[0][pts[:, 1], pts[:, 0]], idx[1][pts[:, 1], pts[:, 0]]]
    keep = seed_at[seed_at > 0]
    if len(keep) < len(seeds):
        print('  ! %s: %d of %d seeds reach nothing' % (name, len(seeds) - len(keep), len(seeds)))
    core = np.isin(lab, keep) & near & region & free
    # What a part fences in is its own — the stars on a robe, the light in a lantern — unless it is
    # a broad stretch of something that is no colour of the part's: a collar under a chin.
    holes = ndi.binary_fill_holes(core) & ~core & region & free
    labh, nh = ndi.label(holes)
    if nh:
        hs = ndi.sum(holes, labh, index=np.arange(1, nh + 1))
        own = ndi.sum(near, labh, index=np.arange(1, nh + 1))
        cap = 150 if name == 'head' else 6000
        small = (hs < cap) if name == 'head' else (own > 0.7 * hs) | (hs < cap)
        grown = core | np.isin(labh, np.nonzero(small)[0] + 1)
    else:
        grown = core
    grown &= region & free
    owner[grown] = i + 1
    ys, xs = np.where(grown)
    print('%-9s %7d px  x %4d-%4d y %4d-%4d' % (name, grown.sum(), xs.min(), xs.max(), ys.min(), ys.max()))

rest = figure & (owner == 0)
if rest.any():
    _, idx = ndi.distance_transform_edt(owner == 0, return_indices=True)
    owner[rest] = owner[idx[0][rest], idx[1][rest]]
    print('unclaimed -> nearest: %d px' % rest.sum())

inner = ndi.binary_erosion(figure & (alpha > 0.99), iterations=2)
os.makedirs(sys.argv[2], exist_ok=True)
meta = {'pxPerUnit': K, 'anchor': list(ANCHOR), 'parts': {}}
tint = np.zeros_like(rgb)
palette = [(255,40,40),(255,150,0),(255,230,0),(40,230,90),(0,200,255),(60,90,255),(200,60,255),(255,60,200),(255,255,255)]
for i, (name, z, _, _, region, reach) in enumerate(PARTS):
    mine = owner == i + 1
    # Painted on under everything in front of it.
    under = ndi.binary_dilation(mine, iterations=reach) & figure & ~mine
    src_ok = mine & inner
    _, idx = ndi.distance_transform_edt(~src_ok, return_indices=True)
    out = np.zeros((H, W, 4), np.float32)
    out[mine] = src[mine]
    ext = np.dstack([rgb[idx[0], idx[1]], (alpha[idx[0], idx[1]] * inner[idx[0], idx[1]])[..., None]])
    out[under] = ext[under]
    layer = mine | under
    ys, xs = np.where(layer)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    Image.fromarray(np.clip(out[y0:y1, x0:x1], 0, 255).astype(np.uint8), 'RGBA').save(os.path.join(sys.argv[2], name + '.png'))
    box = [(x0 - ANCHOR[0]) / K, (y0 - ANCHOR[1]) / K, (x1 - ANCHOR[0]) / K, (y1 - ANCHOR[1]) / K]
    meta['parts'][name] = {'z': z, 'box': box, 'px': [int(x1 - x0), int(y1 - y0)], 'own': int(mine.sum())}
    print('%-9s box x %4d-%4d y %4d-%4d  own %d  under %d' % (name, x0, x1, y0, y1, mine.sum(), under.sum()))
    tint[mine] = palette[i % len(palette)]

json.dump(meta, open(os.path.join(sys.argv[2], 'parts.json'), 'w'), indent=1)
if '--overlay' in sys.argv:
    v = rgb.copy()
    m = owner > 0
    v[m] = v[m] * 0.45 + tint[m] * 0.55
    Image.fromarray(np.clip(v, 0, 255).astype(np.uint8)).save(os.path.join(os.path.dirname(sys.argv[2]), 'segments.png'))
    # Torn apart: every part moved a little its own way, on the night sky, to show what shows through.
    bg = np.array([16, 12, 34], np.float32)
    comp = np.tile(bg, (H, W, 1))
    shifts = [(9, -6), (-8, 5), (6, 7), (-5, -9), (10, 4), (-9, -5), (7, -8), (-6, 6), (4, 9)]
    for i in range(len(PARTS) - 1, -1, -1):
        name = PARTS[i][0]
        im = np.asarray(Image.open(os.path.join(sys.argv[2], name + '.png'))).astype(np.float32)
        p = meta['parts'][name]
        x0 = int(round(p['box'][0] * K + ANCHOR[0]))
        y0 = int(round(p['box'][1] * K + ANCHOR[1]))
        dx, dy = shifts[i]
        h, w = im.shape[:2]
        xs0, ys0 = max(0, x0 + dx), max(0, y0 + dy)
        xs1, ys1 = min(W, x0 + dx + w), min(H, y0 + dy + h)
        if xs1 <= xs0 or ys1 <= ys0:
            continue
        sub = im[ys0 - (y0 + dy):ys1 - (y0 + dy), xs0 - (x0 + dx):xs1 - (x0 + dx)]
        a = sub[..., 3:4] / 255
        comp[ys0:ys1, xs0:xs1] = sub[..., :3] * a + comp[ys0:ys1, xs0:xs1] * (1 - a)
    Image.fromarray(np.clip(comp, 0, 255).astype(np.uint8)).save(os.path.join(os.path.dirname(sys.argv[2]), 'torn.png'))
print('done')
