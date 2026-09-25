# Génère la mise en scène complète des décors (îlots, scènes, rebords, murs) à partir
# de la VRAIE géométrie des niveaux (levels.json extrait du .rbxl), et l'écrit en données :
#   - DecorLayout.lua (lu par DecorService dans le jeu)
#   - layout.json (pour les rendus d'aperçu dans Blender)
# Le jeu reconstruit exactement ces données : ce qu'on voit en aperçu est ce qu'on aura.
# Usage : python3 decor_layout.py levels.json DecorLayout.lua layout.json
import json, math, random, sys

LEVELS_JSON, OUT_LUA, OUT_JSON = sys.argv[1:4]

# ------------------------------------------------------------------ géométrie de la map
INNER = 170                       # face intérieure du canyon (World.Border)
RIM = {7: 215, 11: 280}           # hauteur du 1er gradin au-dessus du roulage (150 sinon)
LOBBY_RIM = 90

def ride_y(i): return (i - 1) * 50
def floor_y(i): return ride_y(i) - 30
def z_start(i): return 300 + (i - 1) * 1300
def rim_y(i): return ride_y(i) + RIM.get(i, 150)

parts_json = json.load(open(LEVELS_JSON))
BOXES = {}
NAPPE = {}
for p in parts_json:
    lvl = p['t']
    if p['n'] == 'Nappe':
        NAPPE[lvl] = '%02x%02x%02x' % tuple(p['col'])
    if not p['q']:
        continue
    m, h = p['m'], [v / 2 for v in p['s']]
    ex = [abs(m[r * 3]) * h[0] + abs(m[r * 3 + 1]) * h[1] + abs(m[r * 3 + 2]) * h[2] for r in range(3)]
    BOXES.setdefault(lvl, []).append((p['p'][0] - ex[0], p['p'][0] + ex[0], p['p'][1] - ex[1], p['p'][1] + ex[1], p['p'][2] - ex[2], p['p'][2] + ex[2]))

def occupied(lvl, x, z, ylo, yhi):
    for b in BOXES.get('Level%d' % lvl, ()):
        if b[0] <= x <= b[1] and b[4] <= z <= b[5] and b[3] >= ylo and b[2] <= yhi:
            return True
    return False

def disc_free(lvl, x, z, r, ylo, yhi):
    pts = [(0, 0)] + [(math.cos(k * math.pi / 4) * f, math.sin(k * math.pi / 4) * f) for k in range(8) for f in (r, r / 2)]
    return not any(occupied(lvl, x + a, z + b, ylo, yhi) for a, b in pts)

def band_free(lvl, x0, x1, z0, z1, ylo, yhi):
    for x in (x0, (x0 + x1) / 2, x1):
        z = z0
        while z <= z1:
            if occupied(lvl, x, z, ylo, yhi):
                return False
            z += 3
    return True

# ------------------------------------------------------------------ sorties
COLORS = []
def col(hexv):
    hexv = hexv.lower()
    if hexv not in COLORS:
        COLORS.append(hexv)
    return COLORS.index(hexv) + 1

PARTS = []      # 17 nombres par part
TURNS = []      # { période, axe, cx, cy, cz }
PROPS = []      # placements de modèles
LEVEL_OF_PART = []
GROUPS = []     # { level, folder, name, pivot, parts: [indices], props: [indices], island: [indices] }
CUR = [None]

cur_level = [0]

def group(level, folder, name, pivot):
    g = dict(level=level, folder=folder, name=name, pivot=pivot, parts=[], props=[], island=[])
    GROUPS.append(g)
    CUR[0] = g
    return g

def v_norm(v):
    l = math.sqrt(sum(c * c for c in v))
    return tuple(c / l for c in v)

def part(shape, hexv, neon, pos, right, up, size, turn=0):
    PARTS.append((shape, col(hexv), 1 if neon else 0, *pos, *right, *up, *size, turn))
    LEVEL_OF_PART.append(cur_level[0])
    if CUR[0] is not None:
        CUR[0]['island' if CUR[0].get('in_island') else 'parts'].append(len(PARTS) - 1)

def block(hexv, pos, size, yaw=0.0, neon=False, turn=0):
    part(1, hexv, neon, pos, (math.cos(yaw), 0, -math.sin(yaw)), (0, 1, 0), size, turn)

def vcyl(hexv, x, y_bottom, z, r, h, neon=False, turn=0):
    part(2, hexv, neon, (x, y_bottom + h / 2, z), (0, 1, 0), (-1, 0, 0), (h, 2 * r, 2 * r), turn)

