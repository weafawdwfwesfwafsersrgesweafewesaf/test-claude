# Kit de modélisation low poly (1 unité = 1 stud Roblox).
# Chaque couleur = une case d'une petite palette : 1 seule texture pour TOUS les modèles.
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, noise

PALETTE = {}          # nom -> (r, g, b) en 0..1
GLOW = set()          # couleurs lumineuses (mises à part -> Neon dans Roblox)
CELLS = 16            # palette 16 x 16 cases
CELL_PX = 8

def hexc(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))

def color(name, hexv, glow=False):
    PALETTE[name] = hexc(hexv)
    if glow:
        GLOW.add(name)
    return name

def mat(name):
    m = bpy.data.materials.get('c_' + name)
    if not m:
        m = bpy.data.materials.new('c_' + name)
        r, g, b = PALETTE[name]
        m.diffuse_color = (r, g, b, 1)
        m['pal'] = name
        m.use_nodes = True
        bs = m.node_tree.nodes['Principled BSDF']
        bs.inputs['Base Color'].default_value = (r, g, b, 1)
        bs.inputs['Roughness'].default_value = 0.75
        if name in GLOW:
            bs.inputs['Emission Color'].default_value = (r, g, b, 1)
            bs.inputs['Emission Strength'].default_value = 1.4
    return m

# ---------- primitives
def _finish(o, c, loc, rot, scl):
    o.location = loc
    o.rotation_euler = [math.radians(a) for a in rot]
    o.scale = scl if isinstance(scl, (tuple, list)) else (scl, scl, scl)
    o.data.materials.append(mat(c))
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o

def cube(c, loc=(0, 0, 0), size=(1, 1, 1), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1)
    return _finish(bpy.context.active_object, c, loc, rot, size)

def cyl(c, loc=(0, 0, 0), r=1, h=1, seg=8, rot=(0, 0, 0), r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=1, depth=1)
        o = bpy.context.active_object
        return _finish(o, c, loc, rot, (r, r, h))
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r, radius2=r2, depth=h)
    return _finish(bpy.context.active_object, c, loc, rot, 1)

def cone(c, loc=(0, 0, 0), r=1, h=1, seg=8, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r, radius2=0, depth=h)
    return _finish(bpy.context.active_object, c, loc, rot, 1)

def ball(c, loc=(0, 0, 0), r=1, sub=1, scl=(1, 1, 1), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=1)
    return _finish(bpy.context.active_object, c, loc, rot, tuple(r * s for s in scl))

def uvball(c, loc=(0, 0, 0), r=1, seg=10, rings=6, scl=(1, 1, 1), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1)
    return _finish(bpy.context.active_object, c, loc, rot, tuple(r * s for s in scl))

def torus(c, loc=(0, 0, 0), R=1, r=0.25, seg=12, mseg=6, rot=(0, 0, 0), scl=1):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=seg, minor_segments=mseg)
    return _finish(bpy.context.active_object, c, loc, rot, scl)

# ---------- déformations
def jitter(o, amt=0.15, freq=0.8, seed=0):
    """Bruit cohérent : donne un aspect taillé/rocheux sans ajouter de polygones."""
    off = Vector((seed * 13.1, seed * 7.7, seed * 3.3))
    for v in o.data.vertices:
        p = v.co * freq + off
        v.co += Vector(noise.noise_vector(p)) * amt
    return o

def taper(o, top=0.5, axis=2):
    zs = [v.co[axis] for v in o.data.vertices]
    lo, hi = min(zs), max(zs)
    c = sum((o.matrix_world @ v.co for v in o.data.vertices), Vector()) / len(o.data.vertices)
    for v in o.data.vertices:
        t = (v.co[axis] - lo) / max(hi - lo, 1e-6)
        k = 1 + (top - 1) * t
        for a in range(3):
            if a != axis:
                v.co[a] = c[a] + (v.co[a] - c[a]) * k
    return o

def bend(o, amount=0.3, axis=0):
    """Courbe l'objet vers l'axe donné en fonction de la hauteur."""
    zs = [v.co.z for v in o.data.vertices]
    lo, hi = min(zs), max(zs)
    for v in o.data.vertices:
        t = (v.co.z - lo) / max(hi - lo, 1e-6)
        v.co[axis] += amount * t * t * (hi - lo)
    return o

def place(o, rot=(0, 0, 0), loc=(0, 0, 0)):
    """Tourne (degrés, autour de l'origine) puis déplace les sommets."""
    m = Matrix.Translation(loc) @ Matrix.Rotation(math.radians(rot[2]), 4, 'Z') @ Matrix.Rotation(math.radians(rot[1]), 4, 'Y') @ Matrix.Rotation(math.radians(rot[0]), 4, 'X')
    o.data.transform(m)
    return o

def far_point(o, frm):
    frm = Vector(frm)
    return max((v.co for v in o.data.vertices), key=lambda c: (c - frm).length).copy()

def move(o, d):
    for v in o.data.vertices:
        v.co += Vector(d)
    return o

