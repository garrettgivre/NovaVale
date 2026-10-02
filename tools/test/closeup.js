// Headless screenshots from any point in a room: node closeup.js <url> <outdir> name=room,camX,camZ,lookX,lookZ ...
// (the first spec warms up loading; room ids as in world.js rooms, e.g. lobby, wing, plan, kitchen)
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
    const mm = spec.match(/^(\w+)=(\w+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)(?::(\w+))?$/); if (!mm) { console.log('bad', spec); continue; }
    const node = 'Z9', phase = mm[7] || 'd1', yaw = '0';
    await p.evaluate(({ node, phase, yaw, mm }) => {
      __dbg.NODES.Z9 = { room: mm[2], p: [+mm[3], +mm[4]], look: [+mm[5], +mm[6]], exits: [] };
      __dbg.S.phase = phase; __dbg.view(node);
      __dbg.V.yaw += yaw * Math.PI / 180;
    }, { node, phase, yaw: +yaw, mm });
    await p.waitForTimeout(+(process.env.WAIT || 1500));
    const f = path.join(out, mm[1] + '.png');
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
