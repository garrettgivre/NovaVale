// All sound is synthesised with WebAudio, so there are no audio files.
let ctx, master, music, amb, ambGain, ghost, verb, muted = false, musicOn = true, lastAmb = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
  music = ctx.createGain(); music.gain.value = musicOn ? 1 : 0; music.connect(master);
  verb = ctx.createConvolver(); verb.buffer = impulse(2.8); const vg = ctx.createGain(); vg.gain.value = 0.5; verb.connect(vg); vg.connect(master);
}

function impulse(sec) {
  const n = ctx.sampleRate * sec, b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); }
  return b;
}

export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.8; }
export const isMuted = () => muted;
// Music (the ambient score) can be switched off on its own; sound effects and the "ghost" stay.
export function setMusic(on) { musicOn = on; if (music) music.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.3); }
export const isMusic = () => musicOn;

function tone(f, t0, dur, type = 'sine', vol = 0.15, wet = 0.3) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(verb); }
  o.start(t0); o.stop(t0 + dur + 0.05);
}

export function sfx(k) {
  if (!ctx) return;
  const t = ctx.currentTime;
  if (k === 'click') tone(880, t, 0.08, 'sine', 0.06, 0.1);
  else if (k === 'take') [784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.07, 0.4, 'sine', 0.1));
  else if (k === 'solve') [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.09, 0.9, 'triangle', 0.1));
  else if (k === 'fail') [330, 262].forEach((f, i) => tone(f, t + i * 0.12, 0.35, 'triangle', 0.08));
  else if (k === 'ring') for (let i = 0; i < 4; i++) tone(i % 2 ? 1320 : 1760, t + i * 0.09, 0.08, 'square', 0.04, 0);
  else if (k === 'door') {
    const n = ctx.createBufferSource(), b = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / d.length) * Math.PI);
    n.buffer = b; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(1600, t + 0.5);
    const g = ctx.createGain(); g.gain.value = 0.18; n.connect(f); f.connect(g); g.connect(master); n.start(t);
  } else if (k === 'switch') tone(180, t, 0.05, 'square', 0.1, 0);
  else if (k === 'bad') [220, 207, 196, 185].forEach((f, i) => tone(f, t + i * 0.25, 0.6, 'sawtooth', 0.05));
  // music cues: a breakthrough (an alibi, a confession), nightfall, morning
  else if (k === 'reveal') [[392, 0], [494, .16], [587, .32], [784, .5]].forEach(([f, d]) => tone(f, t + d, 1.4, 'sine', 0.07, 0.7));
  else if (k === 'night') [[294, 0], [262, .5], [220, 1.0], [196, 1.6]].forEach(([f, d]) => { tone(f, t + d, 2.4, 'triangle', 0.05, 0.9); tone(f / 2, t + d, 2.4, 'sine', 0.04, 0.6); });
  else if (k === 'dawn') [[262, 0], [330, .35], [392, .7], [523, 1.05], [659, 1.4]].forEach(([f, d]) => tone(f, t + d, 2.2, 'sine', 0.05, 0.8));
}

// Soft airy pad; darker at night.
export function ambience(kind) {
  if (!ctx) return;
  if (amb) { const old = amb, og = ambGain; og.gain.setTargetAtTime(0, ctx.currentTime, 0.6); setTimeout(() => old.forEach(o => o.stop()), 3000); }
  const chords = { day: [261.6, 329.6, 392, 493.9], night: [196, 233.1, 293.7, 349.2], tunnel: [110, 164.8, 207.7] }[kind] || [];
  ambGain = ctx.createGain(); ambGain.gain.value = 0; ambGain.gain.setTargetAtTime(kind === 'tunnel' ? 0.05 : 0.035, ctx.currentTime, 1.5);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'day' ? 1800 : 900;
  ambGain.connect(lp); lp.connect(music);
  amb = chords.map((f, i) => {
    const o = ctx.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = f; o.detune.value = (i - 1.5) * 6;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07 + i * 0.03; lg.gain.value = 0.5;
    const g = ctx.createGain(); g.gain.value = 0.5; lfo.connect(lg); lg.connect(g.gain);
    o.connect(g); g.connect(ambGain); o.start(); lfo.start();
    return o;
  });
  clearInterval(ambience.chime);
  if (kind === 'day') ambience.chime = setInterval(() => {
    if (Math.random() < 0.5) return;
    const f = [1047, 1175, 1319, 1568, 1760][Math.floor(Math.random() * 5)];
    if (musicOn) tone(f, ctx.currentTime, 1.6, 'sine', 0.02, 0.8);
  }, 2400);
}

