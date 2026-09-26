# Relit DecorShapes.lua et reconstruit chaque part comme Roblox l'affiche, pour vérifier.
# Usage : blender -b --python check_roblox.py -- DecorShapes.lua Lava out.png
import bpy, sys, re, math, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import studio
from mathutils import Vector, Matrix

src, world, out = sys.argv[sys.argv.index('--') + 1:]
txt = open(src).read()
blk = txt[txt.index(f'\t{world} = {{'):]
blk = blk[:blk.index('\n\t},')]
cols = re.findall(r'\{ "([0-9a-f]{6})", (true|false) \}', blk.split('Props')[0])
studio.reset()
mats = []
for hx, glow in cols:
    m = bpy.data.materials.new(hx); m.use_nodes = True
    bs = m.node_tree.nodes['Principled BSDF']
    c = tuple(int(hx[i:i + 2], 16) / 255 for i in (0, 2, 4))
    bs.inputs['Base Color'].default_value = (*c, 1)
    if glow == 'true':
        bs.inputs['Emission Color'].default_value = (*c, 1); bs.inputs['Emission Strength'].default_value = 1.4
    mats.append(m)
groups = []
for name, body in re.findall(r'Name = "(\w+)", Height = [\d.]+, Parts = \{ ([^}]*) \}', blk):
    nums = [float(x) for x in body.split(', ')]
    objs = []
    for i in range(0, len(nums), 14):
        sh, ci, px, py, pz, rx, ry, rz, ux, uy, uz, sx, sy, sz = nums[i:i + 14]
        right, up = Vector((rx, ry, rz)), Vector((ux, uy, uz))
        back = right.cross(up)
        # Roblox -> Blender : (x, y, z) -> (x, -z, y)
        b = lambda v: Vector((v.x, -v.z, v.y))
        R = Matrix((b(right), b(up), b(back))).transposed()
        if sh == 1:
            bpy.ops.mesh.primitive_cube_add(size=1)
        elif sh == 2:
            bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.5, depth=1, rotation=(0, math.pi / 2, 0))
            bpy.ops.object.transform_apply(rotation=True)
        else:
            bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.5)
        o = bpy.context.active_object
        o.matrix_world = Matrix.Translation(b(Vector((px, py, pz)))) @ R.to_4x4() @ Matrix.Diagonal((sx, sy, sz, 1))
        o.data.materials.append(mats[int(ci) - 1])
        objs.append(o)
    groups.append(objs)
bpy.context.view_layer.update()
import importlib
mod = importlib.import_module('world_' + world.lower()) if False else None
shots = {'Lava': dict(bg=(0.12, 0.03, 0.015), floor=(0.035, 0.022, 0.02), sun=1.8)}
studio.shoot(groups, out, **shots.get(world, {}))
