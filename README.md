# Nova Vale: The Secret of the Aquadome

A first-person point-and-click mystery in the style of the classic Nancy Drew PC games, set in a faded glass-domed lakeside spa and planetarium that opened in 2003.

Sixteen-year-old Nova Vale goes undercover as the owner's summer intern to find the stolen Prism Crown before the Aquadome's reopening gala. She interviews five suspects and nine other guests and staff, explores the dome, the Guest Wing, the lakeside terrace and what lies beneath, uses a notebook and a flip phone, and solves puzzles over two days, two nights and a gala morning.

## Play

Open `index.html` through any static web server (ES modules don't load from `file://`):

```
python -m http.server 8777
```

Then visit http://localhost:8777. It works on phones and desktops. Progress saves automatically in the browser.

## Controls
Click or tap the floor to walk there, click people to talk and things to look at. Or walk with WASD / arrow keys (Shift runs, Q/E or left/right arrows turn), or the thumb stick on a phone. Drag to look around.

## Cast
Five suspects and nine other guests and staff, each with full-body art by Garrett (in the notebook's People page). The 3D characters are built from Garrett's turnaround art by the pipeline in `tools/figures/`.

## How it's built

No build step, no frameworks besides three.js and a few of its addons (vendored in `vendor/`).

| File | What's in it |
|---|---|
| `js/world.js` | The Aquadome modelled in code (rooms, camera spots `NODES`, day and night lighting) |
| `js/figures.js` | The painted 3D characters (GLBs in `assets/figures/`), loading and animation |
| `js/people.js` | Older characters sculpted from signed distance fields (still used for Silas and Jojo) |
| `js/tex.js` | Procedural textures: marble, wood, carpet, wallpaper, tile, fabric, skies |
| `js/story.js` | The case: tasks, hotspots, conversations, phone calls, days, endings |
| `js/puzzles.js` | AquaOS, the switchboard, the acrostic, the vegan recipe, the constellation, the drawer dial, the vault door, the evidence board, Stella's music cylinder |
| `js/items.js` | Inventory items and documents |
| `js/ui.js` | Dialogue box, panels, portraits |
| `js/main.js` | Renderer, first-person camera, input, main loop, title screen |
| `js/audio.js` | Synthesised music and sound effects (no audio files) |
| `js/state.js` | Save data, flags, Second Chance checkpoints |

Art that can replace the code-drawn placeholders is listed in `tools/art/WISHLIST.md`.

Development notes for Claude are in `CLAUDE.md`; the figure pipeline is documented in `tools/figures/README.md`.
