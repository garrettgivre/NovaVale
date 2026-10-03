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
# the generator's surface is noisy (hair comes out as spikes and crumbs): smooth it without shrinking it
if cfg.get('genSmooth', 10): trimesh.smoothing.filter_taubin(m, lamb=0.5, nu=-0.53, iterations=int(cfg.get('genSmooth', 10)))
V0 = np.asarray(m.vertices, np.float64); F = np.asarray(m.faces, np.int64)

def sil(P, view):   # silhouette of the mesh in a view's sheet pixels
    if view == 'front': u, v = P[:, 0] / px['front'] + cxf, bot['front'] - P[:, 1] / px['front']
    elif view == 'side2': u, v = meta['czs2'] + sgn * P[:, 2] / px['side2'], rowOf('side2', P[:, 1])
    elif view == 'back': u, v = cxb - P[:, 0] / px['back'], rowOf('back', P[:, 1])
    else: u, v = czs - sgn * P[:, 2] / px['side'], rowOf('side', P[:, 1])
    pts = np.stack([u, v], 1)[F].round().astype(np.int32)
    img = np.zeros((SH, SW), np.uint8)
    for t in pts: cv2.fillConvexPoly(img, t, 1)     # (fillPoly on the whole list cancels overlapping triangles)
    return img
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

# ---- pull the shape onto the painted outlines: row by row, stretch and shift it so its outline spans what the painting's
# does (front view: left to right; side view: front to back, above the hips only, since the side views often stand with
# one foot forward). The generator follows the views closely but not to the pixel, and the paintings are projected onto
# the shape, so a profile a centimetre out put the lips on the cheek.
from scipy import ndimage
J = {k: np.array(v) for k, v in meta['J'].items()}
def rowfit(P, view):
    S, Mk = sil(P, view), (Mf if view == 'front' else Ms if view == 'side' else mask(view))
    a = np.full(SH, np.nan); cm = np.full(SH, np.nan); cp = np.full(SH, np.nan)
    for r in range(SH):
        xm, xp = np.nonzero(S[r])[0], np.nonzero(Mk[r])[0]
        if len(xm) > 3 and len(xp) > 3:
            a[r] = np.clip((xp[-1] - xp[0]) / max(xm[-1] - xm[0], 1), 0.9, 1.12); cm[r] = (xm[-1] + xm[0]) / 2; cp[r] = (xp[-1] + xp[0]) / 2
    ok = np.isfinite(a); rr = np.arange(SH)
    if ok.sum() < 10: return None
    # (smoothed over a few centimetres of height: row by row, curls and strands made every row a different stretch,
    # which ridged the head like a stack of plates)
    f = lambda q: ndimage.gaussian_filter1d(np.interp(rr, rr[ok], q[ok]), cfg.get('fitSmooth', 18))
    return f(a), f(cm), f(cp - cm) 
for it in range(1):
    fa = rowfit(P, 'front')
    if fa:
        u, v = P[:, 0] / px['front'] + cxf, np.clip(bot['front'] - P[:, 1] / px['front'], 0, SH - 1)
        a_, cm_, d_ = (np.interp(v, np.arange(SH), q) for q in fa)
        P[:, 0] = ((cm_ + d_ + a_ * (u - cm_)) - cxf) * px['front']
    fa = rowfit(P, 'side')
    if fa:
        u, v = czs - sgn * P[:, 2] / px['side'], np.clip(rowOf('side', P[:, 1]), 0, SH - 1)
        a_, cm_, d_ = (np.interp(v, np.arange(SH), q) for q in fa)
        w_ = np.clip((P[:, 1] - J['hips'][1]) / 0.12, 0, 1)
        P[:, 2] += w_ * (sgn * (czs - (cm_ + d_ + a_ * (u - cm_))) * px['side'] - P[:, 2])
print('after fitting to the outlines: front', round(iou(sil(P, 'front'), Mf), 3), 'side', round(iou(sil(P, 'side'), Ms), 3))
cv2.imwrite(os.path.join(D, name + '_genfit.png'), np.concatenate([np.stack([Mf * 255, sil(P, 'front') * 255, Mf * 0], 2), np.stack([Ms * 255, sil(P, 'side') * 255, Ms * 0], 2)], 1))

