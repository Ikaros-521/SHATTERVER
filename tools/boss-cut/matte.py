"""matte.py IN OUT — cut the figure off its flat, faintly mottled background.

What is the figure is decided by weight, not by place: ink that stands well off the paper colour is
hers, and so is whatever her ink fences in that is no paper — the robe's white stars, the cream of
her face, the lantern's pale heart. Paper is a colour and everything that colour stains: the paper
proper, and the warm or grey tints lying right against it, whether out in the open or fenced in by
hair or by the embers over the cauldron. Only a fleck of it marooned deep inside her — the shine on
the tip of her nose — is hers and stays.

The haze the generator laid around her lights is paper grain and goes with it; her glow is made
again where she is drawn, where it can flicker.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

src = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.float32)
H, W, _ = src.shape
B = np.array([246.0, 244.0, 245.0], np.float32)
d = np.abs(src - B).max(axis=2)
lum = src.mean(axis=2)
# The maker's mark sits bottom right, clear of the hem: it is not part of her.
d[2360:, 1330:] = 0

T_INK, T_PAPER, FLECK, DEEP = 30, 8, 40, 40
ink = d >= T_INK
paperish = ~ink & (lum <= B.mean() + 2)
flat = d < T_PAPER
lab, n = ndi.label(flat)
edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
edge.discard(0)
sizes = ndi.sum(flat, lab, index=np.arange(1, n + 1))
is_outer = np.isin(lab, list(edge))
deep = ndi.distance_transform_edt(~is_outer) >= DEEP
# Paper out in the open; paper fenced in unless it is a fleck marooned deep inside her.
seed = is_outer | (flat & ~is_outer & (np.isin(lab, np.nonzero(sizes >= FLECK)[0] + 1) | ~deep))
paper = ndi.binary_propagation(seed, mask=paperish)
figure = ndi.binary_fill_holes(ink) & ~paper
print('ink %d  paper %d  figure %d  fenced paper %d' % (ink.sum(), paper.sum(), figure.sum(), int((paper & ~is_outer).sum())))

rgb = src.copy()
alpha = np.ones((H, W), np.float32)
alpha[~figure] = 0
inner = ndi.binary_erosion(figure, iterations=2)
ring1 = figure & ~ndi.binary_erosion(figure, iterations=1)
ring2 = ndi.binary_erosion(figure, iterations=1) & ~inner
_, idx = ndi.distance_transform_edt(~inner, return_indices=True)
rgb[~inner] = src[idx[0][~inner], idx[1][~inner]]
alpha[ring1] = 0.55
alpha[ring2] = 0.85

out = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)
Image.fromarray(out).save(sys.argv[2])
bgc = np.array([16, 12, 34], np.float32)
comp = rgb * alpha[..., None] + bgc * (1 - alpha[..., None])
Image.fromarray(np.clip(comp, 0, 255).astype(np.uint8)).save(sys.argv[2].replace('.png', '-dark.png'))
print('saved', sys.argv[2])
