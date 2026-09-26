# Décors des 12 niveaux : mise en scène. Les modèles sont dans models.py (construits en parts),
# ici on les pose dans chaque niveau.
# Règles : rien sur le parcours (ni dessus, ni dessous : on vérifie toute la hauteur), rien sur les
# bords du canyon (|x| <= 166), pas de chevauchement entre décors, mouvement compris.
# Tout est en studs (Plastic + Studs_2, le MaterialVariant de Resurface), sauf le néon.
# Usage : python3 setpieces.py levels.json tree.json [niveau]
import json, math, random, sys
from kit import *
from models import MODELS

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

WALL = 166

def envelope(nodes):
    """Boîte englobante, mouvement compris (rotation DecorTurn, flottement DecorBob)."""
    lo, hi = [1e9] * 3, [-1e9] * 3
    for n in nodes:
        for p in parts_of(n):
            m, h = p['cf'], [v / 2 for v in p['size']]
            e = [abs(m[3 + i * 3]) * h[0] + abs(m[4 + i * 3]) * h[1] + abs(m[5 + i * 3]) * h[2] for i in range(3)]
            a = p.get('attrs', {})
            plo = [m[i] - e[i] for i in range(3)]
            phi = [m[i] + e[i] for i in range(3)]
            if 'DecorTurn' in a:
                c = (a['DecorCX'], a['DecorCY'], a['DecorCZ'])
                ax = int(a['DecorAxis'])
                rr = math.sqrt(sum((m[i] - c[i]) ** 2 for i in range(3) if i != ax)) + math.sqrt(sum(v * v for v in e))
                for i in range(3):
                    if i != ax:
                        plo[i], phi[i] = min(plo[i], c[i] - rr), max(phi[i], c[i] + rr)
            if 'DecorBob' in a:
                plo[1] -= abs(a['DecorBob'])
                phi[1] += abs(a['DecorBob'])
            for i in range(3):
                lo[i], hi[i] = min(lo[i], plo[i]), max(hi[i], phi[i])
    return lo, hi

class Level:
    def __init__(self, i):
        self.i, self.ride, self.floor, self.z0 = i, ride(i), floor_y(i), z0(i)
        self.boxes = BOXES.get('Level%d' % i, [])
        self.rng = random.Random(7000 + i)
        self.kids = []
        self.placed = []          # boîtes des décors déjà posés

    def libre(self, lo, hi, margin=5, gap=14):
        if lo[0] < -WALL or hi[0] > WALL:
            return False
        if lo[1] < self.floor - 12:
            return False
        for b in self.boxes:                                   # toute la hauteur : rien au-dessus ni au-dessous du parcours
            if b[0] < hi[0] + margin and b[1] > lo[0] - margin and b[4] < hi[2] + margin and b[5] > lo[2] - margin:
                return False
        for a, b in self.placed:
            if lo[0] < b[0] + gap and hi[0] > a[0] - gap and lo[2] < b[2] + gap and hi[2] > a[2] - gap and lo[1] < b[1] + gap and hi[1] > a[1] - gap:
                return False
        return True

    def poser(self, name, zr, xr=(80, 150), y='sol', face=True, scales=(1.0,), kw=None, side=None, tries=160,
              tilt_yaw=30, yaw=None, nom=None, attrs=None):
        """Cherche une place pour le modèle `name` : z dans zr (relatif au début du niveau), |x| dans xr,
        y = 'sol' (posé sur le fond) ou hauteur relative au parcours. Essaie les échelles de la plus grande à la plus petite."""
        fn, _ = MODELS[name]
        base = fn(**(kw or {}))
        rng = self.rng
        for s in scales:
            for _ in range(tries):
                sd = side or rng.choice([-1, 1])
                x = sd * rng.uniform(*xr)
                z = self.z0 + rng.uniform(*zr)
                yy = self.floor if y == 'sol' else self.ride + (rng.uniform(*y) if isinstance(y, tuple) else y)
                if yaw is not None:
                    yw = yaw(sd) if callable(yaw) else yaw
                elif face:
                    yw = (-90 - tilt_yaw) if sd > 0 else (90 + tilt_yaw)
                else:
                    yw = rng.choice([0, 45, 90, 135, 180, 225, 270, 315])
                nodes = place(deepcopy(base), (x, yy, z), yaw=yw, scale=s)
                if attrs:
                    with_attrs(nodes, attrs(x, yy, z))
                lo, hi = envelope(nodes)
                if self.libre(lo, hi):
                    self.placed.append((lo, hi))
                    self.kids.append(model(nom or name, (x, yy, z), nodes, yw))
                    return (x, yy, z, s, yw)
        print('   ! pas de place pour', name, 'niveau', self.i)
        return None

    def groupe(self, nom, items):
        """Range les derniers modèles posés d'un même type dans un dossier."""
        grp = [k for k in self.kids if k['n'] in items]
        self.kids = [k for k in self.kids if k['n'] not in items]
        if grp:
            self.kids.append(folder(nom, grp))

