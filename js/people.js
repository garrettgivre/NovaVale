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

const VERSION = 'cast-11';

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
function weigh(S, caps, fixed) {
  const n = S.pos.length / 3, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), p = [0, 0, 0];
  for (let v = 0; v < n; v++) {
    p[0] = S.pos[v * 3]; p[1] = S.pos[v * 3 + 1]; p[2] = S.pos[v * 3 + 2];
    let list;
    if (fixed) list = fixed(p);
    else {
      const d = caps.map(c => [c.i, segDist(p, c.a, c.b) - c.r]);
      const m = Math.min(...d.map(e => e[1]));
      list = d.filter(e => e[1] - m < 0.06).map(e => [e[0], Math.exp(-(e[1] - m) / 0.012)]).sort((a, b) => b[1] - a[1]).slice(0, 4);
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
  return { torso, neck, arms: mirX(arm), legs: mirX(legR), feet: mirX(footR), J };
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
  h = U(0.006, h, mirX(ell(0.032, 0.025, 0.082, 0.0175, 0.0085, 0.0125)), mirX(ell(0.032, 0.006, 0.083, 0.015, 0.006, 0.011)));
  h = Sub(h, mirX(ell(0.032, 0.0325, 0.085, 0.017, 0.0022, 0.01)), 0.003); // lid crease
  h = U(0.012, h, cone(0, 0.02, 0.088, 0, -0.018, 0.108 * ns, 0.008, 0.013 * ns), mirX(sph(0.011, -0.022, 0.099, 0.009)));
  h = U(0.006, h, mirX(ell(0.0075, -0.0452, 0.0865, 0.0125, 0.0052 * lp, 0.009)), ell(0, -0.0555, 0.0845, 0.0155, 0.0062 * lp, 0.009));
  h = Sub(h, ell(0, -0.0503, 0.096, 0.0165, 0.0011, 0.012), 0.002);
  return h;
}
const FACE_CUT = ell(0, -0.04, 0.1, 0.074, 0.088, 0.072);

function paintHead(o) {
  const skin = lin(o.skin), lip = lin(o.lips ?? '#a05a50'), brow = lin(o.browC ?? o.hairC), blush = lin(o.blush ?? '#c06a60'), shadow = lin(o.shadowC ?? o.skin);
  const dark = skin.clone().multiplyScalar(0.72), mouth = lin('#3a1414');
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

// ---------- The cast ----------
// pose(s): where each hand rests (character space) and which way the elbow points.
const relaxed = (J, s) => ({ t: [s * (J.sx + 0.085), 0.84, 0.035], pole: [s * 0.6, 1.1, -1] });
export const CAST = {
  vesper: {
    h: 1.04, bust: 0.052, hip: 0.15, waist: 0.112, sh: 0.162,
    skin: '#e6c0a8', lips: '#8a1c30', browC: '#8a7a60', hairC: '#efe0c0', eyes: '#5a7a8a', shadowC: '#6a5a7a', shadowAmt: 0.45, lashes: 0.3, blushAmt: 0.3, jaw: 0.95, nose: 0.92,
    hairBox: [[0, -0.05, -0.02], 0.2],
    hair: () => strands(waves(Sub(U(0.04,
      ell(0, 0.035, -0.02, 0.118, 0.125, 0.125),
      mirX(ell(0.095, -0.07, -0.02, 0.06, 0.11, 0.07)),
      mirX(sph(0.085, -0.16, -0.035, 0.058)),
      ell(0, -0.1, -0.075, 0.11, 0.12, 0.065)), FACE_CUT, 0.02), 0.004, 70, 4), 0.002),
    hairTip: '#d8c49a',
    skinParts: b => U(0.012, U(0.02, b.torso, b.neck), b.arms),
    outfit: b => [{ sdf: pleats(U(0.03, below(grow(b.torso, 0.007), 1.335, 0.02), sqz(cone(0, 1.02, 0, 0, 0.02, 0.02, 0.145, 0.33), 0.82)), 0.005, 20, 1.0, 0.1), paint: (() => { const m = lin('#c4c8d2'); return (x, y, z, c) => c.copy(m).multiplyScalar(0.78 + vnoise(x * 60, y * 8, z * 60) * 0.35); })(), mat: { roughness: 0.3, metalness: 0.35, sheen: 1, sheenColor: 0xffffff } }],
    pose: (J, s) => s < 0 ? { t: [-0.155, 0.99, -0.03], pole: [-1, 0.2, -0.6] } : relaxed(J, s),
    gestureSide: 1, fidget: { side: 1, t: [0.035, 1.625, 0.13], every: 9 },
    sunglasses: 1,
    acc: A => {
      const sg = new THREE.MeshPhysicalMaterial({ color: 0x0c0a0e, roughness: 0.05, metalness: 0.3, clearcoat: 1 });
      for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.021, 20, 12), sg); l.scale.set(1.3, 0.9, 0.32); A.head(l, [s * 0.033, 0.017, 0.1]); }
      A.head(new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.003, 0.003), A.BRASS), [0, 0.022, 0.104]);
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0025, 6, 16), A.BRASS); e.rotation.y = Math.PI / 2; A.head(e, [s * 0.087, -0.035, 0]); }
    },
  },
  cherry: {
    h: 1.07, bust: 0.048, hip: 0.14, waist: 0.12, sh: 0.18,
    skin: '#7a4a32', lips: '#b02454', browC: '#1a0c08', hairC: '#7a0c14', eyes: '#3a2010', shadowC: '#d04a9a', shadowAmt: 0.7, lashes: 0.2, blushAmt: 0.35, blush: '#c04a5a', browW: 0.004, browTilt: -0.3, jaw: 1.02,
    hairBox: [[0, 0.09, -0.025], 0.22],
    hair: () => strands(waves(Sub(U(0.09,
      ell(0, 0.028, -0.012, 0.104, 0.112, 0.11),
      cone(0, 0.08, -0.022, 0, 0.27, -0.032, 0.092, 0.06)), FACE_CUT, 0.012), 0.003, 40, 1), 0.0012),
    skinParts: b => U(0.012, U(0.02, b.torso, b.neck, b.legs, b.feet), b.arms),
    skinPaint: base => { const t = lin('#5a3024'); return (x, y, z, c) => { base(x, y, z, c); if (y < 0.72) c.lerp(t, 0.55); }; },
    outfit: b => [
      { sdf: pleats(U(0.03, below(grow(b.torso, 0.009), 1.345, 0.015), above(sqz(cone(0, 1.02, 0, 0, 0.66, 0.01, 0.15, 0.225), 0.8), 0.665, 0.01)), 0.003, 16, 0.95, 0.67), paint: solid('#c8286a', 0.12, 60), mat: { roughness: 0.35, sheen: 1, sheenColor: 0xff90c0, clearcoat: 0.4 } },
      { sdf: U(0.02, above(grow(below(b.legs, 0.42), 0.012), 0.02), grow(b.feet, 0.014), mirX(rbox(0.09, 0.03, 0.05, 0.05, 0.03, 0.12, 0.012))), paint: solid('#ece6e0', 0.06), mat: { roughness: 0.2, clearcoat: 0.8 } },
    ],
    pose: (J, s) => s > 0 ? { t: [0.165, 0.99, -0.03], pole: [1, 0.2, -0.6] } : relaxed(J, s),
    gestureSide: -1, gestureBig: 1, fidget: { side: -1, t: [-0.07, 1.72, 0.03], every: 8 },
    acc: A => {
      const star = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.011 : 0.025; i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      const st = new THREE.Mesh(new THREE.ExtrudeGeometry(star, { depth: 0.006, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002 }), A.BRASS); st.rotation.y = 0.5; A.head(st, [0.05, 0.19, 0.055]);
      for (const s of [-1, 1]) A.head(new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), A.BRASS), [s * 0.088, -0.04, 0]);
    },
  },
  dex: {
    h: 1.0, sh: 0.168, hip: 0.15, waist: 0.135,
    skin: '#d8a888', lips: '#a86a5a', browC: '#241410', hairC: '#2a1a10', eyes: '#4a3020', browW: 0.0055, jaw: 1.05, nose: 1.05, blushAmt: 0.12,
    hairBox: [[0, 0.01, -0.01], 0.15],
    hair: () => strands(Sub(U(0.02, ell(0, 0.03, -0.012, 0.094, 0.1, 0.103), ell(0.02, 0.085, 0.05, 0.06, 0.03, 0.05)), U(0.01, FACE_CUT, ell(0, -0.02, 0.0, 0.12, 0.06, 0.08)), 0.015), 0.006),
    skinParts: b => b.neck,
    outfit: b => {
      const sleeves = above(b.arms, 0.875, 0.01);
      const hood = U(0.03, ell(0, 1.46, -0.1, 0.13, 0.07, 0.085), cone(-0.1, 1.43, -0.02, 0.1, 1.43, -0.02, 0.05, 0.05));
      const pocket = ell(0, 0.94, 0.1, 0.1, 0.05, 0.02);
      const strings = mirX(cone(0.035, 1.43, 0.085, 0.04, 1.26, 0.105, 0.004, 0.004));
      let hoodie = U(0.012, U(0.03, above(U(0.03, grow(b.torso, 0.018), sqz(cone(0, 1.05, 0, 0, 0.84, 0, 0.16, 0.175), 0.72)), 0.845, 0.004), hood, pocket), grow(sleeves, 0.014), strings);
      hoodie = wrinkles(wrinkles(hoodie, 0.004, 160, J2(b).sx + 0.05, 1.14, -0.025, 0.07), 0.003, 110, 0.0, 0.9, 0.0, 0.2);
      const hp = lin('#2e6a68'), cuff = lin('#244e4c');
      return [
        { sdf: hoodie, paint: (x, y, z, c) => { c.copy(hp).multiplyScalar(0.9 + vnoise(x * 150, y * 150, z * 150) * 0.15); if (y < 0.86 || (y < 0.93 && Math.abs(x) > 0.2)) c.copy(cuff); if (Math.abs(x) < 0.06 && z > 0.1 && y < 1.44 && y > 1.24) c.lerp(lin('#d8d8d0'), ss(0.012, 0.004, Math.abs(Math.abs(x) - 0.037))); }, mat: { roughness: 0.9, sheen: 0.6, sheenColor: 0x8fc0c0 } },
        { sdf: wrinkles(U(0.03, above(grow(b.legs, 0.012), 0.075, 0.01), ell(0, 0.9, -0.01, 0.17, 0.1, 0.115)), 0.003, 130, 0.095, 0.5, 0.02, 0.08), paint: (() => { const j = lin('#34486a'); return (x, y, z, c) => c.copy(j).multiplyScalar(0.8 + vnoise(x * 300, y * 40, z * 300) * 0.3); })(), mat: { roughness: 0.95 } },
        { sdf: U(0.015, grow(b.feet, 0.016), mirX(rbox(0.09, 0.012, 0.05, 0.052, 0.014, 0.125, 0.01))), paint: (x, y, z, c) => c.set(y < 0.03 ? 0xd8d4c8 : 0xe8e6e0), mat: { roughness: 0.6 } },
      ];
    },
    pose: (J, s) => ({ t: [s * 0.05, 0.92, 0.13], pole: [s * 1, -0.2, -0.8] }),
    gestureSide: 1, fidget: { side: 1, t: [0.015, 1.63, 0.12], every: 6 },
    acc: A => {
      const fr = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.4 });
      for (const s of [-1, 1]) { A.head(new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0028, 6, 20), fr), [s * 0.033, 0.017, 0.106]); A.head(new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.09), fr), [s * 0.056, 0.02, 0.06]); }
      A.head(new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.003, 0.003), fr), [0, 0.02, 0.108]);
    },
  },
  juniper: {
    h: 0.96, bust: 0.05, hip: 0.165, waist: 0.135, sh: 0.17,
    skin: '#5a3624', lips: '#6a3432', browC: '#140a06', hairC: '#140c08', eyes: '#2a1810', blushAmt: 0.1, jaw: 1.0, nose: 1.1, lip: 1.25,
    hairBox: [[0, 0.02, -0.02], 0.16],
    hair: () => U(0.02, Sub(ell(0, 0.035, -0.015, 0.1, 0.105, 0.108), U(0.01, FACE_CUT, ell(0, -0.02, 0, 0.12, 0.05, 0.09)), 0.012), sph(0, 0.03, -0.115, 0.045), sph(0.02, 0.0, -0.14, 0.02)),
    hairPaintFn: () => { const g = lin('#4a7a38'), g2 = lin('#3a6428'); return (x, y, z, c) => { c.copy(Math.sin((x + y) * 180) > 0.6 ? g2 : g).multiplyScalar(0.9 + vnoise(x * 200, y * 200, z * 200) * 0.15); }; },
    hairMat: { roughness: 0.85, sheen: 0.4 },
    skinParts: b => b.neck,
    outfit: b => {
      let coat = U(0.012, U(0.03, above(grow(b.torso, 0.016), 0.8, 0.02), above(sqz(cone(0, 1.0, 0, 0, 0.72, 0.005, 0.165, 0.19), 0.82), 0.72, 0.01), ell(0, 0.98, 0.1, 0.13, 0.2, 0.012)), grow(above(b.arms, 0.88, 0.01), 0.013));
      coat = wrinkles(coat, 0.003, 150, J2(b).sx + 0.05, 1.14, -0.025, 0.07);
      const w = lin('#ece6d8'), ap = lin('#4a6a34');
      return [
        { sdf: coat, paint: (x, y, z, c) => { c.copy(w).multiplyScalar(0.92 + vnoise(x * 150, y * 150, z * 150) * 0.1); const apron = ss(0.004, -0.004, Math.abs(x) - (0.14 - (y - 0.73) * 0.05)) * ss(1.2, 1.19, y) * ss(0.02, 0.05, z); c.lerp(ap.clone().multiplyScalar(0.9 + vnoise(x * 150, y * 150, z * 150) * 0.15), apron); if (y > 0.73 && y < 0.76) c.multiplyScalar(0.85); }, mat: { roughness: 0.85, sheen: 0.4, sheenColor: 0xffffff } },
        { sdf: above(grow(below(b.legs, 0.82), 0.013), 0.075, 0.01), paint: solid('#26262c', 0.1), mat: { roughness: 0.9 } },
        { sdf: grow(b.feet, 0.014), paint: solid('#141214', 0.05), mat: { roughness: 0.35 } },
      ];
    },
    pose: (J, s) => ({ t: [s * 0.035, 1.0, 0.17], pole: [s * 1, -0.4, -0.5] }),
    gestureSide: 1, fidget: { side: -1, t: [-0.04, 1.18, 0.16], every: 10 },
    acc: A => {
      for (const s of [-1, 1]) A.head(new THREE.Mesh(new THREE.SphereGeometry(0.01, 10, 8), A.BRASS), [s * 0.087, -0.035, 0]);
      const bm = new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.4 });
      for (let i = 0; i < 3; i++) for (const s of [-1, 1]) A.chest(new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), bm), [s * 0.05, 1.4 - i * 0.075, 0.098]);
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
      let coat = U(0.012, U(0.03, above(grow(b.torso, 0.017), 0.8, 0.02), above(sqz(cone(0, 1.02, 0, 0, 0.3, 0.005, 0.17, 0.24), 0.8), 0.3, 0.01), mirX(cone(0.08, 1.42, 0.08, 0.012, 1.1, 0.118, 0.016, 0.006))), grow(above(b.arms, 0.88, 0.01), 0.015));
      coat = pleats(wrinkles(coat, 0.003, 150, J2(b).sx + 0.05, 1.14, -0.025, 0.07), 0.004, 14, 0.8, 0.3);
      const lv = lin('#766a90'), dk = lin('#5a4e72'), lapF = mirX(cone(0.08, 1.42, 0.08, 0.012, 1.1, 0.118, 0.03, 0.016));
      return [
        { sdf: coat, paint: (x, y, z, c) => { c.copy(lv).multiplyScalar(0.88 + vnoise(x * 90, y * 90, z * 90) * 0.18); c.lerp(dk, ss(0.006, -0.004, lapF(x, y, z)) * ss(0.06, 0.09, z)); if (y < 0.32) c.multiplyScalar(0.85); }, mat: { roughness: 0.85, sheen: 0.5, sheenColor: 0xc0b0e0 } },
        { sdf: above(grow(below(b.legs, 0.5), 0.013), 0.075, 0.01), paint: solid('#34304a', 0.1), mat: { roughness: 0.9 } },
        { sdf: grow(b.feet, 0.013), paint: solid('#2a1a14', 0.05), mat: { roughness: 0.3 } },
      ];
    },
    pose: (J, s) => ({ t: [s * 0.05, 0.93, -0.15], pole: [s * 1, -0.2, 0.3] }),
    gestureSide: 1, fidget: { side: 1, t: [0.05, 1.625, 0.13], every: 11 },
    acc: A => {
      for (const s of [-1, 1]) { A.head(new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0024, 6, 20), A.BRASS), [s * 0.033, 0.017, 0.106]); A.head(new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.002, 0.09), A.BRASS), [s * 0.057, 0.02, 0.06]); }
      A.head(new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.002, 0.002), A.BRASS), [0, 0.02, 0.108]);
      A.chest(new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.0025, 6, 12), A.BRASS), [0.085, 1.3, 0.12]); // the empty pin hole
    },
  },
};
function J2(b) { return b.J; }

