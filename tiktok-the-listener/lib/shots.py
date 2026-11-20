"""Les 35 plans de « The Listener ». Un plan = une phrase du script.
Chaque fonction construit la scène complète (décor + persos + animation + caméra)."""
import bpy, math
from mathutils import Vector
from core import *
from chars import *
from sets_pool import *
from shotkit import *

SC = lambda: bpy.context.scene
R_ = math.radians


def listener_at(loc, yaw=0.0, idle=True, T=None):
    L = make_listener(loc=loc, yaw=yaw)
    if idle and T:
        wobble(L.pb("torso"), "rotation_euler", T.f0, T.f1, R_(10), R_(2.5), 3.2, index=0)
        wobble(L.pb("head"), "rotation_euler", T.f0, T.f1, 0, R_(4), 2.4, index=2, phase=1.0)
        wobble(L.pb("arm.L"), "rotation_euler", T.f0, T.f1, R_(-6), R_(4), 2.8, index=0)
        wobble(L.pb("arm.R"), "rotation_euler", T.f0, T.f1, R_(-6), R_(4), 3.1, index=0, phase=2)
    return L


def hand_world(ch, side="R"):
    """Position monde approximative du bout du bras au repos."""
    b = ch.arm.pose.bones["arm." + side]
    return ch.arm.matrix_world @ b.tail


# ======================================================================= plans
def s01(T):
    R = pool_hall(night=False)
    leo_ = leo("neutral", "sweat", outfit="trunks", loc=(4.45, -6.0, 0), yaw=-90)
    leo_.idle(T.f0, T.f1, seed=1)
    # orteil au-dessus de l'eau… puis recule
    leo_.rot("leg.L", T.f0, (0, 0, 0))
    leo_.rot("leg.L", T.at(0.25), (-32, 0, 0), "BACK")
    leo_.rot("leg.L", T.at(0.7), (-32, 0, 0))
    leo_.rot("leg.L", T.at(0.85), (0, 0, 0), "BACK")
    leo_.set_expr(T.at(0.55), 1.0)
    shot_camera(SC(), T, (1.2, -7.6, 0.18), (1.7, -7.1, 0.2), (4.4, -5.9, 0.85), lens=24, fstop=3.2)


def s02(T):
    R = rainy_street()
    skin = plastic((0.86, 0.88, 0.9), 0.22, name="ListenerPale")
    # longs doigts pâles qui sortent lentement entre les barreaux de l'avaloir
    hand = empty("PaleHand")
    for i, x in enumerate((-0.18, -0.06, 0.06, 0.18)):
        f = box(f"PaleFinger{i}", (0.045, 0.045, 0.6 + 0.08 * (i % 2)), (x, 3.3, -0.05), skin, 0.018, parent=hand)
        f.rotation_euler = (0.15 * (i - 1.5), 0.1, 0)
        wobble(f, "rotation_euler", T.f0, T.f1, 0.0, 0.12, 1.4 + 0.2 * i, index=1, phase=i)
    move(hand, "location", T.at(0.05), T.at(0.8), Vector((0, 0, -0.55)), Vector((0, 0, 0.12)))
    light("DrainGlow", "POINT", (0, 3.3, -0.2), 4.0, (0.5, 0.8, 1.0), 0.1)
    shot_camera(SC(), T, (0.55, 1.9, 0.32), (0.4, 2.3, 0.28), (0.0, 3.3, 0.05), lens=30, fstop=2.8, shift=-0.08)


def s03(T):
    R = pool_hall(night=True)
    L = make_listener(loc=(0, 8.7, -2.95), yaw=180)
    L.arm.rotation_euler = (R_(-90), 0, R_(180))
    wobble(L.arm, "location", T.f0, T.f1, -2.95, 0.03, 3.0, index=2)
    shot_camera(SC(), T, (0.7, 5.4, 1.7), (0.5, 5.9, 1.35), (0, 7.2, -2.9), lens=28, fstop=4.0, shift=-0.05)


