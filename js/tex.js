// Procedural textures in the style of early-2000s pre-rendered adventure games:
// marble, wood, carpet, wallpaper, tile, plaster, fabric, metal. Each returns
// { map, bump } canvas textures (bump is a greyscale height map).
import * as THREE from 'three';

export function rng(seed) {
  let s = (seed * 9301 + 49297) % 233280 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Tileable value noise: lattice of `period` cells that wraps.
function lattice(period, seed) {
  const r = rng(seed), g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const X0 = ((xi % period) + period) % period, Y0 = ((yi % period) + period) % period;
    const X1 = (X0 + 1) % period, Y1 = (Y0 + 1) % period;
    const a = g[Y0 * period + X0], b = g[Y0 * period + X1], c = g[Y1 * period + X0], d = g[Y1 * period + X1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

// Fractal noise field, values roughly 0..1, tileable.
export function fbm(w, h, { scale = 4, oct = 4, seed = 1, sx = 1, sy = 1 } = {}) {
  const out = new Float32Array(w * h);
  const L = [];
  for (let o = 0; o < oct; o++) L.push(lattice(Math.max(1, Math.round(scale * (1 << o))), seed * 31 + o * 7));
  let norm = 0; for (let o = 0; o < oct; o++) norm += 1 / (1 << o);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let o = 0; o < oct; o++) {
      const p = scale * (1 << o);
      v += L[o]((x / w) * Math.round(p) * sx, (y / h) * Math.round(p) * sy) / (1 << o);
    }
    out[y * w + x] = v / norm;
  }
  return out;
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTex(c, rep, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (rep) t.repeat.set(rep[0], rep[1]);
  return t;
}
const clamp = v => v < 0 ? 0 : v > 255 ? 255 : v;
const hexRGB = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

// Build a colour + height canvas pair from a per-pixel function f(x,y) -> [r,g,b,height0..1].
function pix(w, h, f) {
  const c = canvas(w, h), b = canvas(w, h);
  const cx = c.getContext('2d'), bx = b.getContext('2d');
  const ci = cx.createImageData(w, h), bi = bx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, bl, ht] = f(x, y), i = (y * w + x) * 4;
    ci.data[i] = clamp(r); ci.data[i + 1] = clamp(g); ci.data[i + 2] = clamp(bl); ci.data[i + 3] = 255;
    const hv = clamp(ht * 255); bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = hv; bi.data[i + 3] = 255;
  }
  cx.putImageData(ci, 0, 0); bx.putImageData(bi, 0, 0);
  return { c, b, cx, bx };
}
const done = (P, rep) => ({ map: toTex(P.c, rep), bump: toTex(P.b, rep, false) });

// ---------- Stone and tile ----------
export function marble({ base = '#e9e2d3', vein = '#8a8173', tiles = 2, inlay = null, seed = 3, rep } = {}) {
  const S = 512, N = fbm(S, S, { scale: 3, oct: 5, seed }), N2 = fbm(S, S, { scale: 8, oct: 3, seed: seed + 5 });
  const B = hexRGB(base), V = hexRGB(vein), ts = S / tiles, r = rng(seed);
  const tint = Array.from({ length: tiles * tiles }, () => 0.94 + r() * 0.1);
  const P = pix(S, S, (x, y) => {
    const n = N[y * S + x], n2 = N2[y * S + x];
    const tx = Math.floor(x / ts), ty = Math.floor(y / ts), k = tint[ty * tiles + tx];
    const vv = Math.abs(Math.sin((x * 0.9 + y * 0.6) * 0.018 + n * 11));
    const vein = Math.pow(1 - vv, 12) * 0.75 + Math.pow(1 - Math.abs(Math.sin((x - y) * 0.03 + n2 * 14)), 30) * 0.4;
    const shade = (0.9 + n * 0.18) * k;
    const gx = x % ts, gy = y % ts, grout = gx < 2 || gy < 2 || gx > ts - 2 || gy > ts - 2;
    if (grout) return [B[0] * 0.55, B[1] * 0.53, B[2] * 0.5, 0.2];
    let col = [0, 1, 2].map(i => B[i] * shade * (1 - vein) + V[i] * vein);
    if (inlay) {
      const I = hexRGB(inlay), m = Math.min(gx, gy, ts - gx, ts - gy);
      if (m > 12 && m < 17) col = I.map(c => c * (0.85 + n * 0.3));
    }
    return [...col, 0.85 + n2 * 0.1];
  });
  return done(P, rep);
}

