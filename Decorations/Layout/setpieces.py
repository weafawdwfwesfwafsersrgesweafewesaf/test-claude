# Décors « set pieces » des 12 niveaux : peu d'éléments, grands, qui racontent le thème du niveau.
# Rien sur les bords du canyon, rien sur le parcours (vérifié sur la vraie géométrie, levels.json).
# Style de la map : grosses masses en studs (Plastic + Studs_2), néon pour ce qui brille, verre
# pour les cristaux, lumières. Tout est aligné (positions arrondies, angles par 15°).
# Sortie : arbre d'instances (tree.json) -> tools/rbxl/bake.js l'écrit dans le jeu.
# Usage : python3 setpieces.py levels.json tree.json [niveau]
import json, math, random, sys

LEVELS_JSON, OUT = sys.argv[1:3]
ONLY = int(sys.argv[3]) if len(sys.argv) > 3 else None

def ride(i): return (i - 1) * 50
def floor_y(i): return ride(i) - 30
def z0(i): return 300 + (i - 1) * 1300

BOXES = {}
for p in json.load(open(LEVELS_JSON)):
    if not p['q']:
        continue
    m, h = p['m'], [v / 2 for v in p['s']]
    ex = [abs(m[r * 3]) * h[0] + abs(m[r * 3 + 1]) * h[1] + abs(m[r * 3 + 2]) * h[2] for r in range(3)]
    BOXES.setdefault(p['t'], []).append((p['p'][0] - ex[0], p['p'][0] + ex[0], p['p'][1] - ex[1], p['p'][1] + ex[1], p['p'][2] - ex[2], p['p'][2] + ex[2]))

# ================================================================== maths
def snap(v, s=0.25):
    return round(v / s) * s

def mat3(yaw=0.0, pitch=0.0, roll=0.0):
    """Rotation Ry(yaw) * Rx(pitch) * Rz(roll), degrés. Renvoie (droite, haut, arrière)."""
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

def cfm(pos, right, up):
    back = cross(right, up)
    return [snap(pos[0], 0.05), snap(pos[1], 0.05), snap(pos[2], 0.05), right[0], up[0], back[0], right[1], up[1], back[1], right[2], up[2], back[2]]

# ================================================================== pièces
MATS = {'smooth': 272, 'neon': 288, 'glass': 1568, 'metal': 1088, 'plate': 1056, 'ice': 1536, 'studs': 256, 'fabric': 1312, 'slate': 800, 'basalt': 788}

def _part(shape, hexv, pos, right, up, size, mat='smooth', name=None, light=None, attrs=None, sphere=False, transp=0.0):
    n = dict(c='Part', n=name or ('Neon' if mat == 'neon' else 'Part'), shape=shape, cf=cfm(pos, right, up),
             size=[max(0.05, snap(v, 0.05)) for v in size], rgb=[int(hexv[i:i + 2], 16) for i in (0, 2, 4)], mat=MATS[mat])
    if mat == 'studs':
        n['studs'] = True
    if sphere:
        n['sphere'] = True
    if attrs:
        n['attrs'] = dict(attrs)
    if transp:
        n['transp'] = transp
    if light:
        col, rng_, br = light
        n['k'] = [dict(c='PointLight', n='Lumiere', rgb=[int(col[i:i + 2], 16) for i in (0, 2, 4)], range=rng_, brightness=br)]
    return n

def box(hexv, pos, size, yaw=0, pitch=0, roll=0, **kw):
    r, u = mat3(yaw, pitch, roll)
    return _part(1, hexv, pos, r, u, size, **kw)

def wedge(hexv, pos, size, yaw=0, pitch=0, roll=0, **kw):
    r, u = mat3(yaw, pitch, roll)
    return _part(3, hexv, pos, r, u, size, **kw)

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
    return _part(2, hexv, tuple((a[i] + b[i]) / 2 for i in range(3)), right, up, (L, 2 * r, 2 * r), **kw)

def beam(hexv, a, b, w, h, **kw):
    """Poutre rectangulaire de a à b."""
    d = tuple(b[i] - a[i] for i in range(3))
    L = math.sqrt(sum(c * c for c in d))
    look = norm(d)
    ref = (0, 1, 0) if abs(look[1]) < 0.9 else (1, 0, 0)
    right = norm(cross(ref, look)) if abs(look[1]) < 0.9 else norm(cross(look, ref))
    up = norm(cross(look, right))
    back = look
    right = norm(cross(up, back))
    return _part(1, hexv, tuple((a[i] + b[i]) / 2 for i in range(3)), right, up, (w, h, L), **kw)

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
    return nodes

def bob(amp, period, phase):
    return dict(DecorBob=round(amp, 2), DecorBobT=round(period, 2), DecorBobP=round(phase, 3))

def turn(period, axis, c):
    return dict(DecorTurn=round(period, 2), DecorAxis=float(axis), DecorCX=round(c[0], 2), DecorCY=round(c[1], 2), DecorCZ=round(c[2], 2))

def rot_pt(p, yaw, o):
    """Tourne le point p (relatif) de `yaw` degrés et le place en o."""
    r, _ = mat3(yaw)
    back = cross(r, (0, 1, 0))
    return (o[0] + p[0] * r[0] + p[2] * back[0], o[1] + p[1], o[2] + p[0] * r[2] + p[2] * back[2])

# ================================================================== transformations
def rot_z(deg):
    a = math.radians(deg)
    return [[math.cos(a), -math.sin(a), 0], [math.sin(a), math.cos(a), 0], [0, 0, 1]]

def _apply(R, v):
    return tuple(sum(R[i][j] * v[j] for j in range(3)) for i in range(3))

def transform(nodes, c, R, scale=1.0):
    """Tourne (R) et agrandit (scale) des parts autour du point c, attributs compris."""
    for n in nodes:
        _tx(n, c, R, scale)
    return nodes

def _tx(n, c, R, s):
    if n.get('c') == 'Part':
        m = n['cf']
        p = _apply(R, tuple((m[i] - c[i]) * s for i in range(3)))
        right = _apply(R, (m[3], m[6], m[9]))
        up = _apply(R, (m[4], m[7], m[10]))
        n['cf'] = cfm(tuple(c[i] + p[i] for i in range(3)), right, up)
        n['size'] = [round(v * s, 2) for v in n['size']]
        a = n.get('attrs')
        if a:
            if 'DecorCX' in a:
                q = _apply(R, ((a['DecorCX'] - c[0]) * s, (a['DecorCY'] - c[1]) * s, (a['DecorCZ'] - c[2]) * s))
                a['DecorCX'], a['DecorCY'], a['DecorCZ'] = (round(c[i] + q[i], 2) for i in range(3))
            if 'DecorBob' in a:
                a['DecorBob'] = round(a['DecorBob'] * s, 2)
    if n.get('c') == 'PointLight':
        n['range'] = min(60, round(n['range'] * s, 1))
    if n.get('c') == 'Model':
        q = _apply(R, tuple((n['pivot'][i] - c[i]) * s for i in range(3)))
        n['pivot'][0:3] = [round(c[i] + q[i], 2) for i in range(3)]
    for k in n.get('k', []):
        _tx(k, c, R, s)

def parts_of(n):
    if n.get('c') == 'Part':
        yield n
    for k in n.get('k', []):
        yield from parts_of(k)

def extent_box(n, c):
    """Comme extent, mais avec l'emprise réelle des boîtes orientées (plus juste pour les grosses pièces)."""
    r, ylo, yhi = 0, 1e9, -1e9
    for p in parts_of(n):
        m, h = p['cf'], [v / 2 for v in p['size']]
        ex = [abs(m[3 + i * 3]) * h[0] + abs(m[4 + i * 3]) * h[1] + abs(m[5 + i * 3]) * h[2] for i in range(3)]
        r = max(r, math.hypot(abs(m[0] - c[0]) + ex[0], abs(m[2] - c[2]) + ex[2]))
        ylo, yhi = min(ylo, m[1] - ex[1]), max(yhi, m[1] + ex[1])
    return r, ylo, yhi

def extent(n, c):
    r, ylo, yhi = 0, 1e9, -1e9
    for p in parts_of(n):
        m, sz = p['cf'], p['size']
        half = math.sqrt(sum(v * v for v in sz)) / 2
        r = max(r, math.hypot(m[0] - c[0], m[2] - c[2]) + half)
        ylo, yhi = min(ylo, m[1] - half), max(yhi, m[1] + half)
    return r, ylo, yhi

IDENT = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
LANDMARKS = {'CraneDragonX', 'EcranGeant', 'CartonFragile', 'FontaineChocolat', 'PresseGeante', 'PopItGeant', 'Baleine', 'Volcan', 'GrillePain',
             'ArcheGlacier', 'CraneDragon', 'EcranChargement', 'SoleilSynthwave', 'PlaneteAnneaux', 'StationSpatiale', 'OeufDuDragon'}
GROW_MAX = {'Geyser': 1.15, 'Bulle': 1.5, 'Guimauve': 1.6, 'FeuFollet': 1.4, 'Canard': 1.7, 'Asteroide': 1.8, 'Lune': 1.2,
            'Comete': 1.0, 'CurseurGeant': 1.6, 'CoeurPixel': 1.6, 'HandSpinner': 1.6, 'TartineVolante': 1.6, 'Soucoupe': 1.5}
FIXED = {'CraneDragon', 'AuroreBoreale', 'SoleilSynthwave', 'PlaneteAnneaux', 'RochersFlottants'}

