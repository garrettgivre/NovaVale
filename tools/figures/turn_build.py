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
VIEWS = cfg.get('views', ['front', 'side', 'back'])
A = {v: placed(v) for v in VIEWS}
M = {v: (A[v] > 0.5) for v in A}
# trim the outline inward: the paintings fade into the backdrop over the last few pixels (a pale rim round the hair),
# and the rounded edge of the mesh stretched that rim into grey mottling
TRIM = cfg.get('trim', 3)
for v in M:
    M[v] = cv2.erode(M[v].astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * TRIM + 1, 2 * TRIM + 1))) > 0
    A[v] = np.where(M[v], np.maximum(A[v], 0.51), np.minimum(A[v], 0.49))
for v, k_ in cfg.get('open', {}).items():   # break thin bridges to a neighbouring view
    M[v] = cv2.morphologyEx(M[v].astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_, k_))) > 0
for v in M:   # keep each view's main body (drops slivers of a neighbouring view's cape or train)
    lab_, nl = ndimage.label(M[v])
    if nl > 1:
        sizes = ndimage.sum(M[v], lab_, range(1, nl + 1)); keep = 1 + int(np.argmax(sizes))
        small = (sizes < sizes.max() * 0.002)
        M[v] = (lab_ == keep) | np.isin(lab_, 1 + np.nonzero(small)[0])
        A[v] = A[v] * M[v]
def span(m):
    ys, xs = np.nonzero(m); return ys.min(), ys.max(), xs.min(), xs.max()
# fill small enclosed gaps (between curls, inside a glasses chain): the cutout leaves them as holes, which made holes
# in the mesh, so the room showed through the hair as light spots
holeInfo = {}
for v in M:
    holes = ndimage.binary_fill_holes(M[v]) & ~M[v]
    lab_, nh = ndimage.label(holes)
    if nh:
        sizes = ndimage.sum(holes, lab_, range(1, nh + 1)); small = 1 + np.nonzero(sizes < M[v].sum() * cfg.get('holeMax', 0.02))[0]
        fill = np.isin(lab_, small); M[v] = M[v] | fill; A[v] = np.maximum(A[v], fill * 0.6)
        holeInfo[v] = (len(small), int(fill.sum()))
print('holes filled', holeInfo)
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
# optional second side view (the other flank), facing the other way
if 'side2' in M:
    mids2 = [(np.nonzero(M['side2'][int(r)])[0].min() + np.nonzero(M['side2'][int(r)])[0].max()) / 2 for r in [rowOf('side2', HEIGHT * t) for t in (0.55, 0.62, 0.7)]]
    czs2 = float(np.mean(mids2)); sgn2 = -sgn
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

# ---- feet (front view): centres of the leftmost and rightmost segments just above the soles
def segs(row):
    d = np.diff(np.concatenate([[0], row.astype(np.int8), [0]])); return list(zip(np.nonzero(d == 1)[0], np.nonzero(d == -1)[0] - 1))
