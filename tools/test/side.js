// node side.js <url> <outprefix> <who> <node> <angles,...> [phase]: views of a character's head from angles round them
const { chromium } = require('playwright');
(async () => {
  const [url, out, who, node, angs, phase = 'd1'] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] }); const p = await b.newPage({ viewport: { width: 700, height: 700 } });
  p.on('pageerror', e => console.log('PAGEERR', String(e)));
  await p.addInitScript(() => { localStorage.clear(); localStorage.setItem('novavale.ctl', '1'); });
  await p.goto(url); await p.waitForSelector('#tNew', { timeout: 120000 }); await p.click('#tNew'); await p.click('#dJ');
  await p.evaluate(async ([node, phase]) => { const w = ms => new Promise(r => setTimeout(r, ms)); document.querySelector('#lgo')?.click(); await w(300);
    for (let i = 0; i < 40; i++) { const l = document.querySelector('#talk.on #talkLine'); if (!l) break; l.click(); await w(30); }
    (__dbg.setRetro||(()=>0))(false); __dbg.S.phase = phase; (__dbg.view||((n)=>__dbg.go(n,{fade:true})))(node); await w(6000); }, [node, phase]);
  await p.addStyleTag({ content: '#panel,#talk,#toast,#caption,#tip,#hud,#bar{display:none!important}' });
  for (const a of angs.split(',').map(Number)) {
    await p.evaluate(([who, a]) => {
      let c = null; for (const k in __dbg.rooms) __dbg.rooms[k].g.children.forEach(o => { if (o.userData.who === who && o.visible) c = o; });
      const h = c.userData.head.getWorldPosition(c.position.clone()), fw = c.getWorldDirection(c.position.clone()), f = Math.atan2(fw.x, fw.z) + a * Math.PI / 180;
      const cam = __dbg.camera; cam.position.set(h.x + Math.sin(f) * 3.2, h.y, h.z + Math.cos(f) * 3.2);
      __dbg.V.yaw = Math.atan2(-(h.x - cam.position.x), -(h.z - cam.position.z)); __dbg.V.pitch = 0; cam.fov = 11; cam.updateProjectionMatrix();
    }, [who, a]);
    await p.waitForTimeout(700); await p.screenshot({ path: `${out}_${a}.png`, clip: { x: 150, y: 50, width: 400, height: 500 } });
  }
  await b.close();
})();
