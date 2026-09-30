// The Aquadome, modelled in code. Every room is a Group at the origin; only the
// current room is visible. Things you can click carry userData.hot (hotspot id),
// userData.who (a character) or userData.go (a walk arrow to another node).
import * as THREE from 'three';
import { S, has, night } from './state.js';

export const rooms = {};
export const chars = {};
let scene, skyMat, hemi, sun, texDay, texNight;
const updaters = [];

// ---------- Nodes (camera spots) ----------
// p = [x, z] on the floor, look = [x, z] the default thing to face when you arrive.
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
};

// ---------- Materials ----------
const mStd = (c, r = 0.45, m = 0, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...o });
const mGloss = (c, o = {}) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, ...o });
const CHROME = mStd(0xe4ebf2, 0.12, 1);
const GOLD = mStd(0xffc95c, 0.22, 1);
const WHITE = mGloss(0xf7fbff);
const GLASS = new THREE.MeshPhysicalMaterial({ color: 0xd6f3ff, roughness: 0.04, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1 });
const CEIL = mStd(0xf4f8fb, 0.9);
const HIT = new THREE.MeshBasicMaterial({ visible: false });

// ---------- Canvas textures ----------
function ctex(w, h, draw, rep) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

function tiles(a, b, grout, n = 4, rep) {
  return ctex(256, 256, (g, w) => {
    const s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = (i + j) % 2 ? a : b; g.fillRect(i * s, j * s, s, s);
      const gr = g.createLinearGradient(i * s, j * s, i * s + s, j * s + s);
      gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(i * s, j * s, s, s);
    }
    g.strokeStyle = grout; g.lineWidth = 3;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, w); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
  }, rep);
}

function wallTex(base, band, rep) {
  return ctex(256, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,160,190,.25)'; g.lineWidth = 2;
    for (let y = 0; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let x = 0; x < w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    const gr = g.createLinearGradient(0, h * 0.72, 0, h);
    gr.addColorStop(0, band); gr.addColorStop(1, shade(band, -30));
    g.fillStyle = gr; g.fillRect(0, h * 0.74, w, h * 0.26);
    g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(0, h * 0.74, w, 5);
  }, rep);
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = k => Math.max(0, Math.min(255, ((n >> k) & 255) + amt));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

function skyTex(isNight) {
  return ctex(1024, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    if (!isNight) {
      gr.addColorStop(0, '#2f8fea'); gr.addColorStop(0.32, '#7cc9ff'); gr.addColorStop(0.49, '#e9fbff');
      gr.addColorStop(0.52, '#b9ec8e'); gr.addColorStop(1, '#4f9e3a');
    } else {
      gr.addColorStop(0, '#070a26'); gr.addColorStop(0.35, '#1d1f5c'); gr.addColorStop(0.49, '#5b3f8f');
      gr.addColorStop(0.52, '#1c2a3a'); gr.addColorStop(1, '#0a1218');
    }
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    if (!isNight) {
      for (let i = 0; i < 26; i++) {
        const x = rnd() * w, y = h * (0.12 + rnd() * 0.3), r = 18 + rnd() * 40;
        for (let k = 0; k < 6; k++) {
          const cg = g.createRadialGradient(x + k * r * 0.6, y + Math.sin(k) * 8, 0, x + k * r * 0.6, y, r);
          cg.addColorStop(0, 'rgba(255,255,255,.85)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = cg; g.beginPath(); g.arc(x + k * r * 0.6, y, r, 0, 7); g.fill();
        }
      }
    } else {
      for (let i = 0; i < 700; i++) {
        g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`;
        g.fillRect(rnd() * w, rnd() * h * 0.5, rnd() < 0.1 ? 2 : 1, rnd() < 0.1 ? 2 : 1);
      }
      g.fillStyle = '#fff8dc'; g.beginPath(); g.arc(w * 0.7, h * 0.18, 16, 0, 7); g.fill();
    }
  });
}

function starDomeTex(pastel) {
  return ctex(2048, 1024, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    if (pastel) { gr.addColorStop(0, '#2a1250'); gr.addColorStop(1, '#6a3aa0'); }
    else { gr.addColorStop(0, '#02030d'); gr.addColorStop(1, '#101a44'); }
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const y = rnd() * h * 0.92;
      g.fillStyle = `rgba(${200 + rnd() * 55},${210 + rnd() * 45},255,${0.25 + rnd() * 0.75})`;
      const s = rnd() < 0.04 ? 3 : rnd() < 0.2 ? 2 : 1;
      g.fillRect(rnd() * w, y, s, s);
    }
    // soft nebula
    for (let i = 0; i < 9; i++) {
      const x = rnd() * w, y = rnd() * h * 0.85, r = 120 + rnd() * 200;
      const cg = g.createRadialGradient(x, y, 0, x, y, r);
      cg.addColorStop(0, pastel ? 'rgba(255,140,220,.25)' : 'rgba(80,140,255,.16)');
      cg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = cg; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    if (pastel) {
      g.strokeStyle = 'rgba(255,230,160,.8)'; g.lineWidth = 3;
      for (let c = 0; c < 7; c++) {
        let x = rnd() * w, y = 80 + rnd() * h * 0.7;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 160; y += (rnd() - 0.5) * 90; g.lineTo(x, y); g.fillStyle = '#fff3c4'; g.fillRect(x - 4, y - 4, 8, 8); }
        g.stroke();
      }
    }
  });
}

function labelTex(text, bg = '#1aa6d9', fg = '#fff', w = 512, h = 128) {
  return ctex(w, h, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, shade(bg, 50)); gr.addColorStop(0.5, bg); gr.addColorStop(1, shade(bg, -35));
    g.fillStyle = gr; rrect(g, 4, 4, w - 8, h - 8, h / 2 - 4); g.fill();
    g.fillStyle = 'rgba(255,255,255,.45)'; rrect(g, 18, 10, w - 36, h * 0.36, h * 0.18); g.fill();
    g.fillStyle = fg; g.font = `800 ${Math.round(h * 0.46)}px Nunito, Arial Rounded MT Bold, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,40,80,.5)'; g.shadowBlur = 6;
    g.fillText(text, w / 2, h / 2 + 4);
  });
}

function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function causticTex() {
  return ctex(256, 256, (g, w, h) => {
    g.fillStyle = '#2cc4e8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(230,255,255,.55)'; g.lineWidth = 3;
    for (let i = 0; i < 40; i++) {
      g.beginPath();
      let x = rnd() * w, y = rnd() * h;
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
  }, [3, 3]);
}

function screenTex(kind) {
  return ctex(512, 384, (g, w, h) => {
    if (kind === 'aqua') {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#3fa9f5'); gr.addColorStop(0.6, '#bff0ff'); gr.addColorStop(1, '#79d86a');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) {
        const x = rnd() * w, y = rnd() * h * 0.7, r = 12 + rnd() * 40;
        const cg = g.createRadialGradient(x - r / 3, y - r / 3, 1, x, y, r);
        cg.addColorStop(0, 'rgba(255,255,255,.9)'); cg.addColorStop(0.6, 'rgba(255,255,255,.2)'); cg.addColorStop(1, 'rgba(255,255,255,.45)');
        g.fillStyle = cg; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
      g.fillStyle = '#fff'; g.font = '800 44px Nunito, sans-serif'; g.textAlign = 'center';
      g.shadowColor = 'rgba(0,60,120,.6)'; g.shadowBlur = 10;
      g.fillText('AquaOS', w / 2, h / 2); g.font = '700 20px Nunito, sans-serif'; g.fillText('Click to log in', w / 2, h / 2 + 36);
    } else {
      g.fillStyle = '#031a10'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#39ff9c'; g.font = '18px monospace';
      for (let y = 24; y < h; y += 24) g.fillText(Array.from({ length: 30 }, () => '01ABCDEF'[Math.floor(rnd() * 8)]).join(''), 12, y);
    }
  });
}

// ---------- Geometry helpers ----------
function add(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
const box = (p, w, h, d, mat, x, y, z) => add(p, new THREE.BoxGeometry(w, h, d), mat, x, y, z);
const cyl = (p, rt, rb, h, mat, x, y, z, seg = 32) => add(p, new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z);
const sph = (p, r, mat, x, y, z, seg = 24) => add(p, new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), mat, x, y, z);

function starShape(r1, r2) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? r2 : r1;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  return s;
}
function star3(p, r, mat, x, y, z, depth = 0.04) {
  const g = new THREE.ExtrudeGeometry(starShape(r, r * 0.45), { depth, bevelEnabled: true, bevelSize: depth * 0.4, bevelThickness: depth * 0.4, bevelSegments: 2 });
  g.center();
  return add(p, g, mat, x, y, z);
}

function hit(p, x, y, z, r, hot, name) {
  const m = add(p, new THREE.SphereGeometry(r, 8, 6), HIT, x, y, z);
  m.userData.hot = hot; m.userData.name = name;
  return m;
}
function tag(o, hot, name) { o.userData.hot = hot; o.userData.name = name; return o; }
function faceTo(o, x, z) { o.rotation.y = Math.atan2(x - o.position.x, z - o.position.z); }

function plant(p, x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); p.add(g);
  cyl(g, 0.34, 0.26, 0.55, WHITE, 0, 0.275, 0);
  const leaf = mGloss(0x4fcf4a), leaf2 = mGloss(0x2ea84a);
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4, r = i ? 0.22 : 0;
    sph(g, 0.26 + (i % 3) * 0.05, i % 2 ? leaf : leaf2, Math.cos(a) * r, 0.85 + (i % 3) * 0.2, Math.sin(a) * r, 16);
  }
  return g;
}

