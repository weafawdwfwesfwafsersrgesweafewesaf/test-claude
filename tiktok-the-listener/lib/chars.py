"""Personnages blocky style Roblox R6 + monstre (The Listener).
Chaque perso humain = 1 armature (root, torso, head, arm.L/R, leg.L/R) + meshes parentés aux os.
Le visage est une texture 2D projetée sur la tête cylindrique ; 2 expressions par matériau
(valeur 'Expr' 0→1) et clignement (valeur 'Blink')."""
import bpy, math, os
from mathutils import Vector, Matrix
from core import *

FACES = os.path.join(ROOT, "textures", "faces")
S = 0.3  # 1 stud = 0.3 m

SKIN = (0.98, 0.68, 0.46)


def _img(name):
    p = os.path.join(FACES, name + ".png")
    return bpy.data.images.load(p, check_existing=True)


def face_material(name, skin, exprA="neutral", exprB=None, half_h=0.18):
    """Matériau tête : peau + visage (exprA → exprB via 'Expr', clignement via 'Blink')."""
    exprB = exprB or exprA
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    for n in list(N):
        N.remove(n)
    out = N.new("ShaderNodeOutputMaterial")
    b = N.new("ShaderNodeBsdfPrincipled")
    b.inputs["Roughness"].default_value = 0.42
    L.new(b.outputs[0], out.inputs[0])
    # coordonnées cylindriques
    tc = N.new("ShaderNodeTexCoord")
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(tc.outputs["Object"], sep.inputs[0])
    neg = N.new("ShaderNodeMath"); neg.operation = "MULTIPLY"; neg.inputs[1].default_value = -1
    L.new(sep.outputs["Y"], neg.inputs[0])
    at = N.new("ShaderNodeMath"); at.operation = "ARCTAN2"
    L.new(sep.outputs["X"], at.inputs[0]); L.new(neg.outputs[0], at.inputs[1])
    u = N.new("ShaderNodeMath"); u.operation = "MULTIPLY_ADD"
    u.inputs[1].default_value = 1 / math.pi; u.inputs[2].default_value = 0.5
    L.new(at.outputs[0], u.inputs[0])
    v = N.new("ShaderNodeMath"); v.operation = "MULTIPLY_ADD"
    v.inputs[1].default_value = 1 / (2 * half_h); v.inputs[2].default_value = 0.5
    L.new(sep.outputs["Z"], v.inputs[0])
    cmb = N.new("ShaderNodeCombineXYZ")
    L.new(u.outputs[0], cmb.inputs[0]); L.new(v.outputs[0], cmb.inputs[1])
    blinkv = N.new("ShaderNodeValue"); blinkv.name = blinkv.label = "Blink"; blinkv.outputs[0].default_value = 0
    exprv = N.new("ShaderNodeValue"); exprv.name = exprv.label = "Expr"; exprv.outputs[0].default_value = 0

    def tex(img):
        t = N.new("ShaderNodeTexImage")
        t.image = _img(img)
        t.extension = "CLIP"
        t.interpolation = "Cubic"
        L.new(cmb.outputs[0], t.inputs[0])
        return t

    def mixf(fac, a, b_, kind="FLOAT"):
        mx = N.new("ShaderNodeMix"); mx.data_type = kind
        L.new(fac, mx.inputs[0])
        ia, ib = (2, 3) if kind == "FLOAT" else (6, 7)
        L.new(a, mx.inputs[ia]); L.new(b_, mx.inputs[ib])
        return mx.outputs[0 if kind == "FLOAT" else 2]

    res = []
    for e in (exprA, exprB):
        t0, t1 = tex(e), tex(e + "_blink")
        col = mixf(blinkv.outputs[0], t0.outputs["Color"], t1.outputs["Color"], "RGBA")
        al = mixf(blinkv.outputs[0], t0.outputs["Alpha"], t1.outputs["Alpha"])
        res.append((col, al))
    col = mixf(exprv.outputs[0], res[0][0], res[1][0], "RGBA")
    al = mixf(exprv.outputs[0], res[0][1], res[1][1])
    skinc = N.new("ShaderNodeRGB"); skinc.outputs[0].default_value = (*skin, 1)
    fin = mixf(al, skinc.outputs[0], col, "RGBA")
    L.new(fin, b.inputs["Base Color"])
    # les traits du visage un peu moins brillants
    rgh = N.new("ShaderNodeMapRange")
    rgh.inputs["To Min"].default_value = 0.42; rgh.inputs["To Max"].default_value = 0.7
    L.new(al, rgh.inputs[0]); L.new(rgh.outputs[0], b.inputs["Roughness"])
    return m, blinkv.outputs[0], exprv.outputs[0]


