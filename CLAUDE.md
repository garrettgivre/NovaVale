# Nova Vale: The Secret of the Aquadome — notes for Claude

Everything a new session needs to keep developing this game. Read it all before changing anything.

## What this is
A first-person, point-and-click mystery in the style of the classic Nancy Drew PC games (Her Interactive, early 2000s),
made by **Garrett** for his partner **Beau**. Beau loves those games, plus Frutiger Aero/Y2K, Gaga-style camp, drag and
fashion, Mario Galaxy, Stardew, MTG, collectibles, and pink/blue/black. The detective is a fictional character, **Nova
Vale**; Beau is not in the game, and nods to his tastes stay as nods (Vesper Vox is our own pop diva, not Gaga).

- Repo: https://github.com/garrettgivre/NovaVale, branch `main` (the only branch). Commit and push to `main` after each
  finished request; GitHub Pages serves `main` at **https://garrettgivre.github.io/NovaVale/** (no workflow file, Pages
  settings). Git credentials already work on Garrett's PC. There is no `gh` CLI.
- Local checkout: `C:\Users\Garrett\Documents\Nova-Vale-Aquadome` (Windows; Bash and PowerShell both available).
- No build step: ES modules, three.js r169 vendored in `vendor/` (plus `MarchingCubes.js`, `GLTFLoader.js`,
  `utils/BufferGeometryUtils.js`), import map in `index.html`. Mobile first, must also work on desktop.

## Working with Garrett
- He playtests and gives notes; act on them, then show proof (screenshots or renders). He likes refinement over redesigns.
- Commit messages: describe the change; end with the co-author trailer your environment specifies.
- **Run `python tools/bump.py` before every commit that touches `js/`, `css/` or `assets/figures/`.** GitHub Pages lets
  browsers cache for 10 minutes; bump.py stamps `?v=<time>` on every module (import map), the stylesheet and the figure
  GLBs (`ASSET_V` in figures.js). Without it a refresh can run stale code (this confused testing more than once).
- **Syntax-check before committing**: `for f in js/*.js; do node --check --input-type=module < $f || echo FAIL $f; done`.
  Never chain the commit on a separate line from a failed check (a broken build was pushed once that way).
- Editing: most edits are small Python scripts that replace exact strings and assert each occurs once. Write the script to
  a file first (heredocs mangle JS apostrophes, backticks and `${`); in JS strings use `\'` for apostrophes.
- Writing style (Garrett asked for this explicitly): no AI-sounding constructions. Avoid "it's not X, it's Y" / "X isn't A,
  it's B", "Honestly? ...", "Also? ...", "There's a difference", stacked one-word fragments, and pithy aphorisms ("Ovens
  don't lie. People do."). Plain, character-specific lines.
- Never draw four-point sparkle stars (reads as an AI logo); five-point stars are fine.
- Art: Garrett generates images in ChatGPT from prompts you write (he has a daily image limit). Character turnaround
  prompt is in `tools/figures/README.md`; other wishes in `tools/art/WISHLIST.md`.

## The look
Classic early-2000s Nancy Drew: realistic pre-rendered feel, a faded grand resort (marble, mahogany, brass, damask), serif
type (Cinzel, EB Garamond, Caveat for handwriting, VT323 for screens), a wood-and-brass interface bar, paper documents.
NOT bubbly or glossy (Garrett rejected a Frutiger Aero pass as "too bubbly and modern"). AquaOS is the one diegetic 2003
computer and looks XP-era. Rooms are modelled in code with procedural textures (`js/tex.js`); documents and puzzles are
HTML/CSS/SVG; all sound is synthesised (`js/audio.js`). Options (Menu): Retro picture (default on: 640 px render,
15-bit colour, Bayer dither, scanlines), Music (own switch, corner button too), All sound.

## Story and characters
**Premise.** The Aquadome, a glass-domed lakeside spa and planetarium (opened 21 June 2003, closed nine years ago),
reopens on Saturday with a gala. Its prize, the Prism Crown (silver-plated band, a real pallasite meteorite star), vanished
from a locked display case on Tuesday night. Owner **Celeste Arden** brings in Nova. **Why a sixteen-year-old**: Celeste's
sister Mae runs the Lakeshore Public Library, where Nova quietly caught a rare-map thief last spring; a police report is
public record and would reach sponsors, insurer and the papers; a hired investigator would be spotted at once by the
true-crime podcaster staying in the building. So Nova arrives undercover as **Celeste's summer intern**.