function door(R, x, z, label, hot, color = '#1aa6d9', face = [0, 0]) {
  const g = new THREE.Group(); g.position.set(x, 0, z); faceTo(g, face[0], face[1]); R.g.add(g);
  const frame = CHROME;
  box(g, 0.12, 2.5, 0.16, frame, -0.76, 1.25, 0); box(g, 0.12, 2.5, 0.16, frame, 0.76, 1.25, 0);
  box(g, 1.64, 0.12, 0.16, frame, 0, 2.5, 0);
  const leaf = mGloss(new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.25));
  box(g, 1.4, 2.42, 0.06, leaf, 0, 1.23, 0);
  const port = cyl(g, 0.24, 0.24, 0.08, GLASS, 0, 1.65, 0.02); port.rotation.x = Math.PI / 2;
  const ring = add(g, new THREE.TorusGeometry(0.25, 0.035, 8, 24), frame, 0, 1.65, 0.05);
  const handle = cyl(g, 0.03, 0.03, 0.5, frame, 0.5, 1.1, 0.08); handle.userData.k = ring;
  const sign = add(g, new THREE.PlaneGeometry(1.5, 0.375), new THREE.MeshBasicMaterial({ map: labelTex(label, color), transparent: true }), 0, 2.85, 0.02);
  sign.userData.k = 1;
  tag(g, hot, label);
  return g;
}

function skyWindow(R, w, h, x, y, z, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; R.g.add(g);
  const m = new THREE.MeshBasicMaterial({ map: texDay });
  const pane = add(g, new THREE.PlaneGeometry(w, h), m, 0, 0, 0);
  pane.userData.sky = 1;
  R.skyMats.push(m);
  const cols = Math.max(2, Math.round(w / 1.6));
  for (let i = 0; i <= cols; i++) box(g, 0.08, h + 0.1, 0.1, CHROME, -w / 2 + (i * w) / cols, 0, 0.05);
  box(g, w + 0.1, 0.08, 0.1, CHROME, 0, h / 2, 0.05); box(g, w + 0.1, 0.08, 0.1, CHROME, 0, -h / 2, 0.05);
  box(g, w + 0.2, 0.08, 0.3, WHITE, 0, -h / 2 - 0.04, 0.15);
  return g;
}

function mkRoom(id) {
  const g = new THREE.Group(); g.visible = false; g.name = id;
  scene.add(g);
  const R = { id, g, skyMats: [], lamps: [] };
  rooms[id] = R;
  return R;
}

// Every room gets exactly two point lights so switching rooms never changes the
// light count (which would recompile shaders).
function lamps(R, a, b) {
  for (const [x, y, z, c, i, d] of [a, b]) {
    const l = new THREE.PointLight(c, i, d, 1.6); l.position.set(x, y, z); R.g.add(l);
    l.userData.base = i; R.lamps.push(l);
  }
}

function rectRoom(R, x0, x1, z0, z1, h, floorMat, wallMat, ceilMat) {
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const f = add(R.g, new THREE.PlaneGeometry(w, d), floorMat, cx, 0, cz); f.rotation.x = -Math.PI / 2;
  const c = add(R.g, new THREE.PlaneGeometry(w, d), ceilMat || CEIL, cx, h, cz); c.rotation.x = Math.PI / 2;
  const wall = (len, x, z, ry) => { const m = add(R.g, new THREE.PlaneGeometry(len, h), wallMat, x, h / 2, z); m.rotation.y = ry; };
  wall(w, cx, z0, 0); wall(w, cx, z1, Math.PI); wall(d, x0, cz, Math.PI / 2); wall(d, x1, cz, -Math.PI / 2);
  // skirting
  const sk = mStd(0xffffff, 0.3);
  box(R.g, w, 0.14, 0.04, sk, cx, 0.07, z0 + 0.02); box(R.g, w, 0.14, 0.04, sk, cx, 0.07, z1 - 0.02);
  box(R.g, 0.04, 0.14, d, sk, x0 + 0.02, 0.07, cz); box(R.g, 0.04, 0.14, d, sk, x1 - 0.02, 0.07, cz);
}

// ---------- Characters ----------
const SKIN = { vesper: 0xf2d0bd, cherry: 0x8a5a3c, dex: 0xe0b08e, juniper: 0x5e3b27, opal: 0xf0d6c8 };

function figure(who) {
  const g = new THREE.Group(); g.userData.who = who;
  const body = new THREE.Group(); g.add(body); g.userData.body = body;
  const skin = mStd(SKIN[who], 0.55);
  const P = {
    vesper: { top: mGloss(0xcfd8e6, { metalness: 0.6, roughness: 0.2 }), leg: mGloss(0xcfd8e6, { metalness: 0.6 }), hair: mGloss(0xfff3dc), dress: 1 },
    cherry: { top: mGloss(0xff4fa3), leg: mGloss(0xff9ad0), hair: mGloss(0xe0232e), boots: mGloss(0xffffff) },
    dex: { top: mStd(0x19b4b8, 0.8), leg: mStd(0x3b5a8a, 0.8), hair: mStd(0x2a1d16, 0.9), shoes: mStd(0xffffff, 0.6) },
    juniper: { top: mStd(0xfbfbf5, 0.7), leg: mStd(0x3a3a44, 0.8), hair: mStd(0x1c120c, 0.9), apron: mStd(0x6dc04b, 0.7) },
    opal: { top: mStd(0xb9a6e6, 0.75), leg: mStd(0x4a4262, 0.8), hair: mStd(0xc9ccd6, 0.7) },
  }[who];
  const shoe = P.boots || P.shoes || mStd(0x2a2230, 0.5);
  // legs
  for (const s of [-1, 1]) {
    add(body, new THREE.CapsuleGeometry(0.075, 0.62, 4, 12), P.leg, s * 0.11, 0.45, 0);
    const sh = add(body, new THREE.CapsuleGeometry(P.boots ? 0.1 : 0.08, P.boots ? 0.18 : 0.08, 4, 12), shoe, s * 0.11, P.boots ? 0.14 : 0.08, 0.05);
    sh.rotation.x = P.boots ? 0 : Math.PI / 2;
  }
  // torso
  if (P.dress) {
    const pts = [[0.36, 0], [0.3, 0.3], [0.2, 0.75], [0.15, 0.95], [0.19, 1.2], [0.17, 1.38], [0.07, 1.46]].map(([r, y]) => new THREE.Vector2(r, y));
    add(body, new THREE.LatheGeometry(pts, 32), P.top, 0, 0.02, 0);
    for (const s of [-1, 1]) sph(body, 0.12, P.top, s * 0.23, 1.38, 0, 16);
  } else {
    add(body, new THREE.CapsuleGeometry(0.2, 0.42, 6, 18), P.top, 0, 1.12, 0).scale.set(1, 1, 0.75);
    if (who === 'cherry') add(body, new THREE.ConeGeometry(0.34, 0.36, 24, 1, true), P.top, 0, 0.84, 0).rotation.x = Math.PI;
    if (P.apron) box(body, 0.34, 0.6, 0.02, P.apron, 0, 0.92, 0.16);
    if (who === 'opal') add(body, new THREE.CylinderGeometry(0.22, 0.3, 0.7, 24, 1, true), P.top, 0, 0.68, 0);
  }
  // arms
  for (const s of [-1, 1]) {
    const a = add(body, new THREE.CapsuleGeometry(0.06, 0.5, 4, 12), P.dress ? skin : P.top, s * 0.27, 1.08, 0);
    a.rotation.z = s * 0.14;
    sph(body, 0.065, skin, s * 0.31, 0.78, 0, 12);
  }
  // head
  const head = new THREE.Group(); head.position.y = 1.62; body.add(head); g.userData.head = head;
  add(head, new THREE.CylinderGeometry(0.06, 0.07, 0.14, 12), skin, 0, -0.14, 0);
  const hd = sph(head, 0.17, skin, 0, 0.02, 0, 28); hd.scale.set(0.92, 1.08, 0.95);
  const eyeW = mGloss(0xffffff), eyeB = mGloss(0x1c1430);
  for (const s of [-1, 1]) {
    const e = sph(head, 0.032, eyeW, s * 0.062, 0.04, 0.145, 12); e.scale.z = 0.5;
    sph(head, 0.019, eyeB, s * 0.062, 0.04, 0.162, 10);
  }
  const mouth = add(head, new THREE.TorusGeometry(0.035, 0.008, 6, 12, Math.PI), mStd(0xb0324a, 0.4), 0, -0.05, 0.155);
  mouth.rotation.z = Math.PI;
  // hair and extras
  const H = P.hair;
  if (who === 'vesper') {
    for (let i = 0; i < 9; i++) { const a = i * 0.8; sph(head, 0.13, H, Math.cos(a) * 0.14, 0.12 + (i % 3) * 0.06, Math.sin(a) * 0.1 - 0.05, 16); }
    sph(head, 0.2, H, 0, 0.14, -0.05, 20).scale.set(1.2, 1, 1);
    const sg = mGloss(0x151020, { metalness: 0.5 });
    box(head, 0.3, 0.07, 0.03, sg, 0, 0.045, 0.165);
    for (const s of [-1, 1]) { const e = sph(head, 0.03, CHROME, s * 0.19, -0.06, 0, 10); e.scale.y = 1.6; }
  } else if (who === 'cherry') {
    sph(head, 0.18, H, 0, 0.1, -0.02, 20);
    sph(head, 0.16, H, 0, 0.3, -0.03, 20);
    sph(head, 0.12, H, 0, 0.46, -0.03, 18);
    star3(head, 0.06, GOLD, 0.1, 0.4, 0.1, 0.02);
    for (const s of [-1, 1]) box(head, 0.06, 0.012, 0.01, eyeB, s * 0.062, 0.078, 0.16);
  } else if (who === 'dex') {
    const cap = sph(head, 0.18, H, 0, 0.07, -0.02, 20); cap.scale.set(1, 0.7, 1);
    const band = add(head, new THREE.TorusGeometry(0.19, 0.022, 8, 24, Math.PI), mStd(0x303848, 0.4), 0, 0.02, 0);
    for (const s of [-1, 1]) { const c = cyl(head, 0.07, 0.07, 0.05, mGloss(0x19b4b8), s * 0.19, 0.0, 0); c.rotation.z = Math.PI / 2; }
    band.rotation.z = 0;
    for (const s of [-1, 1]) add(head, new THREE.TorusGeometry(0.04, 0.008, 6, 16), mStd(0x202020, 0.3), s * 0.062, 0.04, 0.17);
  } else if (who === 'juniper') {
    const sc = sph(head, 0.185, P.apron, 0, 0.08, -0.02, 20); sc.scale.set(1, 0.75, 1);
    sph(head, 0.1, H, 0, 0.12, -0.2, 14);
    for (const s of [-1, 1]) sph(head, 0.022, GOLD, s * 0.16, -0.05, 0, 8);
  } else if (who === 'opal') {
    const b = sph(head, 0.2, H, 0, 0.02, -0.03, 22); b.scale.set(1.05, 0.95, 1);
    box(head, 0.3, 0.06, 0.08, H, 0, 0.12, 0.13);
    for (const s of [-1, 1]) add(head, new THREE.TorusGeometry(0.045, 0.009, 6, 16), GOLD, s * 0.064, 0.04, 0.17);
    // her brooch hole: the pin is missing from the lapel (a tiny empty ring)
    add(body, new THREE.TorusGeometry(0.03, 0.006, 6, 14), GOLD, 0.1, 1.3, 0.155);
  }
  const hb = add(g, new THREE.CylinderGeometry(0.34, 0.34, 1.95, 10), HIT, 0, 0.97, 0);
  hb.userData.who = who;
  g.userData.t = Math.random() * 10;
  return g;
}