fr_ = int(bot['front'] - 0.04 * (bot['front'] - top['front'])); rs_ = segs(M['front'][fr_])
footL_u, footR_u = (rs_[0][0] + rs_[0][1]) / 2, (rs_[-1][0] + rs_[-1][1]) / 2
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
rngRaw = dict(rng)
rng = smoothRows(rng, 3.0 / STEP * 2)
# torso depth from the side outline, minus narrow forward/backward bumps (hands hanging in front of a coat made lumps)
chinY = Yf(cfg['joints']['chin'][1])
ks = sorted(rng); zFr = np.array([rng[k][0] for k in ks]); zBr = np.array([rng[k][1] for k in ks]); yr = np.array([Yf(k) for k in ks])
win = max(3, int(0.13 / (px['front'] * STEP)))
zFo = ndimage.maximum_filter1d(ndimage.minimum_filter1d(zFr, win), win)
zBo = -ndimage.maximum_filter1d(ndimage.minimum_filter1d(-zBr, win), win)
body = yr < chinY - 0.02
zFr = np.where(body, ndimage.gaussian_filter1d(zFo, 2), zFr); zBr = np.where(body, ndimage.gaussian_filter1d(zBo, 2), zBr)
rng = {k: (a_, b_) for k, a_, b_ in zip(ks, zFr, zBr)}
# the face profile: raw side outline minus a smooth head curve = nose, lips, chin
zFraw = np.array([rngRaw[k][0] for k in ks]); zFsm = ndimage.gaussian_filter1d(zFraw, max(2, 0.035 / (px['front'] * STEP)))
profBump = {k: max(0.0, a_ - b_) for k, a_, b_ in zip(ks, zFraw, zFsm)}
headSm = {k: b_ for k, b_ in zip(ks, zFsm)}
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
print('raw scale', sF, sB)
lo_, hi_ = cfg.get('scaleRange', [0.07, 0.11])
sF, sB = float(np.clip(sF, lo_, hi_)), float(np.clip(sB, lo_, hi_))
zf = zF - sF * (mF - dF)
zb = zB + sB * (mB - dB)
zf = np.clip(zf, zB, zF); zb = np.clip(zb, zB, zF)
# round the silhouette edge: both surfaces meet at their middle there
dt = cv2.distanceTransform(M['front'].astype(np.uint8), cv2.DIST_L2, 5)[V.astype(int), U.astype(int)] * px['front']
w = np.clip(dt / 0.018, 0, 1); w = w * w * (3 - 2 * w)
zm = (zf + zb) / 2
zf = zm + (zf - zm) * np.maximum(w, 0.15); zb = zm + (zb - zm) * np.maximum(w, 0.15)
bad = zf - zb < 0.004; zf[bad] = zm[bad] + 0.002; zb[bad] = zm[bad] - 0.002
# ---- visual-hull cross-sections: the shape must match the side painting too. Each row's piece of the front outline
# (torso/head, or an arm or leg) gets a rounded-box cross-section: the torso's depth comes from the side outline (so the
# profile, nose to chest to belly, is the side painting's), limbs are round. The depth estimate only adds fine detail.
Mfr = M['front']; cu2 = int(round(cxf)); segRow = {}
for r in np.unique(V.astype(int)):
    rr = min(max(int(r), 0), SH - 1); segRow[r] = segs(Mfr[rr]) if Mfr[rr].any() else []
hullF = np.empty(n); hullB = np.empty(n)
NEXP = cfg.get('boxy', 2.6)
for i in range(n):
    r = int(V[i]); u = U[i]; ss = segRow.get(r, [])
    sg = min(ss, key=lambda q: 0 if q[0] <= u <= q[1] else min(abs(u - q[0]), abs(u - q[1]))) if ss else (u - 1, u + 1)
    a_, b_ = sg; hw = max((b_ - a_) / 2, 1.0); t = min(abs(u - (a_ + b_) / 2) / hw, 1.0)
    ne = 2.1 if y[i] > Yf(cfg['joints']['chin'][1]) - 0.02 else NEXP     # heads rounder than bodies
    sh = (1 - t ** ne) ** (1 / ne)
    if a_ <= cu2 <= b_:                      # the torso / head piece: depth from the side outline
        zf_i = headSm.get(r, zF[i]) if y[i] > chinY - 0.03 else zF[i]
        c_, h_ = (zf_i + zB[i]) / 2, (zf_i - zB[i]) / 2
    else:                                    # a limb: round, centred in the body's depth
        c_ = (zF[i] + zB[i]) / 2; h_ = min(hw * px['front'], (zF[i] - zB[i]) / 2)
    hullF[i] = c_ + h_ * sh; hullB[i] = c_ - h_ * sh
# fine detail from the depth estimate (high-passed, a couple of centimetres at most)
def hp(z):
    g = np.zeros(inside.shape, np.float32); g[inside] = z; w_ = inside.astype(np.float32)
    lo = cv2.GaussianBlur(g, (0, 0), 6) / np.maximum(cv2.GaussianBlur(w_, (0, 0), 6), 1e-6)
    return z - lo[inside]
def gsm(z, sig):   # smooth a per-vertex value over the grid (the outline's wiggles made every row a little different)
    g = np.zeros(inside.shape, np.float32); g[inside] = z; w_ = inside.astype(np.float32)
    return (cv2.GaussianBlur(g, (0, 0), sig) / np.maximum(cv2.GaussianBlur(w_, (0, 0), sig), 1e-6))[inside]
