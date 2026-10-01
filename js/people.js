// Sculpted, rigged and animated characters.
//
// Every body, head, hand, garment and hairstyle is a signed distance field built from smoothly
// blended anatomy (like digital clay). Marching cubes turns each into a mesh, which is painted
// with vertex colours (make-up, brows, lash lines, blush, apron, lapels), shaded with ambient
// occlusion baked from the field, then skinned to a skeleton with weights from bone capsules.
// Meshes are cached in IndexedDB so only the very first load pays for the sculpting.
// animatePerson() drives breathing, weight shifts, blinking, head and eye tracking, lip-sync
// jaw movement, talking gestures, fidgets and each character's own stance (two-bone arm IK).
import * as THREE from 'three';
import { MarchingCubes } from '../vendor/MarchingCubes.js';

const VERSION = 'cast-32';

// ---------- SDF kit ----------
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
const sph = (cx, cy, cz, r) => (x, y, z) => Math.sqrt((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2) - r;
const ell = (cx, cy, cz, rx, ry, rz) => (x, y, z) => {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.sqrt(px * px + py * py + pz * pz), k1 = Math.sqrt(px * px / (rx * rx) + py * py / (ry * ry) + pz * pz / (rz * rz));
  return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
};
const cone = (ax, ay, az, bx, by, bz, r1, r2) => {
  const bax = bx - ax, bay = by - ay, baz = bz - az, l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  return (x, y, z) => {
    const pax = x - ax, pay = y - ay, paz = z - az, yv = pax * bax + pay * bay + paz * baz, zv = yv - l2;
    const qx = pax * l2 - bax * yv, qy = pay * l2 - bay * yv, qz = paz * l2 - baz * yv;
    const x2 = qx * qx + qy * qy + qz * qz, y2 = yv * yv * l2, z2 = zv * zv * l2, k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zv) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yv) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - r1;
  };
};
const rbox = (cx, cy, cz, hx, hy, hz, r) => (x, y, z) => {
  const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r, qz = Math.abs(z - cz) - hz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
};
const U = (k, ...f) => (x, y, z) => { let d = f[0](x, y, z); for (let i = 1; i < f.length; i++) d = smin(d, f[i](x, y, z), k); return d; };
const Sub = (a, b, k) => (x, y, z) => smax(a(x, y, z), -b(x, y, z), k);
const grow = (f, t) => (x, y, z) => f(x, y, z) - t;
const below = (f, y0, k = 0.01) => (x, y, z) => smax(f(x, y, z), y - y0, k);
const above = (f, y0, k = 0.01) => (x, y, z) => smax(f(x, y, z), y0 - y, k);
const sqz = (f, sz) => (x, y, z) => f(x, y, z / sz) * Math.min(1, sz);
const mirX = f => (x, y, z) => f(Math.abs(x), y, z);
const ss = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
// fabric folds: vertical pleats that deepen towards the hem, and rings of wrinkles round a joint
const pleats = (f, amp, n, yTop, yHem) => (x, y, z) => f(x, y, z) + amp * Math.sin(Math.atan2(x, z) * n + y * 3) * ss(yTop, yHem, y);
const wrinkles = (f, amp, freq, cx, cy, cz, r) => (x, y, z) => { const d = Math.hypot(Math.abs(x) - cx, y - cy, z - cz); return f(x, y, z) + (d < r ? amp * Math.sin(y * freq) * (1 - d / r) : 0); };

function hash(x, y, z) { let h = x * 374761393 + y * 668265263 + z * 2147483647; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) & 1023) / 1023; }
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf), L = (a, b, t) => a + (b - a) * t;
  return L(L(L(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), L(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
    L(L(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), L(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v), w);
}

// ---------- Polygonising ----------
const mcs = {};
const mc = res => mcs[res] || (mcs[res] = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, false, 200000));

// Sparse fill (skip blocks far from the surface), marching cubes, weld, baked AO, paint.
function polygonise(sdf, C, H, res, paint, keep, aoK = 1) {
  const M = mc(res), n = res, f = M.field, hs = n / 2, step = H / hs, B = 4, P = i => (i - hs) / hs * H;
  for (let bz = 0; bz < n; bz += B) for (let by = 0; by < n; by += B) for (let bx = 0; bx < n; bx += B) {
    const d0 = sdf(C[0] + P(bx + B / 2), C[1] + P(by + B / 2), C[2] + P(bz + B / 2));
    if (Math.abs(d0) > step * B * 1.05) {
      for (let z = bz; z < bz + B && z < n; z++) for (let y = by; y < by + B && y < n; y++) { const o = z * n * n + y * n; for (let x = bx; x < bx + B && x < n; x++) f[o + x] = -d0; }
      continue;
    }
    for (let z = bz; z < bz + B && z < n; z++) { const wz = C[2] + P(z); for (let y = by; y < by + B && y < n; y++) { const wy = C[1] + P(y), o = z * n * n + y * n; for (let x = bx; x < bx + B && x < n; x++) f[o + x] = -sdf(C[0] + P(x), wy, wz); } }
  }
  M.isolation = 0; M.update();
  const cnt = M.count, pa = M.positionArray, na = M.normalArray;
  const AOS = step < 0.006 ? [[2, 0.45], [4, 0.35], [8, 0.25]] : [[3, 0.3], [6, 0.3], [12, 0.25]];
  const map = new Map(), idx = [], pos = [], nor = [], col = [], c = new THREE.Color();
  for (let i = 0; i < cnt; i++) {
    if (keep && i % 3 === 0 && !keep(C[1] + (pa[i * 3 + 1] + pa[i * 3 + 4] + pa[i * 3 + 7]) / 3 * H)) { i += 2; continue; }
    const k = i * 3, x = C[0] + pa[k] * H, y = C[1] + pa[k + 1] * H, z = C[2] + pa[k + 2] * H;
    const key = Math.round(x * 2e4) + ',' + Math.round(y * 2e4) + ',' + Math.round(z * 2e4);
    let j = map.get(key);
    if (j === undefined) {
      j = pos.length / 3; map.set(key, j);
      let nx = na[k], ny = na[k + 1], nz = na[k + 2]; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      let occ = 0;
      for (const [m, w] of AOS) { const d = step * m; occ += w * Math.max(0, d - sdf(x + nx * d, y + ny * d, z + nz * d)) / d; }
      const a = 1 - Math.min(0.75, occ * aoK);
      paint(x, y, z, c);
      pos.push(x, y, z); nor.push(nx, ny, nz); col.push(c.r * a, c.g * a, c.b * a);
    }
    idx.push(j);
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), col: new Float32Array(col), idx: new Uint32Array(idx) };
}
function join(a, b) {
  const n = a.pos.length / 3, idx = new Uint32Array(a.idx.length + b.idx.length);
  idx.set(a.idx); for (let i = 0; i < b.idx.length; i++) idx[a.idx.length + i] = b.idx[i] + n;
  const cat = (p, q) => { const r = new Float32Array(p.length + q.length); r.set(p); r.set(q, p.length); return r; };
  return { pos: cat(a.pos, b.pos), nor: cat(a.nor, b.nor), col: cat(a.col, b.col), idx };
}

// ---------- Skeleton ----------
const lin = h => new THREE.Color(h);
function joints(o) {
  const sx = (o.sh ?? 0.172) + 0.02;
  return {
    sx, root: [0, 0, 0], hips: [0, 0.95, 0], spine: [0, 1.07, 0], chest: [0, 1.24, 0], neck: [0, 1.44, -0.005], head: [0, 1.56, 0.004], jaw: [0, 1.568, 0.0],
    clav: [0.03, 1.42, 0], upper: [sx - 0.005, 1.405, -0.012], fore: [sx + 0.05, 1.14, -0.025], hand: [sx + 0.078, 0.9, 0.015],
    thigh: [0.09, 0.93, 0], shin: [0.095, 0.5, 0.012], foot: [0.09, 0.09, -0.005], toe: [0.09, 0.03, 0.12],
  };
}
const HC = [0, 1.605, 0.012]; // head centre
const BONES = [['root', null], ['hips', 'root'], ['spine', 'hips'], ['chest', 'spine'], ['neck', 'chest'], ['head', 'neck'], ['jaw', 'head']];
for (const s of ['L', 'R']) BONES.push(['clav' + s, 'chest'], ['upper' + s, 'clav' + s], ['fore' + s, 'upper' + s], ['hand' + s, 'fore' + s], ['thigh' + s, 'hips'], ['shin' + s, 'thigh' + s], ['foot' + s, 'shin' + s]);
const BI = Object.fromEntries(BONES.map(([n], i) => [n, i]));
function boneWorld(J, name) {
  const s = name.endsWith('L') ? -1 : 1, base = name.replace(/[LR]$/, '');
  const p = J[base]; return name.length > base.length ? [p[0] * s, p[1], p[2]] : p;
}
function capsules(J) {
  const C = [
    ['hips', [0, 0.82, 0], [0, 1.0, 0], 0.15], ['spine', [0, 1.0, 0], [0, 1.17, 0], 0.13], ['chest', [0, 1.17, 0], [0, 1.38, 0], 0.15],
    ['neck', [0, 1.4, -0.005], [0, 1.53, 0.005], 0.05],
  ];
  for (const [s, L] of [[-1, 'L'], [1, 'R']]) {
    const w = n => boneWorld(J, n + L);
    C.push(['clav' + L, [s * 0.04, 1.42, -0.01], [s * (J.sx - 0.01), 1.41, -0.012], 0.05], ['upper' + L, w('upper'), w('fore'), 0.046],
      ['fore' + L, w('fore'), w('hand'), 0.034], ['hand' + L, w('hand'), [w('hand')[0], 0.8, 0.035], 0.03],
      ['thigh' + L, w('thigh'), w('shin'), 0.075], ['shin' + L, w('shin'), w('foot'), 0.05], ['foot' + L, w('foot'), [s * 0.09, 0.03, 0.13], 0.04]);
  }
  return C.map(([n, a, b, r]) => ({ i: BI[n], a, b, r }));
}
function segDist(p, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2], apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / (abx * abx + aby * aby + abz * abz)));
  return Math.hypot(apx - abx * t, apy - aby * t, apz - abz * t);
}
// Skin weights: softmax over "distance to each bone capsule's surface", top four bones.
function weigh(S, caps, fixed, sigma = 0.012) {
  const n = S.pos.length / 3, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), p = [0, 0, 0];
  for (let v = 0; v < n; v++) {
    p[0] = S.pos[v * 3]; p[1] = S.pos[v * 3 + 1]; p[2] = S.pos[v * 3 + 2];
    let list;
    if (fixed) list = fixed(p);
    else {
      const d = caps.map(c => [c.i, segDist(p, c.a, c.b) - c.r]);
      const m = Math.min(...d.map(e => e[1]));
      list = d.filter(e => e[1] - m < sigma * 5).map(e => [e[0], Math.exp(-(e[1] - m) / sigma)]).sort((a, b) => b[1] - a[1]).slice(0, 4);
    }
    const tot = list.reduce((s, e) => s + e[1], 0) || 1;
    list.forEach((e, k) => { si[v * 4 + k] = e[0]; sw[v * 4 + k] = e[1] / tot; });
  }
  S.si = si; S.sw = sw;
  return S;
}

// ---------- Anatomy ----------
function body(o, J) {
  const sx = J.sx, sh = o.sh ?? 0.172, hip = o.hip ?? 0.155, waist = o.waist ?? 0.125, bust = o.bust ?? 0;
  let torso = U(0.06,
    ell(0, 1.3, -0.008, sh * 0.88, 0.15, 0.098),
    ell(0, 1.13, 0.004, waist, 0.13, 0.09),
    ell(0, 0.94, -0.01, hip, 0.12, 0.105),
    mirX(ell(0.07, 0.86, -0.045, 0.075, 0.075, 0.07)),
    cone(-sh * 0.85, 1.415, -0.02, sh * 0.85, 1.415, -0.02, 0.048, 0.048));
  torso = U(0.02, torso, mirX(cone(0.02, 1.445, 0.055, sh * 0.85, 1.432, 0.018, 0.011, 0.009)), mirX(ell(0.07, 1.32, -0.085, 0.05, 0.07, 0.025)));
  if (bust) torso = U(0.05, torso, mirX(ell(0.056, 1.27, 0.058, bust * 1.05, bust, bust * 0.9)));
  if (o.belly) torso = U(0.06, torso, ell(0, 1.08, 0.04, waist * 1.05, 0.13, o.belly));
  const neck = U(0.03, cone(0, 1.38, -0.012, 0, 1.55, 0.006, 0.058, 0.045), mirX(cone(0.034, 1.53, 0.028, 0.016, 1.43, 0.058, 0.012, 0.011)));
  const w = n => boneWorld(J, n + 'R');
  const [S, E, W] = [w('upper'), w('fore'), w('hand')];
  const arm = U(0.03,
    sph(sx - 0.012, 1.4, -0.012, 0.056),
    cone(...S, ...E, 0.047, 0.037),
    ell((S[0] + E[0]) / 2, (S[1] + E[1]) / 2, 0.0, 0.036, 0.07, 0.038),
    cone(...E, ...W, 0.037, 0.026),
    ell(E[0] + 0.008, E[1] - 0.07, E[2] + 0.012, 0.036, 0.06, 0.033));
  const legR = U(0.035,
    cone(0.09, 0.93, 0, 0.095, 0.5, 0.012, 0.082, 0.052),
    ell(0.095, 0.72, 0.02, 0.07, 0.16, 0.07),
    sph(0.095, 0.5, 0.03, 0.045),
    ell(0.097, 0.37, -0.018, 0.052, 0.1, 0.054),
    cone(0.095, 0.5, 0.012, 0.09, 0.09, -0.005, 0.05, 0.031),
    sph(0.09, 0.09, -0.005, 0.034));
  const footR = U(0.03, ell(0.09, 0.045, 0.05, 0.043, 0.04, 0.105), sph(0.09, 0.07, -0.015, 0.037));
  return { torso, neck, arms: mirX(arm), legs: mirX(legR), feet: mirX(footR), J, hip };
}

