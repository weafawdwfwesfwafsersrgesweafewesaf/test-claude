# Modèles des décors, construits en parts à l'origine (base à y = 0, face avant vers +Z).
# Chaque fonction renvoie une liste de parts ; setpieces.py les pose dans les niveaux.
import math, random
from kit import *
from kit import _part

MODELS = {}
def flat(lst):
    out = []
    for x in lst:
        if isinstance(x, list):
            out += flat(x)
        elif x:
            out.append(x)
    return out

def modele(name, view=(0.75, 0.45, 1.0)):
    def deco(fn):
        def wrapped(*a, **kw):
            return flat(fn(*a, **kw))
        wrapped.__name__ = fn.__name__
        MODELS[name] = (wrapped, view)
        return wrapped
    return deco

# ================================================================== pièces réutilisables
def petit_velo(c, col='e0303a', s=1.0):
    """Petit vélo (clin d'œil au jeu), roues dans le plan XY, avant vers +X."""
    x, y, z = c
    W = 2.4 * s
    k = []
    for wx in (-3.2 * s, 3.2 * s):
        k.append(disc('1d2126', (x + wx, y, z), W, 0.6 * s, axis=(0, 0, 1)))
        k.append(disc('d9dde3', (x + wx, y, z), W * 0.7, 0.7 * s, axis=(0, 0, 1)))
        k.append(disc('1d2126', (x + wx, y, z), W * 0.2, 0.8 * s, axis=(0, 0, 1)))
    B, S, H = (x - 0.4 * s, y + 0.2 * s, z), (x - 1.2 * s, y + 3.2 * s, z), (x + 2.2 * s, y + 3.4 * s, z)
    k += [rod(col, (x - 3.2 * s, y, z), B, 0.28 * s), rod(col, B, S, 0.3 * s), rod(col, S, H, 0.3 * s), rod(col, B, H, 0.3 * s),
          rod(col, (x - 3.2 * s, y, z), S, 0.25 * s), rod(col, H, (x + 3.2 * s, y, z), 0.28 * s),
          box('1d2126', (S[0] - 0.3 * s, S[1] + 0.6 * s, z), (1.8 * s, 0.4 * s, 0.9 * s)),
          rod('1d2126', (H[0], H[1] + 0.6 * s, z - 1.1 * s), (H[0], H[1] + 0.6 * s, z + 1.1 * s), 0.2 * s),
          rod(col, H, (H[0], H[1] + 0.6 * s, z), 0.22 * s)]
    return k

def rocher(rng, c, r, cols, n=7, flat=False):
    """Rocher à facettes : des blocs tournés qui s'interpénètrent (silhouette low poly propre)."""
    k = [box(cols[0], c, (r * 1.5, r * (0.9 if flat else 1.3), r * 1.4), yaw=rng.choice([0, 20, 40]), pitch=rng.uniform(-8, 8))]
    for i in range(n):
        a = i * math.tau / n + rng.uniform(-0.3, 0.3)
        e = rng.uniform(-0.4, 0.6)
        d = r * rng.uniform(0.45, 0.6)
        p = (c[0] + math.cos(a) * d, c[1] + e * r * 0.6, c[2] + math.sin(a) * d)
        s = r * rng.uniform(0.7, 1.0)
        k.append(box(cols[(i % (len(cols) - 1)) + 1], p, (s, s * rng.uniform(0.7, 1.0), s * rng.uniform(0.8, 1.1)),
                     yaw=rng.uniform(0, 90), pitch=rng.uniform(-35, 35), roll=rng.uniform(-35, 35)))
    return k

# ================================================================== 1. CLAVIER : le bureau géant
def lettre_dessus(ch, y, px, col, depth=0.5, neon=False):
    """Lettre pixel couchée sur un dessus horizontal (lisible depuis l'avant +Z), pixels d'une ligne fusionnés."""
    k = []
    for row, line in enumerate(FONT[ch]):
        c_ = 0
        while c_ < 5:
            if line[c_] == '1':
                e = c_
                while e + 1 < 5 and line[e + 1] == '1':
                    e += 1
                k.append(box(col, (((c_ + e) / 2 - 2) * px, y, (row - 3) * px), ((e - c_ + 1) * px, depth, px), neon=neon))
                c_ = e + 1
            else:
                c_ += 1
    return k

@modele('EcranGeant', view=(0.55, 0.3, 1.0))
def ecran_geant():
    DARK, DARK2, EDGE, DESK, WIN, WHITE = '1d2233', '2a3350', '3b4670', '2448b8', 'e9efff', 'f4f7ff'
    k = []
    k += bevel_box(DARK, (0, 1.5, 2), (36, 3, 24), 0.8, hex_edge=EDGE)                    # pied
    k.append(box(DARK2, (0, 26, -5), (7, 46, 4)))                                          # cou
    k.append(box(EDGE, (0, 26, -2.95), (2.6, 30, 0.2)))                                   # passe-câble
    k.append(box(DARK, (0, 51, -5.5), (14, 6, 5)))                                         # charnière
    k += bevel_box(DARK2, (0, 80, -4.2), (74, 42, 4), 1.0, top=True, bottom=True)         # capot arrière
    k.append(box(DARK, (0, 80, 0), (104, 62, 4)))                                          # dalle : y 49 .. 111
    k.append(box(EDGE, (0, 80, -0.1), (104.4, 62.4, 3.4)))                                  # liseré de tranche
    k.append(box(DESK, (0, 81.5, 2.05), (97, 55, 0.3)))                                    # bureau (fond d'écran)
    for i, col in enumerate(('2d56d0', '3563da', '3d6fe4')):                               # dégradé du fond
        k.append(box(col, (0, 58 + i * 16 + 8, 2.1), (97, 1.5, 0.3)))
    # fenêtre « GO! »
    k.append(box('10193f', (-8, 84, 2.35), (58.6, 36.6, 0.3)))
    k.append(box(WIN, (-8, 84, 2.45), (58, 36, 0.3)))
    k.append(box('3b82f6', (-8, 100.3, 2.6), (58, 3.4, 0.3)))
    for j, col in enumerate(('ff5f57', 'febc2e', '28c840')):
        k.append(disc(col, (-34.5 + j * 2.6, 100.3, 2.8), 0.8, 0.3, axis=(0, 0, 1), neon=True))
    k += pixel_text('GO!', (-8, 84, 2.75), 3.4, '2563eb', depth=0.4)
    # icônes du bureau
    for j, col in enumerate(('ffd23c', '60a5fa', 'f472b6')):
        k.append(box(col, (38, 98 - j * 9, 2.35), (5, 4.2, 0.3)))
        k.append(box('dbe6ff', (38, 94.8 - j * 9, 2.35), (6, 0.8, 0.3)))
    # barre des tâches
    k.append(box('0f1733', (0, 55.2, 2.35), (97, 3.4, 0.3)))
    k.append(box('27e8ff', (-45.5, 55.2, 2.55), (3, 2.2, 0.3), neon=True))
    for j, col in enumerate(('ffd23c', '60a5fa', 'f472b6', '34d399')):
        k.append(box(col, (-38 + j * 4.5, 55.2, 2.55), (2.6, 2, 0.3)))
    k.append(box('dbe6ff', (43, 55.2, 2.55), (6, 1.2, 0.3)))
    # curseur de souris
    ARROW = ['10000', '11000', '11100', '11110', '11111', '11100', '10110', '00011']
    for row, line in enumerate(ARROW):
        for c_, bit in enumerate(line):
            if bit == '1':
                k.append(box(WHITE, (26 + c_ * 1.1, 72 - row * 1.1, 2.6), (1.1, 1.1, 0.3), neon=True))
    # menton, logo, voyant, webcam
    k.append(box(WHITE, (0, 50.8, 2.1), (7, 1.2, 0.3)))
    k.append(ball('3dff7a', (47, 50.8, 2.1), 0.6, neon=True))
    k += bevel_box(DARK, (0, 112.6, -0.2), (10, 3.2, 4.4), 0.5, top=True)
    k.append(disc('0b0d1a', (0, 112.6, 2.05), 1.2, 0.3, axis=(0, 0, 1)))
    k.append(disc('5b6bb0', (0, 112.6, 2.2), 0.55, 0.3, axis=(0, 0, 1)))
    return k

@modele('Touche', view=(0.5, 0.9, 1.0))
def touche(lettre='W', col='60a5fa'):
    SIDE, SIDE_D, TOP = 'c4cadc', 'aab2c8', 'fafaff'
    k = [box(col, (0, -0.35, 0), (17.4, 0.5, 17.4), neon=True, transp=0.35, light=(col, 18, 1.5)),   # rétroéclairage
         box('e0303a', (0, -2.2, 0), (1.3, 3.4, 4.2)), box('e0303a', (0, -2.2, 0), (4.2, 3.4, 1.3)),  # interrupteur
         box(SIDE_D, (0, 1.2, 0), (18, 2.4, 18)),
         box(SIDE, (0, 3.2, 0), (16.8, 1.6, 16.8)),
         box(SIDE, (0, 4.4, 0), (15.6, 0.8, 15.6)),
         box(TOP, (0, 5.1, 0), (14.6, 0.6, 14.6))]
    k += lettre_dessus(lettre, 5.5, 1.9, '1d2233')
    return transform(k, (0, 0, 0), Rx(58))                                                # le dessus regarde la piste

@modele('BarreEspace', view=(0.4, 0.9, 1.0))
def barre_espace():
    SIDE, SIDE_D, TOP, col = 'c4cadc', 'aab2c8', 'fafaff', '60a5fa'
    k = [box(col, (0, -0.35, 0), (71.4, 0.5, 17.4), neon=True, transp=0.35, light=(col, 30, 1.5)),
         box(SIDE_D, (0, 1.2, 0), (72, 2.4, 18)), box(SIDE, (0, 3.2, 0), (70.8, 1.6, 16.8)),
         box(SIDE, (0, 4.4, 0), (69.6, 0.8, 15.6)), box(TOP, (0, 5.1, 0), (68.6, 0.6, 14.6))]
    for sx in (-26, 0, 26):
        k += [box('e0303a', (sx, -2.2, 0), (1.3, 3.4, 4.2)), box('e0303a', (sx, -2.2, 0), (4.2, 3.4, 1.3))]
    return transform(k, (0, 0, 0), Rx(58))

def _interp(pts, t):
    for (t0, v0), (t1, v1) in zip(pts, pts[1:]):
        if t0 <= t <= t1:
            u = (t - t0) / (t1 - t0)
            u = u * u * (3 - 2 * u)
            return v0 + (v1 - v0) * u
    return pts[-1][1] if t > pts[-1][0] else pts[0][1]

# profil d'une souris gamer symétrique (125 x 63,5 x 40 mm) : t = 0 à l'arrière, 1 au nez
SOURIS_H = [(0.0, 5.5), (0.12, 10.2), (0.28, 12.5), (0.4, 12.8), (0.55, 12.1), (0.7, 10.9), (0.85, 9.4), (1.0, 7.4)]
SOURIS_W = [(0.0, 15.5), (0.14, 19.4), (0.3, 20.3), (0.45, 20.0), (0.62, 18.9), (0.8, 18.4), (1.0, 16.4)]

@modele('SourisGeante', view=(0.9, 0.55, 0.8))
def souris_geante():
    """Souris gamer sans fil aux proportions d'une vraie (40 x 20,3 x 12,8 studs), sur son tapis. L'avant regarde +Z."""
    WHITE, DARK, GREY, PAD, PAD_L, CYAN = 'f4f6fb', '1d2233', '3a4050', '20263a', '2b3350', '4dfcff'
    k = []
    # tapis : rectangle aux coins arrondis, liseré néon
    W, D, T = 38, 58, 0.8
    k += [box(PAD, (0, T / 2, 2), (W, T, D - 6)), box(PAD, (0, T / 2 + 0.01, 2), (W - 6, T + 0.02, D))]
    for sx in (-1, 1):
        for sz in (-1, 1):
            k.append(cyl(PAD, (sx * (W / 2 - 3), 0, 2 + sz * (D / 2 - 3)), 3, T - 0.01))
        k.append(box(CYAN, (sx * (W / 2 + 0.1), T / 2, 2), (0.3, 0.5, D - 6), neon=True))
    for sz in (-1, 1):
        k.append(box(CYAN, (0, T / 2, 2 + sz * (D / 2 + 0.1)), (W - 6, 0.5, 0.3), neon=True))
    k.append(box(PAD_L, (0, T + 0.02, 24), (9, 0.05, 2.4)))
    y0 = T
    L, zb = 40, -20                                                                        # longueur, arrière
    H = lambda t: _interp(SOURIS_H, t)
    Wd = lambda t: _interp(SOURIS_W, t)
    # coque : tranches ellipsoïdales très chevauchées (pas de 2 studs, 9 de long) : surface lisse, sans anneaux
    n = 17
    slices = []
    for i in range(n):
        t = 0.1 + 0.8 * i / (n - 1)
        z = zb + t * L
        rz = min(9.0, 20.0 - abs(z) + 0.4)
        h, w = H(t), Wd(t)
        k.append(ell(WHITE, (0, y0 + h * 0.42, z), w / 2, h * 0.58, rz))
        slices.append((z, y0 + h * 0.42, h * 0.58, rz))
    def dessus(z):                                                                        # hauteur réelle de la coque en x = 0
        return max((y + ry * math.sqrt(max(0.0, 1 - ((z - zc) / rz_) ** 2)) for zc, y, ry, rz_ in slices))
    # fente entre les deux boutons, qui suit le dessus, de la molette jusqu'au nez
    prev = None
    for i in range(13):
        t = 0.66 + 0.3 * i / 12
        p = (0, dessus(zb + t * L) + 0.1, zb + t * L)
        if prev:
            k.append(beam(DARK, prev, p, 0.45, 0.3))
        prev = p
    # molette : caoutchouc sombre strié et anneau lumineux
    tw = 0.6
    wc = (0, dessus(zb + tw * L) - 0.7, zb + tw * L)
    k.append(disc(DARK, wc, 2.2, 1.7, axis=(1, 0, 0)))
    k.append(disc(CYAN, wc, 2.3, 0.35, axis=(1, 0, 0), neon=True))
    for j in range(12):
        a = j * math.tau / 12
        k.append(box(GREY, (0, wc[1] + math.sin(a) * 2.15, wc[2] + math.cos(a) * 2.15), (1.75, 0.3, 0.3), pitch=-math.degrees(a)))
    k.append(box(DARK, (0, dessus(wc[2]) - 0.15, wc[2]), (2.6, 0.5, 5.6)))                      # logement de la molette
    # deux boutons latéraux sous le pouce (côté gauche)
    for t in (0.5, 0.64):
        z = zb + t * L
        k.append(ell(GREY, (-Wd(t) / 2 - 0.1, y0 + H(t) * 0.45, z), 0.7, 1.0, 2.4))
    # logo lumineux sur la paume
    tl = 0.3
    k.append(disc(CYAN, (0, dessus(zb + tl * L) + 0.02, zb + tl * L), 1.8, 0.3, axis=norm((0, 1, -0.12)), neon=True, light=(CYAN, 22, 1.2)))
    k.append(disc(WHITE, (0, dessus(zb + tl * L) + 0.12, zb + tl * L), 1.0, 0.3, axis=norm((0, 1, -0.12))))
    return k

