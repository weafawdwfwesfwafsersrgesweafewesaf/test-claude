# Monde DRAGON : rouge, or, pierre sculptée
import math, random
from kit import *

TITLE = 'Dragon'
SHOT = dict(bg=(0.28, 0.07, 0.06), floor=(0.2, 0.1, 0.08), light_col=(1, 0.88, 0.72), sun=2.4)

red = color('dragonred', '#c4202e'); red2 = color('dragonred2', '#8e1422'); gold = color('gold', '#f2b632'); gold2 = color('gold2', '#c98b1c')
jade = color('jade', '#2f9e7a'); rock = color('dragonstone', '#6f6259'); rock2 = color('dragonstone2', '#4b413b')
scale = color('scalegreen', '#3f7d3a'); egg = color('eggshell', '#e9d9b8'); ember = color('fireglow', '#ff7a1a', glow=True)
paper = color('lanternglow', '#ff4a3a', glow=True); wood = color('darkwood', '#4a2a1c')

def rock_(c, loc, r, seed, sq=0.75):
    return jitter(ball(c, loc, r, 1, scl=(1, 0.9, sq)), r * 0.28, 1.4 / r, seed)

def dragon_egg():
    e = uvball(scale, (0, 0, 0), 1.0, 10, 8, scl=(1, 1, 1.45))
    ps = [move(e, (0, 0, 2.1))]
    random.seed(2)
    for i in range(10):  # écailles / taches dorées
        a = random.uniform(0, math.tau); z = random.uniform(-0.9, 1.0)
        rr = math.sqrt(max(0.05, 1 - (z / 1.45) ** 2))
        ps.append(ball(gold, (math.cos(a) * rr, math.sin(a) * rr, 2.1 + z), 0.16, 0))
    for i in range(10):  # nid de branches
        a = i / 10 * math.tau
        p1 = (math.cos(a) * 1.7, math.sin(a) * 1.7, 0.5)
        p2 = (math.cos(a + 1.3) * 1.5, math.sin(a + 1.3) * 1.5, 0.9 + (i % 3) * 0.12)
        ps.append(seg(wood, p1, p2, 0.14, 5))
    ps.append(jitter(torus(wood, (0, 0, 0.55), 1.5, 0.45, 12, 5), 0.12, 1.5, 3))
    ps.append(cyl(ember, (0, 0, 0.6), 1.1, 0.1, 10))
    return ps

def gold_pile():
    random.seed(5)
    ps = [jitter(cone(gold2, (0, 0, 0.6), 2.4, 1.2, 12), 0.1, 1.2, 1)]
    for i in range(34):
        a = random.uniform(0, math.tau); r = random.uniform(0, 2.3)
        z = 0.02 + max(0, 1.2 * (1 - r / 2.4)) + 0.02
        c = cyl(gold, (0, 0, 0), 0.28, 0.07, 8)
        ps.append(place(c, (random.uniform(-25, 25), random.uniform(-25, 25), 0), (math.cos(a) * r, math.sin(a) * r, z)))
    ps.append(place(uvball(red, (0, 0, 0), 0.4, 8, 6), (0, 0, 0), (0.3, -0.2, 1.3)))  # rubis
    ps.append(place(cone(jade, (0, 0, 0), 0.35, 0.8, 6), (20, 0, 0), (-0.8, 0.5, 1.1)))
    return ps

def treasure_chest():
    ps = [cube(red2, (0, 0, 0.75), (2.8, 1.8, 1.5))]
    lid = cyl(red, (0, 0, 0), 0.9, 2.8, 10, rot=(0, 90, 0))
    for v in lid.data.vertices:
        if v.co.z < 0:
            v.co.z = 0
    ps.append(move(lid, (0, 0, 1.5)))
    for x in (-1.1, 0, 1.1):  # cerclages dorés
        ps.append(cube(gold, (x, 0, 0.75), (0.2, 1.85, 1.55)))
        band = torus(gold, (0, 0, 0), 0.92, 0.08, 10, 3, rot=(0, 90, 0))
        for v in band.data.vertices:
            if v.co.z < 0:
                v.co.z = 0
        ps.append(move(band, (x, 0, 1.5)))
    ps.append(cube(gold, (0, -0.95, 1.35), (0.45, 0.12, 0.55)))
    ps.append(cube(ember, (0, 0, 1.52), (2.5, 1.5, 0.05)))  # lueur qui s'échappe
    return ps