// Hand with fingers, for side s (+1 right, -1 left), in character space.
function handSDF(J, s) {
  const W = boneWorld(J, s > 0 ? 'handR' : 'handL');
  const L = (u, v, w) => [W[0] + s * u, W[1] + v, W[2] + w];
  const parts = [ell(...L(0.004, -0.047, 0.004), 0.015, 0.042, 0.036), cone(...L(0, 0.02, 0), ...L(0.002, -0.02, 0.003), 0.027, 0.026)];
  const fw = [0.026, 0.009, -0.007, -0.022], l1 = [0.04, 0.045, 0.042, 0.032], l2 = [0.028, 0.031, 0.029, 0.024];
  for (let i = 0; i < 4; i++) {
    const a = L(0.002, -0.08, fw[i]), b = L(-0.004, -0.08 - l1[i], fw[i] * 1.12), c = L(-0.016, -0.08 - l1[i] - l2[i] * 0.85, fw[i] * 1.16);
    parts.push(cone(...a, ...b, 0.0085, 0.0075), cone(...b, ...c, 0.0075, 0.0062));
  }
  parts.push(cone(...L(-0.006, -0.028, 0.028), ...L(-0.016, -0.056, 0.044), 0.011, 0.009), cone(...L(-0.016, -0.056, 0.044), ...L(-0.024, -0.078, 0.046), 0.009, 0.0072));
  return { sdf: U(0.006, ...parts), W };
}

// Head in head-local coordinates (origin at the head centre, face towards +z).
function headSDF(o) {
  const jw = o.jaw ?? 1, ns = o.nose ?? 1, lp = o.lip ?? 1;
  let h = U(0.03,
    ell(0, 0.012, -0.008, 0.083, 0.102, 0.098),
    ell(0, -0.038, 0.02, 0.066 * jw, 0.072, 0.078),
    sph(0, -0.094, 0.052, 0.024 * jw),
    mirX(sph(0.046, -0.006, 0.058, 0.028)),
    ell(0, 0.034, 0.072, 0.066, 0.016, 0.022),
    cone(0, -0.06, -0.012, 0, -0.17, -0.02, 0.04, 0.042));
  const ear = U(0.006, ell(0.084, 0.0, -0.006, 0.011, 0.03, 0.02), ell(0.09, -0.004, -0.008, 0.006, 0.024, 0.016));
  h = U(0.008, h, mirX(Sub(ear, ell(0.094, 0.0, -0.004, 0.004, 0.017, 0.01), 0.003)));
  h = Sub(h, mirX(sph(0.032, 0.016, 0.087, 0.0165)), 0.01);
  h = U(0.006, h, mirX(ell(0.032, 0.0282, 0.081, 0.0175, 0.0078, 0.0125)), mirX(ell(0.032, 0.003, 0.082, 0.015, 0.0055, 0.011)));
  h = Sub(h, mirX(ell(0.032, 0.037, 0.084, 0.017, 0.0022, 0.01)), 0.003); // lid crease
  h = U(0.012, h, cone(0, 0.02, 0.088, 0, -0.018, 0.108 * ns, 0.008, 0.013 * ns), mirX(sph(0.011, -0.022, 0.099, 0.009)));
  h = U(0.006, h, mirX(ell(0.0075, -0.0452, 0.0865, 0.0125, 0.0052 * lp, 0.009)), ell(0, -0.0555, 0.0845, 0.0155, 0.0062 * lp, 0.009));
  h = Sub(h, ell(0, -0.0503, 0.096, 0.0165, 0.0011, 0.012), 0.002);
  const fw = o.fw ?? 1, hh = h;
  return fw === 1 ? h : (x, y, z) => hh(x / fw, y, z) * Math.min(1, fw);
}
const FACE_CUT = ell(0, -0.04, 0.1, 0.074, 0.088, 0.072);
const BROW = ell(0, 0.055, 0.105, 0.072, 0.05, 0.055); // a clear forehead for swept-back hair

function paintHead(o) {
  const skin = lin(o.skin), lip = lin(o.lips ?? '#a05a50'), brow = lin(o.browC ?? o.hairC), blush = lin(o.blush ?? '#c06a60'), shadow = lin(o.shadowC ?? o.skin);
  const dark = skin.clone().multiplyScalar(0.72), mouth = lin('#3a1414'), stache = lin(o.stache || '#000');
  const lipsF = U(0.006, mirX(ell(0.0075, -0.0452, 0.0865, 0.0125, 0.0052, 0.009)), ell(0, -0.0555, 0.0845, 0.0155, 0.0062, 0.009));
  return (x, y, z, c) => {
    const n = vnoise(x * 160, y * 160, z * 160);
    c.copy(skin).multiplyScalar(0.95 + n * 0.08);
    const ax = Math.abs(x);
    c.lerp(blush, Math.max(0, 1 - Math.hypot(ax - 0.045, y + 0.02, (z - 0.07) * 0.8) / 0.03) * (o.blushAmt ?? 0.25));
    const lidD = Math.hypot((ax - 0.032) / 1.3, y - 0.026, (z - 0.085) * 0.7);
    if (lidD < 0.016) c.lerp(shadow, (o.shadowAmt ?? 0.15) * (1 - lidD / 0.016));
    if (Math.abs(ax - 0.032) < 0.018 && y > 0.013 && y < 0.021 && z > 0.086) c.lerp(dark.clone().multiplyScalar(o.lashes ?? 0.7), 0.75);
    const by = 0.041 + (ax - 0.032) * (o.browTilt ?? -0.12) - (ax - 0.032) ** 2 * 6;
    if (ax > 0.01 && ax < 0.056 && Math.abs(y - by) < (o.browW ?? 0.0045) && z > 0.066) c.lerp(brow, 0.9);
    if (y < -0.04 && y > -0.066) c.lerp(lip.clone().multiplyScalar(0.92 + n * 0.1), ss(0.0075, 0.004, lipsF(x, y, z)) * ss(0.022, 0.016, ax));
    if (Math.abs(y + 0.0503) < 0.0013 && ax < 0.015 && z > 0.088) c.lerp(mouth, 0.8);
    if (y < -0.028 && y > -0.034 && ax < 0.016 && ax > 0.005 && z > 0.095) c.multiplyScalar(0.6);
    if (o.stache && y < -0.036 && y > -0.041 - ax * 0.12 && ax < 0.021 && ax > 0.002 && z > 0.09) c.copy(stache);
    if (y < -0.1) c.lerp(dark, ss(-0.1, -0.13, y) * 0.3);
  };
}

// ---------- Materials, paint helpers ----------
const hairPaint = (base, streak = 0.22, tip) => {
  const b = lin(base), t = tip ? lin(tip) : null;
  return (x, y, z, c) => {
    const s = vnoise(x * 420, y * 30, z * 420), s2 = vnoise(x * 90, y * 90, z * 90);
    c.copy(b).multiplyScalar(0.7 + s * streak * 2 + s2 * 0.12);
    if (t) c.lerp(t, ss(0.05, -0.2, y) * 0.5);
  };
};
const solid = (hex, vary = 0.08, sc = 120) => { const b = lin(hex); return (x, y, z, c) => c.copy(b).multiplyScalar(1 - vary / 2 + vnoise(x * sc, y * sc, z * sc) * vary); };
const waves = (f, amp, fy, fa) => (x, y, z) => f(x, y, z) + amp * Math.sin(y * fy + Math.atan2(x, z) * fa);
const strands = (f, amp) => (x, y, z) => f(x, y, z) + amp * (vnoise(x * 260, y * 22, z * 260) - 0.5);
const at = (f, c) => (x, y, z) => f(x - c[0], y - c[1], z - c[2]); // evaluate a head-local field in character space
const atP = (p, c) => (x, y, z, col) => p(x - c[0], y - c[1], z - c[2], col);

const shiftX = (f, dx) => (x, y, z) => f(x - dx, y, z);
// ---------- Garments (b = body parts) ----------
// wedge cut from the front, for open jackets and V necks: gap w0 at yB, widening by `slope` per metre up
const wedge = (yB, yT, w0, slope, z0 = 0.02) => (x, y, z) => Math.max(Math.abs(x) - (w0 + (y - yB) * slope), yB - y, y - yT, z0 - z);
const G = {
  top: (b, t, hem = 0.845) => above(grow(b.torso, t), hem, 0.004),
  sleeves: (b, t, end = 0.885) => grow(above(b.arms, end, 0.006), t),
  roll: (b, t, end) => U(0.01, grow(above(b.arms, end, 0.006), t), mirX(ell(b.J.sx + 0.052, end + 0.012, -0.012, t + 0.046, 0.02, t + 0.044))),
  open: (f, w0 = 0.035, slope = 0.12, yT = 1.5) => Sub(f, wedge(0.7, yT, w0, slope), 0.004),
  pants: (b, t, cuff = 0.075) => U(0.03, above(grow(b.legs, t), cuff, 0.006), ell(0, 0.905, -0.01, b.hip + t + 0.012, 0.11, 0.11 + t)),
  wide: (b, r1, r2, cuff = 0.03) => U(0.03, above(mirX(cone(0.092, 0.93, 0, 0.1, 0.03, 0.012, r1, r2)), cuff, 0.006), ell(0, 0.905, -0.01, b.hip + 0.03, 0.11, 0.13)),
  shorts: (b, t, hem = 0.52) => above(G.pants(b, t), hem, 0.006),
  sneaker: b => U(0.015, grow(b.feet, 0.016), mirX(rbox(0.09, 0.012, 0.05, 0.052, 0.014, 0.125, 0.01))),
  hightop: b => U(0.015, grow(b.feet, 0.016), grow(below(b.legs, 0.2), 0.016), mirX(rbox(0.09, 0.012, 0.05, 0.052, 0.014, 0.125, 0.01))),
  boots: (b, top = 0.24, sole = 0.018) => U(0.015, grow(b.feet, 0.02), grow(below(b.legs, top), 0.018), mirX(rbox(0.09, sole - 0.004, 0.045, 0.056, sole, 0.13, 0.008))),
  heels: b => U(0.006, grow(b.feet, 0.005), mirX(cone(0.09, 0.07, -0.055, 0.09, 0.0, -0.064, 0.011, 0.005))),
  platform: b => U(0.015, grow(b.feet, 0.02), grow(below(b.legs, 0.26), 0.02), mirX(rbox(0.09, -0.04, 0.045, 0.06, 0.05, 0.135, 0.012))),
  apron: (f, yT, yB, hw, z0 = 0.02) => (x, y, z) => Math.max(f(x, y, z), z0 - z, y - yT, yB - y, Math.abs(x) - hw),
  shell: (f, t) => (x, y, z) => Math.abs(f(x, y, z)) - t,
};
// paints
const PA = {
  plaid: (base, c1, c2, sc = 22) => { const B = lin(base), A1 = lin(c1), A2 = lin(c2); return (x, y, z, c) => { const u = (x * 0.8 + z * 0.6) * sc, v = y * sc, su = Math.abs(Math.sin(u * Math.PI)), sv = Math.abs(Math.sin(v * Math.PI)); c.copy(B); if (su < 0.38) c.lerp(A1, 0.5); if (sv < 0.38) c.lerp(A1, 0.5); if (su < 0.1 || sv < 0.1) c.lerp(A2, 0.75); c.multiplyScalar(0.88 + vnoise(x * 200, y * 200, z * 200) * 0.16); }; },
  denim: hex => { const B = lin(hex); return (x, y, z, c) => c.copy(B).multiplyScalar(0.72 + vnoise(x * 320, y * 40, z * 320) * 0.4 + (Math.sin((x + y) * 900) > 0.6 ? 0.05 : 0)); },
  tweed: (hex, fleck) => { const B = lin(hex), F = lin(fleck); return (x, y, z, c) => { c.copy(B).multiplyScalar(0.8 + vnoise(x * 400, y * 400, z * 400) * 0.35); if (Math.sin((x + y) * 520) * Math.sin((x - y) * 520) > 0.55) c.lerp(F, 0.35); }; },
  lame: hex => { const B = lin(hex); return (x, y, z, c) => c.copy(B).multiplyScalar(0.7 + vnoise(x * 60, y * 9, z * 60) * 0.3 + vnoise(x * 700, y * 700, z * 700) * 0.18); },
  zone: (fn, base) => { const B = typeof base === 'function' ? base : solid(base, 0.08); return (x, y, z, c) => { B(x, y, z, c); fn(x, y, z, c); }; },
};
const rgb = h => lin(h);

