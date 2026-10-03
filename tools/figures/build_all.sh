#!/bin/bash
# build every figure listed: mesh + texture (turn_build), then rig, export and two check renders (Blender)
BL="/c/Program Files/Blender Foundation/Blender 4.5/blender.exe"
for n in "$@"; do
  echo "=== $n"
  venv/Scripts/python turn_build.py $n.json 2>&1 | grep -E "head |face depth|face rounded|face modelled|face relief|carved|fitted|bridge|hand pixels|head centre|verts|Error|Traceback|line "
  "$BL" -b -P turn_blend.py -- $n 0,90 2>&1 | grep -E "EXPORT|Error|Traceback"
  # meshopt-compress for the web (keep every vertex attribute: the shader reads TEXCOORD_1-3; float positions keep the
  # mesh's own coordinates). figures.js decodes it with vendor/meshopt_decoder.module.js
  G=../../assets/figures/$n.glb; npx -y gltfpack@0.24.0 -i $G -o $G.tmp.glb -cc -kv -vpf -vtf && mv $G.tmp.glb $G
done
echo ALLDONE
