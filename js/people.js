// Sculpted characters. Each body, head, outfit and hairstyle is a signed distance field built from
// smoothly blended shapes (like digital clay), polygonised with marching cubes and painted with
// vertex colours (lips, brows, blush, eyeshadow, apron, lapels...). Built once at load.
import * as THREE from 'three';
import { MarchingCubes } from '../vendor/MarchingCubes.js';

// ---------- SDF kit ----------
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
const sph = (cx, cy, cz, r) => (x, y, z) => Math.sqrt((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2) - r;
const ell = (cx, cy, cz, rx, ry, rz) => (x, y, z) => {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.sqrt(px * px + py * py + pz * pz), k1 = Math.sqrt(px * px / (rx * rx) + py * py / (ry * ry) + pz * pz / (rz * rz));
  return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
};
// tapered capsule from a (radius r1) to b (radius r2)
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
const Int = (a, b, k) => (x, y, z) => smax(a(x, y, z), b(x, y, z), k);
const grow = (f, t) => (x, y, z) => f(x, y, z) - t;
const below = (f, y0, k = 0.01) => (x, y, z) => smax(f(x, y, z), y - y0, k);   // keep y < y0
const above = (f, y0, k = 0.01) => (x, y, z) => smax(f(x, y, z), y0 - y, k);   // keep y > y0
const sqz = (f, sz) => (x, y, z) => f(x, y, z / sz) * Math.min(1, sz);         // squash along z
const mirX = f => (x, y, z) => f(Math.abs(x), y, z);

// cheap 3D value noise for painting and hair strands
function hash(x, y, z) { let h = x * 374761393 + y * 668265263 + z * 2147483647; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) & 1023) / 1023; }
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), L(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
    L(L(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), L(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v), w);
}

// ---------- Polygonising ----------
const mcs = {};
function mc(res) { return mcs[res] || (mcs[res] = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, false, 160000)); }