// ---------- Props (plain meshes held in a hand, kept upright) ----------
const PM = (c, r = 0.5, m = 0, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...o });
const PROP = {
  camcorder: () => { const g = new THREE.Group(); const body = PM(0x2a2c30, 0.45, 0.4); g.add(mk(new THREE.BoxGeometry(0.07, 0.075, 0.16), body, 0, 0.02, 0.03)); const l = mk(new THREE.CylinderGeometry(0.028, 0.03, 0.05, 16), PM(0x111114, 0.2, 0.5), 0, 0.03, 0.13); l.rotation.x = Math.PI / 2; g.add(l); g.add(mk(new THREE.SphereGeometry(0.008, 8, 6), PM(0xff2020, 0.3, 0, { emissive: 0xff1010, emissiveIntensity: 1.5 }), 0.03, 0.055, 0.09)); g.add(mk(new THREE.BoxGeometry(0.005, 0.045, 0.07), PM(0x404448, 0.4, 0.4), -0.04, 0.03, 0.03)); return g; },
  emf: () => { const g = new THREE.Group(); g.add(mk(new THREE.BoxGeometry(0.06, 0.12, 0.022), PM(0x1a1a1a, 0.5), 0, 0.02, 0)); [0xff3030, 0xffa020, 0xffe040, 0x40ff60].forEach((c, i) => g.add(mk(new THREE.BoxGeometry(0.01, 0.01, 0.006), PM(c, 0.3, 0, { emissive: c, emissiveIntensity: 1.4 }), -0.018 + i * 0.012, 0.065, 0.012))); return g; },
  flyers: () => { const g = new THREE.Group(); [0xff3aa0, 0xd8ff30, 0xff3aa0].forEach((c, i) => { const p = mk(new THREE.BoxGeometry(0.15, 0.2, 0.004), PM(c, 0.7), 0, 0.03, 0.02 + i * 0.006); p.rotation.z = (i - 1) * 0.12; g.add(p); }); return g; },
  whistle: () => mk(new THREE.CapsuleGeometry(0.009, 0.025, 4, 8), PM(0xff3a8a, 0.3), 0, 0.0, 0.02),
  clipboard: () => { const g = new THREE.Group(); g.add(mk(new THREE.BoxGeometry(0.23, 0.31, 0.008), PM(0x6a4a2a, 0.6), 0, 0.02, 0)); g.add(mk(new THREE.BoxGeometry(0.21, 0.28, 0.003), new THREE.MeshStandardMaterial({ roughness: 0.8, map: chartTex() }), 0, 0.01, 0.006)); g.add(mk(new THREE.BoxGeometry(0.08, 0.025, 0.012), PM(0xc9a15a, 0.3, 1), 0, 0.17, 0.006)); return g; },
  thermos: () => mk(new THREE.CylinderGeometry(0.032, 0.032, 0.22, 20), PM(0xc8ccd0, 0.25, 1), 0, 0.03, 0),
  redlight: () => { const g = new THREE.Group(); g.add(mk(new THREE.CylinderGeometry(0.02, 0.02, 0.09, 12), PM(0x1a1a1a, 0.5), 0, 0, 0)); const l = mk(new THREE.CircleGeometry(0.019, 12), PM(0xff2020, 0.3, 0, { emissive: 0xff1010, emissiveIntensity: 2 }), 0, -0.046, 0); l.rotation.x = Math.PI / 2; g.add(l); return g; },
  dollhead: () => { const g = new THREE.Group(); g.add(mk(new THREE.SphereGeometry(0.055, 20, 14), PM(0xf4e0d0, 0.25), 0, 0.06, 0.02)); for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; g.add(mk(new THREE.SphereGeometry(0.022, 8, 6), PM(0xb07a3a, 0.7), Math.cos(a) * 0.045, 0.09 + Math.sin(a * 2) * 0.01, 0.0 + Math.sin(a) * 0.035)); } for (const s of [-1, 1]) g.add(mk(new THREE.SphereGeometry(0.008, 8, 6), PM(0x3a6aa0, 0.2), s * 0.02, 0.065, 0.07)); const cl = mk(new THREE.SphereGeometry(0.07, 14, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), PM(0xe8e0d0, 0.9, 0, { side: THREE.DoubleSide }), 0, 0.03, 0.01); g.add(cl); return g; },
  pick: () => { const g = new THREE.Group(); g.add(mk(new THREE.CylinderGeometry(0.005, 0.005, 0.12, 8), PM(0xc9a15a, 0.3, 1), 0, 0.04, 0.02)); return g; },
  books: () => { const g = new THREE.Group(); [0x2a4a3a, 0x6a1a1a, 0x1a2a4a].forEach((c, i) => g.add(mk(new THREE.BoxGeometry(0.05, 0.24, 0.17), PM(c, 0.6), -0.03 + i * 0.05, 0.05, 0.02))); return g; },
  keys: () => { const g = new THREE.Group(); g.add(mk(new THREE.TorusGeometry(0.02, 0.003, 6, 16), PM(0xb8b8b8, 0.3, 1), 0, 0, 0.02)); for (let i = 0; i < 4; i++) { const k = mk(new THREE.BoxGeometry(0.008, 0.05, 0.002), PM(i % 2 ? 0xc9a15a : 0xb0b0b0, 0.3, 1), -0.012 + i * 0.008, -0.035, 0.02); k.rotation.z = (i - 1.5) * 0.25; g.add(k); } return g; },
  flashlight: () => { const g = new THREE.Group(); g.add(mk(new THREE.CylinderGeometry(0.02, 0.018, 0.2, 14), PM(0x1a1a1a, 0.5), 0, 0, 0.02)); g.add(mk(new THREE.CylinderGeometry(0.03, 0.022, 0.05, 14), PM(0xe8b020, 0.4), 0, -0.1, 0.02)); return g; },
  mic: () => { const g = new THREE.Group(); g.add(mk(new THREE.CylinderGeometry(0.012, 0.016, 0.16, 12), PM(0x1a1a1a, 0.4), 0, 0.02, 0.02)); g.add(mk(new THREE.SphereGeometry(0.028, 14, 10), PM(0x222222, 0.7), 0, 0.12, 0.02)); return g; },
  headphones: () => { const g = new THREE.Group(); const t = mk(new THREE.TorusGeometry(0.075, 0.009, 8, 20, Math.PI), PM(0x1a1a1a, 0.4), 0, -0.02, 0.02); g.add(t); for (const s of [-1, 1]) { const c = mk(new THREE.CylinderGeometry(0.035, 0.035, 0.025, 16), PM(0x1a1a1a, 0.4), s * 0.075, -0.04, 0.02); c.rotation.z = Math.PI / 2; g.add(c); } return g; },
  cane: () => { const g = new THREE.Group(); g.add(mk(new THREE.CylinderGeometry(0.011, 0.009, 0.92, 10), PM(0xd8dce0, 0.15, 1), 0, -0.42, 0.02)); for (let i = 0; i < 11; i++) { const f = mk(new THREE.SphereGeometry(0.035, 10, 8), PM(0x6a3ab0, 0.95), Math.sin(i * 1.7) * 0.035, 0.1 + i * 0.012, 0.02 + Math.cos(i * 1.7) * 0.035); f.scale.set(0.55, 2.4, 0.35); f.rotation.set(Math.sin(i) * 0.5, i, Math.cos(i * 1.3) * 0.6); g.add(f); } return g; },
  spoon: () => { const g = new THREE.Group(); g.add(mk(new THREE.CylinderGeometry(0.008, 0.009, 0.24, 8), PM(0x9a6a3a, 0.6), 0, 0.08, 0.02)); const b = mk(new THREE.SphereGeometry(0.03, 12, 8), PM(0x9a6a3a, 0.6), 0, 0.21, 0.02); b.scale.set(1, 1.4, 0.4); g.add(b); return g; },
  binoculars: () => { const g = new THREE.Group(); for (const s of [-1, 1]) { const c = mk(new THREE.CylinderGeometry(0.028, 0.032, 0.14, 14), PM(0x1a1a1a, 0.5), s * 0.035, 0.0, 0.05); c.rotation.x = Math.PI / 2; g.add(c); } return g; },
  map: () => { const g = new THREE.Group(); const p = mk(new THREE.BoxGeometry(0.2, 0.26, 0.004), PM(0xd8e0c0, 0.8), 0, -0.05, 0.03); p.rotation.y = 0.3; g.add(p); return g; },
};
let _chart;
function chartTex() {
  if (_chart) return _chart;
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 170; const g = cv.getContext('2d');
  g.fillStyle = '#16203c'; g.fillRect(0, 0, 128, 170); g.strokeStyle = 'rgba(220,210,170,.6)'; g.lineWidth = 1;
  g.beginPath(); g.arc(64, 85, 52, 0, 7); g.stroke(); g.beginPath(); g.arc(64, 85, 30, 0, 7); g.stroke();
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.beginPath(); g.moveTo(64, 85); g.lineTo(64 + Math.cos(a) * 52, 85 + Math.sin(a) * 52); g.stroke(); }
  g.fillStyle = '#f0e8c8'; for (let i = 0; i < 70; i++) g.fillRect(Math.random() * 128, Math.random() * 170, 1.5, 1.5);
  _chart = new THREE.CanvasTexture(cv); _chart.colorSpace = THREE.SRGBColorSpace; return _chart;
}
function mk(geo, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; return o; }