function crown(p, x, y, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); p.add(g);
  add(g, new THREE.CylinderGeometry(0.2, 0.18, 0.1, 32, 1, true), CHROME, 0, 0.05, 0).material.side = THREE.DoubleSide;
  add(g, new THREE.TorusGeometry(0.19, 0.018, 8, 32), CHROME, 0, 0.01, 0).rotation.x = Math.PI / 2;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    add(g, new THREE.ConeGeometry(0.035, 0.14, 12), CHROME, Math.cos(a) * 0.19, 0.17, Math.sin(a) * 0.19);
    sph(g, 0.02, mGloss(i % 2 ? 0x7fe8ff : 0xff7fd0, { emissive: i % 2 ? 0x2090b0 : 0xb03080, emissiveIntensity: 0.6 }), Math.cos(a) * 0.19, 0.25, Math.sin(a) * 0.19, 10);
  }
  const st = star3(g, 0.09, mGloss(0x6a5a9a, { metalness: 0.7, roughness: 0.25, emissive: 0x6040c0, emissiveIntensity: 0.5, iridescence: 1 }), 0, 0.2, 0.2, 0.03);
  st.userData.spin = 1;
  return g;
}

// ---------- Rooms ----------
function buildLobby() {
  const R = mkRoom('lobby');
  const floorT = ctex(1024, 1024, (g, w) => {
    g.fillStyle = '#f4fbff'; g.fillRect(0, 0, w, w);
    const c = w / 2;
    for (let r = 480; r > 60; r -= 55) {
      g.strokeStyle = r % 110 < 55 ? '#38c3e8' : '#9fe3f7'; g.lineWidth = 10;
      g.beginPath(); g.arc(c, c, r, 0, 7); g.stroke();
    }
    g.strokeStyle = 'rgba(130,190,220,.35)'; g.lineWidth = 3;
    for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; g.beginPath(); g.moveTo(c + Math.cos(a) * 60, c + Math.sin(a) * 60); g.lineTo(c + Math.cos(a) * 512, c + Math.sin(a) * 512); g.stroke(); }
  });
  const fl = add(R.g, new THREE.CircleGeometry(9, 64), mStd(0xffffff, 0.22, 0, { map: floorT }), 0, 0, 0);
  fl.rotation.x = -Math.PI / 2;
  const wall = add(R.g, new THREE.CylinderGeometry(9, 9, 4.2, 64, 1, true), mStd(0xffffff, 0.4, 0, { map: wallTex('#f4fbff', '#27b5de', [10, 1]), side: THREE.BackSide }), 0, 2.1, 0);
  wall.userData.k = 1;
  add(R.g, new THREE.SphereGeometry(9, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), GLASS, 0, 4.2, 0);
  for (let i = 0; i < 6; i++) {
    const rib = add(R.g, new THREE.TorusGeometry(9, 0.05, 6, 64, Math.PI), CHROME, 0, 4.2, 0);
    rib.rotation.y = (i / 6) * Math.PI;
  }
  add(R.g, new THREE.TorusGeometry(9, 0.1, 8, 64), CHROME, 0, 4.2, 0).rotation.x = Math.PI / 2;
  add(R.g, new THREE.TorusGeometry(5.8, 0.06, 6, 64), CHROME, 0, 7.2, 0).rotation.x = Math.PI / 2;

  // fountain
  cyl(R.g, 1.95, 2.05, 0.55, WHITE, 0, 0.275, 0, 48);
  add(R.g, new THREE.TorusGeometry(1.95, 0.08, 10, 48), mGloss(0x27b5de), 0, 0.55, 0).rotation.x = Math.PI / 2;
  const water = add(R.g, new THREE.CircleGeometry(1.88, 48), mStd(0x46cff0, 0.25, 0, { map: causticTex(), transparent: true, opacity: 0.92 }), 0, 0.565, 0);
  water.rotation.x = -Math.PI / 2;
  updaters.push((dt, t) => { water.material.map.offset.set(Math.sin(t * 0.3) * 0.2, t * 0.03); });
  cyl(R.g, 0.14, 0.2, 1.6, CHROME, 0, 1.2, 0);
  add(R.g, new THREE.LatheGeometry([[0.05, 0], [0.5, 0.12], [0.62, 0.3], [0.58, 0.32], [0.45, 0.16], [0.05, 0.1]].map(([a, b]) => new THREE.Vector2(a, b)), 32), CHROME, 0, 1.75, 0);
  const orb = sph(R.g, 0.36, mGloss(0x3fd0f5, { transmission: 0, transparent: true, opacity: 0.85, emissive: 0x0a6f96, emissiveIntensity: 0.4 }), 0, 2.4, 0, 32);
  updaters.push((dt, t) => { orb.position.y = 2.4 + Math.sin(t * 1.3) * 0.06; });
  // rising bubbles
  const bm = mGloss(0xe8fbff, { transparent: true, opacity: 0.45, depthWrite: false });
  const bub = [];
  for (let i = 0; i < 18; i++) {
    const b = sph(R.g, 0.05 + rnd() * 0.09, bm, 0, 0, 0, 14);
    b.userData.a = rnd() * 6.3; b.userData.r = 0.3 + rnd() * 1.3; b.userData.v = 0.25 + rnd() * 0.35; b.userData.y = rnd() * 4;
    bub.push(b);
  }
  updaters.push((dt, t) => {
    for (const b of bub) {
      const u = b.userData; u.y += u.v * dt; if (u.y > 4.5) u.y = 0.6;
      b.position.set(Math.cos(u.a + t * 0.2) * u.r, u.y, Math.sin(u.a + t * 0.2) * u.r);
    }
  });
  // plaque on the basin
  const plaque = add(R.g, new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshStandardMaterial({ map: labelTex('Est. 2003', '#c99a2e'), metalness: 0.6, roughness: 0.3 }), 0, 0.3, 2.06);
  tag(plaque, 'plaque', 'Brass plaque');

  // the empty display case
  const cs = new THREE.Group(); cs.position.set(-4.2, 0, 3.2); faceTo(cs, 0, 6); R.g.add(cs);
  box(cs, 0.8, 1.05, 0.8, WHITE, 0, 0.525, 0);
  box(cs, 0.84, 0.05, 0.84, CHROME, 0, 1.06, 0);
  box(cs, 0.84, 0.05, 0.84, CHROME, 0, 0.03, 0);
  box(cs, 0.5, 0.08, 0.5, mStd(0xc2185b, 0.8), 0, 1.12, 0);
  const lid = box(cs, 0.74, 0.62, 0.74, GLASS, 0, 1.4, 0);
  lid.rotation.z = 0.05;
  const kp = box(cs, 0.2, 0.26, 0.03, mGloss(0x1d2a44), 0.2, 0.75, 0.415);
  for (let i = 0; i < 9; i++) box(cs, 0.04, 0.04, 0.02, mGloss(0x7fe8ff, { emissive: 0x2ab0d0, emissiveIntensity: 0.5 }), 0.14 + (i % 3) * 0.06, 0.8 - Math.floor(i / 3) * 0.06, 0.43);
  for (const s of [-1, 1]) { cyl(cs, 0.04, 0.05, 0.95, CHROME, s * 0.8, 0.475, 0.6); sph(cs, 0.07, CHROME, s * 0.8, 0.98, 0.6, 12); }
  const rope = add(cs, new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.8, 0.92, 0.6), new THREE.Vector3(0, 0.6, 0.64), new THREE.Vector3(0.8, 0.92, 0.6)), 20, 0.025, 8), mStd(0xc2185b, 0.6));
  rope.userData.k = 1;
  tag(cs, 'case', 'Display case');

  // the brass star pin on the floor
  const pin = new THREE.Group(); pin.position.set(-3.55, 0.015, 4.15); R.g.add(pin);
  const ps = star3(pin, 0.05, GOLD, 0, 0, 0, 0.012); ps.rotation.x = -Math.PI / 2;
  hit(pin, 0, 0.1, 0, 0.3, 'pin', 'Something shiny');
  R.pin = pin;

  // reception desk with a translucent all-in-one computer
  const dk = new THREE.Group(); dk.position.set(4.2, 0, 3.2); faceTo(dk, 0, 0); R.g.add(dk);
  box(dk, 2.4, 1.05, 0.7, WHITE, 0, 0.525, 0);
  box(dk, 2.42, 0.18, 0.72, mGloss(0x27b5de), 0, 0.4, 0);
  box(dk, 2.5, 0.05, 0.8, CHROME, 0, 1.07, 0);
  const imac = new THREE.Group(); imac.position.set(0.7, 1.1, -0.1); dk.add(imac);
  const shell = mGloss(0x28c8c8, { transparent: true, opacity: 0.75 });
  add(imac, new THREE.SphereGeometry(0.28, 20, 16), shell, 0, 0.26, -0.05).scale.set(1, 0.95, 0.85);
  add(imac, new THREE.PlaneGeometry(0.34, 0.26), new THREE.MeshBasicMaterial({ map: screenTex('aqua') }), 0, 0.28, 0.19);
  box(dk, 0.1, 0.1, 0.1, CHROME, -0.3, 1.13, 0.1);
  const book = new THREE.Group(); book.position.set(-0.5, 1.1, 0.05); dk.add(book);
  for (const s of [-1, 1]) { const pg = box(book, 0.22, 0.02, 0.3, mStd(0xfffdf5, 0.8), s * 0.115, 0.01, 0); pg.rotation.z = -s * 0.08; }
  box(book, 0.48, 0.015, 0.34, mStd(0x2a4f9e, 0.6), 0, -0.005, 0);
  hit(book, 0, 0.05, 0, 0.25, 'guestbook', 'Guest book');
  tag(dk, 'desk', 'Reception desk');

  for (const [x, z] of [[-6.5, -3], [6.5, -3], [-3, 7.8], [3, 7.8], [-7.5, 1.2], [7.5, 1.2]]) plant(R.g, x, z, 1.1);

  // doors round the wall: angle from north, clockwise
  const D = (deg, label, hot, col) => {
    const a = (deg * Math.PI) / 180, x = Math.sin(a) * 8.9, z = -Math.cos(a) * 8.9;
    return door(R, x, z, label, hot, col);
  };
  D(0, 'Planetarium', 'door_plan', '#5b4bd6');
  D(55, 'Spa & Pools', 'door_spa', '#1aa6d9');
  D(110, 'Tech Office', 'door_tech', '#19a37a');
  D(180, 'Guest Suites', 'door_suite', '#c85fd6');
  D(250, 'Kitchen', 'door_kitchen', '#f08a1c');
  D(305, 'Archive', 'door_archive', '#b07a3e');

  lamps(R, [0, 3.8, 0, 0xfff4e0, 22, 16], [0, 1.2, 0, 0x7fe0ff, 6, 6]);
  return R;
}