hullF, hullB = gsm(hullF, cfg.get('hullSmooth', 3.0)), gsm(hullB, cfg.get('hullSmooth', 3.0))
# sculpt the face: the profile's nose/lips/chin stand out along the middle of the face, nose-width
faceTop = Yf(cfg['joints'].get('face', cfg['joints']['chin'])[1]) + 0.045
faceRows = (y > chinY - 0.015) & (y < faceTop)
pb = np.array([profBump.get(int(v), 0.0) for v in V])

headV = y > Yf(cfg['joints']['chin'][1]) - 0.03
lim = np.where(headV, 0.006, 0.007)                  # a little relief on the face, very little on clothes
detF, detB = np.clip(gsm(hp(zf), 1.0), -lim, lim), np.clip(gsm(hp(zb), 1.0), -lim, lim)
zf = np.minimum(hullF + detF, zF); zb = np.maximum(hullB + detB, zB)
bad = zf - zb < 0.003; zm = (hullF + hullB) / 2; zf[bad] = zm[bad] + 0.0015; zb[bad] = zm[bad] - 0.0015
# smooth along the grid (depth noise)
def smooth(z):
    g = np.zeros(inside.shape, np.float32); g[inside] = z; wgt = inside.astype(np.float32)
    gs = cv2.GaussianBlur(g, (0, 0), cfg.get('zsmooth', 2.0)); ws = cv2.GaussianBlur(wgt, (0, 0), cfg.get('zsmooth', 2.0))
    return (gs / np.maximum(ws, 1e-6))[inside]
