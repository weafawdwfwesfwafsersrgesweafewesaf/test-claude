# Usage : blender -b --python build.py -- lava [photo] [fbx]
import bpy, sys, os, importlib
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import kit, studio

args = sys.argv[sys.argv.index('--') + 1:]
theme = args[0]
studio.reset()
mod = importlib.import_module('world_' + theme)
groups = []
report = []
for name, fn in mod.PROPS:
    parts = kit.finalize(fn(), name)
    groups.append(parts)
    report.append((name, kit.tris(parts)))
for n, t in report:
    print(f'TRIS {n}: {t}')
if 'photo' in args:
    studio.shoot(groups, f'{ROOT}/Photos/{mod.TITLE}.png', **mod.SHOT)
if 'fbx' in args:
    os.makedirs(f'{ROOT}/FBX/{mod.TITLE}', exist_ok=True)
    img = kit.palette_image(f'{ROOT}/FBX/{mod.TITLE}/Palette_{mod.TITLE}.png')
    for parts in groups:
        # remet chaque modèle à l'origine avant export
        mn, mx = studio.bounds(parts)
        cx, cy = (mn.x + mx.x) / 2, (mn.y + mx.y) / 2
        for o in parts:
            o.location.x -= cx; o.location.y -= cy
        kit.export_fbx(parts, f'{ROOT}/FBX/{mod.TITLE}/{parts[0].name}.fbx', img)