// ---------- The cast ----------
// pose(J, s): where each hand rests (character space; s = +1 is the +x side) and which way the elbow points.
const relaxed = (J, s) => ({ t: [s * (J.sx + 0.085), 0.84, 0.035], pole: [s * 0.6, 1.1, -1] });
const hip = s => ({ t: [s * 0.165, 0.99, -0.03], pole: [s, 0.2, -0.6] });
const tufts = (n, seed, len, r, up = 0.3) => { const rr = rng2(seed), P = []; for (let i = 0; i < n; i++) { const th = rr() * Math.PI * (0.45 + up * 0.2), ph = rr() * Math.PI * 2, d = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph) * 0.9]; if (d[2] > 0.55 && d[1] < 0.55) continue; P.push(cone(d[0] * 0.07, 0.03 + d[1] * 0.07, -0.01 + d[2] * 0.07, d[0] * (0.07 + len), 0.03 + d[1] * (0.07 + len), -0.01 + d[2] * (0.07 + len), r, r * 0.3)); } return P; };
function rng2(s) { return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export const CAST = {
  vesper: {
    h: 1.05, bust: 0.055, hip: 0.15, waist: 0.11, sh: 0.16,
    skin: '#e8c4ae', lips: '#8a1420', browC: '#9a8460', hairC: '#ecdcb0', eyes: '#5a7a8a', shadowC: '#6a5a6a', shadowAmt: 0.4, lashes: 0.3, blushAmt: 0.28, jaw: 0.95, nose: 0.92, fw: 0.97,
    hairBox: [[0, -0.05, -0.02], 0.21],
    hair: () => strands(waves(Sub(U(0.04,
      ell(0, 0.035, -0.02, 0.12, 0.128, 0.125),
      mirX(ell(0.098, -0.07, -0.02, 0.062, 0.11, 0.072)),
      mirX(sph(0.088, -0.16, -0.035, 0.06)),
      ell(0, -0.1, -0.075, 0.115, 0.12, 0.065)), FACE_CUT, 0.02), 0.005, 60, 4), 0.002),
    hairTip: '#d8c490',
    skinParts: b => U(0.012, U(0.02, b.torso, b.neck, b.legs), b.arms),
    outfit: b => [
      { sdf: Sub(pleats(U(0.03, below(grow(b.torso, 0.008), 1.335, 0.02), sqz(cone(0, 1.02, 0, 0, 0.02, 0.02, 0.15, 0.22), 0.82)), 0.004, 18, 0.9, 0.1), shiftX(wedge(-0.1, 0.6, 0.022, 0.05, 0.0), -0.1), 0.006), paint: PA.lame('#c4c8d0'), mat: { roughness: 0.28, metalness: 0.45, sheen: 1, sheenColor: 0xffffff } },
      { sdf: G.heels(b), paint: solid('#c8ccd4', 0.05), mat: { roughness: 0.2, metalness: 0.7 } },
    ],
    pose: relaxed, gestureSide: 1, fidget: { side: 1, t: [0.08, 1.61, 0.14], every: 9 },
    sunglasses: 1,
    acc: A => {
      const sg = new THREE.MeshPhysicalMaterial({ color: 0x0c0a0e, roughness: 0.05, metalness: 0.3, clearcoat: 1 });
      for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.021, 20, 12), sg); l.scale.set(1.3, 0.9, 0.32); A.head(l, [s * 0.033, 0.017, 0.1]); }
      A.head(new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.003, 0.003), A.SILVER), [0, 0.022, 0.104]);
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0035, 8, 20), A.SILVER); e.rotation.y = Math.PI / 2; A.head(e, [s * 0.088, -0.045, 0]); }
    },
  },
  cherry: {
    h: 1.07, bust: 0.058, hip: 0.16, waist: 0.12, sh: 0.18,
    skin: '#8a5438', lips: '#d02a7a', browC: '#1a0c08', hairC: '#9a1418', eyes: '#3a2010', shadowC: '#e04aa8', shadowAmt: 0.75, lashes: 0.15, blushAmt: 0.4, blush: '#d04a6a', browW: 0.004, browTilt: -0.3, jaw: 1.02,
    hairBox: [[0, 0.1, -0.025], 0.23],
    hair: () => strands(waves(Sub(U(0.09,
      ell(0, 0.03, -0.012, 0.108, 0.115, 0.112),
      cone(0, 0.08, -0.024, 0, 0.19, -0.03, 0.112, 0.1),
      ell(0, 0.235, -0.032, 0.098, 0.085, 0.095),
      mirX(sph(0.092, -0.02, -0.02, 0.042)), mirX(sph(0.075, 0.1, -0.05, 0.05))), FACE_CUT, 0.012), 0.005, 38, 3), 0.0015),
    skinParts: b => U(0.012, U(0.02, b.torso, b.neck, b.legs), b.arms),
    outfit: b => [
      { sdf: Sub(pleats(U(0.03, below(grow(b.torso, 0.009), 1.345, 0.015), sqz(cone(0, 1.0, 0, 0, 0.02, 0.03, 0.16, 0.2), 0.82)), 0.003, 9, 1.1, 0.4), shiftX(wedge(-0.1, 0.62, 0.022, 0.06, 0.0), -0.1), 0.006), paint: PA.zone((x, y, z, c) => { if (Math.sin((x * 1.4 + y) * 60) > 0.75 && y > 0.6 && y < 1.25) c.multiplyScalar(0.85); }, '#d0167a'), mat: { roughness: 0.3, sheen: 1, sheenColor: 0xff70b0, clearcoat: 0.5 } },
      { sdf: G.heels(b), paint: solid('#d0167a', 0.05), mat: { roughness: 0.2, clearcoat: 0.8 } },
    ],
    pose: (J, s) => s > 0 ? hip(s) : relaxed(J, s), gestureSide: -1, gestureBig: 1, fidget: { side: -1, t: [-0.07, 1.74, 0.03], every: 8 },
    acc: A => {
      const star = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.011 : 0.026; i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      const st = new THREE.Mesh(new THREE.ExtrudeGeometry(star, { depth: 0.006, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002 }), A.BRASS); st.rotation.y = 0.5; A.head(st, [0.06, 0.2, 0.06]);
      for (const s of [-1, 1]) A.head(new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 8), A.BRASS), [s * 0.089, -0.045, 0]);
    },
  },
  dex: {
    h: 1.0, sh: 0.162, hip: 0.14, waist: 0.12,
    skin: '#e0b394', lips: '#b07a68', browC: '#3a2414', hairC: '#5a3620', eyes: '#5a3a22', browW: 0.005, jaw: 1.02, nose: 1.05, blushAmt: 0.14,
    hairBox: [[0, 0.02, -0.01], 0.16],
    hair: () => strands(Sub(U(0.025, ell(0, 0.035, -0.012, 0.098, 0.105, 0.106), ell(0, 0.075, 0.06, 0.07, 0.035, 0.05), mirX(ell(0.07, -0.02, 0.0, 0.03, 0.05, 0.05)), ...tufts(14, 5, 0.03, 0.02)), U(0.01, FACE_CUT, ell(0, -0.02, 0.02, 0.12, 0.045, 0.08)), 0.012), 0.02),
    skinParts: b => b.neck,
    outfit: b => {
      const hood = U(0.03, ell(0, 1.46, -0.1, 0.13, 0.075, 0.09), cone(-0.1, 1.43, -0.02, 0.1, 1.43, -0.02, 0.05, 0.05));
      const pocket = ell(0, 0.95, 0.105, 0.11, 0.055, 0.02), strings = mirX(cone(0.035, 1.43, 0.09, 0.038, 1.22, 0.108, 0.005, 0.005));
      const hoodie = wrinkles(U(0.012, U(0.03, above(U(0.03, grow(b.torso, 0.02), sqz(cone(0, 1.05, 0, 0, 0.84, 0, 0.16, 0.172), 0.72)), 0.845, 0.004), hood, pocket), G.sleeves(b, 0.016), strings), 0.004, 160, b.J.sx + 0.05, 1.14, -0.025, 0.07);
      const blue = rgb('#265c7e'), rib = rgb('#1e4c68'), white = rgb('#e8e4dc');
      return [
        { sdf: hoodie, paint: (x, y, z, c) => { c.copy(blue).multiplyScalar(0.88 + vnoise(x * 150, y * 150, z * 150) * 0.16); if (y < 0.87 || (y < 0.93 && Math.abs(x) > 0.2)) c.copy(rib); if (Math.abs(Math.abs(x) - 0.037) < 0.008 && z > 0.09 && y < 1.44 && y > 1.2) c.copy(white); }, mat: { roughness: 0.9, sheen: 0.6, sheenColor: 0x8fb8d0 } },
        { sdf: wrinkles(G.pants(b, 0.013), 0.003, 130, 0.095, 0.5, 0.02, 0.08), paint: solid('#5a3c28', 0.12, 200), mat: { roughness: 0.92 } },
        { sdf: G.hightop(b), paint: (x, y, z, c) => c.set(y < 0.03 || z > 0.12 ? 0xe8e4dc : 0x2a3448), mat: { roughness: 0.7 } },
      ];
    },
    pose: (J, s) => ({ t: [s * 0.055, 0.93, 0.13], pole: [s, -0.2, -0.8] }), gestureSide: 1, fidget: { side: 1, t: [0.075, 1.61, 0.15], every: 6 },
    acc: A => {
      const fr = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.3, metalness: 0.6 });
      for (const s of [-1, 1]) { A.head(new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0022, 6, 20), fr), [s * 0.033, 0.017, 0.106]); A.head(new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.002, 0.09), fr), [s * 0.057, 0.02, 0.06]); }
      A.head(new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.002, 0.002), fr), [0, 0.02, 0.108]);
    },
  },
  juniper: {
    h: 0.97, bust: 0.058, hip: 0.17, waist: 0.14, sh: 0.172,
    skin: '#6e4430', lips: '#7a3834', browC: '#140a06', hairC: '#140c08', eyes: '#2a1810', blushAmt: 0.12, jaw: 1.0, nose: 1.08, lip: 1.25, shadowC: '#5a3a2a', shadowAmt: 0.3,
    hairBox: [[0, 0.03, -0.04], 0.18],
    hair: () => strands(U(0.03, Sub(ell(0, 0.04, -0.018, 0.103, 0.11, 0.112), U(0.01, FACE_CUT, ell(0, -0.02, 0, 0.12, 0.05, 0.09)), 0.012), sph(0, 0.08, -0.11, 0.062), sph(0.01, 0.03, -0.14, 0.045), ell(0, 0.13, -0.06, 0.05, 0.035, 0.05)), 0.004),
    hairPaintFn: () => { const g1 = rgb('#5a8a44'), g2 = rgb('#3a6428'), g3 = rgb('#9ab870'); return (x, y, z, c) => { const n = vnoise(x * 60, y * 60, z * 60), n2 = vnoise(x * 130 + 5, y * 130, z * 130); c.copy(n > 0.55 ? g2 : n2 > 0.62 ? g3 : g1).multiplyScalar(0.9 + vnoise(x * 300, y * 300, z * 300) * 0.15); }; },
    hairMat: { roughness: 0.85, sheen: 0.4 },
    skinParts: b => U(0.012, b.neck, below(b.arms, 1.02, 0.006)),
    outfit: b => {
      const coat = U(0.012, U(0.03, above(grow(b.torso, 0.016), 0.8, 0.02), above(sqz(cone(0, 1.0, 0, 0, 0.74, 0.005, 0.17, 0.19), 0.82), 0.74, 0.01)), G.roll(b, 0.016, 1.0));
      const skirtBody = U(0.03, grow(b.torso, 0.03), sqz(cone(0, 1.0, 0.0, 0, 0.5, 0.02, 0.19, 0.23), 0.8));
      const apron = G.apron(skirtBody, 1.34, 0.5, 0.17, 0.03);
      const w = rgb('#ece6d8'), ap = rgb('#5a6a3a');
      return [
        { sdf: coat, paint: (x, y, z, c) => { c.copy(w).multiplyScalar(0.92 + vnoise(x * 150, y * 150, z * 150) * 0.1); }, mat: { roughness: 0.85, sheen: 0.4, sheenColor: 0xffffff } },
        { sdf: apron, paint: (x, y, z, c) => { c.copy(ap).multiplyScalar(0.8 + vnoise(x * 300, y * 60, z * 300) * 0.3); if (Math.abs(y - 1.02) < 0.018) c.multiplyScalar(0.85); if (y < 0.88 && y > 0.7 && Math.abs(x) < 0.12 && Math.abs(y - 0.88) < 0.006) c.multiplyScalar(0.7); }, mat: { roughness: 0.9 } },
        { sdf: above(grow(below(b.legs, 0.82), 0.014), 0.075, 0.01), paint: solid('#2a2a30', 0.1), mat: { roughness: 0.9 } },
        { sdf: G.boots(b, 0.1), paint: solid('#141214', 0.05), mat: { roughness: 0.3 } },
      ];
    },
    pose: (J, s) => s < 0 ? hip(s) : { t: [0.19, 1.3, 0.12], pole: [1, -0.3, -0.4] }, gestureSide: 1, fidget: { side: -1, t: [-0.04, 1.18, 0.16], every: 11 },
    acc: A => {
      for (const s of [-1, 1]) A.head(new THREE.Mesh(new THREE.SphereGeometry(0.01, 10, 8), A.BRASS), [s * 0.087, -0.035, 0]);
      const bm = new THREE.MeshStandardMaterial({ color: 0xe8e2d8, roughness: 0.4 });
      for (let i = 0; i < 2; i++) for (const s of [-1, 1]) A.chest(new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), bm), [s * 0.05, 1.4 - i * 0.06, 0.1]);
      A.hold(1, PROP.spoon(), [0, -0.06, 0.02]);
    },
  },
  opal: {
    h: 0.97, bust: 0.044, hip: 0.155, waist: 0.13, sh: 0.165,
    skin: '#e6c8b6', lips: '#9a5a5a', browC: '#9a9aa0', hairC: '#c4c4c8', eyes: '#5a6a7a', blushAmt: 0.2, shadowAmt: 0.25, shadowC: '#8a6a7a', jaw: 0.97, nose: 1.0,
    hairBox: [[0, -0.02, -0.01], 0.16],
    hair: () => strands(Sub(U(0.02, ell(0, -0.008, -0.012, 0.106, 0.118, 0.112), ell(0.01, 0.07, 0.055, 0.075, 0.03, 0.05)), U(0.01, FACE_CUT, ell(0, -0.16, 0, 0.2, 0.06, 0.2)), 0.014), 0.003),
    hairTip: '#a8a8b0',
    skinParts: b => b.neck,
    outfit: b => {
      let coat = U(0.012, U(0.03, above(grow(b.torso, 0.017), 0.8, 0.02), above(sqz(cone(0, 1.02, 0, 0, 0.3, 0.005, 0.17, 0.24), 0.8), 0.3, 0.01), mirX(cone(0.08, 1.42, 0.08, 0.012, 1.1, 0.118, 0.016, 0.006))), G.sleeves(b, 0.015));
      coat = pleats(wrinkles(coat, 0.003, 150, b.J.sx + 0.05, 1.14, -0.025, 0.07), 0.004, 14, 0.8, 0.3);
      const lv = rgb('#766a90'), dk = rgb('#5a4e72'), lapF = mirX(cone(0.08, 1.42, 0.08, 0.012, 1.1, 0.118, 0.03, 0.016));
      return [
        { sdf: coat, paint: (x, y, z, c) => { c.copy(lv).multiplyScalar(0.88 + vnoise(x * 90, y * 90, z * 90) * 0.18); c.lerp(dk, ss(0.006, -0.004, lapF(x, y, z)) * ss(0.06, 0.09, z)); if (y < 0.32) c.multiplyScalar(0.85); }, mat: { roughness: 0.85, sheen: 0.5, sheenColor: 0xc0b0e0 } },
        { sdf: above(grow(below(b.legs, 0.5), 0.013), 0.075, 0.01), paint: solid('#34304a', 0.1), mat: { roughness: 0.9 } },
        { sdf: grow(b.feet, 0.013), paint: solid('#2a1a14', 0.05), mat: { roughness: 0.3 } },
      ];
    },
    pose: (J, s) => ({ t: [s * 0.05, 0.93, -0.15], pole: [s * 1, -0.2, 0.3] }), gestureSide: 1, fidget: { side: 1, t: [0.08, 1.61, 0.14], every: 11 },
    acc: A => {
      for (const s of [-1, 1]) { A.head(new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0024, 6, 20), A.BRASS), [s * 0.033, 0.017, 0.106]); A.head(new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.002, 0.09), A.BRASS), [s * 0.057, 0.02, 0.06]); }
      A.head(new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.002, 0.002), A.BRASS), [0, 0.02, 0.108]);
      A.chest(new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.0025, 6, 12), A.BRASS), [0.085, 1.3, 0.12]); // the empty pin hole
    },
  },

  // ---------- the new faces ----------
  silas: {
    h: 1.0, sh: 0.165, hip: 0.14, waist: 0.118,
    skin: '#ecc6ae', lips: '#b07068', browC: '#4a3420', hairC: '#d8c8a0', eyes: '#6a5030', browW: 0.0045, jaw: 0.97, nose: 1.02, blushAmt: 0.18,
    hairBox: [[0, 0.04, -0.01], 0.18],
    hair: () => strands(Sub(U(0.02, ell(0, 0.035, -0.01, 0.096, 0.1, 0.104), ...tufts(18, 7, 0.05, 0.02)), U(0.01, FACE_CUT, ell(0, -0.03, 0.02, 0.12, 0.045, 0.08)), 0.01), 0.008),
    hairPaintFn: () => { const blond = rgb('#dccaa0'), dark = rgb('#2a1c14'); return (x, y, z, c) => { const top = ss(0.06, 0.1, y) * ss(0.06, -0.02, z); c.copy(blond).lerp(dark, top).multiplyScalar(0.75 + vnoise(x * 400, y * 40, z * 400) * 0.45); }; },
    skinParts: b => b.neck,
    outfit: b => {
      const hood = U(0.03, ell(0, 1.47, -0.1, 0.13, 0.08, 0.09), cone(-0.1, 1.44, -0.02, 0.1, 1.44, -0.02, 0.05, 0.05));
      const hoodie = U(0.03, G.top(b, 0.012, 0.84), hood);
      const jacket = U(0.01, G.open(G.top(b, 0.03, 0.83), 0.05, 0.1), G.sleeves(b, 0.028), mirX(ell(b.J.sx + 0.08, 0.91, 0.016, 0.052, 0.025, 0.05)));
      const strap = cone(0.13, 1.43, 0.09, -0.15, 0.97, 0.13, 0.012, 0.012);
      const bag = rbox(-0.2, 0.88, 0.07, 0.035, 0.1, 0.13, 0.02);
      const patch = [[0.1, 1.28, '#c8b890'], [0.13, 1.15, '#3a5a8a'], [-0.08, 1.3, '#a82a2a'], [-0.13, 1.12, '#e0c060'], [0.2, 1.05, '#c8c8c0']];
      return [
        { sdf: hoodie, paint: solid('#1e1e22', 0.1), mat: { roughness: 0.9 } },
        { sdf: jacket, paint: PA.zone((x, y, z, c) => { for (const [px, py, pc] of patch) if (Math.hypot(x - px, y - py) < 0.028 && z > 0.02) c.set(pc); if (y < 0.93 && Math.abs(x) > 0.2) c.multiplyScalar(0.85); }, PA.denim('#46648a')), mat: { roughness: 0.85 } },
        { sdf: U(0.01, strap, bag), paint: solid('#5a5a3a', 0.12), mat: { roughness: 0.9 } },
        { sdf: wrinkles(G.pants(b, 0.02), 0.004, 120, 0.095, 0.5, 0.02, 0.1), paint: PA.plaid('#3a2a2a', '#7a3a2a', '#1a2a3a', 20), mat: { roughness: 0.92 } },
        { sdf: G.hightop(b), paint: (x, y, z, c) => c.set(y < 0.03 || z > 0.12 ? 0xd8d0c0 : 0x1a1a1e), mat: { roughness: 0.8 } },
      ];
    },
    pose: (J, s) => s > 0 ? { t: [0.2, 1.42, 0.17], pole: [1, -0.4, -0.3] } : { t: [-0.14, 1.06, 0.21], pole: [-1, -0.2, -0.6] }, gestureSide: 0, fidget: { side: -1, t: [-0.2, 1.2, 0.26], every: 7 },
    acc: A => {
      A.head(new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.0015, 6, 10), A.SILVER), [-0.088, -0.03, 0.005]);
      A.hold(1, PROP.camcorder(), [0.0, -0.05, 0.03]);
      A.hold(-1, PROP.emf(), [0, -0.07, 0.03]);
    },
  },
  jojo: {
    h: 1.0, sh: 0.16, hip: 0.14, waist: 0.118, yOff: 0.085,
    skin: '#b07a58', lips: '#9a5a4a', browC: '#1a1210', hairC: '#181210', eyes: '#3a2414', browW: 0.0045, jaw: 0.98, nose: 1.0, blushAmt: 0.15,
    hairBox: [[0, -0.03, -0.02], 0.2],
    hair: () => strands(Sub(U(0.03, ell(0, 0.04, -0.012, 0.104, 0.11, 0.11), ell(0, 0.075, 0.05, 0.085, 0.04, 0.06), ell(0, -0.1, -0.075, 0.095, 0.14, 0.05), mirX(ell(0.09, -0.05, -0.02, 0.03, 0.08, 0.05)), ...tufts(10, 3, 0.03, 0.018)), U(0.01, FACE_CUT, ell(0, -0.02, 0.03, 0.12, 0.045, 0.07)), 0.012), 0.012),
    hairPaintFn: () => { const k = rgb('#181210'), gr = rgb('#6ad838'), pu = rgb('#8a3ac8'); return (x, y, z, c) => { const s = Math.sin(x * 70 + z * 30) + vnoise(x * 50, y * 20, z * 50); c.copy(s > 1.5 ? gr : s < -0.85 ? pu : k).multiplyScalar(0.8 + vnoise(x * 400, y * 40, z * 400) * 0.35); }; },
    skinParts: b => U(0.012, b.neck, below(b.legs, 0.55, 0.01)),
    skinPaint: base => { const pu = rgb('#3a2440'), st = rgb('#7a4aa0'), sock = rgb('#ece8e0'), str = rgb('#7a3aa8'); return (x, y, z, c) => { base(x, y, z, c); if (y < 0.55) { const ck = (Math.floor((x + z) * 40) + Math.floor(y * 40)) & 1; c.copy(pu).lerp(st, ck ? 0.35 : 0); if (y < 0.33) { c.copy(sock); if (Math.abs(y - 0.3) < 0.006 || Math.abs(y - 0.28) < 0.006) c.copy(str); } } }; },
    outfit: b => {
      const jacket = U(0.01, G.open(G.top(b, 0.036, 0.84), 0.055, 0.14), G.sleeves(b, 0.032, 0.9), mirX(ell(b.J.sx + 0.08, 0.915, 0.016, 0.05, 0.022, 0.05)), ell(0, 0.85, -0.01, 0.2, 0.03, 0.13));
      const teal = rgb('#1e8a9a'), mag = rgb('#c82a8a'), blk = rgb('#1a1a20');
      return [
        { sdf: G.top(b, 0.014, 0.82), paint: PA.zone((x, y, z, c) => { if (z > 0.06 && Math.abs(x) < 0.09 && y > 1.05 && y < 1.3) { const n = vnoise(x * 80, y * 80, 3); c.set(n > 0.62 ? 0xff3aa0 : n < 0.35 ? 0x30e0ff : n > 0.5 ? 0xd8ff30 : 0x1a1a20); } }, '#1a1a20'), mat: { roughness: 0.85 } },
        { sdf: jacket, paint: (x, y, z, c) => { c.copy(teal); const sh = y > 1.32 && Math.abs(x) > 0.1 || Math.abs(x) > 0.2 && y > 1.25; if (sh) c.copy(mag); if (Math.abs(y - 1.3 + Math.abs(x) * 0.3) < 0.025 && !sh) c.copy(blk); if (Math.abs(x) > 0.21 && y < 1.1) c.copy(mag); if (y < 0.87 || (y < 0.93 && Math.abs(x) > 0.24)) c.copy(blk); c.multiplyScalar(0.85 + vnoise(x * 60, y * 60, z * 60) * 0.25); }, mat: { roughness: 0.4, sheen: 0.6, clearcoat: 0.3 } },
        { sdf: U(0.02, G.shorts(b, 0.03, 0.5), mirX(ell(0.14, 0.64, 0.01, 0.035, 0.06, 0.05))), paint: PA.zone((x, y, z, c) => { if (Math.abs(Math.abs(x) - 0.15) < 0.004 || Math.abs(y - 0.52) < 0.004) c.set(0xc82a8a); }, '#1c1c22'), mat: { roughness: 0.85 } },
        { sdf: U(0.015, grow(b.feet, 0.024), grow(below(b.legs, 0.22), 0.024), mirX(rbox(0.09, -0.005, 0.045, 0.05, 0.012, 0.12, 0.006))), paint: (x, y, z, c) => { c.copy(teal); if (y > 0.17 || (y > 0.03 && y < 0.06)) c.copy(mag); if (Math.abs(x % 0.03) < 0.004 && z > 0.07 && y > 0.06) c.set(0xd8ff30); }, mat: { roughness: 0.35, clearcoat: 0.6 } },
      ];
    },
    skates: 1,
    pose: (J, s) => s > 0 ? { t: [0.1, 1.38, 0.2], pole: [1, -0.4, -0.3] } : { t: [-0.06, 1.2, 0.15], pole: [-1, -0.2, -0.5] }, gestureSide: 1, gestureBig: 1, fidget: { side: 1, t: [0.03, 1.5, 0.16], every: 5 },
    acc: A => {
      for (const [r, c] of [[0.072, 0x8a3ac8], [0.078, 0xe8e0d0], [0.084, 0xd8ff30]]) { const n = new THREE.Mesh(new THREE.TorusGeometry(r, 0.003, 6, 28), new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 })); n.rotation.x = Math.PI / 2 - 0.35; A.chest(n, [0, 1.44, 0.035]); }
      A.hold(-1, PROP.flyers(), [0, -0.07, 0.03]);
      A.hold(1, PROP.whistle(), [0, -0.06, 0.03]);
    },
  },
  priya: {
    h: 0.99, bust: 0.05, hip: 0.15, waist: 0.12, sh: 0.158,
    skin: '#9a6446', lips: '#8a4a42', browC: '#140c08', hairC: '#141010', eyes: '#2a1a10', blushAmt: 0.16, jaw: 0.96, nose: 1.04, shadowC: '#6a4a3a', shadowAmt: 0.3,
    hairBox: [[0, 0.02, -0.04], 0.17],
    hair: () => strands(U(0.03, Sub(ell(0, 0.035, -0.015, 0.1, 0.106, 0.108), U(0.01, FACE_CUT, BROW, ell(0, -0.02, 0, 0.12, 0.05, 0.09)), 0.012), sph(0, 0.09, -0.08, 0.05), sph(0.02, 0.1, -0.05, 0.035), mirX(cone(0.07, 0.0, 0.03, 0.075, -0.07, 0.03, 0.01, 0.005))), 0.006),
    skinParts: b => b.neck,
    outfit: b => {
      const collar = mirX(cone(0.04, 1.47, 0.07, 0.06, 1.41, 0.11, 0.012, 0.004));
      const card = U(0.012, G.open(G.top(b, 0.026, 0.9), 0.02, 0.35, 1.5), G.sleeves(b, 0.022, 0.895));
      const gold = rgb('#d8b060'), navy = rgb('#1c2548');
      return [
        { sdf: U(0.01, G.top(b, 0.01, 0.9), collar, G.sleeves(b, 0.014, 0.885)), paint: solid('#efe6d4', 0.05), mat: { roughness: 0.6, sheen: 0.6 } },
        { sdf: card, paint: (x, y, z, c) => { c.copy(navy).multiplyScalar(0.85 + vnoise(x * 250, y * 250, z * 250) * 0.25); const s = vnoise(x * 90 + 7, y * 90, z * 90); if (s > 0.84) c.copy(gold); if (Math.hypot(x - 0.08, y - 1.27) < 0.013 && z > 0.05) c.copy(gold); }, mat: { roughness: 0.9, sheen: 0.8, sheenColor: 0x6070a0 } },
        { sdf: G.wide(b, 0.1, 0.105), paint: PA.zone((x, y, z, c) => { if (y > 0.955 && y < 0.99) c.set(0x5a3a22); }, solid('#3a3a3e', 0.1, 150)), mat: { roughness: 0.85 } },
        { sdf: G.boots(b, 0.2, 0.025), paint: solid('#4a1a1a', 0.06), mat: { roughness: 0.3 } },
      ];
    },
    pose: (J, s) => s < 0 ? { t: [-0.07, 1.2, 0.15], pole: [-1, -0.3, -0.5] } : { t: [0.19, 1.14, 0.1], pole: [1, -0.3, -0.5] }, gestureSide: 1, fidget: { side: 1, t: [0.08, 1.61, 0.14], every: 12 },
    acc: A => {
      for (const s of [-1, 1]) { A.head(new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.002, 6, 20), A.BRASS), [s * 0.033, 0.017, 0.106]); A.head(new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.002, 0.09), A.BRASS), [s * 0.058, 0.02, 0.06]); A.head(new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), A.BRASS), [s * 0.087, -0.03, 0.005]); }
      A.head(new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.002, 0.002), A.BRASS), [0, 0.02, 0.108]);
      A.chest(new THREE.Mesh(new THREE.CircleGeometry(0.011, 12), A.BRASS), [0, 1.33, 0.12]);
      A.hold(-1, PROP.clipboard(), [0, -0.05, 0.05]);
      A.hold(1, PROP.thermos(), [0, -0.05, 0.02]);
      A.hips(PROP.redlight(), [0.16, 0.9, 0.08]);
    },
  },
  kenji: {
    h: 1.0, sh: 0.165, hip: 0.14, waist: 0.122,
    skin: '#dcb08c', lips: '#a06a5a', browC: '#141010', hairC: '#161212', eyes: '#2a1a10', browW: 0.0045, jaw: 1.0, nose: 1.0, blushAmt: 0.12, fw: 0.97,
    hairBox: [[0, 0.03, -0.01], 0.15],
    hair: () => strands(Sub(U(0.02, ell(0, 0.04, -0.015, 0.098, 0.104, 0.106), ell(0.01, 0.09, 0.02, 0.07, 0.03, 0.08)), U(0.01, FACE_CUT, BROW, ell(0, -0.02, 0, 0.12, 0.05, 0.09), ell(0, 0.02, 0.09, 0.08, 0.035, 0.04)), 0.012), 0.003),
    skinParts: b => U(0.012, b.neck, below(b.arms, 1.08, 0.006)),
    outfit: b => {
      const vest = Sub(G.top(b, 0.026, 0.93), wedge(1.2, 1.5, 0.01, 0.35, 0.02), 0.004);
      const apron = G.apron(U(0.03, grow(b.torso, 0.034), sqz(cone(0, 1.0, 0, 0, 0.55, 0.02, 0.18, 0.21), 0.82)), 1.0, 0.56, 0.18, 0.02);
      const tw = PA.tweed('#5a3a24', '#8a6a4a');
      return [
        { sdf: U(0.01, G.top(b, 0.011, 0.88), G.roll(b, 0.014, 1.08)), paint: solid('#a8c0dc', 0.06), mat: { roughness: 0.6 } },
        { sdf: vest, paint: PA.zone((x, y, z, c) => { if (Math.abs(x) < 0.004 && z > 0.08) c.multiplyScalar(0.6); if (Math.abs(y - (1.05 + Math.abs(x + 0.05) * 0.8)) < 0.003 && x > -0.1 && x < 0.02 && z > 0.07) c.set(0xd8b060); }, tw), mat: { roughness: 0.9 } },
        { sdf: apron, paint: PA.zone((x, y, z, c) => { if (y < 0.86 && y > 0.7 && Math.abs(y - 0.86) < 0.005) c.multiplyScalar(0.7); if (Math.abs(x - 0.05) < 0.004 && y > 0.7 && y < 0.86) c.multiplyScalar(0.7); }, PA.denim('#3a4a34')), mat: { roughness: 0.6, sheen: 0.3 } },
        { sdf: G.pants(b, 0.014), paint: solid('#3a2a22', 0.1, 160), mat: { roughness: 0.85 } },
        { sdf: G.sneaker(b), paint: PA.zone((x, y, z, c) => { if (y < 0.02) c.set(0x2a1a10); }, '#6a2a1a'), mat: { roughness: 0.3, clearcoat: 0.5 } },
      ];
    },
    pose: (J, s) => s > 0 ? { t: [0.2, 1.42, 0.13], pole: [1, -0.3, -0.4] } : { t: [-0.09, 1.2, 0.2], pole: [-1, -0.3, -0.6] }, gestureSide: -1, fidget: { side: -1, t: [-0.08, 1.61, 0.14], every: 10 },
    acc: A => {
      for (const s of [-1, 1]) { A.head(new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.002, 6, 20), A.BRASS), [s * 0.033, 0.017, 0.106]); A.head(new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.002, 0.09), A.BRASS), [s * 0.057, 0.02, 0.06]); }
      A.head(new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.002, 0.002), A.BRASS), [0, 0.02, 0.108]);
      const bow = new THREE.Group(), bm = new THREE.MeshStandardMaterial({ color: 0x6a1a2a, roughness: 0.6 });
      for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.045, 4), bm); w.rotation.z = s * Math.PI / 2; w.position.x = s * 0.022; bow.add(w); }
      bow.add(new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), bm)); A.chest(bow, [0, 1.455, 0.075]);
      for (let i = 0; i < 4; i++) A.hips(mk(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6), new THREE.MeshStandardMaterial({ color: [0xd8b060, 0x8a2a2a, 0xe8e0d0, 0x3a6a8a][i], roughness: 0.4 })), [-0.02 + i * 0.022, 0.87, 0.14]);
      A.hold(1, PROP.dollhead(), [0, -0.02, 0.04]);
      A.hold(-1, PROP.pick(), [0, -0.06, 0.03]);
    },
  },
  rashad: {
    h: 1.0, sh: 0.17, hip: 0.14, waist: 0.12,
    skin: '#5a3624', lips: '#6a3a32', browC: '#140a06', hairC: '#1a1210', eyes: '#2a1810', browW: 0.0045, jaw: 1.0, nose: 1.06, lip: 1.15, blushAmt: 0.1,
    hairBox: [[0, 0.05, -0.01], 0.17],
    hair: () => Sub(U(0.012, ell(0, 0.04, -0.012, 0.094, 0.1, 0.104), ...tufts(34, 11, 0.045, 0.011, 0.6)), U(0.01, FACE_CUT, BROW, ell(0, -0.02, 0.02, 0.12, 0.05, 0.08)), 0.008),
    skinParts: b => b.neck,
    outfit: b => {
      const jacket = U(0.01, G.open(G.top(b, 0.03, 0.84), 0.06, 0.08), G.sleeves(b, 0.028, 0.9), mirX(ell(b.J.sx + 0.08, 0.915, 0.016, 0.05, 0.02, 0.05)), ell(0, 1.46, -0.02, 0.085, 0.025, 0.08));
      const green = rgb('#1e4a34'), cream = rgb('#e6dcc4'), gold = rgb('#d8a030');
      const R = (x, y) => { const u = (x - 0.1) / 0.05, v = (y - 1.26) / 0.06; return (u > -1 && u < -0.5 && v > -1 && v < 1) || (u > -1 && u < 0.8 && ((v > 0.6 && v < 1) || (v > -0.1 && v < 0.25))) || (u > 0.4 && u < 0.8 && v > 0 && v < 1) || (Math.abs(u - (0.05 - v * 0.6)) < 0.25 && v < 0 && v > -1); };
      return [
        { sdf: G.top(b, 0.012, 0.83), paint: PA.zone((x, y, z, c) => { if (z > 0.06 && Math.abs(x) < 0.08 && y > 1.1 && y < 1.3) { const m = y - 1.12 - (0.07 - Math.abs(x * 1.4)); if (m < 0) c.set(m > -0.03 ? 0x3a5a3a : 0x2a4a2a); if (Math.hypot(x, y - 1.26) < 0.03) c.set(0xe0b040); } }, '#e8e2d4'), mat: { roughness: 0.85 } },
        { sdf: jacket, paint: (x, y, z, c) => { const onArm = Math.abs(x) > 0.215 && y < 1.4 || Math.abs(x) > 0.2 && y < 1.3; c.copy(onArm ? cream : green).multiplyScalar(0.88 + vnoise(x * 200, y * 200, z * 200) * 0.14); if (y < 0.875 || (y < 0.93 && Math.abs(x) > 0.23)) c.copy(Math.sin(y * 400) > 0 ? green : cream); if (z > 0.05 && R(x, y)) c.copy(gold); }, mat: { roughness: 0.8, sheen: 0.4 } },
        { sdf: U(0.02, G.pants(b, 0.024), mirX(ell(0.155, 0.62, 0.01, 0.03, 0.07, 0.055))), paint: solid('#5a6040', 0.14, 150), mat: { roughness: 0.92 } },
        { sdf: G.sneaker(b), paint: (x, y, z, c) => c.set(y < 0.02 ? 0xe8e2d4 : (Math.sin(z * 90) > 0.3 ? 0x1e4a34 : 0xe8e2d4)), mat: { roughness: 0.6 } },
      ];
    },
    pose: (J, s) => s < 0 ? { t: [-0.2, 1.02, 0.07], pole: [-1, 0.2, -0.6] } : { t: [0.14, 0.9, 0.06], pole: [1, 0.3, -0.6] }, gestureSide: 1, fidget: { side: 1, t: [0.08, 1.46, 0.08], every: 9 },
    acc: A => { const hp = PROP.headphones(); hp.rotation.x = Math.PI / 2 - 0.35; A.chest(hp, [0, 1.45, 0.0]); A.hold(-1, PROP.books(), [0.02, -0.02, 0.04]); },
  },
  gus: {
    h: 0.97, sh: 0.19, hip: 0.165, waist: 0.16, belly: 0.12,
    skin: '#c89070', lips: '#9a5a4a', browC: '#1e1410', hairC: '#241810', eyes: '#3a2414', browW: 0.0065, jaw: 1.1, nose: 1.15, fw: 1.05, blushAmt: 0.22, blush: '#c06050',
    hairBox: [[0, -0.01, -0.01], 0.15],
    hair: () => U(0.01, strands(Sub(ell(0, 0.02, -0.012, 0.1, 0.1, 0.108), U(0.01, FACE_CUT, ell(0, 0.1, 0.02, 0.1, 0.07, 0.12)), 0.012), 0.01), ell(0, -0.038, 0.098, 0.03, 0.009, 0.013), mirX(ell(0.024, -0.048, 0.092, 0.01, 0.012, 0.01))),
    skinParts: b => b.neck,
    outfit: b => {
      const jacket = U(0.01, G.open(G.top(b, 0.034, 0.83), 0.07, 0.06), G.roll(b, 0.03, 0.93), ell(0, 1.44, -0.03, 0.13, 0.03, 0.11));
      const green = rgb('#2e4430'), cord = rgb('#6a4424');
      return [
        { sdf: U(0.01, G.top(b, 0.016, 0.86), G.sleeves(b, 0.02, 0.91)), paint: PA.zone((x, y, z, c) => { if (y > 1.4 && Math.abs(x) < 0.03 && z > 0.07) c.set(0xe8e4dc); }, PA.plaid('#c8b898', '#8a2420', '#1e4a30', 14)), mat: { roughness: 0.9 } },
        { sdf: jacket, paint: (x, y, z, c) => { c.copy(green).multiplyScalar(0.8 + vnoise(x * 150, y * 150, z * 150) * 0.3); if (y > 1.425) c.copy(cord).multiplyScalar(0.9 + Math.sin(x * 900) * 0.1); }, mat: { roughness: 0.92 } },
        { sdf: U(0.02, G.pants(b, 0.022), mirX(ell(0.16, 0.62, 0.01, 0.03, 0.07, 0.06))), paint: PA.zone((x, y, z, c) => { if (y > 0.955 && y < 0.99) c.set(0x3a2410); if (vnoise(x * 30, y * 30, z * 30) > 0.72) c.multiplyScalar(0.8); }, solid('#a88a64', 0.12, 150)), mat: { roughness: 0.95 } },
        { sdf: G.boots(b, 0.22, 0.024), paint: solid('#4a2e1a', 0.14), mat: { roughness: 0.6 } },
      ];
    },
    pose: (J, s) => s < 0 ? { t: [-0.17, 1.33, 0.15], pole: [-1, -0.3, -0.5] } : { t: [0.24, 0.95, 0.1], pole: [1, 0.2, -0.6] }, gestureSide: 1, fidget: { side: -1, t: [-0.12, 1.2, 0.18], every: 8 },
    acc: A => {
      A.hips(mk(new THREE.BoxGeometry(0.05, 0.04, 0.01), A.BRASS), [0, 0.972, 0.155]);
      for (let i = 0; i < 2; i++) A.chest(mk(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 6), new THREE.MeshStandardMaterial({ color: [0x1a1a1a, 0xe8b020][i], roughness: 0.4 })), [0.1 + i * 0.012, 1.31, 0.13]);
      A.hold(-1, PROP.keys(), [0, -0.07, 0.03]);
      A.hold(1, PROP.flashlight(), [0, -0.05, 0.03]);
    },
  },
  harper: {
    h: 0.98, bust: 0.066, hip: 0.19, waist: 0.145, sh: 0.172, belly: 0.05,
    skin: '#f0c8b0', lips: '#8a1a28', browC: '#6a2e18', hairC: '#b0482a', eyes: '#4a6a6a', blushAmt: 0.25, shadowC: '#8a5a4a', shadowAmt: 0.3, lashes: 0.35, jaw: 1.02, fw: 1.03,
    hairBox: [[0.01, 0.04, -0.01], 0.17],
    hair: () => strands(waves(Sub(U(0.03, ell(0, 0.04, -0.012, 0.1, 0.106, 0.108), ell(-0.025, 0.09, 0.03, 0.09, 0.045, 0.08), ell(-0.07, 0.01, 0.02, 0.05, 0.07, 0.07)), U(0.01, FACE_CUT, ell(0.09, -0.02, 0, 0.03, 0.06, 0.08), ell(0, -0.03, 0.02, 0.12, 0.04, 0.08)), 0.012), 0.004, 70, 5), 0.004),
    skinParts: b => b.neck,
    outfit: b => {
      const turtle = U(0.02, G.top(b, 0.01, 0.9), cone(0, 1.38, -0.01, 0, 1.52, 0.004, 0.066, 0.058), G.sleeves(b, 0.012, 0.885));
      const blazer = U(0.01, Sub(G.top(b, 0.024, 0.84), wedge(1.08, 1.5, 0.02, 0.16, 0.02), 0.004), G.roll(b, 0.022, 1.0));
      return [
        { sdf: turtle, paint: solid('#18181c', 0.1), mat: { roughness: 0.9, sheen: 0.4 } },
        { sdf: blazer, paint: solid('#a8182a', 0.12, 120), mat: { roughness: 0.8, sheen: 0.5, sheenColor: 0xff8080 } },
        { sdf: G.wide(b, 0.11, 0.12), paint: PA.zone((x, y, z, c) => { if (y > 0.95 && y < 0.985) c.set(0x141414); }, PA.plaid('#3a3434', '#6a5a5a', '#8a2a2a', 18)), mat: { roughness: 0.9 } },
        { sdf: G.boots(b, 0.07, 0.03), paint: solid('#101012', 0.05), mat: { roughness: 0.25, clearcoat: 0.6 } },
      ];
    },
    pose: (J, s) => s > 0 ? { t: [0.08, 1.4, 0.2], pole: [1, -0.4, -0.3] } : { t: [-0.25, 0.86, 0.05], pole: [-1, 0.3, -0.6] }, gestureSide: -1, fidget: { side: -1, t: [-0.085, 1.67, 0.1], every: 9 },
    acc: A => {
      const tort = new THREE.MeshStandardMaterial({ color: 0x5a3018, roughness: 0.3 });
      for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0035, 6, 20), tort); r.scale.set(1.2, 0.85, 1); r.rotation.z = s * -0.12; A.head(r, [s * 0.034, 0.018, 0.106]); A.head(new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.09), tort), [s * 0.06, 0.022, 0.06]); A.head(new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0022, 6, 12), A.BRASS), [s * 0.088, -0.035, 0.004]); }
      A.head(new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.003, 0.003), tort), [0, 0.022, 0.108]);
      A.hips(mk(new THREE.BoxGeometry(0.04, 0.03, 0.01), A.BRASS), [0, 0.967, 0.17]);
      A.hold(1, PROP.mic(), [0, -0.05, 0.03]);
      A.hold(-1, PROP.headphones(), [0, -0.06, 0.03]);
    },
  },
  regent: {
    h: 1.06, sh: 0.172, hip: 0.148, waist: 0.118, yOff: 0.088,
    skin: '#9a6040', lips: '#7a3a4a', browC: '#120a08', hairC: '#140e0c', eyes: '#2a1810', shadowC: '#8a4ac8', shadowAmt: 0.85, lashes: 0.15, browTilt: -0.45, browW: 0.0035, blushAmt: 0.25, blush: '#b0506a', stache: '#1a1010', jaw: 1.0, nose: 1.0,
    hairBox: [[0.01, 0.06, 0.0], 0.18],
    hair: () => strands(Sub(U(0.02, ell(0, 0.03, -0.015, 0.094, 0.098, 0.104), ell(0.02, 0.1, 0.03, 0.075, 0.05, 0.08), sph(0.05, 0.12, 0.06, 0.035), sph(0.07, 0.07, 0.08, 0.028), sph(-0.01, 0.13, 0.07, 0.03), sph(0.08, 0.02, 0.07, 0.022)), U(0.01, FACE_CUT, BROW, ell(-0.1, 0.0, 0, 0.03, 0.06, 0.08), ell(0, -0.04, 0.03, 0.12, 0.04, 0.08)), 0.01), 0.004),
    handColor: '#a888d0',
    skinParts: b => b.neck,
    outfit: b => {
      const jabot = U(0.01, ell(0, 1.38, 0.1, 0.045, 0.06, 0.03), ell(0, 1.31, 0.11, 0.04, 0.05, 0.03), ell(0, 1.43, 0.08, 0.04, 0.03, 0.03));
      const tailC = cone(0, 1.2, -0.08, 0, 0.02, -0.26, 0.18, 0.4);
      const tails = G.apron(G.shell(sqz(tailC, 0.4), 0.007), 1.25, 0.02, 0.5, -1);
      const coat = U(0.012, G.open(G.top(b, 0.03, 0.95), 0.075, 0.22), G.sleeves(b, 0.022, 0.9), (x, y, z) => Math.max(tails(x, y, z), z + 0.04));
      const ivory = rgb('#ece6da'), lav = rgb('#a888d0'), silver = rgb('#d8dce4');
      return [
        { sdf: U(0.01, G.top(b, 0.016, 0.88), jabot), paint: PA.zone((x, y, z, c) => { if (y > 1.28 && z > 0.08) c.set(0xf4ead4).multiplyScalar(0.9 + Math.sin(y * 300) * 0.08); if (Math.abs(y - (1.02 + Math.abs(x) * 0.5)) < 0.003 && z > 0.07) c.copy(silver); }, '#e8e0d2'), mat: { roughness: 0.6, sheen: 0.7 } },
        { sdf: coat, paint: (x, y, z, c) => { c.copy(ivory).multiplyScalar(0.92 + vnoise(x * 120, y * 120, z * 120) * 0.1); if (z < -0.04 && y < 1.2 && sqz(tailC, 0.4)(x, y, z) < 0) c.copy(lav); if ((Math.abs(x) < 0.1 && Math.abs(x) > 0.055 && z > 0.08 && y > 1.1 && Math.sin(y * 400) > 0.3) || (y < 0.95 && y > 0.91 && Math.abs(x) > 0.22 && Math.sin(z * 400) > 0.3)) c.copy(silver); }, mat: { roughness: 0.55, sheen: 0.6 } },
        { sdf: G.wide(b, 0.085, 0.13, -0.04), paint: PA.zone((x, y, z, c) => { if (Math.abs(Math.abs(x) - 0.19 + (0.9 - y) * 0.04) < 0.005 && Math.sin(y * 300) > 0) c.copy(silver); }, '#ece6da'), mat: { roughness: 0.6, sheen: 0.5 } },
        { sdf: G.platform(b), paint: (x, y, z, c) => c.set(y < 0.02 ? 0xc8ccd4 : 0xf0ece6), mat: { roughness: 0.2, clearcoat: 0.8, metalness: 0.1 } },
      ];
    },
    pose: (J, s) => s < 0 ? { t: [-0.26, 0.92, 0.12], pole: [-1, 0.2, -0.5] } : { t: [0.05, 1.33, 0.14], pole: [1, -0.4, -0.4] }, gestureSide: 1, gestureBig: 1, fidget: { side: 1, t: [0.06, 1.66, 0.1], every: 8 },
    acc: A => {
      A.chest(mk(new THREE.SphereGeometry(0.016, 12, 8), new THREE.MeshPhysicalMaterial({ color: 0x8a4ad8, roughness: 0.05, clearcoat: 1, emissive: 0x3a1a6a, emissiveIntensity: 0.4 })), [0, 1.4, 0.125]);
      for (let i = 0; i < 3; i++) A.chest(mk(new THREE.SphereGeometry(0.007, 8, 6), A.SILVER), [0.02, 1.2 - i * 0.06, 0.11]);
      for (const s of [-1, 1]) { const e = mk(new THREE.ConeGeometry(0.008, 0.035, 6), A.SILVER); e.rotation.x = Math.PI; A.head(e, [s * 0.088, -0.055, 0.004]); }
      A.hold(-1, PROP.cane(), [0, -0.04, 0.03]);
    },
  },
  nate: {
    h: 1.03, sh: 0.19, hip: 0.15, waist: 0.135,
    skin: '#b87a52', lips: '#8a5242', browC: '#140c08', hairC: '#120c0a', eyes: '#2a1a10', browW: 0.0055, jaw: 1.08, nose: 1.08, fw: 1.02, blushAmt: 0.12,
    hairBox: [[-0.04, -0.12, -0.02], 0.27],
    hair: () => { const braid = []; for (let i = 0; i < 9; i++) { const t = i / 8; braid.push(sph(-0.075 - t * 0.04, -0.06 - t * 0.3, -0.04 + t * 0.12 + Math.sin(i * 1.3) * 0.004, 0.022 - t * 0.006)); } return strands(U(0.02, Sub(U(0.02, ell(0, 0.035, -0.015, 0.1, 0.106, 0.11), ell(0, -0.1, -0.075, 0.1, 0.13, 0.05)), U(0.01, FACE_CUT, BROW, ell(0, -0.02, 0.03, 0.12, 0.05, 0.08)), 0.012), ...braid), 0.004); },
    skinParts: b => U(0.012, b.neck, below(b.arms, 1.08, 0.006)),
    outfit: b => {
      const vest = Sub(G.top(b, 0.028, 0.9), wedge(1.3, 1.5, 0.012, 0.3, 0.02), 0.004);
      return [
        { sdf: U(0.01, G.top(b, 0.013, 0.88), G.roll(b, 0.016, 1.08)), paint: PA.zone((x, y, z, c) => { if (x < -0.2 && y > 1.24 && y < 1.34 && z > -0.02) c.set(Math.hypot(x + 0.235, y - 1.29) < 0.025 ? 0x3a6a4a : 0xd8c8a0); }, '#cbb892'), mat: { roughness: 0.8 } },
        { sdf: vest, paint: PA.zone((x, y, z, c) => { if (Math.abs(x) < 0.004 && z > 0.08) c.set(0x1a1a1a); }, solid('#34482e', 0.16, 250)), mat: { roughness: 0.95, sheen: 0.7, sheenColor: 0x7a9a6a } },
        { sdf: U(0.02, G.pants(b, 0.02), mirX(ell(0.16, 0.62, 0.01, 0.03, 0.07, 0.06))), paint: PA.zone((x, y, z, c) => { if (y > 0.955 && y < 0.99) c.set(0x3a2410); if (Math.abs(y - 0.5) < 0.004) c.multiplyScalar(0.7); }, solid('#5a4a34', 0.12, 150)), mat: { roughness: 0.9 } },
        { sdf: G.boots(b, 0.2, 0.026), paint: (x, y, z, c) => c.set(y < 0.03 ? 0x1a1a1a : y > 0.14 ? 0x5a5a52 : 0x6a4424), mat: { roughness: 0.7 } },
      ];
    },
    pose: (J, s) => s < 0 ? { t: [-0.05, 1.23, 0.16], pole: [-1, -0.3, -0.4] } : { t: [0.24, 0.88, 0.1], pole: [1, 0.3, -0.6] }, gestureSide: 1, fidget: { side: -1, t: [-0.02, 1.58, 0.22], every: 9 },
    acc: A => {
      A.chest(mk(new THREE.BoxGeometry(0.05, 0.012, 0.004), A.BRASS), [0.09, 1.32, 0.125]);
      A.hold(-1, PROP.binoculars(), [0.02, -0.05, 0.04]);
      A.hold(1, PROP.map(), [0, -0.04, 0.03]);
      A.fore(1, mk(new THREE.TorusGeometry(0.03, 0.008, 6, 14), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 })), [0, -0.2, 0]);
    },
  },
};

