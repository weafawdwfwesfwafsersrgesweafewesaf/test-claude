"""Décors de l'histoire « The Listener » : piscine municipale (jour/nuit), vestiaires, salle de bain,
lac, rue avec flaques et cônes, façade de la piscine. Modules réutilisables."""
import bpy, math, random
from mathutils import Vector
from core import *
from sets import M, wall_with_openings, street_lamp, house, sky_day, sky_night

# Géométrie de la piscine (partagée par les plans)
PX, PY = 4.0, 9.0          # demi-largeur / demi-longueur du bassin
WL = -0.12                 # niveau de l'eau
HALL = (7.0, 12.0, 5.5)    # demi-x, demi-y, hauteur du hall


def pool_floor_z(y):
    """Fond : petit bain (-1.2) → pente → grand bain (-3.2) côté +Y."""
    if y < 0:
        return -1.2
    if y < 6:
        return -1.2 - 2.0 * (y / 6)
    return -3.2


def _mesh(name, verts, faces, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    link(o)
    return o


def sign(name, txt, loc, rot_z=0.0, w=1.6, h=0.45, bg=(0.95, 0.95, 0.93), fg=(0.8, 0.05, 0.05), size=0.2, glow=0.0):
    root = empty(name)
    box(name + "_plate", (w, 0.03, h), (0, 0, 0), plastic(bg, 0.4, name=name + "_bg") if not glow else emission(bg, glow, name=name + "_bg"),
        0.01, parent=root)
    text(name + "_txt", txt, (0, -0.02, 0), size, plastic(fg, 0.4, name=name + "_fg") if not glow else emission(fg, glow * 2, name=name + "_fgE"),
         extrude=0.006, parent=root)
    root.location = loc
    root.rotation_euler = (0, 0, rot_z)
    return root


def ladder(name, x, y, side):
    """Échelle chromée : deux mains courantes en arc + barreaux."""
    chrome = metal((0.92, 0.93, 0.95), 0.08, name="Chrome")
    root = empty(name)
    for dx in (-0.25, 0.25):
        pts = [(dx, 0.35 * side, 0.0), (dx, 0.35 * side, 0.75), (dx, 0.05 * side, 0.95), (dx, -0.15 * side, 0.6),
               (dx, -0.15 * side, -1.0)]
        cu = bpy.data.curves.new(name + "_rail", "CURVE")
        cu.dimensions = "3D"; cu.bevel_depth = 0.022; cu.bevel_resolution = 3
        sp = cu.splines.new("NURBS"); sp.points.add(len(pts) - 1)
        for p, c in zip(sp.points, pts):
            p.co = (*c, 1)
        sp.order_u = 3; sp.use_endpoint_u = True
        cu.materials.append(chrome)
        o = bpy.data.objects.new(name + "_rail", cu); link(o); set_parent(o, root)
    for k in range(3):
        box(f"{name}_step{k}", (0.5, 0.08, 0.03), (0, -0.15 * side, -0.25 - k * 0.3), chrome, 0.01, parent=root)
    root.location = (x, y, 0)
    return root


def lane_rope(name, x, y0, y1):
    red = plastic((0.85, 0.08, 0.08), 0.3, name="FloatRed")
    wht = plastic((0.95, 0.95, 0.95), 0.3, name="FloatWhite")
    seg = 0.3
    a = cyl(name + "_r", 0.055, 0.14, (x, y0, WL + 0.01), red, 0.02, rot=(math.pi / 2, 0, 0), verts=16)
    b = cyl(name + "_w", 0.055, 0.14, (x, y0 + seg / 2, WL + 0.01), wht, 0.02, rot=(math.pi / 2, 0, 0), verts=16)
    n = int((y1 - y0) / seg)
    for o in (a, b):
        ar = o.modifiers.new("Array", "ARRAY")
        ar.count = n
        ar.use_relative_offset = False
        ar.use_constant_offset = True
        ar.constant_offset_displace = (0, 0, -seg)  # axe local Z = monde -Y après rotation
    return a, b


def pool_hall(night=False):
    """Piscine municipale « poolrooms » : carrelage, bassin à grand bain, lignes d'eau, échelles, panneaux."""
    R = {}
    hx, hy, hh = HALL
    deck_t = tiles((0.93, 0.93, 0.9), (0.6, 0.62, 0.6), 0.15, name="DeckTiles", rough=0.25)
    wall_t = tiles((0.9, 0.93, 0.92), (0.62, 0.66, 0.66), 0.15, name="WallTiles", rough=0.12)
    band_t = tiles((0.08, 0.32, 0.6), (0.05, 0.2, 0.4), 0.15, name="BandTiles", rough=0.12)
    pool_t = tiles((0.45, 0.8, 0.88), (0.3, 0.6, 0.68), 0.12, name="PoolTiles", rough=0.2, var=0.1)
    line_t = plastic((0.05, 0.12, 0.35), 0.3, name="LaneLine")
    # pont (plage) autour du bassin
    for nm, sz, lc in (("W", (hx - PX, 2 * hy, 0.3), (-(hx + PX) / 2, 0, -0.15)),
                       ("E", (hx - PX, 2 * hy, 0.3), ((hx + PX) / 2, 0, -0.15)),
                       ("S", (2 * PX, hy - PY, 0.3), (0, -(hy + PY) / 2, -0.15)),
                       ("N", (2 * PX, hy - PY, 0.3), (0, (hy + PY) / 2, -0.15))):
        box("P_deck" + nm, sz, lc, deck_t, 0.0)
    # margelle arrondie
    cop = plastic((0.95, 0.94, 0.9), 0.25, name="Coping")
    for nm, sz, lc in (("W", (0.32, 2 * PY + 0.64, 0.07), (-PX - 0.16, 0, 0.0)), ("E", (0.32, 2 * PY + 0.64, 0.07), (PX + 0.16, 0, 0.0)),
                       ("S", (2 * PX, 0.32, 0.07), (0, -PY - 0.16, 0.0)), ("N", (2 * PX, 0.32, 0.07), (0, PY + 0.16, 0.0))):
        box("P_coping" + nm, sz, lc, cop, 0.03)
    # bassin : parois + fond en pente
    ys = [-PY, 0, 6, PY]
    for sx in (-1, 1):
        verts = [(sx * PX, y, 0) for y in ys] + [(sx * PX, y, pool_floor_z(y)) for y in ys]
        faces = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6)]
        _mesh(f"P_side{sx}", verts, faces, pool_t)
    for sy in (-1, 1):
        y = sy * PY
        z = pool_floor_z(y)
        _mesh(f"P_end{sy}", [(-PX, y, 0), (PX, y, 0), (PX, y, z), (-PX, y, z)], [(0, 1, 2, 3)], pool_t)
    fv = [(x, y, pool_floor_z(y)) for y in ys for x in (-PX, PX)]
    _mesh("P_floor", fv, [(0, 1, 3, 2), (2, 3, 5, 4), (4, 5, 7, 6)], pool_t)
    for lx in (-3, -1, 1, 3):
        v = [(lx + dx, y, pool_floor_z(y) + 0.01) for y in (-PY + 1, 0, 6, PY - 1) for dx in (-0.12, 0.12)]
        _mesh(f"P_line{lx}", v, [(0, 1, 3, 2), (2, 3, 5, 4), (4, 5, 7, 6)], line_t)
        box(f"P_lineT{lx}", (0.7, 0.24, 0.02), (lx, PY - 1, pool_floor_z(PY - 1) + 0.012), line_t, 0.0)
    # eau
    wm = water((0.75, 0.95, 1.0), name="PoolWaterNight" if night else "PoolWater")
    if night:
        # lueur des projecteurs immergés (fiable en EEVEE même en vue rasante)
        b = wm.node_tree.nodes["Principled BSDF"]
        b.inputs["Emission Color"].default_value = (0.2, 0.75, 0.95, 1)
        b.inputs["Emission Strength"].default_value = 0.13
    wat = water_plane("P_water", (2 * PX, 2 * PY), (0, 0, WL), wm, cuts=(90, 200))
    R["water"] = wat
    # lignes d'eau
    for lx in (-2, 0, 2):
        lane_rope(f"P_rope{lx}", lx, -PY + 0.2, PY - 0.2)
    # échelles
    ladder("P_ladder1", PX - 0.6, PY + 0.02, -1)
    ladder("P_ladder2", -PX + 0.6, -PY - 0.02, 1)
    # murs du hall : carrelage + bandeau bleu + fenêtres hautes
    for nm, L_, loc, rz in (("N", 2 * hx, (0, hy + 0.1, 0), 0), ("S", 2 * hx, (0, -hy - 0.1, 0), 0),
                            ("W", 2 * hy, (-hx - 0.1, 0, 0), math.pi / 2), ("E", 2 * hy, (hx + 0.1, 0, 0), math.pi / 2)):
        wroot = empty("P_wall" + nm)
        box(f"P_wall{nm}_lo", (L_, 0.2, 3.2), (0, 0, 1.6), wall_t, 0.0, parent=wroot)
        box(f"P_wall{nm}_band", (L_, 0.22, 0.3), (0, 0, 1.2), band_t, 0.0, parent=wroot)
        box(f"P_wall{nm}_hi", (L_, 0.2, hh - 4.2), (0, 0, 4.2 + (hh - 4.2) / 2), wall_t, 0.0, parent=wroot)
        # fenêtres hautes (bande vitrée)
        winm = emission((0.2, 0.32, 0.75), 0.5, name="HighWinNight") if night else emission((0.85, 0.92, 1.0), 1.6, name="HighWinDay")
        box(f"P_wall{nm}_win", (L_ * 0.9, 0.1, 0.9), (0, 0, 3.7), winm, 0.0, parent=wroot)
        for k in range(int(L_ / 2)):
            box(f"P_wall{nm}_mul{k}", (0.08, 0.16, 1.0), (-L_ * 0.45 + k * 2 + 1, 0, 3.7), plastic((0.3, 0.32, 0.35), 0.4, name="Mullion"), 0.0, parent=wroot)
        wroot.location = loc
        wroot.rotation_euler = (0, 0, rz)
    # piliers carrelés
    for sx in (-1, 1):
        for y in (-8, -2, 4, 10):
            box(f"P_pillar{sx}{y}", (0.5, 0.5, hh), (sx * (hx - 0.6), y, hh / 2), wall_t, 0.02)
    # plafond + panneaux lumineux
    plane("P_ceiling", (2 * hx, 2 * hy), (0, 0, hh), (math.pi, 0, 0), plastic((0.6, 0.62, 0.62), 0.8, name="CeilingP"))
    panel_m = plastic((0.25, 0.25, 0.27), 0.3, name="PanelOff") if night else emission((1.0, 0.97, 0.9), 3.0, name="PanelOn")
    for x in (-3, 3):
        for y in (-9, -3, 3, 9):
            box(f"P_panel{x}{y}", (1.6, 0.5, 0.05), (x, y, hh - 0.04), panel_m, 0.0)
    # sortie au fond (côté grand bain, plage Est) + portes principales enchaînées (côté petit bain)
    exit_x = 5.4
    door_m = plastic((0.45, 0.48, 0.5), 0.35, name="DoorMetal")
    box("P_exitdoorL", (0.9, 0.08, 2.2), (exit_x - 0.46, hy - 0.02, 1.1), door_m, 0.02)
    exit_hinge = empty("P_exithinge", (exit_x + 0.92, hy - 0.06, 0))
    box("P_exitdoorR", (0.9, 0.08, 2.2), (exit_x + 0.46, hy - 0.06, 1.1), door_m, 0.02, parent=exit_hinge)
    box("P_exitbar", (0.7, 0.06, 0.05), (exit_x + 0.46, hy - 0.12, 1.05), metal(name="Metal"), 0.01, parent=exit_hinge)
    R["exit_hinge"] = exit_hinge
    plane("P_exitout", (1.8, 2.2), (exit_x, hy + 0.3, 1.1), (math.pi / 2, 0, 0), emission((0.05, 0.08, 0.18), 1.0, name="OutsideNight"))
    R["exit_sign"] = sign("P_exitsign", "EXIT", (exit_x, hy - 0.08, 2.55), 0, 0.8, 0.28, (0.02, 0.35, 0.08), (0.6, 1.0, 0.6), 0.18, glow=3.0)
    light("P_exitglow", "POINT", (exit_x, hy - 0.5, 2.5), 25.0 if night else 0.0, (0.3, 1.0, 0.4), 0.2)
    # portes principales fermées par une chaîne (mur sud)
    for dx in (-0.5, 0.5):
        box(f"P_main{dx}", (0.95, 0.08, 2.3), (-4 + dx, -hy + 0.02, 1.15), door_m, 0.02)
    steel = metal((0.7, 0.7, 0.72), 0.25, name="Steel")
    for k in range(10):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.045, minor_radius=0.012, location=(-4.45 + k * 0.09, -hy + 0.11, 1.1),
                                         rotation=(0 if k % 2 else math.pi / 2, math.pi / 2, 0))
        bpy.context.active_object.data.materials.append(steel)
    box("P_padlock", (0.12, 0.05, 0.14), (-4, -hy + 0.14, 1.03), metal((1, 0.75, 0.3), 0.25, name="Gold"), 0.02)
    # porte des vestiaires (mur sud, côté Est)
    plane("P_lockerdoor", (1.0, 2.1), (4.5, -hy + 0.0, 1.05), (math.pi / 2, 0, 0), emission((0.2, 0.25, 0.3), 0.6, name="LockerDoorway"))
    sign("P_lockersign", "LOCKERS", (4.5, -hy + 0.12, 2.4), math.pi, 1.0, 0.25, (0.1, 0.25, 0.55), (1, 1, 1), 0.13)
    # panneaux « NO SPLASHING! » + profondeurs
    R["sign_main"] = sign("P_sign1", "NO SPLASHING!", (0, hy - 0.0, 2.6), 0, 2.6, 0.6, size=0.32)
    sign("P_sign2", "NO SPLASHING!", (-hx + 0.0, 0, 2.4), -math.pi / 2, 2.2, 0.5, size=0.26)
    sign("P_sign3", "IT HEARS THE WATER", (hx - 0.0, -4, 2.4), math.pi / 2, 2.6, 0.45, bg=(0.95, 0.85, 0.2), fg=(0.1, 0.1, 0.1), size=0.2)
    for y, t in ((-PY + 0.6, "4 FT"), (0, "4 FT"), (5.5, "8 FT"), (PY - 0.6, "12 FT")):
        for sx in (-1, 1):
            text(f"P_depth{y}{sx}", t, (sx * (PX + 0.55), y, 0.003), 0.2, plastic((0.08, 0.2, 0.5), name="DepthPaint"),
                 rot=(0, 0, -sx * math.pi / 2), extrude=0.001)
    # chaise de maître-nageur + transats
    wch = plastic((0.95, 0.95, 0.95), 0.35, name="WhitePlastic")
    lg = empty("P_lifeguard")
    for dx in (-0.35, 0.35):
        for dy in (-0.3, 0.3):
            box(f"P_lgleg{dx}{dy}", (0.07, 0.07, 1.9), (dx, dy, 0.95), wch, 0.01, parent=lg)
    box("P_lgseat", (0.8, 0.7, 0.08), (0, 0, 1.9), wch, 0.02, parent=lg)
    box("P_lgback", (0.8, 0.08, 0.6), (0, 0.33, 2.25), wch, 0.02, parent=lg)
    box("P_lgbuoy", (0.18, 0.5, 0.12), (0.45, 0, 1.4), plastic((0.95, 0.15, 0.1), 0.3, name="Buoy"), 0.05, parent=lg)
    for i, y in enumerate((-6, -4.4, 5.0)):
        lg.location = (-PX - 1.2, 1.0, 0) if i == 0 else lg.location
        box(f"P_lounger{i}", (0.65, 1.8, 0.12), (-hx + 1.4, y, 0.35), wch, 0.04)
        box(f"P_loungerback{i}", (0.65, 0.6, 0.1), (-hx + 1.4, y + 0.95, 0.6), wch, 0.04, rot=(0.9, 0, 0))
    # lumières
    if night:
        world_color(bpy.context.scene, (0.01, 0.015, 0.03), 1.0)
        for i, y in enumerate((-6, -1, 4, 8)):
            for sx in (-1, 1):
                cyl(f"P_uwlamp{i}{sx}", 0.13, 0.03, (sx * (PX - 0.01), y, -0.7), emission((0.4, 0.95, 1.0), 7.0, name="UWLamp"),
                    rot=(0, math.pi / 2, 0))
            ul = light(f"P_uwlight{i}", "POINT", ((PX - 0.2) * (1 if i % 2 else -1), y, -0.7), 30.0, (0.3, 0.85, 1.0), 0.15)
            ul.data.specular_factor = 0.0  # pas de reflet géant sur l'eau
        light("P_moon", "AREA", (0, 0, hh - 0.6), 22.0, (0.35, 0.5, 1.0), 10.0)
        # éclairage du grand bain (le Listener) : key froide + contre-jour + lueur immergée
        k = light("P_deepkey", "AREA", (3.2, 3.8, 3.4), 220.0, (0.6, 0.85, 1.0), 2.0)
        look_at(k, (0, 7.5, 0.8))
        k.data.specular_factor = 0.2
        rim = light("P_deeprim", "AREA", (-1.5, 11.2, 3.2), 160.0, (0.5, 0.8, 1.0), 2.0)
        look_at(rim, (0, 7.5, 1.2))
        rim.data.specular_factor = 0.3
        light("P_deepglow", "POINT", (3.0, 6.0, -1.5), 60.0, (0.3, 0.85, 1.0), 0.15)
        light("P_fillnight", "AREA", (0, -hy + 2, 3.0), 12.0, (0.3, 0.6, 1.0), 6.0, rot=(math.radians(70), 0, 0))
    else:
        world_color(bpy.context.scene, (0.6, 0.7, 0.8), 0.25)
        for x in (-3, 3):
            for y in (-6, 0, 6):
                light(f"P_ceil{x}{y}", "AREA", (x, y, hh - 0.2), 260.0, (1.0, 0.97, 0.92), 3.0)
        for i, y in enumerate((-6, 0, 6)):
            ul = light(f"P_uwlight{i}", "POINT", ((PX - 0.2) * (1 if i % 2 else -1), y, -0.7), 12.0, (0.5, 0.9, 1.0), 0.15)
            ul.data.specular_factor = 0.0  # pas de reflet géant sur l'eau
    return R