zf, zb = smooth(zf), smooth(zb)
# ---- sculpt the face: run the depth model on a close crop of the face (at body scale a face is ~100 px and comes out
# flat), keep the mid/fine detail (nose, brow, eye sockets, cheekbones, lips, chin), scale it so the nose stands
# ~FACE_D proud of the cheeks, and add it to the front surface inside a soft oval over the face
jfc, jch = cfg['joints'].get('face', cfg['joints']['chin']), cfg['joints']['chin']
fcy = (jfc[1] + jch[1]) / 2 - 0.1 * (jch[1] - jfc[1]); ry = max(12.0, (jch[1] - jfc[1]) * 1.55); rx = ry * cfg.get('faceAspect', 0.74)
half = int(ry * 1.35); cxI, cyI = int(round(cxf)), int(round(fcy))
bx0, bx1, by0, by1 = max(0, cxI - half), min(SW, cxI + half), max(0, cyI - half), min(SH, cyI + half)
crop = cv2.cvtColor(sheet[by0:by1, bx0:bx1], cv2.COLOR_BGR2RGB).astype(np.float32) / 255
al_ = A['front'][by0:by1, bx0:bx1, None]; crop = crop * al_ + 0.5 * (1 - al_)
inp = (cv2.resize(crop, (518, 518), interpolation=cv2.INTER_CUBIC) - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
fd = sess.run(None, {sess.get_inputs()[0].name: inp.transpose(2, 0, 1)[None].astype(np.float32)})[0][0]
fd = cv2.resize(fd, (bx1 - bx0, by1 - by0), interpolation=cv2.INTER_CUBIC)
fdet = fd - cv2.GaussianBlur(fd, (0, 0), (bx1 - bx0) * 0.16)
yy, xx = np.mgrid[by0:by1, bx0:bx1]; ell = ((xx - cxf) / rx) ** 2 + ((yy - fcy) / ry) ** 2
inner = ell < 0.55
sc_ = cfg.get('faceDepth', 0.03) / max(np.percentile(fdet[inner], 99.5), 1e-4)
fdet = np.clip(fdet * sc_, -0.025, 0.04)
feather = np.clip((1.0 - ell) / 0.35, 0, 1); feather = feather * feather * (3 - 2 * feather)
relief = np.zeros((SH, SW), np.float32); relief[by0:by1, bx0:bx1] = fdet * feather * (A['front'][by0:by1, bx0:bx1] > 0.5)
fr_ = ndimage.map_coordinates(relief, [V, U], order=1)
zf = zf + fr_
print('face relief: nose', round(float(fr_.max()), 3), 'm, sockets', round(float(fr_.min()), 3), 'm')
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
# smooth outline: slide each edge vertex onto the cutout's alpha = 0.5 contour (the grid alone gives stair steps)
bv = np.unique(bnd.ravel())
al = cv2.GaussianBlur(A['front'], (0, 0), 1.2)
gyA, gxA = np.gradient(al)
bu, bvv = U[bv].astype(np.float64), V[bv].astype(np.float64)
for _ in range(8):
    a_ = ndimage.map_coordinates(al, [bvv, bu], order=1)
    gx_ = ndimage.map_coordinates(gxA, [bvv, bu], order=1); gy_ = ndimage.map_coordinates(gyA, [bvv, bu], order=1)
    g2 = gx_ ** 2 + gy_ ** 2 + 1e-4
    du, dv = -(a_ - 0.5) * gx_ / g2, -(a_ - 0.5) * gy_ / g2
    l = np.hypot(du, dv); k_ = np.minimum(1, STEP * 0.5 / np.maximum(l, 1e-9))
    bu += du * k_; bvv += dv * k_
bu = U[bv] + np.clip(bu - U[bv], -STEP * 1.2, STEP * 1.2); bvv = V[bv] + np.clip(bvv - V[bv], -STEP * 1.2, STEP * 1.2)
x[bv] = X(bu); y[bv] = Yf(bvv)
Ff = T; Fb = T[:, [0, 2, 1]] + n; Fs = side
F = np.concatenate([Ff, Fb, Fs])
P = np.concatenate([np.stack([x, y, zf], 1), np.stack([x, y, zb], 1)]).astype(np.float32)
kind = np.concatenate([np.zeros(len(Ff)), np.ones(len(Fb)), np.full(len(Fs), 2)]).astype(np.int32)

# ---- skeleton (sheet pixel joints of the front view -> model space) and skin weights
J = {}
for kk, (u, v) in cfg['joints'].items():
    J[kk] = np.array([X(u), Yf(v), 0.0])
for kk in J:  # joints sit mid-depth of the body at their height; arm joints mid-depth of the arm itself
    zf_, zb_ = sideRange(J[kk][1]); J[kk][2] = (zf_ + zb_) / 2
    if kk[:2] in ('sh', 'el', 'wr', 'ti'):
        near = np.linalg.norm(P[:, :2] - J[kk][:2], axis=1) < 0.025
        if near.sum() > 4: J[kk][2] = float(np.median(P[near, 2]))
BONES = [  # name, parent, head joint, tail joint
    ('hips', None, 'hips', 'spine'), ('spine', 'hips', 'spine', 'chest'), ('chest', 'spine', 'chest', 'neck'),
    ('neck', 'chest', 'neck', 'chin'), ('head', 'neck', 'chin', 'top'),
    ('shoulderR', 'chest', 'neck', 'shR'), ('upperR', 'shoulderR', 'shR', 'elR'), ('foreR', 'upperR', 'elR', 'wrR'), ('handR', 'foreR', 'wrR', 'tipR'),
    ('shoulderL', 'chest', 'neck', 'shL'), ('upperL', 'shoulderL', 'shL', 'elL'), ('foreL', 'upperL', 'elL', 'wrL'), ('handL', 'foreL', 'wrL', 'tipL'),
]
def segd(p, a, b):
    ab = b - a; t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)
# distance to each bone measured inside the front silhouette (geodesic), so a hand never binds to the
# thigh it hangs next to, and the gown beside an arm never binds to that arm
from skimage.graph import MCP_Geometric
cost = np.where(cv2.dilate(M["front"].astype(np.uint8), np.ones((11, 11), np.uint8)) > 0, 1.0, 50.0)
pj = cfg['joints']
Uall = np.concatenate([np.where(np.isin(np.arange(n), bv), (x / px['front'] + cxf), U)] * 2)
Vall = np.concatenate([bot['front'] - y / px['front']] * 2)
dist = []
for _, _, h, t in BONES:
    (u0, v0), (u1, v1) = pj[h], pj[t]
    segs_ = [((u0, v0), (u1, v1))]
    if h == 'hips':   # the hips own the legs: a line down each leg to its foot
        segs_ += [((u0, v0), (footL_u, bot['front'])), ((u0, v0), (footR_u, bot['front']))]
    seeds = []
    for (a0, b0), (a1, b1) in segs_:
        L = int(max(abs(a1 - a0), abs(b1 - b0))) + 1
        seeds += [(int(round(b0 + (b1 - b0) * i / L)), int(round(a0 + (a1 - a0) * i / L))) for i in range(L + 1)]
    geo, _ = MCP_Geometric(cost).find_costs(seeds)
    dist.append(ndimage.map_coordinates(geo, [Vall, Uall], order=1) * px['front'])
