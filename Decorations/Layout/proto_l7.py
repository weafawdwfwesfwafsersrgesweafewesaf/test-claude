# Prototype du niveau 7 (Lave rose) : « le cœur du volcan qui garde l'œuf du dragon ».
# Peu d'éléments, grands, qui habillent l'espace AUTOUR de la piste (fond, hauteur, mouvement),
# jamais sur les bords du canyon, jamais sur le parcours. Sortie : arbre d'instances (tree_l7.json).
import json, math, random, sys

LEVELS_JSON, OUT = sys.argv[1:3]
LVL = 7
RIDE = (LVL - 1) * 50
FLOOR = RIDE - 30
Z0 = 300 + (LVL - 1) * 1300
Z1 = Z0 + 1300
PINK, PINK_L, PINK_D = 'ff46c8', 'ffb0ea', 'c21a8f'
BASALT, BASALT_D, BASALT_L = '2a2323', '1c1716', '433836'
OBS, OBS_L = '1b1426', '34244d'

boxes = []
for p in json.load(open(LEVELS_JSON)):
    if p['t'] != 'Level%d' % LVL or not p['q']:
        continue
    m, h = p['m'], [v / 2 for v in p['s']]
    ex = [abs(m[r * 3]) * h[0] + abs(m[r * 3 + 1]) * h[1] + abs(m[r * 3 + 2]) * h[2] for r in range(3)]
    boxes.append((p['p'][0] - ex[0], p['p'][0] + ex[0], p['p'][1] - ex[1], p['p'][1] + ex[1], p['p'][2] - ex[2], p['p'][2] + ex[2]))

def clear(x, z, r, ylo, yhi, margin=6):
    """Aucune pièce du parcours dans le cylindre (x, z, r + marge) entre ylo et yhi."""
    R = r + margin
    for b in boxes:
        dx = max(b[0] - x, 0, x - b[1])
        dz = max(b[4] - z, 0, z - b[5])
        if dx * dx + dz * dz < R * R and b[3] >= ylo and b[2] <= yhi:
            return False
    return True

# ------------------------------------------------------------------ fabrique de parts
def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])

def norm(v):
    l = math.sqrt(sum(c * c for c in v))
    return tuple(c / l for c in v)

def cf(pos, right, up):
    back = cross(right, up)
    return [pos[0], pos[1], pos[2], right[0], up[0], back[0], right[1], up[1], back[1], right[2], up[2], back[2]]

def P(shape, hexv, pos, right, up, size, neon=False, name=None, attrs=None, sphere=False):
    n = dict(c='Part', n=name or ('Neon' if neon else 'Part'), shape=shape, cf=cf(pos, right, up), size=list(size),
             rgb=[int(hexv[i:i + 2], 16) for i in (0, 2, 4)], mat=288 if neon else 272)
    if attrs:
        n['attrs'] = attrs
    if sphere:
        n['sphere'] = True
    return n

def block(hexv, pos, size, yaw=0.0, tilt=0.0, **kw):
    r = (math.cos(yaw), 0, -math.sin(yaw))
    u = (0, 1, 0)
    if tilt:
        f = cross(r, u)
        u = norm(tuple(u[i] * math.cos(tilt) + f[i] * math.sin(tilt) for i in range(3)))
    return P(1, hexv, pos, r, u, size, **kw)

def vcyl(hexv, x, yb, z, r, h, **kw):
    return P(2, hexv, (x, yb + h / 2, z), (0, 1, 0), (-1, 0, 0), (h, 2 * r, 2 * r), **kw)

def seg(hexv, a, b, r, **kw):
    d = tuple(b[i] - a[i] for i in range(3))
    L = math.sqrt(sum(c * c for c in d))
    right = norm(d)
    ref = (0, 1, 0) if abs(right[1]) < 0.9 else (1, 0, 0)
    up = norm(cross(cross(right, ref), right))
    return P(2, hexv, tuple((a[i] + b[i]) / 2 for i in range(3)), right, up, (L, 2 * r, 2 * r), **kw)

def ball(hexv, pos, r, **kw):
    return P(0, hexv, pos, (1, 0, 0), (0, 1, 0), (2 * r, 2 * r, 2 * r), **kw)

