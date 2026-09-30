# Nova Vale: The Secret of the Aquadome — notes for Claude

A first-person Nancy Drew-style mystery made by Garrett for his partner Beau (who loves the classic Her Interactive games, Frutiger Aero/Y2K, Gaga-style camp, drag and fashion, and Mario Galaxy). The detective is a fictional character, Nova Vale; Beau is not in the game. Nods to Beau's tastes stay as nods (Vesper Vox is our own pop diva, not Gaga).

## Rules
- Art style: classic early-2000s Nancy Drew (Her Interactive). Realistic pre-rendered look, a faded grand resort (marble, mahogany, brass, damask), serif type, a wood-and-brass interface bar, magnifying-glass cursors, paper documents. NOT bubbly or glossy (Garrett rejected the first Frutiger Aero pass as "too bubbly and modern"). AquaOS is the one diegetic 2003 computer and looks like an XP-era desktop.
- Few custom images: rooms are modelled in code (three.js) with procedural textures (`js/tex.js`), documents and puzzles are HTML/CSS/SVG, sound is synthesised. Phone-call portraits are SVG placeholders; painted art in `assets/portraits/<id>.webp` is used automatically when present (see `tools/art/WISHLIST.md`).
- No build step. ES modules, three.js r169 vendored in `vendor/`, import map in `index.html`.
- Mobile first, and it has to work on desktop too.
- Don't draw four-point sparkle stars (Garrett's rule from his other projects); five-point stars are fine.

## Nova's voice
A know-it-all who really does know it all (Garrett: "Beau is like that"). Bratty, confident, funny, never cruel. She calls people out when the evidence lets her ("call-out" topics are starred and appear once she has proof: Vesper's backup track, Dex's 11pm email, Juniper's oven log, Opal's pin and coat). Nancy Drew's audacity is the model. Keep new lines in that voice.

## Design rules from fan research (what Nancy Drew fans love and hate)
- Love: atmospheric places with lots to explore, suspects who each hide something, lore to read, Nancy's sass, phone friends, puzzles woven into the story, Second Chance.
- Hate: chores and padding, backtracking and slow travel, unclear next steps, hotspots that are hard to find, repeated puzzles, endgames stuffed with puzzles, long anticlimactic endings.
- So: no chores; the Map fast-travels to any visited place; the Reveal button (top right) marks every clickable thing in view; the task list and Dot always say what's next; optional lore rewards exploring (postcards, clippings, the crew photo) but is never required; the finale stays short.

## Layout (built to grow)
Hub and spokes. The rotunda lobby is the hub; every door around it leads somewhere (Planetarium N, Spa NE, Tech Office E, Grand Staircase SE, Terrace S, Kitchen W, Archive NW). Upstairs: the Guest Wing (Vesper's Spa Suite and Cherry's Suite 4 are locked, Linen, Suite 2 = Nova's room, window seat, the 2003 build crew photo). Outside: the Lakeside Terrace (dock, rowboat, the dome seen from outside, a padlocked boathouse that is a deliberate hook for a future case; Remy is "looking into" who owned the boats). Below: the service tunnel and the Star Room. To add a place: a `build<Place>()` in world.js (`mkRoom` with its key light, two `lamps`, doors tagged `door_x`/`exit_x`), nodes in `NODES`, door handlers in story `HOT`, an entry in `PLACES` (the map, with its position in `openMap`'s SVG), and optionally a `FIRST_VISIT` line.

## Options and look
- Retro picture (default on, Menu > Retro picture): the 3D view renders at 640 px on its long side and is shown with nearest-neighbour pixels, 15-bit colour with 4x4 Bayer dithering and faint scanlines (`post` shader, `uRetro`). Off = the soft ~0.9 MP render. The UI is always sharp. Prefs in localStorage `novavale.retro` / `novavale.music`.
- Music has its own switch (corner button, and Menu), separate from All sound. The ghost voice counts as a sound effect, not music.

