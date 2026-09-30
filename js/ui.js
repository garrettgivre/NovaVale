// DOM user interface: dialogue box, panels, captions, inventory bar.
import { sfx } from './audio.js';

const $ = s => document.querySelector(s);
export const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

export const PEOPLE = {
  nova: { n: 'Nova', c: '#1aa6d9' },
  vesper: { n: 'Vesper Vox', c: '#8a9ab8' },
  cherry: { n: 'Miss Cherry Pop', c: '#ff3d9a' },
  dex: { n: 'Dex Halloway', c: '#19a37a' },
  juniper: { n: 'Juniper Reyes', c: '#6dc04b' },
  opal: { n: 'Opal Finch', c: '#9b7fe0' },
  dot: { n: 'Dot', c: '#ffb020' },
  remy: { n: 'Remy', c: '#3e7bf2' },
  celeste: { n: 'Celeste Arden', c: '#c85fd6' },
};

// ---------- Portraits (SVG placeholders; a matching assets/portraits/<id>.webp replaces them) ----------
const P = {
  vesper: { skin: '#f2d0bd', top: '#cfd8e6', bg: ['#8f8574', '#2e2820'] },
  cherry: { skin: '#8a5a3c', top: '#ff4fa3', bg: ['#8f8574', '#2e2820'] },
  dex: { skin: '#e0b08e', top: '#19b4b8', bg: ['#8f8574', '#2e2820'] },
  juniper: { skin: '#5e3b27', top: '#fbfbf5', bg: ['#8f8574', '#2e2820'] },
  opal: { skin: '#f0d6c8', top: '#b9a6e6', bg: ['#8f8574', '#2e2820'] },
  dot: { skin: '#c68a62', top: '#ffb020', bg: ['#8f8574', '#2e2820'] },
  remy: { skin: '#f1c9a5', top: '#3e7bf2', bg: ['#8f8574', '#2e2820'] },
  celeste: { skin: '#e8b996', top: '#c85fd6', bg: ['#8f8574', '#2e2820'] },
};
function portraitSVG(who) {
  const p = P[who]; if (!p) return '';
  const hair = {
    vesper: `<ellipse cx="100" cy="78" rx="72" ry="58" fill="#fff3dc"/><circle cx="46" cy="118" r="26" fill="#fff3dc"/><circle cx="154" cy="118" r="26" fill="#fff3dc"/><rect x="62" y="96" width="76" height="20" rx="10" fill="#151020"/>`,
    cherry: `<ellipse cx="100" cy="30" rx="44" ry="42" fill="#e0232e"/><ellipse cx="100" cy="72" rx="58" ry="40" fill="#e0232e"/><path d="M122 30 l6 12 13 2 -9 9 2 13 -12 -6 -12 6 2 -13 -9 -9 13 -2z" fill="#ffc95c"/>`,
    dex: `<ellipse cx="100" cy="72" rx="54" ry="36" fill="#2a1d16"/><path d="M40 110 a60 60 0 0 1 120 0" fill="none" stroke="#303848" stroke-width="8"/><rect x="32" y="100" width="18" height="30" rx="8" fill="#19b4b8"/><rect x="150" y="100" width="18" height="30" rx="8" fill="#19b4b8"/><circle cx="82" cy="112" r="11" fill="none" stroke="#222" stroke-width="3"/><circle cx="118" cy="112" r="11" fill="none" stroke="#222" stroke-width="3"/>`,
    juniper: `<ellipse cx="100" cy="74" rx="56" ry="36" fill="#6dc04b"/><circle cx="100" cy="42" r="20" fill="#1c120c"/><circle cx="52" cy="128" r="5" fill="#ffc95c"/><circle cx="148" cy="128" r="5" fill="#ffc95c"/>`,
    opal: `<path d="M44 130 q0 -80 56 -80 q56 0 56 80 l-14 0 q-4 -50 -42 -50 q-38 0 -42 50z" fill="#c9ccd6"/><circle cx="82" cy="112" r="12" fill="none" stroke="#c99a2e" stroke-width="3"/><circle cx="118" cy="112" r="12" fill="none" stroke="#c99a2e" stroke-width="3"/>`,
    dot: `<circle cx="70" cy="62" r="22" fill="#2a1a10"/><circle cx="130" cy="62" r="22" fill="#2a1a10"/><ellipse cx="100" cy="78" rx="52" ry="30" fill="#2a1a10"/>`,
    remy: `<path d="M50 96 q0 -46 50 -46 q50 0 50 46 q-20 -18 -50 -18 q-30 0 -50 18z" fill="#7a4a24"/><rect x="68" y="104" width="64" height="18" rx="4" fill="none" stroke="#222" stroke-width="3"/>`,
    celeste: `<path d="M46 150 q-4 -100 54 -100 q58 0 54 100 q-10 -60 -54 -60 q-44 0 -54 60z" fill="#3a2440"/>`,
  }[who];
  return `<svg viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg">
  <defs><radialGradient id="bg${who}" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="${p.bg[0]}"/><stop offset="1" stop-color="${p.bg[1]}"/></radialGradient>
  <linearGradient id="gl${who}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
  <rect width="200" height="240" fill="url(#bg${who})"/>
  <path d="M20 240 q0 -62 80 -62 q80 0 80 62z" fill="${p.top}"/>
  <rect x="86" y="150" width="28" height="36" rx="12" fill="${p.skin}"/>
  <ellipse cx="100" cy="112" rx="46" ry="52" fill="${p.skin}"/>
  ${who === 'vesper' ? '' : `<ellipse cx="82" cy="112" rx="6" ry="8" fill="#1c1430"/><ellipse cx="118" cy="112" rx="6" ry="8" fill="#1c1430"/><circle cx="84" cy="109" r="2" fill="#fff"/><circle cx="120" cy="109" r="2" fill="#fff"/>`}
  <path d="M86 138 q14 10 28 0" fill="none" stroke="#9a2a44" stroke-width="4" stroke-linecap="round"/>
  ${hair}
</svg>`;
}
export function portrait(who) {
  return `<div class="pt">${portraitSVG(who)}<img src="assets/portraits/${who}.webp" alt="" onerror="this.remove()"></div>`;
}

