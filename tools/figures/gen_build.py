# Put a full 3D shape (Hunyuan3D-2mv, made by gen3d.py from the same turnaround views) under a character:
#   python gen_build.py <who> <shape.glb>
# turn_build.py must have run first: its flat build supplies the rig, the skin weights, the modelled face and everything
# about where the paintings sit (saved in <who>_turn.npz, kept as <who>_flat.npz). This script lines the generated shape
# up with the paintings, textures it by projecting them (the same four lookups the game's shader mixes), copies the
# weights over from the flat build and writes <who>_turn.npz again, so turn_blend.py and the rest carry on unchanged.
import os, sys, json, shutil, numpy as np, cv2, trimesh
from scipy.spatial import cKDTree
from scipy.interpolate import LinearNDInterpolator
D = os.path.dirname(os.path.abspath(__file__))
name, src = sys.argv[1], sys.argv[2]
cfg = json.load(open(os.path.join(D, name + '.json')))
flat = os.path.join(D, name + '_flat.npz')
Z0 = np.load(os.path.join(D, name + '_turn.npz'))
if 'meta' in Z0.files and not ('gen' in Z0.files): Z0.close(); shutil.copyfile(os.path.join(D, name + '_turn.npz'), flat)
Z = np.load(flat); meta = json.loads(str(Z['meta']))
px, top, bot = meta['px'], meta['top'], meta['bot']; HEIGHT = meta['height']; SW, SH = meta['SW'], meta['SH']
cxf, cxb, czs, sgn = meta['cxf'], meta['cxb'], meta['czs'], meta['sgn']
rowOf = lambda v, y: top[v] + (bot[v] - top[v]) * (1 - y / HEIGHT)

def mask(view):
    c = cv2.imread(os.path.join(D, f'{name}_{view}.png'), cv2.IMREAD_UNCHANGED)
    ox, oy = cfg['off'][view]; a = np.zeros((SH, SW), np.uint8)
    a[oy:oy + c.shape[0], ox:ox + c.shape[1]] = c[..., 3] > 127
    return a
Mf, Ms = mask('front'), mask('side')

m = trimesh.load(src, force='mesh')
# keep the main body (the generator leaves the odd floating crumb)
parts = m.split(only_watertight=False)
if len(parts) > 1: m = max(parts, key=lambda q: len(q.faces))
target = int(cfg.get('genFaces', 70000))
if len(m.faces) > target: m = m.simplify_quadric_decimation(face_count=target)
V0 = np.asarray(m.vertices, np.float64); F = np.asarray(m.faces, np.int64)

def sil(P, view):   # silhouette of the mesh in a view's sheet pixels
    if view == 'front': u, v = P[:, 0] / px['front'] + cxf, bot['front'] - P[:, 1] / px['front']
    else: u, v = czs - sgn * P[:, 2] / px['side'], rowOf('side', P[:, 1])
    pts = np.stack([u, v], 1)[F].round().astype(np.int32)
    img = np.zeros((SH, SW), np.uint8); cv2.fillPoly(img, list(pts), 1); return img
iou = lambda a, b: float((a & b).sum()) / max(float((a | b).sum()), 1)
def bbox(a): ys, xs = np.nonzero(a); return xs.min(), xs.max(), ys.min(), ys.max()
fx0, fx1, fy0, fy1 = bbox(Mf); sx0, sx1, sy0, sy1 = bbox(Ms)
xT = ((fx0 + fx1) / 2 - cxf) * px['front']; zT = sgn * (czs - (sx0 + sx1) / 2) * px['side']
yTop = (bot['front'] - fy0) * px['front']; yBot = (bot['front'] - fy1) * px['front']

# which way is it facing? try the four turns about the vertical axis and keep the one whose outlines match the paintings
best = None
for k in range(4):
    a = k * np.pi / 2; R = np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]])
    P = V0 @ R.T
    s = (yTop - yBot) / (P[:, 1].max() - P[:, 1].min()); P = P * s
    P[:, 1] += yBot - P[:, 1].min(); P[:, 0] += xT - (P[:, 0].max() + P[:, 0].min()) / 2; P[:, 2] += zT - (P[:, 2].max() + P[:, 2].min()) / 2
    sc = iou(sil(P, 'front'), Mf) + iou(sil(P, 'side'), Ms)
    if best is None or sc > best[0]: best = (sc, k, P)
print('facing turn', best[1] * 90, 'deg; outline match front', round(iou(sil(best[2], 'front'), Mf), 3), 'side', round(iou(sil(best[2], 'side'), Ms), 3))
P = best[2]
# fine fit: small shifts and scales of x (front outline) and z (side outline)
def fit(P, view, ax, M_):
    bs = (iou(sil(P, view), M_), 1.0, 0.0)
    c = (P[:, ax].max() + P[:, ax].min()) / 2
    for s in np.linspace(0.92, 1.08, 9):
        for d in np.linspace(-0.03, 0.03, 13):
            Q = P.copy(); Q[:, ax] = (Q[:, ax] - c) * s + c + d
            v = iou(sil(Q, view), M_)
            if v > bs[0]: bs = (v, s, d)
    P[:, ax] = (P[:, ax] - c) * bs[1] + c + bs[2]; return bs