// The "ghost": a wordless voice singing over the old speakers. vol 0..1, tinny through speakers.
const MELODY = [[392, 1], [440, 0.5], [523, 1.5], [494, 0.5], [440, 1], [392, 2], [330, 1], [392, 1], [440, 2.5], [0, 1.5]];
export function ghostVoice(on, vol = 1, near = false) {
  if (!ctx) return;
  if (!on) { if (ghost) { ghost.g.gain.setTargetAtTime(0, ctx.currentTime, 0.3); const G = ghost; setTimeout(() => { G.src.stop(); clearInterval(G.iv); }, 1500); ghost = null; } return; }
  if (!ghost) {
    const src = ctx.createOscillator(); src.type = 'sawtooth';
    const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5.2; vg.gain.value = 7; vib.connect(vg); vg.connect(src.frequency);
    const env = ctx.createGain(); env.gain.value = 0;
    const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(); f1.type = f2.type = 'bandpass';
    f1.frequency.value = 350; f1.Q.value = 8; f2.frequency.value = 800; f2.Q.value = 10;
    const tin = ctx.createBiquadFilter(); tin.type = 'highpass'; tin.frequency.value = 300;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(env); env.connect(f1); env.connect(f2); f1.connect(tin); f2.connect(tin); tin.connect(g); g.connect(master);
    const w = ctx.createGain(); w.gain.value = 1.2; g.connect(w); w.connect(verb);
    src.start(); vib.start();
    let i = 0, next = ctx.currentTime + 0.2;
    const iv = setInterval(() => {
      while (next < ctx.currentTime + 0.5) {
        const [f, d] = MELODY[i % MELODY.length], len = d * 0.62;
        if (f) {
          src.frequency.setValueAtTime(f, next);
          env.gain.setTargetAtTime(0.9, next, 0.08); env.gain.setTargetAtTime(0, next + len * 0.85, 0.12);
        }
        next += len; i++;
      }
    }, 120);
    ghost = { src, g, tin, iv };
  }
  ghost.g.gain.setTargetAtTime(0.5 * vol, ctx.currentTime, 0.4);
  ghost.tin.frequency.setTargetAtTime(near ? 120 : 600, ctx.currentTime, 0.2);
}

