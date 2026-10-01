// Game state, flags and saving.
const KEY = 'novavale.aquadome.v1';
// three save slots; slot 1 keeps the original key so old saves still load
export const SLOTS = [1, 2, 3];
const keyOf = n => n === 1 ? KEY : KEY + '.s' + n;
let SLOT = 1;
try { SLOT = +localStorage.getItem('novavale.slot') || 1; } catch (e) { }
export const currentSlot = () => SLOT;
export function setSlot(n) { SLOT = n; try { localStorage.setItem('novavale.slot', n); } catch (e) { } }
export function slotInfo(n) {
  try { const d = JSON.parse(localStorage.getItem(keyOf(n)) || 'null'); if (!d) return null; return { phase: d.phase, diff: d.diff, play: d.play || 0, last: d.last || d.t0 || 0, node: d.node }; } catch (e) { return null; }
}
export function latestSlot() { let best = null, t = -1; for (const n of SLOTS) { const i = slotInfo(n); if (i && i.phase !== 'end' && i.last > t) { t = i.last; best = n; } } return best; }
export function deleteSlot(n) { try { localStorage.removeItem(keyOf(n)); } catch (e) { } }

export const PHASES = ['d1', 'n1', 'd2', 'n2', 'g', 'end'];
export const PHASE_NAME = {
  d1: 'Day 1', n1: 'Night 1', d2: 'Day 2', n2: 'Night 2', g: 'Gala Day', end: 'The Gala',
};

export function freshState(diff = 'junior') {
  return {
    v: 1,
    diff,              // 'junior' | 'senior'
    phase: 'd1',
    node: 'L1',
    yaw: null,
    flags: {},
    inv: [],           // item ids, in pickup order
    docs: [],          // document ids read
    asked: {},         // 'who:topic' -> true
    calls: {},         // 'contact:topic' -> true
    cp: null,          // Second Chance checkpoint (a JSON copy of the state)
    pz: {},            // puzzles' unfinished settings, so closing one doesn't lose your work
    play: 0,           // seconds played
    last: 0,           // when last saved
    t0: Date.now(),
  };
}

export const S = freshState();

export const has = f => !!S.flags[f];
export const set = (f, v = true) => { S.flags[f] = v; saveSoon(); };
export const hasItem = id => S.inv.includes(id);
export const night = () => S.phase === 'n1' || S.phase === 'n2' || S.phase === 'end';   // 'end' is the gala evening

export function giveItem(id) {
  if (!S.inv.includes(id)) S.inv.push(id);
  saveSoon();
}

export function addDoc(id) {
  if (!S.docs.includes(id)) S.docs.push(id);
  saveSoon();
}

let tm = 0;
export function saveSoon() {
  clearTimeout(tm);
  tm = setTimeout(save, 250);
}

export function save() {
  S.last = Date.now();
  try { localStorage.setItem(keyOf(SLOT), JSON.stringify(S)); } catch (e) { /* private mode */ }
}

export function hasSave() {
  try { return !!localStorage.getItem(keyOf(SLOT)); } catch (e) { return false; }
}

export function load() {
  try {
    const raw = localStorage.getItem(keyOf(SLOT));
    if (!raw) return false;
    replace(JSON.parse(raw));
    return true;
  } catch (e) { return false; }
}

export function replace(obj) {
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, freshState(), obj);
}

export function newGame(diff) {
  replace(freshState(diff));
  save();
}

// Second Chance: remember the state right before something risky.
export function checkpoint() {
  const copy = JSON.parse(JSON.stringify(S));
  copy.cp = null;
  S.cp = copy;
  save();
}

export function secondChance() {
  if (!S.cp) return false;
  const cp = S.cp;
  replace(cp);
  S.cp = null;
  save();
  return true;
}
