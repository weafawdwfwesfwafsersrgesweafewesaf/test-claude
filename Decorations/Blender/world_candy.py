# Monde BONBONS : pastel, sucettes, cupcakes
import math, random
from kit import *

TITLE = 'Candy'
SHOT = dict(bg=(0.98, 0.72, 0.85), floor=(1.0, 0.86, 0.93), light_col=(1, 0.97, 0.95), sun=2.4)

pink = color('pink', '#ff6fb5'); pink2 = color('pinklight', '#ffc2e0'); mint = color('mint', '#6fe0c0'); lemon = color('lemon', '#ffe066')
grape = color('grape', '#a57bff'); sky = color('skyblue', '#6cc8ff'); white = color('cream', '#fff6ee'); red = color('candyred', '#ff3b4e')
choco = color('choco', '#6b3b24'); choco2 = color('choco2', '#8f5434'); wafer = color('wafer', '#e8b86a')

def lollipop():
    ps = [cyl(white, (0, 0, 2.6), 0.15, 5.2, 6)]
    cols = [pink, mint, lemon, grape, white]
    for i, c in enumerate(cols):  # disque en spirale : anneaux emboîtés
        R = 2.0 - i * 0.38
        ps.append(place(torus(c, (0, 0, 0), R, 0.17, 16, 4, scl=(1, 1, 1.6)), (90, 0, 0), (0, 0, 6.8)))
    ps.append(place(cyl(pink, (0, 0, 0), 0.25, 0.5, 10), (90, 0, 0), (0, 0, 6.8)))
    ps.append(cyl(pink2, (0, 0, 0.12), 1.0, 0.24, 10))
    return ps

def candy_cane():
    ps = []
    pts = [(0, 0, z) for z in [i * 0.55 for i in range(10)]]
    for i in range(7):  # la crosse
        a = math.pi * i / 6
        pts.append((1.0 - math.cos(a) * 1.0, 0, 5.0 + math.sin(a) * 1.0))
    for i in range(len(pts) - 1):
        ps.append(seg(red if i % 2 else white, pts[i], pts[i + 1], 0.32, 8))
        ps.append(ball(red if i % 2 else white, pts[i + 1], 0.32, 1))
    ps.append(ball(white, pts[0], 0.32, 1))
    return ps

def gumdrop_tree():
    ps = []
    for i in range(6):  # tronc rayé
        ps.append(cyl(white if i % 2 else pink, (0, 0, 0.35 + i * 0.7), 0.35, 0.7, 8))
    random.seed(3)
    cols = [pink, mint, lemon, grape, sky, red]
    for i in range(14):
        a = random.uniform(0, math.tau); r = random.uniform(0.3, 1.9); z = 4.4 + random.uniform(-0.6, 1.6) - r * 0.35
        g = uvball(cols[i % len(cols)], (0, 0, 0), 0.7, 8, 5, scl=(1, 1, 0.85))
        ps.append(move(g, (math.cos(a) * r, math.sin(a) * r, z)))
    ps.append(uvball(pink, (0, 0, 5.8), 0.8, 8, 5))
    return ps

def cupcake():
    ps = [cyl(sky, (0, 0, 0.9), 1.6, 1.8, 14, r2=1.95)]
    ps += ring_of(lambda i, a, p: place(cube(white, (0, 0, 0), (0.12, 0.12, 1.6)), (0, -6, math.degrees(a)), (p[0] * 1.02, p[1] * 1.02, 0.9)), 14, 1.8)
    for i, (z, R, r) in enumerate(((2.05, 1.7, 0.5), (2.65, 1.25, 0.45), (3.15, 0.8, 0.4))):
        ps.append(torus(pink2 if i % 2 else pink, (0, 0, z), R, r, 14, 6))
    ps.append(cone(pink, (0, 0, 3.6), 0.55, 0.9, 10))
    ps.append(uvball(red, (0, 0, 4.2), 0.4, 8, 6))
    ps.append(seg(choco, (0, 0, 4.5), (0.25, 0, 5.0), 0.05, 4))
    random.seed(7)
    cols = [lemon, mint, grape, sky, white]
    for i in range(16):  # vermicelles
        a = random.uniform(0, math.tau); r = random.uniform(0.6, 1.6)
        ps.append(place(cube(cols[i % 5], (0, 0, 0), (0.08, 0.28, 0.08)), (0, 0, random.uniform(0, 180)), (math.cos(a) * r, math.sin(a) * r, 2.55 - (r - 0.6) * 0.35)))
    return ps

def donut():
    ps = [torus(wafer, (0, 0, 0.9), 1.9, 0.9, 16, 8)]
    ic = torus(pink, (0, 0, 1.25), 1.9, 0.78, 16, 8)
    for v in ic.data.vertices:  # glaçage : on écrase la moitié basse
        if v.co.z < 1.25:
            v.co.z = 1.25 + (v.co.z - 1.25) * 0.15
    ps.append(jitter(ic, 0.06, 2, 1))
    random.seed(9)
    cols = [lemon, mint, grape, sky, white]
    for i in range(22):
        a = random.uniform(0, math.tau); r = 1.9 + random.uniform(-0.55, 0.55)
        ps.append(place(cube(cols[i % 5], (0, 0, 0), (0.1, 0.35, 0.1)), (0, 0, random.uniform(0, 180)), (math.cos(a) * r, math.sin(a) * r, 2.0)))
    # donut posé debout, un peu penché : plus lisible dans un monde
    return [place(join(ps, 'donut'), (70, 0, 20), (0, 0, 2.6))]

def wrapped_candy():
    body = uvball(grape, (0, 0, 0), 1.2, 12, 8, scl=(1.5, 1, 1))
    ps = [body]
    for i in range(6):  # rayures
        ps.append(place(torus(white, (0, 0, 0), 1.0 - abs(i - 2.5) * 0.12, 0.08, 14, 4), (0, 90, 0), (-1.25 + i * 0.5, 0, 0)))
    for s in (-1, 1):
        w = cyl(grape, (0, 0, 0), 0.25, 1.1, 8, r2=0.9)
        ps.append(jitter(place(w, (0, s * 90, 0), (s * 2.25, 0, 0)), 0.1, 2, s + 5))
    o = join(ps, 'wc')
    return [place(o, (0, 12, 25), (0, 0, 1.25))]

def ice_cream():
    ps = [cone(wafer, (0, 0, 1.6), 1.1, 3.2, 10, rot=(180, 0, 0))]
    for i in range(5):  # quadrillage du cornet
        ps.append(torus(choco2, (0, 0, 0.8 + i * 0.55), 0.3 + i * 0.16, 0.05, 10, 3))
    ps.append(uvball(mint, (0, 0, 3.6), 1.2, 12, 7))
    ps.append(uvball(pink, (0, 0, 4.9), 1.0, 12, 7))
    drip = torus(pink, (0, 0, 4.4), 0.95, 0.2, 12, 4)
    ps.append(jitter(drip, 0.12, 2, 3))
    ps.append(uvball(red, (0, 0, 6.0), 0.35, 8, 5))
    return ps

PROPS = [('Lollipop', lollipop), ('CandyCane', candy_cane), ('GumdropTree', gumdrop_tree), ('Cupcake', cupcake),
         ('GiantDonut', donut), ('WrappedCandy', wrapped_candy), ('IceCreamCone', ice_cream)]