def locker_room():
    """Vestiaires : casiers bleus, banc, carrelage, porte vers la piscine (lueur bleue)."""
    R = {}
    W, D, Hh = 6.0, 5.0, 3.0
    floor_t = tiles((0.75, 0.75, 0.72), (0.45, 0.45, 0.43), 0.2, name="LockerFloor", rough=0.35)
    wall_t = tiles((0.85, 0.88, 0.86), (0.6, 0.62, 0.6), 0.15, name="WallTiles2", rough=0.2)
    plane("L_floor", (W, D), (0, 0, 0), mat=floor_t)
    plane("L_ceiling", (W, D), (0, 0, Hh), (math.pi, 0, 0), plastic((0.6, 0.6, 0.6), 0.8, name="CeilingL"))
    wall_with_openings("L_wallBack", W, Hh, 0.15, wall_t, [], loc=(0, D / 2 + 0.075, 0))
    wall_with_openings("L_wallFront", W, Hh, 0.15, wall_t, [], loc=(0, -D / 2 - 0.075, 0))
    wall_with_openings("L_wallLeft", D, Hh, 0.15, wall_t, [], loc=(-W / 2 - 0.075, 0, 0), rot_z=math.pi / 2)
    wall_with_openings("L_wallRight", D, Hh, 0.15, wall_t, [(0.8, 0, 1.1, 2.2)], loc=(W / 2 + 0.075, 0, 0), rot_z=math.pi / 2)
    R["doorglow"] = plane("L_poolglow", (1.1, 2.2), (W / 2 + 0.6, 0.8, 1.1), (math.pi / 2, 0, math.pi / 2),
                          emission((0.25, 0.75, 1.0), 2.0, name="PoolGlow"))
    lockm = plastic((0.15, 0.35, 0.7), 0.35, name="LockerBlue")
    vent = plastic((0.05, 0.1, 0.2), 0.5, name="LockerVent")
    for i in range(9):
        x = -2.6 + i * 0.52
        box(f"L_locker{i}", (0.5, 0.5, 1.9), (x, D / 2 - 0.26, 0.95), lockm, 0.01)
        for k in range(4):
            box(f"L_vent{i}{k}", (0.3, 0.02, 0.025), (x, D / 2 - 0.52, 1.7 - k * 0.06), vent, 0.0)
        box(f"L_handle{i}", (0.03, 0.03, 0.12), (x + 0.17, D / 2 - 0.53, 1.0), metal(name="Metal"), 0.008)
        text(f"L_num{i}", str(i + 1), (x, D / 2 - 0.52, 1.3), 0.08, plastic((0.95, 0.95, 0.95), name="LabelWhite"), extrude=0.002)
    wood = wood_mat = __import__("core").wood((0.62, 0.42, 0.24), planks=False, scale=3.0, name="WoodLight")
    box("L_bench", (2.6, 0.45, 0.06), (-0.3, 0.6, 0.45), wood, 0.01)
    for dx in (-1.1, 1.1):
        box(f"L_benchleg{dx}", (0.06, 0.4, 0.42), (-0.3 + dx, 0.6, 0.21), metal((0.5, 0.5, 0.52), 0.3, name="BenchLeg"), 0.005)
    box("L_towel", (0.5, 0.35, 0.05), (0.7, 0.62, 0.5), fabric((0.95, 0.75, 0.2), 60.0, name="TowelYellow"), 0.02)
    box("L_bag", (0.35, 0.25, 0.45), (-1.4, 0.95, 0.22), fabric((0.8, 0.25, 0.2), 40.0, name="Backpack"), 0.06)
    R["lights"] = []
    for i, x in enumerate((-2.0, 0.0, 2.0)):
        pm = emission((1.0, 0.97, 0.9), 5.0, name=f"LPanel{i}")
        box(f"L_panel{i}", (1.2, 0.4, 0.04), (x, 0.3, Hh - 0.03), pm, 0.0)
        lt = light(f"L_light{i}", "AREA", (x, 0.3, Hh - 0.1), 120.0, (1.0, 0.95, 0.85), 1.2)
        R["lights"].append((lt, pm))
    light("L_glowlight", "AREA", (W / 2 - 0.2, 0.8, 1.2), 90.0, (0.3, 0.8, 1.0), 1.0, rot=(0, math.radians(-90), 0))
    world_color(bpy.context.scene, (0.02, 0.025, 0.04), 1.0)
    return R