def seg(hexv, a, b, r, neon=False, turn=0):
    d = tuple(b[i] - a[i] for i in range(3))
    L = math.sqrt(sum(c * c for c in d))
    right = v_norm(d)
    ref = (0, 1, 0) if abs(right[1]) < 0.9 else (1, 0, 0)
    up = v_norm((ref[0] - right[0] * sum(ref[i] * right[i] for i in range(3)),
                 ref[1] - right[1] * sum(ref[i] * right[i] for i in range(3)),
                 ref[2] - right[2] * sum(ref[i] * right[i] for i in range(3))))
    part(2, hexv, neon, tuple((a[i] + b[i]) / 2 for i in range(3)), right, up, (L, 2 * r, 2 * r), turn)

def ball(hexv, pos, r, neon=False):
    part(3, hexv, neon, pos, (1, 0, 0), (0, 1, 0), (2 * r, 2 * r, 2 * r))

def prop(lvl, world, name, x, y, z, yaw, s, tint=0, bob=0.0):
    PROPS.append((lvl, world, name, x, y, z, yaw, s, tint, bob))
    if CUR[0] is not None:
        CUR[0]['props'].append(len(PROPS) - 1)

TINTS = []      # (couleur d'origine, nouvelle), ...
def tint_for(nappe_hex):
    """Recolore la lave des modèles (orange) dans la couleur de la nappe du niveau."""
    if nappe_hex in ('f07c24',):
        return 0
    r, g, b = (int(nappe_hex[i:i + 2], 16) for i in (0, 2, 4))
    light = '%02x%02x%02x' % tuple(min(255, int(c + (255 - c) * 0.55)) for c in (r, g, b))
    t = (('ff4d12', nappe_hex), ('ffb020', light), ('ff7a1a', nappe_hex))
    if t not in TINTS:
        TINTS.append(t)
    return TINTS.index(t) + 1

# ------------------------------------------------------------------ îlots
STYLES = {
    'basalt': dict(top='3b3130', side='2a2323', h=3, extra='cracks'),
    'snow': dict(top='eef6ff', side='a9cbe6', h=3.5, extra=None),
    'floe': dict(top='bfeaff', side='7fb8e0', h=2, extra=None),
    'grave': dict(top='3f4a34', side='3a2e25', h=3, extra='moss'),
    'dragon': dict(top='4b413b', side='3a322d', h=3.5, extra='gold'),
    'steel': dict(top='5d6975', side='2c333b', h=3, extra='hazard'),
    'neon': dict(top='2c1a4a', side='1a1622', h=2.5, extra='neonrim'),
    'candy': dict(top='ffc2e0', side='e8b86a', h=3, extra='sprinkles'),
}

def island(style, cx, fy, cz, r, yaw, rng, glow_hex):
    st = STYLES[style]
    bottom, top = fy - 8, fy + st['h']
    if st['extra'] == 'hazard':
        # plateforme d'usine carrée, bord avant rayé jaune et noir
        fwd = (math.sin(yaw), 0, math.cos(yaw))
        block(st['side'], (cx, (bottom + top) / 2, cz), (2 * r, top - bottom, 1.7 * r), yaw)
        block(st['top'], (cx, top + 0.3, cz), (2 * r - 1, 0.6, 1.7 * r - 1), yaw)
        n = 10
        for k in range(n):
            t = (k + 0.5) / n - 0.5
            px = cx + math.cos(yaw) * t * 2 * r + fwd[0] * (0.85 * r)
            pz = cz - math.sin(yaw) * t * 2 * r + fwd[2] * (0.85 * r)
            block('ffc21a' if k % 2 else '1d2126', (px, top + 0.35, pz), (2 * r / n, 0.7, 1.2), yaw)
        return top + 0.6
    vcyl(st['side'], cx, bottom, cz, r, top - bottom)
    vcyl(st['top'], cx, top - 0.01, cz, r + 0.4, 0.8)
    for k in range(5):
        a = yaw + k * 2 * math.pi / 5 + rng.uniform(-0.35, 0.35)
        d, rr = r * rng.uniform(0.55, 0.8), r * rng.uniform(0.32, 0.5)
        hh = (top - bottom) - rng.uniform(0.3, 1.4)
        lx, lz = cx + math.cos(a) * d, cz + math.sin(a) * d
        vcyl(st['side'], lx, bottom, lz, rr, hh)
        vcyl(st['top'], lx, bottom + hh - 0.01, lz, rr + 0.4, 0.8)
    t = top + 0.8
    ex = st['extra']
    if ex == 'cracks':
        for _ in range(5):
            a = rng.uniform(0, math.pi)
            dx, dz = rng.uniform(-0.5, 0.5) * r, rng.uniform(-0.5, 0.5) * r
            block(glow_hex, (cx + dx, t - 0.1, cz + dz), (r * rng.uniform(0.4, 0.8), 0.3, 0.6), a, neon=True)
    elif ex == 'neonrim':
        for k in range(16):
            a = k * 2 * math.pi / 16
            block('27e8ff' if k % 2 else 'ff2fb4', (cx + math.cos(a) * (r + 0.2), t - 0.3, cz + math.sin(a) * (r + 0.2)),
                  (2 * math.pi * r / 16 * 0.9, 0.5, 0.5), -a + math.pi / 2, neon=True)
    elif ex == 'sprinkles':
        for _ in range(14):
            a, d = rng.uniform(0, 2 * math.pi), rng.uniform(0, r * 0.9)
            block(rng.choice(['ffe066', '6fe0c0', 'a57bff', '6cc8ff', 'fff6ee']), (cx + math.cos(a) * d, t, cz + math.sin(a) * d),
                  (0.35, 0.3, 1.2), rng.uniform(0, math.pi))
    elif ex == 'moss':
        for _ in range(6):
            a, d = rng.uniform(0, 2 * math.pi), rng.uniform(0, r * 0.8)
            vcyl('56733f', cx + math.cos(a) * d, t - 0.2, cz + math.sin(a) * d, rng.uniform(1, 2.5), 0.4)
    elif ex == 'gold':
        for _ in range(10):
            a, d = rng.uniform(0, 2 * math.pi), rng.uniform(0, r * 0.9)
            vcyl('f2b632', cx + math.cos(a) * d, t - 0.1, cz + math.sin(a) * d, 0.7, 0.25)
    return t

