// Engine: renderer + a period post-process (soft resolution, warm grade, grain, vignette),
// the first-person camera at fixed spots, conversation close-ups, input, the main loop.
import * as THREE from 'three';
import { S, load, newGame, hasSave, save, PHASE_NAME, SLOTS, slotInfo, setSlot, latestSlot, currentSlot } from './state.js';
import { computeBoundsTree, acceleratedRaycast } from '../vendor/three-mesh-bvh.js';
import { buildWorld, rebuildEnv, showRoom, NODES, rooms, chars, sync, update, showArrows, roomOf, headOf, hotspotsOnScreen } from './world.js';
import { prepareCast } from './people.js';
import { FIG } from './figures.js';
import * as story from './story.js';
import * as ui from './ui.js';
import { initAudio, sfx, setMuted, isMuted, setMusic, isMusic, step } from './audio.js';
import { ITEMS, icon } from './items.js';

const EYE = 1.62, PITCH0 = -0.07;
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 200);
camera.rotation.order = 'YXZ';

// ---------- Post-process ----------
// Two looks: "retro" (default) renders the 3D view at about 640 px on its long side, then shows it with
// chunky pixels, 15-bit colour with ordered dithering and faint scanlines, like a 2003 game on a CRT;
// "smooth" is a soft ~0.9 MP render. The models are the same either way, and the UI stays sharp.
const pref = (k, d) => { try { const v = localStorage.getItem('novavale.' + k); return v === null ? d : v === '1'; } catch (e) { return d; } };
const setPref = (k, v) => { try { localStorage.setItem('novavale.' + k, v ? '1' : '0'); } catch (e) { } };
let RETRO = pref('retro', true);
let rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 2 });
const post = new THREE.ShaderMaterial({
  uniforms: { tD: { value: rt.texture }, uT: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uRetro: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D tD; uniform float uT; uniform vec2 uRes; uniform float uRetro; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
    float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
    void main(){
      vec2 px = 1.0 / uRes;
      vec2 uv = uRetro > 0.5 ? (floor(vUv * uRes) + 0.5) / uRes : vUv;
      vec3 c = texture2D(tD, uv).rgb;
      if (uRetro < 0.5) {
        vec3 s = (texture2D(tD, uv + vec2(px.x, 0.)).rgb + texture2D(tD, uv - vec2(px.x, 0.)).rgb
                + texture2D(tD, uv + vec2(0., px.y)).rgb + texture2D(tD, uv - vec2(0., px.y)).rgb) * 0.25;
        c = mix(c, s, 0.42);
      }
      vec3 glow = vec3(0.);
      for (int i = 0; i < 8; i++) { float a = float(i) * 0.785; glow += max(texture2D(tD, uv + vec2(cos(a), sin(a)) * px * (uRetro > 0.5 ? 3.0 : 7.0)).rgb - 1.15, 0.0); }   // lamps only (white clothes haloed)
      c += glow * 0.1;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 0.8);
      c *= vec3(1.07, 1.0, 0.88);
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      vec2 d = vUv - 0.5;
      gl_FragColor.rgb *= mix(0.55, 1.0, smoothstep(0.85, 0.25, length(d * vec2(1.0, 0.92))));
      gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(1.0, 0.97, 0.9) + vec3(0.02, 0.012, 0.0), 0.6);
      vec2 lp = floor(vUv * uRes);
      if (uRetro > 0.5) {
        gl_FragColor.rgb += (hash(lp + fract(uT) * 91.0) - 0.5) * 0.03;
        gl_FragColor.rgb = floor(gl_FragColor.rgb * 31.0 + bayer4(lp)) / 31.0;              // 15-bit colour, dithered
        gl_FragColor.rgb *= 1.0 - 0.16 * smoothstep(0.5, 1.0, fract(vUv.y * uRes.y));       // faint scanlines
      } else gl_FragColor.rgb += (hash(lp + fract(uT) * 91.0) - 0.5) * 0.045;
    }`,
  depthTest: false, depthWrite: false,
});
const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));

function resize() {
  const w = innerWidth, h = innerHeight, a = w / h;
  if (RETRO) {
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    const k = 640 / Math.max(w, h), lw = Math.round(w * k), lh = Math.round(h * k);
    rt.setSize(lw, lh); post.uniforms.uRes.value.set(lw, lh);
  } else {
    // about half a megapixel: soft, like a pre-rendered game at 800x600 (and it hides small seams in the painted models)
    const pr = Math.min(devicePixelRatio || 1, Math.sqrt(480000 / (w * h)));
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    const bw = Math.round(w * pr), bh = Math.round(h * pr);
    rt.setSize(bw, bh); post.uniforms.uRes.value.set(bw, bh);
  }
  post.uniforms.uRetro.value = RETRO ? 1 : 0;
  camera.aspect = a;
  const hf = 64 * Math.PI / 180;
  FOV0 = camera.fov = a < 1 ? Math.min(88, 2 * Math.atan(Math.tan(hf / 2) / a) * 180 / Math.PI) : 58;
  camera.updateProjectionMatrix();
}
let FOV0 = 58;
addEventListener('resize', resize);

// ---------- Camera state ----------
const V = { yaw: 0, pitch: PITCH0, yawT: null, move: null, node: null, busy: false, focus: null, title: false };
const yawTo = (from, x, z) => Math.atan2(-(x - from[0]), -(z - from[1]));
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const basePitch = () => innerWidth < innerHeight ? -0.14 : PITCH0;

function place(nodeId, look) {
  const n = NODES[nodeId];
  V.node = nodeId; S.node = nodeId; V.walk = null; mark.material.opacity = 0;
  if (V.focus) { V.focus = null; camera.fov = FOV0; camera.updateProjectionMatrix(); } V.inspect = null; ui.speech.focus = null; V.doorReady = null; V.pitchT = null;
  camera.position.set(n.p[0], EYE, n.p[1]);
  const l = look || n.look;
  V.yaw = yawTo(n.p, l[0], l[1]); V.pitch = basePitch(); V.yawT = null;
  S.yaw = V.yaw;
  showArrows(nodeId);
}

async function go(nodeId, { fade = false, look } = {}) {
  if (V.busy || V.focus) return;
  const from = NODES[V.node], to = NODES[nodeId];
  ui.hideCaption(); ui.tip(null);
  if (fade || !from || from.room !== to.room) {
    V.busy = true; sfx('door');
    await ui.fade(() => { showRoom(to.room); sync(); place(nodeId, look); story.onRoom(to.room); refresh(); });
    V.busy = false;
    return;
  }
  V.busy = true;
  for (const R of Object.values(rooms)) R.g.children.filter(c => c.userData.go).forEach(c => R.g.remove(c));
  const d = Math.hypot(to.p[0] - from.p[0], to.p[1] - from.p[1]);
  const here = [camera.position.x, camera.position.z];
  V.move = { a: here, b: [...to.p], t: 0, dur: Math.min(1.4, Math.max(0.6, d * 0.22)), y0: V.yaw, y1: yawTo(here, to.p[0], to.p[1]), p0: V.pitch, id: nodeId };
}

function turn(dir) {
  if (V.busy || V.focus) return;
  sfx('click');
  V.yawT = (V.yawT ?? V.yaw) + dir * Math.PI / 2;
}

// Conversation close-up: glide in to frame the character's head and shoulders.
function focus(who) {
  const h = headOf(who); if (!h) return;
  ui.speech.focus = who;
  const from = { p: camera.position.clone(), yaw: V.yaw, pitch: V.pitch };
  const dir = new THREE.Vector3(camera.position.x - h.x, 0, camera.position.z - h.z).normalize();
  // a portrait lens, level and straight on: a narrow field of view from further back (a close wide-angle camera
  // distorts faces), framing the head and upper body above the text box
  const portrait = innerWidth < innerHeight, cover = portrait ? 1.45 : 1.15, fov = portrait ? 32 : 24;
  const cy = h.y - cover * 0.22;
  let dist = cover / (2 * Math.tan(fov * Math.PI / 360));
  // don't back the camera through a wall or a piece of furniture
  const R = roomOf();
  if (R) {
    ray.camera = camera;   // sprites (lamp glows) need it
    ray.set(new THREE.Vector3(h.x, cy, h.z), dir); ray.far = dist + 0.3;
    const hit = ray.intersectObject(R.g, true).find(x => x.object.visible && x.object.material && x.object.material.visible !== false && !(function up(o) { for (; o; o = o.parent) if (o.userData.who) return true; return false; })(x.object));
    if (hit) dist = Math.max(1.2, hit.distance - 0.25);
    ray.far = Infinity;
  }
  const p = new THREE.Vector3(h.x + dir.x * dist, cy, h.z + dir.z * dist);
  V.focus = { from, to: { p, yaw: Math.atan2(-(h.x - p.x), -(h.z - p.z)), pitch: 0, fov }, t: 0, dir: 1 };
}
function unfocus() { ui.speech.focus = null; if (V.focus) { V.focus.dir = -1; } }

// ---------- Picking ----------
const ray = new THREE.Raycaster();
let pickObj = null;   // the tagged object the last pick hit
const ndc = new THREE.Vector2();
function pick(x, y) {
  const R = roomOf(); if (!R) return null;
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  for (const h of ray.intersectObject(R.g, true)) {
    if (h.distance > 14) break;
    let hidden = false, tagged = null;
    for (let p = h.object; p; p = p.parent) {
      if (!p.visible) { hidden = true; break; }
      if (!tagged && (p.userData.hot || p.userData.who || p.userData.go)) tagged = p;
    }
    if (hidden) continue;
    const m = h.object.material;
    if (!tagged && m && m.transparent && m.opacity < 0.4) continue;
    pickObj = tagged; return tagged ? tagged.userData : null;
  }
  return null;
}
// screen-edge turning is for mice only (on touch screens a tap near the edge should walk there)
const edge = (x, e) => (e && e.pointerType !== 'mouse') ? 0 : x < innerWidth * 0.06 ? 1 : x > innerWidth * 0.94 ? -1 : 0;
// where on the floor a screen point lands (or null): the first visible surface hit must face upwards and be in reach
const _n = new THREE.Vector3();
function floorAt(x, y) {
  const R = roomOf(); if (!R) return null;
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  for (const h of ray.intersectObject(R.g, true)) {
    if (h.distance > 16) return null;
    let hidden = false; for (let p = h.object; p; p = p.parent) if (!p.visible || p.userData.who) { hidden = true; break; }
    const m = h.object.material; if (hidden || !m || m.visible === false || (m.transparent && m.opacity < 0.4)) continue;
    if (!h.face) return null;
    _n.copy(h.face.normal).transformDirection(h.object.matrixWorld);
    return _n.y > 0.75 && h.point.y < 0.8 ? h.point.clone() : null;
  }
  return null;
}
// a small ring where you clicked
const mark = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.22, 32), new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0, depthWrite: false }));
mark.rotation.x = -Math.PI / 2; mark.userData.nocast = 1; mark.renderOrder = 5;
function walkTo(p) {
  V.doorReady = null;
  V.walk = { x: p.x, z: p.z, stuck: 0 };
  scene.add(mark); mark.position.set(p.x, p.y + 0.02, p.z); mark.material.opacity = 0.9; mark.scale.setScalar(1);
}

// Things and doors are walked up to. A door: walk to it and face it, so its sign is in front of you; tap again (now
// close) to go through. A thing: walk up if it's far, then a close-up on it while it's described or its panel is open.
const isDoor = h => /^(door_|exit_)/.test(h) || h === 'hatch';
const _c = new THREE.Vector3(), _bx = new THREE.Box3();
function walkNear(x, z, stop) {
  return new Promise(res => {
    const p = camera.position, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d <= stop + 0.05) return res();
    walkTo(new THREE.Vector3(x - dx / d * stop, 0, z - dz / d * stop));
    const t0 = performance.now(), iv = setInterval(() => { if (!V.walk || performance.now() - t0 > 7000) { clearInterval(iv); V.walk = null; res(); } }, 50);
  });
}
function faceTo(x, z, pitch = basePitch()) { V.yawT = V.yaw + angDiff(V.yaw, yawTo([camera.position.x, camera.position.z], x, z)); V.pitchT = pitch; }
async function activate(u, obj = pickObj) {
  if (!u) return;
  sfx('click');
  if (u.go) return go(u.go);
  if (u.who) return story.onTalk(u.who);
  if (!u.hot) return;
  if (!obj) return story.onHot(u.hot);
  _bx.setFromObject(obj); _bx.getCenter(_c);
  const c = _c.clone(), size = _bx.getSize(new THREE.Vector3()), far = Math.hypot(c.x - camera.position.x, c.z - camera.position.z);
  if (isDoor(u.hot)) {
    // first tap: step up to the door (if needed) and face its sign; a second tap on the same door goes through
    if (V.doorReady !== u.hot) {
      if (far > 1.9) { V.approach = true; await walkNear(c.x, c.z, 1.6); V.approach = false; }
      faceTo(c.x, c.z, -0.02);
      V.doorReady = u.hot;
      ui.caption(u.name ? `${u.name} · tap the door again to go in` : 'Tap the door again to go in', 2600);
      return;
    }
    V.doorReady = null;
    return story.onHot(u.hot);
  }
  // a thing: walk over if it's out of reach, then look closely
  const reach = Math.max(1.3, Math.min(2.4, Math.max(size.x, size.z) * 1.2 + 0.9));
  if (far > reach + 0.5) { V.approach = true; await walkNear(c.x, c.z, reach); V.approach = false; }
  inspect(c, size);
  story.onHot(u.hot);
}
// a close-up on a thing: the camera moves in on it (like a conversation close-up) and comes back when you're done
function inspect(c, size) {
  const span = Math.max(size.x, size.y, size.z, 0.12), dir = new THREE.Vector3(camera.position.x - c.x, 0, camera.position.z - c.z);
  if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1); dir.normalize();
  const fov = Math.max(24, Math.min(46, FOV0 * 0.72)), dist = Math.max(0.55, Math.min(2.2, span * 0.75 / Math.tan(fov * Math.PI / 360) + 0.15));
  const lift = Math.min(0.9, 0.25 + dist * 0.35), p = new THREE.Vector3(c.x + dir.x * dist, Math.max(0.45, Math.min(1.8, c.y + lift)), c.z + dir.z * dist);
  const from = { p: camera.position.clone(), yaw: V.yaw, pitch: V.pitch };
  V.focus = { from, to: { p, yaw: Math.atan2(-(c.x - p.x), -(c.z - p.z)), pitch: Math.atan2(c.y - p.y, Math.hypot(c.x - p.x, c.z - p.z)), fov }, t: 0, dir: 1 };
  V.inspect = { t: 0 };
}
// end the close-up once nothing is being said or shown any more
function inspectStep(dt) {
  const I = V.inspect; if (!I || !V.focus) { V.inspect = null; return; }
  I.t += dt;
  const busy = ui.talking() || ui.panelOpen() || $('#caption').classList.contains('on') || document.querySelector('#screen.on');
  if (busy) I.quiet = 0; else if ((I.quiet = (I.quiet || 0) + dt) > 0.35 && I.t > 0.9) { V.inspect = null; unfocus(); }
}

// ---------- Input ----------
let down = null;
canvas.addEventListener('pointerdown', e => {
  initAudio();
  down = { x: e.clientX, y: e.clientY, yaw: V.yaw, pitch: V.pitch, moved: false, id: e.pointerId };
  canvas.setPointerCapture(e.pointerId);
  // touch: press and hold to show everything you can tap
  if (e.pointerType !== 'mouse') { const dn = down; setTimeout(() => { if (down === dn && !dn.moved) { dn.longp = true; $('#btnReveal').onclick(); } }, 550); }
});
canvas.addEventListener('pointermove', e => {
  if (down && down.id === e.pointerId) {
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.hypot(dx, dy) > 6) down.moved = true;
    if (down.moved && !V.busy && !V.focus && !ui.talking() && !V.title) {
      V.yawT = null; V.pitchT = null;
      V.yaw = down.yaw + dx * 0.005;
      V.pitch = Math.max(-0.7, Math.min(0.5, down.pitch + dy * 0.004));
    }
    return;
  }
  if (e.pointerType !== 'mouse' || V.busy || V.focus || ui.talking() || V.title) { canvas.className = ''; return; }
  const u = pick(e.clientX, e.clientY), ed = edge(e.clientX, e);
  canvas.className = u ? (u.go ? 'c-go' : u.who ? 'c-talk' : 'c-look') : ed > 0 ? 'c-left' : ed < 0 ? 'c-right' : floorAt(e.clientX, e.clientY) ? 'c-walk' : '';
  ui.tip(u ? (u.who ? ui.PEOPLE[u.who].n : u.name || '') : null, e.clientX, e.clientY);
});
canvas.addEventListener('pointerup', e => {
  if (!down || down.id !== e.pointerId) return;
  const d = down; down = null;
  if (d.moved || V.busy || V.approach || V.focus || ui.talking() || ui.panelOpen() || V.title) return;
  if (d.longp) return;
  const touch = e.pointerType !== 'mouse';
  const u = pick(e.clientX, e.clientY) || (touch ? pickNear(e.clientX, e.clientY) : null);
  if (u) { if (touch && navigator.vibrate) try { navigator.vibrate(8); } catch (er) { } return activate(u); }
  const ed = edge(e.clientX, e);
  if (ed) return turn(ed);
  const f = floorAt(e.clientX, e.clientY);
  if (f) {
    initAudio();
    // a second tap on the floor soon after the first, near it: run there
    const now = performance.now(), run = lastTap && now - lastTap.t < 420 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 70;
    lastTap = run ? null : { t: now, x: e.clientX, y: e.clientY };
    walkTo(f); if (run) V.walk.run = true;
  }
});
let lastTap = null;
// touch: a finger covers a lot of screen, so a tap that just misses something clickable still counts (nearest within ~28 px)
function pickNear(x, y) {
  for (const r of [12, 20, 28]) for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2, u = pick(x + Math.cos(a) * r, y + Math.sin(a) * r);
    if (u && (u.hot || u.who)) return u;
  }
  return null;
}
canvas.addEventListener('pointerleave', () => ui.tip(null));
// ---------- Walking: WASD / arrow keys, or the thumb stick on touch screens ----------
const KEYS = new Set(), JOY = { x: 0, y: 0, id: null };
addEventListener('keydown', e => {
  if (e.key === 'Escape') ui.closePanel();
  if (ui.talking() || ui.panelOpen() || !V.node || V.title || e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'e', 'shift'].includes(k)) { KEYS.add(k); if (k !== 'shift') e.preventDefault(); }
});
addEventListener('keyup', e => KEYS.delete(e.key.toLowerCase()));
addEventListener('blur', () => KEYS.clear());
{
  const joy = document.querySelector('#joy'), knob = joy.querySelector('i');
  const set = e => {
    const r = joy.getBoundingClientRect(), R = r.width / 2;
    let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    JOY.x = x; JOY.y = y; knob.style.transform = `translate(${x * R * 0.55}px, ${y * R * 0.55}px)`;
  };
  joy.addEventListener('pointerdown', e => { initAudio(); JOY.id = e.pointerId; joy.setPointerCapture(e.pointerId); set(e); e.stopPropagation(); });
  joy.addEventListener('pointermove', e => { if (e.pointerId === JOY.id) set(e); });
  const end = e => { if (e.pointerId !== JOY.id) return; JOY.id = null; JOY.x = JOY.y = 0; knob.style.transform = ''; };
  joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
  if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
}
const walkRay = new THREE.Raycaster();
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0);
walkRay.layers.set(2);   // the room only, never the people
walkRay.camera = camera;
const solid = h => { if (!h.object.visible || !h.object.material || h.object.material.visible === false) return false; for (let o = h.object; o; o = o.parent) { if (!o.visible) return false; if (o.userData.who) return false; } return true; };
// can the camera stand at (x, z)? nothing in the way at knee, waist and eye height, floor underfoot, nobody too close
function clear(x, z, dx, dz, R) {
  const len = Math.hypot(dx, dz); if (!len) return true;
  _d.set(dx / len, 0, dz / len);
  for (const h of [0.35, 0.95, 1.5]) {
    _o.set(camera.position.x, h, camera.position.z); walkRay.set(_o, _d); walkRay.far = len + 0.35;
    if (walkRay.intersectObject(R.g, true).some(solid)) return false;
  }
  _o.set(x, 1.4, z); walkRay.set(_o, DOWN); walkRay.far = 1.6;
  if (!walkRay.intersectObject(R.g, true).some(solid)) return false;
  for (const w in chars) { const c = chars[w]; if (c.parent === R.g && Math.hypot(c.position.x - x, c.position.z - z) < 0.55) return false; }
  return true;
}
let walkT = 0;
let walkV = 0;
function walk(dt) {
  mark.material.opacity = Math.max(0, mark.material.opacity - dt * (V.walk ? 0.4 : 2.5)); mark.scale.setScalar(1 + (0.9 - mark.material.opacity) * 0.3);
  if (V.busy || V.focus || V.move || V.title || !V.node || ui.talking() || ui.panelOpen()) { KEYS.clear(); V.walk = null; return; }
  const k = KEYS;
  const manual = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown'].some(x => k.has(x)) || Math.hypot(JOY.x, JOY.y) > 0.12;
  if (manual) V.walk = null;
  if (V.walk) {   // walking to a clicked spot: turn towards it while moving, stop there or when blocked
    const R = roomOf(), p = camera.position, dx = V.walk.x - p.x, dz = V.walk.z - p.z, d = Math.hypot(dx, dz);
    if (!R || d < 0.12) { V.walk = null; walkV = 0; return; }
    const want = Math.atan2(-dx, -dz), turnD = angDiff(V.yaw, want);
    if (d > 0.6) { V.yawT = null; V.yaw += turnD * Math.min(1, dt * 3.2); }
    walkV = Math.min(V.walk.run ? 3.3 : 1.9, walkV + dt * (V.walk.run ? 6 : 4)) * Math.min(1, d / 0.5 + 0.25);
    const st = Math.min(d, walkV * dt) * Math.max(0.25, Math.cos(Math.min(Math.abs(turnD), 1.4)));
    const mx = dx / d * st, mz = dz / d * st;
    if (clear(p.x + mx, p.z + mz, mx, mz, R)) p.x += mx, p.z += mz;
    else if (clear(p.x + mx, p.z, mx, 0, R)) p.x += mx;
    else if (clear(p.x, p.z + mz, 0, mz, R)) p.z += mz;
    // stop when no longer getting closer (a spot against a wall, or behind furniture)
    if (d < (V.walk.best ?? 1e9) - 0.01) { V.walk.best = d; V.walk.stuck = 0; }
    else if ((V.walk.stuck += dt) > 0.35) { V.walk = null; walkV = 0; }
    walkT += dt; p.y = EYE + Math.sin(walkT * 8) * 0.01;
    return;
  }
  let f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) - JOY.y;
  let s = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0) + JOY.x * 0.8;
  const turnIn = (k.has('arrowleft') || k.has('q') ? 1 : 0) - (k.has('arrowright') || k.has('e') ? 1 : 0);
  if (turnIn) { V.yawT = null; V.yaw += turnIn * dt * 1.8; }
  const mag = Math.hypot(f, s); if (mag < 0.12) { walkT = 0; return; }
  if (mag > 1) { f /= mag; s /= mag; }
  const R = roomOf(); if (!R) return;
  V.yawT = null; walkT += dt;
  const sp = (k.has('shift') || Math.hypot(JOY.x, JOY.y) > 0.93 ? 3.0 : 1.7) * Math.min(1, 0.4 + walkT * 2), fx = -Math.sin(V.yaw), fz = -Math.cos(V.yaw);
  const dx = (fx * f + -fz * s) * sp * dt, dz = (fz * f + fx * s) * sp * dt;
  const p = camera.position;
  if (clear(p.x + dx, p.z + dz, dx, dz, R)) { p.x += dx; p.z += dz; }
  else if (clear(p.x + dx, p.z, dx, 0, R)) p.x += dx;       // slide along walls
  else if (clear(p.x, p.z + dz, 0, dz, R)) p.z += dz;
  p.y = EYE + Math.sin(walkT * 9) * 0.012;
}

// ---------- HUD ----------
const $ = s => document.querySelector(s);
$('#turnL').onclick = () => turn(1);
$('#turnR').onclick = () => turn(-1);
$('#btnNote').onclick = () => { initAudio(); sfx('click'); story.openNotebook(); };
$('#btnPhone').onclick = () => { initAudio(); sfx('click'); story.openPhone(); };
$('#btnMenu').onclick = () => { initAudio(); sfx('click'); openMenu(); };
$('#btnMap').onclick = () => { initAudio(); sfx('click'); story.openMap(); };
function musicUI() { $('#btnMusic').classList.toggle('off', !isMusic()); $('#btnMusic').title = isMusic() ? 'Music: on' : 'Music: off'; }
$('#btnMusic').onclick = () => { initAudio(); setMusic(!isMusic()); setPref('music', isMusic()); musicUI(); sfx('click'); ui.toast(isMusic() ? 'Music on' : 'Music off'); };
function setRetro(on) {
  RETRO = on; setPref('retro', on);
  rt.dispose();
  const f = on ? THREE.NearestFilter : THREE.LinearFilter;
  rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 2, minFilter: f, magFilter: f });
  post.uniforms.tD.value = rt.texture; resize();
}
// Reveal: briefly mark everything you can click in view (no pixel hunting, especially on touch screens)
$('#btnReveal').onclick = () => {
  if (V.busy || V.focus || !V.node || ui.talking()) return;
  initAudio(); sfx('click');
  const box = $('#reveal'); box.innerHTML = '';
  for (const p of hotspotsOnScreen(camera, innerWidth, innerHeight)) {
    const m = document.createElement('div'); m.className = 'rv'; m.style.top = p.y + 'px';
    const lab = ui.PEOPLE[p.name] ? ui.PEOPLE[p.name].n : p.name, half = Math.min(innerWidth / 2 - 4, lab.length * 3.6 + 10);   // keep labels on screen
    m.style.left = Math.max(half, Math.min(innerWidth - half, p.x)) + 'px'; m.style.setProperty('--dx', (p.x - Math.max(half, Math.min(innerWidth - half, p.x))) + 'px');
    m.innerHTML = '<i></i><span></span>'; m.querySelector('span').textContent = ui.PEOPLE[p.name] ? ui.PEOPLE[p.name].n : p.name; box.appendChild(m);
  }
  box.classList.remove('on'); void box.offsetWidth; box.classList.add('on');
  clearTimeout(box._t); box._t = setTimeout(() => box.classList.remove('on'), 2600);
};

// dialogue text speed: Normal / Fast / Instant
const TEXTS = [['Normal', 2], ['Fast', 5], ['Instant', 0]];
let textSpeed = 0; try { textSpeed = +localStorage.getItem('novavale.text') || 0; } catch (e) { } if (!TEXTS[textSpeed]) textSpeed = 0; ui.speech.speed = TEXTS[textSpeed][1];
function openMenu() {
  const b = ui.panel(`<div class="menu">
    <button class="mbtn" data-a="resume">Return to Game</button>
    <button class="mbtn" data-a="music">Music: ${isMusic() ? 'On' : 'Off'}</button>
    <button class="mbtn" data-a="sound">All sound: ${isMuted() ? 'Off' : 'On'}</button>
    <button class="mbtn" data-a="retro">Retro picture: ${RETRO ? 'On' : 'Off'}</button>
    <button class="mbtn" data-a="text">Text: ${TEXTS[textSpeed][0]}</button>
    <button class="mbtn" data-a="title">Save and Quit</button>
    <p class="small">${S.diff === 'senior' ? 'Senior' : 'Junior'} Detective · your progress saves automatically</p></div>`, { cls: 'menu-p', title: 'Options' });
  b.querySelectorAll('[data-a]').forEach(x => x.onclick = () => {
    const a = x.dataset.a; sfx('click');
    if (a === 'resume') ui.closePanel();
    if (a === 'sound') { setMuted(!isMuted()); x.textContent = 'All sound: ' + (isMuted() ? 'Off' : 'On'); try { localStorage.setItem('novavale.mute', isMuted() ? '1' : ''); } catch (e) { } }
    if (a === 'music') { setMusic(!isMusic()); setPref('music', isMusic()); musicUI(); x.textContent = 'Music: ' + (isMusic() ? 'On' : 'Off'); }
    if (a === 'retro') { setRetro(!RETRO); x.textContent = 'Retro picture: ' + (RETRO ? 'On' : 'Off'); }
    if (a === 'text') { textSpeed = (textSpeed + 1) % TEXTS.length; try { localStorage.setItem('novavale.text', textSpeed); } catch (e) { } ui.speech.speed = TEXTS[textSpeed][1]; x.textContent = 'Text: ' + TEXTS[textSpeed][0]; }
    if (a === 'title') { save(); location.reload(); }
  });
}

function refresh() {
  sync();
  const inv = $('#inv'), slots = Math.max(6, S.inv.length);
  inv.innerHTML = Array.from({ length: slots }, (_, k) => {
    const i = S.inv[k];
    return i ? `<button class="it" data-i="${i}" title="${ITEMS[i].n}">${icon(i)}</button>` : '<span class="it empty"></span>';
  }).join('');
  inv.querySelectorAll('button.it').forEach(b => b.onclick = () => { sfx('click'); story.examineItem(b.dataset.i); });
  ui.setPhaseChip(PHASE_NAME[S.phase] || '');
  document.body.classList.toggle('night', S.phase === 'n1' || S.phase === 'n2');
  save();
}

function resume() {
  V.title = false;
  const n = NODES[S.node] || NODES.L1;
  showRoom(n.room); sync();
  const yaw = S.yaw;
  place(NODES[S.node] ? S.node : 'L1');
  if (typeof yaw === 'number') V.yaw = yaw;
  story.onRoom(n.room); refresh();
  document.body.classList.add('playing');
  // once: how to get around
  try {
    if (!localStorage.getItem('novavale.ctl')) {
      localStorage.setItem('novavale.ctl', '1');
      setTimeout(() => ui.toast(matchMedia('(pointer: coarse)').matches ? 'Tap the floor to walk there, or use the stick. Drag to look around.' : 'Click the floor to walk there, or use WASD (Shift to run). Drag to look around.'), 2500);
    }
  } catch (e) { /* private mode */ }
}

story.setEngine({ go, refresh, resume, focus, unfocus, cine, place: id => { showRoom(NODES[id].room); sync(); place(id); }, room: () => roomOf() && roomOf().id });

// ---------- Loop ----------
const clock = new THREE.Clock();
let t = 0;
const ease = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta()); t += dt;
  if (V.title) V.yaw += dt * 0.05; else if (V.node && !document.hidden) S.play = (S.play || 0) + dt;
  cineStep(dt);
  inspectStep(dt);
  walk(dt);
  if (V.move) {
    const m = V.move; m.t += dt / m.dur;
    const k = m.t >= 1 ? 1 : ease(m.t);
    camera.position.set(m.a[0] + (m.b[0] - m.a[0]) * k, EYE + Math.sin(k * Math.PI) * 0.03, m.a[1] + (m.b[1] - m.a[1]) * k);
    V.yaw = m.y0 + angDiff(m.y0, m.y1) * Math.min(1, k * 1.6);
    V.pitch = m.p0 + (basePitch() - m.p0) * k;
    if (m.t >= 1) { V.move = null; V.busy = false; V.node = m.id; S.node = m.id; showArrows(m.id); S.yaw = V.yaw; save(); }
  }
  if (V.yawT != null) {
    const d = V.yawT - V.yaw;
    V.yaw += d * Math.min(1, dt * 7);
    if (Math.abs(d) < 0.002) { V.yaw = V.yawT; V.yawT = null; S.yaw = V.yaw; }
  }
  if (V.pitchT != null) { const d = V.pitchT - V.pitch; V.pitch += d * Math.min(1, dt * 6); if (Math.abs(d) < 0.002) { V.pitch = V.pitchT; V.pitchT = null; } }
  let yaw = V.yaw, pitch = V.pitch;
  if (V.focus) {
    const F = V.focus; F.t = Math.max(0, Math.min(1, F.t + F.dir * dt / 0.7));
    const k = ease(F.t);
    camera.position.lerpVectors(F.from.p, F.to.p, k);
    yaw = F.from.yaw + angDiff(F.from.yaw, F.to.yaw) * k;
    pitch = F.from.pitch + (F.to.pitch - F.from.pitch) * k;
    camera.fov = FOV0 + (F.to.fov - FOV0) * k; camera.updateProjectionMatrix();
    if (F.dir < 0 && F.t <= 0) { camera.position.copy(F.from.p); V.focus = null; camera.fov = FOV0; camera.updateProjectionMatrix(); }
  }
  camera.rotation.y = yaw; camera.rotation.x = pitch;
  footsteps(); nearHints(dt);
  update(dt, t, camera);
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  renderer.setRenderTarget(null); post.uniforms.uT.value = t; renderer.render(postScene, postCam);
}

// ---------- Fast raycasts ----------
// Rooms merge their static pieces into big meshes, so a plain raycast tests tens of thousands of triangles; walking
// casts four rays a frame. A bounding-volume tree per static mesh makes each ray cheap. People are left out of layer 2.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;
function accelerate() {
  for (const k in rooms) rooms[k].g.traverse(o => {
    if (!o.isMesh) return;
    o.layers.enable(2);
    const g = o.geometry, n = g && (g.index ? g.index.count : g.attributes.position && g.attributes.position.count) / 3;
    if (!o.isSkinnedMesh && !o.isInstancedMesh && !g.boundsTree && n > 300 && !g.attributes.position.isInterleavedBufferAttribute) {
      try { g.computeBoundsTree(); } catch (e) { }
    }
  });
}

// ---------- Lost WebGL context (phones drop it when you switch apps) ----------
// three.js restores itself and re-uploads textures; the environment maps are render targets, so rebuild them. Some
// phones also wipe 2D canvases while the app is in the background (canvas textures would come back black): a small
// probe canvas detects that, and then the page reloads into the saved game.
const probe = document.createElement('canvas'); probe.width = probe.height = 2;
const pctx = probe.getContext('2d', { willReadFrequently: true }); pctx.fillStyle = '#ff0000'; pctx.fillRect(0, 0, 2, 2);
const wiped = () => { try { return pctx.getImageData(0, 0, 1, 1).data[0] < 200; } catch (e) { return false; } };
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); try { save(); } catch (err) { } }, false);
canvas.addEventListener('webglcontextrestored', () => {
  if (wiped()) { location.reload(); return; }
  try { rebuildEnv(renderer); } catch (e) { location.reload(); }
}, false);
addEventListener('visibilitychange', () => { if (document.hidden) { try { save(); } catch (e) { } } });

// ---------- Cutscenes: a camera move with letterbox bars and narration; tap to skip ----------
// keys: [{ p: [x, y, z], l: [look x, y, z], t: seconds }, ...] (t cumulative); lines: narration shown as captions in turn
function cine(node, keys, lines = []) {
  return new Promise(res => {
    const n = NODES[node]; showRoom(n.room); sync(); place(node);
    document.body.classList.add('cine'); V.busy = true;
    const T = keys[keys.length - 1].t, ov = $('#cine'); ov.className = 'on';
    const each = T / Math.max(1, lines.length);
    lines.forEach((l, i) => setTimeout(() => V.cine && ui.caption(l, each * 1000 - 300), (i * each + 0.4) * 1000));
    const end = () => { if (!V.cine) return; V.cine = null; ov.className = ''; ui.hideCaption(); document.body.classList.remove('cine'); V.busy = false; res(); };
    ov.onclick = end; V.cine = { keys, t: 0, end };
  });
}
function cineStep(dt) {
  const C = V.cine; if (!C) return false;
  C.t += dt; const K = C.keys, T = K[K.length - 1].t;
  if (C.t >= T + 0.6) { C.end(); return false; }
  let i = 0; while (i < K.length - 2 && C.t > K[i + 1].t) i++;
  const a = K[i], b = K[i + 1], u = Math.min(1, Math.max(0, (C.t - a.t) / (b.t - a.t))), k = u * u * (3 - 2 * u);
  const L = (x, y) => x + (y - x) * k, p = a.p.map((v, j) => L(v, b.p[j])), l = a.l.map((v, j) => L(v, b.l[j]));
  camera.position.set(p[0], p[1], p[2]);
  const dx = l[0] - p[0], dy = l[1] - p[1], dz = l[2] - p[2];
  V.yaw = Math.atan2(-dx, -dz); V.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  return true;
}
addEventListener('keydown', e => { if (V.cine && (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter')) V.cine.end(); });

// ---------- Touch: a faint glint on things you can tap close by, once you've stood still a moment ----------
let nearT = 0, nearAcc = 0, nearPos = '';
function nearHints(dt) {
  const box = $('#near'); if (!box || !document.body.classList.contains('touch')) return;
  const still = !V.walk && !V.move && !V.busy && !V.focus && !V.title && V.node && !ui.talking() && !ui.panelOpen() && Math.hypot(JOY.x, JOY.y) < 0.1 && !down;
  const key = camera.position.x.toFixed(2) + camera.position.z.toFixed(2) + V.yaw.toFixed(2);
  if (!still || key !== nearPos) { nearT = 0; nearPos = key; if (box.classList.contains('on')) box.classList.remove('on'); return; }
  nearT += dt; if (nearT < 1.4 || (nearAcc += dt) < 0.5 && box.classList.contains('on')) return; nearAcc = 0;
  box.innerHTML = hotspotsOnScreen(camera, innerWidth, innerHeight).filter(p => p.d < 4.2 && !p.who).map(p => `<i style="left:${p.x}px;top:${p.y}px"></i>`).join('');
  box.classList.add('on');
}

// ---------- Footsteps: one every ~0.65 m walked or glided, sounding like the floor underfoot ----------
const FLOOR = { lobby: 'marble', spa: 'tile', kitchen: 'tile', plan: 'carpet', tech: 'carpet', suite: 'carpet', wing: 'carpet', archive: 'wood', tunnel: 'concrete', star: 'wood' };
let fpX = null, fpZ = 0, fpAcc = 0;
function floorUnder(room, x, z) {
  if (room !== 'terrace') return FLOOR[room] || 'marble';
  if (Math.abs(x) < 9 && z > -4 && z < 8.5) return 'stone';               // the terrace paving
  if (x > 1.4 && x < 4.2 && z < -12.5) return 'wood';                      // the dock
  const r = Math.hypot(x, z - 18); if (r > 9.6 && r < 27 && z > 6) return 'gravel';   // the walk round the building
  return 'grass';
}
function footsteps() {
  const p = camera.position, R = roomOf();
  if (fpX === null || V.focus || V.title || !R) { fpX = p.x; fpZ = p.z; return; }
  const d = Math.hypot(p.x - fpX, p.z - fpZ); fpX = p.x; fpZ = p.z;
  if (d > 1) { fpAcc = 0; return; }   // a jump (changing rooms), not a step
  fpAcc += d; if (fpAcc > 0.65) { fpAcc = 0; step(floorUnder(R.id, p.x, p.z)); }
}

// ---------- Title ----------
function title() {
  V.title = true;
  const ls = latestSlot(); if (ls) setSlot(ls);
  const cont = !!ls && load() && S.phase !== 'end';
  const anySave = SLOTS.some(n => slotInfo(n));
  if (cont) { showRoom(NODES[S.node] ? NODES[S.node].room : 'lobby'); sync(); place(NODES[S.node] ? S.node : 'L1'); }
  const s = ui.screen(`<div class="title">
    <div class="tmark">
      <p class="kicker">A Nova Vale Mystery</p>
      <h1><span class="the">The Secret of the</span>Aquadome</h1>
      <div class="rule"></div>
    </div>
    <div class="tbtns">
      ${cont ? `<button class="tbtn" id="tCont">Continue <small>${PHASE_NAME[S.phase]}</small></button>` : ''}
      ${anySave ? '<button class="tbtn" id="tLoad">Load Game</button>' : ''}
      <button class="tbtn" id="tNew">New Game</button>
    </div>
    <p class="small">Click to look and talk · drag to look around · click the screen's edge to turn</p></div>`, 'title-s');
  const start = (diff, slot) => { initAudio(); setSlot(slot); ui.closeScreen(); newGame(diff); resume(); story.intro(); };
  // each save slot as a card: its day, level, time played and when it was last played
  const slotCard = (n, id) => {
    const i = slotInfo(n), when = i && i.last ? new Date(i.last).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
    return `<button class="tbtn slot" data-s="${n}" id="${id}${n}">Save ${n}<small>${i ? (i.phase === 'end' ? 'Case closed' : PHASE_NAME[i.phase]) + ' · ' + (i.diff === 'senior' ? 'Senior' : 'Junior') + ' · ' + Math.max(1, Math.round((i.play || 0) / 60)) + ' min · ' + when : 'Empty'}</small></button>`;
  };
  const back = () => '<button class="tlink" id="tBack">Back</button>';
  s.querySelector('#tNew').onclick = () => {
    initAudio(); sfx('click');
    s.querySelector('.tbtns').innerHTML = `<p class="pick">Choose your level</p>
      <button class="tbtn" id="dJ">Junior Detective<small>A detailed task list and hints on every puzzle</small></button>
      <button class="tbtn" id="dS">Senior Detective<small>Vaguer tasks, and you're on your own</small></button>`;
    const pickSlot = diff => {
      if (!anySave) return start(diff, 1);   // nothing saved yet: no need to ask
      sfx('click');
      s.querySelector('.tbtns').innerHTML = `<p class="pick">Save it where?</p>${SLOTS.map(n => slotCard(n, 'ns')).join('')}${back()}`;
      s.querySelector('#tBack').onclick = () => { sfx('click'); title(); };
      s.querySelectorAll('.slot').forEach(b => b.onclick = () => {
        const n = +b.dataset.s;
        if (slotInfo(n) && !b.classList.contains('sure')) { sfx('click'); b.classList.add('sure'); b.querySelector('small').textContent = 'Tap again to start over in this slot'; return; }
        start(diff, n);
      });
    };
    s.querySelector('#dJ').onclick = () => pickSlot('junior');
    s.querySelector('#dS').onclick = () => pickSlot('senior');
  };
  if (anySave) s.querySelector('#tLoad').onclick = () => {
    initAudio(); sfx('click');
    s.querySelector('.tbtns').innerHTML = `<p class="pick">Load which game?</p>${SLOTS.map(n => slotCard(n, 'ls')).join('')}${back()}`;
    s.querySelector('#tBack').onclick = () => { sfx('click'); title(); };
    s.querySelectorAll('.slot').forEach(b => { const n = +b.dataset.s, i = slotInfo(n); if (!i || i.phase === 'end') { b.disabled = true; return; }
      b.onclick = () => { sfx('click'); setSlot(n); load(); ui.closeScreen(); resume(); setTimeout(story.recap, 900); }; });
  };
  if (cont) s.querySelector('#tCont').onclick = () => { initAudio(); sfx('click'); ui.closeScreen(); resume(); setTimeout(story.recap, 900); };
}