// ---------- Caption (Nova's thoughts while exploring) ----------
let capT = 0;
export function caption(text, ms = 4200) {
  const c = $('#caption');
  c.innerHTML = text; c.classList.add('on');
  clearTimeout(capT);
  capT = setTimeout(() => c.classList.remove('on'), ms + text.length * 25);
}
export function hideCaption() { $('#caption').classList.remove('on'); }

export function tip(text, x, y) {
  const t = $('#tip');
  if (!text) { t.classList.remove('on'); return; }
  t.textContent = text; t.classList.add('on');
  t.style.left = x + 'px'; t.style.top = y + 'px';
}

export function toast(text) {
  const t = el('div', 'toast', text);
  $('#toasts').appendChild(t);
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3200);
}

// ---------- Dialogue ----------
// lines: array of strings; "N: ..." is Nova, "*..." is narration, anything else is the speaker.
let busy = false;
export const talking = () => busy;
// who is speaking right now (read by the character animation for lip-sync and nods)
export const speech = { who: null, typing: false, focus: null };

export function openTalk(who, { pt = false } = {}) {
  busy = true;
  const T = $('#talk');
  T.className = 'on' + (who && pt ? '' : ' solo');
  $('#talkPt').innerHTML = who && pt ? portrait(who) : '';
  // in person, show a painted portrait only if real art exists (the 3D close-up is the default)
  if (who && !pt) {
    const img = new Image();
    img.onload = () => { if (busy) { $('#talkPt').innerHTML = `<div class="pt">${''}</div>`; $('#talkPt .pt').appendChild(img); T.classList.remove('solo'); } };
    img.src = `assets/portraits/${who}.webp`;
  }
  $('#talkName').textContent = who ? PEOPLE[who].n : '';
  $('#talkName').style.setProperty('--c', who ? PEOPLE[who].c : '#1aa6d9');
  $('#talkOpts').innerHTML = '';
  document.body.classList.add('talking');
}
export function closeTalk() {
  busy = false; speech.who = null; speech.typing = false;
  $('#talk').className = '';
  document.body.classList.remove('talking');
}