def bathroom():
    R = {}
    W, D, Hh = 3.2, 3.0, 2.6
    plane("B_floor", (W, D), (0, 0, 0), mat=tiles((0.85, 0.85, 0.85), (0.3, 0.3, 0.3), 0.25, name="BathFloor", rough=0.3, var=0.5))
    wt = tiles((0.62, 0.85, 0.8), (0.9, 0.95, 0.93), 0.13, name="MintTiles", rough=0.12)
    plane("B_ceiling", (W, D), (0, 0, Hh), (math.pi, 0, 0), plastic((0.9, 0.9, 0.88), 0.8, name="CeilingB"))
    wall_with_openings("B_wallBack", W, Hh, 0.15, wt, [], loc=(0, D / 2 + 0.075, 0))
    wall_with_openings("B_wallLeft", D, Hh, 0.15, wt, [], loc=(-W / 2 - 0.075, 0, 0), rot_z=math.pi / 2)
    wall_with_openings("B_wallRight", D, Hh, 0.15, wt, [], loc=(W / 2 + 0.075, 0, 0), rot_z=math.pi / 2)
    wall_with_openings("B_wallFront", W, Hh, 0.15, wt, [], loc=(0, -D / 2 - 0.075, 0))
    tub_m = plastic((0.97, 0.97, 0.97), 0.12, name="Porcelain")
    tub = box("B_tub", (1.7, 0.8, 0.55), (-0.6, D / 2 - 0.42, 0.275), tub_m, 0.06)
    cut = box("B_tubcut", (1.5, 0.6, 0.6), (-0.6, D / 2 - 0.42, 0.6), None, 0.0)
    bo = tub.modifiers.new("Hollow", "BOOLEAN"); bo.object = cut; bo.operation = "DIFFERENCE"
    tub.modifiers.move(len(tub.modifiers) - 1, 0)
    cut.hide_render = True; cut.hide_viewport = True
    R["water"] = water_plane("B_water", (1.5, 0.6), (-0.6, D / 2 - 0.42, 0.4), water((0.8, 0.95, 1.0), name="BathWater"), cuts=(40, 20))
    box("B_faucet", (0.06, 0.2, 0.06), (-1.3, D / 2 - 0.15, 0.7), metal(name="Chrome2"), 0.02)
    # canard
    duck = empty("B_duck")
    ym = plastic((1.0, 0.85, 0.1), 0.3, name="DuckYellow")
    sphere("B_duckbody", 0.06, (0, 0, 0), ym, (1.3, 1, 0.8), parent=duck)
    sphere("B_duckhead", 0.04, (-0.05, 0, 0.06), ym, parent=duck)
    cone("B_duckbeak", 0.018, 0.04, (-0.1, 0, 0.055), plastic((1, 0.45, 0.05), 0.3, name="Beak"), rot=(0, -math.pi / 2, 0), parent=duck)
    duck.location = (-0.05, D / 2 - 0.42, 0.55)
    R["duck"] = duck
    box("B_mirror", (0.7, 0.03, 0.9), (0.9, D / 2 - 0.01, 1.5), metal((0.9, 0.92, 0.95), 0.02, name="Mirror"), 0.01)
    box("B_sink", (0.6, 0.45, 0.15), (0.9, D / 2 - 0.25, 0.85), tub_m, 0.04)
    box("B_towel", (0.08, 0.5, 0.7), (W / 2 - 0.06, 0.2, 1.2), fabric((0.9, 0.35, 0.35), 60.0, name="TowelRed"), 0.03)
    sign("B_sign", "SPONGE ONLY", (-0.6, D / 2 - 0.0, 1.35), 0, 1.0, 0.25, (0.95, 0.95, 0.9), (0.1, 0.4, 0.7), 0.13)
    light("B_light", "AREA", (0, 0, Hh - 0.1), 200.0, (1.0, 0.9, 0.75), 1.5)
    light("B_fill", "AREA", (0, -1.2, 1.6), 50.0, (0.8, 0.9, 1.0), 1.5, rot=(math.radians(80), 0, 0))
    world_color(bpy.context.scene, (0.3, 0.3, 0.3), 0.5)
    return R