function J2(b) { return b.J; }

// ---------- Build (and cache) the meshes ----------
async function generate(who) {
  const o = CAST[who], J = joints(o), b = body(o, J), caps = capsules(J), out = [];
  const yieldUI = () => new Promise(r => setTimeout(r, 0));
  // two aligned body grids (same spacing) split at y 0.74: identical triangles where they overlap, so no seam
  const ST = 0.0095, SPLIT = 0.74, UP = [[0, 1.14, 0.01], 46 * ST, 66], LO = [[0, 1.14 - 80 * ST, 0.01], 42 * ST, 60];
  const both = (sdf, paint) => join(polygonise(sdf, LO[0], LO[1], LO[2], paint, y => y < SPLIT, 0.6), polygonise(sdf, UP[0], UP[1], UP[2], paint, y => y >= SPLIT, 0.6));
  const skinBase = solid(o.skin, 0.08, 150), skinPaint = o.skinPaint ? o.skinPaint(skinBase) : skinBase;
  const sp = o.skinParts(b); if (sp) { out.push({ mat: { kind: 'skin' }, ...weigh(both(sp, skinPaint), caps) }); await yieldUI(); }
  for (const part of o.outfit(b)) { out.push({ mat: { kind: 'cloth', ...part.mat }, ...weigh(both(part.sdf, part.paint), caps, null, 0.024) }); await yieldUI(); }
  for (const s of [-1, 1]) {
    const H = handSDF(J, s), Wf = H.W;
    const wrist = p => { const t = ss(Wf[1] + 0.012, Wf[1] - 0.012, p[1]); return [[BI[s > 0 ? 'handR' : 'handL'], t + 1e-4], [BI[s > 0 ? 'foreR' : 'foreL'], 1 - t + 1e-4]]; };
    const hp = o.handColor ? solid(o.handColor, 0.06) : skinBase;
    out.push({ mat: o.handColor ? { kind: 'cloth', roughness: 0.5, sheen: 0.8 } : { kind: 'skin' }, ...weigh(polygonise(H.sdf, [Wf[0] + s * 0.004, Wf[1] - 0.07, Wf[2] + 0.015], 0.086, 40, hp, null, 0.8), null, wrist) });
  }
  await yieldUI();
  const headW = p => {
    const y = p[1] - HC[1], z = p[2] - HC[2], ax = Math.abs(p[0]);
    const jaw = ss(-0.046, -0.058, y) * ss(-0.02, 0.02, z) * ss(0.075, 0.05, ax) * ss(-0.15, -0.12, y);
    const nk = ss(-0.07, -0.12, y);
    return [[BI.jaw, jaw * (1 - nk) + 1e-4], [BI.head, (1 - jaw) * (1 - nk) + 1e-4], [BI.neck, nk + 1e-4]];
  };
  out.push({ mat: { kind: 'skin' }, ...weigh(polygonise(at(headSDF(o), HC), [0, HC[1] - 0.02, HC[2]], 0.165, 72, atP(paintHead(o), HC), null, 1), null, headW) });
  await yieldUI();
  const hb = o.hairBox, hp = o.hairPaintFn ? o.hairPaintFn() : hairPaint(o.hairC, 0.22, o.hairTip);
  out.push({ mat: { kind: 'hair', color: o.hairC, ...(o.hairMat || {}) }, ...weigh(polygonise(at(o.hair(), HC), [hb[0][0] + HC[0], hb[0][1] + HC[1], hb[0][2] + HC[2]], hb[1], 60, atP(hp, HC), null, 0.35), null, () => [[BI.head, 1]]) });
  return out;
}

