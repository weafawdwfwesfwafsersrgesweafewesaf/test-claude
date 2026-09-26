# Rendu d'aperçu : 3 thèmes d'exemple autour d'un vélo à l'échelle réaliste
import os as _os
HERE = _os.path.dirname(_os.path.abspath(__file__))
AURAS = _os.path.dirname(HERE) + '/'
import bpy, sys, math, random
sys.path.insert(0, HERE)
import meshes

TEX = AURAS + 'Textures/'
THEMES = [  # (nom, couleur coeur, couleur bord)
    ('Galaxie', (1.0, 0.55, 1.0), (0.35, 0.05, 1.0)),
    ('Glace', (0.85, 1.0, 1.0), (0.05, 0.45, 1.0)),
    ('Feu', (1.0, 0.85, 0.3), (1.0, 0.18, 0.02)),
]
SPACING = 11

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = 48
sc.cycles.use_denoising = False
sc.render.resolution_x, sc.render.resolution_y = 1800, 760
sc.view_settings.view_transform = 'AgX'
sc.world = bpy.data.worlds.new('w')
sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.012, 0.012, 0.02, 1)

def img(name):
    return bpy.data.images.load(TEX + name)

def aura_mat(name, image, c1, c2, strength=5, tile=None, scroll=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.blend_method = 'BLEND'
    nt = m.node_tree; N = nt.nodes; L = nt.links
    N.clear()
    tc = N.new('ShaderNodeTexCoord'); mp = N.new('ShaderNodeMapping')
    if tile is not None:  # une case du flipbook 8x8
        col, row = tile % 8, tile // 8
        mp.inputs['Scale'].default_value = (1 / 8, 1 / 8, 1)
        mp.inputs['Location'].default_value = (col / 8, 1 - (row + 1) / 8, 0)
    mp.inputs['Location'].default_value[0] += scroll
    tx = N.new('ShaderNodeTexImage'); tx.image = image
    L.new(tc.outputs['UV'], mp.inputs[0]); L.new(mp.outputs[0], tx.inputs[0])
    pw = N.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 2
    L.new(tx.outputs['Alpha'], pw.inputs[0])
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    mix.inputs[6].default_value = (*c2, 1); mix.inputs[7].default_value = (*c1, 1)
    L.new(pw.outputs[0], mix.inputs[0])
    em = N.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = strength
    L.new(mix.outputs[2], em.inputs['Color'])
    tr = N.new('ShaderNodeBsdfTransparent'); ms = N.new('ShaderNodeMixShader')
    L.new(tx.outputs['Alpha'], ms.inputs[0]); L.new(tr.outputs[0], ms.inputs[1]); L.new(em.outputs[0], ms.inputs[2])
    out = N.new('ShaderNodeOutputMaterial'); L.new(ms.outputs[0], out.inputs[0])
    return m

metal = bpy.data.materials.new('metal')
metal.use_nodes = True
bs = metal.node_tree.nodes['Principled BSDF']
bs.inputs['Base Color'].default_value = (0.03, 0.03, 0.035, 1)
bs.inputs['Metallic'].default_value = 0.8
bs.inputs['Roughness'].default_value = 0.3

def tube(p1, p2, r=0.07):
    import mathutils
    a, b = mathutils.Vector(p1), mathutils.Vector(p2)
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=(b - a).length, location=(a + b) / 2)
    o = bpy.context.active_object
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = (b - a).to_track_quat('Z', 'Y')
    o.data.materials.append(metal)

def bike(ox):
    # vélo réaliste en studs : roues Ø2.2, empattement 3.4, selle à ~3.1
    for y in (-1.7, 1.7):
        bpy.ops.mesh.primitive_torus_add(major_radius=1.05, minor_radius=0.09, location=(ox, y, 1.1), rotation=(0, math.pi / 2, 0))
        bpy.context.active_object.data.materials.append(metal)
    bb, seat, head, rear, front = (ox, 0.1, 1.05), (ox, -0.35, 2.95), (ox, 1.25, 2.75), (ox, -1.7, 1.1), (ox, 1.7, 1.1)
    for p, q in ((bb, seat), (bb, head), (seat, head), (bb, rear), (seat, rear), (head, front)):
        tube(p, q)
    tube((ox, -0.55, 3.05), (ox, -0.05, 3.05), 0.13)  # selle
    tube((ox - 0.7, 1.35, 3.25), (ox + 0.7, 1.35, 3.25), 0.06)  # guidon
    tube(head, (ox, 1.35, 3.25), 0.06)