// ---------- Boot ----------
try { if (localStorage.getItem('novavale.mute')) setMuted(true); } catch (e) { }
setMusic(pref('music', true)); musicUI();
if (RETRO) setRetro(true);
resize();
// sculpt the people in the saved room (or the lobby) first; everyone else follows in the background
const ROOMCAST = { lobby: ['cherry', 'kenji', 'harper', 'silas'], spa: ['vesper'], tech: ['dex'], kitchen: ['juniper', 'jojo'], archive: ['opal'], plan: ['priya', 'regent', 'cherry'], wing: ['rashad', 'gus'], terrace: ['gus', 'silas', 'nate'], star: ['opal'] };
const firstCast = () => { try { const n = latestSlot() || 1, d = JSON.parse(localStorage.getItem(n === 1 ? 'novavale.aquadome.v1' : 'novavale.aquadome.v1.s' + n) || 'null'); const room = d && NODES[d.node] ? NODES[d.node].room : 'lobby'; return [...new Set([...(ROOMCAST[room] || []), 'cherry', 'kenji', 'harper'])]; } catch (e) { return ['cherry', 'kenji', 'harper']; } };
(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => prepareCast(firstCast().filter(w => !FIG[w]), (i, n) => {
  document.querySelector('#boot p').textContent = i < n ? `Preparing the cast… ${i + 1} of ${n}` : 'Opening the Aquadome…';
}, () => { if (V.node) sync(); }, Object.keys(FIG))).then(() => setTimeout(() => {
  buildWorld(scene, renderer);
  accelerate();
  showRoom('lobby'); place('L1'); sync();
  loop();
  document.getElementById('boot').remove();
  title();
}, 30));
window.__dbg = { S, renderer, camera, rooms, pick: (x, y) => { const u = pick(x, y); return u && { hot: u.hot, go: u.go, who: u.who, name: u.name, obj: pickObj && pickObj.type }; }, go, place, setRetro, view: (id, look) => { showRoom(NODES[id].room); sync(); place(id, look); }, story, NODES, V, focus, unfocus };
