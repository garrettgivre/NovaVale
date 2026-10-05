# Register a second head sheet (six more views of the head from other angles, refs/<who>_head2.png) to the figure's head:
#   python head2.py <who>   -> <who>_head2.json (per view: yaw, scale, offset, cell) and <who>_head2_check.jpg
# The sheet's cells are found by their outlines against the grey backdrop. Views that show the face are placed by face
# landmarks (MediaPipe) against the same landmarks on the model, which also gives the angle the head is seen from; the
# others (back views) use the angle guessed in <who>.json ("head2": {"yaw": [...]}, degrees, + = seen from the character's
# left, so the nose points to the image's left) and are placed by the top and sides of the head's outline.
import os, sys, json, numpy as np, cv2
from scipy import ndimage
from scipy.spatial import cKDTree
D = os.path.dirname(os.path.abspath(__file__)); name = sys.argv[1]
cfg = json.load(open(os.path.join(D, name + '.json'))); h2 = cfg['head2']
img = cv2.imread(os.path.join(D, h2['sheet']))[..., :3]; H, W = img.shape[:2]
bg = np.median(img[:8].reshape(-1, 3), 0)      # (the top edge: busts often run off the bottom)
fg = np.linalg.norm(img.astype(np.float32) - bg, axis=2) > h2.get('tol', 24)
fg = ndimage.binary_fill_holes(cv2.morphologyEx(fg.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) > 0)
# busts that touch are cut apart: the sheet is rows of views (3+3, or 4+3 for seven), and between neighbours the cut goes
# down the emptiest column near the even split
nv_ = len(h2['yaw']); rows_ = h2.get('rows') or ([3, 3] if nv_ == 6 else [4, 3] if nv_ == 7 else [nv_])
ry = np.linspace(0, H, len(rows_) + 1).astype(int)
for r_ in range(1, len(rows_)):
    band = fg[ry[r_] - H // 12: ry[r_] + H // 12].sum(1); fg[ry[r_] - H // 12 + int(np.argmin(band))] = False
for r_, nc in enumerate(rows_):
    for c_ in range(1, nc):
        xm = int(W * c_ / nc); wdt = W // (nc * 5); col = fg[ry[r_]:ry[r_ + 1], xm - wdt: xm + wdt].sum(0)
        fg[ry[r_]:ry[r_ + 1], xm - wdt + int(np.argmin(col))] = False
lab, nl = ndimage.label(fg); sizes = ndimage.sum(fg, lab, range(1, nl + 1)); keep = 1 + np.argsort(-sizes)[:len(h2['yaw'])]      # (a sheet may have more or fewer than six views)
cells = []
for k in keep:
    ys, xs = np.nonzero(lab == k); cells.append((ys.mean(), xs.mean(), int(k), (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)))
cells.sort(key=lambda c: (c[0] > H / 2, c[1]))
cv2.imwrite(os.path.join(D, name + '_head2_mask.png'), (np.isin(lab, keep) * 255).astype(np.uint8))
# ---- the model's head, and the face landmarks on it (from the first head sheet's front view, as turn_build placed them)
Z = np.load(os.path.join(D, name + '_turn.npz')); P = Z['P'].astype(np.float64)
meta = json.loads(str(np.load(os.path.join(D, name + '_flat.npz'))['meta'])); px, cxf, botf = meta['px']['front'], meta['cxf'], meta['bot']['front']; SH = meta['SH']
chin = meta['chinY']; hv = P[:, 1] > chin - 0.01
import mediapipe as mp
from mediapipe.tasks import python as mpp
from mediapipe.tasks.python import vision
fl = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=mpp.BaseOptions(model_asset_path=os.path.join(D, 'mp', 'face_landmarker.task')),
    num_faces=1, min_face_detection_confidence=0.2, min_face_presence_confidence=0.2))
def landmarks(bgr):
    r = fl.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))))
    return np.array([[q.x * bgr.shape[1], q.y * bgr.shape[0]] for q in r.face_landmarks[0]]) if r.face_landmarks else None
raw = cv2.imread(os.path.join(D, cfg['head']), cv2.IMREAD_UNCHANGED)
al = raw[..., 3:4] / 255.0 if raw.shape[2] == 4 else np.ones(raw.shape[:2] + (1,)); hs = (raw[..., :3] * al + 180 * (1 - al)).astype(np.uint8)
occ = (al[..., 0] > 0.5).sum(0) > 2; runs = []; c0 = None
for c in range(hs.shape[1] + 1):
    o = c < hs.shape[1] and occ[c]
    if o and c0 is None: c0 = c
    if not o and c0 is not None: runs.append((c0, c)); c0 = None
