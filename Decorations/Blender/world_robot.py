# Monde ROBOT : métal, engrenages, néons cyan
import math, random
from kit import *

TITLE = 'Robot'
SHOT = dict(bg=(0.1, 0.13, 0.17), floor=(0.16, 0.18, 0.21), light_col=(0.95, 0.97, 1), sun=2.6)

steel = color('steel', '#8a96a3'); steel2 = color('steel2', '#5d6975'); dark = color('darkmetal', '#2c333b'); yellow = color('hazard', '#ffc21a')
cyan = color('cyanled', '#29f0ff', glow=True); redled = color('redled', '#ff2f4f', glow=True); green = color('greenled', '#4dff7a', glow=True)
copper = color('copper', '#c97a45'); rubber = color('rubber', '#1d2126')

def gear_stack():
    return [gear(steel, (0, 0, 0.3), 2.2, 0.6, 12), gear(copper, (0.9, 0.5, 0.9), 1.4, 0.55, 9, rot=(0, 0, 15)),
            gear(steel2, (-0.4, -0.3, 1.45), 0.9, 0.5, 8),
            place(gear(steel, (0, 0, 0), 1.6, 0.5, 10), (78, 0, 30), (-1.7, 1.2, 1.6)),
            cyl(dark, (0, 0, 1.2), 0.3, 2.4, 8), cyl(cyan, (0, 0, 2.5), 0.35, 0.2, 8)]

def antenna():
    ps = [cyl(dark, (0, 0, 0.25), 1.6, 0.5, 8)]
    legs = [(1.3, 0), (-0.65, 1.13), (-0.65, -1.13)]
    top = (0, 0, 8.0)
    for x, y in legs:
        ps.append(seg(steel2, (x, y, 0.4), top, 0.12, 5))
    for k in range(1, 7):  # entretoises du pylône
        t = k / 7
        pts = [(x * (1 - t), y * (1 - t), 0.4 + (8.0 - 0.4) * t) for x, y in legs]
        for i in range(3):
            ps.append(seg(steel, pts[i], pts[(i + 1) % 3], 0.07, 4))
    ps.append(seg(steel, top, (0, 0, 9.4), 0.08, 4))
    ps.append(ball(redled, (0, 0, 9.5), 0.25, 1))
    ps.append(place(cyl(steel, (0, 0, 0), 0.6, 0.1, 10, r2=0.15), (70, 0, 30), (0.5, -0.4, 6.3)))  # parabole
    ps.append(ball(cyan, (0, 0, 4.2), 0.2, 0))
    return ps

def crate():
    ps = [cube(steel2, (0, 0, 1.1), (2.6, 2.2, 2.2))]
    for x in (-1, 1):
        for y in (-1, 1):
            ps.append(cube(dark, (x * 1.3, y * 1.1, 1.1), (0.25, 0.25, 2.3)))
    for z in (0.05, 2.15):
        ps.append(cube(dark, (0, 0, z), (2.75, 2.35, 0.2)))
    ps.append(cube(yellow, (0, -1.12, 0.35), (2.3, 0.05, 0.3)))
    for i in range(5):
        ps.append(place(cube(dark, (0, 0, 0), (0.18, 0.06, 0.32)), (0, 30, 0), (-0.9 + i * 0.45, -1.15, 0.35)))
    ps.append(cube(cyan, (0.5, -1.12, 1.35), (0.9, 0.05, 0.55)))
    ps.append(cube(green, (-0.7, -1.12, 1.45), (0.2, 0.05, 0.2)))
    ps.append(cube(redled, (-0.7, -1.12, 1.15), (0.2, 0.05, 0.2)))
    ps.append(cube(steel, (0.7, 0.3, 2.45), (1.1, 1.1, 0.5)))  # 2e petite caisse dessus
    return ps