dist = np.stack(dist, 1)
# the torso is the torso: on rows where an arm hangs clear of the body in the front view, everything inside the
# central (torso) segment belongs to the body, not the arm (otherwise relaxing the arms pulled the waist in)
Mf = M['front']; cu_ = int(round(cxf)); torsoRow = {}
for r in range(int(top['front']), int(bot['front'])):
    rs = segs(Mf[r]); c_ = [q for q in rs if q[0] <= cu_ <= q[1]]
    if c_ and any(q[1] < c_[0][0] for q in rs) and any(q[0] > c_[0][1] for q in rs): torsoRow[r] = c_[0]
vi = np.clip(np.round(Vall).astype(int), 0, SH - 1); ui_ = np.round(Uall)
inT = np.array([(r in torsoRow) and (torsoRow[r][0] + 2 <= u <= torsoRow[r][1] - 2) for r, u in zip(vi, ui_)])
for j in (6, 7, 8, 10, 11, 12): dist[inT, j] = 9.0
print('torso vertices kept off the arms', int(inT.sum()))
# below the hips only the hands themselves may follow the arms (a hand hanging against a pocket or a jacket hem
# otherwise drags the thigh along when the arms relax)
lowV = P[:, 1] < J['hips'][1] + 0.03
def seg2(p, a, b):
    a, b = a[:2], b[:2]; ab = b - a; t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)
for s_, js in (('R', (6, 7, 8)), ('L', (10, 11, 12))):
    tip = J['tip' + s_] + (J['tip' + s_] - J['wr' + s_]) * 0.4
    near = np.minimum(seg2(P[:, :2], J['el' + s_], J['wr' + s_]), seg2(P[:, :2], J['wr' + s_], tip)) < 0.07
    # anything further out than the hand (a thumb, a cuff) can't be leg
    sgx = 1 if s_ == 'L' else -1
    near |= (sgx * P[:, 0] > min(sgx * J['wr' + s_][0], sgx * J['tip' + s_][0]) - 0.01) & (P[:, 1] > J['tip' + s_][1] - 0.08)
    for j in js: dist[lowV & ~near, j] = 9.0
    # and what is right by the hand is the hand's: never the hips
    handZ = lowV & (np.minimum(seg2(P[:, :2], J['wr' + s_], tip), 9) < 0.05)
    dist[handZ, 0] = np.maximum(dist[handZ, 0], dist[handZ][:, list(js)].min(1) + 0.05)
