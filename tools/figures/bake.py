# One texture per figure: python bake.py <who>
# The generated texture (<who>_gentex.png, from D:/NovaFig/tex.py: soft, but the same from every side) is the ground; the
# paintings are laid over it wherever a painting faces the surface squarely and could see it (the front painting on the
# front, the back on the back, the profiles on the flanks), and the whole face takes the head sheet's front painting.
# Every point of the surface gets one colour for good, so nothing doubles as you walk round. Writes <who>_baked.png.
import os, sys, json, numpy as np, cv2
from scipy import ndimage
D = os.path.dirname(os.path.abspath(__file__)); name = sys.argv[1]
cfg = json.load(open(os.path.join(D, name + '.json')))
Z = np.load(os.path.join(D, name + '_turn.npz')); U = np.load(os.path.join(D, name + '_uv.npz'))
P, F, cuv = Z['P'].astype(np.float64), Z['F'], U['cuv']; assert (U['F'] == F).all()
gen = cv2.imread(os.path.join(D, name + '_gentex.png')).astype(np.float32); T = gen.shape[0]
atlas = cv2.imread(os.path.join(D, name + '_tex.png')).astype(np.float32); AH, AW = atlas.shape[:2]
hj = os.path.join(D, name + '_head.json'); HM = json.load(open(hj)) if os.path.exists(hj) else None
ss = lambda e0, e1, v: (lambda t: t * t * (3 - 2 * t))(np.clip((v - e0) / (e1 - e0), 0, 1))
# ---- which face covers each texel, and where in it
px = np.stack([cuv[..., 0] * (T - 1), (1 - cuv[..., 1]) * (T - 1)], -1)
fid = np.zeros((T, T), np.int32)
for i, t in enumerate(np.round(px).astype(np.int32)): cv2.fillConvexPoly(fid, t, i + 1)
ys, xs = np.nonzero(fid); f = fid[ys, xs] - 1
a, b, c = px[f, 0], px[f, 1], px[f, 2]; p = np.stack([xs, ys], 1).astype(np.float64)
d = (b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (c[:, 0] - a[:, 0]) * (b[:, 1] - a[:, 1]); d = np.where(np.abs(d) < 1e-9, 1e-9, d)
w1 = ((p[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (c[:, 0] - a[:, 0]) * (p[:, 1] - a[:, 1])) / d
w2 = ((b[:, 0] - a[:, 0]) * (p[:, 1] - a[:, 1]) - (p[:, 0] - a[:, 0]) * (b[:, 1] - a[:, 1])) / d
bc = np.clip(np.stack([1 - w1 - w2, w1, w2], 1), 0, 1); bc /= bc.sum(1, keepdims=True)
interp = lambda A_: (A_[F[f]] * bc[..., None]).sum(1) if A_.ndim > 1 else (A_[F[f]] * bc).sum(1)
import trimesh
N = trimesh.Trimesh(P, F, process=False).vertex_normals
n = interp(N); n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9; pos = interp(P)
vis = interp(Z['vis'].astype(np.float64)) ** 2
# ---- a painting's colour at painting coordinates (heads come from the head sheet, as the old shader did)
def paint(uvn):
    x, y = uvn[:, 0] * (AW - 1), (1 - uvn[:, 1]) * (AH - 1)
    def smp(x_, y_):     # (remap wants an image-shaped request: fold the list into rows of 4096)
        m = len(x_); W_ = 4096; pad = (-m) % W_
        xx = np.pad(x_.astype(np.float32), (0, pad)).reshape(-1, W_); yy = np.pad(y_.astype(np.float32), (0, pad)).reshape(-1, W_)
        return cv2.remap(atlas, xx, yy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE).reshape(-1, 3)[:m]
    col = smp(x, y)
    if HM:
        for r in HM['v']:
            x0, x1, chin, neck, sx, sy, ox, oy = r
            w = (x > x0) & (x < x1) & (y < neck)
            w = w * (1 - ss(chin, neck, y)) * ss(x0, x0 + 5, x) * (1 - ss(x1 - 5, x1, x))
            col = col + w[:, None] * (smp(sx * x + ox, sy * y + oy) - col)
    return col
uF, uB, uA, uS = interp(Z['vF'].astype(np.float64)), interp(Z['vB'].astype(np.float64)), interp(Z['vS1'].astype(np.float64)), interp(Z['vS2'].astype(np.float64))
cF, cB, cA, cS = paint(uF), paint(uB), paint(uA), paint(uS)
# ---- how much of each
if HM:   # on the head a painting may colour what it could not quite see (the rough join round the face left hairline
    # gaps in every painting's view, which showed as dark scratches of the ground)
    hd0 = 1 - ss(HM['v'][0][2], HM['v'][0][3], (1 - uF[:, 1]) * (AH - 1))
    vis = np.maximum(vis, 0.35 * hd0[:, None])
wF = ss(cfg.get('bakeF0', 0.3), cfg.get('bakeF1', 0.65), n[:, 2]) * vis[:, 0]
wB = ss(0.3, 0.65, -n[:, 2]) * vis[:, 1]
wA = ss(cfg.get('bakeS0', 0.72), cfg.get('bakeS1', 0.92), n[:, 0]) * vis[:, 2]
wS = ss(cfg.get('bakeS0', 0.72), cfg.get('bakeS1', 0.92), -n[:, 0]) * vis[:, 3]
if HM:   # (on the head the profiles start sooner, taking over as the front painting turns edge-on)
    hd_ = 1 - ss(HM['v'][0][2], HM['v'][0][3], (1 - uF[:, 1]) * (AH - 1))
    wA = np.maximum(wA, hd_ * ss(0.6, 0.8, n[:, 0]) * vis[:, 2]); wS = np.maximum(wS, hd_ * ss(0.6, 0.8, -n[:, 0]) * vis[:, 3])
if HM:
    yF = (1 - uF[:, 1]) * (AH - 1); xF = uF[:, 0] * (AW - 1); r0 = HM['v'][0]
    head = 1 - ss(r0[2], r0[3], yF)
    back_of_eyes = 1 - ss(HM.get('z', 0) - 0.035, HM.get('z', 0) + 0.03, pos[:, 2])
    # the profiles keep behind the eyes: further forward they carry the profile's own face, which landed on the hair
    # beside the face as a second face. Between the two the generated ground shows (soft, but it belongs there).
    # between brow and chin the front painting stops at the edge of the face: beyond it the front view shows sideburn, ear
    # and their shadow, which were dragged back along the cheek as a dark blotch. The profile takes over from there.
    fx, fy, frx, fry = HM['f']
    edge = ss(cfg.get('edge0', 0.8), cfg.get('edge1', 1.0), np.abs(xF - fx) / frx) * (1 - ss(0.9, 1.2, np.abs(yF - fy) / fry)) * head
    # (only where the surface has turned sideways: hair that hangs beside the face still faces forward and keeps the
    # front painting; given to the profile, it showed a second face on each side from straight on)
    edge *= ss(0.4, 0.65, np.abs(n[:, 0]))
    wA *= 1 - head * (1 - back_of_eyes); wS *= 1 - head * (1 - back_of_eyes)
    if HM.get('ban') == 'A': wA *= 1 - head
    if HM.get('ban') == 'B': wS *= 1 - head
    fx, fy, frx, fry = HM['f']; q = ((xF - fx) / frx) ** 2 + ((yF - fy) / fry) ** 2
    # the face takes the front painting, but only as far as the cheekbones and only where it faces forward: carried out
    # to the ears, the front view's ears and hair edge were dragged back along the sides of the head
    face = (1 - ss(cfg.get('faceQ0', 0.75), cfg.get('faceQ1', 1.15), q)) * ss(0.15, 0.45, n[:, 2]) * head
    wF = np.maximum(wF, face); wA *= 1 - face; wS *= 1 - face; wB *= 1 - face
tot = wF + wB + wA + wS; k = 1 / np.maximum(tot, 1.0)
wF, wB, wA, wS = wF * k, wB * k, wA * k, wS * k; wG = 1 - (wF + wB + wA + wS)
if HM:   # on the head, what no painting claimed goes to the front painting (or the back one behind) rather than to the
    # generated ground, which is too coarse for a face: it showed as dark smears beside the cheeks from straight on
    fill = wG * head * cfg.get('headFill', 0.9)
    fr = ss(-0.25, 0.1, n[:, 2]); wF = wF + fill * fr; wB = wB + fill * (1 - fr); wG = 1 - (wF + wB + wA + wS)
# ---- bring the generated ground to the paintings' tones (it comes out flatter and a little off in colour)
g = gen[ys, xs]
sure = (wF + wB) > 0.95
ref = (cF * wF[:, None] + cB * wB[:, None])[sure] / (wF + wB)[sure][:, None]
gs = g[sure]
gain = (ref.std(0) / np.maximum(gs.std(0), 1)).clip(0.7, 1.5); g = (g - gs.mean(0)) * gain + ref.mean(0)
col = cF * wF[:, None] + cB * wB[:, None] + cA * wA[:, None] + cS * wS[:, None] + g * wG[:, None]
# ---- a second head sheet (head2.py): more views of the head from other angles, each placed on the model. Every point of
# the head takes the view that faces it most squarely (and could see it), with a narrow blend between neighbours, from
# all the views there are: the new ones and the first sheet's front, back and sides. With a view every 45 degrees or
# so, no painting has to be stretched round a corner, which is what smeared and doubled the cheeks.
h2p = os.path.join(D, name + '_head2.json')
# Characters without a second sheet get the same treatment from the views they have (front, back, the two sides): each
# painting keeps to its own quarter of the head, so the front painting is no longer carried round to the ears (which
# repeated ears, earrings and the hair's edge down the sides of the head).
# (Tried for everyone in Oct 2026 and switched off again: with only four views 90 degrees apart, the profile painting's
# own face still landed on the cheek at three-quarter views. It needs the extra views. "sectors": true forces it.)
use2 = os.path.exists(h2p) and not cfg.get('noHead2')
if HM and (use2 or cfg.get('sectors')):
    H2 = json.load(open(h2p)) if use2 else {'views': []}
    if use2:
        sh2 = cv2.imread(os.path.join(D, H2['sheet']))[..., :3].astype(np.float32)
        m2 = cv2.imread(os.path.join(D, name + '_head2_mask.png'), 0) > 127
        core = cv2.erode(m2.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
        _, (iy_, ix_) = ndimage.distance_transform_edt(~core, return_indices=True); sh2 = sh2[iy_, ix_]      # colours bled past the outlines
    def smp2(im, x_, y_, interp=cv2.INTER_LINEAR):
        m = len(x_); W_ = 4096; pad = (-m) % W_
        xx = np.pad(x_.astype(np.float32), (0, pad)).reshape(-1, W_); yy = np.pad(y_.astype(np.float32), (0, pad)).reshape(-1, W_)
        return cv2.remap(im, xx, yy, interp, borderMode=cv2.BORDER_CONSTANT, borderValue=0).reshape(-1, im.shape[2] if im.ndim == 3 else 1)[:m]
    hsel = head > 0.01; ph = pos[hsel]
    # which way each point lies round the head (as seen from above, from the head's middle), not which way its surface
    # tilts: the generated hair is bumpy, and choosing views by the surface's own direction cut the face into a patchwork
    # of views. By direction round the head, the views divide it into clean sectors.
    hc = np.array([np.median(ph[:, 0]), 0, (ph[:, 2].max() + ph[:, 2].min()) / 2 - 0.01])
    rad = ph - hc; rad[:, 1] = 0; rad /= np.linalg.norm(rad, axis=1, keepdims=True) + 1e-9
    nh0 = n[hsel]; nh = rad * 0.85 + nh0 * 0.15; nh /= np.linalg.norm(nh, axis=1, keepdims=True) + 1e-9
    # with only the first sheet's four views, the front painting keeps the face out to about 58 degrees round (the profile
    # painting, used further forward than that, put its own eye and nose on the cheek as a second face)
    fb_ = 0.0 if H2['views'] else cfg.get('frontBias', 0.32)
    cands = [(nh[:, 2] + fb_ * (nh[:, 2] > 0), cF[hsel]), (-nh[:, 2], cB[hsel]), (nh[:, 0], cA[hsel]), (-nh[:, 0], cS[hsel])]
    if HM.get('ban') == 'A': cands[2] = (cands[2][0] * 0, cands[2][1])
    if HM.get('ban') == 'B': cands[3] = (cands[3][0] * 0, cands[3][1])
    # a side the sheet has no view of borrows the other side's view, mirrored (faces are near enough symmetric; without
    # it that side fell back to the stretched front painting)
    yaws = [v['yaw'] for v in H2['views']]; views = [dict(v, mir=1) for v in H2['views']]
    for v in H2['views']:
        if 20 < abs(v['yaw']) < 125 and not any(abs(y + v['yaw']) < 30 for y in yaws) and not cfg.get('noMirror'): views.append(dict(v, mir=-1))
    for v in views:
        mir = v['mir']; ph = pos[hsel] * [mir, 1, 1]; nhm = nh * [mir, 1, 1]
        th = np.radians(v['yaw']); d = np.array([np.sin(th), 0, np.cos(th)])
        u_ = (ph[:, 0] * np.cos(th) - ph[:, 2] * np.sin(th)) * v['s'] + v['t'][0]; v_ = -ph[:, 1] * v['s'] + v['t'][1]
        x0, y0, x1, y1 = v['cell']; ins = (u_ > x0) & (u_ < x1 - 1) & (v_ > y0) & (v_ < y1 - 1)
        ins &= smp2(core.astype(np.float32), u_, v_)[:, 0] > 0.6
        dep = ph @ d; bu, bv = np.clip((u_ / 2).astype(int), 0, sh2.shape[1] // 2), np.clip((v_ / 2).astype(int), 0, sh2.shape[0] // 2)
        buf = np.full((sh2.shape[0] // 2 + 1, sh2.shape[1] // 2 + 1), -1e9, np.float32); np.maximum.at(buf, (bv, bu), dep.astype(np.float32))
        buf = ndimage.maximum_filter(buf, 3); seen_ = 1 - np.clip((buf[bv, bu] - dep - 0.012) / 0.012, 0, 1)
        cands.append(((nhm @ d) * (0.5 + 0.5 * seen_) * ins + cfg.get('head2Bonus', 0.06) * ins * (1 if mir > 0 else -1), smp2(sh2, u_, v_)))
    S_ = np.stack([c[0] for c in cands], 1); best_ = S_.max(1)
    # bring neighbouring views to the same tone where they overlap (each painting is lit a little differently, and the
    # step in tone along the edge of the face read as a mask): starting from the front view, each view in turn is
    # shifted to match those already done
    cols = [c[1].astype(np.float32).copy() for c in cands]; done = [0]; todo = list(range(1, len(cands)))
    while todo:
        bestp = None
        for i in todo:
            for j in done:
                ov = (S_[:, i] > 0.45) & (S_[:, j] > 0.45)
                if ov.sum() > 400 and (bestp is None or ov.sum() > bestp[0]): bestp = (int(ov.sum()), i, j, ov)
        if bestp is None: break
        _, i, j, ov = bestp
        off = np.clip(np.median(cols[j][ov] - cols[i][ov], 0), -cfg.get('toneMax', 28), cfg.get('toneMax', 28))
        cols[i] = np.clip(cols[i] + off, 0, 255); done.append(i); todo.remove(i)
    cands = [(c[0], cols[k]) for k, c in enumerate(cands)]
    Wt_ = np.exp(cfg.get('head2Sharp', 22) * (S_ - best_[:, None])) * (S_ > 0.12); Wt_ /= np.maximum(Wt_.sum(1, keepdims=True), 1e-6)
    colH = sum(Wt_[:, i:i + 1] * cands[i][1] for i in range(len(cands)))
    cov = ss(0.12, 0.3, best_) * head[hsel]
    col[hsel] = col[hsel] + cov[:, None] * (colH - col[hsel])
    print('second head sheet:', len(H2['views']), 'views; share of the head from them', round(float((Wt_[:, 4:].sum(1) * cov).mean() / max(head[hsel].mean(), 1e-6)), 2))
if os.environ.get('BAKEDBG'): col = np.stack([wG, wA + wS, wF], 1) * 255     # debug: blue = ground, green = sides, red = front
out = np.zeros((T, T, 3), np.float32); out[ys, xs] = np.clip(col, 0, 255)
# spread colours past each island's edge (no dark seams when the texture is filtered or halved)
_, (iy, ix) = ndimage.distance_transform_edt(fid == 0, return_indices=True); out = out[iy, ix]
cv2.imwrite(os.path.join(D, name + '_baked.png'), out.astype(np.uint8))
print('baked: paintings cover', round(float(1 - wG.mean()), 2), 'of the surface; front', round(float(wF.mean()), 2), 'back', round(float(wB.mean()), 2), 'sides', round(float((wA + wS).mean()), 2))
