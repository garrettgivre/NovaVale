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

////// ---------- Spa & Pools: the old bathhouse ----------
// Merges meshes that never move into one mesh per material (fewer draw calls). cast = true keeps shadows.
function spBatch(parent, cast = false) {
  const lists = new Map(), mt = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const b = {
    geo(g, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
      const c = g.clone(); e.set(rx, ry, rz); q.setFromEuler(e); v.set(x, y, z); s.set(sx, sy, sz);
      c.applyMatrix4(mt.compose(v, q, s));
      if (!lists.has(m)) lists.set(m, []);
      lists.get(m).push(c.index ? c.toNonIndexed() : c); return b;
    },
    box(m, w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) { return b.geo(new THREE.BoxGeometry(w, h, d), m, x, y, z, rx, ry, rz); },
    cyl(m, rt, rb, h, x, y, z, seg = 16, rx = 0, ry = 0, rz = 0) { return b.geo(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z, rx, ry, rz); },
    sph(m, r, x, y, z, sx = 1, sy = 1, sz = 1, seg = 12) { return b.geo(new THREE.SphereGeometry(r, seg, Math.max(4, seg >> 1)), m, x, y, z, 0, 0, 0, sx, sy, sz); },
    lathe(m, pts, x, y, z, seg = 24) { return b.geo(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg), m, x, y, z); },
    done() {
      for (const [m, list] of lists) {
        let n = 0; for (const g of list) n += g.attributes.position.count;
        const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2); let o = 0;
        for (const g of list) {
          const c = g.attributes.position.count;
          P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3);
          if (g.attributes.uv) U.set(g.attributes.uv.array, o * 2);
          o += c;
        }
        const bg = new THREE.BufferGeometry();
        bg.setAttribute('position', new THREE.BufferAttribute(P, 3)); bg.setAttribute('normal', new THREE.BufferAttribute(N, 3)); bg.setAttribute('uv', new THREE.BufferAttribute(U, 2));
        const me = new THREE.Mesh(bg, m); if (!cast) me.userData.nocast = 1; parent.add(me);
      }
      lists.clear();
    },
  };
  return b;
}

// A tiled texture: cw x ch pixel tiles (half = running bond), picked from `cols`, with grout and grime.
function spTileTex(key, { S = 256, cw, ch, half = 0, cols, grout = '#c9c1ac', gw = 1, seed = 3, grime = 0.3, vary = 0.07, rowCol = null }) {
  return once(key, () => {
    const N = T.fbm(S, S, { scale: 4, oct: 4, seed }), r = T.rng(seed), G = T.hexRGB(grout), C = cols.map(c => T.hexRGB(c));
    const nx = Math.ceil(S / cw), ny = Math.ceil(S / ch);
    const pick = Array.from({ length: nx * ny }, () => [Math.floor(r() * C.length), 1 - vary / 2 + r() * vary]);
    const P = T.pix(S, S, (x, y) => {
      const row = Math.floor(y / ch), xx = (x + (half && (row & 1) ? cw / 2 : 0)) % S, col = Math.floor(xx / cw);
      const gx = xx % cw, gy = y % ch, ed = Math.min(gx, gy, cw - 1 - gx, ch - 1 - gy), n = N[y * S + x];
      if (ed < gw) return G.map(c => c * (0.82 - grime * 0.45 * n)).concat(0.1);
      const [ci, k] = pick[row * nx + col];
      let B = C[ci];
      if (rowCol) { const rc = rowCol(row); if (rc) B = T.hexRGB(rc); }
      const bev = ed < gw + 1 ? 1.07 : 1, dirt = 1 - grime * Math.max(0, n - 0.5) * 0.8;
      return [B[0] * k * bev * dirt, B[1] * k * bev * dirt, B[2] * k * bev * dirt, 0.8];
    });
    return T.done(P);
  });
}

// Mosaic frieze 1 m x 0.3125 m: teal and gold borders round a field of diamonds.
function spFriezeTex() {
  return once('spFrieze', () => {
    const W = 512, H = 160, cs = 8, cream = [232, 222, 196], teal = [52, 112, 112], gold = [196, 158, 78], navy = [34, 58, 84], r = T.rng(5);
    const tint = Array.from({ length: 64 * 20 }, () => 0.93 + r() * 0.1);
    const P = T.pix(W, H, (x, y) => {
      const cx = Math.floor(x / cs), cy = Math.floor(y / cs), gx = x % cs, gy = y % cs;
      let c = cream;
      if (cy < 2 || cy > 17) c = teal; else if (cy === 2 || cy === 17) c = gold; else if (cy === 3 || cy === 16) c = cream;
      else {
        const u = cx % 16, v = cy - 4, dd = Math.abs(u - 7.5) / 8 + Math.abs(v - 5.5) / 6;
        c = dd < 0.22 ? gold : dd < 0.46 ? navy : dd < 0.72 ? teal : (u % 8 === 0 && v % 6 === 0 ? gold : cream);
      }
      const k = tint[cy * 64 + cx], ed = Math.min(gx, gy, cs - 1 - gx, cs - 1 - gy);
      if (ed < 1) return [150, 142, 120, 0.1];
      return [c[0] * k, c[1] * k, c[2] * k, 0.8];
    });
    return T.done(P);
  });
}

// Round floor mosaic for the entrance hall (uv runs across the whole disc).
function spMedallionTex() {
  return once('spMed', () => {
    const S = 512, cs = 6, cream = [226, 216, 190], teal = [48, 108, 108], gold = [194, 154, 74], navy = [34, 56, 82], r = T.rng(9);
    const P = T.pix(S, S, (x, y) => {
      const cx = Math.floor(x / cs) * cs + cs / 2 - S / 2, cy = Math.floor(y / cs) * cs + cs / 2 - S / 2;
      const rr = Math.hypot(cx, cy) / (S / 2), a = Math.atan2(cy, cx);
      let c = cream;
      if (rr < 0.14) c = gold; else if (rr < 0.18) c = navy;
      else if (rr < 0.5) { const lobe = 0.2 + 0.28 * Math.pow(Math.max(0, Math.cos(a * 8)), 0.7); c = rr < lobe ? (rr > lobe - 0.04 ? gold : teal) : cream; }
      else if (rr < 0.54) c = gold;
      else if (rr < 0.76) c = Math.floor((a + Math.PI) / (Math.PI * 2) * 32) % 2 ? navy : cream;
      else if (rr < 0.8) c = gold; else if (rr < 0.92) c = teal; else if (rr < 0.95) c = cream; else if (rr < 0.98) c = navy; else c = cream;
      const k = 0.94 + ((Math.floor(x / cs) * 7 + Math.floor(y / cs) * 13) % 9) * 0.012;
      const gx = x % cs, gy = y % cs;
      if (Math.min(gx, gy) < 1) return [160, 152, 130, 0.1];
      return [c[0] * k, c[1] * k, c[2] * k, 0.8];
    });
    return T.done(P);
  });
}

// Water caustics: bright wandering lines (tileable), shown additively over the pool floor.
function spCausticTex() {
  return once('spCaus', () => {
    const S = 256, A = T.fbm(S, S, { scale: 3, oct: 3, seed: 11 }), B = T.fbm(S, S, { scale: 3, oct: 3, seed: 23 });
    const P = T.pix(S, S, (x, y) => { const d = Math.abs(A[y * S + x] - B[y * S + x]), v = 255 * Math.pow(Math.max(0, 1 - d * 7), 3); return [v, v, v, 0.5]; });
    return T.done(P).map;
  });
}

// Soft drifting steam (white with a noisy alpha).
function spMistTex() {
  return once('spMist', () => {
    const S = 256, N = T.fbm(S, S, { scale: 3, oct: 4, seed: 31 }), c = T.canvas(S, S), g = c.getContext('2d'), im = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4, a = Math.max(0, N[y * S + x] - 0.42) * 2.2;
      im.data[i] = 235; im.data[i + 1] = 245; im.data[i + 2] = 242; im.data[i + 3] = Math.min(255, a * 255);
    }
    g.putImageData(im, 0, 0); return T.toTex(c);
  });
}

function spSignTex(w, h, draw) { return T.textCanvas(w, h, draw); }

// Fluted shaft: a cylinder whose radius dips between flutes.
function spFlute(rt, rb, h, n = 16) {
  const g = new THREE.CylinderGeometry(rt, rb, h, 64, 1, true), a = g.attributes.position;
  for (let i = 0; i < a.count; i++) {
    const x = a.getX(i), z = a.getZ(i), ang = Math.atan2(z, x), f = 0.5 + 0.5 * Math.cos(ang * n), k = 1 - 0.05 * Math.pow(1 - f, 1.5);
    a.setX(i, x * k); a.setZ(i, z * k);
  }
  g.computeVertexNormals(); return g;
}

// Arched outline w wide, h tall (base at y 0).
function spArch(w, h, hole = false) {
  const s = new THREE.Shape(), r = w / 2;
  s.moveTo(-r, 0); s.lineTo(-r, h - r); s.absarc(0, h - r, r, Math.PI, 0, true); s.lineTo(r, 0); s.closePath();
  return s;
}

function spColumn(b, M, x, z) {
  const { stone, stoneRough } = M;
  b.box(stone, 0.66, 0.16, 0.66, x, 0.08, z);
  b.lathe(stone, [[0.001, 0.16], [0.36, 0.16], [0.36, 0.22], [0.3, 0.27], [0.3, 0.3], [0.25, 0.34], [0.22, 0.4], [0.001, 0.4]], x, 0, z, 28);
  b.geo(spFlute(0.2, 0.225, 2.64, 16), stoneRough, x, 1.72, z);
  b.lathe(stone, [[0.2, 0], [0.24, 0.03], [0.22, 0.07], [0.21, 0.12], [0.26, 0.2], [0.32, 0.32], [0.38, 0.46], [0.4, 0.5], [0.001, 0.5]], x, 3.04, z, 28);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + 0.2;
    b.sph(stone, 0.1, x + Math.cos(a) * 0.235, 3.2, z + Math.sin(a) * 0.235, 0.7, 1.9, 0.38, 8);
    b.geo(new THREE.SphereGeometry(0.08, 8, 6), stone, x + Math.cos(a + 0.4) * 0.3, 3.38, z + Math.sin(a + 0.4) * 0.3, 0, -a - 0.4, -0.3, 0.8, 1.5, 0.35);
  }
  b.box(stone, 0.84, 0.1, 0.84, x, 3.59, z); b.box(stone, 0.74, 0.07, 0.74, x, 3.52, z);
}