def tree(name, loc, s=1.0, seed=0):
    rnd = random.Random(seed)
    root = empty(name)
    box(name + "_trunk", (0.35 * s, 0.35 * s, 2.2 * s), (0, 0, 1.1 * s), plastic((0.35, 0.22, 0.12), 0.8, name="Bark"), 0.03, parent=root)
    leaf = fabric((0.2, 0.5, 0.15), 15.0, name="Leaves", color2=(0.12, 0.35, 0.1))
    for k in range(3):
        w = (2.0 - k * 0.5) * s
        box(f"{name}_leaf{k}", (w, w, 0.9 * s), (rnd.uniform(-0.1, 0.1), rnd.uniform(-0.1, 0.1), (2.3 + k * 0.75) * s), leaf, 0.12, parent=root)
    root.location = loc
    return root


def lake():
    """Lac de grand-père : eau miroir, rive, ponton, arbres blocky, collines."""
    R = {}
    world_color(bpy.context.scene, (0.5, 0.7, 1.0), 1.0)
    light("K_sun", "SUN", (0, 0, 10), 2.4, (1.0, 0.93, 0.8), 2.0, rot=(math.radians(55), 0, math.radians(200)))
    sphere("K_sunball", 4.0, (-30, 120, 40), emission((1.0, 0.95, 0.8), 25.0, name="SunM"))
    R["water"] = water_plane("K_water", (40, 40), (0, 20, 0), water((0.15, 0.35, 0.4), name="LakeWater", clear=False, rough=0.04), cuts=(160, 160))
    plane("K_lakebed", (60, 60), (0, 20, -0.6), mat=plastic((0.1, 0.18, 0.15), 0.9, name="LakeBed"))
    sand = fabric((0.75, 0.65, 0.45), 30.0, name="Sand")
    grass = fabric((0.25, 0.55, 0.18), 20.0, name="Grass", color2=(0.18, 0.42, 0.12))
    box("K_shore", (60, 4, 0.4), (0, -2.0, -0.1), sand, 0.15)
    box("K_grass", (60, 20, 0.4), (0, -13.5, 0.05), grass, 0.1)
    for i in range(12):
        rnd = random.Random(i)
        tree(f"K_tree{i}", (rnd.uniform(-20, 20), rnd.uniform(-14, -5), 0.25), rnd.uniform(0.8, 1.3), i)
    for i in range(7):
        rnd = random.Random(40 + i)
        tree(f"K_ftree{i}", (-24 + i * 8 + rnd.uniform(-2, 2), 38 + rnd.uniform(0, 4), 0), rnd.uniform(1.5, 2.2), 40 + i)
    hill = grass
    for i, (x, w, h) in enumerate(((-25, 30, 6), (5, 35, 9), (35, 30, 5))):
        box(f"K_hill{i}", (w, 10, h), (x, 46, h / 2 - 1), hill, 2.5)
    # ponton
    plank = __import__("core").wood((0.5, 0.33, 0.18), planks=False, scale=2.0, name="DockWood")
    for k in range(10):
        box(f"K_plank{k}", (1.4, 0.28, 0.06), (-4.0, 0.3 + k * 0.32, 0.3), plank, 0.01)
    for k in range(3):
        for dx in (-0.6, 0.6):
            box(f"K_post{k}{dx}", (0.12, 0.12, 1.2), (-4.0 + dx, 0.5 + k * 1.3, -0.2), plank, 0.01)
    # cailloux de rive
    stone = plastic((0.5, 0.5, 0.52), 0.6, name="Stone")
    for i in range(15):
        rnd = random.Random(80 + i)
        o = sphere(f"K_rock{i}", rnd.uniform(0.08, 0.25), (rnd.uniform(-6, 6), rnd.uniform(-1.6, -0.3), 0.1), stone,
                   (1.3, 1, 0.6), segs=10)
    return R