def s04(T):
    R = pool_hall(night=True)
    L = listener_at((0, 7.5, -1.2), 0, T=T)
    hb = L.pb("head")
    for t in (0.3, 0.7):
        key(hb, "scale", T.at(t) - 2, (1, 1, 1), "EASE")
        key(hb, "scale", T.at(t) + 3, (1.07, 1.07, 1.07), "BACK")
        key(hb, "scale", T.at(t) + 12, (1, 1, 1), "EASE")
    drips("Drip", [(0.33, 7.3, 0.05), (-0.33, 7.3, 0.05), (0.0, 7.2, 1.05)], T.f0, T.f1, 16, fall=1.0)
    shot_camera(SC(), T, (0.5, 5.0, 0.18), (0.35, 5.6, 0.2), (0, 7.3, 1.45), (0, 7.3, 1.5), lens=34, fstop=2.4)


def s05(T):
    R = pool_hall(night=False)
    w = R["water"]
    drop = sphere("Drop", 0.03, (-1.0, -2.0, 3.0), emission((0.85, 0.95, 1.0), 1.0, name="Drip"), (0.8, 0.8, 1.3), segs=10)
    f = T.at(0.18)
    key(drop, "location", T.f0, (-1.0, -2.0, 3.6), "LINEAR")
    key(drop, "location", f, (-1.0, -2.0, WL), "LINEAR")
    key(drop, "scale", f, (0.8, 0.8, 1.3), "CONSTANT")
    key(drop, "scale", f + 1, (0, 0, 0), "CONSTANT")
    splash_burst("DropSplash", (-1.0, -2.0, WL), f, n=8, power=0.35)
    for i in range(3):
        ripple(w, (-1.0, -2.0, WL), f + i * 6, speed=0.55, height=0.02, width=0.25, damp=70, name=f"Fast{i}")
    shot_camera(SC(), T, (-1.6, -6.4, 0.22), (-1.4, -5.6, 0.2), (-1.0, -2.0, 0.1), lens=32, fstop=3.0)


def s06(T):
    R = bathroom()
    leo_ = leo("smirk", outfit="trunks", loc=(-0.6, 1.18, -0.3), yaw=0)
    for k in ("legL", "legR"):
        leo_.parts[k].hide_render = True  # jambes dans la baignoire
    leo_.idle(T.f0, T.f1, seed=6)
    sponge = box("Sponge", (0.16, 0.1, 0.09), (0, 0, 0), fabric((1.0, 0.85, 0.2), 40.0, name="SpongeYellow"), 0.03)
    tip = hand_world(leo_, "R")
    sponge.location = (tip.x, tip.y - 0.02, tip.z - 0.02)
    bone_parent(sponge, leo_.arm, "arm.R")
    # tamponne très lentement
    for i, t in enumerate((0.0, 0.25, 0.5, 0.75, 1.0)):
        leo_.rot("arm.R", T.at(t), (-75 + (8 if i % 2 else 0), 0, 25))
    leo_.rot("arm.L", T.f0, (-45, 0, -10))
    shot_camera(SC(), T, (-0.1, -1.25, 1.4), (-0.25, -0.85, 1.3), (-0.6, 1.1, 0.8), lens=26, fstop=3.2)


def s07(T):
    R = rainy_street()
    shot_camera(SC(), T, (-6.4, 3.1, 1.05), (-5.4, 3.2, 0.95), (-1.0, 4.5, 0.1), (0.5, 4.5, 0.1), lens=28, fstop=4.0, shift=-0.05)