def rot_z(o, deg, center=(0, 0, 0)):
    m = Matrix.Translation(center) @ Matrix.Rotation(math.radians(deg), 4, 'Z') @ Matrix.Translation([-x for x in center])
    o.data.transform(m)
    return o

# ---------- assemblage
def join(objs, name):
    objs = [o for o in objs if o]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    return o

def finalize(objs, name):
    """Joint les pièces, sépare les parties lumineuses, pose le modèle au sol et au centre."""
    body = join(objs, name)
    for p in body.data.polygons:
        p.use_smooth = False
    # nettoyage des doublons de sommets
    bm = bmesh.new(); bm.from_mesh(body.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    bm.to_mesh(body.data); bm.free()
    # recentrage
    ws = [v.co for v in body.data.vertices]
    mn = Vector((min(v.x for v in ws), min(v.y for v in ws), min(v.z for v in ws)))
    mx = Vector((max(v.x for v in ws), max(v.y for v in ws), max(v.z for v in ws)))
    move(body, (-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z))
    parts = [body]
    glow_idx = [i for i, m in enumerate(body.data.materials) if m['pal'] in GLOW]
    if glow_idx:
        bpy.ops.object.select_all(action='DESELECT')
        bpy.context.view_layer.objects.active = body
        body.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='DESELECT')
        for i in glow_idx:
            body.active_material_index = i
            bpy.ops.object.material_slot_select()
        bpy.ops.mesh.separate(type='SELECTED')
        bpy.ops.object.mode_set(mode='OBJECT')
        glow = [o for o in bpy.context.selected_objects if o != body][0]
        glow.name = name + '_Glow'
        parts.append(glow)
    return parts

def tris(objs):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)

# ---------- palette / UV / export
def palette_image(path):
    size = CELLS * CELL_PX
    img = bpy.data.images.new('Palette', size, size, alpha=False)
    px = [0.0] * (size * size * 4)
    names = list(PALETTE)
    for i, n in enumerate(names):
        cx, cy = i % CELLS, i // CELLS
        r, g, b = PALETTE[n]
        for y in range(cy * CELL_PX, (cy + 1) * CELL_PX):
            for x in range(cx * CELL_PX, (cx + 1) * CELL_PX):
                k = (y * size + x) * 4
                px[k:k + 4] = [r, g, b, 1]
    img.pixels = px
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    return img

def palette_uv(o):
    names = list(PALETTE)
    me = o.data
    uv = me.uv_layers.get('UVMap') or me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        n = me.materials[p.material_index]['pal']
        i = names.index(n)
        u = (i % CELLS + 0.5) / CELLS
        v = (i // CELLS + 0.5) / CELLS
        for li in p.loop_indices:
            uv.data[li].uv = (u, v)

def palette_material(img):
    m = bpy.data.materials.get('Palette')
    if m:
        return m
    m = bpy.data.materials.new('Palette')
    m.use_nodes = True
    t = m.node_tree.nodes.new('ShaderNodeTexImage')
    t.image = img
    t.interpolation = 'Closest'
    m.node_tree.links.new(t.outputs['Color'], m.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    return m

def export_fbx(parts, path, img):
    pm = palette_material(img)
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        palette_uv(o)
        o.data.materials.clear()
        o.data.materials.append(pm)
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.export_scene.fbx(filepath=path, use_selection=True, axis_forward='-Z', axis_up='Y',
                             apply_scale_options='FBX_SCALE_NONE', apply_unit_scale=False,
                             mesh_smooth_type='FACE', path_mode='COPY', embed_textures=True,
                             bake_space_transform=True)

# ---------- formes composées
def seg(c, a, b, r, n=6, r2=None):
    """Cylindre du point a au point b."""
    a, b = Vector(a), Vector(b)
    L = (b - a).length
    o = cyl(c, (0, 0, L / 2), r, L, n, r2=r2)
    o.data.transform((b - a).to_track_quat('Z', 'Y').to_matrix().to_4x4())
    return move(o, a)

def bone(c, a, b, r):
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    side = d.cross(Vector((0, 0, 1)))
    if side.length < 1e-3:
        side = Vector((1, 0, 0))
    side = side.normalized() * r * 0.9
    ps = [seg(c, a, b, r, 6)]
    for p in (a, b):
        ps += [ball(c, p + side, r * 1.35, 0), ball(c, p - side, r * 1.35, 0)]
    return ps

def gear(c, loc, R, h, teeth=10, rot=(0, 0, 0)):
    ps = [cyl(c, (0, 0, 0), R, h, teeth * 2)]
    for i in range(teeth):
        a = i / teeth * math.tau
        t = cube(c, (0, 0, 0), (R * 0.32, R * 0.28, h))
        ps.append(place(t, (0, 0, math.degrees(a)), (math.cos(a) * R, math.sin(a) * R, 0)))
    g = join(ps, 'gear')
    return place(g, rot, loc)

def ring_of(fn, n, radius, z=0, phase=0):
    out = []
    for i in range(n):
        a = i / n * math.tau + phase
        out.append(fn(i, a, (math.cos(a) * radius, math.sin(a) * radius, z)))
    return out