def slots(n, a=120, b=1250):
    step = (b - a) / n
    return [(a + k * step, a + (k + 1.3) * step) for k in range(n)]

LEVEL_BUILDERS = {}
def level(i):
    def deco(fn):
        LEVEL_BUILDERS[i] = fn
        return fn
    return deco

# ================================================================== 1. CLAVIER : le bureau géant
@level(1)
def build_1(L):
    L.poser('EcranGeant', (950, 1230), (95, 130), scales=(1.0, 0.9, 0.8))
    for zr, sd, col in (((250, 520), 1, 'noir'), ((700, 950), -1, 'blanc')):
        L.poser('SourisGeante', zr, (95, 140), scales=(1.6, 1.45, 1.3, 1.15), tilt_yaw=40, side=sd)
    for zr, sd in (((120, 350), -1), ((500, 800), 1)):                                    # câbles du côté opposé aux souris
        L.poser('CableUSB', zr, (100, 145), scales=(1.2, 1.0, 0.85), tilt_yaw=0, side=sd)
    for n, (lettre, zr) in enumerate(zip('WASDQERF', slots(8, 150, 1200))):
        L.poser('Touche', zr, (95, 145), y=(60, 95), kw={'lettre': lettre}, scales=(1.0, 0.85), nom='Touche_' + lettre,
                attrs=lambda x, y, z: bob(3, 4 + (z % 3), (z % 7) / 7))
    L.poser('BarreEspace', (500, 800), (100, 130), y=(100, 120), scales=(1.0, 0.8), attrs=lambda x, y, z: bob(3, 5, 0.3))
    L.groupe('TouchesFlottantes', {'Touche_' + c for c in 'WASDQERF'} | {'BarreEspace'})

# ================================================================== 2. PAPIER BULLE : colis en fuite
@level(2)
def build_2(L):
    L.poser('CartonFragile', (900, 1230), (95, 130), scales=(1.25, 1.1, 1.0, 0.9), tilt_yaw=20)
    for zr in ((150, 420), (560, 820), (820, 1000)):
        L.poser('PileColis', zr, (95, 145), scales=(1.3, 1.1, 1.0), tilt_yaw=15, kw={'seed': int(zr[0])})
    for zr in ((300, 600), (650, 950)):
        L.poser('RouleauBulle', zr, (95, 140), scales=(1.3, 1.1, 1.0), tilt_yaw=0)
    for zr in slots(12):
        L.poser('Bulle', zr, (85, 150), y=(20, 110), face=False, scales=(1.2, 0.9, 0.7), attrs=lambda x, y, z: bob(4, 5 + (z % 3), (z % 5) / 5))
    L.groupe('Bulles', {'Bulle'})

