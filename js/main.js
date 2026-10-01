// Engine: renderer + a period post-process (soft resolution, warm grade, grain, vignette),
// the first-person camera at fixed spots, conversation close-ups, input, the main loop.
import * as THREE from 'three';
import { S, load, newGame, hasSave, save, PHASE_NAME } from './state.js';
import { buildWorld, showRoom, NODES, rooms, chars, sync, update, showArrows, roomOf, headOf, hotspotsOnScreen } from './world.js';
import { prepareCast } from './people.js';
import { FIG } from './figures.js';
import * as story from './story.js';
import * as ui from './ui.js';
import { initAudio, sfx, setMuted, isMuted, setMusic, isMusic } from './audio.js';
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
        c = mix(c, s, 0.3);
      }
      vec3 glow = vec3(0.);
      for (int i = 0; i < 8; i++) { float a = float(i) * 0.785; glow += max(texture2D(tD, uv + vec2(cos(a), sin(a)) * px * (uRetro > 0.5 ? 3.0 : 7.0)).rgb - 0.9, 0.0); }
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
    // about 0.9 megapixels at most: soft, like an 800x600 pre-rendered game
    const pr = Math.min(devicePixelRatio || 1, Math.sqrt(900000 / (w * h)));
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
    return tagged ? tagged.userData : null;
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
  V.walk = { x: p.x, z: p.z, stuck: 0 };
  scene.add(mark); mark.position.set(p.x, p.y + 0.02, p.z); mark.material.opacity = 0.9; mark.scale.setScalar(1);
}

function activate(u) {
  if (!u) return;
  sfx('click');
  if (u.go) return go(u.go);
  if (u.who) return story.onTalk(u.who);
  if (u.hot) return story.onHot(u.hot);
}

// ---------- Input ----------
let down = null;
canvas.addEventListener('pointerdown', e => {
  initAudio();
  down = { x: e.clientX, y: e.clientY, yaw: V.yaw, pitch: V.pitch, moved: false, id: e.pointerId };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (down && down.id === e.pointerId) {
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.hypot(dx, dy) > 6) down.moved = true;
    if (down.moved && !V.busy && !V.focus && !ui.talking() && !V.title) {
      V.yawT = null;
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
  if (d.moved || V.busy || V.focus || ui.talking() || ui.panelOpen() || V.title) return;
  const u = pick(e.clientX, e.clientY);
  if (u) return activate(u);
  const ed = edge(e.clientX, e);
  if (ed) return turn(ed);
  const f = floorAt(e.clientX, e.clientY);
  if (f) { initAudio(); walkTo(f); }
});
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
const walkRay = new THREE.Raycaster(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0);
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
    walkV = Math.min(1.9, walkV + dt * 4) * Math.min(1, d / 0.5 + 0.25);
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
  const sp = (k.has('shift') ? 3.0 : 1.7) * Math.min(1, 0.4 + walkT * 2), fx = -Math.sin(V.yaw), fz = -Math.cos(V.yaw);
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
    const m = document.createElement('div'); m.className = 'rv'; m.style.left = p.x + 'px'; m.style.top = p.y + 'px';
    m.innerHTML = '<i></i><span></span>'; m.querySelector('span').textContent = ui.PEOPLE[p.name] ? ui.PEOPLE[p.name].n : p.name; box.appendChild(m);
  }
  box.classList.remove('on'); void box.offsetWidth; box.classList.add('on');
  clearTimeout(box._t); box._t = setTimeout(() => box.classList.remove('on'), 2600);
};

