# Estimate skeleton joints (sheet pixels) from the front-view cutout of an A-pose figure.
import numpy as np, cv2

def runs(row):
    d = np.diff(np.concatenate([[0], row.astype(np.int8), [0]]))
    return list(zip(np.nonzero(d == 1)[0], np.nonzero(d == -1)[0] - 1))

def joints(alpha, ox, oy):
    m = alpha > 128
    ys, xs = np.nonzero(m); top, bot = ys.min(), ys.max(); H = bot - top
    # torso centre: middle of the widest-running central segment at 40-55% height
    mids = []
    for y in range(int(top + .4 * H), int(top + .55 * H)):
        rs = runs(m[y]); c = (xs.min() + xs.max()) / 2
        r = min(rs, key=lambda r: abs((r[0] + r[1]) / 2 - c)); mids.append((r[0] + r[1]) / 2)
    cx = float(np.median(mids))
    def seg_at(y, x):
        for a, b in runs(m[int(y)]):
            if a <= x <= b: return a, b
        return None
    # neck: narrowest central segment between 8% and 24% of the height
    W = {}
    for y in range(int(top), int(top + .32 * H)):
        s = seg_at(y, cx); W[y] = (s[1] - s[0]) if s else 0
    yh = max(range(int(top + .03 * H), int(top + .16 * H)), key=lambda y: W[y])   # widest row of the head
    ysh = next((y for y in range(yh, int(top + .32 * H)) if W[y] > 1.9 * W[yh]), int(top + .2 * H))   # shoulders start
    neck = min(range(yh, ysh), key=lambda y: W[y]) if ysh > yh + 2 else ysh - .02 * H
    chin = neck - .025 * H
    face = top + (chin - top) * .62
    # arms: first row (from the neck down) where a separate segment appears on each side of the torso
    J = {}
    for side, sgn in (('R', -1), ('L', 1)):
        arm = []
        for y in range(int(neck), bot):
            rs = runs(m[y]); t = seg_at(y, cx)
            if not t: continue
            outer = [r for r in rs if (r[1] < t[0] if sgn < 0 else r[0] > t[1])]
            if outer:
                r = outer[0] if sgn > 0 else outer[-1]
                arm.append((y, (r[0] + r[1]) / 2, r[1] - r[0]))
        if len(arm) < 10:
            raise RuntimeError('arm not separated on side ' + side)
        # keep the first contiguous run of rows
        run = [arm[0]]
        for a in arm[1:]:
            if a[0] - run[-1][0] <= 3: run.append(a)
            else: break
        pit, tipY = run[0][0], run[-1][0]
        tipX = run[-1][1]
        # shoulder: above the armpit, extrapolating the arm's line back up
        ys_ = np.array([r[0] for r in run[:max(8, len(run) // 3)]]); xs_ = np.array([r[1] for r in run[:max(8, len(run) // 3)]])
        k = np.polyfit(ys_, xs_, 1)
        shY = neck + .065 * H
        s_ = seg_at(shY, cx)
        shX = cx + sgn * .78 * ((s_[1] - cx) if sgn > 0 else (cx - s_[0]))
        wrY = tipY - .065 * H
        wr = min(run, key=lambda r: abs(r[0] - wrY)); wrX = wr[1]
        elY = shY + (wrY - shY) * .52
        elX = (shX + wrX) / 2 + sgn * .012 * H
        if elY >= pit: elX = min(run, key=lambda r: abs(r[0] - elY))[1]
        J['sh' + side] = [shX, shY]; J['el' + side] = [elX, elY]; J['wr' + side] = [wrX, wrY]; J['tip' + side] = [tipX, tipY]
    hips = top + .47 * H
    J.update(top=[cx, top + 4], face=[cx, face], chin=[cx, chin], neck=[cx, neck],
             chest=[cx, neck + .35 * (hips - neck)], spine=[cx, neck + .7 * (hips - neck)], hips=[cx, hips])
    return {k: [round(float(v[0]) + ox, 1), round(float(v[1]) + oy, 1)] for k, v in J.items()}