def flat_stone(name, loc, rot=(0, 0, 0), s=1.0):
    return sphere(name, 0.05 * s, loc, plastic((0.45, 0.47, 0.5), 0.45, name="FlatStone"), (1.0, 0.8, 0.28), segs=14) if False else \
        _stone(name, loc, rot, s)


def _stone(name, loc, rot, s):
    o = sphere(name, 0.05 * s, loc, plastic((0.42, 0.44, 0.48), 0.4, name="FlatStone"), (1.0, 0.8, 0.28), segs=14)
    o.rotation_euler = rot
    return o


def traffic_cone(name, loc, s=1.0):
    root = empty(name)
    org = plastic((1.0, 0.35, 0.02), 0.4, name="ConeOrange")
    cyl(name + "_body", 0.15 * s, 0.55 * s, (0, 0, 0.3 * s), org, 0.0, r2=0.025 * s, parent=root)
    cyl(name + "_band", 0.105 * s, 0.09 * s, (0, 0, 0.34 * s), plastic((0.97, 0.97, 0.97), 0.3, name="ConeWhite"), 0.0,
        r2=0.085 * s, parent=root)
    box(name + "_base", (0.38 * s, 0.38 * s, 0.04 * s), (0, 0, 0.02 * s), org, 0.01, parent=root)
    root.location = loc
    return root


