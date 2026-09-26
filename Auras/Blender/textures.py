# Génère les textures d'aura (flipbooks 8x8 pour ParticleEmitter + textures fixes)
import os as _os
HERE = _os.path.dirname(_os.path.abspath(__file__))
AURAS = _os.path.dirname(HERE) + '/'
import bpy, sys, math
sys.path.insert(0, HERE)
from nodes import G

import os
PREVIEW = os.environ.get('PREVIEW') == '1'
OUT = AURAS + 'Preview/prev_' if PREVIEW else AURAS + 'Textures/'
TAU = math.tau

def reset_scene(res_x, res_y, ortho):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 24
    sc.cycles.use_denoising = False
    sc.render.film_transparent = not PREVIEW
    sc.world = bpy.data.worlds.new('w')
    sc.world.color = (0, 0, 0)
    sc.render.resolution_x = res_x
    sc.render.resolution_y = res_y
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    if PREVIEW:
        sc.view_settings.view_transform = 'Raw'  # aperçu = alpha réel
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = ortho
    cam = bpy.data.objects.new('cam', cam_data)
    cam.location = (0, 0, 10)
    sc.collection.objects.link(cam)
    sc.camera = cam
    return sc

def plane(name, x, y, size, mat, props=None):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(x, y, 0))
    o = bpy.context.active_object
    o.name = name
    o.scale = (size[0], size[1], 1)
    o.data.materials.append(mat)
    for k, v in (props or {}).items():
        o[k] = v
    return o

def flipbook(name, build):
    """8x8 cases, case 0 en haut à gauche (ordre Roblox), t = 0..1 sur la durée de vie."""
    sc = reset_scene(1024, 1024, 8)
    mat = bpy.data.materials.new(name)
    g = G(mat)
    build(g)
    for i in range(64):
        col, row = i % 8, i // 8
        plane(f'{name}_{i}', col + 0.5 - 4, 4 - (row + 0.5), (1, 1), mat, {'t': i / 63})
    sc.render.filepath = OUT + name + '.png'
    bpy.ops.render.render(write_still=True)

def still(name, w, h, build):
    sc = reset_scene(w, h, max(w, h) / min(w, h))
    mat = bpy.data.materials.new(name)
    g = G(mat)
    build(g)
    plane(name, 0, 0, (w / min(w, h), h / min(w, h)), mat)
    sc.render.filepath = OUT + name + '.png'
    bpy.ops.render.render(write_still=True)

def envelope(g, t, a_in, a_out):
    return g.mul(g.smooth(0, a_in, t), g.sub(1, g.smooth(a_out, 1, t)))

# --- Flamme fluide : langue de feu qui monte, ondule et se dissipe
def flame(g):
    u, v = g.uv()
    t = g.attr('t')
    x = g.sub(u, 0.5)
    # la flamme "pousse" au début de sa vie
    vy = g.mul(v, g.sub(1.3, g.mul(0.45, g.smooth(0, 0.3, t))))
    p = g.vec(g.mul(x, 3.0), g.sub(g.mul(v, 2.4), g.mul(t, 4.0)))
    # différence de deux bruits = turbulence centrée sur 0 (pas de flamme penchée)
    w = g.mul(t, 1.2)
    d = g.sub(g.noise(p, w, 1.6, 4, 0.55), g.noise(p, g.add(w, 7.3), 1.6, 4, 0.55))
    # bruit séparé pour ronger les bords (sinon la flamme penche d'un côté)
    e = g.sub(g.noise(p, g.add(w, 13.1), 2.4, 6, 0.6), g.noise(p, g.add(w, 19.7), 2.4, 6, 0.6))
    xd = g.add(x, g.mul(g.mul(d, 0.8), vy))
    f = g.add(g.sub(g.sub(1, g.div(g.abs(xd), 0.28)), g.mul(vy, 1.1)), g.mul(g.mul(e, 1.6), g.add(vy, 0.2)))
    m = g.mul(g.smooth(0.0, 0.7, f), g.smooth(0.0, 0.12, v))
    g.output(g.mul(g.pow(m, 1.1), envelope(g, t, 0.08, 0.5)))

