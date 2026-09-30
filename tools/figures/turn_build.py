# Build a textured, skinned mesh from a turnaround sheet (front | side | back).
# Front and back surfaces come from depth estimates of the front and back views, calibrated so they fit the
# side silhouette; each face is textured from the view that sees it best. Output: <name>_turn.npz for Blender.
import os, sys, json, numpy as np, cv2, onnxruntime as ort
from scipy import ndimage
D = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(os.path.join(D, sys.argv[1])))
name, HEIGHT, STEP = cfg['name'], cfg['height'], cfg.get('step', 2)
sheet = cv2.imread(os.path.join(D, cfg['sheet'])); SH, SW = sheet.shape[:2]

# ---- masks in sheet coordinates (from turn_cut.py cutouts and their offsets)
def placed(view):
    c = cv2.imread(os.path.join(D, f'{name}_{view}.png'), cv2.IMREAD_UNCHANGED)
    ox, oy = cfg['off'][view]; a = np.zeros((SH, SW), np.float32)
    a[oy:oy + c.shape[0], ox:ox + c.shape[1]] = c[..., 3] / 255.0
    return a
A = {v: placed(v) for v in ('front', 'side', 'back')}
M = {v: (A[v] > 0.5) for v in A}
def span(m):
    ys, xs = np.nonzero(m); return ys.min(), ys.max(), xs.min(), xs.max()
top, bot = {}, {}
for v in M: top[v], bot[v], _, _ = span(M[v])
px = {v: HEIGHT / (bot[v] - top[v]) for v in M}
rowOf = lambda v, y: top[v] + (bot[v] - top[v]) * (1 - y / HEIGHT)   # model height -> sheet row

