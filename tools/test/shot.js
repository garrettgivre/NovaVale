// Headless screenshots of Aquadome camera spots.
// node shot.js <url> <outdir> <spec> [<spec> ...]
// spec = NODE[:phase][@yawDegrees], e.g. L1  L3:n1  E1@40   (phase d1 default; yaw offset added to the node's view)
// env RETRO=1 for the retro picture, W/H for size (default 1280x800).
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const [url, out, ...specs] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 800) } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('novavale.ctl', '1'); } catch (e) { } });
  await p.goto(url);
  await p.waitForSelector('#tNew', { timeout: 120000 });
  await p.click('#tNew'); await p.click('#dJ');
  await p.evaluate(async (retro) => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 60; i++) { const l = document.querySelector('#talk.on #talkLine'); if (l) l.click(); else { const o = document.querySelector('#talkOpts button'); if (o) o.click(); else break; } await w(50); }
    __dbg.setRetro(retro);
  }, !!process.env.RETRO);
  await p.addStyleTag({ content: '#panel,#talk,#toast,#caption,#tip{display:none!important}' });
  for (const spec of specs) {
    const m = spec.match(/^([A-Z]\d)(?::(\w+))?(?:@(-?\d+))?$/); if (!m) { console.log('bad spec', spec); continue; }
    const [, node, phase = 'd1', yaw = '0'] = m;
    await p.evaluate(({ node, phase, yaw }) => {
      __dbg.S.phase = phase; __dbg.view(node);
      __dbg.V.yaw += yaw * Math.PI / 180;
    }, { node, phase, yaw: +yaw });
    await p.waitForTimeout(+(process.env.WAIT || 1500));
    const f = path.join(out, spec.replace(/[:@]/g, '_') + '.png');
    await p.screenshot({ path: f });
    const info = await p.evaluate(async () => {
      const I = __dbg.renderer.info; I.autoReset = false; I.reset();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const o = { calls: I.render.calls, tris: I.render.triangles, geos: I.memory.geometries, texs: I.memory.textures };
      I.autoReset = true; return o;
    });
    // calls/tris cover two frames (scene + shadow map + post), so halve them for one frame
    console.log(f, `calls/frame ${Math.round(info.calls / 2)}  tris/frame ${Math.round(info.tris / 2)}  geometries ${info.geos}  textures ${info.texs}`);
  }
  if (errs.length) console.log('ERRORS:\n' + [...new Set(errs)].join('\n'));
  await b.close();
})();
