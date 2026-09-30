// Puzzles. Each opens a panel and calls done() when solved.
import { panel, closePanel, el, toast } from './ui.js';
import { S, has, set, addDoc, hasItem } from './state.js';
import { sfx } from './audio.js';
import { DOCS, ITEMS, icon } from './items.js';

const junior = () => S.diff === 'junior';
function shake(e) { e.classList.remove('shake'); void e.offsetWidth; e.classList.add('shake'); sfx('fail'); }

// ---------- AquaOS: Dex's computer ----------
export function aquaOS(onRead) {
  const body = panel('', { cls: 'os', title: '' });
  const login = () => {
    body.innerHTML = `<div class="aq-login">
      <div class="aq-logo"><span class="orb"></span>AquaOS <small>2003 Edition</small></div>
      <div class="aq-user"><div class="aq-av">DH</div><b>dhalloway</b></div>
      <input id="aqpw" type="password" placeholder="Password" autocomplete="off" autocapitalize="off" spellcheck="false">
      <button class="aq-btn" id="aqgo">Log in</button>
      <p class="aq-hint">${junior() ? 'Password hint: <i>my little buddy + the year we opened</i>' : 'Password hint: <i>you know it, Dex</i>'}</p></div>`;
    const inp = body.querySelector('#aqpw');
    const go = () => {
      const v = inp.value.toLowerCase().replace(/\s+/g, '');
      if (v === 'pixel2003') { sfx('solve'); set('aqua_login'); desktop(); }
      else { shake(body.querySelector('.aq-login')); inp.value = ''; }
    };
    body.querySelector('#aqgo').onclick = go;
    inp.onkeydown = e => { if (e.key === 'Enter') go(); };
    setTimeout(() => inp.focus(), 50);
  };
  const desktop = () => {
    body.innerHTML = `<div class="aq-desk">
      <div class="aq-icons">
        <button data-a="log"><span class="ai ai-lock"></span>SecureLog</button>
        <button data-a="mail"><span class="ai ai-mail"></span>Mail</button>
        <button data-a="holo"><span class="ai ai-holo"></span>Hologram</button>
        <button data-a="trash"><span class="ai ai-trash"></span>Recycle Bin</button>
      </div>
      <div class="aq-win" id="aqw"><div class="aq-bar"><span>Welcome</span></div><div class="aq-c">Welcome back, Dex! You have <b>3</b> new messages.</div></div>
      <div class="aq-task"><span class="orb sm"></span> Start <span class="clk">${new Date().toTimeString().slice(0, 5)}</span></div></div>`;
    const W = body.querySelector('#aqw');
    const win = (t, html) => { W.innerHTML = `<div class="aq-bar"><span>${t}</span></div><div class="aq-c">${html}</div>`; };
    const docLink = id => `<button class="aq-row" data-doc="${id}">${DOCS[id].t.replace(/^Email: /, '')}</button>`;
    body.querySelectorAll('.aq-icons button').forEach(b => b.onclick = () => {
      sfx('click');
      const a = b.dataset.a;
      if (a === 'log') { win('SecureLog — Display case 01', DOCS.log.html); if (!has('log_read')) { set('log_read'); addDoc('log'); onRead('log'); } }
      if (a === 'mail') {
        win('Mail — Inbox (3)', docLink('mail_holo') + docLink('mail_vesper') + docLink('memo'));
        W.querySelectorAll('[data-doc]').forEach(r => r.onclick = () => {
          const id = r.dataset.doc; sfx('click');
          win(DOCS[id].t, DOCS[id].html + '<button class="aq-btn sm" id="aqback">Back to inbox</button>');
          addDoc(id);
          const f = { mail_holo: 'holo_mail', mail_vesper: 'vesper_mail', memo: 'memo_read' }[id];
          if (!has(f)) { set(f); onRead(id); }
          W.querySelector('#aqback').onclick = () => b.onclick();
        });
      }
      if (a === 'holo') win('Hologram Studio', '<p>GHOST_v3.holo</p><p class="err">File not found. Last exported to: <b>memory card</b>.</p>');
      if (a === 'trash') win('Recycle Bin', '<p>old_passwords.txt — <i>empty</i></p><p>good job dex :)</p>');
    });
  };
  has('aqua_login') ? desktop() : login();
}

