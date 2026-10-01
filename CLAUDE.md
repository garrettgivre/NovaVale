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
`js/figures.js` (`FIG`, `loadFigure`, `buildFigure`, `animateFigure`) poses the rig procedurally. Keep motion mostly in
the picture plane (these meshes come from paintings: big turns towards/away from the camera show them edge-on): arms come
down by `autoRelax` (swept until the hand is a hand's width from the body, both sides kept within 0.05), slight elbow bend,
weight shifts between legs every 5-11 s with a spine/head counter-tilt, breathing, occasional glances, head turns clamped
to 0.35 yaw / 0.18 pitch, and talking gestures from `GESTS` (one hand, the other or both opening outward, small forward lift),
eased in and out. Textures only keep confident cutout pixels (alpha > .93 and not backdrop-coloured near the outline);
everything else takes the nearest confident colour. Figures use a matte `MeshLambertMaterial` (the paintings carry their own
lighting; a standard material's Fresnel sheen lit jagged hair outlines as grey-white specks). Close-ups (`focus` in main.js)
use a portrait lens: the fov eases to 32 (portrait) / 24 (landscape), the camera backs off to frame head and upper body,
level (pitch 0), and stops short of walls (raycast); a close wide-angle camera distorted faces; world.js uses a figure instead of the sculpted
people.js model whenever `FIG[who]` exists. Done: Vesper, Cherry, Opal, Juniper, Dex, Harper, Velvet Regent, Gus, Nate, Rashad, Kenji, Priya (Silas and Jojo still sculpted); Celeste has a model (`assets/figures/celeste.glb`) but is only a phone contact, not placed in the world (Opal now has portrait/art cropped from her sheet). The rest still use the sculpted models until their turnarounds exist.
Turnaround prompt: three full-body views side by side (front, left side, back), relaxed A-pose with arms 45 degrees out,
neutral expression, empty hands, flat even studio lighting, plain light grey background, same scale in every view.

## Figure shape (visual hull)
Each row of the front outline is split into pieces (torso/head, arms, legs). Every piece gets a rounded-box cross-section
(`boxy` exponent 2.6): the torso/head piece's depth is the side outline at that height (so the side profile matches the
side painting), limbs are round. Heads use a rounder exponent (2.1). Cross-sections are smoothed over the grid (`hullSmooth` 3) so outline wiggles don't
make lumps; the depth estimate only adds high-passed detail (±0.7 cm on clothes, ±1.4 cm on the face). Head texturing:
sides and back of the head come from the side painting (faces turned >45°), but the front third of the head's depth
always keeps the front painting (otherwise the profile's eye and nose landed on the cheeks). The old method (front/back depth
surfaces meeting at the front outline) made lens-shaped blobs from the side. Next step if needed: a better head/face
profile at 90° (the face is still mostly front-textured).

Faces are sculpted by a second depth pass on a close crop of the face (`faceDepth` 0.03: the nose stands ~3 cm proud of
the cheeks, eye sockets up to 2.5 cm in), band-passed and added inside a soft oval (`faceAspect`), on top of the head's
smooth base (the side outline with the nose/lips smoothed out). Head sides take the side painting by facing direction
(>55°, never the front third of the head's depth); steep body sides (>~37°) too where the colours agree; shoulders may,
arms below the shoulders never. `heads3.py <who> <height>` renders head close-ups at 0/45/90 to check.

Texturing is blended per vertex, not chosen per face (that made hard seams): the GLB carries TEXCOORD_0 front,
TEXCOORD_1 side (left or right painting by the vertex normal), TEXCOORD_2 back, TEXCOORD_3 weights (side, back; the
exporter flips V so the shader uses back = 1 - y), and `figures.js` patches the Lambert shader to
`mix(mix(front, back, wB), side, wS)`. wS ramps with how sideways the surface faces (heads from 25-55°, bodies 40-72°),
is zero on the face (front part of the head's depth within a widened face oval: otherwise the side paintings' profile
eye/nose land on the cheeks), zero on arms below the shoulders, and on the body only where the side painting's colour
agrees (the side paintings show arms hanging over the torso).

Arm bones blend over a short stretch (`armSigma` 0.013 vs 0.028 for the body) so elbows bend cleanly; talking gestures
are kept small (forearm lift ≤ ~0.55 rad). Head side texture only behind the face (fracV < ~0.45 of the head's depth),
else the side paintings left a ghost face behind the cheek. `posetest2.py <who>` renders a gesture pose at 20°/70°.

## Walking and facing
Click or tap the floor to walk there (`floorAt`: first visible hit must face up and be below 0.8 m; `walkTo` sets `V.walk` and a fading ring `mark`; the camera turns towards the target while walking and stops on arrival or when it stops getting closer). Screen-edge turning is mouse-only now (touch taps there walk). Shift runs. A one-time controls toast (`novavale.ctl`). Free walking on top of the node system: WASD / arrow up-down to move, A/D strafe, arrow left-right or Q/E to turn, and a
thumb stick `#joy` on touch screens (`body.touch`). `walk(dt)` in main.js moves the camera with ray checks at knee, waist
and eye height against the current room, needs floor underfoot, keeps 0.55 m from people, and slides along walls. `go()`
glides from wherever you are. People keep their own facing (`userData.base`: towards the room's middle, offset per
person), turn fully to you when talking and partly when you're within 2.8 m; heads only track you when you're near.
Figures: the stance is narrowed in `turn_build.py`, legs only: from the crotch down each leg shifts as a whole towards
`stance` (default 0.55 of the drawn foot spread, at least 0.09 m); the pelvis and waist stay as painted, gowns with no gap
between the legs are left alone, arm-owned vertices excluded. Body shape comes from the art: on rows where an arm hangs
clear of the body, the torso segment never binds to the arms (relaxing the arms used to pull every waist in); legs are owned by the hips through a geodesic line down each leg; below the hips only the hand region
(near the forearm/hand line, or further out than it) may follow the arms. `auto_joints.py` ends an arm run when it jumps
sideways (it used to run on down a trouser leg: Gus, Rashad, Priya had fingertips on their thighs).

## Loading
Figures load lazily: people in the current room immediately, everyone else queued one at a time (`loadFigure(who, cb, now)`).
`prepareCast` skips characters that have a figure (it used to sculpt their old SDF models at boot for nothing).

## Caching (important)
GitHub Pages lets browsers cache files for 10 minutes, so a refresh right after a push can run old code/models. Run
`python tools/bump.py` before committing changes to js/, css/ or assets/figures/: it stamps `?v=<time>` on every module
(import map in index.html), the stylesheet and the figure GLBs (`ASSET_V` in figures.js).

Hair edges: the paintings fade into the backdrop over the outline's last few pixels. `turn_build.py` trims every view's
mask inward (`trim`, 3 px), fills small enclosed gaps, keeps only confident pixels and un-mixes the backdrop from a band
along the outline (paler-and-greyer-than-inside pixels only). `headshot.py <who> <height> <tag>` renders a tele close-up
of the head in Blender to check.

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
Day 1: examine the case, find Opal's brass pin, meet all five, read the keypad log (MAINT-0, a 2003 build-team code). Night 1: the singing ghost; switchboard → planetarium; Dex's hologram card; Cherry's secret rehearsal and the flashlight in a long coat. Day 2: Dex confesses the ghost (alibi); Vesper's acrostic = lip sync (alibi); Juniper's vegan cake puzzle (alibi, saw the long coat); the relaunch memo makes Opal leave the archive; her sketch → constellation → 7·2·9 → drawer: service key + Star Room blueprint. Night 2: service door → tunnel → ring door → Star Room → Opal. Choose compassion (save the planetarium) for the good ending. Then Act 3, Gala Day (phase `g`): the returned star is too light. Dex's speaker magnet (`g_magnet` topic) shows it's fake at the display case (`star_fake`); the insurance appraisal at the reception desk says it was real Mon 13:40 (`appraisal_read`); Kenji's Monday repair log (`g_star`, `repair_seen`) vs the keypad log (Mon 13:36-14:51 KMORIMOTO, planted on Day 1) on the evidence board (`contradiction` puzzle, `kenji_caught`); Stella's song card in the bench drawer (`kbench`, `waltzcard`: Mi Sol Sol | Fa Re Re) sets the music cylinder (`musicBox`, `stella_open`) and Stella's chest gives up the real star (the Star's Tear, sold from the Morimoto family in 1946) and Kenji's letter. Confront Kenji (`g_truth` → `kenjiFinale`): calling the police = bad ending `kenji`; otherwise he tells Celeste, the crown wears his replica at the gala and the stone goes home. Opal's finale plants "I never touched the star".

## Testing
- Serve: `python -m http.server 8777` (launch config `aquadome`).
- `window.__dbg = {S, go, story, NODES}` is exposed for testing: `__dbg.go('T1',{fade:true})`, `__dbg.story.onHot('computer')`, `__dbg.story.onTalk('dex')`, `__dbg.story.tasks()`. The whole case was played through this way (both bad endings and Second Chance too).
- A hidden browser pane throttles timers; wait longer after fades.
