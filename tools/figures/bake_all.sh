#!/bin/bash
# bake and export only (shape fit, UVs and generated texture already made): ./bake_all.sh <names>
BL="/c/Program Files/Blender Foundation/Blender 4.5/blender.exe"
for n in "$@"; do
  echo "=== $n"
  venv/Scripts/python bake.py $n 2>&1 | grep -E "baked|second head|Error|Traceback|line "
  "$BL" -b -P turn_blend.py -- $n 2>&1 | grep -E "EXPORT|Error|Traceback|assert"
  G=../../assets/figures/$n.glb; npx -y gltfpack@0.24.0 -i $G -o $G.tmp.glb -cc -kv -vpf -vtf && mv $G.tmp.glb $G
done
echo ALLDONE
