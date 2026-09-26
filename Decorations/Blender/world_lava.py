# Monde LAVE : basalte, obsidienne, magma
import math, random
from kit import *

TITLE = 'Lava'
SHOT = dict(bg=(0.12, 0.03, 0.015), floor=(0.035, 0.022, 0.02), light_col=(1, 0.8, 0.65), sun=1.8)

basalt = color('basalt', '#2e2828'); basalt2 = color('basalt2', '#433836'); ash = color('ash', '#6b5f5a')
lava = color('lava', '#ff4d12', glow=True); lavay = color('lavay', '#ffb020', glow=True)
obs = color('obsidian', '#1b1426'); obs2 = color('obsidian2', '#34244d'); char = color('charcoal', '#1d1715')

def rock(c, loc, r, seed, sq=0.75, sub=1):
    o = ball(c, loc, r, sub, scl=(1, 0.9, sq))
    return jitter(o, r * 0.28, 1.4 / r, seed)

def volcanic_rocks():
    random.seed(1)
    ps = [rock(basalt, (0, 0, 1.3), 1.9, 1), rock(basalt2, (2.1, 0.6, 0.8), 1.2, 2), rock(basalt, (-1.6, 1.1, 0.6), 0.9, 3),
          rock(ash, (1.0, -1.6, 0.4), 0.6, 4)]
    # veines de magma qui sortent entre les roches
    ps.append(jitter(cyl(lava, (0.9, 0.2, 0.08), 1.3, 0.16, 9, r2=1.0), 0.15, 1.2, 5))
    for i in range(5):
        a = random.uniform(0, math.tau)
        ps.append(ball(lavay, (math.cos(a) * 2.6, math.sin(a) * 2.2, 0.15), 0.18, 0))
    return ps

def lava_pool():
    random.seed(2)
    ps = [jitter(cyl(lava, (0, 0, 0.12), 3.2, 0.24, 14, r2=3.0), 0.3, 0.6, 7)]
    ps.append(jitter(cyl(lavay, (0.4, -0.3, 0.26), 1.3, 0.06, 9, r2=1.1), 0.2, 0.9, 8))
    # croûtes de roche refroidie qui flottent sur la lave
    for i, (x, y, r) in enumerate(((-1.4, 0.9, 0.7), (1.6, 1.2, 0.5), (-0.6, -1.7, 0.55), (2.0, -0.9, 0.35))):
        ps.append(jitter(cyl(basalt, (x, y, 0.27), r, 0.12, 6, r2=r * 0.8), 0.12, 1.5, 70 + i))
    for i in range(11):
        a = i / 11 * math.tau + random.uniform(-0.2, 0.2)
        r = 3.4 + random.uniform(-0.2, 0.3)
        ps.append(rock(random.choice((basalt, basalt2, ash)), (math.cos(a) * r, math.sin(a) * r, 0.35), random.uniform(0.45, 0.8), 10 + i))
    return ps

def crystal(c, base, h, r, tilt, spin):
    o = join([cyl(c, (0, 0, h / 2), r, h, 6), cone(c, (0, 0, h + r * 0.9), r, r * 1.8, 6)], 'cr')
    return place(o, (tilt, 0, spin), base)

def obsidian_crystals():
    ps = [rock(basalt, (0, 0, 0.3), 1.6, 20, sq=0.35)]
    ps.append(crystal(lava, (0, 0, 0.2), 3.6, 0.42, 0, 0))
    for i, (tilt, spin, h, r, c) in enumerate(((28, 0, 3.2, 0.55, obs), (32, 80, 2.4, 0.45, obs2), (25, 160, 3.4, 0.6, obs),
                                                (38, 230, 1.9, 0.38, obs2), (30, 300, 2.7, 0.5, obs))):
        ps.append(crystal(c, (math.cos(math.radians(spin + 90)) * 0.5, math.sin(math.radians(spin + 90)) * 0.5, 0.2), h, r, tilt, spin))
    return ps

