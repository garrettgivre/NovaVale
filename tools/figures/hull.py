# Shape the head from its own paintings: python hull.py <who>   (after head2.py; then head2.py again and bake)
# The generated head only roughly follows the art, so paintings projected onto it spill over its edges or stop short,
# and its hair is a lump. Here every view of the second head sheet (placed by head2.py) carves a block of space down to
# what all of them agree is inside the head (a visual hull), and the head's surface is moved in or out, along lines
# from the head's vertical axis, to sit on it. The face keeps its modelled shape. Vertices, faces, UVs and skin weights
# stay as they are; only positions change. The original positions are kept in the file (P_gen), so it can be run again.
import os, sys, json, numpy as np, cv2
from scipy import ndimage
D = os.path.dirname(os.path.abspath(__file__)); name = sys.argv[1]
cfg = json.load(open(os.path.join(D, name + '.json')))
fn = os.path.join(D, name + '_turn.npz'); Z = dict(np.load(fn)); P = (Z['P_gen'] if 'P_gen' in Z else Z['P']).astype(np.float64).copy(); Z['P_gen'] = P.astype(np.float32).copy()
H2 = json.load(open(os.path.join(D, name + '_head2.json'))); m2 = cv2.imread(os.path.join(D, name + '_head2_mask.png'), 0) > 127
meta = json.loads(str(np.load(os.path.join(D, name + '_flat.npz'))['meta'])); chin = meta['chinY']
hj = json.load(open(os.path.join(D, name + '_head.json')))
hv = P[:, 1] > chin - 0.02; ph = P[hv]
hc = np.array([np.median(ph[:, 0]), (ph[:, 2].max() + ph[:, 2].min()) / 2 - 0.01])
# ---- carve
st = 0.0025; R = 0.24; y0, y1 = chin - 0.02, ph[:, 1].max() + 0.04
gx, gy, gz = np.meshgrid(np.arange(-R, R, st), np.arange(y0, y1, st), np.arange(-R, R, st), indexing='ij')
X, Y, Zz = gx + hc[0], gy, gz + hc[1]; inside = np.ones(X.shape, bool)
tol = cv2.dilate(m2.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))) > 0        # a few pixels' grace for placement errors
yaws = [v['yaw'] for v in H2['views']]; views = [dict(v, mir=1) for v in H2['views']]
for v in H2['views']:
    if 20 < abs(v['yaw']) < 160 and not any(abs(y + v['yaw']) < 30 for y in yaws) and not cfg.get('noMirror'): views.append(dict(v, mir=-1))
for v in views:
    th = np.radians(v['yaw']); x_ = (X - hc[0]) * v['mir'] + hc[0]
    u = ((x_ * np.cos(th) - Zz * np.sin(th)) * v['s'] + v['t'][0]).round().astype(int); w = (-Y * v['s'] + v['t'][1]).round().astype(int)
    cx0, cy0, cx1, cy1 = v['cell']; ok = (u >= cx0) & (u < cx1) & (w >= cy0) & (w < cy1)
    inside &= ok & tol[np.clip(w, 0, m2.shape[0] - 1), np.clip(u, 0, m2.shape[1] - 1)]
print('hull voxels', int(inside.sum()), 'from', len(views), 'views')
# ---- the hull's radius by direction round the head and height
NB = 180; phi = np.arctan2(gx, gz); rad = np.hypot(gx, gz)
bi = ((phi + np.pi) / (2 * np.pi) * NB).astype(int) % NB; yi = ((gy - y0) / st).round().astype(int); NY = yi.max() + 1
rh = np.zeros((NY, NB), np.float32); np.maximum.at(rh, (yi[inside], bi[inside]), rad[inside].astype(np.float32))
rh = ndimage.maximum_filter(rh, (1, 3), mode=('nearest', 'wrap'))
rh = ndimage.gaussian_filter(rh, (2.0, 1.5), mode=('nearest', 'wrap'))
# ---- move the head's surface onto it
dx, dz = ph[:, 0] - hc[0], ph[:, 2] - hc[1]; r = np.hypot(dx, dz); f = np.arctan2(dx, dz)
fb = (f + np.pi) / (2 * np.pi) * NB - 0.5; fy = np.clip((ph[:, 1] - y0) / st, 0, NY - 1)
rH = ndimage.map_coordinates(rh, [fy, fb % NB], order=1, mode='wrap')
lo = cfg.get('hullMin', 0.9)
rN = np.where(rH > 0.02, np.clip(r, lo * rH, rH), r)
# the face keeps its shape (it was modelled from the painting), and the change fades in above the chin
fxp, fyp, frx, fry = hj['f']; px = meta['px']['front']
qx = (ph[:, 0] - (fxp - meta['cxf']) * px) / (frx * px); qy = (ph[:, 1] - (meta['bot']['front'] - fyp) * px) / (fry * px)
face = np.clip(1.6 - (qx ** 2 + qy ** 2), 0, 1) * (dz > 0)
w = np.clip((ph[:, 1] - chin) / 0.03, 0, 1) * (1 - face) * cfg.get('hullAmount', 1.0)
k = 1 + w * (rN / np.maximum(r, 1e-4) - 1)
ph2 = ph.copy(); ph2[:, 0] = hc[0] + dx * k; ph2[:, 2] = hc[1] + dz * k
P[hv] = ph2
# smooth the moved part a little over the surface
F = Z['F']; E = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]); E = np.concatenate([E, E[:, ::-1]])
from scipy.sparse import coo_matrix
A = coo_matrix((np.ones(len(E)), (E[:, 0], E[:, 1])), shape=(len(P), len(P))).tocsr(); A.data[:] = 1; deg = np.maximum(A.sum(1).A1, 1)
wv = np.zeros(len(P)); wv[hv] = w
for _ in range(int(cfg.get('hullSmooth', 4))): P += 0.5 * wv[:, None] * ((A @ P) / deg[:, None] - P)
print('moved: mean', round(float(np.abs(k - 1).mean() * 100), 1), '% of radius; outward', int((k > 1.02).sum()), 'inward', int((k < 0.98).sum()), 'of', int(hv.sum()))
Z['P'] = P.astype(np.float32); np.savez(fn, **Z)
import trimesh
trimesh.Trimesh(P, F, process=False).export(os.path.join(D, name + '_fit.obj'))
