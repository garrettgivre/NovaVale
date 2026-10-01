// For every room: (1) each hotspot visible (first ray hit) from at least one of the room's camera spots, by phase;
// (2) the straight glide between connected camera spots not blocked at knee/waist/eye height.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] }); const p = await b.newPage({ viewport: { width: 800, height: 600 } });
  p.on('pageerror', e => console.log('PAGEERR', String(e)));
  await p.addInitScript(() => { localStorage.clear(); localStorage.setItem('novavale.ctl', '1'); });
  await p.goto(process.argv[2]); await p.waitForSelector('#tNew', { timeout: 120000 }); await p.click('#tNew'); await p.click('#dJ');
  const res = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms)); document.querySelector('#lgo')?.click(); await w(300);
    for (let i = 0; i < 40; i++) { const l = document.querySelector('#talk.on #talkLine'); if (!l) break; l.click(); await w(30); }
    const map = JSON.parse(document.querySelector('script[type=importmap]').textContent).imports;
    const W = await import(new URL(map['./js/world.js'], location.href).href);
    const THREE = await import(new URL(map['three'], location.href).href);
    const { NODES, rooms } = __dbg, out = { hidden: [], blocked: [] };
    const ray = new THREE.Raycaster(); ray.camera = __dbg.camera;
    const vis = o => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
    for (const ph of ['d1', 'n1', 'd2', 'n2', 'g']) {
      __dbg.S.phase = ph; W.sync();
      for (const id in rooms) {
        const R = rooms[id], wasVis = R.g.visible; R.g.visible = true; R.g.updateMatrixWorld(true);
        const nodes = Object.keys(NODES).filter(k => NODES[k].room === id);
        const hots = []; R.g.traverse(o => { if (o.userData.hot && vis(o)) hots.push(o); });
        for (const h of hots) {
          const box = new THREE.Box3().setFromObject(h), c = box.getCenter(new THREE.Vector3());
          let seen = false;
          for (const n of nodes) {
            const eye = new THREE.Vector3(NODES[n].p[0], 1.62, NODES[n].p[1]), dir = c.clone().sub(eye), d = dir.length(); dir.normalize();
            ray.set(eye, dir); ray.far = d + 0.5;
            const hit = ray.intersectObject(R.g, true).find(x => vis(x.object) && x.object.material && x.object.material.visible !== false && !(x.object.material.transparent && x.object.material.opacity < 0.4));
            if (!hit) { seen = true; break; }
            let q = hit.object; for (; q; q = q.parent) if (q === h) break;
            if (q || hit.distance > d - 0.4) { seen = true; break; }
          }
          if (!seen) out.hidden.push(`${ph} ${id} ${h.userData.hot} (${h.userData.name})`);
        }
        if (ph === 'd1') for (const n of nodes) for (const to of NODES[n].exits) {
          const A = NODES[n].p, B = NODES[to].p, dir = new THREE.Vector3(B[0] - A[0], 0, B[1] - A[1]), d = dir.length(); dir.normalize();
          for (const y of [0.35, 0.95, 1.5]) {
            ray.set(new THREE.Vector3(A[0], y, A[1]), dir); ray.far = d;
            const hit = ray.intersectObject(R.g, true).find(x => vis(x.object) && x.object.material && x.object.material.visible !== false && !x.object.userData.go && !(function u(o) { for (; o; o = o.parent) if (o.userData.who || o.userData.go) return 1; })(x.object));
            if (hit) { out.blocked.push(`${n}->${to} at ${y}m by ${hit.object.name || hit.object.type} ${hit.point.toArray().map(v => v.toFixed(1))}`); break; }
          }
        }
        R.g.visible = wasVis;
      }
    }
    out.hidden = [...new Set(out.hidden)];
    return out;
  });
  console.log(JSON.stringify(res, null, 1)); await b.close();
})();
