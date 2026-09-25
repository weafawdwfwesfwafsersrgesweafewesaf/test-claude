# Photo d'une rangée de modèles (pour montrer le résultat)
import bpy, math
from mathutils import Vector

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 48
    sc.cycles.use_denoising = False
    sc.view_settings.view_transform = 'Standard'
    return sc

def bounds(parts):
    vs = [o.matrix_world @ v.co for o in parts for v in o.data.vertices]
    mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    return mn, mx

def layout(groups, gap=1.5, cols=3):
    """Range les modèles en grille. Renvoie le rayon de la scène."""
    cell = max(max(bounds(g)[1].x - bounds(g)[0].x, bounds(g)[1].y - bounds(g)[0].y, bounds(g)[1].z * 0.75) for g in groups) * 0.8 + gap
    cols = 4 if len(groups) > 6 else 3
    rows = (len(groups) + cols - 1) // cols
    for i, parts in enumerate(groups):
        c, r = i % cols, i // cols
        mn, mx = bounds(parts)
        dx = (c - (cols - 1) / 2) * cell - (mn.x + mx.x) / 2
        dy = (r - (rows - 1) / 2) * cell * 1.6 - (mn.y + mx.y) / 2
        for o in parts:
            o.location.x += dx
            o.location.y += dy
    return cell, cols, rows

def shoot(groups, path, bg=(0.05, 0.03, 0.03), floor=(0.08, 0.06, 0.06), res=(1600, 1000), light_col=(1, 0.95, 0.9), sun=2.4):
    sc = bpy.context.scene
    cell, cols, rows = layout(groups)
    hmax = max(bounds(g)[1].z for g in groups)
    sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
    sc.world.node_tree.nodes['Background'].inputs[0].default_value = (*bg, 1)
    sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.45
    bpy.ops.mesh.primitive_plane_add(size=400)
    fm = bpy.data.materials.new('floor'); fm.use_nodes = True
    fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*floor, 1)
    fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9
    bpy.context.active_object.data.materials.append(fm)
    tgt = bpy.data.objects.new('t', None); sc.collection.objects.link(tgt); tgt.location = (0, 0, hmax * 0.4)
    key = bpy.data.objects.new('key', bpy.data.lights.new('key', 'SUN'))
    key.data.energy = sun; key.data.color = light_col; key.data.angle = math.radians(8)
    key.rotation_euler = (math.radians(50), 0, math.radians(35)); sc.collection.objects.link(key)
    fill = bpy.data.objects.new('fill', bpy.data.lights.new('fill', 'SUN'))
    fill.data.energy = 0.8; fill.data.color = (0.7, 0.8, 1)
    fill.rotation_euler = (math.radians(60), 0, math.radians(-140)); sc.collection.objects.link(fill)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.lens = 50
    import math as m
    w, d = cols * cell, rows * cell * 1.6
    fov_v = 2 * m.atan(18 / 50 / (res[0] / res[1]))
    fov_h = 2 * m.atan(18 / 50)
    el = m.radians(40)
    dist = max((w / 2) / m.tan(fov_h / 2), (d * m.sin(el) + hmax * m.cos(el)) / 2 / m.tan(fov_v / 2)) * 1.12
    cam.location = (0, -m.cos(el) * dist, m.sin(el) * dist + hmax * 0.4)
    cam.constraints.new('TRACK_TO').target = tgt
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
