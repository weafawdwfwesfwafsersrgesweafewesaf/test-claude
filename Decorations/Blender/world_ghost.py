# Monde FANTÔME : brume violette, lueurs vertes, bois tordu
import math, random
from kit import *
from mathutils import Matrix

TITLE = 'Ghost'
SHOT = dict(bg=(0.1, 0.12, 0.2), floor=(0.13, 0.14, 0.2), light_col=(0.78, 0.85, 1), sun=1.9)

ghostc = color('ghostwhite', '#dff4ff', glow=True); spirit = color('spiritgreen', '#58ffb0', glow=True); lantern = color('ghostlantern', '#9dff5a', glow=True)
deadwood = color('deadwood', '#3a3040'); deadwood2 = color('deadwood2', '#524458'); fence = color('oldwood', '#6a5a52'); iron = color('ghostiron', '#2a2c33')
pumpkin = color('pumpkin', '#ff8a1f'); stem = color('pumpkinstem', '#4f6b2a'); candle = color('pumpkinglow', '#ffcf4a', glow=True)
brew = color('brew', '#b04dff', glow=True); stone = color('ghoststone', '#5f6275'); eyes = color('ghosteyes', '#1a1830')

def ghost():
    body = uvball(ghostc, (0, 0, 0), 1.2, 12, 8, scl=(1, 1, 1.25))
    for v in body.data.vertices:  # traîne ondulée en bas
        if v.co.z < 0:
            a = math.atan2(v.co.y, v.co.x)
            v.co.z = v.co.z * 1.8 + math.sin(a * 5) * 0.2
            v.co.x *= 1 + (-v.co.z) * 0.12
            v.co.y *= 1 + (-v.co.z) * 0.12
    ps = [move(body, (0, 0, 3.4))]
    for x in (-0.38, 0.38):
        ps.append(uvball(eyes, (x, -1.08, 3.75), 0.2, 6, 4, scl=(1, 0.5, 1.4)))
    ps.append(uvball(eyes, (0, -1.1, 3.25), 0.22, 6, 4, scl=(1, 0.5, 0.8)))
    for s in (-1, 1):  # petits bras
        ps.append(place(uvball(ghostc, (0, 0, 0), 0.3, 6, 4, scl=(1.8, 0.8, 0.8)), (0, s * 30, 0), (s * 1.3, -0.1, 3.1)))
    for i in range(3):
        a = i / 3 * math.tau
        ps.append(ball(spirit, (math.cos(a) * 1.8, math.sin(a) * 1.8, 1.3 + i * 0.6), 0.16, 1))
    return ps

def haunted_tree():
    random.seed(3)
    pts = [(0, 0, 0), (0.3, 0.1, 1.6), (-0.2, 0.2, 3.2), (0.4, -0.1, 4.6), (0.1, 0, 5.8)]
    ps = []
    for i in range(4):
        ps.append(seg(deadwood, pts[i], pts[i + 1], 0.7 - i * 0.14, 7, r2=0.6 - i * 0.14))
    for i in range(5):  # racines
        a = i / 5 * math.tau
        ps.append(seg(deadwood2, (math.cos(a) * 0.3, math.sin(a) * 0.3, 0.6), (math.cos(a) * 1.6, math.sin(a) * 1.6, 0), 0.22, 5))
    def br(p, d, L, r, depth):
        e = (p[0] + d[0] * L, p[1] + d[1] * L, p[2] + d[2] * L)
        ps.append(seg(deadwood if depth % 2 else deadwood2, p, e, r, 5, r2=r * 0.6))
        if depth < 2:
            for s in (-1, 1):
                nd = (d[0] + s * 0.6 * -d[1], d[1] + s * 0.6 * d[0], d[2] + 0.35)
                n = math.sqrt(sum(c * c for c in nd))
                br(e, tuple(c / n for c in nd), L * 0.65, r * 0.6, depth + 1)
        else:
            ps.append(ball(spirit, e, 0.12, 0))
    for (p, d) in ((pts[2], (0.9, 0.2, 0.4)), (pts[3], (-0.8, 0.4, 0.45)), (pts[4], (0.3, -0.8, 0.5))):
        n = math.sqrt(sum(c * c for c in d))
        br(p, tuple(c / n for c in d), 2.0, 0.28, 0)
    # visage creux dans le tronc
    for x in (-0.25, 0.25):
        ps.append(uvball(spirit, (x + 0.1, -0.52, 2.5), 0.14, 6, 4, scl=(1, 0.5, 1.4)))
    ps.append(uvball(eyes, (0.1, -0.55, 2.0), 0.25, 6, 4, scl=(1.3, 0.5, 0.7)))
    return ps

