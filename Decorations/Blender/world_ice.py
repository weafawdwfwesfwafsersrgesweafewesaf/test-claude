# Monde GLACE : cristaux, neige, sapins givrés
import math, random
from kit import *

TITLE = 'Ice'
SHOT = dict(bg=(0.35, 0.55, 0.75), floor=(0.82, 0.9, 0.97), light_col=(1, 0.97, 0.92), sun=2.6)

snow = color('snow', '#f2f8ff'); snow2 = color('snow2', '#d4e4f2'); ice = color('ice', '#8fd8ff'); ice2 = color('ice2', '#bfeaff')
icedeep = color('icedeep', '#3f8fd6'); iceglow = color('iceglow', '#7ff4ff', glow=True)
pine = color('pine', '#1f5b4a'); pine2 = color('pine2', '#2b7a5f'); bark = color('bark', '#5a3d2b')
coal = color('coal', '#1c1c22'); carrot = color('carrot', '#ff8a1e'); scarf = color('scarf', '#e0303a')
stone = color('stone', '#7d8a99'); metal = color('metal', '#3a4656'); warm = color('warmlight', '#ffd27a', glow=True)

def rock(c, loc, r, seed, sq=0.75):
    return jitter(ball(c, loc, r, 1, scl=(1, 0.9, sq)), r * 0.28, 1.4 / r, seed)

def crystal(c, base, h, r, tilt, spin):
    o = join([cyl(c, (0, 0, h / 2), r, h, 6), cone(c, (0, 0, h + r * 0.9), r, r * 1.8, 6)], 'cr')
    return place(o, (tilt, 0, spin), base)

def ice_crystals():
    ps = [jitter(ball(snow2, (0, 0, 0.2), 2.0, 1, scl=(1, 1, 0.3)), 0.2, 0.8, 1)]
    ps.append(crystal(iceglow, (0, 0, 0.2), 4.2, 0.55, 0, 15))
    for i, (tilt, spin, h, r, c) in enumerate(((30, 0, 3.0, 0.55, ice), (34, 70, 2.3, 0.45, ice2), (24, 140, 3.4, 0.6, icedeep),
                                                (38, 210, 1.9, 0.4, ice), (28, 285, 2.6, 0.5, ice2))):
        a = math.radians(spin + 90)
        ps.append(crystal(c, (math.cos(a) * 0.6, math.sin(a) * 0.6, 0.2), h, r, tilt, spin))
    return ps

def snowy_pine():
    ps = [cyl(bark, (0, 0, 0.8), 0.35, 1.6, 6)]
    for i, (z, r, h) in enumerate(((1.4, 2.4, 2.6), (2.9, 1.9, 2.3), (4.2, 1.35, 2.0), (5.3, 0.8, 1.6))):
        ps.append(jitter(cone(pine if i % 2 else pine2, (0, 0, z + h / 2), r, h, 8), 0.08, 1.3, 10 + i))
        # neige posée sur chaque étage
        ps.append(jitter(cone(snow, (0, 0, z + h * 0.62), r * 0.72, h * 0.62, 8, rot=(0, 0, 22.5)), 0.06, 1.3, 20 + i))
    ps.append(jitter(cyl(snow, (0, 0, 0.1), 2.3, 0.2, 9, r2=1.9), 0.15, 0.8, 30))
    return ps

def snowman():
    ps = [uvball(snow, (0, 0, 1.2), 1.3, 12, 7), uvball(snow, (0, 0, 2.95), 0.95, 12, 7), uvball(snow, (0, 0, 4.35), 0.68, 12, 7)]
    ps.append(cone(carrot, (0, -0.95, 4.35), 0.12, 0.8, 6, rot=(90, 0, 0)))
    for x in (-0.24, 0.24):
        ps.append(ball(coal, (x, -0.6, 4.55), 0.09, 0))
    for z in (2.6, 3.0, 3.4):
        ps.append(ball(coal, (0, -0.93, z), 0.1, 0))
    ps.append(torus(scarf, (0, 0, 3.8), 0.66, 0.16, 12, 5))
    ps.append(cube(scarf, (0.35, -0.55, 3.35), (0.28, 0.12, 0.8), rot=(12, 0, 8)))
    ps.append(cyl(coal, (0, 0, 4.95), 0.7, 0.1, 10))
    ps.append(cyl(coal, (0, 0, 5.4), 0.45, 0.85, 10))
    ps.append(cyl(scarf, (0, 0, 5.1), 0.46, 0.14, 10))
    for side in (-1, 1):  # bras en bois
        arm = cyl(bark, (0, 0, 0.75), 0.07, 1.5, 5)
        ps.append(place(arm, (0, side * 60, 0), (side * 0.85, 0, 3.1)))
        ps.append(place(cyl(bark, (0, 0, 0.25), 0.05, 0.5, 5), (0, side * 20, 0), (side * 1.9, 0, 3.75)))
    return ps