function buildSpa() {
  const R = mkRoom('spa');
  const floor = mStd(0xffffff, 0.2, 0, { map: tiles('#bff0fb', '#e8fbff', '#8fd6ea', 8, [4, 4]) });
  const wallM = mStd(0xffffff, 0.35, 0, { map: wallTex('#f1fbff', '#1aa6d9', [6, 1]) });
  const h = 3.6;
  // floor around a sunken pool (-3..3, -3.6..0.8)
  const F = (x0, x1, z0, z1) => { const m = add(R.g, new THREE.PlaneGeometry(x1 - x0, z1 - z0), floor, (x0 + x1) / 2, 0, (z0 + z1) / 2); m.rotation.x = -Math.PI / 2; };
  F(-6, -3, -5, 5); F(3, 6, -5, 5); F(-3, 3, 0.8, 5); F(-3, 3, -5, -3.6);
  const pool = mStd(0xffffff, 0.2, 0, { map: tiles('#1fb2dc', '#3cc9ea', '#0f8fbf', 6, [3, 1]) });
  const pw = (w, d, x, y, z, rx, ry) => { const m = add(R.g, new THREE.PlaneGeometry(w, d), pool, x, y, z); m.rotation.set(rx, ry, 0); };
  pw(6, 4.4, 0, -1.2, -1.4, -Math.PI / 2, 0);
  pw(6, 1.2, 0, -0.6, -3.6, 0, 0); pw(6, 1.2, 0, -0.6, 0.8, 0, Math.PI);
  pw(4.4, 1.2, -3, -0.6, -1.4, 0, Math.PI / 2); pw(4.4, 1.2, 3, -0.6, -1.4, 0, -Math.PI / 2);
  const water = add(R.g, new THREE.PlaneGeometry(6, 4.4), mGloss(0x3cd4f2, { map: causticTex(), transparent: true, opacity: 0.8, depthWrite: false }), 0, -0.18, -1.4);
  water.rotation.x = -Math.PI / 2;
  updaters.push((dt, t) => { water.material.map.offset.set(t * 0.02, Math.sin(t * 0.4) * 0.1); });
  for (const [w, x, z, ry] of [[6.2, 0, 0.85, 0], [6.2, 0, -3.65, 0], [4.6, -3.05, -1.4, Math.PI / 2], [4.6, 3.05, -1.4, Math.PI / 2]]) {
    box(R.g, w, 0.06, 0.14, WHITE, x, 0.02, z).rotation.y = ry;
  }
  // walls, with a big window at the back
  const W = (len, x, z, ry) => { const m = add(R.g, new THREE.PlaneGeometry(len, h), wallM, x, h / 2, z); m.rotation.y = ry; };
  W(12, 0, 5, Math.PI); W(10, -6, 0, Math.PI / 2); W(10, 6, 0, -Math.PI / 2);
  add(R.g, new THREE.PlaneGeometry(12, 0.5), wallM, 0, 0.25, -5);
  add(R.g, new THREE.PlaneGeometry(12, 0.6), wallM, 0, h - 0.3, -5);
  skyWindow(R, 11.6, 2.5, 0, 1.75, -4.98);
  const c = add(R.g, new THREE.PlaneGeometry(12, 10), CEIL, 0, h, 0); c.rotation.x = Math.PI / 2;
  // loungers
  for (const z of [-2.4, 0.2]) {
    const l = new THREE.Group(); l.position.set(4.9, 0, z); R.g.add(l);
    box(l, 0.7, 0.3, 1.8, WHITE, 0, 0.25, 0);
    const back = box(l, 0.68, 0.12, 0.7, mGloss(0x46cff0), 0, 0.55, -0.6); back.rotation.x = 0.7;
    box(l, 0.68, 0.1, 1.2, mGloss(0x46cff0), 0, 0.45, 0.25);
  }
  // side table with the lyric sheet
  const tb = new THREE.Group(); tb.position.set(4.35, 0, 1.75); R.g.add(tb);
  cyl(tb, 0.35, 0.35, 0.04, GLASS, 0, 0.6, 0); cyl(tb, 0.04, 0.06, 0.6, CHROME, 0, 0.3, 0);
  const sheet = box(tb, 0.24, 0.005, 0.32, mStd(0xfff9f0, 0.8), 0, 0.625, 0); sheet.rotation.y = 0.3;
  cyl(tb, 0.05, 0.04, 0.09, mGloss(0xff7fb0), 0.18, 0.66, -0.1);
  hit(tb, 0, 0.7, 0, 0.35, 'lyrics', 'Lyric sheet');
  // bubble sculpture + plants
  const bm = mGloss(0xbff4ff, { transparent: true, opacity: 0.6, iridescence: 1 });
  for (let i = 0; i < 7; i++) sph(R.g, 0.25 + rnd() * 0.35, bm, -4.8 + rnd() * 0.9, 0.4 + i * 0.38, -3.8 + rnd() * 0.8, 24);
  plant(R.g, -5.2, 3.8, 1.2); plant(R.g, 5.3, -4.2, 1.1); plant(R.g, -5.2, -1, 1);
  door(R, 0, 4.92, 'Lobby', 'exit_spa', '#1aa6d9', [0, 0]);
  lamps(R, [0, 3.2, -1, 0xeafcff, 16, 14], [0, -0.5, -1.4, 0x5fe0ff, 4, 5]);
  return R;
}

