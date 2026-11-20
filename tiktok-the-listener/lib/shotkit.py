"""Aides pour construire un plan : timing (0,5 s de marge avant/après), caméra, persos, Zzz,
marche, hoquet, lancer, ricochets."""
import bpy, math, random
from mathutils import Vector
from core import *
from chars import *

MARGIN = 15  # 0,5 s avant / après la phrase


class Timing:
    def __init__(self, words):
        self.core = max(30, round(0.4 * words * FPS))
        self.a = 1 + MARGIN            # début de la phrase
        self.b = self.a + self.core    # fin de la phrase
        self.f0 = 1
        self.f1 = self.b + MARGIN

    def at(self, t):
        """t ∈ [0,1] dans la phrase → numéro d'image."""
        return int(round(self.a + t * self.core))


def shot_camera(sc, T, p0, p1, t0, t1=None, lens=35, fstop=2.2, shift=-0.1, handheld=0.004, focus=None, seed=1,
                fill=0.0, fill_color=(0.55, 0.8, 1.0)):
    """Caméra avec push-in/dolly lent ease in-out sur tout le plan (marges comprises).
    fill > 0 : lumière douce accrochée à la caméra (éclaire les visages dans les plans de nuit)."""
    co, tg = camera(sc, lens, fstop)
    if fill:
        fl = light("CamFill", "AREA", (0, 0, 0), fill, fill_color, 1.2)
        fl.parent = co
        fl.location = (0.35, 0.45, 0.0)
    co.data.shift_y = shift
    cam_move(co, tg, T.f0, T.f1, p0, p1, t0, t1, handheld=handheld, seed=seed)
    if focus is not None:
        if isinstance(focus, (int, float)):
            co.data.dof.focus_object = None
            co.data.dof.focus_distance = focus
        else:
            co.data.dof.focus_object = focus
    return co, tg


def zzz(loc, f0, f1, s=0.12):
    """Trois « Z » blancs qui montent et grossissent en boucle."""
    mat = emission((1, 1, 1), 2.5, name="ZzzWhite")
    period = 45
    for i in range(3):
        z = text(f"Zzz{i}", "Z", loc, s * (0.7 + 0.3 * i), mat, extrude=0.015)
        f = f0 + i * 15 - period
        while f < f1 + period:
            p0 = Vector(loc) + Vector((0.02 * i, 0, 0))
            p1 = Vector(loc) + Vector((0.12, 0, 0.32))
            key(z, "location", f, p0, "LINEAR")
            key(z, "scale", f, (0.01, 0.01, 0.01), "EASE")
            key(z, "scale", f + 10, (1, 1, 1), "EASE")
            key(z, "scale", f + period - 6, (1, 1, 1), "EASE")
            key(z, "scale", f + period - 1, (0.01, 0.01, 0.01), "EASE")
            key(z, "location", f + period - 1, p1, "LINEAR")
            f += period


def aim(ch, bone, target, influence=1.0):
    """L'os pointe vers une cible (DAMPED_TRACK)."""
    c = ch.pb(bone).constraints.new("DAMPED_TRACK")
    c.target = target
    c.track_axis = "TRACK_Y"
    c.influence = influence
    return c