# the other two paintings (back, and the second side) are lined up the other way round: the shape stays, and their
# lookups are stretched and shifted row by row so each painting's outline lands on the shape's. The second side view is
# drawn separately and sits a centimetre or two differently on its own centre; unregistered, its profile face showed
# beside the real one from that side.
fitB = rowfit(P, 'back'); fit2 = rowfit(P, 'side2') if 'side2' in px else None
def uvfit(u, v, fa, w=1.0):
    if not fa: return u
    a_, cm_, d_ = (np.interp(np.clip(v, 0, SH - 1), np.arange(SH), q) for q in fa)
    return u + w * ((cm_ + d_ + a_ * (u - cm_)) - u)

# ---- the rig: weights from the flat build's nearest vertices (it worked them out inside the front painting)
P0 = Z['P0']; wi0, wv0 = Z['wi'], Z['wv']; NB = len(json.loads(str(Z['bones'])))
Wd = np.zeros((len(P0), NB), np.float32); np.put_along_axis(Wd, wi0, wv0, 1)
d_, ix = cKDTree(P0).query(P, k=6); w_ = 1.0 / (d_ + 1e-3) ** 2; w_ /= w_.sum(1, keepdims=True)
W = (Wd[ix] * w_[..., None]).sum(1)
# hands: a hand hangs a few centimetres from the thigh, and the nearest flat-build vertex to a fingertip is often on
# the leg, so fingers stayed behind when the arm moved. Round each hand, take the weights from the nearest vertex
# outside that zone measured along the surface instead: a finger leads back up the wrist, the thigh to the thigh.
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
E = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]); el = np.linalg.norm(P[E[:, 0]] - P[E[:, 1]], axis=1)
G = coo_matrix((np.concatenate([el, el]), (np.concatenate([E[:, 0], E[:, 1]]), np.concatenate([E[:, 1], E[:, 0]]))), shape=(len(P), len(P))).tocsr()
def seg2(p, a, b):
    ab = b - a; t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)
zone = np.zeros(len(P), bool)
for s_ in 'RL':
    wr, tip = J['wr' + s_][:2], J['tip' + s_][:2]
    zone |= seg2(P[:, :2], wr, tip + (tip - wr) * 0.6) < cfg.get('handZone', 0.085)
seeds = np.nonzero(~zone)[0]
if zone.any() and len(seeds):
    dist, pred, srcs = dijkstra(G, indices=seeds, min_only=True, return_predecessors=True)
    okz = zone & (srcs >= 0)
    W[okz] = W[srcs[okz]]
    for s_, (fo, ha) in (('R', (7, 8)), ('L', (11, 12))):     # past the wrist the forearm's share passes to the hand bone
        wr, tip = J['wr' + s_][:2], J['tip' + s_][:2]; ax = (tip - wr) / np.linalg.norm(tip - wr)
        t = np.clip(((P[:, :2] - wr) @ ax) / 0.03, 0, 1) * okz * (seg2(P[:, :2], wr, tip + (tip - wr) * 0.6) < cfg.get('handZone', 0.085))
        mv = W[:, fo] * t; W[:, fo] -= mv; W[:, ha] += mv
        # the hand's own core is the hand's whatever the surface says (a fingertip fused to the shorts)
        core = zone & (seg2(P[:, :2], wr + (tip - wr) * 0.25, tip + (tip - wr) * 0.9) < 0.04) & (W[:, [6, 7, 8, 10, 11, 12]].sum(1) < 0.5)
        W[core] = 0; W[core, ha] = 1
    print('hand zone:', int(zone.sum()), 'vertices; to an arm', int((W[okz][:, [6, 7, 8, 10, 11, 12]].sum(1) > 0.5).sum()))
top4 = np.argsort(-W, 1)[:, :4]; Wt = np.take_along_axis(W, top4, 1); Wt /= Wt.sum(1, keepdims=True)