def s08(T):
    R = pool_hall(night=False)
    cols = [(0.9, 0.2, 0.2), (0.2, 0.7, 0.3), (0.95, 0.75, 0.1), (0.6, 0.3, 0.8)]
    hairs = [(0.1, 0.06, 0.03), (0.9, 0.75, 0.3), (0.05, 0.03, 0.02), (0.5, 0.25, 0.1)]
    skins = [SKIN, (0.62, 0.42, 0.3), (0.95, 0.76, 0.6), (0.45, 0.3, 0.2)]
    for i, (x, y) in enumerate(((-3, -4.5), (-1, -3.2), (1, -5.0), (3, -3.8))):
        k = kid(f"Kid{i}", cols[i], "long" if i % 2 else "short", hairs[i], skins[i], "sleep" if i == 2 else "neutral",
                loc=(x, y - 1.45, WL + 0.04))
        k.arm.rotation_euler = (R_(-90), 0, 0)
        k.rot("arm.L", T.f0, (0, 0, 40)); k.rot("arm.R", T.f0, (0, 0, -40))
        wobble(k.arm, "location", T.f0, T.f1, WL + 0.04, 0.015, 2.5 + i * 0.3, index=2, phase=i)
        k.idle(T.f0, T.f1, seed=10 + i, breathe=False)
    c = coach("sweat", loc=(-5.0, -3.0, 0), yaw=90)
    c.rot("arm.R", T.f0, (-150, 0, -25))
    c.idle(T.f0, T.f1, seed=3)
    shot_camera(SC(), T, (-6.2, -7.6, 3.4), (-5.6, -6.8, 3.1), (-0.5, -3.8, 0), lens=26, fstop=5.0, shift=-0.05)


def s09(T):
    R = pool_hall(night=True)
    ripple(R["water"], (1.0, 2.0, WL), -40, speed=0.25, height=0.02, damp=25, name="Dying")
    shot_camera(SC(), T, (-2.2, -7.5, 0.1), (-2.0, -5.0, 0.1), (0.5, 6.0, 0.4), lens=26, fstop=4.0)


def s10(T):
    R = pool_hall(night=True)
    n = 7
    for i in range(n):
        y = 8.0 - i * 1.6
        ripple(R["water"], (0.0, y, WL), T.at(0.05 + i * 0.12), speed=0.3, height=0.035, width=0.35, damp=60, name=f"Wake{i}")
    shot_camera(SC(), T, (0.4, -6.8, 0.25), (0.3, -6.0, 0.25), (0, 2.0, 0.0), lens=28, fstop=4.0)


def s11(T):
    R = pool_hall(night=False)
    leo_ = leo("smile", "sweat", outfit="trunks", loc=(5.4, -5.5, 0), yaw=0)
    leo_.idle(T.f0, T.f1, seed=11)
    leo_.rot("arm.L", T.at(0.0), (0, 0, 0))
    leo_.rot("arm.L", T.at(0.12), (0, 0, 150), "BACK")
    for i, t in enumerate((0.22, 0.32, 0.42)):
        leo_.rot("arm.L", T.at(t), (0, 0, 130 if i % 2 == 0 else 160))
    leo_.rot("arm.L", T.at(0.6), (0, 0, 0), "EASE")
    leo_.set_expr(T.at(0.72), 1.0)
    shot_camera(SC(), T, (5.7, -8.0, 1.3), (5.55, -7.3, 1.25), (5.4, -5.5, 1.15), lens=34, fstop=2.4)


def s12(T):
    R = pool_hall(night=False)
    leo_ = leo("hiccup", outfit="trunks", loc=(5.4, -5.5, 0), yaw=0)
    leo_.idle(T.f0, T.f1, seed=12, sway=False)
    for t in (0.1, 0.45, 0.8):
        hiccup(leo_, T.at(t))
    shot_camera(SC(), T, (5.55, -7.0, 1.45), (5.48, -6.65, 1.42), (5.4, -5.5, 1.3), lens=38, fstop=2.0)


