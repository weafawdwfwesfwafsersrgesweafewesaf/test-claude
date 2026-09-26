# Niveaux 10, 11 et 12 refaits : plus durs que les précédents, chacun avec son twist.
# Physique mesurée (World.LevelsA/B, MapConfig) : ~102 studs/s à ce stade ; saut simple ≈ 50 de haut,
# 1,43 s en l'air (≈ 145 studs de portée), double ≈ 2,25 s (≈ 230). En gravité 0,45 (galaxie) les temps
# en l'air sont ~2,2 fois plus longs. Passé le niveau 8 la difficulté vient de la LARGEUR, du TEMPS
# et du MOUVEMENT (pas de trous plus grands) : c'est ce qu'on utilise ici.
# Tout est posé en coordonnées du niveau (x, y relatif à la hauteur de roulage, z relatif au début).
# Sortie : patch JSON pour step_levels.js (ce qu'on retire, ce qu'on ajoute, ce qu'on retouche).
# Usage : python3 niveaux_10_12.py sortie.json
import json, math, random, sys
from kit import *
from kit import _part

OUT = sys.argv[1]
FLOOR = -30

def Y0(i): return (i - 1) * 50
def Z0(i): return 300 + (i - 1) * 1300

def course(n):
    n['collide'] = True
    n['shadow'] = True
    return n

def pilier(L, x, z, w, l, top, col_top, col_side, name='Dessus', rond=False):
    """Pilier plein jusque dans le sol mortel + dessus (comme LevelKit.tower)."""
    y0, z0 = Y0(L), Z0(L)
    bottom = FLOOR - 20
    h = top - bottom
    if rond:
        body = cyl(col_side, (x, y0 + bottom, z0 + z), w / 2, h - 2)
        lid = cyl(col_top, (x, y0 + top - 2, z0 + z), w / 2, 2)
    else:
        body = box(col_side, (x, y0 + bottom + (h - 2) / 2, z0 + z), (w, h - 2, l))
        lid = box(col_top, (x, y0 + top - 1, z0 + z), (w, 2, l))
    body['n'], lid['n'] = 'Pilier', name
    return [course(body), course(lid)]

def piege(n, kind, L, **attrs):
    a = {'Hazard': kind, 'LevelIndex': float(L)}
    a.update({k: float(v) if not isinstance(v, str) else v for k, v in attrs.items()})
    n['attrs'] = a
    return n

def avec_decor(n, decor):
    n.setdefault('k', []).append(folder('Decor', decor))
    return n

# ================================================================== NIVEAU 10 — PONT D'OS
BONE, BONE2, BONE_D, EYE, MOSS = 'e8dfc8', 'e2d8c0', 'c9bd9f', '7dff6a', '5c8a3a'