def grow(L, n):
    """Agrandit un modèle autour de son pivot, le plus possible sans toucher le parcours."""
    if n['n'] in FIXED:
        return
    if n.get('c') == 'Folder':
        for k in n['k']:
            grow(L, k)
        return
    c = tuple(n['pivot'][0:3])
    target = GROW_MAX.get(n['n'], 1.35 if n['n'] in LANDMARKS else 1.9)
    base = json.loads(json.dumps(n))
    for s in [target - 0.15 * i for i in range(int((target - 1) / 0.15) + 1)] + [1.0]:
        cand = json.loads(json.dumps(base))
        transform([cand], c, IDENT, s)
        r, ylo, yhi = extent(cand, c)
        if L.clear(c[0], c[2], r, ylo, yhi, margin=4):
            n.clear()
            n.update(cand)
            return

# ================================================================== placement
class Level:
    def __init__(self, i):
        self.i, self.ride, self.floor, self.z0 = i, ride(i), floor_y(i), z0(i)
        self.boxes = BOXES.get('Level%d' % i, [])
        self.taken = []
        self.rng = random.Random(4000 + i)
        self.kids = []

    def clear_aabb(self, n, margin=4):
        """Vérifie l'emprise exacte (boîte englobante) d'un modèle : ni parcours, ni paroi du canyon."""
        lo, hi = [1e9] * 3, [-1e9] * 3
        for p in parts_of(n):
            m, h = p['cf'], [v / 2 for v in p['size']]
            for i in range(3):
                e = abs(m[3 + i * 3]) * h[0] + abs(m[4 + i * 3]) * h[1] + abs(m[5 + i * 3]) * h[2]
                lo[i], hi[i] = min(lo[i], m[i] - e), max(hi[i], m[i] + e)
        if lo[0] < -166 or hi[0] > 166:
            return False
        for b in self.boxes:
            if b[0] < hi[0] + margin and b[1] > lo[0] - margin and b[2] < hi[1] and b[3] > lo[1] and b[4] < hi[2] + margin and b[5] > lo[2] - margin:
                return False
        return True

    def clear(self, x, z, r, ylo, yhi, margin=6):
        R = r + margin
        for b in self.boxes:
            dx = max(b[0] - x, 0, x - b[1])
            dz = max(b[4] - z, 0, z - b[5])
            if dx * dx + dz * dz < R * R and b[3] >= ylo and b[2] <= yhi:
                return False
        return abs(x) + r < 166

    def spot(self, r, zr, xr=(70, 150), side=None, ylo=None, yhi=None, spacing=0, tries=600):
        ylo = self.floor if ylo is None else ylo
        yhi = self.ride + 450 if yhi is None else yhi
        for _ in range(tries):
            s = side if side else self.rng.choice([-1, 1])
            x = s * self.rng.uniform(*xr)
            z = self.z0 + self.rng.uniform(*zr)
            x, z = snap(x, 1), snap(z, 1)
            if self.clear(x, z, r, ylo, yhi) and all(math.hypot(x - a, z - b) > spacing + r + rr for a, b, rr in self.taken):
                self.taken.append((x, z, r))
                return x, z, s
        return None

    def facing(self, x):
        """Lacet pour que le +Z local regarde l'axe de la piste."""
        return -90 if x > 0 else 90

def slots(n, a=120, b=1250):
    """n créneaux de z répartis régulièrement sur le niveau (chevauchement léger pour trouver de la place)."""
    step = (b - a) / n
    return [(a + k * step, a + (k + 1.4) * step) for k in range(n)]

LEVEL_BUILDERS = {}
def level(i):
    def deco(fn):
        LEVEL_BUILDERS[i] = fn
        return fn
    return deco

# ================================================================== briques communes
def rock_cluster(c, hexes, r, rng, h=None, mat='studs'):
    """Rocher massif en studs : blocs empilés et tournés par 15°, silhouette nette."""
    h = h or r * 1.2
    out = []
    for k in range(5):
        s = r * (1 - k * 0.16)
        out.append(box(hexes[k % len(hexes)], (c[0] + rng.uniform(-0.2, 0.2) * r, c[1] + k * h / 5 + h / 10, c[2] + rng.uniform(-0.2, 0.2) * r),
                       (s * 1.6, h / 5 + 0.2, s * 1.4), yaw=15 * rng.randint(0, 5), mat=mat))
    return out

def glow_pool(c, r, hexv, light=True):
    return [cyl(hexv, (c[0], c[1] - 0.4, c[2]), r, 0.8, mat='neon', light=(hexv, r * 2.5, 2) if light else None)]

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
    '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
    ' ': ['00000'] * 7,
}

def pixel_text(text, origin, yaw, px, hexv, depth=0.6, mat='neon'):
    """Texte pixel posé sur un plan vertical : `origin` = centre, le texte regarde +Z local."""
    out = []
    w = len(text) * 6 - 1
    for ci, ch in enumerate(text):
        g = FONT.get(ch, FONT[' '])
        for row, line in enumerate(g):
            for col, bit in enumerate(line):
                if bit == '1':
                    lx = (ci * 6 + col - (w - 1) / 2) * px
                    ly = (3 - row) * px
                    out.append(box(hexv, rot_pt((lx, ly, 0), yaw, origin), (px * 0.92, px * 0.92, depth), yaw=yaw, mat=mat))
    return out

# ================================================================== 1. CLAVIER : le bureau géant
@level(1)
def build_1(L):
    F, rng = L.floor, L.rng
    BLUE, BLUE_L, WHITE, KEY_SIDE, DARK = '60a5fa', 'c8e1ff', 'fafaff', 'c4cadc', '1d2233'
    # Écran géant (repère au fond)
    s = L.spot(40, (950, 1200), (95, 125))
    if s:
        x, z, side = s
        yaw = L.facing(x)
        o = (x, F, z)
        k = []
        k.append(cyl(DARK, (x, F - 4, z), 22, 5, mat='studs'))                        # pied
        k.append(box(DARK, rot_pt((0, 30, -4), yaw, o), (8, 60, 8), yaw=yaw, mat='studs'))  # cou
        k.append(box(DARK, rot_pt((0, 78, 0), yaw, o), (96, 58, 6), yaw=yaw, mat='studs'))  # cadre
        k.append(box(BLUE, rot_pt((0, 80, 3.2), yaw, o), (88, 48, 0.6), yaw=yaw, mat='neon', light=(BLUE, 60, 2)))
        k += pixel_text('GO!', rot_pt((0, 82, 3.8), yaw, o), yaw, 4.4, WHITE)
        k.append(box('2a3350', rot_pt((0, 52.5, 3.2), yaw, o), (96, 3, 0.8), yaw=yaw))   # menton
        k.append(ball('3dff7a', rot_pt((40, 52.5, 3.8), yaw, o), 1.1, mat='neon'))       # voyant
        L.kids.append(model('EcranGeant', o, k, yaw))
    # Souris géante à moitié dans la lave, câble qui plonge
    for zr in [(300, 520), (760, 900)]:
      s = L.spot(20, zr, (90, 140), spacing=60)
      if s:
        x, z, side = s
        yaw = L.facing(x) + 30
        o = (x, F, z)
        k = [ell(WHITE, (x, F + 4, z), 14, 9, 20, yaw=yaw, mat='smooth'),
             ell(KEY_SIDE, (x, F + 1, z), 14.3, 4, 20.3, yaw=yaw),
             box(DARK, rot_pt((0, 12.6, -8), yaw, o), (0.6, 2, 12), yaw=yaw),
             disc('3a6bff', rot_pt((0, 12.4, -9), yaw, o), 1.6, 2.2, axis=mat3(yaw)[0], mat='neon')]
        a = rot_pt((0, 4, -20), yaw, o)
        pts = [a]
        for t in range(1, 7):
            pts.append(rot_pt((math.sin(t * 0.7) * 6, 4 + math.sin(t / 6 * math.pi) * 22, -20 - t * 9), yaw, o))
        pts.append(rot_pt((4, -6, -84), yaw, o))
        for i in range(len(pts) - 1):
            k.append(rod(DARK, pts[i], pts[i + 1], 1.6))
            k.append(ball(DARK, pts[i + 1], 1.6))
        L.kids.append(model('SourisGeante', o, k, yaw))

    # Câble USB qui jaillit de la lave en arche, prise en l'air
    for zr in [(130, 300), (560, 760)]:
      s = L.spot(12, zr, (95, 145), spacing=60)
      if s:
        x, z, side = s
        yaw = L.facing(x)
        o = (x, F, z)
        k = []
        prev = None
        for t in range(13):
            a = t / 12 * math.pi * 0.9
            p = rot_pt((0, math.sin(a) * 46, -math.cos(a) * 26), yaw, o)
            if prev:
                k.append(rod('2d2f3a', prev, p, 2.2))
                k.append(ball('2d2f3a', p, 2.2))
            prev = p
        k.append(box('b9c0cc', rot_pt((0, 26, 28), yaw, o), (6, 5, 12), yaw=yaw, pitch=-60, mat='metal'))
        k.append(box('27e8ff', rot_pt((0, 30, 32), yaw, o), (4, 1.2, 6), yaw=yaw, pitch=-60, mat='neon', light=('27e8ff', 18, 2)))
        L.kids.append(model('CableUSB', o, k, yaw))
    # Touches géantes qui flottent et tournent lentement
    keys = folder('TouchesFlottantes', [])
    for n, (label, zr) in enumerate(zip(['W', 'A', 'S', 'D', 'E', 'R', 'F', 'G'], slots(8))):
        s = L.spot(10, zr, (100, 145), ylo=L.ride + 40, yhi=L.ride + 120, spacing=20)
        if not s:
            continue
        x, z, side = s
        y = L.ride + rng.uniform(65, 95)
        yaw = L.facing(x)
        c = (x, y, z)
        k = [box(KEY_SIDE, (x, y - 2, z), (18, 6, 18), yaw=yaw, mat='studs'),
             box(WHITE, (x, y + 2, z), (15, 3, 15), yaw=yaw, mat='studs')]
        for row, line in enumerate(FONT[label]):          # lettre posée sur le dessus
            for col, bit in enumerate(line):
                if bit == '1':
                    p = rot_pt(((col - 2) * 1.8, 3.9, (row - 3) * 1.8), yaw, c)
                    k.append(box(BLUE, p, (1.6, 0.5, 1.6), yaw=yaw, mat='neon'))
        k = transform(k, c, rot_z(75 if x > 0 else -75))          # presque debout : la lettre regarde la piste
        with_attrs(k, bob(3, rng.uniform(4, 6), rng.uniform(0, 1)))
        keys['k'].append(model('Touche_' + label, c, k, yaw))
    L.kids.append(keys)

