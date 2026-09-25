# Rendu d'un niveau réel (géométrie extraite du .rbxl) + décorations posées, vu du vélo.
import bpy, sys, json, re, math
from mathutils import Vector, Matrix
sys.path.insert(0, '/home/user/test-claude/Decorations/Blender')
args = sys.argv[sys.argv.index('--') + 1:]
lvl, out = int(args[0]), args[1]
cam_z = float(args[2]) if len(args) > 2 else 60
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.use_denoising = False
sc.render.resolution_x, sc.render.resolution_y = 1600, 900
sc.view_settings.view_transform = 'Standard'
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.75, 1.0, 1)
sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.8
B = lambda x, y, z: Vector((x, -z, y))          # Roblox -> Blender
mats = {}
def mat(rgb, glow=False):
    k = (tuple(rgb), glow)
    if k not in mats:
        m = bpy.data.materials.new(str(k)); m.use_nodes = True
        bs = m.node_tree.nodes['Principled BSDF']
        c = tuple(v / 255 for v in rgb)
        bs.inputs['Base Color'].default_value = (*c, 1); bs.inputs['Roughness'].default_value = 0.7
        if glow:
            bs.inputs['Emission Color'].default_value = (*c, 1); bs.inputs['Emission Strength'].default_value = 1.5
        mats[k] = m
    return mats[k]
# un seul mesh par matériau pour aller vite
import bmesh
buckets = {}
def add_box(m4, size, material, shape='B'):
    bm = buckets.setdefault(material.name, (bmesh.new(), material))[0]
    if shape == 'C':
        r = bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.5, radius2=0.5, depth=1)
        vs = r['verts']; rot = Matrix.Rotation(math.pi / 2, 4, 'Y')
    elif shape == 'S':
        r = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=6, radius=0.5); vs = r['verts']; rot = Matrix()
    else:
        r = bmesh.ops.create_cube(bm, size=1); vs = r['verts']; rot = Matrix()
    bmesh.ops.transform(bm, matrix=m4 @ Matrix.Diagonal((*size, 1)) @ rot, verts=vs)
def rbx_matrix(p, right, up):
    right, up = Vector(right), Vector(up); back = right.cross(up)
    b = lambda v: Vector((v.x, -v.z, v.y))
    R = Matrix((b(right), b(up), b(back))).transposed().to_4x4()
    return Matrix.Translation(B(*p)) @ R
# géométrie du niveau
parts = json.load(open('/tmp/claude-0/rbx/levels.json'))
for p in parts:
    if p['t'] != f'Level{lvl}' or p['tr'] > 0.8:
        continue
    m = p['m']
    right, up = (m[0], m[3], m[6]), (m[1], m[4], m[7])
    shp = {0: 'S', 2: 'C'}.get(p.get('sh'), 'B') if p['c'] == 'Part' else 'B'
    add_box(rbx_matrix(p['p'], right, up), p['s'], mat(p['col'], p['n'] in ('Nappe',)), shp)
# canyon simplifié (World.Border : trois gradins, dessus d'herbe)
rideY = (lvl - 1) * 50; z0 = 300 + (lvl - 1) * 1300; z1 = z0 + 1300
h1 = {7: 215, 11: 280}.get(lvl, 150)
for side in (-1, 1):
    for x0, x1, top in ((170, 250, h1), (250, 370, h1 + 60), (370, 530, h1 + 140)):
        cx = side * (x0 + x1) / 2
        bot = rideY - 220; t = rideY + top
        add_box(Matrix.Translation(B(cx, (bot + t - 8) / 2, (z0 + z1) / 2)), (x1 - x0, (t - 8) - bot, z1 - z0 + 400), mat((158, 104, 64)))
        add_box(Matrix.Translation(B(cx - side, t - 4, (z0 + z1) / 2)), (x1 - x0 + 2, 8, z1 - z0 + 400), mat((92, 190, 72)))
# décorations
txt = open('/tmp/claude-0/rbx/new/DecorShapes.lua').read()
def world_data(w):
    blk = txt[txt.index(f'\t{w} = {{'):]; blk = blk[:blk.index('\n\t},')]
    cols = [(tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)), g == 'true') for h, g in re.findall(r'\{ "([0-9a-f]{6})", (true|false) \}', blk.split('Props')[0])]
    props = {n: [float(x) for x in body.split(', ')] for n, body in re.findall(r'Name = "(\w+)", Height = [\d.]+, Parts = \{ ([^}]*) \}', blk)}
    return cols, props
WD = {w: world_data(w) for w in ['Lava', 'Ice', 'Candy', 'Robot', 'Dragon', 'Skeleton', 'Retro', 'Ghost']}
placed = [p for p in json.load(open('/tmp/claude-0/rbx/placed.json')) if p['lvl'] == lvl]
for d in placed:
    for w, (cols, props) in WD.items():
        if d['name'] in props:
            break
    q = props[d['name']]
    base = Matrix.Translation(B(d['x'], d['y'], d['z'])) @ Matrix.Rotation(d['yaw'], 4, 'Z') @ Matrix.Scale(d['s'], 4)
    for i in range(0, len(q), 14):
        sh, ci = int(q[i]), int(q[i + 1])
        m4 = base @ rbx_matrix(q[i + 2:i + 5], q[i + 5:i + 8], q[i + 8:i + 11])
        col, glow = cols[ci - 1]
        add_box(m4, q[i + 11:i + 14], mat(col, glow), {1: 'B', 2: 'C', 3: 'S', 4: 'S'}[sh])
for name, (bm, m) in buckets.items():
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); o.data.materials.append(m)
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.5
sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(30)); sc.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 22; cam.data.clip_end = 5000
cam.location = B(0, rideY + 22, z0 + cam_z)
tgt = bpy.data.objects.new('t', None); sc.collection.objects.link(tgt); tgt.location = B(0, rideY + 5, z0 + cam_z + 200)
cam.constraints.new('TRACK_TO').target = tgt
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
