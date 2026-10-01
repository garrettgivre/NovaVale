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
import { mergeGeometries } from '../vendor/utils/BufferGeometryUtils.js';

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
  P2: { room: 'plan', p: [2.0, -3.4], look: [3.0, -7.3], exits: ['P1'] },
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

function skyWindow(R, w, h, x, y, z, ry = 0, cur = null, view = null) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; R.g.add(g);
  const m = new THREE.MeshBasicMaterial({ map: texDay }); m.userData.view = view;
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

// ---------- Lobby kit: batched geometry, painted floor/ceiling art, furniture ----------
const _lx = new THREE.Object3D();
function lobbyMx(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _lx.position.set(x, y, z); _lx.rotation.set(rx, ry, rz); _lx.scale.set(sx, sy, sz); _lx.updateMatrix(); return _lx.matrix.clone();
}
// Merge indexed geometries (position, normal, uv) into one.
function lobbyMerge(list) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index.count; }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2), I = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const g of list) {
    P.set(g.attributes.position.array, vo * 3); N.set(g.attributes.normal.array, vo * 3); U.set(g.attributes.uv.array, vo * 2);
    const ix = g.index.array; for (let i = 0; i < ix.length; i++) I[io + i] = ix[i] + vo;
    vo += g.attributes.position.count; io += ix.length;
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.BufferAttribute(P, 3)); o.setAttribute('normal', new THREE.BufferAttribute(N, 3)); o.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  o.setIndex(new THREE.BufferAttribute(I, 1)); return o;
}
// A batch collects pieces by material and flushes one mesh per material.
function lobbyBatch() {
  const buckets = new Map(), stack = [new THREE.Matrix4()], top = () => stack[stack.length - 1];
  const B = {
    push(x, y, z, ry = 0, s = 1) { stack.push(top().clone().multiply(lobbyMx(x, y, z, 0, ry, 0, s))); return B; },
    pop() { stack.pop(); return B; },
    putM(m, geo, mx) { geo.applyMatrix4(top().clone().multiply(mx)); let a = buckets.get(m); if (!a) buckets.set(m, a = []); a.push(geo); return B; },
    put(m, geo, x, y, z, rx, ry, rz, sx, sy, sz) { return B.putM(m, geo, lobbyMx(x, y, z, rx, ry, rz, sx, sy, sz)); },
    box(m, w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) { return B.put(m, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz); },
    cyl(m, rt, rb, h, x, y, z, seg = 10, rx = 0, ry = 0, rz = 0) { return B.put(m, new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z, rx, ry, rz); },
    sph(m, r, x, y, z, seg = 10, sx = 1, sy = 1, sz = 1) { return B.put(m, new THREE.SphereGeometry(r, seg, Math.max(4, Math.round(seg * 0.7))), x, y, z, 0, 0, 0, sx, sy, sz); },
    lathe(m, pts, x, y, z, seg = 20) { return B.put(m, new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg), x, y, z); },
    torus(m, R, r, x, y, z, rx = Math.PI / 2, seg = 32, tube = 5) { return B.put(m, new THREE.TorusGeometry(R, r, tube, seg), x, y, z, rx, 0, 0); },
    flush(parent, props) {
      const out = [];
      for (const [m, list] of buckets) { const mesh = new THREE.Mesh(lobbyMerge(list), m); if (props) Object.assign(mesh.userData, props); parent.add(mesh); out.push(mesh); }
      buckets.clear(); return out;
    },
  };
  return B;
}
// Merge the plain meshes of a finished group by material (hotspots, groups with hotspots, array materials and `skip` stay).
function lobbyBake(root, skip = []) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), buckets = new Map(), dead = [];
  const walk = (o, blocked) => {
    for (const c of o.children) {
      const b = blocked || c.userData.hot || c.userData.who || c.userData.go || skip.includes(c) || c.visible === false;
      if (c.isMesh) {
        const g = c.geometry;
        if (!b && !Array.isArray(c.material) && g.index && g.attributes.position && g.attributes.normal && g.attributes.uv && !c.userData.anim) {
          const gg = g.clone(); gg.applyMatrix4(inv.clone().multiply(c.matrixWorld));
          let a = buckets.get(c.material); if (!a) buckets.set(c.material, a = []); a.push(gg); dead.push(c);
        }
      } else walk(c, b);
    }
  };
  walk(root, false);
  for (const c of dead) c.parent.remove(c);
  for (const [m, list] of buckets) root.add(new THREE.Mesh(lobbyMerge(list), m));
  return root;
}
// A flat ring on the floor with polar uvs (u around, v across).
function lobbyRing(r0, r1, seg = 96, y = 0) {
  const P = [], U = [], N = [], I = [];
  for (let i = 0; i <= seg; i++) {
    const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    P.push(c * r0, y, s * r0, c * r1, y, s * r1); U.push(i / seg, 0, i / seg, 1); N.push(0, 1, 0, 0, 1, 0);
    if (i < seg) { const k = i * 2; I.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I); return g;
}
// Dome glazing: panes between the ribs, each with its own tint and grime (vertex colour + alpha).
function lobbyPanes(R, cy, nm, phis) {
  const P = [], N = [], C = [], I = [], rnd = T.rng(5);
  const pos = (th, ph) => [R * 0.996 * Math.cos(ph) * Math.sin(th), cy + R * 0.996 * Math.sin(ph), -R * 0.996 * Math.cos(ph) * Math.cos(th)];
  for (let j = 0; j < phis.length - 1; j++) for (let i = 0; i < nm; i++) {
    const dirty = rnd() < 0.14, sh = 0.7 + rnd() * 0.55, a0 = dirty ? 0.55 + rnd() * 0.15 : 0.3 + rnd() * 0.2;
    const col = dirty ? [0.46 * sh, 0.46 * sh, 0.36 * sh] : [0.36 * sh, 0.7 * sh, 0.74 * sh];
    const th0 = (i + 0.06) / nm * Math.PI * 2, th1 = (i + 0.94) / nm * Math.PI * 2, p0 = phis[j] + 0.012, p1 = phis[j + 1] - 0.012, SX = 2;
    const base = P.length / 3;
    for (let ky = 0; ky <= 1; ky++) for (let kx = 0; kx <= SX; kx++) {
      const th = th0 + (th1 - th0) * kx / SX, ph = p0 + (p1 - p0) * ky, p = pos(th, ph);
      P.push(p[0], p[1], p[2]); N.push(-p[0] / R, -(p[1] - cy) / R, -p[2] / R);
      const tp = ky ? 1.18 : 0.88; C.push(col[0] * tp, col[1] * tp, col[2] * tp, Math.min(0.8, a0 + (ky === 0 ? 0.12 : -0.08 - j * 0.004)));
    }
    for (let kx = 0; kx < SX; kx++) { const a = base + kx, b = a + 1, c = a + SX + 1, d = c + 1; I.push(a, b, c, b, d, c); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 4));
  g.setIndex(I); return g;
}
function lobbyFrond(w = 0.42, h = 1.3) {
  const geo = new THREE.PlaneGeometry(w, h, 1, 8), a = geo.attributes.position;
  for (let k = 0; k < a.count; k++) { const t = (a.getY(k) + h / 2) / h; a.setY(k, t * h); a.setZ(k, -t * t * 0.7 * h / 1.3); }
  geo.computeVertexNormals(); return geo;
}
const LOBBY_URN = [[0.001, 0], [0.2, 0], [0.22, 0.06], [0.16, 0.12], [0.2, 0.3], [0.3, 0.55], [0.32, 0.6], [0.28, 0.62], [0.001, 0.6]];
function lobbyPalm(B, K, x, z, s, ry = 0) {
  B.push(x, 0, z, ry, s);
  B.lathe(K.stone, LOBBY_URN, 0, 0, 0, 16);
  B.cyl(K.soil, 0.27, 0.27, 0.02, 0, 0.6, 0, 12);
  B.cyl(K.trunk, 0.03, 0.04, 0.5, 0, 0.85, 0, 6);
  for (let i = 0; i < 11; i++) {
    const m = lobbyMx(0, 0, 0, 0, i / 11 * Math.PI * 2 + (i % 2) * 0.3, 0).multiply(lobbyMx(0, 1.05, 0, -0.3 - (i % 3) * 0.2, 0, 0));
    B.putM(K.frond, lobbyFrond(0.42, 1.2 + (i % 3) * 0.12), m);
  }
  B.pop();
}
function lobbyFern(B, K, x, z, s = 1) {
  B.push(x, 0, z, 0, s);
  B.lathe(K.brass, [[0.001, 0.62], [0.12, 0.62], [0.14, 0.66], [0.1, 0.7], [0.07, 0.9], [0.1, 1.0], [0.2, 1.08], [0.24, 1.2], [0.2, 1.22], [0.18, 1.12], [0.001, 1.1]], 0, 0, 0, 14);
  B.cyl(K.brass, 0.03, 0.05, 0.64, 0, 0.32, 0, 8);
  for (const a of [0, 2.1, 4.2]) B.cyl(K.brass, 0.012, 0.012, 0.3, Math.sin(a) * 0.14, 0.12, Math.cos(a) * 0.14, 5, Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4);
  B.cyl(K.soil, 0.18, 0.18, 0.02, 0, 1.2, 0, 10);
  for (let i = 0; i < 13; i++) {
    const m = lobbyMx(0, 0, 0, 0, i / 13 * Math.PI * 2 + (i % 2) * 0.25, 0).multiply(lobbyMx(0, 1.18, 0, -0.75 - (i % 3) * 0.28, 0, 0));
    B.putM(K.frond, lobbyFrond(0.4, 0.8 + (i % 4) * 0.08), m);
  }
  B.pop();
}
function lobbyArmchair(B, K, x, z, ry, vel = K.velvet) {
  B.push(x, 0, z, ry);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.cyl(K.wood, 0.025, 0.04, 0.2, sx * 0.34, 0.1, sz * 0.3, 8);
  B.box(K.wood, 0.78, 0.07, 0.72, 0, 0.22, 0);
  B.box(vel, 0.64, 0.14, 0.6, 0, 0.32, 0.03);
  B.box(vel, 0.58, 0.1, 0.56, 0, 0.44, 0.04);
  B.box(vel, 0.78, 0.62, 0.14, 0, 0.7, -0.3, 0, -0.13);
  B.cyl(vel, 0.075, 0.075, 0.78, 0, 1.03, -0.34, 10, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) {
    B.box(vel, 0.12, 0.3, 0.66, s * 0.36, 0.42, 0);
    B.cyl(vel, 0.075, 0.075, 0.66, s * 0.36, 0.6, 0, 10, Math.PI / 2);
  }
  for (let i = 0; i < 5; i++) B.sph(K.brassN, 0.011, -0.22 + i * 0.11, 0.7, -0.22, 5);
  B.pop();
}
function lobbySettee(B, K, x, z, ry, vel = K.velvet) {
  B.push(x, 0, z, ry);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.cyl(K.wood, 0.025, 0.04, 0.2, sx * 0.78, 0.1, sz * 0.3, 8);
  B.box(K.wood, 1.7, 0.07, 0.7, 0, 0.22, 0);
  for (const s of [-1, 1]) B.box(vel, 0.74, 0.18, 0.6, s * 0.38, 0.34, 0.04);
  B.box(vel, 1.5, 0.52, 0.14, 0, 0.62, -0.3, 0, -0.1);
  B.cyl(vel, 0.07, 0.07, 1.5, 0, 0.93, -0.33, 10, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) { B.box(vel, 0.12, 0.28, 0.64, s * 0.8, 0.4, 0); B.cyl(vel, 0.07, 0.07, 0.64, s * 0.8, 0.56, 0, 10, Math.PI / 2); }
  for (const s of [-1, 1]) B.box(K.cushion, 0.3, 0.3, 0.1, s * 0.58, 0.58, -0.12, s * 0.2, -0.25);
  B.pop();
}
// side table with a lamp; returns the lamp's world-ish local top for pools
function lobbySideTable(B, K, x, z) {
  B.push(x, 0, z);
  B.lathe(K.wood, [[0.001, 0], [0.15, 0], [0.16, 0.03], [0.05, 0.08], [0.04, 0.5], [0.07, 0.56], [0.001, 0.58]], 0, 0, 0, 12);
  B.cyl(K.marble, 0.25, 0.25, 0.04, 0, 0.6, 0, 20);
  B.torus(K.brass, 0.25, 0.012, 0, 0.62, 0, Math.PI / 2, 20, 4);
  B.lathe(K.brass, [[0.001, 0.62], [0.08, 0.62], [0.09, 0.64], [0.04, 0.7], [0.03, 0.8], [0.05, 0.9], [0.02, 0.96], [0.001, 0.96]], 0, 0, 0, 10);
  B.lathe(K.shade, [[0.06, 0.92], [0.14, 0.99], [0.2, 1.12], [0.17, 1.15], [0.1, 1.0]], 0, 0, 0, 14);
  B.pop();
}

// painted textures --------------------------------------------------------------------------------------
const lbStar = (g, x, y, r) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; i ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); };
function lbTex(key, w, h, draw, rep) {
  return once(key, () => { const c = T.canvas(w, h); draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(rep[0], rep[1]); return t; });
}
const lbMedallion = () => lbTex('lb_med', 1024, 1024, (g) => {
  const k = 98.5, C = 512, GOLD = '#b6903f', DG = '#566a60', BR = '#7c6a58', CR = '#f0e8d4';
  const ring = (r0, r1, col) => { g.beginPath(); g.arc(C, C, r1 * k, 0, Math.PI * 2); g.arc(C, C, r0 * k, 0, Math.PI * 2, true); g.fillStyle = col; g.fill('evenodd'); };
  ring(2.3, 2.34, GOLD); ring(2.4, 3.2, DG); ring(2.4, 2.43, GOLD); ring(3.17, 3.2, GOLD);
  g.fillStyle = CR; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; lbStar(g, C + Math.cos(a) * 2.8 * k, C + Math.sin(a) * 2.8 * k, 0.22 * k); }
  g.fillStyle = GOLD; for (let i = 0; i < 12; i++) { const a = (i + 0.5) / 12 * Math.PI * 2; g.beginPath(); g.arc(C + Math.cos(a) * 2.8 * k, C + Math.sin(a) * 2.8 * k, 0.045 * k, 0, 7); g.fill(); }
  const spike = (a, r0, rt, ha) => {
    const P = (r, aa) => [C + Math.cos(aa) * r * k, C + Math.sin(aa) * r * k];
    const tip = P(rt, a), l = P(r0, a - ha), r = P(r0, a + ha), m = P(r0 + (rt - r0) * 0.12, a);
    g.fillStyle = DG; g.beginPath(); g.moveTo(...tip); g.lineTo(...l); g.lineTo(...m); g.closePath(); g.fill();
    g.fillStyle = BR; g.beginPath(); g.moveTo(...tip); g.lineTo(...r); g.lineTo(...m); g.closePath(); g.fill();
  };
  for (let i = 0; i < 8; i++) spike(i / 8 * Math.PI * 2 + Math.PI / 8, 3.35, 4.0, 0.04);
  for (let i = 0; i < 8; i++) spike(i / 8 * Math.PI * 2, 3.35, i % 2 ? 4.45 : 4.72, i % 2 ? 0.05 : 0.062);
  ring(3.3, 3.32, GOLD); ring(4.78, 4.84, GOLD); ring(4.84, 4.9, DG); ring(4.9, 4.93, GOLD);
  g.fillStyle = CR; for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2; g.beginPath(); g.arc(C + Math.cos(a) * 4.87 * k, C + Math.sin(a) * 4.87 * k, 0.012 * k, 0, 7); g.fill(); }
});
const lbBorder = () => lbTex('lb_bord', 512, 256, (g, w, h) => {
  const GOLD = '#b6903f', DG = '#34503f', BR = '#74502e', CR = '#f0e8d4';
  g.fillStyle = DG; g.fillRect(0, 34, w, h - 68);
  g.fillStyle = GOLD; for (const y of [18, 26, h - 28, h - 20]) g.fillRect(0, y, w, 3);
  g.fillRect(0, 34, w, 2); g.fillRect(0, h - 36, w, 2);
  g.lineWidth = 9; g.lineCap = 'round';
  for (const [col, ph] of [[CR, 0], [GOLD, Math.PI]]) { g.strokeStyle = col; g.beginPath(); for (let x = 0; x <= w; x += 4) { const y = h / 2 + Math.sin(x / w * Math.PI * 8 + ph) * 44; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  g.fillStyle = BR; for (let i = 0; i < 8; i++) { g.beginPath(); g.arc((i + 0.5) / 8 * w, h / 2, 9, 0, 7); g.fill(); g.strokeStyle = GOLD; g.lineWidth = 2; g.stroke(); }
}, [24, 1]);
const lbFrieze = () => lbTex('lb_fr', 512, 64, (g, w, h) => {
  const r = T.rng(3); g.fillStyle = '#cdbf9f'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '90,70,40' : '255,250,230'},${0.04 + r() * 0.05})`; g.fillRect(r() * w, r() * h, 2 + r() * 8, 1 + r() * 2); }
  g.fillStyle = '#b6903f'; for (const y of [3, 8, h - 11, h - 6]) g.fillRect(0, y, w, 2);
  g.fillStyle = '#34503f'; g.fillRect(0, 12, w, 2); g.fillRect(0, h - 14, w, 2);
  for (let i = 0; i < 4; i++) {
    const x = 64 + i * 128; g.fillStyle = '#74502e';
    for (let p = 0; p < 8; p++) { g.save(); g.translate(x, h / 2); g.rotate(p / 8 * Math.PI * 2); g.beginPath(); g.ellipse(0, -11, 4, 9, 0, 0, 7); g.fill(); g.restore(); }
    g.fillStyle = '#b6903f'; g.beginPath(); g.arc(x, h / 2, 5, 0, 7); g.fill();
    g.fillStyle = '#34503f'; lbStar(g, x + 64, h / 2, 9);
    g.strokeStyle = '#8a6a30'; g.lineWidth = 2; g.beginPath(); for (let t = -50; t <= 50; t += 3) { const xx = x + 64 + t * 0.9, yy = h / 2 + Math.sin(t * 0.18) * 7; if (Math.abs(t) > 14) t === -50 || t === -49 ? g.moveTo(xx, yy) : g.lineTo(xx, yy); } g.stroke();
  }
}, [14, 1]);
const lbGlow = () => lbTex('lb_glow', 128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,.18)'); gr.addColorStop(0.75, 'rgba(255,255,255,.05)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
const lbEdge = () => lbTex('lb_edge', 4, 64, (g) => {
  const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, 'rgba(20,10,0,0)'); gr.addColorStop(0.7, 'rgba(20,10,0,.35)'); gr.addColorStop(1, 'rgba(20,10,0,.75)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
});
function lbRug(key, field, border, accent, seed) {
  return lbTex(key, 512, 512, (g) => {
    const r = T.rng(seed), C = 256;
    g.fillStyle = '#d8ccb0'; for (let i = 0; i < 160; i++) { const a = i / 160 * Math.PI * 2; g.fillRect(C + Math.cos(a) * 246 - 1, C + Math.sin(a) * 246 - 1, 3, 3); g.save(); g.translate(C, C); g.rotate(a); g.fillRect(238, -1, 16, 2); g.restore(); }
    const disc = (rr, col) => { g.fillStyle = col; g.beginPath(); g.arc(C, C, rr, 0, 7); g.fill(); };
    disc(238, border); disc(204, accent); disc(198, border); disc(166, field);
    g.strokeStyle = accent; g.lineWidth = 3; g.beginPath(); g.arc(C, C, 150, 0, 7); g.stroke();
    g.fillStyle = accent; for (let i = 0; i < 16; i++) { g.save(); g.translate(C, C); g.rotate(i / 16 * Math.PI * 2); g.beginPath(); g.ellipse(0, -182, 7, 13, 0, 0, 7); g.fill(); g.restore(); }
    for (let i = 0; i < 12; i++) { g.save(); g.translate(C, C); g.rotate(i / 12 * Math.PI * 2); g.fillStyle = i % 2 ? accent : border; g.beginPath(); g.ellipse(0, -100, 16, 48, 0, 0, 7); g.fill(); g.restore(); }
    disc(46, border); disc(34, accent); disc(22, field); g.fillStyle = border; lbStar(g, C, C, 20);
    const id = g.getImageData(0, 0, 512, 512), d = id.data;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 8) continue; const n = (r() - 0.5) * 22; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(id, 0, 0);
  });
}
const lbPaint = v => lbTex('lb_paint' + v, 256, 320, (g, w, h) => {
  const r = T.rng(20 + v), pal = [['#f2b27a', '#a8668a', '#35435e', '#d98a52'], ['#cfe0e8', '#9fc0b8', '#4f7a6a', '#e8e0b8'], ['#26335a', '#4a4f82', '#1c2a44', '#e8e4c8']][v];
  const sk = g.createLinearGradient(0, 0, 0, h * 0.58); sk.addColorStop(0, pal[1]); sk.addColorStop(1, pal[0]); g.fillStyle = sk; g.fillRect(0, 0, w, h);
  g.fillStyle = pal[3]; g.globalAlpha = 0.85; g.beginPath(); g.arc(w * (0.3 + r() * 0.4), h * 0.4, 16, 0, 7); g.fill(); g.globalAlpha = 1;
  for (let l = 0; l < 3; l++) { g.fillStyle = l === 0 ? pal[1] : l === 1 ? pal[2] : '#1c2a28'; g.globalAlpha = l === 0 ? 0.7 : 1; g.beginPath(); g.moveTo(0, h); const ph = r() * 6; for (let x = 0; x <= w; x += 8) g.lineTo(x, h * (0.5 + l * 0.04) - Math.sin(x * 0.03 + ph) * (18 - l * 4) - Math.sin(x * 0.011 + ph * 2) * 14); g.lineTo(w, h); g.fill(); }
  g.globalAlpha = 1;
  const lk = g.createLinearGradient(0, h * 0.6, 0, h); lk.addColorStop(0, pal[0]); lk.addColorStop(1, pal[2]); g.fillStyle = lk; g.fillRect(0, h * 0.62, w, h * 0.38);
  g.fillStyle = pal[3]; g.globalAlpha = 0.5; for (let i = 0; i < 26; i++) g.fillRect(w * 0.2 + r() * w * 0.6, h * 0.64 + r() * h * 0.32, 8 + r() * 26, 1.5); g.globalAlpha = 1;
  g.fillStyle = '#1a1c1c'; g.beginPath(); g.moveTo(w * 0.55, h * 0.74); g.lineTo(w * 0.72, h * 0.74); g.lineTo(w * 0.68, h * 0.77); g.lineTo(w * 0.58, h * 0.77); g.fill(); g.fillStyle = '#e8e0cc'; g.beginPath(); g.moveTo(w * 0.63, h * 0.73); g.lineTo(w * 0.63, h * 0.62); g.lineTo(w * 0.7, h * 0.73); g.fill();
  for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '60,40,20' : '255,240,200'},${r() * 0.06})`; g.fillRect(r() * w, r() * h, 1 + r() * 4, 1 + r() * 2); }
  const vg = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(20,10,0,.45)'); g.fillStyle = vg; g.fillRect(0, 0, w, h);
});
const lbEasel = () => lbTex('lb_easel', 400, 560, (g, w, h) => {
  g.fillStyle = '#efe7d2'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#34503f'; g.lineWidth = 6; g.strokeRect(14, 14, w - 28, h - 28); g.lineWidth = 2; g.strokeRect(24, 24, w - 48, h - 48);
  g.fillStyle = '#2a2018'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '600 24px Cinzel, Georgia, serif'; g.fillText('THE', w / 2, 82);
  g.font = '600 50px Cinzel, Georgia, serif'; g.fillText('AQUADOME', w / 2, 132);
  g.fillStyle = '#b6903f'; for (let i = -2; i <= 2; i++) lbStar(g, w / 2 + i * 38, 188, i === 0 ? 14 : 9);
  g.fillStyle = '#2a2018'; g.font = 'italic 34px "EB Garamond", Georgia, serif'; g.fillText('Grand Re-Opening', w / 2, 250); g.fillText('Gala Evening', w / 2, 292);
  g.fillRect(90, 330, w - 180, 2);
  g.font = '600 22px Cinzel, Georgia, serif'; g.fillText('SATURDAY', w / 2, 372);
  g.font = '28px "EB Garamond", Georgia, serif'; g.fillText('Doors open at eight', w / 2, 420); g.fillText('Black tie requested', w / 2, 458);
  g.font = '18px "EB Garamond", Georgia, serif'; g.fillStyle = '#6a5a40'; g.fillText('Lakeshore Road, Nova Vale', w / 2, 508);
  const r = T.rng(2); for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(120,90,50,${r() * 0.05})`; g.fillRect(r() * w, r() * h, 3 + r() * 14, 1); }
});

// ---------- Rooms ----------
function buildLobby() {
  const R = mkRoom('lobby', { p: [3, 14, 4], t: [0, 0, 0], s: 10, day: [0xffe6c0, 2.2], night: [0x8090c0, 0.35] });
  const TAU = Math.PI * 2, rad = d => d * Math.PI / 180;
  const stoneM = mat.stone(), mh = mat.mahog(), crownM = M(0xe0d6c2, 0.7), fluteM = M(0xa89e88, 0.85);
  const shell = struct(new THREE.Group()); R.g.add(shell);   // architecture: never casts shadows
  const decal = (geo, m, y = 0) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.userData.nocast = 1; o.renderOrder = 2; R.g.add(o); return o; };
  const decalM = (map, o = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.3, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...o });
  const glowM = (c, op) => new THREE.MeshBasicMaterial({ map: lbGlow(), color: c, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });

  // floor, wall, wainscot, mouldings
  struct(add(R.g, new THREE.CircleGeometry(9, 64), mat.marble(), 0, 0, 0)).rotation.x = -Math.PI / 2;
  const wp = M(0xffffff, 0.85, 0, { t: TX.damask(), rep: [72, 5.4], bump: 0.01 }); wp.side = THREE.BackSide;
  struct(add(R.g, new THREE.CylinderGeometry(9, 9, 4.2, 72, 1, true), wp, 0, 2.1, 0));
  const wn = M(0xffffff, 0.5, 0, { t: TX.panel(), rep: [30, 1], bump: 0.02 }); wn.side = THREE.BackSide;
  struct(add(R.g, new THREE.CylinderGeometry(8.97, 8.97, 1.1, 72, 1, true), wn, 0, 0.55, 0));
  // floor art: the compass medallion round the fountain, a border ring by the wall, and a soft shadow where floor meets wall
  decal(new THREE.PlaneGeometry(10.4, 10.4), decalM(lbMedallion()), 0.003).rotation.x = -Math.PI / 2;
  decal(lobbyRing(7.55, 8.55), decalM(lbBorder()), 0.003);
  decal(lobbyRing(8.3, 8.99, 96), new THREE.MeshBasicMaterial({ map: lbEdge(), transparent: true, depthWrite: false, opacity: 0.9 }), 0.0035);
  const SB = lobbyBatch();   // architecture batch
  // dado rail and skirting, cornice
  SB.torus(mh, 8.94, 0.04, 0, 1.1, 0, Math.PI / 2, 72); SB.torus(mh, 8.95, 0.08, 0, 0.08, 0, Math.PI / 2, 72); SB.torus(mh, 8.93, 0.05, 0, 0.3, 0, Math.PI / 2, 72);
  SB.lathe(crownM, [[8.95, 3.97], [8.88, 3.99], [8.82, 4.03], [8.76, 4.08], [8.74, 4.13], [8.8, 4.17], [8.95, 4.2]], 0, 0, 0, 72);
  SB.torus(crownM, 8.8, 0.05, 0, 3.55, 0, Math.PI / 2, 72);
  const frieze = new THREE.Mesh(new THREE.CylinderGeometry(8.93, 8.93, 0.42, 72, 1, true), new THREE.MeshStandardMaterial({ map: lbFrieze(), roughness: 0.8, side: THREE.BackSide }));
  frieze.position.y = 3.77; shell.add(frieze);
  for (let k = 0; k < 96; k++) { const a = k / 96 * TAU; SB.box(crownM, 0.07, 0.09, 0.09, Math.sin(a) * 8.82, 3.93, -Math.cos(a) * 8.82, -a); }

  // pilasters between the doors, with sconces
  const doorAngles = [0, 55, 110, 150, 180, 250, 305];
  const shadeM = M(0xfff2d6, 0.5, 0, { emissive: 0xffc680, emissiveIntensity: 1.0, side: THREE.DoubleSide });
  const washes = [];
  for (let k = 0; k < 24; k++) {
    const deg = k * 15; if (doorAngles.some(d => Math.abs(((deg - d + 540) % 360) - 180) < 12)) continue;
    const a = rad(deg);
    SB.push(Math.sin(a) * 8.86, 0, -Math.cos(a) * 8.86, -a);
    SB.box(stoneM, 0.56, 0.26, 0.2, 0, 0.13, 0.03); SB.box(crownM, 0.5, 0.08, 0.17, 0, 0.3, 0.02); SB.box(crownM, 0.45, 0.05, 0.15, 0, 0.355, 0.02);
    SB.box(stoneM, 0.38, 2.96, 0.14, 0, 1.86, 0);
    for (let f = -2; f <= 2; f++) SB.box(fluteM, 0.034, 2.9, 0.012, f * 0.075, 1.86, 0.073);
    SB.box(crownM, 0.44, 0.06, 0.15, 0, 3.37, 0.01); SB.box(crownM, 0.5, 0.1, 0.17, 0, 3.45, 0.02);
    SB.box(crownM, 0.4, 0.12, 0.17, 0, 3.56, 0.02); for (const s of [-1, 1]) SB.cyl(crownM, 0.072, 0.072, 0.15, s * 0.2, 3.55, 0.05, 10, Math.PI / 2);
    SB.box(crownM, 0.6, 0.07, 0.21, 0, 3.67, 0.02); SB.box(crownM, 0.66, 0.05, 0.24, 0, 3.73, 0.03);
    if (k % 2) {   // sconce
      SB.box(BRASS, 0.1, 0.26, 0.03, 0, 2.3, 0.085); SB.cyl(BRASS, 0.011, 0.011, 0.2, 0, 2.3, 0.18, 6, Math.PI / 2);
      SB.lathe(BRASS, [[0.001, 0], [0.035, 0], [0.04, 0.03], [0.02, 0.05]], 0, 2.34, 0.27, 8);
      SB.lathe(shadeM, [[0.03, 0.05], [0.085, 0.1], [0.1, 0.2], [0.07, 0.22]], 0, 2.34, 0.27, 12);
      washes.push(a);
    }
    SB.pop();
  }
  // overdoor cornices
  for (const dd of doorAngles) { const a = rad(dd); SB.push(Math.sin(a) * 8.88, 0, -Math.cos(a) * 8.88, -a); SB.box(crownM, 1.9, 0.12, 0.2, 0, 3.15, 0.0); SB.box(crownM, 2.04, 0.05, 0.25, 0, 3.235, 0.02); SB.pop(); }

  // glass dome: bronze meridians and rings, tinted panes, lantern
  const DR = 9, DY = 4.2, domeB = lobbyBatch();
  const phis = [0.02, 0.11, 0.21, 0.32, 0.44, 0.57, 0.71, 0.86, 1.0, 1.14, 1.27, 1.4];
  for (let i = 0; i < 12; i++) domeB.put(BRONZE, new THREE.TorusGeometry(DR, 0.055, 5, 56, Math.PI), 0, DY, 0, 0, i * Math.PI / 12, 0);
  phis.forEach((p, j) => domeB.torus(j === 0 ? BRASS : BRONZE, DR * Math.cos(p), j === 0 ? 0.1 : 0.05, 0, DY + DR * Math.sin(p), 0, Math.PI / 2, 64, 5));
  const lr = DR * Math.cos(1.4), ly = DY + DR * Math.sin(1.4);
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; domeB.box(BRONZE, 0.1, 0.9, 0.1, Math.cos(a) * lr, ly + 0.45, Math.sin(a) * lr); }
  domeB.torus(BRONZE, lr, 0.07, 0, ly + 0.9, 0, Math.PI / 2, 24, 5);
  domeB.put(BRONZE, new THREE.ConeGeometry(lr + 0.25, 0.6, 16), 0, ly + 1.2, 0);
  domeB.sph(BRASS, 0.12, 0, ly + 1.62, 0, 8);
  domeB.flush(shell);
  const paneM = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 1, roughness: 0.12, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
  shell.add(new THREE.Mesh(lobbyPanes(DR, DY, 24, phis), paneM));

  // the chandelier
  const chB = lobbyBatch(), bulbM = M(0xfff4dc, 0.3, 0, { emissive: 0xffd49a, emissiveIntensity: 1.6 });
  const dropM = M(0xeef6f4, 0.05, 0.1, { transparent: true, opacity: 0.6 }), chBrass = BRASS;
  chB.push(0, 7.4, 0);
  chB.cyl(BRONZE, 0.01, 0.01, 5.6, 0, 2.8, 0, 6); chB.cyl(BRASS, 0.2, 0.05, 0.14, 0, 5.5, 0, 12);
  chB.lathe(chBrass, [[0.001, 0.4], [0.1, 0.36], [0.16, 0.2], [0.1, 0.05], [0.07, -0.1], [0.12, -0.2], [0.001, -0.62]], 0, 0, 0, 12);
  for (const [r, y, n] of [[0.9, 0, 12], [0.55, -0.3, 8], [0.3, -0.52, 5]]) {
    chB.torus(chBrass, r, 0.035, 0, y, 0, Math.PI / 2, 32, 6);
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; chB.cyl(chBrass, 0.013, 0.013, r, Math.cos(a) * r / 2, y + (r > 0.5 ? 0.1 : 0.03), Math.sin(a) * r / 2, 5, 0, -a, Math.PI / 2 - 0.2); }
    for (let i = 0; i < n; i++) { const a = i / n * TAU; chB.cyl(chBrass, 0.03, 0.02, 0.07, Math.cos(a) * r, y + 0.04, Math.sin(a) * r, 8); chB.sph(bulbM, 0.045, Math.cos(a) * r, y + 0.11, Math.sin(a) * r, 8, 1, 1.4, 1); }
  }
  for (let i = 0; i < 28; i++) { const a = i / 28 * TAU; chB.put(dropM, new THREE.ConeGeometry(0.022, 0.2, 5), Math.cos(a) * 0.9, -0.14, Math.sin(a) * 0.9, Math.PI); }
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; chB.put(dropM, new THREE.ConeGeometry(0.02, 0.17, 5), Math.cos(a) * 0.55, -0.4, Math.sin(a) * 0.55, Math.PI); }
  chB.pop(); chB.flush(R.g, { nocast: 1 });
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: lbGlow(), color: 0xffd9a0, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.position.set(0, 7.3, 0); halo.scale.set(4.5, 4.5, 1); R.g.add(halo);

  // the stone fountain
  const FB = lobbyBatch(), fs = mat.stone([3, 1]);
  FB.lathe(fs, [[0.001, 0.02], [2.05, 0.02], [2.1, 0.12], [2.0, 0.2], [2.0, 0.5], [2.1, 0.56], [2.1, 0.62], [1.88, 0.62], [1.88, 0.3], [0.001, 0.3]], 0, 0, 0, 64);
  FB.lathe(fs, [[2.3, 0], [2.3, 0.05], [2.2, 0.07], [2.12, 0.07], [2.12, 0.02]], 0, 0, 0, 64);
  FB.torus(crownM, 2.0, 0.035, 0, 0.5, 0, Math.PI / 2, 64, 5);
  FB.lathe(fs, [[0.28, 0.3], [0.2, 0.5], [0.16, 1.2], [0.2, 1.5], [0.34, 1.6], [0.34, 1.65]], 0, 0, 0, 32);
  FB.lathe(fs, [[0.05, 1.6], [0.7, 1.72], [0.82, 1.88], [0.8, 1.92], [0.68, 1.8], [0.05, 1.76]], 0, 0, 0, 40);
  FB.lathe(BRONZE, [[0.001, 1.9], [0.1, 1.92], [0.08, 2.1], [0.14, 2.3], [0.1, 2.45], [0.05, 2.55], [0.08, 2.62], [0.001, 2.7]], 0, 0, 0, 20);
  const dm = new THREE.MeshStandardMaterial({ color: 0xcfe0dc, transparent: true, opacity: 0.3, roughness: 0.05, depthWrite: false });
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; FB.cyl(dm, 0.008, 0.012, 1.35, Math.cos(a) * 0.8, 1.22, Math.sin(a) * 0.8, 5); }
  const coinM = M(0xc9a15a, 0.3, 0.9), cr = T.rng(11);
  for (let i = 0; i < 90; i++) { const a = cr() * TAU, rr = 0.45 + Math.sqrt(cr()) * 1.35; FB.put(coinM, new THREE.CylinderGeometry(0.04, 0.04, 0.008, 8), Math.cos(a) * rr, 0.308 + (i % 3) * 0.004, Math.sin(a) * rr, (cr() - 0.5) * 0.3, cr() * 3, (cr() - 0.5) * 0.3); }
  for (let i = 0; i < 6; i++) { const a = 1.2 + i * 0.35; FB.put(coinM, new THREE.CylinderGeometry(0.04, 0.04, 0.008, 8), Math.cos(a) * 2.0, 0.625, Math.sin(a) * 2.0, 0, cr() * 3, 0); }
  FB.flush(R.g);
  const wtex = once('lb_water', () => T.pix(128, 128, (x, y) => {
    const u = x / 128 * Math.PI * 2, v = y / 128 * Math.PI * 2, h = 0.5 + Math.sin(u * 3 + Math.sin(v * 2) * 1.6) * 0.18 + Math.sin(v * 4 + Math.cos(u * 2) * 1.2) * 0.14 + Math.sin((u + v) * 5) * 0.06;
    return [38 + h * 40, 78 + h * 60, 76 + h * 56, h];
  }));
  const wt = T.done(wtex, [3, 3]);
  const wm = M(0xffffff, 0.04, 0.15, { t: wt, rep: [3, 3], bump: 0.04, transparent: true, opacity: 0.78, depthWrite: false });
  const water = add(R.g, new THREE.CircleGeometry(1.88, 48), wm, 0, 0.5, 0); water.rotation.x = -Math.PI / 2; water.userData.nocast = 1;
  const rip = new THREE.Mesh(new THREE.RingGeometry(0.35, 1.8, 48, 3), glowM(0xbfe8e0, 0.18)); rip.rotation.x = -Math.PI / 2; rip.position.y = 0.505; rip.userData.nocast = 1; R.g.add(rip);
  updaters.push((dt, t) => { dm.opacity = 0.26 + Math.sin(t * 9) * 0.05; wm.bumpMap.offset.set(t * 0.012, t * 0.008); wm.map.offset.set(-t * 0.006, t * 0.01); rip.scale.setScalar(1 + Math.sin(t * 1.3) * 0.04); });
  tag(plaqueMesh(R.g, 'EST. 2003', 0.8, 0.22, 0, 0.36, 2.03, 0, { size: 0.42 }), 'plaque', 'Brass plaque');

  // the empty display case
  const cs = new THREE.Group(); cs.position.set(-4.2, 0, 3.2); faceTo(cs, 0, 6); R.g.add(cs);
  box(cs, 0.8, 1.02, 0.8, mh, 0, 0.51, 0);
  box(cs, 0.88, 0.06, 0.88, mh, 0, 1.05, 0); box(cs, 0.9, 0.1, 0.9, mh, 0, 0.05, 0);
  for (const s of [-1, 1]) for (const t of [-1, 1]) box(cs, 0.03, 0.95, 0.03, BRASS, s * 0.4, 0.52, t * 0.4);
  box(cs, 0.5, 0.07, 0.5, M(0x4a0f18, 0.95, 0, { t: TX.velvet(), rep: [2, 2] }), 0, 1.11, 0);
  const lid = box(cs, 0.74, 0.6, 0.74, GLASS, 0, 1.39, 0); lid.rotation.z = 0.04;
  for (const s of [-1, 1]) for (const t of [-1, 1]) box(cs, 0.02, 0.6, 0.02, BRASS, s * 0.37, 1.39, t * 0.37);
  box(cs, 0.18, 0.24, 0.02, M(0x1c1c1e, 0.4), 0.18, 0.72, 0.405);
  const keyM = M(0xc8c0b0, 0.4);
  for (let i = 0; i < 9; i++) box(cs, 0.035, 0.035, 0.012, keyM, 0.13 + (i % 3) * 0.05, 0.78 - Math.floor(i / 3) * 0.05, 0.415);
  for (const s of [-1, 1]) { cyl(cs, 0.03, 0.06, 0.95, BRASS, s * 0.85, 0.475, 0.62, 12); sph(cs, 0.055, BRASS, s * 0.85, 0.97, 0.62, 12); }
  add(cs, new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.85, 0.9, 0.62), new THREE.Vector3(0, 0.62, 0.66), new THREE.Vector3(0.85, 0.9, 0.62)), 20, 0.022, 8), M(0x5a0f18, 0.8));
  tag(cs, 'case', 'Display case');
  lobbyBake(cs);
  R.caseCrown = crown(cs, 0, 1.15, 0, 1.0);

  // Kenji's workbench with Stella, the 1925 singing automaton
  const kb = new THREE.Group(); kb.position.set(7.4, 0, 1.5); faceTo(kb, 0, 0); R.g.add(kb);
  box(kb, 1.3, 0.05, 0.6, mh, 0, 0.76, 0);
  for (const s of [-1, 1]) for (const t of [-1, 1]) box(kb, 0.05, 0.74, 0.05, mh, s * 0.6, 0.37, t * 0.26);
  box(kb, 0.5, 0.12, 0.4, mh, 0.35, 0.65, 0);
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
  lobbyBake(kb);

  // the brass star pin on the floor
  const pin = new THREE.Group(); pin.position.set(-3.55, 0.012, 4.15); R.g.add(pin);
  star3(pin, 0.045, M(0xd4ac5a, 0.25, 1), 0, 0, 0, 0.01).rotation.x = -Math.PI / 2;
  hit(pin, 0, 0.1, 0, 0.3, 'pin', 'Something glinting');
  R.pin = pin;

  // reception desk: mahogany with a marble top, a beige CRT, a bell, the guest book
  const dk = new THREE.Group(); dk.position.set(4.2, 0, 3.2); faceTo(dk, 0, 0); R.g.add(dk);
  box(dk, 2.4, 1.0, 0.72, mat.mahog([2, 1]), 0, 0.5, 0);
  const dkIn = M(0x3a1a0c, 0.5);
  for (let i = 0; i < 4; i++) box(dk, 0.48, 0.66, 0.02, dkIn, -0.84 + i * 0.56, 0.5, 0.37);
  box(dk, 2.5, 0.05, 0.82, mat.marbleTopM, 0, 1.02, 0);
  const crt = new THREE.Group(); crt.position.set(0.55, 1.05, -0.1); crt.rotation.y = 2.35; dk.add(crt);
  const beige = M(0xd2c8ae, 0.6), beigeD = M(0xb8ae94, 0.65), vent = M(0x3a352c, 0.8);
  box(crt, 0.36, 0.03, 0.3, beigeD, 0, 0.015, 0); box(crt, 0.14, 0.05, 0.14, beigeD, 0, 0.055, 0);
  box(crt, 0.42, 0.36, 0.2, beige, 0, 0.26, 0.1); box(crt, 0.3, 0.27, 0.22, beige, 0, 0.25, -0.08);
  cyl(crt, 0.1, 0.16, 0.14, beige, 0, 0.25, -0.24, 10).rotation.x = Math.PI / 2;
  box(crt, 0.34, 0.27, 0.01, M(0x10181a, 0.15, 0, { emissive: 0x1a3a30, emissiveIntensity: 0.7 }), 0, 0.27, 0.205);
  box(crt, 0.4, 0.34, 0.012, beigeD, 0, 0.26, 0.203);
  for (let v = 0; v < 7; v++) { box(crt, 0.16, 0.012, 0.01, vent, 0, 0.3 + v * 0.025 - 0.07, -0.19); box(crt, 0.012, 0.1, 0.1, vent, -0.151, 0.27, -0.08); box(crt, 0.012, 0.1, 0.1, vent, 0.151, 0.27, -0.08); }
  box(crt, 0.05, 0.015, 0.01, M(0x6a6458, 0.5), 0.1, 0.1, 0.206);
  cyl(crt, 0.008, 0.008, 0.5, IRON, 0.05, 0.1, -0.5, 5).rotation.x = Math.PI / 2;
  const kbTex = once('lb_kbd', () => { const c = T.canvas(256, 96), g = c.getContext('2d'); g.fillStyle = '#c9bfa5'; g.fillRect(0, 0, 256, 96); g.fillStyle = '#e4dcc6'; for (let r = 0; r < 5; r++) for (let k = 0; k < 15; k++) { if (r === 4 && (k < 3 || k > 11)) continue; const w = r === 4 ? 12 * 14 : 14; if (r === 4 && k !== 3) continue; g.fillRect(8 + k * 16, 8 + r * 16, r === 4 ? 150 : 13, 12); } g.fillStyle = '#9a917c'; g.fillRect(0, 0, 256, 3); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; });
  box(dk, 0.44, 0.025, 0.16, M(0xffffff, 0.6, 0, { map: kbTex }), 0.2, 1.065, 0.2).rotation.y = 0.12;
  const ruled = once('lb_ruled', () => { const c = T.canvas(128, 160), g = c.getContext('2d'); g.fillStyle = '#efe8d2'; g.fillRect(0, 0, 128, 160); g.strokeStyle = '#8aa6c0'; g.lineWidth = 1; for (let y = 24; y < 160; y += 9) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); } g.strokeStyle = '#c06a6a'; g.beginPath(); g.moveTo(18, 0); g.lineTo(18, 160); g.stroke(); g.fillStyle = '#4a4a5a'; for (let y = 28; y < 100; y += 18) g.fillRect(24, y, 30 + (y * 7) % 60, 2); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; });
  const paperM = M(0xffffff, 0.9, 0, { map: ruled });
  for (let p = 0; p < 4; p++) box(dk, 0.2, 0.004, 0.27, paperM, -1.0 + p * 0.01, 1.05 + p * 0.004, 0.22 + p * 0.005).rotation.y = 0.25 + p * 0.12;
  cyl(dk, 0.04, 0.035, 0.1, M(0x2a5a4a, 0.3), 0.15, 1.1, -0.16, 12);
  for (const [px, pz, t] of [[-0.01, 0, 0.2], [0.01, 0.01, -0.15], [0.0, -0.01, 0.05]]) cyl(dk, 0.004, 0.004, 0.15, M(px > 0 ? 0x1a2a6a : 0x7a1a1a, 0.4), 0.15 + px, 1.19, -0.16 + pz, 5).rotation.z = t;
  // key rack with pigeonholes at the back of the desk
  { const kx = -0.35, kz = -0.3, wd = M(0x4a2514, 0.55), keyM = M(0xc9a15a, 0.3, 1), tagM = M(0xe8dcc0, 0.8);
    box(dk, 1.0, 0.5, 0.02, wd, kx, 1.3, kz - 0.09); box(dk, 1.0, 0.025, 0.2, wd, kx, 1.055, kz); box(dk, 1.0, 0.025, 0.2, wd, kx, 1.555, kz);
    for (const sx of [-0.5, -0.25, 0, 0.25, 0.5]) box(dk, 0.02, 0.5, 0.2, wd, kx + sx, 1.3, kz);
    for (const sy of [1.3]) box(dk, 1.0, 0.02, 0.2, wd, kx, sy, kz);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 2; r++) { const x = kx - 0.375 + c * 0.25; box(dk, 0.03, 0.04, 0.012, keyM, x, 1.17 + r * 0.25, kz - 0.02); box(dk, 0.05, 0.035, 0.008, tagM, x, 1.12 + r * 0.25, kz - 0.02); }
    for (let c = 0; c < 4; c += 2) box(dk, 0.2, 0.09, 0.012, M(0xe8e0c8, 0.9), kx - 0.375 + c * 0.25, 1.355, kz + 0.03); }
  lathe(dk, [[0.001, 0], [0.07, 0], [0.07, 0.02], [0.06, 0.05], [0.03, 0.08], [0.01, 0.1], [0.001, 0.11]], BRASS, -0.2, 1.045, 0.1, 20);
  const book = new THREE.Group(); book.position.set(-0.7, 1.05, 0.08); book.rotation.y = 0.2; dk.add(book);
  box(book, 0.46, 0.02, 0.32, M(0x3a1a12, 0.6), 0, 0.005, 0);
  const pgM = M(0xe8dcc0, 0.9);
  for (const s of [-1, 1]) { const pg = box(book, 0.21, 0.015, 0.29, pgM, s * 0.108, 0.02, 0); pg.rotation.z = -s * 0.05; }
  hit(book, 0, 0.05, 0, 0.25, 'guestbook', 'Guest book');
  const lamp = new THREE.Group(); lamp.position.set(-1.05, 1.05, -0.15); dk.add(lamp);
  cyl(lamp, 0.07, 0.08, 0.02, BRASS, 0, 0.01, 0); cyl(lamp, 0.01, 0.01, 0.34, BRASS, 0, 0.18, 0, 6);
  const sh = add(lamp, new THREE.CylinderGeometry(0.06, 0.1, 0.1, 16, 1, true, 0, Math.PI), M(0x1f4a2a, 0.2, 0, { side: THREE.DoubleSide }), 0, 0.36, 0.05); sh.rotation.z = Math.PI / 2; sh.rotation.y = Math.PI / 2;
  tag(dk, 'desk', 'Reception desk');
  lobbyBake(dk);

  // furniture, plants and props, all batched
  const K = {
    stone: stoneM, soil: M(0x2a1c10, 0.95), trunk: M(0x5a4228, 0.9), brass: BRASS, brassN: M(0xd8b068, 0.3, 1),
    frond: new THREE.MeshStandardMaterial({ map: FROND, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 }),
    wood: mh, marble: mat.marbleTopM, shade: M(0xfff0d0, 0.6, 0, { emissive: 0xffc070, emissiveIntensity: 0.5, side: THREE.DoubleSide }),
    velvet: M(0xffffff, 0.9, 0, { t: TX.velvet(), rep: [1, 1] }), navy: M(0xffffff, 0.9, 0, { t: once('lb_navy', () => T.fabric({ base: '#26385e', weave: 2, seed: 5 })) }),
    cushion: M(0xc9a15a, 0.8, 0, { t: TX.velvet() }),
    leather: M(0x6a3a22, 0.55), leather2: M(0x2c3a3e, 0.6), cane: M(0x30261c, 0.5, 0.5), tan: M(0xc8b088, 0.7),
  };
  const FBt = lobbyBatch();
  // benches
  for (const [x, z] of [[-6.6, -2.6], [6.6, -2.6]]) {
    FBt.push(x, 0, z, Math.atan2(-x, -z));
    FBt.box(M(0x4a0f18, 0.9, 0, { t: TX.velvet(), rep: [3, 1] }), 1.6, 0.1, 0.5, 0, 0.45, 0);
    for (const s of [-1, 1]) for (const t of [-1, 1]) FBt.cyl(mh, 0.03, 0.02, 0.42, s * 0.7, 0.21, t * 0.2, 8);
    FBt.pop();
  }
  // gilt-framed lake paintings in the bays between the pilasters
  { const goldM = M(0xc9a15a, 0.4, 0.85), picM = [0, 1, 2].map(v => M(0xffffff, 0.7, 0, { map: lbPaint(v) })); let pi = 0;
    for (let k = 0; k < 24; k++) {
      const deg = k * 15 + 7.5; if (doorAngles.some(d => Math.abs(((deg - d + 540) % 360) - 180) < 14)) continue;
      const a = rad(deg), w = 0.78, h = 1.0, y = 2.45, v = pi++ % 3;
      FBt.push(Math.sin(a) * 8.93, 0, -Math.cos(a) * 8.93, -a);
      FBt.box(picM[v], w, h, 0.02, 0, y, 0.0);
      FBt.box(goldM, w + 0.16, 0.08, 0.06, 0, y + h / 2 + 0.04, 0.01); FBt.box(goldM, w + 0.16, 0.08, 0.06, 0, y - h / 2 - 0.04, 0.01);
      for (const sx of [-1, 1]) FBt.box(goldM, 0.08, h, 0.06, sx * (w / 2 + 0.04), y, 0.01);
      FBt.box(goldM, w + 0.02, 0.025, 0.04, 0, y + h / 2 - 0.0, 0.02); FBt.box(goldM, 0.3, 0.06, 0.02, 0, y - h / 2 - 0.15, 0.0);
      FBt.pop();
    } }
  // palms on the clear wall between doors (none in front of a door), ferns beside the seating groups
  for (const [dg, r, s] of [[82, 8.25, 1.15], [165, 8.2, 1.15], [225, 8.25, 1.15], [270, 8.25, 1.1]]) { const a = rad(dg); lobbyPalm(FBt, K, Math.sin(a) * r, -Math.cos(a) * r, s, a * 3); }
  for (const dg of [14, 41, 319, 345]) { const a = rad(dg); lobbyFern(FBt, K, Math.sin(a) * 8.3, -Math.cos(a) * 8.3, 1); }
  // two seating groups on round rugs
  const lights = [];
  const group = (dg, rc, vel, vel2, rug) => {
    const a = rad(dg), cx = Math.sin(a) * rc, cz = -Math.cos(a) * rc, ry = Math.atan2(-cx, -cz);
    FBt.push(cx, 0, cz, ry);
    lobbySettee(FBt, K, 0, 0, 0, vel);
    for (const s of [-1, 1]) { lobbySideTable(FBt, K, s * 1.35, 0.05); lights.push([cx + Math.cos(ry) * s * 1.35 + Math.sin(ry) * 0.05, cz - Math.sin(ry) * s * 1.35 + Math.cos(ry) * 0.05]); lobbyArmchair(FBt, K, s * 1.5, 1.7, -s * 0.55, vel2); }
    FBt.lathe(mh, [[0.001, 0.02], [0.3, 0.02], [0.32, 0.05], [0.07, 0.1], [0.06, 0.34], [0.34, 0.4], [0.4, 0.42], [0.001, 0.42]], 0, 0, 1.55, 16);
    FBt.cyl(K.marble, 0.42, 0.42, 0.03, 0, 0.43, 1.55, 18);
    FBt.pop();
    const rg = new THREE.Mesh(new THREE.CircleGeometry(1.75, 40), new THREE.MeshStandardMaterial({ map: rug, alphaTest: 0.4, roughness: 0.95 }));
    rg.rotation.x = -Math.PI / 2; rg.position.set(cx - Math.sin(ry) * -1.2 * 0 + Math.sin(ry) * 1.1, 0.008, cz + Math.cos(ry) * 1.1); rg.userData.nocast = 1; R.g.add(rg);
  };
  group(27, 8.05, K.velvet, K.navy, lbRug('lb_rugA', '#6a1824', '#23433f', '#c0994a', 4));
  group(332, 8.05, K.navy, K.velvet, lbRug('lb_rugB', '#1f3a40', '#5a1a26', '#cdb078', 9));
  // umbrella stand and luggage trolley by the Tech Office and Staircase doors
  { const a = rad(123); FBt.push(Math.sin(a) * 8.45, 0, -Math.cos(a) * 8.45, -a);
    FBt.lathe(K.cane, [[0.001, 0], [0.12, 0], [0.13, 0.04], [0.14, 0.6], [0.16, 0.64], [0.001, 0.64]], 0, 0, 0, 14);
    FBt.torus(BRASS, 0.15, 0.015, 0, 0.62, 0, Math.PI / 2, 14, 4);
    for (const [ux, uz, tx, tz] of [[-0.03, 0.02, 0.1, 0.0], [0.04, -0.02, -0.12, 0.05], [0.0, 0.05, 0.0, -0.15]]) { FBt.cyl(IRON, 0.008, 0.008, 0.95, ux + tx * 0.3, 0.9, uz + tz * 0.3, 5, tz, 0, -tx); FBt.sph(mh, 0.022, ux + tx * 0.6, 1.37, uz + tz * 0.6, 6); }
    FBt.pop(); }
  { const a = rad(137); FBt.push(Math.sin(a) * 8.2, 0, -Math.cos(a) * 8.2, -a);
    FBt.box(BRASS, 1.0, 0.03, 0.6, 0, 0.17, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { FBt.cyl(IRON, 0.07, 0.07, 0.04, sx * 0.42, 0.07, sz * 0.24, 10, Math.PI / 2, 0, Math.PI / 2); }
    for (const sx of [-1, 1]) FBt.cyl(BRASS, 0.014, 0.014, 1.5, sx * 0.45, 0.93, -0.27, 6);
    FBt.cyl(BRASS, 0.014, 0.014, 0.9, 0, 1.68, -0.27, 6, 0, 0, Math.PI / 2); FBt.cyl(BRASS, 0.012, 0.012, 0.9, 0, 0.5, -0.27, 6, 0, 0, Math.PI / 2);
    FBt.box(K.leather, 0.78, 0.46, 0.26, -0.05, 0.43, 0.0); FBt.box(K.leather2, 0.6, 0.3, 0.22, -0.1, 0.81, 0.0, 0.1); FBt.box(K.leather, 0.5, 0.2, 0.2, 0.25, 1.06, -0.02, -0.2);
    FBt.cyl(K.tan, 0.15, 0.15, 0.2, 0.35, 0.28, 0.12, 14);
    for (const sy of [0.38, 0.52]) FBt.box(BRASS, 0.04, 0.02, 0.28, 0.2, sy + 0.2, 0.0);
    FBt.pop(); }
  FBt.flush(R.g);
  // gala easel sign
  { const a = rad(192), ex = Math.sin(a) * 7.4, ez = -Math.cos(a) * 7.4, e = new THREE.Group(); e.position.set(ex, 0, ez); e.rotation.y = -a; R.g.add(e);
    const EB = lobbyBatch(), wood = M(0x6a4528, 0.6);
    for (const s of [-1, 1]) EB.cyl(wood, 0.022, 0.026, 1.9, s * 0.36, 0.93, 0.08, 6, -0.12, 0, s * 0.07);
    EB.cyl(wood, 0.022, 0.026, 1.8, 0, 0.88, -0.38, 6, 0.3);
    EB.box(wood, 0.8, 0.04, 0.05, 0, 0.82, 0.03); EB.box(wood, 0.74, 0.05, 0.1, 0, 0.94, 0.07); EB.box(wood, 0.66, 0.03, 0.05, 0, 1.82, -0.0);
    EB.flush(e);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.86, 0.025), [wood, wood, wood, wood, M(0xffffff, 0.8, 0, { map: lbEasel() }), wood]);
    board.position.set(0, 1.4, 0.07); board.rotation.x = -0.12; e.add(board); }
  // table lamp pools and sconce washes (additive decals, brighter at night)
  const pools = lobbyBatch(), poolM = glowM(0xffc880, 0.5);
  for (const [px, pz] of lights) pools.put(poolM, new THREE.PlaneGeometry(2.4, 2.4), px, 0.012, pz, -Math.PI / 2);
  pools.put(poolM, new THREE.PlaneGeometry(9, 9), 0, 0.01, 0, -Math.PI / 2, 0, 0);
  for (const a of washes) pools.putM(poolM, new THREE.PlaneGeometry(1.9, 2.8), lobbyMx(Math.sin(a) * 8.9, 2.3, -Math.cos(a) * 8.9, 0, -a, 0));
  const poolMesh = pools.flush(R.g, { nocast: 1 }); poolMesh.forEach(m => { m.renderOrder = 3; });
  updaters.push(() => { poolM.opacity = night() ? 0.5 : 0.34; paneM.opacity = night() ? 0.3 : 1; });

  // doors: seven, each with a bronze-and-mahogany frame
  const D = (deg, label, hot) => { const a = deg * Math.PI / 180; return lobbyBake(door(R, Math.sin(a) * 8.9, -Math.cos(a) * 8.9, label, hot, [0, 0])); };
  D(0, 'Planetarium', 'door_plan'); D(55, 'Spa & Pools', 'door_spa'); D(110, 'Tech Office', 'door_tech');
  D(150, 'Grand Staircase', 'door_stairs'); D(180, 'Terrace', 'door_terrace'); D(250, 'Kitchen', 'door_kitchen'); D(305, 'Archive', 'door_archive');
  SB.flush(shell);

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
  skyWindow(R, 11.4, 2.45, 0, 1.78, -4.98, 0, null, 'garden');   // the spa faces away from the lake, over the gardens
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

// ---------- Planetarium, tunnel and star room helpers (dark-rooms pass) ----------
// A transformed copy of a geometry, for merging many parts into one mesh.
const dkMat4 = new THREE.Matrix4(), dkQ = new THREE.Quaternion(), dkE = new THREE.Euler(), dkV = new THREE.Vector3(), dkS = new THREE.Vector3();
function dkG(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const g = geo.clone();
  dkQ.setFromEuler(dkE.set(rx, ry, rz));
  g.applyMatrix4(dkMat4.compose(dkV.set(x, y, z), dkQ, dkS.set(sx, sy, sz)));
  return g;
}
const dkBox = (w, h, d, ...r) => dkG(new THREE.BoxGeometry(w, h, d), ...r);
const dkCyl = (rt, rb, h, seg, ...r) => dkG(new THREE.CylinderGeometry(rt, rb, h, seg), ...r);
function dkMerge(parent, list, m, nocast = true) {
  const o = new THREE.Mesh(mergeGeometries(list), m); parent.add(o); if (nocast) o.userData.nocast = 1; return o;
}
// Soft radial glow texture (white in the middle), for light-pool decals and glow planes.
const dkGlowTex = () => once('dkGlow', () => T.textCanvas(128, 128, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
}));
function dkPool(p, x, y, z, w, d, color, op, ry = 0, flat = true) {
  const m = new THREE.MeshBasicMaterial({ map: dkGlowTex(), color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
  const o = add(p, new THREE.PlaneGeometry(w, d), m, x, y, z); o.userData.nocast = 1; o.renderOrder = 2;
  if (flat) o.rotation.x = -Math.PI / 2; o.rotation.y = flat ? 0 : ry; return o;
}
const dkExitTex = () => once('dkExit', () => T.textCanvas(256, 96, (g, w, h) => {
  g.fillStyle = '#0c4a22'; g.fillRect(0, 0, w, h); g.strokeStyle = '#7fe8a0'; g.lineWidth = 5; g.strokeRect(5, 5, w - 10, h - 10);
  g.fillStyle = '#d8ffe0'; g.font = 'bold 60px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT', w / 2, h / 2 + 3);
}));
function dkExitSign(p, x, y, z, ax, az) {
  const g = new THREE.Group(); g.position.set(x, y, z); faceTo(g, ax, az); p.add(g);
  box(g, 0.5, 0.2, 0.06, M(0x1a1a1a, 0.6), 0, 0, 0);
  const f = add(g, new THREE.PlaneGeometry(0.44, 0.165), new THREE.MeshBasicMaterial({ map: dkExitTex() }), 0, 0, 0.032); f.userData.nocast = 1;
  return g;
}
// Painted theatre-wall texture: fluted acoustic panels in dusty plum.
const dkFlute = () => once('dkFlute', () => {
  const r = T.rng(21), N = T.fbm(256, 256, { scale: 4, oct: 4, seed: 5 });
  return T.done(T.pix(256, 256, (x, y) => {
    const f = Math.sin(x / 32 * Math.PI * 2), k = 0.78 + f * 0.2 + (N[y * 256 + x] - 0.5) * 0.18;
    const wear = 1 - Math.max(0, N[(y * 7 % 256) * 256 + x] - 0.62) * 0.5;
    return [78 * k * wear, 60 * k * wear, 96 * k * wear, 0.5 + f * 0.4];
  }), null);
});

function buildPlanetarium() {
  const R = mkRoom('plan', { p: [0, 7, 3], t: [0, 0, -2], s: 9, day: [0xa0acd0, 0.9], night: [0x9aa6cc, 0.8] });
  R.dark = true;
  const PI = Math.PI;
  struct(add(R.g, new THREE.CircleGeometry(8, 64), M(0xffffff, 0.95, 0, { t: TX.carpetBlue(), rep: [6, 6], bump: 0.01 }), 0, 0, 0)).rotation.x = -PI / 2;
  // walls: fluted acoustic panels between mahogany pilasters, brass cornice
  const wl = M(0xffffff, 0.9, 0, { t: dkFlute(), rep: [16, 1], bump: 0.025 }); wl.side = THREE.BackSide;
  struct(add(R.g, new THREE.CylinderGeometry(8, 8, 2.6, 96, 1, true), wl, 0, 1.3, 0));
  struct(add(R.g, new THREE.SphereGeometry(8, 64, 32, 0, PI * 2, 0, PI / 2), new THREE.MeshBasicMaterial({ map: T.starDome(false), side: THREE.BackSide }), 0, 2.6, 0));
  struct(add(R.g, new THREE.TorusGeometry(7.95, 0.06, 6, 64), BRASS, 0, 2.6, 0)).rotation.x = PI / 2;
  const wood = mat.mahog();
  { // pilasters, dado rail, skirting, wall uplights
    const pl = [], br = [], up = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * PI * 2, x = Math.sin(a) * 7.93, z = -Math.cos(a) * 7.93;
      pl.push(dkBox(0.22, 2.55, 0.14, x, 1.275, z, 0, -a, 0));
      br.push(dkBox(0.28, 0.1, 0.18, x, 0.12, z, 0, -a, 0), dkBox(0.28, 0.08, 0.18, x, 2.45, z, 0, -a, 0));
      if (i % 2) up.push(dkCyl(0.07, 0.04, 0.2, 10, Math.sin(a) * 7.8, 1.75, -Math.cos(a) * 7.8, 0, 0, 0));
    }
    dkMerge(R.g, pl, wood, false).userData.struct = 1; dkMerge(R.g, br, BRASS);
    dkMerge(R.g, up, M(0xffe8c0, 0.4, 0, { emissive: 0xffd090, emissiveIntensity: 0.9 }));
    struct(add(R.g, new THREE.CylinderGeometry(7.96, 7.96, 0.3, 64, 1, true), reTex(wood, 40, 1), 0, 0.15, 0)).material.side = THREE.BackSide;
    struct(add(R.g, new THREE.CylinderGeometry(7.94, 7.94, 0.05, 64, 1, true), BRASS, 0, 1.0, 0)).material.side = THREE.BackSide;
  }
  // cove light round the base of the dome, plus a wash up the wall
  const coveM = M(0xe8dcff, 0.4, 0, { emissive: 0xb09cff, emissiveIntensity: 2.2 });
  add(R.g, new THREE.TorusGeometry(7.84, 0.035, 6, 96), coveM, 0, 2.55, 0).rotation.x = PI / 2;
  const gradTex = once('dkGrad', () => T.textCanvas(8, 128, (g, w, h) => { const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }));
  const washM = (c, o) => new THREE.MeshBasicMaterial({ map: gradTex, color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide });
  add(R.g, new THREE.CylinderGeometry(7.975, 7.975, 1.1, 64, 1, true), washM(0x8a78e8, 0.11), 0, 3.15, 0).userData.nocast = 1;
  const wash2 = add(R.g, new THREE.CylinderGeometry(7.972, 7.972, 1.0, 64, 1, true), washM(0xffb878, 0.1), 0, 2.0, 0); wash2.rotation.x = PI; wash2.userData.nocast = 1;
  // seats: reclining theatre seats in rows round the projector (instanced)
  const seatV = [dkBox(0.52, 0.14, 0.52, 0, 0.45, 0.04), dkBox(0.5, 0.82, 0.13, 0, 0.9, -0.27, -0.32), dkBox(0.34, 0.2, 0.12, 0, 1.38, -0.4, -0.32), dkBox(0.08, 0.1, 0.4, -0.3, 0.7, 0.02), dkBox(0.08, 0.1, 0.4, 0.3, 0.7, 0.02)];
  const seatD = [dkBox(0.06, 0.6, 0.5, -0.3, 0.3, 0.0), dkBox(0.06, 0.6, 0.5, 0.3, 0.3, 0.0), dkBox(0.62, 0.05, 0.1, 0, 0.1, -0.24), dkBox(0.06, 0.04, 0.46, -0.3, 0.74, 0.02), dkBox(0.06, 0.04, 0.46, 0.3, 0.74, 0.02)];
  const seatPts = [], edge = [];
  for (const r of [4.2, 5.5, 6.8]) {
    const n = Math.round(PI * 2 * r / 0.68); let prev = false;
    const keep = k => Math.abs(Math.sin((k / n) * PI * 2)) >= 0.66;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * PI * 2; if (!keep(k)) continue;
      seatPts.push([Math.sin(a) * r, -Math.cos(a) * r, a]);
      if (!keep((k + 1) % n) || !keep((k + n - 1) % n)) edge.push([Math.sin(a) * (r - 0.3), -Math.cos(a) * (r - 0.3), a]);
    }
  }
  const seatVM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, map: TX.velvet().map, emissive: 0x2a0a10, emissiveIntensity: 1 });
  const seatDM = M(0x5a3420, 0.45, 0.1, { emissive: 0x120804, emissiveIntensity: 1 });
  const sv = new THREE.InstancedMesh(mergeGeometries(seatV), seatVM, seatPts.length), sd = new THREE.InstancedMesh(mergeGeometries(seatD), seatDM, seatPts.length);
  const dum = new THREE.Object3D(), col = new THREE.Color();
  seatPts.forEach(([x, z, a], i) => {
    dum.position.set(x, 0, z); dum.rotation.set(0, Math.atan2(-x, -z), 0); dum.updateMatrix();
    sv.setMatrixAt(i, dum.matrix); sd.setMatrixAt(i, dum.matrix);
    sv.setColorAt(i, col.setScalar(0.9 + ((i * 37) % 11) / 55));
  });
  sv.userData.nocast = 1; sd.userData.nocast = 1; R.g.add(sv, sd);
  { // aisle step lights at the ends of each row, and a ring of floor lights along the wall
    const bars = edge.map(([x, z, a]) => dkBox(0.04, 0.02, 0.22, x, 0.015, z, 0, -a, 0));
    for (let i = 0; i < 36; i++) { const a = i / 36 * PI * 2; bars.push(dkBox(0.22, 0.02, 0.04, Math.sin(a) * 7.7, 0.015, -Math.cos(a) * 7.7, 0, -a, 0)); }
    dkMerge(R.g, bars, M(0xffe0b0, 0.4, 0, { emissive: 0xffc070, emissiveIntensity: 1.2 }));
  }
  // Zeiss-style star projector: cast base, column, azimuth circle, fork and a tilted dumbbell of lens-studded balls
  const pj = new THREE.Group(); R.g.add(pj);
  const dm = M(0x24262b, 0.42, 0.7), gun = M(0x6e7176, 0.34, 0.95), cast = M(0x1a1b1f, 0.5, 0.6);
  lathe(pj, [[0.001, 0], [0.78, 0], [0.8, 0.05], [0.7, 0.12], [0.55, 0.3], [0.42, 0.46], [0.001, 0.46]], cast, 0, 0, 0, 12);
  add(pj, new THREE.TorusGeometry(0.62, 0.03, 8, 48), BRASS, 0, 0.14, 0).rotation.x = PI / 2;
  lathe(pj, [[0.001, 0.4], [0.26, 0.4], [0.2, 0.62], [0.17, 0.9], [0.17, 1.35], [0.24, 1.42], [0.24, 1.5], [0.001, 1.5]], dm, 0, 0, 0, 20);
  add(pj, new THREE.TorusGeometry(0.34, 0.025, 8, 40), BRASS, 0, 0.62, 0).rotation.x = PI / 2;
  add(pj, new THREE.TorusGeometry(0.22, 0.02, 8, 32), gun, 0, 1.0, 0).rotation.x = PI / 2;
  const fork = [];
  for (const s of [-1, 1]) fork.push(dkBox(0.1, 0.55, 0.14, s * 0.6, 1.8, 0), dkBox(0.1, 0.12, 0.26, s * 0.6, 2.1, 0));
  fork.push(dkBox(1.3, 0.12, 0.2, 0, 1.55, 0), dkCyl(0.1, 0.1, 1.4, 14, 0, 2.0, 0, 0, 0, PI / 2));
  dkMerge(pj, fork, dm);
  const arm = new THREE.Group(); arm.position.y = 2.0; arm.rotation.z = 0.5; pj.add(arm);
  cyl(arm, 0.07, 0.07, 2.0, gun, 0, 0, 0, 12);
  cyl(arm, 0.22, 0.22, 0.4, dm, 0, 0, 0, 20);
  add(arm, new THREE.TorusGeometry(0.24, 0.025, 8, 28), BRASS, 0, 0.12, 0).rotation.x = PI / 2;
  add(arm, new THREE.TorusGeometry(0.24, 0.025, 8, 28), BRASS, 0, -0.12, 0).rotation.x = PI / 2;
  add(arm, new THREE.TorusGeometry(0.62, 0.018, 6, 48), gun, 0, 0, 0).rotation.y = 0.3;
  const ball = new THREE.SphereGeometry(0.36, 28, 20);
  const barrel = new THREE.CylinderGeometry(0.03, 0.036, 0.11, 8).translate(0, 0.055, 0);
  const capG = new THREE.CircleGeometry(0.024, 8).rotateX(-PI / 2).translate(0, 0.112, 0);
  const lens = [];
  for (const s of [-1, 1]) { sph(arm, 0.36, dm, 0, s * 0.95, 0, 28); add(arm, new THREE.TorusGeometry(0.2, 0.03, 8, 24), BRASS, 0, s * 0.62, 0).rotation.x = PI / 2;
    const N = 64;
    for (let i = 0; i < N; i++) { // fibonacci spiral over the ball, skipping the pole where the rod enters
      const yy = 1 - (i + 0.5) / N * 2, rr = Math.sqrt(1 - yy * yy), th = i * 2.399963;
      const d = new THREE.Vector3(Math.cos(th) * rr, yy, Math.sin(th) * rr); if (d.y * -s > 0.86) continue;
      lens.push([d, s * 0.95]);
    }
  }
  const bm = new THREE.InstancedMesh(barrel, gun, lens.length), cm = new THREE.InstancedMesh(capG, M(0xffffff, 0.3, 0, { emissive: 0xfff0c8, emissiveIntensity: 1.6 }), lens.length);
  lens.forEach(([d, oy], i) => {
    dum.position.set(d.x * 0.35, oy + d.y * 0.35, d.z * 0.35); dum.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); dum.scale.setScalar(1 + (i % 5 === 0) * 0.5); dum.updateMatrix(); bm.setMatrixAt(i, dum.matrix); cm.setMatrixAt(i, dum.matrix);
  });
  bm.userData.nocast = cm.userData.nocast = 1; arm.add(bm, cm);
  updaters.push((dt, t) => { pj.rotation.y = t * 0.04; });
  // console: slanted mahogany desk with gauges, toggles, a big dial and a green-shaded lamp
  const cn = new THREE.Group(); cn.position.set(-1.3, 0, 2.0); faceTo(cn, 0, 6); R.g.add(cn);
  box(cn, 1.2, 0.9, 0.55, wood, 0, 0.45, 0);
  box(cn, 1.28, 0.04, 0.6, BRASS, 0, 0.9, 0.02);
  const deck = box(cn, 1.22, 0.05, 0.66, M(0x2a2c30, 0.4, 0.6, { t: TX.steel(), bump: 0.004 }), 0, 0.95, 0.04); deck.rotation.x = 0.35;
  const gaugeT = once('dkGauge', () => T.textCanvas(128, 128, (g, w) => {
    g.fillStyle = '#e8e0c8'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.strokeStyle = '#222'; g.lineWidth = 2;
    for (let i = 0; i <= 10; i++) { const a = PI * (0.8 + i * 0.14); g.beginPath(); g.moveTo(64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44); g.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56); g.stroke(); }
    g.lineWidth = 3; g.beginPath(); g.moveTo(64, 70); g.lineTo(64 + Math.cos(PI * 1.35) * 46, 70 + Math.sin(PI * 1.35) * 46); g.stroke();
  }));
  const gm = new THREE.MeshStandardMaterial({ map: gaugeT, roughness: 0.4 });
  for (const gx of [-0.46, -0.28]) { const g = new THREE.Group(); g.position.set(gx, 0.99, -0.14); g.rotation.x = 0.35; cn.add(g); cyl(g, 0.065, 0.065, 0.03, BRASS, 0, 0, 0, 20); add(g, new THREE.CircleGeometry(0.052, 20), gm, 0, 0.0155, 0).rotation.x = -PI / 2; }
  const cols = [0xc83a2a, 0xe8c050, 0x40a060, 0xe8e0d0];
  for (let i = 0; i < 12; i++) box(cn, 0.06, 0.035, 0.06, M(cols[i % 4], 0.4, 0, { emissive: cols[i % 4], emissiveIntensity: 0.5 }), -0.12 + (i % 6) * 0.1, 1.0 - Math.floor(i / 6) * 0.05, -0.06 + Math.floor(i / 6) * 0.16).rotation.x = 0.35;
  { const tg = []; for (let i = 0; i < 6; i++) tg.push(dkCyl(0.012, 0.012, 0.07, 6, -0.42 + i * 0.07, 1.03, 0.2, 0.35 - 0.5, 0, 0), dkCyl(0.02, 0.02, 0.02, 8, -0.42 + i * 0.07, 1.0, 0.2)); dkMerge(cn, tg, STEEL); }
  for (let i = 0; i < 3; i++) cyl(cn, 0.05, 0.05, 0.03, M(0x101010, 0.35, 0.2), 0.0 + i * 0.2, 0.93, 0.26, 16).rotation.x = 0.35 + PI / 2;
  for (let i = 0; i < 3; i++) box(cn, 0.012, 0.012, 0.05, BRASS, i * 0.2, 0.95, 0.265).rotation.x = 0.35;
  const cl = new THREE.Group(); cl.position.set(0.5, 0.97, -0.15); cn.add(cl);
  cyl(cl, 0.005, 0.005, 0.3, BRASS, 0, 0.15, 0, 6); cyl(cl, 0.06, 0.07, 0.03, BRASS, 0, 0.01, 0, 12);
  lathe(cl, [[0.02, 0.3], [0.09, 0.26], [0.1, 0.22], [0.08, 0.22]], M(0x1f6a46, 0.4, 0, { side: THREE.DoubleSide, emissive: 0x0a2a18, emissiveIntensity: 0.6 }), 0, 0, 0.0, 16);
  sph(cl, 0.03, M(0xfff0d0, 0.3, 0, { emissive: 0xffc070, emissiveIntensity: 1.4 }), 0, 0.25, 0, 10);
  box(cn, 0.3, 0.004, 0.2, M(0xe8e0c8, 0.8), -0.1, 1.0, 0.14).rotation.x = 0.35;
  dkPool(cn, 0.5, 0.97, -0.05, 0.9, 0.7, 0xffb868, 0.35);
  tag(cn, 'console', 'Projector console');
  // the stage: a raised apron with brass edge, footlights, steps, a gathered velvet curtain and valance
  const stageS = new THREE.Shape(); stageS.moveTo(-2.6, 5.4); stageS.lineTo(2.6, 5.4); stageS.quadraticCurveTo(3, 5.4, 3, 5.8); stageS.lineTo(3, 8.2); stageS.lineTo(-3, 8.2); stageS.lineTo(-3, 5.8); stageS.quadraticCurveTo(-3, 5.4, -2.6, 5.4);
  const sg = new THREE.ExtrudeGeometry(stageS, { depth: 0.5, bevelEnabled: false, curveSegments: 6 }); sg.rotateX(-PI / 2);
  const stage = struct(new THREE.Mesh(sg, [mat.oak([0.32, 0.32]), mat.mahog([2, 1])])); R.g.add(stage);
  { const tr = []; tr.push(dkBox(5.2, 0.05, 0.06, 0, 0.47, -5.43), dkBox(5.2, 0.05, 0.06, 0, 0.06, -5.43)); dkMerge(R.g, tr, BRASS);
    const fl = []; for (let i = 0; i < 14; i++) fl.push(dkG(new THREE.SphereGeometry(0.032, 8, 6), -2.6 + i * 0.4, 0.54, -5.55));
    dkMerge(R.g, fl, M(0xffffff, 0.3, 0, { emissive: 0xffc070, emissiveIntensity: 1.8 }));
    box(R.g, 5.4, 0.04, 0.1, M(0x1a1a1c, 0.5, 0.5), 0, 0.52, -5.55).userData.nocast = 1;
    dkPool(R.g, 0, 0.505, -6.7, 5.6, 3.2, 0xffa860, 0.45); }
  for (let i = 0; i < 2; i++) box(R.g, 0.9, 0.17 + i * 0.17, 0.34, mat.oak([0.5, 0.5]), -3.5, (0.17 + i * 0.17) / 2, -5.6 - i * 0.34);
  { const cg = new THREE.CylinderGeometry(7.55, 7.55, 2.05, 96, 1, true, PI - 0.42, 0.84), pa = cg.attributes.position, cc = [];
    for (let i = 0; i < pa.count; i++) { const a = Math.atan2(pa.getX(i), pa.getZ(i)), f = Math.sin(a * 40) * 0.1; pa.setX(i, pa.getX(i) * (1 - f / 7.55)); pa.setZ(i, pa.getZ(i) * (1 - f / 7.55)); cc.push(0.62 + 0.38 * (Math.sin(a * 40) * 0.5 + 0.5)); }
    cg.setAttribute('color', new THREE.Float32BufferAttribute(cc.flatMap(v => [v, v, v]), 3));
    cg.computeVertexNormals();
    const cmat = M(0x7a1020, 0.8, 0, { t: TX.velvet(), rep: [6, 2], side: THREE.DoubleSide, vertexColors: true });
    add(R.g, cg, cmat, 0, 1.55, 0);
    const vg = new THREE.CylinderGeometry(7.5, 7.5, 0.5, 96, 1, true, PI - 0.46, 0.92), va = vg.attributes.position;
    for (let i = 0; i < va.count; i++) { const a = Math.atan2(va.getX(i), va.getZ(i)); if (va.getY(i) < 0) { const s = 0.5 + 0.5 * Math.abs(Math.cos(a * 11)); va.setY(i, va.getY(i) - s * 0.3); } }
    vg.computeVertexNormals(); add(R.g, vg, cmat, 0, 2.38, 0);
    add(R.g, new THREE.CylinderGeometry(7.52, 7.52, 0.05, 64, 1, true, PI - 0.46, 0.92), M(0xc9a15a, 0.32, 1, { side: THREE.DoubleSide }), 0, 2.58, 0);
  }
  // spare light pool where the curtain meets the wall
  door(R, 3.3, -7.25, 'Service', 'hatch', [0, 0], { metal: 1 });
  dkExitSign(R.g, 3.3, 3.2, -7.2, 0, 0);
  dkExitSign(R.g, 0, 3.2, 7.8, 0, 0);
  dkPool(R.g, 3.3, 0.01, -6.4, 2.4, 1.8, 0xffd8a0, 0.3);
  dkPool(R.g, 0, 1.4, -7.4, 6, 2.6, 0xff9050, 0.2, 0, false);
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
  lamps(R, [0, 2.4, 2, 0xb0b8e0, 22, 14], [0, 2.6, -5.5, 0xffb070, 16, 9]);
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
  const pane = add(bd, new THREE.PlaneGeometry(0.5, 0.4), new THREE.MeshBasicMaterial({ map: texDay }), 0, 1.6, 0.05); pane.material.userData.view = 'lawnlake'; R.skyMats.push(pane.material);
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
  skyWindow(R, 3.2, 1.2, -2, 2.15, -3.97, 0, 0xd8d0b8, 'lawnlake');
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
  ixTube(N, [[1.4, 2.58, -3.78], [1.42, 2.0, -3.9], [1.45, 1.2, -3.92], [1.45, 0.85, -3.92]], 0.012, cBlack, 20);
  ixTube(N, [[-1.0, 2.58, -3.78], [-1.02, 1.8, -3.9], [-1.02, 0.9, -3.92]], 0.015, cGrey, 20);
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
  const wm = new THREE.MeshBasicMaterial({ map: texDay }); wm.userData.view = 'garden'; R.skyMats.push(wm);
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
  const wb = add(R.g, new THREE.PlaneGeometry(1.5, 0.85), new THREE.MeshStandardMaterial({ roughness: 0.8, map: T.textCanvas(512, 290, (g, w, h) => {
    g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, w, h);
    g.font = '30px "Segoe Print", "Comic Sans MS", cursive'; g.fillStyle = '#1a3a8a'; g.fillText('GALA A/V', 24, 44);
    g.fillStyle = '#2a2a2a'; ['lights — done', 'sound — done', 'projector — ??', 'ghost show v3 — SECRET'].forEach((l, i) => g.fillText(l, 36, 96 + i * 44));
    g.strokeStyle = '#b02020'; g.lineWidth = 3; g.beginPath(); g.ellipse(360, 228, 130, 26, 0, 0, 7); g.stroke();
  }) }), 0, 1.95, -3.93);
  box(R.g, 1.56, 0.03, 0.05, M(0x9a9ea2, 0.3, 0.8), 0, 1.51, -3.91);
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
  skyWindow(R, 2.2, 1.4, -1.4, 2.05, -3.97, 0, 0x5a2a2a, 'garden');
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
  skyWindow(R, 1.8, 1.4, 1.3, 1.65, -2.97, 0, 0x6a4a5a, 'lawnlake');
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

// ---------- Tunnel helpers (dark-rooms pass) ----------
// Poured-concrete service wall, 4 m wide x 2.6 m high: formwork seams and tie holes, a painted green-grey lower band
// that is peeling, water streaks down from the ceiling, and a damp tide line low on the wall.
const tunWallTex = () => once('tunWall', () => {
  const W = 512, H = 320, N = T.fbm(W / 2, H / 2, { scale: 4, oct: 5, seed: 31 }), St = T.fbm(W / 2, H / 2, { scale: 12, oct: 3, seed: 33, sx: 1, sy: 0.07 }), Pl = T.fbm(W / 2, H / 2, { scale: 6, oct: 4, seed: 35 });
  const band = H * (1 - 1.15 / 2.6);   // y where the painted band starts
  return T.done(T.pix(W, H, (x, y) => {
    const i = (y >> 1) * (W / 2) + (x >> 1), n = N[i], st = St[i], pl = Pl[i];
    let r = 128, g = 124, b = 116, h = 0.5 + n * 0.3;
    const k = 0.72 + n * 0.5; r *= k; g *= k; b *= k;
    if (y > band + (n - 0.5) * 8) {   // painted band
      const peel = pl > 0.58 ? Math.min(1, (pl - 0.58) * 9) : 0;
      const k2 = 0.8 + n * 0.4;
      r = r * peel + 74 * k2 * (1 - peel); g = g * peel + 90 * k2 * (1 - peel); b = b * peel + 80 * k2 * (1 - peel);
      h = 0.62 + n * 0.1 - peel * 0.25;
      const e = y - band; if (e < 4) { r *= 0.6; g *= 0.6; b *= 0.6; }
    }
    const streak = Math.max(0, st - 0.5) * 2.4 * (1 - y / H * 0.35); r *= 1 - streak * 0.55; g *= 1 - streak * 0.5; b *= 1 - streak * 0.4;
    if (y > H * 0.84) { const d = (y - H * 0.84) / (H * 0.16) * 0.35; r *= 1 - d; g *= 1 - d; b *= 1 - d * 0.8; }
    const sv = x % 256 < 2, sh = Math.abs(y - 70) < 1.5 || Math.abs(y - 190) < 1.5;
    if (sv || sh) { r *= 0.5; g *= 0.5; b *= 0.5; h = 0.15; }
    const tx = (x + 128) % 256 - 128, ty1 = y - 30, ty2 = y - 130;
    if ((tx * tx + ty1 * ty1 < 18 || tx * tx + ty2 * ty2 < 18) && Math.abs(tx) < 64) { r *= 0.4; g *= 0.4; b *= 0.4; h = 0.1; }
    return [r, g, b, h];
  }), null);
});
const tunFloorTex = () => once('tunFloor', () => {
  const S = 512, N = T.fbm(S, S, { scale: 3, oct: 6, seed: 41 }), D = T.fbm(S, S, { scale: 8, oct: 4, seed: 43 });
  return T.done(T.pix(S, S, (x, y) => {
    const n = N[y * S + x], d = D[y * S + x], k = 0.62 + n * 0.5, wet = Math.max(0, d - 0.6) * 1.6;
    const sx = x % 256 < 2 || y % 256 < 2;   // expansion joints
    let c = k * (1 - wet * 0.45); if (sx) c *= 0.45;
    return [100 * c, 96 * c, 88 * c, sx ? 0.1 : 0.5 + n * 0.3];
  }), null);
});
const tunPipeTex = () => once('tunPipe', () => {
  const S = 128, N = T.fbm(S, S, { scale: 6, oct: 4, seed: 51, sx: 1, sy: 0.4 }), M2 = T.fbm(S, S, { scale: 16, oct: 3, seed: 53 });
  return T.done(T.pix(S, S, (x, y) => {
    const n = N[y * S + x], m = M2[y * S + x], k = 0.8 + n * 0.3, rust = Math.max(0, m - 0.56) * 4;
    const r = 255 * k * (1 - rust) + 170 * rust, g = 250 * k * (1 - rust) + 96 * rust, b = 245 * k * (1 - rust) + 52 * rust;
    return [r, g, b, 0.5 + n * 0.3 - rust * 0.2];
  }), null);
});
const tunStencil = (text, w, h, fg, size) => T.textCanvas(w, h, (g, W, H) => {
  g.clearRect(0, 0, W, H); g.fillStyle = fg; g.font = `bold ${size}px Arial, Helvetica, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.globalAlpha = 0.82;
  g.fillText(text, W / 2, H / 2);
  const r = T.rng(text.length * 7 + 3);   // worn paint: knock out flecks
  for (let i = 0; i < 400; i++) { const x = r() * W | 0, y = r() * H | 0; g.clearRect(x, y, 2 + r() * 4, 1 + r() * 2); }
});
function tunShell(R, x0, x1, z0, z1, h) {
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, wall = M(0xffffff, 0.92, 0, { t: tunWallTex(), bump: 0.05 });
  const flr = M(0xffffff, 0.55, 0, { t: tunFloorTex(), rep: [w / 2, d / 2], bump: 0.03 });
  struct(add(R.g, new THREE.PlaneGeometry(w, d), flr, cx, 0, cz)).rotation.x = -Math.PI / 2;
  struct(add(R.g, new THREE.PlaneGeometry(w, d), M(0xffffff, 0.95, 0, { t: TX.concrete(), rep: [w / 2, d / 2], bump: 0.04 }), cx, h, cz)).rotation.x = Math.PI / 2;
  for (const [len, x, z, ry] of [[w, cx, z0, 0], [w, cx, z1, Math.PI], [d, x0, cz, Math.PI / 2], [d, x1, cz, -Math.PI / 2]]) {
    struct(add(R.g, new THREE.PlaneGeometry(len, h), reTex(wall, len / 4, 1), x, h / 2, z)).rotation.y = ry;
    aoRun(R.g, len, x, z, ry, h);
  }
}
// A cage bulkhead lamp: base plate, bulb, guard wires. Returns the bulb mesh; guard geometry is pushed to `iron`.
function tunLamp(R, iron, x, y, z) {
  iron.push(dkCyl(0.1, 0.1, 0.03, 12, x, y + 0.12, z), dkG(new THREE.TorusGeometry(0.1, 0.008, 5, 14), x, y + 0.02, z, Math.PI / 2), dkG(new THREE.TorusGeometry(0.1, 0.008, 5, 14), x, y - 0.1, z, Math.PI / 2));
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; iron.push(dkCyl(0.007, 0.007, 0.26, 4, x + Math.cos(a) * 0.1, y, z + Math.sin(a) * 0.1)); }
  const b = sph(R.g, 0.065, M(0xffffff, 0.3, 0, { emissive: 0xffc890, emissiveIntensity: 1.8 }), x, y - 0.01, z, 12); b.userData.nocast = 1; return b;
}
function tunValve(parts, brassParts, x, y, z, side) {
  parts.push(dkBox(0.2, 0.2, 0.24, x, y, z), dkBox(0.26, 0.06, 0.3, x, y, z), dkCyl(0.025, 0.025, 0.26, 6, x, y + 0.2, z));
  brassParts.push(dkG(new THREE.TorusGeometry(0.11, 0.014, 6, 16), x, y + 0.33, z, Math.PI / 2), dkBox(0.22, 0.014, 0.014, x, y + 0.33, z), dkBox(0.014, 0.014, 0.22, x, y + 0.33, z));
}
function tunCrate(parts, x, y, z, w, h, d, ry) {
  parts.push(dkBox(w, h, d, x, y + h / 2, z, 0, ry, 0));
}

