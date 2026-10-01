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
    const dirty = rnd() < 0.18, sh = 0.88 + rnd() * 0.24, a0 = dirty ? 0.52 + rnd() * 0.15 : 0.34 + rnd() * 0.16;
    const col = dirty ? [0.46 * sh, 0.45 * sh, 0.38 * sh] : [0.45 * sh, 0.66 * sh, 0.88 * sh];
    const th0 = (i + 0.06) / nm * Math.PI * 2, th1 = (i + 0.94) / nm * Math.PI * 2, p0 = phis[j] + 0.012, p1 = phis[j + 1] - 0.012, SX = 2;
    const base = P.length / 3;
    for (let ky = 0; ky <= 1; ky++) for (let kx = 0; kx <= SX; kx++) {
      const th = th0 + (th1 - th0) * kx / SX, ph = p0 + (p1 - p0) * ky, p = pos(th, ph);
      P.push(p[0], p[1], p[2]); N.push(-p[0] / R, -(p[1] - cy) / R, -p[2] / R);
      C.push(col[0], col[1], col[2], Math.min(0.8, a0 + (ky === 0 ? 0.1 : 0)));
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
  const k = 98.5, C = 512, GOLD = '#b6903f', DG = '#34503f', BR = '#74502e', CR = '#f0e8d4';
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
  for (let i = 0; i < 8; i++) spike(i / 8 * Math.PI * 2 + Math.PI / 8, 3.35, 4.0, 0.06);
  for (let i = 0; i < 8; i++) spike(i / 8 * Math.PI * 2, 3.35, i % 2 ? 4.45 : 4.72, i % 2 ? 0.075 : 0.095);
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
  const wp = M(0xffffff, 0.85, 0, { t: TX.damask(), rep: [48, 3.6], bump: 0.01 }); wp.side = THREE.BackSide;
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
  const crt = new THREE.Group(); crt.position.set(0.6, 1.05, -0.12); crt.rotation.y = Math.PI; dk.add(crt);
  const beige = M(0xd8cfb8, 0.6);
  box(crt, 0.42, 0.36, 0.38, beige, 0, 0.2, 0); box(crt, 0.3, 0.26, 0.2, beige, 0, 0.18, -0.25);
  box(crt, 0.34, 0.26, 0.01, M(0x10181a, 0.2, 0, { emissive: 0x16302a, emissiveIntensity: 0.6 }), 0, 0.21, 0.195);
  box(dk, 0.44, 0.03, 0.16, beige, 0.6, 1.06, 0.12);
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
