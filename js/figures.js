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
};
const loaded = {}, loading = {};
export const figReady = who => !!loaded[who];
export function loadFigure(who, onReady) {
  if (!FIG[who] || loading[who]) return;
  loading[who] = new GLTFLoader().loadAsync(`assets/figures/${who}.glb`).then(gl => { loaded[who] = gl.scene; onReady && onReady(who); })
    .catch(e => console.warn('figure', who, e));
}

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Zax = new THREE.Vector3(0, 0, 1);
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
      o.material = new THREE.MeshStandardMaterial({ map: old.map, roughness: 0.8, metalness: 0,
        emissive: 0xffffff, emissiveMap: old.map, emissiveIntensity: 0.3 });
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
  Object.assign(g.userData, { head, bones, rest, pq, t: Math.random() * 10, look: new THREE.Vector2(), talk: 0, gest: 0, gT: 0 });
  return g;
}

// rotate a bone about model-space axes: rot = [[axis, angle], ...] applied on top of its rest pose
function pose(u, k, rot) {
  const b = u.bones[k]; if (!b) return;
  qa.identity();
  for (const [ax, a] of rot) { if (!a) continue; va.copy(ax).applyQuaternion(u.pq[k]); qb.setFromAxisAngle(va, a); qa.premultiply(qb); }
  b.quaternion.copy(qa).multiply(u.rest[k]);
}

export function animateFigure(g, dt, cam, speech) {
  const u = g.userData, f = FIG[u.who], t = (u.t += dt);
  const talking = speech.who === u.who && speech.typing, focused = speech.focus === u.who;
  u.talk += ((talking ? 1 : 0) - u.talk) * Math.min(1, dt * 3);
  // head: turn towards the camera, within limits
  u.head.getWorldPosition(va); vb.copy(cam.position).sub(va);
  g.getWorldQuaternion(qa); vb.applyQuaternion(qa.invert());
  const yaw = THREE.MathUtils.clamp(Math.atan2(vb.x, vb.z), -0.7, 0.7), pitch = THREE.MathUtils.clamp(Math.atan2(-vb.y, Math.hypot(vb.x, vb.z)), -0.35, 0.35);
  u.look.x += (yaw - u.look.x) * Math.min(1, dt * 3); u.look.y += (pitch - u.look.y) * Math.min(1, dt * 3);
  const br = Math.sin(t * 1.5), sway = Math.sin(t * 0.42), nod = u.talk * 0.05 * Math.sin(t * 6.5) + (focused ? 0.02 * Math.sin(t * 1.3) : 0);
  pose(u, 'hips', [[Zax, sway * 0.015], [Y, Math.sin(t * 0.3) * 0.03]]);
  pose(u, 'spine', [[X, -0.01 * br], [Zax, -sway * 0.02]]);
  pose(u, 'chest', [[X, -0.012 * br], [Y, u.look.x * 0.15]]);
  pose(u, 'neck', [[Y, u.look.x * 0.3], [X, u.look.y * 0.3]]);
  pose(u, 'head', [[Y, u.look.x * 0.45], [X, u.look.y * 0.5 + nod], [Zax, 0.04 * Math.sin(t * 0.37) + u.talk * 0.03 * Math.sin(t * 2.1)]]);
  // arms: down out of the A-pose, a small swing; the talking arm lifts the forearm and moves
  const R = f.relax;
  u.gT += dt; const gest = u.talk * (0.5 + 0.5 * Math.sin(u.gT * 1.7));
  for (const s of ['R', 'L']) {
    const side = s === 'R' ? 1 : -1, act = s === f.talk ? gest : 0;
    pose(u, 'shoulder' + s, [[Zax, side * 0.02 * br]]);
    pose(u, 'upper' + s, [[Zax, side * (R - act * 0.12) + side * 0.015 * br], [X, -0.05 - act * 0.35 + 0.02 * Math.sin(t * 0.6 + side)]]);
    pose(u, 'fore' + s, [[X, -0.12 - act * (0.9 + 0.2 * Math.sin(u.gT * 4.3))], [Zax, side * 0.05]]);
    pose(u, 'hand' + s, [[X, -0.05 - act * 0.2 * Math.sin(u.gT * 5.1)]]);
  }
}