# ---------------------------------------------------------------- armature
def _make_armature(name, bones):
    ad = bpy.data.armatures.new(name + "_rig")
    ao = bpy.data.objects.new(name, ad)
    link(ao)
    bpy.context.view_layer.objects.active = ao
    bpy.ops.object.mode_set(mode="EDIT")
    eb = ad.edit_bones
    for bn, (h, t, par) in bones.items():
        b = eb.new(bn)
        b.head, b.tail = Vector(h), Vector(t)
        if par:
            b.parent = eb[par]
    bpy.ops.object.mode_set(mode="OBJECT")
    ao.show_in_front = True
    for pb in ao.pose.bones:
        pb.rotation_mode = "XYZ"
    return ao


def bone_parent(obj, arm, bname):
    mw = obj.matrix_world.copy()
    obj.parent = arm
    obj.parent_type = "BONE"
    obj.parent_bone = bname
    b = arm.data.bones[bname]
    pm = arm.matrix_world @ b.matrix_local @ Matrix.Translation((0, b.length, 0))
    obj.matrix_parent_inverse = pm.inverted()
    obj.matrix_world = mw


class Char:
    def __init__(self, arm, blink, expr, parts):
        self.arm, self.blink, self.expr, self.parts = arm, blink, expr, parts

    def pb(self, name):
        return self.arm.pose.bones[name]

    def rot(self, bone, frame, deg, interp="EASE"):
        key(self.pb(bone), "rotation_euler", frame, [math.radians(a) for a in deg], interp)

    def loc(self, frame, xyz, interp="EASE"):
        key(self.arm, "location", frame, xyz, interp)

    def yaw(self, frame, deg, interp="EASE"):
        key(self.arm, "rotation_euler", frame, (0, 0, math.radians(deg)), interp)

    def set_expr(self, frame, val, interp="CONSTANT"):
        key(self.expr, "default_value", 1, 0.0, "CONSTANT")
        key(self.expr, "default_value", frame - 1, 0.0, "CONSTANT")
        key(self.expr, "default_value", frame, val, interp)

    def idle(self, f0, f1, seed=0, breathe=True, blink_on=True, sway=True):
        """Respiration + clignements + léger balancement de tête en boucle."""
        import random
        rnd = random.Random(seed)
        if breathe:
            wobble(self.pb("torso"), "scale", f0, f1, 1.0, 0.018, 2.6, index=1, phase=rnd.random() * 6)
        if sway:
            wobble(self.pb("head"), "rotation_euler", f0, f1, 0.0, math.radians(2.2), 3.4, index=2, phase=rnd.random() * 6)
        if blink_on:
            blink(self.blink, f0, f1, seed=seed)


