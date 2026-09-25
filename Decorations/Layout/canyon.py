# Bordure de la map (le canyon) : même style étagé — terre en studs, dessus d'herbe, gouttes d'herbe —
# mais avec un relief irrégulier : tronçons de hauteurs différentes, retraits en haut de falaise,
# strates de terre, buttes d'herbe.
# Règles gardées du canyon d'origine (World.Border) :
#   - face intérieure à |x| = 170 sur toute la hauteur jouable (rien ne déborde sur le parcours) ;
#   - le premier gradin n'est JAMAIS plus bas qu'avant (hors de portée d'un double saut) : le relief ne fait que monter ;
#   - murs solides (CanCollide), gouttes et buttes décoratives (sans collision).
# Entrée : canyon.json relu dans le jeu (géométrie actuelle). Sortie : liste de parts pour bake.js.
# Usage : python3 canyon.py canyon_actuel.json canyon_neuf.json
import json, math, random, sys

SRC, OUT = sys.argv[1:3]
P = json.load(open(SRC))
INNER = 170
TIERS = [(170, 250), (250, 370), (370, 530)]

def c255(c):
    return [max(0, min(255, int(round(v)))) for v in c]

def teinte(c, f):
    return c255([v * f for v in c])

# ---------------------------------------------------------------- segments relus dans le canyon actuel
segs = []
for p in P:
    if round(p['s'][0]) == 80 and p['p'][0] > 0:
        z0, z1 = p['p'][2] - p['s'][2] / 2, p['p'][2] + p['s'][2] / 2
        bottom = p['p'][1] - p['s'][1] / 2
        top1 = p['p'][1] + p['s'][1] / 2 + 8
        grass = next(q['col'] for q in P if round(q['s'][0]) == 82 and q['p'][0] > 0 and abs(q['p'][2] - p['p'][2]) < 1)
        dark = next(q['col'] for q in P if round(q['s'][0]) == 120 and q['p'][0] > 0 and abs(q['p'][2] - p['p'][2]) < 1)
        segs.append(dict(z0=z0, z1=z1, bottom=bottom, top1=top1, grass=grass, dirt=p['col'], dark=dark))
segs.sort(key=lambda s: s['z0'])
ends = [p for p in P if round(p['s'][0]) == 1060 and p['s'][1] > 20]

out = []
def part(pos, size, col, collide):
    out.append(dict(p=[round(v, 3) for v in pos], s=[round(v, 3) for v in size], c=c255(col), collide=collide))

def decoupe(z0, z1, choix, rng):
    """Découpe [z0, z1] en tronçons de longueurs tirées dans `choix` (multiples de 2 studs)."""
    cuts = [z0]
    while cuts[-1] < z1:
        nxt = cuts[-1] + rng.choice(choix)
        if z1 - nxt < min(choix) * 0.6:
            nxt = z1
        cuts.append(min(nxt, z1))
    return list(zip(cuts, cuts[1:]))

def gouttes(side, face_x, top, z0, z1, grass, rng, pas=(2, 5)):
    """Gouttes d'herbe qui coulent sous le bord (comme le canyon d'origine), un peu moins serrées."""
    z = z0 + rng.uniform(2, 8)
    while z < z1 - 6:
        dw = rng.randint(3, 7) * 2
        dh = rng.randint(2, 9) * 3
        if z + dw > z1 - 1:
            break
        part((side * (face_x - 0.9), top - 8 - dh / 2 + 0.01, z + dw / 2), (2, dh, dw), grass, False)
        z += dw + rng.randint(*pas) * 2

def profil(chunks, rng, pas, lo, hi, start=0):
    """Hauteurs par tronçon : marche aléatoire par paliers (relief qui monte et descend sans être du bruit)."""
    h, hs = start, []
    for _ in chunks:
        h = max(lo, min(hi, h + rng.choice(pas)))
        hs.append(h)
    return hs

