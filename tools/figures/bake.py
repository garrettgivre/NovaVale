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
if os.environ.get('BAKEDBG'): col = np.stack([wG, wA + wS, wF], 1) * 255     # debug: blue = ground, green = sides, red = front
out = np.zeros((T, T, 3), np.float32); out[ys, xs] = np.clip(col, 0, 255)
# spread colours past each island's edge (no dark seams when the texture is filtered or halved)
_, (iy, ix) = ndimage.distance_transform_edt(fid == 0, return_indices=True); out = out[iy, ix]
cv2.imwrite(os.path.join(D, name + '_baked.png'), out.astype(np.uint8))
print('baked: paintings cover', round(float(1 - wG.mean()), 2), 'of the surface; front', round(float(wF.mean()), 2), 'back', round(float(wB.mean()), 2), 'sides', round(float((wA + wS).mean()), 2))
