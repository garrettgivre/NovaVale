// The Aquadome, modelled in code in the style of an early-2000s pre-rendered adventure:
// a faded grand resort (marble, mahogany, brass, damask), closed for nine years.
// Every room is a Group at the origin; only the current room is visible. Clickable things
// carry userData.hot (hotspot id), userData.who (a character) or userData.go (a walk spot).
import * as THREE from 'three';
import { S, has, night } from './state.js';
import * as T from './tex.js';
import { buildPerson, CAST, animatePerson, castReady } from './people.js';
import { FIG, figReady, loadFigure, buildFigure, animateFigure } from './figures.js';
import { speech } from './ui.js';

export const rooms = {};
export const chars = {};
let scene, skyMat, hemi, key, texDay, texNight, envDay, envNight;
const updaters = [];

// ---------- Nodes (camera spots) ----------
export const NODES = {
  L1: { room: 'lobby', p: [0, 6.2], look: [0, 0], exits: ['L2', 'L3'] },
  L2: { room: 'lobby', p: [-4.8, -0.3], look: [-8.5, 3], exits: ['L1', 'L4'] },
  L3: { room: 'lobby', p: [4.8, -0.3], look: [8.5, 3], exits: ['L1', 'L4'] },
  L4: { room: 'lobby', p: [0, -5.6], look: [0, -9], exits: ['L2', 'L3'] },
  S1: { room: 'spa', p: [0, 3.4], look: [0, -4], exits: ['S2'] },
  S2: { room: 'spa', p: [3, 1.3], look: [4.6, -0.8], exits: ['S1'] },
  P1: { room: 'plan', p: [0, 5.8], look: [0, 0], exits: ['P2'] },
  P2: { room: 'plan', p: [1.6, -4.1], look: [3.3, -7.3], exits: ['P1'] },
  K1: { room: 'kitchen', p: [0, 2.6], look: [0, -3], exits: [] },
  T1: { room: 'tech', p: [0.6, 2.4], look: [0, -3.5], exits: ['T2'] },
  T2: { room: 'tech', p: [-1.6, 0.6], look: [-4, 0.6], exits: ['T1'] },
  A1: { room: 'archive', p: [0, 2.5], look: [0, -3], exits: [] },
  R1: { room: 'suite', p: [0.8, 1.8], look: [-1.3, -1.6], exits: [] },
  U1: { room: 'tunnel', p: [0, 0.4], look: [0, -15], exits: ['U2'] },
  U2: { room: 'tunnel', p: [0, -10.5], look: [0, -15], exits: ['U1'] },
  X1: { room: 'star', p: [0, 2.4], look: [0, -0.8], exits: [] },
  W1: { room: 'wing', p: [0, 0.9], look: [0, -12], exits: ['W2'] },
  W2: { room: 'wing', p: [0, -5.2], look: [0, -12], exits: ['W1', 'W3'] },
  W3: { room: 'wing', p: [0, -10.6], look: [0, -13], exits: ['W2'] },
  E1: { room: 'terrace', p: [0, 2.2], look: [0, -20], exits: ['E2', 'E3'] },
  E2: { room: 'terrace', p: [4, -19.8], look: [0, 12], exits: ['E1'] },
  E3: { room: 'terrace', p: [-6, -8.6], look: [-10, -14.6], exits: ['E1'] },
};

// ---------- Materials ----------
const cache = {};
const once = (k, f) => cache[k] || (cache[k] = f());
function M(color, rough = 0.6, metal = 0, o = {}) {
  const { t, rep, bump = 0.02, ...rest } = o;
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...rest });
  if (t) {
    const map = t.map.clone(), bm = t.bump.clone();
    if (rep) { map.repeat.set(rep[0], rep[1]); bm.repeat.set(rep[0], rep[1]); }
    map.needsUpdate = bm.needsUpdate = true;
    m.map = map; m.bumpMap = bm; m.bumpScale = bump;
  }
  return m;
}
const BRASS = M(0xc9a15a, 0.32, 1);
const BRONZE = M(0x5a4630, 0.45, 0.9);
const IRON = M(0x2e2e30, 0.55, 0.8);
const STEEL = M(0xb4b6b8, 0.3, 1);
const GLASS = new THREE.MeshPhysicalMaterial({ color: 0xdfe8e0, roughness: 0.06, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
const HIT = new THREE.MeshBasicMaterial({ visible: false });
const TX = {
  marble: () => once('marble', () => T.marble({ base: '#e6dcc8', vein: '#8d8272', tiles: 2, inlay: '#4a5e4e' })),
  marbleTop: () => once('marbleTop', () => T.marble({ base: '#ece6da', vein: '#9a9082', tiles: 1, seed: 8 })),
  mahog: () => once('mahog', () => T.wood({ base: '#6a3620', dark: '#2e140a', planks: 4, vertical: true, seams: false })),
  oak: () => once('oak', () => T.wood({ base: '#9a6a3c', dark: '#4a2e14', planks: 8, seed: 3 })),
  panel: () => once('panel', () => T.wood({ base: '#5a3420', dark: '#2a160a', planks: 3, vertical: true, seams: true, seed: 7 })),
  damask: () => once('damask', () => T.wallpaper({ base: '#6f8a7c', ink: '#9fb3a2', seed: 6 })),
  damaskRose: () => once('damaskR', () => T.wallpaper({ base: '#a88a7a', ink: '#c9ab96', seed: 9, stripe: true })),
  plaster: () => once('plaster', () => T.plaster({ base: '#d9cfbb' })),
  plasterCool: () => once('plasterC', () => T.plaster({ base: '#c9ccc6', seed: 12 })),
  spaTile: () => once('spaTile', () => T.tiles({ base: '#7fa9a2', grout: '#d8d0bc', n: 8, grime: 0.45 })),
  poolTile: () => once('poolTile', () => T.tiles({ base: '#3f7f86', grout: '#9fb8b0', n: 10, grime: 0.3, seed: 2 })),
  subway: () => once('subway', () => T.tiles({ base: '#e9e4d6', grout: '#d4ccb8', n: 8, vary: 0.06, grime: 0.12, seed: 5 })),
  checker: () => once('checker', () => T.tiles({ base: '#d8d2c2', grout: '#8a8272', n: 8, vary: 0.05, seed: 6 })),
  carpetRed: () => once('cRed', () => T.carpet({ base: '#5e1b24', a: '#a8843c', b: '#23433f' })),
  carpetBlue: () => once('cBlue', () => T.carpet({ base: '#14183a', a: '#a8843c', b: '#5a3a7a', stars: true, seed: 3 })),
  carpetOffice: () => once('cOff', () => T.fabric({ base: '#4a5560', weave: 3, seed: 4 })),
  carpetSuite: () => once('cSuite', () => T.carpet({ base: '#3e2f4a', a: '#8a7a5a', b: '#5a4868', seed: 11 })),
  concrete: () => once('concrete', () => T.concrete({})),
  steel: () => once('steel', () => T.brushed({})),
  velvet: () => once('velvet', () => T.fabric({ base: '#6a1420', weave: 2 })),
  linen: () => once('linen', () => T.fabric({ base: '#e8e0cc', weave: 3, seed: 2 })),
  stone: () => once('stone', () => T.plaster({ base: '#bdb4a2', seed: 17 })),
  cloth: () => once('cloth', () => T.fabric({ base: '#ffffff', weave: 3, seed: 3 })),
};
const mat = {
  marble: () => M(0xffffff, 0.22, 0, { t: TX.marble(), rep: [9, 9], bump: 0.01 }),
  mahog: (rep = [1, 1]) => M(0xffffff, 0.42, 0, { t: TX.mahog(), rep, bump: 0.01 }),
  panel: (rep = [1, 1]) => M(0xffffff, 0.5, 0, { t: TX.panel(), rep, bump: 0.02 }),
  oak: (rep = [1, 1]) => M(0xffffff, 0.55, 0, { t: TX.oak(), rep, bump: 0.015 }),
  stone: (rep = [1, 1]) => M(0xffffff, 0.8, 0, { t: TX.stone(), rep, bump: 0.03 }),
  marbleTopM: null,
};
let FROND;

// ---------- Geometry helpers ----------
function add(parent, geo, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o;
}
const box = (p, w, h, d, m, x, y, z) => add(p, new THREE.BoxGeometry(w, h, d), m, x, y, z);
const cyl = (p, rt, rb, h, m, x, y, z, seg = 24) => add(p, new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z);
const sph = (p, r, m, x, y, z, seg = 20) => add(p, new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), m, x, y, z);
const lathe = (p, pts, m, x = 0, y = 0, z = 0, seg = 32) => add(p, new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg), m, x, y, z);
const struct = o => { o.userData.struct = 1; return o; };

function starShape(r1, r2) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? r2 : r1; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  return s;
}
function star3(p, r, m, x, y, z, depth = 0.04) {
  const g = new THREE.ExtrudeGeometry(starShape(r, r * 0.45), { depth, bevelEnabled: true, bevelSize: depth * 0.4, bevelThickness: depth * 0.4, bevelSegments: 2 });
  g.center(); return add(p, g, m, x, y, z);
}
function hit(p, x, y, z, r, hot, name) { const o = add(p, new THREE.SphereGeometry(r, 8, 6), HIT, x, y, z); o.userData.hot = hot; o.userData.name = name; o.userData.nocast = 1; return o; }
function tag(o, hot, name) { o.userData.hot = hot; o.userData.name = name; return o; }
function faceTo(o, x, z) { o.rotation.y = Math.atan2(x - o.position.x, z - o.position.z); }

// Folded fabric (curtains): a plane with sine folds.
function curtain(p, w, h, m, x, y, z, ry = 0, folds = 6) {
  const g = new THREE.PlaneGeometry(w, h, folds * 8, 1), a = g.attributes.position;
  for (let i = 0; i < a.count; i++) a.setZ(i, Math.sin((a.getX(i) / w) * folds * Math.PI * 2) * 0.05);
  g.computeVertexNormals();
  const o = add(p, g, m, x, y, z); o.rotation.y = ry; m.side = THREE.DoubleSide; return o;
}

// A potted palm: stone urn + drooping fronds.
function palm(p, x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); p.add(g);
  lathe(g, [[0.001, 0], [0.2, 0], [0.22, 0.06], [0.16, 0.12], [0.2, 0.3], [0.3, 0.55], [0.32, 0.6], [0.28, 0.62], [0.001, 0.6]], mat.stone(), 0, 0, 0, 24);
  cyl(g, 0.27, 0.27, 0.02, M(0x2a1c10, 0.95), 0, 0.6, 0);
  cyl(g, 0.03, 0.04, 0.5, M(0x5a4228, 0.9), 0, 0.85, 0, 8);
  const fm = new THREE.MeshStandardMaterial({ map: FROND, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 });
  for (let i = 0; i < 9; i++) {
    const geo = new THREE.PlaneGeometry(0.42, 1.3, 1, 8), a = geo.attributes.position;
    for (let k = 0; k < a.count; k++) { const t = (a.getY(k) + 0.65) / 1.3; a.setY(k, t * 1.3); a.setZ(k, -t * t * 0.7); }
    geo.computeVertexNormals();
    const f = new THREE.Mesh(geo, fm); f.position.y = 1.05;
    const piv = new THREE.Group(); piv.rotation.y = (i / 9) * Math.PI * 2 + (i % 2) * 0.3; piv.add(f); g.add(piv);
    f.rotation.x = -0.35 - (i % 3) * 0.2;
  }
  return g;
}

function sconce(p, x, y, z, ry) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; p.add(g);
  box(g, 0.12, 0.22, 0.03, BRASS, 0, 0, 0);
  const arm = cyl(g, 0.012, 0.012, 0.22, BRASS, 0, 0.02, 0.1, 8); arm.rotation.x = Math.PI / 2;
  lathe(g, [[0.03, 0], [0.09, 0.06], [0.1, 0.16], [0.07, 0.18]], M(0xfff2d6, 0.5, 0, { emissive: 0xffc680, emissiveIntensity: 0.9, side: THREE.DoubleSide }), 0, 0.02, 0.2, 16);
  return g;
}

// Brass plaque with engraved text.
function plaqueMesh(p, text, w, h, x, y, z, ry = 0, o = {}) {
  const m = new THREE.MeshStandardMaterial({ map: T.plaque(text, o), metalness: 0.7, roughness: 0.35 });
  const pl = add(p, new THREE.BoxGeometry(w, h, 0.02), [BRASS, BRASS, BRASS, BRASS, m, BRASS], x, y, z);
  pl.rotation.y = ry; return pl;
}

// A panelled wooden door with a brass sign above.
function door(R, x, z, label, hot, face = [0, 0], o = {}) {
  const g = new THREE.Group(); g.position.set(x, 0, z); faceTo(g, face[0], face[1]); R.g.add(g);
  const trim = o.metal ? M(0x6e7276, 0.5, 0.7) : mat.mahog();
  box(g, 0.14, 2.6, 0.18, trim, -0.78, 1.3, 0); box(g, 0.14, 2.6, 0.18, trim, 0.78, 1.3, 0);
  box(g, 1.74, 0.16, 0.2, trim, 0, 2.62, 0);
  const leafM = o.metal ? M(0x5a5e62, 0.55, 0.6, { t: TX.steel(), bump: 0.005 }) : mat.panel();
  box(g, 1.42, 2.5, 0.06, leafM, 0, 1.25, 0);
  const inset = o.metal ? M(0x4a4e52, 0.6, 0.6) : M(0x3a2010, 0.5);
  for (const [px, py, ph] of [[-0.34, 1.8, 0.8], [0.34, 1.8, 0.8], [-0.34, 0.65, 0.95], [0.34, 0.65, 0.95]]) {
    box(g, 0.5, ph, 0.02, inset, px, py, 0.035);
    box(g, 0.54, 0.03, 0.03, leafM, px, py + ph / 2, 0.04); box(g, 0.54, 0.03, 0.03, leafM, px, py - ph / 2, 0.04);
  }
  const knob = sph(g, 0.04, BRASS, 0.56, 1.05, 0.08, 12); knob.scale.z = 0.7;
  box(g, 0.05, 0.16, 0.015, BRASS, 0.56, 1.05, 0.04);
  if (label) plaqueMesh(g, label, 1.2, 0.26, 0, 2.95, 0.02, 0, { size: 0.36 });
  tag(g, hot, label || 'Door');
  return g;
}

function skyWindow(R, w, h, x, y, z, ry = 0, cur = null) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; R.g.add(g);
  const m = new THREE.MeshBasicMaterial({ map: texDay });
  const pane = add(g, new THREE.PlaneGeometry(w, h), m, 0, 0, 0); pane.userData.nocast = 1;
  R.skyMats.push(m);
  const fr = mat.mahog(), cols = Math.max(2, Math.round(w / 0.9)), rows = h > 1.3 ? 2 : 1;
  for (let i = 0; i <= cols; i++) box(g, i % cols === 0 ? 0.1 : 0.05, h + 0.1, 0.08, fr, -w / 2 + (i * w) / cols, 0, 0.04);
  for (let j = 0; j <= rows; j++) box(g, w + 0.1, j % rows === 0 ? 0.1 : 0.05, 0.08, fr, 0, -h / 2 + (j * h) / rows, 0.04);
  box(g, w + 0.3, 0.06, 0.24, mat.marbleTopM, 0, -h / 2 - 0.08, 0.1);
  if (cur) {
    const cm = M(cur, 0.85, 0, { t: TX.linen(), rep: [4, 4] });
    curtain(g, w * 0.3, h + 0.5, cm, -w / 2 - 0.05, 0.1, 0.14, 0, 5);
    curtain(g, w * 0.3, h + 0.5, cm, w / 2 + 0.05, 0.1, 0.14, 0, 5);
    box(g, w + 0.9, 0.05, 0.05, BRASS, 0, h / 2 + 0.38, 0.16);
  }
  return g;
}

function mkRoom(id, keyCfg) {
  const g = new THREE.Group(); g.visible = false; g.name = id; scene.add(g);
  const R = { id, g, skyMats: [], lamps: [], key: keyCfg };
  rooms[id] = R; return R;
}

// Every room gets exactly two point lights so switching rooms never changes the light count.
function lamps(R, a, b) {
  for (const [x, y, z, c, i, d] of [a, b]) { const l = new THREE.PointLight(c, i, d, 1.8); l.position.set(x, y, z); R.g.add(l); l.userData.base = i; R.lamps.push(l); }
}

function reTex(m, rx, ry) {
  const c = m.clone();
  if (c.map) { c.map = c.map.clone(); c.map.repeat.set(rx, ry); c.map.needsUpdate = true; }
  if (c.bumpMap) { c.bumpMap = c.bumpMap.clone(); c.bumpMap.repeat.set(rx, ry); c.bumpMap.needsUpdate = true; }
  return c;
}

// Soft contact shadows (a cheap stand-in for ambient occlusion): dark gradient strips along the bottom and top of a
// wall run and on the floor and ceiling next to it. len = run length, (x, z) its middle, ry its facing, h wall height.
let AOT;
function aoMat(o) {
  if (!AOT) {
    const c = T.canvas(4, 64), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.35, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 64); AOT = new THREE.CanvasTexture(c);
  }
  return new THREE.MeshBasicMaterial({ map: AOT, transparent: true, opacity: o, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
}
function aoRun(p, len, x, z, ry, h, { floor = 0.38, ceil = 0.22, o = 0.42 } = {}) {
  const nx = Math.sin(ry), nz = Math.cos(ry), m = aoMat(o), mc = aoMat(o * 0.6);
  const strip = (w, hh, y, d, rx, mm) => {
    const s = add(p, new THREE.PlaneGeometry(len, w), mm, x + nx * d, y, z + nz * d);
    s.rotation.order = 'YXZ'; s.rotation.y = ry; s.rotation.x = rx; s.userData.nocast = 1; s.renderOrder = 1; return s;
  };
  // the texture is dark at v=0 (top of the plane): flip so the dark edge sits in the corner
  if (floor) { strip(0.5, 0, 0.25, 0.012, 0, m).rotation.z = Math.PI; strip(floor, 0, 0.004, floor / 2, -Math.PI / 2, m); }
  if (ceil) { strip(0.4, 0, h - 0.2, 0.012, 0, mc); strip(ceil, 0, h - 0.004, ceil / 2, Math.PI / 2, mc).rotation.z = Math.PI; }
}

// A rectangular room: floor, ceiling with crown moulding, walls with an optional wood wainscot.
function rectRoom(R, x0, x1, z0, z1, h, { floor, wall, wains = null, wh = 1.05, ceil = null }) {
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  struct(add(R.g, new THREE.PlaneGeometry(w, d), floor, cx, 0, cz)).rotation.x = -Math.PI / 2;
  struct(add(R.g, new THREE.PlaneGeometry(w, d), ceil || M(0xe8e0d0, 0.9, 0, { t: TX.plaster(), rep: [w / 3, d / 3] }), cx, h, cz)).rotation.x = Math.PI / 2;
  const trim = mat.mahog(), crown = M(0xe8e0d0, 0.7);
  for (const [len, x, z, ry] of [[w, cx, z0, 0], [w, cx, z1, Math.PI], [d, x0, cz, Math.PI / 2], [d, x1, cz, -Math.PI / 2]]) {
    struct(add(R.g, new THREE.PlaneGeometry(len, h), reTex(wall, len / 2, h / 2), x, h / 2, z)).rotation.y = ry;
    const nx = Math.sin(ry), nz = Math.cos(ry);
    const piece = (hh, y, dd, m) => { const b = box(R.g, len, hh, dd, m, x + nx * dd / 2, y, z + nz * dd / 2); b.rotation.y = ry; struct(b); return b; };
    if (wains) {
      struct(add(R.g, new THREE.PlaneGeometry(len, wh), reTex(wains, len / 1.2, 1), x + nx * 0.02, wh / 2, z + nz * 0.02)).rotation.y = ry;
      piece(0.06, wh, 0.06, trim);
    }
    piece(0.16, 0.08, 0.035, trim);
    piece(0.14, h - 0.07, 0.1, crown);
    aoRun(R.g, len, x, z, ry, h);
  }
}

// ---------- The Prism Crown ----------
function crown(p, x, y, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); p.add(g);
  const silver = M(0xd8dadc, 0.18, 1), silverD = M(0xd8dadc, 0.18, 1, { side: THREE.DoubleSide });
  add(g, new THREE.CylinderGeometry(0.2, 0.18, 0.08, 40, 1, true), silverD, 0, 0.04, 0);
  add(g, new THREE.TorusGeometry(0.19, 0.012, 8, 40), silver, 0, 0.005, 0).rotation.x = Math.PI / 2;
  add(g, new THREE.TorusGeometry(0.2, 0.01, 8, 40), silver, 0, 0.08, 0).rotation.x = Math.PI / 2;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    add(g, new THREE.ConeGeometry(0.028, 0.13, 10), silver, Math.cos(a) * 0.195, 0.14, Math.sin(a) * 0.195);
    sph(g, 0.014, M(i % 2 ? 0x6a8aa0 : 0x8a4a6a, 0.1, 0.2), Math.cos(a) * 0.195, 0.21, Math.sin(a) * 0.195, 10);
  }
  star3(g, 0.075, M(0x3a3048, 0.3, 0.7, { emissive: 0x302050, emissiveIntensity: 0.4 }), 0, 0.19, 0.2, 0.03);
  return g;
}

