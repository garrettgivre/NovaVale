const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] }); const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(() => { localStorage.clear(); localStorage.setItem('novavale.ctl', '1'); });
  await p.goto(process.argv[2]); await p.waitForSelector('#tNew', { timeout: 180000 }); await p.click('#tNew'); await p.click('#dJ');
  await p.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); for (let i = 0; i < 160; i++) { const l = document.querySelector('#talk.on #talkLine'); if (l) l.click(); await w(50); } for (let i = 0; i < 100 && document.querySelector('#talk.on'); i++) { document.querySelector('#talk.on #talkLine')?.click(); await w(80); } __dbg.setRetro(false); __dbg.view('W2'); __dbg.V.yaw += 1.0; });
  await p.waitForTimeout(2000);
  const h = await p.evaluate(async () => { const map = JSON.parse(document.querySelector('script[type=importmap]').textContent).imports; const W = await import(new URL(map['./js/world.js'], location.href).href);
    return W.hotspotsOnScreen(__dbg.camera, innerWidth, innerHeight).filter(x => !x.who).map(x => ({ n: x.name, x: x.x, y: x.y, d: +x.d.toFixed(1) })); });
  console.log(JSON.stringify(h));
  console.log('state', JSON.stringify(await p.evaluate(() => ({ busy: __dbg.V.busy, focus: !!__dbg.V.focus, approach: __dbg.V.approach, talk: !!document.querySelector('#talk.on'), panel: document.querySelector('#panel').className, title: __dbg.V.title, cine: !!__dbg.V.cine, screen: document.querySelector('#screen').className }))));
  const t = h.find(x => /Suite 2/.test(x.n)) || h[0];
  console.log('pick', JSON.stringify(await p.evaluate(t => [0, -40, 40, 80].map(dy => __dbg.pick(t.x, t.y + dy)), t)));
  await p.mouse.click(t.x, t.y); await p.waitForTimeout(4000);
  const a = await p.evaluate(() => ({ node: __dbg.S.node, cap: document.querySelector('#caption').innerText, ready: __dbg.V.doorReady }));
  await p.screenshot({ path: 'hall1.png' });
  const t2 = await p.evaluate(async n => { const map = JSON.parse(document.querySelector('script[type=importmap]').textContent).imports; const W = await import(new URL(map['./js/world.js'], location.href).href);
    return W.hotspotsOnScreen(__dbg.camera, innerWidth, innerHeight).find(x => x.name === n); }, t.n);
  if (t2) { await p.mouse.click(t2.x, t2.y); await p.waitForTimeout(2500); }
  const b2 = await p.evaluate(() => ({ node: __dbg.S.node, talk: document.querySelector('#talk.on #talkLine')?.innerText }));
  console.log(JSON.stringify({ tapped: t.n, first: a, second: b2 }), errs.length ? errs : 'no errors'); await b.close();
})();
