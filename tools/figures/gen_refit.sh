#!/bin/bash
# refit the generated shapes only (the flat builds' <who>_flat.npz are reused): fit, export, compress
BL="/c/Program Files/Blender Foundation/Blender 4.5/blender.exe"
for n in "$@"; do
  echo "=== $n"
  venv/Scripts/python gen_build.py $n D:/NovaFig/out/$n.glb 2>&1 | grep -E "fitting|face laid|arm |hand zone|bridge|Error|Traceback|line "
  "$BL" -b -P turn_blend.py -- $n 2>&1 | grep -E "EXPORT|Error|Traceback"
  G=../../assets/figures/$n.glb; npx -y gltfpack@0.24.0 -i $G -o $G.tmp.glb -cc -kv -vpf -vtf && mv $G.tmp.glb $G
done
echo ALLDONE