function buildTunnel() {
  const R = mkRoom('tunnel', { p: [0, 6, -4], t: [0, 0, -6], s: 10, day: [0xffd0a0, 0.8], night: [0xffd0a0, 0.8] });
  R.dark = true;
  const PI = Math.PI;
  tunShell(R, -1.4, 1.4, -15, 2, 2.6);
  // pipe runs: rust-streaked, with flanges at the joints, wall brackets, valves and ID plates
  const pipeTex = tunPipeTex();
  const pm = c => M(c, 0.55, 0.55, { t: pipeTex, rep: [1, 8], bump: 0.02 });
  const pipes = [[-1.2, 2.2, 0x6a7a68, 0.1], [-1.25, 1.8, 0x9a5a36, 0.06], [1.2, 2.3, 0x9a5a36, 0.08], [1.25, 0.5, 0x6a7a68, 0.12]];
  const flange = [], brackets = [], valves = [], wheels = [];
  for (const [x, y, c, r] of pipes) {
    cyl(R.g, r, r, 17, pm(c), x, y, -6.5, 14).rotation.x = PI / 2;
    for (let z = 1.5; z > -15; z -= 3) flange.push(dkG(new THREE.TorusGeometry(r + 0.012, 0.022, 6, 14), x, y, z, 0, PI / 2, 0, 1, 1, 1.5));
    for (let z = 0.6; z > -15; z -= 1.8) {
      const wx = x < 0 ? -1.4 : 1.4, mid = (x + wx) / 2;
      brackets.push(dkBox(Math.abs(wx - x) + 0.04, 0.035, 0.05, mid, y + r + 0.02, z), dkG(new THREE.TorusGeometry(r + 0.012, 0.012, 5, 14, PI * 1.4), x, y, z, 0, 0, PI * 0.8 - PI / 2));
      brackets.push(dkBox(0.07, 0.07, 0.06, wx + (x < 0 ? 0.03 : -0.03), y + r + 0.02, z));
    }
  }
  tunValve(valves, wheels, -1.2, 2.2, -4.6); tunValve(valves, wheels, -1.25, 1.8, -9.4); tunValve(valves, wheels, 1.2, 2.3, -7.4);
  dkMerge(R.g, flange, M(0x4a4e4a, 0.5, 0.7)); dkMerge(R.g, brackets, IRON);
  dkMerge(R.g, valves, M(0x3a3c3a, 0.5, 0.8)); dkMerge(R.g, wheels, M(0x9a2a1e, 0.5, 0.4));
  // wall plates and stencils
  const plate = (txt, x, y, z, ry, w = 0.5, h = 0.14, fg = '#ece4c8') => { const o = add(R.g, new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tunStencil(txt, 256, 72, fg, 40), transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }), x, y, z); o.rotation.y = ry; o.userData.nocast = 1; return o; };
  plate('COLD WTR', -1.395, 1.55, -3.6, PI / 2, 0.5, 0.14, '#b8d0e0'); plate('STEAM  2', -1.395, 1.55, -8.2, PI / 2, 0.5, 0.14, '#e8d0a0');
  plate('DRAIN', 1.395, 1.1, -5.0, -PI / 2, 0.4, 0.12); plate('T-3', 1.395, 1.3, -11.4, -PI / 2, 0.3, 0.14, '#e8d870');
  plate('SERVICE TUNNEL', -1.395, 1.0, -1.2, PI / 2, 0.9, 0.18); plate('NO ADMITTANCE', -1.395, 1.0, -13.3, PI / 2, 0.9, 0.16, '#e0d6b8');
  // cable run along the ceiling: three sagging bundles on clips
  { const cab = [], zs = []; for (let z = 1.5; z > -15; z -= 1.8) zs.push(z);
    for (const [cx0, cy0] of [[-0.62, 2.52], [-0.52, 2.55], [-0.72, 2.55]]) {
      const pts = []; zs.forEach((z, i) => { pts.push(new THREE.Vector3(cx0, cy0, z)); if (i < zs.length - 1) pts.push(new THREE.Vector3(cx0, cy0 - 0.05 - (cx0 === -0.52 ? 0.02 : 0), z - 0.9)); });
      cab.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 4, 0.014, 5));
    }
    const m = dkMerge(R.g, cab, M(0x141414, 0.55, 0.2));
    const clips = zs.map(z => dkBox(0.26, 0.02, 0.03, -0.62, 2.585, z));
    dkMerge(R.g, clips, IRON);
    // a junction box with conduit
    const jb = []; jb.push(dkBox(0.3, 0.3, 0.14, 1.34, 1.5, -6.0), dkBox(0.24, 0.24, 0.02, 1.34, 1.5, -5.93), dkCyl(0.02, 0.02, 0.5, 6, 1.34, 1.88, -6.0), dkCyl(0.02, 0.02, 0.6, 6, 1.34, 1.05, -6.0));
    dkMerge(R.g, jb, M(0x5a6258, 0.55, 0.6));
    add(R.g, new THREE.BoxGeometry(0.16, 0.1, 0.02), M(0xe8c040, 0.5, 0.1, { emissive: 0x3a2a00, emissiveIntensity: 0.4 }), 1.34, 1.54, -5.915).userData.nocast = 1;
  }
  // caged bulbs + their pools of light (all pools are merged into one additive mesh)
  const bulbs = [], iron = [], pools = [];
  const poolG = (w, d, x, y, z, rx, ry) => dkG(new THREE.PlaneGeometry(w, d), x, y, z, rx, ry, 0);
  for (let z = 0; z > -15; z -= 3) {
    bulbs.push(tunLamp(R, iron, 0, 2.47, z));
    pools.push(poolG(3.4, 3.4, 0, 0.012, z, -PI / 2, 0), poolG(3, 2.2, 0, 2.595, z, PI / 2, 0), poolG(3.6, 2.2, -1.395, 1.4, z, 0, PI / 2), poolG(3.6, 2.2, 1.395, 1.4, z, 0, -PI / 2));
  }
  dkMerge(R.g, iron, IRON);
  { const pm2 = new THREE.MeshBasicMaterial({ map: dkGlowTex(), color: 0xffb070, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
    const o = dkMerge(R.g, pools, pm2); o.renderOrder = 2; }
  updaters.push((dt, t) => { bulbs.forEach((b, i) => { b.material.emissiveIntensity = Math.sin(t * 17 + i * 5) > 0.97 ? 0.2 : 1.8; }); });
  // puddles with reflections: glossy dark patches on the floor under the lamps
  { const pud = M(0x14130f, 0.04, 0.2, { transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -4 });
    for (const [x, z, sx, sz] of [[-0.35, -2.6, 0.7, 0.45], [0.45, -6.4, 0.55, 0.9], [-0.5, -9.6, 0.8, 0.5], [0.3, -12.2, 0.6, 0.7], [0.55, -0.9, 0.35, 0.5]]) {
      const o = add(R.g, new THREE.CircleGeometry(0.5, 20), pud, x, 0.006, z); o.rotation.x = -PI / 2; o.scale.set(sx, sz, 1); o.userData.nocast = 1; o.renderOrder = 1;
    }
    // a gutter drain down the middle with grating every few metres
    const gr = []; for (let z = 0.5; z > -14.5; z -= 3) for (let i = 0; i < 6; i++) gr.push(dkBox(0.34, 0.015, 0.02, 0, 0.012, z - 0.4 + i * 0.16));
    dkMerge(R.g, gr, IRON); }
  // old crates, a barrel and a lantern against the left wall (clear of the walking line)
  { const wd = M(0x7a5a38, 0.85, 0, { t: TX.oak(), rep: [1, 1], bump: 0.03 }), cr = [], slat = [];
    tunCrate(cr, -1.0, 0, -6.9, 0.7, 0.5, 0.55, 0.1); tunCrate(cr, -1.0, 0.5, -6.85, 0.55, 0.45, 0.5, -0.2); tunCrate(cr, -1.05, 0, -7.7, 0.6, 0.4, 0.5, 0.0);
    dkMerge(R.g, cr, wd, false);
    for (const [x, y, z, ry] of [[-1.0, 0.25, -6.9, 0.1], [-1.0, 0.725, -6.85, -0.2], [-1.05, 0.2, -7.7, 0]]) for (let i = -1; i <= 1; i += 2) slat.push(dkBox(0.74, 0.04, 0.6, x, y + i * 0.15, z, 0, ry, 0));
    dkMerge(R.g, slat, M(0x4a3420, 0.9, 0));
    // barrel
    lathe(R.g, [[0.001, 0], [0.22, 0], [0.26, 0.2], [0.28, 0.45], [0.26, 0.7], [0.22, 0.9], [0.001, 0.9]], M(0x4a5a6a, 0.6, 0.6, { t: pipeTex, rep: [1, 1] }), 1.0, 0, -9.2, 16);
    const bands = [0.18, 0.7].map(y => dkG(new THREE.TorusGeometry(y === 0.18 ? 0.255 : 0.255, 0.012, 5, 16), 1.0, y, -9.2, PI / 2)); dkMerge(R.g, bands, IRON);
    // kerosene lantern on the crate
    const L = new THREE.Group(); L.position.set(-1.0, 0.95, -6.85); R.g.add(L);
    const lp = [dkCyl(0.07, 0.08, 0.03, 10, 0, 0.015, 0), dkCyl(0.05, 0.07, 0.02, 10, 0, 0.23, 0), dkG(new THREE.TorusGeometry(0.06, 0.008, 5, 12, PI), 0, 0.27, 0), dkCyl(0.006, 0.006, 0.2, 4, 0.065, 0.12, 0), dkCyl(0.006, 0.006, 0.2, 4, -0.065, 0.12, 0)];
    dkMerge(L, lp, IRON);
    add(L, new THREE.CylinderGeometry(0.052, 0.06, 0.2, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffa040, emissiveIntensity: 1.1, transparent: true, opacity: 0.6, side: THREE.DoubleSide }), 0, 0.12, 0).userData.nocast = 1;
    const fl = sph(L, 0.025, M(0xffffff, 0.3, 0, { emissive: 0xffb050, emissiveIntensity: 2.4 }), 0, 0.1, 0, 8); fl.scale.y = 1.8;
    const lpool = add(R.g, new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({ map: dkGlowTex(), color: 0xffa050, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }), -0.9, 0.013, -6.85); lpool.rotation.x = -PI / 2; lpool.userData.nocast = 1; lpool.renderOrder = 2;
    updaters.push((dt, t) => { fl.scale.y = 1.7 + Math.sin(t * 9) * 0.12 + Math.sin(t * 23) * 0.06; });
  }
  // the vault door: a heavy round door in a thick frame, hinges, bolt housings, locking bars, handle and dial
  const vd = new THREE.Group(); vd.position.set(0, 1.25, -14.9); R.g.add(vd);
  const steel = M(0x7c8084, 0.4, 0.9, { t: TX.steel(), rep: [2, 2], bump: 0.006 }), dark = M(0x34383c, 0.55, 0.85, { t: TX.steel(), rep: [1, 1], bump: 0.006 });
  add(vd, new THREE.TorusGeometry(1.15, 0.12, 10, 56), dark, 0, 0, 0.09);   // frame casting
  add(vd, new THREE.CylinderGeometry(1.1, 1.1, 0.3, 56), M(0x1a1a1c, 0.8, 0.3), 0, 0, -0.02).rotation.x = PI / 2;   // dark recess
  cyl(vd, 1.0, 1.0, 0.3, steel, 0, 0, 0.12, 56).rotation.x = PI / 2;
  add(vd, new THREE.TorusGeometry(1.0, 0.045, 8, 56), steel, 0, 0, 0.27);
  for (let i = 0; i < 3; i++) add(vd, new THREE.TorusGeometry(0.3 + i * 0.27, 0.04, 8, 40), [BRASS, steel, BRASS][i], 0, 0, 0.29);
  { const bars = [], rivets = [], hous = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2 + PI / 8; bars.push(dkBox(0.22, 0.09, 0.05, Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0.3, 0, 0, a), dkBox(0.14, 0.14, 0.08, Math.cos(a - PI / 8) * 1.15, Math.sin(a - PI / 8) * 1.15, 0.1, 0, 0, a - PI / 8));
      hous.push(dkCyl(0.05, 0.05, 0.2, 8, Math.cos(a - PI / 8) * 1.06, Math.sin(a - PI / 8) * 1.06, 0.16, PI / 2, 0, 0)); }
    for (let i = 0; i < 28; i++) { const a = i / 28 * PI * 2; rivets.push(dkG(new THREE.SphereGeometry(0.03, 6, 4), Math.cos(a) * 0.93, Math.sin(a) * 0.93, 0.32)); }
    dkMerge(vd, bars, dark); dkMerge(vd, rivets, STEEL); dkMerge(vd, hous, dark);
    // three heavy hinges on the left
    const hg = []; for (const y of [-0.65, 0, 0.65]) hg.push(dkCyl(0.07, 0.07, 0.34, 10, -1.12, y, 0.2), dkBox(0.34, 0.2, 0.08, -0.98, y, 0.3), dkBox(0.34, 0.2, 0.08, -1.25, y, 0.2));
    dkMerge(vd, hg, dark); }
  // handle bar (right), pressure gauge and combination dial
  box(vd, 0.5, 0.07, 0.07, BRASS, 0.5, 0.0, 0.38); cyl(vd, 0.06, 0.06, 0.12, BRASS, 0.7, 0.0, 0.34, 10).rotation.x = PI / 2; cyl(vd, 0.06, 0.06, 0.12, BRASS, 0.3, 0.0, 0.34, 10).rotation.x = PI / 2;
  { const dial = new THREE.Group(); dial.position.set(0.0, -0.62, 0.3); vd.add(dial); cyl(dial, 0.17, 0.17, 0.06, dark, 0, 0, 0, 24).rotation.x = PI / 2; cyl(dial, 0.13, 0.13, 0.04, BRASS, 0, 0, 0.04, 24).rotation.x = PI / 2;
    const tk = []; for (let i = 0; i < 24; i++) { const a = i / 24 * PI * 2; tk.push(dkBox(0.01, i % 6 ? 0.03 : 0.05, 0.01, Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.065, 0, 0, a + PI / 2)); } dkMerge(dial, tk, IRON);
    box(dial, 0.015, 0.1, 0.012, M(0x8a1a14, 0.5), 0, 0.05, 0.07); }
  star3(vd, 0.15, BRASS, 0, 0, 0.32, 0.04);
  tag(vd, 'stardoor', 'Round vault door');
  { const dp = add(R.g, new THREE.PlaneGeometry(3.6, 3.6), new THREE.MeshBasicMaterial({ map: dkGlowTex(), color: 0xffb070, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 1.3, -14.7); dp.userData.nocast = 1; dp.renderOrder = 2; }
  door(R, 0, 1.95, null, 'exit_tunnel', [0, -5], { metal: 1 });
  lamps(R, [0, 2.2, -2, 0xffc890, 9, 10], [0, 2.2, -12, 0xffc890, 9, 10]);
  return R;
}

// ---------- Star Room helpers (dark-rooms pass) ----------
// Blueprint sheets: white line on blue, folded, stained. kind 0 = dome plan, 1 = section, 2 = floor plan.
const starBlue = (kind) => once('starBlue' + kind, () => T.textCanvas(512, 384, (g, w, h) => {
  const PI = Math.PI, r = T.rng(kind * 5 + 2);
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#2b5ca2'); gr.addColorStop(1, '#1b4079'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(225,238,255,.1)'; g.lineWidth = 1;
  for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.strokeStyle = 'rgba(238,246,255,.9)'; g.fillStyle = 'rgba(238,246,255,.92)'; g.lineWidth = 2; g.strokeRect(14, 14, w - 28, h - 28); g.lineWidth = 1.4;
  const arrow = (x1, y1, x2, y2, txt) => {
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1);
    for (const [x, y, s] of [[x1, y1, 1], [x2, y2, -1]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + s * Math.cos(a - 0.4) * 9, y + s * Math.sin(a - 0.4) * 9); g.moveTo(x, y); g.lineTo(x + s * Math.cos(a + 0.4) * 9, y + s * Math.sin(a + 0.4) * 9); g.stroke(); }
    g.font = '11px "Courier New", monospace'; g.textAlign = 'center'; g.fillText(txt, (x1 + x2) / 2, (y1 + y2) / 2 - 5);
  };
  if (kind === 0) {
    const cx = 220, cy = 175;
    for (const rr of [128, 120, 56, 48]) { g.beginPath(); g.arc(cx, cy, rr, 0, PI * 2); g.stroke(); }
    for (let i = 0; i < 24; i++) { const a = i / 24 * PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * 56, cy + Math.sin(a) * 56); g.lineTo(cx + Math.cos(a) * 120, cy + Math.sin(a) * 120); g.stroke(); }
    g.beginPath(); g.moveTo(cx - 150, cy); g.lineTo(cx + 150, cy); g.moveTo(cx, cy - 150); g.lineTo(cx, cy + 150); g.stroke();
    arrow(cx - 128, cy + 148, cx + 128, cy + 148, '16000'); arrow(cx + 150, cy - 56, cx + 150, cy + 56, '8000');
    g.beginPath(); g.arc(cx, cy, 20, 0, PI * 2); g.stroke(); g.font = '11px "Courier New", monospace'; g.fillText('STAR RM', cx, cy + 4);
  } else if (kind === 1) {
    const cx = 250, by = 300;
    g.beginPath(); g.arc(cx, by, 170, PI, PI * 2); g.stroke(); g.beginPath(); g.arc(cx, by, 160, PI, PI * 2); g.stroke();
    g.beginPath(); g.moveTo(cx - 190, by); g.lineTo(cx + 190, by); g.lineTo(cx + 190, by + 40); g.lineTo(cx - 190, by + 40); g.closePath(); g.stroke();
    g.strokeRect(cx - 60, by + 4, 120, 32); g.beginPath(); g.arc(cx, by + 36, 60, PI, PI * 2); g.stroke();
    for (let i = -4; i <= 4; i++) { g.beginPath(); g.moveTo(cx, by); g.lineTo(cx + Math.sin(i * 0.38) * 165, by - Math.cos(i * 0.38) * 165); g.stroke(); }
    arrow(cx - 170, by - 60, cx + 170, by - 60, '16000'); g.font = '11px "Courier New", monospace'; g.fillText('SECTION A-A', cx, by + 60);
  } else {
    g.strokeRect(50, 50, 200, 120); g.strokeRect(250, 50, 120, 80); g.strokeRect(250, 130, 120, 100); g.strokeRect(50, 170, 130, 130); g.strokeRect(180, 170, 70, 130);
    g.beginPath(); g.arc(370, 270, 60, 0, PI * 2); g.stroke(); g.beginPath(); g.arc(370, 270, 30, 0, PI * 2); g.stroke();
    g.font = '11px "Courier New", monospace'; g.textAlign = 'center'; g.fillText('SPA', 150, 115); g.fillText('LOBBY', 310, 95); g.fillText('KITCHEN', 115, 240); g.fillText('DOME', 370, 273);
    arrow(50, 320, 250, 320, '12000');
  }
  g.strokeRect(w - 214, h - 76, 196, 58); g.beginPath(); g.moveTo(w - 214, h - 54); g.lineTo(w - 18, h - 54); g.moveTo(w - 214, h - 36); g.lineTo(w - 18, h - 36); g.stroke();
  g.font = 'bold 12px "Courier New", monospace'; g.textAlign = 'left';
  g.fillText('AQUADOME - ' + ['DOME PLAN', 'SECTION', 'GROUND FLOOR'][kind], w - 208, h - 60); g.font = '10px "Courier New", monospace';
  g.fillText('SHEET ' + [7, 9, 2][kind] + ' OF 12   SCALE 1:50', w - 208, h - 42); g.fillText('O. FINCH, ARCH.   MAR 2003', w - 208, h - 24);
  g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
  for (let i = 0; i < 4; i++) { const x = r() * w, y = r() * h, rr = 30 + r() * 60, s = g.createRadialGradient(x, y, 0, x, y, rr); s.addColorStop(0, 'rgba(60,40,10,.18)'); s.addColorStop(1, 'rgba(60,40,10,0)'); g.fillStyle = s; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
}));
// A framed star chart on parchment, with Cygnus drawn heavier.
const starChartTex = () => once('starChart', () => T.textCanvas(512, 512, (g, w, h) => {
  const PI = Math.PI, r = T.rng(77);
  g.fillStyle = '#e6d8b2'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 30; i++) { const x = r() * w, y = r() * h, rr = 30 + r() * 80, s = g.createRadialGradient(x, y, 0, x, y, rr); s.addColorStop(0, 'rgba(120,80,30,.12)'); s.addColorStop(1, 'rgba(120,80,30,0)'); g.fillStyle = s; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
  g.strokeStyle = '#3a2a18'; g.fillStyle = '#3a2a18'; g.lineWidth = 2; g.strokeRect(10, 10, w - 20, h - 20);
  g.beginPath(); g.arc(256, 268, 214, 0, PI * 2); g.stroke(); g.lineWidth = 1; g.beginPath(); g.arc(256, 268, 196, 0, PI * 2); g.stroke();
  for (let i = 0; i < 72; i++) { const a = i / 72 * PI * 2; g.beginPath(); g.moveTo(256 + Math.cos(a) * 196, 268 + Math.sin(a) * 196); g.lineTo(256 + Math.cos(a) * (i % 6 ? 205 : 214), 268 + Math.sin(a) * (i % 6 ? 205 : 214)); g.stroke(); }
  g.strokeStyle = 'rgba(58,42,24,.35)'; for (const rr of [60, 120, 170]) { g.beginPath(); g.arc(256, 268, rr, 0, PI * 2); g.stroke(); }
  g.beginPath(); g.moveTo(256, 72); g.lineTo(256, 464); g.moveTo(60, 268); g.lineTo(452, 268); g.stroke();
  for (let i = 0; i < 170; i++) { const a = r() * PI * 2, d = Math.sqrt(r()) * 188; g.beginPath(); g.arc(256 + Math.cos(a) * d, 268 + Math.sin(a) * d, 0.8 + r() * r() * 2.6, 0, 7); g.fill(); }
  g.strokeStyle = '#3a2a18'; g.lineWidth = 2.4;
  const line = (pts, close) => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); if (close) g.closePath(); g.stroke(); pts.forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill(); }); };
  line([[256, 150], [256, 205], [256, 300], [256, 372]]); line([[188, 215], [256, 205], [326, 215]]);
  g.lineWidth = 1.4; line([[360, 130], [392, 150], [384, 190], [352, 180]], true); line([[120, 150], [150, 176], [140, 214], [172, 250], [162, 292]]);
  g.font = 'bold 15px Georgia, serif'; g.textAlign = 'center'; g.fillText('CYGNUS', 256, 400); g.font = '12px Georgia, serif'; g.fillText('LYRA', 372, 118); g.fillText('DRACO', 118, 136);
  g.font = 'bold 13px Georgia, serif'; g.fillText('THE NORTHERN SKY', 256, 36); g.font = '11px Georgia, serif'; g.fillText('AS SEEN FROM THE AQUADOME, 21 JUNE 2003', 256, 496);
}));
const starCorkTex = () => once('starCork', () => T.textCanvas(384, 256, (g, w, h) => {
  const r = T.rng(9);
  g.fillStyle = '#a8794a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) { g.fillStyle = r() < 0.5 ? 'rgba(90,55,25,.35)' : 'rgba(220,170,110,.3)'; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2); }
  const note = (x, y, nw, nh, rot, col, txt) => {
    g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(3, 4, nw, nh); g.fillStyle = col; g.fillRect(0, 0, nw, nh);
    g.fillStyle = 'rgba(40,40,50,.8)'; g.font = '11px "Courier New", monospace'; g.textAlign = 'left'; txt.forEach((t, i) => g.fillText(t, 7, 18 + i * 14));
    g.fillStyle = '#b02a22'; g.beginPath(); g.arc(nw / 2, 7, 4, 0, 7); g.fill(); g.restore();
  };
  note(24, 26, 104, 76, -0.05, '#efe8cf', ['CREW 2003', 'O.F. / M.O.', 'R.A. / G.H.', 'keys: 4']); note(150, 18, 92, 100, 0.04, '#f2e07a', ['DOME SEAL', 'check hatch', 'Fri 9 am']);
  note(262, 30, 96, 70, -0.03, '#efe8cf', ['TIME CAPSULE', 'lid: 4 bolts', 'open 2053']); note(40, 130, 120, 90, 0.03, '#d9e4ee', ['Sheet 7 rev. C', 'ribs +2', '(see O.F.)']);
  note(190, 144, 90, 80, -0.06, '#efe8cf', ['lamp bulbs', 'candles?', 'ask Gus']);
}));
const starWebTex = () => once('starWeb', () => T.textCanvas(256, 256, (g, w) => {
  g.clearRect(0, 0, w, w); g.strokeStyle = 'rgba(240,238,230,.8)'; g.lineWidth = 1;
  const r = T.rng(4), spokes = 7;
  for (let i = 0; i < spokes; i++) { const a = (i / (spokes - 1)) * Math.PI / 2 + (r() - 0.5) * 0.1; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 250, Math.sin(a) * 250); g.stroke(); }
  for (let k = 1; k < 9; k++) { const rr = k * 28; g.beginPath(); for (let i = 0; i < spokes; i++) { const a = (i / (spokes - 1)) * Math.PI / 2, x = Math.cos(a) * rr * (0.85 + r() * 0.2), y = Math.sin(a) * rr * (0.85 + r() * 0.2); i ? g.quadraticCurveTo((px + x) / 2 * 0.9, (py + y) / 2 * 0.9, x, y) : g.moveTo(x, y); var px = x, py = y; } g.stroke(); }
}));
const dkShadowTex = () => once('dkShadow', () => T.textCanvas(128, 128, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
}));
function starFrame(p, tex, w, h, th, y, ry, o = {}) {
  const x = Math.sin(th) * 3.93, z = -Math.cos(th) * 3.93, g = new THREE.Group(); g.position.set(x, y, z); faceTo(g, 0, 0); g.userData.nocast = 1; p.add(g);
  const fr = o.brass ? BRASS : mat.mahog(), t = 0.07;
  dkMerge(g, [dkBox(w + 2 * t, t, 0.05, 0, h / 2 + t / 2, 0), dkBox(w + 2 * t, t, 0.05, 0, -h / 2 - t / 2, 0), dkBox(t, h, 0.05, -w / 2 - t / 2, 0, 0), dkBox(t, h, 0.05, w / 2 + t / 2, 0, 0), dkBox(w + 0.02, h + 0.02, 0.01, 0, 0, -0.005)], fr);
  add(g, new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0, color: o.dim || 0xffffff }), 0, 0, 0.012).userData.nocast = 1;
  if (o.light) { dkMerge(g, [dkBox(0.5, 0.025, 0.04, 0, h / 2 + t + 0.14, 0.12), dkBox(0.015, 0.015, 0.2, 0, h / 2 + t + 0.14, 0.04)], BRASS); const lt = box(g, 0.44, 0.02, 0.03, M(0xfff0d0, 0.3, 0, { emissive: 0xffd090, emissiveIntensity: 1.6 }), 0, h / 2 + t + 0.1, 0.12); lt.userData.nocast = 1; }
  return g;
}