// ---------- Rooms ----------
function buildLobby() {
  const R = mkRoom('lobby', { p: [3, 14, 4], t: [0, 0, 0], s: 10, day: [0xffe6c0, 2.2], night: [0x8090c0, 0.35] });
  struct(add(R.g, new THREE.CircleGeometry(9, 64), mat.marble(), 0, 0, 0)).rotation.x = -Math.PI / 2;
  const wp = M(0xffffff, 0.85, 0, { t: TX.damask(), rep: [16, 2.4], bump: 0.01 }); wp.side = THREE.BackSide;
  struct(add(R.g, new THREE.CylinderGeometry(9, 9, 4.2, 72, 1, true), wp, 0, 2.1, 0));
  const wn = M(0xffffff, 0.5, 0, { t: TX.panel(), rep: [30, 1], bump: 0.02 }); wn.side = THREE.BackSide;
  struct(add(R.g, new THREE.CylinderGeometry(8.97, 8.97, 1.1, 72, 1, true), wn, 0, 0.55, 0));
  const tr = mat.mahog();
  struct(add(R.g, new THREE.TorusGeometry(8.94, 0.04, 6, 72), tr, 0, 1.1, 0)).rotation.x = Math.PI / 2;
  struct(add(R.g, new THREE.TorusGeometry(8.95, 0.08, 6, 72), tr, 0, 0.08, 0)).rotation.x = Math.PI / 2;
  const crownM = M(0xe0d6c2, 0.7);
  struct(add(R.g, new THREE.TorusGeometry(8.88, 0.16, 8, 72), crownM, 0, 4.15, 0)).rotation.x = Math.PI / 2;
  // pilasters between the doors, with sconces
  const doorAngles = [0, 55, 110, 150, 180, 250, 305];
  for (let k = 0; k < 24; k++) {
    const deg = k * 15; if (doorAngles.some(d => Math.abs(((deg - d + 540) % 360) - 180) < 12)) continue;
    const a = deg * Math.PI / 180, x = Math.sin(a) * 8.86, z = -Math.cos(a) * 8.86;
    const pl = new THREE.Group(); pl.position.set(x, 0, z); faceTo(pl, 0, 0); R.g.add(pl);
    box(pl, 0.42, 4.0, 0.14, mat.stone(), 0, 2.0, 0);
    box(pl, 0.52, 0.18, 0.2, crownM, 0, 3.92, 0.02); box(pl, 0.52, 0.22, 0.2, crownM, 0, 0.11, 0.02);
    if (k % 2) sconce(pl, 0, 2.3, 0.08, 0);
  }
  // glass dome on bronze ribs + a chandelier
  add(R.g, new THREE.SphereGeometry(9, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), GLASS, 0, 4.2, 0).userData.nocast = 1;
  for (let i = 0; i < 8; i++) { const rib = add(R.g, new THREE.TorusGeometry(9, 0.06, 6, 64, Math.PI), BRONZE, 0, 4.2, 0); rib.rotation.y = (i / 8) * Math.PI; rib.userData.nocast = 1; }
  for (const r of [5.5, 8]) { const t = add(R.g, new THREE.TorusGeometry(r, 0.05, 6, 64), BRONZE, 0, 4.2 + Math.sqrt(81 - r * r), 0); t.rotation.x = Math.PI / 2; t.userData.nocast = 1; }
  const ch = new THREE.Group(); ch.position.y = 7.4; R.g.add(ch); ch.userData.nocast = 1;
  cyl(ch, 0.01, 0.01, 5.6, BRONZE, 0, 2.8, 0, 6);
  add(ch, new THREE.TorusGeometry(0.9, 0.035, 8, 40), BRASS, 0, 0, 0).rotation.x = Math.PI / 2;
  add(ch, new THREE.TorusGeometry(0.55, 0.03, 8, 32), BRASS, 0, -0.3, 0).rotation.x = Math.PI / 2;
  const bulbM = M(0xfff4dc, 0.3, 0, { emissive: 0xffd49a, emissiveIntensity: 1.6 });
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; sph(ch, 0.05, bulbM, Math.cos(a) * 0.9, 0.06, Math.sin(a) * 0.9, 10); }
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; cyl(ch, 0.012, 0.004, 0.22, GLASS, Math.cos(a) * 0.72, -0.2, Math.sin(a) * 0.72, 6); }

  // the stone fountain
  const fs = mat.stone([3, 1]);
  lathe(R.g, [[0.001, 0.02], [2.05, 0.02], [2.1, 0.12], [2.0, 0.2], [2.0, 0.5], [2.1, 0.56], [2.1, 0.62], [1.88, 0.62], [1.88, 0.3], [0.001, 0.3]], fs, 0, 0, 0, 64);
  const water = add(R.g, new THREE.CircleGeometry(1.88, 48), new THREE.MeshStandardMaterial({ color: 0x2c4a48, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 }), 0, 0.5, 0);
  water.rotation.x = -Math.PI / 2; water.userData.nocast = 1;
  lathe(R.g, [[0.28, 0.3], [0.2, 0.5], [0.16, 1.2], [0.2, 1.5], [0.34, 1.6], [0.34, 1.65]], fs, 0, 0, 0, 32);
  lathe(R.g, [[0.05, 1.6], [0.7, 1.72], [0.82, 1.88], [0.8, 1.92], [0.68, 1.8], [0.05, 1.76]], fs, 0, 0, 0, 40);
  lathe(R.g, [[0.001, 1.9], [0.1, 1.92], [0.08, 2.1], [0.14, 2.3], [0.1, 2.45], [0.05, 2.55], [0.08, 2.62], [0.001, 2.7]], BRONZE, 0, 0, 0, 24);
  const dm = new THREE.MeshStandardMaterial({ color: 0xcfe0dc, transparent: true, opacity: 0.3, roughness: 0.05, depthWrite: false });
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; cyl(R.g, 0.008, 0.012, 1.35, dm, Math.cos(a) * 0.8, 1.22, Math.sin(a) * 0.8, 6); }
  updaters.push((dt, t) => { dm.opacity = 0.26 + Math.sin(t * 9) * 0.05; });
  tag(plaqueMesh(R.g, 'EST. 2003', 0.8, 0.22, 0, 0.36, 2.03, 0, { size: 0.42 }), 'plaque', 'Brass plaque');

  // the empty display case
  const cs = new THREE.Group(); cs.position.set(-4.2, 0, 3.2); faceTo(cs, 0, 6); R.g.add(cs);
  const mh = mat.mahog();
  box(cs, 0.8, 1.02, 0.8, mh, 0, 0.51, 0);
  box(cs, 0.88, 0.06, 0.88, mh, 0, 1.05, 0); box(cs, 0.9, 0.1, 0.9, mh, 0, 0.05, 0);
  for (const s of [-1, 1]) for (const t of [-1, 1]) box(cs, 0.03, 0.95, 0.03, BRASS, s * 0.4, 0.52, t * 0.4);
  box(cs, 0.5, 0.07, 0.5, M(0x4a0f18, 0.95, 0, { t: TX.velvet(), rep: [2, 2] }), 0, 1.11, 0);
  const lid = box(cs, 0.74, 0.6, 0.74, GLASS, 0, 1.39, 0); lid.rotation.z = 0.04;
  for (const s of [-1, 1]) for (const t of [-1, 1]) box(cs, 0.02, 0.6, 0.02, BRASS, s * 0.37, 1.39, t * 0.37);
  box(cs, 0.18, 0.24, 0.02, M(0x1c1c1e, 0.4), 0.18, 0.72, 0.405);
  for (let i = 0; i < 9; i++) box(cs, 0.035, 0.035, 0.012, M(0xc8c0b0, 0.4), 0.13 + (i % 3) * 0.05, 0.78 - Math.floor(i / 3) * 0.05, 0.415);
  for (const s of [-1, 1]) { cyl(cs, 0.03, 0.06, 0.95, BRASS, s * 0.85, 0.475, 0.62, 12); sph(cs, 0.055, BRASS, s * 0.85, 0.97, 0.62, 12); }
  add(cs, new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.85, 0.9, 0.62), new THREE.Vector3(0, 0.62, 0.66), new THREE.Vector3(0.85, 0.9, 0.62)), 20, 0.022, 8), M(0x5a0f18, 0.8));
  tag(cs, 'case', 'Display case');
  R.caseCrown = crown(cs, 0, 1.15, 0, 1.0);

  // Kenji's workbench with Stella, the 1925 singing automaton
  const kb = new THREE.Group(); kb.position.set(7.4, 0, 1.5); faceTo(kb, 0, 0); R.g.add(kb);
  box(kb, 1.3, 0.05, 0.6, mat.mahog(), 0, 0.76, 0);
  for (const s of [-1, 1]) for (const t of [-1, 1]) box(kb, 0.05, 0.74, 0.05, mat.mahog(), s * 0.6, 0.37, t * 0.26);
  box(kb, 0.5, 0.12, 0.4, mat.mahog(), 0.35, 0.65, 0);
  for (let i = 0; i < 5; i++) cyl(kb, 0.006, 0.006, 0.14, IRON, -0.5 + i * 0.03, 0.85, -0.18, 6);
  tag(box(kb, 0.42, 0.02, 0.3, M(0xf2ead6, 0.9), 0.35, 0.795, 0.05), 'kbench', 'Kenji\'s workbench');
  const st = new THREE.Group(); st.position.set(-0.25, 0.785, 0); kb.add(st);
  box(st, 0.36, 0.1, 0.26, M(0x5a2a1e, 0.4), 0, 0.05, 0);
  const cylM = M(0xc9a24a, 0.3, 1); const cy_ = cyl(st, 0.045, 0.045, 0.24, cylM, 0, 0.05, 0.135, 16); cy_.rotation.z = Math.PI / 2;
  const dress = M(0xe8c8d0, 0.7, 0, { t: TX.velvet() }), skin = M(0xf4e4d8, 0.3), hairM = M(0x3a2418, 0.7);
  lathe(st, [[0.001, 0.1], [0.13, 0.1], [0.11, 0.2], [0.07, 0.3], [0.05, 0.36], [0.06, 0.4], [0.001, 0.42]], dress, 0, 0, 0, 24);
  sph(st, 0.055, skin, 0, 0.47, 0, 16);
  const hr = sph(st, 0.062, hairM, 0, 0.49, -0.01, 16); hr.scale.set(1, 0.9, 1);
  for (const s of [-1, 1]) { const a = cyl(st, 0.012, 0.01, 0.13, dress, s * 0.07, 0.33, 0.02, 8); a.rotation.z = s * 0.5; sph(st, 0.014, skin, s * 0.1, 0.27, 0.03, 8); }
  for (const s of [-1, 1]) sph(st, 0.008, M(0x203050, 0.2), s * 0.02, 0.48, 0.05, 8);
  tag(st, 'stella', 'Stella');

  // the brass star pin on the floor
  const pin = new THREE.Group(); pin.position.set(-3.55, 0.012, 4.15); R.g.add(pin);
  star3(pin, 0.045, M(0xd4ac5a, 0.25, 1), 0, 0, 0, 0.01).rotation.x = -Math.PI / 2;
  hit(pin, 0, 0.1, 0, 0.3, 'pin', 'Something glinting');
  R.pin = pin;

  // reception desk: mahogany with a marble top, a beige CRT, a bell, the guest book
  const dk = new THREE.Group(); dk.position.set(4.2, 0, 3.2); faceTo(dk, 0, 0); R.g.add(dk);
  box(dk, 2.4, 1.0, 0.72, mat.mahog([2, 1]), 0, 0.5, 0);
  for (let i = 0; i < 4; i++) box(dk, 0.48, 0.66, 0.02, M(0x3a1a0c, 0.5), -0.84 + i * 0.56, 0.5, 0.37);
  box(dk, 2.5, 0.05, 0.82, mat.marbleTopM, 0, 1.02, 0);
  const crt = new THREE.Group(); crt.position.set(0.6, 1.05, -0.12); crt.rotation.y = Math.PI; dk.add(crt);
  const beige = M(0xd8cfb8, 0.6);
  box(crt, 0.42, 0.36, 0.38, beige, 0, 0.2, 0); box(crt, 0.3, 0.26, 0.2, beige, 0, 0.18, -0.25);
  box(crt, 0.34, 0.26, 0.01, M(0x10181a, 0.2, 0, { emissive: 0x16302a, emissiveIntensity: 0.6 }), 0, 0.21, 0.195);
  box(dk, 0.44, 0.03, 0.16, beige, 0.6, 1.06, 0.12);
  lathe(dk, [[0.001, 0], [0.07, 0], [0.07, 0.02], [0.06, 0.05], [0.03, 0.08], [0.01, 0.1], [0.001, 0.11]], BRASS, -0.2, 1.045, 0.1, 20);
  const book = new THREE.Group(); book.position.set(-0.7, 1.05, 0.08); book.rotation.y = 0.2; dk.add(book);
  box(book, 0.46, 0.02, 0.32, M(0x3a1a12, 0.6), 0, 0.005, 0);
  for (const s of [-1, 1]) { const pg = box(book, 0.21, 0.015, 0.29, M(0xe8dcc0, 0.9), s * 0.108, 0.02, 0); pg.rotation.z = -s * 0.05; }
  hit(book, 0, 0.05, 0, 0.25, 'guestbook', 'Guest book');
  const lamp = new THREE.Group(); lamp.position.set(-1.05, 1.05, -0.15); dk.add(lamp);
  cyl(lamp, 0.07, 0.08, 0.02, BRASS, 0, 0.01, 0); cyl(lamp, 0.01, 0.01, 0.34, BRASS, 0, 0.18, 0, 6);
  const sh = add(lamp, new THREE.CylinderGeometry(0.06, 0.1, 0.1, 16, 1, true, 0, Math.PI), M(0x1f4a2a, 0.2, 0, { side: THREE.DoubleSide }), 0, 0.36, 0.05); sh.rotation.z = Math.PI / 2; sh.rotation.y = Math.PI / 2;
  tag(dk, 'desk', 'Reception desk');

  // benches and palms
  for (const [x, z] of [[-6.6, -2.6], [6.6, -2.6]]) {
    const b = new THREE.Group(); b.position.set(x, 0, z); faceTo(b, 0, 0); R.g.add(b);
    box(b, 1.6, 0.1, 0.5, M(0x4a0f18, 0.9, 0, { t: TX.velvet(), rep: [3, 1] }), 0, 0.45, 0);
    for (const s of [-1, 1]) for (const t of [-1, 1]) cyl(b, 0.03, 0.02, 0.42, mh, s * 0.7, 0.21, t * 0.2, 8);
  }
  for (const [x, z] of [[-6.2, -5.2], [6.2, -5.2], [-2.6, 8], [2.6, 8], [-7.8, 2.6], [7.8, 2.6]]) palm(R.g, x, z, 1.15);

  const D = (deg, label, hot) => { const a = deg * Math.PI / 180; return door(R, Math.sin(a) * 8.9, -Math.cos(a) * 8.9, label, hot, [0, 0]); };
  D(0, 'Planetarium', 'door_plan'); D(55, 'Spa & Pools', 'door_spa'); D(110, 'Tech Office', 'door_tech');
  D(150, 'Grand Staircase', 'door_stairs'); D(180, 'Terrace', 'door_terrace'); D(250, 'Kitchen', 'door_kitchen'); D(305, 'Archive', 'door_archive');

  lamps(R, [0, 7.2, 0, 0xffc98a, 30, 20], [0, 2.4, 0, 0xffd8a8, 6, 10]);
  return R;
}

function buildSpa() {
  const R = mkRoom('spa', { p: [2, 8, -9], t: [0, 0, 0], s: 8, day: [0xfff0d8, 2.2], night: [0x8090c0, 0.3] });
  const floor = M(0xffffff, 0.35, 0, { t: TX.spaTile(), rep: [3, 3], bump: 0.015 });
  const h = 3.8;
  const F = (x0, x1, z0, z1) => { struct(add(R.g, new THREE.PlaneGeometry(x1 - x0, z1 - z0), reTex(floor, (x1 - x0) / 4, (z1 - z0) / 4), (x0 + x1) / 2, 0, (z0 + z1) / 2)).rotation.x = -Math.PI / 2; };
  F(-6, -3, -5, 5); F(3, 6, -5, 5); F(-3, 3, 0.8, 5); F(-3, 3, -5, -3.6);
  const pool = M(0xffffff, 0.3, 0, { t: TX.poolTile(), rep: [3, 1], bump: 0.01 });
  const pw = (w, d, x, y, z, rx, ry) => { struct(add(R.g, new THREE.PlaneGeometry(w, d), pool, x, y, z)).rotation.set(rx, ry, 0); };
  pw(6, 4.4, 0, -1.3, -1.4, -Math.PI / 2, 0);
  pw(6, 1.3, 0, -0.65, -3.6, 0, 0); pw(6, 1.3, 0, -0.65, 0.8, 0, Math.PI);
  pw(4.4, 1.3, -3, -0.65, -1.4, 0, Math.PI / 2); pw(4.4, 1.3, 3, -0.65, -1.4, 0, -Math.PI / 2);
  const wat = add(R.g, new THREE.PlaneGeometry(6, 4.4, 30, 20), new THREE.MeshStandardMaterial({ color: 0x3f7a78, roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.78, depthWrite: false }), 0, -0.2, -1.4);
  wat.rotation.x = -Math.PI / 2; wat.userData.nocast = 1;
  const wp = wat.geometry.attributes.position;
  updaters.push((dt, t) => { if (!R.g.visible) return; for (let i = 0; i < wp.count; i++) wp.setZ(i, Math.sin(wp.getX(i) * 2 + t) * 0.012 + Math.cos(wp.getY(i) * 3 + t * 0.7) * 0.01); wp.needsUpdate = true; wat.geometry.computeVertexNormals(); });
  const coping = mat.marbleTopM;
  for (const [w, x, z, ry] of [[6.3, 0, 0.87, 0], [6.3, 0, -3.67, 0], [4.7, -3.07, -1.4, Math.PI / 2], [4.7, 3.07, -1.4, Math.PI / 2]]) box(R.g, w, 0.06, 0.16, coping, x, 0.03, z).rotation.y = ry;
  for (const s of [-1, 1]) { const r = add(R.g, new THREE.TorusGeometry(0.25, 0.022, 8, 16, Math.PI / 2), BRASS, 2.5 + s * 0.22, 0.2, 0.62); r.rotation.y = Math.PI / 2; cyl(R.g, 0.022, 0.022, 1.2, BRASS, 2.5 + s * 0.22, -0.4, 0.37, 8); }
  const wallM = M(0xffffff, 0.45, 0, { t: TX.subway(), rep: [6, 2], bump: 0.01 });
  const W = (len, x, z, ry) => { struct(add(R.g, new THREE.PlaneGeometry(len, h), reTex(wallM, len / 2, h / 2), x, h / 2, z)).rotation.y = ry; };
  W(12, 0, 5, Math.PI); W(10, -6, 0, Math.PI / 2); W(10, 6, 0, -Math.PI / 2);
  struct(add(R.g, new THREE.PlaneGeometry(12, 0.55), reTex(wallM, 6, 0.3), 0, 0.275, -5));
  struct(add(R.g, new THREE.PlaneGeometry(12, 0.75), reTex(wallM, 6, 0.4), 0, h - 0.375, -5));
  skyWindow(R, 11.4, 2.45, 0, 1.78, -4.98);
  struct(add(R.g, new THREE.PlaneGeometry(12, 10), M(0xe0d8c8, 0.9, 0, { t: TX.plaster(), rep: [4, 3] }), 0, h, 0)).rotation.x = Math.PI / 2;
  const band = M(0x2f5a58, 0.5);
  for (const [len, x, z, ry] of [[12, 0, 4.98, Math.PI], [10, -5.98, 0, Math.PI / 2], [10, 5.98, 0, -Math.PI / 2]]) struct(box(R.g, len, 0.12, 0.02, band, x, 1.2, z)).rotation.y = ry;
  for (const x of [-4.4, 4.4]) for (const z of [-4.2, 3.9]) lathe(R.g, [[0.001, 0], [0.3, 0], [0.3, 0.15], [0.22, 0.25], [0.2, 3.5], [0.28, 3.62], [0.3, 3.8], [0.001, 3.8]], mat.stone([2, 3]), x, 0, z, 28);
  const teak = mat.oak(), cush = M(0xd8ccb0, 0.9, 0, { t: TX.linen(), rep: [2, 2] });
  for (const z of [-2.4, 0.2]) {
    const l = new THREE.Group(); l.position.set(5, 0, z); R.g.add(l);
    for (let i = 0; i < 8; i++) box(l, 0.62, 0.03, 0.12, teak, 0, 0.3, 0.8 - i * 0.16);
    for (const s of [-1, 1]) { box(l, 0.04, 0.3, 0.04, teak, s * 0.3, 0.15, 0.8); box(l, 0.04, 0.3, 0.04, teak, s * 0.3, 0.15, -0.3); box(l, 0.04, 0.04, 1.8, teak, s * 0.31, 0.3, 0.2); }
    const back = box(l, 0.62, 0.05, 0.75, teak, 0, 0.56, -0.62); back.rotation.x = 0.75;
    box(l, 0.58, 0.07, 1.15, cush, 0, 0.36, 0.2);
  }
  const tb = new THREE.Group(); tb.position.set(4.35, 0, 1.75); R.g.add(tb);
  cyl(tb, 0.34, 0.34, 0.03, mat.marbleTopM, 0, 0.62, 0, 28); cyl(tb, 0.025, 0.03, 0.6, IRON, 0, 0.3, 0, 8);
  for (let i = 0; i < 3; i++) box(tb, 0.04, 0.02, 0.36, IRON, 0, 0.02, 0).rotation.y = i * 2.1;
  box(tb, 0.21, 0.004, 0.297, M(0xf0e8d8, 0.9), -0.02, 0.638, 0).rotation.y = 0.35;
  lathe(tb, [[0.001, 0], [0.03, 0], [0.045, 0.05], [0.042, 0.055]], M(0xf4f0e8, 0.3), 0.18, 0.636, -0.12, 16);
  hit(tb, 0, 0.7, 0, 0.35, 'lyrics', 'Lyric sheet');
  for (let i = 0; i < 4; i++) box(R.g, 0.5, 0.08, 0.35, M([0xe8e0d0, 0xd8d0c0][i % 2], 0.95, 0, { t: TX.linen(), rep: [2, 2] }), -5.3, 0.04 + i * 0.085, 3.8);
  palm(R.g, -5.2, -1, 1.2); palm(R.g, 5.2, -4.3, 1.1); palm(R.g, -5.2, 2.2, 1);
  door(R, 0, 4.92, 'Lobby', 'exit_spa', [0, 0]);
  lamps(R, [0, 3.4, -1, 0xffe8c8, 16, 14], [0, -0.6, -1.4, 0x7fc8c0, 3, 5]);
  return R;
}

