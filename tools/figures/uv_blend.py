# blender -b -P uv_blend.py -- <who>: unwrap the fitted shape (<who>_fit.obj) for a baked texture; writes <who>_uv.npz with
# the UVs per face corner (cuv: faces x 3 x 2), faces in the order of the file. (xatlas, which the texture generator
# would use, crashes on this machine.)
import bpy, sys, os, math, numpy as np
who = sys.argv[sys.argv.index('--') + 1]; D = os.path.dirname(os.path.abspath(__file__))
V, F = [], []
for l in open(os.path.join(D, who + '_fit.obj')):
    if l.startswith('v '): V.append([float(q) for q in l.split()[1:4]])
    elif l.startswith('f '): F.append([int(q.split('/')[0]) - 1 for q in l.split()[1:4]])
V, F = np.array(V, np.float32), np.array(F, np.int32)
# the head is unwrapped as if it were three times its size, so it gets nine times its share of the texture (a face is
# a small part of a body's surface, and it is where the painting's detail is)
import json
meta = json.loads(str(np.load(os.path.join(D, who + '_flat.npz'))['meta'])); chin = meta['chinY'] - 0.03
Vu = V.copy(); k = np.clip((V[:, 1] - chin) / 0.03, 0, 1) * 2.0; c = np.array([0, chin, 0], np.float32)
Vu = c + (V - c) * (1 + k[:, None])
bpy.ops.wm.read_factory_settings(use_empty=True)
me = bpy.data.meshes.new(who); me.vertices.add(len(V)); me.vertices.foreach_set('co', Vu.ravel())
me.loops.add(F.size); me.loops.foreach_set('vertex_index', F.ravel())
me.polygons.add(len(F)); me.polygons.foreach_set('loop_start', np.arange(0, F.size, 3)); me.polygons.foreach_set('loop_total', np.full(len(F), 3))
me.update()
ob = bpy.data.objects.new(who, me); bpy.context.scene.collection.objects.link(ob); bpy.context.view_layer.objects.active = ob; ob.select_set(True)
me.uv_layers.new(name='UVMap')
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.object.mode_set(mode='OBJECT')
assert len(me.polygons) == len(F)
uv = np.zeros(F.size * 2, np.float32); me.uv_layers['UVMap'].data.foreach_get('uv', uv)
vi = np.zeros(F.size, np.int32); me.loops.foreach_get('vertex_index', vi); assert (vi == F.ravel()).all()
np.savez(os.path.join(D, who + '_uv.npz'), cuv=uv.reshape(-1, 3, 2), V=V, F=F); print('UV OK', len(F), float(uv.min()), float(uv.max()))