export function tiles({ base = '#6fa9a4', grout = '#c9c2b0', n = 8, vary = 0.12, seed = 4, grime = 0.35, rep } = {}) {
  const S = 512, N = fbm(S, S, { scale: 6, oct: 4, seed }), ts = S / n, r = rng(seed);
  const B = hexRGB(base), G = hexRGB(grout);
  const tint = Array.from({ length: n * n }, () => 1 - vary / 2 + r() * vary);
  const P = pix(S, S, (x, y) => {
    const gx = x % ts, gy = y % ts, e = Math.min(gx, gy, ts - gx, ts - gy), nn = N[y * S + x];
    if (e < 2.5) return G.map(c => c * (0.8 - grime * 0.5 * nn)).concat(0.15);
    const k = tint[Math.floor(y / ts) * n + Math.floor(x / ts)];
    const edge = e < 6 ? 0.9 + e * 0.017 : 1;
    const dirt = 1 - grime * Math.max(0, nn - 0.55) * 0.9;
    return [B[0] * k * edge * dirt, B[1] * k * edge * dirt, B[2] * k * edge * dirt, 0.8 + (e < 6 ? -0.2 + e * 0.03 : 0)];
  });
  return done(P, rep);
}

export function concrete({ base = '#7c7a74', seed = 9, rep } = {}) {
  const S = 256, N = fbm(S, S, { scale: 4, oct: 6, seed }), B = hexRGB(base);
  return done(pix(S, S, (x, y) => { const n = N[y * S + x]; const k = 0.75 + n * 0.5; return [B[0] * k, B[1] * k, B[2] * k, n]; }), rep);
}

// ---------- Wood ----------
export function wood({ base = '#7a4a26', dark = '#3e2412', planks = 6, vertical = false, seams = true, seed = 5, rep } = {}) {
  const S = 512, N = fbm(S, S, { scale: 2, oct: 4, seed, sx: vertical ? 6 : 1, sy: vertical ? 1 : 6 });
  const A = hexRGB(base), D = hexRGB(dark), ph = S / planks, r = rng(seed);
  const off = Array.from({ length: planks }, () => r()), tint = Array.from({ length: planks }, () => 0.85 + r() * 0.3);
  const P = pix(S, S, (x, y) => {
    const u = vertical ? y : x, v = vertical ? x : y;
    const p = Math.floor(v / ph), n = N[y * S + x];
    const grain = 0.5 + 0.5 * Math.sin((v % ph) * 0.35 + n * 18 + off[p] * 40);
    const ring = Math.pow(grain, 3);
    const k = tint[p];
    let col = [0, 1, 2].map(i => (A[i] * (1 - ring * 0.45) + D[i] * ring * 0.45) * k);
    let h = 0.6 + grain * 0.2;
    if (seams) {
      const sv = v % ph, su = (u + off[p] * S) % S;
      if (sv < 2 || su < 2) { col = col.map(c => c * 0.45); h = 0.1; }
    }
    return [...col, h];
  });
  return done(P, rep);
}

