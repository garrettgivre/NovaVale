// node doorshots.js [filter] [url]  -> every door from 1.5 m at eye height into out/doors/<TAG env, default r1>
const { spawnSync } = require('child_process');
const f = n => n.toFixed(3);
const out = [];
const lob = { plan: 0, spa: 55, tech: 110, stairs: 150, terrace: 180, kitchen: 250, archive: 305 };
for (const [k, d] of Object.entries(lob)) { const a = d * Math.PI / 180, x = Math.sin(a) * 8.9, z = -Math.cos(a) * 8.9, ix = -Math.sin(a), iz = Math.cos(a); out.push(`L_${k}=lobby,${f(x + ix * 1.5)},${f(z + iz * 1.5)},${f(x)},${f(z)}`); }
const R = [['x_spa', 'spa', 0, 3.42, 0, 4.92], ['x_plan', 'plan', 0, 6.4, 0, 7.9], ['x_kitchen', 'kitchen', 0, 2.45, 0, 3.95], ['x_tech', 'tech', 0, 2.45, 0, 3.95], ['x_archive', 'archive', 1.2, 2.45, 1.2, 3.95], ['x_suite', 'suite', 0, 1.45, 0, 2.95],
  ['w_vsuite', 'wing', 0, -2.6, -1.5, -2.6], ['w_suite2', 'wing', 0, -4.2, 1.5, -4.2], ['w_linen', 'wing', 0, -8.2, -1.5, -8.2], ['w_suite4', 'wing', 0, -9.2, 1.5, -9.2], ['w_exit', 'wing', 0, 0.45, 0, 1.95], ['x_terrace', 'terrace', 0, 6.67, 0, 8.17],
  ['x_tunnel', 'tunnel', 0, 0.45, 0, 1.95], ['x_star', 'star', 0, 2.4, 0, 3.9], ['x_hatch', 'plan', 2.68, -5.89, 3.3, -7.25]];
for (const [n, r, cx, cz, lx, lz] of R) out.push(`${n}=${r},${cx},${cz},${lx},${lz}`);
const flt = process.argv[2] || '';
const specs = out.filter(s => s.includes(flt)); specs.unshift(specs[0].replace(/^\w+=/, 'warm='));
const P = __dirname, URL = process.argv[3] || 'http://localhost:8777/';
const r = spawnSync('node', [P + '/closeup.js', URL, 'out/doors/' + (process.env.TAG || 'r1'), ...specs], { stdio: 'inherit' });
