# Rendu d'un niveau réel (géométrie extraite du .rbxl) + décorations posées, vu du vélo.
import bpy, sys, json, re, math
from mathutils import Vector, Matrix
sys.path.insert(0, '/home/user/test-claude/Decorations/Blender')
args = sys.argv[sys.argv.index('--') + 1:]
lvl, out = int(args[0]), args[1]
TREE = args[6] if len(args) > 6 else '/tmp/claude-0/rbx/tree_l7.json'
cam_z = float(args[2]) if len(args) > 2 else 60
cam_x = float(args[3]) if len(args) > 3 else 0
cam_h = float(args[4]) if len(args) > 4 else 22
look_x = float(args[5]) if len(args) > 5 else 0
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.samples = 12; sc.cycles.use_denoising = False
sc.render.resolution_x, sc.render.resolution_y = 1280, 720
sc.view_settings.view_transform = 'Standard'
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.75, 1.0, 1)
sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.8
B = lambda x, y, z: Vector((x, -z, y))          # Roblox -> Blender
mats = {}
def mat(rgb, glow=False, alpha=1.0):
    k = (tuple(rgb), glow, alpha)
    if k not in mats:
        m = bpy.data.materials.new(str(k)); m.use_nodes = True
        bs = m.node_tree.nodes['Principled BSDF']
        c = tuple(v / 255 for v in rgb)
        bs.inputs['Base Color'].default_value = (*c, 1); bs.inputs['Roughness'].default_value = 0.7
        if glow:
            bs.inputs['Emission Color'].default_value = (*c, 1); bs.inputs['Emission Strength'].default_value = 1.5
        if alpha < 1:
            bs.inputs['Alpha'].default_value = alpha
            m.blend_method = 'BLEND'
        mats[k] = m
    return mats[k]
# un seul mesh par matériau pour aller vite
import bmesh
buckets = {}
def add_box(m4, size, material, shape='B'):
    bm = buckets.setdefault(material.name, (bmesh.new(), material))[0]
    if shape == 'C':
        r = bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.5, radius2=0.5, depth=1)
        vs = r['verts']; rot = Matrix.Rotation(math.pi / 2, 4, 'Y')
    elif shape == 'S':
        r = bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=8, radius=0.5); vs = r['verts']; rot = Matrix()
    else:
        r = bmesh.ops.create_cube(bm, size=1); vs = r['verts']; rot = Matrix()
    bmesh.ops.transform(bm, matrix=m4 @ Matrix.Diagonal((*size, 1)) @ rot, verts=vs)
def rbx_matrix(p, right, up):
    right, up = Vector(right), Vector(up); back = right.cross(up)
    b = lambda v: Vector((v.x, -v.z, v.y))
    R = Matrix((b(right), b(up), b(back))).transposed().to_4x4()
    return Matrix.Translation(B(*p)) @ R
# géométrie du niveau
parts = json.load(open(args[7] if len(args) > 7 and args[7] != '-' else '/tmp/claude-0/rbx/levels.json'))
for p in parts:
    if p['t'] != f'Level{lvl}' or p['tr'] > 0.8:
        continue
    m = p['m']
    right, up = (m[0], m[3], m[6]), (m[1], m[4], m[7])
    shp = {0: 'S', 2: 'C'}.get(p.get('sh'), 'B') if p['c'] == 'Part' else 'B'
    add_box(rbx_matrix(p['p'], right, up), p['s'], mat(p['col'], p['n'] in ('Nappe',)), shp)
# canyon : relu dans un fichier (args[8]) ou simplifié (trois gradins, dessus d'herbe)
if len(args) > 8:
    rideY = (lvl - 1) * 50; z0 = 300 + (lvl - 1) * 1300; z1 = z0 + 1300
    for q in json.load(open(args[8])):
        if z0 - 250 < q['p'][2] < z1 + 250:
            add_box(rbx_matrix(q['p'], (1, 0, 0), (0, 1, 0)), q['s'], mat(q['col'] if isinstance(q.get('c'), str) else q['c']))
else:
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

# décors lus dans un arbre d'instances (tree.json), exactement comme ils seront écrits dans le jeu
def walk(n):
    if n['c'] == 'Part':
        m = n['cf']
        right, up = (m[3], m[6], m[9]), (m[4], m[7], m[10])
        shp = 'S' if (n['shape'] == 0 or n.get('sphere')) else ('C' if n['shape'] == 2 else ('W' if n['shape'] == 3 else 'B'))
        alpha = 1 - n.get('transp', 0)
        mt = mat(n['rgb'], n['mat'] == 288, alpha)
        if shp == 'W':
            bm = buckets.setdefault(mt.name, (bmesh.new(), mt))[0]
            back = (right[1] * up[2] - right[2] * up[1], right[2] * up[0] - right[0] * up[2], right[0] * up[1] - right[1] * up[0])
            sx, sy, sz = n['size']
            pts = [(-.5, -.5, -.5), (.5, -.5, -.5), (-.5, -.5, .5), (.5, -.5, .5), (-.5, .5, .5), (.5, .5, .5)]
            vs = [bm.verts.new(B(*[m[i] + a * sx * right[i] + b_ * sy * up[i] + c_ * sz * back[i] for i in range(3)])) for (a, b_, c_) in pts]
            cen = sum((v.co for v in vs), Vector()) / 6
            for f in ((0, 2, 3, 1), (2, 4, 5, 3), (0, 4, 2), (1, 3, 5), (0, 1, 5, 4)):
                fa = bm.faces.new([vs[i] for i in f]); fa.normal_update()
                if fa.normal.dot(fa.calc_center_median() - cen) < 0:
                    fa.normal_flip()
        else:
            add_box(rbx_matrix(m[:3], right, up), n['size'], mt, shp)
    for k in n.get('k', []):
        walk(k)
walk(json.load(open(TREE)))
for name, (bm, m) in buckets.items():
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); o.data.materials.append(m)
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.5
sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(30)); sc.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 22; cam.data.clip_end = 5000
cam.location = B(cam_x, rideY + cam_h, z0 + cam_z)
tgt = bpy.data.objects.new('t', None); sc.collection.objects.link(tgt); tgt.location = B(look_x, rideY + (float(args[9]) if len(args) > 9 else 5), z0 + cam_z + 200)
cam.constraints.new('TRACK_TO').target = tgt
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
