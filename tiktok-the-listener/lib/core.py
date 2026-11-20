"""Outils de base : scène, rendu, matériaux procéduraux, primitives, animation.
Testé avec Blender 5.3 (pip install bpy)."""
import bpy, math, random, os
from mathutils import Vector, Matrix, Euler

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FPS = 30


# ---------------------------------------------------------------- scène / rendu
def reset():
    _MATS.clear()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = FPS
    return sc


def setup_render(sc, res=(540, 960), samples=16, engine="CYCLES", motion_blur=True):
    r = sc.render
    r.resolution_x, r.resolution_y = res
    r.resolution_percentage = 100
    r.engine = engine
    if engine == "CYCLES":
        c = sc.cycles
        c.device = "CPU"
        c.samples = samples
        c.use_adaptive_sampling = True
        c.adaptive_threshold = 0.04
        c.use_denoising = True
        c.denoiser = "OPENIMAGEDENOISE"
        c.max_bounces = 4
        c.diffuse_bounces = 2
        c.glossy_bounces = 2
        c.transmission_bounces = 4
        c.transparent_max_bounces = 8
        c.volume_bounces = 0
        c.caustics_reflective = False
        c.caustics_refractive = False
        c.blur_glossy = 1.0
        c.sample_clamp_indirect = 6.0
        r.use_persistent_data = True
    else:
        e = sc.eevee
        e.taa_render_samples = samples
        e.use_raytracing = True
        e.ray_tracing_method = "SCREEN"
        e.ray_tracing_options.use_denoise = True
        e.use_fast_gi = True
        e.fast_gi_method = "GLOBAL_ILLUMINATION"
        e.fast_gi_distance = 3.0
        e.use_shadows = True
        e.shadow_ray_count = 2
        e.shadow_step_count = 8
        e.shadow_resolution_scale = 1.0
        e.motion_blur_steps = 1
        e.clamp_surface_indirect = 10.0
    r.use_motion_blur = motion_blur
    r.motion_blur_shutter = 0.35
    vs = sc.view_settings
    vs.view_transform = "AgX"
    vs.look = "AgX - Medium High Contrast"
    vs.exposure = 0.0
    r.film_transparent = False
    setup_compositor(sc)


def setup_compositor(sc, bloom=0.35):
    """Bloom (Glare) + léger vignettage."""
    ng = bpy.data.node_groups.new("Compositing", "CompositorNodeTree")
    ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    n = ng.nodes
    rl = n.new("CompositorNodeRLayers")
    gl = n.new("CompositorNodeGlare")
    for k, v in {"Type": "Bloom", "Quality": "Medium"}.items():
        try:
            gl.inputs[k].default_value = v
        except Exception:
            pass
    gl.inputs["Threshold"].default_value = 0.9
    gl.inputs["Strength"].default_value = bloom
    gl.inputs["Size"].default_value = 0.6
    out = n.new("NodeGroupOutput")
    ng.links.new(rl.outputs["Image"], gl.inputs["Image"])
    ng.links.new(gl.outputs[0], out.inputs[0])
    sc.compositing_node_group = ng
    sc.render.use_compositing = True


def world_color(sc, color=(0.02, 0.03, 0.08), strength=1.0):
    w = bpy.data.worlds.new("World")
    sc.world = w
    nt = w.node_tree
    bg = nt.nodes.get("Background") or nt.nodes.new("ShaderNodeBackground")
    bg.inputs[0].default_value = (*color, 1)
    bg.inputs[1].default_value = strength
    out = nt.nodes.get("World Output") or nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(bg.outputs[0], out.inputs[0])
    return w


def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


# ---------------------------------------------------------------- matériaux
_MATS = {}


def _mat(name):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    return m, nt, bsdf


def cached(fn):
    def w(*a, **k):
        key = (fn.__name__, a, tuple(sorted(k.items())))
        if key not in _MATS or _MATS[key].name not in bpy.data.materials:
            _MATS[key] = fn(*a, **k)
        return _MATS[key]
    return w