def walk(ch, f0, f1, p0, p1, period=24, swing=28, arm_swing=22, bob=0.03, tiptoe=False):
    """Cycle de marche : jambes/bras alternés, petit rebond. tiptoe = pas de loup, bras écartés."""
    move(ch.arm, "location", f0, f1, Vector(p0), Vector(p1), "LINEAR", "LINEAR")
    f, i = f0, 0
    while f <= f1:
        sgn = 1 if i % 2 == 0 else -1
        ch.rot("leg.L", f, (swing * sgn, 0, 0))
        ch.rot("leg.R", f, (-swing * sgn, 0, 0))
        if tiptoe:
            ch.rot("arm.L", f, (-10, 0, 55 + 6 * sgn))
            ch.rot("arm.R", f, (-10, 0, -55 + 6 * sgn))
        else:
            ch.rot("arm.L", f, (-arm_swing * sgn, 0, 0))
            ch.rot("arm.R", f, (arm_swing * sgn, 0, 0))
        key(ch.pb("root"), "location", f, (0, 0, 0))
        key(ch.pb("root"), "location", f + period // 4, (0, 0, bob))
        f += period // 2
        i += 1
    for b in ("leg.L", "leg.R"):
        ch.rot(b, f1 + 6, (0, 0, 0))
    key(ch.pb("root"), "location", f1 + 6, (0, 0, 0))


def hiccup(ch, f, amp=0.06):
    """Sursaut de hoquet : petit saut du torse + épaules qui montent, avec overshoot."""
    pr = ch.pb("root")
    key(pr, "location", f - 1, (0, 0, 0), "EASE")
    key(pr, "location", f + 2, (0, 0, amp), "BACK")
    key(pr, "location", f + 9, (0, 0, 0), "EASE")
    for b, z in (("arm.L", 12), ("arm.R", -12)):
        ch.rot(b, f - 1, (0, 0, 0))
        ch.rot(b, f + 2, (0, 0, z), "BACK")
        ch.rot(b, f + 10, (0, 0, 0))
    ch.rot("head", f - 1, (0, 0, 0))
    ch.rot("head", f + 2, (-10, 0, 0), "BACK")
    ch.rot("head", f + 10, (0, 0, 0))


# ---------------------------------------------------------------- persos de l'histoire
def leo(expr="neutral", exprB=None, outfit="hoodie", **kw):
    trunks = plastic((0.1, 0.3, 0.85), 0.4, name="Trunks")
    if outfit == "trunks":
        top = plastic(SKIN, 0.45, name="BareSkin")
        ch = make_char("Leo", shirt=top, pants=trunks, hair="messy", hair_color=(0.12, 0.07, 0.04), exprA=expr, exprB=exprB,
                       buttons=False, **kw)
    else:
        hood = fabric((0.95, 0.45, 0.1), 70.0, name="HoodieOrange", color2=(0.8, 0.33, 0.05))
        ch = make_char("Leo", shirt=hood, pants=plastic((0.15, 0.2, 0.4), 0.6, name="JeansLeo"), hair="messy",
                       hair_color=(0.12, 0.07, 0.04), exprA=expr, exprB=exprB, buttons=False, **kw)
        # poche kangourou
        p = box("Leo_pocket", (0.42, 0.03, 0.16), (0, -0.16, 2.4 * S), fabric((0.85, 0.38, 0.06), 70.0, name="PocketOrange"), 0.02)
        p.location = ch.arm.matrix_world @ p.location
        bone_parent(p, ch.arm, "torso")
        ch.parts["pocket"] = p
    return ch


def grandpa(expr="happy", **kw):
    knit = fabric((0.45, 0.3, 0.55), 45.0, knit=True, name="Cardigan", color2=(0.3, 0.2, 0.38))
    def acc(arm, head):
        glasses(arm, head); mustache(arm, head)
    return make_char("Grandpa", skin=(0.95, 0.76, 0.62), shirt=knit, pants=plastic((0.35, 0.3, 0.22), 0.7, name="Khaki"),
                     hair="grandpa", hair_color=(0.92, 0.92, 0.9), exprA=expr, buttons=True, extra=acc, **kw)


def kid(name, color, hair="short", hair_color=(0.1, 0.06, 0.03), skin=SKIN, expr="neutral", **kw):
    return make_char(name, skin=skin, shirt=plastic(skin, 0.45, name="Bare" + name), pants=plastic(color, 0.4, name="Trunks" + name),
                     hair=hair, hair_color=hair_color, exprA=expr, buttons=False, **kw)


def coach(expr="sweat", **kw):
    return make_char("Coach", skin=(0.62, 0.42, 0.3), shirt=plastic((0.9, 0.12, 0.12), 0.45, name="CoachRed"),
                     pants=plastic((0.12, 0.12, 0.15), 0.5, name="CoachPants"), hair="short", hair_color=(0.05, 0.03, 0.02),
                     exprA=expr, buttons=False, **kw)


# ---------------------------------------------------------------- ricochets
def skip_stone(water_obj, start, direction, f0, n=7, first=2.2, decay=0.78, height=0.5, frames=10, water_z=0.0, seed=0,
               ripple_speed=0.22, splash_power=0.55):
    """Un galet qui ricoche n fois : rides (Wave) + gouttes à chaque rebond. Renvoie le galet et la liste (frame, point)."""
    st = sphere("SkipStone", 0.05, start, plastic((0.42, 0.44, 0.48), 0.4, name="FlatStone"), (1.0, 0.8, 0.28), segs=14)
    d = Vector(direction).normalized()
    p = Vector(start)
    f = f0
    hops = []
    dist = first
    h = height
    fr = frames
    key(st, "location", f, p, "LINEAR")
    for i in range(n):
        land = Vector((p.x + d.x * dist, p.y + d.y * dist, water_z))
        mid = (p + land) / 2
        mid.z = max(p.z, water_z) + h
        key(st, "location", f + fr // 2, mid, "EASE")
        key(st, "location", f + fr, land, "LINEAR")
        f += fr
        hops.append((f, land.copy()))
        ripple(water_obj, land, f, speed=ripple_speed, height=0.03, width=0.3, damp=50, name=f"Hop{i}")
        splash_burst(f"Hop{i}_drop", (land.x, land.y, water_z), f, n=7, power=splash_power * (decay ** i), seed=seed + i)
        p = land
        dist *= decay
        h *= decay
        fr = max(5, int(fr * 0.85))
    # coule
    key(st, "location", f + 6, (p.x + d.x * 0.3, p.y + d.y * 0.3, water_z - 0.4), "EASE")
    key(st, "scale", f + 6, (1, 1, 1), "CONSTANT")
    key(st, "scale", f + 7, (0, 0, 0), "CONSTANT")
    st.rotation_euler = (0, 0, math.atan2(d.y, d.x))
    return st, hops


def drips(name, points, f0, f1, every=14, fall=1.2, seed=0):
    """Gouttes qui tombent régulièrement depuis des points (monstre qui ruisselle)."""
    rnd = random.Random(seed)
    m = emission((0.85, 0.95, 1.0), 0.8, name="Drip")
    for j, pt in enumerate(points):
        f = f0 + rnd.randint(0, every)
        k = 0
        while f < f1:
            d = sphere(f"{name}{j}_{k}", 0.012, pt, m, (0.8, 0.8, 1.4), segs=8)
            key(d, "scale", f - 1, (0, 0, 0), "CONSTANT")
            key(d, "scale", f, (1, 1, 1), "CONSTANT")
            key(d, "location", f, pt, "LINEAR")
            p2 = (pt[0], pt[1], pt[2] - fall)
            key(d, "location", f + 12, p2, "LINEAR")
            for fc in []:
                pass
            key(d, "scale", f + 12, (0, 0, 0), "CONSTANT")
            f += every + rnd.randint(-4, 6)
            k += 1