# ================================================================== 3. CHOCOLAT : la chocolaterie
@level(3)
def build_3(L):
    L.poser('FontaineChocolat', (900, 1230), (95, 130), scales=(1.35, 1.2, 1.0))
    for zr in ((150, 400), (450, 700), (700, 950), (1000, 1250)):
        L.poser('Tablette', zr, (95, 145), scales=(1.4, 1.2, 1.0), tilt_yaw=25)
    for zr in ((250, 550), (600, 900), (100, 300)):
        L.poser('Cupcake', zr, (95, 145), scales=(2.2, 1.9, 1.6), tilt_yaw=10)
    for n, zr in enumerate(slots(10)):
        L.poser('Guimauve', zr, (85, 150), y=(30, 100), face=False, kw={'col': ['ffc2e0', 'fff6ee'][n % 2]}, scales=(1.3, 1.0),
                attrs=lambda x, y, z: bob(3, 5 + (z % 3), (z % 7) / 7))
    L.groupe('Guimauves', {'Guimauve'})

# ================================================================== 4. ÉCRASEURS : l'usine
@level(4)
def build_4(L):
    L.poser('PresseGeante', (900, 1230), (95, 130), scales=(1.0, 0.9, 0.8))
    for zr in ((150, 400), (450, 700), (700, 950)):
        L.poser('Cheminee', zr, (110, 150), scales=(1.0, 0.85), tilt_yaw=0)
    for zr in ((250, 520), (550, 850), (950, 1200)):
        L.poser('PyloneEngrenage', zr, (95, 140), scales=(1.2, 1.0, 0.85), tilt_yaw=0)

# ================================================================== 5. POP IT
@level(5)
def build_5(L):
    L.poser('PopItGeant', (900, 1230), (95, 130), scales=(1.3, 1.15, 1.0))
    for n, zr in enumerate(((120, 350), (350, 600), (600, 850), (850, 1100), (200, 1000))):
        L.poser('PopIt', zr, (95, 145), kw={'forme': ['carre', 'rond', 'etoile'][n % 3], 'seed': n}, scales=(1.6, 1.4, 1.2), tilt_yaw=15)
    cols = [('ff4f6e', 'd93a57'), ('ff9f40', 'e0822a'), ('ffd23c', 'e0b220'), ('5ad26e', '3fb055'), ('4fa8ff', '3a88e0'), ('9a6bff', '7c52e0')]
    for n, zr in enumerate(slots(8)):
        c, d = cols[n % 6]
        L.poser('HandSpinner', zr, (95, 145), y=(55, 100), kw={'col': c, 'dark': d}, scales=(1.4, 1.2, 1.0), tilt_yaw=0)
    L.groupe('HandSpinners', {'HandSpinner'})

# ================================================================== 6. MER DE SQUISHIES
@level(6)
def build_6(L):
    L.poser('Baleine', (880, 1230), (95, 130), scales=(1.3, 1.15, 1.0), yaw=lambda sd: -150 if sd > 0 else 150)
    L.poser('PieuvreSquishy', (400, 750), (95, 135), scales=(1.3, 1.1, 1.0))
    medus = [('ff7ad9', 'd95ab8'), ('a67bff', '8657e0'), ('7ad9ff', '4fb8e0')]
    for n, zr in enumerate(slots(6, 120, 950)):
        c, d = medus[n % 3]
        L.poser('Meduse', zr, (90, 150), y=(5, 45), kw={'col': c, 'col_d': d}, face=False, scales=(1.3, 1.1, 0.9),
                attrs=lambda x, y, z: bob(4, 5 + (z % 3), (z % 7) / 7))
    for zr in slots(8):
        L.poser('Canard', zr, (85, 155), face=False, scales=(1.4, 1.2, 1.0), attrs=lambda x, y, z: bob(1.2, 4 + (z % 2), (z % 5) / 5))
    L.groupe('Meduses', {'Meduse'})
    L.groupe('Canards', {'Canard'})

# ================================================================== 7. LAVE ROSE : le cœur du volcan
@level(7)
def build_7(L):
    L.poser('Volcan', (880, 1230), (90, 110), scales=(1.0, 0.9, 0.8), face=False)
    L.poser('OeufDuDragon', (450, 800), (100, 135), scales=(1.2, 1.0))
    for zr in slots(5, 130, 900):
        L.poser('Geyser', zr, (80, 150), face=False, scales=(1.2, 1.0))
    for zr in slots(4, 150, 1150):
        L.poser('AiguilleObsidienne', zr, (85, 150), face=False, scales=(1.1, 0.9))
    for n, zr in enumerate(slots(5, 150, 1200)):
        L.poser('RocherFlottant', zr, (100, 145), y=(80, 120), kw={'seed': n + 1}, face=False, scales=(1.3, 1.1, 0.9),
                attrs=lambda x, y, z: bob(3, 6 + (z % 3), (z % 7) / 7))
    L.groupe('RochersFlottants', {'RocherFlottant'})