function buildPlanetarium() {
  const R = mkRoom('plan');
  const carpet = ctex(512, 512, (g, w) => {
    g.fillStyle = '#1a1840'; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 90; i++) { g.fillStyle = ['#ffd21f', '#3ec8f2', '#ff3d9a'][i % 3]; const x = rnd() * w, y = rnd() * w; g.beginPath(); g.arc(x, y, 2 + rnd() * 3, 0, 7); g.fill(); }
  }, [4, 4]);
  const fl = add(R.g, new THREE.CircleGeometry(8, 64), mStd(0xffffff, 0.9, 0, { map: carpet }), 0, 0, 0); fl.rotation.x = -Math.PI / 2;
  add(R.g, new THREE.CylinderGeometry(8, 8, 2.6, 64, 1, true), mStd(0x16143a, 0.7, 0, { side: THREE.BackSide }), 0, 1.3, 0);
  const domeM = new THREE.MeshBasicMaterial({ map: starDomeTex(false), side: THREE.BackSide });
  add(R.g, new THREE.SphereGeometry(8, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), domeM, 0, 2.6, 0);
  add(R.g, new THREE.TorusGeometry(7.95, 0.05, 6, 64), mStd(0x3ec8f2, 0.3, 0, { emissive: 0x3ec8f2, emissiveIntensity: 1 }), 0, 2.6, 0).rotation.x = Math.PI / 2;
  // seats on both sides, facing the middle
  const seat = mGloss(0x5b2fb0), seat2 = mGloss(0x7d4ee0);
  for (const r of [4.2, 5.6, 7]) for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2;
    if (Math.abs(Math.sin(a)) < 0.55) continue; // aisles north & south
    const s = new THREE.Group(); s.position.set(Math.sin(a) * r, 0, -Math.cos(a) * r); faceTo(s, 0, 0); R.g.add(s);
    box(s, 0.6, 0.4, 0.6, seat, 0, 0.2, 0);
    const bk = box(s, 0.6, 0.8, 0.12, seat2, 0, 0.7, -0.32); bk.rotation.x = -0.45;
  }
  // projector
  const pj = new THREE.Group(); R.g.add(pj);
  cyl(pj, 0.5, 0.65, 0.4, mGloss(0x2a2f4a), 0, 0.2, 0);
  cyl(pj, 0.12, 0.16, 1.1, CHROME, 0, 0.95, 0);
  const ball = sph(pj, 0.45, mGloss(0x151a30, { metalness: 0.4 }), 0, 1.75, 0, 32);
  const dotM = mStd(0xffffff, 0.3, 0, { emissive: 0xbfe8ff, emissiveIntensity: 1.2 });
  for (let i = 0; i < 40; i++) {
    const v = new THREE.Vector3(rnd() - 0.5, rnd() * 0.8 - 0.2, rnd() - 0.5).normalize().multiplyScalar(0.44);
    sph(pj, 0.028, dotM, v.x, 1.75 + v.y, v.z, 8);
  }
  updaters.push((dt, t) => { pj.rotation.y = t * 0.05; });
  R.proj = ball;
  // console
  const cn = new THREE.Group(); cn.position.set(-1.3, 0, 2.0); faceTo(cn, 0, 6); R.g.add(cn);
  box(cn, 1.1, 0.9, 0.5, mGloss(0x2a2f4a), 0, 0.45, 0);
  const top = box(cn, 1.15, 0.06, 0.62, mGloss(0x151a30), 0, 0.95, 0.05); top.rotation.x = 0.35;
  for (let i = 0; i < 12; i++) {
    const b = box(cn, 0.08, 0.03, 0.08, mGloss([0xff3d9a, 0x3ec8f2, 0xffd21f, 0xa6e22e][i % 4], { emissive: [0xff3d9a, 0x3ec8f2, 0xffd21f, 0xa6e22e][i % 4], emissiveIntensity: 0.7 }), -0.4 + (i % 6) * 0.16, 1.0 - Math.floor(i / 6) * 0.05, -0.05 + Math.floor(i / 6) * 0.16);
    b.rotation.x = 0.35;
  }
  tag(cn, 'console', 'Projector console');
  // stage + curtains
  const st = new THREE.Group(); st.position.set(0, 0, -6.3); R.g.add(st);
  add(st, new THREE.CylinderGeometry(3.2, 3.2, 0.5, 48, 1, false, Math.PI / 2, Math.PI), mGloss(0x2b2360), 0, 0.25, -0.4);
  const lights = [];
  for (let i = 0; i < 16; i++) {
    const a = Math.PI / 2 + (i / 15) * Math.PI;
    lights.push(sph(st, 0.05, mStd(0xffffff, 0.3, 0, { emissive: 0xffd21f, emissiveIntensity: 1 }), Math.sin(a) * 3.2, 0.42, Math.cos(a) * 3.2 - 0.4, 8));
  }
  updaters.push((dt, t) => { lights.forEach((l, i) => { l.material.emissiveIntensity = 0.3 + (Math.sin(t * 4 - i * 0.7) > 0.3 ? 1.2 : 0); }); });
  const cur = mStd(0xd12a7a, 0.55, 0.1);
  for (let i = 0; i < 14; i++) cyl(st, 0.22, 0.22, 2.6, cur, -2.6 + i * 0.4, 1.3 + 0.5, -1.35 + Math.sin(i) * 0.05, 12);
  // the service hatch
  door(R, 3.3, -7.25, 'Service', 'hatch', '#6b6f80', [0, 0]);
  // Dex's hologram card (night 1)
  const hc = new THREE.Group(); hc.position.set(0.55, 0.02, -0.7); R.g.add(hc);
  box(hc, 0.14, 0.01, 0.09, mGloss(0x7fe8ff, { emissive: 0x3ec8f2, emissiveIntensity: 0.8 }), 0, 0, 0).rotation.y = 0.5;
  hit(hc, 0, 0.1, 0, 0.3, 'holocard', 'Something glowing');
  R.holo = hc;
  // the code on the dome (after the constellation)
  const code = add(R.g, new THREE.PlaneGeometry(6, 4.1), new THREE.MeshBasicMaterial({
    map: ctex(1024, 700, (g, w, h) => {
      g.shadowColor = '#7fe8ff'; g.shadowBlur = 30; g.strokeStyle = 'rgba(160,240,255,.8)'; g.lineWidth = 6;
      const S = [[512, 40], [512, 170], [512, 400], [340, 170], [684, 170]];
      g.beginPath(); g.moveTo(512, 40); g.lineTo(512, 400); g.moveTo(340, 170); g.lineTo(684, 170); g.stroke();
      g.fillStyle = '#ffffff'; S.forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 14, 0, 7); g.fill(); });
      g.fillStyle = '#e8fdff'; g.shadowBlur = 40;
      g.font = '900 200px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('7 · 2 · 9', w / 2, 560);
    }), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }), 0, 6.4, -4.4);
  code.lookAt(0, 1.6, 2); R.code = code;
  door(R, 0, 7.9, 'Lobby', 'exit_plan', '#5b4bd6', [0, 0]);
  lamps(R, [0, 2.2, 0, 0x8fa8ff, 7, 12], [0, 2, -6, 0xff7fc8, 5, 8]);
  R.dark = true;
  return R;
}

function buildKitchen() {
  const R = mkRoom('kitchen');
  rectRoom(R, -5, 5, -4, 4, 3.2, mStd(0xffffff, 0.25, 0, { map: tiles('#d9f7c8', '#ffffff', '#b5dca4', 6, [5, 4]) }), mStd(0xffffff, 0.4, 0, { map: wallTex('#fffaf0', '#f08a1c', [5, 1]) }));
  skyWindow(R, 4, 1.2, -1.8, 2.1, -3.97);
  const ct = new THREE.Group(); R.g.add(ct);
  box(ct, 10, 0.95, 0.7, WHITE, 0, 0.475, -3.6);
  box(ct, 10, 0.2, 0.72, mGloss(0xa6e22e), 0, 0.2, -3.6);
  box(ct, 10, 0.05, 0.75, mStd(0xf2f6f8, 0.15, 0.2), 0, 0.97, -3.6);
  // the oven with its timer
  const ov = new THREE.Group(); ov.position.set(2.6, 0, -3.55); R.g.add(ov);
  box(ov, 1.1, 0.95, 0.72, CHROME, 0, 0.475, 0.02);
  box(ov, 0.8, 0.45, 0.02, mGloss(0x201008, { emissive: 0xff7a1c, emissiveIntensity: 0.6 }), 0, 0.45, 0.39);
  const clock = add(ov, new THREE.PlaneGeometry(0.4, 0.12), new THREE.MeshBasicMaterial({ map: ctex(256, 80, (g) => { g.fillStyle = '#082010'; g.fillRect(0, 0, 256, 80); g.fillStyle = '#5bff9c'; g.font = '700 54px monospace'; g.textAlign = 'center'; g.fillText('12:30', 128, 60); }) }), 0, 0.82, 0.39);
  clock.userData.k = 1;
  tag(ov, 'oven', 'Oven');
  // recipe board
  const rb = new THREE.Group(); rb.position.set(-4.96, 1.6, -0.6); rb.rotation.y = Math.PI / 2; R.g.add(rb);
  box(rb, 1.3, 0.9, 0.04, mStd(0xc79a5a, 0.95), 0, 0, 0);
  for (let i = 0; i < 5; i++) { const c = box(rb, 0.3, 0.22, 0.01, mStd(0xffffff, 0.8), -0.4 + (i % 3) * 0.4, 0.2 - Math.floor(i / 3) * 0.35, 0.03); c.rotation.z = (rnd() - 0.5) * 0.2; sph(rb, 0.02, mGloss(0xff3d9a), c.position.x, c.position.y + 0.09, 0.04, 8); }
  tag(rb, 'recipeboard', 'Recipe board');
  // island with a cake
  const is = new THREE.Group(); is.position.set(0.4, 0, -0.9); R.g.add(is);
  box(is, 2.4, 0.95, 1.1, WHITE, 0, 0.475, 0); box(is, 2.5, 0.05, 1.2, mStd(0xf2f6f8, 0.15, 0.2), 0, 0.97, 0);
  const cake = new THREE.Group(); cake.position.set(0.5, 1, 0); is.add(cake);
  cyl(cake, 0.06, 0.1, 0.12, CHROME, 0, 0.06, 0); cyl(cake, 0.3, 0.3, 0.03, CHROME, 0, 0.13, 0);
  cyl(cake, 0.26, 0.26, 0.16, mGloss(0xffc2e0), 0, 0.23, 0); cyl(cake, 0.2, 0.2, 0.14, mGloss(0xbff0ff), 0, 0.38, 0);
  star3(cake, 0.07, GOLD, 0, 0.53, 0, 0.02);
  tag(cake, 'cake', 'Gala cake');
  for (let i = 0; i < 6; i++) sph(is, 0.06, mGloss([0xff8a1c, 0xa6e22e, 0xff3d6a][i % 3]), -0.6 + (i % 3) * 0.13, 1.03, -0.2 + Math.floor(i / 3) * 0.13, 12);
  // hanging pans
  box(R.g, 3, 0.04, 0.04, CHROME, 0.4, 2.6, -0.9);
  for (let i = 0; i < 5; i++) { cyl(R.g, 0.004, 0.004, 0.3, CHROME, -0.6 + i * 0.5, 2.43, -0.9, 4); const p = cyl(R.g, 0.14, 0.12, 0.08, i % 2 ? mStd(0xff8a1c, 0.3, 0.6) : CHROME, -0.6 + i * 0.5, 2.25, -0.9); p.rotation.x = 1.4; }
  plant(R.g, 4.3, 3.3, 0.9); plant(R.g, -4.3, 3.3, 0.9);
  for (let i = 0; i < 3; i++) plant(R.g, -3 + i * 0.4, -3.6, 0.35).position.y = 0.97;
  door(R, 0, 3.95, 'Lobby', 'exit_kitchen', '#f08a1c', [0, 0]);
  lamps(R, [0, 2.9, -1, 0xfff0d8, 14, 12], [2.6, 0.5, -3, 0xff9a40, 2, 3]);
  return R;
}

