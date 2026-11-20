"""Décors modulaires : murs, portes, fenêtres, lits, tables, lampes, maisons, rue.
Chaque fonction construit son module et renvoie un dict des objets utiles aux plans."""
import bpy, math, random
from mathutils import Vector
from core import *

H = 2.7  # hauteur sous plafond


# ---------------------------------------------------------------- matériaux de décor
def M():
    return dict(
        floor=wood((0.45, 0.24, 0.11), name="WoodFloor"),
        wood_dark=wood((0.22, 0.11, 0.05), planks=False, scale=3.0, name="WoodDark"),
        wood_light=wood((0.62, 0.42, 0.24), planks=False, scale=3.0, name="WoodLight"),
        white=plastic((0.85, 0.85, 0.82), 0.5, name="PaintWhite"),
        trim=plastic((0.92, 0.92, 0.9), 0.35, name="Trim"),
        ceiling=plastic((0.75, 0.72, 0.68), 0.9, name="Ceiling"),
        spoon=metal((0.92, 0.92, 0.95), 0.12, name="Silver"),
        gold=metal((1.0, 0.75, 0.3), 0.25, name="Gold"),
        black=plastic((0.03, 0.03, 0.035), 0.4, name="Black"),
    )


# ---------------------------------------------------------------- modules
def wall_with_openings(name, length, height, thickness, mat, openings=(), base=None, axis="X",
                       loc=(0, 0, 0), rot_z=0.0, trim=None):
    """Mur le long de X (centré en loc), percé d'ouvertures (x_center, z_bottom, w, h)."""
    root = empty(name)
    segs = []
    xs = sorted(openings, key=lambda o: o[0])
    cur = -length / 2
    for (ox, oz, ow, oh) in xs:
        if ox - ow / 2 > cur:
            w = ox - ow / 2 - cur
            segs.append(box(f"{name}_s{len(segs)}", (w, thickness, height), (cur + w / 2, 0, height / 2), mat, 0.0, parent=root))
        if oz > 0:
            segs.append(box(f"{name}_b{len(segs)}", (ow, thickness, oz), (ox, 0, oz / 2), mat, 0.0, parent=root))
        top = oz + oh
        if top < height:
            segs.append(box(f"{name}_t{len(segs)}", (ow, thickness, height - top), (ox, 0, top + (height - top) / 2), mat, 0.0, parent=root))
        cur = ox + ow / 2
    if cur < length / 2:
        w = length / 2 - cur
        segs.append(box(f"{name}_s{len(segs)}", (w, thickness, height), (cur + w / 2, 0, height / 2), mat, 0.0, parent=root))
    if base:
        # plinthe + soubassement bois
        box(f"{name}_base", (length, thickness + 0.04, 0.12), (0, 0, 0.06), base, 0.008, parent=root)
    if trim:
        box(f"{name}_crown", (length, thickness + 0.05, 0.06), (0, 0, height - 0.03), trim, 0.008, parent=root)
    root.location = loc
    root.rotation_euler = (0, 0, rot_z)
    return root


def window(name, w, h, loc, rot_z=0.0, frame_mat=None, openable=False, glass_mat=None):
    """Fenêtre à deux battants (charnières sur les côtés si openable)."""
    fm = frame_mat or plastic((0.95, 0.95, 0.93), 0.35, name="WinFrame")
    root = empty(name)
    t = 0.07
    box(name + "_top", (w + 0.16, 0.16, 0.1), (0, 0, h + 0.05), fm, 0.01, parent=root)
    box(name + "_sill", (w + 0.24, 0.24, 0.07), (0, -0.04, -0.035), fm, 0.01, parent=root)
    box(name + "_l", (0.08, 0.16, h), (-w / 2 - 0.04, 0, h / 2), fm, 0.01, parent=root)
    box(name + "_r", (0.08, 0.16, h), (w / 2 + 0.04, 0, h / 2), fm, 0.01, parent=root)
    sashes = []
    gm = glass_mat or glass()
    for i, sx in enumerate((-1, 1)):
        hinge = empty(f"{name}_hinge{i}", (sx * w / 2, -0.03, 0), root)
        sw = w / 2
        cx = -sx * sw / 2
        for nm, sz, lc in (("t", (sw, t, 0.05), (cx, 0, h - 0.025)), ("b", (sw, t, 0.05), (cx, 0, 0.025)),
                           ("o", (0.05, t, h), (sx * -0.025, 0, h / 2)), ("i", (0.05, t, h), (-sx * (sw - 0.025), 0, h / 2)),
                           ("m", (sw, t, 0.04), (cx, 0, h / 2))):
            box(f"{name}_sash{i}{nm}", sz, (sx * w / 2 + lc[0], -0.03, lc[2]), fm, 0.006, parent=hinge)
        g = plane(f"{name}_glass{i}", (sw - 0.08, h - 0.08), (sx * w / 2 + cx, -0.03, h / 2), (math.pi / 2, 0, 0), gm, parent=hinge)
        sashes.append((hinge, g))
    root.location = loc
    root.rotation_euler = (0, 0, rot_z)
    return dict(root=root, sashes=sashes)