# ================================================================== 8. BEURRE : le petit-déjeuner géant
@level(8)
def build_8(L):
    L.poser('GrillePain', (900, 1230), (95, 130), scales=(1.5, 1.3, 1.15), yaw=lambda sd: -110 if sd > 0 else 110)
    for zr in ((150, 420), (500, 780), (780, 1000)):
        L.poser('PilePancakes', zr, (95, 145), scales=(1.6, 1.4, 1.2), face=False)
    for zr in ((250, 500), (600, 900), (1000, 1250)):
        L.poser('BeurreFondant', zr, (95, 145), scales=(1.6, 1.4, 1.2), tilt_yaw=20)
    for zr in ((100, 300), (420, 700), (800, 1100)):
        L.poser('OeufAuPlat', zr, (90, 150), scales=(1.8, 1.5, 1.2), face=False)
    for zr in slots(8):
        L.poser('TartineVolante', zr, (95, 145), y=(50, 95), scales=(1.2, 1.0), tilt_yaw=0,
                attrs=lambda x, y, z: bob(4, 4 + (z % 3), (z % 7) / 7))
    L.groupe('TartinesVolantes', {'TartineVolante'})

# ================================================================== 9. RIVIÈRE GELÉE
@level(9)
def build_9(L):
    L.poser('ArcheGlacier', (880, 1230), (95, 125), scales=(1.2, 1.05, 0.9), yaw=lambda sd: 0)
    for n, zr in enumerate(((120, 380), (380, 640), (640, 900), (150, 900))):
        L.poser('Iceberg', zr, (95, 145), scales=(1.2, 1.0, 0.85), tilt_yaw=15)
    for zr in ((200, 500), (500, 800), (800, 1100), (1000, 1250)):
        L.poser('Cristaux', zr, (85, 150), face=False, scales=(1.3, 1.1, 0.9))
    for zr in ((300, 650), (700, 1050)):
        L.poser('BonhommeNeige', zr, (90, 140), scales=(1.3, 1.1), tilt_yaw=40)
    aurore(L)

def aurore(L):
    """Rideaux d'aurore boréale haut au-dessus des deux côtés, ondulants, qui flottent doucement."""
    grp = []
    for side in (-1, 1):
        for band, (low, high, off, dy) in enumerate((('4dffb0', '7ad9ff', 0, 0), ('7ad9ff', 'b07bff', 40, 18))):
            k = []
            for t in range(17):
                zz = L.z0 + 110 + t * 68 + off
                xx = side * (122 + math.sin(t * 0.7 + band + side) * 18)
                h = 34 + math.sin(t * 1.3 + band) * 10
                y = L.ride + 125 + dy
                yw = math.degrees(math.atan2(math.cos(t * 0.7 + band + side) * 18 * 0.7, 68)) * side
                k.append(box(low, (xx, y + h * 0.3, zz), (0.6, h * 0.6, 60), yaw=yw, neon=True, transp=0.55))
                k.append(box(high, (xx, y + h * 0.8, zz), (0.6, h * 0.4, 60), yaw=yw, neon=True, transp=0.7))
            lo, hi = envelope(k)
            if L.libre(lo, hi, gap=0):
                grp.append(model('Rideau', (side * 122, L.ride + 125, L.z0 + 650), with_attrs(k, bob(4, 10 + band * 3, band * 0.3 + (side > 0) * 0.5))))
    L.kids.append(folder('AuroreBoreale', grp))