# the lower body (legs inside the gown) follows the hips; the head bone owns everything above the chin
hi = P[:, 1] > J['chin'][1] + 0.01
dist[hi, 4] = np.minimum(dist[hi, 4], 0.0)
sig = cfg.get('sigma', 0.028)
# arm joints blend over a short stretch (a long blend made elbows bend like rubber); the body stays soft
sigv = np.full(len(BONES), sig); sigv[[6, 7, 8, 10, 11, 12]] = cfg.get('armSigma', 0.013)
W = np.exp(-(dist - dist.min(1, keepdims=True)) / sigv)
# shoulders (clavicles) only take a little
W[:, [5, 9]] *= 0.35
top4 = np.argsort(-W, 1)[:, :4]; Wt = np.take_along_axis(W, top4, 1); Wt /= Wt.sum(1, keepdims=True)
# ---- per-corner UVs: front view, back view, or side view, by face normal
p0, p1, p2 = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]
nrm = np.cross(p1 - p0, p2 - p0); nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-9
armV = np.isin(top4[:, 0], [6, 7, 8, 10, 11, 12]) & (P[:, 1] < min(J['shR'][1], J['shL'][1]) - 0.12)   # shoulders may use the side view
# side views only colour faces near the outline; steep steps inside the body (a coat edge over trousers) keep the front/back
dtv = np.concatenate([dt, dt])
useSide = (np.abs(nrm[:, 0]) > cfg.get('sideAt', 0.8)) & ~armV[F].any(1) & (dtv[F].max(1) < cfg.get('sideBand', 0.08))
useBack = (~useSide) & (nrm[:, 2] < 0)
Pc = P[F.ravel()]
uvF = np.stack([(Pc[:, 0] / px['front'] + cxf), bot['front'] - Pc[:, 1] / px['front']], 1)
uvB = np.stack([ub(Pc[:, 0]), rowOf('back', Pc[:, 1])], 1)
uvS = np.stack([czs - sgn * Pc[:, 2] / px['side'], rowOf('side', Pc[:, 1])], 1)
if 'side2' in M:
    # a view with the nose pointing left sees the figure's left flank (+x); pointing right sees -x
    uvS2 = np.stack([czs2 - sgn2 * Pc[:, 2] / px['side2'], rowOf('side2', Pc[:, 1])], 1)
    plusIsSide = sgn > 0
    fx = np.repeat(nrm[:, 0] > 0, 3)
    pick1 = fx == plusIsSide
    uvS = np.where(pick1[:, None], uvS, uvS2)
# the side view must agree in colour with the front or back view there (ChatGPT's views don't always match)
smp = cv2.GaussianBlur(sheet, (0, 0), 2).astype(np.float32)
def col(uvc):
    c = uvc.reshape(-1, 3, 2).mean(1)
    return smp[np.clip(c[:, 1].round().astype(int), 0, SH - 1), np.clip(c[:, 0].round().astype(int), 0, SW - 1)]
cS, cF, cB = col(uvS), col(uvF), col(uvB)
near = np.minimum(np.linalg.norm(cS - cF, axis=1), np.linalg.norm(cS - cB, axis=1))
useSide &= near < cfg.get('sideTol', 55)
headF = (P[:, 1] > Yf(cfg['joints']['chin'][1]) - 0.03)[F].all(1)
zFa, zBa = np.concatenate([zF, zF]), np.concatenate([zB, zB])
frac = ((P[:, 2] - zBa) / np.maximum(zFa - zBa, 1e-3))[F].mean(1)
useSide |= headF & (np.abs(nrm[:, 0]) > 0.7) & (frac < 0.62)     # the face (front third) keeps the front painting
useSide &= ~(headF & (frac >= 0.62))
headSide = headF & (np.abs(nrm[:, 0]) > 0.55) & (frac < 0.62)     # the head: purely by which way it faces
headSide |= ~headF & (np.abs(nrm[:, 0]) > 0.8) & (near < cfg.get('sideTol', 55)) & ~armV[F].any(1)   # steep body sides
useSide |= headSide
for _ in range(cfg.get('sideSmooth', 3)):
    acc = np.zeros(len(P)); cnt = np.zeros(len(P))
    np.add.at(acc, F.ravel(), np.repeat(useSide.astype(float), 3)); np.add.at(cnt, F.ravel(), 1)
    useSide = ((acc / np.maximum(cnt, 1))[F].mean(1) > 0.5) | headSide