function buildPlanetarium() {
  const R = mkRoom('plan', { p: [0, 7, 3], t: [0, 0, -2], s: 9, day: [0xa0acd0, 0.9], night: [0x9aa6cc, 0.8] });
  R.dark = true;
  struct(add(R.g, new THREE.CircleGeometry(8, 64), M(0xffffff, 0.95, 0, { t: TX.carpetBlue(), rep: [6, 6], bump: 0.01 }), 0, 0, 0)).rotation.x = -Math.PI / 2;
  const wl = M(0x3a3048, 0.9, 0, { t: TX.velvet(), rep: [30, 3] }); wl.side = THREE.BackSide;
  struct(add(R.g, new THREE.CylinderGeometry(8, 8, 2.6, 64, 1, true), wl, 0, 1.3, 0));
  struct(add(R.g, new THREE.SphereGeometry(8, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ map: T.starDome(false), side: THREE.BackSide }), 0, 2.6, 0));
  struct(add(R.g, new THREE.TorusGeometry(7.95, 0.06, 6, 64), BRASS, 0, 2.6, 0)).rotation.x = Math.PI / 2;
  const seat = M(0x6a1420, 0.9, 0, { t: TX.velvet() }), frame = M(0x1a1a1c, 0.5, 0.4);
  for (const r of [4.2, 5.6, 7]) for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2; if (Math.abs(Math.sin(a)) < 0.55) continue;
    const s = new THREE.Group(); s.position.set(Math.sin(a) * r, 0, -Math.cos(a) * r); faceTo(s, 0, 0); R.g.add(s);
    box(s, 0.56, 0.12, 0.52, seat, 0, 0.42, 0);
    box(s, 0.56, 0.78, 0.1, seat, 0, 0.82, -0.3).rotation.x = -0.5;
    for (const q of [-1, 1]) box(s, 0.05, 0.62, 0.55, frame, q * 0.3, 0.33, -0.02);
  }
  // Zeiss-style star projector: two star balls on a truss
  const pj = new THREE.Group(); R.g.add(pj);
  const dm = M(0x22242a, 0.45, 0.6);
  cyl(pj, 0.45, 0.6, 0.35, dm, 0, 0.175, 0); cyl(pj, 0.12, 0.16, 1.2, dm, 0, 0.95, 0, 16);
  const arm = new THREE.Group(); arm.position.y = 1.6; arm.rotation.z = 0.5; pj.add(arm);
  cyl(arm, 0.09, 0.09, 1.6, dm, 0, 0, 0, 12);
  const holeM = M(0xffffff, 0.3, 0, { emissive: 0xfff4d8, emissiveIntensity: 1.4 });
  const r = T.rng(4);
  for (const s of [-1, 1]) {
    sph(arm, 0.34, dm, 0, s * 0.85, 0, 28);
    for (let i = 0; i < 26; i++) { const v = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(0.34); sph(arm, 0.018, holeM, v.x, s * 0.85 + v.y, v.z, 6); }
  }
  updaters.push((dt, t) => { pj.rotation.y = t * 0.04; });
  // console
  const cn = new THREE.Group(); cn.position.set(-1.3, 0, 2.0); faceTo(cn, 0, 6); R.g.add(cn);
  box(cn, 1.2, 0.9, 0.55, mat.mahog(), 0, 0.45, 0);
  box(cn, 1.22, 0.05, 0.66, M(0x2a2c30, 0.4, 0.6, { t: TX.steel(), bump: 0.004 }), 0, 0.95, 0.04).rotation.x = 0.35;
  const cols = [0xc83a2a, 0xe8c050, 0x40a060, 0xe8e0d0];
  for (let i = 0; i < 12; i++) box(cn, 0.06, 0.035, 0.06, M(cols[i % 4], 0.4, 0, { emissive: cols[i % 4], emissiveIntensity: 0.35 }), -0.42 + (i % 6) * 0.17, 1.0 - Math.floor(i / 6) * 0.05, -0.06 + Math.floor(i / 6) * 0.16).rotation.x = 0.35;
  for (let i = 0; i < 3; i++) cyl(cn, 0.05, 0.05, 0.02, BRASS, -0.3 + i * 0.3, 0.9, 0.24, 16).rotation.x = 0.35 + Math.PI / 2;
  const cl = new THREE.Group(); cl.position.set(0.5, 0.97, -0.15); cn.add(cl);
  cyl(cl, 0.005, 0.005, 0.3, BRASS, 0, 0.15, 0, 6); sph(cl, 0.035, M(0xfff0d0, 0.3, 0, { emissive: 0xffc070, emissiveIntensity: 1 }), 0, 0.3, 0.02, 10);
  tag(cn, 'console', 'Projector console');
  // stage + velvet curtains
  const st = new THREE.Group(); st.position.set(0, 0, -6.3); R.g.add(st);
  add(st, new THREE.CylinderGeometry(3.2, 3.2, 0.5, 48, 1, false, Math.PI / 2, Math.PI), mat.oak([6, 1]), 0, 0.25, -0.4);
  for (let i = 0; i < 16; i++) { const a = Math.PI / 2 + (i / 15) * Math.PI; sph(st, 0.035, M(0xffffff, 0.3, 0, { emissive: 0xffc070, emissiveIntensity: 1 }), Math.sin(a) * 3.2, 0.45, Math.cos(a) * 3.2 - 0.4, 8); }
  curtain(st, 6.4, 3.2, M(0x7a1020, 0.8, 0, { t: TX.velvet(), rep: [2, 4] }), 0, 2.1, -1.4, 0, 12);
  box(st, 6.6, 0.4, 0.1, M(0x7a1020, 0.8), 0, 3.5, -1.3);
  door(R, 3.3, -7.25, 'Service', 'hatch', [0, 0], { metal: 1 });
  // Dex's hologram card (night 1)
  const hc = new THREE.Group(); hc.position.set(0.55, 0.01, -0.7); R.g.add(hc);
  box(hc, 0.09, 0.006, 0.06, M(0x2a4a5a, 0.3, 0.3, { emissive: 0x3aa0c0, emissiveIntensity: 0.9 }), 0, 0, 0).rotation.y = 0.5;
  hit(hc, 0, 0.1, 0, 0.3, 'holocard', 'Something glowing');
  R.holo = hc;
  // the code on the dome (after the constellation)
  const code = add(R.g, new THREE.PlaneGeometry(6, 4.1), new THREE.MeshBasicMaterial({
    map: T.textCanvas(1024, 700, (g) => {
      g.shadowColor = '#fff2c0'; g.shadowBlur = 24; g.strokeStyle = 'rgba(255,240,200,.75)'; g.lineWidth = 5;
      const P = [[512, 40], [512, 170], [512, 400], [340, 170], [684, 170]];
      g.beginPath(); g.moveTo(512, 40); g.lineTo(512, 400); g.moveTo(340, 170); g.lineTo(684, 170); g.stroke();
      g.fillStyle = '#fffaf0'; P.forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 12, 0, 7); g.fill(); });
      g.font = '600 190px Cinzel, Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('7 · 2 · 9', 512, 560);
    }), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }), 0, 6.4, -4.4);
  code.lookAt(0, 1.6, 2); code.userData.nocast = 1; R.code = code;
  door(R, 0, 7.9, 'Lobby', 'exit_plan', [0, 0]);
  lamps(R, [0, 2.4, 2, 0xb0b8e0, 16, 14], [0, 2.6, -5.5, 0xffb070, 14, 9]);
  return R;
}

function buildKitchen() {
  const R = mkRoom('kitchen', { p: [-3, 7, 4], t: [0, 0, -1], s: 7, day: [0xfff0d8, 1.8], night: [0xffd8a8, 0.8] });
  rectRoom(R, -5, 5, -4, 4, 3.2, { floor: M(0xffffff, 0.4, 0, { t: TX.checker(), rep: [5, 4], bump: 0.01 }), wall: M(0xffffff, 0.35, 0, { t: TX.subway(), bump: 0.01 }) });
  skyWindow(R, 3.2, 1.2, -2, 2.15, -3.97, 0, 0xd8d0b8);
  const stl = M(0xffffff, 0.3, 0.85, { t: TX.steel(), rep: [3, 1], bump: 0.003 });
  box(R.g, 10, 0.92, 0.7, stl, 0, 0.46, -3.6);
  box(R.g, 10, 0.05, 0.74, M(0xffffff, 0.25, 0.9, { t: TX.steel(), rep: [4, 1] }), 0, 0.945, -3.6);
  for (let i = 0; i < 8; i++) box(R.g, 1.0, 0.72, 0.01, M(0x9a9c9e, 0.35, 0.8), -4.4 + i * 1.25, 0.5, -3.245);
  const ov = new THREE.Group(); ov.position.set(2.6, 0, -3.55); R.g.add(ov);
  box(ov, 1.2, 0.95, 0.74, M(0xd0d2d4, 0.25, 0.9, { t: TX.steel() }), 0, 0.475, 0.02);
  box(ov, 0.85, 0.42, 0.02, M(0x1a0c06, 0.1, 0, { emissive: 0x7a2a08, emissiveIntensity: 0.5 }), 0, 0.45, 0.4);
  box(ov, 0.7, 0.03, 0.04, STEEL, 0, 0.72, 0.42);
  add(ov, new THREE.PlaneGeometry(0.26, 0.08), new THREE.MeshBasicMaterial({ map: T.textCanvas(256, 80, (g) => { g.fillStyle = '#0a1008'; g.fillRect(0, 0, 256, 80); g.fillStyle = '#6aff90'; g.font = '700 54px monospace'; g.textAlign = 'center'; g.fillText('12:30', 128, 60); }) }), 0, 0.86, 0.395);
  for (let i = 0; i < 4; i++) add(ov, new THREE.TorusGeometry(0.1, 0.012, 6, 20), IRON, -0.3 + (i % 2) * 0.6, 0.96, -0.15 + Math.floor(i / 2) * 0.3).rotation.x = Math.PI / 2;
  const hood = add(R.g, new THREE.CylinderGeometry(0.3, 0.9, 0.7, 4, 1, true), M(0xd0d2d4, 0.3, 0.9, { t: TX.steel(), side: THREE.DoubleSide }), 2.6, 2.55, -3.45); hood.rotation.y = Math.PI / 4;
  tag(ov, 'oven', 'Oven');
  const rb = new THREE.Group(); rb.position.set(-4.96, 1.65, -0.6); rb.rotation.y = Math.PI / 2; R.g.add(rb);
  box(rb, 1.3, 0.9, 0.04, mat.oak(), 0, 0, 0);
  box(rb, 1.2, 0.8, 0.02, M(0xffffff, 0.95, 0, { t: T.concrete({ base: '#b08050', seed: 3 }), bump: 0.02 }), 0, 0, 0.02);
  for (let i = 0; i < 5; i++) { const c = box(rb, 0.28, 0.2, 0.004, M(0xf0e8d4, 0.9), -0.38 + (i % 3) * 0.38, 0.18 - Math.floor(i / 3) * 0.34, 0.035); c.rotation.z = Math.sin(i * 3) * 0.1; sph(rb, 0.012, M(0xb03030, 0.4), c.position.x, c.position.y + 0.08, 0.04, 6); }
  tag(rb, 'recipeboard', 'Recipe board');
  const is = new THREE.Group(); is.position.set(0.4, 0, -0.9); R.g.add(is);
  box(is, 2.3, 0.88, 1.0, mat.mahog([2, 1]), 0, 0.44, 0);
  box(is, 2.4, 0.08, 1.1, mat.oak([2, 1]), 0, 0.92, 0);
  const cake = new THREE.Group(); cake.position.set(0.5, 0.96, 0); is.add(cake);
  lathe(cake, [[0.001, 0], [0.1, 0], [0.04, 0.03], [0.03, 0.12], [0.28, 0.13], [0.28, 0.14], [0.001, 0.14]], M(0xe8e4dc, 0.2, 0.3), 0, 0, 0, 28);
  cyl(cake, 0.24, 0.24, 0.16, M(0xf0e0cc, 0.8), 0, 0.22, 0, 32); cyl(cake, 0.18, 0.18, 0.13, M(0xf4ead8, 0.8), 0, 0.365, 0, 32);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; sph(cake, 0.018, M(0xe8c8d0, 0.6), Math.cos(a) * 0.24, 0.3, Math.sin(a) * 0.24, 6); }
  star3(cake, 0.05, M(0xd8b060, 0.3, 0.8), 0, 0.48, 0, 0.012);
  tag(cake, 'cake', 'Gala cake');
  for (let i = 0; i < 5; i++) sph(is, 0.045, M([0xd8a020, 0x9ab040, 0xc84030][i % 3], 0.5), -0.7 + (i % 3) * 0.1, 0.99, -0.25 + Math.floor(i / 3) * 0.1, 10);
  lathe(is, [[0.001, 0], [0.08, 0], [0.16, 0.08], [0.18, 0.12], [0.17, 0.12], [0.001, 0.02]], M(0xd8d0c8, 0.3), -0.55, 0.96, 0.2, 20);
  box(R.g, 3, 0.03, 0.03, IRON, 0.4, 2.65, -0.9);
  const copper = M(0xb86a3a, 0.35, 1);
  for (let i = 0; i < 5; i++) { cyl(R.g, 0.003, 0.003, 0.25, IRON, -0.6 + i * 0.5, 2.52, -0.9, 4); cyl(R.g, 0.13 - i * 0.01, 0.11, 0.1, copper, -0.6 + i * 0.5, 2.3, -0.9, 20).rotation.x = 1.45; }
  door(R, 0, 3.95, 'Lobby', 'exit_kitchen', [0, 0]);
  lamps(R, [0, 2.9, -1, 0xffe0b8, 14, 12], [2.6, 0.5, -3, 0xff8a3a, 1.5, 3]);
  return R;
}