# ================================================================== 10. PONT D'OS : le dragon endormi
@level(10)
def build_10(L):
    L.poser('CraneDragon', (950, 1250), (80, 120), scales=(2.0, 1.85, 1.7, 1.55, 1.4, 1.25), tilt_yaw=35)
    for zr in ((140, 450), (450, 900)):
        L.poser('SqueletteDragon', zr, (110, 128), scales=(1.0, 0.9, 0.8), yaw=lambda sd: 0)
    for zr in slots(6, 150, 1150):
        L.poser('LanterneMarais', zr, (70, 110), scales=(1.3, 1.1), tilt_yaw=0)
    for zr in slots(12):
        L.poser('FeuFollet', zr, (80, 150), y=(-10, 30), face=False, scales=(1.2, 1.0),
                attrs=lambda x, y, z: bob(4, 3 + (z % 3), (z % 7) / 7))
    L.groupe('Lanternes', {'LanterneMarais'})
    L.groupe('FeuxFollets', {'FeuFollet'})

# ================================================================== 11. GALAXIE
@level(11)
def build_11(L):
    L.poser('PlaneteAnneaux', (950, 1200), (95, 125), y=(140, 170), face=False, yaw=lambda sd: 0, scales=(1.0, 0.85))
    L.poser('StationSpatiale', (450, 800), (95, 125), y=(80, 110), scales=(0.9, 0.8, 0.7), tilt_yaw=10)
    L.poser('Soucoupe', (150, 420), (95, 135), y=(60, 80), scales=(1.3, 1.1, 1.0), face=False, attrs=lambda x, y, z: bob(3, 5, 0))
    for n, zr in enumerate(((250, 500), (650, 950))):
        L.poser('Lune', zr, (100, 140), y=(100, 140), kw={'seed': n + 1}, scales=(1.3, 1.0), tilt_yaw=20)
    L.poser('Comete', (500, 800), (80, 140), y=(150, 190), yaw=lambda sd: 20 if sd > 0 else 160, scales=(1.4, 1.2))
    for n, zr in enumerate(slots(10)):
        L.poser('Asteroide', zr, (85, 150), y=(40, 130), kw={'seed': n + 3, 'cristaux': n % 2 == 0}, face=False, scales=(1.4, 1.1, 0.9),
                attrs=lambda x, y, z: bob(3, 6 + (z % 3), (z % 7) / 7))
    L.groupe('Asteroides', {'Asteroide'})

# ================================================================== 12. DERNIER CLIC
@level(12)
def build_12(L):
    fn, _ = MODELS['SoleilSynthwave']
    sun = place(fn(), (0, L.ride + 100, L.z0 + 1295), yaw=180, scale=1.0)
    L.kids.append(model('SoleilSynthwave', (0, L.ride + 100, L.z0 + 1295), sun, 180))
    L.poser('EcranChargement', (650, 950), (100, 130), scales=(1.0, 0.9, 0.8))
    L.poser('BoutonArcade', (150, 500), (95, 140), scales=(1.4, 1.2, 1.0))
    for zr in ((150, 450), (950, 1200)):
        L.poser('CurseurGeant', zr, (95, 140), y=(40, 80), scales=(1.3, 1.1), tilt_yaw=10)
    for zr in slots(8):
        L.poser('CoeurPixel', zr, (90, 150), y=(30, 90), scales=(1.4, 1.2), tilt_yaw=10,
                attrs=lambda x, y, z: bob(3, 4, (z % 7) / 7))
    L.groupe('CoeursPixel', {'CoeurPixel'})

# ================================================================== assemblage
root = folder('DecorMondes', [])
stats = {}
for i in range(1, 13):
    if ONLY and i != ONLY:
        continue
    L = Level(i)
    LEVEL_BUILDERS[i](L)
    root['k'].append(folder('Level%d' % i, L.kids))
    def count(n):
        return (1 if n.get('c') == 'Part' else 0) + sum(count(k) for k in n.get('k', []))
    stats[i] = (len(L.kids), count(root['k'][-1]))
json.dump(root, open(OUT, 'w'))
for i, (a, b) in stats.items():
    print(f'niveau {i:2d} : {a} éléments, {b} parts')
print('total parts', sum(b for a, b in stats.values()))
