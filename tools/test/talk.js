// Dialogue tester: node talk.js <url> '<json scenario>'
// scenario: { phase, flags:[...], items:[...], docs:[...], asked:{}, who, pick:[topic text fragments in order] }
const { chromium } = require('playwright');
(async () => {
  const [url, json] = process.argv.slice(2), sc = JSON.parse(json);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(() => { localStorage.clear(); localStorage.setItem('novavale.ctl', '1'); });
  await p.goto(url); await p.waitForSelector('#tNew', { timeout: 120000 });
  await p.click('#tNew'); await p.click('#dJ');
  const out = await p.evaluate(async sc => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('#lgo')?.click(); await w(200);
    for (let i = 0; i < 160; i++) { const l = document.querySelector('#talk.on #talkLine'); if (l) l.click(); await w(50); }   // through the opening (suite, knock)
    const S = __dbg.S; S.phase = sc.phase || 'd1';
    for (const f of sc.flags || []) S.flags[f] = true;
    for (const i of sc.items || []) S.inv.includes(i) || S.inv.push(i);
    for (const d of sc.docs || []) S.docs.includes(d) || S.docs.push(d);
    Object.assign(S.asked, sc.asked || {});
    const log = [], picks = [...(sc.pick || [])];
    const talk = __dbg.story.onTalk(sc.who);
    let last = '';
    for (let n = 0; n < 400; n++) {
      await w(40);
      const opts = [...document.querySelectorAll('#talkOpts button')];
      if (opts.length) {
        const want = picks[0];
        let o = want ? opts.find(x => x.textContent.includes(want)) : null;
        if (want && !o) { log.push('!! topic not offered: ' + want + ' | offered: ' + opts.map(x => x.textContent).join(' / ')); picks.shift(); continue; }
        if (o) { picks.shift(); log.push('>> ' + o.textContent); o.click(); continue; }
        log.push('(topics: ' + opts.map(x => x.textContent).join(' / ') + ')');
        opts[opts.length - 1].click(); break;
      }
      const l = document.querySelector('#talk.on #talkLine');
      if (!l) { if (n > 5) break; continue; }
      l.click(); await w(10); l.click();
      const who = document.querySelector('#talk .who, #talkWho')?.textContent || '';
      const t = (l.querySelector('.tx') || l).textContent;
      if (t && t !== last) { log.push((who ? who + ': ' : '') + t); last = t; }
    }
    return log;
  }, sc);
  console.log(out.join('\n'));
  if (errs.length) console.log('ERRORS', errs);
  await b.close();
})();