// Recessed-looking arched niche with a surround, a shelf and an urn. (wall point x,z; ry faces into the room)
function spNiche(b, M, x, y, z, ry, w = 0.72, h = 1.5, urn = 0) {
  const shape = spArch(w, h), outer = spArch(w + 0.26, h + 0.13);
  outer.holes.push(new THREE.Path(shape.getPoints(10)));
  const sin = Math.sin(ry), cos = Math.cos(ry), at = (lx, lz) => [x + cos * lx + sin * lz, z - sin * lx + cos * lz];
  const fr = new THREE.ExtrudeGeometry(outer, { depth: 0.1, bevelEnabled: false, curveSegments: 10 });
  { const [fx, fz] = at(0, 0.01); b.geo(fr, M.plaster, fx, y, fz, 0, ry, 0); }
  const back = new THREE.ShapeGeometry(shape, 10);
  { const [gx, gz] = at(0, 0.012); b.geo(back, M.nicheBack, gx, y, gz, 0, ry, 0); }
  const [sx, sz] = at(0, 0.09);
  b.box(M.stoneRough, w + 0.06, 0.05, 0.16, sx, y + 0.01, sz, ry);
  const [ux, uz] = at(0, 0.1);
  const pts = urn ? [[0.001, 0], [0.07, 0], [0.09, 0.04], [0.15, 0.2], [0.16, 0.3], [0.1, 0.4], [0.07, 0.48], [0.1, 0.52], [0.001, 0.52]] : [[0.001, 0], [0.06, 0], [0.05, 0.1], [0.1, 0.2], [0.12, 0.34], [0.08, 0.42], [0.001, 0.42]];
  b.lathe(urn ? M.celadon : M.terra, pts, ux, y + 0.035, uz);
}

// Brass pool ladder: rails arch over the coping and down into the water, with treads. dir = +1 deck at +z of the pool edge.
function spLadder(b, M, x, zEdge, dir) {
  for (const sx of [-0.2, 0.2]) {
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x + sx, -0.95, zEdge - dir * 0.1), new THREE.Vector3(x + sx, 0.4, zEdge - dir * 0.1), new THREE.Vector3(x + sx, 0.88, zEdge - dir * 0.08),
      new THREE.Vector3(x + sx, 1.0, zEdge + dir * 0.06), new THREE.Vector3(x + sx, 0.9, zEdge + dir * 0.24), new THREE.Vector3(x + sx, 0.45, zEdge + dir * 0.3), new THREE.Vector3(x + sx, 0.07, zEdge + dir * 0.3)]);
    b.geo(new THREE.TubeGeometry(c, 28, 0.02, 8), M.brass);
    b.cyl(M.brass, 0.045, 0.05, 0.02, x + sx, 0.07, zEdge + dir * 0.3, 12);
  }
  for (const y of [-0.15, -0.45, -0.75]) b.cyl(M.brass, 0.015, 0.015, 0.4, x, y, zEdge - dir * 0.1, 8, 0, 0, Math.PI / 2);
}

// Trolley with stacked folded towels.
function spTrolley(b, M, x, z, ry) {
  const cs = Math.cos(ry), sn = Math.sin(ry), P = (lx, lz) => [x + cs * lx + sn * lz, z - sn * lx + cs * lz];
  const rails = (lx, lz, w, h, d, y) => { const [px, pz] = P(lx, lz); b.box(M.brass, w, h, d, px, y, pz, ry); };
  for (const [sx, sz] of [[-0.42, -0.24], [0.42, -0.24], [-0.42, 0.24], [0.42, 0.24]]) { const [px, pz] = P(sx, sz); b.cyl(M.brass, 0.014, 0.014, 0.9, px, 0.55, pz, 8); b.cyl(M.rubber, 0.05, 0.05, 0.03, px, 0.06, pz, 12, Math.PI / 2, ry, 0); }
  for (const y of [0.18, 0.62]) { const [px, pz] = P(0, 0); b.box(M.oakD, 0.92, 0.035, 0.56, px, y, pz, ry); }
  rails(0, 0.27, 0.92, 0.04, 0.02, 0.98); rails(0, -0.27, 0.92, 0.04, 0.02, 0.98);
  for (const sx of [-0.46, 0.46]) { const [px, pz] = P(sx, 0); b.box(M.brass, 0.02, 0.04, 0.56, px, 0.98, pz, ry); }
  const tw = (lx, y, k, w) => { const [px, pz] = P(lx, 0); b.box(k ? M.towelB : M.towelA, w, 0.07, 0.34, px, y, pz, ry + (k ? 0.04 : -0.03)); };
  for (let i = 0; i < 5; i++) tw(-0.24, 0.655 + i * 0.072, i % 2, 0.34);
  for (let i = 0; i < 4; i++) tw(0.22, 0.655 + i * 0.072, (i + 1) % 2, 0.34);
  for (let i = 0; i < 3; i++) tw(-0.2, 0.215 + i * 0.072, i % 2, 0.4);
  for (let i = 0; i < 3; i++) { const [px, pz] = P(0.26 + i * 0.1, 0.02); b.cyl(M.towelA, 0.055, 0.055, 0.3, px, 0.255, pz, 10, Math.PI / 2, ry, 0); }
}

