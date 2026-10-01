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

export function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function toTex(c, rep, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (rep) t.repeat.set(rep[0], rep[1]);
  return t;
}
export const clamp = v => v < 0 ? 0 : v > 255 ? 255 : v;
export const hexRGB = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

// Build a colour + height canvas pair from a per-pixel function f(x,y) -> [r,g,b,height0..1].
export function pix(w, h, f) {
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
export const done = (P, rep) => ({ map: toTex(P.c, rep), bump: toTex(P.b, rep, false) });

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

/// ---------- Skies seen through windows and the dome ----------
// One panorama: sky above the horizon line, far shore and lake below it. The horizon sits at 0.508 of the height so
// the far shore meets the end of the terrace's water plane (eye 1.6 m, 80 m away is 1.4 degrees below level).
export function sky(isNight) {
  const W = 2048, H = 1024, Y = Math.round(H * 0.508), c = canvas(W, H), g = c.getContext('2d');
  const r = rng(isNight ? 33 : 21);
  const blob = (x, y, rx, ry, rgb, a) => {
    for (const xx of [x, x - W, x + W]) {
      if (xx + rx < 0 || xx - rx > W) continue;
      g.save(); g.translate(xx, y); g.scale(1, ry / rx);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.55, `rgba(${rgb},${a * 0.45})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore();
    }
  };
  const band = (y0, y1, rgb, a0, a1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, `rgba(${rgb},${a0})`); gr.addColorStop(1, `rgba(${rgb},${a1})`); g.fillStyle = gr; g.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0)); };
  // a ridge line that wraps round the panorama (integer frequencies)
  const ridge = (seed, ks) => { const q = rng(seed), ph = ks.map(() => q() * 6.283); return x => { let v = 0, n = 0; ks.forEach((k, i) => { const a = 1 / (1 + i * 0.7); v += a * Math.sin(6.283 * k * x / W + ph[i]); n += a; }); return v / n * 0.5 + 0.5; }; };
  const pine = (x, y, h, w, col) => {
    g.fillStyle = col;
    for (let t = 0; t < 3; t++) { const ty = y - h * (0.18 + t * 0.27), tw = w * (1 - t * 0.28); g.beginPath(); g.moveTo(x, ty - h * 0.42); g.lineTo(x + tw / 2, ty + h * 0.08); g.lineTo(x - tw / 2, ty + h * 0.08); g.closePath(); g.fill(); }
    g.fillRect(x - 0.7, y - h * 0.1, 1.4, h * 0.12);
  };
  const shore = (col, base, amp, seed, ks, pines) => {
    const f = ridge(seed, ks);
    g.fillStyle = col; g.beginPath(); g.moveTo(0, Y + 3);
    for (let x = 0; x <= W; x += 4) g.lineTo(x, Y - base - f(x) * amp);
    g.lineTo(W, Y + 3); g.closePath(); g.fill();
    if (pines) for (let x = 0; x < W; x += 3 + r() * 7) { const yy = Y - base - f(x) * amp + 3, h = pines[0] + r() * pines[1]; pine(x, yy, h, h * 0.42, col); }
  };

  // ----- sky -----
  const gr = g.createLinearGradient(0, 0, 0, Y);
  if (!isNight) {
    gr.addColorStop(0, '#2f5f9e'); gr.addColorStop(0.3, '#4f84bd'); gr.addColorStop(0.6, '#86aed0'); gr.addColorStop(0.85, '#c9d2cc'); gr.addColorStop(1, '#ecdcb8');
  } else {
    gr.addColorStop(0, '#03060f'); gr.addColorStop(0.45, '#0a1230'); gr.addColorStop(0.8, '#1a2650'); gr.addColorStop(1, '#3a4670');
  }
  g.fillStyle = gr; g.fillRect(0, 0, W, Y);
  if (!isNight) {
    // late-afternoon warmth round the sun (up and to the left of the lake) and near the horizon
    blob(W * 0.936, H * 0.2, 520, 330, '255,226,170', 0.42); blob(W * 0.936, H * 0.2, 120, 100, '255,244,215', 0.7);
    band(Y - 150, Y, '255,214,160', 0, 0.3);
    // painted cumulus: shaded bellies first, then sunlit tops leaning towards the sun
    const cloud = (cx, cy, w, h) => {
      const n = 14 + Math.round(w / 22), puffs = [];
      for (let i = 0; i < n; i++) { const dx = (r() * 2 - 1) * w * 0.5, k = 1 - Math.pow(Math.abs(dx) / (w * 0.5), 2); puffs.push([dx, -k * h * (0.25 + r() * 0.75), (0.35 + r() * 0.45) * h * (0.5 + k * 0.7)]); }
      for (const [dx, dy, rr] of puffs) blob(cx + dx, cy + dy * 0.35 + h * 0.12, rr * 1.25, rr * 0.78, '150,168,196', 0.34);
      for (const [dx, dy, rr] of puffs) blob(cx + dx - rr * 0.1, cy + dy, rr * 1.15, rr * 0.82, '250,246,238', 0.5);
      for (const [dx, dy, rr] of puffs) blob(cx + dx - rr * 0.3, cy + dy - rr * 0.22, rr * 0.7, rr * 0.5, '255,252,246', 0.45);
      blob(cx, cy + h * 0.28, w * 0.6, h * 0.16, '210,200,190', 0.18);
    };
    for (let i = 0; i < 26; i++) { const t = r(), cy = H * (0.25 + Math.pow(t, 0.8) * 0.22), s = 0.5 + (1 - t) * 0.9; cloud(r() * W, cy, (140 + r() * 170) * s, (34 + r() * 30) * s * (0.6 + (1 - t) * 0.5)); }
    for (let i = 0; i < 9; i++) blob(r() * W, H * (0.34 + r() * 0.1), 260 + r() * 260, 5 + r() * 6, '255,222,184', 0.22);          // long stratus low down
    for (let i = 0; i < 22; i++) blob(r() * W, H * (0.04 + r() * 0.2), 200 + r() * 260, 3 + r() * 5, '255,255,255', 0.1);          // high cirrus
  } else {
    band(Y - 190, Y, '96,118,168', 0, 0.45); blob(W * 0.1, Y - 8, 700, 60, '150,110,90', 0.16);                                      // town glow far off
    for (let i = 0; i < 70; i++) blob(r() * W, H * 0.04 + Math.abs(Math.sin(r() * 3)) * H * 0.38, 120 + r() * 220, 30 + r() * 40, '170,185,230', 0.035);
    for (let i = 0; i < 2600; i++) { const yy = Math.pow(r(), 0.8) * (Y - 14), a = (0.15 + r() * 0.75) * (1 - yy / Y * 0.55); g.fillStyle = `rgba(${225 + r() * 30},${225 + r() * 25},${215 + r() * 40},${a})`; const s = r() < 0.05 ? 2 : 1; g.fillRect(r() * W, yy, s, s); }
    for (let i = 0; i < 40; i++) { const x = r() * W, y = r() * (Y * 0.7); blob(x, y, 6, 6, '255,245,225', 0.35); }
    blob(W * 0.7, H * 0.4, 190, 190, '170,190,235', 0.22); blob(W * 0.7, H * 0.4, 60, 60, '220,230,250', 0.4);                  // moon halo
    g.fillStyle = '#eee9d4'; g.beginPath(); g.arc(W * 0.7, H * 0.4, 19, 0, 7); g.fill();
    g.fillStyle = 'rgba(150,145,125,.35)'; for (const [dx, dy, rr] of [[-6, -4, 5], [5, 3, 6], [-2, 8, 3.5], [7, -7, 3]]) { g.beginPath(); g.arc(W * 0.7 + dx, H * 0.4 + dy, rr, 0, 7); g.fill(); }
  }
  // ----- far shore: hazy hills, then layers of pines, each paler with distance -----
  const H1 = isNight ? '#0d1530' : '#9bb0c0', H2 = isNight ? '#0a1126' : '#7f9ba5', H3 = isNight ? '#070d1e' : '#5b7a74', H4 = isNight ? '#050914' : '#34503e', H5 = isNight ? '#03060d' : '#223a2a';
  const haze = (a, h) => band(Y - h, Y, isNight ? '48,60,100' : '232,220,196', 0, a);
  shore(H1, 4, 80, 5, [2, 3, 5, 9], null); haze(isNight ? 0.4 : 0.5, 110);
  shore(H2, 3, 54, 8, [3, 7, 11, 17], [8, 6]); haze(isNight ? 0.34 : 0.42, 80);
  shore(H3, 2, 26, 13, [5, 13, 23, 31], [10, 8]); haze(isNight ? 0.25 : 0.3, 54);
  shore(H4, 1, 15, 19, [7, 19, 37, 53], [13, 9]); haze(isNight ? 0.14 : 0.16, 34);
  shore(H5, 0, 7, 27, [11, 29, 61, 79], [17, 12]);
  if (isNight) {   // a light on a far jetty and a few cottage windows
    for (const [u, y] of [[0.57, 4], [0.9, 7], [0.43, 3], [0.2, 5]]) { blob(W * u, Y - y, 16, 12, '255,196,120', 0.55); g.fillStyle = '#ffd89a'; g.fillRect(W * u - 1, Y - y - 1, 2, 2); }
  }
  g.fillStyle = isNight ? '#0d1328' : '#cfc2a2'; g.fillRect(0, Y - 1, W, 3);                                                          // the shingle at the water's edge
  // ----- lake (what the windows show; the terrace lays its own water over the near part) -----
  const lk = g.createLinearGradient(0, Y, 0, H);
  if (!isNight) { lk.addColorStop(0, '#b4c4bc'); lk.addColorStop(0.08, '#7f9ea4'); lk.addColorStop(0.5, '#3f6670'); lk.addColorStop(1, '#25444d'); }
  else { lk.addColorStop(0, '#2a3454'); lk.addColorStop(0.1, '#141c38'); lk.addColorStop(1, '#070b18'); }
  g.fillStyle = lk; g.fillRect(0, Y + 2, W, H - Y);
  g.save(); g.globalAlpha = isNight ? 0.35 : 0.42; g.filter = 'blur(2px)'; g.translate(0, 2 * Y + 2); g.scale(1, -1); g.drawImage(c, 0, Y - 200, W, 200, 0, Y - 200, W, 200); g.restore();
  if (isNight) { g.fillStyle = 'rgba(230,235,210,.35)'; for (let i = 0; i < 90; i++) { const yy = Y + 4 + Math.pow(r(), 1.6) * 190; g.fillRect(W * 0.7 + (r() - 0.5) * (8 + (yy - Y) * 0.35), yy, 8 + r() * 26, 1); } }
  for (let i = 0; i < 700; i++) { const t = Math.pow(r(), 1.5), yy = Y + 4 + t * (H - Y - 4), l = 10 + t * 120 * r() + r() * 20; g.fillStyle = r() < 0.55 ? `rgba(${isNight ? '120,140,190' : '230,240,235'},${(isNight ? 0.12 : 0.17) * (1 - t * 0.4)})` : `rgba(10,30,40,${0.12 + t * 0.1})`; g.fillRect(r() * W, yy, l, 1 + (t > 0.5 ? 1 : 0)); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; return t;
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

// ---------- What the windows see: the grounds round the Aquadome ----------
// kind 'garden': lawn, the gravel walk, box hedges, flowers, clipped cones and lamp posts, woods and hills behind (the
// wings that face away from the lake); 'lawnlake': a flower border and lawn, then the lake and the far shore (the wings
// that face it at an angle). Sky from sky(), so clouds and stars match the rest of the game.
export function view(kind, isNight, skyTex) {
  const W = 1024, H = 512, c = canvas(W, H), g = c.getContext('2d'), r = rng(kind === 'garden' ? 61 : 62);
  const dim = isNight ? 0.28 : 1, col = (h, k = 1) => { const [a, b, d] = hexRGB(h); return `rgb(${a * dim * k | 0},${b * dim * k | 0},${d * dim * k | 0})`; };
  // sky: the top of the game's sky panorama
  const src = skyTex.image; g.drawImage(src, 0, 0, src.width, src.height * 0.5, 0, 0, W, H * 0.6);
  const hz = kind === 'garden' ? 0.6 : 0.5;
  // far hills in haze, then the woods
  g.fillStyle = isNight ? '#141c2a' : '#9fb0b4'; g.beginPath(); g.moveTo(0, H * hz);
  for (let x = 0; x <= W; x += 16) g.lineTo(x, H * (hz - 0.07) - Math.sin(x * 0.006) * 22 - Math.sin(x * 0.017 + 1) * 10); g.lineTo(W, H * hz); g.fill();
  const pine = (x, y, h, k) => { g.fillStyle = col('#2f4a30', k); g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + h * 0.28, y); g.lineTo(x - h * 0.28, y); g.fill(); };
  for (let x = -10; x < W + 10; x += 7 + r() * 9) pine(x, H * (hz + 0.02), 30 + r() * 46, 0.85 + r() * 0.3);
  if (kind === 'lawnlake') {
    // the lake: lighter far off, darker near the shore, ripple lines; the far shore's reflection
    const lk = g.createLinearGradient(0, H * 0.52, 0, H * 0.7);
    lk.addColorStop(0, isNight ? '#1a2638' : '#8fa8b0'); lk.addColorStop(1, isNight ? '#0a1018' : '#41606a');
    g.fillStyle = lk; g.fillRect(0, H * 0.52, W, H * 0.18);
    g.fillStyle = isNight ? 'rgba(200,210,255,.12)' : 'rgba(255,255,255,.22)'; for (let i = 0; i < 70; i++) g.fillRect(r() * W, H * (0.54 + r() * 0.15), 10 + r() * 50, 1);
    g.fillStyle = col('#3e5a38'); g.fillRect(0, H * 0.69, W, H * 0.012);
    for (let i = 0; i < 40; i++) { const x = r() * W; g.strokeStyle = col('#5a6a38'); g.lineWidth = 2; g.beginPath(); g.moveTo(x, H * 0.705); g.lineTo(x + (r() - .5) * 8, H * (0.66 + r() * 0.03)); g.stroke(); }
  }
  // lawn with mown stripes
  const ly = kind === 'garden' ? H * 0.62 : H * 0.7;
  for (let i = 0; i < 9; i++) { const y0 = ly + (H - ly) * Math.pow(i / 9, 1.6), y1 = ly + (H - ly) * Math.pow((i + 1) / 9, 1.6); g.fillStyle = col(i % 2 ? '#6a8a44' : '#7c9a4e'); g.fillRect(0, y0, W, y1 - y0 + 1); }
  if (kind === 'garden') {
    // the gravel walk, clipped cones and lamp posts along it, a box hedge with flowers in front
    g.fillStyle = col('#c8b894'); g.beginPath(); g.moveTo(0, H * 0.74); g.lineTo(W, H * 0.7); g.lineTo(W, H * 0.77); g.lineTo(0, H * 0.82); g.fill();
    for (let i = 0; i < 6; i++) {
      const x = 80 + i * 175 + r() * 30, y = H * (0.72 - i * 0.004);
      if (i % 2) { g.fillStyle = col('#3f5f34'); g.beginPath(); g.moveTo(x, y - 70); g.lineTo(x + 22, y); g.lineTo(x - 22, y); g.fill(); g.fillStyle = col('#cfc6b0'); g.fillRect(x - 14, y, 28, 10); }
      else {
        g.fillStyle = col('#24221e'); g.fillRect(x - 2, y - 80, 4, 80); g.fillRect(x - 7, y - 92, 14, 14);
        if (isNight) { const gl = g.createRadialGradient(x, y - 85, 0, x, y - 85, 60); gl.addColorStop(0, 'rgba(255,200,120,.75)'); gl.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gl; g.fillRect(x - 60, y - 145, 120, 120); g.fillStyle = '#ffe0a0'; g.fillRect(x - 5, y - 90, 10, 10); }
        else { g.fillStyle = '#e8e0c8'; g.fillRect(x - 5, y - 90, 10, 10); }
      }
    }
  }
  // the border right under the window: box hedge and flowers
  g.fillStyle = col('#355a2c'); g.beginPath(); g.moveTo(0, H); g.lineTo(0, H * 0.88);
  for (let x = 0; x <= W; x += 22) g.lineTo(x, H * (0.865 + r() * 0.012)); g.lineTo(W, H); g.fill();
  const FL = ['#d8506a', '#f0d060', '#ffffff', '#9070c8', '#f08848'];
  for (let i = 0; i < 160; i++) { g.fillStyle = col(FL[i % 5], 0.95); g.beginPath(); g.arc(r() * W, H * (0.9 + r() * 0.08), 3 + r() * 4, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