runs = [r for r in runs if r[1] - r[0] > hs.shape[1] * 0.08]
if len(runs) != 3: runs = [(int(hs.shape[1] * i / 3), int(hs.shape[1] * (i + 1) / 3)) for i in range(3)]
x0h, x1h = runs[0]
L0 = landmarks(hs[:, x0h:x1h]); assert L0 is not None
hj = json.load(open(os.path.join(D, name + '_head.json'))); _, _, _, _, sx, sy, ox, oy = (hj.get('vAll') or hj['v'])[0]
bx = (L0[:, 0] + x0h - ox) / sx; by = (L0[:, 1] + SH - oy) / sy
lx, ly = (bx - cxf) * px, (botf - by) * px
fr = hv & (P[:, 2] > np.median(P[hv, 2])); tr = cKDTree(P[fr][:, :2]); _, ix = tr.query(np.stack([lx, ly], 1), k=6)
LM = np.stack([lx, ly, P[fr][ix, 2].max(1)], 1)
def proj(p, th): return np.stack([p[:, 0] * np.cos(th) - p[:, 2] * np.sin(th), -p[:, 1]], 1)
out = []; chk = img.copy()
for ci, (_, _, k, (x0, y0, x1, y1)) in enumerate(cells):
    guess = h2['yaw'][ci]; m = lab[y0:y1, x0:x1] == k
    cell = img[y0:y1, x0:x1].copy(); cell[~m] = 128
    pad = 40; L = landmarks(cv2.copyMakeBorder(cell, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(128, 128, 128))) if abs(guess) <= 60 else None      # (profiles: the landmark model reads them as turned less than they are)
    best = None
    if L is not None:
        q = L - pad + [x0, y0]
        for deg in range(-120, 121):
            a = proj(LM, np.radians(deg)); ac, qc = a - a.mean(0), q - q.mean(0)
            s = (ac * qc).sum() / (ac * ac).sum()
            if s <= 0: continue
            res = np.sqrt(((qc - s * ac) ** 2).sum(1).mean()) / s
            if best is None or res < best[0]: best = (res, deg, s, q.mean(0) - s * a.mean(0))
        if best and (abs(best[1] - guess) > 60 or best[0] > 0.014): print('  cell', ci, 'landmark fit rejected', best[:2], 'guess', guess); best = None
    out.append(dict(cell=[int(x0), int(y0), int(x1), int(y1)], lab=int(k), yaw=float(best[1]) if best else float(guess), s=float(best[2]) if best else None,
                    t=[float(best[3][0]), float(best[3][1])] if best else None, by='face' if best else 'outline', err=round(float(best[0]) * 1000, 1) if best else None))
ss_ = [o['s'] for o in out if o['s']]
assert ss_, 'no view could be placed by its face'
sMed = float(np.median(ss_))
for o in out:
    if o['s'] is None:      # outline: the sheet's common scale, the top of the hair on the top of the head, centred on the head's width
        x0, y0, x1, y1 = o['cell']; m = lab[y0:y1, x0:x1] == o['lab']; a = proj(P[hv], np.radians(o['yaw'])) * sMed
        rows = int((a[:, 1].max() - a[:, 1].min()) * 0.8); xs = np.nonzero(m[:rows].any(0))[0]
        o['s'] = sMed; o['t'] = [float((xs.min() + xs.max()) / 2 + x0 - (a[:, 0].max() + a[:, 0].min()) / 2), float(y0 - a[:, 1].min())]
        # then slide and scale it a little until the model's outline lies on the painted one (above the chin)
        pr = proj(P[hv], np.radians(o['yaw'])); best = None
        labP = np.pad(lab, 120); PD = 120
        for sc in np.linspace(0.9, 1.1, 11):
            a = pr * sMed * sc; a = a - [(a[:, 0].max() + a[:, 0].min()) / 2, a[:, 1].min()]
            wM, hM = int(a[:, 0].max() - a[:, 0].min()) + 60, int(a[:, 1].max()) + 60
            sil = np.zeros((hM, wM), np.uint8); sil[(a[:, 1] + 30).astype(int), (a[:, 0] + wM / 2).astype(int)] = 1
            sil = ndimage.binary_fill_holes(cv2.morphologyEx(sil, cv2.MORPH_CLOSE, np.ones((11, 11), np.uint8)) > 0)
            cxm = (xs.min() + xs.max()) / 2 + x0
            for dy in range(-16, 17, 4):
                for dxx in range(-24, 25, 4):
                    X0, Y0 = int(cxm - wM / 2 + dxx), int(y0 - 30 + dy)
                    if X0 < -PD or Y0 < -PD or X0 + wM > W + PD or Y0 + hM > H + PD: continue
                    tgt = (labP[Y0 + PD:Y0 + PD + hM, X0 + PD:X0 + PD + wM] == o['lab'])
                    hh_ = int(hM * 0.85); v_ = (sil[:hh_] & tgt[:hh_]).sum() / max((sil[:hh_] | tgt[:hh_]).sum(), 1)
                    if best is None or v_ > best[0]: best = (v_, sc, X0 + wM / 2, Y0 + 30)
        if best:
            a = pr * sMed * best[1]
            o['s'] = float(sMed * best[1]); o['t'] = [float(best[2] - (a[:, 0].max() + a[:, 0].min()) / 2), float(best[3] - a[:, 1].min())]; o['err'] = round(float(best[0]), 2)
    a = proj(P[hv], np.radians(o['yaw'])) * o['s'] + o['t']
    for pt in a[::7].astype(int): cv2.circle(chk, (int(pt[0]), int(pt[1])), 0, (0, 255, 0), -1)
    cv2.putText(chk, f"{o['yaw']:.0f} {o['by']}", (o['cell'][0], o['cell'][1] + 16), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
    print(' view yaw', o['yaw'], o['by'], 'err mm', o['err'], 'scale', round(o['s'], 1))
json.dump({'sheet': h2['sheet'], 'views': out}, open(os.path.join(D, name + '_head2.json'), 'w'))
cv2.imwrite(os.path.join(D, name + '_head2_check.jpg'), chk)