function openMenu() {
  const b = ui.panel(`<div class="menu">
    <button class="mbtn" data-a="resume">Return to Game</button>
    <button class="mbtn" data-a="music">Music: ${isMusic() ? 'On' : 'Off'}</button>
    <button class="mbtn" data-a="sound">All sound: ${isMuted() ? 'Off' : 'On'}</button>
    <button class="mbtn" data-a="retro">Retro picture: ${RETRO ? 'On' : 'Off'}</button>
    <button class="mbtn" data-a="title">Save and Quit</button>
    <p class="small">${S.diff === 'senior' ? 'Senior' : 'Junior'} Detective · your progress saves automatically</p></div>`, { cls: 'menu-p', title: 'Options' });
  b.querySelectorAll('[data-a]').forEach(x => x.onclick = () => {
    const a = x.dataset.a; sfx('click');
    if (a === 'resume') ui.closePanel();
    if (a === 'sound') { setMuted(!isMuted()); x.textContent = 'All sound: ' + (isMuted() ? 'Off' : 'On'); try { localStorage.setItem('novavale.mute', isMuted() ? '1' : ''); } catch (e) { } }
    if (a === 'music') { setMusic(!isMusic()); setPref('music', isMusic()); musicUI(); x.textContent = 'Music: ' + (isMusic() ? 'On' : 'Off'); }
    if (a === 'retro') { setRetro(!RETRO); x.textContent = 'Retro picture: ' + (RETRO ? 'On' : 'Off'); }
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

story.setEngine({ go, refresh, resume, focus, unfocus, room: () => roomOf() && roomOf().id });

// ---------- Loop ----------
const clock = new THREE.Clock();
let t = 0;
const ease = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta()); t += dt;
  if (V.title) V.yaw += dt * 0.05;
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
  update(dt, t, camera);
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  renderer.setRenderTarget(null); post.uniforms.uT.value = t; renderer.render(postScene, postCam);
}

// ---------- Title ----------
function title() {
  V.title = true;
  const cont = hasSave() && load() && S.phase !== 'end';
  if (cont) { showRoom(NODES[S.node] ? NODES[S.node].room : 'lobby'); sync(); place(NODES[S.node] ? S.node : 'L1'); }
  const s = ui.screen(`<div class="title">
    <div class="tmark">
      <p class="kicker">A Nova Vale Mystery</p>
      <h1><span class="the">The Secret of the</span>Aquadome</h1>
      <div class="rule"></div>
    </div>
    <div class="tbtns">
      ${cont ? `<button class="tbtn" id="tCont">Continue <small>${PHASE_NAME[S.phase]}</small></button>` : ''}
      <button class="tbtn" id="tNew">New Game</button>
    </div>
    <p class="small">Click to look and talk · drag to look around · click the screen's edge to turn</p></div>`, 'title-s');
  const start = diff => { initAudio(); ui.closeScreen(); newGame(diff); resume(); story.intro(); };
  s.querySelector('#tNew').onclick = () => {
    initAudio(); sfx('click');
    s.querySelector('.tbtns').innerHTML = `<p class="pick">Choose your level</p>
      <button class="tbtn" id="dJ">Junior Detective<small>A detailed task list and hints on every puzzle</small></button>
      <button class="tbtn" id="dS">Senior Detective<small>Vaguer tasks, and you're on your own</small></button>`;
    s.querySelector('#dJ').onclick = () => start('junior');
    s.querySelector('#dS').onclick = () => start('senior');
  };
  if (cont) s.querySelector('#tCont').onclick = () => { initAudio(); sfx('click'); ui.closeScreen(); resume(); };
}

// ---------- Boot ----------
try { if (localStorage.getItem('novavale.mute')) setMuted(true); } catch (e) { }
setMusic(pref('music', true)); musicUI();
if (RETRO) setRetro(true);
resize();
// sculpt the people in the saved room (or the lobby) first; everyone else follows in the background
const ROOMCAST = { lobby: ['cherry', 'kenji', 'harper', 'silas'], spa: ['vesper'], tech: ['dex'], kitchen: ['juniper', 'jojo'], archive: ['opal'], plan: ['priya', 'regent', 'cherry'], wing: ['rashad', 'gus'], terrace: ['gus', 'silas', 'nate'], star: ['opal'] };
const firstCast = () => { try { const d = JSON.parse(localStorage.getItem('novavale.aquadome.v1') || 'null'); const room = d && NODES[d.node] ? NODES[d.node].room : 'lobby'; return [...new Set([...(ROOMCAST[room] || []), 'cherry', 'kenji', 'harper'])]; } catch (e) { return ['cherry', 'kenji', 'harper']; } };
(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => prepareCast(firstCast().filter(w => !FIG[w]), (i, n) => {
  document.querySelector('#boot p').textContent = i < n ? `Preparing the cast… ${i + 1} of ${n}` : 'Opening the Aquadome…';
}, () => { if (V.node) sync(); }, Object.keys(FIG))).then(() => setTimeout(() => {
  buildWorld(scene, renderer);
  showRoom('lobby'); place('L1'); sync();
  loop();
  document.getElementById('boot').remove();
  title();
}, 30));
window.__dbg = { S, renderer, go, place, setRetro, view: (id, look) => { showRoom(NODES[id].room); sync(); place(id, look); }, story, NODES, V, focus, unfocus };
