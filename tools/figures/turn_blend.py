# blender -b -P turn_blend.py -- name [angles] [pose]
import bpy, sys, os, math, json, numpy as np
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
name = argv[0]; angles = argv[1] if len(argv) > 1 else ''; posed = len(argv) > 2
D = os.path.dirname(os.path.abspath(__file__))
Z = np.load(os.path.join(D, name + '_turn.npz'))
P, F, UV = Z['P'], Z['F'], Z['UV']
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
B = lambda p: (p[0], -p[2], p[1])       # model (y up, +z front) -> blender (z up, -y front)
me = bpy.data.meshes.new(name)
V = np.stack([P[:, 0], -P[:, 2], P[:, 1]], 1)
me.vertices.add(len(V)); me.vertices.foreach_set('co', V.ravel())
me.loops.add(F.size); me.loops.foreach_set('vertex_index', F.ravel())
me.polygons.add(len(F)); me.polygons.foreach_set('loop_start', np.arange(0, F.size, 3)); me.polygons.foreach_set('loop_total', np.full(len(F), 3))
VD = 'vS1' in Z.files   # view-dependent texturing: front, +x side, back, -x side; the game's shader mixes them
if 'vF' in Z.files:   # four UV maps per vertex
    for nm, arr in ((('UVMap', Z['vF']), ('UVSide', Z['vS1']), ('UVBack', Z['vB']), ('UVSide2', Z['vS2'])) if VD else (('UVMap', Z['vF']), ('UVSide', Z['vS']), ('UVBack', Z['vB']), ('UVW', Z['WTS']))):
        me.uv_layers.new(name=nm).data.foreach_set('uv', arr[F.ravel()].ravel())
else:
    me.uv_layers.new(name='UVMap').data.foreach_set('uv', UV.ravel())
me.update(); me.validate()
me.polygons.foreach_set('use_smooth', np.ones(len(F), bool))
ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
m = bpy.data.materials.new(name); m.use_nodes = True
nt = m.node_tree; bs = nt.nodes['Principled BSDF']
tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = bpy.data.images.load(os.path.join(D, name + '_tex.png')); tx.interpolation = 'Cubic'
nt.links.new(tx.outputs['Color'], bs.inputs['Base Color']); bs.inputs['Roughness'].default_value = 0.7
if 'vF' in Z.files and not VD:
    def samp(uvname):
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = tx.image; t.interpolation = 'Cubic'
        u = nt.nodes.new('ShaderNodeUVMap'); u.uv_map = uvname; nt.links.new(u.outputs['UV'], t.inputs['Vector']); return t
    uf = nt.nodes.new('ShaderNodeUVMap'); uf.uv_map = 'UVMap'; nt.links.new(uf.outputs['UV'], tx.inputs['Vector'])
    ts, tb = samp('UVSide'), samp('UVBack')
    uw = nt.nodes.new('ShaderNodeUVMap'); uw.uv_map = 'UVW'; sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(uw.outputs['UV'], sep.inputs['Vector'])
    m1 = nt.nodes.new('ShaderNodeMix'); m1.data_type = 'RGBA'; nt.links.new(sep.outputs['Y'], m1.inputs['Factor']); nt.links.new(tx.outputs['Color'], m1.inputs['A']); nt.links.new(tb.outputs['Color'], m1.inputs['B'])
    # back weight was stored as an absolute share; convert to a mix factor of the front/back pair
    m2 = nt.nodes.new('ShaderNodeMix'); m2.data_type = 'RGBA'; nt.links.new(sep.outputs['X'], m2.inputs['Factor']); nt.links.new(m1.outputs['Result'], m2.inputs['A']); nt.links.new(ts.outputs['Color'], m2.inputs['B'])
    nt.links.new(m2.outputs['Result'], bs.inputs['Base Color'])
ob.data.materials.append(m)
# armature
bones = json.loads(str(Z['bones']))
ad = bpy.data.armatures.new(name + '_rig'); arm = bpy.data.objects.new(name + '_rig', ad); sc.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
eb = {}
for bn, par, h, t in bones:
    b = ad.edit_bones.new(bn); b.head = B(h); b.tail = B(t)
    if (b.tail - b.head).length < 1e-3: b.tail = b.head + Vector((0, 0, 0.05))
    if par: b.parent = eb[par]
    eb[bn] = b
bpy.ops.object.mode_set(mode='OBJECT')
names = [b[0] for b in bones]
vgs = [ob.vertex_groups.new(name=bn) for bn in names]
wi, wv = Z['wi'], Z['wv']
for j in range(len(names)):
    for s in range(4):
        sel = np.nonzero((wi[:, s] == j) & (wv[:, s] > 0.004))[0]
        # group vertices by rounded weight so each add() call covers many
        q = np.round(wv[sel, s] * 200) / 200
        for val in np.unique(q):
            vgs[j].add(sel[q == val].tolist(), float(val), 'ADD')
ob.parent = arm; mod = ob.modifiers.new('rig', 'ARMATURE'); mod.object = arm
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(D, name + '_turn.blend'))
if posed:  # a test pose: wave the right arm, turn the head
    pb = arm.pose.bones
    pb['upperR'].rotation_mode = 'XYZ'; pb['upperR'].rotation_euler = (0, 0.9, 0)
    pb['foreR'].rotation_mode = 'XYZ'; pb['foreR'].rotation_euler = (0.9, 0, 0)
    pb['head'].rotation_mode = 'XYZ'; pb['head'].rotation_euler = (0, 0.35, 0.2)
if angles:
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
    sc.render.resolution_x, sc.render.resolution_y = 420, 700
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.35, 0.33, 0.32, 1)
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 1.8; sun.rotation_euler = (math.radians(50), 0, math.radians(-30)); sc.collection.objects.link(sun)
    fl = bpy.data.meshes.new('floor'); fl.from_pydata([(-3, -3, 0), (3, -3, 0), (3, 3, 0), (-3, 3, 0)], [], [(0, 1, 2, 3)]); sc.collection.objects.link(bpy.data.objects.new('floor', fl))
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.lens = 50
    tgt = Vector((0, 0, 0.92))
    for ang in [int(a) for a in angles.split(',')]:
        a = math.radians(ang); cam.location = Vector((3.7 * math.sin(a), -3.7 * math.cos(a), 1.25))
        d = tgt - cam.location; cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(D, f'{name}_t{ang}{"p" if posed else ""}.png'); bpy.ops.render.render(write_still=True)
if not posed:
    for o in sc.objects: o.select_set(o in (ob, arm))
    bpy.context.view_layer.objects.active = arm
    out = os.path.join(D, '..', '..', 'assets', 'figures', name + '.glb')   # the repo's assets/figures
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_image_format='WEBP', export_image_quality=90, export_yup=True, export_skins=True, export_animations=False)
    print('EXPORT OK', os.path.getsize(out))
print('DONE')
