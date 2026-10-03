// Painted figures: characters rebuilt from turnaround art (front | side | back, A-pose) by
// tools/figures. Depth of the front and back views is estimated, fitted to the side silhouette and
// stitched into one closed mesh; each face is textured from the view that sees it best. The mesh is
// rigged in Blender (hips, spine, chest, neck, head, arms) and exported as assets/figures/<who>.glb.
// Here the rig is posed procedurally: arms relaxed out of the A-pose, breathing, weight shift, the head
// following the camera, and talking gestures.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { HEADMAP } from './figheads.js';

// who -> { head: model-space height of the head centre, talk: which arm gestures ('R' | 'L') }
export const FIG = {
  vesper: { head: 1.651, talk: 'L', relax: 0.36 },
  cherry: { head: 1.825, talk: 'R', relax: 0.3 },
  opal: { head: 1.57, talk: 'R', relax: 0.42 },
  juniper: { head: 1.531, talk: 'R', relax: 0.36 },
  dex: { head: 1.663, talk: 'R', relax: 0.3 },
  harper: { head: 1.544, talk: 'R', relax: 0.3 },
  celeste: { head: 1.58, talk: 'R', relax: 0.32 },
  regent: { head: 1.721, talk: 'L', relax: 0.2 },
  gus: { head: 1.619, talk: 'R', relax: 0.24 },
  nate: { head: 1.674, talk: 'R', relax: 0.3 },
  rashad: { head: 1.651, talk: 'R', relax: 0.3 },
  kenji: { head: 1.62, talk: 'R', relax: 0.32 },
  priya: { head: 1.57, talk: 'R', relax: 0.32 },
  silas: { head: 1.637, talk: 'R', relax: 0.3 },
  jojo: { head: 1.658, talk: 'R', relax: 0.3 },
};
// bumped by tools/bump.py so a new deploy's models aren't served from the browser cache
export const ASSET_V = '202610022248';
const loaded = {}, loading = {};
export const figReady = who => !!loaded[who];
// people in the room you're in load now; everyone else queues up and loads one at a time (each model is a few MB)
const queue = []; let busyQ = false;
function pump() {
  if (busyQ || !queue.length) return;
  const [who, cb] = queue.shift(); if (loading[who]) return pump();
  busyQ = true; startLoad(who, cb).finally(() => { busyQ = false; setTimeout(pump, 300); });
}
export function loadFigure(who, onReady, now = true) {
  if (!FIG[who] || loading[who]) return;
  if (!now) { if (!queue.some(q => q[0] === who)) queue.push([who, onReady]); return pump(); }
  startLoad(who, onReady);
}
function startLoad(who, onReady) {
  if (loading[who]) return loading[who];
  loading[who] = new GLTFLoader().loadAsync(`assets/figures/${who}.glb?v=${ASSET_V}`).then(gl => { loaded[who] = gl.scene; onReady && onReady(who); })
    .catch(e => console.warn('figure', who, e));
  return loading[who];
}

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Zax = new THREE.Vector3(0, 0, 1);
const vtmp = new THREE.Vector3();
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), va = new THREE.Vector3(), vb = new THREE.Vector3();