# split chosen triangles in four, and their neighbours in two or three so every new edge point is shared: splitting only
# the chosen ones leaves points on the border that the neighbours don't have, and when the face moved, cracks opened along
# it (a dotted pale line down the cheek)
def refine(P, F, W, sel):
    N = len(P); key = lambda a, b: np.minimum(a, b) * N + np.maximum(a, b)
    fe = np.stack([key(F[:, 0], F[:, 1]), key(F[:, 1], F[:, 2]), key(F[:, 2], F[:, 0])], 1)
    uk = np.unique(fe[sel].ravel()); a_, b_ = uk // N, uk % N
    P2 = np.concatenate([P, (P[a_] + P[b_]) / 2]); W2 = np.concatenate([W, (W[a_] + W[b_]) / 2])
    pos = np.searchsorted(uk, fe); pos = np.clip(pos, 0, len(uk) - 1); has = uk[pos] == fe; mid = np.where(has, N + pos, -1)
    cnt = has.sum(1); out = [F[cnt == 0]]
    f3, m3 = F[cnt == 3], mid[cnt == 3]
    out += [np.stack([f3[:, 0], m3[:, 0], m3[:, 2]], 1), np.stack([f3[:, 1], m3[:, 1], m3[:, 0]], 1), np.stack([f3[:, 2], m3[:, 2], m3[:, 1]], 1), m3]
    for k in range(3):      # one split edge: (k, k+1)
        q = (cnt == 1) & has[:, k]; f, m = F[q], mid[q][:, k]; v0, v1, v2 = f[:, k], f[:, (k + 1) % 3], f[:, (k + 2) % 3]
        out += [np.stack([v0, m, v2], 1), np.stack([m, v1, v2], 1)]
    for k in range(3):      # two split edges: all but (k+2, k)
        q = (cnt == 2) & ~has[:, (k + 2) % 3]; f = F[q]; v0, v1, v2 = f[:, k], f[:, (k + 1) % 3], f[:, (k + 2) % 3]
        m01, m12 = mid[q][:, k], mid[q][:, (k + 1) % 3]
        out += [np.stack([m01, v1, m12], 1), np.stack([v0, m01, m12], 1), np.stack([v0, m12, v2], 1)]
    return P2, np.concatenate(out).astype(np.int64), W2

# ---- the face: the flat build modelled it from the head painting; lay that surface into the front of this head
n0 = int(meta['n']); wM0 = Z['wFace']
if wM0.max() > 0:
    fzI, fwI = LinearNDInterpolator(P0[:n0, :2], P0[:n0, 2]), LinearNDInterpolator(P0[:n0, :2], wM0)
    # how far inside the face each point is: the inlay fades out over the face's outer two centimetres, so the cheeks'
    # edges and the jaw stay the generated head's (laid in to the very edge, the face stood proud of the head at the
    # cheeks, with a ridge and a doubled ear behind it at a three-quarter view)
    outT = cKDTree(P0[:n0][wM0 < 0.999, :2])
    def facew(P, F):
        fz, fw = fzI(P[:, :2]), fwI(P[:, :2])
        nz = trimesh.Trimesh(P, F, process=False).vertex_normals[:, 2]
        ok = np.isfinite(fz) & np.isfinite(fw) & (P[:, 1] > meta['chinY'] - 0.1)
        fz = np.nan_to_num(fz); dz = P[:, 2] - fz
        # only skin moves: hair that hangs in front of the face (a fringe) stays where the generator put it, and so does
        # whatever lies well behind (the far side of the head)
        near = np.clip((0.035 - dz) / 0.02, 0, 1) * np.clip((dz + 0.07) / 0.03, 0, 1)
        dIn = np.where(np.nan_to_num(fw) > 0.999, outT.query(P[:, :2])[0], 0.0)
        inner = np.clip((dIn - 0.004) / cfg.get('faceInset', 0.02), 0, 1); inner = inner * inner * (3 - 2 * inner)
        return fz, np.where(ok, inner * np.clip((nz + 0.1) / 0.3, 0, 1) * near, 0)
    # the face needs far more points than the rest (a whole-body shape leaves it a few hundred): split its triangles
    for _ in range(2):
        _, wgt = facew(P, F); sel = np.nonzero((wgt[F] > 0.02).any(1))[0]
        P, F, W = refine(P, F, W, sel)
    top4 = np.argsort(-W, 1)[:, :4]; Wt = np.take_along_axis(W, top4, 1); Wt /= Wt.sum(1, keepdims=True)
    fz, wgt = facew(P, F)
    P[:, 2] += wgt * (fz - P[:, 2])
    # ease the join: round the inlay (and under a fringe, where hair stays put and skin moves) the surface is relaxed
    # towards its neighbours, so no cliff is left between them (it showed as a dark slit beside the nose)
    E2 = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]); E2 = np.concatenate([E2, E2[:, ::-1]])
    A2 = coo_matrix((np.ones(len(E2)), (E2[:, 0], E2[:, 1])), shape=(len(P), len(P))).tocsr(); A2.data[:] = 1; deg = np.maximum(A2.sum(1).A1, 1)
    fwv = np.nan_to_num(fwI(P[:, :2]))
    relax = np.clip(fwv * 3, 0, 1) * np.clip((1 - wgt) * 2, 0, 1) * (P[:, 1] > meta['chinY'] - 0.1) * (P[:, 2] > fz - 0.08)
    for _ in range(int(cfg.get('faceRelax', 12))):
        P[:, 2] += 0.6 * relax * (A2 @ P[:, 2] / deg - P[:, 2])
    print('face laid in over', int((wgt > 0.5).sum()), 'vertices')

