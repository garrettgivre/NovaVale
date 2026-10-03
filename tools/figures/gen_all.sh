#!/bin/bash
# full 3D figures: flat build (rig, face, painting layout), then the generated shape fitted under it, export, compress.
# The shapes come from D:/NovaFig/gen.py (Hunyuan3D-2mv), one <who>.glb each in D:/NovaFig/out
BL="/c/Program Files/Blender Foundation/Blender 4.5/blender.exe"
for n in "$@"; do
  echo "=== $n"
  venv/Scripts/python turn_build.py $n.json 2>&1 | grep -E "face modelled|head centre|Error|Traceback|line "
  venv/Scripts/python gen_build.py $n D:/NovaFig/out/$n.glb 2>&1 | grep -E "facing|fitting|face laid|verts|Error|Traceback|line "
  "$BL" -b -P turn_blend.py -- $n 2>&1 | grep -E "EXPORT|Error|Traceback"
  G=../../assets/figures/$n.glb; npx -y gltfpack@0.24.0 -i $G -o $G.tmp.glb -cc -kv -vpf -vtf && mv $G.tmp.glb $G
done
echo ALLDONE