// ---------- Build (and cache) the meshes ----------
async function generate(who) {
  const o = CAST[who], J = joints(o), b = body(o, J), caps = capsules(J), out = [];
  const yieldUI = () => new Promise(r => setTimeout(r, 0));
  // two aligned body grids (same spacing) split at y 0.74: identical triangles where they overlap, so no seam
  const ST = 0.0095, SPLIT = 0.74, UP = [[0, 1.14, 0.01], 46 * ST, 92], LO = [[0, 1.14 - 80 * ST, 0.01], 42 * ST, 84];
  const both = (sdf, paint) => join(polygonise(sdf, LO[0], LO[1], LO[2], paint, y => y < SPLIT, 0.6), polygonise(sdf, UP[0], UP[1], UP[2], paint, y => y >= SPLIT, 0.6));
  const skinBase = solid(o.skin, 0.08, 150), skinPaint = o.skinPaint ? o.skinPaint(skinBase) : skinBase;
  out.push({ mat: { kind: 'skin' }, ...weigh(both(o.skinParts(b), skinPaint), caps) }); await yieldUI();
  for (const part of o.outfit(b)) { out.push({ mat: { kind: 'cloth', ...part.mat }, ...weigh(both(part.sdf, part.paint), caps) }); await yieldUI(); }
  for (const s of [-1, 1]) {
    const H = handSDF(J, s), Wf = H.W;
    const wrist = p => { const t = ss(Wf[1] + 0.012, Wf[1] - 0.012, p[1]); return [[BI[s > 0 ? 'handR' : 'handL'], t + 1e-4], [BI[s > 0 ? 'foreR' : 'foreL'], 1 - t + 1e-4]]; };
    out.push({ mat: { kind: 'skin' }, ...weigh(polygonise(H.sdf, [Wf[0] + s * 0.004, Wf[1] - 0.07, Wf[2] + 0.015], 0.086, 50, skinBase, null, 0.8), null, wrist) });
  }
  await yieldUI();
  const headW = p => {
    const y = p[1] - HC[1], z = p[2] - HC[2], ax = Math.abs(p[0]);
    const jaw = ss(-0.046, -0.058, y) * ss(-0.02, 0.02, z) * ss(0.075, 0.05, ax) * ss(-0.15, -0.12, y);
    const nk = ss(-0.07, -0.12, y);
    return [[BI.jaw, jaw * (1 - nk) + 1e-4], [BI.head, (1 - jaw) * (1 - nk) + 1e-4], [BI.neck, nk + 1e-4]];
  };
  out.push({ mat: { kind: 'skin' }, ...weigh(polygonise(at(headSDF(o), HC), [0, HC[1] - 0.02, HC[2]], 0.165, 88, atP(paintHead(o), HC), null, 1), null, headW) });
  await yieldUI();
  const hb = o.hairBox, hp = o.hairPaintFn ? o.hairPaintFn() : hairPaint(o.hairC, 0.22, o.hairTip);
  out.push({ mat: { kind: 'hair', color: o.hairC, ...(o.hairMat || {}) }, ...weigh(polygonise(at(o.hair(), HC), [hb[0][0] + HC[0], hb[0][1] + HC[1], hb[0][2] + HC[2]], hb[1], 80, atP(hp, HC), null, 0.35), null, () => [[BI.head, 1]]) });
  return out;
}