def s13(T):
    R = lake()
    g = grandpa("happy", loc=(-1.0, -0.8, 0.1), yaw=0)
    g.idle(T.f0, T.f1, seed=13)
    # rire : épaules et tête qui sautillent
    f = T.at(0.05)
    while f < T.b:
        g.rot("head", f, (-8, 0, 0)); g.rot("head", f + 4, (2, 0, 0))
        key(g.pb("torso"), "location", f, (0, 0, 0)); key(g.pb("torso"), "location", f + 4, (0, 0.02, 0))
        f += 8
    g.rot("arm.R", T.f0, (-20, 0, -10))
    shot_camera(SC(), T, (-0.55, -3.3, 1.35), (-0.7, -2.8, 1.3), (-1.0, -0.8, 1.3), lens=34, fstop=2.4)


def s14(T):
    R = lake()
    g = grandpa("smile", loc=(-0.2, -0.6, 0.1), yaw=180)
    l_ = leo("smile", loc=(-1.1, -0.9, 0.1), yaw=170)
    g.idle(T.f0, T.f1, seed=14); l_.idle(T.f0, T.f1, seed=15)
    f = T.at(0.15)
    g.rot("arm.R", T.f0, (0, 0, 0))
    g.rot("arm.R", f, (35, 0, -60))
    g.rot("arm.R", f + 8, (-95, 0, -20), "BACK")
    g.rot("arm.R", f + 30, (-20, 0, 0))
    g.rot("torso", f, (0, 0, -15)); g.rot("torso", f + 8, (0, 0, 20), "BACK"); g.rot("torso", f + 30, (0, 0, 0))
    skip_stone(R["water"], (0.3, -0.2, 0.95), (0.05, 1, 0), f + 7, n=5, first=3.0, decay=0.8, height=0.6, frames=12)
    shot_camera(SC(), T, (1.8, -4.4, 1.5), (1.55, -3.9, 1.45), (-0.5, 1.8, 0.8), lens=28, fstop=4.0)


def s15(T):
    R = lake()
    st, hops = skip_stone(R["water"], (0.0, 0.3, 0.8), (0.12, 1, 0), T.at(0.0), n=7, first=2.0, decay=0.84, height=0.45, frames=10)
    shot_camera(SC(), T, (1.3, 0.6, 0.22), (1.3, 5.5, 0.25), (0.3, 3.0, 0.05), (1.0, 9.5, 0.05), lens=26, fstop=4.0, shift=-0.05)


def s16(T):
    R = lake()
    l_ = leo("smirk", loc=(0.0, -1.0, 0.1), yaw=0)
    l_.idle(T.f0, T.f1, seed=16)
    tip = hand_world(l_, "R")
    for i in range(3):
        st = flat_stone(f"HandStone{i}", (tip.x + (i - 1) * 0.045, tip.y - 0.02, tip.z - 0.03), (R_(70), 0, R_(25 * i)), 1.1)
        bone_parent(st, l_.arm, "arm.R")
    l_.rot("arm.R", T.f0, (-20, 0, -15))
    l_.rot("arm.R", T.at(0.15), (-85, 0, -12), "BACK")
    l_.rot("arm.R", T.at(0.7), (-80, 0, -12))
    l_.rot("arm.R", T.at(0.88), (-30, 0, -25), "EASE")
    shot_camera(SC(), T, (0.4, -3.3, 1.3), (0.3, -2.9, 1.25), (0.0, -1.1, 1.15), lens=32, fstop=2.2)


def s17(T):
    R = locker_room()
    l_ = leo("sleep", loc=(-1.05, 0.6, 0.64))
    l_.arm.rotation_euler = (R_(-90), 0, R_(-90))
    l_.idle(T.f0, T.f1, seed=17, sway=False)
    zzz((0.45, 0.45, 1.0), T.f0, T.f1)
    shot_camera(SC(), T, (1.25, -0.55, 1.95), (1.05, -0.3, 1.8), (0.25, 0.6, 0.65), lens=30, fstop=2.6)