# ------------------------------------------------------------------ scènes (repère local : x le long du mur, z vers la piste)
# [modèle, x, z, échelle, lacet en degrés]
SCENES = {
    'Ice': [
        dict(name='Campement', style='snow', r=24, props=[['Igloo', 0, -2, 4.0, -90], ['Snowman', 13, 7, 3.0, -20], ['FrozenLamp', -7, 9, 3.0, 0],
             ['FrozenLamp', 7, 10, 3.0, 0], ['SnowyPine', -14, -9, 4.6, 0], ['SnowyPine', -5, -16, 5.2, 30], ['SnowyPine', 11, -13, 4.2, 60],
             ['SnowRocks', -16, 6, 2.2, 40]]),
        dict(name='Foret', style='snow', r=22, props=[['SnowyPine', -10, -6, 5.5, 0], ['SnowyPine', 0, -12, 6.2, 20], ['SnowyPine', 9, -4, 5.0, 45],
             ['SnowyPine', -3, 5, 4.2, 70], ['SnowyPine', 12, 8, 3.8, 10], ['SnowyPine', -13, 9, 3.6, 90], ['SnowRocks', 4, 13, 2.4, 0]]),
        dict(name='Cristaux', style='floe', r=18, props=[['IceCrystals', 0, 0, 5.0, 0], ['IceCrystals', -9, 6, 3.2, 60], ['IceCrystals', 8, -6, 3.8, 120],
             ['SnowRocks', 10, 8, 2.0, 30]]),
        dict(name='Arche', style='snow', r=21, props=[['IceArch', 0, 0, 3.0, 0], ['FrozenLamp', -13, 5, 3.0, 0], ['FrozenLamp', 13, 5, 3.0, 0],
             ['SnowyPine', -15, -10, 4.0, 0], ['SnowyPine', 15, -10, 4.4, 30]]),
    ],
    'Lava': [
        dict(name='Volcan', style='basalt', r=26, props=[['MiniVolcano', 0, -4, 4.5, 0], ['LavaRocks', -14, 7, 2.6, 30], ['LavaRocks', 13, 9, 2.2, 110],
             ['CharredTree', -15, -12, 3.5, 0], ['CharredTree', 16, -10, 3.0, 70]]),
        dict(name='Obsidienne', style='basalt', r=18, props=[['ObsidianCrystals', 0, 0, 4.2, 0], ['ObsidianCrystals', -9, 6, 2.8, 70],
             ['LavaRocks', 9, -5, 2.2, 0]]),
        dict(name='Calcinee', style='basalt', r=22, props=[['CharredTree', -8, -6, 4.0, 0], ['CharredTree', 6, -10, 3.4, 60], ['CharredTree', 12, 5, 3.0, 140],
             ['CharredTree', -4, 8, 2.6, 200], ['LavaRocks', -14, 4, 1.8, 0], ['LavaRocks', 3, 1, 1.6, 90]]),
        dict(name='Bassin', style='basalt', r=21, props=[['LavaPool', 0, -2, 2.8, 0], ['LavaBrazier', -14, 9, 2.8, 0], ['LavaBrazier', 14, 9, 2.8, 0]]),
    ],
    'Dragon': [
        dict(name='Antre', style='dragon', r=26, props=[['DragonEgg', 0, 0, 3.6, 0], ['GoldPile', -11, 7, 3.0, 0], ['GoldPile', 11, 8, 2.6, 90],
             ['TreasureChest', 12, -7, 2.8, -30], ['ClawOrb', -12, -8, 3.0, 0], ['DragonPillar', -18, -14, 3.2, 0], ['DragonPillar', 18, -14, 3.2, 180],
             ['DragonLantern', -6, 15, 2.8, 0], ['DragonLantern', 7, 15, 2.8, 180]]),
        dict(name='Tresor', style='dragon', r=18, props=[['TreasureChest', 0, 0, 3.4, 0], ['GoldPile', -8, 5, 2.4, 0], ['GoldPile', 8, 6, 2.2, 60],
             ['DragonLantern', -10, -8, 3.0, 90], ['ClawOrb', 9, -7, 2.6, 0]]),
    ],
    'Skeleton': [
        dict(name='Cimetiere', style='grave', r=26, props=[['Tombstone', -10, -6, 2.4, 0], ['Tombstone', -2, -8, 2.6, 5], ['Tombstone', 6, -7, 2.3, -4],
             ['Tombstone', -6, 2, 2.2, 8], ['Tombstone', 3, 1, 2.5, -6], ['BoneFence', 0, 15, 2.2, 0], ['HauntedTree', 15, -14, 3.4, 0],
             ['SkullCandles', -15, 8, 2.4, 0], ['FriendlyGhost', 11, 6, 2.2, 0, 'bob']]),
        dict(name='Sorciere', style='grave', r=20, props=[['WitchCauldron', 0, 0, 3.0, 0], ['JackOLantern', -9, 7, 2.2, 20], ['JackOLantern', 9, 7, 2.0, -20],
             ['GhostLamp', -12, -8, 3.0, 0], ['GhostLamp', 12, -8, 3.0, 180], ['BrokenFence', 0, -14, 2.2, 0]]),
        dict(name='Ossuaire', style='grave', r=22, props=[['BigSkull', 0, -3, 3.6, 0], ['BonePile', -12, 6, 2.8, 0], ['BonePile', 12, 5, 2.4, 90],
             ['SkullCandles', 0, 12, 2.4, 0], ['FriendlyGhost', -11, -11, 2.0, 0, 'bob']]),
    ],
    'Robot': [
        dict(name='Depot', style='steel', r=22, props=[['TechCrate', -8, -6, 3.0, 0], ['TechCrate', 0, -9, 2.6, 15], ['TechCrate', -5, 4, 2.4, -10],
             ['GiantBattery', 10, -6, 3.0, 0], ['GiantBattery', 15, 3, 2.4, 0], ['RoboLamp', -16, 9, 3.2, 90], ['RoboLamp', 16, 10, 3.2, 90]]),
        dict(name='Relais', style='steel', r=20, props=[['AntennaTower', 0, -4, 3.4, 0], ['GearStack', -11, 6, 2.6, 0], ['BrokenRobotHead', 10, 7, 2.6, -30],
             ['RoboLamp', -13, -9, 3.0, 0]]),
        dict(name='Tuyauterie', style='steel', r=20, props=[['CopperPipes', 0, -4, 3.4, 0], ['GearStack', 10, 8, 2.4, 0], ['TechCrate', -11, 7, 2.6, 0]]),
    ],
    'Retro': [
        dict(name='Arcade', style='neon', r=22, props=[['ArcadeCabinet', -6, -6, 3.0, 0], ['ArcadeCabinet', 0, -6, 3.0, 0], ['ArcadeCabinet', 6, -6, 3.0, 0],
             ['NeonPalm', -16, -4, 3.0, 0], ['NeonPalm', 16, -4, 3.0, 60], ['Boombox', 0, 8, 2.4, 0], ['SynthwaveSign', 0, -16, 3.2, 0]]),
        dict(name='Salon', style='neon', r=20, props=[['RetroTV', -7, -4, 2.6, 15], ['RetroTV', 7, -4, 2.6, -15], ['GiantCassette', 0, -13, 2.6, 0],
             ['Boombox', 0, 7, 2.4, 0], ['NeonPalm', -14, 8, 2.8, 0], ['NeonPalm', 14, 8, 2.8, 90]]),
        dict(name='Plage', style='neon', r=20, props=[['NeonPalm', -8, -6, 3.4, 0], ['NeonPalm', 4, -10, 3.0, 80], ['NeonPalm', 11, 3, 2.6, 160],
             ['GiantCassette', -7, 7, 2.4, -20], ['Boombox', 8, 10, 2.0, 0]]),
    ],
    'Candy': [
        dict(name='Verger', style='candy', r=22, props=[['GumdropTree', -8, -6, 3.4, 0], ['GumdropTree', 6, -10, 3.0, 40], ['GumdropTree', 12, 4, 2.6, 90],
             ['Lollipop', -12, 8, 2.6, 0], ['Lollipop', 2, 10, 2.2, 40], ['CandyCane', -3, -15, 3.0, 0]]),
        dict(name='Patisserie', style='candy', r=20, props=[['Cupcake', 0, -4, 3.0, 0], ['GiantDonut', -11, 6, 2.4, 30], ['IceCreamCone', 11, 5, 2.6, 0],
             ['WrappedCandy', 0, 12, 2.0, 20]]),
        dict(name='Sucres', style='candy', r=18, props=[['CandyCane', -6, -4, 3.2, 0], ['CandyCane', 6, -2, 2.8, 180], ['Lollipop', 0, 8, 2.6, 0],
             ['WrappedCandy', -10, 8, 1.8, 0]]),
    ],
}
GHOST_PROPS = {'FriendlyGhost', 'HauntedTree', 'BrokenFence', 'JackOLantern', 'WitchCauldron', 'GhostLamp'}
def world_of(scene_world, name):
    if scene_world == 'Skeleton' and name in GHOST_PROPS:
        return 'Ghost'
    return scene_world

