# Niveau 4 (ÉCRASEURS) : de vraies presses hydrauliques.
# Le visuel de chaque mâchoire est construit EXACTEMENT sur sa boîte pilote (ce qu'on voit = ce qui tue),
# posé à la position ouverte ; HazardController le déplace avec la boîte.
# Autour : carters latéraux où la mâchoire rentre, vérins, portique avec gyrophare et panneau DANGER,
# lignes rouges au sol qui marquent la zone d'écrasement.
# Rythme : chaque paire se referme toutes les 3,6 s, en vague d'une paire à l'autre.
# Usage : python3 niveau4.py pilotes.json sortie.json
import json, math, sys
from kit import *

SRC, OUT = sys.argv[1:3]
pilots = json.load(open(SRC))
STEEL, STEEL_D, STEEL_L, YEL, BLK, RED = '5b6573', '363d48', '9aa4b2', 'ffc21a', '1d2126', 'ff3b30'
CHROME = 'd9dee6'

PERIOD, TRAVEL, HOLD = 3.6, 0.35, 0.9

def machoire(p):
    """Décor d'une mâchoire, en coordonnées monde, à sa position ouverte."""
    (x, y, z), (sx, sy, sz) = p['pos'], p['size']
    s = 1 if x > 0 else -1                         # côté ; la face qui écrase regarde -s
    face = x - s * sx / 2
    k = [box(STEEL_D, (x + s * 0.3, y, z), (sx - 0.6, sy - 0.2, sz - 0.2))]           # bloc d'acier
    k.append(box(STEEL, (x + s * 0.3, y + sy / 2 - 1.5, z), (sx - 0.4, 3, sz)))       # rebord du dessus
    n = 8
    for i in range(n):                                                                # plaque de danger sur la face
        zz = z - sz / 2 + (i + 0.5) * sz / n
        k.append(box(YEL if i % 2 == 0 else BLK, (face + s * 0.35, y - 1, zz), (0.7, sy - 6, sz / n + 0.02)))
    nb = 7
    for dz in (-1, 1):                                                                # bandes de danger sur l'avant et l'arrière
        for i in range(nb):
            xx = face + s * (i + 0.5) * (sx - 1) / nb
            k.append(box(YEL if i % 2 == 0 else BLK, (xx, y + sy / 2 - 7, z + dz * (sz / 2 + 0.05)), ((sx - 1) / nb + 0.02, 8, 0.4)))
        k.append(box(STEEL_L, (x + s * 0.3, y - sy / 2 + 6, z + dz * (sz / 2 + 0.1)), (sx - 2, 2, 0.4)))
    for yy in (y - sy / 2 + 1.5, y + sy / 2 - 4.5):                                  # cornières
        k.append(box(STEEL_L, (face + s * 0.6, yy, z), (1.2, 3, sz + 0.02)))
    for dy in (-sy * 0.22, sy * 0.22):                                               # tiges des vérins (sortent derrière)
        k.append(rod(CHROME, (x + s * sx / 2 - s * 1, y + dy, z), (x + s * sx / 2 + s * 40, y + dy, z), 2.6))
    k.append(ball(RED, (x - s * sx * 0.25, y + sy / 2 + 1.2, z), 1.4, neon=True))      # voyant sur la mâchoire
    return k