def make_char(name, skin=SKIN, shirt=None, pants=None, hair="boy", hair_color=(0.25, 0.13, 0.06),
              exprA="neutral", exprB=None, buttons=True, scale=1.0, loc=(0, 0, 0), yaw=0.0, extra=None):
    s = S
    bones = {
        "root": ((0, 0, 0), (0, 0, 0.3), None),
        "torso": ((0, 0, 2 * s), (0, 0, 4 * s), "root"),
        "head": ((0, 0, 4 * s), (0, 0, 5.4 * s), "torso"),
        "arm.L": ((1.5 * s, 0, 3.75 * s), (1.5 * s, 0, 2.0 * s), "torso"),
        "arm.R": ((-1.5 * s, 0, 3.75 * s), (-1.5 * s, 0, 2.0 * s), "torso"),
        "leg.L": ((0.5 * s, 0, 2 * s), (0.5 * s, 0, 0.05), "root"),
        "leg.R": ((-0.5 * s, 0, 2 * s), (-0.5 * s, 0, 0.05), "root"),
    }
    arm = _make_armature(name, bones)
    shirt = shirt or plastic((0.2, 0.4, 0.9), name="shirt_" + name)
    pants = pants or plastic((0.15, 0.2, 0.35), name="pants_" + name)
    parts = {}
    bev = 0.035
    parts["torso"] = box(name + "_torso", (2 * s - 0.005, 1 * s, 2 * s), (0, 0, 3 * s), shirt, bev)
    for side, x in (("L", 1.5 * s), ("R", -1.5 * s)):
        parts["arm" + side] = box(f"{name}_arm{side}", (1 * s - 0.01, 1 * s - 0.01, 2 * s), (x, 0, 3 * s), shirt, bev)
        parts["leg" + side] = box(f"{name}_leg{side}", (1 * s - 0.008, 1 * s - 0.01, 2 * s), (x / 3, 0, 1 * s), pants, bev)
    hh = 1.35 * s
    HR = 0.82 * s
    hm, bl, ex = face_material(name + "_face", skin, exprA, exprB, half_h=hh / 2)
    head = cyl(name + "_head", HR, hh, (0, 0, 4 * s + hh / 2 + 0.01), hm, bevel=0.09, verts=40)
    parts["head"] = head
    neck = cyl(name + "_neck", 0.3 * s, 0.06, (0, 0, 4 * s), plastic(skin, name="skin_" + name))
    parts["neck"] = neck
    if buttons:
        for i in range(3):
            parts[f"btn{i}"] = cyl(f"{name}_btn{i}", 0.028, 0.02, (0, -0.5 * s - 0.005, 3.6 * s - i * 0.16),
                                   plastic((0.95, 0.95, 0.9), 0.3, name="button"), rot=(math.pi / 2, 0, 0), verts=16)
    hair_parts = make_hair(name, hair, hair_color, head.location, hh, HR)
    # parentage
    for k, o in parts.items():
        b = {"torso": "torso", "head": "head", "neck": "torso", "armL": "arm.L", "armR": "arm.R",
             "legL": "leg.L", "legR": "leg.R"}.get(k, "torso")
        bone_parent(o, arm, b)
    for o in hair_parts:
        bone_parent(o, arm, "head")
    if extra:
        extra(arm, head)
    arm.scale = (scale,) * 3
    arm.location = loc
    arm.rotation_euler = (0, 0, math.radians(yaw))
    return Char(arm, bl, ex, parts)


def make_hair(name, style, color, hc, hh, r=0.82 * S):
    """Cheveux en blocs arrondis (casque + mèches)."""
    m = plastic(color, 0.55, name="hair_" + name)
    x, y, z = hc
    top = z + hh / 2
    out = []
    if style == "none":
        return out
    if style == "grandpa":
        for sx in (-1, 1):
            out.append(box(f"{name}_hairside{sx}", (0.06, 0.16, 0.12), (sx * (r + 0.01), 0.03, z + 0.02), m, 0.025))
        return out
    cap = box(f"{name}_hair", (2 * r + 0.04, 2 * r + 0.04, 0.12), (x, y + 0.01, top - 0.02), m, 0.05)
    out.append(cap)
    back = box(f"{name}_hairback", (2 * r + 0.03, 0.12, hh * 0.75), (x, y + r - 0.03, top - hh * 0.38), m, 0.04)
    out.append(back)
    if style in ("boy", "messy"):
        for i, (dx, dz, rz) in enumerate(((-0.08, 0.0, 0.3), (0.02, 0.02, -0.2), (0.1, -0.01, 0.4))):
            out.append(box(f"{name}_fringe{i}", (0.11, 0.08, 0.08), (x + dx, y - r + 0.02, top - 0.07 + dz), m, 0.03,
                           rot=(0.3, 0, rz)))
        if style == "messy":
            for i, (dx, dy) in enumerate(((-0.06, 0.04), (0.07, -0.02), (0.0, 0.1))):
                out.append(box(f"{name}_spike{i}", (0.09, 0.09, 0.08), (x + dx, y + dy, top + 0.05), m, 0.03,
                               rot=(0.4 * dx * 10, 0.3, dx * 5)))
    elif style in ("long", "bun"):
        out.append(box(f"{name}_bangs", (2 * r + 0.02, 0.08, 0.08), (x, y - r + 0.03, top - 0.06), m, 0.035, rot=(0.25, 0, 0)))
        for sx in (-1, 1):
            out.append(box(f"{name}_side{sx}", (0.07, 0.2, hh * 0.9 if style == "long" else hh * 0.5),
                           (x + sx * (r + 0.02), y + 0.02, top - hh * (0.5 if style == "long" else 0.3)), m, 0.03))
        if style == "long":
            out.append(box(f"{name}_long", (2 * r + 0.02, 0.1, 0.42), (x, y + r + 0.0, top - 0.32), m, 0.04))
        else:
            out.append(sphere(f"{name}_bun", 0.1, (x, y + r * 0.6, top + 0.06), m))
    elif style == "short":
        out.append(box(f"{name}_bangs", (2 * r, 0.06, 0.05), (x, y - r + 0.03, top - 0.05), m, 0.02))
    return out