const DATA = {};
function idb() { return new Promise((res, rej) => { const r = indexedDB.open('novavale', 1); r.onupgradeneeded = () => r.result.createObjectStore('mesh'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function cacheGet(k) { try { const db = await idb(); return await new Promise(res => { const q = db.transaction('mesh').objectStore('mesh').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch (e) { return null; } }
async function cachePut(k, v) { try { const db = await idb(); db.transaction('mesh', 'readwrite').objectStore('mesh').put(v, k); } catch (e) { } }

export const castReady = who => !!DATA[who];
async function prepareOne(who) {
  const key = VERSION + ':' + who;
  let d = await cacheGet(key);
  if (!d) { d = await generate(who); cachePut(key, d); }
  DATA[who] = d;
}
// Build the people in `first` now (with progress), then everyone else quietly, calling onEach as each is ready.
export async function prepareCast(first, progress, onEach, skip = []) {
  const all = Object.keys(CAST).filter(w => !skip.includes(w)), now = all.filter(w => first.includes(w)), later = all.filter(w => !first.includes(w));
  for (let i = 0; i < now.length; i++) { progress && progress(i, now.length); await prepareOne(now[i]); }
  progress && progress(now.length, now.length);
  (async () => { for (const w of later) { await new Promise(r => setTimeout(r, 30)); await prepareOne(w); onEach && onEach(w); } })();
}

function eyeMat(color) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#efe8e0'; g.fillRect(0, 0, 256, 128);
  const vein = g.createRadialGradient(64, 64, 20, 64, 64, 90); vein.addColorStop(0, 'rgba(0,0,0,0)'); vein.addColorStop(1, 'rgba(200,120,110,.35)'); g.fillStyle = vein; g.fillRect(0, 0, 256, 128);
  const c = new THREE.Color(color), rgb = `${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0}`;
  const gr = g.createRadialGradient(64, 64, 2, 64, 64, 22); gr.addColorStop(0, '#000'); gr.addColorStop(0.32, '#000'); gr.addColorStop(0.38, `rgb(${rgb})`); gr.addColorStop(0.85, `rgba(${rgb},.85)`); gr.addColorStop(1, '#140e0a');
  g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 22, 0, 7); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.12)'; for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; g.beginPath(); g.moveTo(64 + Math.cos(a) * 8, 64 + Math.sin(a) * 8); g.lineTo(64 + Math.cos(a) * 20, 64 + Math.sin(a) * 20); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(58, 57, 4, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03 });
}

export function buildPerson(who, BRASS, HIT) {
  const o = CAST[who], J = joints(o), D = DATA[who];
  const g = new THREE.Group(); g.userData.who = who;
  // skeleton
  const bones = {}, list = [];
  for (const [name, parent] of BONES) {
    const b = new THREE.Bone(); b.name = name; const w = boneWorld(J, name), pw = parent ? boneWorld(J, parent) : [0, 0, 0];
    b.position.set(w[0] - pw[0], w[1] - pw[1], w[2] - pw[2]); (parent ? bones[parent] : g).add(b);
    bones[name] = b; list.push(b);
  }
  g.updateMatrixWorld(true);
  const skel = new THREE.Skeleton(list);
  const mats = {
    skin: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.52, sheen: 0.5, sheenRoughness: 0.5, sheenColor: 0xffd8c8 }),
  };
  for (const S of D) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(S.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(S.nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(S.col, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(S.si, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(S.sw, 4));
    geo.setIndex(new THREE.BufferAttribute(S.idx, 1));
    let m;
    if (S.mat.kind === 'skin') m = mats.skin;
    else if (S.mat.kind === 'hair') m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: S.mat.roughness ?? 0.55, sheen: S.mat.sheen ?? 0.6, sheenRoughness: 0.4, sheenColor: new THREE.Color(S.mat.color).lerp(new THREE.Color(0xffffff), 0.22) });
    else { const { kind, ...p } = S.mat; m = new THREE.MeshPhysicalMaterial({ vertexColors: true, ...p }); }
    const mesh = new THREE.SkinnedMesh(geo, m); mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
    g.add(mesh); mesh.bind(skel);
  }
  // attach helpers: head-local coordinates or character-space points to bones
  const headB = boneWorld(J, 'head'), chestB = boneWorld(J, 'chest'), hipsB = boneWorld(J, 'hips'), props = [];
  const A = {
    BRASS, SILVER: new THREE.MeshStandardMaterial({ color: 0xd8dce2, roughness: 0.18, metalness: 1 }),
    hips: (obj, p) => { obj.position.set(p[0] - hipsB[0], p[1] - hipsB[1], p[2] - hipsB[2]); bones.hips.add(obj); return obj; },
    // held props hang from the hand bone but are turned upright every frame
    hold: (s, obj, off) => { const piv = new THREE.Group(); piv.position.set(off[0] * s, off[1], off[2]); piv.add(obj); bones['hand' + (s > 0 ? 'R' : 'L')].add(piv); props.push(piv); return obj; },
    fore: (s, obj, off) => { obj.position.set(off[0], off[1], off[2]); bones['fore' + (s > 0 ? 'R' : 'L')].add(obj); return obj; },
    head: (obj, p) => { obj.position.set(p[0] + HC[0] - headB[0], p[1] + HC[1] - headB[1], p[2] + HC[2] - headB[2]); bones.head.add(obj); return obj; },
    chest: (obj, p) => { obj.position.set(p[0] - chestB[0], p[1] - chestB[1], p[2] - chestB[2]); bones.chest.add(obj); return obj; },
  };
  // eyes with blinking lids
  const eyes = [], lids = [];
  if (!o.sunglasses) {
    const em = eyeMat(o.eyes), lm = new THREE.MeshStandardMaterial({ color: new THREE.Color(o.skin).multiplyScalar(0.92), roughness: 0.6, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const piv = A.head(new THREE.Group(), [s * 0.032, 0.016, 0.077]);
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.0128, 24, 16), em); piv.add(e); eyes.push(piv);
      const lp = A.head(new THREE.Group(), [s * 0.032, 0.016, 0.077]);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0138, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), lm); lp.add(lid); lids.push(lp);
      lp.rotation.x = -0.9;
    }
  }
  o.acc && o.acc(A);
  if (o.skates) {
    const wm = new THREE.MeshStandardMaterial({ color: 0xff3a9a, roughness: 0.3 }), pm = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.4, metalness: 0.6 });
    for (const [side, s] of [['L', -1], ['R', 1]]) {
      const F = bones['foot' + side], f = boneWorld(J, 'foot' + side);
      const plate = mk(new THREE.BoxGeometry(0.07, 0.015, 0.22), pm, 0, -0.09 - f[1] + 0.09, 0.05 - f[2]); F.add(plate);
      for (const dz of [-0.035, 0.12]) for (const dx of [-0.032, 0.032]) { const w = mk(new THREE.CylinderGeometry(0.032, 0.032, 0.026, 18), wm, dx, -0.05 - f[1], dz - f[2]); w.rotation.z = Math.PI / 2; F.add(w); }
    }
  }
  const hc = A.head(new THREE.Object3D(), [0, 0, 0]);
  const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.9, 10), HIT); hb.position.y = 0.95; hb.userData.who = who; hb.userData.nocast = 1; g.add(hb);
  g.scale.setScalar(o.h ?? 1);
  const up = boneWorld(J, 'upperR'), fo = boneWorld(J, 'foreR'), ha = boneWorld(J, 'handR');
  g.userData = {
    ...g.userData, head: hc, body: g, torso: g, t: Math.random() * 10, yOff: o.yOff || 0,
    A: {
      o, J, bones, eyes, lids, t: Math.random() * 10, talk: 0, blink: 0, blinkT: 2 + Math.random() * 3, gest: 0, gestT: 1, fid: 0, fidT: (o.fidget?.every ?? 9) * (0.5 + Math.random()),
      L1: Math.hypot(fo[0] - up[0], fo[1] - up[1], fo[2] - up[2]), L2: Math.hypot(ha[0] - fo[0], ha[1] - fo[1], ha[2] - fo[2]),
      restU: new THREE.Vector3(fo[0] - up[0], fo[1] - up[1], fo[2] - up[2]).normalize(), restF: new THREE.Vector3(ha[0] - fo[0], ha[1] - fo[1], ha[2] - fo[2]).normalize(),
      look: new THREE.Vector2(), hand: { L: null, R: null }, props,
    },
  };
  return g;
}

