// node face.js <url> <out.png> <who> <node> [phase] [yawOffsetDeg]  -> conversation close-up of a character (env RETRO=1 keeps the retro picture)
const { chromium } = require('playwright');
(async () => {
  const [url, out, who, node, phase = 'd1', yaw = '0'] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] }); const p = await b.newPage({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 800) }, deviceScaleFactor: +(process.env.DPR || 1) });
  p.on('pageerror', e => console.log('PAGEERR', String(e))); p.on('console', m => m.type() === 'error' && console.log('CONSOLE', m.text()));
  await p.addInitScript(() => { localStorage.clear(); localStorage.setItem('novavale.ctl', '1'); });
  await p.goto(url); await p.waitForSelector('#tNew', { timeout: 120000 }); await p.click('#tNew'); await p.click('#dJ');
  await p.evaluate(async ([who, node, phase, yaw, retro]) => { const w = ms => new Promise(r => setTimeout(r, ms)); document.querySelector('#lgo')?.click(); await w(300); for (let i = 0; i < 40; i++) { const l = document.querySelector('#talk.on #talkLine'); if (!l) break; l.click(); await w(30); }
    await w(7000); for (let i = 0; i < 40; i++) { const l = document.querySelector('#talk.on #talkLine'); if (!l) break; l.click(); await w(30); }   // the directed start: wake in Suite 2, the knock
    if (!retro) __dbg.setRetro(false); __dbg.S.phase = phase; __dbg.view(node); await w(5000); __dbg.focus(who); }, [who, node, phase, +yaw, !!process.env.RETRO]);
  await p.addStyleTag({ content: '#panel,#talk,#toast,#caption,#tip{display:none!important}' });
  await p.waitForTimeout(2500); await p.screenshot({ path: out }); console.log(out); await b.close();
})();