# groupes sur le rebord : (modèle, échelle min, max)
RIM_GROUPS = {
    'Ice': [[('SnowyPine', 5, 7)] * 4 + [('SnowRocks', 3, 4)], [('IceCrystals', 5, 6.5), ('IceCrystals', 3.5, 4.5), ('SnowRocks', 3, 4)]],
    'Lava': [[('MiniVolcano', 5.5, 6.5), ('LavaRocks', 3, 4)], [('CharredTree', 5, 6.5)] * 3 + [('LavaRocks', 3, 4)]],
    'Dragon': [[('DragonPillar', 5, 6), ('DragonPillar', 5, 6), ('DragonLantern', 4.5, 5.5)], [('ClawOrb', 5, 6), ('GoldPile', 4, 5)]],
    'Skeleton': [[('RibcageArch', 3.5, 4.2)], [('HauntedTree', 5, 6.5), ('HauntedTree', 4.5, 5.5), ('GhostLamp', 4.5, 5.5)]],
    'Robot': [[('AntennaTower', 5, 6), ('GiantBattery', 4, 5)], [('GearStack', 5, 6), ('TechCrate', 4, 5), ('RoboLamp', 5, 6)]],
    'Retro': [[('NeonPalm', 5, 6.5)] * 3, [('SynthwaveSign', 5, 6), ('NeonPalm', 5, 6)]],
    'Candy': [[('GumdropTree', 5, 6.5)] * 3 + [('Lollipop', 4.5, 5.5)], [('CandyCane', 5, 6), ('Lollipop', 5, 6), ('CandyCane', 4.5, 5.5)]],
}

