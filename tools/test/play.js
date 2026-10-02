// Full playthrough of the case through the game's own handlers. node play.js <url> [senior]
const { chromium } = require('playwright');
(async () => {
  const [url, diff] = process.argv.slice(2);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1000, height: 760 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error' && !/favicon|Sprite/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.addInitScript(() => { localStorage.clear(); localStorage.setItem('novavale.ctl', '1'); });
  await p.goto(url); await p.waitForSelector('#tNew', { timeout: 180000 }); await p.click('#tNew'); await p.click(diff === 'senior' ? '#dS' : '#dJ');
  p.setDefaultTimeout(600000);
  const log = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms)), L = [], note = s => L.push(s);
    const map = JSON.parse(document.querySelector('script[type=importmap]').textContent).imports;
    const ui = await import(new URL(map['./js/ui.js'], location.href).href);
    const st = await import(new URL(map['./js/state.js'], location.href).href);
    const { S, story } = __dbg;
    const flag = (...f) => f.forEach(k => st.set(k)), doc = (...d) => d.forEach(k => st.addDoc(k)), item = (...i) => i.forEach(k => st.giveItem(k));
    const SKIP = /help with the cake|frame by frame/i;
    let chooser = null;
    // click through lines; answer option lists with chooser(texts) -> index, or default topic walking
    async function drive(maxMs = 120000, topics = null) {
      const t0 = performance.now(), used = new Set();
      while (performance.now() - t0 < maxMs) {
        await w(25);
        const pan = document.querySelector('#panel.on, #panel.open, #panel[style*="block"]') || (ui.panelOpen && ui.panelOpen() ? document.querySelector('#panel') : null);
        if (ui.panelOpen && ui.panelOpen()) {
          const ev = document.querySelector('.ev-grid');
          if (ev) { for (const k of (window.__evPick || ['log', 'repairlog'])) document.querySelector(`.ev-c[data-k="${k}"]`)?.click(); await w(50); document.querySelector('#evgo')?.click(); note('evidence board solved with ' + (window.__evPick || ['log', 'repairlog']).join('+')); await w(200); continue; }
          ui.closePanel(true); continue;
        }
        if (document.querySelector('#screen .end')) return 'end';
        if (document.querySelector('#cine.on')) { document.querySelector('#cine.on').click(); continue; }
        const opts = [...document.querySelectorAll('#talkOpts button')];
        if (opts.length) {
          const texts = opts.map(o => o.textContent.trim());
          let i = chooser ? chooser(texts) : -1;
          if (i < 0) { i = texts.findIndex(t => t !== 'Goodbye' && !used.has(t) && !SKIP.test(t)); if (i < 0) i = texts.indexOf('Goodbye'); }
          if (i >= 0) { used.add(texts[i]); if (topics) topics.push(texts[i]); opts[i].click(); }
          continue;
        }
        const l = document.querySelector('#talk.on #talkLine');
        if (l) { l.click(); continue; }
        if (!document.querySelector('#talk.on')) { await w(150); if (!document.querySelector('#talk.on') && !document.querySelector('#talkOpts button')) return 'idle'; }
      }
      return 'timeout';
    }
    const hot = async id => { story.onHot(id); await drive(30000); };
    const talk = async who => { const T = []; story.onTalk(who); const r = await drive(180000, T); note(`${S.phase} ${who}: ${T.length} topics${r === 'timeout' ? ' TIMEOUT' : ''}`); };
    const rest = async (want) => { story.onHot('bed'); await w(1500); await drive(30000); note(`rest -> ${S.phase}` + (S.phase === want ? '' : ' (WANTED ' + want + ')')); };
    const tasks = () => story.tasks().filter(t => !t.d && !t.t.startsWith('Optional')).map(t => t.t);
    const ALL = ['vesper', 'cherry', 'dex', 'juniper', 'opal', 'regent', 'harper', 'kenji', 'priya', 'jojo', 'rashad', 'gus', 'silas', 'nate'];
    // close the opening letter and Nova's first thoughts
    document.querySelector('#lgo')?.click(); await w(1500); document.querySelector('#cine.on')?.click(); await drive(20000);
    // ---- Day 1
    await talk('celeste');
    await hot('case'); await hot('pin'); await hot('crewphoto'); await hot('books'); await hot('opalnote'); await hot('oven');
    flag('aqua_login', 'log_read', 'holo_mail', 'vesper_mail', 'memo_read'); doc('log', 'mail_holo', 'mail_vesper', 'memo');
    for (const who of ALL) await talk(who);
    note('d1 open tasks: ' + JSON.stringify(tasks()));
    await rest('n1');
    // ---- Night 1
    flag('switch_done'); await hot('holocard');
    for (const who of ['cherry', 'gus', 'silas', 'nate']) await talk(who);
    note('n1 open tasks: ' + JSON.stringify(tasks()));
    await rest('d2');
    // ---- Day 2
    flag('acrostic'); doc('lyrics');
    flag('juniper_clear');
    for (const who of ['dex', 'vesper', 'juniper', 'cherry', 'silas', 'kenji', 'opal']) await talk(who);
    await hot('sketch'); flag('const_done'); flag('drawer_open'); item('key', 'blueprint'); doc('blueprint');
    note('d2 open tasks: ' + JSON.stringify(tasks()));
    await rest('n2');
    // ---- Night 2: the tunnel, the vault, Opal. First the bad ending, then Second Chance, then the right way
    await hot('hatch'); flag('door_open');
    chooser = t => t.findIndex(x => /calling the police/i.test(x));
    story.onTalk('opal'); let r = await drive(60000); chooser = null;
    note('n2 police choice -> ' + (document.querySelector('#screen h1')?.textContent || r));
    document.querySelector('#sc')?.click(); await w(800); await drive(10000);
    note('after Second Chance: phase ' + S.phase + ', crown back ' + !!S.flags.crown_back);
    chooser = t => { const a = t.findIndex(x => /Nice room/i.test(x)); return a >= 0 ? a : t.findIndex(x => /better one/i.test(x)); };
    story.onTalk('opal'); await drive(90000); chooser = null; await w(2500); await drive(20000);
    note('after Opal: phase ' + S.phase);
    // ---- Gala day
    for (const who of ['dex']) await talk(who);
    await hot('case'); await hot('desk');
    for (const who of ['harper', 'rashad']) await talk(who);
    window.__evPick = ['harper', 'repairlog'];
    await talk('kenji');
    note('kenji caught: ' + !!S.flags.kenji_caught);
    await hot('kbench'); flag('stella_open'); item('realstar'); doc('kenjiletter');
    await talk('priya'); await talk('rashad');
    note('g open tasks: ' + JSON.stringify(tasks()));
    // Kenji: the police first (bad ending, Second Chance), then the right way
    chooser = t => t.findIndex(x => /calling the police/i.test(x));
    story.onTalk('kenji'); r = await drive(60000); chooser = null;
    note('kenji police choice -> ' + (document.querySelector('#screen h1')?.textContent || r));
    document.querySelector('#sc')?.click(); await w(800); await drive(10000);
    note('after Second Chance: phase ' + S.phase + ', g_done ' + !!S.flags.g_done);
    chooser = t => { const a = t.findIndex(x => /Why not just tell Celeste/i.test(x)); return a >= 0 ? a : t.findIndex(x => /tell Celeste together/i.test(x)); };
    story.onTalk('kenji'); r = await drive(120000); chooser = null;
    note('final: ' + (document.querySelector('#screen h1')?.textContent || r) + ', phase ' + S.phase);
    return L;
  });
  console.log(log.join('\n'));
  console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].join('\n') : 'no page errors');
  await b.close();
})();
