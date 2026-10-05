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
- Usage: Garrett is on a usage-limited plan and watches it. Do the work yourself by default; spawn subagents only when he
  asks (he prefers Sonnet for grunt work), and keep them few. If a limit runs out mid-task, pick up where it stopped when
  he says "Continue".
- Verification: after a change, syntax-check and take targeted screenshots of what changed (`tools/test/shot.js`,
  `closeup.js`, `doorshots.js`). Do **not** run the full playthrough (`play.js`) after every change; only when story flow,
  flags or dialogue gating changed broadly, or when he asks. Send him the screenshots as proof.
- He often says "claude rc" (switch on Remote Control so he can follow from his phone) and "Continue" (carry on).
- When he says "stop all testing", stop at once; don't restart test runs or kill his processes without asking.
- His C: drive is nearly full (under 6 GB free); big installs and model files go on D: (`D:/NovaVoice` holds the
  Chatterbox venv and Hugging Face cache).
- Answers: when he asks "what next?", give a recommendation and a short ranked list, not an essay.
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
- Optional threads (Oct 2026): Silas's tape frame by frame (`tapeScrub`, flag `tape_pin`: lavender coat, brass star pin);
  gala day: Harper's Monday room tone (`harper_monday`, a second way to solve the evidence board: harper vs repairlog),
  Rashad's detective rules by progress, Priya identifying the Star's Tear (`priya_star`); Night 1: the boathouse window is
  lit and Nate talks about it (`boat_light`, sequel hook).
- Second Chance (checkpoints before risky choices) on every bad ending. Junior/Senior difficulty changes hints and task
  wording. Eight optional 2003 postcards, a newspaper clipping, the crew photo.

**Bookends and quality of life (Oct 2026).** Cutscenes: `cine(node, keys, lines)` in main.js (camera keyframes, letterbox
`#cine`, narration as captions, tap/Escape skips; `E.cine` from story.js). New Game goes straight into the arrival flyover (over the lake to the
portico; its three narration lines carry the whole setup), then one line in the lobby; Celeste's letter is an inventory item
(`letter`, opens the doc) instead of a panel up front. Automated runs (`navigator.webdriver`) skip the flyover unless
`localStorage['novavale.cinetest']` is set; gala night (`galaNight`, phase 'end' counts as night) gathers the cast round the fountain (`GALA` in
world.js, facing set per person), Regent wears the crown (built on the head bone in `sync`), before Celeste's letter.
Three save slots (`SLOTS`, slot 1 keeps the old key; Continue = most recent, Load Game, New Game asks which slot when any
exists and confirms overwrites), `S.play` seconds played, `S.pz` remembers unfinished puzzle settings (`mem()` in
puzzles.js), "Previously" recap on continuing (`recap`, `MILESTONES`), Text speed Normal/Fast/Instant in the menu,
topics heard before appear without typing (`speech.instant`).