# niveau -> (mondes des scènes, décor des murs)
LEVELS = {
    1: (['Retro'], 'neon'),
    2: (['Lava'], 'lavafall'),
    3: (['Lava'], 'lavafall'),
    4: (['Robot'], 'gears'),
    5: (['Lava'], 'lavafall'),
    6: (['Candy'], 'drips'),
    7: (['Lava', 'Dragon'], 'lavafall'),
    8: (['Dragon'], 'banners'),
    9: (['Ice'], 'icicles'),
    10: (['Skeleton'], 'ribs'),
    11: (['Robot'], 'gears'),
    12: (['Retro'], 'neon'),
}

# ------------------------------------------------------------------ décors de murs
ISLANDS = []      # étendues en z des îlots du côté en cours : les chutes de lave les évitent

def near_island(z0, z1):
    return any(a - 8 < z1 and z0 < b + 8 for a, b in ISLANDS)

def wall_features(lvl, kind, side, rng, glow):
    fy, ry, rim, z0 = floor_y(lvl), ride_y(lvl), rim_y(lvl), z_start(lvl)
    face = side * INNER
    ins = lambda d: face - side * d          # x à d studs de la paroi, côté piste
    z = z0 + 115 + rng.uniform(0, 20)
    end = z0 + 1300 - 10
    if kind == 'icicles':
        while z < end:
            if band_free(lvl, ins(3), ins(0.5), z - 5, z + 5, rim - 20, rim):
                group(lvl, 'Murs', 'Stalactites', (ins(1), rim, z, 0))
                block('eef6ff', (ins(1.2), rim - 0.6, z), (2.6, 1.4, 11))
                for _ in range(rng.randint(3, 5)):
                    L, r = rng.uniform(4, 14), rng.uniform(0.6, 1.1)
                    zz = z + rng.uniform(-4.5, 4.5)
                    for k in range(3):
                        rr = r * (1 - k * 0.3)
                        vcyl('cfefff' if k < 2 else 'eafbff', ins(r + 0.2), rim - 1.2 - L * (k + 1) / 3, zz, rr, L / 3 * 1.05)
            z += rng.uniform(14, 24)
    elif kind == 'lavafall':
        while z < end:
            w, top = rng.uniform(6, 10), rim - 2
            if not near_island(z - w - 7, z + w + 7) and band_free(lvl, ins(8), ins(0.5), z - w, z + w, fy, rim):
                group(lvl, 'Murs', 'CascadeLave', (ins(1), fy, z, 0))
                block(glow, (ins(0.6), (fy + top) / 2, z), (1.2, top - fy, w), neon=True)
                for s in (-1, 1):
                    h = (top - fy) * rng.uniform(0.55, 0.9)
                    block(glow, (ins(0.5), top - h / 2, z + s * (w / 2 + 1.6)), (0.8, h, 1.8), neon=True)
                vcyl(glow, ins(6), fy - 0.6, z, 7, 1.2, neon=True)
                block('2a2323', (ins(2), top + 0.5, z), (4, 3, w + 4))
                z += rng.uniform(150, 220)
            else:
                z += 25
    elif kind == 'gears':
        while z < end:
            R = rng.uniform(12, 20)
            cy = ry + rng.uniform(45, 95)
            if cy + R < rim - 4 and band_free(lvl, ins(3.5), ins(0.5), z - R - 2, z + R + 2, cy - R - 2, cy + R + 2):
                group(lvl, 'Murs', 'Engrenage', (ins(1.6), cy, z, 0))
                TURNS.append((rng.choice([-1, 1]) * rng.uniform(18, 34), 0, ins(1.6), cy, z))
                t = len(TURNS)
                steel = rng.choice(['8a96a3', 'c97a45'])
                part(2, steel, 0, (ins(1.6), cy, z), (1, 0, 0), (0, 1, 0), (3, 2 * R, 2 * R), t)
                for k in range(12):
                    a = k * 2 * math.pi / 12
                    part(1, steel, 0, (ins(1.6), cy + math.cos(a) * R, z + math.sin(a) * R), (1, 0, 0), (0, math.cos(a), math.sin(a)), (3, R * 0.3, R * 0.34), t)
                part(2, '29f0ff', 1, (ins(1.6), cy, z), (1, 0, 0), (0, 1, 0), (3.4, R * 0.45, R * 0.45), t)
                part(2, '2c333b', 0, (ins(1.6), cy, z), (1, 0, 0), (0, 1, 0), (3.6, R * 0.25, R * 0.25), t)
                z += rng.uniform(140, 220)
            else:
                z += 25
    elif kind == 'ribs':
        while z < end:
            y0 = ry + rng.uniform(55, 100)
            if y0 < rim - 5 and band_free(lvl, ins(30), ins(0.5), z - 3, z + 11, y0 - 34, y0 + 2):
                group(lvl, 'Murs', 'CotesGeantes', (ins(1), y0, z, 0))
                for dz in (0, 8):
                    pts = []
                    for k in range(7):
                        t = k / 6
                        pts.append((ins(26 * math.sin(t * math.pi * 0.85)), y0 - 32 * t, z + dz))
                    for k in range(6):
                        seg('e8dfc8' if k % 2 else 'c9bd9f', pts[k], pts[k + 1], 2.2 - k * 0.15)
                z += rng.uniform(100, 150)
            else:
                z += 25
    elif kind == 'banners':
        while z < end:
            if band_free(lvl, ins(2), ins(0.3), z - 6, z + 6, rim - 34, rim):
                group(lvl, 'Murs', 'Banniere', (ins(0.5), rim - 16, z, 0))
                block('c4202e', (ins(0.4), rim - 3 - 13, z), (0.5, 26, 9))
                block('f2b632', (ins(0.6), rim - 2.4, z), (1.0, 1.2, 11))
                block('f2b632', (ins(0.6), rim - 3 - 26, z), (0.7, 1.0, 9))
                block('f2b632', (ins(0.7), rim - 12, z), (0.6, 3.2, 3.2), 0)
                block('8e1422', (ins(0.55), rim - 3 - 13, z), (0.5, 26, 1.2))
                z += rng.uniform(100, 150)
            else:
                z += 20
    elif kind == 'neon':
        group(lvl, 'Murs', 'BandesNeon', (ins(0.5), ry, z0 + 650, 0))
        for h, c in ((ry + 18, 'ff2fb4'), (ry + 52, '27e8ff')):
            zz = z0 + 115
            while zz < end - 60:
                if band_free(lvl, ins(1.5), ins(0.2), zz, zz + 60, h - 2, h + 2):
                    block(c, (ins(0.35), h, zz + 30), (0.6, 1.2, 58), neon=True)
                zz += 60
        z = z0 + 150
        while z < end:
            if band_free(lvl, ins(1.5), ins(0.2), z - 1, z + 1, ry, rim):
                block('27e8ff', (ins(0.35), (ry + rim) / 2, z), (0.6, rim - ry, 0.8), neon=True)
            z += 60
    elif kind == 'drips':
        group(lvl, 'Murs', 'Glacage', (ins(1), rim, z0 + 650, 0))
        while z < end:
            dw = rng.randint(2, 4) * 1.5
            if band_free(lvl, ins(2), ins(0.3), z, z + dw, rim - 16, rim):
                dh = rng.uniform(3, 13)
                block(rng.choice(['ffc2e0', 'ff9ccc', 'fff6ee']), (ins(0.9), rim - 1 - dh / 2, z + dw / 2), (1.8, dh, dw))
            z += dw + rng.uniform(0.5, 3)

