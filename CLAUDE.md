# Nova Vale: The Secret of the Aquadome — notes for Claude

A first-person Nancy Drew-style mystery made by Garrett for his partner Beau (who loves the classic Her Interactive games, Frutiger Aero/Y2K, Gaga-style camp, drag and fashion, and Mario Galaxy). The detective is a fictional character, Nova Vale; Beau is not in the game. Nods to Beau's tastes stay as nods (Vesper Vox is our own pop diva, not Gaga).

## Rules
- Few custom images: rooms are modelled in code (three.js), documents and puzzles are HTML/CSS/SVG, sound is synthesised. Portraits are SVG placeholders until ChatGPT art lands in `assets/portraits/<id>.webp` (see `tools/art/WISHLIST.md`).
- No build step. ES modules, three.js r169 vendored in `vendor/`, import map in `index.html`.
- Mobile first, and it has to work on desktop too.
- Don't draw four-point sparkle stars (Garrett's rule from his other projects); five-point stars are fine.

## Structure
- `js/world.js`: rooms (`buildLobby`, `buildSpa`, `buildPlanetarium`, `buildKitchen`, `buildTech`, `buildArchive`, `buildSuite`, `buildTunnel`, `buildStarRoom`), each a Group at the origin with exactly two point lights (so switching rooms doesn't recompile shaders). `NODES` = camera spots {room, p:[x,z], look, exits}. Clickable things carry `userData.hot` (hotspot id), `.who` (character) or `.go` (walk arrow). Invisible hit spheres use the `HIT` material. `whereIs(who)` places characters by phase; `sync()` applies flags to the scene (pin, hologram card, sketch, dome code, crown).
- `js/story.js`: `taskList()` (tasks + Dot's hints, junior/senior), `HOT` (hotspot handlers), `INTRO`/`TOPICS` (dialogue; lines starting `N:` are Nova, `*` is narration; `when`, `after`, `hot` = starred new lead), `REST_NEED` (what unlocks sleeping to the next phase), `finale()`, `badEnding()`, `ending()`, phone `CALLS`, notebook `NOTES`.
- `js/puzzles.js`: `aquaOS` (password pixel2003), `switchboard` (zone 5 = planetarium; MAIN = bad ending), `acrostic` (LIPSYNC), `recipe` (vegan swaps), `constellation` (stars 0–4), `drawerDial` (729), `starDoor` (outer ringed planet, middle moon, inner comet).
- `js/state.js`: `S` (phase d1/n1/d2/n2/end, flags, inv, docs), localStorage key `novavale.aquadome.v1`, `checkpoint()`/`secondChance()`.

## The case (spoilers)
Day 1: examine the case, find Opal's brass pin, meet all five, read the keypad log (MAINT-0, a 2003 build-team code). Night 1: the singing ghost; switchboard → planetarium; Dex's hologram card; Cherry's secret rehearsal and the flashlight in a long coat. Day 2: Dex confesses the ghost (alibi); Vesper's acrostic = lip sync (alibi); Juniper's vegan cake puzzle (alibi, saw the long coat); the relaunch memo makes Opal leave the archive; her sketch → constellation → 7·2·9 → drawer: service key + Star Room blueprint. Night 2: service door → tunnel → ring door → Star Room → Opal. Choose compassion (save the planetarium) for the good ending.

## Testing
- Serve: `python -m http.server 8777` (launch config `aquadome`).
- `window.__dbg = {S, go, story, NODES}` is exposed for testing: `__dbg.go('T1',{fade:true})`, `__dbg.story.onHot('computer')`, `__dbg.story.onTalk('dex')`, `__dbg.story.tasks()`. The whole case was played through this way (both bad endings and Second Chance too).
- A hidden browser pane throttles timers; wait longer after fades.