useSide = (useSide | headSide) & ~(headF & (frac >= 0.62)) & ~armV[F].any(1)
useBack = (~useSide) & (nrm[:, 2] < 0)
k = np.repeat(np.where(useSide, 2, np.where(useBack, 1, 0)), 3)
uv = np.where((k == 2)[:, None], uvS, np.where((k == 1)[:, None], uvB, uvF))
UV = np.stack([uv[:, 0] / (SW - 1), 1 - uv[:, 1] / (SH - 1)], 1).astype(np.float32)
# ---- blended texturing (per vertex): coordinates into the front, back and side paintings plus weights, mixed in the
# shader. Front fades into side over a band of facing angles and into back across the rim, so there are no hard seams.
vn = np.zeros_like(P); fa = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
for c in range(3): np.add.at(vn, F[:, c], fa)
vn /= np.linalg.norm(vn, axis=1, keepdims=True) + 1e-9
ss_ = lambda e0, e1, v: np.clip((v - e0) / (e1 - e0), 0, 1) ** 2 * (3 - 2 * np.clip((v - e0) / (e1 - e0), 0, 1))
def tc(u, v): return np.stack([u / (SW - 1), 1 - v / (SH - 1)], 1).astype(np.float32)
vF = tc(P[:, 0] / px['front'] + cxf, bot['front'] - P[:, 1] / px['front'])
vB = tc(ub(P[:, 0]), rowOf('back', P[:, 1]))
s1 = np.stack([czs - sgn * P[:, 2] / px['side'], rowOf('side', P[:, 1])], 1)
if 'side2' in M:
    s2 = np.stack([czs2 - sgn2 * P[:, 2] / px['side2'], rowOf('side2', P[:, 1])], 1)
    s1 = np.where(((vn[:, 0] > 0) == (sgn > 0))[:, None], s1, s2)
vS = tc(s1[:, 0], s1[:, 1])
headVv0 = P[:, 1] > Yf(cfg['joints']['chin'][1]) - 0.03
wS = np.where(headVv0, ss_(0.25, 0.55, np.abs(vn[:, 0])), ss_(0.4, 0.72, np.abs(vn[:, 0])))
headVv = P[:, 1] > Yf(cfg['joints']['chin'][1]) - 0.03
fracV = (P[:, 2] - zBa) / np.maximum(zFa - zBa, 1e-3)
pxu, pxv = vF[:, 0] * (SW - 1), (1 - vF[:, 1]) * (SH - 1)
ellV = ((pxu - cxf) / rx) ** 2 + ((pxv - fcy) / ry) ** 2
# the face stays front-painted: no side painting in the front part of the head's depth near the face (the side
# paintings' profile eye and nose would land on the cheeks); ears and the back half of the head do take it
faceZone = np.maximum(ss_(0.36, 0.5, fracV), ss_(0.5, 0.64, fracV) * ss_(2.2, 1.4, ellV))   # only hair/ears behind the face
wS *= np.where(headVv, 1 - faceZone, 1.0)
armVv = np.isin(top4[:, 0], [6, 7, 8, 10, 11, 12]) & (P[:, 1] < min(J['shR'][1], J['shL'][1]) - 0.12)
wS *= ~armVv                                                           # arms: side views show hair/body over them
def colAt(t):
    q = np.stack([t[:, 0] * (SW - 1), (1 - t[:, 1]) * (SH - 1)], 1)
    return smp[np.clip(q[:, 1].round().astype(int), 0, SH - 1), np.clip(q[:, 0].round().astype(int), 0, SW - 1)]
nearV = np.minimum(np.linalg.norm(colAt(vS) - colAt(vF), axis=1), np.linalg.norm(colAt(vS) - colAt(vB), axis=1))
wS *= np.where(headVv, 1.0, ss_(48, 26, nearV))                        # body: only where the side view agrees (its arms hang over the torso)
wS = np.clip(wS, 0, 1)
# smooth the weights over the mesh a little
for _ in range(2):
    acc = np.zeros(len(P)); cnt = np.zeros(len(P))
    for c in range(3): np.add.at(acc, F[:, c], wS[F].mean(1)); np.add.at(cnt, F[:, c], 1)
    wS = 0.5 * wS + 0.5 * acc / np.maximum(cnt, 1)
wB = ss_(0.12, -0.2, vn[:, 2])     # how much the surface faces backwards; colour = mix(mix(front, back, wB), side, wS)
WTS = np.stack([wS, wB], 1).astype(np.float32)

# ---- a narrower stance: the sheets are drawn with feet wide apart. Only the legs move, from the crotch down (the
# pelvis and waist stay exactly as painted), each leg shifted as a whole so it keeps its width, growing linearly to the
# full amount at the feet. Gowns with no gap between the legs are left alone.
cu = int(round(cxf)); crotch = None
for r in range(int(bot['front']) - 5, int(top['front']), -1):
    if M['front'][r, cu - 2:cu + 3].any(): crotch = r; break