def puddle(name, loc, sx=1.0, sy=0.7):
    o = cyl(name, 0.5, 0.012, loc, water((0.05, 0.07, 0.1), name="PuddleWater", clear=False, rough=0.02), 0.004, verts=40)
    o.scale = (sx, sy, 1)
    return o


def rainy_street():
    """Rue grise de jour : flaques avec cônes, avaloir d'égout."""
    R = {}
    from sets import street
    street(night=False)
    # ciel couvert
    world_color(bpy.context.scene, (0.55, 0.6, 0.68), 1.4)
    for o in bpy.data.objects:
        if o.name == "S_sun":
            o.data.energy = 1.2
        if o.name == "S_sunball":
            o.hide_render = True
    R["puddles"] = []
    rnd = random.Random(2)
    for i, (x, y) in enumerate(((-3, 4.4), (-0.5, 4.6), (2.2, 4.35), (4.8, 4.6), (7.5, 4.5), (-6, 4.5), (1.0, 1.8), (-2.2, -1.5))):
        R["puddles"].append(puddle(f"S_puddle{i}", (x, y, 0.125 if abs(y) > 3.6 else 0.006), rnd.uniform(0.7, 1.1), rnd.uniform(0.5, 0.7)))
        traffic_cone(f"S_cone{i}", (x + 0.25, y + 0.05, 0.13 if abs(y) > 3.6 else 0.0))
    # avaloir dans la bordure
    gx = 0.0
    R["drain_water"] = plane("S_drainwater", (1.0, 0.5), (gx, 3.3, -0.25), mat=water((0.03, 0.05, 0.06), name="DrainWater", clear=False))
    box("S_drainpit", (1.1, 0.6, 0.02), (gx, 3.3, -0.5), plastic((0.02, 0.02, 0.02), name="Black2"), 0.0)
    for k in range(9):
        box(f"S_grate{k}", (0.04, 0.55, 0.05), (gx - 0.48 + k * 0.12, 3.3, 0.0), metal((0.2, 0.2, 0.22), 0.5, name="Iron"), 0.005)
    for k in range(2):
        box(f"S_gratef{k}", (1.04, 0.05, 0.05), (gx, 3.05 + k * 0.5, 0.0), metal((0.2, 0.2, 0.22), 0.5, name="Iron"), 0.005)
    return R


