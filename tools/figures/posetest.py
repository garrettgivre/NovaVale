import bpy, sys, os, math
from mathutils import Matrix, Vector
argv = sys.argv[sys.argv.index('--') + 1:]; name = argv[0]
D = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=os.path.join(D, name + '_turn.blend'))
sc = bpy.context.scene; arm = bpy.data.objects[name + '_rig']
for s, bn in ((1, 'upperR'), (-1, 'upperL')):
    pb = arm.pose.bones[bn]
    # rotate about the world front axis (blender -Y) around the bone head
    h = pb.head.copy()
    R = Matrix.Translation(h) @ Matrix.Rotation(s * 0.36, 4, Vector((0, -1, 0))) @ Matrix.Translation(-h)
    pb.matrix = R @ pb.matrix
    bpy.context.view_layer.update()
sc.render.engine = 'BLENDER_EEVEE_NEXT'; sc.render.resolution_x, sc.render.resolution_y = 500, 600
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.5, 0.5, 0.5, 1)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.lens = 50
for ang in (0, 60):
    a = math.radians(ang); cam.location = Vector((2.2 * math.sin(a), -2.2 * math.cos(a), 1.0))
    cam.rotation_euler = (Vector((0, 0, 0.9)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(D, f'{name}_pose{ang}.png'); bpy.ops.render.render(write_still=True)
