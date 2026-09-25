# Monde SQUELETTE : os, tombes, bougies
import math, random
from kit import *
from mathutils import Vector

TITLE = 'Skeleton'
SHOT = dict(bg=(0.16, 0.17, 0.2), floor=(0.22, 0.2, 0.19), light_col=(0.92, 0.95, 1), sun=2.2)

bonec = color('bone', '#e8dfc8'); bone2 = color('bone2', '#c9bd9f'); hole = color('eyehole', '#1b1717'); grave = color('gravestone', '#7b7f86')
grave2 = color('gravestone2', '#5b5f66'); dirt = color('dirt', '#4a3a2e'); moss = color('moss', '#56733f'); wax = color('wax', '#efe6d2')
flame = color('candleflame', '#ffb43a', glow=True); soul = color('soulglow', '#7dffb0', glow=True); iron = color('iron', '#2f3035')

def skull(c=None, loc=(0, 0, 0), s=1.0):
    ps = [uvball(bonec, (0, 0, 1.35), 1.2, 10, 6, scl=(1, 1.1, 1))]
    ps.append(cube(bonec, (0, -0.55, 0.55), (1.3, 1.0, 0.7)))  # mâchoire
    for x in (-0.42, 0.42):
        ps.append(uvball(hole, (x, -1.12, 1.3), 0.3, 6, 4, scl=(1, 0.5, 1.15)))
    ps.append(cone(hole, (0, -1.1, 0.95), 0.14, 0.3, 3, rot=(90, 0, 180)))
    for i in range(5):
        ps.append(cube(bone2, (-0.4 + i * 0.2, -1.06, 0.45), (0.14, 0.05, 0.22)))
    o = join(ps, 'sk')
    for v in o.data.vertices:
        v.co *= s
    return place(o, (0, 0, 0), loc)

def big_skull():
    ps = [skull(loc=(0, 0, 0), s=1.6)]
    for x in (-0.68, 0.68):  # yeux qui brillent
        ps.append(ball(soul, (x, -2.0, 2.08), 0.24, 1, scl=(1, 0.3, 1.1)))
    ps.append(jitter(cyl(dirt, (0, 0, 0.05), 2.6, 0.2, 9, r2=2.2), 0.15, 1, 2))
    return ps

def bone_pile():
    random.seed(4)
    ps = [jitter(cone(dirt, (0, 0, 0.35), 2.2, 0.7, 9), 0.1, 1, 3)]
    for i in range(11):
        a = random.uniform(0, math.tau); r = random.uniform(0, 1.6); L = random.uniform(1.4, 2.2)
        c = Vector((math.cos(a) * r, math.sin(a) * r, 0.55 + (1.6 - r) * 0.35 + random.uniform(0, 0.3)))
        d = Vector((math.cos(a + 1.7), math.sin(a + 1.7), random.uniform(-0.25, 0.25))).normalized() * L / 2
        ps += bone(bonec if i % 3 else bone2, c - d, c + d, 0.12)
    ps.append(skull(loc=(0.3, -0.2, 1.05), s=0.5))
    return ps

def tombstone():
    ps = [cube(grave, (0, 0, 1.3), (2.0, 0.5, 2.6))]
    top = cyl(grave, (0, 0, 0), 1.0, 0.5, 12, rot=(90, 0, 0))
    ps.append(move(top, (0, 0, 2.6)))
    ps.append(cube(grave2, (0, 0, 0.15), (2.5, 1.0, 0.3)))
    ps.append(cube(grave2, (0, -0.29, 2.3), (0.22, 0.08, 1.3)))  # croix gravée
    ps.append(cube(grave2, (0, -0.29, 2.55), (0.8, 0.08, 0.22)))
    ps.append(jitter(cube(dirt, (0, -1.3, 0.12), (1.6, 2.2, 0.35)), 0.12, 1.2, 5))  # tombe
    for x, z in ((-0.7, 0.9), (0.6, 2.95), (0.8, 0.4)):
        ps.append(jitter(ball(moss, (x, -0.2, z), 0.3, 0, scl=(1, 0.5, 0.6)), 0.05, 3, 6))
    return [place(join(ps, 't'), (0, 6, 4), (0, 0, 0))]

def bone_fence():
    ps = []
    for i in range(5):
        x = -4 + i * 2
        ps += bone(bonec, (x, 0, 0), (x, 0, 2.8 + (i % 2) * 0.3), 0.16)
        ps.append(skull(loc=(x, 0, 2.9 + (i % 2) * 0.3), s=0.32))
    for z in (0.9, 2.0):
        for i in range(4):
            x = -4 + i * 2
            ps += bone(bone2, (x + 0.2, 0, z), (x + 1.8, 0, z + 0.1 * (-1) ** i), 0.11)
    return ps

def candles():
    ps = [jitter(cyl(grave2, (0, 0, 0.15), 1.6, 0.3, 8), 0.08, 1.5, 7)]
    for i, (x, y, h) in enumerate(((0, 0, 2.2), (0.8, 0.5, 1.4), (-0.7, 0.6, 1.1), (0.4, -0.8, 0.8), (-0.6, -0.5, 1.7))):
        ps.append(cyl(wax, (x, y, 0.3 + h / 2), 0.28, h, 7))
        ps.append(jitter(cyl(wax, (x, y, 0.3 + h - 0.05), 0.34, 0.15, 7), 0.05, 3, i))  # cire coulée
        ps.append(seg(hole, (x, y, 0.3 + h), (x, y, 0.45 + h), 0.03, 3))
        ps.append(uvball(flame, (x, y, 0.62 + h), 0.14, 6, 4, scl=(1, 1, 1.9)))
    ps.append(skull(loc=(1.0, -0.2, 0.3), s=0.4))
    return ps

def ribcage_arch():
    ps = []
    for i in range(7):  # côtes géantes : on peut passer dessous à vélo
        y = -4.5 + i * 1.5
        R = 4.6 - abs(i - 3) * 0.35
        pts = []
        for k in range(10):
            a = math.pi * k / 9
            pts.append((math.cos(a) * R, y, math.sin(a) * R * 1.15))
        for k in range(9):
            ps.append(seg(bonec if k % 2 else bone2, pts[k], pts[k + 1], 0.28 - abs(k - 4.5) * 0.02, 6))
    spine = [(0, -5.2, 5.4), (0, 5.2, 5.4)]
    for i in range(13):  # colonne vertébrale
        y = -5.0 + i * 0.83
        ps.append(cyl(bonec, (0, y, 5.3), 0.42, 0.55, 8, rot=(90, 0, 0)))
        ps.append(cone(bone2, (0, y, 5.9), 0.22, 0.6, 4))
    ps.append(skull(loc=(0, -6.2, 4.5), s=1.0))
    return ps

PROPS = [('BigSkull', big_skull), ('BonePile', bone_pile), ('Tombstone', tombstone), ('BoneFence', bone_fence),
         ('SkullCandles', candles), ('RibcageArch', ribcage_arch)]