# ---- where each vertex looks in the four paintings
tc = lambda u, v: np.stack([u / (SW - 1), 1 - v / (SH - 1)], 1).astype(np.float32)
# each lookup stays inside its own view of the sheet: where the shape reaches past a painting's outline (hair deeper
# than it was painted), the lookup ran on into the neighbouring view and put its face on the back of the head
def lim(view):
    xs = np.nonzero(mask(view).any(0))[0]; return xs.min() - 5, xs.max() + 5
cl = lambda u, view: np.clip(u, *lim(view))
vF = tc(cl(P[:, 0] / px['front'] + cxf, 'front'), bot['front'] - P[:, 1] / px['front'])
vB = tc(cl(uvfit(cxb - P[:, 0] / px['back'], rowOf('back', P[:, 1]), fitB), 'back'), rowOf('back', P[:, 1]))
# the arms swung down to hang, as the side views are painted, and then forward or back until the hand lies on the
# painted hand (found by its colour: the side views carry the hand a little in front of the hip, and a hand hanging
# straight down left the painted one stranded on the shorts as a second hand)
sheetI = cv2.GaussianBlur(cv2.imread(os.path.join(D, cfg['sheet']), cv2.IMREAD_UNCHANGED)[..., :3], (0, 0), 1.5).astype(np.float32)
side2 = 'side2' in px; Mside = {'side': Ms}
if side2: Mside['side2'] = mask('side2')
vw = {'side': (czs, sgn), 'side2': (meta['czs2'], -sgn) if side2 else None}
Qh = P.copy()
for s_, js in (('R', (6, 7, 8)), ('L', (10, 11, 12))):
    wA = (Wt * np.isin(top4, js)).sum(1)
    sh_, wr_ = J['sh' + s_][:2], J['wr' + s_][:2]; v_ = wr_ - sh_; th = -np.arctan2(v_[0], -v_[1])
    R_ = np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]])
    Qh[:, :2] += wA[:, None] * (((P[:, :2] - sh_) @ R_.T + sh_) - P[:, :2])
    hand = (W[:, js[2]] > 0.5)
    view = ('side' if ((sgn > 0) == (s_ == 'L')) != bool(cfg.get('swapSides')) else 'side2') if side2 else 'side'      # the painting of this arm's flank
    if hand.sum() > 20:
        cu, cv_ = np.clip((P[hand, 0] / px['front'] + cxf).round().astype(int), 0, SW - 1), np.clip((bot['front'] - P[hand, 1] / px['front']).round().astype(int), 0, SH - 1)
        ch = np.median(sheetI[cv_, cu], 0)
        r0, r1 = int(rowOf(view, Qh[hand, 1].max() + 0.02)), int(rowOf(view, Qh[hand, 1].min() - 0.02))
        cz_, sg_ = vw[view]; zs = float(J['sh' + s_][2])
        sub = sheetI[max(r0, 0):r1 + 1]; near = (np.linalg.norm(sub - ch, axis=2) < cfg.get('handTol', 38)) & (Mside[view][max(r0, 0):r1 + 1] > 0)
        cols = np.nonzero(near)[1]; zc = sg_ * (cz_ - cols) * px[view]; zc = zc[np.abs(zc - zs) < 0.2]
        if len(zc) > 0.25 * (r1 - r0 + 1) * (0.05 / px[view]):
            dz = float(np.clip(np.median(zc) - np.median(Qh[hand, 2]), -0.14, 0.14)); L = max(float(J['sh' + s_][1] - np.median(Qh[hand, 1])), 0.2)
            a_ = np.arctan2(dz, L); ya, za = Qh[:, 1] - J['sh' + s_][1], Qh[:, 2] - zs
            Qh[:, 1] += wA * ((ya * np.cos(a_) + za * np.sin(a_)) - ya); Qh[:, 2] += wA * ((-ya * np.sin(a_) + za * np.cos(a_)) - za)
            print('arm', s_, 'swung', round(dz, 3), 'm to the painted hand')
        else: print('arm', s_, ': painted hand not found by colour, left hanging straight')
