# Atelier : rend chaque modèle seul, de trois quarts, avec le relief des studs.
# blender -b --python render_models.py -- models.json outdir [nom1,nom2,...] [samples]
import bpy, bmesh, sys, json, math
from mathutils import Vector, Matrix
args = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = args[0], args[1]
ONLY = set(args[2].split(',')) if len(args) > 2 and args[2] else None
SAMPLES = int(args[3]) if len(args) > 3 else 24
MODELS = json.load(open(SRC))

B = lambda x, y, z: Vector((x, -z, y))          # Roblox -> Blender

def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = False
    sc.render.resolution_x, sc.render.resolution_y = 760, 760
    sc.view_settings.view_transform = 'Standard'
    sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.62, 0.72, 0.85, 1); bg.inputs[1].default_value = 0.9
    return sc

mats = {}
def mat(rgb, neon, alpha, studs):
    k = (tuple(rgb), neon, round(alpha, 2), studs)
    if k in mats:
        return mats[k]
    m = bpy.data.materials.new(str(k)); m.use_nodes = True
    nt = m.node_tree; bs = nt.nodes['Principled BSDF']
    c = tuple((v / 255) ** 2.2 for v in rgb)
    bs.inputs['Base Color'].default_value = (*c, 1); bs.inputs['Roughness'].default_value = 0.55
    if neon:
        bs.inputs['Emission Color'].default_value = (*c, 1); bs.inputs['Emission Strength'].default_value = 2.5
    if alpha < 1:
        bs.inputs['Alpha'].default_value = alpha; m.blend_method = 'BLEND'
    if studs:
        # studs : bosses rondes d'1 stud de pas, projetées sur la face (coordonnées monde = objet)
        tc = nt.nodes.new('ShaderNodeTexCoord')
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        fr = nt.nodes.new('ShaderNodeVectorMath'); fr.operation = 'FRACTION'
        nt.links.new(tc.outputs['Object'], fr.inputs[0])
        sub = nt.nodes.new('ShaderNodeVectorMath'); sub.operation = 'SUBTRACT'; sub.inputs[1].default_value = (0.5, 0.5, 0.5)
        nt.links.new(fr.outputs[0], sub.inputs[0])
        dot = nt.nodes.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
        nt.links.new(sub.outputs[0], dot.inputs[0]); nt.links.new(geo.outputs['True Normal'], dot.inputs[1])
        sc_ = nt.nodes.new('ShaderNodeVectorMath'); sc_.operation = 'SCALE'
        nt.links.new(geo.outputs['True Normal'], sc_.inputs[0]); nt.links.new(dot.outputs['Value'], sc_.inputs['Scale'])
        pr = nt.nodes.new('ShaderNodeVectorMath'); pr.operation = 'SUBTRACT'
        nt.links.new(sub.outputs[0], pr.inputs[0]); nt.links.new(sc_.outputs[0], pr.inputs[1])
        ln = nt.nodes.new('ShaderNodeVectorMath'); ln.operation = 'LENGTH'
        nt.links.new(pr.outputs[0], ln.inputs[0])
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.33; mr.inputs['From Max'].default_value = 0.27
        nt.links.new(ln.outputs['Value'], mr.inputs['Value'])
        bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.35; bump.inputs['Distance'].default_value = 0.15
        nt.links.new(mr.outputs['Result'], bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], bs.inputs['Normal'])
    mats[k] = m
    return m

def rbx_matrix(p, right, up):
    right, up = Vector(right), Vector(up); back = right.cross(up)
    b = lambda v: Vector((v.x, -v.z, v.y))
    R = Matrix((b(right), b(up), b(back))).transposed().to_4x4()
    return Matrix.Translation(B(*p)) @ R

def geom(bm, shape):
    if shape == 'C':
        r = bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.5, radius2=0.5, depth=1)
        return r['verts'], Matrix.Rotation(math.pi / 2, 4, 'Y')
    if shape == 'S':
        r = bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=24, radius=0.5)
        return r['verts'], Matrix()
    if shape == 'W':
        # coin Roblox : fond et dos (+Z) pleins. En Blender : +Z roblox = -Y blender.
        pts = [(-.5, -.5, -.5), (.5, -.5, -.5), (-.5, -.5, .5), (.5, -.5, .5), (-.5, .5, .5), (.5, .5, .5)]
        vs = [bm.verts.new(B(*p)) for p in pts]
        for f in ((0, 1, 3, 2), (2, 3, 5, 4), (0, 2, 4), (1, 5, 3), (0, 4, 5, 1)):
            bm.faces.new([vs[i] for i in f])
        return vs, Matrix()
    r = bmesh.ops.create_cube(bm, size=1)
    return r['verts'], Matrix()

