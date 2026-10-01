// Painted figures: characters rebuilt from turnaround art (front | side | back, A-pose) by
// tools/figures. Depth of the front and back views is estimated, fitted to the side silhouette and
// stitched into one closed mesh; each face is textured from the view that sees it best. The mesh is
// rigged in Blender (hips, spine, chest, neck, head, arms) and exported as assets/figures/<who>.glb.
// Here the rig is posed procedurally: arms relaxed out of the A-pose, breathing, weight shift, the head
// following the camera, and talking gestures.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

// who -> { head: model-space height of the head centre, talk: which arm gestures ('R' | 'L') }
export const FIG = {
  vesper: { head: 1.632, talk: 'L', relax: 0.36 },
  cherry: { head: 1.714, talk: 'R', relax: 0.3 },
  opal: { head: 1.553, talk: 'R', relax: 0.42 },
  juniper: { head: 1.51, talk: 'R', relax: 0.36 },
  dex: { head: 1.633, talk: 'R', relax: 0.3 },
  harper: { head: 1.54, talk: 'R', relax: 0.3 },
  celeste: { head: 1.577, talk: 'R', relax: 0.32 },
  regent: { head: 1.72, talk: 'L', relax: 0.2 },
  gus: { head: 1.614, talk: 'R', relax: 0.24 },
  nate: { head: 1.67, talk: 'R', relax: 0.3 },
  rashad: { head: 1.647, talk: 'R', relax: 0.3 },
  kenji: { head: 1.618, talk: 'R', relax: 0.32 },
  priya: { head: 1.553, talk: 'R', relax: 0.32 },
};
// bumped by tools/bump.py so a new deploy's models aren't served from the browser cache
export const ASSET_V = '202609301946';
const loaded = {}, loading = {};
export const figReady = who => !!loaded[who];
export function loadFigure(who, onReady) {
  if (!FIG[who] || loading[who]) return;
  loading[who] = new GLTFLoader().loadAsync(`assets/figures/${who}.glb?v=${ASSET_V}`).then(gl => { loaded[who] = gl.scene; onReady && onReady(who); })
    .catch(e => console.warn('figure', who, e));
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
      o.material = new THREE.MeshLambertMaterial({ map: old.map, emissive: 0xffffff, emissiveMap: old.map, emissiveIntensity: 0.3 });
      // blended texturing: TEXCOORD_1/2 look up the side and back paintings, TEXCOORD_3 holds the weights (side, back;
      // the exporter flips V, so back = 1 - y); colour = mix(mix(front, back, wB), side, wS)
      if (o.geometry.attributes.uv3) o.material.onBeforeCompile = sh => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', `#include <common>
attribute vec2 uv1;
attribute vec2 uv2;
attribute vec2 uv3;
varying vec2 vUvS;
varying vec2 vUvB;
varying vec2 vW;`)
          .replace('#include <uv_vertex>', `#include <uv_vertex>
vUvS = uv1; vUvB = uv2; vW = uv3;`);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
varying vec2 vUvS;
varying vec2 vUvB;
varying vec2 vW;`)
          .replace('#include <map_fragment>', `vec4 fcol = mix(mix(texture2D(map, vMapUv), texture2D(map, vUvB), clamp(1.0 - vW.y, 0.0, 1.0)), texture2D(map, vUvS), clamp(vW.x, 0.0, 1.0));
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
  qa.identity();
  for (const [ax, a] of rot) { if (!a) continue; va.copy(ax).applyQuaternion(u.pq[k]); qb.setFromAxisAngle(va, a); qa.premultiply(qb); }
  b.quaternion.copy(qa).multiply(u.rest[k]);
}

const ease = (cur, tgt, rate, dt) => cur + (tgt - cur) * Math.min(1, dt * rate);
// Talking gestures, kept mostly in the picture plane (these models come from paintings, so turning a forearm far
// towards or away from the camera shows it edge-on): [side, lift (forward), open (out to the side), hold seconds]
const GESTS = [['R', .35, .5, 1.3], ['L', .35, .5, 1.3], ['B', .3, .35, 1.1], ['R', .55, .25, 1], ['L', .55, .25, 1], ['B', .15, .6, 1.4], ['N', 0, 0, .9]];

export function animateFigure(g, dt, cam, speech) {
  const u = g.userData, t = (u.t += dt);
  const talking = speech.who === u.who && speech.typing, focused = speech.focus === u.who;
  u.talk = ease(u.talk, talking ? 1 : 0, 3, dt);
  // look: at the camera when it matters, otherwise now and then somewhere else; small turns only
  u.head.getWorldPosition(va); vb.copy(cam.position).sub(va);
  g.getWorldQuaternion(qa); vb.applyQuaternion(qa.invert());
  let yaw = Math.atan2(vb.x, vb.z), pitch = Math.atan2(-vb.y, Math.hypot(vb.x, vb.z));
  if ((u.glNext -= dt) < 0) { u.gl = focused || talking ? 0 : (Math.random() < .6 ? 1.6 : 0); u.glance.set((Math.random() - .5) * .6, (Math.random() - .3) * .2); u.glNext = 3 + Math.random() * 5; }
  if (!u.near && !focused && !talking) { yaw = 0; pitch = 0.05; }   // not paying you any attention: look about their own business
  if (!u.near && u.gl <= 0 && Math.random() < dt * 0.25) { u.gl = 2; u.glance.set((Math.random() - .5) * .7, (Math.random() - .4) * .2); }
  if (u.gl > 0) { u.gl -= dt; yaw += u.glance.x; pitch += u.glance.y; }
  yaw = THREE.MathUtils.clamp(yaw, -0.35, 0.35); pitch = THREE.MathUtils.clamp(pitch, -0.18, 0.18);
  u.look.x = ease(u.look.x, yaw, 3.5, dt); u.look.y = ease(u.look.y, pitch, 3.5, dt);
  // weight on one leg, then the other; the spine and head counter the hips
  if ((u.wNext -= dt) < 0) { u.wT = u.wT > 0 ? -1 : 1; u.wNext = 5 + Math.random() * 6; }
  u.w = ease(u.w, u.wT, 0.9, dt);
  const br = Math.sin(t * 1.35), br2 = Math.sin(t * 1.35 - .6), sw = Math.sin(t * .37) * .3 + u.w;
  const nod = u.talk * (0.035 * Math.sin(t * 6.3) + 0.02 * Math.sin(t * 2.3)) + (focused && !talking ? 0.015 * Math.sin(t * 1.1) : 0);
  if (u.bones.hips) u.bones.hips.position.x = (u.hipX ??= u.bones.hips.position.x) + sw * 0.01;
  pose(u, 'hips', [[Zax, sw * 0.02]]);
  pose(u, 'spine', [[Zax, -sw * 0.028], [X, -0.008 * br]]);
  pose(u, 'chest', [[Zax, -sw * 0.012], [X, -0.012 * br], [Y, u.look.x * 0.12]]);
  pose(u, 'neck', [[Y, u.look.x * 0.35], [X, u.look.y * 0.35]]);
  pose(u, 'head', [[Y, u.look.x * 0.5], [X, u.look.y * 0.55 + nod], [Zax, sw * 0.02 + 0.025 * Math.sin(t * 0.31) + u.talk * 0.025 * Math.sin(t * 1.9)]]);
  // talking: pick a gesture now and then and ease into it
  if (talking && (u.gNext -= dt) < 0) { u.gNow = GESTS[Math.floor(Math.random() * GESTS.length)]; u.gNext = u.gNow[3] * (0.8 + Math.random() * .5); }
  if (!talking) u.gNow = null;
  for (const s of ['R', 'L']) {
    const G = u.gNow, on = G && (G[0] === s || G[0] === 'B') ? 1 : 0;
    u.G[s].x = ease(u.G[s].x, on * (G ? G[1] : 0), 4, dt); u.G[s].y = ease(u.G[s].y, on * (G ? G[2] : 0), 4, dt);
    u.G[s].z = ease(u.G[s].z, on, 4, dt);
    const side = s === 'R' ? 1 : -1, lift = u.G[s].x, open = u.G[s].y, act = u.G[s].z;
    const R = u.relax[s], idle = 0.012 * Math.sin(t * 0.6 + side);
    pose(u, 'shoulder' + s, [[Zax, side * 0.015 * br2]]);
    // relaxed: arm down (in the picture plane), a little forward; talking: out to the side and forward
    pose(u, 'upper' + s, [[Zax, side * (R * (1 - act * .35) - open * 0.35 + idle)], [X, -0.06 - lift * 0.3]]);
    pose(u, 'fore' + s, [[X, -0.1 - lift * 0.4 - act * 0.15 - act * 0.05 * Math.sin(t * 4.1 + side)], [Zax, side * (0.04 - open * 0.35)]]);
    pose(u, 'hand' + s, [[X, -0.03 - act * 0.08 * Math.sin(t * 3.3 + side)], [Zax, -side * open * 0.12]]);
  }
}
