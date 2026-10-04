#!/bin/bash
# full 3D figures with one baked texture each: fit the generated shape, unwrap it, generate its texture (GPU, ~1 min),
# lay the paintings over that, export and compress. Shapes must exist in D:/NovaFig/out (gen3d.py). Run nothing heavy alongside.
BL="/c/Program Files/Blender Foundation/Blender 4.5/blender.exe"
for n in "$@"; do
  echo "=== $n"
  [ -f ${n}_flat.npz ] || venv/Scripts/python turn_build.py $n.json 2>&1 | grep -E "Error|Traceback"
  venv/Scripts/python gen_build.py $n D:/NovaFig/out/$n.glb 2>&1 | grep -E "fitting|Error|Traceback|line "
  "$BL" -b -P uv_blend.py -- $n 2>&1 | grep -E "UV OK|Error|Traceback|assert"
  for pass in 1 2; do [ -f ${n}_gentex.png ] || (cd /d/NovaFig && HF_HUB_DISABLE_SYMLINKS_WARNING=1 venv/Scripts/python tex.py $n 2>&1 | grep -E "textured|SAVED|Error|exception"); done   # first pass prepares the reference, second paints
  venv/Scripts/python bake.py $n 2>&1 | grep -E "baked|Error|Traceback|line "
  "$BL" -b -P turn_blend.py -- $n 2>&1 | grep -E "EXPORT|Error|Traceback|assert"
  G=../../assets/figures/$n.glb; npx -y gltfpack@0.24.0 -i $G -o $G.tmp.glb -cc -kv -vpf -vtf && mv $G.tmp.glb $G
done
echo ALLDONE