const DATA = {};
function idb() { return new Promise((res, rej) => { const r = indexedDB.open('novavale', 1); r.onupgradeneeded = () => r.result.createObjectStore('mesh'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function cacheGet(k) { try { const db = await idb(); return await new Promise(res => { const q = db.transaction('mesh').objectStore('mesh').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch (e) { return null; } }
async function cachePut(k, v) { try { const db = await idb(); db.transaction('mesh', 'readwrite').objectStore('mesh').put(v, k); } catch (e) { } }

export async function prepareCast(progress) {
  const list = Object.keys(CAST);
  for (let i = 0; i < list.length; i++) {
    const who = list[i], key = VERSION + ':' + who;
    progress && progress(i, list.length);
    let d = await cacheGet(key);
    if (!d) { d = await generate(who); cachePut(key, d); }
    DATA[who] = d;
  }
  progress && progress(list.length, list.length);
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
    else if (S.mat.kind === 'hair') m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: S.mat.roughness ?? 0.55, sheen: S.mat.sheen ?? 0.8, sheenRoughness: 0.4, sheenColor: new THREE.Color(S.mat.color).lerp(new THREE.Color(0xffffff), 0.5) });
    else { const { kind, ...p } = S.mat; m = new THREE.MeshPhysicalMaterial({ vertexColors: true, ...p }); }
    const mesh = new THREE.SkinnedMesh(geo, m); mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
    g.add(mesh); mesh.bind(skel);
  }
  // attach helpers: head-local coordinates or character-space points to bones
  const headB = boneWorld(J, 'head'), chestB = boneWorld(J, 'chest');
  const A = {
    BRASS,
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
  const hc = A.head(new THREE.Object3D(), [0, 0, 0]);
  const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.9, 10), HIT); hb.position.y = 0.95; hb.userData.who = who; hb.userData.nocast = 1; g.add(hb);
  g.scale.setScalar(o.h ?? 1);
  const up = boneWorld(J, 'upperR'), fo = boneWorld(J, 'foreR'), ha = boneWorld(J, 'handR');
  g.userData = {
    ...g.userData, head: hc, body: g, torso: g, t: Math.random() * 10,
    A: {
      o, J, bones, eyes, lids, t: Math.random() * 10, talk: 0, blink: 0, blinkT: 2 + Math.random() * 3, gest: 0, gestT: 1, fid: 0, fidT: (o.fidget?.every ?? 9) * (0.5 + Math.random()),
      L1: Math.hypot(fo[0] - up[0], fo[1] - up[1], fo[2] - up[2]), L2: Math.hypot(ha[0] - fo[0], ha[1] - fo[1], ha[2] - fo[2]),
      restU: new THREE.Vector3(fo[0] - up[0], fo[1] - up[1], fo[2] - up[2]).normalize(), restF: new THREE.Vector3(ha[0] - fo[0], ha[1] - fo[1], ha[2] - fo[2]).normalize(),
      look: new THREE.Vector2(), hand: { L: null, R: null },
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
    if (s === gs && A.gest > 0.01) {
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
}