export function buildFigure(who, HIT) {
  const f = FIG[who], g = new THREE.Group(), root = loaded[who];
  g.userData.who = who; g.userData.figure = true; g.userData.yOff = 0;
  g.add(root);
  const bones = {};
  root.traverse(o => {
    if (o.isBone) bones[o.name] = o;
    if (o.isMesh) {
      const old = o.material;
      // matte: the painting already has its lighting; a standard material adds a Fresnel sheen at grazing angles,
      // which lit up the jagged hair outlines as grey-white specks
      // the paintings carry their own lighting: mostly self-lit, with a gentle share of the room's light (rooms lit very
      // differently made the same face look washed out in one and murky in another)
      o.material = new THREE.MeshLambertMaterial({ map: old.map, color: 0x9c9c9c, emissive: 0xffffff, emissiveMap: old.map, emissiveIntensity: 0.52 });
      // blended texturing: TEXCOORD_1/2 look up the side and back paintings, TEXCOORD_3 holds the weights (side, back;
      // the exporter flips V, so back = 1 - y); colour = mix(mix(front, back, wB), side, wS)
      // head sheet: the texture holds a much larger painting of the head below the body sheet. Wherever a lookup lands on
      // a body view's head (above the neck), it reads the head sheet instead, fading in from the neck to the chin.
      const HM = HEADMAP[who];
      // each figure's head lookup is compiled into its shader: give it its own program (three.js would otherwise reuse the
      // first figure's, since every figure's onBeforeCompile looks the same to it)
      o.material.customProgramCacheKey = () => 'fig:' + who;
      if (o.geometry.attributes.uv3) o.material.onBeforeCompile = sh => {
        let hd = 'vec4 hd(vec2 uv) { return texture2D(map, uv); }';
        if (HM) {
          const v = HM.v, f = n => n.toFixed(4);
          sh.uniforms.hV = { value: v.map(r => new THREE.Vector4(r[0], r[1], r[2], r[3])) };
          sh.uniforms.hT = { value: v.map(r => new THREE.Vector4(r[4], r[5], r[6], r[7])) };
          hd = `uniform vec4 hV[${v.length}]; uniform vec4 hT[${v.length}];
vec4 hd(vec2 uv) {
  vec4 base = texture2D(map, uv);
  vec2 A = vec2(${f(HM.A[0] - 1)}, ${f(HM.A[1] - 1)}), p = uv * A;
  for (int i = 0; i < ${v.length}; i++) {
    vec4 r = hV[i];
    if (p.x > r.x && p.x < r.y && p.y < r.w) {
      float w = (1.0 - smoothstep(r.z, r.w, p.y)) * smoothstep(r.x, r.x + 5.0, p.x) * (1.0 - smoothstep(r.y - 5.0, r.y, p.x));
      vec4 t = hT[i];
      return mix(base, texture2D(map, vec2(t.x * p.x + t.z, t.y * p.y + t.w) / A), w);
    }
  }
  return base;
}
// how much of the head a front-view lookup is (1 above the chin, fading out at the neck)
float headW(vec2 uv) {
  vec2 p = uv * vec2(${f(HM.A[0] - 1)}, ${f(HM.A[1] - 1)}); vec4 r = hV[0];
  return step(p.y, r.w) * (1.0 - smoothstep(r.z, r.w, p.y)) * smoothstep(r.x, r.x + 5.0, p.x) * (1.0 - smoothstep(r.y - 5.0, r.y, p.x));
}
// The head is modelled from flat paintings, so each painting is only right from its own direction. Seen from the side
// (or from behind), the sides of the face take the profile painting; seen from the front they keep the front one (the
// profile there put a second eye on the cheek, and the front painting, stretched, smeared the side of the jaw).
float viewSide(vec3 d, vec3 n) {
  float side = max(smoothstep(0.7, 0.92, abs(d.x)), smoothstep(0.05, -0.35, d.z));
  return side * smoothstep(0.12, 0.45, abs(n.x));
}`;
        }
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', `#include <common>
attribute vec2 uv1;
attribute vec2 uv2;
attribute vec2 uv3;
varying vec2 vUvS;
varying vec2 vUvB;
varying vec2 vW;
varying vec3 vON;
varying vec3 vOV;`)
          .replace('#include <uv_vertex>', `#include <uv_vertex>
vUvS = uv1; vUvB = uv2; vW = uv3;`)
          .replace('#include <project_vertex>', `#include <project_vertex>
vON = objectNormal; vOV = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz - transformed;`);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
varying vec2 vUvS;
varying vec2 vUvB;
varying vec2 vW;
varying vec3 vON;
varying vec3 vOV;`)
          .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>
${hd}`)
          .replace('#include <map_fragment>', `float wSv = clamp(vW.x, 0.0, 1.0);
${HM ? 'wSv = mix(wSv, max(wSv, viewSide(normalize(vOV), normalize(vON))), headW(vMapUv));' : ''}
vec4 fcol = mix(mix(hd(vMapUv), hd(vUvB), clamp(1.0 - vW.y, 0.0, 1.0)), hd(vUvS), wSv);
diffuseColor *= fcol;`)
          .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance *= fcol.rgb;');
      };
      o.castShadow = true; o.frustumCulled = false;
    }
  });
  g.updateMatrixWorld(true);
  // rest pose, and each bone's parent orientation in model space (to turn model-space axes into local ones)
  const rest = {}, pq = {};
  for (const k in bones) {
    rest[k] = bones[k].quaternion.clone();
    bones[k].parent.getWorldQuaternion(qa); g.getWorldQuaternion(qb); pq[k] = qb.clone().invert().multiply(qa).invert();
  }
  const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.9, 10), HIT); hb.position.y = 0.95; hb.userData.who = who; hb.userData.nocast = 1; g.add(hb);
  const head = new THREE.Object3D();
  if (bones.head) { bones.head.add(head); va.set(0, f.head, 0.02); g.localToWorld(va); bones.head.worldToLocal(va); head.position.copy(va); }
  else { head.position.set(0, f.head, 0); g.add(head); }
  Object.assign(g.userData, { head, bones, rest, pq, t: Math.random() * 10, look: new THREE.Vector2(), glance: new THREE.Vector2(),
    talk: 0, w: 0, wT: 0, wNext: 3 + Math.random() * 4, gl: 0, glNext: 2 + Math.random() * 4, G: { R: new THREE.Vector3(), L: new THREE.Vector3() },
    gNow: null, gNext: 0, relax: autoRelax(root, bones, f.relax) });
  return g;
}

// How far each arm can come down out of the A-pose before the hand meets the body: sweep the wrist down in the
// picture plane and stop when it is a hand's width from the widest body vertex at that height.
function autoRelax(root, bones, fallback) {
  let mesh = null; root.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
  if (!mesh || !bones.upperR) return { R: fallback, L: fallback };
  const pos = mesh.geometry.attributes.position, si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
  const names = mesh.skeleton.bones.map(b => b.name), arm = new Set(names.map((n, i) => /upper|fore|hand/.test(n) ? i : -1).filter(i => i >= 0));
  const body = [];
  for (let i = 0; i < pos.count; i++) {
    let bi = si.getX(i), bw = sw.getX(i);
    for (const c of ['Y', 'Z', 'W']) if (sw['get' + c](i) > bw) { bw = sw['get' + c](i); bi = si['get' + c](i); }
    if (!arm.has(bi)) { vtmp.fromBufferAttribute(pos, i); mesh.localToWorld(vtmp); root.worldToLocal(vtmp); body.push(vtmp.x, vtmp.y); }
  }
  const out = {};
  for (const [s, sg] of [['R', -1], ['L', 1]]) {
    const S = new THREE.Vector3(), W = new THREE.Vector3();
    bones['upper' + s].getWorldPosition(S); bones['hand' + s].getWorldPosition(W); root.worldToLocal(S); root.worldToLocal(W);
    const dx = W.x - S.x, dy = W.y - S.y;
    let best = 0;
    for (let a = 0; a <= 0.75; a += 0.02) {
      const c = Math.cos(a * -sg), sn = Math.sin(a * -sg), wx = S.x + dx * c - dy * sn, wy = S.y + dx * sn + dy * c;
      let width = 0;
      for (let i = 0; i < body.length; i += 2) if (Math.abs(body[i + 1] - wy) < 0.07 && Math.sign(body[i]) === sg) width = Math.max(width, Math.abs(body[i]));
      if (Math.abs(wx) - width < 0.055) break;
      best = a;
    }
    out[s] = best;
  }
  // keep the stance even: neither arm more than a few degrees lower than the other
  const lo = Math.min(out.R, out.L);
  out.R = Math.min(out.R, lo + 0.05); out.L = Math.min(out.L, lo + 0.05);
  return out;
}

// rotate a bone about model-space axes: rot = [[axis, angle], ...] applied on top of its rest pose
function pose(u, k, rot) {
  const b = u.bones[k]; if (!b) return;
  if (u.dbgAx) rot = rot.filter(([ax]) => (u.dbgAx === 'z' ? ax === Zax : ax !== Zax));
  qa.identity();
  for (const [ax, a] of rot) { if (!a) continue; va.copy(ax).applyQuaternion(u.pq[k]); qb.setFromAxisAngle(va, a); qa.premultiply(qb); }
  b.quaternion.copy(qa).multiply(u.rest[k]);
}

const ease = (cur, tgt, rate, dt) => cur + (tgt - cur) * Math.min(1, dt * rate);
// a soft spring (slightly under-damped): heads settle with a hint of follow-through instead of gliding to a stop
function spring(s, tgt, k, dt) { const a = (tgt - s.x) * k * k - s.v * k * 1.6; s.v += a * dt; s.x += s.v * dt; return s.x; }
const smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
// a slow wandering value (sum of incommensurate sines): reads as living rather than metronomic
const drift = (t, a, b, c) => Math.sin(t * a) * 0.5 + Math.sin(t * b + 1.7) * 0.3 + Math.sin(t * c + 4.1) * 0.2;

// Talking gestures, kept mostly in the picture plane (these models come from paintings, so turning a forearm far
// towards or away from the camera shows it edge-on): [side, lift (forward), open (out to the side), hold seconds]
// (small: a painted arm raised far looks like a scarecrow, and a forearm brought forward shows its edge)
const GESTS = [['R', .2, .26, 1.3], ['L', .2, .26, 1.3], ['B', .16, .18, 1.1], ['R', .3, .14, 1], ['L', .3, .14, 1], ['B', .1, .3, 1.4], ['N', 0, 0, .9], ['N', 0, 0, .7]];

// Who moves how. tempo: how fast they breathe, sway and fidget; sway: how much they shift about; gest: size of their
// talking gestures; chin: resting head pitch (- = chin up); every: seconds between idle habits; acts: their habits
// (weighted); look: how often their eyes wander.
const PERS = {
  vesper: { tempo: .85, sway: .8, gest: 1.1, chin: -.05, every: 7, look: .8, acts: { hip: 3, chinUp: 2, sigh: 2, roll: 1, look: 1 } },
  cherry: { tempo: 1.2, sway: 1.4, gest: 1.4, chin: -.02, every: 4.5, look: 1.2, acts: { hip: 3, shrug: 2, bounce: 2, look: 2, roll: 1 } },
  dex: { tempo: 1.3, sway: .9, gest: .9, chin: .05, every: 3.5, look: 1.8, acts: { fidget: 4, look: 3, down: 2, shrug: 1, roll: 1 } },
  juniper: { tempo: .85, sway: .9, gest: 1, chin: 0, every: 7, look: .8, acts: { sigh: 2, roll: 2, look: 2, hip: 1 } },
  opal: { tempo: .7, sway: .5, gest: .7, chin: -.01, every: 8, look: .7, acts: { up: 3, look: 2, sigh: 2, down: 1 } },
  regent: { tempo: .95, sway: .9, gest: 1.3, chin: -.06, every: 6, look: 1, acts: { hip: 3, chinUp: 3, roll: 1, look: 1 } },
  harper: { tempo: 1, sway: 1, gest: 1.1, chin: -.02, every: 5.5, look: 1.3, acts: { hip: 2, look: 3, roll: 1, shrug: 1 } },
  kenji: { tempo: .75, sway: .35, gest: .6, chin: .06, every: 9, look: .5, acts: { down: 4, roll: 1, sigh: 1 } },
  priya: { tempo: .9, sway: .7, gest: .9, chin: -.02, every: 6.5, look: 1, acts: { up: 4, look: 2, sigh: 1, down: 1 } },
  jojo: { tempo: 1.35, sway: 1.5, gest: 1.4, chin: -.01, every: 3.5, look: 1.5, acts: { bounce: 4, look: 2, shrug: 2, roll: 1 } },
  rashad: { tempo: 1, sway: 1, gest: .9, chin: .04, every: 6, look: 1, acts: { down: 3, shrug: 2, look: 2, roll: 1 } },
  gus: { tempo: .7, sway: .7, gest: .7, chin: .03, every: 8, look: .7, acts: { sigh: 3, roll: 3, look: 1 } },
  silas: { tempo: 1.3, sway: 1.2, gest: 1.3, chin: 0, every: 3.5, look: 2, acts: { look: 4, fidget: 2, bounce: 1, shrug: 1 } },
  nate: { tempo: .8, sway: .7, gest: .8, chin: 0, every: 7, look: 1, acts: { look: 3, roll: 1, sigh: 1 } },
  celeste: { tempo: 1, sway: .8, gest: 1, chin: -.02, every: 6, look: 1, acts: { hip: 1, look: 2, sigh: 1 } },
};
const DEF = { tempo: 1, sway: 1, gest: 1, chin: 0, every: 6, look: 1, acts: { look: 2, roll: 1, sigh: 1 } };
// Idle habits: a duration and an envelope-driven pose. e = 0..1..0 over the action (eased in and out); the pose is an
// offset added on top of the standing pose: yaw/pitch/tilt of the head, chest lean, shoulders up, arm (R/L) out/bend.
const ACTS = {
  // weight onto one hip (the arms stay down: bending an elbow sideways folds the painted arm across the body)
  hip: { d: [4, 7], f: (e, s) => ({ arm: { [s.side]: { open: .06 * e } }, tilt: .05 * e * (s.side === 'R' ? 1 : -1), sway: .6 * e * (s.side === 'R' ? -1 : 1) }) },
  chinUp: { d: [2.5, 4], f: e => ({ pitch: -.08 * e, chest: -.02 * e }) },
  sigh: { d: [2.2, 2.8], f: (e, s) => { const p = s.p; const inh = smooth(p / .4) * (1 - smooth((p - .45) / .45)); return { chest: -.05 * inh, sh: .06 * inh - .02 * smooth((p - .5) / .3) * (1 - smooth((p - .8) / .2)), pitch: .05 * smooth((p - .45) / .3) * e }; } },
  shrug: { d: [1.1, 1.5], f: e => ({ sh: .12 * e, tilt: .06 * e, armBoth: { open: .06 * e } }) },
  roll: { d: [2.2, 3.2], f: (e, s) => ({ tilt: .13 * Math.sin(s.p * Math.PI * 2) * e, pitch: .04 * Math.sin(s.p * Math.PI * 4) * e, sh: .03 * Math.sin(s.p * Math.PI * 2 + 1) * e }) },
  look: { d: [1.8, 3.2], f: (e, s) => ({ yaw: s.dir * .32 * e, pitch: s.dir2 * .06 * e, chestYaw: s.dir * .06 * e }) },
  up: { d: [2.5, 4], f: (e, s) => ({ pitch: -.17 * e, yaw: s.dir * .1 * e, chest: -.015 * e }) },
  down: { d: [2, 3.5], f: (e, s) => ({ pitch: .16 * e, yaw: s.dir * .05 * e, chest: .02 * e }) },
  fidget: { d: [1.4, 2.2], f: (e, s) => ({ armBoth: { open: (.03 + .025 * Math.sin(s.p * 37)) * e }, pitch: .08 * e, tilt: .03 * Math.sin(s.p * 23) * e }) },
  bounce: { d: [1.2, 2], f: (e, s) => ({ bob: .018 * Math.abs(Math.sin(s.p * Math.PI * 3)) * e, tilt: .04 * Math.sin(s.p * Math.PI * 3) * e }) },
};
function pickAct(P) {
  const ks = Object.keys(P.acts), tot = ks.reduce((a, k) => a + P.acts[k], 0);
  let r = Math.random() * tot; for (const k of ks) { r -= P.acts[k]; if (r <= 0) return k; } return ks[0];
}

export function animateFigure(g, dt, cam, speech) {
  const u = g.userData, P = PERS[u.who] || DEF, t = (u.t += dt), T = t * P.tempo;
  const talking = (speech.who === u.who && speech.typing) || !!u.forceG, focused = speech.focus === u.who;   // forceG: a held gesture (testing)
  const listening = focused && !talking && speech.who === 'nova';
  u.talk = ease(u.talk, talking ? 1 : 0, 3, dt);
  u.sp ??= { yaw: { x: 0, v: 0 }, pitch: { x: 0, v: 0 } };
  // ---- the current line: questions tilt the head, exclamations get bigger beats, laughter shakes the shoulders
  if (talking && speech.n !== u.lineN) {
    u.lineN = speech.n; const l = speech.line || '';
    u.q = /\?\s*$/.test(l) ? 1 : 0; u.ex = /!/.test(l) ? 1 : 0; u.laugh = /\b(ha|haha|hah)\b|laughs/i.test(l) ? 1 : 0;
    u.qSide = Math.random() < .5 ? -1 : 1; u.gNext = 0;
  }
  if (!talking) { u.q = ease(u.q || 0, 0, 2, dt); u.ex = ease(u.ex || 0, 0, 2, dt); u.laugh = ease(u.laugh || 0, 0, 1.5, dt); }
  // ---- idle habits (not while talking or being talked to)
  u.actNext ??= 1 + Math.random() * P.every;
  if (!u.act && !talking && !focused && (u.actNext -= dt) < 0) {
    const k = pickAct(P), A = ACTS[k];
    u.act = { k, t: 0, d: A.d[0] + Math.random() * (A.d[1] - A.d[0]), side: Math.random() < .5 ? 'R' : 'L', dir: Math.random() < .5 ? -1 : 1, dir2: Math.random() - .3 };
  }
  let O = {};
  if (u.act) {
    const a = u.act; a.t += dt; a.p = a.t / a.d;
    if (talking || focused) a.t = Math.max(a.t, a.d * .85);   // wrap it up when someone needs them
    const e = smooth(a.p / .25) * (1 - smooth((a.p - .75) / .25));
    O = ACTS[a.k].f(e, a) || {};
    if (a.p >= 1) { u.act = null; u.actNext = P.every * (0.6 + Math.random() * .8); }
  }
  // ---- turning: when the body turns (to face you), the head and chest lead and the feet shuffle
  const rv = (u.rotPrev === undefined ? 0 : Math.atan2(Math.sin(g.rotation.y - u.rotPrev), Math.cos(g.rotation.y - u.rotPrev)) / Math.max(dt, 1e-3));
  u.rotPrev = g.rotation.y; u.turn = ease(u.turn || 0, THREE.MathUtils.clamp(rv, -2, 2), 6, dt);
  const lead = u.turn * 0.22, stepBob = Math.min(1, Math.abs(u.turn) * 1.5) * Math.abs(Math.sin(t * 9)) * 0.012;
  // ---- look: at the camera when it matters, otherwise about their own business; small turns only
  u.head.getWorldPosition(va); vb.copy(cam.position).sub(va);
  g.getWorldQuaternion(qa); vb.applyQuaternion(qa.invert());
  let yaw = Math.atan2(vb.x, vb.z), pitch = Math.atan2(-vb.y, Math.hypot(vb.x, vb.z));
  if ((u.glNext -= dt) < 0) { u.gl = focused || talking ? 0 : (Math.random() < .6 ? 1.6 : 0); u.glance.set((Math.random() - .5) * .6, (Math.random() - .3) * .2); u.glNext = (3 + Math.random() * 5) / P.look; }
  if (!u.near && !focused && !talking) { yaw = 0; pitch = 0.05; }   // not paying you any attention
  if (!u.near && u.gl <= 0 && Math.random() < dt * 0.25 * P.look) { u.gl = 2; u.glance.set((Math.random() - .5) * .7, (Math.random() - .4) * .2); }
  if (u.gl > 0) { u.gl -= dt; yaw += u.glance.x; pitch += u.glance.y; }
  // while talking they glance away now and then to think, and come back to you
  if (talking && (u.thNext = (u.thNext ?? 2) - dt) < 0) { u.th = 0.9; u.thDir = Math.random() < .5 ? -1 : 1; u.thNext = 3 + Math.random() * 4; }
  if (u.th > 0) { u.th -= dt; yaw += u.thDir * .18 * smooth(u.th / .9); pitch -= .05 * smooth(u.th / .9); }
  yaw += (O.yaw || 0) + lead; pitch += P.chin + (O.pitch || 0);
  yaw = THREE.MathUtils.clamp(yaw, -0.38, 0.38); pitch = THREE.MathUtils.clamp(pitch, -0.2, 0.2);
  u.look.x = spring(u.sp.yaw, yaw, 5.5, dt); u.look.y = spring(u.sp.pitch, pitch, 5.5, dt);
  // ---- weight on one leg, then the other; the spine and head counter the hips
  if ((u.wNext -= dt) < 0) { u.wT = u.wT > 0 ? -1 : 1; u.wNext = (5 + Math.random() * 6) / P.tempo; }
  u.w = ease(u.w, u.wT, 0.9 * P.tempo, dt);
  const br = Math.sin(T * 1.35), br2 = Math.sin(T * 1.35 - .6);
  const sw = (drift(T, .37, .23, .61) * .3 + u.w) * P.sway + (O.sway || 0);
  // talking: nods on the beat, bigger on exclamations; a tilt on questions; a listening nod now and then
  if (listening && (u.lnNext = (u.lnNext ?? 1.5) - dt) < 0) { u.ln = 0.7; u.lnNext = 1.8 + Math.random() * 2.5; }
  u.ln = Math.max(0, (u.ln || 0) - dt);
  const nod = u.talk * (0.035 * Math.sin(t * 6.3) + 0.02 * Math.sin(t * 2.3)) * (1 + .6 * (u.ex || 0))
    + (u.ln > 0 ? 0.05 * Math.sin((0.7 - u.ln) / 0.7 * Math.PI) : 0) + (focused && !talking ? 0.012 * Math.sin(t * 1.1) : 0);
  const qTilt = (u.q || 0) * .09 * (u.qSide || 1) + (listening ? .04 * Math.sin(t * .4) : 0);
  const laugh = (u.laugh || 0) * u.talk;
  const lShake = laugh * 0.025 * Math.sin(t * 17) * (0.6 + 0.4 * Math.sin(t * 2.1));
  if (u.bones.hips) { const hp = u.bones.hips.position; hp.x = (u.hipX ??= hp.x) + sw * 0.01; hp.y = (u.hipY ??= hp.y) + (O.bob || 0) + stepBob; }
  pose(u, 'hips', [[Zax, sw * 0.02]]);
  pose(u, 'spine', [[Zax, -sw * 0.028], [X, -0.008 * br + (O.chest || 0) * .5], [Y, lead * .3]]);
  pose(u, 'chest', [[Zax, -sw * 0.012], [X, -0.012 * br + (O.chest || 0) - laugh * .03], [Y, u.look.x * 0.12 + (O.chestYaw || 0) + lead * .4]]);
  pose(u, 'neck', [[Y, u.look.x * 0.35], [X, u.look.y * 0.35]]);
  pose(u, 'head', [[Y, u.look.x * 0.5], [X, u.look.y * 0.55 + nod + lShake * .5],
    [Zax, sw * 0.02 + 0.025 * drift(T, .31, .17, .53) + u.talk * 0.025 * Math.sin(t * 1.9) + qTilt + (O.tilt || 0)]]);
  // talking: pick a gesture now and then and ease into it (questions open the hands, exclamations go bigger)
  if (talking && (u.gNext -= dt) < 0) { u.gNow = GESTS[Math.floor(Math.random() * GESTS.length)]; u.gNext = u.gNow[3] * (0.8 + Math.random() * .5) / Math.sqrt(P.tempo); }
  if (!talking) u.gNow = null;
  if (u.forceG) u.gNow = u.forceG;
  const gk = Math.min(1.3, P.gest * (1 + .25 * (u.ex || 0)));
  if (u.dbgRest) { for (const k of ['shoulderR', 'upperR', 'foreR', 'handR', 'shoulderL', 'upperL', 'foreL', 'handL']) if (u.bones[k]) u.bones[k].quaternion.copy(u.rest[k]); return; }
  for (const s of ['R', 'L']) {
    const G = u.gNow, on = G && (G[0] === s || G[0] === 'B') ? 1 : 0;
    const qOpen = (u.q || 0) * u.talk * .15;
    u.G[s].x = ease(u.G[s].x, on * (G ? G[1] : 0) * gk, 4, dt); u.G[s].y = ease(u.G[s].y, on * (G ? G[2] : 0) * gk + qOpen, 4, dt);
    u.G[s].z = ease(u.G[s].z, on, 4, dt);
    const side = s === 'R' ? 1 : -1, lift = u.G[s].x, open = u.G[s].y, act = u.G[s].z;
    const A = (O.arm && O.arm[s]) || O.armBoth || {}, aOpen = A.open || 0, aBend = A.bend || 0;
    const R = u.relax[s], idle = 0.012 * drift(T + side * 3, .6, .41, .87) * P.sway;
    const shUp = (O.sh || 0) + laugh * 0.02 * Math.abs(Math.sin(t * 17));
    pose(u, 'shoulder' + s, [[Zax, side * (0.015 * br2 + shUp)]]);
    // relaxed: arm down (in the picture plane), a little forward; talking: out to the side and forward
    pose(u, 'upper' + s, [[Zax, side * (R * (1 - act * .35) - open * 0.35 - aOpen + idle)], [X, -0.06 - lift * 0.3]]);
    pose(u, 'fore' + s, [[X, -0.1 - lift * 0.4 - act * 0.15 - act * 0.05 * Math.sin(t * 4.1 + side)], [Zax, side * (0.04 - open * 0.35 + aBend)]]);
    pose(u, 'hand' + s, [[X, -0.03 - act * 0.08 * Math.sin(t * 3.3 + side)], [Zax, -side * (open * 0.12 + aBend * .2)]]);
    if (u.dbgOnly) for (const k of ['shoulder', 'upper', 'fore', 'hand']) if (k !== u.dbgOnly && u.bones[k + s]) u.bones[k + s].quaternion.copy(u.rest[k + s]);
  }
}
