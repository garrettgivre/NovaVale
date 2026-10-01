// node acts.js <url> <outprefix> <who> <node> <act[:side],...>: full-body shots of a character mid-way through each idle habit
const { chromium } = require('playwright');
(async () => {
  const [url, out, who, node, acts, ang = '0', dist = '4', cy = '1.0', fov = '30'] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] }); const p = await b.newPage({ viewport: { width: +(process.env.W || 500), height: +(process.env.H || 800) } });
  p.on('pageerror', e => console.log('PAGEERR', String(e)));
  await p.addInitScript(() => { localStorage.clear(); localStorage.setItem('novavale.ctl', '1'); });
  await p.goto(url); await p.waitForSelector('#tNew', { timeout: 120000 }); await p.click('#tNew'); await p.click('#dJ');
  await p.evaluate(async node => { const w = ms => new Promise(r => setTimeout(r, ms)); document.querySelector('#lgo')?.click(); await w(300);
    for (let i = 0; i < 40; i++) { const l = document.querySelector('#talk.on #talkLine'); if (!l) break; l.click(); await w(30); }
    __dbg.setRetro(false); __dbg.view(node); await w(6000); }, node);
  await p.addStyleTag({ content: '#panel,#talk,#toast,#caption,#tip,#hud,#bar{display:none!important}' });
  for (const spec of acts.split(',')) {
    const [k, side] = spec.split(':');
    const d = await p.evaluate(([who, k, side, ang, dist, cy, fov]) => {
      let c = null; for (const r in __dbg.rooms) __dbg.rooms[r].g.children.forEach(o => { if (o.userData.who === who && o.visible) c = o; });
      const fw = c.getWorldDirection(c.position.clone()), cam = __dbg.camera;
      const f = Math.atan2(fw.x, fw.z) + ang * Math.PI / 180; cam.position.set(c.position.x + Math.sin(f) * dist, cy, c.position.z + Math.cos(f) * dist); __dbg.V.yaw = f; __dbg.V.pitch = 0; cam.fov = fov; cam.updateProjectionMatrix();
      const u = c.userData; u.act = null; u.actNext = 999; u.dbgRest = k === 'rest'; u.dbgOnly = k.startsWith('only') ? k.slice(4).replace(/[zx]$/, '') : null; u.dbgAx = /^only.*[zx]$/.test(k) ? k.slice(-1) : null;
      if (k.startsWith('g')) { const G = [['R', .2, .26, 99], ['L', .2, .26, 99], ['B', .16, .18, 99], ['R', .3, .14, 99], ['L', .3, .14, 99], ['B', .1, .3, 99]][+k.slice(1)]; u.forceG = G; } else u.forceG = null;
      if (k !== 'none' && k !== 'rest' && !k.startsWith('only') && !k.startsWith('g')) u.act = { k, t: 0, d: 2.4, side: side || 'R', dir: 1, dir2: .2 };
      return 2.4;
    }, [who, k, side, +ang, +dist, +cy, +fov]);
    await p.waitForTimeout(d * 500); await p.screenshot({ path: `${out}_${spec.replace(':', '')}.png` });
  }
  await b.close();
})();