def presse(pl, pr):
    """Carters, portique et marquages autour d'une paire (décor fixe)."""
    z = pl['pos'][2]
    y, sy, sz = pl['pos'][1], pl['size'][1], pl['size'][2]
    floor = y - sy / 2
    k = []
    for s in (-1, 1):
        x0, x1 = 75, 160                                                              # carter : du bord du couloir à la paroi
        xc = s * (x0 + x1) / 2
        for dz in (-1, 1):                                                            # joues de part et d'autre de la mâchoire
            k.append(box(STEEL, (xc, floor + sy / 2 + 2, z + dz * (sz / 2 + 3)), (x1 - x0, sy + 8, 5.6)))
            k.append(box(YEL, (s * (x0 + 0.4), floor + sy / 2 + 2, z + dz * (sz / 2 + 3)), (0.8, sy + 8, 5.8)))
        k.append(box(STEEL_D, (xc, floor + sy + 7, z), (x1 - x0, 6, sz + 12)))        # toit du carter
        for dz in (-1, 1):                                                            # grilles d'aération et bandeau jaune
            zf = z + dz * (sz / 2 + 5.85)
            for j in range(4):
                k.append(box(BLK, (xc + s * 6, floor + 14 + j * 5, zf), (40, 1.4, 0.3)))
            k.append(box(YEL, (xc, floor + sy - 2, zf), (x1 - x0 - 2, 3, 0.3)))
            k.append(ball(RED, (s * 90, floor + sy - 8, zf + dz * 0.4), 1.2, neon=True))
        k.append(box(STEEL_D, (s * (x1 - 2), floor + sy / 2 + 2, z), (4, sy + 8, sz + 0.5)))   # dos
        k.append(box(STEEL_D, (xc, floor - 4, z), (x1 - x0, 8, sz + 12)))              # socle
        k.append(box(STEEL, (xc, floor - 40, z), (20, 64, 20)))                        # pied dans la lave
        for dy in (-sy * 0.22, sy * 0.22):                                            # fourreaux des vérins
            k.append(rod(STEEL_L, (s * 118, floor + sy / 2 + dy, z), (s * 156, floor + sy / 2 + dy, z), 3.6))
    # portique au-dessus du couloir, gyrophare et panneau DANGER
    ty = floor + sy + 16
    k.append(box(STEEL_D, (0, ty, z), (320, 8, 10)))
    for i in range(16):
        k.append(box(YEL if i % 2 == 0 else BLK, (-75 + (i + 0.5) * 150 / 16, ty, z - 5.2), (150 / 16 + 0.02, 6, 0.5)))
    k.append(cyl(BLK, (0, ty + 4, z), 3, 2))
    k.append(ball('ff7a1a', (0, ty + 8, z), 2.6, neon=True, light=('ff7a1a', 60, 3)))
    k.append(box(YEL, (0, ty - 9, z - 5), (34, 9, 1)))
    # le panneau regarde les joueurs qui arrivent (-Z) : texte tourné d'un demi-tour
    k += transform(pixel_text('DANGER', (0, 0, 0), 0.95, BLK, depth=0.3, neon=False), (0, 0, 0), Ry(180), 1.0, (0, ty - 9, z - 5.6))
    # zone d'écrasement marquée au sol
    for dz in (-1, 1):
        k.append(box(RED, (0, floor + 0.08, z + dz * (sz / 2 + 1)), (150, 0.2, 1.2), neon=True))
    return k

pairs = {}
for p in pilots:
    pairs.setdefault(round(p['pos'][2]), []).append(p)
zs = sorted(pairs)
out = {'machoires': [], 'statique': []}
for k, z in enumerate(zs):
    m = k // 3
    phase = (-(k * 1.15) + m * 0.6) % PERIOD                                         # vague d'une paire à l'autre
    for p in pairs[z]:
        a = dict(p['attrs'])
        a.update(Period=PERIOD, Travel=TRAVEL, Hold=HOLD, Phase=round(phase, 3), Gap=0, KillMargin=3)
        out['machoires'].append({'z': z, 'x': p['pos'][0], 'attrs': a, 'decor': machoire(p)})
    pl, pr = sorted(pairs[z], key=lambda q: q['pos'][0])
    out['statique'].append(model('Presse%d' % (k + 1), (0, pl['pos'][1] - pl['size'][1] / 2, z), presse(pl, pr)))
json.dump(out, open(OUT, 'w'))
print(len(zs), 'presses,', sum(len(m['decor']) for m in out['machoires']), 'parts de mâchoires,',
      sum(1 for s in out['statique'] for _ in parts_of(s)), 'parts fixes')
