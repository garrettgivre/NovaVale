# Run the whole figure pipeline for several four-view sheets: cut, joints, config, build.
import os, sys, json, subprocess, ast, cv2, numpy as np
from auto_joints import joints
D = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable
import shutil
# usage: python batch.py '[["name", "path/to/sheet.png", height_in_metres], ...]'
# each sheet is copied to refs/<name>.png (commit it: the configs point there)
JOBS = json.loads(sys.argv[1])
dbg = []
for name, src, height in JOBS:
    os.makedirs(os.path.join(D, 'refs'), exist_ok=True)
    sheet = os.path.join(D, 'refs', name + '.png')
    if os.path.abspath(src) != os.path.abspath(sheet): shutil.copyfile(src, sheet)
    out = subprocess.run([PY, 'turn_cut.py', sheet, name, 'front,side2,side,back'], cwd=D, capture_output=True, text=True)
    off = ast.literal_eval(out.stdout.strip().splitlines()[-1])
    fr = cv2.imread(os.path.join(D, f'{name}_front.png'), cv2.IMREAD_UNCHANGED)
    J = joints(fr[..., 3], *off['front'])
    cfg = dict(name=name, sheet='refs/' + name + '.png', height=height, step=3, views=['front', 'side2', 'side', 'back'],
               off={k: list(v) for k, v in off.items()}, sideFaces='left', joints=J)
    json.dump(cfg, open(os.path.join(D, name + '.json'), 'w'), indent=1)
    im = cv2.imread(sheet)
    x0 = off['front'][0]; crop = im[:, x0:x0 + fr.shape[1]].copy()
    for k, (u, v) in J.items():
        cv2.circle(crop, (int(u - x0), int(v)), 5, (0, 0, 255), -1); cv2.putText(crop, k, (int(u - x0) + 6, int(v)), 0, .35, (0, 0, 180), 1)
    dbg.append(cv2.resize(crop, (int(crop.shape[1] * 700 / crop.shape[0]), 700)))
    print(name, 'joints ok', flush=True)
cv2.imwrite(os.path.join(D, 'joints_sheet.jpg'), np.hstack(dbg))