# ------------------------------------------------------------------ pose
def place_scene(lvl, world, sc, x, fy, z, yaw, k, rng, tint):
    g = group(lvl, 'Scenes', 'Scene_' + sc['name'], (x, fy, z, yaw))
    g['in_island'] = True
    top = island(sc['style'], x, fy, z, sc['r'] * k, yaw, rng, NAPPE.get('Level%d' % lvl, 'ff4d12'))
    g['in_island'] = False
    for p in sc['props']:
        name, px, pz, s, py = p[0], p[1] * k, p[2] * k, p[3] * k, math.radians(p[4])
        wx = x + math.cos(yaw) * px + math.sin(yaw) * pz
        wz = z - math.sin(yaw) * px + math.cos(yaw) * pz
        bob = 1.5 * s if len(p) > 5 and p[5] == 'bob' else 0.0
        y = top + (4 * k if bob else 0)
        prop(lvl, world_of(world, name), name, wx, y, wz, yaw + py, s, tint, bob)

def build_level(lvl):
    cur_level[0] = lvl
    worlds, wall = LEVELS[lvl]
    rng = random.Random(9000 + lvl)
    fy, z0 = floor_y(lvl), z_start(lvl)
    nappe = NAPPE.get('Level%d' % lvl, 'f07c24')
    tint = tint_for(nappe)
    glow = nappe
    count = 0
    for side in (-1, 1):
        ISLANDS.clear()
        order = [(w, s) for w in worlds for s in SCENES[w]]
        rng.shuffle(order)
        i = 0
        z = z0 + 150 + rng.uniform(0, 40)
        while z < z0 + 1300 - 30:
            world, sc = order[i % len(order)]
            k = rng.uniform(1.3, 1.55)
            R = sc['r'] * k * 1.3                   # îlot + ses lobes
            x = side * (INNER - 3 - R)
            # face à la piste : le +z local regarde le centre du canyon
            yaw = -side * math.pi / 2
            if disc_free(lvl, x, z, R, fy, ride_y(lvl) + 400):
                place_scene(lvl, world, sc, x, fy, z, yaw, k, rng, tint if world == 'Lava' else 0)
                ISLANDS.append((z - R, z + R))
                count += 1
                i += 1
                z += 2 * R + rng.uniform(110, 210)
            else:
                z += 20
        wall_features(lvl, wall, side, rng, glow)
        # groupes sur le rebord
        z = z0 + rng.uniform(40, 140)
        rim = rim_y(lvl)
        while z < z0 + 1300:
            world = rng.choice(worlds)
            grp = rng.choice(RIM_GROUPS[world])
            group(lvl, 'Rebord', 'Groupe_' + grp[0][0], (side * (INNER + 42), rim, z, 0))
            for j, (name, s0, s1) in enumerate(grp):
                a = j * 2.4 + rng.uniform(-0.4, 0.4)
                d = 0 if j == 0 else rng.uniform(10, 22)
                px = side * (INNER + 42) + math.cos(a) * d
                pz = z + math.sin(a) * d
                prop(lvl, world_of(world, name), name, px, rim, pz, rng.uniform(0, 2 * math.pi), rng.uniform(s0, s1), tint if world == 'Lava' else 0, 0)
            z += rng.uniform(260, 380)
    return count