def snow_rocks():
    ps = [rock(stone, (0, 0, 1.0), 1.6, 40), rock(stone, (1.8, 0.7, 0.6), 1.0, 41), rock(stone, (-1.3, 1.0, 0.45), 0.7, 42)]
    ps.append(jitter(ball(snow, (0, 0, 1.8), 1.35, 1, scl=(1, 0.95, 0.35)), 0.12, 1.2, 43))
    ps.append(jitter(ball(snow, (1.8, 0.7, 1.15), 0.85, 1, scl=(1, 0.95, 0.3)), 0.08, 1.5, 44))
    ps.append(jitter(cyl(snow2, (0.3, 0.3, 0.08), 2.9, 0.16, 10, r2=2.5), 0.2, 0.7, 45))
    return ps

def ice_arch():
    ps = []
    n = 9
    for i in range(n):  # blocs de glace en arc (on peut passer dessous à vélo)
        a = math.pi * i / (n - 1)
        x, z = math.cos(a) * 5.0, math.sin(a) * 5.0 + 0.9
        blk = cube(ice if i % 2 else ice2, (0, 0, 0), (1.5, 1.6, 1.25))
        ps.append(jitter(place(blk, (0, math.degrees(math.pi / 2 - a), 0), (x, 0, z)), 0.1, 1.3, 50 + i))
    for x in (-5, 5):
        ps.append(jitter(cube(icedeep, (x, 0, 0.45), (2.0, 2.0, 0.9)), 0.1, 1.2, 60 + x))
    ps.append(crystal(iceglow, (0, 0, 6.3), 1.1, 0.35, 0, 0))
    for i in range(7):  # stalactites sous l'arche
        a = math.pi * (i + 1) / 8
        ps.append(cone(ice2, (math.cos(a) * 4.2, 0, math.sin(a) * 4.2 + 0.2), 0.18, 0.9, 5, rot=(180, 0, 0)))
    return ps

def igloo():
    ps = []
    rows = 5
    for r in range(rows):  # blocs de neige en anneaux
        el0, el1 = r / rows * math.pi / 2, (r + 1) / rows * math.pi / 2 * 0.97
        rad = 2.8
        n = max(4, int(14 * math.cos(el0)))
        for k in range(n):
            if r < 2 and k == 0:
                continue  # entrée
            a = (k + (r % 2) * 0.5) / n * math.tau
            elm = (el0 + el1) / 2
            blk = cube(snow if (k + r) % 3 else snow2, (0, 0, 0), (0.55, 2 * math.pi * rad * math.cos(elm) / n * 0.96, rad * (el1 - el0) * 0.96))
            ps.append(place(blk, (0, -math.degrees(elm), math.degrees(a)), (math.cos(a) * rad * math.cos(elm), math.sin(a) * rad * math.cos(elm), rad * math.sin(elm))))
    ps.append(ball(snow, (0, 0, 2.7), 0.4, 1, scl=(1, 1, 0.5)))
    tunnel = cyl(snow2, (0, 0, 0), 1.0, 1.6, 8, rot=(0, 90, 0))
    ps.append(move(tunnel, (3.1, 0, 0.75)))
    ps.append(move(cube(coal, (0, 0, 0), (0.1, 1.2, 1.1)), (3.92, 0, 0.6)))
    ps.append(move(cube(warm, (0, 0, 0), (0.05, 0.9, 0.8)), (3.97, 0, 0.55)))
    return ps

def frozen_lamp():
    ps = [cyl(metal, (0, 0, 0.15), 0.6, 0.3, 8), cyl(metal, (0, 0, 2.4), 0.14, 4.5, 6), cyl(metal, (0, 0, 4.7), 0.5, 0.15, 8)]
    ps.append(cyl(iceglow, (0, 0, 5.2), 0.42, 0.85, 6))
    ps.append(cone(metal, (0, 0, 5.85), 0.6, 0.45, 6))
    ps.append(jitter(cone(snow, (0, 0, 6.02), 0.45, 0.25, 6), 0.05, 2, 70))
    for i in range(5):  # glaçons sous le chapeau
        a = i / 5 * math.tau
        ps.append(cone(ice2, (math.cos(a) * 0.5, math.sin(a) * 0.5, 5.45), 0.07, 0.4, 4, rot=(180, 0, 0)))
    ps.append(jitter(cyl(snow, (0, 0, 0.05), 1.0, 0.12, 8, r2=0.8), 0.08, 1.5, 71))
    return ps

PROPS = [('IceCrystals', ice_crystals), ('SnowyPine', snowy_pine), ('Snowman', snowman), ('SnowRocks', snow_rocks),
         ('IceArch', ice_arch), ('Igloo', igloo), ('FrozenLamp', frozen_lamp)]