# ---- depth (Depth Anything V2): relative inverse depth, bigger = nearer the camera
sess = ort.InferenceSession(os.path.join(D, 'da', 'onnx', 'model.onnx'), providers=['CPUExecutionProvider'])
def depth(view):
    y0, y1, x0, x1 = span(M[view]); p = 24
    y0, x0 = max(0, y0 - p), max(0, x0 - p); y1, x1 = min(SH, y1 + p), min(SW, x1 + p)
    rgb = cv2.cvtColor(sheet[y0:y1, x0:x1], cv2.COLOR_BGR2RGB).astype(np.float32) / 255
    a = A[view][y0:y1, x0:x1, None]; rgb = rgb * a + 0.5 * (1 - a)
    h, w = rgb.shape[:2]; th = 770; tw = max(14, int(round(th * w / h / 14)) * 14)
    x = (cv2.resize(rgb, (tw, th), interpolation=cv2.INTER_CUBIC) - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
    o = sess.run(None, {sess.get_inputs()[0].name: x.transpose(2, 0, 1)[None].astype(np.float32)})[0][0]
    full = np.zeros((SH, SW), np.float32); full[y0:y1, x0:x1] = cv2.resize(o, (w, h), interpolation=cv2.INTER_CUBIC)
    # extend outward so samples just outside the silhouette are sane
    _, (iy, ix) = ndimage.distance_transform_edt(~M[view], return_indices=True)
    return full[iy, ix]
Df, Db = depth('front'), depth('back')

# ---- side silhouette: front/back extent per model height
ys_, xs_ = np.nonzero(M['side'])
torso = [rowOf('side', HEIGHT * t) for t in (0.55, 0.62, 0.7)]
mids = [(np.nonzero(M['side'][int(r)])[0].min() + np.nonzero(M['side'][int(r)])[0].max()) / 2 for r in torso]
czs = float(np.mean(mids))
facing = cfg.get('sideFaces', 'left')       # which way the nose points in the side view
sgn = 1 if facing == 'left' else -1
zS = lambda u: sgn * (czs - u) * px['side']
def sideRange(y):
    r = int(round(rowOf('side', y))); r = min(max(r, top['side']), bot['side'])
    xs = np.nonzero(M['side'][r])[0]
    if len(xs) == 0: return 0.0, 0.0
    z1, z2 = zS(xs.min()), zS(xs.max()); return max(z1, z2), min(z1, z2)

# ---- front/back horizontal alignment (centre = the neck column)
cxf = cfg['joints']['neck'][0]
tr = slice(int(rowOf('front', HEIGHT * .62)), int(rowOf('front', HEIGHT * .58)))
def centroid(m, rows): ys, xs = np.nonzero(m[rows]); return xs.mean()
xcm = (centroid(M['front'], tr) - cxf) * px['front']
trb = slice(int(rowOf('back', HEIGHT * .62)), int(rowOf('back', HEIGHT * .58)))
cxb = centroid(M['back'], trb) + xcm / px['back']
X = lambda u: (u - cxf) * px['front']
Yf = lambda v: (bot['front'] - v) * px['front']
ub = lambda x: cxb - x / px['back']

# ---- grid over the front silhouette
gm = cv2.dilate(M['front'].astype(np.uint8), np.ones((3, 3), np.uint8))
y0, y1, x0, x1 = span(gm)
gy, gx = np.mgrid[y0:y1 + 1:STEP, x0:x1 + 1:STEP]
inside = gm[gy, gx] > 0
idx = -np.ones(inside.shape, np.int64); n = int(inside.sum()); idx[inside] = np.arange(n)
U, V = gx[inside].astype(np.float32), gy[inside].astype(np.float32)
x, y = X(U), Yf(V)
zf_hi = np.zeros(n); zb_lo = np.zeros(n)
rows = np.unique(V)
rng = {}
for r in rows:
    rng[r] = sideRange(Yf(r))
def smoothRows(dct, sig):
    ks = sorted(dct); vals = np.array([dct[k] for k in ks], np.float64)
    if vals.ndim == 1: vals = vals[:, None]
    sm = ndimage.gaussian_filter1d(vals, sig, axis=0, mode='nearest')
    return {k: (sm[i] if sm.shape[1] > 1 else sm[i, 0]) for i, k in enumerate(ks)}
rng = smoothRows(rng, 3.0 / STEP * 2)
zF = np.array([rng[r][0] for r in V]); zB = np.array([rng[r][1] for r in V])

# front surface: per row, the nearest point of the front view sits at the side silhouette's front edge
def rowmax(Dm, m, rr):
    out = {}
    for r in np.unique(rr):
        v = Dm[int(r)][m[int(r)]]; out[r] = np.percentile(v, 97) if len(v) else 0
    return smoothRows(out, 6)
dF = Df[V.astype(int), U.astype(int)]
mxF = rowmax(Df, M['front'], V); mF = np.array([mxF[r] for r in V])
vb = np.clip(np.round(rowOf('back', y)).astype(int), 0, SH - 1)
ubb = np.clip(np.round(ub(x)).astype(int), 0, SW - 1)
dB = Db[vb, ubb]
mxB = rowmax(Db, M['back'], vb); mB = np.array([mxB[r] for r in vb])
# scale (metres per depth unit) from the torso: centre-to-edge drop = half the body's depth
def scaleFit(Dm, m, view):
    ss = []
    for t in np.linspace(0.5, 0.72, 12):
        r = int(rowOf(view, HEIGHT * t)); xs = np.nonzero(m[r])[0]
        if len(xs) < 20: continue
        edge = (Dm[r, xs[:4]].mean() + Dm[r, xs[-4:]].mean()) / 2
        zf_, zb_ = sideRange(HEIGHT * t)
        drop = np.percentile(Dm[r, xs], 97) - edge
        if drop > 1e-3: ss.append((zf_ - zb_) / 2 / drop)
    return float(np.median(ss))
sF, sB = scaleFit(Df, M['front'], 'front'), scaleFit(Db, M['back'], 'back')
zf = zF - sF * (mF - dF)
zb = zB + sB * (mB - dB)
zf = np.clip(zf, zB, zF); zb = np.clip(zb, zB, zF)
# round the silhouette edge: both surfaces meet at their middle there
dt = cv2.distanceTransform(M['front'].astype(np.uint8), cv2.DIST_L2, 5)[V.astype(int), U.astype(int)] * px['front']
w = np.clip(dt / 0.018, 0, 1); w = w * w * (3 - 2 * w)
zm = (zf + zb) / 2
zf = zm + (zf - zm) * np.maximum(w, 0.15); zb = zm + (zb - zm) * np.maximum(w, 0.15)
bad = zf - zb < 0.004; zf[bad] = zm[bad] + 0.002; zb[bad] = zm[bad] - 0.002
# smooth along the grid (depth noise)
def smooth(z):
    g = np.zeros(inside.shape, np.float32); g[inside] = z; wgt = inside.astype(np.float32)
    gs = cv2.GaussianBlur(g, (0, 0), 1.0); ws = cv2.GaussianBlur(wgt, (0, 0), 1.0)
    return (gs / np.maximum(ws, 1e-6))[inside]
zf, zb = smooth(zf), smooth(zb)
print('scale', sF, sB, 'depth', zf.max(), zb.min())

# ---- triangles
a00, a01, a10, a11 = idx[:-1, :-1], idx[:-1, 1:], idx[1:, :-1], idx[1:, 1:]
T = []
full = (a00 >= 0) & (a01 >= 0) & (a10 >= 0) & (a11 >= 0)
for p, q, s in [(a00, a10, a11), (a00, a11, a01)]: T.append(np.stack([p[full], q[full], s[full]], 1))
for p, q, s, c in [(a00, a10, a01, a11 < 0), (a01, a10, a11, a00 < 0), (a00, a10, a11, a01 < 0), (a00, a11, a01, a10 < 0)]:
    c = c & (p >= 0) & (q >= 0) & (s >= 0); T.append(np.stack([p[c], q[c], s[c]], 1))
T = np.concatenate(T)
E = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]])
key = np.sort(E, 1); _, inv, cnt = np.unique(key, axis=0, return_inverse=True, return_counts=True)
bnd = E[cnt[inv.ravel()] == 1]
side = np.concatenate([np.stack([bnd[:, 1], bnd[:, 0], bnd[:, 0] + n], 1), np.stack([bnd[:, 1], bnd[:, 0] + n, bnd[:, 1] + n], 1)])
Ff = T; Fb = T[:, [0, 2, 1]] + n; Fs = side
F = np.concatenate([Ff, Fb, Fs])
P = np.concatenate([np.stack([x, y, zf], 1), np.stack([x, y, zb], 1)]).astype(np.float32)
kind = np.concatenate([np.zeros(len(Ff)), np.ones(len(Fb)), np.full(len(Fs), 2)]).astype(np.int32)

