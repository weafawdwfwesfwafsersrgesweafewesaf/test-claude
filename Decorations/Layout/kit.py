# Boîte à outils des décors : maths, pièces, transformations, texte pixel.
# Convention des modèles : construits autour de l'origine, base à y = 0, face avant vers +Z.
# Matière : TOUT en studs (Plastic + MaterialVariant « Studs_2 », celui que Resurface a créé dans la map),
# sauf le néon (ce qui brille). Le verre devient du plastique studs transparent.
import json, math

# ================================================================== maths
def snap(v, s=0.05):
    return round(v / s) * s

def mat3(yaw=0.0, pitch=0.0, roll=0.0):
    """Rotation Ry(yaw) * Rx(pitch) * Rz(roll), degrés. Renvoie (droite, haut)."""
    y, p, r = (math.radians(a) for a in (yaw, pitch, roll))
    cy, sy, cp, sp, cr, sr = math.cos(y), math.sin(y), math.cos(p), math.sin(p), math.cos(r), math.sin(r)
    Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]
    Rx = [[1, 0, 0], [0, cp, -sp], [0, sp, cp]]
    Rz = [[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]]
    mul = lambda A, B: [[sum(A[i][k] * B[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
    M = mul(mul(Ry, Rx), Rz)
    return (M[0][0], M[1][0], M[2][0]), (M[0][1], M[1][1], M[2][1])

def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])

def norm(v):
    l = math.sqrt(sum(c * c for c in v)) or 1
    return tuple(c / l for c in v)

def add(a, b):
    return tuple(a[i] + b[i] for i in range(3))

def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))

def cfm(pos, right, up):
    back = cross(right, up)
    return [snap(pos[0]), snap(pos[1]), snap(pos[2]), right[0], up[0], back[0], right[1], up[1], back[1], right[2], up[2], back[2]]

def rgb(hexv):
    return [int(hexv[i:i + 2], 16) for i in (0, 2, 4)]

# ================================================================== pièces
NEON, STUDS = 288, 256

def _part(shape, hexv, pos, right, up, size, neon=False, name=None, light=None, attrs=None, sphere=False, transp=0.0, wedge_mesh=False):
    n = dict(c='Part', n=name or ('Neon' if neon else 'Part'), shape=shape, cf=cfm(pos, right, up),
             size=[max(0.05, snap(v)) for v in size], rgb=rgb(hexv), mat=NEON if neon else STUDS)
    if not neon:
        n['studs'] = True
    if sphere:
        n['sphere'] = True
    if attrs:
        n['attrs'] = dict(attrs)
    if transp:
        n['transp'] = transp
    if light:
        col, rng_, br = light
        n['k'] = [dict(c='PointLight', n='Lumiere', rgb=rgb(col), range=rng_, brightness=br)]
    return n

def box(hexv, pos, size, yaw=0, pitch=0, roll=0, **kw):
    r, u = mat3(yaw, pitch, roll)
    return _part(1, hexv, pos, r, u, size, **kw)

def wedge(hexv, pos, size, yaw=0, pitch=0, roll=0, **kw):
    """Coin : fond plein, dos (+Z local) plein, pente qui descend vers -Z local (comme un WedgePart)."""
    r, u = mat3(yaw, pitch, roll)
    return _part(3, hexv, pos, r, u, size, **kw)

def wedge_to(hexv, pos, w, h, d, down):
    """Coin posé à plat dont la pente descend vers la direction horizontale `down` ('+x','-x','+z','-z').
    w = longueur le long de l'arête, h = hauteur, d = profondeur de la pente."""
    yaw = {'-z': 0, '+z': 180, '+x': -90, '-x': 90}[down]
    return wedge(hexv, pos, (w, h, d), yaw=yaw)

def cyl(hexv, base, r, h, **kw):
    """Cylindre vertical posé sur `base`."""
    return _part(2, hexv, (base[0], base[1] + h / 2, base[2]), (0, 1, 0), (-1, 0, 0), (h, 2 * r, 2 * r), **kw)

def disc(hexv, center, r, t, axis=(0, 1, 0), **kw):
    """Disque d'épaisseur t, face perpendiculaire à `axis`."""
    a = norm(axis)
    ref = (0, 0, 1) if abs(a[2]) < 0.9 else (1, 0, 0)
    up = norm(cross(cross(a, ref), a))
    return _part(2, hexv, center, a, up, (t, 2 * r, 2 * r), **kw)