// Fill the field sparsely: evaluate a coarse block centre first and skip blocks far from the surface.
function polygonise(sdf, C, H, res, paint, keep, aoK = 1) {
  const AOS = res >= 76 && H < 0.2 ? [[2, 0.45], [4, 0.35], [8, 0.25]] : [[3, 0.3], [6, 0.3], [12, 0.25]];
  const M = mc(res), n = res, f = M.field, hs = n / 2, step = H / hs, B = 4;
  const P = i => (i - hs) / hs * H;
  for (let bz = 0; bz < n; bz += B) for (let by = 0; by < n; by += B) for (let bx = 0; bx < n; bx += B) {
    const cx = C[0] + P(bx + B / 2), cy = C[1] + P(by + B / 2), cz = C[2] + P(bz + B / 2);
    const d0 = sdf(cx, cy, cz);
    if (Math.abs(d0) > step * B * 1.05) {
      const v = -d0;
      for (let z = bz; z < bz + B && z < n; z++) for (let y = by; y < by + B && y < n; y++) { const o = z * n * n + y * n; for (let x = bx; x < bx + B && x < n; x++) f[o + x] = v; }
      continue;
    }
    for (let z = bz; z < bz + B && z < n; z++) { const wz = C[2] + P(z); for (let y = by; y < by + B && y < n; y++) { const wy = C[1] + P(y), o = z * n * n + y * n; for (let x = bx; x < bx + B && x < n; x++) f[o + x] = -sdf(C[0] + P(x), wy, wz); } }
  }
  M.isolation = 0;
  M.update();
  const cnt = M.count, pos = new Float32Array(cnt * 3), nor = new Float32Array(cnt * 3), col = new Float32Array(cnt * 3);
  const c = new THREE.Color();
  for (let i = 0; i < cnt; i++) {
    const k = i * 3;
    const x = C[0] + M.positionArray[k] * H, y = C[1] + M.positionArray[k + 1] * H, z = C[2] + M.positionArray[k + 2] * H;
    pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
    let nx = M.normalArray[k], ny = M.normalArray[k + 1], nz = M.normalArray[k + 2]; const l = Math.hypot(nx, ny, nz) || 1;
    nor[k] = nx / l; nor[k + 1] = ny / l; nor[k + 2] = nz / l;
    paint(x, y, z, c); col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
  }
  // weld the duplicate vertices marching cubes emits (a third of the memory, smoother normals)
  const map = new Map(), idx = [], P2 = [], N2 = [], C2 = [];
  for (let i = 0; i < cnt; i++) {
    if (keep && i % 3 === 0 && !keep((pos[i * 3 + 1] + pos[i * 3 + 4] + pos[i * 3 + 7]) / 3)) { i += 2; continue; }
    const k = i * 3, key = Math.round(pos[k] * 2e4) + ',' + Math.round(pos[k + 1] * 2e4) + ',' + Math.round(pos[k + 2] * 2e4);
    let j = map.get(key);
    if (j === undefined) {
      j = P2.length / 3; map.set(key, j);
      const x = pos[k], y = pos[k + 1], z = pos[k + 2], nx = nor[k], ny = nor[k + 1], nz = nor[k + 2];
      // baked ambient occlusion from the shape itself: crevices (eye sockets, lips, folds) darken
      let occ = 0;
      for (const [m, w] of AOS) { const d = step * m; occ += w * Math.max(0, d - sdf(x + nx * d, y + ny * d, z + nz * d)) / d; }
      const a = 1 - Math.min(0.75, occ * aoK);
      P2.push(x, y, z); N2.push(nx, ny, nz); C2.push(col[k] * a, col[k + 1] * a, col[k + 2] * a);
    }
    idx.push(j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N2, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C2, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ---------- Anatomy ----------
const lin = h => new THREE.Color(h);
const mixC = (out, a, b, t) => out.copy(a).lerp(b, Math.max(0, Math.min(1, t)));
const ss = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

function body(o) {
  const sh = o.sh ?? 0.172, hip = o.hip ?? 0.155, waist = o.waist ?? 0.125, bust = o.bust ?? 0;
  const torso = U(0.07,
    ell(0, 1.3, -0.005, sh * 0.9, 0.16, 0.1),
    ell(0, 1.1, 0.0, waist, 0.14, 0.092),
    ell(0, 0.93, -0.01, hip, 0.12, 0.105),
    cone(-sh * 0.9, 1.415, -0.015, sh * 0.9, 1.415, -0.015, 0.05, 0.05));
  const chest = bust ? U(0.05, torso, sph(-0.056, 1.275, 0.062, bust), sph(0.056, 1.275, 0.062, bust)) : torso;
  const neck = cone(0, 1.38, -0.01, 0, 1.54, 0.008, 0.058, 0.045);
  const sx = sh + 0.02;
  const armOne = U(0.035,
    sph(sx - 0.012, 1.4, -0.012, 0.056),
    cone(sx, 1.4, -0.012, sx + 0.05, 1.14, -0.025, 0.047, 0.037),
    cone(sx + 0.05, 1.14, -0.025, sx + 0.078, 0.9, 0.015, 0.036, 0.027));
  const handOne = U(0.02, ell(sx + 0.085, 0.84, 0.022, 0.022, 0.052, 0.036), cone(sx + 0.07, 0.86, 0.045, sx + 0.063, 0.815, 0.058, 0.011, 0.009));
  const arms = mirX(armOne), hands = mirX(handOne);
  const legOne = U(0.04,
    cone(0.09, 0.93, 0.0, 0.095, 0.5, 0.012, 0.08, 0.052),
    ell(0.097, 0.36, -0.012, 0.05, 0.1, 0.052),
    cone(0.095, 0.5, 0.012, 0.09, 0.09, -0.005, 0.05, 0.032));
  const footOne = U(0.03, ell(0.09, 0.05, 0.045, 0.043, 0.042, 0.105), sph(0.09, 0.08, -0.01, 0.038));
  const legs = mirX(legOne), feet = mirX(footOne);
  return { torso: chest, neck, arms, hands, legs, feet, sh: sx };
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
    mirX(ell(0.084, 0.0, -0.006, 0.011, 0.029, 0.019)),
    cone(0, -0.06, -0.012, 0, -0.17, -0.02, 0.04, 0.042));
  h = Sub(h, mirX(sph(0.032, 0.016, 0.087, 0.0165)), 0.01);                                 // eye sockets
  h = U(0.006, h, mirX(ell(0.032, 0.025, 0.082, 0.0175, 0.0085, 0.0125)), mirX(ell(0.032, 0.006, 0.083, 0.015, 0.006, 0.011))); // lids
  h = U(0.012, h, cone(0, 0.02, 0.088, 0, -0.018, 0.108 * ns, 0.008, 0.013 * ns), mirX(sph(0.011, -0.022, 0.099, 0.009)));       // nose
  h = U(0.006, h, ell(0, -0.045, 0.086, 0.02, 0.0055 * lp, 0.009), ell(0, -0.055, 0.084, 0.018, 0.0065 * lp, 0.009));                // lips
  h = Sub(h, ell(0, -0.0502, 0.096, 0.018, 0.0013, 0.012), 0.002);                                                                 // mouth line
  return h;
}
const FACE_CUT = ell(0, -0.04, 0.1, 0.074, 0.088, 0.072);

function paintHead(o) {
  const skin = lin(o.skin), lip = lin(o.lips ?? '#a05a50'), brow = lin(o.browC ?? o.hairC), blush = lin(o.blush ?? '#c06a60'), shadow = lin(o.shadowC ?? o.skin);
  const dark = skin.clone().multiplyScalar(0.72);
  const lipsF = U(0.006, ell(0, -0.045, 0.086, 0.02, 0.0055, 0.009), ell(0, -0.055, 0.084, 0.018, 0.0065, 0.009));
  return (x, y, z, c) => {
    const n = vnoise(x * 160, y * 160, z * 160);
    c.copy(skin).multiplyScalar(0.95 + n * 0.08);
    const ax = Math.abs(x);
    // cheeks
    const cb = Math.max(0, 1 - Math.hypot(ax - 0.045, y + 0.02, (z - 0.07) * 0.8) / 0.03);
    c.lerp(blush, cb * (o.blushAmt ?? 0.25));
    // eyeshadow / lids
    const lidD = Math.hypot((ax - 0.032) / 1.3, y - 0.026, (z - 0.085) * 0.7);
    if (lidD < 0.016) c.lerp(shadow, (o.shadowAmt ?? 0.15) * (1 - lidD / 0.016));
    // lash line
    if (Math.abs(ax - 0.032) < 0.018 && y > 0.013 && y < 0.021 && z > 0.086) c.lerp(dark.clone().multiplyScalar(o.lashes ?? 0.7), 0.7);
    // brows
    const by = 0.041 + (ax - 0.032) * (o.browTilt ?? -0.12) - (ax - 0.032) ** 2 * 6;
    if (ax > 0.01 && ax < 0.056 && Math.abs(y - by) < (o.browW ?? 0.0045) && z > 0.066) c.lerp(brow, 0.9);
    // lips
    if (lipsF(x, y, z) < 0.0025) c.copy(lip).multiplyScalar(0.92 + n * 0.1);
    // nostrils and under-chin shade
    if (y < -0.028 && y > -0.034 && ax < 0.016 && ax > 0.005 && z > 0.095) c.multiplyScalar(0.6);
    if (y < -0.1) c.lerp(dark, ss(-0.1, -0.13, y) * 0.3);
  };
}

function eyeball(color) {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#efe8e0'; g.fillRect(0, 0, 128, 64);
  const gr = g.createRadialGradient(32, 32, 1, 32, 32, 11); gr.addColorStop(0, '#000'); gr.addColorStop(0.35, '#000'); gr.addColorStop(0.4, color); gr.addColorStop(0.9, color); gr.addColorStop(1, '#1a1410');
  g.fillStyle = gr; g.beginPath(); g.ellipse(32, 32, 11, 11, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.arc(29, 28, 2, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
}

// ---------- The cast ----------
const hairPaint = (base, streak = 0.25, tip) => {
  const b = lin(base), t = tip ? lin(tip) : null;
  return (x, y, z, c) => {
    const s = vnoise(x * 400, y * 30, z * 400), s2 = vnoise(x * 90, y * 90, z * 90);
    c.copy(b).multiplyScalar(0.72 + s * streak * 2 + s2 * 0.12);
    if (t) c.lerp(t, ss(0.05, -0.2, y) * 0.5);
  };
};
const solid = (hex, vary = 0.08, sc = 120) => { const b = lin(hex); return (x, y, z, c) => c.copy(b).multiplyScalar(1 - vary / 2 + vnoise(x * sc, y * sc, z * sc) * vary); };
const waves = (f, amp, fy, fa) => (x, y, z) => f(x, y, z) + amp * Math.sin(y * fy + Math.atan2(x, z) * fa);
const strands = (f, amp) => (x, y, z) => f(x, y, z) + amp * (vnoise(x * 260, y * 22, z * 260) - 0.5);

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
    skinParts: b => U(0.012, U(0.02, b.torso, b.neck), b.arms, b.hands),
    outfit: b => [{ sdf: U(0.03, below(grow(b.torso, 0.007), 1.33, 0.02), sqz(cone(0, 1.02, 0, 0, 0.02, 0.02, 0.145, 0.32), 0.82)), paint: (() => { const m = lin('#c4c8d2'); return (x, y, z, c) => { const n = vnoise(x * 60, y * 8, z * 60); c.copy(m).multiplyScalar(0.8 + n * 0.35); }; })(), mat: { roughness: 0.32, metalness: 0.35, sheen: 1, sheenColor: 0xffffff } }],
    acc: (head, B) => {
      const sg = new THREE.MeshPhysicalMaterial({ color: 0x0c0a0e, roughness: 0.05, metalness: 0.3, clearcoat: 1 });
      for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.021, 20, 12), sg); l.position.set(s * 0.033, 0.017, 0.1); l.scale.set(1.3, 0.9, 0.32); head.add(l); }
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.003, 0.003), B); br.position.set(0, 0.022, 0.104); head.add(br);
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0025, 6, 16), B); e.position.set(s * 0.087, -0.035, 0); e.rotation.y = Math.PI / 2; head.add(e); }
      return true; // sunglasses hide the eyes
    },
  },
  cherry: {
    h: 1.07, bust: 0.048, hip: 0.14, waist: 0.12, sh: 0.18,
    skin: '#7a4a32', lips: '#b02454', browC: '#1a0c08', hairC: '#7a0c14', eyes: '#3a2010', shadowC: '#d04a9a', shadowAmt: 0.7, lashes: 0.2, blushAmt: 0.35, blush: '#c04a5a', browW: 0.004, browTilt: -0.3, jaw: 1.02,
    hairBox: [[0, 0.09, -0.025], 0.22],
    hair: () => strands(waves(Sub(U(0.05,
      ell(0, 0.028, -0.012, 0.104, 0.112, 0.11),
      ell(0, 0.15, -0.025, 0.088, 0.12, 0.09),
      ell(0, 0.25, -0.03, 0.066, 0.08, 0.068)), FACE_CUT, 0.015), 0.004, 45, 2), 0.0015),
    skinParts: b => U(0.012, U(0.02, b.torso, b.neck, b.legs, b.feet), b.arms, b.hands),
    skinPaint: (base) => { const t = lin('#5a3024'); return (x, y, z, c) => { base(x, y, z, c); if (y < 0.72) c.lerp(t, 0.55); }; },
    outfit: b => [
      { sdf: U(0.03, below(grow(b.torso, 0.009), 1.345, 0.015), above(sqz(cone(0, 1.02, 0, 0, 0.66, 0.01, 0.15, 0.225), 0.8), 0.665, 0.01)), paint: solid('#c8286a', 0.12, 60), mat: { roughness: 0.35, sheen: 1, sheenColor: 0xff90c0, clearcoat: 0.4 } },
      { sdf: U(0.02, above(grow(below(b.legs, 0.42), 0.012), 0.02), grow(b.feet, 0.014), mirX(rbox(0.09, 0.03, 0.05, 0.05, 0.03, 0.12, 0.012))), paint: solid('#ece6e0', 0.06), mat: { roughness: 0.2, clearcoat: 0.8 } },
    ],
    acc: (head, B) => {
      const star = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.011 : 0.025; i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      const st = new THREE.Mesh(new THREE.ExtrudeGeometry(star, { depth: 0.006, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002 }), B); st.position.set(0.05, 0.19, 0.055); st.rotation.y = 0.5; head.add(st);
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), B); e.position.set(s * 0.088, -0.04, 0); head.add(e); }
    },
  },
  dex: {
    h: 1.0, sh: 0.18, hip: 0.15, waist: 0.135,
    skin: '#d8a888', lips: '#a86a5a', browC: '#241410', hairC: '#2a1a10', eyes: '#4a3020', browW: 0.0055, jaw: 1.05, nose: 1.05, blushAmt: 0.12,
    hairBox: [[0, 0.01, -0.01], 0.15],
    hair: () => strands(Sub(U(0.02, ell(0, 0.03, -0.012, 0.094, 0.1, 0.103), ell(0.02, 0.085, 0.05, 0.06, 0.03, 0.05)), U(0.01, FACE_CUT, ell(0, -0.02, 0.0, 0.12, 0.06, 0.08)), 0.015), 0.006),
    skinParts: b => U(0.02, b.neck, b.hands),
    outfit: b => {
      const sleeves = above(b.arms, 0.875, 0.01);
      const hood = U(0.03, ell(0, 1.46, -0.1, 0.13, 0.07, 0.085), cone(-0.1, 1.43, -0.02, 0.1, 1.43, -0.02, 0.05, 0.05));
      const hoodie = U(0.012, U(0.03, above(U(0.03, grow(b.torso, 0.018), sqz(cone(0, 1.05, 0, 0, 0.84, 0, 0.16, 0.175), 0.72)), 0.845, 0.004), hood), grow(sleeves, 0.014));
      const hp = lin('#2e6a68'), cuff = lin('#244e4c');
      return [
        { sdf: hoodie, paint: (x, y, z, c) => { c.copy(hp).multiplyScalar(0.9 + vnoise(x * 150, y * 150, z * 150) * 0.15); if (y < 0.86 || (y < 0.93 && Math.abs(x) > 0.2)) c.copy(cuff); if (z > 0.08 && y > 0.86 && y < 1.02 && Math.abs(x) < 0.11) c.multiplyScalar(0.85); if (Math.abs(x) < 0.012 && z > 0.07 && y > 1.2 && y < 1.4) c.multiplyScalar(0.7); }, mat: { roughness: 0.9, sheen: 0.6, sheenColor: 0x8fc0c0 } },
        { sdf: U(0.03, above(grow(b.legs, 0.012), 0.075, 0.01), ell(0, 0.9, -0.01, 0.17, 0.1, 0.115)), paint: (() => { const j = lin('#34486a'); return (x, y, z, c) => { c.copy(j).multiplyScalar(0.8 + vnoise(x * 300, y * 40, z * 300) * 0.3); }; })(), mat: { roughness: 0.95 } },
        { sdf: U(0.015, grow(b.feet, 0.016), mirX(rbox(0.09, 0.012, 0.05, 0.052, 0.014, 0.125, 0.01))), paint: (x, y, z, c) => c.set(y < 0.03 ? 0xd8d4c8 : 0xe8e6e0), mat: { roughness: 0.6 } },
      ];
    },
    acc: (head, B, body) => {
      const fr = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.4 });
      for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0028, 6, 20), fr); r.position.set(s * 0.033, 0.017, 0.106); head.add(r); const t = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.09), fr); t.position.set(s * 0.056, 0.02, 0.06); head.add(t); }
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.003, 0.003), fr); br.position.set(0, 0.02, 0.108); head.add(br);
    },
  },
  juniper: {
    h: 0.96, bust: 0.05, hip: 0.165, waist: 0.135, sh: 0.17,
    skin: '#5a3624', lips: '#6a3432', browC: '#140a06', hairC: '#140c08', eyes: '#2a1810', blushAmt: 0.1, jaw: 1.0, nose: 1.1, lip: 1.25,
    hairBox: [[0, 0.02, -0.02], 0.16],
    hair: () => U(0.02, Sub(ell(0, 0.035, -0.015, 0.1, 0.105, 0.108), U(0.01, FACE_CUT, ell(0, -0.02, 0, 0.12, 0.05, 0.09)), 0.012), sph(0, 0.03, -0.115, 0.045), sph(0.02, 0.0, -0.14, 0.02)),
    hairPaintFn: () => { const g = lin('#4a7a38'), g2 = lin('#3a6428'); return (x, y, z, c) => { const s = Math.sin((x + y) * 180) > 0.6 ? 1 : 0; c.copy(s ? g2 : g).multiplyScalar(0.9 + vnoise(x * 200, y * 200, z * 200) * 0.15); }; },
    skinParts: b => U(0.02, b.neck, b.hands),
    outfit: b => {
      const coat = U(0.012, U(0.03, above(grow(b.torso, 0.016), 0.8, 0.02), above(sqz(cone(0, 1.0, 0, 0, 0.72, 0.005, 0.165, 0.19), 0.82), 0.72, 0.01)), grow(above(b.arms, 0.88, 0.01), 0.013));
      const w = lin('#ece6d8'), ap = lin('#4a6a34');
      return [
        { sdf: coat, paint: (x, y, z, c) => { c.copy(w).multiplyScalar(0.92 + vnoise(x * 150, y * 150, z * 150) * 0.1); if (z > 0.02 && y < 1.2 && y > 0.73 && Math.abs(x) < 0.15 - (y - 0.73) * 0.05) c.copy(ap).multiplyScalar(0.9 + vnoise(x * 150, y * 150, z * 150) * 0.15); if (y > 0.73 && y < 0.76) c.multiplyScalar(0.85); }, mat: { roughness: 0.85, sheen: 0.4, sheenColor: 0xffffff } },
        { sdf: above(grow(below(b.legs, 0.82), 0.013), 0.075, 0.01), paint: solid('#26262c', 0.1), mat: { roughness: 0.9 } },
        { sdf: U(0.015, grow(b.feet, 0.014)), paint: solid('#141214', 0.05), mat: { roughness: 0.35 } },
      ];
    },
    acc: (head, B, body) => {
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.01, 10, 8), B); e.position.set(s * 0.087, -0.035, 0); head.add(e); }
      const bm = new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.4 });
      for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), bm); b.position.set(s * 0.05, 1.4 - i * 0.075, 0.098); body.add(b); }
    },
  },
  opal: {
    h: 0.97, bust: 0.044, hip: 0.155, waist: 0.13, sh: 0.165,
    skin: '#e6c8b6', lips: '#9a5a5a', browC: '#9a9aa0', hairC: '#c4c4c8', eyes: '#5a6a7a', blushAmt: 0.2, shadowAmt: 0.25, shadowC: '#8a6a7a', jaw: 0.97, nose: 1.0,
    hairBox: [[0, -0.02, -0.01], 0.16],
    hair: () => strands(Sub(U(0.02, ell(0, -0.008, -0.012, 0.106, 0.118, 0.112), ell(0.01, 0.07, 0.055, 0.075, 0.03, 0.05)), U(0.01, FACE_CUT, ell(0, -0.16, 0, 0.2, 0.06, 0.2)), 0.014), 0.003),
    hairTip: '#a8a8b0',
    skinParts: b => U(0.02, b.neck, b.hands),
    outfit: b => {
      const coat = U(0.012, U(0.03, above(grow(b.torso, 0.017), 0.8, 0.02), above(sqz(cone(0, 1.02, 0, 0, 0.3, 0.005, 0.17, 0.24), 0.8), 0.3, 0.01), mirX(cone(0.07, 1.38, 0.1, 0.03, 1.08, 0.115, 0.014, 0.006))), grow(above(b.arms, 0.88, 0.01), 0.015));
      const lv = lin('#766a90'), dk = lin('#5a4e72'), lapF = mirX(cone(0.07, 1.38, 0.1, 0.03, 1.08, 0.115, 0.03, 0.02));
      return [
        { sdf: coat, paint: (x, y, z, c) => { c.copy(lv).multiplyScalar(0.88 + vnoise(x * 90, y * 90, z * 90) * 0.18); if (lapF(x, y, z) < 0) c.copy(dk); if (y < 0.32) c.multiplyScalar(0.85); }, mat: { roughness: 0.85, sheen: 0.5, sheenColor: 0xc0b0e0 } },
        { sdf: above(grow(below(b.legs, 0.5), 0.013), 0.075, 0.01), paint: solid('#34304a', 0.1), mat: { roughness: 0.9 } },
        { sdf: grow(b.feet, 0.013), paint: solid('#2a1a14', 0.05), mat: { roughness: 0.3 } },
      ];
    },
    acc: (head, B, body) => {
      for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0024, 6, 20), B); r.position.set(s * 0.033, 0.017, 0.106); head.add(r); const t = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.002, 0.09), B); t.position.set(s * 0.057, 0.02, 0.06); head.add(t); }
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.002, 0.002), B); br.position.set(0, 0.02, 0.108); head.add(br);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.0025, 6, 12), B); ring.position.set(0.085, 1.3, 0.12); body.add(ring); // the empty pin hole on her lapel
    },
  },
};