def broken_fence():
    ps = []
    random.seed(8)
    for i in range(5):
        x = -4 + i * 2
        h = random.uniform(2.2, 3.0)
        post = cube(fence, (0, 0, h / 2), (0.35, 0.35, h))
        ps.append(place(post, (random.uniform(-8, 8), random.uniform(-6, 6), 0), (x, 0, 0)))
        ps.append(cone(fence, (x, 0, h + 0.25), 0.3, 0.5, 4, rot=(0, 0, 45)))
    for z in (0.9, 1.9):
        for i in range(4):
            if (i, z) == (2, 1.9):
                continue  # planche cassée
            x = -3 + i * 2
            ps.append(place(cube(fence, (0, 0, 0), (1.9, 0.12, 0.3)), (0, random.uniform(-6, 6), 0), (x, -0.25, z)))
    ps.append(place(cube(fence, (0, 0, 0), (1.9, 0.12, 0.3)), (0, 35, 0), (1.2, -0.3, 0.6)))
    ps.append(seg(iron, (-4, -0.2, 2.4), (-3.3, -0.2, 2.9), 0.04, 4))
    ps.append(cube(lantern, (-3.3, -0.2, 2.65), (0.3, 0.3, 0.4)))
    return ps

def jack_o_lantern():
    body = uvball(pumpkin, (0, 0, 0), 1.3, 12, 8, scl=(1.15, 1.15, 0.85))
    for v in body.data.vertices:  # côtes de citrouille
        a = math.atan2(v.co.y, v.co.x)
        k = 1 + 0.07 * math.cos(a * 6)
        v.co.x *= k; v.co.y *= k
    ps = [move(body, (0, 0, 1.15))]
    ps.append(seg(stem, (0, 0, 2.0), (0.15, 0.05, 2.6), 0.14, 5))
    for x in (-0.45, 0.45):  # yeux et bouche lumineux
        ps.append(cone(candle, (x, -1.28, 1.45), 0.26, 0.2, 3, rot=(90, 0, 0)))
    ps.append(place(cube(candle, (0, 0, 0), (1.0, 0.2, 0.28)), (0, 0, 0), (0, -1.33, 0.8)))
    ps.append(place(cube(pumpkin, (0, 0, 0), (0.2, 0.25, 0.14)), (0, 0, 0), (0.15, -1.4, 0.85)))
    ps.append(place(uvball(stem, (0, 0, 0), 0.4, 6, 4, scl=(1.6, 0.8, 0.2)), (0, 0, 30), (0.5, 0.2, 2.2)))
    o = join(ps, 'pk')
    o.data.transform(Matrix.Scale(1.5, 4))  # grosse citrouille
    return [o]

def cauldron():
    body = uvball(iron, (0, 0, 0), 1.6, 12, 8)
    for v in body.data.vertices:
        if v.co.z > 0.9:
            v.co.z = 0.9
    ps = [move(body, (0, 0, 1.9))]
    ps.append(torus(iron, (0, 0, 2.8), 1.25, 0.18, 12, 5))
    ps.append(cyl(brew, (0, 0, 2.75), 1.2, 0.1, 12))
    for i in range(4):
        a = i / 4 * math.tau + 0.3
        ps.append(ball(brew, (math.cos(a) * 0.6, math.sin(a) * 0.6, 3.0 + i * 0.25), 0.2 - i * 0.03, 1))
    for i in range(3):  # pieds
        a = i / 3 * math.tau
        ps.append(seg(iron, (math.cos(a) * 1.0, math.sin(a) * 1.0, 0.8), (math.cos(a) * 1.3, math.sin(a) * 1.3, 0), 0.15, 5))
    for i in range(6):  # bûches et flammes
        a = i / 6 * math.tau
        ps.append(seg(fence, (math.cos(a) * 1.4, math.sin(a) * 1.4, 0.15), (math.cos(a) * 0.2, math.sin(a) * 0.2, 0.3), 0.14, 5))
    ps.append(jitter(cone(spirit, (0, 0, 0.6), 0.6, 0.9, 6), 0.08, 2, 1))
    return ps

def ghost_lamp():
    ps = [cube(stone, (0, 0, 0.3), (1.2, 1.2, 0.6)), seg(iron, (0, 0, 0.6), (0, 0, 4.2), 0.12, 6)]
    ps.append(seg(iron, (0, 0, 4.0), (0.6, 0, 4.6), 0.07, 4))
    ps.append(seg(iron, (0.6, 0, 4.6), (1.2, 0, 4.3), 0.07, 4))
    ps.append(cube(iron, (1.2, 0, 3.95), (0.6, 0.6, 0.1)))
    ps.append(cube(lantern, (1.2, 0, 3.55), (0.45, 0.45, 0.7)))
    ps.append(cone(iron, (1.2, 0, 3.05), 0.42, 0.3, 4, rot=(180, 0, 45)))
    for x in (0.97, 1.43):
        for y in (-0.23, 0.23):
            ps.append(seg(iron, (x, y, 3.2), (x, y, 3.95), 0.03, 3))
    return ps

PROPS = [('FriendlyGhost', ghost), ('HauntedTree', haunted_tree), ('BrokenFence', broken_fence), ('JackOLantern', jack_o_lantern),
         ('WitchCauldron', cauldron), ('GhostLamp', ghost_lamp)]