print('fit x', [round(float(q), 3) for q in fit(P, 'front', 0, Mf)], 'z', [round(float(q), 3) for q in fit(P, 'side', 2, Ms)])
cv2.imwrite(os.path.join(D, name + '_genfit.png'), np.concatenate([np.stack([Mf * 255, sil(P, 'front') * 255, Mf * 0], 2), np.stack([Ms * 255, sil(P, 'side') * 255, Ms * 0], 2)], 1))

# ---- the rig: weights from the flat build's nearest vertices (it worked them out inside the front painting)
P0 = Z['P0']; wi0, wv0 = Z['wi'], Z['wv']; NB = len(json.loads(str(Z['bones'])))
Wd = np.zeros((len(P0), NB), np.float32); np.put_along_axis(Wd, wi0, wv0, 1)
d_, ix = cKDTree(P0).query(P, k=6); w_ = 1.0 / (d_ + 1e-3) ** 2; w_ /= w_.sum(1, keepdims=True)
W = (Wd[ix] * w_[..., None]).sum(1)
top4 = np.argsort(-W, 1)[:, :4]; Wt = np.take_along_axis(W, top4, 1); Wt /= Wt.sum(1, keepdims=True)

# ---- the face: the flat build modelled it from the head painting; lay that surface into the front of this head
n0 = int(meta['n']); wM0 = Z['wFace']
if wM0.max() > 0:
    fz = LinearNDInterpolator(P0[:n0, :2], P0[:n0, 2])(P[:, :2]); fw = LinearNDInterpolator(P0[:n0, :2], wM0)(P[:, :2])
    m2 = trimesh.Trimesh(P, F, process=False); nz = m2.vertex_normals[:, 2]
    ok = np.isfinite(fz) & np.isfinite(fw) & (P[:, 1] > meta['chinY'] - 0.04) & (P[:, 2] > np.nan_to_num(fz) - 0.06)
    wgt = np.where(ok, np.nan_to_num(fw) * np.clip((nz + 0.1) / 0.4, 0, 1), 0)
    P[:, 2] += wgt * (np.nan_to_num(fz) - P[:, 2])
    print('face laid in over', int((wgt > 0.5).sum()), 'vertices')

# ---- where each vertex looks in the four paintings
tc = lambda u, v: np.stack([u / (SW - 1), 1 - v / (SH - 1)], 1).astype(np.float32)
vF = tc(P[:, 0] / px['front'] + cxf, bot['front'] - P[:, 1] / px['front'])
vB = tc(cxb - P[:, 0] / px['back'], rowOf('back', P[:, 1]))
J = {k: np.array(v) for k, v in meta['J'].items()}
Q = P[:, :2].copy()
for s_, js in (('R', (6, 7, 8)), ('L', (10, 11, 12))):   # arms swung down to hang, as the side views are painted
    wA = (Wt * np.isin(top4, js)).sum(1)
    sh_, wr_ = J['sh' + s_][:2], J['wr' + s_][:2]; v_ = wr_ - sh_; th = -np.arctan2(v_[0], -v_[1])
    R_ = np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]])
    Q += wA[:, None] * (((P[:, :2] - sh_) @ R_.T + sh_) - P[:, :2])
s_side = np.stack([czs - sgn * P[:, 2] / px['side'], rowOf('side', Q[:, 1])], 1)
if 'side2' in px:
    s_side2 = np.stack([meta['czs2'] + sgn * P[:, 2] / px['side2'], rowOf('side2', Q[:, 1])], 1)
    sA, sB = (s_side, s_side2) if sgn > 0 else (s_side2, s_side)
else: sA = sB = s_side
vS1, vS2 = tc(sA[:, 0], sA[:, 1]), tc(sB[:, 0], sB[:, 1])
if meta.get('atlas'):
    AW_, AH_ = meta['atlas']
    re = lambda t: np.stack([t[:, 0] * (SW - 1) / (AW_ - 1), 1 - (1 - t[:, 1]) * (SH - 1) / (AH_ - 1)], 1).astype(np.float32)
    vF, vB, vS1, vS2 = re(vF), re(vB), re(vS1), re(vS2)

# ---- the narrower stance, as in the flat build
if meta.get('stance'):
    yc, F_, T_ = meta['stance']
    k_ = np.clip((yc - P[:, 1]) / yc, 0, 1); side = np.tanh(P[:, 0] / 0.02)
    armW = (Wt * np.isin(top4, [6, 7, 8, 10, 11, 12])).sum(1)
    P[:, 0] -= (F_ - T_) * k_ * side * (1 - armW)

F = F[:, [0, 1, 2]].astype(np.int32)
np.savez(os.path.join(D, name + '_turn.npz'), P=P.astype(np.float32), F=F, UV=vF[F.ravel()], kind=np.zeros(len(F), np.int32), vF=vF, vS=vS1, vB=vB,
         WTS=np.zeros((len(P), 2), np.float32), vS1=vS1, vS2=vS2, bones=str(Z['bones']), wi=top4.astype(np.int32), wv=Wt.astype(np.float32), gen=1)
print('verts', len(P), 'faces', len(F))