TREADMILLS = ['Clavier', 'BonbonGeant', 'Glace', 'Lave', 'Robot', 'Squelette', 'Retro8bit', 'Dragon', 'Fantome', 'Galaxie']
TREAD_WORLD = {'BonbonGeant': 'Candy', 'Glace': 'Ice', 'Lave': 'Lava', 'Robot': 'Robot', 'Squelette': 'Skeleton',
               'Retro8bit': 'Retro', 'Dragon': 'Dragon', 'Fantome': 'Skeleton'}

def build_lobby():
    cur_level[0] = 0
    rng = random.Random(777)
    for k, tid in enumerate(TREADMILLS):
        world = TREAD_WORLD.get(tid)
        if not world:
            continue
        z = -240 + k * 52
        grp = RIM_GROUPS[world][0] if tid != 'Fantome' else RIM_GROUPS['Skeleton'][1]
        group(0, 'Lobby', 'Tapis_' + tid, (-(INNER + 40), LOBBY_RIM, z, 0))
        for j, (name, s0, s1) in enumerate(grp[:3]):
            prop(0, world_of(world, name), name, -(INNER + 40) + rng.uniform(-8, 8), LOBBY_RIM, z + (j - 1) * 15, rng.uniform(0, 2 * math.pi),
                 rng.uniform(s0, s1) * 0.7, 0, 0)