def s18(T):
    R = locker_room()
    l_ = leo("sleep", loc=(-1.05, 0.6, 0.64))
    l_.arm.rotation_euler = (R_(-90), 0, R_(-90))
    l_.idle(T.f0, T.f1, seed=18, sway=False)
    for i, (lt, pm) in enumerate(reversed(R["lights"])):
        f = T.at(0.3 + 0.22 * i)
        key(lt.data, "energy", f - 1, 120.0, "CONSTANT")
        key(lt.data, "energy", f, 0.0, "CONSTANT")
        es = pm.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"]
        key(es, "default_value", f - 1, 5.0, "CONSTANT")
        key(es, "default_value", f, 0.0, "CONSTANT")
    shot_camera(SC(), T, (-2.6, -2.2, 2.4), (-2.3, -1.85, 2.25), (0.0, 0.6, 0.6), lens=24, fstop=5.0)


def s19(T):
    R = locker_room()
    for lt, pm in R["lights"]:
        lt.data.energy = 0.0
        pm.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 0.0
    l_ = leo("sleep", "scared", loc=(0.0, 0.62, -0.12), yaw=0)
    l_.rot("leg.L", T.f0, (-90, 0, 0)); l_.rot("leg.R", T.f0, (-90, 0, 0))
    l_.idle(T.f0, T.f1, seed=19, sway=False, blink_on=False)
    l_.rot("head", T.f0, (28, 0, 0))
    l_.rot("head", T.at(0.3), (28, 0, 0))
    l_.rot("head", T.at(0.42), (-5, 0, 0), "BACK")
    l_.rot("head", T.at(0.75), (-5, 0, 35))
    l_.set_expr(T.at(0.38), 1.0)
    shot_camera(SC(), T, (0.0, -1.25, 1.0), (0.1, -0.85, 1.0), (0.0, 0.6, 1.0), lens=32, fstop=2.2, fill=25)


def s20(T):
    R = pool_hall(night=True)
    shot_camera(SC(), T, (-3.4, -10.4, 1.2), (-2.4, -9.6, 1.9), (-4.0, -12.0, 1.1), (5.0, 11.0, 2.3), lens=28, fstop=2.8)


def s21(T):
    R = pool_hall(night=True)
    l_ = leo("scared", loc=(4.65, -4.2, 0), yaw=180)
    l_.idle(T.f0, T.f1, seed=21, breathe=False)
    walk(l_, T.f0, T.f1, (4.65, -4.4, 0), (4.65, -1.2, 0), period=34, swing=18, bob=0.025, tiptoe=True)
    shot_camera(SC(), T, (1.3, -4.3, 0.3), (1.3, -2.2, 0.32), (4.65, -3.4, 0.85), (4.65, -1.4, 0.85), lens=28, fstop=2.8, fill=25)


def s22(T):
    R = pool_hall(night=True)
    l_ = leo("scared", "hiccup", loc=(4.55, -1.1, 0), yaw=180)
    l_.idle(T.f0, T.f1, seed=22, breathe=False)
    l_.rot("arm.L", T.f0, (-10, 0, 50)); l_.rot("arm.R", T.f0, (-10, 0, -50))
    l_.set_expr(T.at(0.22), 1.0)
    hiccup(l_, T.at(0.25), 0.08)
    fs = T.at(0.52)
    l_.rot("leg.L", fs, (0, 0, 0))
    l_.rot("leg.L", fs + 6, (-20, 0, -45), "BACK")
    key(l_.pb("root"), "location", fs, (0, 0, 0)); key(l_.pb("root"), "location", fs + 6, (0, 0, -0.08), "BACK")
    key(l_.arm, "rotation_euler", fs, (0, 0, R_(180)))
    key(l_.arm, "rotation_euler", fs + 6, (0, R_(-8), R_(180)), "BACK")
    key(l_.arm, "rotation_euler", fs + 30, (0, R_(-3), R_(180)))
    l_.rot("arm.L", fs + 4, (-60, 0, 110), "BACK"); l_.rot("arm.R", fs + 4, (-60, 0, -110), "BACK")
    splash_burst("Slip", (4.1, -0.95, WL), fs + 6, n=22, power=1.0, size=0.035)
    ripple(R["water"], (4.0, -0.95, WL), fs + 6, speed=0.25, height=0.05, damp=60, name="SlipRipple")
    shot_camera(SC(), T, (3.7, 1.6, 0.55), (3.8, 1.1, 0.5), (4.35, -1.0, 0.65), lens=26, fstop=2.6, fill=25)