// ---------- Walls ----------
export function wallpaper({ base = '#c9b98f', ink = '#a8945f', stripe = false, seed = 6, rep } = {}) {
  const S = 256, N = fbm(S, S, { scale: 3, oct: 4, seed }), B = hexRGB(base);
  const P = pix(S, S, (x, y) => { const n = N[y * S + x], k = 0.9 + n * 0.14; return [B[0] * k, B[1] * k, B[2] * k, 0.5]; });
  const g = P.cx;
  g.fillStyle = ink; g.strokeStyle = ink; g.globalAlpha = 0.55;
  if (stripe) { for (let x = 0; x < S; x += 32) { g.fillRect(x, 0, 3, S); g.fillRect(x + 8, 0, 1, S); } }
  // damask: a fleur motif on a half-drop grid
  const fleur = (cx, cy, s) => {
    g.save(); g.translate(cx, cy); g.scale(s, s);
    g.beginPath();
    g.moveTo(0, -30); g.bezierCurveTo(12, -18, 12, -4, 0, 6); g.bezierCurveTo(-12, -4, -12, -18, 0, -30);
    g.moveTo(0, 6); g.bezierCurveTo(18, -2, 30, 8, 22, 20); g.bezierCurveTo(16, 12, 8, 12, 0, 16);
    g.moveTo(0, 6); g.bezierCurveTo(-18, -2, -30, 8, -22, 20); g.bezierCurveTo(-16, 12, -8, 12, 0, 16);
    g.moveTo(-4, 16); g.lineTo(4, 16); g.lineTo(2, 30); g.lineTo(-2, 30); g.closePath();
    g.fill(); g.restore();
  };
  for (let yy = 0; yy <= 2; yy++) for (let xx = 0; xx <= 2; xx++) {
    fleur(xx * 128, yy * 128 + 32, 1.1); fleur(xx * 128 + 64, yy * 128 + 96, 1.1);
  }
  g.globalAlpha = 1;
  // stains
  const r = rng(seed);
  for (let i = 0; i < 5; i++) { const x = r() * S, y = r() * S, rr = 20 + r() * 50, gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(80,60,30,.08)'); gr.addColorStop(1, 'rgba(80,60,30,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
  return done(P, rep);
}

export function plaster({ base = '#d8cfbd', seed = 7, rep } = {}) {
  const S = 256, N = fbm(S, S, { scale: 4, oct: 5, seed }), B = hexRGB(base);
  return done(pix(S, S, (x, y) => { const n = N[y * S + x], k = 0.88 + n * 0.2; return [B[0] * k, B[1] * k, B[2] * k, n]; }), rep);
}

// ---------- Carpet ----------
export function carpet({ base = '#6b1f2a', a = '#b08a3e', b = '#1f4a4a', seed = 8, rep, stars = false } = {}) {
  const S = 256, N = fbm(S, S, { scale: 32, oct: 2, seed }), B = hexRGB(base);
  const P = pix(S, S, (x, y) => { const n = N[y * S + x], k = 0.82 + n * 0.3; return [B[0] * k, B[1] * k, B[2] * k, n]; });
  const g = P.cx;
  if (stars) {
    const r = rng(seed);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = [a, b, '#d8d0c0'][i % 3]; g.globalAlpha = 0.7;
      const x = r() * S, y = r() * S, s = 2 + r() * 3;
      g.beginPath(); for (let k = 0; k < 10; k++) { const an = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? s * 0.45 : s; g.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); } g.fill();
    }
  } else {
    g.globalAlpha = 0.85; g.lineWidth = 3;
    for (const [cx, cy] of [[0, 0], [128, 128], [256, 0], [0, 256], [256, 256]]) {
      g.strokeStyle = a; g.beginPath(); g.moveTo(cx, cy - 56); g.lineTo(cx + 56, cy); g.lineTo(cx, cy + 56); g.lineTo(cx - 56, cy); g.closePath(); g.stroke();
      g.fillStyle = b; g.beginPath(); g.moveTo(cx, cy - 30); g.lineTo(cx + 30, cy); g.lineTo(cx, cy + 30); g.lineTo(cx - 30, cy); g.closePath(); g.fill();
      g.fillStyle = a; g.beginPath(); g.arc(cx, cy, 9, 0, 7); g.fill();
    }
    g.strokeStyle = b; g.lineWidth = 2;
    for (const [cx, cy] of [[128, 0], [0, 128], [256, 128], [128, 256]]) { g.beginPath(); g.arc(cx, cy, 14, 0, 7); g.stroke(); }
  }
  g.globalAlpha = 1;
  // fuzz over the pattern
  const id = g.getImageData(0, 0, S, S), r = rng(seed + 1);
  for (let i = 0; i < id.data.length; i += 4) { const k = 0.85 + r() * 0.3; id.data[i] *= k; id.data[i + 1] *= k; id.data[i + 2] *= k; }
  g.putImageData(id, 0, 0);
  return done(P, rep);
}

