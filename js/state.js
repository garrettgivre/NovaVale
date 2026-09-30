// Game state, flags and saving.
const KEY = 'novavale.aquadome.v1';

export const PHASES = ['d1', 'n1', 'd2', 'n2', 'end'];
export const PHASE_NAME = {
  d1: 'Day 1', n1: 'Night 1', d2: 'Day 2', n2: 'Night 2', end: 'The Gala',
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
    t0: Date.now(),
  };
}

export const S = freshState();

export const has = f => !!S.flags[f];
export const set = (f, v = true) => { S.flags[f] = v; saveSoon(); };
export const hasItem = id => S.inv.includes(id);
export const night = () => S.phase === 'n1' || S.phase === 'n2';

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
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ }
}

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
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
