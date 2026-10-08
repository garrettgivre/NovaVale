# Blinking

Each figure blinks by swapping the eye band of its head sheet's front view for the same band painted with the eyes
closed. `js/figblink.js` says where the band is; `assets/blink/<who>.webp` is the band; `figures.js` (`uBlink`,
`u.blinkU`) blends it in for a tenth of a second every few seconds (sooner while talking, sometimes twice).

To make one: cut the head sheet's front view to `<who>_open.png` (the crop step in the session notes: the first
opaque run of `refs/<who>_head.png` on grey), have ChatGPT edit it with the eyes closed ("the exact same picture ...
with only one change: the eyes are closed ...") to `<who>_closed.png`, then `python tools/art/blink/eyes.py <who>`.
That aligns the closed picture to the open one on the nose and mouth landmarks, cuts the band round the eyes with a
feathered edge, and writes the webp and the js entry. Look at `<who>_check.jpg`.
