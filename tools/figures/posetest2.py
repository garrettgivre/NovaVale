import bpy, sys, os, math
from mathutils import Matrix, Vector
argv = sys.argv[sys.argv.index('--') + 1:]; name = argv[0]
D = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=os.path.join(D, name + '_turn.blend'))
sc = bpy.context.scene; arm = bpy.data.objects[name + '_rig']
def rot(bn, ang, axis):
    pb = arm.pose.bones[bn]; h = pb.head.copy()
    pb.matrix = Matrix.Translation(h) @ Matrix.Rotation(ang, 4, axis) @ Matrix.Translation(-h) @ pb.matrix
    bpy.context.view_layer.update()
rot('upperR', 0.25, Vector((0, -1, 0))); rot('upperL', -0.25, Vector((0, -1, 0)))
rot('upperR', -0.35, Vector((1, 0, 0)))            # right arm lifts forward a little
rot('foreR', -0.75, Vector((1, 0, 0)))             # and bends at the elbow (a talking gesture)
sc.render.engine = 'BLENDER_EEVEE_NEXT'; sc.render.resolution_x, sc.render.resolution_y = 380, 520
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.55, 0.55, 1)
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 2.5; sun.rotation_euler = (math.radians(55), 0, math.radians(-40)); sc.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.lens = 85
for ang in (20, 70):
    a = math.radians(ang); cam.location = Vector((4.2 * math.sin(a), -4.2 * math.cos(a), 1.2))
    cam.rotation_euler = (Vector((0, 0, 1.15)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(D, f'{name}_g{ang}.png'); bpy.ops.render.render(write_still=True)