**Directed start (Oct 2026, Beau's notes).** After the flyover Nova wakes in Suite 2; a bellhop knocks: Celeste is waiting in
the lobby by the case. Celeste is in the world (`DAY.celeste`, `INTRO/TOPICS/hiLine.celeste`) and her introduction names who
was in the building, which unlocks the spa, tech office, kitchen, archive and terrace doors (`LOCKED` in story.js, each with
a line); the planetarium is shut for the projector removal until Night 1. People arrive over time: `LATER` (Jojo, Priya,
Regent, Silas, Nate) are absent on Day 1 (Silas turns up filming on Night 1). The optional "other guests" task counts only
people who are around (`othersTask`). Interaction: tapping a door walks Nova up to it and shows its name; tap again to go in.
Doors everywhere (lobby, hallway, exits) use two taps (`isDoor`, `V.doorReady` in main.js `activate`): first tap walks to
1.6 m if farther than 1.9 m, turns smoothly to face it (`faceTo` eases yaw and `V.pitchT`) and captions "<name> · tap the
door again to go in"; second tap enters. Moving or dragging resets it.
**Nova's inner voice** (Beau and Garrett, Oct 2026: "more internal dialog, especially at roadblocks, but don't overdo it"):
one `think()` line on the first visit to each room (`FIRST_VISIT`, may be a function of phase, e.g. the planetarium by night)
and a line at each roadblock (locked doors via `LOCKED`, the map's tunnel entry, etc.), so the player knows why and what
to do. Keep it to that: no running commentary.

**Doors** (`world.js`, ~lines 160-460): each destination has its own look, `D_STYLE[style](body, batch, DM(), ctx)` with
styles planetarium (midnight blue, gilt stars, fanlight), spa (frosted glass, brass), tech (grey steel, card reader, wired
glass), stairs (mahogany, glazed, fanlight), terrace (white French doors showing the lake), kitchen (cream swing doors,
portholes), archive (narrow oak plank door, iron straps), suite (panelled mahogany, brass numbers, DND hanger), service
(steel). Shared: `dFrame` (moulded surround: back band, bead, plinth blocks, frieze and cap; `cap` raised above fanlights),
`dSill`, `dHinges` ('pair' on double doors), `dPulls`, `dLever`, signs `dSign` with `D_SIGN` kinds, `D_TEXT` default
wording. `D_SIZE` scales each style's body (planetarium 1.1x1.12, kitchen 1.14 wide, archive 0.84 ...); the sign is built
outside the scaled body at true size, height capped at 2.05 m. Everything is merged per material through `dBatch`.
`door(R,x,z,label,hot,face,{style,sign,dnd,metal})` keeps one signature for all rooms; lobby doors via `D(deg,...)` at r 8.9.
Tapping a thing walks over if it's out of reach and moves the camera in on it (`inspect`) until nothing is being said or
shown (`inspectStep`). Dex's ghost is a Pepper's ghost (projector + glass), his test show a CD-R (flags still `holo_*`).

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
| `js/tex.js`, `js/audio.js` | procedural textures (`view()` paints window views); synthesised music/SFX/ghost voice, room sound beds (`roomSound`, `BEDS` per room: fountain, pool water and drips, projector hum, fridge and simmer, office fans and disk clicks, clock ticks, wind, birds/crickets, tunnel drips) on their own bus (plays with music off), footsteps by floor (`step`, called from main.js `footsteps()`), cues `reveal`/`night`/`dawn` |

The terrace's Aquadome exterior matches the inside: wings sit where the lobby's doors lead (lobby door angle a ->
terrace direction (-sin a, cos a) from the drum centre (0, 18)): Planetarium (copper dome, behind), Spa (glazed lantern),
Tech Office with the Guest Wing above (two storeys, dormers), Grand Staircase tower by the portico, Kitchen (chimney),
Archive (hipped roof). Rooms are separate scenes at the origin; only this model shows how they fit together.
Windows inside show what their wing faces outside: `skyWindow(..., view)` / `material.userData.view` = 'garden' (spa,
archive, tech) or 'lawnlake' (kitchen, Suite 2), painted by `T.view(kind, night, skyTex)`; no view = the lake panorama
(Guest Wing end window). The exterior follows the rooms: one wide kitchen window (inside x -> outside -u, you face the wall
from opposite sides) and the back door on its side, one archive window with blind arches, spa blind arches on the sides
(niches inside) and a skylight over the coffered ceiling's, blind roundels on the planetarium (dark inside).
Detail (Oct 2026): quoins, string courses, cornice grime and splash streaks (nine years closed), downpipes, iron ridge
cresting, chimney pots; the spa is a glass pool pavilion with a barrel vault ("a sky you can swim under"); gold five-point
stars on the planetarium's copper dome; Guest Wing shutters; ivy; scaffolding, ladder and paint at the kitchen (being
readied for the gala); a GRAND REOPENING banner on the portico and an entrance sign; a gravel walk round the back,
flower borders and box hedges, clipped cones and lamps, an armillary sphere on the lawn.

Dialogue topics: `{ id, q, lines, when, hot (starred new lead), after, catch/fin (Act 3 hooks) }`. To add a place: a
`build<Place>()`, nodes in `NODES`, door handlers in `HOT`, an entry in `PLACES` and the map SVG, optionally `FIRST_VISIT`.

## Characters in 3D (painted figures)
**The shipped figures are the original painted-relief build (commit ca0a862).** On 3-5 Oct 2026 two days went into
replacing them with generated full-3D shapes (Hunyuan3D-2mv on D:/NovaFig), baked textures and extra head sheets
(`tools/figures/README.md` describes all of it: gen3d.py, gen_build.py, uv_blend.py, textex.py, bake.py, head2.py,
hull.py; `refs/<who>_head2.png` are the extra six-view head sheets). Garrett's verdict: "they all look worse than when we
started", so `assets/figures/*.glb`, `js/figures.js` and `js/figheads.js` were put back to ca0a862. Don't rebuild the
figures with the new pipeline unless he asks; `heads_js.py` would overwrite figheads.js with the new-pipeline head
maps, so don't run it either. The 3D pipeline's one real finding: the art is the limit; a clean result needs a paid
image-to-3D service or hand-made models. `heads_js.py`/`bump.py` sometimes fail with "Invalid argument" while the
local server holds a file; run them again.
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
- Painted art (Oct 2026, ChatGPT paint-overs of bases rendered from the game, `tools/art/bases/` + `BASES.md`): title screen
  `assets/title.webp`, postcards `assets/postcards/pc1-8.webp` (notebook and the cards lying in the rooms), lobby paintings
  `assets/paintings/lake1-4.webp`, the clipping's photo `assets/docs/opening.webp`. Still to paint: the crew photo and the four
  ending illustrations (bases exist). Originals are kept out of git in `tools/art/painted/src/`.
- Portrait crops `assets/portraits/<id>.webp` (400x480) appear in conversations; full-body art `assets/art/<id>.webp`
  opens from the notebook's People page.

## Testing
- Look: figures are mostly self-lit (`emissiveIntensity` .52, diffuse grey .61) so rooms light them alike; bloom only
  above 1.15 (lamps); the normal picture renders ~0.48 MP with a soft blur (hides seams in the painted models).
- Raycasts use three-mesh-bvh (`vendor/three-mesh-bvh.js`, `accelerate()` in main.js builds a tree for every static room mesh after `buildWorld`; meshes added later get none). Walking rays use layer 2 (room meshes only, not people). Merged static meshes without a BVH made walking drop to 30 fps on the terrace.
- Touch (Oct 2026): taps that just miss something clickable still count (`pickNear`, rings up to 28 px); a second floor tap
  within 420 ms runs there (`V.walk.run`); the stick pushed to the edge runs; press and hold = Reveal; after standing still
  1.4 s, faint glints mark tappable things within 4.2 m (`nearHints`, `#near`); a light vibration on a hotspot tap; captions
  sit above the stick; Reveal labels stay on screen. All puzzles and panels checked at 412 px wide.
- Lost WebGL context (switching apps on a phone): index.html makes every 2D canvas `willReadFrequently` (memory-backed, survives backgrounding); main.js rebuilds the env maps on restore (`rebuildEnv`) and reloads into the save if a probe canvas was wiped. Test with `WEBGL_lose_context`.
- Performance (Oct 2026 pass): figure GLBs are meshopt-compressed by gltfpack in `tools/figures/build_all.sh` (71 MB to
  16 MB; `-kv` keeps TEXCOORD_1-3, `-vpf` keeps float positions; decoded by `vendor/meshopt_decoder.module.js`). On phones
  and low-memory devices (`LOWMEM` in tex.js: coarse pointer or deviceMemory <= 4) figure paintings and room pattern
  textures load at half size (text, signs and skies stay full), and the retro picture's 1x canvas skips devicePixelRatio.
  Only the shown room is attached to the scene (`showRoom` adds/removes room groups): three.js recomposed every hidden
  room's matrices each frame (14% of a throttled frame, now under 1%). Profile with Playwright CPU throttling
  (`Emulation.setCPUThrottlingRate`) and a CDP profile; frame times on this laptop are noisy, the profile isn't.
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
- Test scripts live in `tools/test/` (see its README; Playwright installed outside the repo). Write screenshots outside
  the repo or into a git-ignored folder. `doorshots.js` renders every door at 1.5 m; `closeup.js` any point in a room.
- Full playthrough script (`tools/test/play.js`): drives `story.onHot`/`onTalk` through every
  phase, talks to everyone about every topic, sets the outcomes of unchanged puzzles, solves the evidence board for real,
  takes the Locked In and Wrong Call endings and Second Chance, and reaches Case Closed, in Junior and Senior, with no page
  errors. A world check raycasts every hotspot from its room's camera spots and the glides between spots (postcard 8 was
  hidden by the new planetarium seats and moved into the aisle).

