# Split a turnaround sheet (front, side, back) into three aligned RGBA cutouts.
import os, sys, numpy as np, cv2
from rembg import remove, new_session
D = os.path.dirname(os.path.abspath(__file__))
src, name = sys.argv[1], sys.argv[2]
im = cv2.imread(src)
rgb = cv2.cvtColor(im, cv2.COLOR_BGR2RGB)
a = remove(rgb, session=new_session('birefnet-general'), post_process_mask=True)[..., 3]
m = (a > 128).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(m)
comps = sorted([i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] > 20000], key=lambda i: st[i, cv2.CC_STAT_LEFT])
assert len(comps) == 3, [st[i] for i in range(1, n)]
out = {}
for view, i in zip(['front', 'side', 'back'], comps):
    x, y, w, h, _ = st[i]
    keep = (lab == i)
    # small pieces near this figure (strands of hair etc.) join it
    for j in range(1, n):
        if j != i and st[j, cv2.CC_STAT_AREA] < 20000:
            cx = st[j, cv2.CC_STAT_LEFT] + st[j, cv2.CC_STAT_WIDTH] / 2
            if x - 20 < cx < x + w + 20: keep |= lab == j
    al = np.where(keep, a, 0)
    ys, xs = np.nonzero(al > 128)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    pad = 16
    crop = np.dstack([im, al])[max(0, y0 - pad):y1 + pad + 1, max(0, x0 - pad):x1 + pad + 1]
    cv2.imwrite(os.path.join(D, f'{name}_{view}.png'), crop)
    out[view] = (int(x0), int(y0), int(x1), int(y1))
print(out)