function buildTech() {
  const R = mkRoom('tech', { p: [1, 6, 3], t: [0, 0, -1], s: 6, day: [0xf0f0e8, 1.3], night: [0xd0d8e0, 0.6] });
  rectRoom(R, -4, 4, -4, 4, 2.9, { floor: M(0xffffff, 0.95, 0, { t: TX.carpetOffice(), rep: [8, 8], bump: 0.005 }), wall: M(0xffffff, 0.8, 0, { t: TX.plasterCool(), bump: 0.01 }) });
  for (const x of [-1.5, 1.5]) box(R.g, 1.2, 0.02, 0.6, M(0xffffff, 0.5, 0, { emissive: 0xf0f4ff, emissiveIntensity: 0.9 }), x, 2.89, 0).userData.nocast = 1;
  const lam = M(0xc8bca0, 0.5), beige = M(0xd6cdb4, 0.6), legs = M(0x6a6e72, 0.5, 0.6);
  const dk = new THREE.Group(); dk.position.set(0, 0, -3.4); R.g.add(dk);
  box(dk, 3.4, 0.05, 0.9, lam, 0, 0.74, 0);
  for (const s of [-1, 1]) box(dk, 0.05, 0.74, 0.85, legs, s * 1.62, 0.37, 0);
  // the AquaOS machine: beige CRT with a screen
  const pc = new THREE.Group(); pc.position.set(0, 0.77, -0.08); dk.add(pc);
  box(pc, 0.56, 0.46, 0.46, beige, 0, 0.25, 0); box(pc, 0.4, 0.34, 0.26, beige, 0, 0.22, -0.34);
  box(pc, 0.46, 0.35, 0.01, M(0x0c1420, 0.15), 0, 0.27, 0.231);
  add(pc, new THREE.PlaneGeometry(0.42, 0.31), new THREE.MeshBasicMaterial({ map: T.textCanvas(512, 384, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a5a9a'); gr.addColorStop(1, '#6a9ac8'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.9)'; g.font = 'bold 40px Tahoma, Verdana, sans-serif'; g.textAlign = 'center'; g.fillText('AquaOS', w / 2, h / 2 - 10);
    g.font = '20px Tahoma, Verdana, sans-serif'; g.fillText('Press any key to log in', w / 2, h / 2 + 30);
    g.fillStyle = 'rgba(0,0,0,.12)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  }) }), 0, 0.27, 0.237);
  box(pc, 0.5, 0.03, 0.18, beige, 0, 0.015, 0.36);
  tag(pc, 'computer', 'Dex\'s computer');
  box(pc, 0.08, 0.08, 0.003, M(0xe8d860, 0.9), 0.23, 0.44, 0.235).rotation.z = 0.12;
  hit(pc, 0.23, 0.44, 0.26, 0.09, 'sticky', 'Sticky note');
  const ph = new THREE.Group(); ph.position.set(1.15, 0.77, 0.05); ph.rotation.y = -0.35; dk.add(ph);
  box(ph, 0.18, 0.23, 0.02, mat.mahog(), 0, 0.115, 0); box(ph, 0.02, 0.2, 0.1, mat.mahog(), 0, 0.1, -0.05).rotation.x = 0.35;
  add(ph, new THREE.PlaneGeometry(0.14, 0.18), new THREE.MeshBasicMaterial({ map: T.textCanvas(128, 160, (g) => { g.fillStyle = '#8aa0a8'; g.fillRect(0, 0, 128, 160); g.fillStyle = '#c88a40'; g.beginPath(); g.ellipse(64, 104, 36, 32, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(34, 86); g.lineTo(42, 54); g.lineTo(58, 78); g.moveTo(94, 86); g.lineTo(86, 54); g.lineTo(70, 78); g.fill(); g.fillStyle = '#222'; g.fillRect(50, 98, 5, 5); g.fillRect(73, 98, 5, 5); }) }), 0, 0.115, 0.011);
  hit(ph, 0, 0.12, 0.05, 0.13, 'catphoto', 'Photo frame');
  const ll = new THREE.Group(); ll.position.set(-1.2, 0.77, 0); dk.add(ll);
  lathe(ll, [[0.001, 0], [0.08, 0], [0.05, 0.12], [0.06, 0.13]], M(0x6a6e72, 0.3, 0.8), 0, 0, 0, 16);
  lathe(ll, [[0.055, 0.13], [0.07, 0.3], [0.035, 0.45], [0.001, 0.46]], M(0xd05a8a, 0.2, 0, { transparent: true, opacity: 0.7, emissive: 0x802040, emissiveIntensity: 0.5 }), 0, 0, 0, 16);
  const blob = sph(ll, 0.028, M(0xf0a040, 0.3, 0, { emissive: 0xd06010, emissiveIntensity: 0.9 }), 0, 0.25, 0, 10);
  updaters.push((dt, t) => { blob.position.y = 0.27 + Math.sin(t * 0.6) * 0.09; });
  for (let i = 0; i < 4; i++) box(dk, 0.21, 0.004, 0.297, M(0xf0ece0, 0.9), -0.7 + i * 0.03, 0.77 + i * 0.004, 0.15).rotation.y = i * 0.15;
  lathe(dk, [[0.001, 0], [0.04, 0], [0.042, 0.1], [0.038, 0.1]], M(0x2a5a8a, 0.4), 0.7, 0.77, 0.25, 16);
  const sd = new THREE.Group(); sd.position.set(3.25, 0, 0.4); sd.rotation.y = -Math.PI / 2; R.g.add(sd);
  box(sd, 1.8, 0.05, 0.8, lam, 0, 0.74, 0);
  for (const s of [-1, 1]) box(sd, 0.05, 0.74, 0.75, legs, s * 0.85, 0.37, 0);
  box(sd, 0.46, 0.4, 0.42, beige, 0, 0.97, -0.05); box(sd, 0.38, 0.29, 0.01, M(0x0a140c, 0.2, 0, { emissive: 0x0a3a14, emissiveIntensity: 0.8 }), 0, 0.98, 0.165);
  box(sd, 0.2, 0.45, 0.45, beige, 0.62, 0.99, -0.05);
  const rk = new THREE.Group(); rk.position.set(3.35, 0, -2.6); rk.rotation.y = -Math.PI / 2; R.g.add(rk);
  box(rk, 0.7, 2.1, 0.8, M(0x1a1c1e, 0.5, 0.5), 0, 1.05, 0);
  const leds = [];
  for (let i = 0; i < 24; i++) leds.push(box(rk, 0.03, 0.015, 0.01, M(0x000000, 0.3, 0, { emissive: i % 3 ? 0x30ff70 : 0xffa020, emissiveIntensity: 1.2 }), -0.28 + (i % 6) * 0.1, 0.4 + Math.floor(i / 6) * 0.45, 0.41));
  updaters.push((dt, t) => { leds.forEach((l, i) => { l.visible = Math.sin(t * (3 + (i % 5)) + i) > -0.3; }); });
  const sb = new THREE.Group(); sb.position.set(-3.95, 1.45, 0.6); sb.rotation.y = Math.PI / 2; R.g.add(sb);
  box(sb, 1.3, 0.8, 0.08, M(0x6a6e6a, 0.55, 0.6, { t: TX.steel(), bump: 0.003 }), 0, 0, 0);
  for (let i = 0; i < 6; i++) { box(sb, 0.05, 0.12, 0.05, STEEL, -0.45 + i * 0.16, 0.06, 0.06); sph(sb, 0.018, M(0, 0.3, 0, { emissive: 0x40ff60, emissiveIntensity: 1 }), -0.45 + i * 0.16, 0.24, 0.05, 8); }
  box(sb, 0.09, 0.16, 0.06, M(0xa02020, 0.5), 0.5, -0.2, 0.07);
  plaqueMesh(sb, 'PUBLIC ADDRESS', 0.6, 0.08, 0, -0.3, 0.045, 0, { size: 0.5 });
  tag(sb, 'switchboard', 'Speaker switchboard');
  const poster = (lines, bg, x, z) => { add(R.g, new THREE.PlaneGeometry(0.7, 0.95), new THREE.MeshStandardMaterial({ roughness: 0.8, map: T.textCanvas(256, 348, (g) => { g.fillStyle = bg; g.fillRect(0, 0, 256, 348); g.fillStyle = '#f0e8d0'; g.font = 'bold 40px Impact, Arial Black, sans-serif'; g.textAlign = 'center'; lines.forEach((l, i) => g.fillText(l, 128, 90 + i * 52)); g.strokeStyle = '#f0e8d0'; g.lineWidth = 6; g.strokeRect(14, 14, 228, 320); }) }), x, 1.8, z); };
  poster(['Y2K', 'READY'], '#2a4a6a', -2.2, -3.98);
  poster(['LAKESHORE', 'LAN', 'PARTY', '2003'], '#5a2a3a', 2.2, -3.98);
  const fc = new THREE.Group(); fc.position.set(-3.6, 0, -3.3); R.g.add(fc);
  box(fc, 0.5, 1.3, 0.6, M(0x7a7e7a, 0.5, 0.6), 0, 0.65, 0);
  for (let i = 0; i < 4; i++) { box(fc, 0.44, 0.28, 0.01, M(0x8a8e8a, 0.45, 0.6), 0, 0.2 + i * 0.3, 0.305); box(fc, 0.14, 0.02, 0.02, STEEL, 0, 0.28 + i * 0.3, 0.32); }
  // office chair, whiteboard, boxes, bin
  const oc = new THREE.Group(); oc.position.set(0.25, 0, -2.45); oc.rotation.y = 0.4; R.g.add(oc);
  const blk = M(0x1c1c20, 0.8, 0, { t: TX.cloth(), rep: [3, 3], bump: 0.004 });
  for (let i = 0; i < 5; i++) { const l = box(oc, 0.04, 0.03, 0.3, M(0x2a2a2c, 0.4, 0.6), 0, 0.06, 0); l.geometry.translate(0, 0, 0.15); l.rotation.y = i * 1.2566; sph(oc, 0.03, M(0x111111, 0.5), Math.sin(i * 1.2566) * 0.3, 0.03, Math.cos(i * 1.2566) * 0.3, 8); }
  cyl(oc, 0.025, 0.025, 0.36, M(0x6a6e72, 0.3, 0.8), 0, 0.26, 0, 10);
  box(oc, 0.48, 0.08, 0.46, blk, 0, 0.46, 0);
  box(oc, 0.44, 0.52, 0.06, blk, 0, 0.8, -0.24).rotation.x = -0.12;
  const wb = add(R.g, new THREE.PlaneGeometry(1.5, 0.85), new THREE.MeshStandardMaterial({ roughness: 0.25, map: T.textCanvas(512, 290, (g, w, h) => {
    g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, w, h);
    g.font = '30px "Segoe Print", "Comic Sans MS", cursive'; g.fillStyle = '#1a3a8a'; g.fillText('GALA A/V', 24, 44);
    g.fillStyle = '#2a2a2a'; ['lights — done', 'sound — done', 'projector — ??', 'ghost show v3 — SECRET'].forEach((l, i) => g.fillText(l, 36, 96 + i * 44));
    g.strokeStyle = '#b02020'; g.lineWidth = 3; g.beginPath(); g.ellipse(360, 228, 130, 26, 0, 0, 7); g.stroke();
  }) }), 0, 1.95, -3.97);
  box(R.g, 1.56, 0.03, 0.05, M(0x9a9ea2, 0.3, 0.8), 0, 1.51, -3.95);
  const cardboard = M(0xb89260, 0.9, 0, { t: T.concrete({ base: '#c09a68', seed: 7 }), bump: 0.01 });
  for (const [x, y, z, w, h, d, r] of [[-2.7, 0.2, -1.2, 0.6, 0.4, 0.45, 0.1], [-2.65, 0.6, -1.2, 0.5, 0.4, 0.4, -0.15], [-2.9, 0.18, -0.4, 0.45, 0.36, 0.4, 0.3]]) box(R.g, w, h, d, cardboard, x, y, z).rotation.y = r;
  lathe(R.g, [[0.001, 0], [0.14, 0], [0.17, 0.38], [0.165, 0.38], [0.135, 0.02], [0.001, 0.02]], M(0x3a3e42, 0.6, 0.3, { side: THREE.DoubleSide }), 1.6, 0, -2.8, 20);
  for (let i = 0; i < 6; i++) box(R.g, 0.14, 0.012, 0.125, M([0x2a4a8a, 0xd8d8d8, 0x8a2a2a][i % 3], 0.3), -1.5 + i * 0.01, 0.775 + i * 0.012, -3.3).rotation.y = i * 0.2;
  door(R, 0, 3.95, 'Lobby', 'exit_tech', [0, 0]);
  lamps(R, [0, 2.7, -0.5, 0xf4f4ec, 12, 12], [0, 1.4, -3, 0x8ab0d0, 1.2, 3]);
  return R;
}

function buildArchive() {
  const R = mkRoom('archive', { p: [-3, 6, 3], t: [0, 0, -1], s: 7, day: [0xffe8c8, 1.6], night: [0xffd8a0, 0.5] });
  rectRoom(R, -4.5, 4.5, -4, 4, 3.2, { floor: M(0xffffff, 0.45, 0, { t: TX.oak(), rep: [3, 3], bump: 0.01 }), wall: M(0xffffff, 0.85, 0, { t: TX.damaskRose(), bump: 0.01 }), wains: M(0xffffff, 0.5, 0, { t: TX.panel(), bump: 0.02 }), wh: 1.2 });
  struct(add(R.g, new THREE.PlaneGeometry(4.2, 3), M(0xffffff, 0.95, 0, { t: TX.carpetRed(), rep: [4, 3], bump: 0.01 }), 0, 0.005, -0.6)).rotation.x = -Math.PI / 2;
  skyWindow(R, 2.2, 1.4, -1.4, 2.05, -3.97, 0, 0x5a2a2a);
  const bp = T.textCanvas(512, 360, (g, w, h) => {
    g.fillStyle = '#23466e'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(220,230,240,.15)'; g.lineWidth = 1;
    for (let x = 0; x < w; x += 20) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y < h; y += 20) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = '#dfe8f0'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(w / 2, h / 2 + 20, 120, 0, 7); g.stroke(); g.beginPath(); g.arc(w / 2, h / 2 + 20, 40, 0, 7); g.stroke();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * 40, h / 2 + 20 + Math.sin(a) * 40); g.lineTo(w / 2 + Math.cos(a) * 170, h / 2 + 20 + Math.sin(a) * 170); g.stroke(); }
    g.fillStyle = '#dfe8f0'; g.font = '20px "Courier New", monospace'; g.fillText('AQUADOME — GROUND FLOOR — O. FINCH 2002', 16, 30);
  });
  for (const z of [-1.5, 1.4]) add(R.g, new THREE.PlaneGeometry(1.5, 1.05), new THREE.MeshStandardMaterial({ map: bp, roughness: 0.85 }), 4.47, 1.95, z).rotation.y = -Math.PI / 2;
  const dt = new THREE.Group(); dt.position.set(1.6, 0, -2.4); R.g.add(dt);
  for (const s of [-1, 1]) { box(dt, 0.05, 0.95, 0.05, mat.oak(), s * 0.6, 0.475, 0.3); box(dt, 0.05, 0.95, 0.05, mat.oak(), s * 0.6, 0.475, -0.3); }
  box(dt, 1.4, 0.04, 0.9, mat.oak(), 0, 1.0, 0).rotation.x = 0.35;
  box(dt, 1.4, 0.03, 0.04, BRASS, 0, 0.87, 0.44);
  const sk = add(dt, new THREE.PlaneGeometry(0.64, 0.5), new THREE.MeshStandardMaterial({ roughness: 0.9, map: T.textCanvas(200, 160, (g) => { g.fillStyle = '#ede4cc'; g.fillRect(0, 0, 200, 160); g.strokeStyle = '#3a4a6a'; g.lineWidth = 1.5; const P = [[100, 30], [100, 62], [100, 130], [55, 62], [145, 62]]; g.beginPath(); g.moveTo(100, 30); g.lineTo(100, 130); g.moveTo(55, 62); g.lineTo(145, 62); g.stroke(); g.fillStyle = '#3a4a6a'; P.forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }); g.font = 'italic 11px Georgia'; g.fillText('opening night, 2003', 96, 150); }) }), 0.1, 1.03, 0.0);
  sk.rotation.x = -Math.PI / 2 + 0.35; sk.userData.nocast = 1; R.sketch = sk;
  hit(dt, 0.1, 1.05, 0.05, 0.28, 'sketch', 'A sketch');
  tag(dt, 'drafting', 'Drafting table');
  const lampA = new THREE.Group(); lampA.position.set(-0.5, 1.12, -0.25); dt.add(lampA);
  cyl(lampA, 0.06, 0.07, 0.02, BRASS, 0, 0, 0); cyl(lampA, 0.008, 0.008, 0.4, BRASS, 0, 0.2, 0, 6).rotation.z = 0.3;
  add(lampA, new THREE.ConeGeometry(0.1, 0.12, 16, 1, true), M(0x1f4a2a, 0.3, 0, { side: THREE.DoubleSide }), -0.1, 0.4, 0.05).rotation.z = -0.6;
  const note = add(R.g, new THREE.PlaneGeometry(0.34, 0.25), new THREE.MeshStandardMaterial({ roughness: 0.9, map: T.textCanvas(200, 150, (g) => { g.fillStyle = '#efe4c8'; g.fillRect(0, 0, 200, 150); g.fillStyle = '#3a2a4a'; g.font = 'italic 21px Georgia, serif'; ['The stars', 'remember where', 'I left them.'].forEach((l, i) => g.fillText(l, 16, 45 + i * 32)); }) }), 1.6, 1.95, -3.96);
  tag(note, 'opalnote', 'Handwritten note');
  sph(R.g, 0.012, M(0xb03030, 0.4), 1.6, 2.05, -3.95, 6);
  const dr = new THREE.Group(); dr.position.set(-2.9, 0, -3.3); R.g.add(dr);
  box(dr, 1.6, 0.9, 0.9, M(0x5a5e58, 0.45, 0.6, { t: TX.steel(), bump: 0.003 }), 0, 0.45, 0);
  for (let i = 0; i < 4; i++) { box(dr, 1.5, 0.18, 0.02, M(0x6a6e68, 0.4, 0.6), 0, 0.15 + i * 0.2, 0.46); box(dr, 0.3, 0.025, 0.03, BRASS, 0, 0.18 + i * 0.2, 0.48); }
  cyl(dr, 0.06, 0.06, 0.03, BRASS, 0.6, 0.78, 0.47, 20).rotation.x = Math.PI / 2;
  tag(dr, 'drawer', 'Locked drawer');
  const md = new THREE.Group(); md.position.set(3, 0, 1.2); R.g.add(md);
  box(md, 0.9, 0.9, 0.9, mat.mahog(), 0, 0.45, 0);
  cyl(md, 0.35, 0.35, 0.04, M(0x6a8a80, 0.6), 0, 0.92, 0);
  add(md, new THREE.SphereGeometry(0.22, 24, 12, 0, 6.3, 0, 1.6), M(0xd0d8d4, 0.2, 0.2, { transparent: true, opacity: 0.6 }), 0, 0.94, 0);
  add(md, new THREE.SphereGeometry(0.4, 24, 12, 0, 6.3, 0, 1.6), GLASS, 0, 0.92, 0);
  tag(md, 'model', 'Scale model');
  const rr = T.rng(12);
  const bookcase = (x, z, ry) => {
    const sh = new THREE.Group(); sh.position.set(x, 0, z); sh.rotation.y = ry; R.g.add(sh);
    box(sh, 2.2, 2.5, 0.42, mat.mahog([1, 2]), 0, 1.25, 0);
    const cols = [0x5a1a1a, 0x1a3a2a, 0x2a2a4a, 0x6a4a2a, 0x3a2a1a, 0x7a6a4a].map(c => M(c, 0.75));
    for (let r = 0; r < 5; r++) {
      box(sh, 2.1, 0.03, 0.38, M(0x2a140a, 0.5), 0, 0.12 + r * 0.48, 0.03);
      let bx = -1.0;
      while (bx < 0.95) { const w = 0.03 + rr() * 0.04, h = 0.28 + rr() * 0.12; box(sh, w, h, 0.26, cols[Math.floor(rr() * 6)], bx + w / 2, 0.14 + r * 0.48 + h / 2, 0.08); bx += w + 0.004; }
    }
  };
  bookcase(-4.28, 0.9, Math.PI / 2); bookcase(-1.6, 3.78, Math.PI);
  hit(R.g, -4.05, 1.3, 0.9, 0.7, 'books', 'Bookcase');
  palm(R.g, 3.8, -3.3, 1);
  door(R, 1.2, 3.95, 'Lobby', 'exit_archive', [1.2, 0]);
  lamps(R, [0, 2.9, -0.5, 0xffd8a8, 11, 12], [1.2, 1.4, -2.3, 0xffe0b0, 3, 4]);
  return R;
}

function buildSuite() {
  const R = mkRoom('suite', { p: [2, 6, -4], t: [0, 0, 0], s: 6, day: [0xffecd0, 1.6], night: [0x8090c0, 0.25] });
  rectRoom(R, -3.5, 3.5, -3, 3, 2.9, { floor: M(0xffffff, 0.95, 0, { t: TX.carpetSuite(), rep: [4, 3], bump: 0.008 }), wall: M(0xffffff, 0.85, 0, { t: TX.damaskRose(), bump: 0.01 }) });
  skyWindow(R, 1.8, 1.4, 1.3, 1.65, -2.97, 0, 0x6a4a5a);
  const bd = new THREE.Group(); bd.position.set(-1.4, 0, -1.6); R.g.add(bd);
  box(bd, 1.7, 0.3, 2.2, mat.mahog(), 0, 0.2, 0);
  box(bd, 1.62, 0.22, 2.1, M(0xece4d4, 0.9, 0, { t: TX.linen(), rep: [3, 3] }), 0, 0.46, 0.02);
  box(bd, 1.72, 0.08, 1.45, M(0x6a5070, 0.9, 0, { t: TX.cloth(), rep: [6, 6], bump: 0.006 }), 0, 0.6, 0.36);
  for (const s of [-1, 1]) sph(bd, 0.3, M(0xf0e8dc, 0.9, 0, { t: TX.linen(), rep: [2, 2] }), s * 0.42, 0.66, -0.8, 18).scale.set(1, 0.33, 0.55);
  box(bd, 1.8, 1.25, 0.1, mat.mahog(), 0, 0.72, -1.12);
  for (const s of [-1, 1]) box(bd, 0.1, 1.4, 0.12, mat.mahog(), s * 0.88, 0.7, -1.12);
  tag(bd, 'bed', 'Bed');
  const ns = new THREE.Group(); ns.position.set(0.05, 0, -2.55); R.g.add(ns);
  box(ns, 0.5, 0.6, 0.4, mat.mahog(), 0, 0.3, 0);
  cyl(ns, 0.05, 0.08, 0.3, M(0x2a4a4a, 0.3), 0, 0.75, 0, 16);
  add(ns, new THREE.CylinderGeometry(0.12, 0.17, 0.2, 20, 1, true), M(0xf0e4c8, 0.8, 0, { emissive: 0xffc070, emissiveIntensity: 0.6, side: THREE.DoubleSide }), 0, 0.98, 0).userData.nocast = 1;
  const dk = new THREE.Group(); dk.position.set(2.8, 0, 0.8); dk.rotation.y = -Math.PI / 2; R.g.add(dk);
  box(dk, 1.3, 0.05, 0.55, mat.mahog(), 0, 0.74, 0);
  for (const s of [-1, 1]) box(dk, 0.05, 0.74, 0.5, mat.mahog(), s * 0.6, 0.37, 0);
  cyl(dk, 0.13, 0.13, 0.035, M(0xb0b4b8, 0.3, 0.8), -0.3, 0.785, 0, 28);
  box(dk, 0.4, 0.008, 0.3, M(0x1c1c1c, 0.5), 0.2, 0.77, 0.02);
  tag(dk, 'cdplayer', 'Your desk');
  const sc = new THREE.Group(); sc.position.set(-2.7, 0, 1.8); sc.rotation.y = 0.3; R.g.add(sc);
  box(sc, 0.7, 0.5, 0.24, M(0xc8ccd0, 0.3, 0.8, { t: TX.steel(), bump: 0.003 }), 0, 0.25, 0);
  for (let i = 0; i < 3; i++) box(sc, 0.72, 0.02, 0.26, M(0x9a9ea2, 0.3, 0.8), 0, 0.08 + i * 0.17, 0);
  tag(sc, 'suitcase', 'Your suitcase');
  const ac = new THREE.Group(); ac.position.set(2.4, 0, -1.8); faceTo(ac, 0, 0); R.g.add(ac);
  const up = M(0x8a6a50, 0.9, 0, { t: TX.velvet() });
  box(ac, 0.8, 0.4, 0.75, up, 0, 0.25, 0); box(ac, 0.8, 0.6, 0.18, up, 0, 0.65, -0.3);
  for (const s of [-1, 1]) box(ac, 0.14, 0.3, 0.75, up, s * 0.4, 0.55, 0);
  door(R, 0, 2.95, 'Lobby', 'exit_suite', [0, 0]);
  lamps(R, [0, 2.6, 0, 0xffdcb0, 8, 10], [0.05, 1.0, -2.55, 0xffc070, 3, 4]);
  return R;
}

function buildTunnel() {
  const R = mkRoom('tunnel', { p: [0, 6, -4], t: [0, 0, -6], s: 10, day: [0xffd0a0, 0.8], night: [0xffd0a0, 0.8] });
  R.dark = true;
  rectRoom(R, -1.4, 1.4, -15, 2, 2.6, { floor: M(0xffffff, 0.85, 0, { t: T.concrete({ base: '#5a5852', seed: 4 }), rep: [2, 10], bump: 0.03 }), wall: M(0xffffff, 0.9, 0, { t: TX.concrete(), bump: 0.04 }), ceil: M(0xffffff, 0.9, 0, { t: TX.concrete(), rep: [2, 8] }) });
  const pipeA = M(0x5a6a5a, 0.5, 0.6), pipeB = M(0x8a5a3a, 0.4, 0.9);
  for (const [x, y, m, r] of [[-1.2, 2.2, pipeA, 0.1], [-1.25, 1.8, pipeB, 0.06], [1.2, 2.3, pipeB, 0.08], [1.25, 0.5, pipeA, 0.12]]) cyl(R.g, r, r, 17, m, x, y, -6.5, 16).rotation.x = Math.PI / 2;
  const bulbs = [];
  for (let z = 0; z > -15; z -= 3) {
    const b = sph(R.g, 0.06, M(0xffffff, 0.3, 0, { emissive: 0xffc890, emissiveIntensity: 1.6 }), 0, 2.45, z, 12); b.userData.nocast = 1;
    add(R.g, new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: 0x222222, wireframe: true }), 0, 2.45, z).userData.nocast = 1;
    bulbs.push(b);
  }
  updaters.push((dt, t) => { bulbs.forEach((b, i) => { b.material.emissiveIntensity = Math.sin(t * 17 + i * 5) > 0.97 ? 0.2 : 1.6; }); });
  const vd = new THREE.Group(); vd.position.set(0, 1.25, -14.9); R.g.add(vd);
  cyl(vd, 1.1, 1.1, 0.15, M(0x8a8e92, 0.35, 0.9, { t: TX.steel(), bump: 0.004 }), 0, 0, 0.05, 48).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) add(vd, new THREE.TorusGeometry(0.3 + i * 0.27, 0.045, 8, 40), [BRASS, STEEL, BRASS][i], 0, 0, 0.14);
  star3(vd, 0.13, BRASS, 0, 0, 0.16, 0.04);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; sph(vd, 0.035, STEEL, Math.cos(a) * 1.02, Math.sin(a) * 1.02, 0.12, 8); }
  tag(vd, 'stardoor', 'Round vault door');
  door(R, 0, 1.95, null, 'exit_tunnel', [0, -5], { metal: 1 });
  lamps(R, [0, 2.2, -2, 0xffc890, 9, 10], [0, 2.2, -12, 0xffc890, 9, 10]);
  return R;
}