def lamp(name, loc, color=(1.0, 0.72, 0.4), energy=25.0, shade=(0.95, 0.85, 0.65), parent=None):
    m = M()
    root = empty(name)
    cyl(name + "_base", 0.08, 0.03, (0, 0, 0.015), m["wood_dark"], 0.005, parent=root)
    cyl(name + "_pole", 0.012, 0.3, (0, 0, 0.17), m["gold"], parent=root)
    cyl(name + "_shade", 0.13, 0.18, (0, 0, 0.36), emission(shade, 1.6, name="LampShade"), r2=0.09, parent=root)
    lt = light(name + "_light", "POINT", (0, 0, 0.36), energy, color, 0.08)
    set_parent(lt, root)
    root.location = loc
    return dict(root=root, light=lt)





def night_backdrop(loc, rot_z=0.0, w=30.0, moon=True, day=False):
    """Ciel + lune + sol + silhouettes de maisons voisines, à placer derrière une fenêtre."""
    root = empty("Backdrop")
    if day:
        sky = plane("Sky", (w, 14), (0, 8, 5), (math.pi / 2, 0, 0), emission((0.45, 0.65, 1.0), 2.5, name="SkyDay"), parent=root)
    else:
        sky = plane("Sky", (w, 14), (0, 8, 5), (math.pi / 2, 0, 0), emission((0.03, 0.06, 0.2), 1.5, name="SkyNight"), parent=root)
        if moon:
            sphere("Moon", 0.9, (2.2, 7.5, 6.0), emission((0.85, 0.9, 1.0), 6.0, name="MoonM"), parent=root)
        rnd = random.Random(3)
        star = emission((1, 1, 1), 8.0, name="Star")
        for i in range(40):
            sphere(f"Star{i}", 0.025, (rnd.uniform(-w / 2, w / 2), 7.8, rnd.uniform(3, 11)), star, parent=root, segs=6)
    gm = snow() if day else fabric((0.08, 0.16, 0.08), 20.0, name="NightGrass")
    plane("Ground", (w, 12), (0, 3, -0.02), mat=gm, parent=root)
    # maisons voisines
    for i, (x, col) in enumerate(((-5, (0.45, 0.5, 0.65)), (1.5, (0.6, 0.35, 0.3)), (7, (0.55, 0.55, 0.45)))):
        house(f"BgHouse{i}", (x, 6.0, 0), 0, col, lit=not day, small=True, parent=root)
    root.location = loc
    root.rotation_euler = (0, 0, rot_z)
    return root