// ---------- Animation ----------
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), q3 = new THREE.Quaternion();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// Two-bone IK: put the hand at T (world), elbow towards pole P (world).
function solveArm(g, A, side, T, P) {
  const U = A.bones['upper' + side], F = A.bones['fore' + side], mirror = side === 'L' ? -1 : 1;
  U.quaternion.identity(); F.quaternion.identity(); U.updateMatrixWorld(true);
  const S = U.getWorldPosition(v1), sc = g.scale.x, L1 = A.L1 * sc, L2 = A.L2 * sc;
  const dT = v2.copy(T).sub(S); const d = clamp(dT.length(), 0.02, (L1 + L2) * 0.995); dT.normalize();
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const pp = v3.copy(P).sub(S); pp.sub(v4.copy(dT).multiplyScalar(pp.dot(dT))).normalize();
  const E = v4.copy(S).addScaledVector(dT, a).addScaledVector(pp, h);
  const Tp = v3.copy(S).addScaledVector(dT, d);
  U.parent.getWorldQuaternion(q1);
  const rU = new THREE.Vector3(A.restU.x * mirror, A.restU.y, A.restU.z).applyQuaternion(q1);
  q2.setFromUnitVectors(rU, v2.copy(E).sub(S).normalize());
  U.quaternion.copy(q1).invert().multiply(q2).multiply(q1);
  U.updateMatrixWorld(true);
  U.getWorldQuaternion(q1);
  const rF = new THREE.Vector3(A.restF.x * mirror, A.restF.y, A.restF.z).applyQuaternion(q1);
  q2.setFromUnitVectors(rF, v2.copy(Tp).sub(E).normalize());
  F.quaternion.copy(q1).invert().multiply(q2).multiply(q1);
}