def _texcoord(nt, scale=1.0, kind="Object"):
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (scale, scale, scale)
    nt.links.new(tc.outputs[kind], mp.inputs[0])
    return mp


def _triplanar(nt):
    """Coordonnées projetées selon la normale (objet) : carrelage/brique corrects sur sols et murs."""
    N, L = nt.nodes, nt.links
    tc = N.new("ShaderNodeTexCoord")
    sn = N.new("ShaderNodeSeparateXYZ"); L.new(tc.outputs["Normal"], sn.inputs[0])
    sp = N.new("ShaderNodeSeparateXYZ"); L.new(tc.outputs["Object"], sp.inputs[0])
    def ab(o):
        a = N.new("ShaderNodeMath"); a.operation = "ABSOLUTE"; L.new(o, a.inputs[0]); return a.outputs[0]
    ax, ay, az = ab(sn.outputs["X"]), ab(sn.outputs["Y"]), ab(sn.outputs["Z"])
    def cmb(u, v):
        c = N.new("ShaderNodeCombineXYZ"); L.new(u, c.inputs[0]); L.new(v, c.inputs[1]); return c.outputs[0]
    vz = cmb(sp.outputs["X"], sp.outputs["Y"])
    vx = cmb(sp.outputs["Y"], sp.outputs["Z"])
    vy = cmb(sp.outputs["X"], sp.outputs["Z"])
    gz = N.new("ShaderNodeMath"); gz.operation = "GREATER_THAN"; gz.inputs[1].default_value = 0.5; L.new(az, gz.inputs[0])
    gx = N.new("ShaderNodeMath"); gx.operation = "GREATER_THAN"; L.new(ax, gx.inputs[0]); L.new(ay, gx.inputs[1])
    m1 = N.new("ShaderNodeMix"); m1.data_type = "VECTOR"; L.new(gx.outputs[0], m1.inputs[0]); L.new(vy, m1.inputs[4]); L.new(vx, m1.inputs[5])
    m2 = N.new("ShaderNodeMix"); m2.data_type = "VECTOR"; L.new(gz.outputs[0], m2.inputs[0]); L.new(m1.outputs[1], m2.inputs[4]); L.new(vz, m2.inputs[5])
    return m2.outputs[1]


def _ramp(nt, fac, c1, c2):
    r = nt.nodes.new("ShaderNodeValToRGB")
    r.color_ramp.elements[0].color = (*c1, 1)
    r.color_ramp.elements[1].color = (*c2, 1)
    nt.links.new(fac, r.inputs[0])
    return r.outputs[0]


def _bump(nt, height, strength, bsdf, distance=0.02):
    b = nt.nodes.new("ShaderNodeBump")
    b.inputs["Strength"].default_value = strength
    b.inputs["Distance"].default_value = distance
    nt.links.new(height, b.inputs["Height"])
    nt.links.new(b.outputs[0], bsdf.inputs["Normal"])
    return b


def _shade(c, k):
    return tuple(max(0, min(1, x * k)) for x in c)


@cached
def plastic(color, rough=0.45, name="Plastic"):
    m, nt, b = _mat(name)
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    # micro-texture légère (style plastique Roblox)
    mp = _texcoord(nt, 40)
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 1.0
    nt.links.new(mp.outputs[0], nz.inputs[0])
    _bump(nt, nz.outputs[0], 0.04, b)
    return m


@cached
def emission(color, strength=5.0, name="Emit"):
    m, nt, b = _mat(name)
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Emission Color"].default_value = (*color, 1)
    b.inputs["Emission Strength"].default_value = strength
    return m