function buildTech() {
  const R = mkRoom('tech');
  rectRoom(R, -4, 4, -4, 4, 3, mStd(0xffffff, 0.8, 0, { map: tiles('#34506e', '#3b5b7c', '#2a4158', 4, [4, 4]) }), mStd(0xffffff, 0.5, 0, { map: wallTex('#dfe9f2', '#19a37a', [4, 1]) }));
  const dk = new THREE.Group(); dk.position.set(0, 0, -3.4); R.g.add(dk);
  box(dk, 3.4, 0.08, 0.9, mGloss(0xf4f7fb), 0, 0.76, 0);
  for (const s of [-1, 1]) box(dk, 0.08, 0.76, 0.8, CHROME, s * 1.6, 0.38, 0);
  // the AquaOS machine
  const pc = new THREE.Group(); pc.position.set(0, 0.8, -0.05); dk.add(pc);
  box(pc, 1.05, 0.75, 0.12, mGloss(0xeef3f8), 0, 0.55, 0);
  add(pc, new THREE.PlaneGeometry(0.92, 0.62), new THREE.MeshBasicMaterial({ map: screenTex('aqua') }), 0, 0.56, 0.061);
  cyl(pc, 0.05, 0.05, 0.2, CHROME, 0, 0.1, 0); cyl(pc, 0.22, 0.22, 0.02, CHROME, 0, 0.01, 0);
  box(pc, 0.7, 0.03, 0.22, mGloss(0xffffff), 0, 0.02, 0.3);
  tag(pc, 'computer', 'Dex\'s computer');
  const sticky = add(pc, new THREE.PlaneGeometry(0.12, 0.12), mStd(0xffe45c, 0.9), 0.45, 0.83, 0.065);
  sticky.rotation.z = 0.1;
  hit(pc, 0.45, 0.83, 0.1, 0.12, 'sticky', 'Sticky note');
  // cat photo
  const ph = new THREE.Group(); ph.position.set(1.15, 0.8, 0); ph.rotation.y = -0.3; dk.add(ph);
  box(ph, 0.24, 0.3, 0.03, mGloss(0xff7fd0), 0, 0.15, 0);
  add(ph, new THREE.PlaneGeometry(0.19, 0.24), new THREE.MeshBasicMaterial({ map: ctex(128, 160, (g) => { g.fillStyle = '#bfe8ff'; g.fillRect(0, 0, 128, 160); g.fillStyle = '#f0a040'; g.beginPath(); g.ellipse(64, 100, 38, 34, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(34, 80); g.lineTo(40, 50); g.lineTo(56, 72); g.moveTo(94, 80); g.lineTo(88, 50); g.lineTo(72, 72); g.fill(); g.fillStyle = '#222'; g.fillRect(50, 94, 6, 6); g.fillRect(72, 94, 6, 6); }) }), 0, 0.15, 0.017);
  hit(ph, 0, 0.15, 0.05, 0.16, 'catphoto', 'Photo frame');
  // lava lamp
  const ll = new THREE.Group(); ll.position.set(-1.2, 0.8, 0); dk.add(ll);
  cyl(ll, 0.07, 0.1, 0.12, CHROME, 0, 0.06, 0);
  cyl(ll, 0.05, 0.08, 0.34, mGloss(0xff8ad8, { transparent: true, opacity: 0.6, emissive: 0xff3d9a, emissiveIntensity: 0.5 }), 0, 0.29, 0);
  const blob = sph(ll, 0.035, mStd(0xffd21f, 0.3, 0, { emissive: 0xffa010, emissiveIntensity: 1 }), 0, 0.2, 0, 12);
  updaters.push((dt, t) => { blob.position.y = 0.26 + Math.sin(t * 0.7) * 0.1; });
  // side desk with a CRT
  const sd = new THREE.Group(); sd.position.set(3.2, 0, 0.4); sd.rotation.y = -Math.PI / 2; R.g.add(sd);
  box(sd, 1.8, 0.08, 0.8, mGloss(0xf4f7fb), 0, 0.76, 0);
  for (const s of [-1, 1]) box(sd, 0.08, 0.76, 0.7, CHROME, s * 0.85, 0.38, 0);
  box(sd, 0.6, 0.5, 0.5, mStd(0xdcd6c4, 0.6), 0, 1.05, -0.05);
  add(sd, new THREE.PlaneGeometry(0.46, 0.36), new THREE.MeshBasicMaterial({ map: screenTex('code') }), 0, 1.07, 0.201);
  // server rack
  const rk = new THREE.Group(); rk.position.set(3.3, 0, -2.6); R.g.add(rk);
  box(rk, 0.8, 2.2, 0.8, mGloss(0x1d2230), 0, 1.1, 0);
  const leds = [];
  for (let i = 0; i < 24; i++) leds.push(box(rk, 0.04, 0.02, 0.02, mStd(0x000000, 0.3, 0, { emissive: i % 3 ? 0x39ff9c : 0x3ec8f2, emissiveIntensity: 1 }), -0.8 / 2 + 0.1 + (i % 6) * 0.1, 0.4 + Math.floor(i / 6) * 0.45, 0.41));
  updaters.push((dt, t) => { leds.forEach((l, i) => { l.visible = Math.sin(t * (3 + (i % 5)) + i) > -0.3; }); });
  // the speaker switchboard on the left wall
  const sb = new THREE.Group(); sb.position.set(-3.96, 1.45, 0.6); sb.rotation.y = Math.PI / 2; R.g.add(sb);
  box(sb, 1.3, 0.8, 0.08, mGloss(0x8a94a6, { metalness: 0.5 }), 0, 0, 0);
  for (let i = 0; i < 6; i++) { box(sb, 0.07, 0.16, 0.05, CHROME, -0.45 + i * 0.16, 0.08, 0.06); sph(sb, 0.02, mStd(0, 0.3, 0, { emissive: 0x39ff9c, emissiveIntensity: 1 }), -0.45 + i * 0.16, 0.25, 0.05, 8); }
  box(sb, 0.1, 0.2, 0.06, mGloss(0xe0232e), 0.5, -0.2, 0.07);
  tag(sb, 'switchboard', 'Speaker switchboard');
  // posters
  const poster = (txt, col, x, z, ry) => { const p = add(R.g, new THREE.PlaneGeometry(0.9, 1.2), new THREE.MeshBasicMaterial({ map: ctex(256, 340, (g) => { const gr = g.createLinearGradient(0, 0, 0, 340); gr.addColorStop(0, col); gr.addColorStop(1, '#ffffff'); g.fillStyle = gr; g.fillRect(0, 0, 256, 340); g.fillStyle = '#fff'; g.font = '900 54px Nunito, sans-serif'; g.textAlign = 'center'; g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 8; txt.split('|').forEach((l, i) => g.fillText(l, 128, 90 + i * 60)); }) }), x, 1.8, z); p.rotation.y = ry; };
  poster('Y2K|READY', '#3ec8f2', -2.2, -3.97, 0);
  poster('KEEP|IT|AQUA', '#19a37a', 2.2, -3.97, 0);
  door(R, 0, 3.95, 'Lobby', 'exit_tech', '#19a37a', [0, 0]);
  lamps(R, [0, 2.7, -0.5, 0xeaf6ff, 12, 12], [0, 1.4, -3, 0x7fd8ff, 2, 3]);
  return R;
}

function buildArchive() {
  const R = mkRoom('archive');
  const wood = ctex(256, 256, (g, w) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#c9935a' : '#d6a46a'; g.fillRect(0, i * 32, w, 32); g.fillStyle = 'rgba(80,40,10,.25)'; g.fillRect(0, i * 32, w, 2); g.fillRect((i * 97) % w, i * 32, 2, 32); }
  }, [4, 4]);
  rectRoom(R, -4.5, 4.5, -4, 4, 3.2, mStd(0xffffff, 0.5, 0, { map: wood }), mStd(0xffffff, 0.6, 0, { map: wallTex('#f6efe2', '#b07a3e', [4, 1]) }));
  skyWindow(R, 3, 1.4, -1.2, 2, -3.97);
  // pinned blueprints
  const bp = ctex(512, 360, (g, w, h) => {
    g.fillStyle = '#1f4f9e'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 1;
    for (let x = 0; x < w; x += 20) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y < h; y += 20) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = '#e8f4ff'; g.lineWidth = 3;
    g.beginPath(); g.arc(w / 2, h / 2 + 20, 120, 0, 7); g.stroke();
    g.beginPath(); g.arc(w / 2, h / 2 + 20, 40, 0, 7); g.stroke();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * 40, h / 2 + 20 + Math.sin(a) * 40); g.lineTo(w / 2 + Math.cos(a) * 170, h / 2 + 20 + Math.sin(a) * 170); g.stroke(); }
    g.fillStyle = '#e8f4ff'; g.font = '700 26px Nunito, sans-serif'; g.fillText('AQUADOME — GROUND FLOOR — O. FINCH 2002', 16, 34);
  });
  for (const [x, z, ry] of [[4.47, -1.5, -Math.PI / 2], [4.47, 1.4, -Math.PI / 2]]) { const p = add(R.g, new THREE.PlaneGeometry(1.6, 1.1), mStd(0xffffff, 0.8, 0, { map: bp }), x, 1.8, z); p.rotation.y = ry; }
  // drafting table with Opal's sketch
  const dt = new THREE.Group(); dt.position.set(1.6, 0, -2.4); R.g.add(dt);
  for (const s of [-1, 1]) box(dt, 0.06, 0.95, 0.06, CHROME, s * 0.6, 0.475, 0);
  const top = box(dt, 1.4, 0.04, 0.9, mStd(0xf2f2f2, 0.5), 0, 1.0, 0); top.rotation.x = 0.35;
  const sk = add(dt, new THREE.PlaneGeometry(0.72, 0.58), mStd(0xffffff, 0.9, 0, { map: ctex(200, 160, (g) => { g.fillStyle = '#fbf7ea'; g.fillRect(0, 0, 200, 160); g.strokeStyle = '#3050a0'; g.lineWidth = 2; const P = [[100, 30], [100, 62], [100, 130], [55, 62], [145, 62]]; g.beginPath(); g.moveTo(100, 30); g.lineTo(100, 130); g.moveTo(55, 62); g.lineTo(145, 62); g.stroke(); g.fillStyle = '#3050a0'; P.forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }); }) }), 0.1, 1.03, 0.0);
  sk.rotation.x = -Math.PI / 2 + 0.35;
  hit(dt, 0.15, 1.05, 0.05, 0.28, 'sketch', 'A sketch');
  R.sketch = sk;
  tag(dt, 'drafting', 'Drafting table');
  // Opal's note on the wall
  const note = add(R.g, new THREE.PlaneGeometry(0.7, 0.52), mStd(0xffffff, 0.8, 0, { map: ctex(200, 150, (g) => { g.fillStyle = '#fff6c8'; g.fillRect(0, 0, 200, 150); g.fillStyle = '#403060'; g.font = 'italic 20px Georgia, serif'; ['The stars', 'remember where', 'I left them.'].forEach((l, i) => g.fillText(l, 18, 45 + i * 30)); }) }), 1.6, 2.05, -3.97);
  tag(note, 'opalnote', 'Handwritten note');
  // flat-file drawer (locked)
  const dr = new THREE.Group(); dr.position.set(-2.9, 0, -3.3); R.g.add(dr);
  box(dr, 1.6, 0.9, 0.9, mStd(0x5a6478, 0.35, 0.6), 0, 0.45, 0);
  for (let i = 0; i < 4; i++) { box(dr, 1.5, 0.18, 0.02, mStd(0x6c778d, 0.3, 0.6), 0, 0.15 + i * 0.2, 0.46); box(dr, 0.3, 0.03, 0.03, CHROME, 0, 0.18 + i * 0.2, 0.48); }
  const dial = cyl(dr, 0.07, 0.07, 0.03, GOLD, 0.6, 0.78, 0.47); dial.rotation.x = Math.PI / 2;
  tag(dr, 'drawer', 'Locked drawer');
  // model of the Aquadome
  const md = new THREE.Group(); md.position.set(3, 0, 1.2); R.g.add(md);
  box(md, 0.9, 0.9, 0.9, WHITE, 0, 0.45, 0);
  cyl(md, 0.35, 0.35, 0.05, mGloss(0x9fe3f7), 0, 0.93, 0);
  add(md, new THREE.SphereGeometry(0.3, 24, 12, 0, 6.3, 0, 1.6), GLASS, 0, 0.95, 0);
  add(md, new THREE.SphereGeometry(0.4, 24, 12, 0, 6.3, 0, 1.6), GLASS, 0, 0.92, 0);
  tag(md, 'model', 'Scale model');
  // bookshelves
  const sh = new THREE.Group(); sh.position.set(-4.3, 0, 0.8); sh.rotation.y = Math.PI / 2; R.g.add(sh);
  box(sh, 2.4, 2.2, 0.4, mStd(0x8a5a30, 0.6), 0, 1.1, 0);
  for (let r = 0; r < 4; r++) for (let i = 0; i < 12; i++) box(sh, 0.12, 0.34, 0.26, mStd([0x3ec8f2, 0xff3d9a, 0xffd21f, 0x9b4df2, 0xa6e22e, 0xf2f2f2][(i + r) % 6], 0.6), -1.05 + i * 0.18, 0.3 + r * 0.52, 0.08);
  plant(R.g, 3.8, -3.3, 1);
  door(R, 0, 3.95, 'Lobby', 'exit_archive', '#b07a3e', [0, 0]);
  lamps(R, [0, 2.9, -0.5, 0xfff0d8, 12, 12], [1.6, 2, -2, 0xfff6e0, 3, 4]);
  return R;
}