def s23(T):
    R = pool_hall(night=True)
    ripple(R["water"], (4.0, -0.95, WL), -15, speed=0.25, height=0.04, damp=30, name="Fading")
    l_ = leo("sweat", loc=(4.55, -1.1, 0), yaw=180)
    l_.idle(T.f0, T.f1, seed=23, sway=False)
    l_.rot("arm.L", T.f0, (-10, 0, 50)); l_.rot("arm.R", T.f0, (-10, 0, -50))
    shot_camera(SC(), T, (-3.2, -10.6, 3.4), (-2.6, -9.5, 3.1), (1.5, 0.5, 0.0), lens=24, fstop=5.0)


def s24(T):
    R = pool_hall(night=True)
    L = listener_at((0, 7.5, -3.4), 0, T=T)
    move(L.arm, "location", T.at(0.1), T.at(0.9), Vector((0, 7.5, -3.4)), Vector((0, 7.5, -1.0)))
    for i in range(3):
        ripple(R["water"], (0, 7.4, WL), T.at(0.2) + i * 12, speed=0.25, height=0.06, damp=60, name=f"Rise{i}")
    splash_burst("RiseSplash", (0, 7.3, WL), T.at(0.25), n=16, power=0.7)
    drips("RiseDrip", [(0.3, 7.3, 1.0), (-0.3, 7.3, 1.0)], T.at(0.5), T.f1, 12, fall=1.1)
    shot_camera(SC(), T, (2.9, 2.0, 0.45), (2.5, 2.8, 0.45), (0, 7.5, 0.3), (0, 7.5, 1.3), lens=30, fstop=2.6, fill=10)


def s25(T):
    R = pool_hall(night=True)
    L = listener_at((0, 7.5, -1.0), 0, T=T)
    drips("Drip", [(0.33, 7.25, 0.15), (-0.33, 7.25, 0.15), (0.0, 7.15, 1.2), (0.2, 7.3, 0.9)], T.f0, T.f1, 11, fall=1.0)
    shot_camera(SC(), T, (1.2, 4.2, 0.08), (1.0, 4.7, 0.1), (0, 7.5, 0.9), (0, 7.5, 1.3), lens=22, fstop=3.0, shift=-0.05)


def s26(T):
    R = pool_hall(night=True)
    L = listener_at((0, 7.5, -1.0), 0, T=T)
    hb = L.pb("head")
    key(hb, "scale", T.at(0.45), (1, 1, 1), "EASE")
    key(hb, "scale", T.at(0.5), (1.08, 1.08, 1.08), "BACK")
    key(hb, "scale", T.at(0.65), (1, 1, 1), "EASE")
    shot_camera(SC(), T, (0.25, 5.7, 1.45), (0.12, 6.15, 1.55), (0, 7.3, 1.62), lens=42, fstop=2.0, shift=-0.04)


def s27(T):
    R = pool_hall(night=True)
    L = listener_at((0, 7.5, -1.0), 0, T=None)
    L.rot("head", T.f0, (0, 0, -55))
    L.rot("head", T.at(0.15), (0, 0, -55))
    L.rot("head", T.at(0.85), (0, 0, 22))
    L.rot("torso", T.f0, (10, 0, -10)); L.rot("torso", T.at(0.85), (14, 0, 8))
    l_ = leo("scared", loc=(4.5, -1.1, 0), yaw=-152)
    l_.idle(T.f0, T.f1, seed=27)
    shot_camera(SC(), T, (6.0, -2.4, 1.8), (5.8, -2.0, 1.75), (0, 7.4, 1.4), lens=45, fstop=2.8)


