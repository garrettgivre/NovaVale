# Nova Vale: The Secret of the Aquadome

A first-person point-and-click mystery in the style of the classic Nancy Drew PC games, set in a faded glass-domed lakeside spa and planetarium that opened in 2003.

Teen sleuth Nova Vale has three days to find the Prism Crown before the Aquadome's reopening gala. She interviews five suspects, searches nine rooms, uses a notebook and a flip phone, and solves puzzles.

## Play

Open `index.html` through any static web server (ES modules don't load from `file://`):

```
python -m http.server 8777
```

Then visit http://localhost:8777. It works on phones and desktops. Progress saves automatically in the browser.

## How it's built

No build step, no frameworks besides three.js and its MarchingCubes addon (vendored in `vendor/`).

| File | What's in it |
|---|---|
| `js/world.js` | The Aquadome modelled in code (rooms, camera spots `NODES`, day and night lighting) |
| `js/people.js` | The characters, sculpted from signed distance fields and polygonised with marching cubes |
| `js/tex.js` | Procedural textures: marble, wood, carpet, wallpaper, tile, fabric, skies |
| `js/story.js` | The case: tasks, hotspots, conversations, phone calls, days, endings |
| `js/puzzles.js` | AquaOS, the switchboard, the acrostic, the vegan recipe, the constellation, the drawer dial, the vault door |
| `js/items.js` | Inventory items and documents |
| `js/ui.js` | Dialogue box, panels, portraits |
| `js/main.js` | Renderer, first-person camera, input, main loop, title screen |
| `js/audio.js` | Synthesised music and sound effects (no audio files) |
| `js/state.js` | Save data, flags, Second Chance checkpoints |

Art that can replace the code-drawn placeholders is listed in `tools/art/WISHLIST.md`.