// speech: { who, typing } from the dialogue box; cam: the camera
export function animatePerson(g, dt, cam, speech) {
  const A = g.userData.A; if (!A) return;
  const B = A.bones, o = A.o, J = A.J;
  A.t += dt; const t = A.t;
  const speaking = speech.who === g.userData.who && speech.typing;
  const listening = speech.focus === g.userData.who && !speaking;
  A.talk = damp(A.talk, speaking ? 1 : 0, 8, dt);
  // breathing and weight shift
  const sway = Math.sin(t * 0.33);
  B.hips.position.x = sway * 0.012; B.hips.rotation.z = -sway * 0.02;
  B.thighL.rotation.z = B.thighR.rotation.z = sway * 0.02;
  B.spine.rotation.z = sway * 0.018 + Math.sin(t * 0.21) * 0.01;
  B.chest.rotation.x = -0.01 + Math.sin(t * 1.8) * 0.012 - A.talk * 0.015;
  // head and eyes follow the camera, with a nod while talking and listening
  g.updateMatrixWorld(true);
  const lc = g.worldToLocal(v1.copy(cam.position));
  const dx = lc.x, dy = lc.y - 1.6, dz = lc.z;
  const yaw = clamp(Math.atan2(dx, dz), -0.8, 0.8), pitch = clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.35, 0.35);
  A.look.x = damp(A.look.x, yaw, 3, dt); A.look.y = damp(A.look.y, pitch, 3, dt);
  const nod = Math.sin(t * 3.1) * 0.035 * A.talk + (listening ? Math.max(0, Math.sin(t * 1.3)) ** 6 * 0.08 : 0);
  B.neck.rotation.set(A.look.y * 0.3, A.look.x * 0.35, 0);
  B.head.rotation.set(A.look.y * 0.45 + nod, A.look.x * 0.45 + Math.sin(t * 0.7) * 0.03, Math.sin(t * 0.5) * 0.03 + A.talk * Math.sin(t * 1.7) * 0.03);
  for (const e of A.eyes) { e.rotation.y = clamp(A.look.x * 0.25, -0.35, 0.35); e.rotation.x = clamp(A.look.y * 0.4, -0.25, 0.25); }
  // lip-sync jaw: syllables while the line is typing
  const syl = Math.max(0, Math.sin(t * 16) * 0.6 + Math.sin(t * 9.3 + 1) * 0.5);
  B.jaw.rotation.x = A.talk * (0.03 + syl * 0.09);
  // blinking
  A.blinkT -= dt;
  if (A.blinkT < 0) { A.blink = 0.16; A.blinkT = 2 + Math.random() * 4; }
  A.blink = Math.max(0, A.blink - dt);
  const bl = A.blink > 0 ? Math.sin((A.blink / 0.16) * Math.PI) : 0;
  for (const l of A.lids) l.rotation.x = -0.95 + bl * 2.15 + A.look.y * 0.2;
  // arms: stance, talking gestures, a fidget now and then
  A.gestT -= dt;
  if (A.gestT < 0) { A.gestT = 1.2 + Math.random() * 1.6; A.gestPhase = Math.random(); }
  A.gest = damp(A.gest, speaking ? 1 : 0, 3, dt);
  A.fidT -= dt;
  if (A.fidT < 0 && !speaking && o.fidget) { A.fid = 2.4; A.fidT = o.fidget.every * (0.8 + Math.random() * 0.6); }
  A.fid = Math.max(0, A.fid - dt);
  for (const [side, s] of [['L', -1], ['R', 1]]) {
    const P = o.pose ? o.pose(J, s) : relaxed(J, s);
    let tx = P.t[0], ty = P.t[1], tz = P.t[2];
    const gs = o.gestureSide ?? 1;
    if (gs && s === gs && A.gest > 0.01) {
      const big = o.gestureBig ? 1.4 : 1, w = A.gest * (0.6 + 0.4 * Math.sin(t * 2.2 + (A.gestPhase || 0) * 6));
      tx += (s * 0.12 - tx + s * 0.04) * w * 0.8; ty += (1.14 - ty + Math.sin(t * 3.3) * 0.04 * big) * w; tz += (0.24 * big - tz) * w * 0.9;
    }
    if (o.fidget && o.fidget.side === s && A.fid > 0) {
      const f = Math.sin(Math.min(1, A.fid / 2.4) * Math.PI), ft = o.fidget.t;
      tx += (ft[0] - tx) * f; ty += (ft[1] - ty) * f; tz += (ft[2] - tz) * f;
    }
    // smooth the hand's path
    const H = A.hand[side] || (A.hand[side] = new THREE.Vector3(tx, ty, tz));
    H.set(damp(H.x, tx, 6, dt), damp(H.y, ty, 6, dt), damp(H.z, tz, 6, dt));
    const T = g.localToWorld(v2.set(H.x, H.y, H.z).clone());
    const Pw = g.localToWorld(v3.set(P.pole[0] + boneWorld(J, 'upper' + side)[0], 1.2 + P.pole[1] * 0.3, P.pole[2] * 0.5).clone());
    solveArm(g, A, side, T, Pw);
    B['hand' + side].rotation.set(0, 0, s * (0.08 + A.gest * 0.15 * Math.sin(t * 2.7)));
  }
  if (A.props.length) {
    g.getWorldQuaternion(q3);
    for (const pv of A.props) { pv.parent.updateMatrixWorld(true); pv.parent.getWorldQuaternion(q1); pv.quaternion.copy(q1.invert()).multiply(q3); }
  }
}