@cached
def wood(color=(0.42, 0.22, 0.10), planks=True, scale=1.0, name="Wood"):
    """Parquet : lames (brick texture étirée) + veinage (wave)."""
    m, nt, b = _mat(name)
    mp = _texcoord(nt, scale)
    c1, c2 = color, _shade(color, 0.62)
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.inputs["Scale"].default_value = 2.5
    wave.inputs["Distortion"].default_value = 6
    wave.inputs["Detail"].default_value = 3
    wave.bands_direction = "X"
    nt.links.new(mp.outputs[0], wave.inputs[0])
    col = _ramp(nt, wave.outputs["Fac"], c2, c1)
    if planks:
        br = nt.nodes.new("ShaderNodeTexBrick")
        br.inputs["Scale"].default_value = 1.2
        br.inputs["Mortar Size"].default_value = 0.008
        br.inputs["Brick Width"].default_value = 3.2
        br.inputs["Row Height"].default_value = 0.42
        br.offset = 0.37
        br.inputs["Bias"].default_value = 0.0
        br.inputs["Color1"].default_value = (1, 1, 1, 1)
        br.inputs["Color2"].default_value = (0.78, 0.78, 0.78, 1)
        br.inputs["Mortar"].default_value = (0.15, 0.15, 0.15, 1)
        nt.links.new(mp.outputs[0], br.inputs[0])
        mul = nt.nodes.new("ShaderNodeMix")
        mul.data_type = "RGBA"
        mul.blend_type = "MULTIPLY"
        mul.inputs[0].default_value = 1.0
        nt.links.new(col, mul.inputs[6])
        nt.links.new(br.outputs["Color"], mul.inputs[7])
        nt.links.new(mul.outputs[2], b.inputs["Base Color"])
        _bump(nt, br.outputs["Fac"], 0.35, b)
    else:
        nt.links.new(col, b.inputs["Base Color"])
        _bump(nt, wave.outputs["Fac"], 0.08, b)
    b.inputs["Roughness"].default_value = 0.38
    b.inputs["Coat Weight"].default_value = 0.25
    b.inputs["Coat Roughness"].default_value = 0.15
    return m