def niveau10():
    L, y0, z0 = 10, Y0(10), Z0(10)
    add_course, add_haz, add_dec = [], [], []

    def pont_friable(a, b, top, w, delay=0.25):
        """Pont d'os qui s'effondre sous les roues (tuiles Crumble)."""
        (ax, az), (bx, bz) = a, b
        dx, dz = bx - ax, bz - az
        n = max(1, int(math.hypot(dx, dz) // 20))
        yaw = math.degrees(math.atan2(dx, dz))
        for k in range(n):
            t = (k + 0.5) / n
            c = (ax + dx * t, y0 + top - 2, z0 + az + dz * t)
            tile = box(BONE if k % 2 == 0 else BONE2, c, (w, 4, math.hypot(dx, dz) / n - 1.0), yaw=yaw)
            tile['n'] = 'Os'
            tile = course(piege(tile, 'Crumble', L, Delay=delay, Back=5, HomeY=c[1]))
            # vertèbres sous la tuile (décor qui tombe avec elle)
            avec_decor(tile, [box(BONE_D, (c[0], c[1] - 3.5, c[2]), (w * 0.55, 3, 5), yaw=yaw)])
            add_haz.append(tile)

    # A. premier pont, droit, qui s'effondre
    pont_friable((0, 114), (0, 214), 0, 12)
    # B. deuxième pont, plus haut ; un crâne roule vers toi : saute-le
    pont_friable((36, 282), (36, 386), 7, 12)
    crane = ball(BONE, (36, y0 + 7 + 9, z0 + 395), 9)
    crane['n'] = 'Crane'
    crane = piege(crane, 'Boulder', L, Period=3.4, Phase=0, Travel=1.7, FromZ=z0 + 400, ToZ=z0 + 270, FixedX=36, FixedY=y0 + 16, Reach=9.5)
    avec_decor(crane, [ball('10140c', (36 + sx * 3.4, y0 + 18, z0 + 395 - 7.2), 2.4) for sx in (-1, 1)] +
               [ball(EYE, (36 + sx * 3.4, y0 + 18, z0 + 395 - 8.6), 1.1, neon=True) for sx in (-1, 1)])
    add_haz.append(crane)
    # C. vertèbres étroites, la queue du dragon balaie entre elles
    pierres = [(8, 462, 12), (-32, 540, 18), (6, 618, 24), (40, 696, 18), (0, 774, 24)]
    for x, z, top in pierres:
        add_course += pilier(L, x, z, 20, 20, top, BONE, BONE_D, name='Vertebre', rond=True)
        add_dec.append(cyl(BONE_D, (x, y0 + top, z0 + z), 6, 1.2))
    for z, per, ph in ((502, 2.6, 0), (580, 2.3, 0.9), (658, 2.8, 1.7)):
        q = box(BONE, (0, y0 + 22, z0 + z), (9, 74, 7))
        q['n'] = 'Queue'
        q = piege(q, 'Pendulum', L, Period=per, Phase=ph, Span=230, FixedY=y0 + 22, FixedZ=z0 + z)
        avec_decor(q, [cristal(BONE_D, (0, y0 + 59, z0 + z), 12, 5)[i] for i in range(3)] +
                   [box(BONE_D, (0, y0 + 22 - 36 + 2, z0 + z), (11, 4, 9))])
        add_haz.append(q)
    # D. le pont des mâchoires : il ne s'effondre pas, mais les mâchoires d'os claquent
    add_course += pilier(L, 0, 910, 22, 200, 26, BONE, BONE_D, name='Pont')
    for k, z in enumerate((850, 910, 970)):
        for s in (-1, 1):
            open_x = s * (11 + 1 + 14)
            m = box(BONE, (open_x, y0 + 26 + 16, z0 + z), (28, 32, 14))
            m['n'] = 'Machoire'
            m['transp'] = 1
            m = course(piege(m, 'Slide', L, Period=2.4, Phase=round((k * 0.8) % 2.4, 2), Travel=0.22, Hold=0.5,
                             OpenX=open_x, Gap=0, FixedY=y0 + 42, FixedZ=z0 + z, KillMargin=2.5))
            fx = open_x - s * 14
            dec = [box(BONE, (open_x + s * 0.3, y0 + 42, z0 + z), (27.4, 31.4, 13.4)),
                   box(BONE_D, (open_x + s * 0.3, y0 + 57.5, z0 + z), (27.6, 1.5, 13.8))]
            for j in range(5):                                                         # crocs
                dec.append(wedge('fffbef', (fx - s * 1.5, y0 + 30 + j * 5.5, z0 + z), (12, 4, 3), yaw=90 if s > 0 else -90))
            dec.append(ball(EYE, (open_x, y0 + 52, z0 + z - 7.2), 1.6, neon=True))
            avec_decor(m, dec)
            add_haz.append(m)
    # E. dernier pont friable jusqu'à la sortie (tour existante en (-20, 1170))
    pont_friable((0, 1016), (-16, 1122), 26, 14, delay=0.3)
    return dict(
        retirer=dict(hazards=['Os', 'Crane'], course_z=[(600, 1)], decor_petits=[4, 8, 4]),
        course=add_course, hazards=add_haz, decor=add_dec,
        twist="The bridge crumbles under you, a skull rolls and the dragon's tail sweeps. Never stop!")

# ================================================================== NIVEAU 11 — GALAXIE
PURP, PURP_D, PURP_L, STAR = '7a5ac8', '32235f', 'c8a5ff', 'ffe066'

def niveau11():
    L, y0, z0 = 11, Y0(11), Z0(11)
    add_course, add_haz, add_dec = [], [], []
    rng = random.Random(11)
    # A. astéroïdes qui dérivent (plateformes étroites, mobiles, de plus en plus haut)
    for k, (z, top, amp, per) in enumerate(((190, 10, 45, 5.0), (330, 30, 60, 6.4), (470, 50, 70, 5.6))):
        s = box('5b5470', (0, y0 + top - 3, z0 + z), (24, 6, 24))
        s['n'] = 'Asteroide'
        s = course(piege(s, 'Drift', L, HomeX=0, Amplitude=amp, Period=per, Phase=k * 1.4, FixedY=y0 + top - 3))
        roc = rocher_facettes(['544d6b', '4a4460', '5f5878', '433d58'], (0, y0 + top - 11, z0 + z), 11, rng, n=4, flottant=True)
        avec_decor(s, roc + [box('6a6386', (0, y0 + top - 0.2, z0 + z), (22, 0.6, 22))])
        add_course.append(s)
    # B. chemin d'étoiles qui s'allument en vague : il faut suivre la lumière
    for k in range(7):
        z = 545 + k * 40
        top = 56 - k * 2.5
        st = box(STAR, (math.sin(k * 0.9) * 22, y0 + top - 1.5, z0 + z), (17, 3, 17), neon=True)
        st['n'] = 'Etoile'
        st = course(piege(st, 'Blink', L, Period=3.6, On=1.9, Phase=round((-k * 0.42) % 3.6, 2)))
        add_course.append(st)
    # C. deux plateaux qui tournent, une comète balaie entre eux
    for x, z, top, per in ((-40, 862, 42, 6.0), (40, 962, 48, 5.2)):
        d = box(PURP_L, (x, y0 + top - 2, z0 + z), (44, 4, 44))
        d['n'] = 'Plateau'
        d = course(piege(d, 'Spinner', L, Period=per, FixedY=y0 + top - 2))
        dec = [box(STAR, (x + math.cos(a * math.tau / 8) * 18, y0 + top + 0.2, z0 + z + math.sin(a * math.tau / 8) * 18), (4, 0.4, 4), neon=True) for a in range(8)]
        dec.append(box(PURP_D, (x, y0 + top - 5, z0 + z), (40, 2, 40)))
        avec_decor(d, dec)
        add_course.append(d)
    comete = box('fff2c2', (0, y0 + 62, z0 + 912), (12, 12, 12), neon=True)
    comete['n'] = 'Comete'
    comete = piege(comete, 'Pendulum', L, Period=3.0, Phase=0.4, Span=250, FixedY=y0 + 62, FixedZ=z0 + 912)
    avec_decor(comete, [rod('ffb347' if j % 2 else 'ff7ad9', (0, y0 + 62, z0 + 912 - 6 - j * 6), (0, y0 + 62, z0 + 912 - 12 - j * 6), 5 - j, neon=True, transp=0.3 + j * 0.12) for j in range(4)])
    add_haz.append(comete)
    # D. planète d'arrivée (la gravité basse porte jusqu'au niveau 12)
    add_course += pilier(L, 0, 1120, 80, 80, 58, PURP_L, PURP, name='Planete', rond=True)
    add_dec.append(ball('b070ff', (0, y0 + 58 - 44, z0 + 1120), 43))
    add_dec += ring('ffd9b0', (0, y0 + 30, z0 + 1120), 58, 8, 40, 0.9)
    return dict(
        retirer=dict(course_names=['Planete', 'Dalle'], decor_names=['Boule', 'Cylindre']),
        course=add_course, hazards=add_haz, decor=add_dec,
        twist="Low gravity: land on drifting asteroids, follow the stars as they light up!")

# ================================================================== NIVEAU 12 — DERNIER CLIC
def niveau12():
    L, y0, z0 = 12, Y0(12), Z0(12)
    add_course, add_haz, add_dec = [], [], []
    # C. deux plateformes « souris » qui glissent avant le clavier final (à la place de la marche fixe)
    for k, (z, top, amp, per) in enumerate(((1015, 16, 45, 3.8), (1100, 25, 55, 3.2))):
        s = box('262a44', (0, y0 + top - 3, z0 + z), (34, 6, 34))
        s['n'] = 'Souris'
        s = course(piege(s, 'Drift', L, HomeX=0, Amplitude=amp, Period=per, Phase=k * 1.2, FixedY=y0 + top - 3))
        dec = [ell('f4f6fb', (0, y0 + top, z0 + z - 3), 9, 4, 14), box('27e8ff', (0, y0 + top + 0.3, z0 + z + 15), (34, 0.4, 1), neon=True),
               box('27e8ff', (0, y0 + top + 0.3, z0 + z - 15), (34, 0.4, 1), neon=True)]
        avec_decor(s, dec)
        add_course.append(s)
    return dict(
        retirer=dict(course_z=[(1050, 1)]),
        course=add_course, hazards=add_haz, decor=add_dec,
        doigts=dict(Period=2.0, Down=0.18, Hold=0.4, pas=0.34, ajouter_z=[180, 390, 600]),
        ecraseurs=dict(Period=3.2, Travel=0.24, Hold=0.7, pas=0.45),
        twist="The fingers type faster, the jaws snap shut and the mice slide away. Final click!")

out = {'10': niveau10(), '11': niveau11(), '12': niveau12()}
json.dump(out, open(OUT, 'w'))
for k, v in out.items():
    n = sum(1 for part in v['course'] + v['hazards'] + v['decor'] for _ in parts_of(part))
    print('niveau', k, ':', len(v['course']), 'pièces de parcours,', len(v['hazards']), 'pièges,', n, 'parts en tout')