// ---------- Fabric and metal ----------
export function fabric({ base = '#5a3a5e', seed = 10, weave = 4, rep } = {}) {
  const S = 128, N = fbm(S, S, { scale: 8, oct: 3, seed }), B = hexRGB(base);
  return done(pix(S, S, (x, y) => {
    const w = ((x % weave) < weave / 2) !== ((y % weave) < weave / 2) ? 1 : 0.86;
    const k = w * (0.9 + N[y * S + x] * 0.2);
    return [B[0] * k, B[1] * k, B[2] * k, w * 0.6];
  }), rep);
}

export function brushed({ base = '#b8b4aa', seed = 11, rep } = {}) {
  const S = 256, N = fbm(S, S, { scale: 2, oct: 5, seed, sx: 1, sy: 40 }), B = hexRGB(base);
  return done(pix(S, S, (x, y) => { const n = N[y * S + x], k = 0.85 + n * 0.3; return [B[0] * k, B[1] * k, B[2] * k, n]; }), rep);
}

export function hair({ base = '#2a1d16', seed = 12 } = {}) {
  const S = 128, N = fbm(S, S, { scale: 2, oct: 5, seed, sx: 1, sy: 30 }), B = hexRGB(base);
  return done(pix(S, S, (x, y) => { const n = N[y * S + x], k = 0.7 + n * 0.6; return [B[0] * k, B[1] * k, B[2] * k, n]; }), [2, 2]);
}

export function paper({ base = '#efe6cf', seed = 13 } = {}) {
  const S = 256, N = fbm(S, S, { scale: 6, oct: 4, seed }), B = hexRGB(base);
  return pix(S, S, (x, y) => { const n = N[y * S + x], k = 0.92 + n * 0.1; return [B[0] * k, B[1] * k, B[2] * k, n]; }).c;
}