function buildSuite() {
  const R = mkRoom('suite');
  const carpet = mStd(0xffffff, 0.95, 0, { map: tiles('#d9c8f5', '#e2d4fa', '#cdb8f0', 2, [6, 6]) });
  rectRoom(R, -3.5, 3.5, -3, 3, 2.9, carpet, mStd(0xffffff, 0.5, 0, { map: wallTex('#fbf6ff', '#c85fd6', [4, 1]) }));
  skyWindow(R, 2.6, 1.4, 1.2, 1.7, -2.97);
  const bd = new THREE.Group(); bd.position.set(-1.4, 0, -1.6); R.g.add(bd);
  box(bd, 1.8, 0.35, 2.3, WHITE, 0, 0.2, 0);
  box(bd, 1.7, 0.22, 2.2, mStd(0xffffff, 0.7), 0, 0.48, 0.02);
  box(bd, 1.74, 0.08, 1.5, mGloss(0x46cff0), 0, 0.62, 0.35);
  for (const s of [-1, 1]) { const p = sph(bd, 0.3, mGloss(0xffc2e0), s * 0.42, 0.68, -0.8, 18); p.scale.set(1, 0.4, 0.6); }
  box(bd, 1.9, 1.1, 0.12, mGloss(0xc85fd6), 0, 0.75, -1.18);
  tag(bd, 'bed', 'Bed');
  // desk with suitcase and a CD player
  const dk = new THREE.Group(); dk.position.set(2.6, 0, 0.8); dk.rotation.y = -Math.PI / 2; R.g.add(dk);
  box(dk, 1.4, 0.06, 0.6, WHITE, 0, 0.74, 0);
  for (const s of [-1, 1]) box(dk, 0.06, 0.74, 0.55, CHROME, s * 0.65, 0.37, 0);
  const cd = cyl(dk, 0.14, 0.14, 0.04, mGloss(0xc0c8d8, { metalness: 0.7 }), -0.3, 0.8, 0); cd.userData.k = 1;
  sph(dk, 0.06, GLASS, -0.3, 0.83, 0, 12);
  tag(dk, 'cdplayer', 'Your desk');
  const sc = new THREE.Group(); sc.position.set(-2.6, 0, 1.6); R.g.add(sc);
  box(sc, 0.7, 0.5, 0.25, mGloss(0xdfe6ee, { metalness: 0.8 }), 0, 0.25, 0);
  for (let i = 0; i < 3; i++) box(sc, 0.72, 0.02, 0.27, CHROME, 0, 0.1 + i * 0.15, 0);
  tag(sc, 'suitcase', 'Your suitcase');
  plant(R.g, 3, -2.5, 0.8);
  door(R, 0, 2.95, 'Lobby', 'exit_suite', '#c85fd6', [0, 0]);
  lamps(R, [0, 2.6, 0, 0xfff0e0, 10, 10], [-1.4, 1.2, -1.6, 0xffc2e0, 2, 3]);
  return R;
}