def rod(hexv, a, b, r, **kw):
    d = tuple(b[i] - a[i] for i in range(3))
    L = math.sqrt(sum(c * c for c in d))
    right = norm(d)
    ref = (0, 1, 0) if abs(right[1]) < 0.9 else (1, 0, 0)
    up = norm(cross(cross(right, ref), right))
    return _part(2, hexv, lerp(a, b, 0.5), right, up, (L, 2 * r, 2 * r), **kw)

def beam(hexv, a, b, w, h, **kw):
    """Poutre rectangulaire de a à b (h = épaisseur verticale quand la poutre est horizontale)."""
    d = tuple(b[i] - a[i] for i in range(3))
    L = math.sqrt(sum(c * c for c in d))
    look = norm(d)
    ref = (0, 1, 0) if abs(look[1]) < 0.9 else (1, 0, 0)
    right = norm(cross(ref, look))
    up = norm(cross(look, right))
    return _part(1, hexv, lerp(a, b, 0.5), right, up, (w, h, L), **kw)

def ball(hexv, c, r, **kw):
    return _part(0, hexv, c, (1, 0, 0), (0, 1, 0), (2 * r, 2 * r, 2 * r), **kw)

def ell(hexv, c, rx, ry, rz, yaw=0, pitch=0, roll=0, **kw):
    r, u = mat3(yaw, pitch, roll)
    return _part(1, hexv, c, r, u, (2 * rx, 2 * ry, 2 * rz), sphere=True, **kw)

def model(name, pivot, kids, yaw=0):
    r, u = mat3(yaw)
    return dict(c='Model', n=name, pivot=cfm(pivot, r, u), k=[k for k in kids if k])

def folder(name, kids):
    return dict(c='Folder', n=name, k=[k for k in kids if k])

def with_attrs(nodes, attrs):
    for n in nodes:
        if n.get('c') == 'Part':
            n.setdefault('attrs', {}).update(attrs)
        elif n.get('k'):
            with_attrs(n['k'], attrs)
    return nodes

def bob(amp, period, phase):
    return dict(DecorBob=round(amp, 2), DecorBobT=round(period, 2), DecorBobP=round(phase, 3))

def turn(period, axis, c):
    return dict(DecorTurn=round(period, 2), DecorAxis=float(axis), DecorCX=round(c[0], 2), DecorCY=round(c[1], 2), DecorCZ=round(c[2], 2))

# ================================================================== formes composées
def bevel_box(hexv, c, size, b, top=True, bottom=False, hex_edge=None, steps=1, **kw):
    """Bloc aux arêtes adoucies en marches (le chanfrein « à la Roblox ») : corps + une ou deux marches plus petites.
    `hex_edge` colore les marches (liseré)."""
    w, h, d = size
    e = hex_edge or hexv
    nt, nb = int(top), int(bottom)
    k = [box(hexv, (c[0], c[1] + b * (nb - nt) / 2, c[2]), (w, h - b * (nt + nb), d), **kw)]
    for s, on in ((1, top), (-1, bottom)):
        if not on:
            continue
        hs = b / steps
        for j in range(steps):
            inset = b * (j + 1) / steps
            y = c[1] + s * (h / 2 - b + hs * (j + 0.5))
            k.append(box(e if j == steps - 1 else hexv, (c[0], y, c[2]), (w - 2 * inset, hs, d - 2 * inset), **kw))
    return k