function buildStarRoom() {
  const R = mkRoom('star', { p: [0, 4, 1], t: [0, 0, -1], s: 4, day: [0xffd8b0, 1.1], night: [0xffd8b0, 1.1] });
  R.dark = true;
  const PI = Math.PI, WH = 2.3;
  const floorT = T.textCanvas(512, 512, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, '#4a3020'); gr.addColorStop(1, '#2a1a10'); g.fillStyle = gr; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 40; i++) { g.beginPath(); g.moveTo(0, i * 13); g.lineTo(w, i * 13 + 4); g.stroke(); }
    g.strokeStyle = '#c9a15a'; g.lineWidth = 6; g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 80 : 190; const x = w / 2 + Math.cos(a) * r, y = w / 2 + Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath(); g.stroke();
  });
  struct(add(R.g, new THREE.CircleGeometry(4, 48), new THREE.MeshStandardMaterial({ map: floorT, roughness: 0.45 }), 0, 0, 0)).rotation.x = -PI / 2;
  const wn = M(0xffffff, 0.5, 0, { t: TX.panel(), rep: [16, 1], bump: 0.02 }); wn.side = THREE.BackSide;
  struct(add(R.g, new THREE.CylinderGeometry(4, 4, WH, 64, 1, true), wn, 0, WH / 2, 0));
  struct(add(R.g, new THREE.TorusGeometry(3.96, 0.05, 6, 48), BRASS, 0, WH, 0)).rotation.x = PI / 2;
  struct(add(R.g, new THREE.SphereGeometry(4, 48, 24, 0, PI * 2, 0, PI / 2), new THREE.MeshBasicMaterial({ map: T.starDome(true), side: THREE.BackSide }), 0, WH, 0));
  { // wainscot: raised panels between pilasters, chair rail, skirting, cornice
    const wood = mat.mahog(), pl = [], pn = [];
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * PI * 2, x = Math.sin(a) * 3.94, z = -Math.cos(a) * 3.94; pl.push(dkBox(0.2, WH - 0.1, 0.1, x, WH / 2, z, 0, -a, 0));
      const a2 = a + PI / 16, x2 = Math.sin(a2) * 3.97, z2 = -Math.cos(a2) * 3.97; pn.push(dkBox(1.2, 0.7, 0.04, x2, 0.62, z2, 0, -a2, 0));
    }
    dkMerge(R.g, pl, wood, false).userData.struct = 1; dkMerge(R.g, pn, mat.panel([1, 1]), false).userData.struct = 1;
    const rm = reTex(wood, 30, 1); rm.side = THREE.BackSide;
    dkMerge(R.g, [dkG(new THREE.CylinderGeometry(3.9, 3.9, 0.08, 64, 1, true), 0, 1.02, 0), dkG(new THREE.CylinderGeometry(3.93, 3.93, 0.2, 64, 1, true), 0, 0.1, 0), dkG(new THREE.CylinderGeometry(3.88, 3.88, 0.14, 64, 1, true), 0, WH - 0.1, 0)], rm, false).userData.struct = 1;
  }
  // a faded round rug under the desk corner
  { const rug = add(R.g, new THREE.CircleGeometry(1, 32), M(0xffffff, 0.95, 0, { t: TX.carpetSuite(), rep: [1.2, 1.2], bump: 0.01, polygonOffset: true, polygonOffsetFactor: -2 }), 2.85, 0.006, -1.1); rug.rotation.x = -PI / 2; rug.scale.set(1.15, 1.45, 1); rug.userData.nocast = 1; }
  // crown pedestal
  const pd = new THREE.Group(); pd.position.set(0, 0, -0.8); R.g.add(pd);
  lathe(pd, [[0.001, 0], [0.4, 0], [0.4, 0.1], [0.3, 0.18], [0.24, 0.9], [0.34, 0.96], [0.34, 1.02], [0.001, 1.02]], M(0xffffff, 0.25, 0, { t: TX.marbleTop(), bump: 0.005 }), 0, 0, 0, 32);
  cyl(pd, 0.22, 0.22, 0.05, M(0x4a0f18, 0.95, 0, { t: TX.velvet() }), 0, 1.045, 0);
  R.crown = crown(pd, 0, 1.07, 0, 1.4);
  tag(pd, 'crown', 'The Prism Crown');
  // orrery
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
  // candle stands (stands and wax merged; the flames flicker)
  const flames = [], poolPts = [], shadowPts = [], stand = [], wax = [];
  for (const [x, z] of [[2.6, -2.4], [-2.6, 1.5], [2.4, 1.8]]) {
    stand.push(dkG(new THREE.LatheGeometry([[0.001, 0], [0.15, 0], [0.05, 0.1], [0.03, 1.0], [0.1, 1.05], [0.001, 1.05]].map(([r, h]) => new THREE.Vector2(r, h)), 16), x, 0, z));
    wax.push(dkCyl(0.03, 0.03, 0.18, 10, x, 1.14, z));
    const f = sph(R.g, 0.018, M(0xffffff, 0.3, 0, { emissive: 0xffa040, emissiveIntensity: 2 }), x, 1.25, z, 8); f.userData.nocast = 1; f.scale.y = 1.6; flames.push(f);
    poolPts.push(dkG(new THREE.PlaneGeometry(2.4, 2.4), x, 0.011, z, -PI / 2, 0, 0));
  }
  dkMerge(R.g, stand, BRASS, false); dkMerge(R.g, wax, M(0xf0e8d8, 0.7));
  updaters.push((dt, t) => { flames.forEach((f, i) => { f.scale.y = 1.5 + Math.sin(t * 8 + i * 2) * 0.15 + Math.sin(t * 21 + i) * 0.08; }); });
  // ---- the 2003 secret: Opal's drafting desk, chair, capsule, boxes, charts (small clutter: no shadow casting) ----
  const props = new THREE.Group(); props.userData.nocast = 1; R.g.add(props);
  const wd = mat.mahog(), oak = mat.oak([1, 1]), paper = M(0xefe6cf, 0.9);
  const blob = (x, z, w, d, ry = 0, op = 0.55) => shadowPts.push(dkG(new THREE.PlaneGeometry(w, d), x, 0.009, z, -PI / 2, 0, ry));
  { // desk against the east wall, facing the middle
    const d = new THREE.Group(); d.position.set(3.2, 0, -1.1); d.rotation.y = -PI / 2; props.add(d);
    box(d, 1.5, 0.05, 0.75, wd, 0, 0.76, 0);
    dkMerge(d, [dkBox(0.42, 0.7, 0.66, -0.52, 0.37, 0), dkBox(0.42, 0.7, 0.66, 0.52, 0.37, 0), dkBox(0.7, 0.4, 0.03, 0, 0.5, -0.3)], wd);
    const kn = []; for (const sx of [-0.52, 0.52]) for (const y of [0.18, 0.4, 0.62]) kn.push(dkG(new THREE.SphereGeometry(0.02, 6, 4), sx, y, 0.34), dkBox(0.12, 0.012, 0.01, sx, y + 0.06, 0.335));
    dkMerge(d, kn, BRASS);
    dkMerge(d, [dkBox(1.46, 0.005, 0.7, 0, 0.788, 0), dkBox(0.7, 0.004, 0.46, 0.0, 0.791, 0.04)], M(0x1c3a2a, 0.8));   // green leather blotter
    const L = new THREE.Group(); L.position.set(-0.55, 0.785, -0.15); d.add(L);   // banker's lamp
    lathe(L, [[0.001, 0], [0.08, 0], [0.07, 0.03], [0.02, 0.06], [0.02, 0.3], [0.001, 0.3]], BRASS, 0, 0, 0, 16);
    lathe(L, [[0.02, 0.36], [0.1, 0.33], [0.14, 0.29], [0.13, 0.28], [0.02, 0.33]], M(0x1f6a46, 0.35, 0.1, { side: THREE.DoubleSide, emissive: 0x2a8a50, emissiveIntensity: 0.9 }), 0, 0, 0, 16);
    sph(L, 0.03, M(0xfff0d0, 0.3, 0, { emissive: 0xffc070, emissiveIntensity: 1.6 }), 0, 0.31, 0, 8);
    poolPts.push(dkG(new THREE.PlaneGeometry(1.8, 1.8), 3.35, 0.8, -1.65, -PI / 2, 0, 0), dkG(new THREE.PlaneGeometry(3, 3), 3.0, 0.012, -1.4, -PI / 2, 0, 0));
    // open ledger, loose sheets, rolled drawings
    const cv = [dkBox(0.42, 0.015, 0.3, 0.15, 0.805, 0.12)], pp = [dkBox(0.2, 0.004, 0.27, 0.05, 0.815, 0.12), dkBox(0.2, 0.004, 0.27, 0.26, 0.815, 0.12), dkBox(0.3, 0.003, 0.22, -0.1, 0.8, -0.1, 0, 0.2, 0), dkBox(0.26, 0.003, 0.2, -0.05, 0.803, 0.2, 0, -0.3, 0)];
    dkMerge(d, cv, M(0x4a2a1a, 0.7)); dkMerge(d, pp, paper);
    dkMerge(d, [dkCyl(0.035, 0.035, 0.55, 10, 0.6, 0.835, -0.15, 0, 0.1, PI / 2), dkCyl(0.035, 0.035, 0.55, 10, 0.62, 0.835, -0.05, 0, -0.08, PI / 2)], M(0x6a8ab8, 0.8));
    blob(3.3, -1.1, 1.3, 2.1, 0);
  }
  { // wooden desk chair
    const c = new THREE.Group(); c.position.set(2.4, 0, -1.15); c.rotation.y = PI / 2 + 0.25; props.add(c);
    const lg = []; for (const [x, z] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) lg.push(dkBox(0.04, 0.45, 0.04, x, 0.225, z));
    lg.push(dkBox(0.4, 0.03, 0.03, 0, 0.18, -0.19), dkBox(0.4, 0.03, 0.03, 0, 0.18, 0.19), dkBox(0.04, 0.5, 0.04, -0.19, 0.7, -0.2), dkBox(0.04, 0.5, 0.04, 0.19, 0.7, -0.2), dkBox(0.42, 0.06, 0.03, 0, 0.98, -0.2), dkBox(0.38, 0.05, 0.02, 0, 0.78, -0.2), dkBox(0.38, 0.05, 0.02, 0, 0.64, -0.2));
    dkMerge(c, lg, wd); box(c, 0.46, 0.06, 0.46, M(0x5a2e1a, 0.6, 0, { t: TX.velvet(), bump: 0.01 }), 0, 0.48, 0);
    blob(2.4, -1.15, 0.85, 0.85, 0);
  }
  { // time capsule: a brass cylinder on two wooden cradles, with a plaque
    const cap = new THREE.Group(); cap.position.set(-1.35, 0, -2.75); cap.rotation.y = 0.35; props.add(cap);
    dkMerge(cap, [dkBox(0.08, 0.2, 0.5, -0.3, 0.1, 0), dkBox(0.08, 0.2, 0.5, 0.3, 0.1, 0)], oak);
    const tcg = [dkCyl(0.19, 0.19, 0.95, 20, 0, 0.36, 0, 0, 0, PI / 2)];
    for (const s of [-1, 1]) tcg.push(dkG(new THREE.SphereGeometry(0.19, 14, 10), s * 0.475, 0.36, 0, 0, 0, 0, 0.5, 1, 1), dkG(new THREE.TorusGeometry(0.19, 0.016, 6, 20), s * 0.4, 0.36, 0, 0, PI / 2, 0));
    dkMerge(cap, tcg, M(0xb48a46, 0.35, 0.9, { t: TX.steel(), bump: 0.004 }));
    const bl = []; for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; bl.push(dkG(new THREE.SphereGeometry(0.014, 6, 4), -0.5, 0.36 + Math.cos(a) * 0.12, Math.sin(a) * 0.12)); } dkMerge(cap, bl, STEEL);
    add(cap, new THREE.PlaneGeometry(0.42, 0.14), new THREE.MeshStandardMaterial({ map: T.plaque('TIME CAPSULE  2003', { w: 512, h: 170, size: 0.2, fg: '#2a1a08' }), metalness: 0.6, roughness: 0.4 }), 0, 0.36, 0.192);
    blob(-1.35, -2.75, 1.6, 0.9, 0.35 + PI / 2);
  }
  { // archive boxes and a steamer trunk
    const bx = M(0xb59a6c, 0.9, 0, { t: TX.oak(), rep: [1, 1], bump: 0.01 });
    const bg = new THREE.Group(); bg.position.set(-2.9, 0, -2.55); bg.rotation.y = 0.25; props.add(bg);
    dkMerge(bg, [dkBox(0.5, 0.32, 0.36, 0, 0.16, 0, 0, 0.1, 0), dkBox(0.5, 0.32, 0.36, 0.02, 0.48, 0.01, 0, -0.08, 0), dkBox(0.5, 0.32, 0.36, 0.7, 0.16, 0.05, 0, 0.3, 0)], bx);
    for (const [x, y, z, ry, t2] of [[0, 0.16, 0.19, 0.1, 'CREW 2003'], [0.02, 0.48, 0.2, -0.08, 'DRAWINGS']]) { const lb = add(bg, new THREE.PlaneGeometry(0.3, 0.1), new THREE.MeshStandardMaterial({ map: T.plaque(t2, { w: 256, h: 84, bg: '#e6dcc0', fg: '#3a2a18', font: 'Arial', size: 0.4 }), roughness: 0.9 }), x - 0.02, y, z); lb.rotation.y = ry; }
    blob(-2.6, -2.5, 1.7, 1.0, 0.25);
    const tr = new THREE.Group(); tr.position.set(-3.3, 0, 0.35); tr.rotation.y = PI / 2 - 0.15; props.add(tr);
    dkMerge(tr, [dkBox(0.95, 0.5, 0.52, 0, 0.25, 0), dkCyl(0.26, 0.26, 0.95, 16, 0, 0.5, 0, 0, 0, PI / 2)], M(0x4a3a2a, 0.75, 0, { t: TX.oak(), rep: [1, 1], bump: 0.03 }));
    const tb = []; for (const x of [-0.4, 0.4]) tb.push(dkBox(0.06, 0.78, 0.55, x, 0.4, 0)); tb.push(dkBox(0.96, 0.05, 0.54, 0, 0.1, 0), dkBox(0.12, 0.12, 0.02, 0, 0.45, 0.27)); dkMerge(tr, tb, M(0x6a4a24, 0.4, 0.8));
    blob(-3.3, 0.35, 1.0, 1.5, 0);
  }
  { const sm = new THREE.MeshBasicMaterial({ map: dkShadowTex(), color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }); dkMerge(R.g, shadowPts, sm).renderOrder = 1; }
  // framed blueprints, the star chart and a pin board on the walls
  starFrame(props, starBlue(0), 0.78, 0.58, -0.8, 1.4, 0); starFrame(props, starBlue(1), 0.78, 0.58, -0.38, 1.4, 0);
  starFrame(props, starChartTex(), 1.1, 1.1, 0.0, 1.4, 0, { brass: 1, light: 1, dim: 0xa89c88 });
  starFrame(props, starBlue(2), 0.78, 0.58, 0.4, 1.4, 0); starFrame(props, starCorkTex(), 0.9, 0.6, 0.82, 1.35, 0);
  { const webs = []; // cobwebs where the wall meets the dome
    for (const [th, y, flip] of [[-0.55, 2.0, 1], [0.58, 2.05, -1], [-1.3, 2.0, 1]]) {
      const x = Math.sin(th) * 3.88, z = -Math.cos(th) * 3.88; webs.push(dkG(new THREE.PlaneGeometry(0.8, 0.8), x, y, z, 0, Math.atan2(-x, -z), 0, flip, 1, 1));
    }
    dkMerge(R.g, webs, new THREE.MeshBasicMaterial({ map: starWebTex(), transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide })); }
  // warm light pools (candles, desk lamp, the crown), all in one additive mesh
  poolPts.push(dkG(new THREE.PlaneGeometry(3, 3), 0, 0.011, -0.8, -PI / 2, 0, 0));
  { const o = dkMerge(R.g, poolPts, new THREE.MeshBasicMaterial({ map: dkGlowTex(), color: 0xffa860, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })); o.renderOrder = 2; }
  door(R, 0, 3.9, null, 'exit_star', [0, 0], { metal: 1 });
  lamps(R, [0, 2.4, 0.5, 0xffc890, 14, 9], [0, 1.6, -0.8, 0xffd8a0, 5, 4]);
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
  const BAL = [[-9, -4, -4.4, -4], [-2.4, -4, -0.25, -4], [2.45, -4, 9, -4], [-9, -4, -9, 7], [9, -4, 9, 7]];
  for (const [x0, z0, x1, z1] of BAL) {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0), n = Math.round(len / 0.3), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    b.box(0.26, 0.1, len, mStone, cx, 0.1, cz, ang, 1.5); b.box(0.3, 0.07, len, mStone, cx, 0.035, cz, ang, 1.5);
    b.box(0.25, 0.1, len, mStone, cx, 0.87, cz, ang, 1.5); b.box(0.31, 0.05, len, mStone, cx, 0.945, cz, ang, 1.5);
    for (let i = 1; i < n; i++) { const t = i / n; b.lathe([[0.001, 0], [0.06, 0], [0.06, 0.04], [0.04, 0.1], [0.032, 0.16], [0.07, 0.33], [0.075, 0.37], [0.04, 0.45], [0.04, 0.55], [0.06, 0.62], [0.001, 0.62]], mStone, x0 + (x1 - x0) * t, 0.15, z0 + (z1 - z0) * t, 10); }
  }
  for (const [x, z] of [[-9, -4], [-4.4, -4], [-2.4, -4], [-0.25, -4], [2.45, -4], [5.7, -4], [9, -4], [-9, 1.5], [9, 1.5], [-9, 7], [9, 7]]) {
    b.box(0.36, 1.0, 0.36, mStone, x, 0.5, z, 0, 1.5); b.box(0.44, 0.08, 0.44, mStone, x, 1.04, z, 0, 1.5); b.box(0.3, 0.1, 0.3, mStone, x, 0.12, z, 0, 1.5);
    b.add(new THREE.SphereGeometry(0.13, 10, 8), mStone, x, 1.2, z); b.cyl(0.07, 0.1, 0.08, mStone, x, 1.12, z, 10);
  }

  // ----- lamp posts (lit at night, with pools of light) -----
  const poolM = new THREE.MeshBasicMaterial({ map: terPoolTex('255,196,120'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 });
  const pools = [];
  const LAMPS = [[-8.6, -3.6], [8.6, -3.6], [-0.7, -4.25], [2.9, -4.25], [2.75, -10.2]];
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
  for (const [x, z, s, p] of [[-6, -3.2, 1.15, ['red', 'white']], [6, -3.2, 1.15, ['red', 'white']], [-8.3, 4.3, 1.15, ['pink', 'white']], [8.3, 4.3, 1.15, ['pink', 'white']], [-4.9, 4.3, 1.0, ['yellow', 'orange']], [4.9, 4.3, 1.0, ['yellow', 'orange']]]) urn(x, z, s, p);
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
  // (kept clear of the building and its gravel walk: several used to stand inside the wings)
  for (const [x, z, h] of [[-14.5, -1.5, 7.5], [-20.5, 0, 9], [-26, 4, 6.5], [14.5, -2, 8], [16.5, 2.5, 6.5], [19.5, 0.5, 8.5], [-31, 16, 9.5], [31, 14, 9], [-19, -4, 8.5], [19, -3, 9], [24.5, -1.5, 7.5],
    [-28, 30, 9], [27, 31, 8.5], [-12, 46, 9], [13, 47, 8], [-24, 40, 7.5], [24, 41, 8]]) pine(x, z, h);
  for (const [x, z, h, l] of [[-14.2, -10, 6, 0.05], [-12.6, -11.6, 5, -0.06], [9.6, -12.4, 5.5, 0.04], [12.3, -8.2, 6.2, -0.05], [11.5, -11, 4.6, 0.07], [-12.5, 0.5, 5, 0.03]]) birch(x, z, h, l);

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
  const mWin = M(0x3c4c5a, 0.08, 0.6, { emissive: 0xffb860, emissiveIntensity: 0, envMapIntensity: 1.8 }); R.winGlow = mWin;
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
  // ----- the wings round the rotunda, where the lobby's doors lead (lobby door angle a: from the terrace that direction
  // is (-sin a, cos a) about the drum's centre). Sizes follow the rooms inside. Planetarium 0, Spa 55, Tech Office and the
  // Guest Wing above it 110, Grand Staircase 150, Terrace 180 (the portico), Kitchen 250, Archive 305.
  {
    const C = [0, Z0], dirOf = a => [-Math.sin(a * DEG), Math.cos(a * DEG)];
    const mWall = M(0xffffff, 0.85, 0, { t: tex('tAsh', terAshlarTex), bump: 0.05 });
    const mCopper = M(0x5f8f7c, 0.55, 0.35), mCopperD = M(0x4c7464, 0.6, 0.3);
    const glassR = M(0x9bbcc4, 0.35, 0.1, { emissive: 0xffc070, emissiveIntensity: 0 });
    R.wingGlass = glassR;
    // a frame for one wing: local x along the drum, local z away from it; returns world position and heading
    const frame = (a, r) => { const [dx, dz] = dirOf(a); return { a, ry: Math.atan2(dx, dz), cx: C[0] + dx * r, cz: C[1] + dz * r, P(lx, lz) { const c = Math.cos(this.ry), s = Math.sin(this.ry); return [this.cx + lx * c + lz * s, this.cz - lx * s + lz * c]; } }; };
    const at = (F, lx, ly, lz, fn) => { const [x, z] = F.P(lx, lz); fn(x, ly, z); };
    // window on a face: face 'f' (outward, +z), 'l' (-x) or 'r' (+x); u = position along the face, y0 = sill height
    const mRecess = M(0xc9c0aa, 0.9, 0, { t: TX.stone(), bump: 0.03 }), mShutter = M(0x3d5a48, 0.6), mShutterD = M(0x2c4236, 0.7), mPot = M(0x9a5a40, 0.8), mPost = M(0x3a2a1c, 0.6), mTin = M(0x8a8a8a, 0.4, 0.8), mPaint = [M(0xe8e2d0, 0.5, 0.2), M(0x5f8f7c, 0.5, 0.2)];
    const win = (F, face, half, u, y0, w, h, arched, shut = false) => {
      const ry = F.ry + (face === 'f' ? 0 : face === 'r' ? Math.PI / 2 : -Math.PI / 2);
      const lx = face === 'f' ? u : face === 'r' ? half : -half, lz = face === 'f' ? half : u * (face === 'r' ? -1 : 1);
      const n = 0.03, [x, z] = F.P(lx + (face === 'r' ? n : face === 'l' ? -n : 0), lz + (face === 'f' ? n : 0));
      const shape = arched ? terArch(w, h) : (() => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.closePath(); return s; })();
      const outer = arched ? terArch(w + 0.3, h + 0.15) : (() => { const s = new THREE.Shape(); s.moveTo(-w / 2 - .15, -.08); s.lineTo(w / 2 + .15, -.08); s.lineTo(w / 2 + .15, h + .15); s.lineTo(-w / 2 - .15, h + .15); s.closePath(); return s; })();
      outer.holes.push(new THREE.Path(shape.getPoints(16)));
      b.add(new THREE.ExtrudeGeometry(outer, { depth: 0.12, bevelEnabled: false, curveSegments: 8 }), mTrim, x, y0, z, ry);
      b.add(new THREE.ShapeGeometry(shape, 8), mWin, x, y0, z, ry);
      const [mx, mz] = F.P(lx + (face === 'r' ? n * 2 : face === 'l' ? -n * 2 : 0), lz + (face === 'f' ? n * 2 : 0));
      b.box(0.04, h - (arched ? w / 2 : 0.05), 0.04, BRONZE, mx, y0 + (h - (arched ? w / 2 : 0)) / 2, mz, ry);
      b.box(w, 0.04, 0.04, BRONZE, mx, y0 + h * 0.45, mz, ry);
      b.box(w + 0.4, 0.1, 0.26, mTrim, x, y0 - 0.05, z, ry);
      if (!arched) { b.box(w + 0.5, 0.14, 0.2, mTrim, x, y0 + h + 0.24, z, ry); const [kx, kz] = F.P(lx + (face === 'r' ? .1 : face === 'l' ? -.1 : 0), lz + (face === 'f' ? .1 : 0)); b.box(0.26, 0.3, 0.12, mTrim, kx, y0 + h + 0.12, kz, ry); }
      if (shut) for (const sd of [-1, 1]) {
        const off = sd * (w / 2 + 0.36), sx_ = face === 'f' ? off : 0, sz_ = face === 'f' ? 0 : off * (face === 'r' ? -1 : 1);
        const [qx, qz] = F.P(lx + sx_ + (face === 'r' ? .06 : face === 'l' ? -.06 : 0), lz + sz_ + (face === 'f' ? .06 : 0));
        b.box(0.5, h + 0.1, 0.05, mShutter, qx, y0 + h / 2, qz, ry);
        for (let k = 1; k < 7; k++) b.box(0.46, 0.03, 0.06, mShutterD, qx, y0 + k * h / 7, qz, ry);
      }
    };
    // a rectangular block: plinth, walls, cornice
    // weathering: nine years closed left grey streaks under every cornice and splash marks at the foot of the walls
    const grimeT = once('tGrime', () => { const c = T.canvas(64, 128), g = c.getContext('2d'), r = T.rng(77);
      const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(40,38,32,.55)'); gr.addColorStop(.35, 'rgba(40,38,32,.18)'); gr.addColorStop(1, 'rgba(40,38,32,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 128);
      for (let i = 0; i < 14; i++) { const x = r() * 64, w = 1 + r() * 3, l = 40 + r() * 80; const sg = g.createLinearGradient(0, 0, 0, l); sg.addColorStop(0, 'rgba(35,33,28,.35)'); sg.addColorStop(1, 'rgba(35,33,28,0)'); g.fillStyle = sg; g.fillRect(x, 0, w, l); }
      const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t; });
    const mGrime = new THREE.MeshBasicMaterial({ map: grimeT, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const grime = (F, w, d, h) => {
      for (const [lx, lz, ry, len] of [[0, d / 2 + 0.012, 0, w], [0, -d / 2 - 0.012, Math.PI, w], [w / 2 + 0.012, 0, Math.PI / 2, d], [-w / 2 - 0.012, 0, -Math.PI / 2, d]]) {
        const top = new THREE.PlaneGeometry(len, 1.6); terUV(top, len / 3, 1);
        at(F, lx, h - 1.1, lz, (x, y, z) => b.add(top, mGrime, x, y, z, F.ry + ry));
        const foot = new THREE.PlaneGeometry(len, 0.7); terUV(foot, len / 3, 1); foot.rotateZ(Math.PI);
        at(F, lx, 0.95, lz, (x, y, z) => b.add(foot, mGrime, x, y, z, F.ry + ry));
      }
    };
    const quoins = (F, w, d, h) => {
      for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) for (let y = 0.75, i = 0; y < h - 0.5; y += 0.42, i++) {
        const long = i % 2 ? 0.62 : 0.4;
        at(F, sx * (w / 2 + 0.02) - sx * long / 2 + sx * 0.02, y, sz * (d / 2 + 0.03), (x, yy, z) => b.box(long, 0.36, 0.08, mTrim, x, yy, z, F.ry));
        at(F, sx * (w / 2 + 0.03), y, sz * (d / 2 + 0.02) - sz * (i % 2 ? 0.4 : 0.62) / 2 + sz * 0.02, (x, yy, z) => b.box(0.08, 0.36, i % 2 ? 0.4 : 0.62, mTrim, x, yy, z, F.ry));
      }
    };
    const pipes = (F, w, d, h) => { for (const sx of [-1, 1]) at(F, sx * (w / 2 - 0.35), h / 2, d / 2 + 0.1, (x, y, z) => { b.cyl(0.05, 0.05, h, mSlate, x, y, z, 6); b.box(0.2, 0.16, 0.2, mSlate, x, h - 0.2, z, F.ry); }); };
    const blind = (F, face, half, u, y0, w, h) => {
      const ry = F.ry + (face === 'f' ? 0 : face === 'r' ? Math.PI / 2 : -Math.PI / 2), lx = face === 'f' ? u : face === 'r' ? half : -half, lz = face === 'f' ? half : u * (face === 'r' ? -1 : 1);
      const [x, z] = F.P(lx + (face === 'r' ? .02 : face === 'l' ? -.02 : 0), lz + (face === 'f' ? .02 : 0));
      b.add(new THREE.ShapeGeometry(terArch(w, h), 8), mRecess, x, y0, z, ry);
      const outer = terArch(w + 0.3, h + 0.15); outer.holes.push(new THREE.Path(terArch(w, h).getPoints(16)));
      b.add(new THREE.ExtrudeGeometry(outer, { depth: 0.1, bevelEnabled: false, curveSegments: 8 }), mTrim, x, y0, z, ry);
      b.box(w + 0.36, 0.1, 0.22, mTrim, x, y0 - 0.05, z, ry);
    };
    const block = (F, w, d, h, wallM = mWall, o = {}) => {
      at(F, 0, h / 2, 0, (x, y, z) => b.box(w, h, d, wallM, x, y, z, F.ry, 3.2));
      at(F, 0, 0.3, 0, (x, y, z) => b.box(w + 0.3, 0.6, d + 0.3, mStone, x, y, z, F.ry, 1.5));
      at(F, 0, 0.66, 0, (x, y, z) => b.box(w + 0.18, 0.12, d + 0.18, mTrim, x, y, z, F.ry, 1.5));
      at(F, 0, h - 0.15, 0, (x, y, z) => b.box(w + 0.36, 0.3, d + 0.36, mTrim, x, y, z, F.ry, 1.5));
      at(F, 0, h - 0.36, 0, (x, y, z) => b.box(w + 0.22, 0.1, d + 0.22, mTrim, x, y, z, F.ry, 1.5));
      at(F, 0, h + 0.06, 0, (x, y, z) => b.box(w + 0.5, 0.12, d + 0.5, mTrim, x, y, z, F.ry, 1.5));
      if (!o.plain) { quoins(F, w, d, h - 0.4); grime(F, w, d, h); }
      if (o.pipes) pipes(F, w, d, h);
    };
    // roofs: gable (ridge along local x), hip (square-based frustum) and a low glazed lantern
    const gable = (F, w, d, h, rise) => {
      const pitch = Math.atan2(rise, d / 2), len = Math.hypot(rise, d / 2) + 0.35;
      for (const s of [-1, 1]) at(F, 0, h + 0.12 + rise / 2, s * d / 4, (x, y, z) => b.box(w + 0.6, 0.14, len, mSlate, x, y, z, F.ry, 0, s * pitch));
      const tri = new THREE.Shape(); tri.moveTo(-d / 2, 0); tri.lineTo(d / 2, 0); tri.lineTo(0, rise); tri.closePath();
      for (const s of [-1, 1]) at(F, s * (w / 2 + 0.02), h + 0.12, 0, (x, y, z) => b.add(new THREE.ExtrudeGeometry(tri, { depth: 0.2, bevelEnabled: false }), mTrim, x, y, z, F.ry + Math.PI / 2 * (s > 0 ? 1 : -1) + (s > 0 ? Math.PI : 0)));
      at(F, 0, h + 0.14 + rise, 0, (x, y, z) => b.box(w + 0.7, 0.12, 0.22, mSlate, x, y, z, F.ry));
      for (let i = 0; i <= Math.round(w / 0.8); i++) at(F, -w / 2 + i * w / Math.round(w / 0.8), h + 0.38 + rise, 0, (x, y, z) => { b.cyl(0.012, 0.012, 0.36, IRON, x, y, z, 4); b.sph(0.035, IRON, x, y + 0.2, z, 1, 5); });
      at(F, 0, h + 0.5 + rise, 0, (x, y, z) => b.box(w + 0.5, 0.025, 0.025, IRON, x, y, z, F.ry));
    };
    const hip = (F, w, d, h, rise, top = 0.12, m = mSlate) => {
      const g = new THREE.CylinderGeometry(top, Math.SQRT1_2, 1, 4, 1); g.rotateY(Math.PI / 4);
      at(F, 0, h + 0.12 + rise / 2, 0, (x, y, z) => b.add(g, m, x, y, z, F.ry, 0, 0, [w + 0.6, rise, d + 0.6]));
    };
    // a low link between the drum and a wing
    const link = (a, w, r0, r1, h) => { const F = frame(a, (r0 + r1) / 2); block(F, w, r1 - r0 + 0.6, h); return F; };

    // Planetarium (north, behind the rotunda): its own drum and an opaque copper star dome
    {
      const [dx, dz] = dirOf(0), PR = 7.4, PC = [C[0] + dx * (RD + 2.6 + PR), C[1] + dz * (RD + 2.6 + PR)];
      link(0, 4.2, RD - 0.4, RD + 2.9, 4.2);
      b.cyl(PR + 0.35, PR + 0.45, 0.6, mStone, PC[0], 0.3, PC[1], 48);
      b.add(new THREE.CylinderGeometry(PR, PR, 6.4, 48, 1, true), mWall, PC[0], 3.5, PC[1], 0, 0, 0, 1);
      b.cyl(PR + 0.25, PR + 0.25, 0.35, mTrim, PC[0], 6.6, PC[1], 48); b.cyl(PR + 0.4, PR + 0.3, 0.16, mTrim, PC[0], 6.85, PC[1], 48);
      for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; b.box(0.5, 5.6, 0.3, mTrim, PC[0] + Math.sin(a) * (PR + 0.1), 3.6, PC[1] + Math.cos(a) * (PR + 0.1), a); }
      for (let k = 0; k < 12; k++) {   // stone roundels high up (blind: the planetarium is dark inside, it has no windows)
        const a = (k + .5) / 12 * Math.PI * 2; if (Math.cos(a) < -0.85) continue;
        b.add(new THREE.CircleGeometry(0.42, 16), mRecess, PC[0] + Math.sin(a) * (PR + 0.03), 5.4, PC[1] + Math.cos(a) * (PR + 0.03), a);
        b.add(new THREE.TorusGeometry(0.47, 0.07, 6, 18), mTrim, PC[0] + Math.sin(a) * (PR + 0.05), 5.4, PC[1] + Math.cos(a) * (PR + 0.05), a);
      }
      b.add(new THREE.SphereGeometry(PR + 0.3, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2), mCopper, PC[0], 6.9, PC[1], 0, 0, 0, [1, 0.72, 1]);
      for (let k = 0; k < 16; k++) { const ph = k / 16 * Math.PI * 2, pts = []; for (let j = 0; j <= 10; j++) { const th = j / 10 * Math.PI / 2; pts.push([PC[0] + Math.sin(th) * Math.cos(ph) * (PR + 0.34), 6.9 + Math.cos(th) * (PR + 0.3) * 0.72, PC[1] + Math.sin(th) * Math.sin(ph) * (PR + 0.34)]); } b.add(terTube(pts, 0.06, 10, 4), mCopperD); }
      const mGold = M(0xd8b060, 0.3, 0.9);
      for (let k = 0; k < 46; k++) {
        const th = 0.25 + rr() * 1.15, ph = rr() * Math.PI * 2, rS = PR + 0.33, sc = 0.13 + rr() * 0.14;
        const g = new THREE.ExtrudeGeometry(starShape(sc, sc * 0.45), { depth: 0.02, bevelEnabled: false }); g.center();
        b.add(g, mGold, PC[0] + Math.sin(th) * Math.sin(ph) * rS, 6.9 + Math.cos(th) * rS * 0.72, PC[1] + Math.sin(th) * Math.cos(ph) * rS, ph, th - Math.PI / 2 + 0.25 * Math.sin(th));
      }
      b.add(new THREE.TorusGeometry(PR + 0.32, 0.09, 6, 64), mGold, PC[0], 7.0, PC[1], 0, Math.PI / 2);
      const top = 6.9 + (PR + 0.3) * 0.72; b.cyl(0.55, 0.65, 0.7, mTrim, PC[0], top + 0.3, PC[1], 12); b.cyl(0.1, 0.62, 0.7, mCopperD, PC[0], top + 0.95, PC[1], 12); star3(R.g, 0.32, BRASS, PC[0], top + 1.55, PC[1], 0.06);
    }
    // Spa & Pools (north-east): a tall pool hall with arched windows and a glazed roof lantern over the pool
    {
      link(55, 3.6, RD - 0.4, RD + 1.6, 4);
      // "a sky you can swim under": a glass pool pavilion in iron, on a stone base
      const F = frame(55, RD + 1.4 + 5.2), w = 14, d = 10.4, h = 5.2;
      block(F, w, d, h, mWall, { plain: 1 });
      const bay = (face, half, u) => {   // a full-height glazed arched bay with iron glazing bars
        const ry = F.ry + (face === 'f' ? 0 : face === 'r' ? Math.PI / 2 : -Math.PI / 2), lx = face === 'f' ? u : face === 'r' ? half : -half, lz = face === 'f' ? half : u * (face === 'r' ? -1 : 1);
        const [x, z] = F.P(lx + (face === 'r' ? .04 : face === 'l' ? -.04 : 0), lz + (face === 'f' ? .04 : 0));
        b.add(new THREE.ShapeGeometry(terArch(2.2, 4.0), 10), glassR, x, 0.9, z, ry);
        for (let k = -2; k <= 2; k++) { const [bx, bz] = F.P(lx + (face === 'f' ? k * .44 : face === 'r' ? .07 : -.07), lz + (face === 'f' ? .07 : k * .44 * (face === 'r' ? -1 : 1))); b.box(0.04, 3.9 - Math.abs(k) * 0.25, 0.04, IRON, bx, 0.9 + (3.9 - Math.abs(k) * 0.25) / 2, bz, ry); }
        for (const yy of [1.6, 2.5, 3.4]) { const [bx, bz] = F.P(lx + (face === 'r' ? .07 : face === 'l' ? -.07 : 0), lz + (face === 'f' ? .07 : 0)); b.box(2.2, 0.04, 0.04, IRON, bx, 0.9 + yy, bz, ry); }
        const outer = terArch(2.5, 4.15); outer.holes.push(new THREE.Path(terArch(2.2, 4.0).getPoints(16)));
        b.add(new THREE.ExtrudeGeometry(outer, { depth: 0.14, bevelEnabled: false, curveSegments: 8 }), mTrim, x, 0.9, z, ry);
      };
      for (let i = 0; i < 5; i++) bay('f', d / 2, -5.6 + i * 2.8);
      for (const face of ['l', 'r']) for (let i = 0; i < 3; i++) blind(F, face, w / 2, -3.3 + i * 3.3, 1.0, 1.6, 3.2);
      // a slate hip roof with a glazed skylight over the coffered ceiling's skylight
      hip(F, w, d, h, 1.6, 0.25);
      at(F, 0, h + 1.95, 0.6, (x, y, z) => { b.box(3.85, 0.5, 2.55, glassR, x, y, z, F.ry); b.box(4.05, 0.1, 2.75, IRON, x, y + 0.3, z, F.ry); });
      for (let i = 0; i <= 6; i++) at(F, -1.92 + i * 0.64, h + 1.95, 0.6 + 1.29, (x, y, z) => b.box(0.04, 0.5, 0.04, IRON, x, y, z, F.ry));
    }
    // Tech Office below, the Guest Wing above (west): two storeys, a slate gable roof with dormers
    {
      link(110, 3.4, RD - 0.4, RD + 1.4, 4.2);
      const F = frame(110, RD + 1.2 + 4.6), w = 16, d = 9.2, h = 7.4;
      block(F, w, d, h);
      at(F, 0, 3.7, 0, (x, y, z) => b.box(w + 0.16, 0.22, d + 0.16, mTrim, x, y, z, F.ry, 1.5));   // floor band
      for (let i = 0; i < 6; i++) { win(F, 'f', d / 2, -6.25 + i * 2.5, 1.1, 1.1, 1.6, false); win(F, 'f', d / 2, -6.25 + i * 2.5, 4.5, 1.1, 1.9, false, true); }
      pipes(F, w, d, h);
      for (const face of ['l', 'r']) for (let i = 0; i < 2; i++) { win(F, face, w / 2, -2 + i * 4, 1.1, 1.1, 1.6, false); win(F, face, w / 2, -2 + i * 4, 4.5, 1.1, 1.9, false); }
      gable(F, w, d, h, 2.6);
      for (let i = 0; i < 3; i++) {   // dormers on the outer slope
        const lx = -4.5 + i * 4.5; at(F, lx, h + 1.0, d / 4 + 0.35, (x, y, z) => b.box(1.5, 1.4, 1.6, mTrim, x, y, z, F.ry));
        win(frame(110, RD + 1.2 + 4.6), 'f', d / 4 + 1.17, lx, h + 0.45, 0.8, 0.95, false);
        at(F, lx, h + 1.85, d / 4 + 0.35, (x, y, z) => b.box(1.75, 0.12, 1.9, mSlate, x, y, z, F.ry));
      }
      for (const s of [-1, 1]) at(F, s * 5.5, h + 2.6, -1.3, (x, y, z) => { b.box(0.8, 1.8, 0.8, mWall, x, y, z, F.ry, 1.5); b.box(1.0, 0.15, 1.0, mTrim, x, y + 0.95, z, F.ry); for (const o of [-0.18, 0.18]) b.cyl(0.09, 0.11, 0.4, mPot, x + o, y + 1.2, z, 8); });
    }
    // Grand Staircase (by the portico): a tower with tall stair windows and a pointed slate roof
    {
      const F = frame(150, RD + 3.2), w = 3.5, d = 3.5, h = 10;   // clear of the portico's corner
      block(F, w, d, h);
      for (let i = 0; i < 3; i++) win(F, 'f', d / 2, 0, 1.4 + i * 2.9, 0.8, 2.1, true);
      for (const face of ['l', 'r']) win(F, face, w / 2, 0, 5.8, 0.8, 2.1, true);
      hip(F, w, d, h, 3.4, 0.02);
      at(F, 0, h + 3.6, 0, (x, y, z) => { b.sph(0.12, BRASS, x, y, z); b.cyl(0.02, 0.03, 0.8, BRASS, x, y + 0.45, z, 5); });
    }
    // Kitchen (east, towards the lake side): a working wing with a big chimney and a back door
    {
      link(250, 3.2, RD - 0.4, RD + 1.4, 3.8);
      const F = frame(250, RD + 1.2 + 4.1), w = 10.4, d = 8.2, h = 4.4;
      block(F, w, d, h, mWall, { pipes: 1 });
      win(F, 'f', d / 2, 2.0, 1.55, 3.2, 1.2, false);
      at(F, w / 2 + 0.03, 0.6, -2.7, (x, y, z) => { b.box(0.08, 2.2, 1.1, mPost, x, y + 1.1, z, F.ry); b.box(0.5, 0.15, 1.6, mStone, x, 0.62, z, F.ry); });
      gable(F, w, d, h, 2.2);
      at(F, 3.2, h + 1.6, -1.2, (x, y, z) => { b.box(1.2, 3.6, 1.0, M(0x8a4a38, 0.85, 0, { t: tex('tBrick', () => T.tiles({ base: '#8a4a38', grout: '#cbb8a0', n: 8, seed: 31 })), bump: 0.03 }), x, y, z, F.ry, 0.8); b.box(1.4, 0.2, 1.2, mTrim, x, y + 1.85, z, F.ry); });
    }
    // Archive (north-west): Opal's tall-windowed room under a hipped roof
    {
      link(305, 3.2, RD - 0.4, RD + 1.4, 3.9);
      const F = frame(305, RD + 1.2 + 4.6), w = 9.6, d = 9.2, h = 4.8;
      block(F, w, d, h, mWall, { pipes: 1 });
      win(F, 'f', d / 2, 1.4, 1.35, 2.2, 1.4, false);
      for (const u of [-2.4]) blind(F, 'f', d / 2, u, 1.0, 1.2, 2.6);
      for (const face of ['l', 'r']) for (let i = 0; i < 2; i++) blind(F, face, w / 2, -1.8 + i * 3.6, 1.0, 1.2, 2.6);
      hip(F, w, d, h, 2.0);
    }

    // ---- grounds: a gravel walk round the building, box hedges and flower borders along the wings, lamps
    const walk = new THREE.RingGeometry(RD + 0.5, 27, 64, 1, Math.PI - 0.45, Math.PI + 0.9); walk.rotateX(-Math.PI / 2);   // round the back and sides, not across the terrace terUV(walk, 14, 14);
    b.add(walk, mGravel, C[0], 0.003, C[1]);
    const boxM = M(0x3f5f34, 0.9, 0, { t: tex('tLeaf', terLeafTex), bump: 0.05 }), soilM = M(0x4a3626, 0.95);
    const FL = [0xd8506a, 0xf0d060, 0xffffff, 0x9070c8, 0xf08848].map(c => M(c, 0.8));
    const border = (a, r, len, u0 = 0) => {   // along the front of a wing: soil bed, flowers, clipped box behind
      const F = frame(a, r);
      at(F, u0, 0.08, 0, (x, y, z) => b.box(len, 0.16, 1.0, soilM, x, y, z, F.ry));
      at(F, u0, 0.4, -0.35, (x, y, z) => b.box(len, 0.6, 0.45, boxM, x, y, z, F.ry, 1.2));
      for (let i = 0; i < len * 4; i++) at(F, u0 - len / 2 + rr() * len, 0.22 + rr() * 0.08, 0.05 + rr() * 0.4, (x, y, z) => b.sph(0.06 + rr() * 0.04, FL[i % FL.length], x, y, z, 1, 5));
    };
    border(110, RD + 1.2 + 4.6 + 5.2, 14); border(250, RD + 1.2 + 4.1 + 4.7, 4.4, -2.7); border(305, RD + 1.2 + 4.6 + 5.2, 8.5); border(55, RD + 1.4 + 5.2 + 5.8, 12);
    // a ring of clipped cones and lamp posts round the walk
    for (let k = 0; k < 14; k++) {
      const a = k / 14 * 360 + 7; if (a > 120 && a < 240) continue;
      const [dx, dz] = dirOf(a), x = C[0] + dx * 26.2, z = C[1] + dz * 26.2;
      if (k % 2) { b.cyl(0.02, 0.55, 1.6, boxM, x, 0.95, z, 10); b.cyl(0.32, 0.36, 0.3, mStone, x, 0.15, z, 10); }
      else { b.lathe([[0.001, 0], [0.16, 0], [0.12, 0.12], [0.06, 0.3], [0.045, 2.6], [0.06, 2.65], [0.001, 2.66]], IRON, x, 0, z, 10); b.box(0.24, 0.32, 0.24, lampM, x, 2.84, z); b.cyl(0.02, 0.2, 0.18, IRON, x, 3.08, z, 4); }
    }
    // an armillary sphere on the lawn: the planetarium's sign to anyone walking up from the lake
    {
      const ax = 13.5, az = 4.5, ay = 1.55, mG = M(0xb08a50, 0.35, 0.9);
      b.lathe([[0.001, 0], [0.55, 0], [0.55, 0.18], [0.4, 0.24], [0.26, 0.4], [0.2, 1.0], [0.3, 1.08], [0.32, 1.14], [0.001, 1.14]], mStone, ax, 0, az, 20);
      b.cyl(0.04, 0.06, 0.2, mG, ax, 1.22, az, 8);
      for (const [rx, rz, r] of [[Math.PI / 2, 0, 0.4], [0, 0, 0.4], [0, Math.PI / 2, 0.4], [Math.PI / 2 - 0.41, 0, 0.36]]) b.add(new THREE.TorusGeometry(r, 0.018, 6, 40), mG, ax, ay, az, 0, rx, rz);
      b.add(new THREE.CylinderGeometry(0.012, 0.012, 1.05, 6), mG, ax, ay, az, 0, 0.41, 0);
      b.sph(0.07, BRASS, ax, ay, az, 1, 10);
    }
    // ivy: nine years closed, it has climbed the kitchen and archive walls and a corner of the west wing
    const ivyT = once('tIvy', () => { const c = T.canvas(256, 256), g = c.getContext('2d'), r = T.rng(91);
      for (let i = 0; i < 420; i++) { const y = 256 - Math.pow(r(), 0.7) * 256, x = 128 + (r() - .5) * (90 + (256 - y) * 0.7), s = 5 + r() * 7; g.fillStyle = ['#4f7a34', '#6a9440', '#3d6a2a', '#82a850', '#5a8a3a'][i % 5]; g.save(); g.translate(x, y); g.rotate(r() * 6); g.beginPath(); g.moveTo(0, -s); g.quadraticCurveTo(s, -s * .2, 0, s * .8); g.quadraticCurveTo(-s, -s * .2, 0, -s); g.fill(); g.restore(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; });
    const ivyM = new THREE.MeshStandardMaterial({ map: ivyT, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
    for (const [a, r, u, w, hh] of [[250, RD + 1.2 + 4.1 + 4.13, -4.4, 2.6, 4.2], [250, RD + 1.2 + 4.1 + 4.13, 4.6, 2.0, 3.0], [305, RD + 1.2 + 4.6 + 4.63, 3.8, 2.4, 4.4], [110, RD + 1.2 + 4.6 + 4.63, 7.2, 1.8, 5.5]]) {
      const F = frame(a, r); at(F, u, hh / 2, 0, (x, y, z) => b.add(new THREE.PlaneGeometry(w, hh), ivyM, x, y, z, F.ry));
    }
    // being made ready for Saturday: scaffolding, a ladder and paint pots against the kitchen wing
    {
      const F = frame(250, RD + 1.2 + 4.1 + 4.75), tube = M(0x9a9ea4, 0.4, 0.8), plank = M(0x9a7a50, 0.85);
      for (const u of [0.7, 3.7]) for (const zz of [-0.25, 0.55]) at(F, u, 2.3, zz, (x, y, z) => b.cyl(0.03, 0.03, 4.6, tube, x, y, z, 6));
      for (const yy of [1.5, 3.0, 4.4]) { at(F, 2.2, yy, 0.15, (x, y, z) => b.box(3.2, 0.05, 0.9, plank, x, y, z, F.ry)); for (const zz of [-0.25, 0.55]) at(F, 2.2, yy + 0.5, zz, (x, y, z) => b.box(3.1, 0.04, 0.04, tube, x, y, z, F.ry)); }
      for (const o of [-0.22, 0.22]) at(F, 4.4 + o, 1.5, 0.75, (x, y, z) => b.box(0.05, 3.1, 0.05, plank, x, y, z, F.ry, 0, -0.18));
      for (let k = 0; k < 9; k++) at(F, 4.4, 0.25 + k * 0.32, 0.98 - k * 0.32 * 0.18, (x, y, z) => b.box(0.44, 0.04, 0.04, plank, x, y, z, F.ry));
      for (const [u, c] of [[1.4, 0], [2.5, 1]]) at(F, u, 0.18, 0.9, (x, y, z) => { b.cyl(0.13, 0.12, 0.26, mPaint[c], x, y, z, 10); b.cyl(0.135, 0.135, 0.02, mTin, x, y + 0.14, z, 10); });
    }
    // the gala banner between the portico columns, and a sign at the foot of the steps
    {
      const banT = once('tBanner', () => T.textCanvas(512, 160, (g, w, h) => {
        g.fillStyle = '#2a1e46'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d8b060'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
        g.fillStyle = '#e8d5a0'; g.textAlign = 'center'; g.font = '600 44px Cinzel, Georgia, serif'; g.fillText('GRAND REOPENING', w / 2, 72);
        g.font = 'italic 30px "EB Garamond", Georgia, serif'; g.fillText('The Starfall Gala  ·  Saturday', w / 2, 122);
      }));
      const bm = new THREE.MeshLambertMaterial({ map: banT, side: THREE.DoubleSide });
      const bg = new THREE.PlaneGeometry(2.6, 0.82, 12, 1), pa_ = bg.attributes.position; for (let i = 0; i < pa_.count; i++) pa_.setZ(i, Math.sin((pa_.getX(i) / 2.6 + .5) * Math.PI) * -0.06); bg.computeVertexNormals();
      const ban = add(R.g, bg, bm, 0, 4.15, 6.05); ban.rotation.y = Math.PI; ban.userData.nocast = 1;
      for (const sx of [-1.3, 1.3]) b.cyl(0.008, 0.008, 0.5, IRON, sx, 4.65, 6.05, 4);
      const sgT = once('tEntrance', () => T.textCanvas(512, 256, (g, w, h) => {
        g.fillStyle = '#efe6cf'; g.fillRect(0, 0, w, h); g.strokeStyle = '#3a2a18'; g.lineWidth = 5; g.strokeRect(14, 14, w - 28, h - 28);
        g.fillStyle = '#2e2214'; g.textAlign = 'center'; g.font = '600 52px Cinzel, Georgia, serif'; g.fillText('THE AQUADOME', w / 2, 92);
        g.font = 'italic 30px "EB Garamond", Georgia, serif'; g.fillText('Lakeshore Spa & Planetarium', w / 2, 146); g.font = '24px Cinzel, Georgia, serif'; g.fillText('EST. 2003', w / 2, 200);
      }));
      const sx = 5.6, sz = 4.6, sm = new THREE.MeshLambertMaterial({ map: sgT });
      for (const o of [-0.75, 0.75]) b.box(0.1, 1.5, 0.1, mPost, sx + o, 0.75, sz);
      const sg = add(R.g, new THREE.PlaneGeometry(1.5, 0.75), sm, sx, 1.1, sz - 0.06); sg.rotation.y = Math.PI; sg.userData.nocast = 1;
      b.box(1.62, 0.84, 0.06, mPost, sx, 1.1, sz); b.box(1.8, 0.1, 0.16, mPost, sx, 1.56, sz);
    }
  }
  b.flush(R.g);
  lamps(R, [0, 3, -4, 0xffc890, 10, 14], [4, 2.5, -12, 0xffc890, 6, 10]);
  return R;
}


// ---------- Collectible postcards from 2003 (optional) ----------
export const POSTCARDS = [
  [1, 'lobby', [-6.5, 0.51, -2.45], 0.4], [2, 'spa', [-5.3, 0.345, 3.8], 1.2], [3, 'kitchen', [-3.6, 0.976, -3.45], 0.2], [4, 'tech', [-3.6, 1.306, -3.3], 2.3],
  [5, 'archive', [3.25, 0.906, 1.45], 0.7], [6, 'wing', [1.15, 0.94, -6.2], 1.9], [7, 'terrace', [-4.5, 0.47, 1.5], 0.3], [8, 'plan', [1.2, 0.02, 2.6], 2.6],
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

export function rebuildEnv(renderer) { envDay = envMap(renderer, false); envNight = envMap(renderer, true); applyTime(); }

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
  // each window shows what its wing faces outside (see the terrace's model of the building): the grounds, or the lake
  for (const k in rooms) for (const m of rooms[k].skyMats) { const v = m.userData.view; m.map = v ? once('view:' + v + (n ? ':n' : ':d'), () => T.view(v, n, n ? texNight : texDay)) : n ? texNight : texDay; m.needsUpdate = true; }
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
  rooms.terrace.domeGlow.emissiveIntensity = night() ? 0.8 : 0; rooms.terrace.winGlow.emissiveIntensity = night() ? 1.4 : 0; rooms.terrace.wingGlass.emissiveIntensity = night() ? 0.9 : 0; rooms.terrace.bhGlass.emissiveIntensity = night() ? 1.3 : 0;   // someone's in the boathouse at night
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
