# Headless test scripts (Playwright)

Install once somewhere outside the repo: `npm i playwright && npx playwright install chromium`, then run these with
`NODE_PATH=<that folder>/node_modules node tools/test/<script>.js http://localhost:8777/ ...` while the local server runs.

- `play.js [senior]`: the whole case through the game's own handlers (all phases, every conversation, the evidence board,
  two bad endings with Second Chance, Case Closed). Prints a log and any page errors.
- `world_check.js`: every hotspot visible from a camera spot in its room, and the glides between spots unblocked.
- `shot.js <outdir> NODE[:phase][@yaw] ...`: screenshots of camera spots, with draw calls per frame.
- `face.js <out.png> <who> <node>`: a conversation close-up (env `W`, `H`, `DPR` for a phone size).
- `side.js <prefix> <who> <node> <angles>`: a character's head from angles round them (3.2 m, long lens).
- `acts.js <prefix> <who> <node> <pose,...> [angle dist height fov]`: full-body poses (`none`, `rest`, `g0`-`g5` gestures,
  idle habits like `hip:R`, `shrug`, `onlyupper`).
- `talk.js '<json scenario>'`: one conversation with flags set and topics picked by text.
