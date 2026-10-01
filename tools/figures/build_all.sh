#!/bin/bash
# build every figure listed: mesh + texture (turn_build), then rig, export and two check renders (Blender)
BL="/c/Program Files/Blender Foundation/Blender 4.5/blender.exe"
for n in "$@"; do
  echo "=== $n"
  venv/Scripts/python turn_build.py $n.json 2>&1 | grep -E "head |face depth|face relief|carved|fitted|head centre|verts|Error|Traceback|line "
  "$BL" -b -P turn_blend.py -- $n 0,90 2>&1 | grep -E "EXPORT|Error|Traceback"
done
echo ALLDONE