// Build one character. Returns { g, head, body }.
export function buildPerson(who, BRASS, HIT) {
  const o = CAST[who];
  const g = new THREE.Group(); g.userData.who = who;
  const bodyG = new THREE.Group(); g.add(bodyG);
  const b = body(o);
  const skinMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.55, sheen: 0.5, sheenRoughness: 0.5, sheenColor: 0xffd8c8 });
  const skinBase = solid(o.skin, 0.08, 150);
  const skinPaint = o.skinPaint ? o.skinPaint(skinBase) : skinBase;
  // two grids with the same spacing, aligned so they make identical triangles where they overlap;
  // each keeps the triangles on its side of the split, so the join is seamless
  const ST = 0.0115, SPLIT = 0.73, UP = [[0, 1.14, 0.01], 38 * ST, 76], LO = [[0, 1.14 - 66 * ST, 0.01], 34 * ST, 68];
  const mesh = (geo, m, parent) => { const x = new THREE.Mesh(geo, m); x.castShadow = x.receiveShadow = true; parent.add(x); return x; };
  const both = (sdf, paint, mat) => {
    mesh(polygonise(sdf, LO[0], LO[1], LO[2], paint, y => y < SPLIT, 0.6), mat, bodyG);
    mesh(polygonise(sdf, UP[0], UP[1], UP[2], paint, y => y >= SPLIT, 0.6), mat, bodyG);
  };
  both(o.skinParts(b), skinPaint, skinMat);
  for (const part of o.outfit(b)) both(part.sdf, part.paint, new THREE.MeshPhysicalMaterial({ vertexColors: true, ...part.mat }));
  // head: sculpted skin, eyes, hair
  const head = new THREE.Group(); head.position.set(0, 1.605, 0.012); bodyG.add(head);
  mesh(polygonise(headSDF(o), [0, -0.02, 0.0], 0.165, 76, paintHead(o)), skinMat, head);
  const hidesEyes = o.acc && o.acc(head, BRASS, bodyG);
  if (!hidesEyes) { const em = eyeball(o.eyes); for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.0128, 20, 14), em); e.position.set(s * 0.032, 0.016, 0.077); e.rotation.y = -s * 0.08; head.add(e); } }
  const hp = o.hairPaintFn ? o.hairPaintFn() : hairPaint(o.hairC, 0.22, o.hairTip);
  mesh(polygonise(o.hair(), o.hairBox[0], o.hairBox[1], 72, hp), new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.55, sheen: 0.8, sheenRoughness: 0.4, sheenColor: new THREE.Color(o.hairC).lerp(new THREE.Color(0xffffff), 0.5) }), head);
  const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.9, 10), HIT); hb.position.y = 0.95; hb.userData.who = who; hb.userData.nocast = 1; g.add(hb);
  g.scale.setScalar(o.h ?? 1);
  g.userData.head = head; g.userData.body = bodyG; g.userData.torso = bodyG; g.userData.t = Math.random() * 10; g.userData.built = 1;
  return g;
}
