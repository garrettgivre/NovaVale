// Engine: renderer, first-person camera at fixed spots, input, the main loop.
import * as THREE from 'three';
import { S, load, newGame, hasSave, save, PHASE_NAME } from './state.js';
import { buildWorld, showRoom, NODES, rooms, sync, update, showArrows, roomOf } from './world.js';
import * as story from './story.js';
import * as ui from './ui.js';
import { initAudio, sfx, setMuted, isMuted } from './audio.js';
import { ITEMS, icon } from './items.js';

const EYE = 1.62, PITCH0 = -0.07;
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 200);
camera.rotation.order = 'YXZ';

const V = { yaw: 0, pitch: PITCH0, yawT: null, move: null, node: null, busy: false };
const yawTo = (from, x, z) => Math.atan2(-(x - from[0]), -(z - from[1]));
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

function resize() {
  const w = innerWidth, h = innerHeight, a = w / h;
  renderer.setSize(w, h, false);
  camera.aspect = a;
  // keep a comfortable horizontal view on tall phone screens
  const hf = 68 * Math.PI / 180;
  camera.fov = a < 1 ? Math.min(92, 2 * Math.atan(Math.tan(hf / 2) / a) * 180 / Math.PI) : 62;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---------- Moving between spots ----------
function place(nodeId, look) {
  const n = NODES[nodeId];
  V.node = nodeId; S.node = nodeId;
  camera.position.set(n.p[0], EYE, n.p[1]);
  const l = look || n.look;
  V.yaw = yawTo(n.p, l[0], l[1]); V.pitch = innerWidth < innerHeight ? -0.16 : PITCH0; V.yawT = null;
  S.yaw = V.yaw;
  showArrows(nodeId);
}

async function go(nodeId, { fade = false, look } = {}) {
  if (V.busy) return;
  const from = NODES[V.node], to = NODES[nodeId];
  ui.hideCaption(); ui.tip(null);
  if (fade || !from || from.room !== to.room) {
    V.busy = true; sfx('door');
    await ui.fade(() => {
      showRoom(to.room); sync(); place(nodeId, look); story.onRoom(to.room); refresh();
    });
    V.busy = false;
    return;
  }
  // walk: glide along the floor and face the way we're going
  V.busy = true;
  for (const R of Object.values(rooms)) R.g.children.filter(c => c.userData.go).forEach(c => R.g.remove(c));
  const d = Math.hypot(to.p[0] - from.p[0], to.p[1] - from.p[1]);
  V.move = { a: [...from.p], b: [...to.p], t: 0, dur: Math.min(1.3, Math.max(0.5, d * 0.2)), y0: V.yaw, y1: yawTo(from.p, to.p[0], to.p[1]), id: nodeId };
}

function turn(dir) {
  if (V.busy) return;
  sfx('click');
  V.yawT = (V.yawT ?? V.yaw) + dir * Math.PI / 2;
}

// ---------- Picking ----------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(x, y) {
  const R = roomOf(); if (!R) return null;
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObject(R.g, true);
  for (const h of hits) {
    if (h.distance > 14) break;
    let o = h.object, hidden = false, tagged = null;
    for (let p = o; p; p = p.parent) {
      if (!p.visible) { hidden = true; break; }
      if (!tagged && (p.userData.hot || p.userData.who || p.userData.go)) tagged = p;
    }
    if (hidden) continue;
    if (o.material && o.material.transparent && o.material.opacity < 0.3 && !tagged) continue; // see through glass
    return tagged ? tagged.userData : null;
  }
  return null;
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
    if (down.moved && !V.busy && !ui.talking()) {
      V.yawT = null;
      V.yaw = down.yaw + dx * 0.005;
      V.pitch = Math.max(-0.7, Math.min(0.5, down.pitch + dy * 0.004));
    }
    return;
  }
  if (e.pointerType !== 'mouse' || V.busy || ui.talking()) return;
  const u = pick(e.clientX, e.clientY);
  canvas.className = u ? (u.go ? 'c-go' : u.who ? 'c-talk' : 'c-look') : '';
  ui.tip(u ? (u.who ? ui.PEOPLE[u.who].n : u.name || '') : null, e.clientX, e.clientY);
});
canvas.addEventListener('pointerup', e => {
  if (!down || down.id !== e.pointerId) return;
  const d = down; down = null;
  if (d.moved || V.busy || ui.talking() || ui.panelOpen()) return;
  activate(pick(e.clientX, e.clientY));
});
canvas.addEventListener('pointerleave', () => ui.tip(null));
addEventListener('keydown', e => {
  if (e.key === 'Escape') ui.closePanel();
  if (ui.talking() || ui.panelOpen() || !V.node) return;
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
    <button class="btn big" data-a="resume">Back to the case</button>
    <button class="btn" data-a="sound">Sound: ${isMuted() ? 'off' : 'on'}</button>
    <button class="btn" data-a="title">Save and quit to title</button>
    <p class="small">${S.diff === 'senior' ? 'Senior' : 'Junior'} Detective · the game saves as you play</p></div>`, { cls: 'menu-p', title: 'Paused' });
  b.querySelectorAll('[data-a]').forEach(x => x.onclick = () => {
    const a = x.dataset.a;
    if (a === 'resume') ui.closePanel();
    if (a === 'sound') { setMuted(!isMuted()); x.textContent = 'Sound: ' + (isMuted() ? 'off' : 'on'); try { localStorage.setItem('novavale.mute', isMuted() ? '1' : ''); } catch (e) { } }
    if (a === 'title') { save(); location.reload(); }
  });
}

function refresh() {
  sync();
  const inv = $('#inv');
  inv.innerHTML = S.inv.map(i => `<button class="it" data-i="${i}" title="${ITEMS[i].n}">${icon(i)}</button>`).join('');
  inv.querySelectorAll('.it').forEach(b => b.onclick = () => { sfx('click'); story.examineItem(b.dataset.i); });
  ui.setPhaseChip(PHASE_NAME[S.phase] || '');
  document.body.classList.toggle('night', S.phase === 'n1' || S.phase === 'n2');
  save();
}

function resume() {
  const n = NODES[S.node] || NODES.L1;
  showRoom(n.room); sync();
  const yaw = S.yaw;
  place(NODES[S.node] ? S.node : 'L1');
  if (typeof yaw === 'number') V.yaw = yaw;
  story.onRoom(n.room); refresh();
  document.body.classList.add('playing');
}

story.setEngine({ go, refresh, resume, room: () => roomOf() && roomOf().id });

// ---------- Loop ----------
const clock = new THREE.Clock();
let t = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta()); t += dt;
  if (V.move) {
    const m = V.move; m.t += dt / m.dur;
    const k = m.t >= 1 ? 1 : m.t < 0.5 ? 2 * m.t * m.t : 1 - Math.pow(-2 * m.t + 2, 2) / 2;
    camera.position.set(m.a[0] + (m.b[0] - m.a[0]) * k, EYE + Math.sin(k * Math.PI) * 0.04, m.a[1] + (m.b[1] - m.a[1]) * k);
    V.yaw = m.y0 + angDiff(m.y0, m.y1) * Math.min(1, k * 1.6);
    if (m.t >= 1) { V.move = null; V.busy = false; V.node = m.id; S.node = m.id; showArrows(m.id); S.yaw = V.yaw; save(); }
  }
  if (V.yawT != null) {
    const d = V.yawT - V.yaw;
    V.yaw += d * Math.min(1, dt * 9);
    if (Math.abs(d) < 0.002) { V.yaw = V.yawT; V.yawT = null; S.yaw = V.yaw; }
  }
  camera.rotation.y = V.yaw; camera.rotation.x = V.pitch;
  update(dt, t, camera);
  renderer.render(scene, camera);
}

// ---------- Title ----------
function title() {
  const cont = hasSave() && load() && S.phase !== 'end';
  const s = ui.screen(`<div class="title">
    <div class="bubbles">${Array.from({ length: 14 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--s:${20 + (i * 13) % 50}px;--d:${6 + (i % 5) * 2}s;--w:${i * 0.7}s"></i>`).join('')}</div>
    <p class="kicker">A Nova Vale Mystery</p>
    <h1>The Secret of the<br><span>Aquadome</span></h1>
    <div class="tbtns">
      ${cont ? `<button class="btn big" id="tCont">Continue the case <small>${PHASE_NAME[S.phase]}</small></button>` : ''}
      <button class="btn ${cont ? '' : 'big'}" id="tNew">New case</button>
    </div>
    <p class="small">Tap to look and talk · drag to look around · arrows to turn</p></div>`, 'sky');
  const start = diff => { initAudio(); ui.closeScreen(); newGame(diff); resume(); story.intro(); };
  s.querySelector('#tNew').onclick = () => {
    initAudio(); sfx('click');
    s.querySelector('.tbtns').innerHTML = `<p class="pick">Choose your level</p>
      <button class="btn big" id="dJ">Junior Detective<small>Detailed task list and puzzle hints</small></button>
      <button class="btn big alt" id="dS">Senior Detective<small>Vaguer tasks, no puzzle hints</small></button>`;
    s.querySelector('#dJ').onclick = () => start('junior');
    s.querySelector('#dS').onclick = () => start('senior');
  };
  if (cont) s.querySelector('#tCont').onclick = () => { initAudio(); sfx('click'); ui.closeScreen(); resume(); };
}

// ---------- Boot ----------
try { if (localStorage.getItem('novavale.mute')) setMuted(true); } catch (e) { }
resize();
(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
  buildWorld(scene, renderer);
  showRoom('lobby'); place('L1'); sync();
  loop();
  $('#boot').remove();
  title();
});
window.__dbg = { S, go, story, NODES };