def house(name, loc, rot_z, color, lit=True, small=False, parent=None, mat=None, porch=True):
    """Maison de banlieue : murs (bardage/brique), toit à 2 pans, fenêtres éclairées, porte, perron."""
    m = M()
    root = empty(name)
    W, D, Hh = (4.5, 4.0, 2.9) if small else (7.0, 6.0, 3.0)
    wm = mat or siding(color, name=name + "_siding")
    box(name + "_walls", (W, D, Hh * 2 if not small else Hh), (0, 0, (Hh * 2 if not small else Hh) / 2), wm, 0.02, parent=root)
    top = Hh * 2 if not small else Hh
    # toit (prisme)
    roof_m = plastic((0.18, 0.13, 0.12), 0.8, name="Roof")
    rh = W * 0.32
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=1, depth=1, location=(0, 0, 0))
    rf = bpy.context.active_object
    bpy.ops.object.delete()
    verts = [(-W / 2 - 0.3, -D / 2 - 0.3, top), (W / 2 + 0.3, -D / 2 - 0.3, top), (0, -D / 2 - 0.3, top + rh),
             (-W / 2 - 0.3, D / 2 + 0.3, top), (W / 2 + 0.3, D / 2 + 0.3, top), (0, D / 2 + 0.3, top + rh)]
    faces = [(0, 1, 2), (3, 5, 4), (0, 2, 5, 3), (1, 4, 5, 2), (0, 3, 4, 1)]
    me = bpy.data.meshes.new(name + "_roof")
    me.from_pydata(verts, [], faces)
    me.materials.append(roof_m)
    ro = bpy.data.objects.new(name + "_roof", me)
    link(ro)
    sol = ro.modifiers.new("Solid", "SOLIDIFY"); sol.thickness = 0.12
    set_parent(ro, root)
    gable = siding(color, name=name + "_siding")
    winm = emission((1.0, 0.72, 0.38), 3.5, name="WinLit") if lit else plastic((0.05, 0.07, 0.12), 0.1, name="WinDark")
    rows = [1.6] if small else [1.5, 4.4]
    for zi, z in enumerate(rows):
        for xi, x in enumerate((-W / 3, W / 3) if small else (-W / 3, 0, W / 3)):
            if not small and zi == 0 and xi == 1:
                continue
            on = lit and ((xi + zi + len(name)) % 3 != 0)
            wmat = winm if on else plastic((0.04, 0.06, 0.1), 0.1, name="WinDark")
            box(f"{name}_win{zi}{xi}", (0.8, 0.06, 1.0), (x, -D / 2 - 0.01, z), wmat, 0.0, parent=root)
            box(f"{name}_winf{zi}{xi}", (0.95, 0.08, 1.15), (x, -D / 2 + 0.005, z), m["trim"], 0.01, parent=root)
            box(f"{name}_winm{zi}{xi}", (0.05, 0.1, 1.0), (x, -D / 2 - 0.03, z), m["trim"], 0.0, parent=root)
            box(f"{name}_winmh{zi}{xi}", (0.8, 0.1, 0.05), (x, -D / 2 - 0.03, z), m["trim"], 0.0, parent=root)
    if not small:
        box(name + "_door", (1.0, 0.1, 2.1), (0, -D / 2 - 0.02, 1.05), plastic((0.35, 0.08, 0.06), 0.4, name="Door"), 0.02, parent=root)
        box(name + "_doorf", (1.2, 0.12, 2.25), (0, -D / 2 + 0.0, 1.1), m["trim"], 0.01, parent=root)
        sphere(name + "_knob", 0.04, (0.35, -D / 2 - 0.09, 1.05), m["gold"], parent=root)
        if porch:
            box(name + "_porch", (2.4, 1.2, 0.2), (0, -D / 2 - 0.6, 0.1), plastic((0.5, 0.5, 0.5), 0.8, name="Concrete"), 0.02, parent=root)
            plight = light(name + "_porchlight", "POINT", (0.8, -D / 2 - 0.3, 2.4), 30.0 if lit else 0.0, (1.0, 0.75, 0.45), 0.1)
            set_parent(plight, root)
            box(name + "_lampbox", (0.12, 0.12, 0.2), (0.8, -D / 2 - 0.08, 2.4), emission((1, 0.85, 0.6), 6, name="PorchLamp"), 0.01, parent=root)
    root.location = loc
    root.rotation_euler = (0, 0, rot_z)
    if parent:
        set_parent(root, parent)
    return root



def street_lamp(name, loc, energy=200.0):
    m = M()
    root = empty(name)
    cyl(name + "_pole", 0.06, 4.2, (0, 0, 2.1), m["black"], parent=root)
    box(name + "_arm", (0.08, 0.8, 0.08), (0, -0.35, 4.15), m["black"], 0.01, parent=root)
    box(name + "_head", (0.3, 0.45, 0.14), (0, -0.7, 4.05), m["black"], 0.03, parent=root)
    box(name + "_bulb", (0.24, 0.36, 0.03), (0, -0.7, 3.97), emission((1.0, 0.8, 0.5), 15, name="StreetBulb"), 0.01, parent=root)
    lt = light(name + "_light", "SPOT", (0, -0.7, 3.9), energy, (1.0, 0.78, 0.5), 0.15, rot=(0, 0, 0), spot=110)
    set_parent(lt, root)
    root.location = loc
    return root