# ---- skeleton (sheet pixel joints of the front view -> model space) and skin weights
J = {}
for kk, (u, v) in cfg['joints'].items():
    J[kk] = np.array([X(u), Yf(v), 0.0])
for kk in J:  # joints sit mid-depth of the body at their height
    zf_, zb_ = sideRange(J[kk][1]); J[kk][2] = (zf_ + zb_) / 2
BONES = [  # name, parent, head joint, tail joint
    ('hips', None, 'hips', 'spine'), ('spine', 'hips', 'spine', 'chest'), ('chest', 'spine', 'chest', 'neck'),
    ('neck', 'chest', 'neck', 'chin'), ('head', 'neck', 'chin', 'top'),
    ('shoulderR', 'chest', 'neck', 'shR'), ('upperR', 'shoulderR', 'shR', 'elR'), ('foreR', 'upperR', 'elR', 'wrR'), ('handR', 'foreR', 'wrR', 'tipR'),
    ('shoulderL', 'chest', 'neck', 'shL'), ('upperL', 'shoulderL', 'shL', 'elL'), ('foreL', 'upperL', 'elL', 'wrL'), ('handL', 'foreL', 'wrL', 'tipL'),
]
def segd(p, a, b):
    ab = b - a; t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)
dist = np.stack([segd(P, J[h], J[t]) for _, _, h, t in BONES], 1)
# the lower body (legs inside the gown) follows the hips; the head bone owns everything above the chin
dist[:, 0] = np.minimum(dist[:, 0], np.where(P[:, 1] < J['hips'][1], 0.0, 9))
hi = P[:, 1] > J['chin'][1] + 0.01
dist[hi, 4] = np.minimum(dist[hi, 4], 0.0)
sig = cfg.get('sigma', 0.028)
W = np.exp(-(dist - dist.min(1, keepdims=True)) / sig)
# shoulders (clavicles) only take a little
W[:, [5, 9]] *= 0.35
top4 = np.argsort(-W, 1)[:, :4]; Wt = np.take_along_axis(W, top4, 1); Wt /= Wt.sum(1, keepdims=True)
# ---- per-corner UVs: front view, back view, or side view, by face normal
p0, p1, p2 = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]
nrm = np.cross(p1 - p0, p2 - p0); nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-9
armV = np.isin(top4[:, 0], [6, 7, 8, 10, 11, 12])
useSide = (np.abs(nrm[:, 0]) > cfg.get('sideAt', 0.93)) & ~armV[F].any(1)
useBack = (~useSide) & (nrm[:, 2] < 0)
Pc = P[F.ravel()]
uvF = np.stack([(Pc[:, 0] / px['front'] + cxf), bot['front'] - Pc[:, 1] / px['front']], 1)
uvB = np.stack([ub(Pc[:, 0]), rowOf('back', Pc[:, 1])], 1)
uS = czs - sgn * Pc[:, 2] / px['side']
uvS = np.stack([uS, rowOf('side', Pc[:, 1])], 1)
k = np.repeat(np.where(useSide, 2, np.where(useBack, 1, 0)), 3)
uv = np.where((k == 2)[:, None], uvS, np.where((k == 1)[:, None], uvB, uvF))
UV = np.stack([uv[:, 0] / (SW - 1), 1 - uv[:, 1] / (SH - 1)], 1).astype(np.float32)

np.savez(os.path.join(D, name + '_turn.npz'), P=P, F=F.astype(np.int32), UV=UV, kind=kind,
         bones=json.dumps([[b, p, J[h].tolist(), J[t].tolist()] for b, p, h, t in BONES]), wi=top4.astype(np.int32), wv=Wt.astype(np.float32))
# texture: the sheet with each figure's colours bled outward (no grey halo at the edges)
allm = cv2.erode((M['front'] | M['side'] | M['back']).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
_, (iy, ix) = ndimage.distance_transform_edt(~allm, return_indices=True)
tex = sheet[iy, ix]
cv2.imwrite(os.path.join(D, name + '_tex.png'), tex)
print('verts', len(P), 'faces', len(F), 'side faces', int(useSide.sum()))