# ================================================================== 2. PAPIER BULLE : colis en fuite
@level(2)
def build_2(L):
    F, rng = L.floor, L.rng
    CARD, CARD_D, TAPE, RED, BUB = 'c9955b', 'a8773f', 'e6d3a3', 'e0303a', 'e9e4ff'
    def carton(o, size, yaw, pitch=0, roll=0, label=True):
        w, h, d = size
        k = [box(CARD, o, size, yaw=yaw, pitch=pitch, roll=roll, mat='studs'),
             box(TAPE, o, (w + 0.2, h + 0.2, 4), yaw=yaw, pitch=pitch, roll=roll, mat='smooth'),
             box(CARD_D, o, (w + 0.15, 1.2, d + 0.15), yaw=yaw, pitch=pitch, roll=roll)]
        if label:
            r, u = mat3(yaw, pitch, roll)
            back = cross(r, u)
            c = tuple(o[i] + back[i] * (d / 2 + 0.15) + u[i] * (h * 0.18) + r[i] * (w * 0.2) for i in range(3))
            k.append(box(RED, c, (w * 0.34, h * 0.16, 0.3), yaw=yaw, pitch=pitch, roll=roll))
            k.append(box('ffffff', tuple(c[i] + back[i] * 0.2 for i in range(3)), (w * 0.28, h * 0.05, 0.2), yaw=yaw, pitch=pitch, roll=roll))
        return k
    def bubble_sheet(o, w, h, yaw, pitch):
        r, u = mat3(yaw, pitch)
        back = cross(r, u)
        k = [box(BUB, o, (w, h, 0.4), yaw=yaw, pitch=pitch, mat='glass', transp=0.45)]
        n = int(w // 4)
        m = int(h // 4)
        for i in range(n):
            for j in range(m):
                lx, ly = (i - (n - 1) / 2) * 4, (j - (m - 1) / 2) * 4
                c = tuple(o[a] + r[a] * lx + u[a] * ly + back[a] * 0.6 for a in range(3))
                k.append(ball(BUB, c, 1.5, mat='glass', transp=0.35))
        return k
    # Grand carton ouvert, papier bulle qui déborde (repère)
    s = L.spot(34, (900, 1180), (100, 128))
    if s:
        x, z, side = s
        yaw = L.facing(x) + 15
        o = (x, F, z)
        k = []
        W, H, D = 54, 36, 44
        k.append(box(CARD, rot_pt((0, H / 2 - 6, 0), yaw, o), (W, H, D), yaw=yaw, mat='studs'))
        k.append(box('3a2a1a', rot_pt((0, H - 6.2, 0), yaw, o), (W - 3, 0.6, D - 3), yaw=yaw))
        for sgn in (-1, 1):                                             # rabats ouverts
            k.append(box(CARD_D, rot_pt((sgn * (W / 2 + 8), H - 3, 0), yaw, o), (18, 1.2, D), yaw=yaw, roll=sgn * -35, mat='studs'))
        k.append(box(TAPE, rot_pt((0, H / 2 - 6, D / 2 + 0.2), yaw, o), (6, H + 0.2, 0.4), yaw=yaw))
        k += pixel_text('FRAGILE', rot_pt((0, H / 2 - 6, D / 2 + 0.5), yaw, o), yaw, 1.3, RED, depth=0.4, mat='smooth')
        k += bubble_sheet(rot_pt((0, H + 6, 4), yaw, o), 40, 20, yaw, -20)
        k += bubble_sheet(rot_pt((10, H + 2, -12), yaw, o), 28, 16, yaw + 40, 25)
        L.kids.append(model('CartonFragile', o, k, yaw))
    # Cartons à moitié engloutis
    for n, zr in enumerate(slots(6, 120, 900)):
        s = L.spot(16, zr, (90, 150), spacing=50)
        if not s:
            continue
        x, z, side = s
        yaw = L.facing(x) + rng.choice([-30, -15, 15, 30])
        size = (rng.choice([20, 24, 28]), rng.choice([18, 22]), rng.choice([18, 22]))
        o = (x, F + size[1] * 0.2, z)
        k = carton(o, size, yaw, pitch=rng.choice([-20, -12, 12, 20]), roll=rng.choice([-15, 10]))
        if n % 2 == 0:
            k += carton((x + rng.uniform(-4, 4), F + size[1] * 0.2 + size[1] * 0.75, z + rng.uniform(-4, 4)), (14, 12, 14), yaw + 30, pitch=8, label=False)
        L.kids.append(model('CartonEngloutie', (x, F, z), k, yaw))
    # Bulles qui montent (verre), en grappes au-dessus des côtés
    bulles = folder('Bulles', [])
    for n, zr in enumerate(slots(14)):
        s = L.spot(6, zr, (80, 150), ylo=L.ride + 10, yhi=L.ride + 140, spacing=10)
        if not s:
            continue
        x, z, side = s
        y = L.ride + rng.uniform(25, 110)
        r = rng.uniform(3, 7)
        k = [ball(BUB, (x, y, z), r, mat='glass', transp=0.4), ball('ffffff', (x - r * 0.35, y + r * 0.35, z - r * 0.35), r * 0.18, mat='neon')]
        bulles['k'].append(model('Bulle', (x, y, z), with_attrs(k, bob(r * 0.8, rng.uniform(5, 8), rng.uniform(0, 1)))))
    L.kids.append(bulles)

# ================================================================== 3. CHOCOLAT : la chocolaterie
@level(3)
def build_3(L):
    F, rng = L.floor, L.rng
    CHOC, CHOC_D, CHOC_L, CREAM, STRAW, LEAF, PINK = '6b3b24', '4a2616', '8f5434', 'fff6ee', 'e0303a', '4f8a2a', 'ffc2e0'
    # Fontaine de chocolat (repère)
    s = L.spot(32, (900, 1180), (100, 130))
    if s:
        x, z, side = s
        o = (x, F, z)
        k = [cyl(CHOC_D, (x, F - 4, z), 30, 8, mat='studs'), cyl(CHOC, (x, F + 3.5, z), 28, 0.8)]
        y = F + 4
        for i, (r, h) in enumerate([(22, 16), (15, 14), (9, 12)]):
            k.append(cyl('d9d4c7', (x, y, z), 3 - i * 0.6, h, mat='metal'))           # colonne
            y += h
            k.append(cyl('d9d4c7', (x, y, z), r, 2.5, mat='metal'))                  # vasque
            k.append(cyl(CHOC, (x, y + 2.4, z), r - 0.8, 0.6))                      # chocolat
            for a in range(12):                                                     # rideau qui coule
                ang = a * math.tau / 12
                top = (x + math.cos(ang) * (r + 0.3), y + 1.5, z + math.sin(ang) * (r + 0.3))
                bot = (x + math.cos(ang) * (r + 1.2), y - 9, z + math.sin(ang) * (r + 1.2))
                k.append(rod(CHOC_L if a % 2 else CHOC, top, bot, 1.3))
            y += 2.5
        k.append(ball(CHOC, (x, y + 3, z), 5))
        for a in range(6):                                                         # fraises en brochette
            ang = a * math.tau / 6 + 0.3
            b = (x + math.cos(ang) * 26, F + 4, z + math.sin(ang) * 26)
            t = (x + math.cos(ang) * 24, F + 26, z + math.sin(ang) * 24)
            k.append(rod('e8d2a0', b, t, 0.5))
            k.append(ell(STRAW, (t[0], t[1] + 2, t[2]), 2.6, 3.4, 2.6))
            k.append(cyl(LEAF, (t[0], t[1] + 5, t[2]), 1.8, 0.6))
        L.kids.append(model('FontaineChocolat', o, k))
    # Tablettes plantées dans la lave
    for n, zr in enumerate(slots(6, 120, 900)):
        s = L.spot(14, zr, (95, 150), spacing=45)
        if not s:
            continue
        x, z, side = s
        yaw = L.facing(x) + rng.choice([-20, 0, 20])
        pitch = rng.choice([-25, -18, 18, 25])
        o = (x, F + 8, z)
        k = [box(CHOC_D, o, (22, 30, 3), yaw=yaw, pitch=pitch, mat='smooth')]
        r, u = mat3(yaw, pitch)
        back = cross(r, u)
        for i in range(3):
            for j in range(4):
                c = tuple(o[a] + r[a] * ((i - 1) * 7) + u[a] * ((j - 1.5) * 7) + back[a] * 1.8 for a in range(3))
                k.append(box(CHOC, c, (6, 6, 1.2), yaw=yaw, pitch=pitch))
        L.kids.append(model('Tablette', (x, F, z), k, yaw))
    # Montagnes de chantilly avec cerise
    for n, zr in enumerate(slots(4, 180, 1100)):
        s = L.spot(14, zr, (90, 150), spacing=50)
        if not s:
            continue
        x, z, side = s
        o = (x, F, z)
        k = []
        for i in range(7):
            r = 13 - i * 1.7
            ang = i * 0.9
            k.append(ball(CREAM, (x + math.cos(ang) * 1.5, F + i * 3.4, z + math.sin(ang) * 1.5), r))
        k.append(ball(STRAW, (x, F + 26, z), 3))
        k.append(rod(LEAF, (x, F + 28.5, z), (x + 2, F + 33, z), 0.35))
        L.kids.append(model('Chantilly', o, k))
    # Guimauves qui flottent
    g = folder('Guimauves', [])
    for n, zr in enumerate(slots(10)):
        s = L.spot(5, zr, (85, 150), ylo=L.ride + 10, yhi=L.ride + 120, spacing=10)
        if not s:
            continue
        x, z, side = s
        y = L.ride + rng.uniform(35, 95)
        c = (x, y, z)
        k = [_part(2, PINK if n % 2 else CREAM, c, mat3(0, rng.choice([0, 30, 60]), 90)[0], mat3(0, rng.choice([0, 30, 60]), 90)[1], (7, 8, 8))]
        g['k'].append(model('Guimauve', c, with_attrs(k, bob(3, rng.uniform(4, 7), rng.uniform(0, 1)))))
    L.kids.append(g)

# ================================================================== 4. ÉCRASEURS : l'usine
@level(4)
def build_4(L):
    F, rng = L.floor, L.rng
    STEEL, STEEL_D, YEL, BLK, BRICK, GREEN = '8a96a3', '3a4656', 'ffc21a', '1d2126', '9c4a3a', '5ac86e'
    def stripes(c, w, h, yaw, n=8):
        out = []
        for i in range(n):
            out.append(box(YEL if i % 2 else BLK, rot_pt(((i - (n - 1) / 2) * w / n, 0, 0), yaw, c), (w / n, h, 0.4), yaw=yaw, roll=0))
        return out
    # Presse hydraulique géante (repère), le pilon cogne
    s = L.spot(30, (900, 1180), (100, 128))
    if s:
        x, z, side = s
        yaw = L.facing(x)
        o = (x, F, z)
        k = [box(STEEL_D, rot_pt((0, 2, 0), yaw, o), (56, 12, 36), yaw=yaw, mat='studs')]
        for sgn in (-1, 1):
            k.append(box(STEEL, rot_pt((sgn * 23, 45, 0), yaw, o), (8, 90, 12), yaw=yaw, mat='studs'))
        k.append(box(STEEL_D, rot_pt((0, 94, 0), yaw, o), (58, 12, 16), yaw=yaw, mat='studs'))
        k += stripes(rot_pt((0, 94, 8.3), yaw, o), 56, 4, yaw, 14)
        k.append(box(STEEL, rot_pt((0, 10, 0), yaw, o), (30, 4, 24), yaw=yaw, mat='metal'))       # enclume
        piston = [cyl('d9dde3', rot_pt((0, 58, 0), yaw, o), 4, 30, mat='metal'),
                  box(STEEL_D, rot_pt((0, 54, 0), yaw, o), (34, 8, 26), yaw=yaw, mat='studs')]
        piston += stripes(rot_pt((0, 54, 13.3), yaw, o), 34, 3, yaw, 10)
        k += with_attrs(piston, bob(18, 3.2, 0))
        k.append(ball('ff3b30', rot_pt((0, 102, 0), yaw, o), 2.4, mat='neon', light=('ff3b30', 30, 3)))
        L.kids.append(model('PresseGeante', o, k, yaw))
    # Cheminées d'usine qui fument
    for n, zr in enumerate(slots(4, 140, 900)):
        s = L.spot(10, zr, (110, 150), spacing=60)
        if not s:
            continue
        x, z, side = s
        H = rng.choice([80, 95, 110])
        k = [cyl(BRICK, (x, F - 4, z), 8, H + 4, mat='studs')]
        for b in range(3):
            k.append(cyl(BLK if b % 2 else 'e8e8e8', (x, F + H * (0.35 + b * 0.2), z), 8.3, 3))
        k.append(cyl(STEEL_D, (x, F + H, z), 9, 3))
        smoke = [ball('6d7280' if j % 2 else '8a8f99', (x + j * 3, F + H + 9 + j * 10, z + j * 1.5), 6 + j * 1.8) for j in range(5)]
        k += with_attrs(smoke, bob(3, 5, rng.uniform(0, 1)))
        L.kids.append(model('Cheminee', (x, F, z), k))
    # Pylônes à engrenages qui tournent
    for n, zr in enumerate(slots(4, 200, 1100)):
        s = L.spot(14, zr, (95, 145), spacing=60)
        if not s:
            continue
        x, z, side = s
        yaw = L.facing(x)
        o = (x, F, z)
        H = 60
        k = []
        for sgn in (-1, 1):
            k.append(beam(STEEL_D, rot_pt((sgn * 8, -2, 0), yaw, o), rot_pt((sgn * 2, H, 0), yaw, o), 3, 3, mat='studs'))
        for h in range(4):
            y = 8 + h * 13
            k.append(beam(STEEL, rot_pt((-7 + h * 1.4, y, 0), yaw, o), rot_pt((7 - h * 1.4, y, 0), yaw, o), 1.6, 1.6))
        c = rot_pt((0, H + 4, 2), yaw, o)
        axis = norm(cross(mat3(yaw)[0], (0, 1, 0)))
        R = 16
        gear = [disc(STEEL if n % 2 else 'c97a45', c, R, 3, axis=axis, mat='metal')]
        r, _ = mat3(yaw)
        for t in range(14):
            a = t * math.tau / 14
            p = tuple(c[i] + r[i] * math.cos(a) * R + (0, 1, 0)[i] * math.sin(a) * R for i in range(3))
            up_ = tuple(r[i] * math.cos(a) + (0, 1, 0)[i] * math.sin(a) for i in range(3))
            gear.append(_part(1, STEEL if n % 2 else 'c97a45', p, norm(cross(up_, axis)), up_, (4.4, 4.2, 3), mat='metal'))
        gear.append(disc(GREEN, c, R * 0.35, 3.4, axis=axis, mat='neon', light=(GREEN, 25, 2)))
        k += with_attrs(gear, turn(rng.choice([-1, 1]) * rng.uniform(10, 16), 2 if abs(axis[2]) > 0.5 else 0, c))
        L.kids.append(model('PyloneEngrenage', o, k, yaw))

# ================================================================== 5. POP IT
@level(5)
def build_5(L):
    F, rng = L.floor, L.rng
    RAINBOW = ['ff5a6e', 'ff9f40', 'ffd23c', '5ad26e', '50a0ff', 'a06eff']
    def popit(o, rows, cols, cell, yaw, pitch, frame='ffffff'):
        r, u = mat3(yaw, pitch)
        back = cross(r, u)
        W, H = cols * cell + 2, rows * cell + 2
        k = [box(frame, o, (W, H, 2.4), yaw=yaw, pitch=pitch, mat='smooth')]
        for j in range(rows):
            col = RAINBOW[j % len(RAINBOW)]
            k.append(box(col, tuple(o[a] + u[a] * ((j - (rows - 1) / 2) * cell) + back[a] * 1.25 for a in range(3)), (W - 1.2, cell, 0.2), yaw=yaw, pitch=pitch))
            for i in range(cols):
                c = tuple(o[a] + r[a] * ((i - (cols - 1) / 2) * cell) + u[a] * ((j - (rows - 1) / 2) * cell) + back[a] * 1.3 for a in range(3))
                k.append(ell(col, c, cell * 0.38, cell * 0.38, cell * 0.22, yaw=yaw, pitch=pitch))
        return k
    # Pop-it géant dressé (repère)
    s = L.spot(34, (900, 1180), (100, 128))
    if s:
        x, z, side = s
        yaw = L.facing(x)
        o = (x, F + 34, z)
        k = popit(o, 6, 6, 10, yaw, 0)
        k.append(cyl('ffffff', (x, F - 3, z), 12, 6, mat='studs'))
        k.append(box('ffffff', (x, F + 2, z), (6, 8, 6), yaw=yaw))
        L.kids.append(model('PopItGeant', (x, F, z), k, yaw))
    # Pop-its plantés en biais
    for n, zr in enumerate(slots(6, 120, 900)):
        s = L.spot(15, zr, (95, 150), spacing=45)
        if not s:
            continue
        x, z, side = s
        yaw = L.facing(x) + rng.choice([-25, 25])
        k = popit((x, F + 10, z), 3, 4, 6, yaw, rng.choice([-30, 30]))
        L.kids.append(model('PopIt', (x, F, z), k, yaw))
    # Hand spinners qui tournent dans les airs
    sp = folder('HandSpinners', [])
    for n, zr in enumerate(slots(8)):
        s = L.spot(12, zr, (90, 145), ylo=L.ride + 30, yhi=L.ride + 130, spacing=20)
        if not s:
            continue
        x, z, side = s
        y = L.ride + rng.uniform(55, 100)
        c = (x, y, z)
        col = RAINBOW[n % len(RAINBOW)]
        k = [cyl('2a2f3a', (x, y - 1.2, z), 4, 2.4, mat='metal'), cyl(col, (x, y - 1.4, z), 2.2, 2.8, mat='neon')]
        for a in range(3):
            ang = a * math.tau / 3
            p = (x + math.cos(ang) * 8, y, z + math.sin(ang) * 8)
            k.append(rod(col, (x, y, z), p, 2.2))
            k.append(cyl(col, (p[0], y - 1.2, p[2]), 4.2, 2.4, mat='smooth'))
            k.append(cyl('d9dde3', (p[0], y - 1.3, p[2]), 2.4, 2.6, mat='metal'))
        k = transform(k, c, rot_z(90))                             # face à la piste
        with_attrs(k, turn(rng.choice([-1, 1]) * rng.uniform(3, 6), 0, c))
        sp['k'].append(model('HandSpinner', c, k))
    L.kids.append(sp)

# ================================================================== 6. MER DE SQUISHIES
@level(6)
def build_6(L):
    F, rng = L.floor, L.rng
    WHALE, BELLY, SPRAY, DUCK, BEAK = '4f7fd9', 'cfe3ff', 'bff4ff', 'ffd84a', 'ff8a1e'
    # Baleine qui souffle (repère)
    s = L.spot(36, (880, 1180), (100, 126))
    if s:
        x, z, side = s
        yaw = L.facing(x) + 90
        o = (x, F, z)
        k = [ell(WHALE, rot_pt((0, 6, 0), yaw, o), 17, 14, 30, yaw=yaw),
             ell(BELLY, rot_pt((0, 1, 2), yaw, o), 15, 9, 27, yaw=yaw),
             ell(WHALE, rot_pt((0, 10, -30), yaw, o), 6, 5, 10, yaw=yaw, pitch=20)]
        for sgn in (-1, 1):
            k.append(ell(WHALE, rot_pt((sgn * 10, 13, -40), yaw, o), 11, 1.6, 5, yaw=yaw + sgn * 30))       # queue
            k.append(ell(WHALE, rot_pt((sgn * 16, 2, 10), yaw, o), 8, 1.4, 4, yaw=yaw + sgn * 40, roll=sgn * 25))  # nageoires
            k.append(ball('ffffff', rot_pt((sgn * 15.5, 9, 18), yaw, o), 2.2))
            k.append(ball('1b2440', rot_pt((sgn * 16.4, 9, 18.6), yaw, o), 1.3))
            k.append(ell('ff9ab8', rot_pt((sgn * 14.5, 5.5, 20), yaw, o), 2.2, 1.2, 1, yaw=yaw))
        spray = [cyl(SPRAY, rot_pt((0, 19, 8), yaw, o), 1.6, 14, mat='neon')]
        for a in range(8):
            ang = a * math.tau / 8
            spray.append(ball(SPRAY, rot_pt((math.cos(ang) * 5, 34 + (a % 2) * 2, 8 + math.sin(ang) * 5), yaw, o), 2.2, mat='neon'))
        k += with_attrs(spray, bob(3, 2.4, 0))
        k += with_attrs([], {})
        L.kids.append(model('Baleine', o, with_attrs(k, bob(1.5, 6, 0.2)) , yaw))
    # Méduses qui ondulent
    for n, zr in enumerate(slots(7, 120, 900)):
        s = L.spot(10, zr, (90, 150), spacing=40)
        if not s:
            continue
        x, z, side = s
        y = F + rng.uniform(22, 40)
        col = ['ff7ad9', 'a67bff', '7ad9ff'][n % 3]
        c = (x, y, z)
        k = [ell(col, (x, y + 3, z), 9, 8, 9, mat='glass', transp=0.3), ell('ffffff', (x, y + 3.5, z), 5.5, 5, 5.5, mat='neon', light=(col, 25, 2)),
             cyl(col, (x, y - 1.5, z), 9.2, 1.5, mat='glass', transp=0.35)]
        for t in range(10):
            ang = t * math.tau / 10
            prev = (x + math.cos(ang) * 7.5, y - 1.5, z + math.sin(ang) * 7.5)
            for j in range(1, 5):
                p = (x + math.cos(ang + math.sin(j * 1.3) * 0.25) * (7.5 - j * 0.8) + math.sin(j * 1.7 + t) * 1.2, y - 1.5 - j * 5,
                     z + math.sin(ang + math.sin(j * 1.3) * 0.25) * (7.5 - j * 0.8))
                k.append(rod(col if j < 4 else 'ffffff', prev, p, 0.45 - j * 0.06, mat='glass' if j < 4 else 'neon', transp=0.2 if j < 4 else 0))
                prev = p
        L.kids.append(model('Meduse', c, with_attrs(k, bob(4, rng.uniform(4, 6), rng.uniform(0, 1)))))
    # Canards en plastique qui flottent
    ducks = folder('Canards', [])
    for n, zr in enumerate(slots(10)):
        s = L.spot(7, zr, (85, 155), spacing=25)
        if not s:
            continue
        x, z, side = s
        yaw = rng.choice([0, 45, 90, 135, 180, 225, 270, 315])
        o = (x, F, z)
        k = [ell(DUCK, rot_pt((0, 3, 0), yaw, o), 6, 4.2, 8, yaw=yaw),
             ball(DUCK, rot_pt((0, 9, 4.5), yaw, o), 3.6),
             ell(BEAK, rot_pt((0, 8.4, 8), yaw, o), 1.8, 0.8, 1.6, yaw=yaw),
             ell(DUCK, rot_pt((0, 6, -7), yaw, o), 2.4, 2.2, 2, yaw=yaw, pitch=-30)]
        for sgn in (-1, 1):
            k.append(ball('1b2440', rot_pt((sgn * 1.6, 10, 7.3), yaw, o), 0.6))
        ducks['k'].append(model('Canard', o, with_attrs(k, bob(1.2, rng.uniform(3, 5), rng.uniform(0, 1))), yaw))
    L.kids.append(ducks)

# ================================================================== 7. LAVE ROSE : le cœur du volcan
@level(7)
def build_7(L):
    F, rng = L.floor, L.rng
    PINK, PINK_L, PINK_D = 'ff46c8', 'ffb0ea', 'c21a8f'
    BAS, BAS_D, BAS_L = '2a2323', '1c1716', '433836'
    s = L.spot(64, (880, 1180), (92, 102))
    if s:                                                   # volcan : profil concave en gradins nets
        x, z, side = s
        o = (x, F, z)
        R, H, steps = 60, 120, 14
        prof = lambda t: R * (1 - t) ** 1.55 + R * 0.17
        k = []
        for i in range(steps):
            t = i / steps
            r = prof(t)
            h = H / steps
            k.append(cyl(BAS if i % 2 else BAS_D, (x, F - 6 + i * h, z), r, h + (6 if i == 0 else 0.05), mat='studs'))
        top = F - 6 + H
        rc = prof(1) * 1.02
        for a in range(12):
            ang = a * math.tau / 12
            k.append(box(BAS_L, (x + math.cos(ang) * rc, top + 2.5, z + math.sin(ang) * rc), (rc * 0.52, 5 + (a % 3) * 1.5, 4), yaw=-math.degrees(ang) + 90, mat='studs'))
        k.append(cyl(PINK, (x, top - 1, z), rc * 0.92, 2.2, mat='neon', light=(PINK, 80, 4)))
        for j in range(6):                                  # coulées nettes : une par sixième, collées au profil
            ang = j * math.tau / 6 + 0.2
            prev = None
            for s_ in range(10):
                t = 1 - s_ / 9
                p = (x + math.cos(ang) * (prof(t) + 0.8), F - 6 + t * H + 0.4, z + math.sin(ang) * (prof(t) + 0.8))
                if prev:
                    k.append(rod(PINK if s_ % 2 else PINK_D, prev, p, 2.6 - s_ * 0.12, mat='neon'))
                prev = p
            k.append(cyl(PINK, (prev[0], F - 0.3, prev[2]), 6, 0.8, mat='neon'))
        smoke = [ball('5b4a55' if j % 2 else '463a42', (x + j * 2, top + 14 + j * 11, z), 7 + j * 2) for j in range(5)]
        k += with_attrs(smoke, bob(2.5, 6, 0))
        L.kids.append(model('Volcan', o, k))
    s = L.spot(14, (450, 800), (100, 135), spacing=80)
    if s:                                                   # l'œuf du dragon sur son piton
        x, z, side = s
        o = (x, F, z)
        H = 56
        k = [cyl(BAS if i % 2 else BAS_D, (x, F - 6 + i * H / 6, z), 11 - i * 1.25, H / 6 + 0.05, mat='studs') for i in range(6)]
        top = F - 6 + H
        k.append(cyl(BAS_L, (x, top, z), 7, 1.2, mat='studs'))
        k.append(ell('3f7d3a', (x, top + 6.2, z), 3.6, 5.2, 3.6))
        for a in range(8):
            ang = a * math.tau / 8
            k.append(ball('f2b632', (x + math.cos(ang) * 3.3, top + 4.6 + (a % 3) * 1.6, z + math.sin(ang) * 3.3), 0.6, mat='neon'))
        k.append(cyl(PINK, (x, top + 1.1, z), 5, 0.4, mat='neon', light=(PINK, 30, 3)))
        for a in range(4):
            ang = a * math.tau / 4 + math.pi / 4
            b = (x + math.cos(ang) * 7, top + 1, z + math.sin(ang) * 7)
            m1 = (x + math.cos(ang) * 8, top + 8, z + math.sin(ang) * 8)
            t = (x + math.cos(ang) * 4.5, top + 13, z + math.sin(ang) * 4.5)
            k += [rod('8e1422', b, m1, 1.2), ball('8e1422', m1, 1.2), rod('8e1422', m1, t, 0.9), rod('f2b632', t, (x + math.cos(ang) * 3.2, top + 14.2, z + math.sin(ang) * 3.2), 0.5)]
        L.kids.append(model('OeufDuDragon', o, k))
    for n, zr in enumerate(slots(6, 130, 900)):             # geysers
        s = L.spot(10, zr, (80, 150), spacing=40)
        if not s:
            continue
        x, z, side = s
        h = rng.uniform(20, 28)
        b = bob(h * 0.18, rng.uniform(2.6, 3.6), rng.uniform(0, 1))
        k = [box(BAS if a % 2 else BAS_D, (x + math.cos(a * math.tau / 8) * 7, F + 1.5, z + math.sin(a * math.tau / 8) * 7), (5, 3 + (a % 3), 4),
                 yaw=-a * 45 + 90, mat='studs') for a in range(8)]
        k.append(cyl(PINK_D, (x, F - 0.2, z), 6.5, 0.8, mat='neon'))
        jet = [cyl(PINK, (x, F, z), 3.8, h, mat='neon', transp=0.25, light=(PINK, 35, 3)), cyl(PINK_L, (x, F, z), 1.6, h * 0.8, mat='neon')]
        jet += [ball(PINK, (x + math.cos(a * math.tau / 8) * 5, F + h + (a % 2) * 1.5, z + math.sin(a * math.tau / 8) * 5), 1.9, mat='neon') for a in range(8)]
        k += with_attrs(jet, b)
        L.kids.append(model('Geyser', (x, F, z), k))
    for n, zr in enumerate(slots(5, 150, 1150)):            # aiguilles d'obsidienne en verre
        s = L.spot(12, zr, (80, 150), spacing=50)
        if not s:
            continue
        x, z, side = s
        lean = 12 if x > 0 else -12
        k = []
        for j, (dx, dz, hh, rr) in enumerate([(0, 0, 58, 5), (6, 3, 38, 3.4), (-5, 4, 30, 2.8)]):
            base = (x + dx, F - 2, z + dz)
            tip = (x + dx + math.sin(math.radians(lean)) * hh, F + hh, z + dz)
            k.append(rod('1b1426' if j % 2 else '34244d', base, tip, rr, mat='glass'))
            k.append(rod(PINK, tip, (tip[0] + math.sin(math.radians(lean)) * rr * 2, tip[1] + rr * 2, tip[2]), rr * 0.5, mat='neon'))
        L.kids.append(model('AiguilleObsidienne', (x, F, z), k))
    rocks = folder('RochersFlottants', [])
    for i in range(5):                                      # rochers flottants qui tournent
        side = -1 if i % 2 else 1
        cz = L.z0 + 200 + i * 230
        cy = L.ride + rng.uniform(80, 115)
        cx = side * 115
        if not L.clear(cx, cz, 30, cy - 30, cy + 20):
            continue
        r = rng.uniform(11, 15)
        x = cx + 14
        k = rock_cluster((x, cy - r * 0.5, cz), [BAS, BAS_L, BAS_D], r, rng, h=r)
        k += [cyl(BAS_D, (x, cy - r * 0.5 - (j + 1) * r * 0.3, cz), r * 0.5 * (1 - j * 0.24), r * 0.31, mat='studs') for j in range(4)]
        k.append(box(PINK, (x, cy - r * 0.2, cz), (r * 1.3, 0.4, 0.6), yaw=30, mat='neon'))
        rocks['k'].append(model('RocherFlottant', (x, cy, cz), with_attrs(k, turn(side * rng.uniform(40, 60), 1, (cx, cy, cz)))))
    L.kids.append(rocks)

# ================================================================== 8. BEURRE : le petit-déjeuner géant
@level(8)
def build_8(L):
    F, rng = L.floor, L.rng
    CHROME, TOAST, CRUST, BUTTER, PAN, SYRUP = 'c8ced6', 'e8b86a', 'a86b2d', 'ffe066', 'e0a458', '8a3d10'
    s = L.spot(30, (900, 1180), (100, 130))
    if s:                                                   # grille-pain géant, les tartines sautent
        x, z, side = s
        yaw = L.facing(x) + 90
        o = (x, F, z)
        k = [box(CHROME, rot_pt((0, 16, 0), yaw, o), (44, 40, 26), yaw=yaw, mat='metal'),
             box('9aa2ad', rot_pt((0, -2, 0), yaw, o), (46, 6, 28), yaw=yaw, mat='metal'),
             box('1d2126', rot_pt((0, 36.2, -5.5), yaw, o), (34, 0.6, 5), yaw=yaw),
             box('1d2126', rot_pt((0, 36.2, 5.5), yaw, o), (34, 0.6, 5), yaw=yaw),
             box('2a2f3a', rot_pt((23, 20, 0), yaw, o), (2, 6, 4), yaw=yaw),
             ball('ff3b30', rot_pt((22.5, 10, 8), yaw, o), 1.2, mat='neon', light=('ff7a1a', 20, 2))]
        for i, dz in enumerate((-5.5, 5.5)):
            toast = [box(TOAST, rot_pt((0, 40, dz), yaw, o), (26, 24, 3), yaw=yaw), box(CRUST, rot_pt((0, 40, dz), yaw, o), (27.4, 25.4, 2.6), yaw=yaw)]
            k += with_attrs(toast, bob(9, 3.5, i * 0.5))
        L.kids.append(model('GrillePain', o, k, yaw))
    for n, zr in enumerate(slots(3, 150, 900)):             # piles de pancakes au beurre et sirop
        s = L.spot(14, zr, (95, 145), spacing=60)
        if not s:
            continue
        x, z, side = s
        k = [cyl('f4f1ea', (x, F - 2, z), 15, 3, mat='smooth')]
        y = F + 1
        for i in range(7):
            k.append(cyl(PAN, (x, y, z), 12.5 - (i % 2) * 0.4, 3.2))
            k.append(cyl('c07a36', (x, y + 3.1, z), 12.2, 0.3))
            y += 3.4
        k.append(box(BUTTER, (x, y + 2, z), (7, 4, 7), yaw=15))
        for a in range(7):
            ang = a * math.tau / 7
            k.append(rod(SYRUP, (x + math.cos(ang) * 11, y, z + math.sin(ang) * 11), (x + math.cos(ang) * 12.8, y - 6 - (a % 3) * 3, z + math.sin(ang) * 12.8), 1.1))
        L.kids.append(model('PilePancakes', (x, F, z), k))
    for n, zr in enumerate(slots(5, 120, 1150)):            # blocs de beurre qui fondent, couteau planté
        s = L.spot(12, zr, (95, 150), spacing=50)
        if not s:
            continue
        x, z, side = s
        yaw = rng.choice([0, 15, 30, 45])
        o = (x, F, z)
        k = [box('f4f1ea', (x, F, z), (26, 2, 18), yaw=yaw), box(BUTTER, (x, F + 6, z), (18, 10, 12), yaw=yaw),
             cyl(BUTTER, (x, F + 1, z), 11, 0.6)]
        for a in range(5):
            p = rot_pt((-8 + a * 4, 11, 6.2), yaw, o)
            k.append(rod(BUTTER, p, (p[0], F + 3, p[2]), 1))
        blade = rot_pt((3, 16, 0), yaw, o)
        k.append(box(CHROME, blade, (1, 16, 5), yaw=yaw + 90, roll=12, mat='metal'))
        k.append(box('3a2418', rot_pt((4.6, 27, 0), yaw, o), (2, 10, 2.6), yaw=yaw + 90, roll=12))
        L.kids.append(model('BeurreFondant', o, k, yaw))
    toasts = folder('TartinesVolantes', [])
    for n, zr in enumerate(slots(8)):
        s = L.spot(9, zr, (95, 145), ylo=L.ride + 30, yhi=L.ride + 130, spacing=20)
        if not s:
            continue
        x, z, side = s
        c = (x, L.ride + rng.uniform(50, 90), z)
        k = [box(CRUST, c, (16, 17, 2.2)), box(TOAST, (c[0], c[1], c[2]), (14.6, 15.6, 2.6)),
             box(BUTTER, (c[0], c[1] + 1, c[2] + 1.6), (5, 4, 1.2), yaw=0, roll=10)]
        k = transform(k, c, [[1, 0, 0], [0, 1, 0], [0, 0, 1]])
        yaw = L.facing(x)
        k = transform(k, c, [[math.cos(math.radians(yaw)), 0, math.sin(math.radians(yaw))], [0, 1, 0], [-math.sin(math.radians(yaw)), 0, math.cos(math.radians(yaw))]])
        toasts['k'].append(model('TartineVolante', c, with_attrs(k, bob(4, rng.uniform(4, 6), rng.uniform(0, 1)))))
    L.kids.append(toasts)

# ================================================================== 9. GLACE : aurore boréale et icebergs
@level(9)
def build_9(L):
    F, rng = L.floor, L.rng
    ICE, ICE_D, SNOW, PINE, PINE_L, BARK = 'bfeaff', '7fb8e0', 'f2f8ff', '1f5b4a', '2b7a5f', '5a3d2b'
    def pine(base, h):
        k = [cyl(BARK, base, h * 0.06, h * 0.25)]
        for i in range(4):
            r = h * (0.32 - i * 0.065)
            y = base[1] + h * (0.18 + i * 0.19)
            k.append(cyl(PINE if i % 2 else PINE_L, (base[0], y, base[2]), r, h * 0.2, mat='studs'))
            k.append(cyl(SNOW, (base[0], y + h * 0.2, base[2]), r * 0.8, h * 0.035))
        return k
    s = L.spot(40, (880, 1180), (100, 124))
    if s:                                                   # arche de glacier (repère)
        x, z, side = s
        yaw = L.facing(x) + 90
        o = (x, F, z)
        k = []
        n = 11
        for i in range(n):
            a = math.pi * i / (n - 1)
            p = rot_pt((math.cos(a) * 34, math.sin(a) * 50, 0), yaw, o)
            k.append(box(ICE if i % 2 else ICE_D, p, (14, 13, 16), yaw=yaw, roll=math.degrees(a) - 90, mat='ice'))
        for sgn in (-1, 1):
            k.append(box(ICE_D, rot_pt((sgn * 34, 2, 0), yaw, o), (20, 10, 22), yaw=yaw, mat='ice'))
            k.append(box(SNOW, rot_pt((sgn * 34, 7.4, 0), yaw, o), (21, 1.4, 23), yaw=yaw, mat='studs'))
        k.append(box(SNOW, rot_pt((0, 57.5, 0), yaw, o), (16, 2, 17), yaw=yaw, mat='studs'))
        for i in range(7):
            a = math.pi * (i + 1.5) / 10
            p = rot_pt((math.cos(a) * 26, math.sin(a) * 42 - 4, 0), yaw, o)
            k.append(_part(2, 'eafbff', (p[0], p[1] - 4, p[2]), (0, 1, 0), (-1, 0, 0), (8, 1.4, 1.4), mat='glass'))
        L.kids.append(model('ArcheGlacier', o, k, yaw))
    for n, zr in enumerate(slots(5, 120, 900)):             # icebergs avec leur petite forêt
        s = L.spot(18, zr, (95, 145), spacing=50)
        if not s:
            continue
        x, z, side = s
        o = (x, F, z)
        k = []
        for i, (r, h) in enumerate([(18, 6), (14, 8), (10, 6)]):
            k.append(box(ICE if i % 2 else ICE_D, (x, F - 4 + i * 6 + h / 2, z), (r * 1.8, h + 4, r * 1.5), yaw=i * 15, mat='ice'))
        k.append(box(SNOW, (x, F + 12.6, z), (18, 1.6, 15), yaw=30, mat='studs'))
        for (dx, dz, h) in [(-4, -2, 22), (4, 3, 17), (1, -5, 14)]:
            k += pine((x + dx, F + 13.4, z + dz), h)
        L.kids.append(model('Iceberg', o, k))
    for n, zr in enumerate(slots(4, 160, 1150)):            # grappes de cristaux de glace
        s = L.spot(10, zr, (85, 150), spacing=40)
        if not s:
            continue
        x, z, side = s
        k = [cyl(ICE_D, (x, F - 2, z), 9, 3, mat='ice')]
        for j, (ang, tilt, h, r) in enumerate([(0, 0, 36, 3.6), (70, 22, 26, 2.8), (150, 18, 30, 3), (230, 25, 20, 2.4), (300, 20, 24, 2.6)]):
            a = math.radians(ang)
            b = (x + math.cos(a) * 2, F, z + math.sin(a) * 2)
            t = (b[0] + math.cos(a) * math.sin(math.radians(tilt)) * h, F + h, b[2] + math.sin(a) * math.sin(math.radians(tilt)) * h)
            k.append(rod('9ff4ff' if j == 0 else ICE, b, t, r, mat='glass'))
            k.append(ball('dffcff', t, r * 0.9, mat='neon' if j == 0 else 'glass', light=('7ff4ff', 25, 2) if j == 0 else None))
        L.kids.append(model('Cristaux', (x, F, z), k))
    aurora = folder('AuroreBoreale', [])                     # rideaux d'aurore, hauts, le long des deux côtés
    for side in (-1, 1):
        for band, (low, high, off) in enumerate([('4dffb0', '7ad9ff', 0), ('7ad9ff', 'b07bff', 45)]):
            k = []
            for t in range(16):
                zz = L.z0 + 140 + t * 70 + off
                xx = side * (118 + math.sin(t * 0.7 + band + side) * 22)
                h = 34 + math.sin(t * 1.3 + band) * 10
                y = L.ride + 120 + band * 18
                k.append(box(low, (xx, y + h * 0.3, zz), (0.6, h * 0.6, 62), yaw=math.degrees(math.atan2(math.cos(t * 0.7 + band + side) * 22 * 0.7, 70)) * side, mat='neon', transp=0.55))
                k.append(box(high, (xx, y + h * 0.8, zz), (0.6, h * 0.4, 62), yaw=math.degrees(math.atan2(math.cos(t * 0.7 + band + side) * 22 * 0.7, 70)) * side, mat='neon', transp=0.7))
            aurora['k'].append(model('Rideau', (side * 118, L.ride + 120, L.z0 + 650), with_attrs(k, bob(4, 10 + band * 3, band * 0.3 + (side > 0) * 0.5))))
    L.kids.append(aurora)

# ================================================================== 10. OS : le dragon endormi
@level(10)
def build_10(L):
    F, rng = L.floor, L.rng
    BONE, BONE_D, EYE, SWAMP = 'e8dfc8', 'c9bd9f', '7dff6a', '3a4a2e'
    def skull(o, yaw):
        P = lambda x, y, z: rot_pt((x, y, z), yaw, o)
        k = [ell(BONE, P(0, 15, -6), 19, 16, 20, yaw=yaw),                                     # boîte crânienne
             ell(BONE_D, P(0, 22, -2), 16, 8, 16, yaw=yaw),
             box(BONE, P(0, 10, 19), (20, 12, 28), yaw=yaw, pitch=-8, mat='studs'),            # museau
             box(BONE_D, P(0, 16.5, 30), (14, 3, 10), yaw=yaw, pitch=-12, mat='studs'),
             box(BONE_D, P(0, 0.5, 16), (18, 5, 30), yaw=yaw, pitch=8, mat='studs')]           # mâchoire entrouverte
        for sgn in (-1, 1):
            k.append(ell('10140c', P(sgn * 9.5, 20, 7), 5, 4.2, 3.4, yaw=yaw))                 # orbites
            k.append(ball(EYE, P(sgn * 9.5, 20, 8.6), 2.4, mat='neon', light=(EYE, 40, 3)))
            k.append(box(BONE, P(sgn * 9.5, 25, 8), (9, 2.4, 5), yaw=yaw, roll=-sgn * 14, mat='studs'))   # arcades
            k.append(ell('10140c', P(sgn * 3.5, 15.5, 33), 1.4, 1, 1.4, yaw=yaw))               # narines
            h0, h1, h2 = P(sgn * 13, 27, -14), P(sgn * 19, 38, -26), P(sgn * 18, 50, -30)      # cornes vers le ciel
            k += [rod(BONE_D, h0, h1, 2.8), ball(BONE_D, h1, 2.8), rod(BONE, h1, h2, 2), ball(BONE, h2, 1.4)]
            for t in range(5):                                                                 # crocs
                k.append(_part(2, 'fffbef', P(sgn * 8, 4.4, 12 + t * 5), (0, 1, 0), (-1, 0, 0), (5, 1.8, 1.8)))
                k.append(_part(2, 'fffbef', P(sgn * 7, 3.2, 6 + t * 5), (0, 1, 0), (-1, 0, 0), (3.4, 1.4, 1.4)))
        for v in range(4):                                                                     # cou qui s'enfonce dans le marais
            k.append(box(BONE if v % 2 else BONE_D, P(0, 8 - v * 3.2, -26 - v * 9), (9 - v, 8 - v, 7), yaw=yaw, pitch=-14, mat='studs'))
        return k
    done = False
    for S in (2.2, 2.0, 1.85, 1.7, 1.55, 1.4, 1.25, 1.1, 1.0):
        for zz in range(1150, 850, -25):
            for xx in (-120, -112, -104, -96, -88, -80, 120, 112, 104, 96, 88, 80):
                x, z = xx, L.z0 + zz
                yaw = L.facing(x) - 35 * (1 if x > 0 else -1)      # tourné vers les joueurs qui arrivent
                o = (x, F, z)
                k = transform(skull(o, yaw), o, IDENT, S)
                r, ylo, yhi = extent_box(dict(c='Model', k=k), o)
                if L.clear_aabb(dict(c='Model', k=k)):
                    L.taken.append((x, z, r))
                    L.kids.append(model('CraneDragon', o, k, yaw))
                    print('   crâne x%.2f en' % S, x, zz)
                    done = True
                    break
            if done:
                break
        if done:
            break
    for n, zr in enumerate(slots(3, 140, 900)):             # colonne et côtes qui émergent du marais
        s = L.spot(34, zr, (110, 128), spacing=90)
        if not s:
            continue
        x, z, side = s
        o = (x, F, z)
        k = []
        prev = None
        for v in range(16):
            t = v / 15
            p = (x, F + math.sin(t * math.pi) * 44 - 6, z - 70 + t * 140)
            k.append(box(BONE if v % 2 else BONE_D, p, (10, 8, 8), mat='studs'))
            k.append(box(BONE_D, (p[0], p[1] + 8, p[2]), (2.4, 9, 4)))
            if 3 <= v <= 12:
                for sgn in (-1, 1):
                    r0 = (p[0] + sgn * 5, p[1], p[2])
                    r1 = (p[0] + sgn * 24, p[1] - 12, p[2] + 3)
                    r2 = (p[0] + sgn * 30, F - 3, p[2] + 5)
                    k += [rod(BONE, r0, r1, 2.1), ball(BONE, r1, 2.1), rod(BONE, r1, r2, 1.7)]
            prev = p
        L.kids.append(model('SqueletteDragon', o, k))
    wisps = folder('FeuxFollets', [])
    for n, zr in enumerate(slots(12)):
        s = L.spot(4, zr, (80, 150), ylo=F, yhi=L.ride + 60, spacing=10)
        if not s:
            continue
        x, z, side = s
        y = L.ride + rng.uniform(-10, 25)
        k = [ball(EYE, (x, y, z), 1.6, mat='neon', light=(EYE, 18, 2)), ball('c8ffb0', (x, y + 0.6, z), 0.8, mat='neon'),
             rod(EYE, (x, y - 1, z), (x, y - 5, z + 0.8), 0.6, mat='neon', transp=0.4)]
        wisps['k'].append(model('FeuFollet', (x, y, z), with_attrs(k, bob(4, rng.uniform(3, 5), rng.uniform(0, 1)))))
    L.kids.append(wisps)

# ================================================================== 11. GALAXIE
@level(11)
def build_11(L):
    F, rng = L.floor, L.rng
    s = (-120, L.z0 + 1050)
    c = (s[0], L.ride + 150, s[1])                           # planète à anneaux, haute dans le ciel
    if L.clear(c[0], c[2], 40, c[1] - 45, c[1] + 45):
        k = [ball('c86bff', c, 32), ball('a347ff', (c[0] + 3, c[1] + 4, c[2] - 3), 30.5)]
        ring = [disc('ffd4a8', c, 56, 1.2, axis=norm((0.3, 1, 0.2)), mat='neon', transp=0.3), disc('20102f', c, 44, 1.6, axis=norm((0.3, 1, 0.2)))]
        k += with_attrs(ring, turn(40, 1, c))
        L.kids.append(model('PlaneteAnneaux', c, k))
    s = L.spot(20, (450, 800), (100, 140), ylo=L.ride + 40, yhi=L.ride + 150, spacing=60)
    if s:                                                   # station spatiale qui tourne
        x, z, side = s
        c = (x, L.ride + 95, z)
        k = [_part(2, 'd9dde3', c, (0, 0, 1), (0, 1, 0), (30, 12, 12), mat='metal'),
             disc('27e8ff', (c[0], c[1], c[2] + 15.5), 5, 1, axis=(0, 0, 1), mat='neon', light=('27e8ff', 30, 2))]
        for sgn in (-1, 1):
            k.append(box('3a4656', (c[0] + sgn * 12, c[1], c[2]), (14, 1.2, 3), mat='metal'))
            k.append(box('2f5bd6', (c[0] + sgn * 26, c[1], c[2]), (20, 0.6, 12), mat='neon', transp=0.1))
            for g in range(3):
                k.append(box('0d1a3a', (c[0] + sgn * (19.5 + g * 6.5), c[1] + 0.4, c[2]), (0.4, 0.4, 12)))
        k.append(rod('b9c0cc', (c[0], c[1] + 6, c[2]), (c[0], c[1] + 16, c[2]), 0.4))
        k.append(ball('ff3b30', (c[0], c[1] + 16.5, c[2]), 0.9, mat='neon'))
        L.kids.append(model('StationSpatiale', c, with_attrs(k, turn(60, 2, c))))
    s = L.spot(14, (180, 400), (95, 140), ylo=L.ride + 30, yhi=L.ride + 130, spacing=40)
    if s:                                                   # soucoupe volante et son rayon
        x, z, side = s
        c = (x, L.ride + 75, z)
        k = [disc('b9c0cc', c, 14, 3, mat='metal'), disc('8a96a3', (c[0], c[1] - 1.6, c[2]), 9, 1.2, mat='metal'),
             ell('7ff4ff', (c[0], c[1] + 3.5, c[2]), 6, 4, 6, mat='glass', transp=0.3)]
        for a in range(10):
            ang = a * math.tau / 10
            k.append(ball('4dff7a' if a % 2 else 'ff4fd8', (c[0] + math.cos(ang) * 13, c[1] - 0.4, c[2] + math.sin(ang) * 13), 0.9, mat='neon'))
        k.append(cyl('9dffcb', (c[0], F, c[2]), 5, c[1] - F - 2, mat='neon', transp=0.75, light=('9dffcb', 40, 2)))
        L.kids.append(model('Soucoupe', c, with_attrs(k, bob(4, 5, 0))))
    for n, zr in enumerate([(250, 450), (650, 900)]):       # lunes cratérisées qui tournent autour d'un centre
        s = L.spot(22, zr, (95, 135), ylo=L.ride + 40, yhi=L.ride + 170, spacing=40)
        if not s:
            continue
        x, z, side = s
        c = (x, L.ride + 110, z)
        m = (x, c[1], z + 16)
        k = [ball('b9b4d0', m, 10), ball('8e88aa', (m[0] - 5, m[1] + 4, m[2] - 7), 2.6), ball('8e88aa', (m[0] + 4, m[1] - 3, m[2] - 8), 1.8),
             ball('8e88aa', (m[0] + 6, m[1] + 5, m[2] - 5), 1.4)]
        L.kids.append(model('Lune', m, with_attrs(k, turn(side * 35, 1, c))))
    s = L.spot(10, (500, 750), (60, 120), ylo=L.ride + 120, yhi=L.ride + 200, spacing=20)
    if s:                                                   # comète figée en plein vol
        x, z, side = s
        h = (x, L.ride + 165, z)
        k = [ball('fffbe0', h, 4.5, mat='neon', light=('ffe8a0', 50, 3)), ball('ffd27a', h, 6, mat='neon', transp=0.6)]
        for j in range(6):
            a = (h[0] - side * (4 + j * 7), h[1] + 2 + j * 3.5, h[2] - 5 - j * 9)
            k.append(ball('ffb347' if j % 2 else 'ff7ad9', a, 4.2 - j * 0.55, mat='neon', transp=0.3 + j * 0.08))
        L.kids.append(model('Comete', h, k))
    ast = folder('Asteroides', [])
    for n, zr in enumerate(slots(10)):
        s = L.spot(8, zr, (85, 150), ylo=L.ride + 30, yhi=L.ride + 160, spacing=15)
        if not s:
            continue
        x, z, side = s
        y = L.ride + rng.uniform(50, 130)
        r = rng.uniform(4, 6.5)
        k = [ball('5b5470', (x, y, z), r), ball('463f5c', (x + r * 0.7, y + r * 0.2, z - r * 0.3), r * 0.7), ball('6d6688', (x - r * 0.5, y - r * 0.4, z + r * 0.5), r * 0.6)]
        k += [ball('2f2a40', (x + r * 0.3, y + r * 0.75, z - r * 0.5), r * 0.25), ball('2f2a40', (x - r * 0.6, y + r * 0.1, z - r * 0.7), r * 0.2)]
        ast['k'].append(model('Asteroide', (x, y, z), with_attrs(k, turn(rng.choice([-1, 1]) * rng.uniform(15, 30), 1, (x - 10, y, z)))))
    L.kids.append(ast)

# ================================================================== 12. DERNIER CLIC : poste de contrôle néon
@level(12)
def build_12(L):
    F, rng = L.floor, L.rng
    CYAN, PINK, ORANGE, DARK = '27e8ff', 'ff2fb4', 'ff7a3a', '161826'
    c = (0, L.ride + 170, L.z0 + 1290)                        # soleil synthwave au bout du niveau
    k = []
    for i in range(9):
        y = c[1] - 36 + i * 9
        half = math.sqrt(max(0, 44 ** 2 - (y - c[1]) ** 2))
        if half > 1:
            k.append(box(ORANGE if i < 4 else PINK, (0, y, c[2]), (half * 2, 7.2 - i * 0.5, 1.2), mat='neon'))
    L.kids.append(model('SoleilSynthwave', c, k))
    s = L.spot(36, (650, 950), (100, 128))
    if s:                                                   # écran géant : chargement à 99 %
        x, z, side = s
        yaw = L.facing(x)
        o = (x, F, z)
        k = [box(DARK, rot_pt((0, 28, -2), yaw, o), (8, 56, 8), yaw=yaw, mat='studs'), cyl(DARK, (x, F - 4, z), 18, 5, mat='studs'),
             box(DARK, rot_pt((0, 74, 0), yaw, o), (86, 50, 6), yaw=yaw, mat='studs'),
             box('0b0d1a', rot_pt((0, 75, 3.1), yaw, o), (78, 42, 0.4), yaw=yaw)]
        k += pixel_text('99%', rot_pt((0, 84, 3.6), yaw, o), yaw, 3.2, CYAN)
        k.append(box('2a2f4a', rot_pt((0, 64, 3.6), yaw, o), (62, 6, 0.4), yaw=yaw))
        k.append(box(PINK, rot_pt((-0.6, 64, 3.9), yaw, o), (60.6, 4, 0.4), yaw=yaw, mat='neon', light=(PINK, 50, 2)))
        L.kids.append(model('EcranChargement', o, k, yaw))
    for zr in [(150, 450), (950, 1200)]:
     s = L.spot(12, zr, (95, 140), ylo=L.ride + 20, yhi=L.ride + 120, spacing=40)
     if s:                                                  # curseur géant qui flotte
        x, z, side = s
        yaw = L.facing(x)
        o = (x, L.ride + 60, z)
        ARROW = ['1000000', '1100000', '1110000', '1111000', '1111100', '1111110', '1111111', '1111100', '1101100', '1000110', '0000110', '0000011']
        k = []
        for row, line in enumerate(ARROW):
            for col, bit in enumerate(line):
                if bit == '1':
                    edge = (col == 0 or line[col - 1] == '0' or col == len(line) - 1 or line[col + 1] == '0' or row == len(ARROW) - 1 or ARROW[row + 1][col] == '0')
                    k.append(box(DARK if edge else 'ffffff', rot_pt(((col - 3) * 2.4, (6 - row) * 2.4, 0), yaw, o), (2.4, 2.4, 1.6), yaw=yaw, mat='neon' if not edge else 'smooth'))
        L.kids.append(model('CurseurGeant', o, with_attrs(k, bob(5, 4, 0))))
    hearts = folder('CoeursPixel', [])
    HEART = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000']
    for n, zr in enumerate(slots(8)):
        s = L.spot(8, zr, (90, 150), ylo=L.ride + 20, yhi=L.ride + 120, spacing=20)
        if not s:
            continue
        x, z, side = s
        yaw = L.facing(x)
        o = (x, L.ride + rng.uniform(40, 90), z)
        k = [box(PINK, rot_pt(((col - 3) * 1.8, (3 - row) * 1.8, 0), yaw, o), (1.8, 1.8, 1.2), yaw=yaw, mat='neon')
             for row, line in enumerate(HEART) for col, bit in enumerate(line) if bit == '1']
        hearts['k'].append(model('CoeurPixel', o, with_attrs(with_attrs(k, bob(3, 4, rng.uniform(0, 1))), turn(8, 1, o))))
    L.kids.append(hearts)

# ================================================================== assemblage
root = folder('DecorMondes', [])
stats = {}
for i in range(1, 13):
    if ONLY and i != ONLY:
        continue
    L = Level(i)
    LEVEL_BUILDERS[i](L)
    for n in L.kids:
        grow(L, n)
    root['k'].append(folder('Level%d' % i, L.kids))
    def count(n):
        return (1 if n.get('c') == 'Part' else 0) + sum(count(k) for k in n.get('k', []))
    stats[i] = (len(L.kids), count(root['k'][-1]))
json.dump(root, open(OUT, 'w'))
for i, (a, b) in stats.items():
    print(f'niveau {i:2d} : {a} éléments, {b} parts')
print('total parts', sum(b for a, b in stats.values()))