for i in range(1, 13):
    n = build_level(i)
    print(f'niveau {i:2d} : {n:2d} scènes')
build_lobby()

# ------------------------------------------------------------------ écriture
def f(x, d=2):
    s = f'{x:.{d}f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s

lua = ['-- Généré par Decorations/Layout/decor_layout.py à partir de la géométrie réelle des niveaux : ne pas éditer à la main.',
       'return {']
lua.append('\tColors = { ' + ', '.join(f'"{c}"' for c in COLORS) + ' },')
lua.append('\tTints = { ' + ', '.join('{ ' + ', '.join(f'{{ "{a}", "{b}" }}' for a, b in t) + ' }' for t in TINTS) + ' },')
lua.append('\tTurns = { ' + ', '.join('{ ' + ', '.join(f(v) for v in t) + ' }' for t in TURNS) + ' },')
lua.append('\t-- Par modèle posé : niveau (0 = lobby), monde, modèle, x, y, z, lacet, échelle, teinte, flottement.')
lua.append('\tProps = {')
for p in PROPS:
    lua.append(f'\t\t{{ {p[0]}, "{p[1]}", "{p[2]}", {f(p[3])}, {f(p[4])}, {f(p[5])}, {f(p[6], 3)}, {f(p[7])}, {p[8]}, {f(p[9])} }},')
lua.append('\t},')
lua.append('\t-- Par part : niveau, forme (1 bloc, 2 cylindre, 3 boule), couleur, néon, position (3), droite (3), haut (3), taille (3), rotation.')
lua.append('\tParts = {')
for lv, pt in zip(LEVEL_OF_PART, PARTS):
    sh, ci, ne, px, py, pz, rx, ry, rz, ux, uy, uz, sx, sy, sz, tu = pt
    lua.append('\t\t' + ', '.join([str(lv), str(sh), str(ci), str(ne), f(px), f(py), f(pz), f(rx, 3), f(ry, 3), f(rz, 3), f(ux, 3), f(uy, 3), f(uz, 3), f(sx), f(sy), f(sz), str(tu)]) + ',')
lua.append('\t},')
lua.append('}')
open(OUT_LUA, 'w').write('\n'.join(lua) + '\n')
for g in GROUPS:
    g.pop('in_island', None)
json.dump(dict(colors=COLORS, tints=TINTS, turns=TURNS, props=PROPS, parts=[(lv,) + tuple(pt) for lv, pt in zip(LEVEL_OF_PART, PARTS)], groups=GROUPS), open(OUT_JSON, 'w'))
print('modèles posés', len(PROPS), 'parts', len(PARTS), 'rotations', len(TURNS), 'taille lua', sum(len(l) + 1 for l in lua))