def pool_exterior():
    """Façade de la piscine la nuit : brique, enseigne TOWN POOL, porte, lampadaire."""
    R = {}
    sky_night(R)
    br = brick((0.5, 0.2, 0.12), (0.6, 0.57, 0.52), 3.0, name="Brick")
    box("X_facade", (14, 0.4, 6), (0, 3.0, 3), br, 0.0)
    plane("X_ground", (40, 30), (0, -5, 0), mat=fabric((0.08, 0.08, 0.09), 30.0, name="Asphalt"))
    plane("X_walk", (40, 3), (0, 1.3, 0.01), mat=plastic((0.45, 0.45, 0.43), 0.85, name="Sidewalk"))
    sign("X_sign", "TOWN POOL", (0, 2.75, 4.2), 0, 4.0, 0.9, (0.08, 0.2, 0.5), (0.4, 0.9, 1.0), 0.6, glow=2.0)
    door_m = plastic((0.45, 0.48, 0.5), 0.35, name="DoorMetal")
    hinge = empty("X_doorhinge", (1.0, 2.78, 0))
    box("X_door", (1.0, 0.08, 2.2), (0.5, 2.78, 1.1), door_m, 0.02, parent=hinge)
    box("X_door2", (1.0, 0.08, 2.2), (-0.5, 2.78, 1.1), door_m, 0.02)
    R["door_hinge"] = hinge
    plane("X_doorinside", (2.0, 2.2), (0, 2.9, 1.1), (math.pi / 2, 0, 0), emission((0.2, 0.7, 1.0), 2.0, name="PoolGlow"))
    sign("X_exitsign", "EXIT", (0, 2.72, 2.5), 0, 0.8, 0.28, (0.02, 0.35, 0.08), (0.6, 1.0, 0.6), 0.18, glow=3.0)
    for x in (-4.5, 4.5):
        box(f"X_win{x}", (2.0, 0.1, 1.2), (x, 2.78, 3.6), emission((0.2, 0.6, 0.9), 1.5, name="PoolWinGlow"), 0.0)
    street_lamp("X_lamp", (-3.0, 0.5, 0), 250.0)
    light("X_fill", "AREA", (0, -6, 4), 150.0, (0.4, 0.5, 1.0), 6.0, rot=(math.radians(70), 0, 0))
    for i in range(2):
        puddle(f"X_puddle{i}", (2.5 + i * 1.8, -0.6 - i * 0.7, 0.01), 0.9, 0.6)
    return R