def s28(T):
    R = pool_hall(night=True)
    l_ = leo("hiccup", "holdbreath", loc=(4.5, -1.1, 0), yaw=-152)
    l_.idle(T.f0, T.f1, seed=28, sway=False)
    hiccup(l_, T.at(0.25), 0.03)
    l_.set_expr(T.at(0.5), 1.0)
    hb = l_.pb("head")
    key(hb, "scale", T.at(0.5), (1, 1, 1), "EASE")
    key(hb, "scale", T.at(0.56), (1.07, 1.0, 1.0), "BACK")
    shot_camera(SC(), T, (3.95, -0.1, 1.4), (4.1, -0.4, 1.38), (4.5, -1.1, 1.32), lens=34, fstop=2.0, fill=30)


def s29(T):
    R = pool_hall(night=True)
    l_ = leo("holdbreath", "determined", loc=(4.5, -1.1, 0), yaw=-152)
    l_.idle(T.f0, T.f1, seed=29)
    l_.set_expr(T.at(0.3), 1.0)
    tip = hand_world(l_, "R")
    for i in range(3):
        st = flat_stone(f"HandStone{i}", (tip.x + (i - 1) * 0.04, tip.y, tip.z - 0.03), (R_(70), 0, R_(20 * i)), 1.15)
        bone_parent(st, l_.arm, "arm.R")
    l_.rot("arm.R", T.f0, (-15, 0, -20))
    l_.rot("arm.R", T.at(0.35), (-15, 0, -20))
    l_.rot("arm.R", T.at(0.6), (-95, 0, -15), "BACK")
    shot_camera(SC(), T, (3.7, 0.25, 1.3), (3.85, -0.05, 1.28), (4.48, -1.05, 1.05), lens=30, fstop=2.2, fill=30)


THROW_START = (4.25, -1.45, 1.0)
THROW_DIR = (-0.51, -0.86, 0)


def s30(T):
    R = pool_hall(night=True)
    l_ = leo("determined", loc=(4.55, -1.0, 0), yaw=-31)
    l_.idle(T.f0, T.f1, seed=30)
    f = T.at(0.3)
    l_.rot("arm.R", T.f0, (0, 0, 0))
    l_.rot("arm.R", f, (40, 0, -70))
    l_.rot("arm.R", f + 7, (-100, 0, -15), "BACK")
    l_.rot("arm.R", f + 30, (-30, 0, 0))
    l_.rot("torso", f, (0, 0, -25)); l_.rot("torso", f + 7, (6, 0, 22), "BACK"); l_.rot("torso", f + 30, (0, 0, 0))
    skip_stone(R["water"], THROW_START, THROW_DIR, f + 6, n=2, first=2.6, decay=0.86, height=0.5, frames=12, water_z=WL)
    shot_camera(SC(), T, (5.5, 0.6, 1.45), (5.3, 0.25, 1.4), (2.6, -4.2, 0.3), lens=28, fstop=3.0, fill=20)


def s31(T):
    R = pool_hall(night=True)
    st, hops = skip_stone(R["water"], THROW_START, THROW_DIR, T.at(0.0), n=7, first=2.6, decay=0.86, height=0.5,
                          frames=13, water_z=WL)
    shot_camera(SC(), T, (2.2, -0.2, 0.18), (-0.3, -5.6, 0.22), (3.0, -2.6, 0.0), (0.1, -8.0, 0.0), lens=26, fstop=4.0)