def pipes():
    ps = []
    path = [(-2.5, 0, 0.6), (0, 0, 0.6), (0, 0, 3.0), (2.0, 0, 3.0), (2.0, 0, 0.0)]
    for a, b in zip(path, path[1:]):
        ps.append(seg(copper, a, b, 0.45, 10))
    for p in path[1:4]:
        ps.append(ball(copper, p, 0.55, 1))
    for p in ((-1.4, 0, 0.6), (1.0, 0, 3.0), (2.0, 0, 1.4)):  # brides
        d = (1, 0, 0) if p[2] in (0.6, 3.0) and p[0] != 2.0 else (0, 0, 1)
        ring = cyl(dark, (0, 0, 0), 0.6, 0.25, 10)
        ps.append(place(ring, (0, 90, 0) if d[0] else (0, 0, 0), p))
    ps.append(seg(dark, (0, 0, 1.8), (0, -1.0, 1.8), 0.12, 6))
    ps.append(place(torus(redled, (0, 0, 0), 0.6, 0.09, 12, 4), (90, 0, 0), (0, -1.05, 1.8)))
    ps.append(cube(dark, (-2.7, 0, 0.6), (0.4, 1.4, 1.4)))
    ps.append(cyl(steel2, (2.0, 0, 0.15), 0.8, 0.3, 10))
    return ps

def robot_head():
    ps = [place(cube(steel, (0, 0, 0), (3.0, 2.6, 2.4)), (0, 0, 0), (0, 0, 1.3))]
    ps.append(cube(dark, (0, -1.31, 1.6), (2.4, 0.05, 1.0)))
    for x in (-0.65, 0.65):
        ps.append(cyl(cyan, (x, -1.35, 1.65), 0.35, 0.1, 10, rot=(90, 0, 0)))
    ps.append(cube(steel2, (0, -1.32, 0.65), (1.6, 0.08, 0.4)))
    for i in range(5):
        ps.append(cube(dark, (-0.6 + i * 0.3, -1.37, 0.65), (0.12, 0.05, 0.3)))
    for x in (-1.55, 1.55):  # oreilles
        ps.append(cyl(steel2, (x, 0, 1.4), 0.55, 0.3, 10, rot=(0, 90, 0)))
        ps.append(cyl(yellow, (x * 1.08, 0, 1.4), 0.3, 0.15, 10, rot=(0, 90, 0)))
    ps.append(seg(dark, (0.5, 0, 2.5), (0.9, 0.2, 3.8), 0.07, 4))
    ps.append(ball(redled, (0.9, 0.2, 3.9), 0.18, 0))
    for x, y in ((-1.3, -1.1), (1.3, -1.1), (-1.3, 1.1), (1.3, 1.1)):
        ps.append(ball(steel2, (x, y, 2.45), 0.12, 0))
    o = join(ps, 'head')
    return [place(o, (0, 14, 18), (0, 0, 0.2))]  # tête tombée, un peu penchée

def battery():
    ps = [cyl(dark, (0, 0, 2.2), 1.3, 4.4, 12), cyl(steel, (0, 0, 4.55), 0.55, 0.3, 10), cyl(steel2, (0, 0, 0.1), 1.35, 0.2, 12)]
    for i in range(4):  # jauge de charge
        ps.append(cube(green if i < 3 else steel2, (0, -1.28, 0.9 + i * 0.75), (1.2, 0.1, 0.55)))
    ps.append(cube(yellow, (0, -1.3, 3.95), (0.35, 0.05, 0.35)))
    ps.append(cyl(yellow, (0, 0, 4.2), 1.31, 0.12, 12))
    return ps

def robo_lamp():
    ps = [cyl(dark, (0, 0, 0.2), 0.8, 0.4, 8), cyl(steel2, (0, 0, 2.8), 0.18, 5.0, 8)]
    ps.append(seg(steel2, (0, 0, 5.2), (1.6, 0, 5.6), 0.12, 6))
    ps.append(cyl(dark, (1.8, 0, 5.45), 0.55, 0.4, 8, r2=0.35))
    ps.append(cyl(cyan, (1.8, 0, 5.2), 0.5, 0.1, 8))
    ps.append(cube(yellow, (0, 0, 0.6), (0.4, 0.4, 0.15)))
    return ps

PROPS = [('GearStack', gear_stack), ('AntennaTower', antenna), ('TechCrate', crate), ('CopperPipes', pipes),
         ('BrokenRobotHead', robot_head), ('GiantBattery', battery), ('RoboLamp', robo_lamp)]