# ---------------------------------------------------------------- accessoires
def glasses(arm, head):
    """Lunettes rondes (grand-père)."""
    m = plastic((0.08, 0.06, 0.05), 0.3, name="GlassesFrame")
    hc = head.location
    r = 0.82 * S
    out = []
    for sx in (-1, 1):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.05, minor_radius=0.008,
                                         location=(hc.x + sx * 0.075, hc.y - r - 0.012, hc.z + 0.035),
                                         rotation=(math.pi / 2, 0, 0))
        g = bpy.context.active_object
        g.data.materials.append(m)
        out.append(g)
    out.append(box("glasses_bridge", (0.05, 0.01, 0.01), (hc.x, hc.y - r - 0.015, hc.z + 0.04), m, 0.0))
    for o in out:
        bone_parent(o, arm, "head")


def mustache(arm, head):
    m = fabric((0.92, 0.92, 0.9), 90.0, name="WhiteHair")
    hc = head.location
    o = box("mustache", (0.14, 0.04, 0.035), (hc.x, hc.y - 0.82 * S - 0.01, hc.z - 0.025), m, 0.015)
    bone_parent(o, arm, "head")


# ---------------------------------------------------------------- monstre
def _curve_tube(name, pts, radius, mat):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 4
    cu.use_fill_caps = True
    sp = cu.splines.new("NURBS")
    sp.points.add(len(pts) - 1)
    for p, c in zip(sp.points, pts):
        p.co = (*c, 1)
    sp.order_u = 4
    sp.use_endpoint_u = True
    cu.materials.append(mat)
    o = bpy.data.objects.new(name, cu)
    link(o)
    return o