def dragon_pillar():
    ps = [cube(rock2, (0, 0, 0.3), (2.2, 2.2, 0.6)), cyl(rock, (0, 0, 3.3), 0.75, 5.4, 8), cube(rock2, (0, 0, 6.2), (2.0, 2.0, 0.5))]
    pts = []
    for i in range(40):  # dragon enroulé autour de la colonne
        t = i / 39
        a = t * math.tau * 2.2
        pts.append((math.cos(a) * 0.95, math.sin(a) * 0.95, 0.8 + t * 5.0))
    for i in range(len(pts) - 1):
        r = 0.32 * (1 - i / len(pts)) + 0.1
        ps.append(seg(red if i % 4 else gold, pts[i], pts[i + 1], r, 6))
    head = pts[-1]
    ps.append(ball(red, head, 0.42, 1, scl=(1.3, 1, 0.9)))
    for s in (-1, 1):
        ps.append(seg(gold, (head[0], head[1] + 0.15 * s, head[2] + 0.2), (head[0] - 0.4, head[1] + 0.35 * s, head[2] + 0.8), 0.07, 4))
    ps.append(ball(ember, (head[0] + 0.25, head[1] - 0.3, head[2] + 0.1), 0.1, 0))
    ps.append(cyl(ember, (0, 0, 6.55), 0.5, 0.2, 8))
    return ps

def lantern():
    ps = [seg(wood, (0, 0, 0), (0, 0, 5.2), 0.14, 6), seg(wood, (0, 0, 5.0), (1.5, 0, 5.0), 0.1, 5)]
    body = uvball(paper, (0, 0, 0), 0.7, 10, 6, scl=(1, 1, 1.25))
    ps.append(move(body, (1.5, 0, 3.7)))
    for z in (4.55, 2.85):
        ps.append(cyl(gold, (1.5, 0, z), 0.45, 0.18, 10))
    for i in range(4):
        a = i / 4 * math.tau
        ps.append(seg(gold, (1.5 + math.cos(a) * 0.1, math.sin(a) * 0.1, 2.75), (1.5 + math.cos(a) * 0.12, math.sin(a) * 0.12, 2.2), 0.03, 3))
    ps.append(seg(gold, (1.5, 0, 4.65), (1.5, 0, 5.0), 0.04, 4))
    ps.append(cube(rock2, (0, 0, 0.2), (1.0, 1.0, 0.4)))
    return ps

def claw_orb():
    ps = [rock_(rock2, (0, 0, 0.4), 1.4, 7, sq=0.4)]
    for i in range(4):  # griffes qui tiennent une orbe
        a = i / 4 * math.tau
        pts = [(math.cos(a) * 1.0, math.sin(a) * 1.0, 0.6), (math.cos(a) * 1.25, math.sin(a) * 1.25, 1.8),
               (math.cos(a) * 0.95, math.sin(a) * 0.95, 2.8), (math.cos(a) * 0.45, math.sin(a) * 0.45, 3.3)]
        for j in range(3):
            ps.append(seg(red2, pts[j], pts[j + 1], 0.22 - j * 0.05, 6))
        ps.append(place(cone(gold, (0, 0, 0.3), 0.14, 0.6, 5), (0, 0, 0), pts[3]))
    ps.append(ball(ember, (0, 0, 2.3), 0.85, 2))
    return ps

PROPS = [('DragonEgg', dragon_egg), ('GoldPile', gold_pile), ('TreasureChest', treasure_chest), ('DragonPillar', dragon_pillar),
         ('DragonLantern', lantern), ('ClawOrb', claw_orb)]
