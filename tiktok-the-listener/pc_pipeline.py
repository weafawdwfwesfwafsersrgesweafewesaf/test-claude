"""Pipeline complet sur le PC : regénère les .blend avec la version locale de Blender, puis rend tous les plans.
Usage : python pc_pipeline.py "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" [options de render_all.py]
Journal : pipeline.log (si lancé par le script d'amorçage)."""
import os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
blender = sys.argv[1]


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


log("1/2 construction des 35 scènes avec", blender)
r = subprocess.run([blender, "-b", "--factory-startup", "-P", os.path.join(HERE, "render_plan.py"), "--", "all"], cwd=HERE)
log("construction terminée, code", r.returncode)
log("2/2 rendu des plans")
r = subprocess.run([sys.executable, os.path.join(HERE, "render_all.py"), "--blender", blender] + sys.argv[2:], cwd=HERE)
log("rendu terminé, code", r.returncode)
log("FIN")