// ---------- Speaker switchboard (night 1) ----------
export function switchboard({ zones, onChange, onMain, solved }) {
  const labels = ['L_BB_', 'S_A', 'K_T__EN', 'S_ _TES', 'PL_N_T__ _M', 'P__L D_CK'];
  const body = panel(`<div class="sw">
    <div class="sw-plate">AQUADOME PUBLIC ADDRESS · 2003</div>
    <div class="sw-row">${labels.map((l, i) => `<div class="sw-z"><i class="led"></i><button class="tog" data-i="${i}"><span></span></button><em>${i + 1}</em><small>${l}</small></div>`).join('')}</div>
    <div class="sw-main"><button class="tog red" id="swMain"><span></span></button><small>MAIN</small></div>
    <p class="sw-note">${solved ? 'The singing came from zone 5.' : junior() ? 'Switch zones off one at a time and listen for when the singing stops. The labels are worn away.' : 'The labels are worn away.'}</p></div>`, { cls: 'sw-p', title: 'Speaker switchboard' });
  const draw = () => body.querySelectorAll('.tog[data-i]').forEach(b => {
    const i = +b.dataset.i; b.classList.toggle('off', !zones[i]);
    b.parentNode.querySelector('.led').classList.toggle('on', zones[i]);
  });
  draw();
  body.querySelectorAll('.tog[data-i]').forEach(b => b.onclick = () => {
    sfx('switch'); zones[+b.dataset.i] = !zones[+b.dataset.i]; draw(); onChange(zones, body);
  });
  body.querySelector('#swMain').onclick = () => { sfx('switch'); onMain(); };
}

// ---------- Acrostic in Vesper's lyrics ----------
export function acrostic(done) {
  const body = panel(DOCS.lyrics.html + `<div class="ans"><p>${junior() ? 'Vesper wrote "first letters in gold". What do they spell?' : 'Something\'s hidden in here.'}</p><input id="acin" placeholder="Hidden message" autocapitalize="characters"><button class="btn" id="acgo">Check</button></div>`, { cls: 'doc', title: DOCS.lyrics.t });
  const inp = body.querySelector('#acin');
  const go = () => {
    const v = inp.value.toUpperCase().replace(/[^A-Z]/g, '');
    if (v === 'LIPSYNC') {
      sfx('solve');
      body.querySelectorAll('.lyrics p:not(.hand)').forEach(p => { p.innerHTML = `<b class="gold">${p.textContent[0]}</b>${p.textContent.slice(1)}`; });
      body.querySelector('.ans').innerHTML = '<p class="ok">L·I·P·S·Y·N·C. Lip sync. Vesper isn\'t planning to sing live at all.</p>';
      done();
    } else shake(body.querySelector('.ans'));
  };
  body.querySelector('#acgo').onclick = go;
  inp.onkeydown = e => { if (e.key === 'Enter') go(); };
}

// ---------- Juniper's vegan cake ----------
export function recipe(done) {
  const rows = [
    ['2 eggs', ['2 eggs', 'gelatin sheets', '2 flax "eggs"', 'egg whites'], ['2 flax "eggs"']],
    ['1 cup butter', ['ghee', '1 cup vegan butter', 'lard', 'buttermilk'], ['1 cup vegan butter']],
    ['1 cup milk', ['1 cup oat milk', 'cream', 'whole milk', 'condensed milk'], ['1 cup oat milk']],
    ['½ cup honey', ['½ cup honey', 'beeswax', '½ cup maple syrup', 'royal jelly'], ['½ cup maple syrup']],
  ];
  const body = panel(`<div class="rc"><p>${junior() ? 'Swap each ingredient for a vegan one that does the same job.' : 'Make Nana Reyes\'s cake vegan.'}</p>
    ${rows.map((r, i) => `<label class="rc-row"><span>${r[0]}</span><select data-i="${i}"><option value="">choose…</option>${r[1].map(o => `<option>${o}</option>`).join('')}</select></label>`).join('')}
    <p class="rc-fixed">2 cups flour · 1 cup sugar · zest of 1 lemon</p><button class="btn" id="rcgo">Bake it</button></div>`, { cls: 'doc', title: 'Starfall Cake, vegan edition' });
  body.querySelector('#rcgo').onclick = () => {
    const ok = [...body.querySelectorAll('select')].every(s => rows[+s.dataset.i][2].includes(s.value));
    if (ok) { sfx('solve'); closePanel(true); done(); }
    else { shake(body.querySelector('.rc')); toast('Juniper winces. "Not quite, love."'); }
  };
}