def ellipsoid(hexv, pos, rx, ry, rz, yaw=0.0, **kw):
    return P(1, hexv, pos, (math.cos(yaw), 0, -math.sin(yaw)), (0, 1, 0), (2 * rx, 2 * ry, 2 * rz), sphere=True, **kw)

def model(name, pivot, kids):
    return dict(c='Model', n=name, pivot=cf(pivot, (1, 0, 0), (0, 1, 0)), k=kids)

rng = random.Random(7007)

# ------------------------------------------------------------------ 1. le volcan (repère au loin)
def volcano(x, z, R, H):
    """Volcan large et bosselé : profil concave, gradins faits de plusieurs roches, coulées qui suivent la pente."""
    k = []
    steps = 16
    prof = lambda t: R * (1 - t) ** 1.6 + R * 0.16      # rayon à la hauteur relative t
    for i in range(steps):
        t = i / steps
        r = prof(t)
        h = H / steps
        yb = FLOOR - 8 + i * h
        k.append(vcyl(BASALT if i % 2 else BASALT_D, x, yb, z, r, h + (8 if i == 0 else 0.3)))
        for j in range(4):                               # bosses : la pente n'est pas un gâteau
            ang = rng.uniform(0, math.tau)
            rr = r * rng.uniform(0.25, 0.4)
            k.append(vcyl(BASALT_D if j % 2 else BASALT_L, x + math.cos(ang) * r * 0.8, yb - rng.uniform(0, h), z + math.sin(ang) * r * 0.8, rr, h * rng.uniform(1.2, 2.2)))
    top = FLOOR - 8 + H
    rc = prof(1) * 1.05
    for a in range(14):                                  # lèvre du cratère, déchiquetée
        ang = a * math.tau / 14
        k.append(block(BASALT_L if a % 2 else BASALT, (x + math.cos(ang) * rc, top + rng.uniform(1, 4), z + math.sin(ang) * rc), (rc * 0.55, rng.uniform(4, 8), 4), yaw=-ang))
    k.append(vcyl(PINK, x, top - 1, z, rc * 0.9, 2.5, neon=True, name='Cratere'))
    k.append(ellipsoid(PINK_L, (x, top + 4, z), rc * 0.7, 6, rc * 0.7, neon=True, name='Lueur'))
    for j in range(7):                                   # coulées de lave : suivent le profil jusqu'à la nappe
        ang = j * math.tau / 7 + rng.uniform(-0.25, 0.25)
        pts = []
        for s_ in range(9):
            t = 1 - s_ / 8
            rr = prof(t) + 1.2
            a2 = ang + (1 - t) * rng.uniform(-0.15, 0.15)
            pts.append((x + math.cos(a2) * rr, FLOOR - 8 + t * H + 0.6, z + math.sin(a2) * rr))
        for s_ in range(8):
            k.append(seg(PINK if s_ % 2 else PINK_D, pts[s_], pts[s_ + 1], 3.2 - s_ * 0.18, neon=True, name='Coulee'))
        k.append(vcyl(PINK, pts[-1][0], FLOOR - 0.5, pts[-1][2], 7, 1.2, neon=True, name='Flaque'))
    for j in range(6):                                   # panache de fumée figé : boules grises qui montent
        k.append(ball('5b4a55' if j % 2 else '463a42', (x + rng.uniform(-4, 4) + j * 2.5, top + 14 + j * 11, z + rng.uniform(-4, 4)), 7 + j * 2.2,
                      attrs=dict(DecorBob=2.5, DecorBobT=6.0, DecorBobP=round(j * 0.15, 2))))
    return model('Volcan', (x, FLOOR, z), k)