@modele('CableUSB', view=(1.0, 0.35, 0.3))
def cable_usb():
    DARK, GRIP, METAL, TONGUE = '2d2f3a', '3d4150', 'c8ced6', '2f6bff'
    pts = bezier((0, -4, -22), (0, 46, -28), (0, 66, 12), (0, 42, 26), 14)
    k = curve(DARK, pts, 2.2)
    # prise : construite le long de +Y puis orientée sur la fin du câble
    p = []
    p += bevel_box(GRIP, (0, 5, 0), (7, 10, 5), 0.6, top=True, bottom=False, hex_edge='4a4f60')
    for j in range(3):
        p.append(box('50566a', (0, 2.5 + j * 2.4, 2.55), (6, 0.8, 0.2)))
    p.append(box(METAL, (0, 13.5, 0), (6, 7, 2.6)))
    p.append(box('1d2126', (0, 14.2, 0), (5.2, 6.2, 1.9)))
    p.append(box(TONGUE, (0, 14.4, -0.35), (4.6, 5.6, 0.8)))
    for sx in (-1, 1):
        p.append(box(METAL, (sx * 1.5, 16.2, 0.9), (1, 1, 0.3)))
    p.append(ball('27e8ff', (0, 17.2, 0), 0.5, neon=True, light=('27e8ff', 18, 1.5)))
    d = norm(tuple(pts[-1][i] - pts[-2][i] for i in range(3)))
    k += orient(p, d, pts[-1])
    return k

# ================================================================== 2. PAPIER BULLE : colis
CARD, CARD_D, CARD_L, TAPE, RED, INK = 'c9955b', 'a8773f', 'd9ab74', 'e6d3a3', 'd92c3a', '2b2420'

def etiquette(c, w, h, axis_right=(1, 0, 0), n=(0, 0, 1)):
    """Étiquette d'expédition (blanche, code-barres) sur une face verticale."""
    k = [box('f7f5ef', c, (w, h, 0.2))]
    for j in range(9):
        k.append(box(INK, (c[0] - w * 0.35 + j * w * 0.08, c[1] - h * 0.18, c[2] + 0.12), (w * (0.03 if j % 3 else 0.05), h * 0.34, 0.1)))
    k.append(box(RED, (c[0], c[1] + h * 0.3, c[2] + 0.12), (w * 0.8, h * 0.12, 0.1)))
    k.append(box('3b5bdb', (c[0] - w * 0.15, c[1] + h * 0.12, c[2] + 0.12), (w * 0.5, h * 0.07, 0.1)))
    return k

def colis(size, seed=0, label=True):
    """Carton fermé : scotch en croix sur le dessus et qui descend sur les faces, étiquette, arêtes plus sombres."""
    w, h, d = size
    rng = random.Random(seed)
    k = [box(CARD, (0, h / 2, 0), (w, h, d)),
         box(CARD_D, (0, h - 0.05, 0), (w + 0.1, 0.2, 0.7)),                              # jointure des rabats
         box(TAPE, (0, h + 0.05, 0), (w + 0.3, 0.2, d * 0.14)),
         box(TAPE, (0, h - 3, d / 2 + 0.05), (w * 0.14, 6, 0.2)),
         box(TAPE, (0, h - 3, -d / 2 - 0.05), (w * 0.14, 6, 0.2))]
    for sx in (-1, 1):
        k.append(box(TAPE, (sx * (w / 2 + 0.05), h - 3, 0), (0.2, 6, d * 0.14)))
    if label:
        lab = etiquette((w * 0.22, h * 0.42, d / 2 + 0.1), w * 0.36, h * 0.3)
        k += lab
    return k

