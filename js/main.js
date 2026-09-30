// Engine: renderer + a period post-process (soft resolution, warm grade, grain, vignette),
// the first-person camera at fixed spots, conversation close-ups, input, the main loop.
import * as THREE from 'three';
import { S, load, newGame, hasSave, save, PHASE_NAME } from './state.js';
import { buildWorld, showRoom, NODES, rooms, sync, update, showArrows, roomOf, headOf } from './world.js';
import * as story from './story.js';
import * as ui from './ui.js';
import { initAudio, sfx, setMuted, isMuted } from './audio.js';
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
const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
const post = new THREE.ShaderMaterial({
  uniforms: { tD: { value: rt.texture }, uT: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D tD; uniform float uT; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 px = 1.0 / uRes;
      vec3 c = texture2D(tD, vUv).rgb;
      vec3 s = (texture2D(tD, vUv + vec2(px.x, 0.)).rgb + texture2D(tD, vUv - vec2(px.x, 0.)).rgb
              + texture2D(tD, vUv + vec2(0., px.y)).rgb + texture2D(tD, vUv - vec2(0., px.y)).rgb) * 0.25;
      c = mix(c, s, 0.3);
      vec3 glow = vec3(0.);
      for (int i = 0; i < 8; i++) { float a = float(i) * 0.785; glow += max(texture2D(tD, vUv + vec2(cos(a), sin(a)) * px * 7.0).rgb - 0.9, 0.0); }
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
      gl_FragColor.rgb += (hash(floor(vUv * uRes) + fract(uT) * 91.0) - 0.5) * 0.045;
    }`,
  depthTest: false, depthWrite: false,
});
const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));

function resize() {
  const w = innerWidth, h = innerHeight, a = w / h;
  // about 0.9 megapixels at most: soft, like an 800x600 pre-rendered game on a CRT
  const pr = Math.min(devicePixelRatio || 1, Math.sqrt(900000 / (w * h)));
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  const bw = Math.round(w * pr), bh = Math.round(h * pr);
  rt.setSize(bw, bh); post.uniforms.uRes.value.set(bw, bh);
  camera.aspect = a;
  const hf = 64 * Math.PI / 180;
  camera.fov = a < 1 ? Math.min(88, 2 * Math.atan(Math.tan(hf / 2) / a) * 180 / Math.PI) : 58;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---------- Camera state ----------
const V = { yaw: 0, pitch: PITCH0, yawT: null, move: null, node: null, busy: false, focus: null, title: false };
const yawTo = (from, x, z) => Math.atan2(-(x - from[0]), -(z - from[1]));
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const basePitch = () => innerWidth < innerHeight ? -0.14 : PITCH0;

function place(nodeId, look) {
  const n = NODES[nodeId];
  V.node = nodeId; S.node = nodeId;
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
  V.move = { a: [...from.p], b: [...to.p], t: 0, dur: Math.min(1.4, Math.max(0.6, d * 0.22)), y0: V.yaw, y1: yawTo(from.p, to.p[0], to.p[1]), p0: V.pitch, id: nodeId };
}

function turn(dir) {
  if (V.busy || V.focus) return;
  sfx('click');
  V.yawT = (V.yawT ?? V.yaw) + dir * Math.PI / 2;
}

// Conversation close-up: glide in to frame the character's head and shoulders.
function focus(who) {
  const h = headOf(who); if (!h) return;
  const from = { p: camera.position.clone(), yaw: V.yaw, pitch: V.pitch };
  const dir = new THREE.Vector3(camera.position.x - h.x, 0, camera.position.z - h.z).normalize();
  // frame about a metre of the character vertically: head and shoulders above the text box
  const cover = innerWidth < innerHeight ? 1.45 : 1.25;
  const dist = Math.max(0.55, cover / (2 * Math.tan(camera.fov * Math.PI / 360)));
  const p = new THREE.Vector3(h.x + dir.x * dist, h.y - 0.02, h.z + dir.z * dist);
  const look = new THREE.Vector3(h.x, h.y - cover * 0.2, h.z);
  const dx = look.x - p.x, dy = look.y - p.y, dz = look.z - p.z;
  V.focus = { from, to: { p, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) }, t: 0, dir: 1 };
}
function unfocus() { if (V.focus) { V.focus.dir = -1; } }

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
const edge = x => x < innerWidth * 0.08 ? 1 : x > innerWidth * 0.92 ? -1 : 0;

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
  const u = pick(e.clientX, e.clientY), ed = edge(e.clientX);
  canvas.className = u ? (u.go ? 'c-go' : u.who ? 'c-talk' : 'c-look') : ed > 0 ? 'c-left' : ed < 0 ? 'c-right' : '';
  ui.tip(u ? (u.who ? ui.PEOPLE[u.who].n : u.name || '') : null, e.clientX, e.clientY);
});
canvas.addEventListener('pointerup', e => {
  if (!down || down.id !== e.pointerId) return;
  const d = down; down = null;
  if (d.moved || V.busy || V.focus || ui.talking() || ui.panelOpen() || V.title) return;
  const u = pick(e.clientX, e.clientY);
  if (u) return activate(u);
  const ed = edge(e.clientX);
  if (ed) turn(ed);
});
canvas.addEventListener('pointerleave', () => ui.tip(null));
addEventListener('keydown', e => {
  if (e.key === 'Escape') ui.closePanel();
  if (ui.talking() || ui.panelOpen() || !V.node || V.title) return;
  if (e.key === 'ArrowLeft') turn(1);
  if (e.key === 'ArrowRight') turn(-1);
});

// ---------- HUD ----------
const $ = s => document.querySelector(s);
$('#turnL').onclick = () => turn(1);
$('#turnR').onclick = () => turn(-1);
$('#btnNote').onclick = () => { initAudio(); sfx('click'); story.openNotebook(); };
$('#btnPhone').onclick = () => { initAudio(); sfx('click'); story.openPhone(); };
$('#btnMenu').onclick = () => { initAudio(); sfx('click'); openMenu(); };

function openMenu() {
  const b = ui.panel(`<div class="menu">
    <button class="mbtn" data-a="resume">Return to Game</button>
    <button class="mbtn" data-a="sound">Sound: ${isMuted() ? 'Off' : 'On'}</button>
    <button class="mbtn" data-a="title">Save and Quit</button>
    <p class="small">${S.diff === 'senior' ? 'Senior' : 'Junior'} Detective · your progress saves automatically</p></div>`, { cls: 'menu-p', title: 'Options' });
  b.querySelectorAll('[data-a]').forEach(x => x.onclick = () => {
    const a = x.dataset.a; sfx('click');
    if (a === 'resume') ui.closePanel();
    if (a === 'sound') { setMuted(!isMuted()); x.textContent = 'Sound: ' + (isMuted() ? 'Off' : 'On'); try { localStorage.setItem('novavale.mute', isMuted() ? '1' : ''); } catch (e) { } }
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
    if (F.dir < 0 && F.t <= 0) { camera.position.copy(F.from.p); V.focus = null; }
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
resize();
(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(() => {
  buildWorld(scene, renderer);
  showRoom('lobby'); place('L1'); sync();
  loop();
  document.getElementById('boot').remove();
  title();
}, 30));
window.__dbg = { S, go, story, NODES, V };