Q = Qh[:, :2]
s_side = np.stack([cl(czs - sgn * Qh[:, 2] / px['side'], 'side'), rowOf('side', Q[:, 1])], 1)
if side2:
    s_side2 = np.stack([cl(uvfit(meta['czs2'] + sgn * Qh[:, 2] / px['side2'], rowOf('side2', Q[:, 1]), fit2, np.clip((P[:, 1] - J['hips'][1]) / 0.12, 0, 1)), 'side2'), rowOf('side2', Q[:, 1])], 1)
    sA, sB = (s_side, s_side2) if sgn > 0 else (s_side2, s_side)
else: sA = sB = s_side
if cfg.get('swapSides'): sA, sB = sB, sA   # the sheet's side views show the opposite flanks to what its front view implies
vS1, vS2 = tc(sA[:, 0], sA[:, 1]), tc(sB[:, 0], sB[:, 1])
# ---- which paintings can see each vertex. A painting only shows the outermost surface along its line of sight; without
# this the inside of a lock of hair on the far side of the head, which faces sideways, was painted with the profile's nose
# and brow, and the body behind a hanging arm with the sleeve. Depth buffers of the shape from the four directions
# (the sides with the arms hung, as they are painted); a vertex more than a centimetre or so behind the buffer is hidden.
def seen(u, v, d, tol=0.015):
    buf = np.full((SH, SW), -1e9, np.float32)
    for b in ((1, 0, 0), (0, 1, 0), (0, 0, 1), (.5, .5, 0), (0, .5, .5), (.5, 0, .5), (1 / 3, 1 / 3, 1 / 3)):
        b = np.array(b); uu, vv, dd = (u[F] * b).sum(1), (v[F] * b).sum(1), (d[F] * b).sum(1)
        np.maximum.at(buf, (np.clip(vv.round().astype(int), 0, SH - 1), np.clip(uu.round().astype(int), 0, SW - 1)), dd.astype(np.float32))
    buf = ndimage.maximum_filter(buf, 3)
    gap = buf[np.clip(v.round().astype(int), 0, SH - 1), np.clip(u.round().astype(int), 0, SW - 1)] - d
    return 1 - np.clip((gap - tol) / tol, 0, 1)
uF, vFp = P[:, 0] / px['front'] + cxf, bot['front'] - P[:, 1] / px['front']
VIS = np.stack([seen(uF, vFp, P[:, 2]), seen(cxb - P[:, 0] / px['back'], rowOf('back', P[:, 1]), -P[:, 2]),
                seen(sA[:, 0], sA[:, 1], Q[:, 0]), seen(sB[:, 0], sB[:, 1], -Q[:, 0])], 1).astype(np.float32)
print('seen by front/back/sides:', [round(float(q), 2) for q in VIS.mean(0)])
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

# cut the arms free where the generator fused a hand to the hip or a sleeve to the coat: triangles whose corners disagree
# about belonging to an arm stretched into long slivers when the arm moved
armn = (Wt * np.isin(top4, [6, 7, 8, 10, 11, 12])).sum(1)
keep = (armn[F].max(1) - armn[F].min(1)) < cfg.get('armCut', 0.5)
print('arm/body bridge triangles cut', int((~keep).sum()))
F = F[keep]
F = F[:, [0, 1, 2]].astype(np.int32)
np.savez(os.path.join(D, name + '_turn.npz'), P=P.astype(np.float32), F=F, UV=vF[F.ravel()], kind=np.zeros(len(F), np.int32), vF=vF, vS=vS1, vB=vB,
         WTS=np.zeros((len(P), 2), np.float32), vS1=vS1, vS2=vS2, vis=VIS, bones=str(Z['bones']), wi=top4.astype(np.int32), wv=Wt.astype(np.float32), gen=1)
print('verts', len(P), 'faces', len(F))
