# Painted figures from turnaround art

Every character in the game is a real 3D model built from a turnaround sheet that Garrett generates in ChatGPT. The model
looks like the art because it is textured by it. Output: `assets/figures/<who>.glb` (rigged, ~3 MB each), loaded by
`js/figures.js`.

## The sheet
Four views side by side, left to right: **front, side facing right, side facing left, back** (three views also work:
front, side, back). Relaxed A-pose (arms ~45° out), neutral expression, mouth closed, empty hands, flat even studio
lighting, plain light-grey background, same scale and alignment in every view, whole body including feet. Prompt:

> Character turnaround reference sheet of [character, same outfit as the attached image]. Four full-body views side by
> side: front, right side, left side, back. Standing in a relaxed A-pose, arms angled 45 degrees away from the body, feet
> shoulder-width apart. Neutral expression, mouth closed, looking straight ahead. Empty hands, no props or bags. Flat, even
> studio lighting, no rim light, no dramatic shadows. Plain light grey background. Same scale and alignment in every view,
> whole body visible including feet. Same painterly style as the attached image.

## One-time setup (Windows, from this folder)
```
python -m venv venv
venv\Scripts\python -m pip install -r requirements.txt
venv\Scripts\python -c "from huggingface_hub import hf_hub_download; hf_hub_download('onnx-community/depth-anything-v2-base', 'onnx/model.onnx', local_dir='da')"
```
- `onnxruntime==1.19.2` on purpose: newer builds failed to load (DLL init error) on Garrett's PC.
- rembg downloads its `birefnet-general` model (~1 GB) on first use.
- Blender 4.5 is installed at `C:\Program Files\Blender Foundation\Blender 4.5\blender.exe`.
- Garrett's Anaconda Python is `~/anaconda3/python.exe`; use it to create the venv.
- Everything except scripts, configs and `refs/` is git-ignored here (venv, da, intermediate PNG/NPZ/blend files).

## Building characters
Fast path (four-view sheets, automatic joints):
```
venv\Scripts\python batch.py "[[\"silas\", \"C:/path/to/sheet.png\", 1.80]]"
```
This copies the sheet to `refs/<who>.png`, cuts the views (rembg), finds the joints from the front silhouette
(`auto_joints.py`) and writes `<who>.json`, plus `joints_sheet.jpg` to eyeball the joints. Then for each character:
```
venv\Scripts\python turn_build.py silas.json
"C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" -b -P turn_blend.py -- silas 0,35,90,180
```
`turn_blend.py` writes `assets/figures/silas.glb` and, if you pass angles, renders `silas_t<angle>.png` for checking. Then
add the character to `FIG` in `js/figures.js` (`head`: the head-centre height turn_build prints, `talk`: which arm
gestures, `relax`: fallback) and run `python tools/bump.py` before committing. Heights used so far: 1.66-1.86 m.

Check renders (all Blender, `-b -P <script> -- <who> ...`):
- `posetest.py <who>`: arms lowered (catches bad skin weights).
- `posetest2.py <who>`: a talking gesture with a bent elbow, at 20° and 70°.
- `heads3.py <who> <head height>`: head close-ups at 0/45/90°.
- `headshot.py <who> <height> <tag>`: a telephoto head render.

Always look at these before shipping. Problems found this way so far: hands bound to thighs, legs following arms,
grey backdrop specks in hair, lumpy torsos, ghost faces on the side of the head, a cape sliver from a neighbouring view.

## How turn_build.py works
1. **Masks**: each view's cutout, trimmed inward 3 px (`trim`; the paintings fade into the backdrop at the outline), small
   enclosed gaps filled, only the main connected body kept. Touching views (capes) are split by `turn_cut.py`.
2. **Shape (visual hull)**: each row of the front outline is split into pieces (torso/head, arms, legs); each piece gets a
   rounded-box cross-section (`boxy` 2.6, heads 2.1). The torso/head depth comes from the side outline at that height
   (narrow bumps such as hands hanging in front of a coat are filtered out); limbs are round. Smoothed over the grid
   (`hullSmooth` 3).
3. **Detail**: Depth Anything V2 on the front and back views adds high-passed relief (±0.7 cm on clothes). Faces get a
   second depth pass on a close crop (`faceDepth` 0.03: nose ~3 cm proud, eye sockets in), added inside a soft oval.
4. **Stance**: the sheets have feet wide apart; from the crotch down each leg shifts inward as a whole (`stance`).
   Gowns with no gap between the legs are left alone.
5. **Skeleton and weights**: 13 bones (hips, spine, chest, neck, head, shoulders, upper/fore arms, hands). Weights are
   geodesic distances inside the front silhouette (so a hand never binds to the thigh beside it); the hips own the legs
   through a line down each leg; torso rows never bind to arms; below the hips only the hand region may follow an arm;
   arm joints blend over a short stretch (`armSigma` 0.013) so elbows bend cleanly.
6. **Texture**: the sheet itself, with only confident pixels kept and the backdrop un-mixed from a band along the
   outline. Per vertex: UVs into the front, side and back paintings plus blend weights (TEXCOORD_0-3), mixed in the game's
   shader by facing direction. The face stays front-painted; arms never use the side views; body sides use them only
   where the colours agree.

Config keys you may tune per character in `<who>.json`: `height`, `step`, `stance`, `trim`, `faceDepth`, `faceAspect`,
`armSigma`, `sigma`, `scaleRange`, `sideTol`, `hullSmooth`, `boxy`, `sideFaces` (`left` if the `side` view's nose points left).