// ---------- Room sound and footsteps (all synthesised) ----------
// The environment has its own bus, so it plays with the music switched off (only "All sound" silences it).
let envBus, noiseBuf, bed = null;
function envOut() {
  if (!envBus) { envBus = ctx.createGain(); envBus.gain.value = 1; envBus.connect(master); }
  return envBus;
}
function noise() {
  if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; return n;
}
// building blocks of a room's bed: each returns its nodes (to stop) and adds to the bed's output gain
function layer(B, kind, vol, o = {}) {
  const g = ctx.createGain(); g.gain.value = vol; g.connect(B.out);
  if (kind === 'water' || kind === 'wind' || kind === 'fan' || kind === 'rumble') {
    const n = noise(), f = ctx.createBiquadFilter();
    f.type = kind === 'fan' ? 'lowpass' : kind === 'rumble' ? 'lowpass' : 'bandpass';
    f.frequency.value = { water: 900, wind: 420, fan: 700, rumble: 140 }[kind]; f.Q.value = kind === 'wind' ? 0.7 : 0.9;
    n.connect(f); f.connect(g); n.start(); B.nodes.push(n);
    if (kind === 'water' || kind === 'wind') {   // slow swell
      const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = kind === 'wind' ? 0.07 : 0.23; lg.gain.value = vol * 0.6; l.connect(lg); lg.connect(g.gain); l.start(); B.nodes.push(l);
      const l2 = ctx.createOscillator(), lg2 = ctx.createGain(); l2.frequency.value = kind === 'wind' ? 0.05 : 0.31; lg2.gain.value = kind === 'wind' ? 260 : 300; l2.connect(lg2); lg2.connect(f.frequency); l2.start(); B.nodes.push(l2);
    }
  } else if (kind === 'hum') {
    for (const [f, a] of [[o.f || 60, 1], [(o.f || 60) * 2, 0.5], [(o.f || 60) * 3, 0.2]]) { const s = ctx.createOscillator(), sg = ctx.createGain(); s.frequency.value = f; sg.gain.value = a; s.connect(sg); sg.connect(g); s.start(); B.nodes.push(s); }
  }
  return g;
}
// occasional sounds on a timer: chirps, crickets, ticks, drips, bubbles, a disk click
function every(B, ms, fn) { B.timers.push(setInterval(() => { if (ctx && !muted) fn(ctx.currentTime); }, ms)); }
function blip(t, f, f2, dur, vol, type = 'sine', wet = 0.25) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
  o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(envOut()); if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(verb); }
  o.start(t); o.stop(t + dur + 0.05);
}
function click(t, vol, f = 2400, dur = 0.02) {
  const n = noise(), bp = ctx.createBiquadFilter(), g = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 3;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); n.connect(bp); bp.connect(g); g.connect(envOut()); n.start(t); n.stop(t + dur + 0.02);
}
const R_ = () => Math.random();
const BEDS = {
  lobby: (B, n, p) => { if (p !== 'n2') layer(B, 'water', 0.05); every(B, 7000, t => { if (R_() < 0.4) blip(t, 140 + R_() * 40, 120, 0.4, 0.012, 'triangle', 0.8); }); },   // the fountain, the dome creaking
  spa: B => { layer(B, 'water', 0.07); every(B, 900, t => { if (R_() < 0.35) blip(t, 1300 + R_() * 900, 600, 0.12, 0.03, 'sine', 0.9); }); },
  plan: (B, n) => { layer(B, 'hum', 0.012, { f: 50 }); layer(B, 'fan', n ? 0.01 : 0.02); },
  kitchen: (B, n) => { layer(B, 'hum', 0.014, { f: 100 }); if (!n) every(B, 260, t => { if (R_() < 0.5) blip(t, 160 + R_() * 120, 90, 0.08, 0.02, 'sine', 0.2); }); },   // fridge, a pot simmering
  tech: B => { layer(B, 'fan', 0.03); layer(B, 'hum', 0.008, { f: 120 }); every(B, 3000, t => { if (R_() < 0.4) { click(t, 0.05, 1800); click(t + 0.07, 0.04, 1500); } }); },
  archive: B => { every(B, 1000, t => click(t, 0.05, 3200, 0.015)); },
  suite: (B, n) => { if (n) every(B, 600, t => { if (R_() < 0.6) for (let k = 0; k < 3; k++) blip(t + k * 0.05, 4400, 0, 0.03, 0.006, 'sine', 0); }); },
  wing: B => { every(B, 1600, t => click(t, 0.03, 1400, 0.03)); },
  terrace: (B, n) => {
    layer(B, 'wind', 0.04); layer(B, 'water', 0.025);
    if (n) every(B, 520, t => { if (R_() < 0.7) for (let k = 0; k < 3; k++) blip(t + k * 0.045, 4300 + R_() * 300, 0, 0.03, 0.012, 'sine', 0); });
    else every(B, 1800, t => { if (R_() < 0.5) { const f = 2600 + R_() * 1600; for (let k = 0; k < 2 + (R_() * 3 | 0); k++) blip(t + k * 0.11, f, f * (1.2 + R_() * 0.3), 0.08, 0.02, 'sine', 0.4); } });
  },
  tunnel: B => { layer(B, 'rumble', 0.05); every(B, 1100, t => { if (R_() < 0.5) blip(t, 900 + R_() * 700, 400, 0.15, 0.035, 'sine', 1); }); },
  star: B => { layer(B, 'rumble', 0.02); every(B, 1500, t => click(t, 0.025, 2600, 0.02)); },
};
export function roomSound(room, isNight, phase) {
  if (!ctx) return;
  if (bed) { const old = bed; old.out.gain.setTargetAtTime(0, ctx.currentTime, 0.4); old.timers.forEach(clearInterval); setTimeout(() => old.nodes.forEach(n => { try { n.stop(); } catch (e) { } }), 2500); }
  const B = { out: ctx.createGain(), nodes: [], timers: [] };
  B.out.gain.value = 0; B.out.gain.setTargetAtTime(1, ctx.currentTime, 0.8); B.out.connect(envOut());
  (BEDS[room] || (() => { }))(B, isNight, phase);
  bed = B;
}
// footsteps: a short burst shaped by what's underfoot
const STEP = {
  marble: [2600, 1.2, 0.06, 0.09, 0.35], tile: [3000, 1.4, 0.05, 0.08, 0.3], wood: [420, 1.4, 0.09, 0.12, 0.25], carpet: [380, 0.8, 0.07, 0.05, 0.05],
  stone: [1400, 1.0, 0.07, 0.09, 0.2], gravel: [3600, 0.7, 0.12, 0.08, 0.1], grass: [1800, 0.5, 0.1, 0.035, 0.05], concrete: [900, 1.0, 0.07, 0.1, 0.6],
};
let stepAlt = 0;
export function step(surface) {
  if (!ctx || muted) return;
  const [f, q, dur, vol, wet] = STEP[surface] || STEP.marble, t = ctx.currentTime;
  stepAlt = 1 - stepAlt;
  const n = noise(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
  bp.type = 'bandpass'; bp.frequency.value = f * (stepAlt ? 1 : 0.9) * (0.95 + Math.random() * 0.1); bp.Q.value = q;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(bp); bp.connect(g); g.connect(envOut()); if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(verb); }
  n.start(t, Math.random() * 1.5); n.stop(t + dur + 0.05);
  if (surface === 'gravel') for (let k = 1; k < 4; k++) click(t + k * 0.018, vol * 0.5, 3000 + Math.random() * 2000, 0.012);
  if (surface === 'wood') blip(t, 110, 80, 0.08, vol * 0.4, 'sine', 0);
}
