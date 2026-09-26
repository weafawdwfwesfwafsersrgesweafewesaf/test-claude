# Monde RETRO : années 80, néons roses et cyan, arcade
import math, random
from kit import *

TITLE = 'Retro'
SHOT = dict(bg=(0.12, 0.04, 0.2), floor=(0.1, 0.05, 0.16), light_col=(1, 0.8, 0.95), sun=1.9)

pinkn = color('neonpink', '#ff2fb4', glow=True); cyann = color('neoncyan', '#27e8ff', glow=True); yel = color('neonyellow', '#ffe53b', glow=True)
purple = color('retropurple', '#4b2a7a'); purple2 = color('retropurple2', '#2c1a4a'); black = color('retroblack', '#1a1622'); chrome = color('chrome', '#b9c0cc')
orange = color('sunset', '#ff7a3a'); palmtrunk = color('palmtrunk', '#8a5a3a'); palm = color('palmleaf', '#2fae78'); screen = color('screenglow', '#6b5cff', glow=True)
cream = color('retrocream', '#efe3cf')

def arcade():
    ps = [cube(purple, (0, 0, 2.2), (1.8, 1.6, 4.4))]
    ps.append(place(cube(black, (0, 0, 0), (1.6, 0.1, 1.3)), (20, 0, 0), (0, -0.78, 2.85)))
    ps.append(place(cube(screen, (0, 0, 0), (1.35, 0.05, 1.05)), (20, 0, 0), (0, -0.84, 2.85)))
    ps.append(place(cube(purple2, (0, 0, 0), (1.8, 0.9, 0.2)), (-30, 0, 0), (0, -1.05, 1.95)))  # panneau de contrôle
    ps.append(seg(black, (-0.4, -1.1, 2.0), (-0.4, -1.15, 2.35), 0.05, 4))
    ps.append(ball(pinkn, (-0.4, -1.15, 2.4), 0.12, 0))
    for i, c in enumerate((cyann, yel, pinkn)):
        ps.append(cyl(c, (0.1 + i * 0.25, -1.1, 2.08), 0.08, 0.08, 6, rot=(-30, 0, 0)))
    ps.append(cube(pinkn, (0, -0.75, 4.1), (1.7, 0.1, 0.5)))  # enseigne
    for x in (-0.92, 0.92):
        ps.append(cube(cyann, (x, 0, 2.2), (0.05, 1.62, 4.3)))
    ps.append(cube(black, (0, -0.81, 0.8), (0.5, 0.05, 0.3)))
    return ps

def neon_palm():
    ps = []
    pts = [(0.02 * i * i, 0, i * 0.7) for i in range(10)]
    for i in range(9):
        ps.append(seg(palmtrunk, pts[i], pts[i + 1], 0.3 - i * 0.015, 7))
        if i % 2 == 0:
            ps.append(torus(pinkn, (pts[i][0], 0, pts[i][2] + 0.35), 0.29 - i * 0.015, 0.035, 8, 3))
    top = pts[-1]
    for k in range(7):  # palmes
        a = k / 7 * math.tau
        leaf = cube(palm, (0, 0, 0), (2.6, 0.7, 0.08))
        for v in leaf.data.vertices:  # palme qui pend
            t = (v.co.x + 1.3) / 2.6
            v.co.z -= t * t * 1.9
            v.co.y *= 1 - t * 0.7
        move(leaf, (1.3, 0, 0))
        ps.append(place(leaf, (0, -8, math.degrees(a)), (top[0], 0, top[2])))
        ps.append(place(cube(cyann, (0.6, 0, 0.1), (1.1, 0.06, 0.03)), (0, -8, math.degrees(a)), (top[0], 0, top[2])))
    for i in range(3):
        ps.append(ball(orange, (top[0] + math.cos(i * 2.1) * 0.35, math.sin(i * 2.1) * 0.35, top[2] - 0.3), 0.25, 1))
    ps.append(cyl(purple2, (0, 0, 0.1), 1.0, 0.2, 8))
    return ps