## Status and next steps
Long-term goal (Garrett, Oct 2026): once the game is finished, publish it on Google Play (likely bundled with Capacitor so it
works offline; needs a developer account, a closed test with testers, a privacy policy, no "Nancy Drew" in the listing,
fonts bundled, and a phone performance pass first). Not now.
**Voices (Oct 2026)**: every spoken line is voiced with Kokoro TTS, each person with their own voice (`CAST` in
`tools/voice/voice.py`), played by `voice()` in audio.js from `ui.say` and `cine()`. **After adding or editing dialogue,
run `tools/voice/extract.py` then `voice.py`** (see `tools/voice/README.md`), or the new lines stay silent. Menu: Voices On/Off.
**Recommended next (Oct 2026):**
1. The last art when Garrett has image credits: crew photo, four ending illustrations (bases in `tools/art/bases/BASES.md`).
2. The boathouse mini-case (sequel hook already planted), only if Garrett wants the game bigger before release.
3. A fresh-eyes playthrough by Garrett or Beau, then a round of fixes; then ElevenLabs voices (Garrett: only once the
   game is finished; Chatterbox was only marginally better than Kokoro, don't redo voices with it) and the Play Store.
4. Blinking/lip-sync (needs eyes-closed and mouth-open face crops from Garrett).
Recently done (newest first): Celeste's introduction rewritten and she faces the lobby entrance (`DAY.celeste` facing
0.67); the display case rebuilt to match Nova's first look (velvet with the crown's ring dent, hood knocked a hair
crooked on its brass rail, lock plate, lit keypad; velvet reads a little maroon, could go redder); Celeste's topics after Day 1 (the singing, Dex's ghost, the relaunch memo, the fake
star pointing to the appraisal, Kenji, Opal; greetings by progress); phone performance pass (see Testing); voices; door fidelity (moulded surrounds, sills, hinges, sizes per room); two-tap doors everywhere
with smooth turning and Nova's first-visit and roadblock lines; directed start (wake in Suite 2, knock, Celeste in the
lobby, rooms unlocked by her introduction, people arriving over time, walk-up close-ups on things); per-destination door
designs with signs; cutscenes, save slots and quality of life; touch controls; painted art (title, postcards, paintings,
clipping); environment pass on every room (lobby dome/medallion/seating, bathhouse spa, working kitchen, lit planetarium with instanced seats, A/V office, archive shelves, dressed suite and wing, tunnel and Star Room detail, terrace with real lake, garden, boathouse and Aquadome exterior, new painted sky; room helpers are prefixed per room above each `build*`, static pieces merged per material; `aoRun` contact shadows in `rectRoom`); coy undercover-intern dialogue; story cleanup and cover story; click-to-walk and lazy
loading; Act 3 (Gala Day, Kenji, two new puzzles); many figure passes (sculpted faces, blended texturing, clean elbows).
Open items:
- Not yet checked: the thumb stick on a real phone.
- Ideas Garrett hasn't picked yet: the boathouse sequel case, a puzzle around Silas's tape, giving Harper/Rashad/Priya a
  hand in Act 3, placing Celeste in the world on Day 2, lip-sync/blinking for figures (needs eyes-closed and mouth-open
  face crops from Garrett).

## A note from the last session
You're picking up a game made as a gift, by someone who playtests every change on his phone and notices everything. What
worked best: make the change, look at it yourself in a screenshot before he does, fix what's off, then show him. Small
careful passes beat big rewrites here; when something already works (the figures, the doors, the opening), refine it.
Before writing any line for Nova, ask what she knows at that moment and gate it on a flag. Read a few existing
conversations in `story.js` first to get her voice; she's sharp and funny and never mean. Every new line needs a voice
(`tools/voice`), so run the two scripts before you commit dialogue. Garrett's open notes when we stopped: Celeste's idle
stance may still look stiff to him (only her facing was changed), and the case velvet could be redder. Keep his usage in
mind, keep the writing plain, and have fun with it.
