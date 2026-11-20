"""Construit chaque plan, le sauvegarde en .blend prêt à rendre (EEVEE, 1080x1920, 30 fps),
et peut rendre une image d'aperçu.

  python3 render_plan.py all                      # (re)crée blend/plan_01..35.blend
  python3 render_plan.py all --preview            # + 1 image clé par plan en 540x960 dans previews/
  python3 render_plan.py 7 --engine cycles        # variante Cycles
Avec Blender : blender -b -P render_plan.py -- all
Le rendu vidéo complet se fait avec render_all.py (sur ton PC)."""
import sys, os, time, argparse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "lib"))
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
ap = argparse.ArgumentParser()
ap.add_argument("plans", nargs="+")
ap.add_argument("--engine", default="eevee", choices=["eevee", "cycles"])
ap.add_argument("--res", default="1080x1920")
ap.add_argument("--spp", type=int, default=64, help="échantillons de rendu sauvés dans le .blend")
ap.add_argument("--preview", action="store_true", help="rend 1 image clé du plan en 540x960 dans previews/")
ap.add_argument("--preview-spp", type=int, default=24)
ap.add_argument("--no-blend", action="store_true")
args = ap.parse_args(argv)

import bpy
from core import reset, setup_render
import shots
from shotkit import Timing

LINES = [l.strip() for l in open(os.path.join(HERE, "script.txt"), encoding="utf-8") if l.strip()]
# moment (fraction de la phrase) le plus parlant pour l'aperçu
KEY_T = {3: 0.5, 5: 0.3, 11: 0.2, 12: 0.15, 14: 0.45, 15: 0.35, 18: 0.9, 19: 0.6, 22: 0.75, 24: 0.85,
         28: 0.75, 29: 0.8, 30: 0.42, 31: 0.45, 32: 0.7, 33: 0.6, 34: 0.75, 35: 0.7}


def words(line):
    return len(line.replace("-", " ").split())


def build(i):
    sc = reset()
    res = tuple(int(v) for v in args.res.split("x"))
    eng = "BLENDER_EEVEE" if args.engine == "eevee" else "CYCLES"
    setup_render(sc, res, args.spp, engine=eng)
    if eng == "CYCLES":
        c = sc.cycles
        c.samples = 96
        c.diffuse_bounces, c.glossy_bounces, c.transmission_bounces, c.max_bounces = 3, 3, 6, 8
    T = Timing(words(LINES[i - 1]))
    shots.SHOTS[i - 1](T)
    sc.frame_start, sc.frame_end = 1, T.f1
    sc.frame_set(1)
    sc["phrase"] = LINES[i - 1]
    tag = f"plan_{i:02d}"
    # sortie par défaut : images PNG dans frames/plan_XX/ (render_all.py encode ensuite en MP4)
    sc.render.filepath = f"//../frames/{tag}/"
    sc.render.image_settings.file_format = "PNG"
    return sc, T, tag


def main():
    bpy.context.preferences.filepaths.save_version = 0
    plans = list(range(1, len(shots.SHOTS) + 1)) if args.plans == ["all"] else [int(p) for p in args.plans]
    for i in plans:
        t0 = time.time()
        sc, T, tag = build(i)
        if not args.no_blend:
            os.makedirs(os.path.join(HERE, "blend"), exist_ok=True)
            bpy.ops.file.pack_all()  # visages embarqués : le .blend est autonome
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "blend", tag + ".blend"), compress=True)
        msg = f"[{tag}] blend ok ({T.f1} images)"
        if args.preview:
            od = os.path.join(HERE, "previews")
            os.makedirs(od, exist_ok=True)
            sc.render.resolution_percentage = 50
            if args.engine == "eevee":
                sc.eevee.taa_render_samples = args.preview_spp
            sc.frame_set(T.at(KEY_T.get(i, 0.6)))
            sc.render.filepath = os.path.join(od, tag + ".png")
            bpy.ops.render.render(write_still=True)
            msg += f", aperçu image {sc.frame_current}"
        print(msg, f"({time.time() - t0:.0f}s)", flush=True)


main()