def gradin(side, t, seg, chunks, hs, rng, drips, base_extra=0):
    solide = (t == 0)                                                                     # hors de portée : décor
    """Un gradin découpé en tronçons de hauteurs différentes. Retourne la hauteur de chaque tronçon."""
    x0, x1 = TIERS[t]
    w = x1 - x0
    top0 = seg['top1'] + (0, 60, 140)[t] + base_extra
    B = seg['bottom']
    dirt = seg['dirt'] if t != 1 else seg['dark']
    dark, light = teinte(dirt, 0.84), teinte(dirt, 1.1)
    grass = seg['grass']
    tops = []
    # socle commun à tout le gradin : jusqu'en dessous de la zone qui bouge
    base_top = top0 + min(hs) - 8 - 30 - 10 - 4                                          # sous la zone qui bouge
    part((side * (x0 + w / 2), (B + base_top) / 2, (seg['z0'] + seg['z1']) / 2), (w, base_top - B, seg['z1'] - seg['z0']), dirt, True)
    for (za, zb), dh in zip(chunks, hs):
        T = top0 + dh
        L, zc = zb - za, (za + zb) / 2
        s = rng.choice((0, 0, 0, 2, 4, 6)) if t < 2 else 0                                  # retrait en haut de falaise
        band = rng.choice((18, 24, 30)) if s else 0
        st = rng.choice((4, 6, 8, 10))                                                    # strate sombre
        y = base_top
        part((side * (x0 + w / 2), y + st / 2, zc), (w, st, L), dark, solide)
        y += st
        mid_top = T - 8 - band
        if mid_top - y > 0.1:
            part((side * (x0 + w / 2), (y + mid_top) / 2, zc), (w, mid_top - y, L), dirt, solide)
        if band:
            part((side * (x0 + s + (w - s) / 2), mid_top + band / 2, zc), (w - s, band, L), light if rng.random() < 0.5 else dirt, solide)
        face = x0 + s
        part((side * (face - 1 + (x1 - face + 1) / 2), T - 4, zc), (x1 - face + 2, 8, L), grass, solide)   # chapeau d'herbe (déborde de 2)
        if rng.random() < 0.3 and L >= 20:                                                # petite butte d'herbe sur le dessus
            bw, bl = rng.choice((12, 16, 20)), min(L - 6, rng.choice((10, 14, 18)))
            bx = x0 + s + rng.uniform(10, max(12, w - bw - 4))
            bz = za + rng.uniform(3, max(4, L - bl - 3))
            bh = rng.choice((2, 3, 4))
            part((side * (bx + bw / 2), T + bh / 2, bz + bl / 2), (bw, bh, bl), teinte(grass, 0.94), False)
        if drips:
            gouttes(side, face, T, za, zb, grass, rng)
        tops.append(T)
    return tops

def segment(seg, rng, lobby=False):
    for side in (-1, 1):
        # gradin 1 : tronçons courts, ne descend jamais sous la hauteur d'origine
        c1 = decoupe(seg['z0'], seg['z1'], (28, 34, 40, 46, 54, 62), rng)
        h1 = profil(c1, rng, (-8, -4, 0, 0, 4, 8, 12), 0, 12 if lobby else 26, start=rng.choice((0, 4, 8)))
        gradin(side, 0, seg, c1, h1, rng, True)
        # gradin 2 : toujours au-dessus du gradin 1 (au moins 14 studs)
        c2 = decoupe(seg['z0'], seg['z1'], (40, 50, 60, 72, 84), rng)
        h2 = profil(c2, rng, (-10, -6, 0, 6, 10, 16), -16, 34)
        h2 = [max(h, 26 + 14 - 60 + 8) for h in h2]
        gradin(side, 1, seg, c2, h2, rng, True)
        # gradin 3 : grandes masses au fond
        c3 = decoupe(seg['z0'], seg['z1'], (60, 80, 100, 120), rng)
        h3 = profil(c3, rng, (-16, -8, 0, 8, 16, 24), -20, 50)
        h3 = [max(h, 34 + 16 - 80) for h in h3]
        gradin(side, 2, seg, c3, h3, rng, False)

def mur_de_bout(w, rng):
    """Mur du fond (lobby) ou de fin de parcours : même relief, en tronçons le long de X."""
    y0, y1 = w['p'][1] - w['s'][1] / 2, w['p'][1] + w['s'][1] / 2
    top = y1 + 8
    zc, d = w['p'][2], w['s'][2]
    dirn = 1 if zc < 0 else -1                                                            # la face regarde le parcours
    grass = next(q['col'] for q in P if round(q['s'][0]) == 1060 and q['s'][1] < 20 and abs(q['p'][2] - zc) < 3)
    dirt = w['col']
    xs = decoupe(-530, 530, (40, 52, 64, 80), rng)
    h = 0
    base_top = top - 8 - 40
    part((0, (y0 + base_top) / 2, zc), (1060, base_top - y0, d), dirt, True)
    for xa, xb in xs:
        inner = abs((xa + xb) / 2) < INNER + 40
        h = max(0, min(40 if not inner else 18, h + rng.choice((-8, -4, 0, 4, 8, 12))))
        T = top + h
        L, xc = xb - xa, (xa + xb) / 2
        st = rng.choice((4, 6, 8))
        part((xc, base_top + st / 2, zc), (L, st, d), teinte(dirt, 0.84), True)
        part((xc, (base_top + st + T - 8) / 2, zc), (L, T - 8 - base_top - st, d), dirt, True)
        part((xc, T - 4, zc + dirn * 1), (L, 8, d + 4), grass, True)
        if inner:                                                                         # gouttes sur la face visible
            face_z = zc + dirn * d / 2
            x = xa + rng.uniform(2, 6)
            while x < xb - 6:
                dw, dh = rng.randint(3, 7) * 2, rng.randint(2, 9) * 3
                if x + dw > xb - 1:
                    break
                part((x + dw / 2, T - 8 - dh / 2 + 0.01, face_z + dirn * 0.9), (dw, dh, 2), grass, False)
                x += dw + rng.randint(2, 5) * 2

rng = random.Random(90210)
for i, seg in enumerate(segs):
    segment(seg, rng, lobby=(i == 0))
for w in ends:
    mur_de_bout(w, rng)

json.dump(out, open(OUT, 'w'))
print(len(segs), 'segments,', len(out), 'parts dont', sum(1 for p in out if p['collide']), 'solides')