function buildStarRoom() {
  const R = mkRoom('star', { p: [0, 4, 1], t: [0, 0, -1], s: 4, day: [0xffd8b0, 1.1], night: [0xffd8b0, 1.1] });
  R.dark = true;
  const floorT = T.textCanvas(512, 512, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, '#4a3020'); gr.addColorStop(1, '#2a1a10'); g.fillStyle = gr; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 40; i++) { g.beginPath(); g.moveTo(0, i * 13); g.lineTo(w, i * 13 + 4); g.stroke(); }
    g.strokeStyle = '#c9a15a'; g.lineWidth = 6; g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 80 : 190; const x = w / 2 + Math.cos(a) * r, y = w / 2 + Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath(); g.stroke();
  });
  struct(add(R.g, new THREE.CircleGeometry(4, 48), new THREE.MeshStandardMaterial({ map: floorT, roughness: 0.45 }), 0, 0, 0)).rotation.x = -Math.PI / 2;
  const wn = M(0xffffff, 0.5, 0, { t: TX.panel(), rep: [12, 1], bump: 0.02 }); wn.side = THREE.BackSide;
  struct(add(R.g, new THREE.CylinderGeometry(4, 4, 1.6, 48, 1, true), wn, 0, 0.8, 0));
  struct(add(R.g, new THREE.TorusGeometry(3.96, 0.05, 6, 48), BRASS, 0, 1.6, 0)).rotation.x = Math.PI / 2;
  struct(add(R.g, new THREE.SphereGeometry(4, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ map: T.starDome(true), side: THREE.BackSide }), 0, 1.6, 0));
  const pd = new THREE.Group(); pd.position.set(0, 0, -0.8); R.g.add(pd);
  lathe(pd, [[0.001, 0], [0.4, 0], [0.4, 0.1], [0.3, 0.18], [0.24, 0.9], [0.34, 0.96], [0.34, 1.02], [0.001, 1.02]], M(0xffffff, 0.25, 0, { t: TX.marbleTop(), bump: 0.005 }), 0, 0, 0, 32);
  cyl(pd, 0.22, 0.22, 0.05, M(0x4a0f18, 0.95, 0, { t: TX.velvet() }), 0, 1.045, 0);
  R.crown = crown(pd, 0, 1.07, 0, 1.4);
  tag(pd, 'crown', 'The Prism Crown');
  const or = new THREE.Group(); or.position.set(-2, 0, -1.6); R.g.add(or);
  lathe(or, [[0.001, 0], [0.25, 0], [0.2, 0.06], [0.05, 0.12], [0.03, 1.1], [0.001, 1.1]], BRASS, 0, 0, 0, 20);
  sph(or, 0.13, M(0xe8c060, 0.3, 0.6, { emissive: 0x8a5a10, emissiveIntensity: 0.6 }), 0, 1.25, 0);
  const arms = [];
  [[0.4, 0x6a8aa0, 0.05], [0.65, 0xa0604a, 0.07], [0.9, 0x6a8a5a, 0.06]].forEach(([r, c, s]) => {
    const a = new THREE.Group(); a.position.y = 1.25; or.add(a); arms.push(a);
    box(a, r, 0.008, 0.008, BRASS, r / 2, 0, 0); sph(a, s, M(c, 0.5), r, 0, 0, 14);
  });
  updaters.push((dt, t) => { arms.forEach((a, i) => { a.rotation.y = t * (0.5 - i * 0.12); }); });
  tag(or, 'orrery', 'Orrery');
  for (const [x, z] of [[2.6, -2.4], [-2.6, 1.5], [2.4, 1.8]]) {
    const c = new THREE.Group(); c.position.set(x, 0, z); R.g.add(c);
    lathe(c, [[0.001, 0], [0.15, 0], [0.05, 0.1], [0.03, 1.0], [0.1, 1.05], [0.001, 1.05]], BRASS, 0, 0, 0, 16);
    cyl(c, 0.03, 0.03, 0.18, M(0xf0e8d8, 0.7), 0, 1.14, 0, 10);
    sph(c, 0.018, M(0xffffff, 0.3, 0, { emissive: 0xffa040, emissiveIntensity: 2 }), 0, 1.25, 0, 8).userData.nocast = 1;
  }
  door(R, 0, 3.9, null, 'exit_star', [0, 0], { metal: 1 });
  lamps(R, [0, 2.4, 0.5, 0xffc890, 12, 9], [0, 1.6, -0.8, 0xffd8a0, 5, 4]);
  return R;
}

// ---------- Upstairs: the guest wing ----------
function buildWing() {
  const R = mkRoom('wing', { p: [3, 8, 3], t: [0, 0, -5], s: 10, day: [0xffe8c8, 1.2], night: [0xffd8a0, 0.3] });
  rectRoom(R, -1.6, 1.6, -13, 2, 3.1, { floor: M(0xffffff, 0.45, 0, { t: TX.oak(), rep: [1, 5], bump: 0.01 }), wall: M(0xffffff, 0.85, 0, { t: TX.damaskRose(), bump: 0.01 }), wains: M(0xffffff, 0.5, 0, { t: TX.panel(), bump: 0.02 }), wh: 1.0 });
  struct(add(R.g, new THREE.PlaneGeometry(1.3, 14.6), M(0xffffff, 0.95, 0, { t: TX.carpetRed(), rep: [1, 8], bump: 0.01 }), 0, 0.006, -5.5)).rotation.x = -Math.PI / 2;
  for (const z of [0, -5.8, -10.8]) for (const s of [-1, 1]) sconce(R.g, s * 1.58, 2.0, z, s < 0 ? Math.PI / 2 : -Math.PI / 2);
  for (const z of [-1.5, -7.5]) { cyl(R.g, 0.006, 0.006, 0.5, BRASS, 0, 2.85, z, 6); lathe(R.g, [[0.001, 0], [0.16, 0.02], [0.2, 0.12], [0.001, 0.14]], M(0xfff0d0, 0.5, 0, { emissive: 0xffc680, emissiveIntensity: 1 }), 0, 2.45, z, 20).userData.nocast = 1; }
  door(R, -1.5, -2.6, 'Spa Suite', 'door_vsuite', [0, -2.6]);
  door(R, 1.5, -4.2, 'Suite 2', 'door_suite', [0, -4.2]);
  door(R, -1.5, -8.2, 'Linen', 'door_linen', [0, -8.2]);
  door(R, 1.5, -9.2, 'Suite 4', 'door_csuite', [0, -9.2]);
  door(R, 0, 1.95, 'Grand Staircase', 'exit_wing', [0, -5]);
  // a card hanging on Vesper's door
  const card = add(R.g, new THREE.PlaneGeometry(0.2, 0.28), new THREE.MeshStandardMaterial({ roughness: 0.9, map: T.textCanvas(160, 220, g => { g.fillStyle = '#f2ead6'; g.fillRect(0, 0, 160, 220); g.fillStyle = '#6a1a2a'; g.font = 'bold 22px Georgia'; g.textAlign = 'center'; ['VOCAL', 'REST'].forEach((l, i) => g.fillText(l, 80, 70 + i * 28)); g.font = 'italic 17px Georgia'; ['Do not knock.', 'This means you.'].forEach((l, i) => g.fillText(l, 80, 150 + i * 24)); }) }), -1.42, 1.45, -2.6);
  card.rotation.y = Math.PI / 2;
  // window seat at the end, over the lake
  skyWindow(R, 1.8, 1.9, 0, 1.75, -12.97, 0, 0x5a2a3a);
  box(R.g, 2.2, 0.45, 0.6, mat.mahog(), 0, 0.225, -12.65);
  box(R.g, 2.1, 0.12, 0.55, M(0x6a1420, 0.9, 0, { t: TX.velvet() }), 0, 0.5, -12.65);
  for (const s of [-1, 1]) { const p = sph(R.g, 0.18, M(0xd8c8a8, 0.9, 0, { t: TX.linen() }), s * 0.7, 0.66, -12.8, 14); p.scale.set(1, 0.7, 0.4); }
  hit(R.g, 0, 0.7, -12.6, 0.6, 'windowseat', 'Window seat');
  // console table with flowers
  const ct = new THREE.Group(); ct.position.set(-1.35, 0, -5.4); ct.rotation.y = Math.PI / 2; R.g.add(ct);
  box(ct, 1.0, 0.04, 0.34, mat.mahog(), 0, 0.82, 0);
  for (const s of [-1, 1]) for (const t of [-1, 1]) cyl(ct, 0.02, 0.014, 0.8, mat.mahog(), s * 0.45, 0.4, t * 0.13, 8);
  lathe(ct, [[0.001, 0], [0.06, 0], [0.09, 0.12], [0.05, 0.24], [0.06, 0.28], [0.001, 0.26]], M(0x2a4a6a, 0.2), 0, 0.84, 0, 20);
  for (let i = 0; i < 7; i++) { const a = i * 0.9; sph(ct, 0.045, M([0xc84a5a, 0xe8d8b0, 0xa83a6a][i % 3], 0.7), Math.cos(a) * 0.07, 1.16 + (i % 3) * 0.04, Math.sin(a) * 0.07, 10); }
  tag(ct, 'flowers', 'Flowers');
  // housekeeping cart
  const hc = new THREE.Group(); hc.position.set(1.15, 0, -6.4); hc.rotation.y = -Math.PI / 2; R.g.add(hc);
  box(hc, 0.9, 0.04, 0.45, IRON, 0, 0.9, 0); box(hc, 0.9, 0.04, 0.45, IRON, 0, 0.45, 0);
  for (const s of [-1, 1]) for (const t of [-1, 1]) cyl(hc, 0.012, 0.012, 0.9, IRON, s * 0.43, 0.45, t * 0.2, 6);
  for (let i = 0; i < 3; i++) box(hc, 0.3, 0.07, 0.3, M(0xece4d4, 0.95, 0, { t: TX.linen() }), -0.25 + i * 0.25, 0.51 + (i % 2) * 0.07, 0);
  tag(hc, 'cart', 'Housekeeping cart');
  // framed pictures: the 2003 build crew photo is a clue, the others are paintings
  const frame = (x, z, ry, w, h, tex, hot, name) => {
    const g = new THREE.Group(); g.position.set(x, 1.85, z); g.rotation.y = ry; R.g.add(g);
    box(g, w + 0.1, h + 0.1, 0.04, M(0xb89040, 0.3, 0.8), 0, 0, 0);
    add(g, new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ roughness: 0.6, map: tex }), 0, 0, 0.022);
    if (hot) tag(g, hot, name);
  };
  frame(1.56, -1.2, -Math.PI / 2, 0.8, 0.55, T.textCanvas(320, 220, g => {
    g.fillStyle = '#b8a888'; g.fillRect(0, 0, 320, 220); const gr = g.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, '#d8ccb0'); gr.addColorStop(1, '#8a7c62'); g.fillStyle = gr; g.fillRect(10, 10, 300, 160);
    g.strokeStyle = '#4a3e2e'; g.lineWidth = 2; g.beginPath(); g.arc(160, 150, 110, Math.PI, 0); g.stroke(); for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(160, 40); g.lineTo(50 + i * 44, 150); g.stroke(); }
    g.fillStyle = '#3a2e22'; for (let i = 0; i < 4; i++) { const x = 70 + i * 60; g.beginPath(); g.arc(x, 110, 11, 0, 7); g.fill(); g.fillRect(x - 14, 122, 28, 48); g.fillStyle = '#d8b460'; g.beginPath(); g.arc(x - 6, 132, 3, 0, 7); g.fill(); g.fillStyle = '#3a2e22'; }
    g.fillStyle = '#2a2018'; g.font = 'italic 15px Georgia'; g.textAlign = 'center'; g.fillText('The build crew, June 2003', 160, 200);
  }), 'crewphoto', 'Old photograph');
  frame(-1.56, -5.4, Math.PI / 2, 0.9, 0.6, T.sky(false), null);
  frame(1.56, -11.4, -Math.PI / 2, 0.7, 0.5, T.starDome(true), null);
  lamps(R, [0, 2.6, -2, 0xffd8a8, 8, 9], [0, 2.6, -9, 0xffd8a8, 8, 9]);
  return R;
}

/// ---------- Outside: the lakeside terrace ----------
// Textures and helpers (prefix ter). Everything static is baked: geometry is merged per material (terBake) so the whole
// garden costs a few dozen draw calls.
const terSm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const terHash = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };

function terPaveTex() {   // flagstones in running bond, each its own tone
  const S = 512, rows = 10, rh = S / rows, N = T.fbm(S, S, { scale: 8, oct: 4, seed: 71 }), r = T.rng(72);
  const pal = ['#b3a995', '#a9a090', '#bab09d', '#9e9688', '#b5aa94', '#a8a193'].map(T.hexRGB);
  const RD = [];
  for (let j = 0; j < rows; j++) {
    const k = 7 + (j % 2), w = Array.from({ length: k }, () => 0.7 + r() * 0.6), tot = w.reduce((a, b) => a + b, 0);
    RD.push({ k, off: r() * S, w: w.map(v => v / tot * S), col: w.map(() => { const k = 0.93 + r() * 0.12; return pal[Math.floor(r() * pal.length)].map(c => c * k); }) });
  }
  return T.done(T.pix(S, S, (x, y) => {
    const j = Math.floor(y / rh), ly = y - j * rh, R = RD[j];
    let rx = (x - R.off) % S; if (rx < 0) rx += S;
    let acc = 0, i = 0; while (i < R.k - 1 && rx >= acc + R.w[i]) { acc += R.w[i]; i++; }
    const lx = rx - acc, e = Math.min(ly, rh - ly, lx, R.w[i] - lx), n = N[y * S + x];
    if (e < 2.2) return [70, 65, 54, 0.1];
    const c = R.col[i], sh = (0.88 + n * 0.28) * (e < 5 ? 0.9 + e * 0.02 : 1) * (0.97 + terHash(x, y) * 0.06);
    return [c[0] * sh, c[1] * sh, c[2] * sh, 0.75 + n * 0.1 - (e < 5 ? 0.15 : 0)];
  }));
}
function terGrassTex() {   // mown stripes, blade speckle, a little colour drift
  const S = 512, A = T.fbm(S, S, { scale: 5, oct: 4, seed: 81 }), B = T.fbm(S, S, { scale: 48, oct: 2, seed: 82 });
  const g1 = T.hexRGB('#436228'), g2 = T.hexRGB('#778f3e');
  return T.done(T.pix(S, S, (x, y) => {
    const a = A[y * S + x], b = B[y * S + x], t = terSm(0.35, 0.7, a), stripe = y < S / 2 ? 1.06 : 0.92;
    const k = (0.8 + b * 0.42) * stripe * (b > 0.8 ? 0.82 : 1);
    return [(g1[0] + (g2[0] - g1[0]) * t) * k, (g1[1] + (g2[1] - g1[1]) * t) * k, (g1[2] + (g2[2] - g1[2]) * t) * k, b];
  }));
}
function terPatchTex() {   // big soft patches laid over the lawn: sun-dried yellow and shade
  const S = 512, N = T.fbm(S, S, { scale: 4, oct: 4, seed: 91 }), N2 = T.fbm(S, S, { scale: 6, oct: 3, seed: 92 });
  const c = T.canvas(S, S), g = c.getContext('2d'), im = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const dry = terSm(0.52, 0.72, N[i]) * 0.5, dark = terSm(0.56, 0.74, N2[i]) * 0.5, a = Math.max(dry, dark), col = dry >= dark ? [158, 146, 74] : [22, 40, 20];
    im.data[i * 4] = col[0]; im.data[i * 4 + 1] = col[1]; im.data[i * 4 + 2] = col[2]; im.data[i * 4 + 3] = a * 255;
  }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function terGravelTex() {
  const S = 256, N = T.fbm(S, S, { scale: 10, oct: 3, seed: 61 });
  return T.done(T.pix(S, S, (x, y) => {
    const h = terHash(x * 0.7, y * 0.7), h2 = terHash(x + 40, y + 7), k = 0.72 + N[y * S + x] * 0.3 + (h > 0.85 ? 0.25 : 0) - (h2 > 0.9 ? 0.25 : 0);
    return [168 * k, 156 * k, 134 * k, 0.4 + h * 0.5];
  }));
}
function terSidingTex() {   // faded painted clapboard
  const S = 512, bh = 64, N = T.fbm(S, S, { scale: 4, oct: 5, seed: 101 }), r = T.rng(102);
  const base = T.hexRGB('#8c9a90'), raw = T.hexRGB('#a89d88'), tint = Array.from({ length: S / bh }, () => 0.9 + r() * 0.18);
  return T.done(T.pix(S, S, (x, y) => {
    const b = Math.floor(y / bh), ly = y - b * bh, n = N[y * S + x];
    const sh = ly < 5 ? 0.62 + ly * 0.07 : ly > bh - 9 ? 0.78 : 1.02 - (ly / bh) * 0.12;
    const bare = terSm(0.58, 0.74, n), seam = ((x + b * 157) % 311) < 2 ? 0.6 : 1;
    const c = base.map((v, i) => (v * (1 - bare) + raw[i] * bare) * tint[b] * (0.93 + n * 0.12));
    return [c[0] * sh * seam, c[1] * sh * seam, c[2] * sh * seam, ly < 5 ? 0.2 : ly > bh - 9 ? 0.4 : 0.7];
  }));
}
function terShingleTex() {   // rows stack along u: laid on a slab whose x runs up the slope
  const S = 256, row = 32, N = T.fbm(S, S, { scale: 6, oct: 3, seed: 112 });
  const pal = ['#4b4239', '#3f3830', '#564a3d', '#463d34', '#51473a'].map(T.hexRGB);
  return T.done(T.pix(S, S, (x, y) => {
    const j = Math.floor(x / row), lx = x - j * row, off = (j * 13) % 32, yy = (y + off) % S, k = Math.floor(yy / 32), ly = yy % 32;
    const c = pal[(j * 7 + k * 3) % 5], v = 0.88 + terHash(j, k) * 0.24, n = N[y * S + x];
    const sh = (lx > row - 5 ? 0.5 + (row - lx) * 0.1 : 1) * (ly < 1.5 ? 0.45 : 1) * (0.9 + n * 0.2) * v;
    return [c[0] * sh, c[1] * sh, c[2] * sh, lx > row - 5 ? 0.2 : ly < 1.5 ? 0.15 : 0.7];
  }));
}
function terAshlarTex() {   // limestone courses with weather streaks
  const S = 512, rows = 8, rh = S / rows, N = T.fbm(S, S, { scale: 6, oct: 4, seed: 121 }), St = T.fbm(S, S, { scale: 3, oct: 3, seed: 122, sx: 7, sy: 1 });
  const B = T.hexRGB('#d3c9b0'), r = T.rng(123), tint = Array.from({ length: 64 }, () => 0.9 + r() * 0.16);
  return T.done(T.pix(S, S, (x, y) => {
    const j = Math.floor(y / rh), ly = y - j * rh, off = (j % 2) * 64, lx = (x + off) % 128, bi = Math.floor(((x + off) % S) / 128) + j * 4;
    const e = Math.min(ly, rh - ly, lx, 128 - lx), n = N[y * S + x], st = St[y * S + x];
    if (e < 2) return [96, 88, 74, 0.1];
    const k = tint[bi % 64] * (0.88 + n * 0.22) * (1 - Math.max(0, st - 0.55) * 0.55) * (e < 5 ? 0.92 : 1);
    return [B[0] * k, B[1] * k, B[2] * k, 0.7 + n * 0.15 - (e < 5 ? 0.2 : 0)];
  }));
}
function terLeafTex() {
  const S = 256, N = T.fbm(S, S, { scale: 22, oct: 2, seed: 131 }), N2 = T.fbm(S, S, { scale: 5, oct: 3, seed: 132 });
  return T.done(T.pix(S, S, (x, y) => { const k = 0.55 + N[y * S + x] * 0.85, d = 0.85 + N2[y * S + x] * 0.3; return [118 * k * d, 148 * k * d, 70 * k * d, N[y * S + x]]; }));
}
function terWaterTex() {
  const S = 256, A = T.fbm(S, S, { scale: 3, oct: 4, seed: 141, sx: 1, sy: 7 }), B = T.fbm(S, S, { scale: 5, oct: 3, seed: 142, sx: 2, sy: 9 });
  return T.done(T.pix(S, S, (x, y) => { const a = A[y * S + x], b = B[y * S + x], k = 0.82 + a * 0.3 + (b > 0.66 ? 0.14 : 0); return [235 * k, 240 * k, 238 * k, 0.3 + a * 0.4 + b * 0.3]; }));
}
function terBirchTex() {
  const S = 128, N = T.fbm(S, S, { scale: 4, oct: 3, seed: 151 }), r = T.rng(152), marks = Array.from({ length: 16 }, () => [r() * S, r() * S, 6 + r() * 22, 2 + r() * 5]);
  return T.done(T.pix(S, S, (x, y) => {
    let k = 0.86 + N[y * S + x] * 0.2, d = 0;
    for (const [mx, my, mw, mh] of marks) { const dx = Math.min(Math.abs(x - mx), S - Math.abs(x - mx)), dy = Math.min(Math.abs(y - my), S - Math.abs(y - my)); if (dx < mw && dy < mh * (1 - dx / mw * 0.5)) d = 1; }
    const v = d ? 0.3 + N[y * S + x] * 0.25 : k;
    return [236 * v, 232 * v, 220 * v, d ? 0.2 : 0.7];
  }));
}
function terReedTex() {
  const t = T.textCanvas(128, 256, g => {
    const r = T.rng(161);
    for (let i = 0; i < 26; i++) {
      const x0 = 14 + r() * 100, lean = (r() - 0.5) * 50, h = 120 + r() * 130;
      g.strokeStyle = ['#5d7a3a', '#6f8c42', '#8a9a4a', '#a39a58', '#4c6a34'][Math.floor(r() * 5)]; g.lineWidth = 2 + r() * 2.5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, 256); g.quadraticCurveTo(x0 + lean * 0.3, 256 - h * 0.55, x0 + lean, 256 - h); g.stroke();
      if (i % 9 === 0) { g.strokeStyle = '#5a3a22'; g.lineWidth = 7; g.beginPath(); g.moveTo(x0 + lean * 0.9, 256 - h + 6); g.lineTo(x0 + lean, 256 - h - 24); g.stroke(); }
    }
  });
  return t;
}
function terPoolTex(rgb) {
  return T.textCanvas(128, 128, g => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.35, `rgba(${rgb},.45)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
}

// merge static pieces per material
function terUV(geo, su, sv) { const u = geo.attributes.uv; if (u) for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * su, u.getY(i) * sv); return geo; }
function terBake() {
  const mats = new Map(), o = new THREE.Object3D(); o.rotation.order = 'YXZ';
  return {
    add(geo, m, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) {
      o.position.set(x, y, z); o.rotation.set(rx, ry, rz); if (Array.isArray(s)) o.scale.set(s[0], s[1], s[2]); else o.scale.setScalar(s);
      o.updateMatrix();
      const g = geo.index ? geo.toNonIndexed() : geo; g.applyMatrix4(o.matrix);
      if (!mats.has(m)) mats.set(m, []); mats.get(m).push(g);
    },
    box(w, h, d, m, x, y, z, ry = 0, tile = 0, rx = 0, rz = 0) {
      const g = new THREE.BoxGeometry(w, h, d); if (tile) terUV(g, Math.max(w, d) / tile, Math.max(h, Math.min(w, d)) / tile);
      this.add(g, m, x, y, z, ry, rx, rz);
    },
    lathe(pts, m, x, y, z, seg = 12, s = 1) { this.add(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg), m, x, y, z, 0, 0, 0, s); },
    cyl(rt, rb, h, m, x, y, z, seg = 12, ry = 0, rx = 0, rz = 0) { this.add(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z, ry, rx, rz); },
    sph(r, m, x, y, z, s = 1, seg = 8) { this.add(new THREE.SphereGeometry(r, seg, Math.max(3, seg - 2)), m, x, y, z, 0, 0, 0, s); },
    flush(parent, { nocast = false } = {}) {
      const out = [];
      for (const [m, list] of mats) {
        let n = 0; for (const g of list) n += g.attributes.position.count;
        const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2); let i = 0;
        for (const g of list) { P.set(g.attributes.position.array, i * 3); N.set(g.attributes.normal.array, i * 3); if (g.attributes.uv) U.set(g.attributes.uv.array, i * 2); i += g.attributes.position.count; g.dispose(); }
        const G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.BufferAttribute(P, 3)); G.setAttribute('normal', new THREE.BufferAttribute(N, 3)); G.setAttribute('uv', new THREE.BufferAttribute(U, 2));
        const mesh = new THREE.Mesh(G, m); if (nocast) mesh.userData.nocast = 1; parent.add(mesh); out.push(mesh);
      }
      mats.clear(); return out;
    },
  };
}
const terTube = (pts, r, seg = 12, rad = 5) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2]))), seg, r, rad, false);
function terArch(w, h) {   // an arched opening outline, base on y=0
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(-w / 2, h - w / 2); s.absarc(0, h - w / 2, w / 2, Math.PI, 0, true); s.lineTo(w / 2, 0); s.closePath(); return s;
}

function buildTerrace() {
  const R = mkRoom('terrace', { p: [-14, 20, -6], t: [0, 0, -4], s: 22, day: [0xffe8c8, 2.6], night: [0x9aaad8, 0.8] });
  R.outdoor = true;
  const b = terBake(), rr = T.rng(171), DEG = Math.PI / 180;
  const tex = (k, f) => once(k, f);
  // ----- materials -----
  const mPave = M(0xffffff, 0.86, 0, { t: tex('tPave', terPaveTex), rep: [5, 3.4], bump: 0.05 });
  const mPaveB = M(0xe2dac8, 0.86, 0, { t: tex('tPave', terPaveTex), bump: 0.05 });
  const mGravel = M(0xffffff, 0.95, 0, { t: tex('tGravel', terGravelTex), bump: 0.06 });
  const mBank = M(0xe8dfc8, 0.95, 0, { t: tex('tGravel', terGravelTex), bump: 0.08 });
  const mStone = M(0xf2ebdc, 0.8, 0, { t: TX.stone(), bump: 0.03 });
  const mRock = M(0xb4aea0, 0.9, 0, { t: TX.stone(), bump: 0.06 });
  const mTrim = M(0xffffff, 0.7, 0, { t: tex('tTrim', () => T.plaster({ base: '#e9e2d0', seed: 19 })), bump: 0.01 });
  const mAshlar = M(0xffffff, 0.85, 0, { t: tex('tAsh', terAshlarTex), rep: [16, 2.1], bump: 0.05 });
  const mSlate = M(0x4a4c54, 0.65, 0.1);
  const lampM = M(0xfff0c8, 0.3, 0, { emissive: 0xffc070, emissiveIntensity: 0.3 });
  const mLeaf = (c) => M(c, 0.95, 0, { t: tex('tLeaf', terLeafTex), bump: 0.06 });
  const mHedge = mLeaf(0x5d7a48), mBush = mLeaf(0x6c8c46), mPine1 = mLeaf(0x3a5c34), mPine2 = mLeaf(0x466a3a), mBirchA = mLeaf(0xd4d070), mBirchB = mLeaf(0xa8c060);
  const mSoil = M(0x3a2a1c, 0.98), mBark = M(0x4a3626, 0.95), mBirch = M(0xffffff, 0.8, 0, { t: tex('tBirch', terBirchTex), bump: 0.04 });
  const flw = c => M(c, 0.7), FL = { red: flw(0xb53a42), pink: flw(0xd97ca2), yellow: flw(0xe2b62e), purple: flw(0x7c4ca2), white: flw(0xece6d8), orange: flw(0xd4722c) };
  const mOak = mat.oak();

  // ----- ground: lawn (mown stripes + patches), terrace paving, paths, shore -----
  struct(add(R.g, new THREE.PlaneGeometry(200, 120), M(0xffffff, 0.95, 0, { t: tex('tGrass', terGrassTex), rep: [53, 32], bump: 0.05 }), 0, -0.01, 45.8)).rotation.x = -Math.PI / 2;
  const patches = add(R.g, new THREE.PlaneGeometry(110, 110), new THREE.MeshStandardMaterial({ map: tex('tPatch', terPatchTex), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 0, -0.005, 28);
  patches.rotation.x = -Math.PI / 2; patches.userData.nocast = 1; patches.renderOrder = 1;
  struct(add(R.g, new THREE.PlaneGeometry(18, 12), mPave, 0, 0.01, 2)).rotation.x = -Math.PI / 2;
  const flat = (w, d, m, x, y, z, ry = 0, tile = 3.6) => b.add(terUV(new THREE.PlaneGeometry(w, d), w / tile, d / tile), m, x, y, z, ry, -Math.PI / 2);
  flat(18, 0.7, mPaveB, 0, 0.013, -3.65); flat(18, 0.7, mPaveB, 0, 0.013, 7.65); flat(0.7, 10.6, mPaveB, -8.65, 0.013, 2); flat(0.7, 10.6, mPaveB, 8.65, 0.013, 2);
  // paths run along the two walking lines (E1 to E2, E1 to E3) so nothing stands in the way
  const frame = (x0, z0, x1, z1) => { const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz); return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, l, dx: dx / l, dz: dz / l, nx: -dz / l, nz: dx / l, ry: Math.atan2(-dx, -dz) }; };
  const P1 = frame(1.1, -4.0, 2.23, -10.9), P2 = frame(-3.4, -4.0, -8.3, -12.3);
  const path = (F, w, y) => { flat(w, F.l, mGravel, F.cx, y, F.cz, F.ry, 1.6); for (const s of [-1, 1]) b.box(0.1, 0.07, F.l - (F === P2 ? 1.8 : 0), mStone, F.cx + F.nx * s * (w / 2 + 0.03) - (F === P2 ? F.dx * 0.9 : 0), 0.03, F.cz + F.nz * s * (w / 2 + 0.03) - (F === P2 ? F.dz * 0.9 : 0), F.ry, 0); };
  path(P1, 2.4, 0.006); path(P2, 2.0, 0.006);
  flat(3.4, 1.7, mGravel, 2.7, 0.007, -10.7, 0, 1.6);
  flat(3.6, 2.2, mGravel, -8.2, 0.007, -12.08, 0.6202, 1.6);
  // the shore: a bank that slides under the water, rocks and reeds
  const bank = add(R.g, terUV(new THREE.PlaneGeometry(200, 1.65), 125, 1), mBank, 0, -0.215, -15.0); bank.rotation.x = -Math.PI / 2 - 0.251; bank.userData.nocast = 1;
  for (let x = -30; x <= 30; x += 0.7 + rr() * 0.8) {
    if ((x > 2.4 && x < 5.6) || (x > -13.5 && x < -6.5)) continue;
    for (let k = 0, n = 1 + (rr() < 0.45 ? 1 : 0); k < n; k++) { const s = 0.06 + rr() * 0.16; b.add(new THREE.IcosahedronGeometry(1, 1), mRock, x + rr() * 0.6, -0.2 + s * 0.15, -14.4 - rr() * 1.1, rr() * 6, 0, 0, [s * 1.3, s * 0.7, s]); }
  }
  const reedM = new THREE.MeshStandardMaterial({ map: tex('tReed', terReedTex), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
  for (const x of [-22, -17, -15.5, -6.2, -5.4, -2.6, -1.7, 0.3, 7, 7.8, 9.4, 13, 16.5, 21]) for (let k = 0; k < 2; k++) {
    const z = -15.1 - rr() * 0.7, s = 0.8 + rr() * 0.6; b.add(new THREE.PlaneGeometry(1.1 * s, 1.5 * s), reedM, x + k * 0.2, 0.3 + s * 0.1, z, k * 1.2 + rr() * 0.5);
  }
  // the lake: dark blue-green, paler towards the far shore, slow ripples
  const wg = new THREE.PlaneGeometry(200, 65, 1, 13); wg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(wg.attributes.position.count * 3), 3));
  const waterM = M(0xffffff, 0.2, 0.05, { t: tex('tWater', terWaterTex), rep: [44, 13], bump: 0.07, vertexColors: true });
  const water = struct(add(R.g, wg, waterM, 0, -0.35, -46.5)); water.rotation.x = -Math.PI / 2; water.userData.nocast = 1;
  const wcols = (n) => {
    const A = T.hexRGB(n ? "#0e1c2a" : "#173a40"), B = T.hexRGB(n ? "#2a3658" : "#5f8790"), col = wg.attributes.color;
    for (let i = 0; i < col.count; i++) { const f = Math.pow(1 - Math.floor(i / 2) / 13, 1.4); col.setXYZ(i, (A[0] + (B[0] - A[0]) * f) / 255, (A[1] + (B[1] - A[1]) * f) / 255, (A[2] + (B[2] - A[2]) * f) / 255); }
    col.needsUpdate = true;
  };
  let wasNight = null;
  updaters.push((dt, t) => {
    if (!R.g.visible) return;
    waterM.map.offset.x = t * 0.0035; waterM.bumpMap.offset.set(t * 0.003, -t * 0.0045);
    const n = night(); if (n !== wasNight) { wasNight = n; wcols(n); }
  });

  // ----- balustrade with newel posts, open for the three paths -----
  const BAL = [[-9, -4, -4.4, -4], [-2.4, -4, -1.4, -4], [1.4, -4, 9, -4], [-9, -4, -9, 7], [9, -4, 9, 7]];
  for (const [x0, z0, x1, z1] of BAL) {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0), n = Math.round(len / 0.3), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    b.box(0.26, 0.1, len, mStone, cx, 0.1, cz, ang, 1.5); b.box(0.3, 0.07, len, mStone, cx, 0.035, cz, ang, 1.5);
    b.box(0.25, 0.1, len, mStone, cx, 0.87, cz, ang, 1.5); b.box(0.31, 0.05, len, mStone, cx, 0.945, cz, ang, 1.5);
    for (let i = 1; i < n; i++) { const t = i / n; b.lathe([[0.001, 0], [0.06, 0], [0.06, 0.04], [0.04, 0.1], [0.032, 0.16], [0.07, 0.33], [0.075, 0.37], [0.04, 0.45], [0.04, 0.55], [0.06, 0.62], [0.001, 0.62]], mStone, x0 + (x1 - x0) * t, 0.15, z0 + (z1 - z0) * t, 10); }
  }
  for (const [x, z] of [[-9, -4], [-4.4, -4], [-2.4, -4], [-1.4, -4], [1.4, -4], [4.6, -4], [9, -4], [-9, 1.5], [9, 1.5], [-9, 7], [9, 7]]) {
    b.box(0.36, 1.0, 0.36, mStone, x, 0.5, z, 0, 1.5); b.box(0.44, 0.08, 0.44, mStone, x, 1.04, z, 0, 1.5); b.box(0.3, 0.1, 0.3, mStone, x, 0.12, z, 0, 1.5);
    b.add(new THREE.SphereGeometry(0.13, 10, 8), mStone, x, 1.2, z); b.cyl(0.07, 0.1, 0.08, mStone, x, 1.12, z, 10);
  }

  // ----- lamp posts (lit at night, with pools of light) -----
  const poolM = new THREE.MeshBasicMaterial({ map: terPoolTex('255,196,120'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 });
  const pools = [];
  const LAMPS = [[-8.6, -3.6], [8.6, -3.6], [-1.8, -4.2], [1.8, -4.2], [2.75, -10.2]];
  for (const [x, z] of LAMPS) {
    b.lathe([[0.001, 0], [0.21, 0], [0.21, 0.08], [0.16, 0.14], [0.12, 0.26], [0.1, 0.42], [0.06, 0.55], [0.045, 0.7], [0.045, 2.3], [0.07, 2.36], [0.07, 2.42], [0.05, 2.46], [0.06, 2.5], [0.001, 2.5]], IRON, x, 0, z, 14);
    b.box(0.3, 0.04, 0.3, IRON, x, 2.52, z); b.box(0.24, 0.36, 0.24, lampM, x, 2.72, z);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.03, 0.4, 0.03, IRON, x + sx * 0.125, 2.72, z + sz * 0.125);
    b.lathe([[0.001, 2.92], [0.26, 2.9], [0.2, 2.97], [0.1, 3.08], [0.04, 3.15], [0.001, 3.2]], IRON, x, 0, z, 8); b.sph(0.04, IRON, x, 3.22, z);
    const p = add(R.g, new THREE.PlaneGeometry(4.6, 4.6), poolM, x, 0.03, z); p.rotation.x = -Math.PI / 2; p.userData.nocast = 1; p.renderOrder = 2; pools.push(p);
  }
  const poolB = poolM.clone(), poolC = poolM.clone(); poolB.opacity = poolC.opacity = 0;
  updaters.push(() => { if (!R.g.visible) return; const n = night(); lampM.emissiveIntensity = n ? 2.4 : 0.35; poolM.opacity = n ? 0.62 : 0; poolB.opacity = n ? 0.3 : 0; poolC.opacity = n ? 0.16 : 0; });

  // ----- planters, beds, hedges, trees -----
  const bloom = (cx, cz, y, lx, lz, ry, c, r0 = 0.05) => { const co = Math.cos(ry), si = Math.sin(ry); b.sph(r0 + rr() * 0.025, c, cx + lx * co + lz * si, y, cz - lx * si + lz * co, 1, 6); };
  const urn = (x, z, s, pal) => {
    b.lathe([[0.001, 0], [0.26, 0], [0.26, 0.06], [0.2, 0.12], [0.18, 0.2], [0.28, 0.42], [0.34, 0.58], [0.36, 0.64], [0.33, 0.66], [0.3, 0.64], [0.001, 0.6]], mStone, x, 0, z, 16, s);
    b.cyl(0.3 * s, 0.3 * s, 0.03, mSoil, x, 0.62 * s, z, 12);
    for (let i = 0; i < 6; i++) { const a = i * 1.05; b.add(new THREE.SphereGeometry(0.2, 7, 5), mBush, x + Math.cos(a) * 0.14 * s, 0.76 * s, z + Math.sin(a) * 0.14 * s, 0, 0, 0, [s, 0.75 * s, s]); }
    for (let i = 0; i < 16; i++) { const a = rr() * 6.28, d = rr() * 0.26 * s; b.sph(0.05 * s, FL[pal[i % pal.length]], x + Math.cos(a) * d, (0.8 + (0.26 * s - d) * 0.55) * s, z + Math.sin(a) * d, 1, 6); }
  };
  for (const [x, z, s, p] of [[-6, -3.2, 1.15, ['red', 'white']], [6, -3.2, 1.15, ['red', 'white']], [-8.3, 5.5, 1.15, ['pink', 'white']], [8.3, 5.5, 1.15, ['pink', 'white']], [-4.9, 5.4, 1.0, ['yellow', 'orange']], [4.9, 5.4, 1.0, ['yellow', 'orange']]]) urn(x, z, s, p);
  const bed = (cx, cz, w, d, ry, pal) => {
    const co = Math.cos(ry), si = Math.sin(ry);
    b.box(w, 0.14, d, mSoil, cx, 0.06, cz, ry, 0);
    for (const [ew, ed, ex, ez] of [[w + 0.12, 0.1, 0, d / 2], [w + 0.12, 0.1, 0, -d / 2], [0.1, d, w / 2, 0], [0.1, d, -w / 2, 0]]) b.box(ew, 0.14, ed, mStone, cx + ex * co + ez * si, 0.07, cz - ex * si + ez * co, ry, 1.5);
    for (let i = 0, n = Math.ceil(w * d / 0.2); i < n; i++) { const lx = (rr() - 0.5) * (w - 0.25), lz = (rr() - 0.5) * (d - 0.25); b.add(new THREE.SphereGeometry(0.17 + rr() * 0.08, 7, 5), mBush, cx + lx * co + lz * si, 0.19, cz - lx * si + lz * co, 0, 0, 0, [1, 0.7, 1]); }
    for (let i = 0, n = Math.ceil(w * d * 40); i < n; i++) bloom(cx, cz, 0.26 + rr() * 0.14, (rr() - 0.5) * (w - 0.15), (rr() - 0.5) * (d - 0.15), ry, FL[pal[i % pal.length]]);
  };
  const along = (F, t, off) => [F.cx - F.dx * F.l / 2 + F.dx * t + F.nx * off, F.cz - F.dz * F.l / 2 + F.dz * t + F.nz * off];
  // beds beside the main path and under the balustrade, clipped hedges and topiary leading to the lake
  for (const s of [-1, 1]) {
    const [hx, hz] = along(P1, 3.3, s * 1.75); b.box(0.75, 0.9, 4.6, mHedge, hx, 0.45, hz, P1.ry, 1.2); b.box(0.6, 0.12, 4.5, mHedge, hx, 0.94, hz, P1.ry, 1.2);
    const [tx, tz] = along(P1, 0.6, s * 1.75); b.cyl(0.15, 0.2, 0.5, mStone, tx, 0.25, tz, 10); b.sph(0.36, mHedge, tx, 0.86, tz, 1, 10);
    const [qx, qz] = along(P1, 6.1, s * 1.75); b.cyl(0.15, 0.2, 0.5, mStone, qx, 0.25, qz, 10); b.sph(0.36, mHedge, qx, 0.86, qz, 1, 10);
  }
  bed(-1.3, -7.9, 1.3, 3.0, P1.ry, ['red', 'yellow', 'purple']); bed(4.9, -7.0, 1.3, 3.0, P1.ry, ['pink', 'white', 'purple']);
  bed(-6.9, -4.9, 3.0, 0.8, 0, ['yellow', 'orange', 'red']); bed(6.9, -4.9, 3.0, 0.8, 0, ['pink', 'white', 'yellow']);
  bed(-9.3, -8.0, 1.2, 2.4, 0.5, ['white', 'purple', 'pink']); bed(6.0, 9.0, 3.0, 0.9, 0, ['red', 'yellow', 'white']); bed(-6.0, 9.0, 3.0, 0.9, 0, ['purple', 'pink', 'white']);
  bed(9.6, 12.5, 1.2, 3, 0.3, ['yellow', 'orange', 'red']); bed(-9.6, 12.5, 1.2, 3, -0.3, ['pink', 'white', 'purple']);
  const pine = (x, z, h) => {
    b.cyl(0.07 * h / 6, 0.14 * h / 6, h * 0.3, mBark, x, h * 0.15, z, 7);
    for (let i = 0; i < 6; i++) { const r = h * 0.2 * (1 - i * 0.14), hh = h * 0.27; b.add(new THREE.ConeGeometry(r, hh, 11), i % 2 ? mPine1 : mPine2, x, h * (0.2 + i * 0.125) + hh / 2, z, rr() * 6, 0, 0, [1, 1, 1]); }
  };
  const birch = (x, z, h, lean) => {
    b.add(new THREE.CylinderGeometry(0.05 * h / 5, 0.1 * h / 5, h * 0.72, 8), mBirch, x - lean * h * 0.18, h * 0.36, z, 0, 0, lean);
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + rr(); b.add(new THREE.CylinderGeometry(0.015, 0.03, h * 0.3, 5), mBirch, x + Math.cos(a) * h * 0.09, h * (0.55 + i * 0.06), z + Math.sin(a) * h * 0.09, 0, Math.sin(a) * 0.55, Math.cos(a) * 0.55); }
    for (let i = 0; i < 26; i++) { const a = i * 2.4, v = (i % 7) / 6, d = h * (0.05 + Math.sin(v * 3.1) * 0.13) * (0.5 + (i % 3) * 0.3); b.add(new THREE.SphereGeometry(h * (0.05 + rr() * 0.04), 8, 6), i % 2 ? mBirchA : mBirchB, x + Math.cos(a) * d, h * (0.5 + v * 0.45), z + Math.sin(a) * d, rr() * 6, 0, 0, [1.2, 0.8, 1.2]); }
  };
  for (const [x, z, h] of [[-14.5, -1.5, 7.5], [-16.5, 3, 9], [-13.5, 7.5, 6.5], [14.5, -2, 8], [16.5, 2.5, 6.5], [14, 8, 8.5], [-15, 14, 9.5], [15, 15, 9], [-19, -4, 8.5], [19, -3, 9], [21, 5, 7.5]]) pine(x, z, h);
  for (const [x, z, h, l] of [[-14.2, -10, 6, 0.05], [-12.6, -11.6, 5, -0.06], [9.6, -12.4, 5.5, 0.04], [12.3, -8.2, 6.2, -0.05], [11.5, -11, 4.6, 0.07], [-8.2, 9.8, 5, 0.03]]) birch(x, z, h, l);

  // ----- benches (the first is the one to inspect) -----
  const bench = (x, z, ry, tagged) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; R.g.add(g);
    const bb = terBake();
    for (let i = 0; i < 4; i++) bb.box(1.6, 0.03, 0.09, mOak, 0, 0.45, -0.18 + i * 0.12);
    for (let i = 0; i < 3; i++) bb.box(1.6, 0.09, 0.03, mOak, 0, 0.64 + i * 0.12, -0.27 - i * 0.03, 0, 0, -0.18);
    for (const s of [-1, 1]) {
      bb.box(0.04, 0.45, 0.04, IRON, s * 0.72, 0.225, 0.2); bb.box(0.04, 0.95, 0.04, IRON, s * 0.72, 0.47, -0.27, 0, 0, -0.14);
      bb.box(0.04, 0.04, 0.55, IRON, s * 0.72, 0.43, -0.03); bb.box(0.04, 0.04, 0.5, IRON, s * 0.72, 0.68, -0.05);
      bb.add(new THREE.TorusGeometry(0.075, 0.014, 6, 14, Math.PI * 1.5), IRON, s * 0.72, 0.6, 0.2, Math.PI / 2, 0, 0.8); bb.box(0.06, 0.03, 0.12, IRON, s * 0.72, 0.015, 0.2);
    }
    bb.flush(g, { nocast: false }); if (tagged) tag(g, 'tbench', 'Bench'); return g;
  };
  bench(-4.5, 1.5, 0.3, true); bench(4.5, 1.5, -0.3, false);

  // ----- the dock, with posts and rope, a life ring and the rowboat -----
  const mDeck = M(0xffffff, 0.88, 0, { t: tex('tDeck', () => T.wood({ base: '#7f6f5a', dark: '#3b3228', planks: 6, seed: 23 })), bump: 0.04 });
  const mPost = M(0x4a3c2e, 0.92, 0, { t: TX.oak(), bump: 0.03 }), mRope = M(0xb59f72, 0.95, 0, { t: TX.cloth(), bump: 0.05 });
  b.add(terUV(new THREE.BoxGeometry(1.6, 0.08, 10.9), mDeck.map ? 1 : 1, 10.9 / 1.2), mDeck, 4, 0.02, -15.85);
  for (const s of [-1, 1]) { b.box(0.08, 0.16, 10.9, mPost, 4 + s * 0.82, -0.04, -15.85); b.box(0.12, 0.16, 10.9, mPost, 4 + s * 0.45, -0.12, -15.85); }
  const dockZ = [0, 1, 2, 3, 4, 5].map(i => -10.6 - i * 2);
  for (const z of dockZ) for (const s of [-1, 1]) { b.cyl(0.08, 0.09, 1.3, mPost, 4 + s * 0.8, -0.35, z, 8); b.cyl(0.095, 0.095, 0.04, mPost, 4 + s * 0.8, 0.31, z, 8); }
  for (const s of [-1, 1]) for (let i = 0; i < dockZ.length - 1; i++) b.add(terTube([[4 + s * 0.8, 0.27, dockZ[i]], [4 + s * 0.8, 0.14, (dockZ[i] + dockZ[i + 1]) / 2], [4 + s * 0.8, 0.27, dockZ[i + 1]]], 0.02, 10, 5), mRope);
  b.box(0.1, 0.9, 0.1, mPost, 4.75, 0.45, -20.9); b.box(0.1, 0.9, 0.1, mPost, 3.25, 0.45, -20.9);
  { // the post with the rope burn
    const g = new THREE.Group(); g.position.set(4.75, 0, -15); R.g.add(g);
    box(g, 0.14, 0.9, 0.14, mPost, 0, 0.45, 0);
    for (let i = 0; i < 4; i++) add(g, new THREE.TorusGeometry(0.1, 0.018, 6, 14), mRope, 0, 0.5 + i * 0.045, 0).rotation.x = Math.PI / 2 + (i - 1.5) * 0.06;
    add(g, terTube([[0.1, 0.55, 0], [0.2, 0.3, 0.1], [0.28, 0.06, 0.05], [0.4, 0.03, 0.12]], 0.02, 8, 5), mRope);
    tag(g, 'dockpost', 'Dock post');
  }
  { // life ring on its own post
    const x = 3.05, z = -11.6; b.box(0.1, 1.3, 0.1, mPost, x, 0.65, z); b.box(0.2, 0.05, 0.2, mPost, x, 1.32, z); b.box(0.04, 0.04, 0.12, IRON, x, 1.1, z - 0.08);
    const ring = flw(0xece6d8), red = flw(0xb02a2a);
    b.add(new THREE.TorusGeometry(0.3, 0.075, 8, 22), ring, x, 0.9, z - 0.16);
    for (let i = 0; i < 4; i++) b.add(new THREE.TorusGeometry(0.3, 0.08, 8, 6, Math.PI / 4), red, x, 0.9, z - 0.16, 0, 0, i * Math.PI / 2 + Math.PI / 8);
    b.add(terTube([[x - 0.3, 0.9, z - 0.2], [x - 0.36, 0.6, z - 0.24], [x - 0.1, 0.5, z - 0.2], [x + 0.1, 0.62, z - 0.2], [x + 0.3, 0.9, z - 0.2]], 0.012, 12, 4), mRope);
  }
  const boat = new THREE.Group(); boat.position.set(5.8, -0.28, -16); boat.rotation.y = 0.12; R.g.add(boat);
  const bp = [[0.001, -0.3], [0.45, -0.26], [0.62, 0], [0.64, 0.08]];
  lathe(boat, bp, M(0x7a3a2a, 0.55, 0, { t: TX.oak(), bump: 0.02 }), 0, 0.3, 0, 24).scale.set(0.9, 1, 2.6);
  lathe(boat, bp, M(0xd4c6a2, 0.75, 0, { side: THREE.BackSide }), 0, 0.3, 0, 24).scale.set(0.87, 0.97, 2.52);
  lathe(boat, [[0.62, 0.015], [0.645, 0.015], [0.645, 0.075], [0.62, 0.075]], M(0xe6dcc0, 0.6), 0, 0.3, 0, 24).scale.set(0.9, 1, 2.6);
  add(boat, new THREE.TorusGeometry(0.64, 0.025, 6, 32), mOak, 0, 0.385, 0).rotation.x = Math.PI / 2;
  boat.children[boat.children.length - 1].scale.set(0.9, 2.6, 1);
  for (const z of [0.7, 0, -0.7]) box(boat, 1.05, 0.04, 0.2, mOak, 0, 0.27, z);
  for (const s of [-1, 1]) { cyl(boat, 0.018, 0.018, 1.9, mOak, s * 0.3, 0.3, 0.1, 6).rotation.set(Math.PI / 2, 0, s * 0.05); box(boat, 0.1, 0.01, 0.32, mOak, s * 0.3, 0.3, 1.08); }
  add(boat, new THREE.TorusGeometry(0.1, 0.03, 6, 12), mRope, 0.1, 0.25, -0.5).rotation.x = Math.PI / 2;
  updaters.push((dt, t) => { boat.position.y = -0.28 + Math.sin(t * 1.1) * 0.025; boat.rotation.z = Math.sin(t * 0.8) * 0.03; });
  tag(boat, 'rowboat', 'Rowboat');

  // ----- the boathouse: stone footing, clapboard walls, shingled roof closed at the ridge, padlocked doors -----
  const bh = new THREE.Group(); bh.position.set(-10, 0, -14.6); faceTo(bh, -6, -9); R.g.add(bh);
  const mSide = M(0xffffff, 0.82, 0, { t: tex('tSide', terSidingTex), bump: 0.04 }), mShing = M(0xffffff, 0.8, 0, { t: tex('tShing', terShingleTex), bump: 0.06 });
  const mWhite = M(0xd9d6c6, 0.75), mDoorW = M(0xffffff, 0.8, 0, { t: tex('tDoorW', () => T.wood({ base: '#53493a', dark: '#2a231a', planks: 8, vertical: true, seed: 27 })), bump: 0.03 });
  const bb = terBake(), W = 4.6, D = 4.0, WH = 2.6, Y0 = 0.3;
  const sd = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); terUV(g, Math.max(w, d) / 2.0, h / 1.28); bb.add(g, mSide, x, y, z); };
  bb.box(W + 0.4, 0.9, D + 0.4, mStone, 0, -0.05, 0, 0, 1.5); bb.box(W + 0.5, 0.06, D + 0.5, mStone, 0, 0.43, 0, 0, 1.5);
  sd(0.12, WH, D, -W / 2 + 0.06, Y0 + WH / 2 + 0.1, 0); sd(0.12, WH, D, W / 2 - 0.06, Y0 + WH / 2 + 0.1, 0); sd(W, WH, 0.12, 0, Y0 + WH / 2 + 0.1, -D / 2 + 0.06);
  const FY = Y0 + 0.1;
  sd(1.1, WH, 0.12, -1.75, FY + WH / 2, D / 2 - 0.06); sd(1.1, WH, 0.12, 1.75, FY + WH / 2, D / 2 - 0.06); sd(2.4, 0.3, 0.12, 0, FY + WH - 0.15, D / 2 - 0.06);
  for (const z of [D / 2 - 0.06, -D / 2 + 0.06]) {   // gable triangles
    const s = new THREE.Shape(); s.moveTo(-W / 2, 0); s.lineTo(W / 2, 0); s.lineTo(0, 1.5); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false }); terUV(g, 1 / 2.0, 1 / 1.28); bb.add(g, mSide, 0, FY + WH, z - 0.06);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bb.box(0.14, WH + 0.1, 0.14, mWhite, sx * (W / 2 - 0.02), FY + WH / 2, sz * (D / 2 - 0.02));   // corner boards
  bb.box(0.14, 2.35, 0.14, mWhite, -1.27, Y0 + 1.175, D / 2 + 0.02); bb.box(0.14, 2.35, 0.14, mWhite, 1.27, Y0 + 1.175, D / 2 + 0.02); bb.box(2.7, 0.16, 0.16, mWhite, 0, Y0 + 2.4, D / 2 + 0.02); bb.box(2.5, 0.06, 0.4, mStone, 0, Y0 + 0.02, D / 2 + 0.15);
  const ra = Math.atan2(1.5, 2.3), Ls = 3.2;
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(Ls, 0.08, D + 0.5); terUV(g, Ls / 1.12, (D + 0.5) / 1.5);
    bb.add(g, mShing, s * 1.298, FY + WH + 1.5 + 0.04 - 0.847, 0, 0, 0, -s * ra);
    const f = (Ls - 0.05) * Math.cos(ra); bb.box(0.05, 0.16, D + 0.5, mWhite, s * (f + 0.02), FY + WH + 1.54 - (Ls - 0.05) * Math.sin(ra) - 0.06, 0);
  }
  bb.box(0.2, 0.2, D + 0.6, mSlate, 0, FY + WH + 1.5 + 0.08, 0, 0, 0, 0, Math.PI / 4);
  // small windows with sills and muntins, a vent in the gable
  const mGlass = M(0x1c262c, 0.1, 0.5, { emissive: 0xffc070, emissiveIntensity: 0 }); R.bhGlass = mGlass;
  for (const sx of [-1, 1]) {
    const x = sx * 1.75, y = FY + 1.45;
    bb.box(0.72, 0.8, 0.05, mGlass, x, y, D / 2 + 0.03); bb.box(0.84, 0.06, 0.06, mWhite, x, y + 0.43, D / 2 + 0.04); bb.box(0.84, 0.06, 0.1, mWhite, x, y - 0.43, D / 2 + 0.06);
    bb.box(0.06, 0.88, 0.06, mWhite, x - 0.4, y, D / 2 + 0.04); bb.box(0.06, 0.88, 0.06, mWhite, x + 0.4, y, D / 2 + 0.04); bb.box(0.04, 0.8, 0.04, mWhite, x, y, D / 2 + 0.06); bb.box(0.72, 0.04, 0.04, mWhite, x, y, D / 2 + 0.06);
  }
  bb.add(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 16), mWhite, 0, FY + WH + 0.6, D / 2 + 0.06, 0, Math.PI / 2, 0); bb.add(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 16), mGlass, 0, FY + WH + 0.6, D / 2 + 0.08, 0, Math.PI / 2, 0);
  // crates, a barrel and an oar by the door
  bb.box(0.7, 0.5, 0.5, mOak, -2.1, 0.25, D / 2 + 0.65, 0.2); bb.box(0.55, 0.4, 0.45, mOak, -2.15, 0.7, D / 2 + 0.6, -0.1);
  bb.lathe([[0.001, 0], [0.26, 0], [0.31, 0.3], [0.33, 0.5], [0.31, 0.75], [0.26, 0.9], [0.001, 0.9]], mOak, 2.15, 0, D / 2 + 0.7, 14); bb.cyl(0.325, 0.325, 0.03, IRON, 2.15, 0.28, D / 2 + 0.7, 14); bb.cyl(0.33, 0.33, 0.03, IRON, 2.15, 0.62, D / 2 + 0.7, 14);
  bb.flush(bh);
  // the double doors: planks, braces, a rusted chain and a shiny new padlock (hotspot)
  const bd = new THREE.Group(); bd.position.set(0, Y0, D / 2 + 0.02); bh.add(bd);
  const dm = (w, h, d, m, x, y, z, rz = 0) => { const o = box(bd, w, h, d, m, x, y, z); o.rotation.z = rz; return o; };
  for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(1.14, 2.28, 0.07); terUV(g, 1, 1); add(bd, g, mDoorW, s * 0.58, 1.14, 0); dm(0.12, 2.0, 0.04, mPost, s * 1.0, 1.1, 0.05); dm(1.0, 0.1, 0.04, mPost, s * 0.58, 0.45, 0.05); dm(1.0, 0.1, 0.04, mPost, s * 0.58, 1.9, 0.05); dm(1.2, 0.09, 0.04, mPost, s * 0.58, 1.17, 0.055, s * 0.62); }
  dm(0.02, 2.28, 0.075, M(0x1a140c, 0.9), 0, 1.14, 0.005);
  const rust = M(0x5c3a26, 0.85, 0.7), steel = M(0xd9d4c4, 0.22, 1);
  for (const s of [-1, 1]) add(bd, new THREE.TorusGeometry(0.06, 0.012, 6, 14), rust, s * 0.24, 1.18, 0.1);
  dm(0.7, 0.07, 0.02, rust, 0, 1.18, 0.09);
  for (let i = 0; i < 12; i++) { const t = i / 11, x = -0.3 + t * 0.6, y = 1.12 - 0.13 * (1 - Math.pow((x / 0.3), 2) * 0.0) * Math.sin(t * Math.PI); add(bd, new THREE.TorusGeometry(0.03, 0.008, 5, 8), rust, x, y, 0.13).rotation.set(0, i % 2 ? Math.PI / 2 : 0, 0.3 * Math.sin(t * Math.PI)); }
  box(bd, 0.1, 0.12, 0.05, steel, 0, 0.93, 0.13); const sh = add(bd, new THREE.TorusGeometry(0.035, 0.011, 6, 12, Math.PI), steel, 0, 0.99, 0.13); sh.rotation.z = 0;
  box(bd, 0.025, 0.025, 0.012, IRON, 0, 0.93, 0.16);
  tag(bd, 'boathouse', 'Boathouse doors');
  { const gp = add(bh, new THREE.PlaneGeometry(4.6, 4.6), poolB, 0, 0.05, D / 2 + 1.7); gp.rotation.x = -Math.PI / 2; gp.userData.nocast = 1; gp.renderOrder = 2;
    const wp2 = add(bh, new THREE.PlaneGeometry(3.0, 3.0), poolC, 0, Y0 + 2.1, D / 2 + 0.2); wp2.userData.nocast = 1; wp2.renderOrder = 2; }
  // lantern by the door and a weathervane
  { const lg = new THREE.Group(); lg.position.set(0, Y0 + 2.78, D / 2 + 0.12); bh.add(lg);
    const lb = terBake(); lb.box(0.1, 0.3, 0.03, IRON, 0, 0, 0); lb.box(0.04, 0.04, 0.2, IRON, 0, 0.1, 0.1); lb.box(0.14, 0.2, 0.14, lampM, 0, 0.02, 0.2); lb.add(new THREE.ConeGeometry(0.12, 0.1, 4), IRON, 0, 0.17, 0.2, Math.PI / 4); lb.flush(lg); }
  { const wv = new THREE.Group(); wv.position.set(0, FY + WH + 1.5 + 0.2, 0); bh.add(wv);
    cyl(wv, 0.012, 0.012, 0.75, IRON, 0, 0.37, 0, 6); sph(wv, 0.045, BRASS, 0, 0.78, 0, 8);
    for (const [ry, l] of [[0, 0.3], [Math.PI / 2, 0.3]]) box(wv, 0.02, 0.02, l * 2, IRON, 0, 0.5, 0).rotation.y = ry;
    const ar = new THREE.Group(); ar.position.y = 0.88; wv.add(ar); box(ar, 0.015, 0.012, 0.5, BRASS, 0, 0, 0); const hd = add(ar, new THREE.ConeGeometry(0.05, 0.14, 4), BRASS, 0, 0, 0.3); hd.rotation.x = Math.PI / 2; box(ar, 0.012, 0.18, 0.14, BRASS, 0, 0.04, -0.25);
    updaters.push((dt, t) => { ar.rotation.y = 0.6 + Math.sin(t * 0.35) * 0.5; }); }
  // the stone footing meets the water: a few rocks and reeds round the back
  for (let i = 0; i < 9; i++) { const a = Math.PI + 0.3 + rr() * 2.5, s = 0.12 + rr() * 0.2; b.add(new THREE.IcosahedronGeometry(1, 1), mRock, -10 + Math.cos(a) * 3.3, -0.15 + s * 0.2, -15.2 + Math.sin(a) * 2.8, rr() * 6, 0, 0, [s * 1.3, s * 0.7, s]); }

  // ----- the Aquadome from outside: ashlar drum with pilasters and arched windows, cornice, glazed dome, portico and steps -----
  const Z0 = 18, RD = 9.3, px = (a, r) => [Math.sin(a) * r, Z0 + Math.cos(a) * r];
  const dome = new THREE.Group(); dome.position.set(0, 0, Z0); R.g.add(dome);
  struct(add(dome, new THREE.CylinderGeometry(9.85, 9.95, 0.6, 72), mStone, 0, 0.3, 0));
  struct(add(dome, new THREE.CylinderGeometry(RD, RD, 6.1, 72, 1, true), mAshlar, 0, 3.65, 0));
  const mWin = M(0x2e3a42, 0.12, 0.5, { emissive: 0xffb860, emissiveIntensity: 0 }); R.winGlow = mWin;
  for (let k = 0; k < 16; k++) {   // pilasters with bases and capitals
    const a = k / 16 * Math.PI * 2; if (Math.abs(a - Math.PI) < 0.5) continue;
    const [x, z] = px(a, RD + 0.14), [x1, z1] = px(a, RD + 0.2);
    b.box(0.64, 5.4, 0.38, mTrim, x, 3.3, z, a); b.box(0.86, 0.36, 0.56, mTrim, x1, 0.78, z1, a); b.box(0.84, 0.3, 0.52, mTrim, x1, 6.15, z1, a); b.box(0.96, 0.1, 0.6, mTrim, x1, 6.37, z1, a);
  }
  for (let k = 0; k < 16; k++) {
    const a = (k + 0.5) / 16 * Math.PI * 2; if (Math.abs(a - Math.PI) < 0.5) continue;
    const w = 1.25, h = 3.4, y0 = 1.25, [fx, fz] = px(a, RD - 0.03), [gx, gz] = px(a, RD + 0.03), [mx, mz] = px(a, RD + 0.05), [sx, sz] = px(a, RD + 0.12);
    const outer = terArch(w + 0.36, h + 0.18); outer.holes.push(new THREE.Path(terArch(w, h).getPoints(20)));
    b.add(new THREE.ExtrudeGeometry(outer, { depth: 0.17, bevelEnabled: false, curveSegments: 10 }), mTrim, fx, y0, fz, a);
    b.add(new THREE.ShapeGeometry(terArch(w, h), 10), mWin, gx, y0, gz, a);
    b.box(0.04, h - 0.3, 0.05, BRONZE, mx, y0 + (h - 0.3) / 2, mz, a); b.box(w, 0.04, 0.05, BRONZE, mx, y0 + 1.15, mz, a); b.box(w, 0.04, 0.05, BRONZE, mx, y0 + 2.2, mz, a);
    b.box(w + 0.62, 0.12, 0.36, mTrim, sx, y0 - 0.06, sz, a);
  }
  // cornice: frieze, architrave, dentils, corona, cap
  b.cyl(9.4, 9.4, 0.4, mTrim, 0, 6.8, Z0, 72); b.cyl(9.55, 9.55, 0.14, mTrim, 0, 7.07, Z0, 72);
  for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2, [x, z] = px(a, 9.64); b.box(0.15, 0.13, 0.16, mTrim, x, 7.2, z, a); }
  b.cyl(9.85, 9.85, 0.2, mTrim, 0, 7.34, Z0, 72); b.cyl(10.0, 9.9, 0.12, mTrim, 0, 7.5, Z0, 72); b.cyl(9.4, 9.4, 0.06, mSlate, 0, 7.58, Z0, 72);
  // glazed dome with bronze ribs and an oculus
  const DR = 8.9, DY = 7.6, DS = 0.88;
  const glass = M(0x9bbcc4, 0.5, 0.1, { transparent: true, opacity: 0.58, emissive: 0xffc070, emissiveIntensity: 0, envMapIntensity: 1.6, depthWrite: false });
  const dg = add(dome, new THREE.SphereGeometry(DR, 56, 24, 0, Math.PI * 2, 0.1, Math.PI / 2 - 0.1), glass, 0, DY, 0); dg.scale.y = DS; dg.userData.nocast = 1; R.domeGlow = glass;
  for (let i = 0; i < 16; i++) {
    const ph = i / 16 * Math.PI * 2, pts = [];
    for (let j = 0; j <= 14; j++) { const th = 0.1 + j / 14 * (Math.PI / 2 - 0.1); pts.push([Math.sin(th) * Math.cos(ph) * (DR + 0.03), DY + Math.cos(th) * DR * DS + 0.03, Z0 + Math.sin(th) * Math.sin(ph) * (DR + 0.03)]); }
    b.add(terTube(pts, 0.07, 14, 5), BRONZE);
  }
  for (const th of [0.42, 0.78, 1.08, 1.34]) b.add(new THREE.TorusGeometry(Math.sin(th) * (DR + 0.03), 0.055, 5, 56), BRONZE, 0, DY + Math.cos(th) * DR * DS, Z0, 0, Math.PI / 2);
  b.add(new THREE.TorusGeometry(DR, 0.17, 6, 56), BRONZE, 0, DY + 0.05, Z0, 0, Math.PI / 2); b.add(new THREE.TorusGeometry(Math.sin(0.1) * DR, 0.1, 6, 24), BRONZE, 0, DY + Math.cos(0.1) * DR * DS, Z0, 0, Math.PI / 2);
  { const y = DY + Math.cos(0.1) * DR * DS; b.cyl(0.62, 0.7, 0.8, BRONZE, 0, y + 0.4, Z0, 12); b.cyl(0.64, 0.64, 0.4, mWin, 0, y + 0.55, Z0, 12); b.cyl(0.05, 0.8, 0.6, BRONZE, 0, y + 1.1, Z0, 12); b.sph(0.12, BRASS, 0, y + 1.45, Z0, 1, 10); b.cyl(0.015, 0.03, 0.9, BRASS, 0, y + 1.9, Z0, 6); }
  // portico: platform, steps, four columns, entablature with the name, pediment and a roof behind it
  b.box(8.6, 0.36, 3.7, mStone, 0, 0.18, 8.0, 0, 1.5); b.box(9.0, 0.12, 0.9, mStone, 0, 0.06, 5.85, 0, 1.5); b.box(8.8, 0.24, 0.45, mStone, 0, 0.12, 6.1, 0, 1.5);
  for (const x of [-3.2, -1.4, 1.4, 3.2]) { b.lathe([[0.001, 0], [0.5, 0], [0.5, 0.14], [0.4, 0.2], [0.34, 0.3], [0.3, 0.45], [0.28, 3.9], [0.31, 4.0], [0.36, 4.08], [0.46, 4.16], [0.52, 4.2], [0.52, 4.3], [0.001, 4.3]], mStone, x, 0.36, 7.0, 20); }
  b.box(8.7, 0.4, 2.65, mTrim, 0, 4.86, 7.675, 0, 1.5); b.box(8.6, 0.42, 2.6, mTrim, 0, 5.27, 7.7, 0, 1.5); b.box(9.0, 0.22, 2.95, mTrim, 0, 5.59, 7.72, 0, 1.5);
  { const s = new THREE.Shape(); s.moveTo(-4.45, 0); s.lineTo(4.45, 0); s.lineTo(0, 1.15); s.closePath(); b.add(new THREE.ExtrudeGeometry(s, { depth: 0.4, bevelEnabled: false }), mTrim, 0, 5.7, 6.3); }
  { const s = new THREE.Shape(); s.moveTo(-3.7, 0.12); s.lineTo(3.7, 0.12); s.lineTo(0, 0.95); s.closePath(); b.add(new THREE.ShapeGeometry(s), M(0xcfc6b0, 0.8, 0, { t: TX.stone(), bump: 0.04 }), 0, 5.7, 6.71); }
  const pa = Math.atan2(1.15, 4.45);
  for (const s of [-1, 1]) { b.box(4.6, 0.12, 0.5, mTrim, s * 2.225, 6.33, 6.35, 0, 0, 0, -s * pa); b.box(4.6, 0.1, 3.2, mSlate, s * 2.225, 6.28, 8.3, 0, 0, 0, -s * pa); }
  b.box(0.2, 0.14, 3.2, mSlate, 0, 6.88, 8.3);
  b.box(3.9, 5.4, 1.6, mTrim, 0, 3.06, 9.0, 0, 1.5);
  for (const s of [-1, 1]) { b.box(0.26, 3.1, 0.1, mStone, s * 1.1, 1.91, 8.2, 0, 1.5); b.box(0.5, 0.28, 0.14, mStone, s * 1.55, 1.2, 8.19, 0, 1.5); }
  b.box(2.5, 0.22, 0.16, mStone, 0, 3.6, 8.19, 0, 1.5); b.box(2.0, 0.34, 0.12, mStone, 0, 3.8, 8.16, 0, 1.5);
  for (const s of [-1, 1]) { b.box(0.1, 0.3, 0.03, IRON, s * 1.75, 2.8, 8.18); b.box(0.04, 0.04, 0.2, IRON, s * 1.75, 2.9, 8.08); b.box(0.14, 0.2, 0.14, lampM, s * 1.75, 2.82, 8.0); b.add(new THREE.ConeGeometry(0.12, 0.1, 4), IRON, s * 1.75, 3.0, 8.0, Math.PI / 4); }
  plaqueMesh(R.g, 'THE AQUADOME', 3.2, 0.36, 0, 5.27, 6.37, Math.PI, { size: 0.5, bg: '#8a7a5a', fg: '#2a2014' });
  door(R, 0, 8.17, 'Lobby', 'exit_terrace', [0, 0]).position.y = 0.36;
  b.flush(R.g);
  lamps(R, [0, 3, -4, 0xffc890, 10, 14], [4, 2.5, -12, 0xffc890, 6, 10]);
  return R;
}


// ---------- Collectible postcards from 2003 (optional) ----------
export const POSTCARDS = [
  [1, 'lobby', [-6.5, 0.51, -2.45], 0.4], [2, 'spa', [-5.3, 0.345, 3.8], 1.2], [3, 'kitchen', [-3.6, 0.976, -3.45], 0.2], [4, 'tech', [-3.6, 1.306, -3.3], 2.3],
  [5, 'archive', [3.25, 0.906, 1.45], 0.7], [6, 'wing', [1.15, 0.94, -6.2], 1.9], [7, 'terrace', [-4.5, 0.47, 1.5], 0.3], [8, 'plan', [5.51, 0.49, -0.97], 2.6],
];
function postcards() {
  const tex = T.textCanvas(256, 170, g => {
    const gr = g.createLinearGradient(0, 0, 0, 170); gr.addColorStop(0, '#c8b890'); gr.addColorStop(1, '#8a7a58'); g.fillStyle = gr; g.fillRect(0, 0, 256, 170);
    g.strokeStyle = '#4a3a24'; g.lineWidth = 3; g.beginPath(); g.arc(128, 150, 90, Math.PI, 0); g.stroke();
    g.fillStyle = '#f4ecd8'; g.fillRect(0, 0, 256, 8); g.fillRect(0, 162, 256, 8); g.fillRect(0, 0, 8, 170); g.fillRect(248, 0, 8, 170);
    g.fillStyle = '#3a2a18'; g.font = 'italic 20px Georgia'; g.textAlign = 'center'; g.fillText('Greetings from the Aquadome', 128, 40);
  });
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
  for (const [n, room, p, r] of POSTCARDS) {
    const g = new THREE.Group(); g.position.set(p[0], p[1], p[2]); g.rotation.y = r; rooms[room].g.add(g);
    const c = add(g, new THREE.PlaneGeometry(0.15, 0.1), m, 0, 0.002, 0); c.rotation.x = -Math.PI / 2; c.userData.nocast = 1;
    hit(g, 0, 0.05, 0, 0.2, 'pc_' + n, 'Postcard');
    rooms[room]['pc' + n] = g;
  }
}

// ---------- Walk spots (faint floor chevrons) ----------
const spots = [];
function spotMesh() {
  const g = new THREE.Group();
  const s = new THREE.Shape(); s.moveTo(0, 0.22); s.lineTo(0.2, -0.02); s.lineTo(0.11, -0.02); s.lineTo(0, 0.11); s.lineTo(-0.11, -0.02); s.lineTo(-0.2, -0.02); s.closePath();
  const m = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshBasicMaterial({ color: 0xfff4dc, transparent: true, opacity: 0.3, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = Math.PI; m.userData.nocast = 1; g.add(m);
  const hb = add(g, new THREE.CylinderGeometry(0.6, 0.6, 1.2, 10), HIT, 0, 0.5, 0); hb.userData.nocast = 1;
  return g;
}
export function showArrows(nodeId) {
  for (const a of spots) a.parent && a.parent.remove(a);
  const n = NODES[nodeId], R = rooms[n.room];
  n.exits.forEach((to, i) => {
    let a = spots[i]; if (!a) { a = spotMesh(); spots.push(a); }
    const t = NODES[to], dx = t.p[0] - n.p[0], dz = t.p[1] - n.p[1], d = Math.hypot(dx, dz), k = Math.min(2.4, d * 0.55);
    a.position.set(n.p[0] + (dx / d) * k, 0.02, n.p[1] + (dz / d) * k);
    a.rotation.y = Math.atan2(dx, dz);
    a.traverse(o => { o.userData.go = to; o.userData.name = 'Walk'; });
    R.g.add(a);
  });
}

// ---------- Public ----------
function envMap(renderer, isNight) {
  const es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ map: isNight ? texNight : texDay, side: THREE.BackSide })));
  const warm = new THREE.MeshBasicMaterial({ color: isNight ? 0x6a5a48 : 0xfff0d8 });
  for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(2, 1), warm); const a = i * Math.PI / 2; p.position.set(Math.sin(a) * 6, 4, Math.cos(a) * 6); p.lookAt(0, 0, 0); es.add(p); }
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(es, 0.04); pm.dispose();
  return rt.texture;
}

export function buildWorld(sc, renderer) {
  scene = sc;
  texDay = T.sky(false); texNight = T.sky(true);
  FROND = T.frond();
  mat.marbleTopM = M(0xffffff, 0.2, 0, { t: TX.marbleTop(), bump: 0.004 });
  skyMat = new THREE.MeshBasicMaterial({ map: texDay, side: THREE.BackSide, depthWrite: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 48, 24), skyMat); sky.renderOrder = -1; scene.add(sky);
  hemi = new THREE.HemisphereLight(0xfff0dc, 0x3a3024, 0.5); scene.add(hemi);
  key = new THREE.DirectionalLight(0xffe6c0, 2); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  scene.add(key); scene.add(key.target);
  envDay = envMap(renderer, false); envNight = envMap(renderer, true);
  buildLobby(); buildSpa(); buildPlanetarium(); buildKitchen(); buildTech(); buildArchive(); buildSuite(); buildTunnel(); buildStarRoom(); buildWing(); buildTerrace(); postcards();
  // shadows: furniture and people cast; structure (walls, floors, ceilings) only receives
  const flag = root => root.traverse(o => {
    if (!o.isMesh) return;
    let nc = false; for (let p = o; p; p = p.parent) if (p.userData.struct || p.userData.nocast) { nc = true; break; }
    o.castShadow = !nc && !(o.material && o.material.transparent); o.receiveShadow = !(o.material && o.material.isMeshBasicMaterial);
  });
  for (const k in rooms) flag(rooms[k].g);
}

let curRoom = null;
export function showRoom(id) {
  for (const k in rooms) rooms[k].g.visible = k === id;
  curRoom = id; applyTime();
}
export const roomOf = () => rooms[curRoom];

function applyTime() {
  const n = night(), R = rooms[curRoom];
  skyMat.map = n ? texNight : texDay; skyMat.needsUpdate = true;
  for (const k in rooms) for (const m of rooms[k].skyMats) { m.map = n ? texNight : texDay; m.needsUpdate = true; }
  const dark = R && R.dark;
  scene.environment = n || dark ? envNight : envDay;
  scene.environmentIntensity = dark ? 0.4 : n ? 0.3 : 0.55;
  hemi.color.set(n ? 0x5a6488 : 0xfff0dc); hemi.groundColor.set(n ? 0x2a2630 : 0x9a8a70);
  hemi.intensity = dark ? 0.3 : n ? 0.22 : 0.45;
  if (R) {
    const K = R.key, [c, i] = n ? K.night : K.day;
    key.color.set(c); key.intensity = i;
    key.position.set(K.p[0], K.p[1], K.p[2]); key.target.position.set(K.t[0], K.t[1], K.t[2]);
    const cam = key.shadow.camera; cam.left = cam.bottom = -K.s; cam.right = cam.top = K.s; cam.near = 0.5; cam.far = 40; cam.updateProjectionMatrix();
    for (const l of R.lamps) l.intensity = l.userData.base * (n ? 1.4 : 1);
  }
}

// Where everyone is, by phase and story flags: [room, x, z, floor height].
const DAY = {
  vesper: ['spa', 4.5, -0.9], cherry: ['lobby', 1.8, -2.3], kenji: ['lobby', 6.3, 1.2], harper: ['lobby', -6.0, 4.3],
  dex: ['tech', 2, -1.6], juniper: ['kitchen', -1.8, -1.4], jojo: ['kitchen', 2.9, 0.4], opal: ['archive', -0.9, -1.6],
  priya: ['plan', -2.4, 1.3], regent: ['plan', 1.3, -6.0, 0.5], rashad: ['wing', 0.95, -8.0],
  gus: ['terrace', -3.4, -2.6], silas: ['terrace', 6.0, 0.6], nate: ['terrace', 4.4, -13.5],
};
const NIGHT1 = { cherry: ['plan', -1.7, -5.9, 0.5], silas: ['lobby', -2.8, -4.6], gus: ['wing', 0.9, -2.0], nate: ['terrace', 4.4, -13.5] };
export function whereIs(who) {
  const p = S.phase;
  if (p === 'd1' || p === 'd2' || p === 'g') {
    if (who === 'opal' && p === 'd2' && has('opal_left')) return null;
    return DAY[who] || null;
  }
  if (p === 'n1') return NIGHT1[who] || null;
  if (p === 'n2' && who === 'opal' && !has('finale_done')) return ['star', 1.6, -1.8];
  return null;
}

export function sync() {
  const L = rooms.lobby, P = rooms.plan, A = rooms.archive, X = rooms.star;
  L.pin.visible = !has('pin');
  P.holo.visible = S.phase === 'n1' && !has('holo_card');
  P.code.visible = has('const_done');
  A.sketch.visible = !has('sketch');
  X.crown.visible = !has('crown_back');
  L.caseCrown.visible = has('crown_back');
  for (const [n, room] of POSTCARDS) rooms[room]['pc' + n].visible = !has('pc_' + n);
  rooms.terrace.domeGlow.emissiveIntensity = night() ? 0.8 : 0; rooms.terrace.winGlow.emissiveIntensity = night() ? 1.4 : 0.1;
  for (const w in CAST) {
    const at = whereIs(w);
    if (at && FIG[w] && !figReady(w)) loadFigure(w, () => sync(), at[0] === curRoom);
    const ready = FIG[w] ? figReady(w) : castReady(w);
    if (!at || !ready) { chars[w] && chars[w].parent && chars[w].parent.remove(chars[w]); continue; }
    // painted figures (from the art) replace the sculpted models where they exist
    const c = chars[w] || (chars[w] = FIG[w] ? buildFigure(w, HIT) : buildPerson(w, BRASS, HIT)); // built on first appearance
    const R = rooms[at[0]];
    if (c.parent !== R.g) R.g.add(c);
    c.position.set(at[1], (at[3] || 0) + c.userData.yOff, at[2]);
    if (c.userData.baseAt !== at.join()) {   // their own facing (recomputed when they move somewhere else)
      c.userData.baseAt = at.join();   // roughly towards the middle of the room, a little off
      let h = 0; for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) % 997;
      c.userData.base = Math.atan2(-at[1], -at[2]) + ((h % 100) / 100 - 0.5) * 0.7;
      c.rotation.y = c.userData.base;
    }
  }
  applyTime();
}

// Head position of a character, for the conversation close-up.
export function headOf(who) {
  const c = chars[who]; if (!c || !c.parent) return null;
  const v = new THREE.Vector3(); c.userData.head.getWorldPosition(v); return v;
}

export function update(dt, t, cam) {
  for (const u of updaters) u(dt, t);
  for (const w in chars) {
    const c = chars[w]; if (!c.parent || !c.parent.visible) continue;
    // people keep their own facing; they turn to you when you talk to them, and partly when you come close
    const toCam = Math.atan2(cam.position.x - c.position.x, cam.position.z - c.position.z);
    const dist = Math.hypot(cam.position.x - c.position.x, cam.position.z - c.position.z);
    const talking = speech.focus === w || speech.who === w, base = c.userData.base ?? toCam;
    const off = Math.atan2(Math.sin(toCam - base), Math.cos(toCam - base));
    const k = talking ? 1 : dist < 2.8 ? 0.6 * Math.min(1, (2.8 - dist) / 1.2) : 0;
    const want = base + off * k;
    let d = want - c.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    c.rotation.y += d * Math.min(1, dt * (talking ? 2.2 : 1.1));
    c.userData.near = talking || dist < 4.5;
    (c.userData.figure ? animateFigure : animatePerson)(c, dt, cam, speech);
  }
  const X = rooms.star;
  if (X && X.g.visible && X.crown.visible) X.crown.rotation.y = t * 0.3;
}

// Hotspot reveal: where each clickable thing in view sits on screen (for the Reveal button).
const _b = new THREE.Box3(), _v = new THREE.Vector3();
export function hotspotsOnScreen(camera, w, h) {
  const R = rooms[curRoom], out = [];
  R.g.traverse(o => {
    const u = o.userData; if (!(u.hot || u.who) || u.go || o.isMesh && o.parent && (o.parent.userData.hot || o.parent.userData.who)) return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;
    _b.setFromObject(o); if (_b.isEmpty()) return; _b.getCenter(_v);
    if (_v.distanceTo(camera.position) > 14) return;
    _v.project(camera); if (_v.z > 1 || Math.abs(_v.x) > 1 || Math.abs(_v.y) > 1) return;
    out.push({ x: (_v.x + 1) / 2 * w, y: (1 - _v.y) / 2 * h, name: u.name || u.hot || u.who });
  });
  return out;
}