// ---------- Planetarium constellation ----------
const STARS = [[150, 40], [150, 95], [150, 200], [80, 95], [220, 95], [60, 30], [250, 40], [40, 170], [255, 180], [100, 150], [205, 140], [110, 45], [190, 230], [30, 110], [270, 105], [95, 225]];
const WANT = [0, 1, 2, 3, 4];
export function constellation(done) {
  const sketch = hasItem('sketch');
  const body = panel(`<div class="cs">
    <p>${!sketch ? 'The projector wants a pattern of stars. Which ones? I need something to go on.' : junior() ? 'Tap the five stars that match Opal\'s sketch.' : 'Program the projector.'}</p>
    <div class="cs-wrap">${sketch ? `<div class="cs-ref">${icon('sketch')}<small>Opal's sketch</small></div>` : ''}
    <svg class="cs-sky" viewBox="0 0 300 260"><defs><radialGradient id="csg"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#bfe8ff"/><stop offset="1" stop-color="#bfe8ff" stop-opacity="0"/></radialGradient></defs>
      <rect width="300" height="260" rx="18" fill="#0b1030"/>
      <g id="cslines" stroke="#7fe8ff" stroke-width="3" stroke-linecap="round"></g>
      ${STARS.map((p, i) => `<g class="st" data-i="${i}"><circle cx="${p[0]}" cy="${p[1]}" r="16" fill="transparent"/><circle class="gl" cx="${p[0]}" cy="${p[1]}" r="9" fill="url(#csg)"/><circle cx="${p[0]}" cy="${p[1]}" r="3.4" fill="#fff"/></g>`).join('')}
    </svg></div><button class="btn" id="csgo" ${sketch ? '' : 'disabled'}>Project</button></div>`, { cls: 'doc', title: 'Projector console' });
  if (!sketch) return;
  const sel = new Set();
  body.querySelectorAll('.st').forEach(g => g.onclick = () => {
    sfx('click'); const i = +g.dataset.i;
    sel.has(i) ? sel.delete(i) : sel.add(i); g.classList.toggle('on', sel.has(i));
  });
  body.querySelector('#csgo').onclick = () => {
    const ok = sel.size === 5 && WANT.every(i => sel.has(i));
    if (!ok) { shake(body.querySelector('.cs-sky')); return; }
    const L = body.querySelector('#cslines');
    L.innerHTML = `<line x1="150" y1="40" x2="150" y2="200"/><line x1="80" y1="95" x2="220" y2="95"/>`;
    sfx('solve');
    setTimeout(() => { closePanel(true); done(); }, 900);
  };
}

// ---------- Opal's drawer ----------
export function drawerDial(done) {
  const d = [0, 0, 0];
  const body = panel(`<div class="dl"><p>${junior() ? 'A three-number combination.' : ''}</p><div class="dl-row">${d.map((_, i) => `<div class="dl-w"><button data-i="${i}" data-d="1">▲</button><b id="dw${i}">0</b><button data-i="${i}" data-d="-1">▼</button></div>`).join('')}</div><button class="btn" id="dlgo">Open</button></div>`, { cls: 'doc', title: 'Locked drawer' });
  body.querySelectorAll('.dl-w button').forEach(b => b.onclick = () => {
    sfx('click'); const i = +b.dataset.i; d[i] = (d[i] + +b.dataset.d + 10) % 10; body.querySelector('#dw' + i).textContent = d[i];
  });
  body.querySelector('#dlgo').onclick = () => {
    if (d.join('') === '729') { sfx('solve'); closePanel(true); done(); }
    else shake(body.querySelector('.dl-row'));
  };
}

// ---------- The Star Room door ----------
const SYM = {
  ringed: (x, y) => `<circle cx="${x}" cy="${y}" r="7" fill="#ffd98a"/><ellipse cx="${x}" cy="${y}" rx="13" ry="4" fill="none" stroke="#ffd98a" stroke-width="2.5" transform="rotate(-20 ${x} ${y})"/>`,
  moon: (x, y) => `<path d="M${x + 3} ${y - 9} a9 9 0 1 0 0 18 a7 7 0 1 1 0 -18z" fill="#e8f4ff"/>`,
  comet: (x, y) => `<circle cx="${x + 5}" cy="${y - 4}" r="5" fill="#7fe8ff"/><path d="M${x + 1} ${y - 1} L${x - 11} ${y + 9} M${x + 3} ${y + 1} L${x - 7} ${y + 11}" stroke="#7fe8ff" stroke-width="2.5" stroke-linecap="round"/>`,
  sun: (x, y) => `<circle cx="${x}" cy="${y}" r="6" fill="#ffb020"/>${[0, 1, 2, 3, 4, 5, 6, 7].map(k => { const a = k * Math.PI / 4; return `<line x1="${x + Math.cos(a) * 8}" y1="${y + Math.sin(a) * 8}" x2="${x + Math.cos(a) * 12}" y2="${y + Math.sin(a) * 12}" stroke="#ffb020" stroke-width="2.5" stroke-linecap="round"/>`; }).join('')}`,
  star: (x, y) => { let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 4.5 : 10; d += (i ? 'L' : 'M') + (x + Math.cos(a) * r).toFixed(1) + ' ' + (y + Math.sin(a) * r).toFixed(1); } return `<path d="${d}z" fill="#ff7fd0"/>`; },
  heart: (x, y) => `<path d="M${x} ${y + 8} C${x - 14} ${y - 2} ${x - 6} ${y - 12} ${x} ${y - 4} C${x + 6} ${y - 12} ${x + 14} ${y - 2} ${x} ${y + 8}z" fill="#ff3d6a"/>`,
};
const ORDER = ['ringed', 'moon', 'comet', 'sun', 'star', 'heart'];
export function starDoor(done) {
  const pos = [3, 4, 1]; // each ring's rotation step (0..5); a ring is right when its target symbol is at the top
  const want = [0, 1, 2]; // outer ringed, middle moon, inner comet
  const radii = [118, 82, 46];
  const body = panel(`<div class="sd"><p>${junior() ? (hasItem('blueprint') ? 'Tap a ring to turn it. The blueprint says: outer ringed planet, middle moon, inner comet.' : 'Tap a ring to turn it. Something should sit at the top of each.') : ''}</p>
    <svg viewBox="0 0 300 300" class="sd-svg"><circle cx="150" cy="150" r="142" fill="#8a96aa"/><circle cx="150" cy="150" r="136" fill="#b8c4d6"/>
    ${radii.map((r, i) => `<g class="ring" data-i="${i}"><circle cx="150" cy="150" r="${r}" fill="none" stroke="${['#c99a2e', '#8f9bb0', '#c99a2e'][i]}" stroke-width="32"/>
      <g class="rs" id="rs${i}">${ORDER.map((s, k) => { const a = -Math.PI / 2 + k * Math.PI / 3; return SYM[s](150 + Math.cos(a) * r, 150 + Math.sin(a) * r); }).join('')}</g></g>`).join('')}
    <path d="M150 4 l-9 -0 9 14 9 -14z" fill="#ff3d9a"/><circle cx="150" cy="150" r="22" fill="#ffc95c"/></svg></div>`, { cls: 'doc', title: 'Round vault door' });
  const draw = () => radii.forEach((r, i) => body.querySelector('#rs' + i).setAttribute('transform', `rotate(${-pos[i] * 60} 150 150)`));
  draw();
  body.querySelectorAll('.ring').forEach(g => g.onclick = () => {
    const i = +g.dataset.i; pos[i] = (pos[i] + 1) % 6; sfx('switch'); draw();
    if (pos.every((p, k) => p === want[k])) { sfx('solve'); setTimeout(() => { closePanel(true); done(); }, 700); }
  });
}