function buildSpa() {
  const R = mkRoom('spa', { p: [2, 8, -9], t: [0, 0, 0], s: 8, day: [0xfff0d8, 2.2], night: [0x8090c0, 0.3] });
  const h = 3.8, gl = (c, rough = 0.28) => M(0xffffff, rough, 0, { t: c, bump: 0.012 });
  // ---- materials (shared by everything below)
  const TF = spTileTex('spFloor', { cw: 16, ch: 16, cols: ['#e6dfca', '#e6dfca', '#dcd4bd', '#ebe5d2', '#e6dfca', '#b9cfc2', '#a6c3b6'], grout: '#9d957e', seed: 4, grime: 0.55, vary: 0.1 });
  const TW = spTileTex('spWallT', { cw: 32, ch: 16, half: 1, cols: ['#ece5d2', '#e8e1ce', '#efe9d8', '#e4dcc6'], grout: '#c2baa2', seed: 7, grime: 0.28 });
  const TG = spTileTex('spGreen', { cw: 32, ch: 32, cols: ['#45766d', '#487a70', '#41716a', '#4a7d72'], grout: '#b8b09a', gw: 1, seed: 8, grime: 0.3, vary: 0.06 });
  const TP = spTileTex('spPool', { cw: 16, ch: 16, cols: ['#4d9296', '#4a8d92', '#55999a', '#468a90'], grout: '#b6c6bd', seed: 2, grime: 0.25, vary: 0.1, rowCol: r => r === 0 ? '#1f3e55' : r === 1 ? '#eae4d0' : null });
  const TPF = spTileTex('spPoolF', { cw: 16, ch: 16, cols: ['#3a7d84', '#367a80', '#41868a', '#337379'], grout: '#9fb4ab', seed: 3, grime: 0.4, vary: 0.1 });
  const M0 = {
    stone: mat.stone([2, 3]), stoneRough: mat.stone([2, 2]),
    plaster: M(0xe9e1cf, 0.85, 0, { t: TX.plaster(), rep: [1, 1], bump: 0.02 }),
    nicheBack: M(0x3d5f5c, 0.7, 0, { emissive: 0x1d3a38, emissiveIntensity: 0.5 }),
    celadon: M(0x8fb1a0, 0.3, 0.05), terra: M(0xa8603c, 0.7), brass: BRASS, oakD: mat.oak(), rubber: M(0x1c1c1c, 0.9),
    towelA: M(0xf0ece0, 0.95, 0, { t: TX.linen(), rep: [1, 1] }), towelB: M(0xcfe0dc, 0.95, 0, { t: TX.linen(), rep: [1, 1] }),
  };
  const bc = spBatch(R.g, true), bn = spBatch(R.g, false);
  const plane = (w, d, m, x, y, z, rot, rep) => { const mm = rep ? reTex(m, rep[0], rep[1]) : m; const p = struct(add(R.g, new THREE.PlaneGeometry(w, d), mm, x, y, z)); p.rotation.set(rot[0], rot[1], rot[2] || 0); return p; };
  const flat = [-Math.PI / 2, 0, 0];

  // ---- deck floor (small tiles) with a mosaic border round the pool and a medallion by the door
  const floor = gl(TF, 0.3);
  const F = (x0, x1, z0, z1) => plane(x1 - x0, z1 - z0, floor, (x0 + x1) / 2, 0, (z0 + z1) / 2, flat, [(x1 - x0) / 1.5, (z1 - z0) / 1.5]);
  F(-6, -3, -5, 5); F(3, 6, -5, 5); F(-3, 3, 0.8, 5); F(-3, 3, -5, -3.6);
  const frieze = M(0xffffff, 0.3, 0, { t: { map: spFriezeTex().map, bump: spFriezeTex().bump }, bump: 0.01 });
  const bd = (w, x, z, rz) => plane(w, 0.3125, frieze, x, 0.006, z, [-Math.PI / 2, 0, rz], [w, 1]);
  bd(6.3, 0, 1.12, 0); bd(6.3, 0, -3.92, Math.PI); bd(5.4, -3.3, -1.4, Math.PI / 2); bd(5.4, 3.3, -1.4, -Math.PI / 2);
  const med = M(0xffffff, 0.3, 0, { t: spMedallionTex(), bump: 0.01 });
  const md = struct(add(R.g, new THREE.CircleGeometry(1.15, 48), med, 0, 0.007, 3.0)); md.rotation.x = -Math.PI / 2;
  const drainM = M(0xb09050, 0.4, 0.9);
  for (const [dx, dz] of [[-4.0, -2.0], [4.0, 3.4], [-1.6, 2.2]]) { bn.cyl(drainM, 0.1, 0.1, 0.01, dx, 0.008, dz, 16); bn.cyl(M(0x2a2218, 0.8), 0.07, 0.07, 0.012, dx, 0.009, dz, 12); }

  // ---- the pool: small tiles, wet colour, steps, caustics, deeper water in the middle
  const pw = (w, d, x, y, z, rx, ry, m, rep) => plane(w, d, m, x, y, z, [rx, ry, 0], rep);
  const poolWall = gl(TP, 0.22), poolFl = gl(TPF, 0.25);
  pw(6, 4.4, 0, -1.3, -1.4, -Math.PI / 2, 0, poolFl, [6 / 1.3, 4.4 / 1.3]);
  pw(6, 1.3, 0, -0.65, -3.6, 0, 0, poolWall, [6 / 1.3, 1]); pw(6, 1.3, 0, -0.65, 0.8, 0, Math.PI, poolWall, [6 / 1.3, 1]);
  pw(4.4, 1.3, -3, -0.65, -1.4, 0, Math.PI / 2, poolWall, [4.4 / 1.3, 1]); pw(4.4, 1.3, 3, -0.65, -1.4, 0, -Math.PI / 2, poolWall, [4.4 / 1.3, 1]);
  const stepM = gl(TPF, 0.22);
  bn.box(stepM, 0.55, 0.85, 1.3, -2.725, -0.875, 0.1); bn.box(stepM, 0.3, 0.45, 1.3, -2.15, -1.075, 0.1);
  const caus = spCausticTex().clone(); caus.needsUpdate = true; caus.repeat.set(2.2, 1.6); caus.wrapS = caus.wrapT = THREE.RepeatWrapping;
  const cm = new THREE.MeshBasicMaterial({ map: caus, color: 0x9fe8dc, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.3 });
  const cp = add(R.g, new THREE.PlaneGeometry(6, 4.4), cm, 0, -1.285, -1.4); cp.rotation.x = -Math.PI / 2; cp.userData.nocast = 1;
  const cw = new THREE.MeshBasicMaterial({ map: caus, color: 0x6fc8c0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.25 });
  for (const [w, x, z, ry] of [[6, 0, -3.59, 0], [6, 0, 0.79, Math.PI], [4.4, -2.99, -1.4, Math.PI / 2], [4.4, 2.99, -1.4, -Math.PI / 2]]) { const q = add(R.g, new THREE.PlaneGeometry(w, 1.0), cw, x, -0.7, z); q.rotation.y = ry; q.userData.nocast = 1; }
  const wg = new THREE.PlaneGeometry(6, 4.4, 30, 20), wcol = new Float32Array(wg.attributes.position.count * 3), wpos = wg.attributes.position;
  for (let i = 0; i < wpos.count; i++) {
    const d = Math.min(3 - Math.abs(wpos.getX(i)), 2.2 - Math.abs(wpos.getY(i))), k = Math.min(1, d / 1.5), c = [0.2 - 0.17 * k, 0.5 - 0.34 * k, 0.52 - 0.3 * k];
    wcol.set(c, i * 3);
  }
  wg.setAttribute('color', new THREE.BufferAttribute(wcol, 3));
  const wat = add(R.g, wg, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.05, metalness: 0.1, envMapIntensity: 0.25, transparent: true, opacity: 0.9, depthWrite: false }), 0, -0.2, -1.4);
  wat.rotation.x = -Math.PI / 2; wat.userData.nocast = 1;
  const wp = wat.geometry.attributes.position;
  const night1 = () => night();
  updaters.push((dt, t) => {
    if (!R.g.visible) return;
    for (let i = 0; i < wp.count; i++) wp.setZ(i, Math.sin(wp.getX(i) * 2 + t) * 0.012 + Math.cos(wp.getY(i) * 3 + t * 0.7) * 0.01);
    wp.needsUpdate = true; wat.geometry.computeVertexNormals();
    caus.offset.set(t * 0.012, t * 0.008); mist1.map.offset.set(t * 0.006, t * 0.003); mist2.map.offset.set(-t * 0.004, t * 0.005);
    sky.color.set(night1() ? 0x161c30 : 0xdcecf2);
  });
  // steam sheets
  const mkMist = (o) => { const mp = spMistTex().clone(); mp.needsUpdate = true; mp.wrapS = mp.wrapT = THREE.RepeatWrapping; mp.repeat.set(2, 1.5); return new THREE.MeshBasicMaterial({ map: mp, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide }); };
  const mist1 = mkMist(0.11), mist2 = mkMist(0.08);
  for (const [m, y, w, d] of [[mist1, -0.12, 5.8, 4.2], [mist2, 0.02, 5.4, 3.8]]) { const p = add(R.g, new THREE.PlaneGeometry(w, d), m, 0, y, -1.4); p.rotation.x = -Math.PI / 2; p.userData.nocast = 1; p.renderOrder = 2; }

  // ---- marble coping, ladders, depth markers
  const coping = mat.marbleTopM;
  for (const [w, x, z, ry] of [[6.3, 0, 0.87, 0], [6.3, 0, -3.67, 0], [4.7, -3.07, -1.4, Math.PI / 2], [4.7, 3.07, -1.4, Math.PI / 2]]) bn.box(coping, w, 0.06, 0.16, x, 0.03, z, ry);
  spLadder(bc, M0, 2.5, 0.8, 1); spLadder(bc, M0, -1.6, -3.6, -1);
  const depthTex = (txt, w, h) => new THREE.MeshBasicMaterial({ map: T.textCanvas(w, h, (g) => { g.fillStyle = '#ece6d4'; g.fillRect(0, 0, w, h); g.strokeStyle = '#1f3e55'; g.lineWidth = 5; g.strokeRect(5, 5, w - 10, h - 10); g.fillStyle = '#1f3e55'; g.font = '700 ' + Math.round(h * 0.5) + 'px Cinzel, Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w / 2, h / 2 + 3); }), polygonOffset: true, polygonOffsetFactor: -2 });
  for (const [txt, x, z, ry] of [['5 FT 6 IN', -2, -3.92, 0], ['5 FT 6 IN', 2, -3.92, 0], ['3 FT 6 IN', -1.2, 1.12, Math.PI], ['3 FT 6 IN', 1.2, 1.12, Math.PI]]) { const p = add(R.g, new THREE.PlaneGeometry(0.62, 0.2), depthTex(txt, 256, 82), x, 0.012, z); p.rotation.set(-Math.PI / 2, 0, ry); p.userData.nocast = 1; }

  // ---- walls: green glazed dado, mosaic frieze, ivory tile above, plaster cornice with dentils
  const wUp = gl(TW, 0.4), wLo = gl(TG, 0.25), wCap = M(0xe6dec9, 0.6);
  const run = (len, x, z, ry, y0, y1, m, cov, partial) => {
    const hh = y1 - y0, p = struct(add(R.g, new THREE.PlaneGeometry(len, hh), reTex(m, len / cov, hh / cov), x, y0 + hh / 2, z)); p.rotation.y = ry; return p;
  };
  const walls = [[12, 0, 5, Math.PI, 1], [10, -6, 0, Math.PI / 2, 1], [10, 6, 0, -Math.PI / 2, 1]];
  for (const [len, x, z, ry] of walls) {
    const nx = Math.sin(ry), nz = Math.cos(ry);
    run(len, x, z, ry, 0, 1.2, wLo, 1.2); run(len, x, z, ry, 1.56, h, wUp, 1.2);
    const fz = plane(len, 0.3125, frieze, x + nx * 0.004, 1.38, z + nz * 0.004, [0, ry, 0], [len, 1]);
    for (const [y, hh] of [[1.2, 0.04], [1.56, 0.03]]) { const bx = bn.box(wCap, len, hh, 0.045, x + nx * 0.022, y, z + nz * 0.022, ry); }
  }
  for (const [len, x, z, ry] of walls) aoRun(R.g, len, x, z, ry, h, { ceil: 0.15, o: 0.35 });
  aoRun(R.g, 12, 0, -5, 0, h, { ceil: 0.15, o: 0.35 });
  // back wall: green knee, ivory above the glazing, side strips
  run(12, 0, -5, 0, 0, 0.555, wLo, 1.2); run(12, 0, -5, 0, 3.0, h, wUp, 1.2); run(0.3, -5.85, -5, 0, 0.555, 3.0, wUp, 1.2); run(0.3, 5.85, -5, 0, 0.555, 3.0, wUp, 1.2);
  skyWindow(R, 11.4, 2.45, 0, 1.78, -4.98);
  // cornice with dentils
  const crown2 = M(0xe6dec9, 0.75, 0, { t: TX.plaster(), rep: [2, 1], bump: 0.02 });
  for (const [len, x, z, ry] of [[12, 0, 5, Math.PI], [12, 0, -5, 0], [10, -6, 0, Math.PI / 2], [10, 6, 0, -Math.PI / 2]]) {
    const nx = Math.sin(ry), nz = Math.cos(ry), ex = Math.cos(ry), ez = -Math.sin(ry);
    bn.box(crown2, len, 0.2, 0.2, x + nx * 0.1, h - 0.1, z + nz * 0.1, ry); bn.box(crown2, len, 0.07, 0.3, x + nx * 0.15, h - 0.22, z + nz * 0.15, ry);
    for (let i = 0; i < len / 0.1 - 1; i++) { const o = -len / 2 + 0.1 + i * 0.1; bn.box(crown2, 0.05, 0.05, 0.04, x + ex * o + nx * 0.3, h - 0.275, z + ez * o + nz * 0.3, ry); }
  }

  // ---- ceiling: coffers with a skylight, brass-capped pendants
  const ceilM = M(0xffffff, 0.9, 0, { t: TX.plaster(), rep: [4, 3], emissive: 0x6a5a44, emissiveIntensity: 0.55, color: 0xe6dcc6 });
  struct(add(R.g, new THREE.PlaneGeometry(12, 10), ceilM, 0, h, 0)).rotation.x = Math.PI / 2;
  const beamM = M(0xe2d9c4, 0.8, 0, { t: TX.plaster(), rep: [2, 1], bump: 0.02, emissive: 0xa08c68, emissiveIntensity: 0.7, color: 0xf0e8d6 });
  const BX = [-4.4, -2, 2, 4.4], BZ = [-4.2, -2.8, 0, 1.95, 3.9];
  for (const z of BZ) { bn.box(beamM, 12, 0.24, 0.3, 0, h - 0.12, z); bn.box(crown2, 12, 0.05, 0.38, 0, h - 0.26, z); }
  for (const x of BX) { bn.box(beamM, 0.3, 0.24, 10, x, h - 0.12, 0); bn.box(crown2, 0.38, 0.05, 10, x, h - 0.26, 0); }
  const rosM = M(0xd6cdb6, 0.8, 0, { emissive: 0x4a3e2c, emissiveIntensity: 0.4, side: THREE.DoubleSide });
  const cx0 = [-5.2, -3.2, 0, 3.2, 5.2], cz0 = [-3.5, -1.4, 0.97, 2.9, 4.45];
  for (const x of cx0) for (const z of cz0) { if (Math.abs(x) < 1 && z === -1.4) continue; bn.lathe(rosM, [[0.001, -0.05], [0.14, -0.05], [0.2, -0.04], [0.26, -0.02], [0.27, 0]], x, h - 0.001, z, 20); }
  const sky = new THREE.MeshBasicMaterial({ color: 0xdcecf2 });
  const sg = add(R.g, new THREE.PlaneGeometry(3.85, 2.55), sky, 0, h - 0.02, -1.4); sg.rotation.x = Math.PI / 2; sg.userData.nocast = 1;
  const barM = M(0xcfc6b0, 0.5, 0.3);
  for (let i = 0; i <= 6; i++) bn.box(barM, 0.04, 0.05, 2.6, -1.92 + i * 0.64, h - 0.05, -1.4);
  for (let i = 0; i <= 3; i++) bn.box(barM, 3.9, 0.05, 0.04, 0, h - 0.05, -2.68 + i * 0.85);
  const glow = M(0xfff0d8, 0.4, 0, { emissive: 0xffd9a0, emissiveIntensity: 1.5 }), bg = spBatch(R.g, false);
  for (const [px, pz] of [[-3.2, 0.97], [3.2, 0.97], [-3.2, -3.5], [3.2, -3.5], [-3.2, 2.9], [3.2, 2.9]]) {
    bn.cyl(BRASS, 0.01, 0.01, 0.62, px, h - 0.55, pz, 6); bn.cyl(BRASS, 0.08, 0.04, 0.06, px, h - 0.27, pz, 12);
    bn.lathe(BRASS, [[0.001, 0], [0.1, 0], [0.1, 0.03], [0.06, 0.05]], px, h - 0.9, pz, 14);
    bg.sph(glow, 0.15, px, h - 1.04, pz, 1, 1.1, 1, 16);
    bn.geo(new THREE.TorusGeometry(0.155, 0.007, 6, 20), BRASS, px, h - 1.04, pz, Math.PI / 2, 0, 0);
    bn.geo(new THREE.TorusGeometry(0.15, 0.007, 6, 20), BRASS, px, h - 0.96, pz, Math.PI / 2, 0, 0, 0.9, 0.9, 1);
    bn.cyl(BRASS, 0.04, 0.012, 0.07, px, h - 1.26, pz, 10);
  }
  bg.done();

  // ---- columns, niches, door surround
  for (const x of [-4.4, 4.4]) for (const z of [-4.2, 3.9]) spColumn(bc, M0, x, z);
  for (const [nx, nz, ry, u] of [[-2.9, 4.98, Math.PI, 1], [2.9, 4.98, Math.PI, 0], [-5.98, -3.2, Math.PI / 2, 0], [-5.98, 0.6, Math.PI / 2, 1], [5.98, -4.2, -Math.PI / 2, 1], [5.98, 3.0, -Math.PI / 2, 0]]) spNiche(bn, M0, nx, 0.9, nz, ry, 0.72, 1.5, u);
  for (const s of [-1, 1]) {
    bn.box(M0.plaster, 0.22, 3.0, 0.1, s * 1.08, 1.5, 4.95); bn.box(M0.plaster, 0.3, 0.12, 0.14, s * 1.08, 3.04, 4.94); bn.box(M0.plaster, 0.3, 0.14, 0.14, s * 1.08, 0.07, 4.94);
  }
  bn.box(M0.plaster, 2.7, 0.14, 0.2, 0, 3.2, 4.92); bn.box(M0.plaster, 2.5, 0.08, 0.14, 0, 3.32, 4.92);

  // ---- loungers, side table, towels, plants (the story props keep their places)
  const teak = mat.oak(), cush = M(0xd8ccb0, 0.9, 0, { t: TX.linen(), rep: [2, 2] }), stripe = M(0x3d6e66, 0.9, 0, { t: TX.linen(), rep: [2, 2] });
  for (const z of [-2.4, 0.2]) {
    const px = (lx, ly, lz) => [5 + lx, ly, z + lz];
    for (let i = 0; i < 8; i++) bc.box(teak, 0.62, 0.03, 0.12, ...px(0, 0.3, 0.8 - i * 0.16));
    for (const s of [-1, 1]) {
      bc.box(teak, 0.04, 0.3, 0.04, ...px(s * 0.3, 0.15, 0.8)); bc.box(teak, 0.04, 0.3, 0.04, ...px(s * 0.3, 0.15, -0.3)); bc.box(teak, 0.04, 0.04, 1.8, ...px(s * 0.31, 0.3, 0.2));
      bc.box(M0.brass, 0.02, 0.02, 0.1, ...px(s * 0.31, 0.3, 1.1));
    }
    bc.box(teak, 0.62, 0.05, 0.75, ...px(0, 0.56, -0.62), 0, 0.75);
    bc.box(cush, 0.58, 0.07, 1.15, ...px(0, 0.36, 0.2));
    bc.box(stripe, 0.5, 0.012, 0.9, ...px(0, 0.4, 0.28));
    bc.box(cush, 0.52, 0.06, 0.62, ...px(0, 0.58, -0.6), 0, 0.75);
    bc.cyl(M0.towelA, 0.07, 0.07, 0.46, ...px(0, 0.5, -0.17), 12, 0, 0, Math.PI / 2);
    bc.box(M0.towelB, 0.4, 0.04, 0.34, ...px(0, 0.44, 0.78));
  }
  const tb = new THREE.Group(); tb.position.set(4.35, 0, 1.75); R.g.add(tb);
  cyl(tb, 0.34, 0.34, 0.03, mat.marbleTopM, 0, 0.62, 0, 28); cyl(tb, 0.025, 0.03, 0.6, IRON, 0, 0.3, 0, 8);
  for (let i = 0; i < 3; i++) box(tb, 0.04, 0.02, 0.36, IRON, 0, 0.02, 0).rotation.y = i * 2.1;
  box(tb, 0.21, 0.004, 0.297, M(0xf0e8d8, 0.9), -0.02, 0.638, 0).rotation.y = 0.35;
  lathe(tb, [[0.001, 0], [0.03, 0], [0.045, 0.05], [0.042, 0.055]], M(0xf4f0e8, 0.3), 0.18, 0.636, -0.12, 16);
  hit(tb, 0, 0.7, 0, 0.35, 'lyrics', 'Lyric sheet');
  for (let i = 0; i < 4; i++) box(R.g, 0.5, 0.08, 0.35, M([0xe8e0d0, 0xd8d0c0][i % 2], 0.95, 0, { t: TX.linen(), rep: [2, 2] }), -5.3, 0.04 + i * 0.085, 3.8);
  spTrolley(bc, M0, -3.5, 4.35, 0.12);
  palm(R.g, -5.2, -1, 1.2); palm(R.g, 5.2, -4.3, 1.1); palm(R.g, -5.2, 2.2, 1); palm(R.g, 5.3, 4.3, 0.9);

  // ---- wall pieces: clock, rules sign, lifebuoy
  const clockTex = T.textCanvas(256, 256, (g) => {
    g.fillStyle = '#efe8d6'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill();
    g.strokeStyle = '#2a2014'; g.fillStyle = '#2a2014'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 26px Cinzel, Georgia, serif';
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 - Math.PI / 2; g.lineWidth = 3; g.beginPath(); g.moveTo(128 + Math.cos(a) * 108, 128 + Math.sin(a) * 108); g.lineTo(128 + Math.cos(a) * 118, 128 + Math.sin(a) * 118); g.stroke(); g.fillText(['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'][i], 128 + Math.cos(a) * 86, 128 + Math.sin(a) * 86); }
    g.lineCap = 'round'; g.lineWidth = 8; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(-0.5) * 52, 128 + Math.sin(-0.5) * 52); g.stroke();
    g.lineWidth = 5; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(1.1) * 82, 128 + Math.sin(1.1) * 82); g.stroke();
  });
  const clk = new THREE.Group(); clk.position.set(5.96, 2.75, -1.4); clk.rotation.y = -Math.PI / 2; R.g.add(clk);
  add(clk, new THREE.TorusGeometry(0.31, 0.035, 8, 32), BRASS, 0, 0, 0.03);
  add(clk, new THREE.CircleGeometry(0.3, 32), new THREE.MeshStandardMaterial({ map: clockTex, roughness: 0.5 }), 0, 0, 0.02);
  const rules = T.textCanvas(384, 512, (g) => {
    g.fillStyle = '#f2eee2'; g.fillRect(0, 0, 384, 512); g.strokeStyle = '#1b2f4a'; g.lineWidth = 8; g.strokeRect(10, 10, 364, 492); g.lineWidth = 2; g.strokeRect(22, 22, 340, 468);
    g.fillStyle = '#1b2f4a'; g.textAlign = 'center'; g.font = '700 38px Cinzel, Georgia, serif'; g.fillText('THE BATHS', 192, 78); g.font = '700 22px Cinzel, Georgia, serif'; g.fillText('PLEASE OBSERVE', 192, 118);
    g.textAlign = 'left'; g.font = '600 24px "EB Garamond", Georgia, serif';
    ['Shower before entering the pool.', 'Bathing caps are required.', 'No running on the deck.', 'No diving.', 'Children must be with an adult.', 'Guests swim at their own risk.', 'Valuables may be left at the desk.'].forEach((t, i) => { g.fillText((i + 1) + '.  ' + t, 40, 175 + i * 46, 310); });
    g.fillStyle = '#9a2a2a'; g.textAlign = 'center'; g.font = '700 28px Cinzel, Georgia, serif'; g.fillText('NO DIVING', 192, 490);
  });
  const sg2 = new THREE.Group(); sg2.position.set(-5.3, 1.95, 4.97); sg2.rotation.y = Math.PI; R.g.add(sg2);
  box(sg2, 0.62, 0.84, 0.02, mat.mahog(), 0, 0, 0); add(sg2, new THREE.PlaneGeometry(0.54, 0.76), new THREE.MeshStandardMaterial({ map: rules, roughness: 0.35 }), 0, 0, 0.012);
  const lb = new THREE.Group(); lb.position.set(5.3, 1.9, 4.95); lb.rotation.y = Math.PI; R.g.add(lb);
  add(lb, new THREE.TorusGeometry(0.26, 0.075, 10, 28), M(0xb02a2a, 0.55), 0, 0, 0.09);
  for (let i = 0; i < 4; i++) { const a = add(lb, new THREE.TorusGeometry(0.26, 0.078, 10, 8, 0.52), M(0xf2eee2, 0.55), 0, 0, 0.09); a.rotation.z = i * Math.PI / 2 + 0.52; }
  box(lb, 0.06, 0.4, 0.04, M(0x7a5a3a, 0.8), 0, 0.05, 0.02);

  // ---- finish
  bc.done(); bn.done();
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

//// ---------- Kitchen: a working resort kitchen ----------
// One open shelf: board on brackets, w wide, centred on x, against the back wall (z = wall face).
function ktShelf(b, K, x, y, z, w, wallSide = 1) {
  b.box(K.oak, w, 0.035, 0.24, x, y, z + wallSide * 0.12);
  for (const s of [-1, 1]) { b.box(K.iron, 0.025, 0.16, 0.02, x + s * (w / 2 - 0.1), y - 0.08, z + wallSide * 0.012); b.box(K.iron, 0.025, 0.02, 0.2, x + s * (w / 2 - 0.1), y - 0.02, z + wallSide * 0.1); }
}
// Things to stand on a shelf (top at y): jars, canisters, plates, bowls, mugs.
function ktStock(b, K, x0, y, z, n, seed) {
  const r = T.rng(seed);
  for (let i = 0; i < n; i++) {
    const x = x0 + i * 0.17, k = Math.floor(r() * 6), zz = z + (r() - 0.5) * 0.04;
    if (k < 2) { b.cyl(K.jar[Math.floor(r() * 3)], 0.05, 0.05, 0.14, x, y + 0.07, zz, 12); b.cyl(K.brass, 0.052, 0.052, 0.022, x, y + 0.15, zz, 12); }
    else if (k === 2) { b.cyl(K.tin, 0.065, 0.065, 0.17, x, y + 0.085, zz, 12); b.cyl(K.tin, 0.068, 0.068, 0.025, x, y + 0.18, zz, 12); b.box(K.jar[1], 0.07, 0.05, 0.002, x, y + 0.09, zz + 0.066); }
    else if (k === 3) { for (let j = 0; j < 5; j++) b.cyl(K.plate, 0.11, 0.1, 0.014, x, y + 0.008 + j * 0.016, zz, 16); }
    else if (k === 4) { for (let j = 0; j < 2; j++) b.lathe(K.bowl, [[0.001, 0], [0.05, 0], [0.1, 0.07], [0.115, 0.1], [0.105, 0.1], [0.09, 0.07], [0.001, 0.01]], x, y + 0.002 + j * 0.03, zz, 16); }
    else { b.cyl(K.plate, 0.04, 0.035, 0.08, x, y + 0.04, zz, 10); b.geo(new THREE.TorusGeometry(0.025, 0.007, 6, 10), K.plate, x + 0.05, y + 0.04, zz, 0, 0, 0); }
  }
}
function ktPan(b, K, x, y, z, r, tilt = 0) {
  b.box(K.iron, 0.02, 0.32, 0.01, x, y - 0.16 + 0.02, z);
  b.cyl(K.copper, r, r * 0.92, 0.09, x, y - 0.32 - r + 0.08, z + 0.05, 20, Math.PI / 2, 0, 0);
  b.geo(new THREE.TorusGeometry(r, 0.008, 6, 20), K.copperL, x, y - 0.32 - r + 0.08, z + 0.096);
  b.geo(new THREE.CircleGeometry(r * 0.94, 20), K.copperD, x, y - 0.32 - r + 0.08, z + 0.098);
}
function ktUtensils(b, K, x0, y, z) {
  b.cyl(K.iron, 0.008, 0.008, 1.3, x0 + 0.6, y, z + 0.05, 8, 0, 0, Math.PI / 2);
  for (const s of [0, 1.3]) b.box(K.iron, 0.02, 0.02, 0.06, x0 + s * 0.92 + 0.05, y, z + 0.03);
  const items = [['ladle', 0.12], ['whisk', 0.3], ['spat', 0.46], ['tongs', 0.62], ['ladle', 0.78], ['cleaver', 0.94], ['spoon', 1.08], ['whisk', 1.2]];
  for (const [t, dx] of items) {
    const x = x0 + dx, zz = z + 0.05;
    if (t === 'ladle' || t === 'spoon') { b.cyl(K.steelP, 0.007, 0.007, 0.32, x, y - 0.17, zz, 6); b.sph(K.steelP, 0.05, x, y - 0.35, zz, 1, 0.45, 1, 10); }
    else if (t === 'whisk') { b.cyl(K.wood, 0.01, 0.01, 0.14, x, y - 0.09, zz, 6); b.geo(new THREE.TorusGeometry(0.035, 0.003, 4, 12), K.steelP, x, y - 0.26, zz, 0, 0, 0, 0.55, 1.9, 1); b.geo(new THREE.TorusGeometry(0.035, 0.003, 4, 12), K.steelP, x, y - 0.26, zz, 0, Math.PI / 2, 0, 0.55, 1.9, 1); }
    else if (t === 'spat') { b.cyl(K.wood, 0.011, 0.011, 0.2, x, y - 0.11, zz, 6); b.box(K.steelP, 0.08, 0.14, 0.006, x, y - 0.29, zz); }
    else if (t === 'tongs') { b.box(K.steelP, 0.012, 0.34, 0.01, x - 0.012, y - 0.18, zz, 0, 0, 0.04); b.box(K.steelP, 0.012, 0.34, 0.01, x + 0.012, y - 0.18, zz, 0, 0, -0.04); }
    else { b.box(K.wood, 0.03, 0.12, 0.012, x, y - 0.07, zz); b.box(K.steelP, 0.17, 0.12, 0.005, x, y - 0.2, zz); }
  }
}

function buildKitchen() {
  const R = mkRoom('kitchen', { p: [-3, 7, 4], t: [0, 0, -1], s: 7, day: [0xfff0d8, 1.8], night: [0xffd8a8, 0.8] });
  const gl = (c, rough = 0.3) => M(0xffffff, rough, 0, { t: c, bump: 0.012 });
  const TQ = spTileTex('ktQuarry', { cw: 32, ch: 32, cols: ['#8b4733', '#94503a', '#82402d', '#9c5840', '#8b4733'], grout: '#b0a38a', gw: 2, seed: 12, grime: 0.7, vary: 0.14 });
  const TK = spTileTex('ktWall', { cw: 16, ch: 8, half: 1, cols: ['#eeebde', '#e9e5d6', '#f1eee2', '#e5e1d0'], grout: '#bdb59f', seed: 14, grime: 0.34 });
  const TD = spTileTex('ktDado', { cw: 32, ch: 32, cols: ['#2f5b4c', '#33604f', '#2b5546', '#376454'], grout: '#bdb59f', gw: 1, seed: 15, grime: 0.3, vary: 0.07 });
  const ceilM = M(0xffffff, 0.9, 0, { t: TX.plaster(), rep: [3, 3], emissive: 0x8a7658, emissiveIntensity: 0.5, color: 0xe8dfca });
  rectRoom(R, -5, 5, -4, 4, 3.2, { floor: M(0xffffff, 0.45, 0, { t: TQ, rep: [10 / 1.2, 8 / 1.2], bump: 0.02 }), wall: gl(TK, 0.3), wains: gl(TD, 0.22), wh: 1.2, ceil: ceilM });
  const stl = M(0xffffff, 0.3, 0.85, { t: TX.steel(), rep: [3, 1], bump: 0.003 });
  const stlP = M(0xd2d4d6, 0.25, 0.9), stlD = M(0xd0d2d4, 0.3, 0.9, { t: TX.steel(), side: THREE.DoubleSide });
  const K = {
    oak: mat.oak(), iron: IRON, brass: BRASS, copper: M(0xb86a3a, 0.32, 1), copperL: M(0xd88a52, 0.25, 1), copperD: M(0x6a3a22, 0.5, 0.8),
    jar: [M(0xc99a3a, 0.25), M(0x8a2a2a, 0.25), M(0x7a8a3a, 0.25)], tin: M(0xd8d4c4, 0.4, 0.4), plate: M(0xf0ece0, 0.2), bowl: M(0x8aa6b8, 0.25),
    steelP: stlP, wood: M(0x7a5232, 0.7),
  };
  const bk = spBatch(R.g, false), bc = spBatch(R.g, true);
  const X = {
    inset: M(0x8a8c8e, 0.4, 0.8), knob: M(0x181818, 0.5), ovF: M(0xb8babc, 0.28, 0.9), ovS: M(0x303234, 0.4, 0.7), potM: M(0xc8cacc, 0.22, 0.95), dk: M(0x2a2c2e, 0.55, 0.6),
    fdoor: M(0xc2c4c6, 0.3, 0.6, { t: TX.steel() }), blk: M(0x1a1a1c, 0.7), fr: M(0x6e7276, 0.5, 0.7), mah: mat.mahog(), galv: M(0x9aa0a4, 0.35, 0.9), chrome: M(0xb8b8b8, 0.2, 1),
    pot: M(0xb06a44, 0.8), tray: M(0x8a8c8e, 0.4, 0.8), loaf: M(0xb8803c, 0.7), sack: M(0xc8b890, 0.95, 0, { t: TX.linen(), rep: [2, 2] }), drawer: M(0x3a1c10, 0.55),
    herb: [M(0x4a7a3a, 0.8), M(0x5a8a40, 0.8), M(0x3a6a34, 0.8)], range: M(0xd0d2d4, 0.3, 0.7, { t: TX.steel() }),
  };

  // ---- room dressing: green pencil band, ceiling beams, pendants
  const band = M(0x2f5b4c, 0.4);
  for (const [len, x, z, ry] of [[10, 0, -3.99, 0], [8, -4.99, 0, Math.PI / 2], [8, 4.99, 0, -Math.PI / 2], [10, 0, 3.99, Math.PI]]) {
    const nx = Math.sin(ry), nz = Math.cos(ry); bk.box(band, len, 0.08, 0.012, x + nx * 0.006, 2.05, z + nz * 0.006, ry); bk.box(band, len, 0.02, 0.016, x + nx * 0.008, 2.14, z + nz * 0.008, ry);
  }
  const beam = mat.mahog([6, 1]);
  for (const z of [-2.6, 0.7, 3.0]) bk.box(beam, 10, 0.26, 0.3, 0, 3.07, z);
  const enamel = M(0xf0ece0, 0.25, 0, { side: THREE.DoubleSide }), glow = M(0xfff0d0, 0.4, 0, { emissive: 0xffd8a0, emissiveIntensity: 1.6 }), bg = spBatch(R.g, false);
  for (const [px, pz] of [[-3, 0.7], [0.2, 0.7], [3.2, 0.7]]) {
    bk.cyl(IRON, 0.008, 0.008, 0.55, px, 2.8, pz, 6);
    bk.lathe(enamel, [[0.07, 0], [0.2, 0.03], [0.27, 0.1], [0.25, 0.14], [0.05, 0.15]], px, 2.46, pz, 20);
    bg.sph(glow, 0.07, px, 2.5, pz, 1, 1, 1, 10);
    bk.cyl(IRON, 0.03, 0.03, 0.05, px, 2.62, pz, 8);
  }
  bg.done();

  // ---- counters along the back wall: steel cabinets, pot-wash sink under the window
  const doorM = M(0xffffff, 0.3, 0.8, { t: TX.steel(), bump: 0.003 }), kick = M(0x2a2a2c, 0.7);
  bc.box(stl, 6.8, 0.92, 0.7, -1.6, 0.46, -3.6);
  bc.box(stlP, 6.8, 0.05, 0.74, -1.6, 0.945, -3.6);
  bk.box(kick, 6.8, 0.1, 0.02, -1.6, 0.05, -3.24);
  for (let i = 0; i < 8; i++) {
    const x = -4.55 + i * 0.85; bk.box(doorM, 0.8, 0.68, 0.015, x, 0.5, -3.245); bk.box(X.inset, 0.7, 0.58, 0.004, x, 0.5, -3.236);
    bk.box(BRASS, 0.1, 0.014, 0.02, x + 0.3, 0.8, -3.23);
  }
  // sink: two deep basins with a rim, drainboard, gooseneck tap and hand sprayer
  const dark = M(0x34383c, 0.45, 0.8);
  for (const sx of [-2.7, -1.5]) { bk.box(stlP, 1.1, 0.02, 0.58, sx, 0.98, -3.6); bk.box(dark, 1.0, 0.012, 0.48, sx, 0.992, -3.6); bk.cyl(BRONZE, 0.04, 0.04, 0.01, sx, 0.998, -3.6, 12); }
  bk.box(stlP, 3.0, 0.08, 0.06, -2.1, 1.01, -3.31); bk.box(stlP, 0.06, 0.08, 0.62, -3.3, 1.01, -3.6); bk.box(stlP, 0.06, 0.08, 0.62, -0.9, 1.01, -3.6);
  bk.box(stlP, 3.0, 0.2, 0.05, -2.1, 1.08, -3.94);
  { const c = new THREE.CatmullRomCurve3([new THREE.Vector3(-2.1, 1.0, -3.8), new THREE.Vector3(-2.1, 1.2, -3.8), new THREE.Vector3(-2.1, 1.34, -3.72), new THREE.Vector3(-2.1, 1.33, -3.58), new THREE.Vector3(-2.1, 1.24, -3.52)]);
    bk.geo(new THREE.TubeGeometry(c, 20, 0.02, 8), BRASS); bk.cyl(BRASS, 0.035, 0.04, 0.05, -2.1, 1.0, -3.8, 10); bk.cyl(BRASS, 0.016, 0.016, 0.07, -2.1, 1.2, -3.52, 8);
    for (const s of [-0.28, 0.28]) { bk.cyl(BRASS, 0.012, 0.012, 0.1, -2.1 + s, 1.06, -3.78, 8, Math.PI / 2); bk.sph(X.chrome, 0.03, -2.1 + s, 1.06, -3.72, 1, 1, 0.7, 8); }
    const sp = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.62, 1.3, -3.95), new THREE.Vector3(-1.55, 1.15, -3.7), new THREE.Vector3(-1.45, 1.03, -3.5)]);
    bk.geo(new THREE.TubeGeometry(sp, 10, 0.008, 6), IRON); bk.cyl(stlP, 0.02, 0.03, 0.1, -1.45, 1.05, -3.5, 8);
  }
  // under-window herb pots and a dish rack
  for (let i = 0; i < 3; i++) { const x = -3.15 + i * 0.28; bk.cyl(X.pot, 0.07, 0.05, 0.1, x, 1.54, -3.86, 10); bk.sph(X.herb[i], 0.09, x, 1.65, -3.86, 1, 0.8, 1, 8); }
  // open shelves with jars, plates and bowls; utensil rail
  ktShelf(bk, K, 0.95, 1.85, -3.99, 1.3); ktShelf(bk, K, 0.95, 2.35, -3.99, 1.3);
  ktStock(bk, K, 0.4, 1.8675, -3.86, 7, 3); ktStock(bk, K, 0.4, 2.3675, -3.86, 7, 8);
  ktShelf(bk, K, -4.6, 1.7, -3.99, 0.75); ktShelf(bk, K, -4.6, 2.2, -3.99, 0.75);
  ktStock(bk, K, -4.88, 1.7175, -3.86, 4, 21); ktStock(bk, K, -4.88, 2.2175, -3.86, 4, 5);
  ktUtensils(bk, K, 0.35, 1.5, -3.99);

  // ---- the range (tap = the oven log)
  const ov = new THREE.Group(); ov.position.set(2.6, 0, -3.55); R.g.add(ov);
  const ob = spBatch(ov, true), grate = M(0x1e1e20, 0.5, 0.7), glass = M(0x1a0c06, 0.1, 0, { emissive: 0x7a2a08, emissiveIntensity: 0.5 });
  ob.box(X.range, 1.6, 0.93, 0.74, 0, 0.465, 0.02); ob.box(stlP, 1.62, 0.04, 0.76, 0, 0.95, 0.02);
  ob.box(kick, 1.5, 0.08, 0.02, 0, 0.05, 0.4);
  for (const sx of [-0.4, 0.4]) {
    ob.box(X.ovF, 0.76, 0.54, 0.03, sx, 0.4, 0.39); ob.box(glass, 0.5, 0.28, 0.01, sx, 0.4, 0.408);
    ob.cyl(stlP, 0.014, 0.014, 0.66, sx, 0.67, 0.44, 8, 0, 0, Math.PI / 2); for (const s of [-1, 1]) ob.box(stlP, 0.02, 0.02, 0.06, sx + s * 0.31, 0.67, 0.42);
  }
  ob.box(X.ovS, 1.56, 0.12, 0.05, 0, 0.84, 0.39);
  for (const x of [-0.7, -0.57, -0.44, -0.31, 0.31, 0.44, 0.57, 0.7]) ob.cyl(X.knob, 0.022, 0.026, 0.035, x, 0.84, 0.43, 10, Math.PI / 2);
  for (const sx of [-0.52, 0, 0.52]) for (const sz of [-0.12, 0.14]) {
    ob.cyl(grate, 0.075, 0.09, 0.025, sx, 0.98, sz, 14); ob.box(grate, 0.28, 0.014, 0.02, sx, 1.01, sz); ob.box(grate, 0.02, 0.014, 0.28, sx, 1.01, sz); ob.box(grate, 0.28, 0.014, 0.02, sx, 1.01, sz, 0.78); ob.box(grate, 0.28, 0.014, 0.02, sx, 1.01, sz, -0.78);
  }
  ob.box(stl, 1.6, 0.5, 0.08, 0, 1.22, -0.33); ob.box(stlP, 1.6, 0.03, 0.26, 0, 1.48, -0.22);
  ob.cyl(X.potM, 0.16, 0.16, 0.26, -0.52, 1.15, 0.14, 20); ob.cyl(X.potM, 0.165, 0.165, 0.02, -0.52, 1.29, 0.14, 20); ob.sph(BRASS, 0.025, -0.52, 1.32, 0.14, 1, 1, 1, 8);
  ob.cyl(K.copper, 0.11, 0.13, 0.12, 0.52, 1.07, -0.12, 16); ob.cyl(K.copper, 0.1, 0.1, 0.015, 0.52, 1.14, -0.12, 16); ob.sph(K.copper, 0.015, 0.52, 1.15, -0.12, 1, 1, 1, 6);
  { const sp = new THREE.CatmullRomCurve3([new THREE.Vector3(0.62, 1.05, -0.12), new THREE.Vector3(0.7, 1.09, -0.12), new THREE.Vector3(0.74, 1.17, -0.12)]); ob.geo(new THREE.TubeGeometry(sp, 8, 0.012, 6), K.copper); }
  ob.done();
  add(ov, new THREE.PlaneGeometry(0.26, 0.08), new THREE.MeshBasicMaterial({ map: T.textCanvas(256, 80, (g) => { g.fillStyle = '#0a1008'; g.fillRect(0, 0, 256, 80); g.fillStyle = '#6aff90'; g.font = '700 54px monospace'; g.textAlign = 'center'; g.fillText('12:30', 128, 60); }) }), 0, 0.84, 0.457);
  tag(ov, 'oven', 'Oven');
  // hood and duct
  const hg = new THREE.CylinderGeometry(0.4, 1.17, 0.62, 4, 1, true); hg.rotateY(Math.PI / 4);
  bc.geo(hg, stlD, 2.6, 2.35, -3.6, 0, 0, 0, 1, 1, 0.62);
  bk.box(stlP, 1.66, 0.06, 0.02, 2.6, 2.04, -3.27); bk.box(X.dk, 1.5, 0.05, 0.4, 2.6, 2.05, -3.6);
  bk.box(stl, 0.55, 1.0, 0.5, 2.6, 2.95, -3.72); bk.box(stlP, 0.62, 0.05, 0.56, 2.6, 2.7, -3.72);

  // ---- reach-in fridge, order rail with tickets, chalkboard, extinguisher
  bc.box(X.fdoor, 1.3, 2.1, 0.8, 4.2, 1.05, -3.55); bk.box(kick, 1.3, 0.08, 0.02, 4.2, 0.06, -3.14);
  for (const s of [-1, 1]) {
    bk.box(X.fdoor, 0.62, 1.95, 0.03, 4.2 + s * 0.33, 1.1, -3.14); bk.cyl(stlP, 0.016, 0.016, 0.7, 4.2 + s * 0.06, 1.15, -3.08, 8);
    bk.box(stlP, 0.02, 0.02, 0.05, 4.2 + s * 0.06, 0.85, -3.11); bk.box(stlP, 0.02, 0.02, 0.05, 4.2 + s * 0.06, 1.45, -3.11);
  }
  bk.box(X.blk, 0.02, 1.95, 0.034, 4.2, 1.1, -3.14);
  bk.box(M(0x101810, 0.3, 0, { emissive: 0x30c860, emissiveIntensity: 0.6 }), 0.1, 0.04, 0.01, 4.2, 1.9, -3.12);
  bk.box(stlP, 1.4, 0.06, 0.82, 4.2, 2.12, -3.55);
  bk.cyl(IRON, 0.008, 0.008, 1.2, 4.2, 2.62, -3.96, 6, 0, 0, Math.PI / 2); bk.box(stlP, 1.3, 0.05, 0.03, 4.2, 2.56, -3.95);
  const tkM = new THREE.MeshStandardMaterial({ roughness: 0.9, map: T.textCanvas(64, 96, (g) => { g.fillStyle = '#f2ecd8'; g.fillRect(0, 0, 64, 96); g.fillStyle = '#3a2f26'; g.font = '700 11px monospace'; ['TBL 4', '2 SOUP', '1 TROUT', '1 TART', '- no nuts'].forEach((t, i) => g.fillText(t, 5, 16 + i * 15)); g.strokeStyle = '#a03030'; g.strokeRect(2, 2, 60, 92); }) });
  for (let i = 0; i < 5; i++) { const x = 3.7 + i * 0.22, h = 0.16 + (i * 7 % 3) * 0.04; bk.box(tkM, 0.1, h, 0.004, x, 2.5 - h / 2, -3.94, 0, 0, Math.sin(i * 2.3) * 0.08); bk.box(stlP, 0.014, 0.03, 0.012, x, 2.53, -3.935); }
  const cb = new THREE.Group(); cb.position.set(-4.97, 2.0, -2.5); cb.rotation.y = Math.PI / 2; R.g.add(cb);
  box(cb, 1.3, 0.98, 0.04, mat.mahog(), 0, 0, 0);
  add(cb, new THREE.PlaneGeometry(1.18, 0.86), new THREE.MeshStandardMaterial({ roughness: 0.95, map: T.textCanvas(512, 380, (g) => {
    g.fillStyle = '#26332d'; g.fillRect(0, 0, 512, 380); for (let i = 0; i < 70; i++) { g.fillStyle = 'rgba(210,215,205,' + (Math.random() * 0.05) + ')'; g.beginPath(); g.ellipse(Math.random() * 512, Math.random() * 380, 50 + Math.random() * 90, 14 + Math.random() * 30, Math.random() * 3, 0, 7); g.fill(); }
    g.fillStyle = '#ece8dc'; g.textAlign = 'center'; g.font = '700 46px Caveat, "Segoe Script", cursive'; g.fillText('Today at the Dome', 256, 60);
    g.strokeStyle = '#ece8dc'; g.lineWidth = 3; g.beginPath(); g.moveTo(90, 76); g.lineTo(422, 76); g.stroke();
    g.font = '600 34px Caveat, "Segoe Script", cursive'; g.textAlign = 'left';
    ['Mushroom soup', 'Lake trout & almonds', 'Roast chicken, thyme', 'Lemon-maple gala cake', 'Fruit tart (ask Jojo)'].forEach((t, i) => g.fillText(t, 50, 128 + i * 50));
  }) }), 0, 0, 0.022);
  const ext = new THREE.Group(); ext.position.set(-4.95, 1.0, 0.5); R.g.add(ext);
  cyl(ext, 0.075, 0.075, 0.42, M(0xb02222, 0.4, 0.3), 0, 0, 0, 14); cyl(ext, 0.03, 0.04, 0.06, BRASS, 0, 0.24, 0, 8); box(ext, 0.03, 0.05, 0.1, IRON, 0.02, 0.26, 0);
  box(ext, 0.02, 0.5, 0.01, IRON, -0.075, 0, 0); box(ext, 0.02, 0.1, 0.1, IRON, -0.0, 0, 0);

  // ---- doors: walk-in cooler (right wall), back door (left wall)
  const wi = new THREE.Group(); wi.position.set(4.97, 0, -1.2); wi.rotation.y = -Math.PI / 2; R.g.add(wi);
  bk.box(X.fr, 0.14, 2.3, 0.14, 4.95, 1.15, -1.2 - 0.62); bk.box(X.fr, 0.14, 2.3, 0.14, 4.95, 1.15, -1.2 + 0.62);
  bk.box(X.fr, 0.14, 0.14, 1.4, 4.95, 2.26, -1.2);
  box(wi, 1.1, 2.15, 0.1, X.fdoor, 0, 1.075, 0.03);
  for (const y of [0.5, 1.0, 1.55, 2.0]) box(wi, 1.0, 0.012, 0.11, X.tray, 0, y, 0.04);
  cyl(wi, 0.02, 0.02, 0.5, stlP, 0.42, 1.1, 0.12, 8); for (const y of [0.88, 1.32]) box(wi, 0.03, 0.03, 0.08, stlP, 0.42, y, 0.09);
  box(wi, 0.1, 0.2, 0.04, X.dk, 0.42, 0.7, 0.08); for (const y of [0.45, 1.65]) box(wi, 0.04, 0.2, 0.05, stlP, -0.54, y, 0.08);
  sph(wi, 0.045, M(0xe8e4d8, 0.3), -0.25, 1.75, 0.09, 12).scale.z = 0.3;
  plaqueMesh(wi, 'COLD ROOM', 0.5, 0.12, 0, 2.05, 0.1, 0, { size: 0.5 });
  const bd = new THREE.Group(); bd.position.set(-4.97, 0, 2.7); bd.rotation.y = Math.PI / 2; R.g.add(bd);
  box(bd, 0.14, 2.35, 0.18, X.mah, -0.55, 1.175, 0); box(bd, 0.14, 2.35, 0.18, X.mah, 0.55, 1.175, 0); box(bd, 1.24, 0.14, 0.18, X.mah, 0, 2.35, 0);
  box(bd, 1.0, 2.25, 0.07, mat.oak([1, 2]), 0, 1.125, 0.01);
  for (const y of [0.5, 1.2, 1.9]) box(bd, 0.96, 0.012, 0.08, M(0x4a2e18, 0.8), 0, y, 0.02);
  for (const y of [0.45, 1.85]) { box(bd, 0.9, 0.07, 0.015, BRONZE, 0, y, 0.055); }
  const pane = add(bd, new THREE.PlaneGeometry(0.5, 0.4), new THREE.MeshBasicMaterial({ map: texDay }), 0, 1.6, 0.05); R.skyMats.push(pane.material);
  for (const [x, y] of [[-0.12, 1.6], [0.12, 1.6]]) box(bd, 0.02, 0.4, 0.02, X.mah, x, y, 0.06); box(bd, 0.5, 0.02, 0.02, X.mah, 0, 1.6, 0.06);
  sph(bd, 0.04, BRASS, 0.38, 1.05, 0.1, 10).scale.z = 0.7; box(bd, 0.3, 0.025, 0.02, BRONZE, -0.12, 1.4, 0.07);

  // ---- the island: panelled front, pot rack above
  for (const dx of [-0.76, 0, 0.76]) {
    const x = 0.4 + dx; bk.box(X.drawer, 0.66, 0.5, 0.015, x, 0.5, -0.395);
    for (const [w, h, ox, oy] of [[0.7, 0.04, 0, 0.27], [0.7, 0.04, 0, -0.27], [0.04, 0.54, 0.34, 0], [0.04, 0.54, -0.34, 0]]) bk.box(X.mah, w, h, 0.02, x + ox, 0.5 + oy, -0.395);
    bk.box(BRASS, 0.2, 0.016, 0.03, x, 0.62, -0.38);
  }
  bk.box(BRASS, 0.04, 0.04, 0.04, -0.8, 0.5, -0.4); bk.cyl(BRASS, 0.012, 0.012, 2.3, 0.4, 0.78, -0.33, 8, 0, 0, Math.PI / 2);
  { const slab = M(0xe8e2d4, 0.2, 0, { t: TX.marbleTop() }); bc.box(slab, 0.8, 0.025, 0.7, 1.1, 0.975, -0.95); }
  bc.box(K.wood, 0.5, 0.03, 0.35, -0.3, 0.975, -0.7); bk.cyl(K.wood, 0.025, 0.025, 0.4, -0.2, 1.0, -1.1, 8, 0, 0, Math.PI / 2);
  bk.box(IRON, 2.6, 0.03, 0.03, 0.4, 2.62, -1.15); bk.box(IRON, 2.6, 0.03, 0.03, 0.4, 2.62, -0.65); for (const x of [-0.9, 1.7]) bk.box(IRON, 0.03, 0.03, 0.5, x, 2.62, -0.9);
  for (const x of [-0.9, 1.7]) for (const z of [-1.15, -0.65]) bk.cyl(IRON, 0.006, 0.006, 0.6, x, 2.92, z, 4);
  [[0.13, -0.7], [0.1, -0.32], [0.15, 0.06], [0.11, 0.44], [0.13, 0.82], [0.09, 1.2], [0.14, 1.58]].forEach(([r, x]) => ktPan(bk, K, x, 2.62, -0.65, r));
  bk.cyl(K.copper, 0.011, 0.011, 0.34, 0.25, 2.45, -1.15, 6); bk.sph(K.copper, 0.06, 0.25, 2.24, -1.15, 1, 0.45, 1, 8);

  // ---- floor clutter: duckboards, drain, crates, sacks, mop bucket, baker's rack
  const rub = M(0x1e1e20, 0.9);
  bk.box(rub, 1.5, 0.02, 0.7, 2.6, 0.012, -2.75); bk.box(rub, 2.6, 0.02, 0.7, -2.1, 0.012, -2.85);
  bk.cyl(X.galv, 0.13, 0.13, 0.008, -0.2, 0.006, 2.0, 16); bk.cyl(X.blk, 0.1, 0.1, 0.01, -0.2, 0.008, 2.0, 12);
  const crateM = mat.oak([1, 1]);
  const crate = (x, z, y, ry, fill) => {
    for (const [w, h, d, ox, oy, oz] of [[0.56, 0.03, 0.4, 0, 0.015, 0], [0.56, 0.04, 0.02, 0, 0.2, 0.19], [0.56, 0.04, 0.02, 0, 0.2, -0.19], [0.02, 0.04, 0.4, 0.27, 0.2, 0], [0.02, 0.04, 0.4, -0.27, 0.2, 0], [0.56, 0.04, 0.02, 0, 0.12, 0.19], [0.56, 0.04, 0.02, 0, 0.12, -0.19], [0.02, 0.04, 0.4, 0.27, 0.12, 0], [0.02, 0.04, 0.4, -0.27, 0.12, 0], [0.56, 0.04, 0.02, 0, 0.05, 0.19], [0.56, 0.04, 0.02, 0, 0.05, -0.19]]) {
      const c = Math.cos(ry), s = Math.sin(ry); bc.box(crateM, w, h, d, x + c * ox + s * oz, y + oy, z - s * ox + c * oz, ry);
    }
    if (fill) for (let i = 0; i < 6; i++) { const c = Math.cos(ry), s = Math.sin(ry), ox = (i % 3 - 1) * 0.16, oz = (Math.floor(i / 3) - 0.5) * 0.18; bc.sph(fill, 0.085, x + c * ox + s * oz, y + 0.16, z - s * ox + c * oz, 1, 0.9, 1, 10); }
  };
  const pr = [M(0x6a8a3a, 0.7), M(0xc0b070, 0.7), M(0xa04a2a, 0.7)]; crate(-4.5, 3.6, 0, 0.1, pr[0]); crate(-4.5, 3.6, 0.24, -0.08, pr[1]); crate(-3.8, 3.65, 0, 0.2, pr[2]);
  for (const [sx, sz, a] of [[-4.55, 1.8, 0], [-4.35, 1.3, 0.6]]) {
    bc.lathe(X.sack, [[0.001, 0], [0.2, 0], [0.24, 0.1], [0.24, 0.3], [0.2, 0.45], [0.1, 0.52], [0.05, 0.56], [0.08, 0.6], [0.04, 0.62]], sx, 0, sz, 16);
  }
  { const bx = 3.6, bz = 3.1; // galvanised mop bucket, mop and broom
    bc.cyl(X.galv, 0.2, 0.15, 0.32, bx, 0.16, bz, 18); bc.geo(new THREE.TorusGeometry(0.2, 0.01, 6, 18), X.galv, bx, 0.32, bz, Math.PI / 2, 0, 0);
    bc.cyl(M(0x2a5a8a, 0.5), 0.17, 0.17, 0.01, bx, 0.28, bz, 16);
    bc.cyl(K.wood, 0.014, 0.014, 1.2, bx + 0.1, 0.7, bz - 0.05, 6, 0.08, 0, -0.1); bc.sph(M(0xe0dccc, 0.95), 0.1, bx + 0.0, 0.32, bz + 0.02, 1, 0.8, 1, 8);
    bc.cyl(K.wood, 0.014, 0.014, 1.3, bx + 0.6, 0.72, bz - 0.6, 6, 0.05, 0, 0.12); bc.box(M(0x6a5a3a, 0.95), 0.34, 0.08, 0.06, bx + 0.7, 0.04, bz - 0.55);
  }
  { const rx = 4.45, rz = 1.9; // baker's rack on the right wall
    for (const [dx, dz] of [[-0.35, -0.3], [0.35, -0.3], [-0.35, 0.3], [0.35, 0.3]]) bc.cyl(stlP, 0.015, 0.015, 1.7, rx + dx * 0.9, 0.85, rz + dz, 8);
    for (const y of [0.25, 0.65, 1.05, 1.45]) { bc.box(stlP, 0.66, 0.015, 0.62, rx, y, rz); bc.box(X.tray, 0.5, 0.014, 0.5, rx, y + 0.012, rz);
      if (y > 0.3) for (let i = 0; i < 3; i++) bc.sph(X.loaf, 0.09, rx - 0.17 + i * 0.17, y + 0.06, rz + (i % 2 ? 0.07 : -0.07), 1.4, 0.65, 0.8, 10); }
  }
  bk.done(); bc.done();
  door(R, 0, 3.95, 'Lobby', 'exit_kitchen', [0, 0]);
  // ---- the story props (kept from before): recipe board and the gala cake on the island
  const rb = new THREE.Group(); rb.position.set(-4.96, 1.65, -0.6); rb.rotation.y = Math.PI / 2; R.g.add(rb);
  box(rb, 1.3, 0.9, 0.04, mat.oak(), 0, 0, 0);
  box(rb, 1.2, 0.8, 0.02, M(0xffffff, 0.95, 0, { t: T.concrete({ base: '#b08050', seed: 3 }), bump: 0.02 }), 0, 0, 0.02);
  { const cm = M(0xf0e8d4, 0.9), pm = M(0xb03030, 0.4); for (let i = 0; i < 5; i++) { const c = box(rb, 0.28, 0.2, 0.004, cm, -0.38 + (i % 3) * 0.38, 0.18 - Math.floor(i / 3) * 0.34, 0.035); c.rotation.z = Math.sin(i * 3) * 0.1; sph(rb, 0.012, pm, c.position.x, c.position.y + 0.08, 0.04, 6); } }
  tag(rb, 'recipeboard', 'Recipe board');
  const is = new THREE.Group(); is.position.set(0.4, 0, -0.9); R.g.add(is);
  box(is, 2.3, 0.88, 1.0, mat.mahog([2, 1]), 0, 0.44, 0);
  box(is, 2.4, 0.08, 1.1, mat.oak([2, 1]), 0, 0.92, 0);
  const cake = new THREE.Group(); cake.position.set(0.5, 0.96, 0); is.add(cake);
  lathe(cake, [[0.001, 0], [0.1, 0], [0.04, 0.03], [0.03, 0.12], [0.28, 0.13], [0.28, 0.14], [0.001, 0.14]], M(0xe8e4dc, 0.2, 0.3), 0, 0, 0, 28);
  cyl(cake, 0.24, 0.24, 0.16, M(0xf0e0cc, 0.8), 0, 0.22, 0, 32); cyl(cake, 0.18, 0.18, 0.13, M(0xf4ead8, 0.8), 0, 0.365, 0, 32);
  { const ic = M(0xe8c8d0, 0.6), cb2 = spBatch(cake, false); for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; cb2.sph(ic, 0.018, Math.cos(a) * 0.24, 0.3, Math.sin(a) * 0.24, 1, 1, 1, 6); } cb2.done(); }
  star3(cake, 0.05, M(0xd8b060, 0.3, 0.8), 0, 0.48, 0, 0.012);
  tag(cake, 'cake', 'Gala cake');
  { const fm = [M(0xd8a020, 0.5), M(0x9ab040, 0.5), M(0xc84030, 0.5)], ib = spBatch(is, false); for (let i = 0; i < 5; i++) ib.sph(fm[i % 3], 0.045, -0.7 + (i % 3) * 0.1, 0.99, -0.25 + Math.floor(i / 3) * 0.1, 1, 1, 1, 10); ib.done(); }
  lathe(is, [[0.001, 0], [0.08, 0], [0.16, 0.08], [0.18, 0.12], [0.17, 0.12], [0.001, 0.02]], M(0xd8d0c8, 0.3), -0.55, 0.96, 0.2, 20);
  skyWindow(R, 3.2, 1.2, -2, 2.15, -3.97, 0, 0xd8d0b8);
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