# ------------------------------------------------------------------ 2. l'œuf du dragon sur son piton
def egg_spire(x, z, H):
    k = []
    for i in range(6):                          # piton de basalte qui monte de la lave
        r = 11 - i * 1.2
        k.append(vcyl(BASALT if i % 2 else BASALT_D, x, FLOOR - 6 + i * H / 6, z, r, H / 6 + 0.3))
    top = FLOOR - 6 + H
    for a in range(9):                          # nid de branches calcinées
        ang = a * math.tau / 9
        k.append(seg('3a2418', (x + math.cos(ang) * 6, top + 0.5, z + math.sin(ang) * 6),
                     (x + math.cos(ang + 1.4) * 5, top + 2.2, z + math.sin(ang + 1.4) * 5), 0.7))
    k.append(ellipsoid('3f7d3a', (x, top + 6, z), 3.6, 5.2, 3.6, name='Oeuf'))
    for a in range(8):                          # écailles dorées
        ang = a * math.tau / 8
        k.append(ball('f2b632', (x + math.cos(ang) * 3.4, top + 5 + (a % 3) * 1.4, z + math.sin(ang) * 3.4), 0.55))
    k.append(ball(PINK_L, (x, top + 1.2, z), 4.5, neon=True, name='Braise'))
    for a in range(4):                          # quatre griffes de pierre qui gardent l'œuf
        ang = a * math.tau / 4 + math.pi / 4
        b = (x + math.cos(ang) * 8, top, z + math.sin(ang) * 8)
        m1 = (x + math.cos(ang) * 9, top + 7, z + math.sin(ang) * 9)
        t = (x + math.cos(ang) * 5, top + 12, z + math.sin(ang) * 5)
        k += [seg('8e1422', b, m1, 1.2), seg('8e1422', m1, t, 0.9), seg('f2b632', t, (x + math.cos(ang) * 3.5, top + 13, z + math.sin(ang) * 3.5), 0.5)]
    return model('OeufDuDragon', (x, FLOOR, z), k)

# ------------------------------------------------------------------ 3. geysers de lave (animés)
def geyser(x, z, h):
    ph = round(rng.uniform(0, 1), 3)
    bob = dict(DecorBob=h * 0.15, DecorBobT=round(rng.uniform(2.5, 3.8), 2), DecorBobP=ph)
    k = []
    for a in range(9):                                   # cheminée de basalte
        ang = a * math.tau / 9
        k.append(block(BASALT if a % 2 else BASALT_D, (x + math.cos(ang) * 7, FLOOR + 1.5, z + math.sin(ang) * 7), (5, rng.uniform(4, 7), 4), yaw=-ang))
    k.append(vcyl(PINK, x, FLOOR + 1, z, 6, 1, neon=True))
    k.append(vcyl(PINK, x, FLOOR, z, 3.6, h, neon=True, name='Jet', attrs=bob))
    k.append(vcyl(PINK_L, x, FLOOR, z, 1.8, h + 2, neon=True, name='Coeur', attrs=bob))
    for a in range(8):                                   # couronne d'éclaboussures
        ang = a * math.tau / 8
        k.append(ball(PINK if a % 2 else PINK_L, (x + math.cos(ang) * 5, FLOOR + h + rng.uniform(-1, 2), z + math.sin(ang) * 5), rng.uniform(1.6, 2.6), neon=True, attrs=bob))
    k.append(ball(PINK, (x, FLOOR + h + 3, z), 3.4, neon=True, name='Gerbe', attrs=bob))
    return model('Geyser', (x, FLOOR, z), k)

# ------------------------------------------------------------------ 4. rochers flottants (tournent lentement)
def floating_rock(cx, cy, cz, r, orbit, period):
    turn = dict(DecorTurn=period, DecorAxis=1.0, DecorCX=cx, DecorCY=cy, DecorCZ=cz)
    x, z = cx + orbit, cz
    k = []
    for i in range(6):                          # rocher taillé : blocs tournés imbriqués
        s = r * rng.uniform(0.6, 1.0)
        k.append(block(BASALT if i % 2 else BASALT_L, (x + rng.uniform(-0.4, 0.4) * r, cy + rng.uniform(-0.3, 0.3) * r, z + rng.uniform(-0.4, 0.4) * r),
                       (s * 1.4, s, s * 1.2), yaw=rng.uniform(0, math.pi), tilt=rng.uniform(-0.5, 0.5), attrs=turn))
    for i in range(3):                          # fissures de lave
        k.append(block(PINK, (x, cy - r * 0.35 + i * 0.3, z), (r * 1.2, 0.35, 0.5), yaw=rng.uniform(0, math.pi), neon=True, attrs=turn))
    for i in range(4):                          # pointe qui pend dessous
        k.append(vcyl(BASALT_D, x, cy - r * 0.5 - (i + 1) * r * 0.35, z, r * 0.45 * (1 - i * 0.22), r * 0.36, attrs=turn))
    return model('RocherFlottant', (x, cy, z), k)