def street(night=True, snowy=False):
    """Rue de banlieue : route, trottoirs, pelouses, maisons, lampadaires, bonshommes de neige."""
    m = M()
    R = {}
    asphalt = fabric((0.08, 0.08, 0.09), 30.0, name="Asphalt")
    plane("S_road", (60, 7), (0, 0, 0), mat=snow() if snowy else asphalt)
    for sy in (-1, 1):
        box(f"S_curb{sy}", (60, 0.25, 0.15), (0, sy * 3.6, 0.075), plastic((0.55, 0.55, 0.55), 0.8, name="Concrete"), 0.02)
        plane(f"S_walk{sy}", (60, 1.6), (0, sy * 4.5, 0.12), mat=plastic((0.5, 0.5, 0.48), 0.85, name="Sidewalk") if not snowy else snow())
    grass = fabric((0.12, 0.3, 0.08) if not night else (0.06, 0.16, 0.05), 25.0, name="Lawn") if not snowy else snow()
    plane("S_lawnN", (60, 12), (0, 11.3, 0.11), mat=grass)
    plane("S_lawnS", (60, 12), (0, -11.3, 0.11), mat=grass)
    if not snowy:
        for i in range(14):
            box(f"S_lane{i}", (1.6, 0.12, 0.004), (-28 + i * 4.2, 0, 0.002), plastic((0.9, 0.8, 0.2), 0.6, name="Paint"), 0.0)
    cols = [(0.55, 0.62, 0.78), (0.82, 0.78, 0.62), (0.6, 0.72, 0.6), (0.85, 0.7, 0.62), (0.7, 0.68, 0.8)]
    R["houses"] = []
    for i, x in enumerate((-18, -9, 0, 9, 18)):
        mat = brick() if i % 2 == 0 else None
        R["houses"].append(house(f"S_houseN{i}", (x, 11, 0.1), 0, cols[i], lit=night, mat=mat))
        house(f"S_houseS{i}", (x + 4, -11, 0.1), math.pi, cols[(i + 2) % 5], lit=night)
    for i, x in enumerate((-13.5, -4.5, 4.5, 13.5)):
        street_lamp(f"S_lamp{i}", (x, 4.0, 0.12), 180.0 if night else 0.0)
    if night:
        sky_night(R)
    else:
        sky_day(R)
    return R


def sky_night(R):
    sc = bpy.context.scene
    world_color(sc, (0.015, 0.03, 0.09), 1.0)
    moon = sphere("S_moon", 3.0, (-10, 60, 28), emission((0.9, 0.93, 1.0), 8.0, name="MoonM"))
    sun = light("S_moonlight", "SUN", (0, 0, 10), 0.35, (0.55, 0.68, 1.0), 2.0, rot=(math.radians(50), 0, math.radians(200)))
    rnd = random.Random(5)
    star = emission((1, 1, 1), 10.0, name="Star")
    for i in range(70):
        sphere(f"S_star{i}", 0.12, (rnd.uniform(-60, 60), 80, rnd.uniform(10, 50)), star, segs=6)
    # brume de fond (plan dégradé, volumétrie bon marché)
    haze = plane("S_haze", (140, 14), (0, 40, 5), (math.pi / 2, 0, 0), emission((0.12, 0.18, 0.4), 0.5, name="Haze"))
    R["moon"] = moon


def sky_day(R):
    sc = bpy.context.scene
    world_color(sc, (0.45, 0.65, 1.0), 1.2)
    light("S_sun", "SUN", (0, 0, 10), 4.0, (1.0, 0.95, 0.85), 1.5, rot=(math.radians(40), 0, math.radians(160)))
    sphere("S_sunball", 4.0, (30, 90, 40), emission((1.0, 0.95, 0.8), 30.0, name="SunM"))