def feuille_bulles(w, h, bulles=True):
    """Papier bulle dans le plan XY (bulles vers +Z) : film translucide + grosses bulles."""
    k = [box('e8f4ff', (0, 0, 0), (w, h, 0.4), transp=0.35)]
    if bulles:
        nx, ny = int(w // 4.4), int(h // 4.4)
        for i in range(nx):
            for j in range(ny):
                k.append(ell('f4faff', ((i - (nx - 1) / 2) * 4.4, (j - (ny - 1) / 2) * 4.4, 0.3), 1.7, 1.7, 1.0, transp=0.3))
    return k

@modele('CartonFragile', view=(0.7, 0.55, 1.0))
def carton_fragile():
    W, H, D, t = 54, 36, 44, 1.6
    k = [box(CARD, (0, H / 2, D / 2 - t / 2), (W, H, t)), box(CARD, (0, H / 2, -D / 2 + t / 2), (W, H, t)),
         box(CARD, (W / 2 - t / 2, H / 2, 0), (t, H, D - 2 * t)), box(CARD, (-W / 2 + t / 2, H / 2, 0), (t, H, D - 2 * t)),
         box('5a4128', (0, H * 0.55, 0), (W - 2 * t, 0.4, D - 2 * t))]                        # fond intérieur (ombre)
    for x0, x1 in ((-W / 2, -W / 2), (W / 2, W / 2)):
        for zz in (-D / 2, D / 2):
            k.append(box(CARD_D, (x0, H / 2, zz), (0.5, H + 0.05, 0.5)))                       # arêtes
    L = D / 2 - 2                                                                           # rabats ouverts
    for sz in (-1, 1):
        a = math.radians(28)
        c = (0, H + math.sin(a) * L / 2, sz * (D / 2 + math.cos(a) * L / 2))
        k.append(box(CARD_L, c, (W - 1, 1.2, L), pitch=-28 * sz))
    L2 = W / 2 - 4
    for sx in (-1, 1):
        a = math.radians(22)
        c = (sx * (W / 2 + math.cos(a) * L2 / 2), H + math.sin(a) * L2 / 2, 0)
        k.append(box(CARD_L, c, (L2, 1.2, D - 1), roll=22 * sx))
    # scotch arraché qui pend sur la face avant, tampon FRAGILE
    k.append(box(TAPE, (0, H - 4, D / 2 + 0.1), (8, 8, 0.2)))
    k.append(box(TAPE, (1.5, H - 9.5, D / 2 + 0.1), (6, 3.5, 0.2), roll=12))
    fr = pixel_text('FRAGILE', (0, H * 0.46, D / 2 + 0.25), 1.08, RED, depth=0.3, neon=False)
    k += fr
    for yy in (H * 0.46 + 6.2, H * 0.46 - 6.2):
        k.append(box(RED, (0, yy, D / 2 + 0.2), (54 * 0.9, 0.9, 0.3)))
    for sx in (-1, 1):
        k.append(box(RED, (sx * 24.3, H * 0.46, D / 2 + 0.2), (0.9, 13.3, 0.3)))
    # flèches « haut » et étiquette sur le côté
    for j, zz in enumerate((-10, 10)):
        k += [box(INK, (W / 2 + 0.15, H * 0.62, zz), (0.2, 7, 1.4)),
              wedge(INK, (W / 2 + 0.15, H * 0.62 + 4.7, zz - 1.1), (0.2, 2.8, 2.2), yaw=0),
              wedge(INK, (W / 2 + 0.15, H * 0.62 + 4.7, zz + 1.1), (0.2, 2.8, 2.2), yaw=180)]
    lab = etiquette((0, 0, 0), 14, 10)
    k += transform(lab, (0, 0, 0), Ry(90), 1.0, (W / 2 + 0.1, H * 0.3, 0))
    # papier bulle qui déborde : une nappe sur le dessus, une qui retombe devant
    top = feuille_bulles(40, 26)
    k += transform(top, (0, 0, 0), mul(Rx(-78), Rz(4)), 1.0, (-2, H + 1.5, -1))
    hang = feuille_bulles(26, 16)
    k += transform(hang, (0, 0, 0), Rx(-12), 1.0, (-6, H - 5, D / 2 + 2.2))
    lip = feuille_bulles(26, 6)
    k += transform(lip, (0, 0, 0), Rx(-70), 1.0, (-6, H + 2.2, D / 2 - 0.5))
    # chips de calage
    rng = random.Random(4)
    for j in range(14):
        p = (rng.uniform(-20, 20), H + rng.uniform(2, 6), rng.uniform(-14, 12)) if j < 8 else (rng.uniform(-30, 30), 0.8, D / 2 + rng.uniform(3, 12))
        d = norm((rng.uniform(-1, 1), rng.uniform(-0.3, 0.3), rng.uniform(-1, 1)))
        k.append(rod(['f7f5ef', 'ffd6ea', 'd9f0ff'][j % 3], tuple(p[i] - d[i] * 1.3 for i in range(3)), tuple(p[i] + d[i] * 1.3 for i in range(3)), 0.65))
    return [p for p in k if p]

@modele('PileColis', view=(0.8, 0.5, 1.0))
def pile_colis(seed=2):
    k = colis((24, 18, 20), seed)
    k += transform(colis((18, 14, 16), seed + 1), (0, 0, 0), Ry(20), 1.0, (1, 18.2, 0))
    k += transform(colis((12, 10, 12), seed + 2, label=False), (0, 0, 0), Ry(-15), 1.0, (-1, 32.4, 1))
    k += transform(colis((16, 12, 14), seed + 3), (0, 0, 0), mul(Ry(40), Rz(-8)), 1.0, (20, 0, 8))
    return k

@modele('RouleauBulle', view=(0.6, 0.5, 1.0))
def rouleau_bulle():
    R, L = 12, 42
    k = [_part(2, 'e8f4ff', (0, R, 0), (1, 0, 0), (0, 1, 0), (L, 2 * R, 2 * R), transp=0.3),
         _part(2, 'cfe6ff', (0, R, 0), (1, 0, 0), (0, 1, 0), (L + 0.2, 2 * R - 3, 2 * R - 3), transp=0.2)]
    for sx in (-1, 1):
        k.append(_part(2, CARD, (sx * (L / 2 + 0.3), R, 0), (1, 0, 0), (0, 1, 0), (1.2, 7, 7)))
        k.append(_part(2, '5a4128', (sx * (L / 2 + 0.5), R, 0), (1, 0, 0), (0, 1, 0), (1.2, 5, 5)))
    for j in range(8):                                                                    # bulles sur le rouleau (côté visible)
        a = math.radians(-40 + j * 28)
        for i in range(8):
            k.append(ell('f4faff', (-L / 2 + 3 + i * 5.1 + (j % 2) * 1.2, R + math.sin(a) * (R + 0.2), math.cos(a) * (R + 0.2)), 1.7, 1.7, 1.7, transp=0.3))
    sheet = feuille_bulles(L - 2, 40)                                                       # la nappe qui se déroule
    k += transform(sheet, (0, 0, 0), Rx(-90), 1.0, (0, 0.3, R + 20))
    return k

@modele('Bulle')
def bulle():
    return [ball('eaf6ff', (0, 0, 0), 5, transp=0.55), ball('ffffff', (-1.8, 2, 3.2), 0.9, neon=True),
            ball('ffffff', (-2.8, 1, 2.6), 0.45, neon=True)]

# ================================================================== 3. CHOCOLAT
CHOC, CHOC_D, CHOC_L, SILVER, SILVER_D = '6b3b24', '4a2616', '8f5434', 'dcd8cf', 'a9a398'

def fraise(c, s=1.0):
    k = [ell('e0303a', (c[0], c[1], c[2]), 2.4 * s, 3.1 * s, 2.4 * s), ell('ff5a5a', (c[0] - 0.6 * s, c[1] + 0.8 * s, c[2] + 1.2 * s), 1.1 * s, 1.3 * s, 0.9 * s)]
    for a in range(5):
        ang = a * math.tau / 5
        k.append(box('3f9a3a', (c[0] + math.cos(ang) * 1.2 * s, c[1] + 3 * s, c[2] + math.sin(ang) * 1.2 * s), (2.2 * s, 0.4 * s, 1 * s), yaw=-math.degrees(ang), roll=-20))
    for j in range(6):
        ang = j * 1.9
        k.append(ball('ffe27a', (c[0] + math.cos(ang) * 2.2 * s, c[1] + (j % 3 - 1) * 1.2 * s, c[2] + math.sin(ang) * 2.2 * s), 0.25 * s))
    return k

@modele('FontaineChocolat', view=(0.7, 0.4, 1.0))
def fontaine_chocolat():
    k = [cyl(SILVER_D, (0, 0, 0), 30, 2.6), cyl(SILVER, (0, 2.6, 0), 28.6, 0.8)]
    k += ring(SILVER, (0, 5.2, 0), 27.6, 1.6, 40, 3.6)                                      # bassin
    k.append(cyl(CHOC_L, (0, 3.4, 0), 26.9, 2.4))
    k += ring(CHOC, (0, 5.75, 0), 21, 1.4, 36, 0.3)                                         # ondes dans le bassin
    tiers = [(19, 22), (12.5, 38), (7, 51)]
    for i, (r, y) in enumerate(tiers):
        y_prev = 5.8 if i == 0 else tiers[i - 1][1] + 0.8
        k.append(cyl(SILVER_D, (0, y_prev - 0.5, 0), 2.6 - i * 0.4, y - y_prev))              # colonne
        k.append(cyl(SILVER, (0, y - 2.6, 0), r * 0.45, 1.4))                                 # vasque : fond
        k.append(cyl(SILVER, (0, y - 1.3, 0), r * 0.75, 1.4))
        k.append(cyl(SILVER, (0, y - 0.1, 0), r, 1.0))
        k += ring(SILVER_D, (0, y + 1.3, 0), r + 0.1, 1.0, 32, 1.4)                          # lèvre
        k.append(cyl(CHOC_L, (0, y + 0.6, 0), r - 0.5, 0.7))
        # rideau qui s'évase en tombant (segments inclinés vers l'extérieur)
        drop = y + 0.4 - y_prev
        n = 30
        spread = 2.2 + i * 0.6
        tilt = math.degrees(math.atan2(spread, drop))
        rmid = r + 0.9 + spread / 2
        w = 2 * (rmid + 1) * math.tan(math.pi / n) + 0.05
        for j in range(n):
            ang = j * math.tau / n
            k.append(box(CHOC if j % 2 else '74422a', (math.cos(ang) * rmid, y_prev + drop / 2 + 0.3, math.sin(ang) * rmid),
                         (0.7, drop / math.cos(math.radians(tilt)) + 0.4 + (0.04 if j % 2 else 0), w), yaw=-math.degrees(ang), roll=-tilt))
        k += ring(CHOC_D, (0, y_prev + 0.35, 0), r + 0.9 + spread, 1.4, 30, 0.7)            # bourrelet où le rideau tombe
    top = tiers[-1][1] + 1.8
    k.append(cyl(SILVER_D, (0, top, 0), 1.3, 3))
    k.append(ell(CHOC, (0, top + 4.2, 0), 2.8, 2.2, 2.8))
    k.append(ell(CHOC_L, (0, top + 5.6, 0), 1.8, 1.4, 1.8))
    for j in range(6):                                                                    # brochettes plantées autour
        ang = j * math.tau / 6 + 0.25
        base = (math.cos(ang) * 31.5, 0, math.sin(ang) * 31.5)
        top_ = (math.cos(ang) * 29.5, 22, math.sin(ang) * 29.5)
        k.append(rod('e8d2a0', base, top_, 0.35))
        if j % 2:
            k += fraise((top_[0], top_[1] + 2.5, top_[2]))
            k.append(ell(CHOC, (top_[0], top_[1] + 1.1, top_[2]), 2.55, 1.6, 2.55))
        else:
            k.append(cyl('fff6ee', (top_[0], top_[1], top_[2]), 2.4, 4.4))
            k.append(cyl(CHOC, (top_[0], top_[1] + 2.7, top_[2]), 2.52, 1.9))
    return k

@modele('Tablette', view=(0.55, 0.3, 1.0))
def tablette():
    RED_W, GOLD, FOIL = 'c8102e', 'e8b23a', 'dfe3ea'
    W, H, T = 26, 40, 4
    k = [box(CHOC_D, (0, H / 2, 0), (W, H, T))]
    for i in range(3):                                                                    # carrés en relief (marches)
        for j in range(5):
            if i == 2 and j == 4:
                continue                                                                  # le coin croqué
            cx, cy = (i - 1) * 8, 4 + j * 8
            k.append(box(CHOC, (cx, cy, T / 2 + 0.4), (7.2, 7.2, 0.8)))
            k.append(box(CHOC_L, (cx, cy, T / 2 + 1.0), (5.6, 5.6, 0.4)))
    # papier rouge et doré, alu déchiré qui dépasse
    k.append(box(RED_W, (0, 7.5, 0), (W + 0.6, 15, 7)))
    k.append(box(GOLD, (0, 13.6, 0), (W + 0.8, 1.4, 7.2)))
    k.append(box(GOLD, (0, 2.2, 0), (W + 0.8, 1, 7.2)))
    for j in range(7):
        k.append(box(FOIL, (-W / 2 + 1.8 + j * 3.7, 15.6 + (j % 2) * 0.8, 0), (3.2, 1.6 + (j % 2) * 1.6, 6.6)))
    k += pixel_text('CHOC', (0, 8, 3.55), 1.05, 'fff6ee', depth=0.2, neon=False)
    # le carré croqué, posé au pied
    k += transform([box(CHOC, (0, 0, 0), (7.2, 7.2, 3)), box(CHOC_L, (0, 0, 1.7), (5.6, 5.6, 0.4))], (0, 0, 0), mul(Ry(30), Rx(-70)), 1.0, (10, 2.2, 9))
    return transform(k, (0, 0, 0), Rx(-10))

@modele('Cupcake', view=(0.7, 0.5, 1.0))
def cupcake():
    LINER, LINER2, CAKE, CREAM, CREAM2 = 'ff8fc7', 'ffd6ea', 'b8743a', 'fff6ee', 'ffe8f2'
    k = []
    n = 18
    for i in range(n):                                                                    # caissette plissée, évasée
        a = i * math.tau / n
        k.append(box(LINER if i % 2 else LINER2, (math.cos(a) * 10.4, 5.5, math.sin(a) * 10.4), (1.2, 11, 2 * 10.4 * math.tan(math.pi / n) + 0.3),
                     yaw=-math.degrees(a), roll=-6))
    k.append(cyl(LINER, (0, 0, 0), 9.8, 11))
    k.append(cyl(CAKE, (0, 11, 0), 11.6, 1.8))
    k.append(ell(CAKE, (0, 12.4, 0), 11.6, 3, 11.6))
    layers = [(10.8, 3.2), (9.0, 3.0), (7.0, 2.8), (5.0, 2.6), (3.0, 2.4)]
    y = 13.2
    for i, (r, h) in enumerate(layers):                                                   # chantilly pochée en spirale
        k.append(cyl(CREAM, (0, y, 0), r - 1.6, h))
        n = max(6, int(r * 1.2))
        for j in range(n):
            a = j * math.tau / n + i * 0.45
            k.append(ell(CREAM if (j + i) % 2 else CREAM2, (math.cos(a) * (r - 1.9), y + h * 0.55, math.sin(a) * (r - 1.9)), 2.1, h * 0.62, 2.1))
        y += h * 0.92
    rng = random.Random(9)
    for j in range(16):                                                                   # vermicelles
        a = rng.uniform(0, math.tau)
        lay = rng.randrange(len(layers))
        r, h = layers[lay]
        yy = 13.2 + sum(l[1] * 0.92 for l in layers[:lay]) + h * 1.1
        k.append(box(['ff4fd8', '4dfcff', 'ffd23c', '7dff6a', 'a06eff'][j % 5], (math.cos(a) * (r - 1.9), yy, math.sin(a) * (r - 1.9)),
                     (0.5, 0.5, 1.6), yaw=rng.uniform(0, 180), neon=True))
    return k

@modele('Guimauve')
def guimauve(col='ffc2e0'):
    return [_part(2, col, (0, 0, 0), (1, 0, 0), (0, 1, 0), (7, 8, 8)),
            _part(2, col, (0, 0, 0), (1, 0, 0), (0, 1, 0), (7.8, 7, 7)),
            _part(2, 'fff6ee', (0, 0, 0), (1, 0, 0), (0, 1, 0), (8.2, 5.6, 5.6))]

# ================================================================== 4. ÉCRASEURS : l'usine
STEEL, STEEL_D, STEEL_L, YEL, BLK = '8a96a3', '3a4656', 'c3cad4', 'ffc21a', '1d2126'

def rayures(c, w, h, n, face=(0, 0, 1)):
    """Bande de sécurité jaune et noire (face avant)."""
    return [box(YEL if i % 2 else BLK, (c[0] + (i - (n - 1) / 2) * w / n, c[1], c[2]), (w / n, h, 0.3)) for i in range(n)]

def boulons(xs, ys, z, r=0.7):
    return [disc(STEEL_L, (x, y, z), r, 0.5, axis=(0, 0, 1)) for x in xs for y in ys]

@modele('PresseGeante', view=(0.6, 0.35, 1.0))
def presse_geante():
    k = bevel_box(STEEL_D, (0, 3, 0), (64, 6, 40), 1.2, hex_edge='4a5668', steps=2)       # socle
    k += bevel_box(STEEL, (0, 8, 0), (36, 4, 28), 0.6, hex_edge=STEEL_L)                  # enclume
    k += rayures((0, 5, 20.2), 60, 2.4, 20)
    k += [ell('d92c3a', (0, 10.6, 0), 7, 0.9, 7), disc('dfe3ea', (0, 11.3, 0), 5, 0.3), disc('3a6bff', (3, 10.8, 5), 1.4, 0.2)]   # canette écrasée
    for sx in (-1, 1):                                                                    # montants
        k += bevel_box(STEEL, (sx * 27, 51, 0), (9, 90, 13), 0.8, hex_edge=STEEL_L)
        k.append(box(STEEL_D, (sx * 22.3, 51, 0), (0.8, 80, 5)))                          # glissière
        k += boulons([sx * 27 - 2.5, sx * 27 + 2.5], [16 + j * 14 for j in range(6)], 6.7)
    k += bevel_box(STEEL_D, (0, 101, 0), (68, 14, 18), 1.2, top=True, bottom=True, hex_edge='4a5668')    # traverse
    k += rayures((0, 96.6, 9.2), 66, 2.6, 22)
    k.append(box(YEL, (0, 102.5, 9.3), (30, 7, 0.3)))
    k += pixel_text('DANGER', (0, 102.5, 9.55), 0.85, BLK, depth=0.2, neon=False)
    k += [cyl(STEEL_D, (0, 108, 0), 3, 2), ball('ff3b30', (0, 111.5, 0), 2.2, neon=True, light=('ff3b30', 40, 3))]   # gyrophare
    for sx in (-1, 1):
        k.append(cyl(STEEL_L, (sx * 11, 76, 0), 4, 18))                                   # vérins
        k.append(cyl(STEEL_D, (sx * 11, 93, 0), 4.6, 2))
    ram = []                                                                              # le coulisseau qui cogne
    for sx in (-1, 1):
        ram.append(cyl('e9edf3', (sx * 11, 60, 0), 1.9, 18))
    ram += bevel_box(STEEL_D, (0, 55, 0), (42, 10, 30), 0.8, top=True, bottom=True, hex_edge='4a5668')
    ram += rayures((0, 55, 15.2), 40, 3, 14)
    ram.append(box(BLK, (0, 49.7, 0), (38, 0.6, 26)))
    k += with_attrs(ram, bob(19, 3.2, 0))
    # pupitre de commande
    k += [box(STEEL_D, (40, 9, 16), (1.4, 18, 1.4)), cyl('ff3b30', (38.2, 22.6, 16), 1.3, 0.9, neon=True), cyl('3dff7a', (41.8, 22.6, 16), 0.9, 0.7, neon=True)]
    k += bevel_box(STEEL, (40, 20, 16), (8, 5, 5), 0.5, hex_edge=STEEL_L)
    return k

@modele('Cheminee', view=(0.7, 0.3, 1.0))
def cheminee(H=96):
    BRICK, BRICK_D, BRICK_L = '9c4a3a', '7e3a2e', 'b05a47'
    k = bevel_box(BRICK_D, (0, 6, 0), (26, 12, 26), 1, hex_edge=BRICK)
    k += [box('241a16', (0, 4, 13.05), (7, 8, 0.2)), box(BRICK_L, (0, 8.4, 13.1), (8.4, 0.9, 0.3))]
    y = 12
    n = int((H - 12) / 3)
    for i in range(n):                                                                    # rangs de briques
        r = 9 - i * 0.025
        col = [BRICK, BRICK_D, BRICK_L][i % 3] if i % 7 else BRICK_D
        if n - 9 <= i < n - 5:
            col = 'f2f2f2' if i % 2 else 'e0303a'                                         # bandes rouge et blanc
        k.append(cyl(col, (0, y + i * 3, 0), r, 3.02))
    top = y + n * 3
    k += [cyl(BRICK_D, (0, top, 0), 10.5, 2.6), cyl('1b1512', (0, top + 2.6, 0), 7.5, 0.2)]
    for side in (1,):                                                                     # échelle de service
        for sx in (-1.6, 1.6):
            k.append(box(STEEL_D, (sx, 12 + (top - 12) / 2, 9.4), (0.5, top - 12, 0.5)))
        for j in range(int((top - 16) / 3)):
            k.append(box(STEEL, (0, 15 + j * 3, 9.4), (3.2, 0.4, 0.4)))
    k.append(ball('ff3b30', (0, top + 3.6, 10.2), 0.9, neon=True))
    smoke = []
    for j in range(6):                                                                    # panache qui dérive avec le vent
        c = (j * j * 0.9, top + 6 + j * 7.5, -j * 1.2)
        r = 4 + j * 1.3
        col = ['9aa0aa', '8a8f99', '7a808b'][j % 3]
        smoke += [ball(col, c, r), ball(col, (c[0] + r * 0.6, c[1] - r * 0.3, c[2] + r * 0.3), r * 0.7), ball(col, (c[0] - r * 0.5, c[1] + r * 0.2, c[2] - r * 0.3), r * 0.6)]
    k += with_attrs(smoke, bob(2.5, 5, 0))
    return k

@modele('PyloneEngrenage', view=(0.5, 0.3, 1.0))
def pylone_engrenage(H=62):
    k = []
    for sx in (-1, 1):
        for sz in (-1, 1):
            k.append(beam(STEEL_D, (sx * 9, 0, sz * 6), (sx * 3.5, H, sz * 2.8), 1.6, 1.6))
    for j in range(5):                                                                    # entretoises
        t = j / 5
        y = t * H + 4
        w, d = 9 - 5.5 * (y / H), 6 - 3.2 * (y / H)
        for sz in (-1, 1):
            k.append(box(STEEL, (0, y, sz * d), (2 * w, 0.8, 0.8)))
        for sx in (-1, 1):
            k.append(box(STEEL, (sx * w, y, 0), (0.8, 0.8, 2 * d)))
        if j < 4:
            y2 = (j + 1) / 5 * H + 4
            w2, d2 = 9 - 5.5 * (y2 / H), 6 - 3.2 * (y2 / H)
            k.append(rod(STEEL, (-w, y, d), (w2, y2, d2), 0.35))
            k.append(rod(STEEL, (w, y, d), (-w2, y2, d2), 0.35))
    k += bevel_box(STEEL_D, (0, H + 2, 0), (10, 4, 8), 0.6, hex_edge='4a5668')
    k.append(box(STEEL_D, (0, H + 8, -1), (3, 12, 3)))
    c1 = (0, H + 14, 1.6)
    g1 = engrenage('c97a45', c1, 16, 16, 3, hub=STEEL_D)
    k += with_attrs(g1, turn(14, 2, c1))
    c2 = (22.6, H + 4, 1.6)
    g2 = engrenage(STEEL_L, c2, 8, 8, 2.6, hub=STEEL_D)
    k += with_attrs(g2, turn(-7, 2, c2))
    k.append(box(STEEL_D, (22.6, H - 2.5, -1), (2.4, 13, 2.4)))
    k.append(disc('5ac86e', (0, H + 14, 3.4), 2.2, 0.4, axis=(0, 0, 1), neon=True, light=('5ac86e', 25, 2)))
    return k


# ================================================================== 5. POP IT
RAINBOW = ['ff4f6e', 'ff9f40', 'ffd23c', '5ad26e', '4fa8ff', '9a6bff']
RAINBOW_D = ['d93a57', 'e0822a', 'e0b220', '3fb055', '3a88e0', '7c52e0']

def popit_grille(mask, cell, seed=0, back='ffffff', popped=0.25):
    """Pop-it dans le plan XY (bulles vers +Z) à partir d'un masque de cases. Rangées arc-en-ciel,
    certaines bulles « poppées » (creuses)."""
    rng = random.Random(seed)
    rows, cols = len(mask), len(mask[0])
    k = []
    for j, line in enumerate(mask):
        for i, bit in enumerate(line):
            if bit != '1':
                continue
            x, y = (i - (cols - 1) / 2) * cell, ((rows - 1) / 2 - j) * cell
            col, dark = RAINBOW[j % 6], RAINBOW_D[j % 6]
            k.append(box(col, (x, y, (j % 2) * 0.03), (cell, cell, cell * 0.28)))
            if rng.random() < popped:
                k.append(disc(dark, (x, y, cell * 0.14), cell * 0.36, 0.2, axis=(0, 0, 1)))
            else:
                k.append(ell(col, (x, y, cell * 0.14), cell * 0.36, cell * 0.36, cell * 0.24))
                k.append(ball('ffffff', (x - cell * 0.12, y + cell * 0.12, cell * 0.3), cell * 0.06, neon=True))
    # cadre : une dalle blanche par suite de cases d'une rangée, décalées d'une rangée à l'autre (pas de z-fighting)
    for j, line in enumerate(mask):
        i = 0
        while i < cols:
            if line[i] == '1':
                e = i
                while e + 1 < cols and line[e + 1] == '1':
                    e += 1
                x, y = ((i + e) / 2 - (cols - 1) / 2) * cell, ((rows - 1) / 2 - j) * cell
                k.append(box(back, (x, y, -cell * 0.12 - (j % 2) * 0.06), ((e - i + 1) * cell + cell * 0.36 + (j % 2) * 0.12, cell * 1.36, cell * 0.2)))
                i = e + 1
            else:
                i += 1
    return k

COEUR = ['0110110', '1111111', '1111111', '1111111', '0111110', '0011100', '0001000']

@modele('PopItGeant', view=(0.5, 0.25, 1.0))
def popit_geant():
    cell = 9
    k = popit_grille(COEUR, cell, seed=5)
    k = transform(k, (0, 0, 0), Rx(-8), 1.0, (0, 44, 0))
    k += bevel_box('ffffff', (0, 3, -1), (34, 6, 18), 1.2, hex_edge='eef0f6', steps=2)   # socle
    k.append(box('e3e6ef', (0, 8, -1.5), (14, 5, 5)))
    return k

@modele('PopIt')
def popit(forme='carre', seed=1):
    mask = {'carre': ['1111', '1111', '1111', '1111'], 'rond': ['01110', '11111', '11111', '11111', '01110'],
            'etoile': ['00100', '01110', '11111', '01110', '01010']}[forme]
    k = popit_grille(mask, 6, seed=seed)
    return transform(k, (0, 0, 0), Rx(-62), 1.0, (0, 9, 0))

@modele('HandSpinner', view=(0.3, 0.2, 1.0))
def hand_spinner(col='4fa8ff', dark='3a88e0'):
    k = []
    for a in range(3):                                                                   # bras et lobes (plan XY)
        ang = a * math.tau / 3 + math.pi / 2
        p = (math.cos(ang) * 8.5, math.sin(ang) * 8.5, 0)
        k.append(beam(col, (math.cos(ang) * 3.8, math.sin(ang) * 3.8, 0), p, 5.6, 2.1))       # les bras partent du moyeu
        k.append(disc(col, p, 4.3, 2.4, axis=(0, 0, 1)))
        k.append(disc(dark, p, 3.2, 2.6, axis=(0, 0, 1)))
        k.append(disc('dfe3ea', p, 2.5, 2.7, axis=(0, 0, 1)))
        for b in range(6):
            bb = b * math.tau / 6
            k.append(ball('f4f6fb', (p[0] + math.cos(bb) * 1.6, p[1] + math.sin(bb) * 1.6, 1.1), 0.5))
    k.append(disc(col, (0, 0, 0), 4.3, 2.4, axis=(0, 0, 1)))
    k.append(disc('2a2f3a', (0, 0, 0), 3.2, 3.2, axis=(0, 0, 1)))
    k.append(disc('ffffff', (0, 0, 0), 2.2, 3.6, axis=(0, 0, 1), neon=True))
    return with_attrs(k, turn(4, 2, (0, 0, 0)))

# ================================================================== 6. MER DE SQUISHIES
@modele('Baleine', view=(0.9, 0.35, 0.8))
def baleine():
    BLUE, BLUE_D, BELLY, PINK = '4f7fd9', '3d68c0', 'dcebff', 'ff9ab8'
    k = [ell(BLUE, (0, 11, 0), 16, 13, 26), ell(BELLY, (0, 7.5, 2), 14.5, 9, 23.5)]
    k.append(ell(BLUE, (0, 13, -27), 7, 6, 11, pitch=-18))                                  # pédoncule
    for sx in (-1, 1):
        k.append(ell(BLUE_D, (sx * 8, 18.5, -36), 10, 1.6, 5.2, yaw=sx * 30, roll=sx * 8))   # nageoire caudale
        k.append(ell(BLUE_D, (sx * 16, 5, 8), 8, 1.5, 4, yaw=sx * 40, roll=sx * 30))        # nageoires
        k.append(ball('ffffff', (sx * 12.6, 14, 18.5), 2.6))                                 # yeux
        k.append(ball('1b2440', (sx * 13.2, 14, 19.8), 1.7))
        k.append(ball('ffffff', (sx * 13.6, 14.8, 20.9), 0.55, neon=True))
        k.append(ell(PINK, (sx * 12.5, 9.8, 20.5), 2.4, 1.3, 1, yaw=sx * 35))               # joues
    k += curve('1b2440', [(-5, 8.6, 25.4), (-2.5, 7.4, 26.1), (0, 7.1, 26.3), (2.5, 7.4, 26.1), (5, 8.6, 25.4)], 0.35)   # sourire
    k.append(ell(BLUE_D, (0, 23.8, 4), 1.6, 0.6, 1.2))                                     # évent
    spray = [cyl('bff4ff', (0, 24, 4), 1.4, 12, neon=True, transp=0.35)]
    for a in range(10):
        ang = a * math.tau / 10
        spray.append(ball('bff4ff', (math.cos(ang) * 5.5, 36 + (a % 2) * 1.5, 4 + math.sin(ang) * 5.5), 1.8 - (a % 2) * 0.4, neon=True, transp=0.2))
        spray.append(ball('eaffff', (math.cos(ang) * 8, 32.5, 4 + math.sin(ang) * 8), 1.0, neon=True, transp=0.3))
    k += with_attrs(spray, bob(2.5, 2.4, 0))
    for r, t in ((24, 0.6), (30, 0.8)):                                                     # remous
        k += ring('eaffff', (0, 0.4, -2), r, 1.2, 36, 0.4, transp=t - 0.2)
    return k

@modele('Meduse', view=(0.8, 0.3, 1.0))
def meduse(col='ff7ad9', col_d='d95ab8'):
    k = [ell(col, (0, 0, 0), 9, 7.5, 9, transp=0.3), ell('ffffff', (0, 0.8, 0), 5, 4, 5, neon=True, light=(col, 25, 2)),
         cyl(col_d, (0, -1.2, 0), 8.8, 1.2, transp=0.2)]
    for i in range(12):                                                                   # festons du bord
        a = i * math.tau / 12
        k.append(ell(col_d, (math.cos(a) * 8.6, -1.6, math.sin(a) * 8.6), 1.8, 1.2, 1.8, transp=0.2))
    for i in range(4):                                                                    # bras centraux ondulés
        a = i * math.tau / 4 + 0.4
        pts = [(math.cos(a) * (2 + 0.5 * math.sin(j * 1.4)) + math.sin(j * 1.1 + i) * 1.2, -2 - j * 3.2, math.sin(a) * (2 + 0.5 * math.sin(j * 1.4))) for j in range(7)]
        k += curve(col_d, pts, 0.9, transp=0.15)
    for i in range(8):                                                                    # filaments fins
        a = i * math.tau / 8 + 0.2
        pts = [(math.cos(a) * (7 - j * 0.5) + math.sin(j * 1.3 + i) * 0.8, -2 - j * 4.4, math.sin(a) * (7 - j * 0.5)) for j in range(5)]
        k += curve(col, pts, 0.28, joints=False, transp=0.2)
        k.append(ball('ffffff', pts[-1], 0.45, neon=True))
    return with_attrs(k, bob(3, 5, 0))

@modele('Canard', view=(0.9, 0.4, 0.8))
def canard():
    Y, Y_D, OR, OR_D = 'ffd84a', 'f2c233', 'ff8a1e', 'e0701a'
    k = [ell(Y, (0, 4, -0.5), 6.4, 4.4, 8), ell(Y, (0, 7.2, -7), 2.6, 2.8, 2.2, pitch=-35),      # corps, queue
         ball(Y, (0, 10.5, 4.2), 4.1)]                                                          # tête
    for sx in (-1, 1):
        k.append(ell(Y_D, (sx * 5.6, 5.6, -1), 1.4, 2.6, 4.6, roll=sx * 10))                    # ailes
        k.append(ball('ffffff', (sx * 1.8, 11.8, 7.6), 1.05))
        k.append(ball('1b2440', (sx * 1.9, 11.9, 8.4), 0.65))
        k.append(ball('ffffff', (sx * 2.1, 12.3, 8.9), 0.22, neon=True))
    k.append(ell(OR, (0, 10.4, 8.4), 2.2, 0.8, 2.2))                                          # bec
    k.append(ell(OR_D, (0, 9.6, 8.0), 1.8, 0.6, 1.8))
    k += ring('eaffff', (0, 0.3, 0), 9, 1, 24, 0.3, transp=0.4)                                # ronds dans l'eau
    return with_attrs(k, bob(1.0, 4, 0))

@modele('PieuvreSquishy', view=(0.8, 0.35, 1.0))
def pieuvre():
    P, P_D, P_L = 'b58cff', '9a6bff', 'd9c4ff'
    k = [ell(P, (0, 16, 0), 11, 12, 11), ell(P_L, (0, 22, 3), 4, 3, 3)]
    for sx in (-1, 1):
        k.append(ball('ffffff', (sx * 4.5, 15, 9.4), 2.3))
        k.append(ball('1b2440', (sx * 4.7, 15, 10.6), 1.4))
        k.append(ball('ffffff', (sx * 5.2, 15.8, 11.6), 0.45, neon=True))
        k.append(ell('ff9ab8', (sx * 7, 11.8, 8.4), 1.8, 1.0, 0.8, yaw=sx * 30))
    for i in range(8):                                                                    # tentacules enroulés
        a = i * math.tau / 8 + math.pi / 8
        pts = []
        for j in range(9):
            t = j / 8
            rr = 7 + t * 14
            curl = t * 1.2
            pts.append((math.cos(a + curl * 0.4) * rr, 6 - t * 5 + math.sin(t * math.pi) * 2, math.sin(a + curl * 0.4) * rr))
        k += curve(P_D if i % 2 else P, pts, 2.2 - 0.12 * 8 * 0.9, transp=0)
        k.append(ball(P_L, pts[-1], 1.2))
    return k

# ================================================================== 7. LAVE ROSE
PINK, PINK_L, PINK_D = 'ff46c8', 'ffb0ea', 'c21a8f'
BAS, BAS_D, BAS_L, BAS_M = '2a2323', '1c1716', '433836', '352c2c'

@modele('Volcan', view=(0.7, 0.35, 1.0))
def volcan():
    k = []
    R, H, n = 58, 104, 13
    prof = lambda t: R * (1 - t) ** 1.45 + R * 0.2
    h = H / n
    for i in range(n):                                                                    # terrasses octogonales alignées
        r = prof(i / n)
        extra = 3 if i == 0 else 0
        k += octo([BAS, BAS_M][i % 2], (0, i * h + (h - extra) / 2, 0), 2 * r, h + 0.06 + extra, 2 * r, yaw=0)
    top = n * h
    rc = prof(1)
    k += ring(BAS_L, (0, top + 2, 0), rc * 1.06, 4.5, 16, 4)                                 # lèvre du cratère
    k.append(cyl(PINK, (0, top - 1, 0), rc * 1.0, 2.6, neon=True, light=(PINK, 60, 4)))
    for j in range(4):                                                                    # coulées : une par face, marche après marche
        ang = j * math.pi / 2 + math.pi / 4 * (j % 2)
        d = (math.sin(math.radians(ang * 180 / math.pi)), 0, math.cos(math.radians(ang * 180 / math.pi)))
        d = (math.sin(ang), 0, math.cos(ang))
        for i in range(n):
            r = prof(i / n)
            ap = r if (j % 2 == 0) else r * 0.83                                          # apothème de la face
            w = 11 - i * 0.5
            k.append(box(PINK if i % 2 else PINK_D, (d[0] * (ap + 0.5), i * h + h / 2, d[2] * (ap + 0.5)), (w, h + 0.2, 1.2),
                         yaw=math.degrees(ang), neon=True))
            if i < n - 1:
                r2 = prof((i + 1) / n)
                ap2 = r2 if (j % 2 == 0) else r2 * 0.83
                run = ap - ap2 + 1.2
                k.append(box(PINK_D, (d[0] * (ap2 + run / 2 - 0.2), i * h + h + 0.1, d[2] * (ap2 + run / 2 - 0.2)), (w - 0.6, 0.4, run), yaw=math.degrees(ang), neon=True))
        k.append(cyl(PINK, (d[0] * (R * 1.2 + 5), -0.2, d[2] * (R * 1.2 + 5)), 7.5, 0.6, neon=True))
    for j in range(5):                                                                    # panache de fumée
        c = (j * j * 1.1, top + 10 + j * 9, -j)
        r = 6 + j * 1.6
        col = ['5b4a55', '4d3f48', '6a5864'][j % 3]
        k += with_attrs([ball(col, c, r), ball(col, (c[0] + r * 0.6, c[1] - r * 0.3, c[2] + r * 0.3), r * 0.7),
                         ball(col, (c[0] - r * 0.55, c[1] + r * 0.2, c[2] - r * 0.3), r * 0.6)], bob(2.5, 6, j * 0.1))
    return k

@modele('OeufDuDragon', view=(0.7, 0.35, 1.0))
def oeuf_dragon():
    GOLD, GOLD_D, EGG, EGG_D = 'f2b632', 'c98f1f', '3f7d3a', '2d5e2a'
    rng = random.Random(2)
    k = []
    for i, (r, h) in enumerate(((15, 8), (12, 12), (9.5, 14), (8, 14))):                   # piton de basalte qui s'affine
        y = sum(x[1] for x in ((15, 8), (12, 12), (9.5, 14), (8, 14))[:i])
        k += octo([BAS, BAS_M][i % 2], (0, y + h / 2, 0), 2 * r, h + 0.06, 2 * r, yaw=0)
    top = 48
    k += octo(GOLD_D, (0, top + 1, 0), 15, 2, 15, yaw=0)
    k.append(cyl(PINK, (0, top + 2, 0), 6.5, 0.5, neon=True, light=(PINK, 30, 3)))
    k.append(ell(EGG, (0, top + 9.5, 0), 5.2, 7.6, 5.2))
    for j, (dy, rr) in enumerate(((-3.2, 4.1), (0.2, 5.0), (3.6, 4.2))):                  # bandes d'écailles
        k += ring(EGG_D, (0, top + 9.5 + dy, 0), rr + 0.15, 0.7, 20, 1.1)
    k.append(ell('7bd66b', (-1.6, top + 12.5, 3.4), 1.2, 1.8, 0.6, neon=True))             # reflet
    for a in range(4):                                                                    # griffes d'or
        ang = a * math.tau / 4 + math.pi / 4
        b = (math.cos(ang) * 7, top + 2, math.sin(ang) * 7)
        m1 = (math.cos(ang) * 8, top + 8, math.sin(ang) * 8)
        t = (math.cos(ang) * 4.6, top + 13.5, math.sin(ang) * 4.6)
        k += [rod(GOLD, b, m1, 1.1), ball(GOLD, m1, 1.1), rod(GOLD, m1, t, 0.8), rod(GOLD_D, t, (math.cos(ang) * 3.4, top + 14.8, math.sin(ang) * 3.4), 0.45)]
    return k

@modele('Geyser')
def geyser(h=26):
    rng = random.Random(3)
    k = []
    for a in range(7):                                                                    # margelle de pierres
        ang = a * math.tau / 7
        k += rocher_facettes([BAS, BAS_M, BAS_D], (math.cos(ang) * 7.5, 1.2, math.sin(ang) * 7.5), 2.6, rng, n=2)
    k.append(cyl(PINK_D, (0, 0, 0), 6.5, 1, neon=True))
    jet = [cyl(PINK, (0, 0, 0), 3.4, h, neon=True, transp=0.3, light=(PINK, 35, 3)), cyl(PINK_L, (0, 0, 0), 1.6, h * 0.85, neon=True)]
    for a in range(6):
        ang = a * math.tau / 6
        jet.append(ball(PINK, (math.cos(ang) * 3.6, h + 0.6, math.sin(ang) * 3.6), 1.3, neon=True))
        jet.append(ball(PINK, (math.cos(ang + 0.5) * 6, h - 3 - (a % 2) * 2, math.sin(ang + 0.5) * 6), 0.8, neon=True))
    jet.append(ball(PINK, (0, h + 1.8, 0), 2.2, neon=True))
    k += with_attrs(jet, bob(h * 0.16, 3, 0))
    return k

@modele('AiguilleObsidienne', view=(0.7, 0.3, 1.0))
def aiguilles():
    OBS, OBS_L = '251c35', '3a2b52'
    k = []
    for j, (dx, dz, hh, w, tilt, ly) in enumerate([(0, 0, 58, 8, 6, 0), (7, 4, 38, 5.5, 18, -40), (-6, 5, 30, 5, 22, 150),
                                                     (3, -6, 24, 4, 25, 60), (-4, -5, 16, 3.4, 30, 220)]):
        k += cristal(OBS if j % 2 == 0 else OBS_L, (dx, -1, dz), hh, w, yaw=j * 25, tilt=tilt, lean_yaw=ly)
    for j in range(5):                                                                    # éclats roses au pied
        a = j * 1.3
        k += cristal(PINK, (math.cos(a) * 7, -0.5, math.sin(a) * 7), 5 + (j % 3) * 1.5, 1.4, yaw=j * 40, tilt=25, lean_yaw=-math.degrees(a) + 90, neon=True)
    return k

@modele('RocherFlottant')
def rocher_flottant(seed=1):
    rng = random.Random(seed)
    k = rocher_facettes([BAS, BAS_M, BAS_D, BAS_L], (0, 0, 0), 8, rng, n=4, flottant=True)
    for j in range(3):
        a = rng.uniform(0, math.tau)
        k += cristal(PINK, (math.cos(a) * 3, 6, math.sin(a) * 3), 6 + j * 1.5, 1.8, yaw=j * 30, tilt=15 + j * 6, lean_yaw=-math.degrees(a) + 90, neon=True)
    for j in range(3):                                                                    # gouttes de lave sous le rocher
        k.append(ell(PINK, (rng.uniform(-3, 3), -9 - j * 2.5, rng.uniform(-3, 3)), 0.9, 1.4, 0.9, neon=True))
    return k

# ================================================================== 8. BEURRE : petit-déjeuner
CHROME, CHROME_D, TOAST, TOAST_L, CRUST, BUTTER, BUTTER_L = 'd7dce3', 'a9b1bc', 'e8b86a', 'f2cf8d', 'a86b2d', 'ffe066', 'fff0a8'

def tranche_pain(c, s=1.0, beurre=True, confiture=False):
    """Tranche de pain de mie grillée dans le plan XY (face +Z) : croûte, mie, dôme du haut."""
    x, y, z = c
    k = [box(CRUST, (x, y - 1 * s, z), (15 * s, 15 * s, 2.4 * s)),
         ell(CRUST, (x, y + 6.5 * s, z), 8.6 * s, 4.4 * s, 1.2 * s),
         box(TOAST, (x, y - 1 * s, z), (13.4 * s, 13.4 * s, 2.7 * s)),
         ell(TOAST, (x, y + 6.3 * s, z), 7.6 * s, 3.6 * s, 1.35 * s),
         box(TOAST_L, (x, y - 1 * s, z), (10 * s, 10 * s, 2.8 * s))]
    for j in range(3):
        k.append(box('c98b45', (x - 4 * s + j * 4 * s, y + 1 * s - j * 2.5 * s, z + 1.45 * s), (1.6 * s, 0.4 * s, 0.1)))
    if beurre:
        k += [box(BUTTER, (x + 1 * s, y + 0.5 * s, z + 1.9 * s), (5 * s, 4 * s, 1.2 * s), roll=12), box(BUTTER_L, (x + 0.8 * s, y + 0.8 * s, z + 2.55 * s), (3.4 * s, 2.4 * s, 0.3 * s), roll=12)]
    if confiture:
        k.append(ell('c8102e', (x - 1.5 * s, y - 2 * s, z + 1.4 * s), 4.5 * s, 3.6 * s, 0.35 * s))
    return k

@modele('GrillePain', view=(0.8, 0.4, 1.0))
def grille_pain():
    k = []
    k += bevel_box(CHROME_D, (0, 2, 0), (48, 4, 28), 0.8, hex_edge='8e97a3')                # socle
    k += bevel_box(CHROME, (0, 21, 0), (46, 34, 26), 2.4, steps=2, hex_edge='eef1f5')        # corps
    for dz in (-5.5, 5.5):                                                                # fentes
        k.append(box('1d2126', (0, 38.05, dz), (34, 0.3, 4.2)))
        k.append(box('ff7a1a', (0, 37.9, dz), (32, 0.3, 3.4), neon=True, light=('ff7a1a', 16, 1.5) if dz > 0 else None))
    k.append(box('8e97a3', (0, 21, 13.1), (40, 0.6, 0.3)))                                 # ligne de carrosserie
    k += [box('2a2f3a', (23.5, 26, 0), (1.4, 16, 2.4)), bevel_box('2a2f3a', (25, 30, 0), (3, 3, 7), 0.4),
          disc('d92c3a', (26.6, 30, 0), 1.2, 0.4, axis=(1, 0, 0))]                          # levier
    k += [disc('2a2f3a', (23.2, 12, 6), 2.6, 0.8, axis=(1, 0, 0)), box('ffffff', (23.7, 13.4, 6), (0.3, 1.8, 0.5))]   # molette
    k.append(ball('ff3b30', (23.4, 18, 6), 0.7, neon=True))
    for sx in (-1, 1):
        for sz in (-1, 1):
            k.append(cyl('2a2f3a', (sx * 20, -0.8, sz * 10), 2, 0.8))
    k += curve('2a2f3a', bezier((-23, 3, -8), (-34, 3, -10), (-36, 0.8, 6), (-48, 0.8, 16), 6), 0.9)
    for i, dz in enumerate((-5.5, 5.5)):                                                  # tartines qui sautent
        t = tranche_pain((0, 44, dz), 1.35, beurre=False)
        k += with_attrs(t, bob(8, 3.4, i * 0.5))
    return k

@modele('PilePancakes', view=(0.8, 0.45, 1.0))
def pile_pancakes():
    PAN, PAN_D, PAN_L, SYRUP = 'e0a458', 'b8792f', 'f0c27a', '9a4310'
    k = [cyl('f4f1ea', (0, 0, 0), 17, 1.2), cyl('e3dfd4', (0, 1.2, 0), 15, 0.4), cyl('f4f1ea', (0, 1.2, 0), 12.5, 0.45)]
    k += ring('f4f1ea', (0, 1.6, 0), 16.5, 1.2, 36, 1)
    y = 1.6
    for i in range(7):                                                                    # crêpes épaisses, bord doré
        r = 12 - (i % 2) * 0.5 + (0.3 if i == 3 else 0)
        k.append(cyl(PAN_D, (0.3 * math.sin(i * 1.7), y, 0.3 * math.cos(i * 1.7)), r, 3))
        k.append(cyl(PAN, (0.3 * math.sin(i * 1.7), y + 0.15, 0.3 * math.cos(i * 1.7)), r - 0.4, 2.8))
        y += 3
    k.append(cyl(PAN_L, (0, y - 0.2, 0), 11, 0.4))
    k.append(ell(SYRUP, (0, y + 0.1, 0), 10.5, 0.6, 10.5, transp=0.15))                     # sirop
    for a in range(9):
        ang = a * math.tau / 9 + 0.2
        L = 5 + (a * 7 % 5) * 2.2
        top = (math.cos(ang) * 11.5, y, math.sin(ang) * 11.5)
        bot = (math.cos(ang) * 12.4, y - L, math.sin(ang) * 12.4)
        k += [rod(SYRUP, top, bot, 0.9, transp=0.1), ball(SYRUP, bot, 1.1, transp=0.1)]
    k += bevel_box(BUTTER, (0.5, y + 2, -0.5), (7, 3.2, 7), 0.6, hex_edge=BUTTER_L)
    k.append(ell(BUTTER_L, (0.5, y + 0.7, -0.5), 5.5, 0.4, 5.5))
    for j in range(7):                                                                    # myrtilles
        ang = j * 0.9
        k.append(ball('3b3f8f', (math.cos(ang) * 14, 2.6, math.sin(ang) * 14), 1.1))
    # fourchette plantée
    fk = [box(CHROME, (0, 0, 0), (1.6, 18, 0.6)), box(CHROME, (0, 10, 0), (4.2, 3, 0.6))]
    for t in range(4):
        fk.append(box(CHROME, (-1.6 + t * 1.07, 13.5, 0), (0.6, 5, 0.6)))
    k += transform(fk, (0, 0, 0), mul(Ry(30), Rz(160)), 1.0, (4, y + 14, 3))
    return k

@modele('BeurreFondant', view=(0.8, 0.5, 1.0))
def beurre_fondant():
    k = bevel_box('f4f1ea', (0, 0.8, 0), (34, 1.6, 22), 0.4)                               # beurrier
    k.append(ell(BUTTER_L, (0, 1.7, 1), 13, 0.5, 9))                                        # flaque
    k += bevel_box(BUTTER, (0, 7.4, 0), (20, 11, 13), 1.4, hex_edge=BUTTER_L, steps=2)      # la plaquette qui fond
    for j in range(5):
        x = -8 + j * 4
        L = 3 + (j % 3) * 2.2
        k += [rod(BUTTER, (x, 8.5, 6.6), (x, 8.5 - L, 6.9), 1.1), ball(BUTTER, (x, 8.5 - L, 6.9), 1.2)]
    knife = [box(CHROME, (0, 5, 0), (0.5, 10, 3.2)), box(BUTTER, (0.3, 3, 0), (0.3, 3, 3.4)),
             box('3a2418', (0, 14, 0), (1.6, 8, 2.4)), box('c9a36a', (0, 14, 1.25), (1.7, 7, 0.2))]
    k += transform(knife, (0, 0, 0), mul(Ry(20), Rz(-18)), 1.0, (3, 9, -1))
    return k

@modele('OeufAuPlat', view=(0.7, 0.6, 1.0))
def oeuf_au_plat():
    W, W_D, Y = 'fbfaf6', 'e9e5da', 'ffb61e'
    k = []
    rng = random.Random(5)
    for j in range(9):                                                                    # blanc aux bords irréguliers
        a = j * math.tau / 9
        rr = rng.uniform(5, 8)
        k.append(ell(W, (math.cos(a) * rr, 0.6, math.sin(a) * rr), rng.uniform(7, 9), 0.8, rng.uniform(6, 8), yaw=-math.degrees(a)))
    k.append(ell(W_D, (0, 0.3, 0), 12, 0.5, 11))
    k.append(ell(W, (1, 1.2, 1), 9, 1.2, 8))
    k.append(ell(Y, (1, 2.4, 1), 5, 3.6, 5))
    k.append(ell('ffd66b', (-0.4, 4.6, 2.2), 1.4, 0.8, 1.2))
    return k

@modele('TartineVolante', view=(0.5, 0.3, 1.0))
def tartine_volante():
    k = tranche_pain((0, 0, 0), 1.0, beurre=True, confiture=True)
    for sx in (-1, 1):                                                                    # petites ailes
        for j in range(3):
            k.append(ell('ffffff', (sx * (9.5 + j * 2.2), 3 - j * 1.3, -0.6), 3.4 - j * 0.6, 1.2, 0.5, roll=sx * (25 + j * 12)))
    return with_attrs(k, bob(3, 4, 0))

# ================================================================== 9. RIVIÈRE GELÉE
ICE, ICE_D, ICE_L, SNOW, SNOW_D, PINE, PINE_L, BARK = 'bfeaff', '8cc8ef', 'e3f6ff', 'f7fbff', 'dfe9f3', '1f5b4a', '2b7a5f', '5a3d2b'

def sapin(base, h):
    x, y, z = base
    k = [cyl(BARK, (x, y, z), h * 0.05, h * 0.2)]
    for i in range(4):
        w = h * (0.62 - i * 0.13)
        yy = y + h * (0.16 + i * 0.19)
        k += octo(PINE if i % 2 else PINE_L, (x, yy + h * 0.1, z), w, h * 0.2, w, yaw=i * 22)
        k += octo(SNOW, (x, yy + h * 0.2 + h * 0.012, z), w * 0.72, h * 0.025, w * 0.72, yaw=i * 22)
    k.append(ball(SNOW, (x, y + h * 0.98, z), h * 0.04))
    return k

def glacon(c, L, w):
    """Stalactite de glace qui pend (pointe vers le bas)."""
    k = cristal(ICE_L, (0, 0, 0), L, w, transp=0.15)
    return transform(k, (0, 0, 0), Rx(180), 1.0, c)

@modele('ArcheGlacier', view=(0.8, 0.3, 1.0))
def arche_glacier():
    k = []
    n, Rx_, Ry_ = 13, 34, 50
    for i in range(n):                                                                    # voussoirs chanfreinés
        a0, a1 = math.pi * i / n, math.pi * (i + 1) / n
        am = (a0 + a1) / 2
        p = (math.cos(am) * Rx_, math.sin(am) * Ry_, 0)
        L = math.hypot(math.cos(a1) * Rx_ - math.cos(a0) * Rx_, math.sin(a1) * Ry_ - math.sin(a0) * Ry_) + 4.2
        ang = math.degrees(math.atan2(math.sin(a1) * Ry_ - math.sin(a0) * Ry_, math.cos(a1) * Rx_ - math.cos(a0) * Rx_))
        piece = bevel_box(ICE if i % 2 else ICE_D, (0, 0, 0), (L, 12, 16 + (i % 2) * 0.5), 1.2, top=True, bottom=True, hex_edge=ICE_L)
        k += transform(piece, (0, 0, 0), Rz(ang + 180), 1.0, p)
        # neige sur l'extrados
        up = (math.cos(am), math.sin(am), 0)
        k += transform([box(SNOW, (0, 0, 0), (L, 1.6 + (i % 2) * 0.1, 17.2 + (i % 2) * 0.3))], (0, 0, 0), Rz(ang + 180), 1.0, (p[0] + up[0] * 6.6, p[1] + up[1] * 6.6, 0)) if math.sin(am) > 0.35 else []
        if 2 <= i <= n - 3 and i % 2 == 0:                                                 # stalactites à l'intrados
            q = (math.cos(am) * (Rx_ - 6.5), math.sin(am) * (Ry_ - 6.5), 0)
            k += glacon(q, 7 + (i % 3) * 2, 1.6)
            k += glacon((q[0] + 2.5, q[1] - 0.5, 4), 4.5, 1.1)
    for sx in (-1, 1):                                                                    # piles et congères
        k += bevel_box(ICE_D, (sx * Rx_, 3, 0), (18, 6, 20), 1, hex_edge=ICE)
        k += [ell(SNOW, (sx * (Rx_ + 7), 0.5, 5), 8, 4, 7), ell(SNOW_D, (sx * (Rx_ - 5), 0.4, -6), 6, 3, 6)]
    k += sapin((Rx_ + 14, 0, -6), 26)
    return k

@modele('Iceberg', view=(0.8, 0.45, 1.0))
def iceberg():
    rng = random.Random(4)
    k = []
    y = -4
    for i, (r, h, col) in enumerate(((20, 5, ICE_D), (18, 5, ICE), (15.5, 4, ICE_D), (13, 3, ICE))):
        k += octo(col, (0, y + h / 2, 0), 2 * r, h + 0.06, 2 * r * 0.8, yaw=0)
        y += h
    k += octo(SNOW, (0, 13.7, 0), 25, 1.4, 20, yaw=0)
    k += ring(ICE_L, (0, 0.2, 0), 23, 1.4, 30, 0.4, transp=0.4)
    for (dx, dz, h) in ((-5, -3, 24), (4, 2, 18), (0.5, -7, 14)):
        k += sapin((dx, 14.2, dz), h)
    # pingouin qui regarde la piste
    P = (6, 14.2, 6)
    k += [ell('1d2433', (P[0], P[1] + 3, P[2]), 2.2, 3, 2), ell('ffffff', (P[0], P[1] + 2.7, P[2] + 0.9), 1.6, 2.4, 1.3),
          ball('1d2433', (P[0], P[1] + 6.4, P[2]), 1.7), ell('ff9f1a', (P[0], P[1] + 6.2, P[2] + 1.8), 0.5, 0.35, 0.8)]
    for sx in (-1, 1):
        k += [ball('ffffff', (P[0] + sx * 0.6, P[1] + 6.8, P[2] + 1.35), 0.35), ball('1d2433', (P[0] + sx * 0.62, P[1] + 6.85, P[2] + 1.6), 0.18),
              ell('1d2433', (P[0] + sx * 2.1, P[1] + 3, P[2]), 0.4, 1.8, 0.9, roll=sx * 20), ell('ff9f1a', (P[0] + sx * 0.8, P[1] + 0.2, P[2] + 0.8), 0.6, 0.25, 0.9)]
    return k

@modele('Cristaux', view=(0.8, 0.35, 1.0))
def cristaux():
    k = [ell(SNOW, (0, 0, 0), 11, 3, 10), ell(SNOW_D, (3, 0, -3), 7, 2.2, 6)]
    for j, (dx, dz, h, w, t, ly) in enumerate([(0, 0, 34, 5, 4, 0), (4, 2, 24, 3.6, 22, -30), (-4, 3, 22, 3.4, 20, 160), (2, -4, 18, 3, 26, 70),
                                                 (-3, -3, 14, 2.6, 30, 230), (6, -1, 10, 2, 35, -60)]):
        k += cristal('9ff0ff' if j == 0 else ICE, (dx, 1, dz), h, w, yaw=j * 20, tilt=t, lean_yaw=ly, transp=0.15)
    k.append(ball('dffcff', (0, 14, 0), 1.2, neon=True, light=('7ff4ff', 30, 2)))
    return k

@modele('BonhommeNeige', view=(0.7, 0.3, 1.0))
def bonhomme_neige():
    k = [ball(SNOW, (0, 7, 0), 8), ball(SNOW, (0, 18, 0), 6), ball(SNOW, (0, 27, 0), 4.5), ell(SNOW_D, (0, 0.5, 0), 10, 1.5, 10)]
    for j in range(3):
        k.append(ball('1d2126', (0, 14.5 + j * 3, 5.8 - abs(j - 1) * 0.3), 0.6))
    k.append(rod('ff8a1e', (0, 27, 4.2), (0, 26.6, 8.5), 0.7))                              # carotte
    for sx in (-1, 1):
        k.append(ball('1d2126', (sx * 1.6, 28.4, 3.9), 0.55))
        k += curve(BARK, [(sx * 5.5, 19, 0), (sx * 10, 23, 0), (sx * 12, 26, 0.5)], 0.4)
        k.append(rod(BARK, (sx * 10, 23, 0), (sx * 11.5, 22, 1), 0.3))
    k += [cyl('d92c3a', (0, 22.5, 0), 4.6, 1.6), box('d92c3a', (2.5, 20, 4.2), (1.6, 5, 0.6), roll=10), box('ffffff', (2.5, 19, 4.55), (1.6, 0.6, 0.1), roll=10)]   # écharpe
    k += [cyl('1d2126', (0, 30.6, 0), 4.2, 0.6), cyl('1d2126', (0, 31.2, 0), 2.8, 5), cyl('d92c3a', (0, 32, 0), 2.9, 1)]    # chapeau
    return k

# ================================================================== 10. PONT D'OS : le dragon endormi
BONE, BONE_D, BONE_L, EYE, MOSS = 'e8dfc8', 'c9bd9f', 'f5efe0', '7dff6a', '5c8a3a'

@modele('CraneDragon', view=(0.8, 0.35, 1.0))
def crane_dragon():
    DARK = '14180f'
    k = []
    # boîte crânienne : bloc chanfreiné large et plat, crête arrière
    k += bevel_box(BONE, (0, 15, -8), (30, 20, 26), 2.4, top=True, bottom=False, hex_edge=BONE_L, steps=2)
    k += bevel_box(BONE_D, (0, 26.2, -12), (16, 3.4, 18), 1, top=True)
    for sx in (-1, 1):
        k.append(wedge(BONE_D, (sx * 9, 25.5, -22), (4, 6, 8), yaw=0))                    # crête en pointes
    # museau long qui s'affine, pente sur le dessus
    k += bevel_box(BONE, (0, 10, 16), (20, 10, 26), 1.2, top=False, bottom=False)
    k.append(wedge(BONE_L, (0, 17.5, 16), (20, 5, 26), yaw=180))                           # le museau descend vers le nez
    k += bevel_box(BONE, (0, 9.5, 32), (15, 8, 10), 1, top=True, hex_edge=BONE_L)        # bout du nez
    for sx in (-1, 1):
        k.append(box(DARK, (sx * 3.4, 10.8, 37.05), (1.2, 2.6, 0.3), roll=sx * 20))                # narines (fentes)
        # orbites profondes et yeux verts, arcades saillantes en pente
        k.append(box(DARK, (sx * 11.5, 19, 5.4), (7, 6, 1.2)))
        k.append(ball(EYE, (sx * 11.5, 19, 5.9), 1.9, neon=True, light=(EYE, 40, 3)))
        k.append(wedge(BONE_L, (sx * 11.5, 23.5, 6), (9, 3, 4), yaw=180))
        k += bevel_box(BONE_D, (sx * 15.5, 11, 2), (3, 7, 16), 0.6, top=True)                # pommettes
        for t in range(5):                                                                 # crocs du haut
            k += glacon_os((sx * 8.8, 5.2, 8 + t * 5.4), 4.4 - (t == 4) * 1.2, 1.5)
        pts = bezier((sx * 13, 24, -14), (sx * 24, 30, -24), (sx * 27, 42, -30), (sx * 21, 54, -38), 7)   # cornes
        for j in range(len(pts) - 1):
            rr = 3.2 - j * 0.42
            k.append(rod(BONE_D if j < 4 else BONE, pts[j], pts[j + 1], rr))
            k.append(ball(BONE_D if j < 4 else BONE, pts[j + 1], rr))
        k.append(ell(MOSS, (sx * 14, 5.5, -16), 4, 1.8, 6))                               # mousse
    # mâchoire entrouverte et ses dents
    jaw = bevel_box(BONE_D, (0, 0, 0), (18, 4, 30), 0.8, top=False, bottom=True)
    for sx in (-1, 1):
        for t in range(4):
            jaw += cristal('fffbef', (sx * 7.4, 1.8, -6 + t * 5.6), 3.2, 1.2)
    k += transform(jaw, (0, 0, 0), Rx(12), 1.0, (0, 2.6, 14))
    for v in range(4):                                                                    # vertèbres du cou qui plongent
        k += transform(bevel_box(BONE if v % 2 else BONE_D, (0, 0, 0), (10 - v, 8 - v, 7), 0.8, top=True, bottom=True), (0, 0, 0), Rx(-14), 1.0, (0, 9 - v * 3.2, -24 - v * 9))
    for j in range(3):                                                                    # champignons lumineux
        a = 2.2 + j * 0.5
        c = (math.cos(a) * 22, 0, math.sin(a) * 14 - 8)
        k += [cyl('e8e0c8', c, 0.5, 2.5 + j), ell(EYE, (c[0], c[1] + 2.6 + j, c[2]), 1.8, 0.8, 1.8, neon=True)]
    return k

def glacon_os(c, L, w):
    k = cristal('fffbef', (0, 0, 0), L, w)
    return transform(k, (0, 0, 0), Rx(180), 1.0, c)

@modele('SqueletteDragon', view=(1.0, 0.35, 0.3))
def squelette_dragon():
    k = []
    N = 16
    for v in range(N):                                                                    # colonne en arche
        t = v / (N - 1)
        p = (0, math.sin(t * math.pi) * 42 - 5, -68 + t * 136)
        s = 1 - abs(t - 0.5) * 0.6
        k += bevel_box(BONE if v % 2 else BONE_D, p, (10 * s, 8 * s, 7), 0.8, top=True, bottom=True, hex_edge=BONE_L)
        k += cristal(BONE_D, (p[0], p[1] + 3.5 * s, p[2]), 8 * s, 2.4 * s)
        if 3 <= v <= 12:                                                                 # côtes courbes
            for sx in (-1, 1):
                pts = bezier((sx * 4.5 * s, p[1], p[2]), (sx * 22, p[1] + 2, p[2] + 2), (sx * 30, p[1] - 14, p[2] + 4), (sx * 27, -3, p[2] + 6), 6)
                for j in range(len(pts) - 1):
                    k.append(rod(BONE, pts[j], pts[j + 1], 1.9 - j * 0.18))
                    if j < len(pts) - 2:
                        k.append(ball(BONE, pts[j + 1], 1.9 - (j + 1) * 0.18))
    for sx in (-1, 1):
        k.append(ell(MOSS, (sx * 26, 0.2, 10), 7, 1.2, 9))
    return k

@modele('FeuFollet')
def feu_follet():
    k = [ball('eaffe0', (0, 0, 0), 1.0, neon=True, light=(EYE, 22, 2)), ball(EYE, (0, 0, 0), 1.8, neon=True, transp=0.35),
         ball(EYE, (0, 0, 0), 2.8, neon=True, transp=0.8)]
    for j in range(4):                                                                    # traînée qui ondule
        k.append(ball(EYE, (math.sin(j * 1.3) * 0.8, -2.6 - j * 1.9, -j * 0.8), 1.2 - j * 0.22, neon=True, transp=0.3 + j * 0.12))
    return with_attrs(k, bob(3.5, 4, 0))

@modele('LanterneMarais', view=(0.7, 0.3, 1.0))
def lanterne_marais():
    WOOD, WOOD_D, IRON = '5a3d2b', '3f2a1d', '2b2f36'
    k = [box(WOOD, (0, 11, 0), (2.2, 22, 2.2)), box(WOOD_D, (0, 21.4, 2.5), (1.6, 1.6, 7)), box(WOOD_D, (0, 18.8, 1.2), (1.2, 1.2, 4.4), pitch=45)]
    k += [rod(IRON, (0, 21, 5.6), (0, 18.8, 5.6), 0.12), box(IRON, (0, 18.5, 5.6), (2.6, 0.4, 2.6)), box(IRON, (0, 14.5, 5.6), (2.8, 0.5, 2.8))]
    for sx in (-1, 1):
        for sz in (-1, 1):
            k.append(box(IRON, (sx * 1.2, 16.5, 5.6 + sz * 1.2), (0.3, 4, 0.3)))
    k.append(box(EYE, (0, 16.5, 5.6), (1.6, 3, 1.6), neon=True, light=(EYE, 30, 2)))
    k.append(wedge(IRON, (0, 19.3, 5.6 + 0.7), (2.8, 1.4, 1.4), yaw=180))
    k.append(wedge(IRON, (0, 19.3, 5.6 - 0.7), (2.8, 1.4, 1.4), yaw=0))
    k.append(ell(MOSS, (0, 0.3, 0), 3.5, 0.8, 3.5))
    return k

# ================================================================== 12. DERNIER CLIC
CYAN, NPINK, ORANGE, NAVY, NAVY_L = '27e8ff', 'ff2fb4', 'ff7a3a', '161826', '262a44'

@modele('SoleilSynthwave', view=(0.2, 0.1, 1.0))
def soleil_synthwave():
    k = []
    R = 44
    for i in range(12):
        y = -R + (i + 0.5) * 2 * R / 12
        half = math.sqrt(max(0, R * R - y * y))
        th = 2 * R / 12 * (0.55 + 0.45 * i / 11)
        if half > 2:
            col = [NPINK, 'ff4f9a', 'ff6a7a', ORANGE, 'ff9a4a', 'ffc24a'][min(5, i // 2)]
            k.append(box(col, (0, y, 0), (half * 2, th, 1.2), neon=True))
    return transform(k, (0, 0, 0), IDENT, 1.0, (0, R, 0))

def ecran_neon(texte, w=86, h=50):
    k = []
    k += bevel_box(NAVY, (0, 1.5, 0), (30, 3, 20), 0.8, hex_edge=NAVY_L)
    k.append(box(NAVY_L, (0, 26, -4), (7, 46, 4)))
    k.append(box(NAVY, (0, 49 + h / 2, 0), (w + 6, h + 6, 4)))
    k.append(box(CYAN, (0, 49 + h / 2, -0.1), (w + 6.4, h + 6.4, 3.4), neon=True))           # liseré néon
    k.append(box('0b0d1a', (0, 49 + h / 2, 2.05), (w, h, 0.3)))
    return k

@modele('EcranChargement', view=(0.55, 0.3, 1.0))
def ecran_chargement():
    w, h = 86, 50
    k = ecran_neon('', w, h)
    cy = 49 + h / 2
    k += pixel_text('LOADING', (0, cy + 16, 2.35), 1.2, 'dfe7ff', depth=0.3)
    k += pixel_text('99%', (0, cy - 1, 2.4), 2.5, CYAN, depth=0.4)
    k.append(box('2a2f4a', (0, cy - 16, 2.3), (66, 6, 0.3)))
    for i in range(20):                                                                   # barre segmentée : 19 sur 20
        k.append(box(NPINK if i < 19 else '3a3f5e', (-31.35 + i * 3.3, cy - 16, 2.5), (2.8, 4.2, 0.3), neon=i < 19, light=(NPINK, 50, 2) if i == 10 else None))
    return k

@modele('CurseurGeant', view=(0.4, 0.2, 1.0))
def curseur_geant():
    ARROW = ['10000000', '11000000', '12100000', '12210000', '12221000', '12222100', '12222210', '12222221', '12221111', '12112100', '11012210', '10001210', '00001221', '00000110']
    k = []
    px = 2.4
    for row, line in enumerate(ARROW):
        for c_, bit in enumerate(line):
            if bit == '1':
                k.append(box('11131f', ((c_ - 3.5) * px, (13 - row) * px, 0), (px, px, 2.2)))
            elif bit == '2':
                k.append(box('ffffff', ((c_ - 3.5) * px, (13 - row) * px, 0), (px, px, 1.8), neon=True))
    return with_attrs(k, bob(4, 4, 0))

@modele('CoeurPixel', view=(0.3, 0.2, 1.0))
def coeur_pixel():
    HEART = ['011000110', '122101221', '122212221', '122222221', '012222210', '001222100', '000121000', '000010000']
    k = []
    px = 1.8
    for row, line in enumerate(HEART):
        for c_, bit in enumerate(line):
            if bit == '1':
                k.append(box('3a0a24', ((c_ - 4) * px, (7 - row) * px, 0), (px, px, 1.6)))
            elif bit == '2':
                k.append(box(NPINK, ((c_ - 4) * px, (7 - row) * px, 0), (px, px, 1.3), neon=True))
    k.append(box('ffffff', (-2 * px, 5 * px, 0.5), (px * 0.9, px * 0.9, 0.6), neon=True))
    return k

@modele('BoutonArcade', view=(0.7, 0.45, 1.0))
def bouton_arcade():
    k = bevel_box(NAVY, (0, 4, 0), (40, 8, 40), 1.4, hex_edge=NAVY_L, steps=2)
    k += ring(CYAN, (0, 8.4, 0), 14.5, 1.4, 32, 0.8, neon=True, light=None)
    k += [cyl('2a2f3a', (0, 8, 0), 13.6, 1.4), cyl('d11e48', (0, 9.2, 0), 11.5, 2.2), ell('ff2f5f', (0, 11.4, 0), 11, 4.2, 11),
          ell('ff7a9a', (-3, 14.2, 3), 3, 0.8, 2.2)]
    k += pixel_text('CLICK', (0, 2.2, 20.2), 1.0, CYAN, depth=0.3)
    k.append(ball('ff2f5f', (0, 16, 0), 0.4, neon=True, light=('ff2f5f', 40, 3)))
    return k

# ================================================================== 11. GALAXIE
@modele('StationSpatiale', view=(0.55, 0.35, 1.0))
def station_spatiale():
    MET, MET_D, DARK, GOLD, WHITE = 'dfe3ea', 'a7b0bd', '2b3242', 'e8b23a', 'f7f8fb'
    CELL, CELL_L, WIN = '1f3f9e', '2a55c7', '8ff6ff'
    k = []
    # nœud central : cube chanfreiné habillé de feuille d'or
    k += bevel_box(GOLD, (0, 0, 0), (9, 9, 9), 1.4)
    for sx in (-1, 1):
        k.append(box('c9921f', (sx * 4.55, 0, 0), (0.2, 5, 5)))                       # trappes
    # modules habités (le long de Z) avec anneaux de renfort et hublots
    for z0, z1, r in ((4.5, 21, 4), (-4.5, -17, 4.6)):
        k.append(rod(MET, (0, 0, z0), (0, 0, z1), r))
        sgn = 1 if z1 > 0 else -1
        for t in (0.2, 0.5, 0.8):
            zz = z0 + (z1 - z0) * t
            k.append(rod(MET_D, (0, 0, zz - 0.35), (0, 0, zz + 0.35), r + 0.35))
        for t in (0.35, 0.65):
            zz = z0 + (z1 - z0) * t
            for sx in (-1, 1):
                k.append(box(WIN, (sx * (r - 0.05), 0.8, zz), (0.6, 1.4, 2.2), neon=True))
        k.append(rod(MET_D, (0, 0, z1), (0, 0, z1 + sgn * 1), r * 0.8))                   # bouchons
        k.append(rod(DARK, (0, 0, z1 + sgn * 1), (0, 0, z1 + sgn * 1.8), r * 0.45))
    # capsule amarrée à l'avant
    zc = 22.8
    k += [rod(WHITE, (0, 0, zc), (0, 0, zc + 3), 2.4), rod(MET_D, (0, 0, zc + 3), (0, 0, zc + 4.4), 3),
          rod(WHITE, (0, 0, zc + 4.4), (0, 0, zc + 7), 3.1), rod(DARK, (0, 0, zc + 7), (0, 0, zc + 7.8), 2.2)]
    for sx in (-1, 1):
        k.append(box(CELL, (sx * 6.2, 0, zc + 5.6), (5, 0.3, 2.2)))
    # poutre treillis (le long de X) au-dessus du nœud
    L, ty, a = 40, 7, 1.1
    for yy in (ty - a, ty + a):
        for zz in (-a, a):
            k.append(box(MET_D, (0, yy, zz), (2 * L, 0.45, 0.45)))
    n = 20
    for i in range(n):
        x0, x1 = -L + i * 2 * L / n, -L + (i + 1) * 2 * L / n
        for zz in (-a, a):                                                            # zigzag avant / arrière
            k.append(rod(MET, (x0, ty - a, zz), (x1, ty + a, zz), 0.18))
        k.append(rod(MET, (x0, ty + a, -a), (x1, ty + a, a), 0.18))                   # zigzag dessus
    k.append(box(MET_D, (0, 4.8, 0), (3, 1.8, 3)))                                    # attache au nœud
    # panneaux solaires aux deux bouts : un vers le haut, un vers le bas, cellules en grille
    for sx in (-1, 1):
        xe = sx * (L + 2)
        k.append(rod(DARK, (sx * L, ty, 0), (xe + sx * 1.5, ty, 0), 1.5))             # joint rotatif
        k.append(rod(GOLD, (sx * (L + 0.6), ty, 0), (sx * (L + 1.4), ty, 0), 1.7))
        for sy in (-1, 1):
            y0 = ty + sy * 2.2
            H, Wp = 30, 12
            yc = y0 + sy * H / 2
            k.append(box(MET_D, (xe, yc, 0), (1, H + 1, 0.8)))                        # mât central
            k.append(box(DARK, (xe, yc, 0), (Wp, H, 0.35)))                           # cadre
            rows, cols = 7, 2
            cw, ch = (Wp - 1.6) / cols, (H - 0.9) / rows
            for i in range(cols):
                for j in range(rows):
                    cx = xe + (i - (cols - 1) / 2) * (cw + 0.5) + (0.25 if i == 0 else -0.25) * 0
                    cx = xe + (-1 if i == 0 else 1) * (cw / 2 + 0.55)
                    cy = y0 + sy * (0.45 + ch * (j + 0.5))
                    col = CELL if (i + j) % 2 else CELL_L
                    for sz in (-1, 1):
                        k.append(box(col, (cx, cy, sz * 0.2), (cw - 0.3, ch - 0.3, 0.12)))
        k.append(ball('ff3040' if sx < 0 else '3dff7a', (xe, ty + 2.2 + 30.6, 0), 0.6, neon=True))   # feux de position
    # radiateurs blancs (plans horizontaux) de part et d'autre du nœud
    for sx in (-1, 1):
        x = sx * 16
        k.append(box(MET_D, (x, ty, -3.2), (0.8, 0.8, 4)))
        k.append(box(WHITE, (x, ty, -12), (7, 0.4, 14)))
        for j in range(4):
            k.append(box('cfd6e0', (x, ty + 0.25, -6.5 - j * 3.6), (7, 0.15, 0.5)))
    # antenne parabolique sur le module arrière
    dc = (0, 4.6, -12)
    dish = [rod(MET_D, (0, 4.4, -12), (0, 7.5, -12), 0.4)]
    ax = norm((0, 0.6, 1))
    for i, (r, off) in enumerate(((1.4, 0.0), (3.0, 0.8), (4.4, 1.9), (5.2, 3.2))):
        dish.append(disc(WHITE if i % 2 else 'e9edf3', add((0, 7.8, -12), tuple(v * off for v in ax)), r, 0.5, axis=ax))
    dish.append(rod(MET_D, add((0, 7.8, -12), tuple(v * 1 for v in ax)), add((0, 7.8, -12), tuple(v * 6 for v in ax)), 0.2))
    dish.append(ball('ff3040', add((0, 7.8, -12), tuple(v * 6.3 for v in ax)), 0.5, neon=True))
    k += dish
    # petites antennes fouets
    k += [rod(MET, (2, 4.5, 14), (3.5, 10, 14), 0.12), rod(MET, (-2, -4.2, -9), (-3, -9, -9), 0.12)]
    return k

@modele('Soucoupe', view=(0.8, 0.25, 1.0))
def soucoupe():
    HULL, HULL_D, HULL_L, DARK, GLASS, ALIEN = 'c3cad4', '8d97a5', 'e6ebf1', '2b3242', '9ff4ff', '6bdc4a'
    k = []
    # coque inférieure (lentille) puis supérieure
    for y, r, t, col in ((0, 16, 1.6, HULL_L), (-1.6, 14.5, 1.6, HULL), (-3.0, 12, 1.4, HULL_D), (-4.2, 8, 1.2, DARK)):
        k.append(cyl(col, (0, y, 0), r, t))
    k.append(cyl('7dff9a', (0, -4.5, 0), 5.5, 0.4, neon=True, light=('7dff9a', 40, 3)))
    for y, r, t, col in ((1.6, 13.5, 1.4, HULL), (3.0, 10.5, 1.2, HULL_L)):
        k.append(cyl(col, (0, y, 0), r, t))
    k.append(cyl(DARK, (0, 0.55, 0), 16.2, 0.5))                                      # joint de coque
    # feux tout autour du bord
    for a in range(16):
        ang = a * math.tau / 16
        k.append(ball(['ff4fd8', '4dfcff', 'fff27a', '7dff6a'][a % 4], (math.cos(ang) * 16.1, 0.8, math.sin(ang) * 16.1), 0.7, neon=True))
    # hublots sur la coque supérieure
    for a in range(8):
        ang = a * math.tau / 8 + 0.2
        k.append(box('ffe27a', (math.cos(ang) * 12.2, 2.3, math.sin(ang) * 12.2), (0.3, 0.8, 2), yaw=-math.degrees(ang), neon=True))
    # dôme de verre et son pilote
    k.append(ell(GLASS, (0, 4.2, 0), 8, 6.5, 8, transp=0.55))
    k.append(cyl(DARK, (0, 3.9, 0), 3.2, 1))
    k.append(ell(ALIEN, (0, 7.2, 0), 2.6, 3, 2.4))
    for sx in (-1, 1):
        k.append(ell('10140c', (sx * 1.1, 7.6, 2.0), 0.8, 1.1, 0.5, yaw=sx * 20))
        k.append(rod(ALIEN, (sx * 0.8, 9.8, 0), (sx * 1.8, 11.6, 0), 0.18))
        k.append(ball('ff4fd8', (sx * 1.8, 11.8, 0), 0.4, neon=True))
    k.append(cyl(ALIEN, (0, 3.9 + 1, 0), 1.6, 1.4))
    # rayon tracteur : colonne translucide et anneaux lumineux qui descendent
    k.append(cyl('b8ffd0', (0, -34, 0), 6, 29.5, neon=True, transp=0.86))
    for i in range(4):
        k += with_attrs(ring('7dff9a', (0, -10 - i * 6.5, 0), 6.6 + i * 0.4, 0.5, 20, 0.6, neon=True, transp=0.35), bob(1.5, 2.2, i * 0.25))
    k += petit_velo((0, -22, 0), s=1.3)
    return k

BANDES = ['5c2aa6', '7a3cc8', '7a3cc8', '9a58e8', 'c28bff', 'c28bff', 'ffb3e6', '9a58e8', '9a58e8', '7a3cc8', 'c28bff', 'ff8ad8', 'c28bff',
          '9a58e8', '7a3cc8', '7a3cc8', 'b070ff', 'c28bff', '9a58e8', '7a3cc8', '5c2aa6']
def _bandes_planete(i, n):
    return BANDES[i * len(BANDES) // n]

@modele('PlaneteAnneaux', view=(0.6, 0.35, 1.0))
def planete_anneaux():
    R = 30
    k = stepped_sphere(_bandes_planete, (0, 0, 0), R, n=21)
    k += ring('ffd9b0', (0, 0, 0), 44, 8, 40, 0.9)                                    # anneau principal
    k += ring('e7a8ff', (0, 0, 0), 53, 4, 48, 0.7)                                    # anneau fin extérieur
    k += ring('fff3d6', (0, 0, 0), 38.5, 1.2, 36, 1.1, neon=True, transp=0.3)         # liseré lumineux
    k = transform(k, (0, 0, 0), mul(Rz(-16), Rx(14)))
    lune = [ball('c9c3e2', (62, 10, 0), 5), disc('a59fc4', (62 + 0.8, 10 + 1.5, 4.7), 1.4, 0.6, axis=norm((0.15, 0.3, 1)))]
    k += with_attrs(lune, turn(40, 1, (0, 0, 0)))
    return k

@modele('Lune')
def lune(seed=1):
    rng = random.Random(seed)
    R = 12
    k = [ball('bdb8d6', (0, 0, 0), R)]
    dirs = [(-0.35, 0.45, 3.4), (0.45, 0.1, 2.4), (-0.1, -0.4, 2.8), (0.8, -0.45, 1.8), (-0.85, -0.05, 2.0), (0.25, 0.75, 1.6)]
    for th, ph, r in dirs:                                                            # cratères tournés vers l'avant
        d = (math.sin(th) * math.cos(ph), math.sin(ph), math.cos(th) * math.cos(ph))
        k += cratere((0, 0, 0), R, d, r, 'c8c3e0', '9791b8')
    return k

@modele('Comete', view=(1.0, 0.3, 0.4))
def comete():
    rng = random.Random(7)
    k = rocher_facettes(['d6f1ff', 'bfe6ff', 'eaf8ff'], (0, 0, 0), 3.4, rng, n=3, flottant=True)
    k.append(ball('bff4ff', (0, 0, 0), 0.5, neon=True, light=('bff4ff', 60, 3)))
    for tail, (col, dz) in enumerate((('7fd4ff', 0.5), ('ff8ad8', -0.6))):            # queue ionique (bleue) et de poussière (rose)
        prev = (-3.5, 0, 0)
        for j in range(8):
            p = (-3.5 - (j + 1) * 6, (j + 1) * 0.5, (j + 1) * dz * (1 + j * 0.15))
            k.append(rod(col, prev, p, 3.6 - j * 0.38, neon=True, transp=0.55 + j * 0.05))
            prev = p
    return k

@modele('Asteroide')
def asteroide(seed=3, cristaux=True):
    rng = random.Random(seed)
    k = rocher_facettes(['544d6b', '4a4460', '5f5878', '433d58'], (0, 0, 0), 5, rng, n=4, flottant=True)
    if cristaux:
        for j, (a, t) in enumerate(((0.3, 18), (1.5, 30), (2.6, 24))):
            base = (math.cos(a) * 1.5, 3.2, math.sin(a) * 1.5)
            k += cristal('ff5ad8' if j != 1 else 'b36bff', base, 6 - j * 1.2, 1.5 - j * 0.2, yaw=j * 30, tilt=t, lean_yaw=-math.degrees(a) + 90, neon=True)
    return k

# ================================================================== galerie
if __name__ == '__main__':
    import json, sys
    out = sys.argv[1]
    only = set(sys.argv[2].split(',')) if len(sys.argv) > 2 else None
    g = {}
    for name, (fn, view) in MODELS.items():
        if only and name not in only:
            continue
        g[name] = {'k': fn(), 'view': view}
        print(name, sum(1 for n in g[name]['k'] for _ in parts_of(n)), 'parts')
    json.dump(g, open(out, 'w'))