def boombox():
    ps = [cube(black, (0, 0, 1.1), (4.0, 1.2, 2.0)), cube(chrome, (0, 0, 2.2), (3.4, 0.4, 0.2))]
    ps.append(seg(chrome, (-1.7, 0, 2.2), (-1.7, 0, 2.7), 0.1, 6)); ps.append(seg(chrome, (1.7, 0, 2.2), (1.7, 0, 2.7), 0.1, 6))
    ps.append(seg(chrome, (-1.7, 0, 2.7), (1.7, 0, 2.7), 0.12, 6))
    for x in (-1.2, 1.2):  # haut-parleurs
        ps.append(cyl(chrome, (x, -0.6, 1.05), 0.75, 0.1, 14, rot=(90, 0, 0)))
        ps.append(cyl(purple2, (x, -0.65, 1.05), 0.6, 0.1, 14, rot=(90, 0, 0)))
        ps.append(cyl(pinkn, (x, -0.7, 1.05), 0.2, 0.1, 10, rot=(90, 0, 0)))
    ps.append(cube(cyann, (0, -0.61, 1.45), (0.9, 0.05, 0.4)))
    ps.append(cube(chrome, (0, -0.61, 0.8), (0.9, 0.05, 0.5)))
    for i in range(5):
        ps.append(cube(yel if i == 2 else chrome, (-0.6 + i * 0.3, -0.2, 2.13), (0.2, 0.3, 0.1)))
    return ps

def retro_tv():
    ps = [cube(cream, (0, 0, 2.2), (3.0, 2.2, 2.4)), cube(palmtrunk, (0, 0, 0.9), (3.2, 2.4, 0.2))]
    for x in (-1.3, 1.3):
        for y in (-0.9, 0.9):
            ps.append(seg(black, (x, y, 0.8), (x * 1.15, y * 1.15, 0), 0.07, 4))
    ps.append(cube(black, (-0.35, -1.1, 2.2), (2.0, 0.05, 1.8)))
    ps.append(cube(screen, (-0.35, -1.13, 2.2), (1.75, 0.05, 1.55)))
    for z in (2.7, 2.2):
        ps.append(cyl(black, (1.05, -1.15, z), 0.18, 0.12, 8, rot=(90, 0, 0)))
    ps.append(seg(chrome, (0.3, 0, 3.4), (1.2, 0.3, 4.6), 0.04, 4)); ps.append(seg(chrome, (-0.3, 0, 3.4), (-1.1, -0.2, 4.7), 0.04, 4))
    ps.append(ball(chrome, (0, 0, 3.4), 0.25, 1))
    return ps

def cassette():
    ps = [cube(black, (0, 0, 0), (5.0, 0.5, 3.2)), cube(pinkn, (0, -0.26, 0.55), (4.2, 0.05, 1.1)), cube(cream, (0, -0.26, -0.5), (3.6, 0.05, 1.3))]
    for x in (-1.0, 1.0):
        ps.append(cyl(chrome, (x, -0.3, -0.5), 0.45, 0.08, 10, rot=(90, 0, 0)))
        ps.append(cyl(black, (x, -0.33, -0.5), 0.25, 0.08, 6, rot=(90, 0, 0)))
    ps.append(cube(purple2, (0, -0.28, -1.35), (2.4, 0.05, 0.5)))
    o = join(ps, 'cas')
    return [place(o, (0, 0, 20), (0, 0, 1.7))]  # posée debout, légèrement tournée

def neon_sign():
    ps = [seg(chrome, (-1.6, 0, 0), (-1.6, 0, 4.0), 0.1, 6), seg(chrome, (1.6, 0, 0), (1.6, 0, 4.0), 0.1, 6)]
    ps.append(cube(purple2, (0, 0, 5.2), (4.4, 0.3, 2.6)))
    ps.append(place(torus(pinkn, (0, 0, 0), 1.0, 0.08, 16, 4), (90, 0, 0), (0, -0.2, 5.2)))  # soleil synthwave
    for i, z in enumerate((4.7, 5.0, 5.3)):
        ps.append(cube(orange if i else yel, (0, -0.18, z), (1.7 - i * 0.25, 0.04, 0.12)))
    for i in range(6):
        x = -1.9 + i * 0.76
        ps.append(cube(cyann, (x, -0.18, 4.05), (0.04, 0.04, 0.2)))
    ps.append(cube(cyann, (0, -0.18, 4.0), (4.2, 0.04, 0.06)))
    ps.append(cube(cyann, (0, -0.18, 6.45), (4.2, 0.04, 0.06)))
    return ps

PROPS = [('ArcadeCabinet', arcade), ('NeonPalm', neon_palm), ('Boombox', boombox), ('RetroTV', retro_tv),
         ('GiantCassette', cassette), ('SynthwaveSign', neon_sign)]
