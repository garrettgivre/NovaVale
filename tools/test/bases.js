// Render base images for ChatGPT paint-overs, framed from the game itself (no UI, no present-day characters).
// node tools/test/bases.js <url> <outdir>
const { chromium } = require('playwright');
const SHOTS = [
  // name, w, h, phase, node, camera [x,y,z], look-at [x,y,z], fov, flags
  ['title_keyart', 1600, 900, 'n1', 'E2', [7, 1.1, -34], [0, 6.5, 18], 34],
  ['pc1_lobby', 1200, 800, 'd1', 'L1', [0, 2.3, 7.6], [0, 2.5, -4], 62],
  ['pc2_spa', 1200, 800, 'd1', 'S1', [-3.4, 1.9, 4.2], [1.5, 1.3, -4], 62],
  ['pc3_kitchen', 1200, 800, 'd1', 'K1', [2.8, 1.7, 3.3], [-0.5, 1.2, -2.5], 60],
  ['pc4_staff_only', 1200, 800, 'd1', 'T1', [2.2, 1.7, 3.3], [-1, 1.3, -3.5], 62],
  ['pc5_opening_night', 1200, 800, 'n1', 'P1', [0, 1.3, 7.2], [0, 5.2, -4], 66],
  ['pc6_guest_wing', 1200, 800, 'd1', 'W1', [0, 1.6, 1.3], [0, 1.5, -12], 58],
  ['pc7_terrace_from_lake', 1200, 800, 'n1', 'E2', [-4, 1.0, -40], [0, 5, 18], 38],
  ['pc8_planetarium', 1200, 800, 'd1', 'P1', [-2.5, 1.5, 6.4], [0.5, 2.4, -5], 64],
  ['crewphoto_portico', 1200, 800, 'd1', 'E1', [2.5, 1.5, -1.5], [0, 3.6, 12], 52],
  ['painting1_lake_day', 800, 1000, 'd1', 'E2', [3, 1.6, -18], [0, 3.5, -60], 50],
  ['painting2_lake_night', 800, 1000, 'n1', 'E2', [3, 1.6, -18], [0, 3.5, -60], 50],
  ['painting3_shore_boathouse', 800, 1000, 'd1', 'E3', [-3, 1.5, -8], [-11, 1.6, -15], 46],
  ['painting4_dome_across_water', 800, 1000, 'd1', 'E2', [-6, 1.2, -46], [0, 5, 18], 32],
  ['ending_good_gala', 1280, 720, 'n1', 'L1', [0, 2.6, 7.8], [0, 3.6, -4], 64],
  ['ending_lights_out', 1280, 720, 'n2', 'L4', [0, 1.6, -5.6], [0, 1.5, 6], 62],
  ['ending_locked_in', 1280, 720, 'n2', 'U2', [0.3, 1.5, -11], [0, 1.4, -15.5], 60],
  ['ending_wrong_call', 1280, 720, 'd1', 'E1', [1.5, 1.6, -3], [0, 3, 12], 58],
  ['newspaper_opening', 1200, 800, 'n1', 'E1', [0, 1.7, 1.5], [0, 3.6, 10], 56],
];
(async () => {
  const [url, out] = process.argv.slice(2);
  const fs = require('fs'), path = require('path'); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  for (const [name, W, H, phase, node, pos, look, fov] of SHOTS) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => console.log('PAGEERR', String(e)));
    await p.addInitScript(() => { localStorage.clear(); localStorage.setItem('novavale.ctl', '1'); });
    await p.goto(url); await p.waitForSelector('#tNew', { timeout: 180000 }); await p.click('#tNew'); await p.click('#dJ');
    await p.evaluate(async ([phase, node, pos, look, fov]) => {
      const w = ms => new Promise(r => setTimeout(r, ms)); document.querySelector('#lgo')?.click(); await w(300);
      for (let i = 0; i < 40; i++) { const l = document.querySelector('#talk.on #talkLine'); if (!l) break; l.click(); await w(30); }
      __dbg.setRetro(false); __dbg.S.phase = phase; __dbg.view(node); await w(2500);
      for (const k in __dbg.rooms) __dbg.rooms[k].g.traverse(o => { if (o.userData.who) o.visible = false; });   // no present-day people
      const c = __dbg.camera, dx = look[0] - pos[0], dy = look[1] - pos[1], dz = look[2] - pos[2];
      c.position.set(...pos); c.fov = fov; c.far = 400; c.updateProjectionMatrix();
      __dbg.V.yaw = Math.atan2(-dx, -dz); __dbg.V.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      setInterval(() => { for (const k in __dbg.rooms) __dbg.rooms[k].g.traverse(o => { if (o.userData.who) o.visible = false; }); }, 50);
    }, [phase, node, pos, look, fov]);
    await p.addStyleTag({ content: 'body > *:not(canvas):not(#c){display:none!important} #c{display:block!important}' });
    await p.waitForTimeout(1500);
    await p.screenshot({ path: path.join(out, name + '.png') }); console.log(name);
    await p.close();
  }
  await b.close();
})();