**Nova's voice.** A know-it-all who really does know it all ("Beau is like that"): bratty, confident, funny, never cruel,
calls people out when evidence allows (Nancy Drew's audacity). **She stays coy until people catch on**: alibi questions
use pretexts (the insurance timeline, the meteor shower, the cleaning rota) or small talk. Everyone except Celeste meets
her as a stranger and reacts in character; each has a moment where they realise (Vesper at her email, Dex at his callout,
Juniper at the oven log, Cherry on night one, Opal at the pin, Gus at the keys, Regent at the coat; Rashad guesses at once;
Harper only ever suspects and Nova keeps the cover with her). Greetings (`hiLine`) warm up with story flags. Nobody calls
her "detective" before they've worked it out.
**Nova only says what she knows**: any line that uses a fact from another conversation, a document or a hotspot is
gated on that flag (`lines: () => has(x) ? ... : ...`), e.g. Regent's coat talk only cites Harper's tape after `harper_alibi`,
"Ranger Begay" only after `met_nate`, the door "under the building" only after `jojo_door`. Check this for every new line.
Velvet Regent is nonbinary (they/them; "royalty", never "queen").

**Suspects**: Vesper Vox (pop diva, secretly lip-syncing her comeback), Miss Cherry Pop (drag host of the Starfall Revue,
secretly rehearsing a tribute to Vesper), Dex Halloway (tech, secretly built the singing "ghost" hologram), Juniper (chef,
remade the gala cake vegan), Opal Finch (the architect, 63; took the crown). **Others** (optional to meet; `OTHERS` in
story.js): Velvet Regent (drag performer, favourite to win; the other long coat; alibi from Harper's tape), Harper Vance
(podcaster, "Lakeshore Unsolved"), Kenji Morimoto (conservator restoring Stella, a 1925 singing automaton; Act 3 culprit),
Dr. Priya Anand (astronomer removing the projector; came here aged nine, postcard 1; red torch), Mateo "Jojo" Reyes
(Juniper's nephew on skates; heard a door under the floor), Rashad Okafor (bellhop, mystery reader, grandson of crew
member Marcus Okafor; his notebook hints the vault door), Gus Haddad (caretaker, every key but the Service door), Silas
"Static" Boone (ghost web-show host; his 11:52 tape shows a long coat and a white flashlight), Ranger Nate Begay (lake
warden; alibis Priya and Jojo). Phone: Dot (best friend, gives hints), Remy (cousin, research), Celeste (client).
Sequel hook: the padlocked boathouse with lights at 2am (Gus won't explain; Nate and Remy are curious).

**The case (spoilers)**. Phases `d1` Day 1, `n1` Night 1, `d2` Day 2, `n2` Night 2, `g` Gala Day, `end`. Sleeping in
Suite 2 advances once `REST_NEED` is met.
- **Day 1**: examine the case, find Opal's brass star pin, meet the five suspects, read the keypad log on Dex's PC
  (AquaOS password `pixel2003`; log shows MAINT-0, the 2003 build-crew code, at 23:52, and, planted for Act 3, KMORIMOTO
  Mon 13:36-14:51).
- **Night 1**: singing over the speakers; switchboard (zone 5 = planetarium; MAIN = bad ending "Lights Out"); Dex's
  hologram card under the projector; Cherry rehearsing on stage saw a flashlight and a long coat.
- **Day 2**: Dex confesses the ghost (alibi); Vesper's lyric acrostic = LIPSYNC (alibi); Juniper's vegan recipe puzzle
  (alibi; she saw the coat); the relaunch memo (planetarium → VIP bar) sends Opal out of the archive; her sketch →
  projector constellation (Cygnus) → 7·2·9 → drawer: service key + Star Room blueprint.
- **Night 2**: service door → tunnel → ring vault door (outer ringed planet, middle moon, inner comet) → Star Room → Opal.
  Choose compassion (or bad ending "Locked In"). Opal says she never touched the star.
- **Gala Day (Act 3)**: the star is too light. Dex's speaker magnet proves it fake at the case (`star_fake`); the
  insurance appraisal at reception (real Mon 13:40); Kenji's Monday repair log; evidence board (`contradiction`: his log
  vs the keypad log, `kenji_caught`); song card in his bench drawer (Mi Sol Sol | Fa Re Re) → Stella's music cylinder
  (`musicBox`) → the real star (the Star's Tear, sold from the Morimoto family in 1946) and Kenji's letter. Confront him:
  police = bad ending "Wrong Call"; otherwise he tells Celeste, the crown wears his replica, the stone goes home. Ending
  letter from Celeste.
- Second Chance (checkpoints before risky choices) on every bad ending. Junior/Senior difficulty changes hints and task
  wording. Eight optional 2003 postcards, a newspaper clipping, the crew photo.

## Design rules (from research into what Nancy Drew fans love and hate)
Love: atmospheric places, suspects who each hide something, lore, Nancy's sass, phone friends, puzzles woven into the
story, Second Chance. Hate: chores/padding, backtracking, unclear next steps, hard-to-find hotspots, repeated puzzles,
puzzle-stuffed endgames, long endings. So: no chores; the Map fast-travels to visited places; the Reveal button marks
every clickable thing in view; the task list and Dot always say what's next; lore is optional; finales stay short.

## Code map
| File | What's in it |
|---|---|
| `js/main.js` | renderer + post shader (`uRetro`), camera, input (click-to-walk `floorAt`/`walkTo`, WASD/arrows, Shift, thumb stick `#joy`, drag-look, mouse-only screen-edge turning), `go()` node glides, conversation close-ups (`focus`: portrait lens fov 32/24, level, stops before walls), title screen, boot, `window.__dbg` |
| `js/world.js` | rooms built in code (`buildLobby`, `buildSpa`, `buildPlanetarium`, `buildKitchen`, `buildTech`, `buildArchive`, `buildSuite`, `buildWing`, `buildTerrace`, `buildTunnel`, `buildStarRoom`), `NODES` camera spots, `whereIs(who)` (`DAY`/`NIGHT1` placement by phase), `sync()` (flags → scene), `update()` (people's facing), postcards, `hotspotsOnScreen` |
| `js/figures.js` | the painted 3D characters: `FIG` registry, lazy queued GLB loading, `buildFigure` (matte Lambert + blended front/side/back shader, `autoRelax`), `animateFigure` (breathing, weight shift, glances, clamped head turns, talking gestures `GESTS`) |
| `js/people.js` | the older SDF/marching-cubes sculpted characters; no longer used (everyone is a painted figure); kept for reference. Skipped for anyone in `FIG` |
| `js/story.js` | `taskList()` + Dot hints, `HOT` hotspot handlers, `INTRO`/`hiLine`/`TOPICS` dialogue, `REST_NEED`, `finale()` (Opal), Act 3 (`EVIDENCE`, `kenjiCatch`, `kenjiFinale`), endings, phone `CALLS`, notebook `NOTES`, map `PLACES`/`openMap`, `FIRST_VISIT` |
| `js/puzzles.js` | `aquaOS`, `switchboard`, `acrostic`, `recipe`, `constellation`, `drawerDial`, `starDoor`, `contradiction`, `musicBox` |
| `js/items.js` | `ITEMS` (inventory with SVG icons) and `DOCS` (letters, logs, emails, postcards, appraisal, song card...) |
| `js/ui.js` | dialogue box (`say`, `choose`, `openTalk`; lines starting `N:` are Nova, `*...*` narration), panels, toasts, portraits, `PEOPLE` names/colours |
| `js/state.js` | `S` (phase, flags, inv, docs), save key `novavale.aquadome.v1`, `checkpoint`/`secondChance` |
| `js/tex.js`, `js/audio.js` | procedural textures; synthesised music/SFX/ghost voice |

Dialogue topics: `{ id, q, lines, when, hot (starred new lead), after, catch/fin (Act 3 hooks) }`. To add a place: a
`build<Place>()`, nodes in `NODES`, door handlers in `HOT`, an entry in `PLACES` and the map SVG, optionally `FIRST_VISIT`.

## Characters in 3D (painted figures)
All characters with turnaround art are 3D models built from that art by the pipeline in `tools/figures/` (read its
README: setup, sheet prompt, commands, how it works, what to check). All 15 are built (Oct 2026) from
new body sheets plus head sheets (`refs/<who>.png`, `refs/<who>_head.png`; Celeste is built but only a phone contact).
`people.js` (the old sculpted models) is no longer used by anyone. Rebuild everyone: `./build_all.sh <names>` in
`tools/figures`, then `python heads_js.py` and `python tools/bump.py`.
- Head sheets: the shader (`figures.js`, `hd()`) reads heads from the head sheet in the texture atlas via `js/figheads.js`;
  each figure has its own shader program (`customProgramCacheKey`), or three.js reuses the first figure's.
- Side views: the build carves each head's front from the head sheet's depth (cheeks and jaw recede) and scales the face
  so its front-most point sits on the profile outline; the shader (`viewSide`) switches the sides of the face to the profile
  painting when seen from the side or behind. Remaining: a slight smear under the jaw at exact profile (Jojo most).
- Keep figure animation mostly in the picture plane: big turns towards or away from the camera show a painting-based
  mesh edge-on. Head turns are clamped (0.35 yaw / 0.18 pitch), gestures small.
- Animation (`animateFigure`): per-character personality `PERS` (tempo, sway, gesture size, resting chin, how often
  they look about, weighted idle habits) and habits `ACTS` (hand on hip, chin up, sigh, shrug, neck roll, look around/up/down,
  fidget, bounce), springy head look, head and chest lead body turns, talking reacts to the line (`speech.line`: questions
  tilt and open the hands, exclamations go bigger, laughter shakes the shoulders), thinking glances mid-speech, listeners nod
  while Nova talks. Keep new moves in the picture plane and small: elbows bent sideways fold the painted arm across the
  body, arms raised far look like a scarecrow, forearms brought forward show their edge.
- Arms in the build: triangles bridging an arm and the body across background in the painting (a hand hanging a
  pixel from the hip; never where the arm overlaps the body, which left holes and bands) are cut and closed (`armCut`), and each hand is found from the painting (pieces outside the legs below the wrist) and bound wholly to the
  arm. Before this, moving an arm stretched a strip of hand colour to the hip and left fingertips behind.
  Debug: `userData.dbgRest` / `dbgOnly` ('upper'|'fore'|'hand') / `dbgAx` ('z'|'x') / `forceG` (a held gesture).
- People keep their own facing (towards the room's middle, offset per person) and only turn to you when talking or when
  you're within ~2.8 m (Garrett found everyone always facing the player eerie).
- Portrait crops `assets/portraits/<id>.webp` (400x480) appear in conversations; full-body art `assets/art/<id>.webp`
  opens from the notebook's People page.

## Testing
- Look: figures are mostly self-lit (`emissiveIntensity` .52, diffuse grey .61) so rooms light them alike; bloom only
  above 1.15 (lamps); the normal picture renders ~0.48 MP with a soft blur (hides seams in the painted models).
- Raycasts use three-mesh-bvh (`vendor/three-mesh-bvh.js`, `accelerate()` in main.js builds a tree for every static room mesh after `buildWorld`; meshes added later get none). Walking rays use layer 2 (room meshes only, not people). Merged static meshes without a BVH made walking drop to 30 fps on the terrace.
- Lost WebGL context (switching apps on a phone): index.html makes every 2D canvas `willReadFrequently` (memory-backed, survives backgrounding); main.js rebuilds the env maps on restore (`rebuildEnv`) and reloads into the save if a probe canvas was wiped. Test with `WEBGL_lose_context`.
- Draw-call budget: views run ~150-430 calls/frame (`__dbg.renderer.info`); merge static meshes per material (`mergeGeometries`) and instance repeats when adding detail. `__dbg.view(node)` jumps to a camera spot instantly.
- Serve locally: `python -m http.server 8777` from the repo root. In the Claude desktop app, `.claude/launch.json`
  (git-ignored) holds `{"version":"0.0.1","configurations":[{"name":"aquadome","runtimeExecutable":"python","runtimeArgs":["-m","http.server","8777"],"port":8777}]}`.
- Debug handle: `window.__dbg = { S, go, story, NODES, V, focus, unfocus }`. E.g. `__dbg.go('L1')`,
  `__dbg.story.onTalk('dex')`, `__dbg.story.onHot('case')`, `__dbg.story.tasks()`, set `__dbg.S.phase='g'` plus flags and
  call `sync()` from `/js/world.js` to jump ahead. Click through dialogue by clicking `#talk.on #talkLine`; options are
  `#talkOpts button`. Node ids: L1-L4 lobby, S1-S2 spa, P1-P2 planetarium, K1 kitchen, T1-T2 tech, A1 archive, R1 suite,
  W1-W3 wing, E1-E3 terrace, U* tunnel, X1 Star Room.
- In the desktop app's browser pane, frames only advance while screenshots are taken, so animations, glides and walking
  need several screenshots in a row; reload with a fresh `?v` (run bump.py) to avoid cached modules.
- The whole case, the "Lights Out" and "Locked In" bad endings and Second Chance have been played through this way, and
  Act 3's good path end to end (the "Wrong Call" bad ending has not been played yet).

## Status and next steps
Recently done (newest first): environment pass on every room (lobby dome/medallion/seating, bathhouse spa, working kitchen, lit planetarium with instanced seats, A/V office, archive shelves, dressed suite and wing, tunnel and Star Room detail, terrace with real lake, garden, boathouse and Aquadome exterior, new painted sky; room helpers are prefixed per room above each `build*`, static pieces merged per material; `aoRun` contact shadows in `rectRoom`); coy undercover-intern dialogue; story cleanup and cover story; click-to-walk and lazy
loading; Act 3 (Gala Day, Kenji, two new puzzles); many figure passes (sculpted faces, blended texturing, clean elbows).
Open items:
- Not yet checked: Senior-difficulty wording of the two Act 3 puzzles; the thumb stick on a real phone.
- Ideas Garrett hasn't picked yet: the boathouse sequel case, a puzzle around Silas's tape, giving Harper/Rashad/Priya a
  hand in Act 3, placing Celeste in the world on Day 2, lip-sync/blinking for figures (needs eyes-closed and mouth-open
  face crops from Garrett).