def build(nodes):
    buckets = {}
    def walk(n):
        if n.get('c') == 'Part':
            m = n['cf']
            right, up = (m[3], m[6], m[9]), (m[4], m[7], m[10])
            shp = 'S' if (n['shape'] == 0 or n.get('sphere')) else {2: 'C', 3: 'W'}.get(n['shape'], 'B')
            alpha = 1 - n.get('transp', 0)
            mt = mat(n['rgb'], n['mat'] == 288, alpha, n.get('studs', False))
            bm = buckets.setdefault(mt.name, (bmesh.new(), mt))[0]
            if shp == 'W':
                back = (right[1] * up[2] - right[2] * up[1], right[2] * up[0] - right[0] * up[2], right[0] * up[1] - right[1] * up[0])
                sx, sy, sz = n['size']
                pts = [(-.5, -.5, -.5), (.5, -.5, -.5), (-.5, -.5, .5), (.5, -.5, .5), (-.5, .5, .5), (.5, .5, .5)]
                vs = []
                for (a, b_, c_) in pts:
                    w = [m[i] + a * sx * right[i] + b_ * sy * up[i] + c_ * sz * back[i] for i in range(3)]
                    vs.append(bm.verts.new(B(*w)))
                cen = sum((v.co for v in vs), Vector()) / 6
                for f in ((0, 2, 3, 1), (2, 4, 5, 3), (0, 4, 2), (1, 3, 5), (0, 1, 5, 4)):
                    fa = bm.faces.new([vs[i] for i in f])
                    fa.normal_update()
                    if fa.normal.dot(fa.calc_center_median() - cen) < 0:
                        fa.normal_flip()
            else:
                vs, rot = geom(bm, shp)
                M = rbx_matrix(m[:3], right, up)
                bmesh.ops.transform(bm, matrix=M @ Matrix.Diagonal((*n['size'], 1)) @ rot, verts=vs)
        for k in n.get('k', []):
            walk(k)
    for n in nodes:
        walk(n)
    objs = []
    for name, (bm, m) in buckets.items():
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); o.data.materials.append(m)
        objs.append(o)
    return objs

def bbox(nodes):
    lo, hi = [1e9] * 3, [-1e9] * 3
    def walk(n):
        if n.get('c') == 'Part':
            m, h = n['cf'], [v / 2 for v in n['size']]
            for i in range(3):
                e = abs(m[3 + i * 3]) * h[0] + abs(m[4 + i * 3]) * h[1] + abs(m[5 + i * 3]) * h[2]
                lo[i], hi[i] = min(lo[i], m[i] - e), max(hi[i], m[i] + e)
        for k in n.get('k', []):
            walk(k)
    for n in nodes:
        walk(n)
    return lo, hi

for name, entry in MODELS.items():
    if ONLY and name not in ONLY:
        continue
    nodes = entry['k'] if isinstance(entry, dict) else entry
    view = entry.get('view', (0.75, 0.45, 1.0)) if isinstance(entry, dict) else (0.75, 0.45, 1.0)
    sc = setup(); mats.clear()
    build(nodes)
    lo, hi = bbox(nodes)
    c = [(lo[i] + hi[i]) / 2 for i in range(3)]
    R = max(hi[i] - lo[i] for i in range(3)) / 2
    # sol gris clair sous le modèle
    bm = bmesh.new(); r = bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(B(c[0], lo[1] - 0.5, c[2])) @ Matrix.Diagonal((R * 8, R * 8, 1, 1)), verts=r['verts'])
    me = bpy.data.meshes.new('sol'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('sol', me); sc.collection.objects.link(o); o.data.materials.append(mat((200, 200, 205), False, 1, False))
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.2; sun.data.angle = 0.2
    sun.rotation_euler = (math.radians(40), math.radians(15), math.radians(35)); sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.lens = 50; cam.data.clip_end = 20000
    v = Vector(view).normalized()
    dist = R / math.tan(math.radians(18)) * 1.15
    cam.location = B(c[0] + v.x * dist, c[1] + v.y * dist, c[2] + v.z * dist)
    tgt = bpy.data.objects.new('t', None); sc.collection.objects.link(tgt); tgt.location = B(*c)
    cam.constraints.new('TRACK_TO').target = tgt
    sc.render.filepath = f'{OUT}/{name}.png'
    bpy.ops.render.render(write_still=True)
