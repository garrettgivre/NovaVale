// All sound is synthesised with WebAudio, so there are no audio files.
let ctx, master, amb, ambGain, ghost, verb, muted = false;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
  verb = ctx.createConvolver(); verb.buffer = impulse(2.8); const vg = ctx.createGain(); vg.gain.value = 0.5; verb.connect(vg); vg.connect(master);
}

function impulse(sec) {
  const n = ctx.sampleRate * sec, b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); }
  return b;
}

export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.8; }
export const isMuted = () => muted;

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
}

// Soft airy pad; darker at night.
export function ambience(kind) {
  if (!ctx) return;
  if (amb) { const old = amb, og = ambGain; og.gain.setTargetAtTime(0, ctx.currentTime, 0.6); setTimeout(() => old.forEach(o => o.stop()), 3000); }
  const chords = { day: [261.6, 329.6, 392, 493.9], night: [196, 233.1, 293.7, 349.2], tunnel: [110, 164.8, 207.7] }[kind] || [];
  ambGain = ctx.createGain(); ambGain.gain.value = 0; ambGain.gain.setTargetAtTime(kind === 'tunnel' ? 0.05 : 0.035, ctx.currentTime, 1.5);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'day' ? 1800 : 900;
  ambGain.connect(lp); lp.connect(master); const w = ctx.createGain(); w.gain.value = 0.6; lp.connect(w); w.connect(verb);
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
    tone(f, ctx.currentTime, 1.6, 'sine', 0.02, 0.8);
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
