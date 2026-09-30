# Painted figures from turnaround art

Characters in `assets/figures/<who>.glb` are built from a turnaround sheet: front | side | back, A-pose, flat lighting,
no props, plain background (ChatGPT prompt in CLAUDE.md). The model looks like the art because it is textured by it.

1. `turn_cut.py <sheet.png> <who>`: background removal (rembg, `birefnet-general`) and the three views as `<who>_front/side/back.png`.
   Note the printed offsets (x0-16, y0-16 per view) for the config.
2. Write `<who>.json`: sheet, height in metres, grid step (3), crop offsets, which way the nose points in the side view,
   and joints in sheet pixels of the front view (top, chin, neck, chest, spine, hips, shoulders, elbows, wrists, finger tips).
3. `turn_build.py <who>.json`: Depth Anything V2 (onnx, `da/onnx/model.onnx` from `onnx-community/depth-anything-v2-base`)
   on the front and back views, fitted per row to the side silhouette; front and back surfaces stitched into one closed mesh;
   each face textured from the front, back or side view by its normal (arms never use the side view); skin weights to the
   bones (lower body follows the hips, so gowns don't tear). Writes `<who>_turn.npz` and `<who>_tex.png`.
4. `blender -b -P turn_blend.py -- <who> [angles]`: mesh, armature, vertex groups, turnaround renders, GLB export.

Rigging notes: skin weights use geodesic distance inside the front silhouette (scikit-image `MCP_Geometric`), so hands
don't bind to the thighs they hang beside and a gown doesn't follow the arms; arm joints take the depth of the arm itself.
Silhouette vertices are snapped to the cutout's smooth contour (no stair-step outline); the side view is only used where
its colour agrees with the front or back view. `posetest.py <who>` renders the arms lowered, to check the weights.

Python: a venv with `rembg[cpu]`, `onnxruntime==1.19.2` (newer builds fail to load on this PC), `opencv-python-headless`,
`scipy`, `huggingface_hub`, `scikit-image`. Blender 4.5. Add the character to `FIG` in `js/figures.js` (head height, talking arm).