export function say(who, lines) {
  return new Promise(res => {
    const box = $('#talkLine'), opts = $('#talkOpts');
    opts.innerHTML = '';
    let i = -1, typing = 0, full = '';
    const next = () => {
      if (typing) { clearInterval(typing); typing = 0; box.querySelector('.tx').innerHTML = full; speech.typing = false; return; }
      i++;
      if (i >= lines.length) { box.onclick = null; box.classList.remove('more'); res(); return; }
      let l = lines[i], sp = who;
      if (l.startsWith('N:')) { sp = 'nova'; l = l.slice(2).trim(); }
      else if (l.startsWith('*')) { sp = null; l = l.replace(/^\*|\*$/g, '').trim(); }
      full = l; speech.who = sp; speech.typing = true;
      box.className = 'more' + (sp === 'nova' ? ' nova' : sp ? '' : ' narr');
      box.innerHTML = `<b style="--c:${sp ? PEOPLE[sp].c : '#6a7a90'}">${sp ? PEOPLE[sp].n : ''}</b><span class="tx"></span><i class="nx">▼</i>`;
      const tx = box.querySelector('.tx');
      let k = 0;
      typing = setInterval(() => {
        k += 2; tx.textContent = l.slice(0, k);
        if (k >= l.length) { clearInterval(typing); typing = 0; tx.innerHTML = l; speech.typing = false; }
      }, 16);
    };
    box.onclick = () => { sfx('click'); next(); };
    next();
  });
}

export function choose(options) {
  return new Promise(res => {
    const opts = $('#talkOpts');
    $('#talkLine').className = 'idle';
    opts.innerHTML = '';
    options.forEach((o, i) => {
      const b = el('button', 'opt' + (o.dim ? ' dim' : '') + (o.bye ? ' bye' : '') + (o.hot ? ' hot' : ''), o.text);
      b.onclick = () => { sfx('click'); opts.innerHTML = ''; res(i); };
      opts.appendChild(b);
    });
  });
}

// ---------- Panels (documents, puzzles, notebook, phone) ----------
let panelClose = null;
export function panel(html, { cls = '', title = '', onClose, noClose } = {}) {
  closePanel(true);
  const wrap = $('#panel');
  wrap.className = 'on ' + cls;
  wrap.innerHTML = `<div class="pbox">${title ? `<div class="ptitle">${title}</div>` : ''}${noClose ? '' : '<button class="x" aria-label="Close">✕</button>'}<div class="pbody">${html}</div></div>`;
  const x = wrap.querySelector('.x');
  if (x) x.onclick = () => { sfx('click'); closePanel(); };
  panelClose = onClose || null;
  document.body.classList.add('paneled');
  return wrap.querySelector('.pbody');
}
export function closePanel(silent) {
  const wrap = $('#panel');
  if (!wrap.classList.contains('on')) return;
  wrap.className = ''; wrap.innerHTML = '';
  document.body.classList.remove('paneled');
  const f = panelClose; panelClose = null;
  if (f && !silent) f();
}
export const panelOpen = () => $('#panel').classList.contains('on');

// ---------- Screens ----------
export function fade(mid, ms = 450) {
  const f = $('#fade');
  f.classList.add('on');
  return new Promise(res => setTimeout(async () => { if (mid) await mid(); setTimeout(() => { f.classList.remove('on'); res(); }, 120); }, ms));
}

export function screen(html, cls = '') {
  const s = $('#screen');
  s.className = 'on ' + cls;
  s.innerHTML = html;
  return s;
}
export function closeScreen() { const s = $('#screen'); s.className = ''; s.innerHTML = ''; }

export function setPhaseChip(t) { $('#phase').textContent = t; }
