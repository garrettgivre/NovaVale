import bpy, sys, os, math
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]; name, hz, tag = argv[0], float(argv[1]), argv[2]
D = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=os.path.join(D, name + '_turn.blend'))
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE_NEXT'; sc.render.resolution_x, sc.render.resolution_y = 600, 600
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (1, 1, 1, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
for m in bpy.data.materials:   # show the texture as it is (like the game's matte look)
    if m.use_nodes and 'Principled BSDF' in m.node_tree.nodes: m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.lens = 520
cam.location = Vector((0, -6, hz)); cam.rotation_euler = (math.radians(90), 0, 0)
sc.render.filepath = os.path.join(D, f'{name}_head_{tag}.png'); bpy.ops.render.render(write_still=True)
