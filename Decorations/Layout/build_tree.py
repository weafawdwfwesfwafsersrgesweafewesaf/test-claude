# Transforme layout.json (groupes, modèles posés, parts) en ARBRE D'INSTANCES Roblox prêt à
# être écrit dans le .rbxl : Folders, Models (pivot à la base) et Parts en coordonnées monde.
# Usage : python3 build_tree.py DecorShapes.lua layout.json tree.json
import json, math, re, sys, random

SHAPES_LUA, LAYOUT, OUT = sys.argv[1:4]
txt = open(SHAPES_LUA).read()
L = json.load(open(LAYOUT))

WORLDS = {}
for w in ['Lava', 'Ice', 'Candy', 'Robot', 'Dragon', 'Skeleton', 'Retro', 'Ghost']:
    blk = txt[txt.index(f'\t{w} = {{'):]
    blk = blk[:blk.index('\n\t},')]
    cols = [(h, g == 'true') for h, g in re.findall(r'\{ "([0-9a-f]{6})", (true|false) \}', blk.split('Props')[0])]
    props = {n: [float(x) for x in body.split(', ')] for n, body in re.findall(r'Name = "(\w+)", Height = [\d.]+, Parts = \{ ([^}]*) \}', blk)}
    WORLDS[w] = (cols, props)

SMOOTH, NEON = 272, 288               # Enum.Material
SHAPE = {1: 1, 2: 2, 3: 0, 4: 1}      # nos codes -> Enum.PartType (Ball 0, Block 1, Cylinder 2) ; 4 = ellipsoïde

def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])

def cf(pos, right, up):
    """CFrame en 12 nombres : position + matrice (lignes), colonnes = droite, haut, arrière."""
    back = cross(right, up)
    return [pos[0], pos[1], pos[2], right[0], up[0], back[0], right[1], up[1], back[1], right[2], up[2], back[2]]

def rot_y(v, yaw):
    c, s = math.cos(yaw), math.sin(yaw)
    return (v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c)

def pivot_cf(x, y, z, yaw):
    return cf((x, y, z), rot_y((1, 0, 0), yaw), (0, 1, 0))

def part_node(shape, hexv, neon, pos, right, up, size, attrs=None):
    n = dict(c='Part', n='Neon' if neon else 'Part', shape=SHAPE[shape], cf=cf(pos, right, up), size=list(size),
             rgb=[int(hexv[i:i + 2], 16) for i in (0, 2, 4)], mat=NEON if neon else SMOOTH)
    if shape == 4:
        n['shape'] = 1
        n['sphere'] = True             # ellipsoïde : bloc + SpecialMesh Sphere
    if attrs:
        n['attrs'] = attrs
    return n

def prop_model(i, rng):
    lv, world, name, x, y, z, yaw, s, tint, bob = L['props'][i]
    cols, props = WORLDS[world]
    q = props[name]
    tmap = {a: b for a, b in L['tints'][tint - 1]} if tint else {}
    attrs = None
    if bob:
        attrs = {'DecorBob': bob, 'DecorBobT': 4.0, 'DecorBobP': round(rng.uniform(0, 1), 3)}
    kids = []
    for k in range(0, len(q), 14):
        sh, ci = int(q[k]), int(q[k + 1])
        lp, lr, lu, ls = q[k + 2:k + 5], q[k + 5:k + 8], q[k + 8:k + 11], q[k + 11:k + 14]
        wp = rot_y((lp[0] * s, lp[1] * s, lp[2] * s), yaw)
        hexv, glow = cols[ci - 1]
        hexv = tmap.get(hexv, hexv)
        node = part_node(sh, hexv, glow, (x + wp[0], y + wp[1], z + wp[2]), rot_y(lr, yaw), rot_y(lu, yaw), [v * s for v in ls], attrs)
        if sh == 4:
            node['shape'], node['sphere'] = 1, True
        kids.append(node)
    return dict(c='Model', n=name, pivot=pivot_cf(x, y, z, yaw), k=kids)

def raw_parts(idx):
    out = []
    for i in idx:
        lv, sh, ci, ne, px, py, pz, rx, ry, rz, ux, uy, uz, sx, sy, sz, tu = L['parts'][i]
        attrs = None
        if tu:
            per, ax, cx, cy, cz = L['turns'][tu - 1]
            attrs = {'DecorTurn': per, 'DecorAxis': float(ax), 'DecorCX': cx, 'DecorCY': cy, 'DecorCZ': cz}
        out.append(part_node(sh, L['colors'][ci - 1], ne, (px, py, pz), (rx, ry, rz), (ux, uy, uz), (sx, sy, sz), attrs))
    return out

rng = random.Random(5)
levels = {}
for g in L['groups']:
    x, y, z, yaw = g['pivot']
    kids = []
    if g['island']:
        kids.append(dict(c='Model', n='Ilot', pivot=pivot_cf(x, y, z, yaw), k=raw_parts(g['island'])))
    kids += raw_parts(g['parts'])
    kids += [prop_model(i, rng) for i in g['props']]
    model = dict(c='Model', n=g['name'], pivot=pivot_cf(x, y, z, yaw), k=kids)
    key = 'Lobby' if g['level'] == 0 else 'Level%d' % g['level']
    levels.setdefault(key, {}).setdefault(g['folder'], []).append(model)

order = ['Lobby'] + ['Level%d' % i for i in range(1, 13)]
root = dict(c='Folder', n='DecorMondes', k=[])
for key in order:
    if key not in levels:
        continue
    lf = dict(c='Folder', n=key, k=[])
    for folder in ('Scenes', 'Rebord', 'Murs', 'Lobby'):
        if folder in levels[key]:
            items = levels[key][folder]
            lf['k'] += items if key == 'Lobby' else [dict(c='Folder', n=folder, k=items)]
    root['k'].append(lf)

def count(n, acc):
    acc[n['c']] = acc.get(n['c'], 0) + 1
    if n.get('sphere'):
        acc['SpecialMesh'] = acc.get('SpecialMesh', 0) + 1
    for k in n.get('k', []):
        count(k, acc)
    return acc
json.dump(root, open(OUT, 'w'))
print(count(root, {}))