def s32(T):
    R = pool_hall(night=True)
    p = Vector(THROW_START)
    d = Vector(THROW_DIR).normalized()
    dist = 2.6
    for i in range(7):
        p = Vector((p.x + d.x * dist, p.y + d.y * dist, WL))
        ripple(R["water"], p, T.at(0.02) + i * 7, speed=0.22, height=0.04, damp=80, name=f"Seven{i}")
        splash_burst(f"Seven{i}_d", (p.x, p.y, WL), T.at(0.02) + i * 7, n=6, power=0.4, seed=i)
        dist *= 0.86
    shot_camera(SC(), T, (3.4, 5.6, 4.7), (3.1, 4.8, 4.4), (0.6, -4.0, 0.0), lens=24, fstop=6.0, shift=-0.03)


def s33(T):
    R = pool_hall(night=True)
    L = make_listener(loc=(0, 7.0, -1.0), yaw=0)
    move(L.arm, "location", T.at(0.05), T.at(0.95), Vector((0, 7.0, -1.0)), Vector((-0.8, -4.5, -0.55)))
    L.rot("torso", T.f0, (10, 0, 0)); L.rot("torso", T.at(0.15), (32, 0, 0), "BACK")
    for side, sgn in (("L", 1), ("R", -1)):
        L.rot("arm." + side, T.f0, (-5, 0, 0))
        L.rot("arm." + side, T.at(0.15), (-80, 0, 0), "BACK")
        wobble(L.pb("arm." + side), "rotation_euler", T.at(0.15), T.f1, R_(-80), R_(15), 0.6, index=0, phase=sgn)
    for i in range(9):
        t = 0.08 + i * 0.1
        y = 7.0 - 11.5 * t
        ripple(R["water"], (-0.1 * i, y, WL), T.at(t), speed=0.28, height=0.06, damp=60, name=f"Chase{i}")
        splash_burst(f"Chase{i}_d", (-0.1 * i, y - 0.3, WL), T.at(t), n=8, power=0.7, seed=40 + i)
    shot_camera(SC(), T, (6.4, -1.2, 1.7), (6.2, -1.8, 1.6), (0, 5.0, 0.9), (-0.6, -4.0, 0.9), lens=22, fstop=4.0)


def s34(T):
    R = pool_hall(night=True)
    l_ = leo("determined", loc=(5.1, 9.3, 0), yaw=180)
    walk(l_, T.f0, T.at(0.6), (5.1, 9.3, 0), (5.3, 11.3, 0), period=34, swing=18, tiptoe=True)
    h = R["exit_hinge"]
    key(h, "rotation_euler", T.at(0.55), (0, 0, 0), "EASE")
    key(h, "rotation_euler", T.at(0.85), (0, 0, R_(-75)), "EASE")
    l_.rot("arm.L", T.at(0.55), (-80, 0, 0), "BACK")
    move(l_.arm, "location", T.at(0.75), T.f1, Vector((5.3, 11.3, 0)), Vector((5.4, 12.6, 0)))
    shot_camera(SC(), T, (4.85, 7.5, 1.0), (5.0, 8.3, 1.1), (5.3, 11.8, 1.3), lens=28, fstop=2.8, fill=15)


def s35(T):
    R = pool_exterior()
    l_ = leo("smile", "happy", loc=(1.0, 1.6, 0), yaw=0)
    l_.idle(T.f0, T.f1, seed=35)
    l_.set_expr(T.at(0.45), 1.0)
    l_.rot("arm.R", T.at(0.4), (0, 0, 0))
    l_.rot("arm.R", T.at(0.52), (-150, 0, -10), "BACK")
    l_.rot("arm.R", T.at(0.95), (-150, 0, -10))
    shot_camera(SC(), T, (1.35, -1.3, 1.0), (1.15, -0.55, 1.08), (1.0, 1.6, 1.3), lens=32, fstop=2.4)


SHOTS = [s01, s02, s03, s04, s05, s06, s07, s08, s09, s10, s11, s12, s13, s14, s15, s16, s17, s18, s19, s20,
         s21, s22, s23, s24, s25, s26, s27, s28, s29, s30, s31, s32, s33, s34, s35]