random.seed(4)
cam_target = None
for k, (name, c1, c2) in enumerate(THEMES):
    ox = (k - 1) * SPACING
    before = set(sc.objects)
    bike(ox)
    for mesh_fn, tex, st in ((meshes.helix, 'AuraStreak.png', 2.2), (meshes.ring, 'AuraStreak.png', 1.8)):
        o = mesh_fn(f'{mesh_fn.__name__}_{name}')
        o.location.x = ox
        o.data.materials.append(aura_mat(o.name, img(tex), c1, c2, st, scroll=random.random()))
    g = bpy.data.objects.new('glow', bpy.data.meshes.new('g'))
    bpy.ops.mesh.primitive_plane_add(size=9, location=(ox, 0, 0.03))
    bpy.context.active_object.data.materials.append(aura_mat('glow' + name, img('AuraGlow.png'), c1, c2, 0.5))
    # flammes et étincelles (billboards orientés caméra)
    for i in range(16):
        th = random.random() * math.tau
        r = 2.3 + random.random() * 0.8
        loc = (ox + math.cos(th) * r * 0.75, math.sin(th) * r * 1.2, 1.0 + random.random() * 0.5)
        bpy.ops.mesh.primitive_plane_add(size=2.2 + random.random(), location=loc)
        f = bpy.context.active_object
        f.data.materials.append(aura_mat(f'fl{name}{i}', img('AuraFlame_8x8.png'), c1, c2, 1.8, tile=random.randint(14, 40)))
        f.constraints.new('TRACK_TO')
    for i in range(14):
        loc = (ox + random.uniform(-2.5, 2.5), random.uniform(-3.5, 3.5), random.uniform(0.5, 6))
        bpy.ops.mesh.primitive_plane_add(size=random.uniform(0.3, 0.7), location=loc)
        f = bpy.context.active_object
        f.data.materials.append(aura_mat(f'sp{name}{i}', img('AuraSpark.png'), c1, c2, 6))
        f.constraints.new('TRACK_TO')
    bpy.ops.mesh.primitive_plane_add(size=5.5, location=(ox, 0, 0.5))
    sw = bpy.context.active_object
    sw.data.materials.append(aura_mat('sw' + name, img('AuraSwirl_8x8.png'), c1, c2, 1.2, tile=28))
    sw.location.z = 0.05
    # vue de 3/4 : on tourne tout le groupe autour de son centre
    pivot = bpy.data.objects.new('pivot' + name, None); sc.collection.objects.link(pivot)
    pivot.location = (ox, 0, 0)
    bpy.context.view_layer.update()
    for o in set(sc.objects) - before - {pivot}:
        o.parent = pivot
        o.matrix_parent_inverse = pivot.matrix_world.inverted()
    pivot.rotation_euler.z = math.radians(62)

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 32
cam.location = (0, 25, 9)
tgt = bpy.data.objects.new('tgt', None); sc.collection.objects.link(tgt); tgt.location = (0, 0, 2.6)
c = cam.constraints.new('TRACK_TO'); c.target = tgt
for o in sc.objects:
    for con in o.constraints:
        if con.type == 'TRACK_TO' and con.target is None:
            con.target = cam; con.track_axis = 'TRACK_Z'; con.up_axis = 'UP_Y'
sun = bpy.data.objects.new('key', bpy.data.lights.new('key', 'AREA'))
sun.data.energy = 900; sun.data.size = 10; sun.location = (6, 10, 12)
sc.collection.objects.link(sun)
sun.constraints.new('TRACK_TO').target = tgt
bpy.ops.mesh.primitive_plane_add(size=80)
fl = bpy.data.materials.new('floor'); fl.use_nodes = True
fl.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.02, 0.02, 0.025, 1)
fl.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.35
bpy.context.active_object.data.materials.append(fl)
sc.render.filepath = AURAS + 'Preview/apercu_auras.png'
bpy.ops.render.render(write_still=True)