def make_listener(name="Listener", loc=(0, 0, 0), yaw=0.0, scale=1.0):
    """The Listener : grand, blanc, mouillé, membres très longs, pas de visage — une oreille géante."""
    s = S
    skin = bpy.data.materials.new("ListenerSkin")
    nt = skin.node_tree
    b = nt.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.86, 0.88, 0.9, 1)
    b.inputs["Roughness"].default_value = 0.25
    b.inputs["Coat Weight"].default_value = 1.0
    b.inputs["Coat Roughness"].default_value = 0.02
    # gouttes / peau humide : bruit en relief
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nz = nt.nodes.new("ShaderNodeTexVoronoi"); nz.inputs["Scale"].default_value = 30
    nt.links.new(tc.outputs["Object"], nz.inputs[0])
    bm = nt.nodes.new("ShaderNodeBump"); bm.inputs["Strength"].default_value = 0.25
    nt.links.new(nz.outputs["Distance"], bm.inputs["Height"])
    nt.links.new(bm.outputs[0], b.inputs["Coat Normal"])
    inner = plastic((0.85, 0.55, 0.58), 0.35, name="EarInner")
    dark = plastic((0.08, 0.03, 0.04), 0.5, name="EarCanal")
    L_ = 4.6 * s
    T = 3.0 * s
    bones = {
        "root": ((0, 0, 0), (0, 0, 0.3), None),
        "torso": ((0, 0, L_), (0, 0, L_ + T), "root"),
        "head": ((0, 0, L_ + T), (0, 0, L_ + T + 2.2 * s), "torso"),
        "arm.L": ((1.05 * s, 0, L_ + T - 0.12), (1.05 * s, 0, L_ + T - 0.12 - 6.0 * s), "torso"),
        "arm.R": ((-1.05 * s, 0, L_ + T - 0.12), (-1.05 * s, 0, L_ + T - 0.12 - 6.0 * s), "torso"),
        "leg.L": ((0.38 * s, 0, L_), (0.38 * s, 0, 0.05), "root"),
        "leg.R": ((-0.38 * s, 0, L_), (-0.38 * s, 0, 0.05), "root"),
    }
    arm = _make_armature(name, bones)
    parts = []
    parts.append((box(name + "_torso", (1.45 * s, 0.7 * s, T), (0, 0, L_ + T / 2), skin, 0.08), "torso"))
    parts.append((box(name + "_hips", (1.2 * s, 0.65 * s, 0.5 * s), (0, 0, L_ + 0.1), skin, 0.06), "torso"))
    # côtes visibles
    for i in range(3):
        parts.append((box(f"{name}_rib{i}", (1.2 * s, 0.04, 0.03), (0, -0.36 * s, L_ + T * 0.5 + i * 0.11),
                          plastic((0.7, 0.72, 0.75), 0.3, name="RibShadow"), 0.01), "torso"))
    for side, sx in (("L", 1), ("R", -1)):
        ax = sx * 1.05 * s
        top = L_ + T - 0.12
        parts.append((box(f"{name}_upper{side}", (0.42 * s, 0.42 * s, 3.0 * s), (ax, 0, top - 1.5 * s), skin, 0.05), "arm." + side))
        parts.append((box(f"{name}_lower{side}", (0.36 * s, 0.36 * s, 3.0 * s), (ax, 0, top - 4.5 * s), skin, 0.05), "arm." + side))
        parts.append((box(f"{name}_hand{side}", (0.5 * s, 0.25 * s, 0.4 * s), (ax, 0, top - 6.1 * s), skin, 0.05), "arm." + side))
        for fi in range(4):
            fx = ax + (fi - 1.5) * 0.035
            parts.append((box(f"{name}_finger{side}{fi}", (0.025, 0.03, 0.32 + 0.04 * (fi % 2)),
                              (fx, 0, top - 6.1 * s - 0.2), skin, 0.012), "arm." + side))
        parts.append((box(f"{name}_leg{side}", (0.5 * s, 0.5 * s, L_), (sx * 0.38 * s, 0, L_ / 2), skin, 0.05), "leg." + side))
        parts.append((box(f"{name}_foot{side}", (0.55 * s, 1.1 * s, 0.1), (sx * 0.38 * s, -0.1, 0.05), skin, 0.04), "leg." + side))
    # cou fin + tête ovale verticale
    parts.append((cyl(name + "_neck", 0.22 * s, 0.4 * s, (0, 0, L_ + T + 0.1), skin), "head"))
    hz = L_ + T + 1.15 * s
    head = sphere(name + "_head", 0.5, (0, 0, hz), skin, (0.62 * s / 0.5 * 1.1, 0.5 * s / 0.5 * 1.1, 1.05 * s / 0.5 * 1.1), segs=32)
    parts.append((head, "head"))
    # l'oreille : occupe toute la face avant
    fy = -0.5 * s * 1.1 - 0.02
    pts_helix = [(0.02, fy, hz - 0.22), (0.12, fy, hz - 0.18), (0.17, fy - 0.01, hz - 0.02), (0.15, fy - 0.02, hz + 0.18),
                 (0.02, fy - 0.03, hz + 0.27), (-0.12, fy - 0.03, hz + 0.2), (-0.15, fy - 0.02, hz + 0.05),
                 (-0.08, fy - 0.01, hz - 0.08), (-0.1, fy, hz - 0.2), (-0.03, fy, hz - 0.3)]
    helix = _curve_tube(name + "_helix", pts_helix, 0.035, skin)
    parts.append((helix, "head"))
    pts_anti = [(0.07, fy + 0.005, hz - 0.12), (0.09, fy - 0.005, hz + 0.05), (0.02, fy - 0.01, hz + 0.15),
                (-0.07, fy - 0.005, hz + 0.1), (-0.06, fy + 0.0, hz - 0.01)]
    parts.append((_curve_tube(name + "_antihelix", pts_anti, 0.022, skin), "head"))
    concha = sphere(name + "_concha", 0.13, (0.0, fy + 0.035, hz + 0.0), inner, (1.0, 0.35, 1.4))
    parts.append((concha, "head"))
    canal = sphere(name + "_canal", 0.05, (0.0, fy + 0.0, hz - 0.03), dark, (1.0, 0.3, 1.2))
    parts.append((canal, "head"))
    lobe = sphere(name + "_lobe", 0.06, (-0.01, fy + 0.02, hz - 0.3), skin, (1.0, 0.6, 1.1))
    parts.append((lobe, "head"))
    for o, bn in parts:
        bone_parent(o, arm, bn)
    arm.scale = (scale,) * 3
    arm.location = loc
    arm.rotation_euler = (0, 0, math.radians(yaw))
    arm.pose.bones["torso"].rotation_euler = (math.radians(10), 0, 0)
    mon = Char(arm, None, None, dict(parts=parts, ear=[helix, concha]))
    return mon