fx = (np.array([footL_u, footR_u]) - cxf) * px['front']; F_ = float(np.abs(fx).mean())
T_ = cfg.get('stance', max(0.09, 0.55 * F_))
if crotch is not None and crotch < bot['front'] - 0.12 * (bot['front'] - top['front']) and F_ > T_ + 0.01:
    yc = Yf(crotch)
    k_ = np.clip((yc - P[:, 1]) / yc, 0, 1)
    side = np.tanh(P[:, 0] / 0.02)                      # which leg (a hard switch, smoothed over 2 cm at the middle)
    armW = (Wt * np.isin(top4, [6, 7, 8, 10, 11, 12])).sum(1)     # hands hanging by the legs stay with their arms
    P[:, 0] -= (F_ - T_) * k_ * side * (1 - armW)
    print('stance', round(F_, 3), '->', round(T_, 3), 'from crotch at', round(yc, 2))
else:
    print('stance kept (gown or already narrow)')
np.savez(os.path.join(D, name + '_turn.npz'), P=P, F=F.astype(np.int32), UV=UV, kind=kind, vF=vF, vS=vS, vB=vB, WTS=WTS,
         bones=json.dumps([[b, p, J[h].tolist(), J[t].tolist()] for b, p, h, t in BONES]), wi=top4.astype(np.int32), wv=Wt.astype(np.float32))
# texture: the sheet with each figure's colours bled outward (no grey halo at the edges)
# only trust confident pixels: nearly opaque, and not background-coloured near the outline (gaps between curls,
# wisps); everything else takes the nearest confident colour, so no grey backdrop survives in the hair
allA = np.maximum.reduce([A[v] for v in VIEWS])
allm = np.logical_or.reduce([M[v] for v in VIEWS])
bgc = np.median(sheet[allA < 0.02].reshape(-1, 3), 0)
edge = cv2.distanceTransform(allm.astype(np.uint8), cv2.DIST_L2, 5)
bglike = (np.linalg.norm(sheet.astype(np.float32) - bgc, axis=2) < cfg.get('bgTol', 24)) & (edge < 24)
core = cv2.erode((allm & (allA > 0.93) & ~bglike).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
print('background', bgc.round(), 'grey pixels replaced', int((allm & ~core).sum()))
_, (iy, ix) = ndimage.distance_transform_edt(~core, return_indices=True)
tex = sheet[iy, ix]
# the paintings have a pale halo where hair meets the backdrop, and the cutout calls it solid. In a band along the
# outline, treat each pixel as a mix of the colour just inside (F) and the backdrop (B), estimate how much backdrop
# is in it, and take it out: strand detail stays, the grey goes
BAND = cfg.get('haloBand', 9)
inner = cv2.erode(core.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * BAND + 1, 2 * BAND + 1))) > 0
_, (jy, jx) = ndimage.distance_transform_edt(~inner, return_indices=True)
Fc = cv2.GaussianBlur(sheet, (0, 0), 2.5)[jy, jx].astype(np.float32)
band = allm & ~inner
I = tex.astype(np.float32); FB = Fc - bgc
a_ = np.clip(((I - bgc) * FB).sum(2) / np.maximum((FB * FB).sum(2), 1.0), 0, 1)
af = np.maximum(a_, 0.62)[..., None]                 # never boost a pixel more than ~1.6x (that oversaturates)
un = (I - (1 - af) * bgc) / af
lum = lambda c: c @ np.array([0.114, 0.587, 0.299], np.float32)
sat = lambda c: c.max(2) - c.min(2)
fix = band & (a_ < 0.92) & (np.linalg.norm(FB, axis=2) > 25) & (lum(I) > lum(Fc) + 6) & (sat(I) < sat(Fc) - 8)   # paler and greyer than inside
new = np.clip(un, 0, 255)
tex = tex.copy(); tex[fix] = new[fix].astype(np.uint8)
halo = fix
print('halo pixels', int(halo.sum()))
cv2.imwrite(os.path.join(D, name + '_tex.png'), tex)
print('head centre height', round(float(Yf(cfg['joints'].get('face', cfg['joints']['chin'])[1])), 3))
print('verts', len(P), 'faces', len(F), 'side faces', int(useSide.sum()))