// ---------- Leaves (alpha) for potted palms ----------
export function frond() {
  const c = canvas(128, 512), g = c.getContext('2d');
  g.strokeStyle = '#4a5a2a'; g.lineWidth = 4; g.beginPath(); g.moveTo(64, 510); g.quadraticCurveTo(70, 250, 64, 0); g.stroke();
  for (let i = 0; i < 26; i++) {
    const y = 490 - i * 18, len = 56 * Math.sin((i / 26) * Math.PI) + 8;
    for (const s of [-1, 1]) {
      const gr = g.createLinearGradient(64, y, 64 + s * len, y - 30);
      gr.addColorStop(0, '#3f5f22'); gr.addColorStop(1, '#6f8f3a');
      g.fillStyle = gr; g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(64 + s * len * 0.6, y - 4, 64 + s * len, y - 34); g.quadraticCurveTo(64 + s * len * 0.5, y - 12, 64, y - 8); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- Engraved brass plaque / painted sign ----------
export function plaque(text, { w = 512, h = 128, bg = '#b08a3e', fg = '#3a2a10', font = 'Cinzel', size = 0.42 } = {}) {
  const c = canvas(w, h), g = c.getContext('2d'), B = hexRGB(bg);
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, `rgb(${B.map(v => clamp(v + 40)).join(',')})`); gr.addColorStop(0.5, bg); gr.addColorStop(1, `rgb(${B.map(v => clamp(v - 50)).join(',')})`);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(40,25,5,.6)'; g.lineWidth = 4; g.strokeRect(8, 8, w - 16, h - 16);
  g.font = `600 ${Math.round(h * size)}px ${font}, Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,240,200,.45)'; g.fillText(text, w / 2 + 1, h / 2 + 3);
  g.fillStyle = fg; g.fillText(text, w / 2, h / 2 + 1);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// ---------- Skies seen through windows and the dome ----------
export function sky(isNight) {
  const W = 1024, H = 512, c = canvas(W, H), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, H * 0.52);
  if (!isNight) { gr.addColorStop(0, '#5f86b0'); gr.addColorStop(0.6, '#a9bfcf'); gr.addColorStop(1, '#e3d8c0'); }
  else { gr.addColorStop(0, '#05070f'); gr.addColorStop(0.6, '#141b33'); gr.addColorStop(1, '#2a2c42'); }
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  if (!isNight) {
    const N = fbm(256, 64, { scale: 4, oct: 5, seed: 21, sx: 1, sy: 1 });
    const id = g.getImageData(0, 0, W, Math.floor(H * 0.5));
    for (let y = 0; y < id.height; y++) for (let x = 0; x < W; x++) {
      const n = N[Math.floor(y / id.height * 64) * 256 + Math.floor(x / W * 256)];
      const cl = Math.max(0, (n - 0.5) * 2.6) * (1 - y / id.height * 0.6), i = (y * W + x) * 4;
      id.data[i] += (245 - id.data[i]) * cl; id.data[i + 1] += (238 - id.data[i + 1]) * cl; id.data[i + 2] += (228 - id.data[i + 2]) * cl;
    }
    g.putImageData(id, 0, 0);
  } else {
    const r = rng(33);
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(255,250,235,${0.2 + r() * 0.7})`; g.fillRect(r() * W, r() * H * 0.48, 1, 1); }
    const mg = g.createRadialGradient(W * 0.72, H * 0.16, 0, W * 0.72, H * 0.16, 60);
    mg.addColorStop(0, 'rgba(240,235,210,.5)'); mg.addColorStop(1, 'rgba(240,235,210,0)'); g.fillStyle = mg; g.fillRect(W * 0.72 - 60, H * 0.16 - 60, 120, 120);
    g.fillStyle = '#f2ecd6'; g.beginPath(); g.arc(W * 0.72, H * 0.16, 11, 0, 7); g.fill();
  }
  // lake and a treeline on the far shore
  const lake = g.createLinearGradient(0, H * 0.52, 0, H);
  if (!isNight) { lake.addColorStop(0, '#7f97a0'); lake.addColorStop(1, '#3e5660'); } else { lake.addColorStop(0, '#1a2233'); lake.addColorStop(1, '#070a12'); }
  g.fillStyle = lake; g.fillRect(0, H * 0.52, W, H);
  const r = rng(44);
  g.fillStyle = isNight ? '#070a10' : '#34452e';
  g.beginPath(); g.moveTo(0, H * 0.53);
  for (let x = 0; x <= W; x += 6) g.lineTo(x, H * 0.53 - 6 - r() * 16 - Math.sin(x * 0.01) * 8);
  g.lineTo(W, H * 0.53); g.closePath(); g.fill();
  if (!isNight) { g.fillStyle = 'rgba(255,255,255,.12)'; for (let i = 0; i < 40; i++) g.fillRect(r() * W, H * (0.55 + r() * 0.4), 20 + r() * 60, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function starDome(opal) {
  const W = 2048, H = 1024, c = canvas(W, H), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, H);
  if (opal) { gr.addColorStop(0, '#120c24'); gr.addColorStop(1, '#2c1e40'); } else { gr.addColorStop(0, '#02030a'); gr.addColorStop(1, '#0a0f22'); }
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const r = rng(opal ? 5 : 2);
  // milky way band
  for (let i = 0; i < 1400; i++) {
    const x = r() * W, y = H * 0.35 + Math.sin(x / W * Math.PI * 2) * H * 0.18 + (r() - 0.5) * 140;
    g.fillStyle = `rgba(200,200,230,${r() * 0.05})`; g.beginPath(); g.arc(x, y, 6 + r() * 20, 0, 7); g.fill();
  }
  for (let i = 0; i < 3200; i++) {
    g.fillStyle = `rgba(${230 + r() * 25},${225 + r() * 30},${210 + r() * 45},${0.2 + r() * 0.8})`;
    const s = r() < 0.03 ? 2.5 : r() < 0.2 ? 1.6 : 1; g.fillRect(r() * W, r() * H * 0.95, s, s);
  }
  if (opal) {
    g.strokeStyle = 'rgba(210,180,110,.55)'; g.lineWidth = 2;
    for (let k = 0; k < 8; k++) {
      let x = r() * W, y = 120 + r() * H * 0.6; g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 4; j++) { x += (r() - 0.5) * 180; y += (r() - 0.5) * 100; g.lineTo(x, y); }
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function textCanvas(w, h, draw) {
  const c = canvas(w, h); draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
