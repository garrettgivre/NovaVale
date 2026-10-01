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

// ---------- Interiors pass (tech, archive, suite): shared helpers ----------
// Merge every mesh under g that shares a material into one mesh (static clutter only: no hotspots, nothing animated).
function ixBake(g) {
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), m4 = new THREE.Matrix4(), by = new Map(), old = [];
  const sig = new Map(), same = mt => {
    const k = [mt.type, mt.color && mt.color.getHex(), mt.roughness, mt.metalness, mt.map && mt.map.uuid, mt.bumpMap && mt.bumpMap.uuid, mt.emissive && mt.emissive.getHex(), mt.emissiveIntensity, mt.transparent, mt.opacity, mt.side, mt.blending].join('|');
    if (!sig.has(k)) sig.set(k, mt); return sig.get(k);
  };
  g.traverse(o => { if (o.isMesh && !o.userData.keep) { const mt = same(o.material); if (!by.has(mt)) by.set(mt, []); by.get(mt).push(o); old.push(o); } });
  for (const [mt, list] of by) {
    let n = 0;
    const gs = list.map(o => {
      const ge = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      m4.multiplyMatrices(inv, o.matrixWorld); ge.applyMatrix4(m4); n += ge.attributes.position.count; return ge;
    });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let i = 0;
    for (const ge of gs) {
      pos.set(ge.attributes.position.array, i * 3); nor.set(ge.attributes.normal.array, i * 3);
      if (ge.attributes.uv) uv.set(ge.attributes.uv.array, i * 2);
      i += ge.attributes.position.count; ge.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const me = new THREE.Mesh(geo, mt); me.userData.nocast = g.userData.nocast; g.add(me);
  }
  old.forEach(o => { o.parent.remove(o); o.geometry.dispose(); });
  return g;
}
// A baking group: build inside, then ixBake(group). nocast groups skip the shadow pass.
const ixGroup = (R, nocast = false) => { const g = new THREE.Group(); if (nocast) g.userData.nocast = 1; R.g.add(g); return g; };
const ixPlane = (p, w, h, m, x, y, z, ry = 0, rx = 0) => { const o = add(p, new THREE.PlaneGeometry(w, h), m, x, y, z); o.rotation.order = 'YXZ'; o.rotation.y = ry; o.rotation.x = rx; return o; };
const ixTube = (p, pts, r, m, seg = 40) => add(p, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(q => new THREE.Vector3(...q))), seg, r, 5, false), m);
// rotated boxes / cylinders between two points
function ixBar(p, a, b, w, m, d = w) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
  const o = add(p, new THREE.BoxGeometry(w, len, d), m, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize()); return o;
}
function ixPipe(p, a, b, r, m, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
  const o = add(p, new THREE.CylinderGeometry(r, r, len, seg), m, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize()); return o;
}
// soft dark blob on the floor under a piece (contact shadow). w x d footprint centred at x,z.
function ixBlob(p, w, d, x, z, ry = 0, o = 0.5) {
  const m = once('ixblob' + o, () => {
    const c = T.canvas(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 6, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: o, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  });
  const s = ixPlane(p, w * 1.25, d * 1.25, m, x, 0.012, z, ry, -Math.PI / 2); s.userData.nocast = 1; s.renderOrder = 1; return s;
}
// make a wallpaper texture with a smaller motif: the source tiled 2x2 into one canvas
function ixHalfTex(key, f, n = 2) {
  return once(key, () => {
    const t = f(), mk = (tx, srgb) => {
      const c = T.canvas(512, 512), g = c.getContext('2d'), im = tx.image, s = 512 / n;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g.drawImage(im, i * s, j * s, s, s);
      return T.toTex(c, null, srgb);
    };
    return { map: mk(t.map, true), bump: mk(t.bump, false) };
  });
}
// printed things: a canvas drawn once per key and cached as a lit-standard material
const ixPrint = (key, w, h, draw, rough = 0.8) => once('ixp' + key, () => new THREE.MeshStandardMaterial({ roughness: rough, map: T.textCanvas(w, h, draw) }));
const ixFlat = (key, w, h, draw) => once('ixf' + key, () => new THREE.MeshBasicMaterial({ map: T.textCanvas(w, h, draw) }));
const ixMat = (key, c, r = 0.6, m = 0, o = {}) => once('ixm' + key, () => M(c, r, m, o));
const ixFrameM = () => ixMat('gold', 0xa8873c, 0.35, 0.7);
// a framed picture on a wall (ry = wall facing); returns the group
function ixFrame(p, x, y, z, ry, w, h, mat, o = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; p.add(g);
  const fm = o.fm || ixFrameM(), b = o.b || 0.045;
  box(g, w + b * 2, h + b * 2, 0.04, fm, 0, 0, 0.02);
  box(g, w + 0.01, h + 0.01, 0.045, ixMat('mat', 0xe8e0cc, 0.9), 0, 0, 0.02);
  const inner = o.pass === 0 ? 0 : (o.pass || 0.03);
  ixPlane(g, w - inner * 2, h - inner * 2, mat, 0, 0, 0.044);
  return g;
}
// beige CRT monitor / TV, front facing +z of its group
function ixCRT(p, x, y, z, ry, w, screen, o = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; p.add(g);
  const h = w * 0.82, d = w * 0.8, body = o.body || ixMat('beige', 0xd6cdb4, 0.6);
  box(g, w, h, 0.1, body, 0, h / 2, d / 2 - 0.05);
  box(g, w * 0.82, h * 0.8, d * 0.6, body, 0, h * 0.5, d * 0.12);
  box(g, w * 0.5, h * 0.55, d * 0.3, body, 0, h * 0.5, -d * 0.22);
  box(g, w * 0.62, 0.03, w * 0.42, body, 0, -0.005, 0); // swivel foot
  box(g, w * 0.84, h * 0.76, 0.012, ixMat('crtglass', 0x11161a, 0.15), 0, h * 0.53, d / 2 + 0.003);
  ixPlane(g, w * 0.78, h * 0.7, screen, 0, h * 0.53, d / 2 + 0.012);
  box(g, 0.03, 0.012, 0.01, ixMat('ledg', 0x30ff60, 0.4, 0, { emissive: 0x30ff60, emissiveIntensity: 1 }), w * 0.4, h * 0.07, d / 2 + 0.006);
  for (let i = 0; i < 2; i++) cyl(g, 0.012, 0.012, 0.01, ixMat('knob', 0x8a8478, 0.4), w * 0.28 - i * 0.04, h * 0.07, d / 2 + 0.005, 8).rotation.x = Math.PI / 2;
  return g;
}
const ixScreens = {
  bars: () => ixFlat('bars', 256, 192, (g, w, h) => {
    const c = ['#c8c8c8', '#c8c800', '#00c8c8', '#00c800', '#c800c8', '#c80000', '#0000c8'], bw = w / 7;
    c.forEach((k, i) => { g.fillStyle = k; g.fillRect(i * bw, 0, bw + 1, h * 0.7); });
    g.fillStyle = '#101010'; g.fillRect(0, h * 0.7, w, h * 0.3); g.fillStyle = '#e8e8e8'; g.fillRect(w * 0.55, h * 0.7, w * 0.2, h * 0.3);
    g.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  }),
  term: () => ixFlat('term', 256, 192, (g, w, h) => {
    g.fillStyle = '#04100a'; g.fillRect(0, 0, w, h); g.fillStyle = '#4cff7a'; g.font = '14px "Courier New", monospace';
    ['C:\\AQUA> dir /w', 'ZONES  LIGHTS  PA', 'PA.CFG  SHOW.EXE', 'C:\\AQUA> ping dome', 'Reply from 10.0.0.7', 'time<1ms', 'C:\\AQUA> _'].forEach((l, i) => g.fillText(l, 12, 26 + i * 22));
    g.fillStyle = 'rgba(0,0,0,.25)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  }),
  blue: () => ixFlat('blue', 256, 192, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a5a9a'); gr.addColorStop(1, '#6a9ac8'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(14, h - 26, w - 28, 16); g.fillStyle = 'rgba(0,0,0,.15)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  }),
  off: () => ixMat('scroff', 0x1a2024, 0.1),
};
// rack / shelf gear faceplates (about 4.5:1)
const ixGearM = k => ixFlat('gear' + k, 288, 64, (g, w, h) => {
  const dark = k === 'amp' || k === 'vcr', gr = g.createLinearGradient(0, 0, 0, h);
  if (dark) { gr.addColorStop(0, '#2c2e30'); gr.addColorStop(1, '#141517'); } else { gr.addColorStop(0, '#c8cacc'); gr.addColorStop(1, '#8e9092'); }
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = '#000'; g.globalAlpha = 0.35; g.fillRect(0, 0, w, 2); g.fillRect(0, h - 2, w, 2); g.globalAlpha = 1;
  const knob = (x, y, r) => { g.fillStyle = dark ? '#6a6c6e' : '#2a2c2e'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.fillStyle = dark ? '#c8cacc' : '#d8dadc'; g.fillRect(x - 1, y - r, 2, r * 0.8); };
  if (k === 'amp') { for (let i = 0; i < 4; i++) knob(40 + i * 34, 32, 11); g.fillStyle = '#120a04'; g.fillRect(190, 14, 60, 34); g.fillStyle = '#ff9a30'; g.fillRect(196, 20, 40, 4); g.fillRect(196, 30, 28, 4); }
  if (k === 'vcr') { g.fillStyle = '#060606'; g.fillRect(24, 16, 130, 28); g.fillStyle = '#1a1a1c'; g.fillRect(28, 28, 122, 3); g.fillStyle = '#103a14'; g.fillRect(190, 18, 52, 16); g.fillStyle = '#50ff70'; g.font = '13px monospace'; g.fillText('12:00', 196, 31); for (let i = 0; i < 4; i++) { g.fillStyle = '#505254'; g.fillRect(180 + i * 16, 42, 12, 8); } }
  if (k === 'eq') { for (let i = 0; i < 14; i++) { g.fillStyle = '#2a2c2e'; g.fillRect(24 + i * 18, 10, 2, 42); g.fillStyle = '#e8e8e8'; g.fillRect(20 + i * 18, 18 + ((i * 7) % 22), 10, 5); } }
  if (k === 'tape') { g.fillStyle = '#16181a'; g.fillRect(24, 10, 120, 44); g.fillStyle = '#5a5e60'; g.beginPath(); g.arc(58, 32, 9, 0, 7); g.arc(110, 32, 9, 0, 7); g.fill(); knob(200, 22, 8); knob(236, 22, 8); for (let i = 0; i < 5; i++) { g.fillStyle = '#3a3c3e'; g.fillRect(168 + i * 22, 42, 16, 9); } }
  if (k === 'mix') { for (let i = 0; i < 8; i++) { g.fillStyle = '#16181a'; g.fillRect(22 + i * 30, 12, 6, 40); g.fillStyle = i % 3 ? '#c8c8c8' : '#d03030'; g.fillRect(18 + i * 30, 16 + (i * 9) % 26, 14, 6); } }
});
function ixGear(p, w, h, d, x, y, z, k, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; p.add(g);
  box(g, w, h, d, ixMat('gearbody', 0x1e2022, 0.6, 0.3), 0, h / 2, 0);
  ixPlane(g, w - 0.01, h - 0.008, ixGearM(k), 0, h / 2, d / 2 + 0.002);
  return g;
}
// a sheet of paper / sticky note / label stuck on something
const ixSticky = (p, x, y, z, ry, c = 0xe8d860, s = 0.075, rz = 0) => { const o = box(p, s, s, 0.003, ixMat('st' + c, c, 0.9), x, y, z); o.rotation.y = ry; o.rotation.z = rz; return o; };

// A bevelled-corner rectangle band of wall (for dados): len x hh at height y on a wall facing ry.
function ixBand(p, len, hh, x, y, z, ry, m, off = 0.012) {
  const nx = Math.sin(ry), nz = Math.cos(ry);
  const s = ixPlane(p, len, hh, m, x + nx * off, y, z + nz * off, ry); s.userData.struct = 1; return s;
}

// ---------- Tech office ----------
function ixTechDress(R) {
  const S = ixGroup(R, true), N = ixGroup(R, true), K = ixGroup(R);
  const beige = ixMat('beige', 0xd6cdb4, 0.6), grey = ixMat('metalgrey', 0x8a8e90, 0.45, 0.6), dgrey = ixMat('dgrey', 0x3a3d40, 0.55, 0.4);
  const wood = ixMat('lamin', 0xb09a74, 0.6), black = ixMat('blk', 0x16171a, 0.7), cBlack = ixMat('cblack', 0x101012, 0.6);
  const cWhite = ixMat('cwhite', 0xdedad0, 0.6), cGrey = ixMat('cgrey', 0x6a6e72, 0.6), cRed = ixMat('cred', 0x9a2a22, 0.6), cBlue = ixMat('cblue', 0x2a4a86, 0.6);
  const alu = ixMat('alu', 0xb8bcbe, 0.3, 0.9), conduit = ixMat('conduit', 0xa6aaac, 0.35, 0.85), paperM = ixMat('paper', 0xeee8d8, 0.9);
  const WH = 2.9;

  // --- wall dado: vinyl lower wall in blue-grey with a chair rail, all four walls
  const dado = M(0xffffff, 0.8, 0, { t: once('ixDado', () => T.fabric({ base: '#5c6a70', weave: 2, seed: 9 })), rep: [3, 1], bump: 0.01 });
  for (const [len, x, z, ry] of [[8, 0, -4, 0], [8, 0, 4, Math.PI], [8, -4, 0, Math.PI / 2], [8, 4, 0, -Math.PI / 2]]) {
    const nx = Math.sin(ry), nz = Math.cos(ry);
    ixBand(S, len, 1.0, x, 0.5, z, ry, dado, 0.014);
    const r = box(S, len, 0.05, 0.05, cWhite, x + nx * 0.03, 1.02, z + nz * 0.03); r.rotation.y = ry;
  }

  // --- suspended tile ceiling with fluorescent troffers
  const ct = once('ixCeilT', () => {
    const rr = T.rng(21), P = T.pix(256, 256, (x, y) => {
      const bar = x % 128 < 2 || y % 128 < 2, n = rr(), v = 226 + (n - 0.5) * 22 - ((x * 7 + y * 3) % 5 === 0 ? 8 : 0);
      return bar ? [238, 238, 232, 0.9] : [v, v - 3, v - 12, 0.3 + n * 0.2];
    });
    const g = P.cx; g.fillStyle = 'rgba(120,90,40,.0)';
    const st = (x, y, r, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(140,100,40,${a})`); gr.addColorStop(1, 'rgba(140,100,40,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
    st(190, 60, 40, 0.14); st(64, 190, 26, 0.08);
    return T.done(P);
  });
  struct(add(R.g, new THREE.PlaneGeometry(8, 8), M(0xffffff, 0.95, 0, { t: ct, rep: [8 / 1.2, 8 / 1.2], bump: 0.01 }), 0, WH - 0.03, 0)).rotation.x = Math.PI / 2;
  const lit = once('ixLitP', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, emissive: 0xf2f6ff, emissiveIntensity: 1.0, map: T.textCanvas(128, 64, (g, w, h) => {
    g.fillStyle = '#f4f6f8'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(160,170,180,.5)'; for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h);
    g.fillStyle = 'rgba(200,210,220,.9)'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3);
  }) }));
  const litDim = once('ixLitD', () => { const m = lit.clone(); m.emissiveIntensity = 0.45; return m; });
  const frameW = ixMat('lfr', 0xe4e4e0, 0.5);
  [[-1.8, -2.4, lit], [1.8, -2.4, lit], [-1.8, 0.7, lit], [1.8, 0.7, litDim], [0, 0.7 + 2.4, lit], [-3, -2.4, litDim]].forEach(([x, z, m]) => {
    const f = box(N, 1.28, 0.03, 0.68, frameW, x, WH - 0.04, z); f.userData.struct = 1;
    const p = ixPlane(N, 1.2, 0.6, m, x, WH - 0.058, z, 0, Math.PI / 2); p.userData.nocast = 1;
    box(N, 0.03, 0.02, 0.7, frameW, x, WH - 0.062, z);
  });
  // t-bar perimeter, vent grille, smoke detector, sprinkler head
  for (const [w, d, x, z] of [[8, 0.05, 0, -3.975], [8, 0.05, 0, 3.975], [0.05, 8, -3.975, 0], [0.05, 8, 3.975, 0]]) box(N, w, 0.04, d, cWhite, x, WH - 0.04, z);
  const vent = ixMat('vent', 0xdcd9cf, 0.5);
  box(N, 0.62, 0.025, 0.62, vent, -2.4, WH - 0.04, 2.4); for (let i = 0; i < 7; i++) box(N, 0.56, 0.01, 0.018, ixMat('ventd', 0x2a2c2e, 0.8), -2.4, WH - 0.056, 2.4 - 0.24 + i * 0.08);
  cyl(N, 0.065, 0.065, 0.03, cWhite, 1.2, WH - 0.045, 0.1, 14); cyl(N, 0.012, 0.012, 0.01, ixMat('ledr', 0xff2010, 0.4, 0, { emissive: 0xff2010, emissiveIntensity: 1 }), 1.2, WH - 0.063, 0.1, 6);
  cyl(N, 0.012, 0.012, 0.05, BRASS, -0.6, WH - 0.05, -1.0, 8);
  // suspended wires don't show; the cable tray does: ladder rack along the north wall, over the rack, with bundles
  box(S, 7.4, 0.03, 0.32, grey, 0, 2.55, -3.78); box(S, 7.4, 0.07, 0.02, grey, 0, 2.59, -3.62); box(S, 7.4, 0.07, 0.02, grey, 0, 2.59, -3.94);
  for (let i = 0; i < 24; i++) box(S, 0.02, 0.01, 0.3, grey, -3.6 + i * 0.31, 2.57, -3.78);
  box(S, 0.32, 0.03, 1.2, grey, 3.35, 2.55, -3.1); box(S, 0.02, 0.07, 1.2, grey, 3.19, 2.59, -3.1); box(S, 0.02, 0.07, 1.2, grey, 3.51, 2.59, -3.1);
  for (const x of [-3, -1, 1, 3]) ixPipe(S, [x, 2.55, -3.78], [x, 2.87, -3.78], 0.006, grey, 5);
  for (const [x0, x1, y, r, m] of [[-3.5, 3.3, 2.585, 0.045, cBlack], [-3.4, 2.4, 2.6, 0.03, cGrey], [-2.0, 3.0, 2.575, 0.028, cBlue]]) {
    const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push([x0 + (x1 - x0) * t, y + Math.sin(t * 9 + x0) * 0.01, -3.78 + Math.sin(t * 5) * 0.05]); }
    ixTube(N, pts, r, m, 30);
  }
  ixTube(N, [[3.3, 2.585, -3.78], [3.35, 2.58, -3.4], [3.35, 2.4, -2.9], [3.3, 2.15, -2.62]], 0.04, cBlack, 20);
  ixTube(N, [[3.36, 2.58, -3.3], [3.38, 2.4, -2.8], [3.4, 2.15, -2.5]], 0.025, cGrey, 20);
  // cable drop to the desk, behind it
  ixTube(N, [[0.9, 2.58, -3.78], [0.92, 2.0, -3.9], [0.95, 1.2, -3.92], [0.95, 0.85, -3.92]], 0.012, cBlack, 20);
  ixTube(N, [[-0.8, 2.58, -3.78], [-0.82, 1.8, -3.9], [-0.82, 0.9, -3.92]], 0.015, cGrey, 20);
  // --- floor cables and the power-strip tangle
  const strip = (x, z, ry) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; N.add(g); box(g, 0.34, 0.035, 0.07, cWhite, 0, 0.018, 0); box(g, 0.03, 0.012, 0.03, cRed, -0.13, 0.04, 0); for (let i = 0; i < 5; i++) box(g, 0.035, 0.004, 0.04, ixMat('sock', 0x2a2a2a, 0.6), -0.04 + i * 0.055, 0.037, 0); return g; };
  strip(1.2, -3.15, 0.2); strip(1.9, -3.5, -0.4); strip(-1.5, -3.6, 0.1);
  const fl = (pts, r, m) => ixTube(N, pts.map(q => [q[0], r + 0.002, q[1]]), r, m, 40);
  fl([[1.0, -3.15], [1.3, -3.5], [1.7, -3.85], [1.5, -3.95]], 0.012, cWhite);
  fl([[1.35, -3.15], [1.6, -2.95], [2.1, -3.0], [2.6, -3.3], [2.9, -3.25]], 0.012, cBlack);
  fl([[2.0, -3.5], [2.4, -3.55], [2.8, -3.2], [3.0, -2.9], [3.1, -2.55]], 0.014, cBlack);
  fl([[1.2, -3.15], [0.7, -3.0], [0.2, -3.1], [-0.4, -3.4], [-0.9, -3.55]], 0.012, cGrey);
  fl([[-1.4, -3.6], [-1.9, -3.9], [-2.6, -3.95], [-3.2, -3.9]], 0.014, cBlack);
  fl([[1.1, -3.1], [0.6, -3.7], [0.3, -3.9], [-0.1, -3.92]], 0.01, cWhite);
  fl([[-1.5, -3.6], [-1.1, -3.4], [-0.5, -3.7], [0.0, -3.55]], 0.01, cBlue);
  // outlet plates on the north wall
  for (const x of [-2.4, 1.5, 3.0]) box(N, 0.08, 0.12, 0.012, cWhite, x, 0.3, -3.99);

  // --- main desk dressing (desk top at y .765, x -1.7..1.7, z -3.85..-2.95)
  const dy = 0.775;
  ixCRT(S, -0.83, dy, -3.66, 0.28, 0.5, ixScreens.blue());
  for (const s of [-1, 1]) { box(N, 0.1, 0.18, 0.1, beige, 0.46 * s, dy + 0.09, -3.58); ixPlane(N, 0.07, 0.14, ixMat('grille', 0x2a2a2a, 0.9), 0.46 * s, dy + 0.09, -3.529); }
  box(N, 0.16, 0.025, 0.2, ixMat('mpad', 0x2a4a6a, 0.9), 0.45, dy + 0.012, -3.08); box(N, 0.06, 0.025, 0.1, beige, 0.45, dy + 0.035, -3.08);
  const ph = new THREE.Group(); ph.position.set(-1.55, dy, -3.2); ph.rotation.y = 0.3; N.add(ph); // desk phone
  box(ph, 0.2, 0.06, 0.24, beige, 0, 0.03, 0); box(ph, 0.2, 0.03, 0.06, beige, 0, 0.075, -0.07); for (let i = 0; i < 12; i++) box(ph, 0.02, 0.006, 0.02, ixMat('key', 0x3a3a3a, 0.6), -0.04 + (i % 3) * 0.04, 0.062, 0.0 + Math.floor(i / 3) * 0.035 - 0.0);
  cyl(N, 0.04, 0.035, 0.1, ixMat('mug', 0xa8302a, 0.4), -1.5, dy + 0.05, -3.7, 12); for (let i = 0; i < 4; i++) ixPipe(N, [-1.5, dy + 0.08, -3.7], [-1.5 + (i - 1.5) * 0.015, dy + 0.2, -3.7 + (i % 2) * 0.01], 0.004, ixMat('pen' + i, [0x2a4a9a, 0xb03030, 0x202020, 0x2a7a3a][i], 0.5), 4);
  for (let i = 0; i < 3; i++) cyl(N, 0.06, 0.06, 0.012, ixMat('cd', 0xc8ccd0, 0.2, 0.9), 0.0 + i * 0.01, dy + 0.006 + i * 0.012, -3.78, 16);
  box(N, 0.28, 0.1, 0.2, ixMat('binder', 0x1c3a5a, 0.7), 0.7, dy + 0.05, -3.74);
  box(N, 0.3, 0.06, 0.22, ixMat('manila', 0xc8a870, 0.85), 0.72, dy + 0.13, -3.72).rotation.y = 0.1;
  // monitor-bezel sticky notes (main PC's screen stays as it was)
  for (const [x, y, rz, c] of [[-0.25, 1.18, 0.15, 0xf0a8c0], [-0.265, 1.04, -0.1, 0x90c8e8], [0.26, 0.9, -0.05, 0xe8d860]]) ixSticky(N, x, y, -3.247, 0, c, 0.06, rz);
  // PC tower under the desk
  box(S, 0.2, 0.44, 0.42, beige, 1.15, 0.22, -3.55); box(S, 0.17, 0.02, 0.01, cGrey, 1.15, 0.35, -3.335); box(S, 0.17, 0.05, 0.01, cGrey, 1.15, 0.26, -3.335);
  box(S, 0.34, 0.34, 0.4, ixMat('ups', 0x222428, 0.5, 0.3), -1.05, 0.17, -3.55); box(S, 0.12, 0.02, 0.01, ixMat('upsl', 0x30ff60, 0.4, 0, { emissive: 0x30ff60, emissiveIntensity: 1 }), -1.05, 0.28, -3.35);

  // --- side desk (east wall): CRT, tower, keyboard, speakers
  ixCRT(S, 3.4, 0.77, 0.25, -Math.PI / 2, 0.5, ixScreens.term());
  box(S, 0.2, 0.42, 0.42, beige, 3.42, 0.98, 0.98); box(S, 0.01, 0.05, 0.3, cGrey, 3.31, 1.1, 0.98);
  box(N, 0.16, 0.022, 0.44, beige, 3.0, 0.78, 0.27); box(N, 0.1, 0.01, 0.4, ixMat('keyr', 0x9a9486, 0.6), 3.0, 0.795, 0.27);
  box(N, 0.1, 0.18, 0.1, beige, 3.45, 0.86, -0.2); box(N, 0.1, 0.18, 0.1, beige, 3.45, 0.86, 0.66);
  box(N, 0.22, 0.012, 0.3, paperM, 3.05, 0.772, 0.85).rotation.y = 0.3;
  ixSticky(N, 3.18, 0.88, 0.0, -Math.PI / 2, 0xe8d860, 0.06, 0.1);
  // --- workbench on the south wall with pegboard, tools, scope, soldering iron and a half-built gadget
  const bx = -2.6, bz = 3.62, by = 0.92;
  box(K, 1.8, 0.05, 0.76, ixMat('benchtop', 0x7a5a3a, 0.65), bx, by - 0.025, bz);
  box(K, 1.74, 0.03, 0.7, ixMat('benchshelf', 0x6a4a2e, 0.7), bx, 0.22, bz);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(K, 0.06, 0.9, 0.06, ixMat('benchleg', 0x5a3e26, 0.7), bx + sx * 0.84, 0.45, bz + sz * 0.32);
  box(S, 1.74, 0.1, 0.02, ixMat('benchl', 0x5a3e26, 0.7), bx, 0.85, bz - 0.36);
  // roll cabinet
  box(K, 0.5, 0.82, 0.46, ixMat('chest', 0x9a2a22, 0.45, 0.3), -3.72, 0.48, 3.74); for (let i = 0; i < 5; i++) { box(S, 0.46, 0.012, 0.01, ixMat('chestl', 0x4a1210, 0.6), -3.72, 0.2 + i * 0.13, 3.508); box(S, 0.2, 0.012, 0.014, alu, -3.72, 0.26 + i * 0.13, 3.51); }
  for (const x of [-3.9, -3.54]) { cyl(S, 0.03, 0.03, 0.06, black, x, 0.03, 3.9, 8); }
  box(S, 0.52, 0.03, 0.48, dgrey, -3.72, 0.9, 3.74);
  // pegboard over the bench with painted tool outlines
  const peg = ixPrint('peg', 512, 256, (g, w, h) => {
    g.fillStyle = '#9c7a52'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(40,24,10,.5)';
    for (let y = 8; y < h; y += 16) for (let x = 8; x < w; x += 16) { g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(40,24,10,.5)'; g.lineWidth = 2; g.lineJoin = 'round';
    const ol = (f) => { g.save(); f(); g.restore(); };
    ol(() => { g.translate(40, 60); g.strokeRect(0, 0, 14, 80); g.strokeRect(-14, 0, 42, 20); }); // hammer
    ol(() => { g.translate(110, 40); g.beginPath(); g.moveTo(0, 0); g.lineTo(12, 0); g.lineTo(12, 110); g.lineTo(0, 110); g.closePath(); g.stroke(); });
    ol(() => { g.translate(160, 40); g.beginPath(); g.moveTo(0, 0); g.lineTo(10, 0); g.lineTo(10, 90); g.lineTo(0, 90); g.closePath(); g.stroke(); });
    ol(() => { g.translate(230, 50); g.beginPath(); g.ellipse(0, 20, 22, 20, 0, 0, 7); g.stroke(); g.strokeRect(-6, 38, 12, 70); }); // wrench head
    ol(() => { g.translate(310, 50); g.beginPath(); g.moveTo(-18, 0); g.lineTo(18, 0); g.lineTo(6, 60); g.lineTo(6, 100); g.lineTo(-6, 100); g.lineTo(-6, 60); g.closePath(); g.stroke(); }); // pliers
    ol(() => { g.translate(400, 50); g.beginPath(); g.moveTo(-14, 0); g.lineTo(14, 0); g.lineTo(4, 70); g.lineTo(4, 110); g.lineTo(-4, 110); g.lineTo(-4, 70); g.closePath(); g.stroke(); });
    ol(() => { g.translate(465, 60); g.beginPath(); g.arc(0, 30, 28, 0, 7); g.stroke(); });
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 0, w, 4);
  }, 0.9);
  ixPlane(S, 2.28, 1.0, peg, -2.82, 1.62, 3.985, Math.PI);
  box(S, 2.34, 0.04, 0.03, ixMat('pegf', 0x5a3e26, 0.7), -2.82, 2.13, 3.97); box(S, 2.34, 0.04, 0.03, ixMat('pegf', 0x5a3e26, 0.7), -2.82, 1.11, 3.97);
  // real tools hanging on it
  const tool = (x, y, ry, len, hc, sc) => { cyl(S, 0.014, 0.014, len * 0.45, hc, x, y + len * 0.22, 3.94, 6); cyl(S, 0.005, 0.005, len * 0.55, sc, x, y - len * 0.27 + len * 0.22 + 0.02, 3.94, 5); };
  const redH = ixMat('redh', 0xc83a22, 0.5), yelH = ixMat('yelh', 0xe0b020, 0.5), steelM = ixMat('steel2', 0xaaaeb2, 0.3, 0.9);
  tool(-3.45, 1.56, 0, 0.3, redH, steelM); tool(-3.3, 1.58, 0, 0.26, yelH, steelM); tool(-3.15, 1.6, 0, 0.24, redH, steelM);
  box(S, 0.04, 0.2, 0.025, ixMat('hamh', 0x7a4a22, 0.7), -3.03, 1.5, 3.94); box(S, 0.14, 0.05, 0.03, dgrey, -3.03, 1.62, 3.94);
  const coil = (x, y, c) => { const t = add(S, new THREE.TorusGeometry(0.08, 0.014, 6, 16), c, x, y, 3.94); };
  coil(-2.2, 1.55, ixMat('coil1', 0xc8a020, 0.5)); coil(-2.0, 1.5, cBlack);
  // scope: oscilloscope on the bench
  const sc = new THREE.Group(); sc.position.set(-3.3, by, 3.66); sc.rotation.y = Math.PI; N.add(sc);
  box(sc, 0.38, 0.24, 0.42, ixMat('scope', 0x9aa0a0, 0.5, 0.2), 0, 0.12, 0); box(sc, 0.38, 0.03, 0.44, dgrey, 0, 0.255, 0);
  box(sc, 0.2, 0.17, 0.01, ixMat('scopeb', 0x1c1e20, 0.5), -0.07, 0.13, 0.211);
  ixPlane(sc, 0.17, 0.14, ixFlat('scope', 128, 96, (g, w, h) => { g.fillStyle = '#04140a'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(80,200,120,.25)'; for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, h); g.stroke(); } for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(0, i * 16); g.lineTo(w, i * 16); g.stroke(); } g.strokeStyle = '#60ff90'; g.lineWidth = 2; g.beginPath(); for (let x = 0; x < w; x++) { const y = h / 2 + Math.sin(x / 7) * 22; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }), -0.07, 0.13, 0.218);
  for (let i = 0; i < 6; i++) cyl(sc, 0.017, 0.017, 0.02, ixMat('knob', 0x8a8478, 0.4), 0.09 + (i % 2) * 0.05, 0.19 - Math.floor(i / 2) * 0.05, 0.215, 8).rotation.x = Math.PI / 2;
  // soldering station + iron
  box(N, 0.16, 0.06, 0.2, ixMat('solst', 0x2a2e32, 0.5), -2.75, by + 0.03, 3.5); box(N, 0.1, 0.03, 0.04, ixMat('solw', 0x5a5e62, 0.5), -2.75, by + 0.075, 3.44);
  ixPipe(N, [-2.75, by + 0.09, 3.46], [-2.75, by + 0.14, 3.3], 0.009, ixMat('solh', 0x2a2a2c, 0.6), 6); ixPipe(N, [-2.75, by + 0.14, 3.3], [-2.75, by + 0.17, 3.22], 0.004, steelM, 5);
  sph(N, 0.006, ixMat('solt', 0xff8a30, 0.4, 0, { emissive: 0xff6a10, emissiveIntensity: 1 }), -2.75, by + 0.172, 3.215, 6);
  ixTube(N, [[-2.75, by + 0.05, 3.6], [-2.6, by + 0.01, 3.7], [-2.5, by + 0.01, 3.8]], 0.007, cBlack, 10);
  cyl(N, 0.035, 0.035, 0.02, steelM, -2.55, by + 0.01, 3.5, 12); cyl(N, 0.03, 0.03, 0.04, ixMat('solder', 0xb8bcc0, 0.3, 0.9), -2.45, by + 0.02, 3.52, 10);
  // the half-built gadget: bare circuit board, chips, caps, wires, a battery, a lens tube
  const pcb = ixPrint('pcb', 256, 160, (g, w, h) => { g.fillStyle = '#1f6a3a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d8b050'; g.lineWidth = 2; for (let i = 0; i < 14; i++) { g.beginPath(); let x = 10 + (i * 37) % 230, y = 10 + (i * 53) % 130; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += ((i + k) % 2 ? 1 : -1) * (14 + (i * k) % 30); g.lineTo(x, y); y += 10 + (i * 7 + k * 5) % 24; g.lineTo(x, y); } g.stroke(); } g.fillStyle = '#e0c060'; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(8 + (i * 29) % 240, 8 + (i * 47) % 144, 2.4, 0, 7); g.fill(); } }, 0.5);
  ixPlane(N, 0.24, 0.15, pcb, -2.2, by + 0.012, 3.5, 0, -Math.PI / 2);
  box(N, 0.25, 0.006, 0.16, ixMat('pcbb', 0x174a2a, 0.5), -2.2, by + 0.006, 3.5);
  for (const [x, z, w, d] of [[-2.25, 3.47, 0.05, 0.03], [-2.14, 3.53, 0.035, 0.035], [-2.3, 3.55, 0.03, 0.02]]) box(N, w, 0.012, d, cBlack, x, by + 0.018, z);
  for (let i = 0; i < 3; i++) cyl(N, 0.011, 0.011, 0.03, cBlue, -2.08 + i * 0.03, by + 0.027, 3.46, 8);
  for (let i = 0; i < 4; i++) cyl(N, 0.005, 0.005, 0.016, ixMat('res', 0xc8a070, 0.6), -2.3 + i * 0.02, by + 0.017, 3.43, 5).rotation.z = Math.PI / 2;
  cyl(N, 0.032, 0.032, 0.11, ixMat('lens', 0x2a2e32, 0.4, 0.6), -2.2, by + 0.07, 3.48, 14).rotation.x = Math.PI / 2;
  cyl(N, 0.026, 0.026, 0.01, ixMat('lensg', 0x7aa8d0, 0.05, 0.3, { emissive: 0x2a4a6a, emissiveIntensity: 0.4 }), -2.2, by + 0.07, 3.42, 14).rotation.x = Math.PI / 2;
  ixTube(N, [[-2.08, by + 0.02, 3.55], [-1.95, by + 0.03, 3.62], [-1.85, by + 0.015, 3.5]], 0.004, cRed, 12); ixTube(N, [[-2.1, by + 0.02, 3.57], [-1.97, by + 0.035, 3.66], [-1.85, by + 0.015, 3.5]], 0.004, cBlack, 12);
  box(N, 0.1, 0.04, 0.06, ixMat('batt', 0x2a2a2a, 0.5), -1.85, by + 0.02, 3.5); box(N, 0.09, 0.02, 0.055, ixMat('battg', 0xd8a020, 0.4), -1.85, by + 0.045, 3.5);
  const encl = box(N, 0.2, 0.08, 0.14, ixMat('encl', 0xb8bcb4, 0.5), -2.0, by + 0.04, 3.28); encl.rotation.y = 0.3;
  // a CRT on the bench, magnifier lamp, solder spools, a mug
  ixCRT(S, -1.95, by, 3.72, Math.PI + 0.1, 0.46, ixScreens.term());
  cyl(N, 0.03, 0.03, 0.05, black, -3.62, by + 0.025, 3.9, 8); ixPipe(N, [-3.62, by + 0.05, 3.9], [-3.4, by + 0.4, 3.82], 0.006, steelM, 5); ixPipe(N, [-3.4, by + 0.4, 3.82], [-3.2, by + 0.32, 3.55], 0.006, steelM, 5);
  const ring = add(N, new THREE.TorusGeometry(0.085, 0.01, 6, 20), black, -3.2, by + 0.32, 3.55); ring.rotation.x = Math.PI / 2 - 0.5;
  const lens = add(N, new THREE.CircleGeometry(0.08, 18), GLASS, -3.2, by + 0.32, 3.55); lens.rotation.x = -Math.PI / 2 + 0.5;
  for (let i = 0; i < 2; i++) cyl(N, 0.04, 0.04, 0.05, ixMat('spool' + i, [0xb0b4b8, 0xc8a020][i], 0.35, 0.8), -2.9 + i * 0.1, by + 0.025, 3.85, 12);
  cyl(N, 0.04, 0.035, 0.1, ixMat('mug2', 0x2a5a8a, 0.4), -1.55, by + 0.05, 3.5, 12);
  ixBlob(N, 1.9, 0.9, bx, bz - 0.05, 0, 0.5); ixBlob(N, 0.6, 0.55, -3.72, 3.72, 0, 0.5);
  // stool
  cyl(S, 0.18, 0.18, 0.05, ixMat('stool', 0x2a2a2e, 0.7), -2.4, 0.62, 2.85, 14); for (let i = 0; i < 4; i++) ixBar(S, [-2.4, 0.6, 2.85], [-2.4 + Math.cos(i * 1.57 + 0.4) * 0.2, 0.0, 2.85 + Math.sin(i * 1.57 + 0.4) * 0.2], 0.025, alu);
  cyl(S, 0.02, 0.02, 0.6, alu, -2.4, 0.3, 2.85, 8); ixBlob(N, 0.5, 0.5, -2.4, 2.85, 0, 0.4);

  // --- west wall: AV shelving (VCR, amp, tape deck, cables), then the dressed switchboard wall
  const sh = new THREE.Group(); sh.position.set(-3.78, 0, 2.55); sh.rotation.y = Math.PI / 2; S.add(sh);
  const shM = ixMat('shelf', 0x70767a, 0.45, 0.7);
  for (const sx of [-0.62, 0.62]) for (const sz of [-0.16, 0.16]) box(sh, 0.03, 1.9, 0.03, shM, sx, 0.95, sz);
  for (const y of [0.12, 0.62, 1.07, 1.5, 1.9]) box(sh, 1.28, 0.025, 0.4, shM, 0, y, 0);
  ixGear(sh, 0.46, 0.1, 0.34, -0.3, 0.13, 0, 'amp'); ixGear(sh, 0.46, 0.1, 0.34, -0.3, 0.23, 0.0, 'eq'); ixGear(sh, 0.4, 0.12, 0.3, 0.3, 0.13, 0, 'tape');
  ixGear(sh, 0.44, 0.11, 0.32, -0.28, 0.635, 0, 'vcr'); ixGear(sh, 0.44, 0.11, 0.32, -0.28, 0.745, 0, 'vcr'); ixGear(sh, 0.4, 0.1, 0.32, 0.3, 0.635, 0, 'mix');
  box(sh, 0.44, 0.3, 0.3, ixMat('carton', 0xb89260, 0.9), 0.32, 0.8, 0); box(sh, 0.3, 0.2, 0.3, ixMat('carton', 0xb89260, 0.9), -0.3, 1.2, 0);
  for (let i = 0; i < 5; i++) box(sh, 0.18, 0.025, 0.1, ixMat('tape' + i, [0x2a2a2a, 0x7a2020, 0x2a4a7a, 0x2a2a2a, 0xcfcab8][i], 0.6), 0.34, 1.095 + i * 0.026, 0.0);
  const kt = add(sh, new THREE.TorusGeometry(0.1, 0.02, 6, 18), cBlack, -0.35, 1.13, 0); kt.rotation.x = Math.PI / 2; const kt2 = add(sh, new THREE.TorusGeometry(0.08, 0.016, 6, 18), cGrey, -0.2, 1.12, 0.04); kt2.rotation.x = Math.PI / 2.4;
  for (let i = 0; i < 6; i++) box(sh, 0.08, 0.28, 0.03, ixMat('mnl' + i, [0x1c3a5a, 0x5a1c1c, 0x1c4a2a, 0x2a2a2a, 0x7a6a30, 0x3a2a5a][i], 0.7), 0.08 + i * 0.1, 1.64, 0.0);
  for (let i = 0; i < 4; i++) box(sh, 0.12, 0.34, 0.2, cBlack, -0.45 + i * 0.13, 1.7, 0);
  ixBlob(N, 0.6, 1.4, -3.72, 2.55, 0, 0.45);

  // switchboard wall (the board sits at z -0.05..1.25, y 1.05..1.85)
  const WX = -3.97;
  const wall = (m, w, h, z, y, ry = Math.PI / 2, o = 0) => ixPlane(N, w, h, m, WX + 0.012 + o, y, z, ry);
  // grey breaker panel on the right-hand side, with a paper schedule
  const brk = new THREE.Group(); brk.position.set(WX, 1.45, -0.95); brk.rotation.y = Math.PI / 2; S.add(brk);
  box(brk, 0.52, 0.76, 0.1, ixMat('enc', 0x8a9096, 0.45, 0.5), 0, 0, 0.05); box(brk, 0.46, 0.7, 0.012, ixMat('enc2', 0x9aa0a6, 0.4, 0.5), 0, 0, 0.108);
  ixPlane(brk, 0.38, 0.5, ixPrint('brk', 256, 330, (g, w, h) => {
    g.fillStyle = '#7e848a'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8e4d4'; g.fillRect(90, 14, 76, h - 80); g.fillStyle = '#16171a'; g.fillRect(100, 22, 56, h - 96);
    for (let i = 0; i < 12; i++) { g.fillStyle = i % 5 === 4 ? '#c8c8c8' : '#1a1a1c'; g.fillRect(104, 30 + i * 18, 20, 12); g.fillRect(132, 30 + i * 18, 20, 12); g.fillStyle = '#e8e4d4'; g.fillRect(i % 2 ? 108 : 136, 33 + i * 18, 12, 6); }
    g.fillStyle = '#222'; g.font = 'bold 15px Arial, sans-serif'; g.textAlign = 'left';
    ['LTG', 'HVAC', 'KIT', 'A/V', 'PA', 'SPA'].forEach((t, i) => { g.fillText(t, 8, 46 + i * 36); g.fillText(['EXT', 'CHLR', 'POOL', 'RACK', 'LOBBY', 'SPR'][i], 174, 46 + i * 36); });
    g.fillStyle = '#c8b020'; g.fillRect(8, h - 54, 76, 44); g.fillStyle = '#111'; g.font = 'bold 12px Arial'; g.fillText('PANEL B', 14, h - 34); g.fillText('480/120V', 12, h - 18);
  }, 0.5), 0, 0.02, 0.116);
  box(brk, 0.03, 0.09, 0.02, ixMat('hndl', 0x1c1c1e, 0.5), 0.2, 0.0, 0.12);
  // junction boxes + conduit (EMT) with clamps
  const jb = (z, y) => box(S, 0.1, 0.12, 0.08, ixMat('jb', 0x7a8086, 0.45, 0.7), WX + 0.04, y, z);
  jb(0.3, 2.0); jb(1.0, 2.0); jb(-0.95, 1.95);
  const pipeV = (z, y0, y1) => { ixPipe(S, [WX + 0.025, y0, z], [WX + 0.025, y1, z], 0.016, conduit, 8); for (let y = y0 + 0.2; y < y1; y += 0.5) box(S, 0.03, 0.025, 0.045, conduit, WX + 0.03, y, z); };
  pipeV(0.3, 1.86, 2.78); pipeV(1.0, 1.86, 2.78); pipeV(-0.95, 1.83, 2.78); pipeV(-0.95, 0.0, 1.07);
  ixPipe(S, [WX + 0.025, 2.78, -3.9], [WX + 0.025, 2.78, 3.9], 0.018, conduit, 8); ixPipe(S, [WX + 0.025, 2.7, -3.9], [WX + 0.025, 2.7, 3.9], 0.018, conduit, 8);
  for (let z = -3.6; z < 3.9; z += 0.6) { box(S, 0.03, 0.025, 0.05, conduit, WX + 0.03, 2.78, z); box(S, 0.03, 0.025, 0.05, conduit, WX + 0.03, 2.7, z); }
  ixPipe(S, [WX + 0.025, 1.95, 0.3], [WX + 0.025, 1.95, -0.95], 0.014, conduit, 8); ixPipe(S, [WX + 0.025, 2.0, 1.0], [WX + 0.025, 2.0, 2.3], 0.014, conduit, 8);
  // clipboard, warning labels, a notice, a fire extinguisher, a clock
  const clip = new THREE.Group(); clip.position.set(WX + 0.02, 1.52, 1.75); clip.rotation.y = Math.PI / 2; N.add(clip);
  box(clip, 0.24, 0.32, 0.012, ixMat('clipb', 0x7a5a3a, 0.7), 0, 0, 0.006); box(clip, 0.08, 0.03, 0.02, alu, 0, 0.17, 0.014);
  ixPlane(clip, 0.2, 0.26, ixPrint('clip', 160, 208, (g, w, h) => { g.fillStyle = '#f2eedc'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a2a5a'; g.font = 'bold 15px Arial'; g.fillText('PA ZONE CHECK', 12, 24); g.fillStyle = '#333'; g.font = '13px "Courier New"'; ['1 Lobby    [x]', '2 Spa      [x]', '3 Plan.    [x]', '4 Terrace  [ ]', '5 Kitchen  [x]', '6 Wing     [x]', '', 'ask Dex re: 3'].forEach((t, i) => g.fillText(t, 12, 50 + i * 20)); g.fillStyle = '#a02020'; g.font = 'italic 14px "Segoe Print", cursive'; g.fillText('zone 3 hums', 50, 192); }), 0, -0.02, 0.014);
  const label = (z, y, w, h, bg, fg, lines, size = 12) => ixPlane(N, w, h, ixPrint('lb' + lines.join('') + bg, 128, Math.round(128 * h / w), (g, W, H) => { g.fillStyle = bg; g.fillRect(0, 0, W, H); g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(3, 3, W - 6, H - 6); g.fillStyle = fg; g.font = `bold ${size + 8}px Arial, sans-serif`; g.textAlign = 'center'; lines.forEach((t, i) => g.fillText(t, W / 2, H / 2 - (lines.length - 1) * (size + 4) / 2 + i * (size + 6) + 6)); }), WX + 0.013, y, z, Math.PI / 2);
  label(0.3, 2.0, 0.1, 0.07, '#f0c820', '#111', ['120V'], 10); label(-0.95, 1.99, 0.14, 0.1, '#d02020', '#fff', ['DANGER', 'HIGH', 'VOLTAGE'], 6);
  label(-0.95, 1.12, 0.22, 0.12, '#f0c820', '#111', ['CAUTION', 'ARC FLASH'], 8); label(0.6, 1.0, 0.2, 0.06, '#f2f2ee', '#222', ['DO NOT BLOCK'], 8);
  label(1.55, 1.2, 0.3, 0.14, '#1c5a2a', '#fff', ['SAFETY FIRST'], 8);
  ixSticky(N, WX + 0.02, 1.9, 1.24, Math.PI / 2, 0xe8d860, 0.07, 0.1); ixSticky(N, WX + 0.02, 1.0, -0.08, Math.PI / 2, 0xf0a8c0, 0.07, -0.08);
  const ext = new THREE.Group(); ext.position.set(WX + 0.1, 0, -2.75); S.add(ext);
  cyl(ext, 0.07, 0.07, 0.9, ixMat('extr', 0xb02a20, 0.35, 0.2), 0, 0.5, 0, 14);
  cyl(ext, 0.025, 0.025, 0.07, black, 0, 1.12, 0, 8); box(ext, 0.07, 0.015, 0.03, black, 0.02, 1.16, 0);
  box(ext, 0.015, 0.03, 0.1, ixMat('extbk', 0x333, 0.5, 0.6), -0.09, 1.0, 0); box(ext, 0.015, 0.03, 0.1, ixMat('extbk', 0x333, 0.5, 0.6), -0.09, 0.65, 0);
  ixPlane(N, 0.14, 0.18, ixPrint('extsign', 64, 80, (g, w, h) => { g.fillStyle = '#c42a20'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = 'bold 22px Arial'; g.textAlign = 'center'; g.fillText('FIRE', 32, 34); g.fillText('EXT', 32, 58); }), WX + 0.012, 1.55, -2.75, Math.PI / 2);
  const clock = ixPlane(N, 0.34, 0.34, ixFlat('clock', 128, 128, (g) => { g.fillStyle = '#f0ece0'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.strokeStyle = '#222'; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.stroke(); g.lineWidth = 3; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.beginPath(); g.moveTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50); g.lineTo(64 + Math.sin(a) * 58, 64 - Math.cos(a) * 58); g.stroke(); } g.lineWidth = 5; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + 26, 64 - 20); g.stroke(); g.lineWidth = 3; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 - 10, 64 - 44); g.stroke(); }), WX + 0.014, 2.35, -1.7, Math.PI / 2);
  // the corkboard by the window side of the east wall and the east-wall window with blinds
  // --- east wall: window with venetian blinds, TV cart, binders
  const wy = 1.72, wzc = 0.4, ww = 1.5, wh = 1.0, EX = 3.98;
  const wm = new THREE.MeshBasicMaterial({ map: texDay }); R.skyMats.push(wm);
  const pane = ixPlane(R.g, ww, wh, wm, EX - 0.005, wy, wzc, -Math.PI / 2); pane.userData.nocast = 1;
  const wf = ixMat('wfr', 0xe0ddd2, 0.45, 0.3);
  box(S, 0.1, wh + 0.12, 0.06, wf, EX - 0.04, wy, wzc - ww / 2 - 0.03); box(S, 0.1, wh + 0.12, 0.06, wf, EX - 0.04, wy, wzc + ww / 2 + 0.03);
  box(S, 0.1, 0.06, ww + 0.12, wf, EX - 0.04, wy + wh / 2 + 0.03, wzc); box(S, 0.1, 0.06, ww + 0.12, wf, EX - 0.04, wy - wh / 2 - 0.03, wzc);
  box(S, 0.06, wh, 0.03, wf, EX - 0.05, wy, wzc);
  box(S, 0.16, 0.035, ww + 0.2, wf, EX - 0.08, wy - wh / 2 - 0.07, wzc);
  const bl = once('ixBlind', () => { const c = T.canvas(64, 128), g = c.getContext('2d'); for (let y = 0; y < 128; y += 8) { const gr = g.createLinearGradient(0, y, 0, y + 8); gr.addColorStop(0, '#e6e2d6'); gr.addColorStop(0.8, '#bfbbaf'); gr.addColorStop(1, '#6a6860'); g.fillStyle = gr; g.fillRect(0, y, 64, 7); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y + 7, 64, 1); } const t = T.toTex(c); t.repeat.set(1, 1); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, side: THREE.DoubleSide }); });
  ixPlane(S, ww + 0.05, 0.62, bl, EX - 0.06, wy + wh / 2 - 0.31 + 0.02, wzc, -Math.PI / 2);
  box(S, 0.05, 0.04, ww + 0.1, wf, EX - 0.06, wy + wh / 2 + 0.01, wzc); box(S, 0.04, 0.018, ww - 0.1, ixMat('slatlow', 0xcfcbbf, 0.6), EX - 0.06, wy + wh / 2 - 0.64, wzc);
  ixPipe(S, [EX - 0.05, wy + wh / 2 - 0.02, wzc + ww / 2 - 0.12], [EX - 0.05, wy - 0.15, wzc + ww / 2 - 0.12], 0.003, ixMat('cord', 0xd8d4c4, 0.7), 4);
  ixBlob(N, 0.6, 1.6, 3.55, 0.4, 0, 0.35);
  // TV cart with a CRT TV and VCR, east wall, south end
  const cart = new THREE.Group(); cart.position.set(3.55, 0, 2.7); cart.rotation.y = -Math.PI / 2; S.add(cart);
  for (const sx of [-0.32, 0.32]) for (const sz of [-0.2, 0.2]) { cyl(cart, 0.02, 0.02, 0.9, ixMat('cartl', 0x222428, 0.5, 0.6), sx, 0.5, sz, 8); cyl(cart, 0.03, 0.03, 0.04, black, sx, 0.02, sz, 8); }
  for (const y of [0.35, 0.72, 0.95]) box(cart, 0.72, 0.03, 0.46, ixMat('cartt', 0x2a2c30, 0.5, 0.5), 0, y, 0);
  ixGear(cart, 0.46, 0.09, 0.34, 0, 0.405, 0.02, 'vcr'); ixGear(cart, 0.46, 0.09, 0.34, 0, 0.485, 0.02, 'vcr');
  ixCRT(S, 3.55, 0.965, 2.7, -Math.PI / 2, 0.62, ixScreens.bars(), { body: ixMat('tvbody', 0x2a2b2e, 0.5) });
  for (let i = 0; i < 4; i++) box(cart, 0.1, 0.03, 0.14, ixMat('vhs' + i, [0x1a1a1c, 0xd8d2c0, 0x1a1a1c, 0x2a2a2a][i], 0.6), -0.2 + i * 0.06, 0.745 + (i % 2) * 0.03, 0.02);
  ixBlob(N, 0.9, 0.7, 3.55, 2.7, 0, 0.4);
  // --- binder shelf unit on the east wall, between the cart and the window
  // (kept short: the cart holds that end)
  // --- mini fridge + coffee maker, west wall near the file cabinet
  const fr = new THREE.Group(); fr.position.set(-3.72, 0, -2.2); fr.rotation.y = Math.PI / 2; S.add(fr);
  box(fr, 0.5, 0.86, 0.5, ixMat('fridge', 0xe4e2da, 0.35, 0.1), 0, 0.43, 0); box(fr, 0.5, 0.012, 0.01, ixMat('frl', 0x8a8a86, 0.4), 0, 0.65, 0.252); box(fr, 0.025, 0.25, 0.03, alu, 0.2, 0.4, 0.27);
  ixPlane(fr, 0.1, 0.12, ixPrint('fmag', 64, 76, (g, w, h) => { g.fillStyle = '#f2eedc'; g.fillRect(0, 0, w, h); g.fillStyle = '#a02020'; g.font = 'bold 14px Arial'; g.textAlign = 'center'; g.fillText('PLEASE', 32, 24); g.fillText('LABEL', 32, 42); g.fillText('YOUR LUNCH', 32, 60); }), -0.12, 0.5, 0.254);
  ixSticky(fr, 0.1, 0.62, 0.254, 0, 0xf0a8c0, 0.06, 0.1);
  box(fr, 0.2, 0.025, 0.24, black, -0.1, 0.873, 0); box(fr, 0.2, 0.2, 0.05, black, -0.1, 0.99, -0.1); cyl(fr, 0.06, 0.06, 0.13, ixMat('carafe', 0x3a2410, 0.15, 0, { transparent: true, opacity: 0.8 }), -0.1, 0.95, 0.04, 12);
  cyl(fr, 0.062, 0.062, 0.02, black, -0.1, 1.02, 0.04, 12);
  for (let i = 0; i < 2; i++) cyl(fr, 0.03, 0.026, 0.07, ixMat('cup' + i, [0xe0d8c0, 0x2a6a4a][i], 0.4), 0.1 + i * 0.07, 0.9, 0.0 + i * 0.07, 10);
  box(fr, 0.1, 0.04, 0.1, ixMat('cartn', 0xe8e0c0, 0.9), 0.12, 0.88, -0.15);
  ixBlob(N, 0.7, 0.7, -3.7, -2.2, 0, 0.4);
  // file cabinet details: stack of papers on top, a plant that is giving up
  box(S, 0.34, 0.12, 0.26, ixMat('manila', 0xc8a870, 0.85), -3.6, 1.36, -3.3); box(S, 0.3, 0.1, 0.2, paperM, -3.6, 1.47, -3.3).rotation.y = 0.2;
  cyl(S, 0.07, 0.055, 0.12, ixMat('pot', 0x9a4a2a, 0.8), -3.48, 1.34, -3.5, 10); for (let i = 0; i < 5; i++) ixBar(S, [-3.48, 1.4, -3.5], [-3.48 + Math.cos(i * 1.3) * 0.09, 1.55 - (i % 2) * 0.04, -3.5 + Math.sin(i * 1.3) * 0.09], 0.012, ixMat('plantd', 0x6a7a3a, 0.8));
  // stacked boxes already exist; add labels + tape and a few more cables on them
  // posters, calendar, schedule: period, plain text
  const poster = (key, w, h, x, y, z, ry, draw) => { ixPlane(N, w, h, ixPrint('po' + key, 256, Math.round(256 * h / w), draw), x, y, z, ry); };
  const ph1 = (g, w, h, bg, fg, lines, sz = 34) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = `bold ${sz}px Impact, Arial Black, sans-serif`; g.textAlign = 'center'; lines.forEach((l, i) => g.fillText(l, w / 2, 56 + i * (sz + 10))); g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(10, 10, w - 20, h - 20); };
  poster('net', 0.6, 0.42, -3.97, 1.55, -3.1, Math.PI / 2, (g, w, h) => { g.fillStyle = '#f0eee4'; g.fillRect(0, 0, w, h); g.strokeStyle = '#2a3a6a'; g.lineWidth = 2; const n = [[128, 40], [50, 100], [206, 100], [30, 160], [90, 160], [170, 160], [226, 160]]; n.forEach(([x, y]) => { g.fillStyle = '#2a3a6a'; g.fillRect(x - 12, y - 8, 24, 16); }); [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6]].forEach(([a, b]) => { g.beginPath(); g.moveTo(n[a][0], n[a][1]); g.lineTo(n[b][0], n[b][1]); g.stroke(); }); g.fillStyle = '#2a3a6a'; g.font = 'bold 14px Arial'; g.textAlign = 'left'; g.fillText('RESORT NETWORK  rev. 4', 8, 16); g.font = '11px Arial'; g.fillText('SWITCH', 104, 64); g.fillText('FRONT DESK', 18, 190); g.fillText('SPA', 200, 190); });
  poster('jam', 0.6, 0.85, -0.6, 1.9, -3.99, 0, (g, w, h) => ph1(g, w, h, '#274a3a', '#f0e8d0', ['SUMMER', 'JAM', '2002', 'LAKESHORE', 'PAVILION'], 30));
  poster('back', 0.52, 0.34, 3.0, 1.95, -3.99, 0, (g, w, h) => { g.fillStyle = '#e8d860'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; g.font = 'bold 40px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('BACK UP', w / 2, 70); g.fillText('YOUR DATA', w / 2, 120); g.font = '22px Arial'; g.fillText('(it will be too late)', w / 2, 170); });
  poster('cal', 0.34, 0.46, 3.97, 1.4, -1.0, -Math.PI / 2, (g, w, h) => { g.fillStyle = '#f2eedc'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a5a8a'; g.fillRect(0, 0, w, 90); g.fillStyle = '#fff'; g.font = 'bold 34px Georgia'; g.textAlign = 'center'; g.fillText('AUGUST', w / 2, 58); g.fillStyle = '#222'; g.font = '16px Arial'; for (let i = 0; i < 35; i++) { const x = 20 + (i % 7) * 33, y = 124 + Math.floor(i / 7) * 36; g.fillText(i < 31 ? String(i + 1) : '', x, y); } g.strokeStyle = '#b02020'; g.lineWidth = 3; g.beginPath(); g.arc(20 + 4 * 33, 118 + 36 * 2 - 0, 14, 0, 7); g.stroke(); });
  // a laminated schedule by the door
  poster('sched', 0.3, 0.4, 0.95, 1.5, 3.985, Math.PI, (g, w, h) => { g.fillStyle = '#f4f2ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; g.font = 'bold 20px Arial'; g.textAlign = 'center'; g.fillText('GALA SETUP', w / 2, 34); g.font = '15px "Courier New"'; g.textAlign = 'left'; ['Thu  sound check', 'Fri  lights + dome', 'Sat  GALA 8pm', 'Sun  teardown'].forEach((t, i) => g.fillText(t, 12, 80 + i * 32)); });
  // wall-hung speakers on brackets, high on the north wall
  for (const x of [-3.3, 3.5]) { box(N, 0.22, 0.34, 0.2, ixMat('wspk', 0x1a1a1c, 0.6), x, 2.25, -3.88); ixPlane(N, 0.16, 0.26, ixMat('wspkg', 0x2c2c2e, 0.9), x, 2.25, -3.779); cyl(N, 0.055, 0.055, 0.02, ixMat('cone', 0x3a3a3a, 0.6), x, 2.18, -3.777, 12).rotation.x = Math.PI / 2; cyl(N, 0.025, 0.025, 0.02, ixMat('cone', 0x3a3a3a, 0.6), x, 2.32, -3.777, 10).rotation.x = Math.PI / 2; ixBar(N, [x, 2.43, -3.95], [x, 2.43, -3.84], 0.04, grey); }
  // PA speaker cabinet in the NE corner, with horn
  const pa = new THREE.Group(); pa.position.set(3.42, 0, -3.55); pa.rotation.y = -0.6; S.add(pa);
  box(pa, 0.5, 0.8, 0.4, ixMat('pacab', 0x18191b, 0.8), 0, 0.4, 0); ixPlane(pa, 0.44, 0.72, ixMat('pagrille', 0x282a2c, 0.9, 0.2), 0, 0.4, 0.202); cyl(pa, 0.15, 0.15, 0.02, ixMat('cone', 0x3a3a3a, 0.6), 0, 0.28, 0.207, 18).rotation.x = Math.PI / 2; cyl(pa, 0.06, 0.1, 0.1, ixMat('horn', 0x2a2a2c, 0.5, 0.4), 0, 0.62, 0.25, 14).rotation.x = Math.PI / 2;
  for (const y of [0.0, 0.8]) for (const x of [-0.21, 0.21]) box(pa, 0.04, 0.04, 0.04, steelM, x, y + (y ? 0.02 : 0.0), 0.17);
  ixBlob(N, 0.7, 0.6, 3.42, -3.55, -0.6, 0.45);
  // tool and part bins on the floor, a cardboard box of spare cables near the stack
  box(S, 0.4, 0.3, 0.3, ixMat('bin', 0x3a4a5a, 0.7), -3.4, 0.15, -1.7); box(S, 0.42, 0.04, 0.32, ixMat('binlid', 0x2a3a4a, 0.7), -3.4, 0.32, -1.7);
  // contact shadows for the main pieces
  ixBlob(N, 3.6, 1.3, 0, -3.4, 0, 0.45); ixBlob(N, 0.9, 0.8, -3.6, -3.3, 0, 0.5); ixBlob(N, 0.9, 1.0, 3.35, -2.6, 0, 0.5); ixBlob(N, 1.0, 2.0, 3.25, 0.4, 0, 0.4); ixBlob(N, 0.9, 0.8, -2.8, -0.8, 0, 0.4);
  ixBake(S); ixBake(N); ixBake(K);
}


function buildTech() {
  const R = mkRoom('tech', { p: [1, 6, 3], t: [0, 0, -1], s: 6, day: [0xf0f0e8, 1.3], night: [0xd0d8e0, 0.6] });
  rectRoom(R, -4, 4, -4, 4, 2.9, { floor: M(0xffffff, 0.95, 0, { t: TX.carpetOffice(), rep: [8, 8], bump: 0.005 }), wall: M(0xffffff, 0.8, 0, { t: TX.plasterCool(), bump: 0.01 }) });
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
  const rk = new THREE.Group(); rk.position.set(3.35, 0, -2.6); rk.rotation.y = -Math.PI / 2; R.g.add(rk);
  box(rk, 0.7, 2.1, 0.8, M(0x1a1c1e, 0.5, 0.5), 0, 1.05, 0);
  const leds = [];
  for (let i = 0; i < 24; i++) leds.push(box(rk, 0.03, 0.015, 0.01, M(0x000000, 0.3, 0, { emissive: i % 3 ? 0x30ff70 : 0xffa020, emissiveIntensity: 1.2 }), -0.28 + (i % 6) * 0.1, 0.4 + Math.floor(i / 6) * 0.45, 0.41));
  updaters.push((dt, t) => { leds.forEach((l, i) => { l.visible = Math.sin(t * (3 + (i % 5)) + i) > -0.3; }); });
  const sb = new THREE.Group(); sb.position.set(-3.95, 1.45, 0.6); sb.rotation.y = Math.PI / 2; R.g.add(sb);
  box(sb, 1.3, 0.8, 0.08, M(0x6a6e6a, 0.55, 0.6, { t: TX.steel(), bump: 0.003 }), 0, 0, 0);
  for (let i = 0; i < 6; i++) { box(sb, 0.05, 0.12, 0.05, STEEL, -0.45 + i * 0.16, 0.06, 0.06); sph(sb, 0.018, M(0, 0.3, 0, { emissive: 0x40ff60, emissiveIntensity: 1 }), -0.45 + i * 0.16, 0.24, 0.05, 8); }
  box(sb, 0.09, 0.16, 0.06, M(0xa02020, 0.5), 0.5, -0.2, 0.07);
  plaqueMesh(sb, 'PUBLIC ADDRESS', 0.6, 0.08, 0, -0.3, 0.045, 0, { size: 0.34 });
  ixPlane(sb, 0.98, 0.05, ixFlat('zlab', 1024, 52, (g, W, H) => { g.fillStyle = '#e8e4d0'; g.fillRect(0, 0, W, H); g.fillStyle = '#1a1a1a'; g.font = 'bold 30px Arial, sans-serif'; g.textAlign = 'center'; ['LOBBY', 'SPA', 'PLAN.', 'TERR.', 'KITCH.', 'WING'].forEach((t, i) => g.fillText(t, ((-0.45 + i * 0.16) + 0.465) / 0.98 * W, 38)); }), 0.025, -0.035, 0.052);
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
  ixTechDress(R);
  door(R, 0, 3.95, 'Lobby', 'exit_tech', [0, 0]);
  lamps(R, [0, 2.3, -0.5, 0xf4f4ec, 12, 12], [0, 1.4, -3, 0x8ab0d0, 1.2, 3]);
  return R;
}

// a warm patch of window light on the floor (additive, no shadow)
function ixPool(R, w, d, x, z, o = 0.2, rot = 0) {
  const m = once('ixLight' + o, () => { const c = T.canvas(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(255,230,170,.9)'); gr.addColorStop(1, 'rgba(255,230,170,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 }); });
  const p = ixPlane(R.g, w, d, m, x, 0.014, z, 0, -Math.PI / 2); p.userData.nocast = 1; return p;
}
// ---------- Archive (Opal's room) ----------
// A tall mahogany bookcase stocked with ledgers, archive boxes and rolled drawings. Goes under a baking group.
function ixBookcase(BK, x, z, ry, seed) {
  const sh = new THREE.Group(); sh.position.set(x, 0, z); sh.rotation.y = ry; BK.add(sh);
  const mh = once('ixAMah', () => mat.mahog([1, 2])), dark = ixMat('abdark', 0x1e0e06, 0.8), rr = T.rng(seed);
  const spines = [0x5a1a1a, 0x1a3a2a, 0x2a2a4a, 0x6a4a2a, 0x3a2a1a, 0x7a6a4a, 0x2a4a5a, 0x4a2438].map((c, i) => ixMat('abk' + i, c, 0.75));
  const gold = ixMat('abgold', 0xc2a04a, 0.35, 0.7), cream = ixMat('abcream', 0xe6dcc0, 0.85), kraft = ixMat('abkraft', 0xb89868, 0.9), grey = ixMat('abgrey', 0x8a8c86, 0.85), paper = ixMat('abpaper', 0xe8dfc6, 0.9), tie = ixMat('abtie', 0x8a2a28, 0.7);
  // carcase
  for (const s of [-1, 1]) box(sh, 0.05, 2.5, 0.44, mh, s * 1.1, 1.25, 0);
  box(sh, 2.2, 2.5, 0.02, dark, 0, 1.25, -0.2);
  box(sh, 2.3, 0.1, 0.46, mh, 0, 0.05, 0.01); box(sh, 2.3, 0.07, 0.46, mh, 0, 2.5, 0.0); box(sh, 2.4, 0.09, 0.5, mh, 0, 2.58, 0.02); box(sh, 2.32, 0.05, 0.47, mh, 0, 2.52, 0.0);
  const rows = [0.1, 0.56, 1.02, 1.48, 1.94], top = 2.47;
  for (const y of rows) box(sh, 2.16, 0.03, 0.4, mh, 0, y, 0.0);
  rows.forEach((y0, r) => {
    const room = (r < 4 ? rows[r + 1] : top) - y0 - 0.03;
    let bx = -1.07;
    while (bx < 1.0) {
      const k = rr();
      if (k < 0.72) { // a run of books
        const n = 4 + Math.floor(rr() * 8), led = rr() < 0.35;
        for (let i = 0; i < n && bx < 1.02; i++) {
          const w = led ? 0.06 + rr() * 0.03 : 0.025 + rr() * 0.03, h = Math.min(room - 0.04, (led ? 0.3 : 0.2) + rr() * 0.14), d = led ? 0.3 : 0.2 + rr() * 0.08;
          const b = box(sh, w, h, d, spines[Math.floor(rr() * spines.length)], bx + w / 2, y0 + 0.015 + h / 2, 0.02 - (0.3 - d) * 0.4);
          const front = 0.02 - (0.3 - d) * 0.4 + d / 2;
          if (led) { box(sh, w + 0.004, 0.012, 0.004, gold, bx + w / 2, y0 + 0.015 + h * 0.82, front); box(sh, w + 0.004, 0.012, 0.004, gold, bx + w / 2, y0 + 0.015 + h * 0.2, front); box(sh, w * 0.7, h * 0.18, 0.004, cream, bx + w / 2, y0 + 0.015 + h * 0.52, front); }
          else if (rr() < 0.3) box(sh, w * 0.8, 0.04, 0.004, cream, bx + w / 2, y0 + 0.015 + h * 0.6, front);
          if (i === n - 1 && rr() < 0.4) { b.rotation.z = -0.18; b.position.x += 0.02; }
          bx += w + 0.003;
        }
        bx += 0.02 + rr() * 0.05;
      } else if (k < 0.86) { // archive box with a label
        const w = 0.26, h = Math.min(room - 0.05, 0.3), g = rr() < 0.5 ? kraft : grey;
        box(sh, w, h, 0.3, g, bx + w / 2 + 0.01, y0 + 0.015 + h / 2, 0.02); box(sh, w - 0.02, 0.012, 0.31, g, bx + w / 2 + 0.01, y0 + 0.015 + h + 0.005, 0.02);
        box(sh, 0.15, 0.07, 0.004, cream, bx + w / 2 + 0.01, y0 + 0.015 + h * 0.62, 0.173); box(sh, 0.11, 0.008, 0.005, dark, bx + w / 2 + 0.01, y0 + 0.015 + h * 0.62, 0.173);
        bx += w + 0.04;
      } else if (k < 0.94) { // rolled drawings, lying down
        for (let i = 0; i < 3; i++) { const rl = 0.4 + rr() * 0.1; const c = cyl(sh, 0.034, 0.034, rl, paper, bx + 0.25 + (i === 2 ? 0.0 : (i - 0.5) * 0.072), y0 + 0.015 + 0.036 + (i === 2 ? 0.065 : 0), 0.02, 10); c.rotation.z = Math.PI / 2; cyl(sh, 0.036, 0.036, 0.014, tie, bx + 0.25 + (i === 2 ? 0.0 : (i - 0.5) * 0.072) + 0.1, y0 + 0.015 + 0.036 + (i === 2 ? 0.065 : 0), 0.02, 10).rotation.z = Math.PI / 2; }
        bx += 0.6;
      } else bx += 0.12 + rr() * 0.16;
    }
  });
  // rolled drawings standing on top
  for (let i = 0; i < 4; i++) { const c = cyl(sh, 0.035, 0.035, 0.4 + rr() * 0.1, paper, -0.7 + i * 0.12 + rr() * 0.4, 2.8, 0.0, 10); c.rotation.z = (rr() - 0.5) * 0.3; }
  box(sh, 0.34, 0.2, 0.28, kraft, 0.7, 2.72, 0.0); box(sh, 0.15, 0.06, 0.004, cream, 0.7, 2.74, 0.142);
}
// framed architectural drawings (elevation, section, plan) as printed materials
const ixDwg = kind => ixPrint('dwg' + kind, 384, 256, (g, w, h) => {
  const paper = kind === 'plan';
  g.fillStyle = paper ? '#23466e' : '#e6dcc2'; g.fillRect(0, 0, w, h);
  g.strokeStyle = paper ? 'rgba(220,230,240,.9)' : '#3a3224'; g.fillStyle = g.strokeStyle; g.lineWidth = 1.6;
  g.strokeRect(10, 10, w - 20, h - 20);
  if (kind === 'elev') { // the dome from the lake
    g.beginPath(); g.moveTo(40, 190); g.lineTo(344, 190); g.stroke();
    g.beginPath(); g.arc(192, 120, 66, Math.PI, 0); g.stroke(); g.beginPath(); g.moveTo(126, 120); g.lineTo(126, 190); g.moveTo(258, 120); g.lineTo(258, 190); g.stroke();
    for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(192, 56); g.quadraticCurveTo(192 + i * 22, 90, 192 + i * 22, 120); g.stroke(); }
    g.strokeRect(60, 150, 70, 40); g.strokeRect(254, 150, 70, 40); for (let i = 0; i < 6; i++) { g.strokeRect(70 + i * 10, 160, 6, 20); g.strokeRect(264 + i * 10, 160, 6, 20); }
    for (let i = 0; i < 9; i++) g.strokeRect(142 + i * 11, 135, 7, 55);
    g.font = '11px "Courier New", monospace'; g.fillText('SOUTH ELEVATION', 24, 220); g.fillText('O. FINCH 1998', 250, 232);
  } else if (kind === 'sect') {
    g.beginPath(); g.arc(192, 190, 120, Math.PI, 0); g.stroke(); g.beginPath(); g.arc(192, 190, 110, Math.PI, 0); g.stroke(); g.beginPath(); g.moveTo(40, 190); g.lineTo(344, 190); g.stroke();
    for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(192, 190); g.lineTo(192 + Math.cos(Math.PI + i * Math.PI / 6) * 118, 190 + Math.sin(Math.PI + i * Math.PI / 6) * 118); g.stroke(); }
    g.setLineDash([4, 4]); g.beginPath(); g.moveTo(192, 40); g.lineTo(192, 205); g.stroke(); g.setLineDash([]);
    for (let i = 0; i < 5; i++) g.strokeRect(70 + i * 50, 196, 30, 12);
    g.font = '11px "Courier New", monospace'; g.fillText('SECTION A-A', 24, 232); g.fillText('SCALE 1:100', 280, 232);
  } else {
    g.strokeStyle = 'rgba(220,230,240,.2)'; for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = 'rgba(230,238,246,.95)'; g.lineWidth = 2; g.beginPath(); g.arc(192, 120, 84, 0, 7); g.stroke(); g.beginPath(); g.arc(192, 120, 28, 0, 7); g.stroke(); g.beginPath(); g.arc(192, 120, 60, 0, 7); g.stroke();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(192 + Math.cos(a) * 28, 120 + Math.sin(a) * 28); g.lineTo(192 + Math.cos(a) * 110, 120 + Math.sin(a) * 110); g.stroke(); }
    g.strokeRect(40, 172, 110, 46); g.strokeRect(234, 172, 110, 46); g.fillStyle = 'rgba(230,238,246,.95)'; g.font = '11px "Courier New", monospace'; g.fillText('GROUND FLOOR PLAN  1:200', 24, 36);
  }
}, 0.85);

function ixArchiveDress(R) {
  const S = ixGroup(R, true), N = ixGroup(R, true), K = ixGroup(R), BK = ixGroup(R);
  const mh = once('ixAMah', () => mat.mahog([1, 2])), oak = ixMat('aoak', 0x8a5a30, 0.55), dkw = ixMat('adkw', 0x3a1c0e, 0.55), brass = ixMat('abrass', 0xc2a04a, 0.3, 1), gold = ixMat('abgold', 0xc2a04a, 0.35, 0.7);
  const paper = ixMat('abpaper', 0xe8dfc6, 0.9), tie = ixMat('abtie', 0x8a2a28, 0.7), kraft = ixMat('abkraft', 0xb89868, 0.9), cream = ixMat('abcream', 0xe6dcc0, 0.85);
  const H = 3.2;
  // bookcases (hotspot sphere stays in buildArchive)
  ixBookcase(BK, -4.28, 0.9, Math.PI / 2, 12); ixBookcase(BK, -1.6, 3.78, Math.PI, 31); ixBookcase(BK, -4.28, -2.8, Math.PI / 2, 47); ixBookcase(BK, 3.3, 3.78, Math.PI, 5);
  // ceiling: two heavy beams, a plaster rose and a brass pendant over the room's middle
  const beamM = ixMat('abeam', 0x3a1c0e, 0.6);
  for (const z of [-2.5, 1.6]) { box(N, 9, 0.2, 0.26, beamM, 0, H - 0.1, z); box(N, 9, 0.04, 0.34, ixMat('wgold', 0xb8964a, 0.55, 0.15), 0, H - 0.21, z); }
  lathe(N, [[0.001, 0], [0.5, 0.0], [0.5, 0.02], [0.3, 0.05], [0.12, 0.09], [0.001, 0.09]], ixMat('rose', 0xe8e0d0, 0.8), 0, H - 0.09, -0.5, 28).rotation.x = Math.PI;
  const pend = new THREE.Group(); pend.position.set(0, H, -0.5); N.add(pend);
  cyl(pend, 0.012, 0.012, 0.6, brass, 0, -0.35, 0, 6); lathe(pend, [[0.001, 0], [0.07, -0.02], [0.05, -0.08], [0.001, -0.1]], brass, 0, -0.62, 0, 12);
  const glow = ixMat('aglow', 0xfff0cc, 0.4, 0, { emissive: 0xffd488, emissiveIntensity: 0.5, side: THREE.DoubleSide });
  const ring = add(pend, new THREE.TorusGeometry(0.36, 0.014, 6, 36), brass, 0, -0.72, 0); ring.rotation.x = Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3, x = Math.cos(a) * 0.36, z = Math.sin(a) * 0.36;
    ixBar(pend, [0, -0.66, 0], [x, -0.72, z], 0.012, brass);
    lathe(pend, [[0.03, 0], [0.07, 0.06], [0.085, 0.16], [0.075, 0.18]], glow, x, -0.86, z, 14);
    cyl(pend, 0.012, 0.012, 0.12, brass, x, -0.78, z, 6);
  }
  lathe(pend, [[0.001, 0], [0.12, 0.02], [0.1, 0.12], [0.001, 0.15]], glow, 0, -0.88, 0, 18);
  // plan chest (oak, six drawers, brass pulls) on the west wall between the bookcases, rolls and a banker's lamp on top
  const pc = new THREE.Group(); pc.position.set(-4.04, 0, -0.95); pc.rotation.y = Math.PI / 2; K.add(pc);
  box(pc, 1.2, 0.84, 0.82, oak, 0, 0.5, 0); box(pc, 1.28, 0.05, 0.9, ixMat('aoakT', 0x9a6a38, 0.45), 0, 0.945, 0);
  for (const sx of [-0.55, 0.55]) for (const sz of [-0.34, 0.34]) cyl(pc, 0.035, 0.03, 0.1, dkw, sx, 0.05, sz, 8);
  box(pc, 1.18, 0.1, 0.8, dkw, 0, 0.1, 0);
  for (let i = 0; i < 6; i++) {
    const y = 0.2 + i * 0.12; box(pc, 1.1, 0.108, 0.02, ixMat('adr', 0x7a4a24, 0.5), 0, y + 0.06, 0.412); box(pc, 1.04, 0.07, 0.01, ixMat('adr2', 0x6a3c1c, 0.5), 0, y + 0.06, 0.424);
    box(pc, 0.22, 0.012, 0.025, brass, 0, y + 0.075, 0.44); box(pc, 0.07, 0.04, 0.006, cream, 0, y + 0.03, 0.426);
  }
  for (let i = 0; i < 3; i++) { const c = cyl(pc, 0.04, 0.04, 0.8 - i * 0.1, paper, -0.1 + i * 0.09, 1.0 + (i === 2 ? 0.06 : 0), -0.1 + (i === 2 ? 0 : 0.04), 10); c.rotation.z = Math.PI / 2; c.rotation.y = 0.05; cyl(pc, 0.043, 0.043, 0.02, tie, -0.1 + i * 0.09 + 0.2, 1.0 + (i === 2 ? 0.06 : 0), -0.1 + (i === 2 ? 0 : 0.04), 10).rotation.z = Math.PI / 2; }
  const bl = new THREE.Group(); bl.position.set(0.45, 0.97, 0.05); pc.add(bl); // banker's lamp
  cyl(bl, 0.1, 0.11, 0.025, brass, 0, 0.012, 0, 18); cyl(bl, 0.012, 0.012, 0.28, brass, 0, 0.16, 0, 6);
  const sh = add(bl, new THREE.CylinderGeometry(0.1, 0.1, 0.3, 14, 1, true, 0, Math.PI), ixMat('abshade', 0x1f6a3c, 0.2, 0.1, { emissive: 0x1a6a38, emissiveIntensity: 0.6, side: THREE.DoubleSide }), 0, 0.32, 0.04); sh.rotation.z = Math.PI / 2; sh.rotation.y = Math.PI / 2;
  box(pc, 0.3, 0.08, 0.22, ixMat('abbk', 0x1c3a5a, 0.7), -0.45, 0.995, 0.05); box(pc, 0.26, 0.05, 0.2, ixMat('abbk2', 0x5a1c1c, 0.7), -0.45, 1.06, 0.05).rotation.y = 0.2;
  // drafting stool at the drafting table, and a few pencils and tools on its sloped top
  const st = new THREE.Group(); st.position.set(1.15, 0, -1.55); K.add(st);
  cyl(st, 0.2, 0.2, 0.05, ixMat('ast', 0x2a2420, 0.7), 0, 0.72, 0, 16); cyl(st, 0.02, 0.02, 0.7, brass, 0, 0.36, 0, 8); const sr = add(st, new THREE.TorusGeometry(0.17, 0.012, 6, 18), brass, 0, 0.3, 0); sr.rotation.x = Math.PI / 2;
  for (let i = 0; i < 4; i++) ixBar(st, [0, 0.4, 0], [Math.cos(i * 1.57 + 0.4) * 0.24, 0.0, Math.sin(i * 1.57 + 0.4) * 0.24], 0.025, ixMat('astl', 0x3a2c1e, 0.6));
  // rolled drawings in a barrel by the south bookcase, and boxes of ledgers stacked against the west wall
  const bar = lathe(K, [[0.001, 0], [0.2, 0], [0.22, 0.2], [0.24, 0.45], [0.23, 0.7], [0.001, 0.7]], ixMat('abarrel', 0x6a4a28, 0.7, 0, { side: THREE.DoubleSide }), -3.7, 0, 3.45, 20);
  for (const y of [0.15, 0.55]) { const r = add(K, new THREE.TorusGeometry(0.225, 0.012, 6, 20), brass, -3.7, y, 3.45); r.rotation.x = Math.PI / 2; }
  for (let i = 0; i < 6; i++) { const a = i * 1.0; const c = cyl(K, 0.035, 0.035, 0.8 + (i % 3) * 0.1, paper, -3.7 + Math.cos(a) * 0.1, 0.95, 3.45 + Math.sin(a) * 0.1, 10); c.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12); }
  for (const [x, y, z, r] of [[-4.12, 0.14, 2.85, 0.1], [-4.1, 0.14, 3.2, -0.05], [-4.1, 0.42, 3.0, 0.15]]) { box(K, 0.4, 0.28, 0.32, kraft, x, y, z).rotation.y = r; box(K, 0.12, 0.07, 0.004, cream, x + 0.2, y + 0.02, z + 0.0).rotation.y = r + Math.PI / 2; }
  // sloped-top props (the table top is tilted 0.35 rad about x at y 1.0; table at 1.6,-2.4)
  const tt = new THREE.Group(); tt.position.set(1.6, 1.0, -2.4); tt.rotation.x = 0.35; N.add(tt);
  box(tt, 1.1, 0.008, 0.035, ixMat('aruler', 0xd8c890, 0.5), 0.0, 0.03, 0.34); box(tt, 0.3, 0.006, 0.26, ixMat('atri', 0xd8e8e0, 0.15, 0, { transparent: true, opacity: 0.45 }), -0.5, 0.027, 0.0).rotation.y = 0.5;
  for (let i = 0; i < 3; i++) cyl(tt, 0.004, 0.004, 0.16, ixMat('apen' + i, [0xc8a020, 0x2a6a3a, 0x8a2a2a][i], 0.5), 0.45 + i * 0.015, 0.03, 0.12 + i * 0.03, 5).rotation.z = Math.PI / 2 + i * 0.25;
  box(tt, 0.05, 0.015, 0.03, ixMat('aeras', 0xe8e0e0, 0.9), 0.56, 0.03, 0.2);
  // framed drawings
  ixFrame(N, -3.2, 1.9, -3.975, 0, 0.9, 0.6, ixDwg('elev'));
  ixFrame(N, 0.78, 1.9, -3.975, 0, 0.42, 0.56, ixDwg('sect'));
  ixFrame(N, 4.475, 1.95, -0.05, -Math.PI / 2, 0.8, 0.55, ixDwg('plan'));
  ixFrame(N, -4.475, 1.95, -0.95, Math.PI / 2, 0.9, 0.62, ixDwg('sect'));
  ixFrame(N, 4.475, 1.95, -3.0, -Math.PI / 2, 0.55, 0.4, ixDwg('elev'));
  // globe on a floor stand by the east wall
  const gl = new THREE.Group(); gl.position.set(3.7, 0, -0.05); K.add(gl);
  for (let i = 0; i < 3; i++) ixBar(gl, [0, 0.55, 0], [Math.cos(i * 2.09) * 0.22, 0.0, Math.sin(i * 2.09) * 0.22], 0.03, mh);
  cyl(gl, 0.02, 0.02, 0.5, mh, 0, 0.8, 0, 8); const gr = add(gl, new THREE.TorusGeometry(0.27, 0.012, 6, 28), brass, 0, 1.02, 0); gr.rotation.set(0, Math.PI / 2, 0.4);
  sph(gl, 0.24, ixMat('globe', 0xffffff, 0.55, 0, { map: once('ixGlobeT', () => T.textCanvas(256, 128, (g, w, h) => { g.fillStyle = '#c8b484'; g.fillRect(0, 0, w, h); g.fillStyle = '#8aa890'; for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(((i * 61) % 240) + 8, 24 + ((i * 37) % 80), 18 + (i % 3) * 9, 10 + (i % 2) * 8, i, 0, 7); g.fill(); } g.fillStyle = '#6a8ca8'; g.globalAlpha = 0.5; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10); g.globalAlpha = 1; })) }), 0, 1.02, 0, 20).rotation.z = 0.4;
  // the dome model's details (the hotspot group keeps its tag): plinth, columns, plaque
  // dust motes of window light on the floor
  ixPool(R, 2.6, 2.0, -1.2, -2.3, 0.2);
  // contact shadows
  ixBlob(N, 1.4, 0.9, -4.05, -0.95, 0, 0.5); ixBlob(N, 1.7, 1.0, -2.9, -3.3, 0, 0.45); ixBlob(N, 1.5, 1.0, 1.6, -2.4, 0, 0.4); ixBlob(N, 0.9, 0.9, 3.0, 1.2, 0, 0.4); ixBlob(N, 0.5, 0.5, -3.7, 3.45, 0, 0.4); ixBlob(N, 0.5, 0.5, 3.7, -0.05, 0, 0.35); ixBlob(N, 0.5, 0.5, 1.15, -1.55, 0, 0.4);
  ixBake(S); ixBake(N); ixBake(K); ixBake(BK);
}

// ---------- Suite 2 (Nova's room) ----------
const ixRug = () => ixPrint('rug', 512, 352, (g, w, h) => {
  g.fillStyle = '#5a2230'; g.fillRect(0, 0, w, h);
  const rr = T.rng(4); for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${rr() < 0.5 ? '255,220,200' : '20,0,10'},${0.03 + rr() * 0.05})`; g.fillRect(rr() * w, rr() * h, 3, 1); }
  g.strokeStyle = '#d8c8a0'; g.lineWidth = 6; g.strokeRect(22, 22, w - 44, h - 44); g.strokeStyle = '#1f2f4a'; g.lineWidth = 14; g.strokeRect(40, 40, w - 80, h - 80); g.strokeStyle = '#d8c8a0'; g.lineWidth = 3; g.strokeRect(54, 54, w - 108, h - 108);
  g.fillStyle = '#d8c8a0'; for (let x = 70; x < w - 60; x += 24) { for (const y of [47, h - 47]) { g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.fill(); } }
  for (let y = 70; y < h - 60; y += 24) for (const x of [47, w - 47]) { g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.fill(); }
  g.fillStyle = '#1f2f4a'; g.beginPath(); g.moveTo(w / 2, 84); g.lineTo(w - 130, h / 2); g.lineTo(w / 2, h - 84); g.lineTo(130, h / 2); g.fill();
  g.strokeStyle = '#d8c8a0'; g.lineWidth = 3; g.stroke(); g.fillStyle = '#8a3a44'; g.beginPath(); g.moveTo(w / 2, 120); g.lineTo(w - 190, h / 2); g.lineTo(w / 2, h - 120); g.lineTo(190, h / 2); g.fill();
  g.fillStyle = '#d8c8a0'; g.beginPath(); g.arc(w / 2, h / 2, 24, 0, 7); g.fill(); g.fillStyle = '#5a2230'; g.beginPath(); g.arc(w / 2, h / 2, 12, 0, 7); g.fill();
  g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
}, 0.95);
const ixLake = () => ixPrint('lake', 384, 240, (g, w, h) => {
  const sk = g.createLinearGradient(0, 0, 0, h * 0.6); sk.addColorStop(0, '#3a4a78'); sk.addColorStop(0.6, '#d89a78'); sk.addColorStop(1, '#f0c890'); g.fillStyle = sk; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2a3048'; g.beginPath(); g.moveTo(0, h * 0.6); for (let x = 0; x <= w; x += 12) g.lineTo(x, h * 0.55 - Math.sin(x / 40) * 10 - Math.sin(x / 13) * 3); g.lineTo(w, h * 0.6); g.fill();
  g.fillStyle = '#1c2236'; g.beginPath(); g.arc(250, h * 0.57, 24, Math.PI, 0); g.fill(); g.fillRect(226, h * 0.57, 48, 8);
  const wt = g.createLinearGradient(0, h * 0.6, 0, h); wt.addColorStop(0, '#d8a888'); wt.addColorStop(1, '#2a3a5a'); g.fillStyle = wt; g.fillRect(0, h * 0.6, w, h * 0.4);
  g.fillStyle = 'rgba(255,230,190,.35)'; for (let i = 0; i < 18; i++) g.fillRect(230 + ((i * 17) % 60) - 30, h * 0.62 + i * 4, 20 + (i % 4) * 8, 2);
  g.fillStyle = '#1a1e30'; g.beginPath(); g.moveTo(70, h * 0.78); g.lineTo(120, h * 0.78); g.lineTo(110, h * 0.82); g.lineTo(80, h * 0.82); g.fill(); g.fillRect(94, h * 0.7, 2, h * 0.08);
}, 0.7);
function ixSuiteDress(R) {
  const S = ixGroup(R, true), K = ixGroup(R);
  const mh = once('ixSMah', () => mat.mahog()), brass = ixMat('abrass', 0xc2a04a, 0.3, 1), cream = ixMat('abcream', 0xe6dcc0, 0.85), dkw = ixMat('adkw', 0x3a1c0e, 0.55);
  const linen = ixMat('slinen', 0xece4d4, 0.9, 0, { t: TX.linen(), rep: [2, 2] }), teal = ixMat('steal', 0x2f5a5a, 0.9, 0, { t: TX.cloth(), rep: [4, 4], bump: 0.006 });
  const glow = ixMat('sglow', 0xfff0cc, 0.5, 0, { emissive: 0xffc680, emissiveIntensity: 0.8, side: THREE.DoubleSide });
  // rug
  const rug = ixPlane(R.g, 3.0, 2.06, ixRug(), -0.6, 0.009, -0.1, 0, -Math.PI / 2); rug.userData.nocast = 1;
  // ceiling rose + pendant bowl over the middle
  lathe(S, [[0.001, 0], [0.4, 0], [0.4, 0.02], [0.25, 0.05], [0.1, 0.08], [0.001, 0.08]], ixMat('rose', 0xe8e0d0, 0.8), 0, 2.82, 0, 24).rotation.x = Math.PI;
  cyl(S, 0.01, 0.01, 0.3, brass, 0, 2.66, 0, 6); lathe(S, [[0.001, 0.0], [0.17, 0.06], [0.2, 0.12], [0.17, 0.15], [0.001, 0.16]], glow, 0, 2.43, 0, 20);
  const rim = add(S, new THREE.TorusGeometry(0.2, 0.01, 6, 24), brass, 0, 2.55, 0); rim.rotation.x = Math.PI / 2;
  // art over the bed, sconces either side
  ixFrame(S, -1.4, 1.95, -2.975, 0, 1.15, 0.72, ixLake(), { b: 0.06 });
  for (const x of [-2.5, -0.3]) sconce(R.g, x, 1.75, -2.97, 0);
  ixFrame(S, -3.475, 1.7, 1.9, Math.PI / 2, 0.5, 0.4, ixPrint('cardp', 128, 100, (g, w, h) => { g.fillStyle = '#d8c8a0'; g.fillRect(0, 0, w, h); g.fillStyle = '#6a4a3a'; g.beginPath(); g.arc(64, 60, 30, 0, 7); g.fill(); g.fillStyle = '#9ab0a0'; g.fillRect(0, 70, w, 30); }), { b: 0.04 });
  ixFrame(S, 3.475, 2.0, -1.0, -Math.PI / 2, 0.55, 0.42, ixDwg('elev'), { b: 0.04 });
  // wardrobe (west wall)
  const wr = new THREE.Group(); wr.position.set(-3.2, 0, 0.45); wr.rotation.y = Math.PI / 2; K.add(wr);
  const wm = once('ixSWard', () => mat.mahog([1, 2]));
  box(wr, 1.3, 2.1, 0.58, wm, 0, 1.1, 0); box(wr, 1.42, 0.12, 0.64, dkw, 0, 0.06, 0); box(wr, 1.44, 0.1, 0.66, wm, 0, 2.2, 0.0); box(wr, 1.5, 0.06, 0.7, wm, 0, 2.28, 0.0); box(wr, 1.38, 0.1, 0.62, dkw, 0, 2.12, 0.0);
  for (const s of [-1, 1]) {
    box(wr, 0.6, 1.84, 0.03, ixMat('swd', 0x5a2c18, 0.45), s * 0.32, 1.1, 0.3); box(wr, 0.42, 1.0, 0.014, ixMat('swd2', 0x4a2210, 0.5), s * 0.32, 1.45, 0.322); box(wr, 0.42, 0.5, 0.014, ixMat('swd2', 0x4a2210, 0.5), s * 0.32, 0.55, 0.322);
    sph(wr, 0.03, brass, s * 0.07, 1.1, 0.34, 10); box(wr, 0.015, 0.1, 0.01, brass, s * 0.07, 1.1, 0.325);
  }
  box(wr, 0.01, 1.84, 0.01, dkw, 0, 1.1, 0.318);
  for (const sx of [-0.6, 0.6]) cyl(wr, 0.045, 0.03, 0.08, dkw, sx, 0.0, 0.25, 8);
  box(wr, 0.06, 0.05, 0.004, brass, 0, 1.0, 0.322);
  // luggage rack with Nova's bag
  const lr = new THREE.Group(); lr.position.set(-3.22, 0, -0.95); lr.rotation.y = Math.PI / 2; S.add(lr);
  const rw = ixMat('slr', 0x6a4220, 0.55), strap = ixMat('sstrap', 0xb89868, 0.85);
  for (const sx of [-0.35, 0.35]) { ixBar(lr, [sx, 0.52, -0.2], [sx, 0.1, 0.2], 0.035, rw); ixBar(lr, [sx, 0.52, 0.2], [sx, 0.1, -0.2], 0.035, rw); box(lr, 0.04, 0.03, 0.46, rw, sx, 0.52, 0); }
  for (const z of [-0.14, 0, 0.14]) box(lr, 0.76, 0.012, 0.045, strap, 0, 0.545, z);
  const bag = new THREE.Group(); bag.position.set(0, 0.56, 0); lr.add(bag);
  const bagM = ixMat('sbag', 0x2a4458, 0.85, 0, { t: TX.cloth(), rep: [3, 3], bump: 0.01 }), leath = ixMat('sleath', 0x6a3a1e, 0.55);
  box(bag, 0.52, 0.26, 0.3, bagM, 0, 0.13, 0); box(bag, 0.54, 0.02, 0.32, leath, 0, 0.0, 0); box(bag, 0.53, 0.14, 0.31, leath, 0, 0.27, 0.0);
  const fl = box(bag, 0.5, 0.012, 0.32, leath, 0, 0.3, 0.0); fl.rotation.z = 0.0;
  for (const sx of [-0.14, 0.14]) { box(bag, 0.045, 0.1, 0.012, leath, sx, 0.22, 0.158); box(bag, 0.03, 0.03, 0.01, brass, sx, 0.2, 0.166); }
  const hd = add(bag, new THREE.TorusGeometry(0.15, 0.012, 6, 14, Math.PI), leath, 0, 0.3, 0); hd.rotation.set(0, 0, 0);
  box(bag, 0.36, 0.1, 0.01, ixMat('spkt', 0x1c3446, 0.9), 0, 0.12, 0.155);
  // vanity with a mirror (west wall, near the bed)
  const vn = new THREE.Group(); vn.position.set(-3.22, 0, -2.2); vn.rotation.y = Math.PI / 2; S.add(vn);
  box(vn, 1.0, 0.04, 0.46, wm, 0, 0.76, 0); box(vn, 0.9, 0.16, 0.42, wm, 0, 0.66, 0);
  for (const sx of [-0.43, 0.43]) for (const sz of [-0.18, 0.18]) cyl(vn, 0.025, 0.017, 0.74, wm, sx, 0.37, sz, 8);
  box(vn, 0.3, 0.12, 0.012, ixMat('swd2', 0x4a2210, 0.5), 0, 0.66, 0.215); sph(vn, 0.015, brass, 0, 0.66, 0.225, 8);
  const mir = ixPrint('mirr', 128, 160, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#c8d6dc'); gr.addColorStop(0.5, '#8fa4ae'); gr.addColorStop(1, '#d8e2e4'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(10, 0); g.lineTo(46, 0); g.lineTo(0, 70); g.lineTo(0, 30); g.fill(); }, 0.12);
  const mg = new THREE.Group(); mg.position.set(0, 1.5, -0.14); vn.add(mg);
  const mo = add(mg, new THREE.CircleGeometry(0.25, 28), mir, 0, 0, 0.0); mo.scale.set(1, 1.35, 1); const mr = add(mg, new THREE.TorusGeometry(0.26, 0.026, 8, 32), brass, 0, 0, 0.01); mr.scale.set(1, 1.35, 1);
  box(vn, 0.04, 0.12, 0.02, brass, 0, 1.08, -0.15);
  // tabletop: scent bottles, a brush, a tray
  const gm = ixMat('sglass', 0x8ab8c8, 0.1, 0.1, { transparent: true, opacity: 0.6 });
  lathe(vn, [[0.001, 0], [0.04, 0], [0.045, 0.06], [0.02, 0.1], [0.012, 0.13], [0.001, 0.13]], gm, -0.3, 0.78, 0.0, 12); lathe(vn, [[0.001, 0], [0.03, 0], [0.032, 0.05], [0.014, 0.08], [0.001, 0.08]], ixMat('sglass2', 0xd8a8b8, 0.1, 0.1, { transparent: true, opacity: 0.6 }), -0.2, 0.78, 0.08, 12);
  box(vn, 0.34, 0.012, 0.2, brass, 0.18, 0.785, 0.02); box(vn, 0.14, 0.012, 0.04, ixMat('sbrush', 0x6a4a2a, 0.6), 0.14, 0.8, 0.02).rotation.y = 0.3; sph(vn, 0.03, ixMat('spuff', 0xf0e0e0, 0.95), 0.28, 0.805, 0.04, 10);
  // vanity stool
  const vs = new THREE.Group(); vs.position.set(-2.7, 0, -2.2); S.add(vs);
  cyl(vs, 0.19, 0.19, 0.07, ixMat('svs', 0x6a1420, 0.9, 0, { t: TX.velvet() }), 0, 0.44, 0, 16); for (let i = 0; i < 4; i++) cyl(vs, 0.02, 0.014, 0.42, wm, Math.cos(i * 1.57 + 0.78) * 0.14, 0.21, Math.sin(i * 1.57 + 0.78) * 0.14, 8);
  // writing desk dressing (desk at 2.8,.8, rotated: its length runs along z)
  const dkp = new THREE.Group(); dkp.position.set(2.8, 0.765, 0.8); dkp.rotation.y = -Math.PI / 2; S.add(dkp);
  box(dkp, 0.5, 0.008, 0.36, ixMat('sblot', 0x3a5a3a, 0.9), 0.0, 0.004, 0.04); box(dkp, 0.22, 0.003, 0.3, cream, 0.05, 0.01, 0.04).rotation.y = 0.15;
  const dl = new THREE.Group(); dl.position.set(0.5, 0, -0.12); dkp.add(dl); cyl(dl, 0.08, 0.09, 0.025, brass, 0, 0.012, 0, 16); cyl(dl, 0.01, 0.01, 0.3, brass, 0, 0.17, 0, 6);
  lathe(dl, [[0.04, 0], [0.1, 0.07], [0.14, 0.16], [0.13, 0.17]], glow, 0, 0.3, 0, 18);
  box(dkp, 0.22, 0.06, 0.16, ixMat('sbk1', 0x5a1c1c, 0.7), -0.55, 0.03, -0.1); box(dkp, 0.2, 0.05, 0.15, ixMat('sbk2', 0x1c3a2a, 0.7), -0.55, 0.085, -0.1).rotation.y = 0.2;
  cyl(dkp, 0.025, 0.03, 0.04, ixMat('sink', 0x1a1a1c, 0.2, 0.3), -0.35, 0.02, -0.12, 10); ixBar(dkp, [-0.3, 0.02, 0.05], [-0.18, 0.03, 0.12], 0.008, ixMat('sink2', 0x222, 0.4));
  // desk chair (faces the desk, i.e. +x)
  const ch = new THREE.Group(); ch.position.set(2.0, 0, 0.8); ch.rotation.y = Math.PI / 2; S.add(ch);
  box(ch, 0.46, 0.05, 0.44, wm, 0, 0.45, 0); box(ch, 0.42, 0.03, 0.4, ixMat('sseat', 0x6a1420, 0.9, 0, { t: TX.velvet() }), 0, 0.485, 0);
  for (const sx of [-0.2, 0.2]) { cyl(ch, 0.022, 0.016, 0.45, wm, sx, 0.225, 0.18, 8); cyl(ch, 0.022, 0.018, 0.9, wm, sx, 0.45, -0.18, 8); }
  box(ch, 0.4, 0.06, 0.03, wm, 0, 0.88, -0.18); box(ch, 0.4, 0.05, 0.03, wm, 0, 0.74, -0.18); for (const sx of [-0.07, 0, 0.07]) box(ch, 0.035, 0.2, 0.02, wm, sx, 0.8, -0.18);
  // armchair details: legs and a cushion (the armchair is the existing one at 2.4,-1.8 facing the middle)
  const ac = new THREE.Group(); ac.position.set(2.4, 0, -1.8); faceTo(ac, 0, 0); S.add(ac);
  for (const sx of [-0.34, 0.34]) for (const sz of [-0.3, 0.3]) cyl(ac, 0.035, 0.025, 0.1, wm, sx, 0.05, sz, 8);
  const pil = sph(ac, 0.18, ixMat('spil', 0xc8b48a, 0.9, 0, { t: TX.linen(), rep: [2, 2] }), 0.2, 0.72, -0.14, 14); pil.scale.set(1, 1, 0.38); pil.rotation.set(-0.3, 0.2, 0.3);
  box(ac, 0.7, 0.05, 0.5, teal, 0.0, 0.47, 0.02);
  // floor lamp next to the armchair
  const fl2 = new THREE.Group(); fl2.position.set(3.12, 0, -0.75); S.add(fl2);
  cyl(fl2, 0.13, 0.15, 0.03, brass, 0, 0.015, 0, 18); cyl(fl2, 0.012, 0.012, 1.3, brass, 0, 0.68, 0, 6); lathe(fl2, [[0.08, 0], [0.18, 0.1], [0.22, 0.26], [0.2, 0.28]], glow, 0, 1.3, 0, 20);
  // potted fern on a stand in the corner by the window
  const fp = new THREE.Group(); fp.position.set(3.1, 0, -2.55); S.add(fp);
  cyl(fp, 0.17, 0.17, 0.03, wm, 0, 0.7, 0, 16); for (const a of [0.4, 2.5, 4.6]) ixBar(fp, [Math.cos(a) * 0.14, 0.7, Math.sin(a) * 0.14], [Math.cos(a) * 0.17, 0.0, Math.sin(a) * 0.17], 0.03, wm);
  lathe(fp, [[0.001, 0], [0.1, 0], [0.14, 0.14], [0.15, 0.2], [0.13, 0.2], [0.001, 0.18]], ixMat('spot', 0x3a5a6a, 0.45), 0, 0.715, 0, 16);
  const fm = ixMat('sfern', 0x3f6a34, 0.8, 0, { side: THREE.DoubleSide });
  for (let i = 0; i < 9; i++) { const a = i * 0.7, lf = add(fp, new THREE.PlaneGeometry(0.08, 0.45, 1, 3), fm, Math.cos(a) * 0.1, 1.02, Math.sin(a) * 0.1); lf.rotation.set(0, -a + Math.PI / 2, 0); lf.rotateX(-0.9); }
  // bed dressing (the bed group keeps its tag): shams, a turned-down sheet, a folded throw
  const bd = new THREE.Group(); bd.position.set(-1.4, 0, -1.6); S.add(bd);
  for (const s of [-1, 1]) { const sm = sph(bd, 0.3, ixMat('ssham', 0xe4dcc8, 0.9, 0, { t: TX.linen(), rep: [2, 2] }), s * 0.4, 0.85, -0.97, 16); sm.scale.set(1, 1, 0.3); sm.rotation.x = -0.45; }
  box(bd, 1.6, 0.045, 0.42, linen, 0, 0.64, -0.55); box(bd, 1.64, 0.035, 0.3, teal, 0, 0.655, 0.93);
  box(bd, 1.74, 0.012, 0.4, ixMat('sbord', 0xb8984a, 0.6), 0, 0.64, -0.34);
  // nightstand detail
  const nsd = new THREE.Group(); nsd.position.set(0.05, 0.0, -2.55); S.add(nsd);
  box(nsd, 0.44, 0.012, 0.01, dkw, 0, 0.45, 0.205); box(nsd, 0.3, 0.2, 0.008, ixMat('swd2', 0x4a2210, 0.5), 0, 0.5, 0.204); sph(nsd, 0.016, brass, 0, 0.5, 0.215, 8);
  box(nsd, 0.14, 0.03, 0.1, ixMat('sbk1', 0x5a1c1c, 0.7), -0.13, 0.615, 0.04); box(nsd, 0.1, 0.07, 0.05, ixMat('sclk', 0xc8b060, 0.3, 0.6), 0.14, 0.635, 0.08);
  ixBlob(S, 2.0, 2.4, -1.4, -1.6, 0, 0.5); ixBlob(S, 0.55, 0.5, 0.05, -2.55, 0, 0.5); ixBlob(S, 0.7, 1.4, -3.2, 0.45, 0, 0.5); ixBlob(S, 0.6, 0.9, -3.22, -0.95, 0, 0.45); ixBlob(S, 0.6, 1.0, -3.2, -2.2, 0, 0.45); ixBlob(S, 0.95, 0.9, 2.4, -1.8, 0, 0.5); ixBlob(S, 0.7, 1.4, 2.7, 0.8, 0, 0.4);
  ixBake(S); ixBake(K);
}


function buildArchive() {
  const R = mkRoom('archive', { p: [-3, 6, 3], t: [0, 0, -1], s: 7, day: [0xffe8c8, 1.6], night: [0xffd8a0, 0.5] });
  rectRoom(R, -4.5, 4.5, -4, 4, 3.2, { floor: M(0xffffff, 0.45, 0, { t: TX.oak(), rep: [3, 3], bump: 0.01 }), wall: M(0xffffff, 0.85, 0, { t: ixHalfTex('ixHalfDamaskR', () => TX.damaskRose()), bump: 0.01 }), wains: M(0xffffff, 0.5, 0, { t: TX.panel(), bump: 0.02 }), wh: 1.2 });
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
  box(md, 1.0, 0.05, 1.0, mat.mahog(), 0, 0.025, 0); box(md, 0.96, 0.04, 0.96, BRASS, 0, 0.9, 0); box(md, 0.9, 0.05, 0.9, mat.mahog(), 0, 0.875, 0);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; cyl(md, 0.008, 0.008, 0.08, M(0xd8d0bc, 0.5), Math.cos(a) * 0.2, 0.98, Math.sin(a) * 0.2, 6); }
  add(md, new THREE.TorusGeometry(0.2, 0.006, 6, 24), M(0xd8d0bc, 0.5), 0, 1.02, 0).rotation.x = Math.PI / 2;
  add(md, new THREE.TorusGeometry(0.36, 0.01, 6, 28), BRASS, 0, 0.94, 0).rotation.x = Math.PI / 2;
  plaqueMesh(md, 'THE AQUADOME  1:200', 0.36, 0.07, 0, 0.5, 0.455, 0, { size: 0.3 });
  tag(md, 'model', 'Scale model');
  hit(R.g, -4.05, 1.3, 0.9, 0.7, 'books', 'Bookcase');
  palm(R.g, 3.8, -3.3, 1);
  ixArchiveDress(R);
  door(R, 1.2, 3.95, 'Lobby', 'exit_archive', [1.2, 0]);
  lamps(R, [0, 2.6, -0.5, 0xffd8a8, 11, 12], [1.2, 1.4, -2.3, 0xffe0b0, 3, 4]);
  return R;
}

function buildSuite() {
  const R = mkRoom('suite', { p: [2, 6, -4], t: [0, 0, 0], s: 6, day: [0xffecd0, 1.6], night: [0x8090c0, 0.25] });
  rectRoom(R, -3.5, 3.5, -3, 3, 2.9, { floor: M(0xffffff, 0.95, 0, { t: TX.carpetSuite(), rep: [4, 3], bump: 0.008 }), wall: M(0xffffff, 0.85, 0, { t: ixHalfTex('ixHalfSuite', () => T.wallpaper({ base: '#b39484', ink: '#d3b8a2', seed: 14 }), 3), bump: 0.01 }) });
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
  ixSuiteDress(R);
  door(R, 0, 2.95, 'Lobby', 'exit_suite', [0, 0]);
  lamps(R, [0, 2.4, 0, 0xffdcb0, 8, 10], [0.05, 1.0, -2.55, 0xffc070, 3, 4]);
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
// ---------- Guest Wing corridor: refinements ----------
const ixBotan = () => ixPrint('botan', 256, 340, (g, w, h) => {
  g.fillStyle = '#ece3c8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#3a4a2a'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(128, 320); g.quadraticCurveTo(120, 220, 130, 120); g.stroke();
  for (let i = 0; i < 6; i++) { const y = 280 - i * 32, s = i % 2 ? 1 : -1; g.fillStyle = '#6a8a4a'; g.beginPath(); g.moveTo(125, y); g.quadraticCurveTo(125 + s * 50, y - 24, 125 + s * 70, y - 6); g.quadraticCurveTo(125 + s * 40, y + 12, 125, y); g.fill(); g.stroke(); }
  g.fillStyle = '#c05a6a'; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.beginPath(); g.ellipse(130 + Math.cos(a) * 22, 100 + Math.sin(a) * 22, 18, 12, a, 0, 7); g.fill(); g.stroke(); }
  g.fillStyle = '#e8c860'; g.beginPath(); g.arc(130, 100, 9, 0, 7); g.fill();
  g.fillStyle = '#3a2a1a'; g.font = 'italic 14px Georgia, serif'; g.textAlign = 'center'; g.fillText('Rosa lacustris', 128, 332);
}, 0.8);
const ixShore = () => ixPrint('shore', 320, 220, (g, w, h) => {
  const sk = g.createLinearGradient(0, 0, 0, h); sk.addColorStop(0, '#b8cce0'); sk.addColorStop(0.6, '#f0e8d0'); sk.addColorStop(1, '#8aa8b0'); g.fillStyle = sk; g.fillRect(0, 0, w, h);
  g.fillStyle = '#7a8c6a'; g.beginPath(); g.moveTo(0, 130); for (let x = 0; x <= w; x += 10) g.lineTo(x, 118 - Math.sin(x / 30) * 12); g.lineTo(w, 140); g.lineTo(0, 140); g.fill();
  g.fillStyle = '#8aa8b0'; g.fillRect(0, 140, w, 80); g.fillStyle = 'rgba(255,255,255,.4)'; for (let i = 0; i < 10; i++) g.fillRect(20 + i * 29, 150 + (i * 13) % 50, 22, 2);
  g.fillStyle = '#e8e0d0'; g.fillRect(190, 96, 56, 26); g.fillStyle = '#c8b898'; g.beginPath(); g.arc(218, 96, 22, Math.PI, 0); g.fill();
  g.fillStyle = '#3a4a3a'; g.fillRect(70, 80, 5, 50); g.beginPath(); g.arc(72, 76, 22, 0, 7); g.fill();
}, 0.7);
function ixWingDress(R) {
  const S = ixGroup(R, true), K = ixGroup(R);
  const mh = once('ixWMah', () => mat.mahog()), brass = ixMat('abrass', 0xc2a04a, 0.3, 1), cream = ixMat('abcream', 0xe6dcc0, 0.85), dkw = ixMat('adkw', 0x3a1c0e, 0.55);
  const glow = ixMat('sglow', 0xfff0cc, 0.5, 0, { emissive: 0xffc680, emissiveIntensity: 0.8, side: THREE.DoubleSide });
  const velv = ixMat('wvelv', 0x6a1420, 0.9, 0, { t: TX.velvet() });
  const H = 3.1;
  // runner border: a deep green band and gold lines either side, over the red carpet
  const bandM = once('ixWBand', () => new THREE.MeshStandardMaterial({ color: 0x1c3a2c, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }));
  const lineM = once('ixWLine', () => new THREE.MeshStandardMaterial({ color: 0xb8964a, roughness: 0.6, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -3 }));
  for (const s of [-1, 1]) {
    for (const [x, w, m, y] of [[s * 0.585, 0.09, bandM, 0.0075], [s * 0.64, 0.02, lineM, 0.0085], [s * 0.53, 0.02, lineM, 0.0085]]) { const p = ixPlane(S, w, 14.6, m, x, y, -5.5, 0, -Math.PI / 2); p.userData.nocast = 1; }
  }
  // brass stair rods across the runner at each end
  for (const z of [1.7, -12.15]) { const r = cyl(S, 0.012, 0.012, 1.3, brass, 0, 0.014, z, 8); r.rotation.z = Math.PI / 2; }
  // ceiling: cross beams every 3 m with corbels, plaster roses under the pendants
  const beamM = ixMat('wbeam', 0x4a2412, 0.55), rose = ixMat('rose', 0xe8e0d0, 0.8);
  for (const z of [0, -3, -6, -9, -12]) {
    box(S, 3.2, 0.14, 0.2, beamM, 0, H - 0.07, z); box(S, 3.2, 0.03, 0.26, ixMat('wgold', 0xb8964a, 0.55, 0.15), 0, H - 0.155, z);
    for (const s of [-1, 1]) { box(S, 0.16, 0.2, 0.16, beamM, s * 1.5, H - 0.1, z); box(S, 0.2, 0.05, 0.2, ixMat('wgold', 0xb8964a, 0.55, 0.15), s * 1.5, H - 0.21, z); }
  }
  for (const z of [-1.5, -7.5]) { lathe(S, [[0.001, 0], [0.4, 0], [0.4, 0.015], [0.25, 0.04], [0.1, 0.07], [0.001, 0.07]], rose, 0, H - 0.07, z, 24).rotation.x = Math.PI; const rg = add(S, new THREE.TorusGeometry(0.21, 0.012, 6, 24), brass, 0, 2.58, z); rg.rotation.x = Math.PI / 2; sph(S, 0.025, brass, 0, 2.43, z, 8); }
  // picture rail along both walls
  for (const s of [-1, 1]) box(S, 0.03, 0.05, 14.6, brass, s * 1.585, 2.5, -5.5);
  // console table with a mirror and lamp on the east wall by W1
  const ec = new THREE.Group(); ec.position.set(1.42, 0, 0.55); ec.rotation.y = -Math.PI / 2; K.add(ec);
  box(ec, 1.0, 0.045, 0.36, mh, 0, 0.82, 0); box(ec, 0.9, 0.12, 0.32, mh, 0, 0.73, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { cyl(ec, 0.024, 0.016, 0.74, mh, sx * 0.45, 0.37, sz * 0.14, 8); }
  box(ec, 0.84, 0.03, 0.28, dkw, 0, 0.3, 0);
  const lm = new THREE.Group(); lm.position.set(-0.28, 0.845, 0); ec.add(lm);
  lathe(lm, [[0.001, 0], [0.07, 0], [0.05, 0.1], [0.025, 0.2], [0.03, 0.26], [0.012, 0.3]], ixMat('wlamp', 0x2a5a6a, 0.2, 0.1), 0, 0, 0, 14); lathe(lm, [[0.07, 0], [0.11, 0.1], [0.14, 0.2], [0.13, 0.21]], glow, 0, 0.28, 0, 18);
  lathe(ec, [[0.001, 0], [0.04, 0], [0.07, 0.1], [0.045, 0.2], [0.05, 0.24], [0.001, 0.22]], ixMat('wvase', 0x7a5a3a, 0.35, 0.2), 0.25, 0.845, 0.0, 14);
  const stem = ixMat('wstem', 0x4a7a3a, 0.8), lil = [ixMat('wl1', 0xf4eadc, 0.7), ixMat('wl2', 0xe8b4c0, 0.7), ixMat('wl3', 0xd8483a, 0.7)];
  for (let i = 0; i < 9; i++) { const a = i * 1.1, rr = 0.03 + (i % 3) * 0.03; ixBar(ec, [0.25, 1.05, 0], [0.25 + Math.cos(a) * rr, 1.22 + (i % 4) * 0.03, Math.sin(a) * rr], 0.008, stem); sph(ec, 0.04, lil[i % 3], 0.25 + Math.cos(a) * rr, 1.26 + (i % 4) * 0.03, Math.sin(a) * rr, 8); }
  const gm = new THREE.Group(); gm.position.set(0, 1.62, -0.15); ec.add(gm);
  const mp = ixPrint('wmirr', 128, 160, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#d0dade'); gr.addColorStop(0.5, '#92a6b0'); gr.addColorStop(1, '#dce6e6'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.moveTo(14, 0); g.lineTo(50, 0); g.lineTo(0, 74); g.lineTo(0, 34); g.fill(); }, 0.12);
  const mo = add(gm, new THREE.CircleGeometry(0.24, 28), mp, 0, 0, 0); mo.scale.set(1, 1.4, 1); const mr = add(gm, new THREE.TorusGeometry(0.255, 0.028, 8, 32), brass, 0, 0, 0.01); mr.scale.set(1, 1.4, 1);
  // extra bits on the west console (flowers hotspot keeps its tag)
  const ct = new THREE.Group(); ct.position.set(-1.35, 0, -5.4); ct.rotation.y = Math.PI / 2; S.add(ct);
  for (let i = 0; i < 8; i++) { const a = i * 0.8 + 0.3, rr = 0.1 + (i % 3) * 0.04; const lf = sph(ct, 0.06, stem, Math.cos(a) * rr, 1.12 + (i % 2) * 0.05, Math.sin(a) * rr, 8); lf.scale.set(1, 0.45, 1.6); lf.rotation.y = a; }
  for (let i = 0; i < 10; i++) { const a = i * 2.3; sph(ct, 0.014, ixMat('wbb', 0xf4f0e6, 0.8), Math.cos(a) * (0.1 + (i % 4) * 0.025), 1.26 + (i % 3) * 0.04, Math.sin(a) * (0.1 + (i % 4) * 0.025), 6); }
  box(ct, 0.34, 0.012, 0.2, brass, -0.3, 0.845, 0.0); box(ct, 0.14, 0.05, 0.1, ixMat('wbk', 0x1c3a2a, 0.7), 0.32, 0.865, 0.04);
  // upholstered bench on the west wall by W3, framed print above
  const bn = new THREE.Group(); bn.position.set(-1.33, 0, -10.6); bn.rotation.y = Math.PI / 2; K.add(bn);
  box(bn, 1.0, 0.11, 0.42, velv, 0, 0.46, 0); box(bn, 1.04, 0.06, 0.46, mh, 0, 0.38, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(bn, 0.03, 0.02, 0.36, mh, sx * 0.46, 0.18, sz * 0.18, 8);
  for (const sx of [-0.47, 0.47]) { const b = cyl(bn, 0.07, 0.07, 0.4, velv, sx, 0.58, 0, 10); b.rotation.x = Math.PI / 2; }
  // framed prints
  ixFrame(S, -1.575, 1.85, -0.9, Math.PI / 2, 0.6, 0.78, ixBotan());
  ixFrame(S, -1.575, 1.85, -10.2, Math.PI / 2, 0.6, 0.44, ixShore());
  ixFrame(S, -1.575, 1.85, -12.2, Math.PI / 2, 0.45, 0.6, ixBotan());
  ixFrame(S, 1.575, 1.85, -7.3, -Math.PI / 2, 0.75, 0.52, ixShore());
  ixFrame(S, 1.575, 1.85, -12.15, -Math.PI / 2, 0.45, 0.6, ixBotan());
  // end window: sconces, cushion detail, bolsters and a throw
  for (const s of [-1, 1]) sconce(R.g, s * 1.4, 1.95, -12.97, 0);
  const cu = ixMat('wcush', 0x6a1420, 0.9, 0, { t: TX.velvet() });
  for (const sx of [-0.52, -0.31, -0.1, 0.1, 0.31, 0.52]) for (const sz of [-12.75, -12.55]) sph(S, 0.013, ixMat('wbtn', 0x2a0a10, 0.7), sx * 1.7, 0.565, sz, 6);
  for (const s of [-1, 1]) { const b = cyl(S, 0.075, 0.075, 0.5, ixMat('wbol', 0x8a6a30, 0.85, 0, { t: TX.linen() }), s * 0.98, 0.62, -12.65, 12); b.rotation.x = Math.PI / 2; }
  box(S, 2.12, 0.012, 0.012, brass, 0, 0.56, -12.37); box(S, 2.12, 0.012, 0.012, brass, 0, 0.44, -12.35);
  for (const x of [-0.7, 0, 0.7]) box(S, 0.62, 0.3, 0.012, ixMat('wpan', 0x4a2210, 0.5), x, 0.225, -12.348);
  for (const s of [-1, 1]) { cyl(S, 0.035, 0.03, 0.06, brass, s * 1.0, 0.03, -12.4, 8); cyl(S, 0.035, 0.03, 0.06, brass, s * 1.0, 0.03, -12.9, 8); }
  box(S, 0.62, 0.035, 0.34, ixMat('wthrow', 0x2f5a5a, 0.9, 0, { t: TX.cloth(), rep: [4, 4], bump: 0.006 }), 0.55, 0.585, -12.6).rotation.y = -0.2;
  ixPool(R, 1.6, 2.4, 0, -11.7, 0.14);
  // contact shadows
  ixBlob(S, 0.8, 1.3, 1.42, 0.55, 0, 0.5); ixBlob(S, 0.7, 1.3, -1.35, -5.4, 0, 0.5); ixBlob(S, 0.7, 1.4, -1.33, -10.6, 0, 0.5); ixBlob(S, 2.4, 0.8, 0, -12.65, 0, 0.5);
  ixBake(S); ixBake(K);
}


function buildWing() {
  const R = mkRoom('wing', { p: [3, 8, 3], t: [0, 0, -5], s: 10, day: [0xffe8c8, 1.2], night: [0xffd8a0, 0.3] });
  rectRoom(R, -1.6, 1.6, -13, 2, 3.1, { floor: M(0xffffff, 0.45, 0, { t: TX.oak(), rep: [1, 5], bump: 0.01 }), wall: M(0xffffff, 0.85, 0, { t: ixHalfTex('ixHalfDamaskR3', () => TX.damaskRose(), 3), bump: 0.01 }), wains: M(0xffffff, 0.5, 0, { t: TX.panel(), bump: 0.02 }), wh: 1.0 });
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
  ixWingDress(R);
  lamps(R, [0, 2.6, -2, 0xffd8a8, 8, 9], [0, 2.6, -9, 0xffd8a8, 8, 9]);
  return R;
}

// ---------- Outside: the lakeside terrace ----------
function buildTerrace() {
  const R = mkRoom('terrace', { p: [-14, 20, -6], t: [0, 0, -4], s: 22, day: [0xffe8c8, 2.6], night: [0x8a9ac8, 0.45] });
  R.outdoor = true;
  const flag = M(0xffffff, 0.8, 0, { t: once('flags', () => T.tiles({ base: '#b0a894', grout: '#6a6454', n: 4, vary: 0.18, grime: 0.4, seed: 21 })), rep: [5, 3], bump: 0.03 });
  struct(add(R.g, new THREE.PlaneGeometry(18, 12), flag, 0, 0.01, 2)).rotation.x = -Math.PI / 2;
  const grass = M(0xffffff, 0.95, 0, { t: once('grass', () => T.plaster({ base: '#4c6a36', seed: 31 })), rep: [40, 40], bump: 0.04 });
  struct(add(R.g, new THREE.PlaneGeometry(90, 90), grass, 0, -0.01, 30)).rotation.x = -Math.PI / 2;
  const gravel = M(0xffffff, 0.95, 0, { t: once('gravel', () => T.concrete({ base: '#9a9282', seed: 41 })), rep: [2, 6], bump: 0.05 });
  struct(add(R.g, new THREE.PlaneGeometry(2.4, 6.4), gravel, 0, 0.005, -7.2)).rotation.x = -Math.PI / 2;
  struct(add(R.g, new THREE.PlaneGeometry(1.6, 8), gravel, -4.2, 0.004, -8.6)).rotation.set(-Math.PI / 2, 0, -0.6);
  // the lake, with a stone shore wall
  const water = struct(add(R.g, new THREE.PlaneGeometry(160, 70, 60, 30), new THREE.MeshStandardMaterial({ color: 0x16303a, roughness: 0.22, metalness: 0.35 }), 0, -0.35, -45.5));
  water.rotation.x = -Math.PI / 2; water.userData.nocast = 1;
  const wp = water.geometry.attributes.position;
  updaters.push((dt, t) => { if (!R.g.visible) return; for (let i = 0; i < wp.count; i++) wp.setZ(i, Math.sin(wp.getX(i) * 0.6 + t * 0.8) * 0.03 + Math.cos(wp.getY(i) * 0.8 + t * 0.6) * 0.03); wp.needsUpdate = true; water.geometry.computeVertexNormals(); });
  struct(box(R.g, 60, 0.5, 0.5, mat.stone([30, 1]), 0, -0.2, -10.3));
  // balustrade round the terrace, open in the middle for the path to the lake
  const bal = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0), n = Math.round(len / 0.32);
    box(R.g, 0.2, 0.1, len, mat.stone([1, 6]), (x0 + x1) / 2, 0.92, (z0 + z1) / 2).rotation.y = ang;
    box(R.g, 0.24, 0.12, len, mat.stone([1, 6]), (x0 + x1) / 2, 0.06, (z0 + z1) / 2).rotation.y = ang;
    for (let i = 0; i <= n; i++) { const t = i / n; lathe(R.g, [[0.001, 0.12], [0.05, 0.12], [0.03, 0.3], [0.065, 0.55], [0.03, 0.8], [0.05, 0.87], [0.001, 0.87]], mat.stone(), x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, 10); }
  };
  bal(-9, -4, -1.4, -4); bal(1.4, -4, 9, -4); bal(-9, -4, -9, 7); bal(9, -4, 9, 7);
  const lampPost = (x, z) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); R.g.add(g);
    lathe(g, [[0.001, 0], [0.14, 0], [0.1, 0.12], [0.05, 0.3], [0.04, 2.6], [0.07, 2.62], [0.001, 2.64]], IRON, 0, 0, 0, 12);
    box(g, 0.24, 0.32, 0.24, M(0xfff0c8, 0.3, 0, { emissive: 0xffc070, emissiveIntensity: 1.3 }), 0, 2.82, 0).userData.nocast = 1;
    lathe(g, [[0.001, 3.14], [0.2, 2.98], [0.18, 2.96], [0.001, 3.1]], IRON, 0, 0, 0, 4);
  };
  for (const [x, z] of [[-8.6, -3.6], [8.6, -3.6], [-1.8, -4.2], [1.8, -4.2], [3.3, -10.6]]) lampPost(x, z);
  for (const [x, z] of [[-6, -3.2], [6, -3.2], [-8.3, 5.5], [8.3, 5.5]]) { lathe(R.g, [[0.001, 0], [0.28, 0], [0.22, 0.1], [0.3, 0.55], [0.34, 0.62], [0.001, 0.6]], mat.stone(), x, 0, z, 20); sph(R.g, 0.5, M(0x3a5a2a, 0.9, 0, { t: TX.velvet(), rep: [3, 3] }), x, 1.1, z, 18); }
  const bench = (x, z, ry) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; R.g.add(g);
    for (let i = 0; i < 4; i++) box(g, 1.6, 0.03, 0.09, mat.oak(), 0, 0.45, -0.18 + i * 0.12);
    for (let i = 0; i < 3; i++) box(g, 1.6, 0.09, 0.03, mat.oak(), 0, 0.62 + i * 0.12, -0.26);
    for (const s of [-1, 1]) { box(g, 0.05, 0.45, 0.5, IRON, s * 0.72, 0.225, -0.02); box(g, 0.05, 0.5, 0.05, IRON, s * 0.72, 0.7, -0.26); }
    return g;
  };
  tag(bench(-4.5, 1.5, 0.3), 'tbench', 'Bench');
  bench(4.5, 1.5, -0.3);
  // the dock, a rowboat and the padlocked boathouse
  for (let i = 0; i < 26; i++) box(R.g, 1.6, 0.06, 0.38, mat.oak(), 4, 0.02, -10.4 - i * 0.42);
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) cyl(R.g, 0.07, 0.07, 1.3, M(0x4a3a2a, 0.9), 4 + s * 0.8, -0.35, -10.6 - i * 2, 8);
  box(R.g, 0.1, 0.9, 0.1, M(0x4a3a2a, 0.9), 4.75, 0.45, -20.9); box(R.g, 0.1, 0.9, 0.1, M(0x4a3a2a, 0.9), 3.25, 0.45, -20.9);
  tag(box(R.g, 0.1, 0.9, 0.1, M(0x4a3a2a, 0.9), 4.75, 0.45, -15), 'dockpost', 'Dock post');
  const boat = new THREE.Group(); boat.position.set(5.8, -0.28, -16); boat.rotation.y = 0.12; R.g.add(boat);
  lathe(boat, [[0.001, -0.3], [0.45, -0.26], [0.62, 0], [0.64, 0.08]], M(0x7a3a2a, 0.6, 0, { side: THREE.DoubleSide }), 0, 0.3, 0, 24).scale.set(0.9, 1, 2.6);
  box(boat, 1.05, 0.04, 0.22, mat.oak(), 0, 0.3, 0.3); box(boat, 1.05, 0.04, 0.22, mat.oak(), 0, 0.3, -0.6);
  updaters.push((dt, t) => { boat.position.y = -0.28 + Math.sin(t * 1.1) * 0.025; boat.rotation.z = Math.sin(t * 0.8) * 0.03; });
  tag(boat, 'rowboat', 'Rowboat');
  const bh = new THREE.Group(); bh.position.set(-10, 0, -14.6); faceTo(bh, -6, -9); R.g.add(bh);
  const plank = M(0xffffff, 0.8, 0, { t: once('planks', () => T.wood({ base: '#6a5a48', dark: '#3a2e22', planks: 10, seed: 17 })), rep: [2, 1], bump: 0.03 });
  box(bh, 4.6, 2.8, 4, plank, 0, 1.4, 0);
  for (const s of [-1, 1]) box(bh, 2.7, 0.08, 4.4, M(0x3a3a3e, 0.8), s * 1.2, 3.35, 0).rotation.z = s * -0.62;
  const bd = new THREE.Group(); bd.position.set(0, 0, 2.02); bh.add(bd);
  box(bd, 2.2, 2.2, 0.06, M(0x4a3e30, 0.8), 0, 1.1, 0);
  box(bd, 0.02, 2.2, 0.07, M(0x2a2018, 0.8), 0, 1.1, 0.01);
  box(bd, 0.5, 0.05, 0.04, IRON, 0, 1.2, 0.05);
  box(bd, 0.08, 0.1, 0.03, BRASS, 0.04, 1.12, 0.08);
  tag(bd, 'boathouse', 'Boathouse doors');
  // the Aquadome from outside: stone drum, glass dome, portico and front doors
  const dome = new THREE.Group(); dome.position.set(0, 0, 18); R.g.add(dome);
  struct(add(dome, new THREE.CylinderGeometry(9.3, 9.4, 4.6, 64, 1, true), mat.stone([12, 2]), 0, 2.3, 0));
  add(dome, new THREE.TorusGeometry(9.35, 0.18, 8, 64), mat.stone(), 0, 4.6, 0).rotation.x = Math.PI / 2;
  const glow = M(0xd8e0d8, 0.08, 0.2, { transparent: true, opacity: 0.55, emissive: 0xffc070, emissiveIntensity: 0 });
  add(dome, new THREE.SphereGeometry(9.2, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), glow, 0, 4.6, 0).userData.nocast = 1;
  R.domeGlow = glow;
  for (let i = 0; i < 8; i++) add(dome, new THREE.TorusGeometry(9.25, 0.07, 6, 48, Math.PI), BRONZE, 0, 4.6, 0).rotation.y = (i / 8) * Math.PI;
  const lit = M(0x2a2418, 0.3, 0, { emissive: 0xffb860, emissiveIntensity: 0 }); R.winGlow = lit;
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; if (Math.cos(a) < -0.85) continue; const w = box(R.g, 1.1, 1.7, 0.1, lit, Math.sin(a) * 9.42, 2.3, 18 + Math.cos(a) * 9.42); w.rotation.y = a; }
  for (const x of [-3, -1.2, 1.2, 3]) lathe(R.g, [[0.001, 0], [0.34, 0], [0.34, 0.2], [0.26, 0.3], [0.24, 4.2], [0.34, 4.35], [0.36, 4.5], [0.001, 4.5]], mat.stone([2, 3]), x, 0, 7.6, 24);
  box(R.g, 7.4, 0.5, 2.2, mat.stone([6, 1]), 0, 4.75, 8.2);
  const ped = new THREE.Shape(); ped.moveTo(-3.8, 0); ped.lineTo(3.8, 0); ped.lineTo(0, 1.2); ped.closePath();
  add(R.g, new THREE.ExtrudeGeometry(ped, { depth: 2.2, bevelEnabled: false }), mat.stone([2, 1]), 0, 5.0, 7.1);
  plaqueMesh(R.g, 'THE AQUADOME', 3.2, 0.42, 0, 5.45, 7.06, Math.PI, { size: 0.5, bg: '#8a7a5a', fg: '#2a2014' });
  door(R, 0, 9.05, 'Lobby', 'exit_terrace', [0, 0]);
  for (let i = 0; i < 3; i++) box(R.g, 7 - i * 0.6, 0.12, 0.5, mat.stone([4, 1]), 0, 0.06 + i * 0.12, 6.9 + i * 0.5);
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
