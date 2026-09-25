# Version « enregistrement » du kit : au lieu de créer des meshes Blender, on note
# chaque primitive (forme, couleur, matrice) pour la reconstruire en parts Roblox.
import math, random
from mathutils import Vector, Matrix

PALETTE = {}
GLOW = set()

def hexc(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))

def color(name, hexv, glow=False):
    PALETTE[name] = hexv.lstrip('#')
    if glow:
        GLOW.add(name)
    return name

class _Data:
    def __init__(self, owner):
        self.owner = owner
        self.vertices = []
    def transform(self, m):
        for p in self.owner.prims():
            p.M = m @ p.M

class Prim:
    def __init__(self, kind, c, dims, M):
        self.kind, self.c, self.dims, self.M = kind, c, dims, M
        self.data = _Data(self)
    def prims(self):
        return [self]

class Group:
    def __init__(self, items):
        self.items = items
        self.data = _Data(self)
    def prims(self):
        out = []
        for i in self.items:
            out += i.prims()
        return out

def _mat(loc, rot):
    r = [math.radians(a) for a in rot]
    return Matrix.Translation(loc) @ Matrix.Rotation(r[2], 4, 'Z') @ Matrix.Rotation(r[1], 4, 'Y') @ Matrix.Rotation(r[0], 4, 'X')

def _s3(scl):
    return scl if isinstance(scl, (tuple, list)) else (scl, scl, scl)

def cube(c, loc=(0, 0, 0), size=(1, 1, 1), rot=(0, 0, 0)):
    return Prim('cube', c, tuple(size), _mat(loc, rot))

def cyl(c, loc=(0, 0, 0), r=1, h=1, seg=8, rot=(0, 0, 0), r2=None):
    return Prim('cyl', c, (r, h, r if r2 is None else r2), _mat(loc, rot))

def cone(c, loc=(0, 0, 0), r=1, h=1, seg=8, rot=(0, 0, 0)):
    return Prim('cyl', c, (r, h, 0.0), _mat(loc, rot))

def ball(c, loc=(0, 0, 0), r=1, sub=1, scl=(1, 1, 1), rot=(0, 0, 0)):
    return Prim('ball', c, tuple(r * s for s in scl), _mat(loc, rot))

def uvball(c, loc=(0, 0, 0), r=1, seg=10, rings=6, scl=(1, 1, 1), rot=(0, 0, 0)):
    return ball(c, loc, r, 1, scl, rot)

def torus(c, loc=(0, 0, 0), R=1, r=0.25, seg=12, mseg=6, rot=(0, 0, 0), scl=1):
    s = _s3(scl)
    return Prim('torus', c, (R, r, s), _mat(loc, rot))

def jitter(o, *a, **k):
    return o

def taper(o, *a, **k):
    return o

def bend(o, *a, **k):
    return o

def place(o, rot=(0, 0, 0), loc=(0, 0, 0)):
    o.data.transform(_mat(loc, rot))
    return o

def move(o, d):
    o.data.transform(Matrix.Translation(d))
    return o

def rot_z(o, deg, center=(0, 0, 0)):
    m = Matrix.Translation(center) @ Matrix.Rotation(math.radians(deg), 4, 'Z') @ Matrix.Translation([-x for x in center])
    o.data.transform(m)
    return o

def _ends(p):
    """Points extrêmes approximatifs d'une primitive (pour far_point / bornes)."""
    M = p.M
    if p.kind == 'cyl':
        r, h, r2 = p.dims
        return [M @ Vector((0, 0, -h / 2)), M @ Vector((0, 0, h / 2))]
    if p.kind == 'cube':
        sx, sy, sz = p.dims
        return [M @ Vector((x * sx / 2, y * sy / 2, z * sz / 2)) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    if p.kind == 'ball':
        rx, ry, rz = p.dims
        return [M @ Vector(v) for v in ((rx, 0, 0), (-rx, 0, 0), (0, ry, 0), (0, -ry, 0), (0, 0, rz), (0, 0, -rz))]
    R, r, s = p.dims
    return [M @ Vector(v) for v in ((R + r, 0, 0), (-R - r, 0, 0), (0, R + r, r), (0, -R - r, -r))]

def far_point(o, frm):
    frm = Vector(frm)
    return max((e for p in o.prims() for e in _ends(p)), key=lambda c: (c - frm).length).copy()

def join(objs, name):
    return Group([o for o in objs if o])

def finalize(objs, name):
    g = Group([o for o in objs if o])
    pts = [e for p in g.prims() for e in _ends(p)]
    mn = Vector((min(v.x for v in pts), min(v.y for v in pts), min(v.z for v in pts)))
    mx = Vector((max(v.x for v in pts), max(v.y for v in pts), max(v.z for v in pts)))
    move(g, (-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z))
    return g.prims()

# ---------- formes composées (identiques au kit Blender)
def seg(c, a, b, r, n=6, r2=None):
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