# ------------------------------------------------------------------ 5. aiguilles d'obsidienne (cadrent la piste)
def spire(x, z, h, lean):
    k = []
    for j, (dx, dz, hh, rr) in enumerate([(0, 0, h, 5.0), (6, 3, h * 0.65, 3.4), (-5, 4, h * 0.5, 2.8), (2, -6, h * 0.4, 2.4)]):
        base = (x + dx, FLOOR - 2, z + dz)
        tip = (x + dx + lean[0] * hh * 0.25, FLOOR + hh, z + dz + lean[1] * hh * 0.25)
        k.append(seg(OBS if j % 2 else OBS_L, base, tip, rr))
        k.append(seg(PINK, tip, (tip[0] + lean[0] * 2, tip[1] + rr * 2.2, tip[2] + lean[1] * 2), rr * 0.55, neon=True))
    return model('AiguilleObsidienne', (x, FLOOR, z), k)

# ------------------------------------------------------------------ composition
root = dict(c='Folder', n='DecorMondes', k=[])
lvl = dict(c='Folder', n='Level%d' % LVL, k=[])
root['k'].append(lvl)
top_air = RIDE + 400

def find_spot(xs, zs, r, ylo, yhi, tries=200):
    for _ in range(tries):
        x, z = rng.uniform(*xs), rng.uniform(*zs)
        if clear(x, z, r, ylo, yhi):
            return x, z
    return None

placed = []
def far_from_others(x, z, d):
    return all(math.hypot(x - a, z - b) > d for a, b in placed)

# Le volcan : dans la moitié du fond, sur un côté, là où il y a toute la place
for side in (-1, 1):
    s = find_spot((side * 90, side * 115) if side > 0 else (side * 115, side * 90), (Z0 + 850, Z0 + 1180), 62, FLOOR, top_air)
    if s:
        lvl['k'].append(volcano(s[0], s[1], 62, 125))
        placed.append(s)
        break

# L'œuf du dragon : de l'autre côté, vers le milieu du niveau
s = None
for _ in range(400):
    x, z = rng.choice([-1, 1]) * rng.uniform(95, 140), rng.uniform(Z0 + 450, Z0 + 800)
    if clear(x, z, 14, FLOOR, top_air) and far_from_others(x, z, 150):
        s = (x, z)
        break
if s:
    lvl['k'].append(egg_spire(s[0], s[1], 58))
    placed.append(s)

# Geysers : 7, dans les trous de la piste, visibles pendant les sauts
g = 0
for _ in range(2000):
    if g >= 7:
        break
    x, z = rng.choice([-1, 1]) * rng.uniform(75, 155), rng.uniform(Z0 + 150, Z0 + 1250)   # jamais dans l'axe de la piste
    if clear(x, z, 10, FLOOR, top_air, margin=10) and far_from_others(x, z, 90):
        lvl['k'].append(geyser(x, z, rng.uniform(40, 55)))
        placed.append((x, z))
        g += 1

# Aiguilles d'obsidienne : 6, près des bords du chemin, penchées vers l'extérieur
a = 0
for _ in range(2000):
    if a >= 6:
        break
    x, z = rng.uniform(-155, 155), rng.uniform(Z0 + 150, Z0 + 1250)
    if abs(x) > 60 and clear(x, z, 14, FLOOR, top_air, margin=8) and far_from_others(x, z, 110):
        lvl['k'].append(spire(x, z, rng.uniform(45, 62), (1 if x > 0 else -1, rng.uniform(-0.3, 0.3))))
        placed.append((x, z))
        a += 1

# Rochers flottants : 6, HAUT au-dessus des côtés (loin de la piste), qui tournent lentement
rocks = dict(c='Folder', n='RochersFlottants', k=[])
for i in range(6):
    side = -1 if i % 2 else 1
    cz = Z0 + 180 + i * 190 + rng.uniform(-40, 40)
    cy = RIDE + rng.uniform(70, 110)
    cx = side * rng.uniform(95, 125)
    rocks['k'].append(floating_rock(cx, cy, cz, rng.uniform(12, 17), rng.uniform(10, 18), round(rng.choice([-1, 1]) * rng.uniform(40, 70), 1)))
lvl['k'].append(rocks)

json.dump(root, open(OUT, 'w'))
n = [0]
def cnt(x):
    if x['c'] == 'Part':
        n[0] += 1
    for c in x.get('k', []):
        cnt(c)
cnt(root)
print('éléments', [k['n'] for k in lvl['k']], 'parts', n[0])