def stepped_sphere(color_of, c, R, n=11, cap=0.78, pole=None):
    """Sphère en tranches (look « planète en studs ») : tranches sur |y| < cap*R, pôles en dôme (boule).
    color_of(i, n) -> couleur de la tranche i (du bas vers le haut)."""
    k = [ball(pole or color_of(n // 2, n), c, R * 0.985)]
    h = 2 * R * cap / n
    for i in range(n):
        ym = -R * cap + (i + 0.5) * h
        r = math.sqrt(max(0.0, R * R - ym * ym)) * 1.025
        k.append(cyl(color_of(i, n), (c[0], c[1] + ym - h / 2, c[2]), r, h + 0.02))
    return k

def cristal(hexv, base, h, w, yaw=0, tilt=0, lean_yaw=0, **kw):
    """Cristal : prisme carré + pointe en toit (deux coins dos à dos), incliné de `tilt` degrés vers `lean_yaw`."""
    tip = w * 0.9
    k = [box(hexv, (0, (h - tip) / 2, 0), (w, h - tip, w), **kw),
         wedge(hexv, (0, h - tip / 2, w / 4), (w, tip, w / 2), yaw=180, **kw),
         wedge(hexv, (0, h - tip / 2, -w / 4), (w, tip, w / 2), yaw=0, **kw)]
    R = mul(Ry(lean_yaw), mul(Rx(tilt), Ry(yaw - lean_yaw)))
    return transform(k, (0, 0, 0), R, 1.0, base)

def octo(hexv, c, w, h, d, yaw=0, **kw):
    """Prisme octogonal : deux blocs croisés à 45°."""
    k = [box(hexv, (0, 0, 0), (w, h, d), **kw), box(hexv, (0, 0, 0), (w * 0.83, max(0.05, h - 0.12), d * 0.83), yaw=45, **kw)]   # faces décalées : pas de z-fighting
    return transform(k, (0, 0, 0), Ry(yaw), 1.0, c)

def rocher_facettes(cols, c, r, rng, n=4, squash=1.0, flottant=False):
    """Rocher : quelques gros blocs tournés dans tous les sens qui se chevauchent beaucoup (polyèdre irrégulier)."""
    k = []
    for i in range(n):
        s = r * (1.0 - i * 0.06)
        size = (s * 1.3, s * 1.1 * squash, s * 1.2)
        off = (rng.uniform(-0.3, 0.3) * r, (rng.uniform(-0.1, 0.25) if not flottant else rng.uniform(-0.25, 0.2)) * r * squash, rng.uniform(-0.3, 0.3) * r)
        k.append(box(cols[i % len(cols)], (c[0] + off[0], c[1] + off[1], c[2] + off[2]), size,
                     yaw=rng.uniform(0, 90), pitch=rng.choice([-1, 1]) * rng.uniform(15, 40), roll=rng.choice([-1, 1]) * rng.uniform(15, 40)))
    return k

def rocher_strates(cols, c, r, rng, n=4, squash=1.0):
    """Piton en strates octogonales qui se resserrent vers le haut (pour les pics et les socles)."""
    k = []
    layers = [(1.0, 0.42), (0.86, 0.34), (0.66, 0.28), (0.42, 0.22)][:n]
    y = 0.0
    yaw0 = rng.uniform(0, 45)
    for i, (s, h) in enumerate(layers):
        hh = h * r * squash
        k += octo(cols[i % len(cols)], (c[0], c[1] + y + hh / 2, c[2]), 2 * s * r, hh + 0.05, 2 * s * r * 0.92, yaw=yaw0 + i * 22.5)
        y += hh
    return k

def orient(nodes, d, pos):
    """Tourne des pièces construites autour de +Y pour que +Y pointe vers d, puis les pose en pos."""
    d = norm(d)
    ref = (1, 0, 0) if abs(d[0]) < 0.9 else (0, 0, 1)
    right = norm(cross(d, ref))
    back = cross(right, d)
    R = [[right[0], d[0], back[0]], [right[1], d[1], back[1]], [right[2], d[2], back[2]]]
    return transform(nodes, (0, 0, 0), R, 1.0, pos)

def cratere(c, R, d, r, lip, floor):
    """Cratère sur une boule de centre c et rayon R, dans la direction d : fond plat + bourrelet en anneau."""
    k = [cyl(floor, (0, -0.6, 0), r, 0.62)]
    for i in range(14):
        a = i * math.tau / 14
        k.append(box(lip, (math.cos(a) * (r + 0.35), -0.35, math.sin(a) * (r + 0.35)), (0.8, 0.8, 2 * (r + 0.75) * math.tan(math.pi / 14) + 0.05),
                     yaw=-math.degrees(a)))
    h = math.sqrt(max(0.0, R * R - (r + 0.35) ** 2)) + 0.25
    return orient(k, d, tuple(c[i] + norm(d)[i] * h for i in range(3)))

def engrenage(col, c, R, n, t, axis=(0, 0, 1), hub=None, dent=None):
    """Roue dentée : jante, rayons, moyeu et dents, dans le plan perpendiculaire à `axis`."""
    k = []
    dent = dent or R * 0.22
    # construite dans le plan XY (axe Z) puis orientée
    k += ring(col, (0, 0, 0), R - dent * 0.6, dent * 1.2, n * 2, t, axis='z')
    for i in range(n):
        a = i * math.tau / n
        k.append(box(col, (math.cos(a) * (R + dent * 0.2), math.sin(a) * (R + dent * 0.2), 0), (dent * 1.3, 2 * math.pi * R / n * 0.5, t * 0.88), roll=math.degrees(a)))
    for i in range(5):
        a = i * math.tau / 5 + 0.3
        k.append(box(col, (math.cos(a) * R * 0.45, math.sin(a) * R * 0.45, 0), (R * 0.8, R * 0.16, t * 0.8), roll=math.degrees(a)))
    k.append(disc(hub or col, (0, 0, 0), R * 0.24, t * 1.3, axis=(0, 0, 1)))
    k.append(disc('1d2126', (0, 0, 0), R * 0.1, t * 1.5, axis=(0, 0, 1)))
    a = norm(axis)
    if abs(a[2]) > 0.99:
        R_ = IDENT if a[2] > 0 else Ry(180)
    elif abs(a[0]) > 0.99:
        R_ = Ry(90 if a[0] > 0 else -90)
    else:
        R_ = Rx(-90 if a[1] > 0 else 90)
    return transform(k, (0, 0, 0), R_, 1.0, c)

def ring(hexv, c, R, t, n, h, axis='y', seg_w=None, **kw):
    """Anneau de n segments (blocs) de section t x h, rayon R, autour de l'axe donné."""
    k = []
    w = seg_w or (2 * (R + t / 2) * math.tan(math.pi / n) + 0.05)
    for i in range(n):
        a = i * math.tau / n
        hh = h + (0.04 if i % 2 else 0)                                   # joints décalés : pas de z-fighting
        if axis == 'y':
            p = (c[0] + math.cos(a) * R, c[1], c[2] + math.sin(a) * R)
            k.append(box(hexv, p, (t, hh, w), yaw=-math.degrees(a), **kw))
        elif axis == 'z':
            p = (c[0] + math.cos(a) * R, c[1] + math.sin(a) * R, c[2])
            k.append(box(hexv, p, (t, w, hh), roll=math.degrees(a), **kw))
        else:
            p = (c[0], c[1] + math.cos(a) * R, c[2] + math.sin(a) * R)
            k.append(box(hexv, p, (hh, t, w), pitch=math.degrees(a), **kw))
    return k

def curve(hexv, pts, r, joints=True, **kw):
    """Tube lisse passant par les points (cylindres + rotules)."""
    k = []
    for i in range(len(pts) - 1):
        k.append(rod(hexv, pts[i], pts[i + 1], r, **kw))
        if joints and i < len(pts) - 2:
            k.append(ball(hexv, pts[i + 1], r, **kw))
    return k

def bezier(p0, p1, p2, p3, n):
    out = []
    for i in range(n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3
        out.append(tuple(a * p0[j] + b * p1[j] + c * p2[j] + d * p3[j] for j in range(3)))
    return out

# ================================================================== transformations
def _apply(R, v):
    return tuple(sum(R[i][j] * v[j] for j in range(3)) for i in range(3))

def Ry(deg):
    a = math.radians(deg)
    return [[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]]

def Rx(deg):
    a = math.radians(deg)
    return [[1, 0, 0], [0, math.cos(a), -math.sin(a)], [0, math.sin(a), math.cos(a)]]

def Rz(deg):
    a = math.radians(deg)
    return [[math.cos(a), -math.sin(a), 0], [math.sin(a), math.cos(a), 0], [0, 0, 1]]

def mul(A, B):
    return [[sum(A[i][k] * B[k][j] for k in range(3)) for j in range(3)] for i in range(3)]

IDENT = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]

def transform(nodes, c, R, scale=1.0, move=(0, 0, 0)):
    """Tourne (R) et agrandit (scale) autour du point c, puis déplace de `move`. Attributs d'animation compris."""
    for n in nodes:
        _tx(n, c, R, scale, move)
    return nodes

def _tx(n, c, R, s, mv):
    def P(p):
        q = _apply(R, tuple((p[i] - c[i]) * s for i in range(3)))
        return tuple(c[i] + q[i] + mv[i] for i in range(3))
    if n.get('c') == 'Part':
        m = n['cf']
        right = _apply(R, (m[3], m[6], m[9]))
        up = _apply(R, (m[4], m[7], m[10]))
        n['cf'] = cfm(P(m[0:3]), right, up)
        n['size'] = [max(0.05, round(v * s, 2)) for v in n['size']]
        a = n.get('attrs')
        if a:
            if 'DecorCX' in a:
                q = P((a['DecorCX'], a['DecorCY'], a['DecorCZ']))
                a['DecorCX'], a['DecorCY'], a['DecorCZ'] = (round(v, 2) for v in q)
                if s != 1 or R is not IDENT:
                    ax = [(1, 0, 0), (0, 1, 0), (0, 0, 1)][int(a['DecorAxis'])]
                    w = _apply(R, ax)
                    i = max(range(3), key=lambda j: abs(w[j]))
                    if w[i] < 0:
                        a['DecorTurn'] = -a['DecorTurn']
                    a['DecorAxis'] = float(i)
            if 'DecorBob' in a:
                a['DecorBob'] = round(a['DecorBob'] * s, 2)
    if n.get('c') == 'PointLight':
        n['range'] = min(60, round(n['range'] * s, 1))
    if n.get('c') == 'Model':
        p = P(n['pivot'][0:3])
        right = _apply(R, (n['pivot'][3], n['pivot'][6], n['pivot'][9]))
        up = _apply(R, (n['pivot'][4], n['pivot'][7], n['pivot'][10]))
        n['pivot'] = cfm(p, right, up)
    for k in n.get('k', []):
        _tx(k, c, R, s, mv)

def place(nodes, pos, yaw=0, scale=1.0, pitch=0, roll=0):
    """Pose un modèle construit à l'origine : échelle, rotation (lacet puis tangage/roulis), position."""
    R = mul(Ry(yaw), mul(Rx(pitch), Rz(roll)))
    return transform(nodes, (0, 0, 0), R, scale, pos)

def parts_of(n):
    if n.get('c') == 'Part':
        yield n
    for k in n.get('k', []):
        yield from parts_of(k)

def aabb(nodes):
    lo, hi = [1e9] * 3, [-1e9] * 3
    for n in nodes:
        for p in parts_of(n):
            m, h = p['cf'], [v / 2 for v in p['size']]
            for i in range(3):
                e = abs(m[3 + i * 3]) * h[0] + abs(m[4 + i * 3]) * h[1] + abs(m[5 + i * 3]) * h[2]
                lo[i], hi[i] = min(lo[i], m[i] - e), max(hi[i], m[i] + e)
    return lo, hi

def deepcopy(x):
    return json.loads(json.dumps(x))

# ================================================================== police pixel (5 x 7)
FONT = {
    'G': ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
    'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
    'W': ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
    'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    'D': ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
    'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
    'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    'I': ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
    'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    'C': ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
    'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
    'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
    'Z': ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
    'Q': ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
    '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
    ' ': ['00000'] * 7,
}

def pixel_text(text, center, px, hexv, depth=0.6, neon=True, gap=1):
    """Texte pixel sur le plan XY (regarde +Z), centré sur `center`. Les pixels d'une même ligne sont fusionnés."""
    out = []
    w = len(text) * (5 + gap) - gap
    for ci, ch in enumerate(text):
        g = FONT.get(ch, FONT[' '])
        for row, line in enumerate(g):
            col = 0
            while col < 5:
                if line[col] == '1':
                    end = col
                    while end + 1 < 5 and line[end + 1] == '1':
                        end += 1
                    lx = (ci * (5 + gap) + (col + end) / 2 - (w - 1) / 2) * px
                    ly = (3 - row) * px
                    out.append(box(hexv, (center[0] + lx, center[1] + ly, center[2]), ((end - col + 1) * px, px, depth), neon=neon))
                    col = end + 1
                else:
                    col += 1
    return out