@cached
def fabric(color, scale=60.0, knit=False, name="Fabric", color2=None):
    """Tissu / tricot : voronoi + noise en relief, sheen."""
    m, nt, b = _mat(name)
    mp = _texcoord(nt, scale)
    if knit:
        # mailles : wave en V via voronoi étiré
        mp.inputs["Scale"].default_value = (scale, scale * 0.5, scale * 0.5)
        vor = nt.nodes.new("ShaderNodeTexVoronoi")
        vor.feature = "F1"
        nt.links.new(mp.outputs[0], vor.inputs[0])
        h = vor.outputs["Distance"]
    else:
        vor = nt.nodes.new("ShaderNodeTexNoise")
        vor.inputs["Scale"].default_value = 1.0
        vor.inputs["Detail"].default_value = 8
        nt.links.new(mp.outputs[0], vor.inputs[0])
        h = vor.outputs["Fac"]
    c2 = color2 or _shade(color, 0.7)
    col = _ramp(nt, h, c2, color)
    nt.links.new(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.85
    b.inputs["Sheen Weight"].default_value = 0.6
    _bump(nt, h, 0.6 if knit else 0.35, b, 0.01)
    return m


@cached
def stripes(color, color2, scale=6.0, axis="Z", name="Stripes", rough=0.75):
    """Rayures (pyjamas, papier peint)."""
    m, nt, b = _mat(name)
    mp = _texcoord(nt, scale)
    wv = nt.nodes.new("ShaderNodeTexWave")
    wv.wave_type = "BANDS"
    wv.bands_direction = axis
    wv.wave_profile = "SAW" if False else "SIN"
    wv.inputs["Scale"].default_value = 1.0
    wv.inputs["Distortion"].default_value = 0.0
    nt.links.new(mp.outputs[0], wv.inputs[0])
    lt = nt.nodes.new("ShaderNodeMath")
    lt.operation = "GREATER_THAN"
    lt.inputs[1].default_value = 0.5
    nt.links.new(wv.outputs["Fac"], lt.inputs[0])
    col = _ramp(nt, lt.outputs[0], color, color2)
    nt.links.new(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Sheen Weight"].default_value = 0.3
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 300
    _bump(nt, nz.outputs[0], 0.15, b, 0.005)
    return m


@cached
def plaid(color, color2, scale=5.0, name="Plaid"):
    """Tartan (couverture)."""
    m, nt, b = _mat(name)
    mp = _texcoord(nt, scale)
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(mp.outputs[0], sep.inputs[0])
    vals = []
    for ax in ("X", "Z"):
        fr = nt.nodes.new("ShaderNodeMath"); fr.operation = "FRACT"
        nt.links.new(sep.outputs[ax], fr.inputs[0])
        gt = nt.nodes.new("ShaderNodeMath"); gt.operation = "GREATER_THAN"; gt.inputs[1].default_value = 0.5
        nt.links.new(fr.outputs[0], gt.inputs[0])
        vals.append(gt.outputs[0])
    add = nt.nodes.new("ShaderNodeMath"); add.operation = "ADD"
    nt.links.new(vals[0], add.inputs[0]); nt.links.new(vals[1], add.inputs[1])
    mul = nt.nodes.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = 0.5
    nt.links.new(add.outputs[0], mul.inputs[0])
    r = nt.nodes.new("ShaderNodeValToRGB")
    r.color_ramp.elements[0].color = (*color, 1)
    r.color_ramp.elements[1].color = (*color2, 1)
    r.color_ramp.elements.new(0.5).color = (*_shade(color, 0.55), 1)
    nt.links.new(mul.outputs[0], r.inputs[0])
    nt.links.new(r.outputs[0], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.9
    b.inputs["Sheen Weight"].default_value = 0.7
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 400
    _bump(nt, nz.outputs[0], 0.3, b, 0.005)
    return m


@cached
def brick(color=(0.45, 0.13, 0.08), mortar=(0.55, 0.52, 0.48), scale=3.0, name="Brick"):
    m, nt, b = _mat(name)
    mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (scale, scale, scale)
    nt.links.new(_triplanar(nt), mp.inputs[0])
    br = nt.nodes.new("ShaderNodeTexBrick")
    br.inputs["Color1"].default_value = (*color, 1)
    br.inputs["Color2"].default_value = (*_shade(color, 0.75), 1)
    br.inputs["Mortar"].default_value = (*mortar, 1)
    br.inputs["Scale"].default_value = 1.0
    br.inputs["Mortar Size"].default_value = 0.025
    br.inputs["Brick Width"].default_value = 0.5
    br.inputs["Row Height"].default_value = 0.2
    nt.links.new(mp.outputs[0], br.inputs[0])
    nt.links.new(br.outputs["Color"], b.inputs["Base Color"])
    _bump(nt, br.outputs["Fac"], 0.5, b)
    b.inputs["Roughness"].default_value = 0.9
    return m


@cached
def siding(color, scale=1.0, name="Siding"):
    """Bardage horizontal (maisons US)."""
    m, nt, b = _mat(name)
    mp = _texcoord(nt, scale)
    wv = nt.nodes.new("ShaderNodeTexWave")
    wv.bands_direction = "Z"
    wv.wave_profile = "SAW"
    wv.inputs["Scale"].default_value = 3.5
    wv.inputs["Distortion"].default_value = 0
    nt.links.new(mp.outputs[0], wv.inputs[0])
    col = _ramp(nt, wv.outputs["Fac"], _shade(color, 0.8), color)
    nt.links.new(col, b.inputs["Base Color"])
    _bump(nt, wv.outputs["Fac"], 0.4, b)
    b.inputs["Roughness"].default_value = 0.6
    return m


@cached
def wallpaper(color, color2=None, scale=8.0, name="Wallpaper"):
    """Papier peint : fines rayures verticales + grain."""
    m, nt, b = _mat(name)
    mp = _texcoord(nt, scale)
    wv = nt.nodes.new("ShaderNodeTexWave")
    wv.bands_direction = "X"
    wv.inputs["Scale"].default_value = 1.0
    wv.inputs["Distortion"].default_value = 0.0
    nt.links.new(mp.outputs[0], wv.inputs[0])
    col = _ramp(nt, wv.outputs["Fac"], color2 or _shade(color, 0.86), color)
    nt.links.new(col, b.inputs["Base Color"])
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 250
    nt.links.new(_texcoord(nt, 1).outputs[0], nz.inputs[0])
    _bump(nt, nz.outputs[0], 0.12, b, 0.005)
    b.inputs["Roughness"].default_value = 0.8
    return m


@cached
def snow(name="Snow"):
    m, nt, b = _mat(name)
    b.inputs["Base Color"].default_value = (0.85, 0.9, 1.0, 1)
    b.inputs["Roughness"].default_value = 0.6
    b.inputs["Coat Weight"].default_value = 0.1
    mp = _texcoord(nt, 6)
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Detail"].default_value = 6
    nt.links.new(mp.outputs[0], nz.inputs[0])
    _bump(nt, nz.outputs[0], 0.3, b)
    return m


@cached
def metal(color=(0.9, 0.9, 0.92), rough=0.18, name="Metal"):
    m, nt, b = _mat(name)
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = 1.0
    b.inputs["Roughness"].default_value = rough
    return m


@cached
def glass(name="Glass"):
    m, nt, b = _mat(name)
    b.inputs["Base Color"].default_value = (0.8, 0.9, 1.0, 1)
    b.inputs["Roughness"].default_value = 0.05
    b.inputs["Transmission Weight"].default_value = 1.0
    m.use_raytrace_refraction = True
    m.thickness_mode = "SLAB"
    return m


@cached
def ice(name="Ice"):
    """Glace du monstre : bleu, brillant, léger SSS + émission froide dans les creux."""
    m, nt, b = _mat(name)
    b.inputs["Base Color"].default_value = (0.30, 0.55, 0.88, 1)
    b.inputs["Roughness"].default_value = 0.18
    b.inputs["Coat Weight"].default_value = 1.0
    b.inputs["Coat Roughness"].default_value = 0.03
    b.inputs["Emission Color"].default_value = (0.35, 0.7, 1.0, 1)
    mp = _texcoord(nt, 1.3)
    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.feature = "DISTANCE_TO_EDGE"
    nt.links.new(mp.outputs[0], vor.inputs[0])
    cr = nt.nodes.new("ShaderNodeMapRange")
    cr.inputs["From Max"].default_value = 0.03
    cr.inputs["To Min"].default_value = 0.35
    cr.inputs["To Max"].default_value = 0.0
    nt.links.new(vor.outputs["Distance"], cr.inputs[0])
    nt.links.new(cr.outputs[0], b.inputs["Emission Strength"])
    _bump(nt, vor.outputs["Distance"], 0.25, b)
    return m


# ---------------------------------------------------------------- primitives
def _finish(obj, mat=None, smooth=True):
    if mat is not None:
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


def box(name, size, loc=(0, 0, 0), mat=None, bevel=0.02, rot=(0, 0, 0), segs=3, parent=None):
    """Bloc biseauté. size = dimensions (x, y, z), loc = centre."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        md = o.modifiers.new("Bevel", "BEVEL")
        md.width = bevel
        md.segments = segs
        md.limit_method = "ANGLE"
        md.harden_normals = True
    _finish(o, mat)
    if parent:
        set_parent(o, parent)
    return o


def cyl(name, r, h, loc=(0, 0, 0), mat=None, bevel=0.0, rot=(0, 0, 0), verts=32, parent=None, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, rotation=rot, vertices=verts)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=h, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.active_object
    o.name = name
    if bevel > 0:
        md = o.modifiers.new("Bevel", "BEVEL")
        md.width = bevel
        md.segments = 4
        md.limit_method = "ANGLE"
        md.harden_normals = True
    _finish(o, mat)
    if parent:
        set_parent(o, parent)
    return o


def sphere(name, r, loc=(0, 0, 0), mat=None, scale=(1, 1, 1), parent=None, segs=24):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=segs, ring_count=segs // 2)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    _finish(o, mat)
    if parent:
        set_parent(o, parent)
    return o


def cone(name, r, h, loc=(0, 0, 0), mat=None, rot=(0, 0, 0), parent=None, verts=8):
    bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=0, depth=h, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.active_object
    o.name = name
    _finish(o, mat, smooth=False)
    if parent:
        set_parent(o, parent)
    return o


def plane(name, size, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, parent=None):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = (size[0], size[1], 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    _finish(o, mat, smooth=False)
    if parent:
        set_parent(o, parent)
    return o


def text(name, body, loc, size=0.3, mat=None, rot=(math.pi / 2, 0, 0), extrude=0.02, align="CENTER", parent=None):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.bevel_depth = extrude * 0.3
    cu.align_x = align
    cu.align_y = "CENTER"
    fp = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    if os.path.exists(fp):
        cu.font = bpy.data.fonts.load(fp, check_existing=True)
    o = bpy.data.objects.new(name, cu)
    link(o)
    o.location = loc
    o.rotation_euler = rot
    if mat:
        cu.materials.append(mat)
    if parent:
        set_parent(o, parent)
    return o


def empty(name, loc=(0, 0, 0), parent=None):
    o = bpy.data.objects.new(name, None)
    link(o)
    o.location = loc
    if parent:
        set_parent(o, parent)
    return o


def set_parent(child, parent):
    mw = child.matrix_world.copy()
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()
    child.matrix_world = mw


def group(name, loc=(0, 0, 0), rot=(0, 0, 0)):
    """Empty racine d'un module de décor."""
    e = empty(name)
    e["_pending"] = (tuple(loc), tuple(rot))
    return e


def place(root, loc=(0, 0, 0), rot_z=0.0, scale=1.0):
    root.location = loc
    root.rotation_euler = (0, 0, rot_z)
    root.scale = (scale,) * 3


# ---------------------------------------------------------------- lumières
def light(name, kind, loc, energy, color=(1, 1, 1), size=0.5, rot=(0, 0, 0), spot=None, shadow_soft=None):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if kind in ("POINT", "SPOT"):
        ld.shadow_soft_size = size
    elif kind == "AREA":
        ld.size = size
    elif kind == "SUN":
        ld.angle = math.radians(size)
    if spot and kind == "SPOT":
        ld.spot_size = math.radians(spot)
        ld.spot_blend = 0.6
    o = bpy.data.objects.new(name, ld)
    link(o)
    o.location = loc
    o.rotation_euler = rot
    o.visible_camera = False
    return o


def look_at(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


# ---------------------------------------------------------------- animation
def _fcurves(idb):
    ad = idb.animation_data
    if not ad or not ad.action:
        return []
    try:
        from bpy_extras import anim_utils
        cb = anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot)
        return cb.fcurves if cb else []
    except Exception:
        return ad.action.fcurves


def key(owner, path, frame, value=None, interp="EASE", index=-1):
    """Pose une clé. interp : EASE (bezier ease in/out), BACK (overshoot), LINEAR, CONSTANT, BOUNCE, ELASTIC."""
    if value is not None:
        if index >= 0:
            getattr(owner, path)[index] = value
        else:
            try:
                setattr(owner, path, value)
            except (TypeError, AttributeError, ValueError):
                getattr(owner, path)[:] = value
    owner.keyframe_insert(path, frame=frame, index=index)
    idb = owner.id_data
    full = path if owner == idb else owner.path_from_id(path)
    for fc in _fcurves(idb):
        if fc.data_path != full or (index >= 0 and fc.array_index != index):
            continue
        for kp in fc.keyframe_points:
            if abs(kp.co[0] - frame) < 0.01:
                if interp == "EASE":
                    kp.interpolation = "BEZIER"
                    kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"
                elif interp == "BACK":
                    kp.interpolation = "BACK"
                    kp.easing = "EASE_OUT"
                    kp.back = 1.6
                elif interp in ("BOUNCE", "ELASTIC"):
                    kp.interpolation = interp
                    kp.easing = "EASE_OUT"
                else:
                    kp.interpolation = interp


def move(owner, path, f0, f1, v0, v1, interp="EASE", end_interp="EASE"):
    key(owner, path, f0, v0, interp)
    key(owner, path, f1, v1, end_interp)


def wobble(owner, path, f0, f1, base, amp, period, index=0, phase=0.0):
    """Boucle sinusoïdale (respiration, flottement) par clés bezier tous les quarts de période."""
    step = max(1, int(period * FPS / 4))
    f = f0
    while f <= f1 + step:
        t = (f - f0) / (period * FPS)
        v = base + amp * math.sin(2 * math.pi * t + phase)
        getattr(owner, path)[index] = v
        owner.keyframe_insert(path, frame=f, index=index)
        f += step


def blink(mat_value_socket, f0, f1, seed=0, every=(1.8, 3.4)):
    """Clignements aléatoires : la valeur 'Blink' du visage passe 0 → 1 → 0 sur 4 images."""
    rnd = random.Random(seed)
    sock = mat_value_socket
    key(sock, "default_value", f0, 0.0, "CONSTANT")
    f = f0 + int(rnd.uniform(0.5, 1.5) * FPS)
    while f < f1 - 4:
        key(sock, "default_value", f, 0.0, "CONSTANT")
        key(sock, "default_value", f + 1, 1.0, "CONSTANT")
        key(sock, "default_value", f + 4, 0.0, "CONSTANT")
        f += int(rnd.uniform(*every) * FPS)


# ---------------------------------------------------------------- caméra
def camera(sc, lens=35, fstop=2.4, sensor=36):
    cd = bpy.data.cameras.new("Cam")
    cd.lens = lens
    cd.sensor_fit = "VERTICAL"
    cd.sensor_height = sensor
    cd.dof.use_dof = True
    cd.dof.aperture_fstop = fstop
    cd.clip_start = 0.02
    cd.clip_end = 300
    co = bpy.data.objects.new("Cam", cd)
    link(co)
    tgt = empty("CamTarget")
    tc = co.constraints.new("TRACK_TO")
    tc.target = tgt
    tc.track_axis = "TRACK_NEGATIVE_Z"
    tc.up_axis = "UP_Y"
    cd.dof.focus_object = tgt
    sc.camera = co
    return co, tgt


def cam_move(co, tgt, f0, f1, p0, p1, t0, t1=None, roll=0.0, handheld=0.004, seed=1):
    """Dolly / push-in lent ease in-out sur toute la durée + micro-bougé caméra."""
    t1 = t1 or t0
    move(co, "location", f0, f1, Vector(p0), Vector(p1))
    move(tgt, "location", f0, f1, Vector(t0), Vector(t1))
    if handheld:
        rnd = random.Random(seed)
        # léger bougé : bruit sur la cible
        for fc in _fcurves(tgt):
            m = fc.modifiers.new("NOISE")
            m.scale = 40
            m.strength = handheld * 6
            m.phase = rnd.uniform(0, 100)
    if roll:
        co.constraints["Track To"].influence = 1.0


@cached
def tiles(color=(0.92, 0.94, 0.95), grout=(0.55, 0.6, 0.62), size=0.12, name="Tiles", rough=0.15, var=0.06):
    """Carrelage carré (piscine, salle de bain) : brick texture à joints fins, brillant."""
    m, nt, b = _mat(name)
    vec = _triplanar(nt)
    br = nt.nodes.new("ShaderNodeTexBrick")
    br.offset = 0.0
    br.inputs["Scale"].default_value = 1.0 / size
    br.inputs["Mortar Size"].default_value = 0.025
    br.inputs["Mortar Smooth"].default_value = 0.3
    br.inputs["Brick Width"].default_value = 1.0
    br.inputs["Row Height"].default_value = 1.0
    br.inputs["Color1"].default_value = (*color, 1)
    br.inputs["Color2"].default_value = (*_shade(color, 1 - var), 1)
    br.inputs["Mortar"].default_value = (*grout, 1)
    nt.links.new(vec, br.inputs[0])
    nt.links.new(br.outputs["Color"], b.inputs["Base Color"])
    inv = nt.nodes.new("ShaderNodeMath"); inv.operation = "SUBTRACT"; inv.inputs[0].default_value = 1.0
    nt.links.new(br.outputs["Fac"], inv.inputs[1])
    _bump(nt, inv.outputs[0], 0.35, b, 0.01)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Coat Weight"].default_value = 0.3
    return m


@cached
def water(color=(0.7, 0.93, 1.0), name="Water", clear=True, rough=0.015):
    """Eau : transmission (piscine) ou miroir sombre (lac). Petites vagues en bump."""
    m, nt, b = _mat(name)
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["IOR"].default_value = 1.33
    if clear:
        b.inputs["Transmission Weight"].default_value = 1.0
        m.use_raytrace_refraction = True   # EEVEE : vraie réfraction de l'eau
        m.thickness_mode = "SLAB"
    else:
        b.inputs["Specular IOR Level"].default_value = 0.8
    mp = _texcoord(nt, 1.5)
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 2.0
    nz.inputs["Detail"].default_value = 3
    nt.links.new(mp.outputs[0], nz.inputs[0])
    _bump(nt, nz.outputs[0], 0.06, b, 0.02)
    return m


def splash_burst(name, loc, f, n=10, size=0.025, power=1.0, seed=0, mat=None):
    """Gouttes d'éclaboussure balistiques (petites sphères), apparaissent à f, retombent."""
    rnd = random.Random(seed)
    mat = mat or emission((0.85, 0.95, 1.0), 2.0, name="SplashDrop")
    for i in range(n):
        d = sphere(f"{name}{i}", size * rnd.uniform(0.6, 1.3), loc, mat, segs=8)
        a = rnd.uniform(0, 2 * math.pi)
        v = rnd.uniform(0.6, 1.4) * power
        vx, vy, vz = math.cos(a) * v * 0.5, math.sin(a) * v * 0.5, rnd.uniform(1.6, 2.6) * power
        key(d, "scale", f - 1, (0, 0, 0), "CONSTANT")
        key(d, "scale", f, (1, 1, 1), "LINEAR")
        steps = 8
        for k in range(steps + 1):
            t = k / FPS * 2.0
            p = (loc[0] + vx * t, loc[1] + vy * t, loc[2] + vz * t - 4.9 * t * t)
            key(d, "location", f + k * 2, p, "LINEAR")
            if p[2] < loc[2] - 0.02 and k > 1:
                key(d, "scale", f + k * 2, (0, 0, 0), "CONSTANT")
                break
        else:
            key(d, "scale", f + steps * 2 + 1, (0, 0, 0), "CONSTANT")


def ripple(water_obj, center, f, speed=0.25, height=0.035, width=0.35, damp=40, name="Ripple"):
    """Onde circulaire sur un plan d'eau subdivisé (modificateur Wave)."""
    e = empty(name + "_c", center)
    w = water_obj.modifiers.new(name, "WAVE")
    w.use_normal = False
    w.use_x = w.use_y = True
    w.start_position_object = e
    w.time_offset = f
    w.height = height
    w.width = width
    w.narrowness = 1.5
    w.speed = speed
    w.lifetime = 0
    w.damping_time = damp
    w.falloff_radius = 0
    return w


def water_plane(name, size, loc, mat, cuts=(120, 260)):
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=cuts[0], y_subdivisions=cuts[1], size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = (size[0], size[1], 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = True
    o.visible_shadow = False  # la lumière traverse l'eau (pas de caustiques en CPU)
    return o