function buildTunnel() {
  const R = mkRoom('tunnel');
  const conc = ctex(256, 256, (g, w) => {
    g.fillStyle = '#6d7480'; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? 0 : 255},${rnd() < 0.5 ? 0 : 255},255,.06)`; g.fillRect(rnd() * w, rnd() * w, 3, 3); }
    g.strokeStyle = 'rgba(20,20,30,.4)'; g.lineWidth = 2; g.strokeRect(0, 0, w, w);
  }, [2, 1]);
  const cm = mStd(0xffffff, 0.9, 0, { map: conc });
  rectRoom(R, -1.4, 1.4, -15, 2, 2.6, mStd(0x4a505c, 0.9), cm, mStd(0x3c424c, 0.9));
  const pipeA = mStd(0x2f9aa6, 0.35, 0.6), pipeB = CHROME;
  for (const [x, y, m, r] of [[-1.2, 2.2, pipeA, 0.1], [-1.25, 1.8, pipeB, 0.06], [1.2, 2.3, pipeB, 0.08], [1.25, 0.5, pipeA, 0.12]]) {
    const p = cyl(R.g, r, r, 17, m, x, y, -6.5, 16); p.rotation.x = Math.PI / 2;
  }
  const bulbs = [];
  for (let z = 0; z > -15; z -= 3) {
    const b = sph(R.g, 0.08, mStd(0xffffff, 0.3, 0, { emissive: 0xffd9a0, emissiveIntensity: 1.5 }), 0, 2.45, z, 12);
    add(R.g, new THREE.SphereGeometry(0.13, 8, 6), mStd(0x222222, 0.5, 0.5, { wireframe: true }), 0, 2.45, z);
    bulbs.push(b);
  }
  updaters.push((dt, t) => { bulbs.forEach((b, i) => { b.material.emissiveIntensity = Math.sin(t * 17 + i * 5) > 0.97 ? 0.2 : 1.5; }); });
  // the round vault door with three symbol rings
  const vd = new THREE.Group(); vd.position.set(0, 1.25, -14.9); R.g.add(vd);
  const disc = cyl(vd, 1.1, 1.1, 0.15, mStd(0xb8c4d6, 0.25, 1), 0, 0, 0.05, 48); disc.rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) { const t = add(vd, new THREE.TorusGeometry(0.3 + i * 0.27, 0.05, 8, 40), [GOLD, CHROME, GOLD][i], 0, 0, 0.14); }
  star3(vd, 0.14, GOLD, 0, 0, 0.16, 0.04);
  R.vault = vd;
  tag(vd, 'stardoor', 'Round vault door');
  door(R, 0, 1.95, 'Planetarium', 'exit_tunnel', '#6b6f80', [0, -5]);
  lamps(R, [0, 2.2, -2, 0xffd9a0, 6, 8], [0, 2.2, -12, 0xffd9a0, 6, 8]);
  R.dark = true;
  return R;
}

function buildStarRoom() {
  const R = mkRoom('star');
  const floorT = ctex(512, 512, (g, w) => {
    g.fillStyle = '#3a2a55'; g.fillRect(0, 0, w, w);
    g.strokeStyle = '#ffd98a'; g.lineWidth = 6; g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 90 : 200; const x = w / 2 + Math.cos(a) * r, y = w / 2 + Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath(); g.stroke();
  });
  const fl = add(R.g, new THREE.CircleGeometry(4, 48), mStd(0xffffff, 0.35, 0, { map: floorT }), 0, 0, 0); fl.rotation.x = -Math.PI / 2;
  add(R.g, new THREE.CylinderGeometry(4, 4, 1.6, 48, 1, true), mStd(0x4a2f70, 0.6, 0, { side: THREE.BackSide }), 0, 0.8, 0);
  add(R.g, new THREE.SphereGeometry(4, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ map: starDomeTex(true), side: THREE.BackSide }), 0, 1.6, 0);
  const pd = new THREE.Group(); pd.position.set(0, 0, -0.8); R.g.add(pd);
  cyl(pd, 0.3, 0.4, 1.0, mGloss(0x9a7fd0), 0, 0.5, 0);
  add(pd, new THREE.TorusGeometry(0.34, 0.03, 8, 32), GOLD, 0, 1.0, 0).rotation.x = Math.PI / 2;
  cyl(pd, 0.25, 0.25, 0.06, mStd(0x7a2a9a, 0.8), 0, 1.03, 0);
  R.crown = crown(pd, 0, 1.06, 0, 1.9);
  tag(pd, 'crown', 'The Prism Crown');
  // Opal's orrery
  const or = new THREE.Group(); or.position.set(-2, 0, -1.6); R.g.add(or);
  cyl(or, 0.05, 0.25, 1.1, GOLD, 0, 0.55, 0);
  sph(or, 0.16, mStd(0xffd21f, 0.3, 0, { emissive: 0xffa010, emissiveIntensity: 0.9 }), 0, 1.25, 0);
  const arms = [];
  [[0.4, 0x3ec8f2, 0.06], [0.65, 0xff3d9a, 0.08], [0.9, 0xa6e22e, 0.07]].forEach(([r, c, s], i) => {
    const a = new THREE.Group(); a.position.y = 1.25; or.add(a); arms.push(a);
    box(a, r, 0.01, 0.01, GOLD, r / 2, 0, 0); sph(a, s, mGloss(c), r, 0, 0, 14);
  });
  updaters.push((dt, t) => { arms.forEach((a, i) => { a.rotation.y = t * (0.6 - i * 0.15); }); });
  tag(or, 'orrery', 'Orrery');
  door(R, 0, 3.9, 'Tunnel', 'exit_star', '#6b6f80', [0, 0]);
  lamps(R, [0, 2.4, 0, 0xffe0c0, 7, 8], [0, 1.4, -0.8, 0xc080ff, 4, 4]);
  return R;
}

// ---------- Walk arrows ----------
const ARROW_M = mGloss(0x5fe0ff, { emissive: 0x1aa6d9, emissiveIntensity: 0.6, transparent: true, opacity: 0.9 });
function arrowMesh() {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(0, 0.28); s.lineTo(0.26, -0.02); s.lineTo(0.14, -0.02); s.lineTo(0.14, -0.26); s.lineTo(-0.14, -0.26); s.lineTo(-0.14, -0.02); s.lineTo(-0.26, -0.02); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
  geo.center();
  const m = new THREE.Mesh(geo, ARROW_M); m.rotation.x = -Math.PI / 2; g.add(m);
  const hb = add(g, new THREE.SphereGeometry(0.42, 8, 6), HIT, 0, 0, 0);
  return g;
}
const arrows = [];
export function showArrows(nodeId) {
  for (const a of arrows) a.parent && a.parent.remove(a);
  const n = NODES[nodeId], R = rooms[n.room];
  n.exits.forEach((to, i) => {
    let a = arrows[i];
    if (!a) { a = arrowMesh(); arrows.push(a); }
    const t = NODES[to];
    const dx = t.p[0] - n.p[0], dz = t.p[1] - n.p[1], d = Math.hypot(dx, dz);
    const k = Math.min(2.6, d * 0.6);
    a.position.set(n.p[0] + (dx / d) * k, 0.3, n.p[1] + (dz / d) * k);
    a.scale.setScalar(0.8);
    a.rotation.y = Math.atan2(dx, dz) + Math.PI;
    a.userData.go = to; a.userData.name = 'Walk';
    a.traverse(o => { o.userData.go = to; });
    a.userData.by = a.position.y;
    R.g.add(a);
  });
}

// ---------- Public ----------
function envMap(renderer, isNight) {
  const es = new THREE.Scene();
  const m = new THREE.MeshBasicMaterial({ map: isNight ? texNight : texDay, side: THREE.BackSide });
  es.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), m));
  const panel = new THREE.MeshBasicMaterial({ color: isNight ? 0x6070c0 : 0xffffff });
  for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.4), panel); const a = i * Math.PI / 2; p.position.set(Math.sin(a) * 6, 3, Math.cos(a) * 6); p.lookAt(0, 0, 0); es.add(p); }
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(es, 0.03);
  pm.dispose();
  return rt.texture;
}

let envDay, envNight;
export function buildWorld(sc, renderer) {
  scene = sc;
  texDay = skyTex(false); texNight = skyTex(true);
  texDay.mapping = texNight.mapping = THREE.UVMapping;
  skyMat = new THREE.MeshBasicMaterial({ map: texDay, side: THREE.BackSide, depthWrite: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 48, 24), skyMat); sky.renderOrder = -1; scene.add(sky);
  hemi = new THREE.HemisphereLight(0xe4f6ff, 0xc8ecc0, 1.1); scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfff1dc, 1.4); sun.position.set(5, 10, 4); scene.add(sun);
  envDay = envMap(renderer, false); envNight = envMap(renderer, true);
  buildLobby(); buildSpa(); buildPlanetarium(); buildKitchen(); buildTech(); buildArchive(); buildSuite(); buildTunnel(); buildStarRoom();
  for (const w of ['vesper', 'cherry', 'dex', 'juniper', 'opal']) chars[w] = figure(w);
}

let curRoom = null;
export function showRoom(id) {
  for (const k in rooms) rooms[k].g.visible = k === id;
  curRoom = id;
  applyTime();
}
export const roomOf = () => rooms[curRoom];

function applyTime() {
  const n = night(), R = rooms[curRoom];
  skyMat.map = n ? texNight : texDay;
  for (const k in rooms) for (const m of rooms[k].skyMats) { m.map = n ? texNight : texDay; m.needsUpdate = true; }
  skyMat.needsUpdate = true;
  const dark = R && R.dark;
  scene.environment = n || dark ? envNight : envDay;
  hemi.color.set(n ? 0x6a78c0 : 0xe4f6ff); hemi.groundColor.set(n ? 0x1a2040 : 0xeef0ea);
  hemi.intensity = dark ? (n ? 0.25 : 0.35) : n ? 0.5 : 0.75;
  sun.intensity = dark ? 0.1 : n ? 0.25 : 1.4;
  sun.color.set(n ? 0x8fa0ff : 0xfff1dc);
  scene.environmentIntensity = dark ? 0.35 : n ? 0.45 : 0.7;
  if (R) for (const l of R.lamps) l.intensity = l.userData.base * (n ? 1.35 : 1);
}

// Where everyone is, by phase and story flags.
export function whereIs(who) {
  const p = S.phase;
  if (p === 'd1' || p === 'd2') {
    if (who === 'vesper') return ['spa', 4.6, -0.8];
    if (who === 'cherry') return ['lobby', 1.8, -2.3];
    if (who === 'dex') return ['tech', 2, -1.6];
    if (who === 'juniper') return ['kitchen', -1.8, -1.4];
    if (who === 'opal') return p === 'd2' && has('opal_left') ? null : ['archive', -0.9, -1.6];
  }
  if (p === 'n1' && who === 'cherry') return ['plan', -1.7, -5.9, 0.5];
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
  for (const w in chars) {
    const c = chars[w], at = whereIs(w);
    if (!at) { c.parent && c.parent.remove(c); continue; }
    const R = rooms[at[0]];
    if (c.parent !== R.g) R.g.add(c);
    c.position.set(at[1], at[3] || 0, at[2]);
  }
  applyTime();
}

const tmpV = new THREE.Vector3();
export function update(dt, t, cam) {
  for (const u of updaters) u(dt, t);
  for (const a of arrows) if (a.parent) { a.position.y = a.userData.by + Math.sin(t * 3) * 0.06; }
  for (const w in chars) {
    const c = chars[w]; if (!c.parent || !c.parent.visible) continue;
    const u = c.userData; u.t += dt;
    u.body.scale.y = 1 + Math.sin(u.t * 2.2) * 0.008;
    // turn gently to face the camera
    const want = Math.atan2(cam.position.x - c.position.x, cam.position.z - c.position.z);
    let d = want - c.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    c.rotation.y += d * Math.min(1, dt * 2);
    u.head.rotation.y = Math.sin(u.t * 0.6) * 0.15;
    u.head.rotation.z = Math.sin(u.t * 0.45) * 0.04;
  }
  const X = rooms.star;
  if (X && X.g.visible && X.crown.visible) X.crown.rotation.y = t * 0.4;
}