## Structure
- Rendering (`js/main.js`): scene renders to a half-float target at about 0.9 MP, then a post shader softens, warms, desaturates, adds vignette and grain (the pre-rendered 800x600 feel). Shadows from one directional key light per room (`R.key` config); walls/floors/ceilings are `struct` (receive only). Conversations glide the camera to a head-and-shoulders close-up (`focus`/`unfocus`, story calls `E.focus(who)`).
- `js/tex.js`: procedural textures (marble, wood, carpet, damask wallpaper, tiles, plaster, fabric, brushed metal, hair, palm fronds, brass plaques, painted skies, star domes), each `{map, bump}`.
- `js/people.js`: the cast is sculpted, rigged and animated. Each body, head, hand (with fingers), garment and hairstyle is a signed distance field (smooth unions of ellipsoids/tapered capsules; `U/Sub/grow/above/below/mirX/sqz`, fabric `pleats`/`wrinkles`), polygonised with the vendored three.js `MarchingCubes` (sparse fill, welded, baked AO from the SDF) and painted with vertex colours (lips with a Cupid's bow, brows, lash line, eyeshadow, blush, apron, lapels). Body = two aligned grids split at y 0.74 (same spacing, triangles kept by side, so no seam); head, hair and each hand have finer grids. Everything is a `SkinnedMesh` on one skeleton (`BONES`: hips, spine, chest, neck, head, jaw, clavicles, arms, hands, legs); weights = softmax of distance to bone capsules (head/jaw/neck and hands use fixed rules). Meshes are cached in IndexedDB (`novavale`/`mesh`, key `VERSION:who`; bump `VERSION` whenever a shape or paint changes). `prepareCast()` runs at boot (first ever load ~15 s on desktop, cached ~3 s).
- Animation (`animatePerson`, called from `world.update`): breathing, weight shift, head and eye tracking of the camera, blinking lids (separate lid caps), lip-sync jaw while their line types (`ui.speech`), listening nods during close-ups, talking gestures and a timed fidget per character, and a stance per character by two-bone arm IK (`CAST[who].pose`): Vesper and Cherry hand on hip, Juniper hands clasped, Opal hands behind her back, Dex fidgeting in front. `CAST[who]` holds proportions, colours, `hair()`, `skinParts()`, `outfit()`, `pose`, `gestureSide`, `fidget`, `acc()` (glasses, earrings, buttons; attached to bones).
- `js/world.js`: rooms (`buildLobby`, `buildSpa`, `buildPlanetarium`, `buildKitchen`, `buildTech`, `buildArchive`, `buildSuite`, `buildTunnel`, `buildStarRoom`), each a Group at the origin with exactly two point lights (so switching rooms doesn't recompile shaders). `NODES` = camera spots {room, p:[x,z], look, exits}. Clickable things carry `userData.hot` (hotspot id), `.who` (character) or `.go` (walk arrow). Invisible hit spheres use the `HIT` material. `whereIs(who)` places characters by phase; `sync()` applies flags to the scene (pin, hologram card, sketch, dome code, crown).
- `js/story.js`: `taskList()` (tasks + Dot's hints, junior/senior), `HOT` (hotspot handlers), `INTRO`/`TOPICS` (dialogue; lines starting `N:` are Nova, `*` is narration; `when`, `after`, `hot` = starred new lead), `REST_NEED` (what unlocks sleeping to the next phase), `finale()`, `badEnding()`, `ending()`, phone `CALLS`, notebook `NOTES`.
- `js/puzzles.js`: `aquaOS` (password pixel2003), `switchboard` (zone 5 = planetarium; MAIN = bad ending), `acrostic` (LIPSYNC), `recipe` (vegan swaps), `constellation` (stars 0–4), `drawerDial` (729), `starDoor` (outer ringed planet, middle moon, inner comet).
- Collectibles: eight 2003 postcards (`POSTCARDS` in world.js: room, position; `DOCS.pc1..pc8` in items.js), shown on the Journal's Postcards tab and in the ending letter. The archive bookcase holds a newspaper clipping (`DOCS.clipping`) and the Guest Wing has the crew photo (`DOCS.crewphoto`, also sets `pin_known` if you have the pin).
- `js/state.js`: `S` (phase d1/n1/d2/n2/end, flags, inv, docs), localStorage key `novavale.aquadome.v1`, `checkpoint()`/`secondChance()`.

## Painted figures (Sept 2026)
Characters with turnaround art are real 3D models built from that art (`tools/figures/README.md`): depth-estimated front and
back views fitted to the side silhouette, textured from the three paintings, rigged in Blender, `assets/figures/<who>.glb`.
`js/figures.js` (`FIG`, `loadFigure`, `buildFigure`, `animateFigure`) poses the rig procedurally (arms relaxed out of the
A-pose, breathing, sway, head follows the camera, talking arm gestures); world.js uses a figure instead of the sculpted
people.js model whenever `FIG[who]` exists. Done: Vesper, Cherry, Opal, Juniper, Dex, Harper, Velvet Regent, Gus, Nate, Rashad, Kenji, Priya (Silas and Jojo still sculpted); Celeste has a model (`assets/figures/celeste.glb`) but is only a phone contact, not placed in the world (Opal now has portrait/art cropped from her sheet). The rest still use the sculpted models until their turnarounds exist.
Turnaround prompt: three full-body views side by side (front, left side, back), relaxed A-pose with arms 45 degrees out,
neutral expression, empty hands, flat even studio lighting, plain light grey background, same scale in every view.

## The cast
Five suspects (Vesper, Cherry, Dex, Juniper, Opal) plus nine side characters, all optional to meet (a Day 1 task counts them, `OTHERS` in story.js). The user supplied full-body art for everyone except Opal: `assets/art/<id>.webp` (512x768, shown full size from the notebook's People page) and `assets/portraits/<id>.webp` (400x480 face crops, used in talks and the notebook; Opal's are cropped from her turnaround). Phone contacts Remy, Dot and Celeste also have art.
- Velvet Regent (`regent`): drag performer, favourite to win the Revue, wears the other long white coat. Suspect-ish; cleared by Harper's recording.
- Harper Vance (`harper`): true-crime podcaster. Her 11:57 recording (Regent's alibi) catches the Star Room door groaning under the building.
- Kenji Morimoto (`kenji`): conservator restoring Stella, a 1925 singing automaton (a ghost red herring). Says the meteorite is unsellable quietly: the thief didn't want money.
- Dr. Priya Anand (`priya`): astronomer removing the projector; came as a child (postcard 1). Red torch, so the white light wasn't hers; knows Cygnus.
- Mateo "Jojo" Reyes (`jojo`): Juniper's nephew on skates, pitching a roller disco. Heard a heavy door under the floor.
- Rashad Okafor (`rashad`): bellhop, mystery reader, grandson of crew member Marcus Okafor. Saw Opal at 12:20; grandpa's notebook (`DOCS.okafor`) hints the ring door order.
- Gus Haddad (`gus`): caretaker with every key except the Service door (Opal's). Padlocked boathouse = sequel hook.
- Silas "Static" Boone (`silas`): paranormal web-show host. His 11:52 lobby tape (`DOCS.tape`) shows a long coat and a white flashlight.
- Ranger Nate Begay (`nate`): lake warden, alibis Priya and Jojo, has seen boathouse lights (sequel hook).
Placement: `DAY`/`NIGHT1` in world.js. Models: `CAST` in people.js (props in `PROP`, garments in `G`, paints in `PA`; `prepareCast(first,…)` builds the current room's people first, the rest in the background, and `sync()` adds each as it's ready).

## The case (spoilers)
Day 1: examine the case, find Opal's brass pin, meet all five, read the keypad log (MAINT-0, a 2003 build-team code). Night 1: the singing ghost; switchboard → planetarium; Dex's hologram card; Cherry's secret rehearsal and the flashlight in a long coat. Day 2: Dex confesses the ghost (alibi); Vesper's acrostic = lip sync (alibi); Juniper's vegan cake puzzle (alibi, saw the long coat); the relaunch memo makes Opal leave the archive; her sketch → constellation → 7·2·9 → drawer: service key + Star Room blueprint. Night 2: service door → tunnel → ring door → Star Room → Opal. Choose compassion (save the planetarium) for the good ending.

## Testing
- Serve: `python -m http.server 8777` (launch config `aquadome`).
- `window.__dbg = {S, go, story, NODES}` is exposed for testing: `__dbg.go('T1',{fade:true})`, `__dbg.story.onHot('computer')`, `__dbg.story.onTalk('dex')`, `__dbg.story.tasks()`. The whole case was played through this way (both bad endings and Second Chance too).
- A hidden browser pane throttles timers; wait longer after fades.
