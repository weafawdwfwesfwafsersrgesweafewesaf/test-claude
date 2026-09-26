# Meshes d'aura (1 unité Blender = 1 stud Roblox). Axe long du vélo = Y Blender -> Z Roblox.
import os as _os
HERE = _os.path.dirname(_os.path.abspath(__file__))
AURAS = _os.path.dirname(HERE) + '/'
import bpy, bmesh, math, sys

OUT = AURAS + 'Meshes/'

def ribbon_obj(name, rings):
    """rings = liste de (points, v) ; construit une bande double face."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new()
    for strip in rings:
        for back in (False, True):  # double face : 2e couche de sommets, ordre inversé
            rows = [[bm.verts.new(p) for p, _ in col] for col in strip['cols']]
            for i in range(len(rows) - 1):
                for j in range(len(rows[i]) - 1):
                    quad = [rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]]
                    uvs = [strip['uv'](i, j), strip['uv'](i + 1, j), strip['uv'](i + 1, j + 1), strip['uv'](i, j + 1)]
                    if back:
                        quad, uvs = quad[::-1], uvs[::-1]
                    f = bm.faces.new(quad)
                    for loop, c in zip(f.loops, uvs):
                        loop[uvl].uv = c
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o

def helix(name, a=3.8, b=2.3, height=5.8, turns=1.25, strands=2, seg=96):
    strips = []
    for k in range(strands):
        phase = k * math.tau / strands
        cols = []
        for i in range(seg + 1):
            s = i / seg
            th = phase + s * turns * math.tau
            shrink = 1 - 0.35 * s
            x, y = b * shrink * math.cos(th), a * shrink * math.sin(th)
            z = 0.35 + height * s
            w = 1.2 * math.sin(math.pi * s) ** 0.7  # s'affine aux deux bouts
            lean = 0.25 * w  # bord haut penché vers l'intérieur
            ix, iy = -math.cos(th) * lean, -math.sin(th) * lean
            cols.append([((x, y, z - w / 2), 0), ((x + ix, y + iy, z + w / 2), 1)])
        strips.append({'cols': cols, 'uv': lambda i, j, seg=seg: (i / seg * 3, j)})
    return ribbon_obj(name, strips)

def ring(name, r_in=2.4, r_out=4.4, seg=96, z=0.08):
    cols = []
    for i in range(seg + 1):
        th = i / seg * math.tau
        c, s = math.cos(th), math.sin(th)
        # ellipse qui suit la forme du vélo (plus long devant/derrière)
        cols.append([((c * r_in * 0.8, s * r_in * 1.25, z), 0), ((c * r_out * 0.8, s * r_out * 1.25, z), 1)])
    return ribbon_obj(name, [{'cols': cols, 'uv': lambda i, j, seg=seg: (i / seg * 4, j)}])

def export(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.wm.obj_export(filepath=OUT + o.name + '.obj', export_selected_objects=True,
                          forward_axis='NEGATIVE_Z', up_axis='Y', export_materials=False,
                          export_normals=True, export_uv=True)

if __name__ == '__main__':
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for o in (helix('AuraHelix'), ring('AuraRing')):
        export(o)


def export_fbx(o):
    """FBX avec la texture AuraStreak intégrée. 1 unité = 1 stud (choisir « Studs » à l'import)."""
    mat = bpy.data.materials.new(o.name + 'Mat')
    mat.use_nodes = True
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(AURAS + 'Textures/AuraStreak.png')
    bsdf = mat.node_tree.nodes['Principled BSDF']
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    mat.node_tree.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    o.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.export_scene.fbx(filepath=OUT + o.name + '.fbx', use_selection=True,
                             axis_forward='-Z', axis_up='Y', apply_scale_options='FBX_SCALE_NONE',
                             apply_unit_scale=False, global_scale=1.0, mesh_smooth_type='FACE',
                             path_mode='COPY', embed_textures=True, bake_space_transform=True)


if __name__ == '__main__' and '--fbx' in sys.argv:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for o in (helix('AuraHelix'), ring('AuraRing')):
        export_fbx(o)