def branch(c, start, length, r, tilt, spin, bend_amt=0.25):
    o = bend(cyl(c, (0, 0, length / 2), r, length, 6, r2=r * 0.35), bend_amt)
    return place(o, (tilt, 0, spin), start)

def charred_tree():
    ps = [bend(cyl(char, (0, 0, 3), 0.55, 6, 7, r2=0.22), 0.12)]
    ps.append(jitter(cyl(char, (0, 0, 0.3), 1.0, 0.6, 7, r2=0.55), 0.1, 1, 30))
    tips = []
    for (z, L, tilt, spin) in ((2.8, 3.2, 48, 20), (3.9, 2.8, 42, 145), (4.8, 2.4, 38, 260), (2.2, 2.2, 58, 215), (5.7, 2.0, 22, 80)):
        b = branch(char, (0.1, 0, z), L, 0.2, tilt, spin, 0.3)
        ps.append(b)
        tips.append(far_point(b, (0.1, 0, z)))
    for i, p in enumerate(tips):  # braises au bout des branches
        ps.append(ball(lava if i % 2 else lavay, p, 0.16, 0))
    ps.append(jitter(cyl(lava, (0.35, 0.2, 1.4), 0.12, 1.3, 5), 0.05, 2, 31))  # fissure incandescente
    return ps

def mini_volcano():
    random.seed(4)
    body = jitter(cyl(basalt, (0, 0, 1.6), 3.2, 3.2, 12, r2=1.2), 0.3, 0.7, 40)
    rim = jitter(torus(basalt2, (0, 0, 3.2), 1.2, 0.35, 12, 5), 0.12, 1.5, 41)
    ps = [body, rim, cyl(lava, (0, 0, 3.1), 1.0, 0.2, 12), ball(lavay, (0, 0, 3.4), 0.5, 1, scl=(1, 1, 0.5))]
    for i in range(4):  # coulées de lave
        a = i / 4 * math.tau + 0.4
        flow = cube(lava, (0, 0, 0), (0.16, 0.55, 3.0))
        taper(flow, 1.6)
        ps.append(jitter(place(flow, (0, -32, math.degrees(a)), (math.cos(a) * 2.28, math.sin(a) * 2.28, 1.75)), 0.06, 2, 42 + i))
    for i in range(6):
        a = random.uniform(0, math.tau)
        ps.append(rock(ash, (math.cos(a) * 3.4, math.sin(a) * 3.4, 0.25), random.uniform(0.3, 0.55), 50 + i))
    return ps

def brazier():
    ps = [cyl(basalt2, (0, 0, 0.3), 1.0, 0.6, 8), cyl(basalt, (0, 0, 1.8), 0.55, 2.4, 8, r2=0.45),
          cyl(basalt2, (0, 0, 3.2), 0.7, 0.4, 8, r2=1.1), cyl(basalt, (0, 0, 3.5), 1.1, 0.25, 8)]
    for i in range(4):  # griffes
        a = i / 4 * math.tau + math.pi / 4
        ps.append(cone(obs2, (math.cos(a) * 1.0, math.sin(a) * 1.0, 3.95), 0.2, 0.9, 5, rot=(math.degrees(math.sin(a)) * -0.4, math.degrees(math.cos(a)) * 0.4, 0)))
    f1 = jitter(cone(lava, (0, 0, 4.4), 0.8, 1.9, 7), 0.12, 1.5, 60)
    f2 = jitter(cone(lavay, (0.1, 0, 4.2), 0.45, 1.3, 6), 0.08, 2, 61)
    return ps + [f1, f2]

PROPS = [('LavaRocks', volcanic_rocks), ('LavaPool', lava_pool), ('ObsidianCrystals', obsidian_crystals),
         ('CharredTree', charred_tree), ('MiniVolcano', mini_volcano), ('LavaBrazier', brazier)]