# --- Tourbillon : anneau spirale qui s'ouvre en tournant
def swirl(g):
    u, v = g.uv()
    t = g.attr('t')
    x, y = g.sub(u, 0.5), g.sub(v, 0.5)
    r = g.pow(g.add(g.mul(x, x), g.mul(y, y)), 0.5)
    a = g.atan2(y, x)
    n = g.noise(g.vec(g.mul(x, 4), g.mul(y, 4)), g.mul(t, 1.5), 2.0, 2, 0.5)
    s = g.sin(g.add(g.add(g.mul(a, 3), g.mul(r, 14)), g.add(g.mul(t, -9), g.mul(g.sub(n, 0.5), 5))))
    arms = g.smooth(0.25, 1, s)
    r0 = g.add(0.1, g.mul(0.3, g.pow(t, 0.7)))
    ring = g.mul(g.smooth(g.sub(r0, 0.22), r0, r), g.sub(1, g.smooth(r0, g.add(r0, 0.12), r)))
    m = g.mul(g.mul(ring, g.add(0.06, g.mul(arms, 1.0))), g.add(0.5, n))
    g.output(g.mul(g.mul(m, 1.6), envelope(g, t, 0.12, 0.45)))

# --- Fumée fluide : bouffée qui gonfle et s'efface (dérapages, burn)
def smoke(g):
    u, v = g.uv()
    t = g.attr('t')
    x, y = g.sub(u, 0.5), g.sub(v, 0.5)
    n = g.noise(g.vec(g.mul(x, 3), g.mul(y, 3)), g.mul(t, 0.8), 2.0, 6, 0.6)
    r = g.add(g.pow(g.add(g.mul(x, x), g.mul(y, y)), 0.5), g.mul(g.sub(n, 0.5), 0.5))
    R = g.add(0.14, g.mul(0.3, g.pow(t, 0.55)))
    blob = g.sub(1, g.smooth(g.mul(R, 0.2), R, r))
    detail = g.noise(g.vec(g.mul(x, 8), g.mul(y, 8)), g.mul(t, 1.2), 3, 4, 0.55)
    m = g.mul(blob, g.add(0.3, detail))
    fade = g.mul(g.smooth(0, 0.08, t), g.pow(g.sub(1, t), 1.4))
    g.output(g.mul(g.mul(m, 1.1), fade))

# --- Traînée d'énergie qui boucle horizontalement (Beam / Trail / anneaux)
def streak(g):
    u, v = g.uv()
    ang = g.mul(u, TAU)
    cx, cy = g.mul(g.cos(ang), 0.55), g.mul(g.sin(ang), 0.55)
    n = g.noise(g.vec(cx, cy, g.mul(v, 0.8)), 0.0, 1.6, 5, 0.6)
    n2 = g.noise(g.vec(g.mul(cx, 1.3), g.mul(cy, 1.3), g.mul(v, 9)), 3.7, 1.5, 4, 0.5)
    half = g.add(0.18, g.mul(n, 0.3))
    band = g.sub(1, g.smooth(0, half, g.abs(g.sub(v, 0.5))))
    wisps = g.smooth(0.35, 0.8, n2)
    m = g.mul(g.pow(band, 1.3), g.add(0.35, wisps))
    g.output(g.mul(m, 1.5))

# --- Étincelle étoile 4 branches
def spark(g):
    u, v = g.uv()
    x, y = g.abs(g.sub(u, 0.5)), g.abs(g.sub(v, 0.5))
    r = g.pow(g.add(g.mul(x, x), g.mul(y, y)), 0.5)
    core = g.pow(g.sub(1, g.smooth(0, 0.14, r)), 2)
    rayx = g.mul(g.sub(1, g.smooth(0, 0.02, y)), g.sub(1, g.smooth(0, 0.48, x)))
    rayy = g.mul(g.sub(1, g.smooth(0, 0.02, x)), g.sub(1, g.smooth(0, 0.48, y)))
    halo = g.mul(g.pow(g.sub(1, g.smooth(0, 0.3, r)), 3), 0.35)
    g.output(g.mx(g.mx(core, g.mx(rayx, rayy)), halo))

# --- Halo doux (lueur au sol / sous les roues)
def glow(g):
    u, v = g.uv()
    x, y = g.sub(u, 0.5), g.sub(v, 0.5)
    r = g.pow(g.add(g.mul(x, x), g.mul(y, y)), 0.5)
    g.output(g.pow(g.sub(1, g.smooth(0, 0.5, r)), 2.2))

which = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
jobs = {
    'AuraFlame_8x8': lambda: flipbook('AuraFlame_8x8', flame),
    'AuraSwirl_8x8': lambda: flipbook('AuraSwirl_8x8', swirl),
    'AuraSmoke_8x8': lambda: flipbook('AuraSmoke_8x8', smoke),
    'AuraStreak': lambda: still('AuraStreak', 512, 128, streak),
    'AuraSpark': lambda: still('AuraSpark', 256, 256, spark),
    'AuraGlow': lambda: still('AuraGlow', 256, 256, glow),
}
for k in (which or jobs):
    jobs[k]()
